// 재출제 API
//  POST  { gradingId, mode }  -> 새 시험지를 만들고 code를 돌려준다
//        mode: 'wrong'(틀린 문제 그대로) | 'twin'(쌍둥이) | 'similar'(같은 유형 다른 문제)
//              | 'wrong+similar'(틀린 문제 + 그 유사문제를 이어서)
//  GET   ?code=XXXXXX                              -> 인쇄 화면이 쓸 문제 이미지·QR을 돌려준다
//
// 문제은행은 RLS로 잠겨 있어서 전부 여기(서버)에서 service_role 키로 읽는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { sourceLabel } from '@/lib/problemSource'
import { requestTwins } from '@/lib/twinRequests'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'problem-images'
const NAVY = '#0f3460'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // 헷갈리는 O,0,I,1 제외
function newCode() {
  let s = ''
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ───────────────────── 재출제 시험지 만들기 ─────────────────────
export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const supabase = db()
  const { gradingId, mode } = (await req.json()) as {
    gradingId: string
    mode: 'wrong' | 'twin' | 'similar' | 'wrong+similar'
  }
  // '+' 로 이어 붙이면 두 가지를 한 장에 담는다 (오답 먼저, 그 뒤에 유사문제)
  const parts = String(mode ?? '').split('+').filter(Boolean)
  if (!parts.length || parts.some((m) => !['wrong', 'twin', 'similar'].includes(m)))
    return NextResponse.json({ error: '무엇을 뽑을지 알 수 없습니다.' }, { status: 400 })

  const { data: grading } = await supabase
    .from('gradings')
    .select('id, sheet_id, student_id, student_name')
    .eq('id', gradingId)
    .maybeSingle()
  if (!grading) return NextResponse.json({ error: '채점 기록을 찾을 수 없습니다.' }, { status: 404 })

  const { data: origin } = await supabase
    .from('exam_sheets')
    .select('title, grade, semester')
    .eq('id', grading.sheet_id)
    .maybeSingle()

  // 틀린 문항
  const { data: wrongAnswers } = await supabase
    .from('grading_answers')
    .select('no, problem_id, type_code')
    .eq('grading_id', gradingId)
    .eq('is_correct', false)
    .order('no')

  const wrong = (wrongAnswers ?? []).filter((a) => a.problem_id)
  if (wrong.length === 0)
    return NextResponse.json({ error: '틀린 문제가 없습니다.' }, { status: 400 })

  const problemIds: number[] = []
  const notes: string[] = []

  if (parts.includes('wrong')) {
    problemIds.push(...wrong.map((w) => w.problem_id as number))
  }
  if (parts.includes('twin')) {
    // 쌍둥이 문제 — 숫자만 다른 같은 문제라, 제대로 이해했는지 확인하기 좋다.
    // 같은 문제가 교재 서너 권에 실리므로 **묶음**(twin_group)으로 찾는다.
    const { data: tw } = await supabase
      .from('problems')
      .select('id, twin_group')
      .in('id', wrong.map((w) => w.problem_id))
    const groupOf = new Map<number, number | null>((tw ?? []).map((t: any) => [t.id, t.twin_group]))
    const groups = Array.from(new Set(Array.from(groupOf.values()).filter(Boolean))) as number[]
    const mates = new Map<number, number[]>()
    if (groups.length) {
      const { data: all } = await supabase
        .from('problems')
        .select('id, twin_group')
        .in('twin_group', groups)
        .limit(5000)
      ;(all ?? []).forEach((p: any) => {
        const arr = mates.get(p.twin_group) ?? []
        arr.push(p.id)
        mates.set(p.twin_group, arr)
      })
    }
    const used = new Set<number>(wrong.map((w) => w.problem_id as number))
    let got = 0
    for (const w of wrong) {
      const g = groupOf.get(w.problem_id as number)
      const pick = (g ? mates.get(g) ?? [] : []).find((id) => !used.has(id))
      if (pick) { problemIds.push(pick); used.add(pick); got++ }
    }
    // 숫자만 바꾼 쌍둥이(book='쌍둥이')가 아직 없는 문항은 만들기 요청을 남겨 둔다 — 다음엔 뽑힌다.
    // 요청이 실패해도 재출제는 그대로 진행한다
    let asked = 0
    try {
      asked = (await requestTwins(supabase, wrong.map((w) => w.problem_id as number), { source: 'reprint' })).added
    } catch { /* 요청 줄이 없어도 재출제는 된다 */ }
    if (!got) notes.push(
      '쌍둥이 문제가 없습니다' +
      (asked ? ` — ${asked}문항 쌍둥이 만들기를 요청해 두었어요` : ' (아직 짝을 찾아 두지 않은 문항이에요)'),
    )
  }
  if (parts.includes('similar')) {
    // 유사문제 — 같은 유형에서, 원래 시험지에 있던 문제와 이 학생이 이미 본 문제는 빼고 뽑는다
    const { data: onSheet } = await supabase
      .from('exam_sheet_problems')
      .select('problem_id')
      .eq('sheet_id', grading.sheet_id)

    let seen: number[] = []
    if (grading.student_id) {
      const { data: prev } = await supabase
        .from('gradings')
        .select('id')
        .eq('student_id', grading.student_id)
        .limit(500)
      if (prev?.length) {
        const { data: prevAns } = await supabase
          .from('grading_answers')
          .select('problem_id')
          .in('grading_id', prev.map((p) => p.id))
          .limit(20000)
        seen = (prevAns ?? []).map((a: any) => a.problem_id).filter(Boolean)
      }
    }
    const base = [...(onSheet ?? []).map((r: any) => r.problem_id), ...seen].filter(Boolean)
    // 쌍둥이(숫자만 다른 같은 문제)도 같이 제외한다 — 이미 푼 문제를 그대로 또 주는 꼴이 된다
    let twins: number[] = []
    if (base.length) {
      const { data: tw } = await supabase
        .from('problems')
        .select('twin_group')
        .in('id', Array.from(new Set(base)))
        .not('twin_group', 'is', null)
        .limit(20000)
      const gs = Array.from(new Set((tw ?? []).map((t: any) => t.twin_group)))
      if (gs.length) {
        const { data: mates } = await supabase
          .from('problems')
          .select('id')
          .in('twin_group', gs)
          .limit(20000)
        twins = (mates ?? []).map((m: any) => m.id)
      }
    }
    const exclude = new Set<number>([...base, ...twins])

    // 원래 틀린 문제들의 난이도를 알아둔다(비슷한 난이도로 뽑으려고)
    const { data: wrongProblems } = await supabase
      .from('problems')
      .select('id, type_code, difficulty')
      .in('id', wrong.map((w) => w.problem_id))

    const diffOf = new Map<number, string | null>(
      (wrongProblems ?? []).map((p: any) => [p.id, p.difficulty])
    )

    const codes = Array.from(new Set(wrong.map((w) => w.type_code).filter(Boolean))) as string[]
    const pool = new Map<string, any[]>()
    if (codes.length) {
      const { data: cand } = await supabase
        .from('problems')
        .select('id, type_code, difficulty')
        .in('type_code', codes)
        .limit(5000)
      ;(cand ?? []).forEach((p: any) => {
        if (exclude.has(p.id)) return
        const arr = pool.get(p.type_code) ?? []
        arr.push(p)
        pool.set(p.type_code, arr)
      })
      pool.forEach((v, k) => pool.set(k, shuffle(v)))
    }

    const used = new Set<number>()
    for (const w of wrong) {
      if (!w.type_code) continue
      const arr = pool.get(w.type_code) ?? []
      const want = diffOf.get(w.problem_id as number)
      const idx =
        arr.findIndex((p) => !used.has(p.id) && p.difficulty === want) >= 0
          ? arr.findIndex((p) => !used.has(p.id) && p.difficulty === want)
          : arr.findIndex((p) => !used.has(p.id))
      if (idx >= 0) {
        used.add(arr[idx].id)
        problemIds.push(arr[idx].id)
      }
    }
    if (!used.size) notes.push('같은 유형에서 새로 뽑을 문제가 없습니다')
  }

  if (problemIds.length === 0)
    return NextResponse.json(
      { error: notes.join(' · ') || '뽑을 문제가 없습니다.' },
      { status: 400 }
    )

  // 새 시험지 등록
  let code = newCode()
  for (let i = 0; i < 5; i++) {
    const { data: dup } = await supabase.from('exam_sheets').select('id').eq('code', code).maybeSingle()
    if (!dup) break
    code = newCode()
  }

  const LABEL: Record<string, string> = { wrong: '오답', twin: '쌍둥이문제', similar: '유사문제' }
  const label = parts.map((m) => LABEL[m]).join('+')
  const title = `${grading.student_name ?? '학생'} · ${origin?.title ?? '시험지'} · ${label}`

  const { data: sheet, error: e1 } = await supabase
    .from('exam_sheets')
    .insert({
      code,
      title,
      grade: origin?.grade ?? null,
      semester: origin?.semester ?? null,
      note: `${mode}:${gradingId}`,
    })
    .select('id, code')
    .single()
  if (e1 || !sheet) return NextResponse.json({ error: e1?.message ?? '생성 실패' }, { status: 500 })

  const { error: e2 } = await supabase.from('exam_sheet_problems').insert(
    problemIds.map((pid, i) => ({ sheet_id: sheet.id, no: i + 1, problem_id: pid }))
  )
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ ok: true, code: sheet.code, count: problemIds.length })
}

// ───────────────────── 인쇄용 데이터 ─────────────────────
export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const supabase = db()
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'code가 필요합니다.' }, { status: 400 })

  const { data: sheet } = await supabase
    .from('exam_sheets')
    .select('id, code, title, grade, semester')
    .eq('code', code)
    .maybeSingle()
  if (!sheet) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 })

  const { data: rows } = await supabase
    .from('exam_sheet_problems')
    .select(
      'no, problems(id, book, grade, semester, sub_chapter_title, page_no, local_no, type_code, difficulty, answer_kind, image_path)'
    )
    .eq('sheet_id', sheet.id)
    .order('no')

  const codes = Array.from(
    new Set((rows ?? []).map((r: any) => r.problems?.type_code).filter(Boolean))
  )
  const typeTitle = new Map<string, string>()
  if (codes.length) {
    const { data: types } = await supabase
      .from('standard_types')
      .select('code, type_title')
      .in('code', codes)
    ;(types ?? []).forEach((t: any) => typeTitle.set(t.code, t.type_title))
  }

  const paths = (rows ?? []).map((r: any) => r.problems?.image_path).filter(Boolean) as string[]
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 7200)
    ;(urls ?? []).forEach((u: any) => {
      if (u.signedUrl && !u.error) signed.set(u.path, u.signedUrl)
    })
  }

  const origin = new URL(req.url).origin
  const qr = await QRCode.toDataURL(`${origin}/grade/${sheet.code}`, {
    margin: 1,
    width: 240,
    color: { dark: NAVY, light: '#ffffff' },
  })

  return NextResponse.json({
    sheet,
    qr,
    problems: (rows ?? []).map((r: any) => {
      const p = r.problems
      return {
        no: r.no,
        image: p?.image_path ? signed.get(p.image_path) ?? null : null,
        difficulty: p?.difficulty ?? null,
        isChoice: p?.answer_kind === 'choice',
        // 2026-09-23부터 교재 원본 번호는 저장된 그림에서 미리 지워 둔다
        // (scripts/strip-book-number.py) → 인쇄할 때 따로 잘라낼 것이 없다
        crop: false,
        typeTitle: p?.type_code ? typeTitle.get(p.type_code) ?? null : null,
        source: sourceLabel(p),
      }
    }),
  })
}
