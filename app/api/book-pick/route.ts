// 시중교재에서 **쪽(또는 단원) → 문항**을 직접 골라 학습지를 만드는 화면이 쓰는 API.
//
// 왜 필요한가
//   선생님이 종이 교재로 수업한 뒤 "쎈 277, 278, 282번 같은 걸로 연습 더 시켜야지" 하는 일이 잦다.
//   지금까지는 그 문항의 유형 코드를 일일이 알아야 문제은행에서 뽑을 수 있었다.
//   이 API는 교재의 쪽을 펴듯 문항을 보여 주고, 고른 문항에 쌍둥이·유사 문제를 붙여 준다.
//
//   GET ?book=쎈&grade=중2&semester=2            → 왼쪽 묶음 목록(쪽 또는 단원+번호 구간)
//   GET ?...&group=<묶음키>                       → 그 묶음의 문항들 (그림 주소 포함)
//   POST { picked:[id], twin, similar, ... }      → 시험지 생성 (preview면 목록만)
//
// problems 는 RLS로 잠겨 있어 여기(서버)에서 service_role 키로만 읽는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { sourceLabel } from '@/lib/problemSource'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'problem-images'
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('')

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

// 1000행 제한을 피해 전부 읽어온다
async function all<T>(make: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

const COLS =
  'id, book, grade, semester, sub_chapter_no, sub_chapter_title, page_no, local_no, ' +
  'type_code, level, step, answer_kind, is_essay, twin_id, image_path'

// 문항 번호를 정렬·비교할 수 있는 값으로. '0277' → 277, '2_8' → 2008 처럼 섞여 있어도 순서가 유지된다
function numOf(localNo: string | number | null) {
  const s = String(localNo ?? '')
  const parts = s.match(/\d+/g)
  if (!parts) return 0
  return parts.reduce((a, p) => a * 1000 + Number(p), 0)
}

// 왼쪽 묶음 만들기 — 쪽 번호가 있으면 쪽으로, 없으면 소단원 안에서 20문항씩
const GROUP_SIZE = 20
function makeGroups(rows: any[]) {
  const hasPage = rows.some((r) => r.page_no)
  const groups: { key: string; label: string; section: string; count: number }[] = []
  if (hasPage) {
    const m = new Map<string, any[]>()
    for (const r of rows) {
      const k = `p${r.page_no ?? 0}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    for (const [k, v] of [...m].sort((a, b) => Number(a[0].slice(1)) - Number(b[0].slice(1)))) {
      const p = v[0].page_no
      groups.push({
        key: k,
        label: p ? `P.${p}` : '쪽 모름',
        section: `${String(v[0].sub_chapter_no).padStart(2, '0')} ${v[0].sub_chapter_title ?? ''}`.trim(),
        count: v.length,
      })
    }
  } else {
    const bySub = new Map<number, any[]>()
    for (const r of rows) {
      const k = r.sub_chapter_no ?? 0
      if (!bySub.has(k)) bySub.set(k, [])
      bySub.get(k)!.push(r)
    }
    for (const [sub, v] of [...bySub].sort((a, b) => a[0] - b[0])) {
      v.sort((a, b) => numOf(a.local_no) - numOf(b.local_no))
      for (let i = 0; i < v.length; i += GROUP_SIZE) {
        const chunk = v.slice(i, i + GROUP_SIZE)
        groups.push({
          key: `s${sub}_${i}`,
          label: `${chunk[0].local_no}~${chunk[chunk.length - 1].local_no}`,
          section: `${String(sub).padStart(2, '0')} ${v[0].sub_chapter_title ?? ''}`.trim(),
          count: chunk.length,
        })
      }
    }
  }
  return { hasPage, groups }
}

function inGroup(rows: any[], key: string) {
  if (key.startsWith('p')) {
    const p = Number(key.slice(1))
    return rows.filter((r) => (r.page_no ?? 0) === p)
  }
  const m = key.match(/^s(\d+)_(\d+)$/)
  if (!m) return []
  const sub = Number(m[1]); const off = Number(m[2])
  const v = rows.filter((r) => (r.sub_chapter_no ?? 0) === sub)
  v.sort((a, b) => numOf(a.local_no) - numOf(b.local_no))
  return v.slice(off, off + GROUP_SIZE)
}

async function withImages(supabase: any, rows: any[]) {
  const paths = rows.map((r) => r.image_path).filter(Boolean)
  if (!paths.length) return rows.map((r) => ({ ...r, image: null }))
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 7200)
  const m = new Map<string, string>((data ?? []).map((d: any) => [d.path, d.signedUrl]))
  return rows.map((r) => ({ ...r, image: r.image_path ? m.get(r.image_path) ?? null : null }))
}

// ───────────────────────── GET ─────────────────────────
export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const q = new URL(req.url).searchParams
  const book = q.get('book')
  const grade = q.get('grade')
  const semester = q.get('semester')
  if (!book || !grade || !semester)
    return NextResponse.json({ error: '교재와 학기를 골라 주세요.' }, { status: 400 })

  const rows = await all<any>((f, t) =>
    supabase.from('problems').select(COLS)
      .eq('book', book).eq('grade', grade).eq('semester', Number(semester)).range(f, t)
  )
  if (!rows.length) return NextResponse.json({ groups: [], hasPage: false, problems: [] })

  const group = q.get('group')
  if (!group) return NextResponse.json(makeGroups(rows))

  const picked = inGroup(rows, group)
  picked.sort((a, b) => numOf(a.local_no) - numOf(b.local_no))
  const withUrl = await withImages(supabase, picked)
  return NextResponse.json({
    problems: withUrl.map((r: any) => ({
      id: r.id, localNo: r.local_no, pageNo: r.page_no, typeCode: r.type_code,
      level: r.level, step: r.step, answerKind: r.answer_kind, isEssay: r.is_essay,
      hasTwin: !!r.twin_id, image: r.image, source: sourceLabel(r),
    })),
  })
}

// ───────────────────────── POST ─────────────────────────
// 고른 문항 + 쌍둥이/유사 문제를 붙여 시험지를 만든다
export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const {
    picked = [] as number[],
    twin = 0,                    // 쌍둥이 문제 추가 0~3
    similar = 0,                 // 유사 문제 추가 0~3
    similarLevel = 'same',       // easier | same | harder
    answerType = 'all',          // all | choice | written
    keepOriginal = true,         // 고른 문항도 학습지에 넣을지
    title = '',
    preview = false,
  } = b
  if (!picked.length) return NextResponse.json({ error: '문항을 하나 이상 골라 주세요.' }, { status: 400 })

  const { data: src, error: e0 } = await supabase.from('problems').select(COLS).in('id', picked)
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })
  const byId = new Map<number, any>((src ?? []).map((r: any) => [r.id, r]))
  const order = picked.map((id: number) => byId.get(id)).filter(Boolean)
  if (!order.length) return NextResponse.json({ error: '문항을 찾지 못했습니다.' }, { status: 400 })

  const grade = order[0].grade
  const semester = order[0].semester

  // 유사 문제 후보 — 같은 유형, 같은 학기
  const codes = Array.from(new Set(order.map((r: any) => r.type_code).filter(Boolean))) as string[]
  const cand = codes.length
    ? await all<any>((f, t) =>
        supabase.from('problems').select(COLS)
          .in('type_code', codes).eq('grade', grade).eq('semester', semester).range(f, t)
      )
    : []

  // 고른 문항과 그 쌍둥이는 유사 후보에서 뺀다
  const exclude = new Set<number>()
  for (const r of order) { exclude.add(r.id); if (r.twin_id) exclude.add(r.twin_id) }

  const wantLevel = (lv: number | null) =>
    similarLevel === 'easier' ? (lv ?? 0) - 1 : similarLevel === 'harder' ? (lv ?? 0) + 1 : (lv ?? 0)
  const okAnswer = (r: any) =>
    answerType === 'choice' ? r.answer_kind === 'choice'
      : answerType === 'written' ? r.answer_kind !== 'choice' : true

  const used = new Set<number>()
  const out: { id: number; tag: string }[] = []

  for (const s of order) {
    if (keepOriginal) { out.push({ id: s.id, tag: '원문항' }); used.add(s.id) }

    // 쌍둥이 — 쎈↔쎈B는 숫자만 다른 같은 문제
    if (twin > 0 && s.twin_id && !used.has(s.twin_id)) {
      out.push({ id: s.twin_id, tag: '쌍둥이' }); used.add(s.twin_id)
    }

    if (similar > 0) {
      const target = wantLevel(s.level)
      const pool = cand.filter(
        (p: any) => p.type_code === s.type_code && !exclude.has(p.id) && !used.has(p.id) && okAnswer(p)
      )
      // ① 난이도가 목표에 가까운 것 ② 다른 교재 ③ 같은 교재의 바로 옆 번호는 뒤로
      const near = (p: any) =>
        p.book === s.book && Math.abs(numOf(p.local_no) - numOf(s.local_no)) <= 30 ? 1 : 0
      pool.sort((a: any, c: any) =>
        near(a) - near(c) ||
        Math.abs((a.level ?? 0) - target) - Math.abs((c.level ?? 0) - target) ||
        (a.book === s.book ? 1 : 0) - (c.book === s.book ? 1 : 0) ||
        a.id - c.id
      )
      for (const p of pool.slice(0, similar)) { out.push({ id: p.id, tag: '유사' }); used.add(p.id) }
    }
  }

  if (preview) {
    const rows = await all<any>((f, t) =>
      supabase.from('problems').select(COLS).in('id', out.map((o) => o.id)).range(f, t)
    )
    const m = new Map<number, any>(rows.map((r: any) => [r.id, r]))
    const withUrl = await withImages(supabase, out.map((o) => m.get(o.id)).filter(Boolean))
    const urlOf = new Map<number, any>(withUrl.map((r: any) => [r.id, r]))
    return NextResponse.json({
      count: out.length,
      problems: out.map((o, i) => {
        const r = urlOf.get(o.id)
        return {
          no: i + 1, id: o.id, tag: o.tag,
          source: sourceLabel(r), typeCode: r?.type_code ?? null,
          level: r?.level ?? null, image: r?.image ?? null,
        }
      }),
    })
  }

  let code = newCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('exam_sheets').select('id').eq('code', code).maybeSingle()
    if (!data) break
    code = newCode()
  }
  const { data: sheet, error: e1 } = await supabase.from('exam_sheets').insert({
    code,
    title: title || `${order[0].book} ${grade}-${semester} 지정문항 ${out.length}문항`,
    grade, semester, kind: 'main', show_source: false, show_difficulty: false,
  }).select('id, code').single()
  if (e1 || !sheet) return NextResponse.json({ error: e1?.message ?? '시험지 저장 실패' }, { status: 500 })

  const { error: e2 } = await supabase.from('exam_sheet_problems')
    .insert(out.map((o, i) => ({ sheet_id: sheet.id, no: i + 1, problem_id: o.id })))
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ code: sheet.code, count: out.length })
}
