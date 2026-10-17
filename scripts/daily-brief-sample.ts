/**
 * 데일리테스트가 **지금 쓰는 판 그대로** 어떻게 붙어 나가는지 본다. 읽기만 한다.
 *   node --import ./scripts/ts-resolve.mjs scripts/daily-brief-sample.ts 2026-10-15
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { buildBriefing, BODY_BUDGET } from '../lib/briefing'
import { fetchAll } from '../lib/fetchAll'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const date = process.argv[2] ?? '2026-10-15'

const { data: sessions } = await db.from('class_sessions')
  .select('id, student_id, session_date, progress_content, today_textbook_name, today_chapter, daily_test_unit, daily_test_score, hw_textbook_name, hw_textbook_page, hw_worksheet_range')
  .eq('session_date', date)
const students = await fetchAll((f, t) => db.from('students').select('id, name, grade').order('id').range(f, t))
const { data: notes } = await db.from('learning_notes').select('*')
  .in('session_id', (sessions ?? []).map((s: any) => s.id))
const stu = new Map(students.map((s: any) => [s.id, s]))
const note = new Map((notes ?? []).map((n: any) => [n.session_id, n]))

for (const 판 of [{ name: '지금 판(지난 학습지)', v2: false }, { name: '과제 성취도 판', v2: true }]) {
  console.log(`\n═══ ${판.name} ═══`)
  let shown = 0
  for (const ses of (sessions ?? []) as any[]) {
    if (ses.daily_test_score == null) continue
    const s: any = stu.get(ses.student_id); if (!s) continue
    const r = buildBriefing({
      studentName: s.name, studentGrade: s.grade, session: ses, note: note.get(ses.id) ?? null,
      useV2: 판.v2, noNoteTemplate: true,
    })
    console.log(r.body.split('\n').slice(0, 6).join('\n'))
    console.log(`  ─ ${r.bodyLen}자 ${r.bodyLen > BODY_BUDGET ? '★넘침' : ''}`)
    if (++shown >= 3) break
  }
  if (!shown) console.log('(그날 데일리테스트 점수가 적힌 수업이 없습니다)')
}
