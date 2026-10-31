/**
 * 기출유사 결과를 **평가관리에 쌓고, 다음 수업 학습일지 메모에 붙인다.**
 *
 * 쓰는 법 (기본은 **아무것도 안 쓰는** 예행이다)
 *   node --import ./scripts/ts-resolve.mjs scripts/past-exam-similar.ts <결과파일> --date 2026-10-24
 *   … --from 2026-11-02            메모를 붙일 수업을 그날부터 찾는다 (없으면 --date 부터)
 *   … --apply                      실제로 넣는다
 *   … --only-exams / --only-memo   한쪽만
 *
 * ★ 결과파일은 **저장소 밖**에 둔다. 학생 실명이 들어 있다.
 *
 * ★ 메모는 **선생님이 그 일지를 채운 뒤에만** 붙인다.
 *   저녁 8시 1차 발송은 「출결만 찍힌 껍데기」를 다음 날로 미루는데, 그 판정이 memo 가
 *   채워져 있으면 「내용 있음」으로 본다(app/api/kakao-briefing/route.ts 의 껍데기).
 *   그래서 선생님보다 먼저 메모를 넣으면 **진도 「기록 없음」인 글이 저녁 8시에 나간다** —
 *   원장님이 2026-10-22 에 막으신 구멍이다(10월에 45건 났다).
 *   여기서는 그 판정보다 **더 좁게** 본다 — 진도나 과제가 적혀 있을 때만 붙인다.
 *   아직 안 쓴 학생은 「기다림」으로 찍어 두고, 선생님이 쓴 뒤 다시 돌리면 된다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { parsePastExamSimilar, examRowFor, memoLineFor } from '../lib/pastExamSimilar.ts'
import { pickSessionForDaily } from '../lib/matholic.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1) }
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const file = argv.find((a) => !a.startsWith('--'))
const opt = (k: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined }
const APPLY = argv.includes('--apply')
const DATE = opt('date')
const FROM = opt('from') ?? DATE
const ONLY_EXAMS = argv.includes('--only-exams')
const ONLY_MEMO = argv.includes('--only-memo')
if (!file || !DATE) { console.error('✗ 쓰는 법: <결과파일> --date YYYY-MM-DD [--from YYYY-MM-DD] [--apply]'); process.exit(1) }
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE) || !/^\d{4}-\d{2}-\d{2}$/.test(FROM!)) { console.error('✗ 날짜는 YYYY-MM-DD'); process.exit(1) }

const parsed = parsePastExamSimilar(fs.readFileSync(file, 'utf8'))
console.log(`\n== 읽은 것 ==`)
for (const b of parsed.blocks) console.log(`  [${b.title} 총 ${b.total}문항] ${b.rows.length}명`)
if (parsed.skipped.length) {
  console.log(`\n!! 못 읽은 줄 ${parsed.skipped.length}건 — 그냥 넘기지 않습니다`)
  for (const s of parsed.skipped) console.log(`   ${s.line}줄: ${s.text}  → ${s.why}`)
}
if (!parsed.blocks.length) process.exit(1)

// ── 이름 → 학생. 동명이인은 **혼자 정하지 않는다.** ─────────────────────────────
const names = [...new Set(parsed.blocks.flatMap((b) => b.rows.map((r) => r.name)))]
const { data: stu, error: e1 } = await db.from('students')
  .select('id, name, grade, teacher_name, is_active, on_leave').in('name', names)
if (e1) throw new Error(e1.message)
const byName = new Map<string, any[]>()
for (const s of stu ?? []) byName.set(s.name, [...(byName.get(s.name) ?? []), s])

const ids = (stu ?? []).map((s: any) => s.id)
// 메모를 붙일 수업 — FROM 부터 보름 안의 수업만 읽는다.
const until = new Date(Date.parse(FROM!) + 21 * 86400_000).toISOString().slice(0, 10)
const [{ data: sessions }, { data: already }] = await Promise.all([
  db.from('class_sessions')
    .select('id, student_id, session_date, progress_content, today_chapter, today_textbook_name, hw_textbook_name, hw_textbook_page, hw_worksheet_range, daily_test_score')
    .in('student_id', ids).gte('session_date', FROM!).lte('session_date', until).order('session_date'),
  db.from('exams').select('student_id, title, exam_date').in('student_id', ids).eq('exam_date', DATE),
])
const noteBy = new Map<string, any>()
for (let i = 0; i < (sessions ?? []).length; i += 100) {
  const { data: n } = await db.from('learning_notes').select('id, session_id, memo')
    .in('session_id', (sessions ?? []).slice(i, i + 100).map((s: any) => s.id))
  for (const x of n ?? []) noteBy.set(x.session_id, x)
}
const examDone = new Set((already ?? []).map((e: any) => `${e.student_id}|${e.title}`))

/** 선생님이 그 일지를 채웠나 — 껍데기 판정보다 **더 좁게** 본다(진도나 과제가 있어야 한다). */
const written = (ses: any) =>
  [ses.progress_content, ses.today_chapter, ses.today_textbook_name,
   ses.hw_textbook_name, ses.hw_textbook_page, ses.hw_worksheet_range]
    .some((t: any) => String(t ?? '').trim()) || ses.daily_test_score != null

const examPlan: any[] = []
const memoPlan: any[] = []
const problems: string[] = []

for (const b of parsed.blocks) for (const r of b.rows) {
  const found = (byName.get(r.name) ?? []).filter((s: any) => s.is_active)
  if (found.length === 0) { problems.push(`${r.name} — 재원생 명단에 없어요 (${b.line}줄 묶음)`); continue }
  if (found.length > 1) { problems.push(`${r.name} — 같은 이름이 ${found.length}명이에요. 누구인지 골라 주셔야 합니다`); continue }
  const s = found[0]
  const e = examRowFor(b, r)

  if (!ONLY_MEMO) {
    if (examDone.has(`${s.id}|${b.title}`)) problems.push(`${s.name} — 평가관리에 이미 있어요 (${b.title} ${DATE})`)
    else examPlan.push({ student: s, block: b, row: r, exam: { student_id: s.id, exam_date: DATE, teacher_name: s.teacher_name ?? null, ...e } })
  }

  if (!ONLY_EXAMS) {
    const mine = (sessions ?? []).filter((x: any) => x.student_id === s.id)
    const picked = pickSessionForDaily(FROM!, mine as any, 21)
    const line = memoLineFor(b, r)
    if (!picked) { problems.push(`${s.name} — ${FROM} 뒤 3주 안에 수업이 없어요 (메모 못 붙임)`); continue }
    const ses: any = (sessions ?? []).find((x: any) => x.id === (picked.session as any).id)
    const note = noteBy.get(ses.id)
    if (note?.memo && String(note.memo).includes(b.title)) { problems.push(`${s.name} — 그 일지 메모에 이미 있어요 (${ses.session_date})`); continue }
    memoPlan.push({ student: s, date: ses.session_date, note, line, ready: !!note && written(ses) })
  }
}

const 기다림 = memoPlan.filter((m) => !m.ready)
const 붙일것 = memoPlan.filter((m) => m.ready)

console.log(`\n== 평가관리에 넣을 것 ${examPlan.length}건 ==`)
for (const p of examPlan.slice(0, 60))
  console.log(`  ${p.student.name}(${p.student.grade}) ${p.exam.title} — ${p.exam.score}/${p.exam.total_score} (${p.row.wrong}개 틀림) · ${p.exam.teacher_name ?? '담당없음'}`)

console.log(`\n== 학습일지 메모에 붙일 것 ${붙일것.length}건 ==`)
for (const m of 붙일것.slice(0, 60)) console.log(`  ${m.date} ${m.student.name} — ${m.line}`)
if (기다림.length) {
  console.log(`\n-- 아직 선생님이 안 쓴 일지 ${기다림.length}건 (지금 붙이면 껍데기 브리핑이 나갑니다 — 쓰신 뒤 다시 돌립니다) --`)
  for (const m of 기다림) console.log(`  ${m.date} ${m.student.name}${m.note ? '' : ' (일지 줄 없음)'}`)
}
if (problems.length) {
  console.log(`\n!! 손봐야 할 것 ${problems.length}건`)
  for (const t of problems) console.log(`   ${t}`)
}

if (!APPLY) { console.log('\n(예행입니다. 실제로 넣으려면 --apply)'); process.exit(0) }

let ins = 0, upd = 0
for (const p of examPlan) {
  const { error } = await db.from('exams').insert(p.exam)
  if (error) console.log(`✗ ${p.student.name} 평가관리 — ${error.message}`); else ins++
}
for (const m of 붙일것) {
  const next = m.note.memo?.trim() ? `${m.note.memo.trim()}\n${m.line}` : m.line
  const { error } = await db.from('learning_notes').update({ memo: next, updated_at: new Date().toISOString() }).eq('id', m.note.id)
  if (error) console.log(`✗ ${m.student.name} 메모 — ${error.message}`); else upd++
}
console.log(`\n넣음: 평가관리 ${ins}건 · 메모 ${upd}건`)
