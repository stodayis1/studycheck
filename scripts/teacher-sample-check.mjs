/**
 * 「담당강사에게 샘플」이 **누구 글을 누구에게** 보낼지 미리 본다. 보내지 않는다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/teacher-sample-check.mjs 2026-10-14
 *
 * 고르는 규칙은 라우트와 같다 — 선생님마다 그날 본인 학생 중 **글이 가장 짧은** 한 명.
 * 결석한 날은 뺀다(선생님이 쓴 글이 아니라 자동 문구라서).
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing } from '../lib/briefing.ts'
import { mainTeacherOf } from '../lib/teachers.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: sessions } = await db.from('class_sessions').select('*').eq('session_date', date)
const ids = [...new Set((sessions ?? []).map((s) => s.student_id))]
const [{ data: students }, { data: notes }, { data: fbs }] = await Promise.all([
  db.from('students').select('id, name, grade, teacher_name, parent_phone').in('id', ids),
  db.from('learning_notes').select('*').in('session_id', (sessions ?? []).map((s) => s.id)),
  db.from('feedbacks').select('*').in('student_id', ids)
    .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
])
const stu = new Map((students ?? []).map((s) => [s.id, s]))
const noteBy = new Map((notes ?? []).map((n) => [n.session_id, n]))

const picks = new Map()
const absentOnly = new Set()
let made = 0
for (const ses of sessions ?? []) {
  const st = stu.get(ses.student_id)
  const note = noteBy.get(ses.id)
  if (!st || !note?.attendance || !st.parent_phone) continue
  if (/시험기간/.test(note.attendance)) continue
  const t = mainTeacherOf(st.teacher_name)
  if (!t) continue
  made++
  if (note.attendance === '결석') { absentOnly.add(t); continue }
  const brief = buildBriefing({
    studentName: st.name, session: ses, note,
    feedbacks: (fbs ?? []).filter((f) => f.student_id === st.id), makeup: null, noNoteTemplate: false,
  })
  const cur = picks.get(t)
  if (!cur || brief.bodyLen < cur.len) picks.set(t, { name: st.name, grade: st.grade, len: brief.bodyLen })
}

// 저녁 8시에 받는 분 — app/api/kakao-briefing 의 EVENING_SAMPLE_TEACHERS 와 같은 명단
const EVENING = ['윤주희', '조윤희']

console.log(`\n═══ ${date} 담당강사 샘플 — 보낼 것 ═══\n`)
console.log(`그날 글이 만들어지는 학생 ${made}명\n`)
for (const when of ['evening', 'morning']) {
  const rows = [...picks]
    .filter(([t]) => (when === 'evening') === EVENING.includes(t))
    .sort((a, b) => a[0].localeCompare(b[0], 'ko'))
  console.log(when === 'evening' ? '  [저녁 8시]' : '  [다음 날 오전 11시]')
  if (!rows.length) console.log('     (없음)')
  for (const [t, p] of rows) console.log(`     ${t} 선생님  ←  ${p.name}(${p.grade}) 브리핑 · ${p.len}자`)
}
const only = [...absentOnly].filter((t) => !picks.has(t))
if (only.length) console.log(`\n  결석만 있어 못 보내는 선생님: ${only.join(', ')}`)
console.log(`\n보낼 통수 ${picks.size}통\n`)
