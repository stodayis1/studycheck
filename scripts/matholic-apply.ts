/**
 * 매쓰홀릭에서 **긁어온 줄**을 스터디체크에 넣는다 — 사람이 붙여넣지 않는 길.
 *
 * 원장님 2026-11-07 「이걸 붙여넣기를 하는 것보다 어차피 너가 긁어올수 있으면
 * 붙여넣기 하는 그 과정자체도 불필요하지 않겠니?」
 *
 * ★ 판단과 넣기는 **붙여넣기 화면과 똑같은 함수**를 쓴다
 *   (`lib/matholicPlan.ts` planRow · `lib/matholicApply.ts` applyPlans).
 *   여기서 따로 판단하면 규칙이 두 벌이 되고 조용히 어긋난다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/matholic-apply.ts <줄.json>            ← 미리보기만
 *   node --import ./scripts/ts-resolve.mjs scripts/matholic-apply.ts <줄.json> --save      ← 실제로 넣는다
 *   ... --teacher=윤지혜   평가관리에 적힐 선생님 이름 (기본 「매쓰홀릭」)
 *
 * 줄.json — 매쓰홀릭 「학습지 > 새 학습지 만들기 > 오답 > 학생 선택 + 날짜」 화면에서 읽은 것
 *   [{ "student": "홍길동", "date": "2026-11-07", "kind": "학습지",
 *      "course": "공통수학2 (2022 개정)", "title": "…(lv2.5)",
 *      "right": 33, "total": 40, "score": 82 }, …]
 *   · level 은 안 적어도 된다 — 제목에서 읽는다(화면과 같은 규칙).
 *   · 「학습현황 > 일간」 화면은 줄에 **날짜가 없어** 쓰지 않는다(2026-11-07 실측).
 *
 * ★ 기본은 **미리보기**다. `--save` 를 붙여야 넣는다. 같은 줄을 두 번 넣어도
 *   planRow 가 「이미 있어요」로 걸러 준다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { fetchAllRows } from '../lib/utils.ts'
import {
  findStudents, isDailyTest, coreTestRound, isDiagnostic, parseDiagnosticTitle,
  parseWorksheetTitle, DAILY_MAX_GAP_DAYS,
  type MatholicRow, type NameRules, type SessionLite, type ConceptRow, type StudentLite, type WsCandidate,
} from '../lib/matholic.ts'
import { planRow, type PlanContext, type MatholicPlan } from '../lib/matholicPlan.ts'
import { applyPlans } from '../lib/matholicApply.ts'

// ── .env.local 읽기 (다른 스크립트와 같은 방식) ──────────────────────────────
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}

const args = process.argv.slice(2)
const FILE = args.find((a) => !a.startsWith('--'))
const SAVE = args.includes('--save')
const TEACHER = (args.find((a) => a.startsWith('--teacher=')) ?? '--teacher=매쓰홀릭').slice('--teacher='.length)
if (!FILE || !fs.existsSync(FILE)) {
  console.error('✗ 긁어온 줄 JSON 경로를 주세요.  예: node --import ./scripts/ts-resolve.mjs scripts/matholic-apply.ts rows.json')
  process.exit(1)
}

const db = createClient(URL, KEY, { auth: { persistSession: false } })

/** 긁어온 생김새를 화면이 읽은 것과 같은 꼴(MatholicRow)로 맞춘다 */
function toRows(raw: any[]): MatholicRow[] {
  return raw.map((r, i): MatholicRow => {
    const title = String(r.title ?? '').trim()
    return {
      line: i + 1,
      student: String(r.student ?? '').trim(),
      date: String(r.date ?? '').trim(),
      kind: String(r.kind ?? '').trim(),
      course: String(r.course ?? '').trim(),
      title,
      // 레벨은 적혀 있으면 그대로, 없으면 **제목에서** 읽는다 (화면과 같은 규칙)
      level: r.level == null ? parseWorksheetTitle(title).level : Number(r.level),
      right: r.right == null ? null : Number(r.right),
      total: r.total == null ? null : Number(r.total),
      score: Number(r.score),
      raw: [r.date, r.kind, r.course, title, r.score].filter(Boolean).join(' · '),
    }
  })
}

async function buildContext(rows: MatholicRow[]): Promise<PlanContext> {
  const { data: setting } = await db.from('app_settings')
    .select('value').eq('key', 'matholic_name_rules').maybeSingle()
  const rules: NameRules = ((setting as any)?.value as any) ?? {}

  const concepts = await fetchAllRows<ConceptRow>(() =>
    db.from('concepts').select('grade, semester, chapter, sub_chapter, concept_name').order('id'))

  const mine = await fetchAllRows<StudentLite>(() =>
    db.from('students').select('id, name, grade, teacher_name')
      .or('is_active.eq.true,on_leave.eq.true').order('id'))

  const catalog = await fetchAllRows<{ textbook_name: string | null }>(() =>
    db.from('textbook_catalog').select('textbook_name').order('textbook_name'))
  const books = [...new Set(catalog.map((b) => String(b.textbook_name ?? '').trim()).filter(Boolean))]

  // 후보 학생의 학습지만 읽는다 (전체를 끌어오지 않는다)
  const found = rows.map((r) => findStudents(r.student, mine))
  const ids = [...new Set(found.flat().map((s) => s.id))]
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100))

  const ws = (await Promise.all(chunks.map((chunk) =>
    fetchAllRows<WsCandidate>(() => db.from('student_worksheets')
      .select('id, student_id, grade_level, unit, unit_name, current_level, worksheet_type, status, score, assigned_at, submitted_at')
      .in('student_id', chunk).order('id'))))).flat()
  const wsByStudent = new Map<string, WsCandidate[]>()
  for (const w of ws) {
    const arr = wsByStudent.get(w.student_id) ?? []
    arr.push(w); wsByStudent.set(w.student_id, arr)
  }

  // 데일리테스트를 붙일 수업 — 그날부터 2주 뒤까지
  const dates = [...new Set(rows.filter(isDailyTest).map((r) => r.date))].sort()
  const until = dates.length
    ? new Date(Date.parse(dates[dates.length - 1]) + DAILY_MAX_GAP_DAYS * 86400_000).toISOString().slice(0, 10)
    : ''
  const sessions = dates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
    chunks.map((chunk) => fetchAllRows<SessionLite>(() =>
      db.from('class_sessions').select('id, student_id, session_date, daily_test_score')
        .in('student_id', chunk).gte('session_date', dates[0]).lte('session_date', until).order('id'))))).flat()
  const sessionsOf = new Map<string, SessionLite[]>()
  for (const c of sessions) {
    const arr = sessionsOf.get(c.student_id) ?? []
    arr.push(c); sessionsOf.set(c.student_id, arr)
  }

  // 이미 들어간 코어테스트·진단평가 (두 번 넣지 않으려고)
  const coreDates = [...new Set(rows.filter((r) => coreTestRound(r)).map((r) => r.date))]
  const cores = coreDates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
    chunks.map((chunk) => fetchAllRows<{ student_id: string; exam_date: string; title: string | null; score: number | null }>(() =>
      db.from('exams').select('id, student_id, exam_date, title, score')
        .eq('exam_type', '코어테스트').in('student_id', chunk).in('exam_date', coreDates).order('id'))))).flat()
  const coreByKey = new Map(cores.map((e) => [`${e.student_id}|${e.exam_date}|${e.title ?? ''}`, e.score]))

  const examDates = [...new Set(rows.filter((r) => isDiagnostic(r)).map((r) => r.date))]
  const exams = examDates.length === 0 || ids.length === 0 ? [] : (await Promise.all(
    chunks.map((chunk) => fetchAllRows<{ student_id: string; exam_date: string; unit_name: string | null; score: number | null }>(() =>
      db.from('exams').select('id, student_id, exam_date, unit_name, score')
        .eq('exam_type', '진단평가').in('student_id', chunk).in('exam_date', examDates).order('id'))))).flat()
  const examByKey = new Map(exams.map((e) => [`${e.student_id}|${e.exam_date}|${e.unit_name ?? ''}`, e.score]))

  return { mine, rules, books, concepts, wsByStudent, sessionsOf, coreByKey, examByKey }
}

const 한글 = (s: string, n: number) => {
  const w = [...s].reduce((a, c) => a + (c.charCodeAt(0) > 0x2000 ? 2 : 1), 0)
  return s + ' '.repeat(Math.max(0, n - w))
}
const MODE: Record<string, string> = {
  daily: '학습일지 데일리', core: '평가관리 코어', exam: '평가관리 진단평가',
  fill: '학습지 점수 채움', new: '학습지 새로', skip: '건너뜀', excluded: '안 넣음', done: '이미 있음',
}

async function main() {
  const raw = JSON.parse(fs.readFileSync(FILE!, 'utf8'))
  if (!Array.isArray(raw) || raw.length === 0) { console.error('✗ 줄이 없습니다.'); process.exit(1) }
  const rows = toRows(raw)
  const ctx = await buildContext(rows)
  const plans: MatholicPlan[] = rows.map((r) => planRow(r, ctx))

  console.log(`\n읽은 줄 ${rows.length}건 · 학생 ${new Set(rows.map((r) => r.student)).size}명\n`)
  for (const p of plans) {
    console.log([한글(p.row.student, 10), p.row.date, 한글(`${p.row.score}점`, 6),
      한글(MODE[p.mode] ?? p.mode, 18), p.why].join(' | '))
  }
  const 셈: Record<string, number> = {}
  for (const p of plans) 셈[p.mode] = (셈[p.mode] ?? 0) + 1
  console.log('\n' + Object.entries(셈).map(([k, v]) => `${MODE[k] ?? k} ${v}`).join(' · '))

  if (!SAVE) {
    console.log('\n미리보기만 했습니다. 넣으려면 --save 를 붙이세요.')
    return
  }
  const r = await applyPlans(db, plans, { teacherName: TEACHER, books: ctx.books })
  console.log(`\n넣었습니다 — 학습일지 ${r.daily} · 코어테스트 ${r.core} · 진단평가 ${r.exam} · 점수 채움 ${r.filled} · 새 학습지 ${r.created}`)
  if (r.failed.length) {
    console.log(`실패 ${r.failed.length}건:`)
    for (const f of r.failed) console.log('  ✗ ' + f)
    process.exitCode = 1
  }
}

main().catch((e) => { console.error('✗', e?.message ?? e); process.exitCode = 1 })
