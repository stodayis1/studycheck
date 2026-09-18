// 문제은행 화면이 쓰는 서버 API.
// problems / standard_types 는 RLS로 잠겨 있어 여기(서버)에서만 service_role 키로 읽는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function newCode() {
  let s = ''
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  return s
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

// 교과서는 레벨을 매기지 않는다 (별도 탭에서 뽑는다)
function isTextbook(book: string | null) {
  return !!book && book.startsWith('교과서')
}

// ───────────────────────── GET ─────────────────────────
// ?tree=1&grade=중1&semester=2  → 대단원 > 소단원 > 유형 트리 (+ 문항 수)
export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const q = new URL(req.url).searchParams

  // ?courses=1 → 과정 목록 (유형표 기준). 고등이 늘어나도 코드를 고칠 필요가 없게 DB에서 읽는다
  if (q.get('courses')) {
    const types = await all<any>((f, t) =>
      supabase.from('standard_types').select('grade, semester').range(f, t)
    )
    const probs = await all<any>((f, t) =>
      supabase.from('problems').select('grade, semester').range(f, t)
    )
    const m = new Map<string, any>()
    const key = (g: string, s: number) => `${g}-${s}`
    for (const r of types) {
      const k = key(r.grade, r.semester)
      const c = m.get(k) ?? { grade: r.grade, semester: r.semester, types: 0, problems: 0 }
      c.types++
      m.set(k, c)
    }
    for (const r of probs) {
      const k = key(r.grade, r.semester)
      const c = m.get(k)
      if (c) c.problems++
    }
    return NextResponse.json({ courses: [...m.values()] })
  }

  // ?books=1 → 교재 목록 (+ 학년·학기별 문항 수)
  if (q.get('books')) {
    const rows = await all<any>((f, t) =>
      supabase.from('problems').select('book, grade, semester, type_code, level').range(f, t)
    )
    const m = new Map<string, any>()
    for (const r of rows) {
      const b = m.get(r.book) ?? {
        book: r.book,
        kind: isTextbook(r.book) ? 'textbook' : 'market',   // 교과서 / 시중교재
        total: 0, typed: 0, courses: {} as Record<string, number>,
      }
      b.total++
      if (r.type_code) b.typed++
      const key = `${r.grade}-${r.semester}`
      b.courses[key] = (b.courses[key] ?? 0) + 1
      m.set(r.book, b)
    }
    return NextResponse.json({ books: [...m.values()].sort((a, b) => b.total - a.total) })
  }

  const grade = q.get('grade')
  const semester = q.get('semester')
  if (!grade || !semester)
    return NextResponse.json({ error: '학년·학기를 골라 주세요.' }, { status: 400 })

  const types = await all<any>((f, t) =>
    supabase
      .from('standard_types')
      .select('code, chapter_no, chapter_title, sub_chapter_no, sub_chapter_title, type_no, type_title, is_focus')
      .eq('grade', grade)
      .eq('semester', Number(semester))
      .order('chapter_no').order('sub_chapter_no').order('type_no')
      .range(f, t)
  )

  const probs = await all<any>((f, t) =>
    supabase
      .from('problems')
      .select('type_code, book, step, difficulty, level, answer_kind, is_essay')
      .eq('grade', grade)
      .eq('semester', Number(semester))
      .not('type_code', 'is', null)
      .range(f, t)
  )

  // 유형별 통계
  const stat: Record<string, any> = {}
  for (const p of probs) {
    const s = (stat[p.type_code] ??= { total: 0, byLevel: {}, byBook: {}, choice: 0, essay: 0 })
    s.total++
    const lv = p.level ?? 0                       // 0 = 레벨 없음(교과서)
    s.byLevel[lv] = (s.byLevel[lv] ?? 0) + 1
    s.byBook[p.book] = (s.byBook[p.book] ?? 0) + 1
    if (p.answer_kind === 'choice') s.choice++
    if (p.is_essay) s.essay++
  }

  // 트리로 묶기
  const chapters: any[] = []
  for (const t of types) {
    let ch = chapters.find((c) => c.no === t.chapter_no)
    if (!ch) chapters.push((ch = { no: t.chapter_no, title: t.chapter_title, subs: [], total: 0 }))
    let sub = ch.subs.find((s: any) => s.no === t.sub_chapter_no)
    if (!sub) ch.subs.push((sub = { no: t.sub_chapter_no, title: t.sub_chapter_title, types: [], total: 0 }))
    const n = stat[t.code]?.total ?? 0
    sub.types.push({
      code: t.code,
      no: t.type_no,
      title: t.type_title,
      isFocus: t.is_focus,
      count: n,
      byLevel: stat[t.code]?.byLevel ?? {},
      byBook: stat[t.code]?.byBook ?? {},
      choice: stat[t.code]?.choice ?? 0,
      essay: stat[t.code]?.essay ?? 0,
    })
    sub.total += n
    ch.total += n
  }

  return NextResponse.json({ chapters, total: probs.length })
}

// ───────────────────────── POST ─────────────────────────
// 조건에 맞게 문항을 뽑아 시험지를 만든다
export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const b = await req.json().catch(() => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const {
    grade,
    semester,
    typeCodes = [] as string[],
    count = 20,
    levels = [] as number[],      // 1~6 (0이면 레벨 없는 교과서) — 비면 전체
    books = [] as string[],       // 쎈/쎈B/베이직쎈 — 비면 전체
    answerType = 'all',           // all | choice | written
    noRepeat = true,              // 예전에 출제한 문항 빼기
    perTypeMax = 0,               // 0 = 제한없음
    mode = 'random',              // random | even | focus | hard
    title = '',
    preview = false,              // true면 시험지를 만들지 않고 목록만 돌려준다
  } = b

  if (!grade || !semester || !typeCodes.length)
    return NextResponse.json({ error: '유형을 하나 이상 골라 주세요.' }, { status: 400 })

  let rows = await all<any>((f, t) =>
    supabase
      .from('problems')
      .select('id, book, grade, semester, sub_chapter_no, local_no, type_code, difficulty, step, level, is_essay, answer_kind')
      .eq('grade', grade)
      .eq('semester', Number(semester))
      .in('type_code', typeCodes)
      .range(f, t)
  )

  if (books.length) rows = rows.filter((p) => books.includes(p.book))
  if (levels.length) rows = rows.filter((p) => levels.includes(p.level ?? 0))
  if (answerType === 'choice') rows = rows.filter((p) => p.answer_kind === 'choice')
  if (answerType === 'written') rows = rows.filter((p) => p.answer_kind !== 'choice')

  // 중복출제 방지 — 지금까지 만든 시험지에 들어간 문항 빼기
  if (noRepeat && rows.length) {
    const used = await all<any>((f, t) =>
      supabase.from('exam_sheet_problems').select('problem_id').range(f, t)
    )
    const seen = new Set(used.map((u) => u.problem_id))
    const left = rows.filter((p) => !seen.has(p.id))
    if (left.length >= Math.min(count, 5)) rows = left   // 너무 적게 남으면 무시
  }

  if (!rows.length)
    return NextResponse.json({ error: '조건에 맞는 문항이 없습니다.' }, { status: 400 })

  // 유형별로 묶기
  const byType = new Map<string, any[]>()
  for (const p of rows) {
    if (!byType.has(p.type_code)) byType.set(p.type_code, [])
    byType.get(p.type_code)!.push(p)
  }

  const lv = (p: any) => p.level ?? 0
  const shuffle = (a: any[]) => a.sort(() => Math.random() - 0.5)

  for (const [k, v] of byType) {
    if (mode === 'hard') v.sort((x, y) => lv(y) - lv(x))
    else if (mode === 'focus') v.sort((x, y) => lv(x) - lv(y))
    else shuffle(v)
    if (perTypeMax > 0) byType.set(k, v.slice(0, perTypeMax))
  }

  // 뽑기
  let picked: any[] = []
  if (mode === 'even' || mode === 'random') {
    // 유형을 돌아가며 한 문제씩 — 고른 유형이 고루 들어가게
    const lists = [...byType.values()]
    for (let i = 0; picked.length < count; i++) {
      let added = false
      for (const l of lists) {
        if (l[i]) { picked.push(l[i]); added = true }
        if (picked.length >= count) break
      }
      if (!added) break
    }
  } else {
    picked = [...byType.values()].flat().slice(0, count)
  }

  // 시험지 순서: 유형번호 → 교재 → 문항번호
  const BOOK_ORDER: Record<string, number> = { 베이직쎈: 0, 쎈B: 1, 쎈: 2 }
  picked.sort(
    (a, b2) =>
      String(a.type_code).localeCompare(String(b2.type_code)) ||
      (BOOK_ORDER[a.book] ?? 9) - (BOOK_ORDER[b2.book] ?? 9) ||
      String(a.local_no).localeCompare(String(b2.local_no), undefined, { numeric: true })
  )

  if (preview)
    return NextResponse.json({
      count: picked.length,
      problems: picked.map((p, i) => ({ no: i + 1, id: p.id, book: p.book, localNo: p.local_no, typeCode: p.type_code, level: p.level })),
    })

  // 시험지 저장
  let code = newCode()
  for (let i = 0; i < 5; i++) {
    const { data } = await supabase.from('exam_sheets').select('id').eq('code', code).maybeSingle()
    if (!data) break
    code = newCode()
  }

  const { data: sheet, error: e1 } = await supabase
    .from('exam_sheets')
    .insert({
      code,
      title: title || `${grade}-${semester} 문제은행 ${picked.length}문항`,
      grade,
      semester: Number(semester),
      kind: 'main',
      show_source: false,
      show_difficulty: false,
    })
    .select('id, code')
    .single()
  if (e1 || !sheet) return NextResponse.json({ error: e1?.message ?? '시험지 저장 실패' }, { status: 500 })

  const { error: e2 } = await supabase
    .from('exam_sheet_problems')
    .insert(picked.map((p, i) => ({ sheet_id: sheet.id, no: i + 1, problem_id: p.id })))
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ code: sheet.code, count: picked.length })
}
