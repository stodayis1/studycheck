/**
 * 「데일리테스트 판」으로 보내면 브리핑이 어떻게 달라지는지 **실데이터로** 본다. 읽기만 한다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/daily-test-brief.ts 2026-09-17
 *
 * 왜 — 템플릿을 등록하기 전에, 그 줄이 실제로 몇 건에 붙고 지금 무엇이 묻히는지 센다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { buildBriefing } from '../lib/briefing'
import { fetchAll } from '../lib/fetchAll'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const from = process.argv[2] ?? '2026-09-17'

// ★ Supabase 는 한 번에 1000행만 준다. 끝까지 가져온다 — 안 그러면 조용히 틀린 수를 센다.
const sessions = await fetchAll((f, t) => db.from('class_sessions')
  .select('id, student_id, session_date, progress_content, today_textbook_name, today_chapter, daily_test_unit, daily_test_score, hw_textbook_name, hw_textbook_page, hw_worksheet_range')
  .gte('session_date', from).order('id').range(f, t))
const students = await fetchAll((f, t) => db.from('students').select('id, name, grade').order('id').range(f, t))
const notes = await fetchAll((f, t) => db.from('learning_notes')
  .select('session_id, attendance, worksheet_score, worksheet_unit, worksheet_level, achievement_pct, memo')
  .order('session_id').range(f, t))

const stu = new Map(students.map((s: any) => [s.id, s]))
const note = new Map(notes.map((n: any) => [n.session_id, n]))

let withDaily = 0, buried = 0, over = 0
const 묻힌것: string[] = []
for (const ses of sessions as any[]) {
  const n: any = note.get(ses.id)
  const s: any = stu.get(ses.student_id)
  if (!s) continue
  if (ses.daily_test_score == null) continue
  withDaily++
  // 지금(데일리 줄이 없는 판)은 데일리테스트가 어디에도 안 나가는 경우
  if (n?.worksheet_score != null) {
    buried++
    if (묻힌것.length < 12) 묻힌것.push(
      `  ${ses.session_date} ${s.name}(${s.grade}) — 데일리 ${ses.daily_test_score}점인데 브리핑엔 성취도 ${n.worksheet_score}`)
  }
  const r = buildBriefing({
    studentName: s.name, studentGrade: s.grade, session: ses as any, note: n ?? null,
    // ★ 지금 판(V3 없음)으로 — 점수 칸 뒤에 붙는 모양을 센다.
    useV2: true, noNoteTemplate: true,
  })
  if (r.bodyLen > 950) over++
}

console.log(`${from} 이후 데일리테스트 점수가 있는 수업: ${withDaily}건`)
console.log(`그중 지금 판에서 점수가 묻히는 것: ${buried}건 (성취도 값이 있어서 데일리가 안 나간다)`)
console.log(묻힌것.join('\n'))
console.log(`\n새 판으로 만들었을 때 950자 넘는 것: ${over}건`)
