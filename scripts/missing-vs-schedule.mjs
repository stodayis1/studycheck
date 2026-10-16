/**
 * 「학습일지 미작성 보기」가 놓치는 학생이 있는지 본다.
 *
 *   node scripts/missing-vs-schedule.mjs 2026-10-16
 *
 * 지금 판정은 **수업 기록(class_sessions)** 을 훑는다. 그런데 선생님이 아무것도 안 쓰면
 * 그 행 자체가 안 생긴다. 그러면 「안 쓴 사람」이 목록에 아예 안 나온다.
 * 시간표(schedules) 기준으로 그날 수업이 있는 학생과 맞춰 본다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = DOW[new Date(date + 'T00:00:00').getDay()]

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const teacher = (t) => String(t ?? '').split(/[,，、·/\s]+/).filter(Boolean)[0] ?? '담당없음'

const [{ data: students }, { data: sch }, { data: ses }] = await Promise.all([
  db.from('students').select('id, name, grade, teacher_name').eq('is_active', true),
  db.from('schedules').select('student_id, day_of_week, is_active').eq('day_of_week', dow),
  db.from('class_sessions').select('id, student_id, session_type, progress_content').eq('session_date', date),
])
const stu = new Map((students ?? []).map((s) => [s.id, s]))
const { data: notes } = await db.from('learning_notes')
  .select('session_id, attendance').in('session_id', (ses ?? []).map((s) => s.id))
const noteBy = new Map((notes ?? []).map((n) => [n.session_id, n]))

// 시간표상 그날 수업이 있는 학생 (끈 줄 제외)
const onToday = new Set((sch ?? []).filter((x) => x.is_active !== false).map((x) => x.student_id))
const hasSession = new Set((ses ?? []).map((s) => s.student_id))

console.log(`\n═══ ${date}(${dow}) ═══\n`)
console.log(`시간표상 오늘 수업 ${[...onToday].filter((id) => stu.has(id)).length}명`)
console.log(`수업 기록이 생긴 학생 ${hasSession.size}명`)

// ① 시간표엔 있는데 기록이 아예 없는 학생 — 지금 미작성 목록에 **안 나온다**
const noRow = [...onToday].filter((id) => stu.has(id) && !hasSession.has(id))
console.log(`\n① 기록이 아예 없는 학생 ${noRow.length}명  ← 미작성 목록에 안 나오는 사람들`)
for (const id of noRow) {
  const s = stu.get(id)
  console.log(`   · ${s.name} ${s.grade} (${teacher(s.teacher_name)})`)
}

// ② 기록은 있는데 덜 채운 학생 — 지금 목록에 나온다
const half = []
for (const s of ses ?? []) {
  if (s.session_type && s.session_type !== '정규') continue
  const st = stu.get(s.student_id); if (!st) continue
  const n = noteBy.get(s.id)
  const why = !n ? '수업일지 없음' : !n.attendance ? '출결 미입력'
    : /결석/.test(n.attendance) ? null
      : !String(s.progress_content ?? '').trim() ? '진도 미입력' : null
  if (why) half.push(`${st.name} ${st.grade} (${teacher(st.teacher_name)}) — ${why}`)
}
console.log(`\n② 기록은 있는데 덜 채운 학생 ${half.length}명  ← 지금 목록에 나오는 사람들`)
for (const h of half) console.log(`   · ${h}`)
console.log('')
