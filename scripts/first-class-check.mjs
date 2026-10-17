/**
 * 아직 **첫 수업 전**인 학생이 미작성 명단에 끼는지 본다. 읽기만 한다.
 *
 *   node scripts/first-class-check.mjs 2026-10-16
 *
 * 첫 수업일은 수학OPS 의 students.first_class_date 에 있다.
 * 스터디체크에는 그 칸이 없어서 지금은 아무도 안 보고 있다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function env(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const A = env('.env.local'), B = env('C:/Users/USER/sumath-admin/.env.local')
const sc = createClient(A.NEXT_PUBLIC_SUPABASE_URL, A.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ops = createClient(B.NEXT_PUBLIC_SUPABASE_URL, B.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = DOW[new Date(date + 'T00:00:00').getDay()]
const teacher = (t) => String(t ?? '').split(/[,，、·/\s]+/).filter(Boolean)[0] ?? '담당없음'

const { data: opsStu } = await ops.from('students')
  .select('id, name, first_class_date, first_class_time, active')
const opsBy = new Map((opsStu ?? []).map((s) => [s.id, s]))

const { data: students } = await sc.from('students')
  .select('id, name, grade, teacher_name, ops_student_id, created_at').eq('is_active', true)
const { data: sch } = await sc.from('schedules').select('student_id, is_active').eq('day_of_week', dow)
const { data: ses } = await sc.from('class_sessions').select('student_id').eq('session_date', date)

const onToday = new Set((sch ?? []).filter((x) => x.is_active !== false).map((x) => x.student_id))
const hasRow = new Set((ses ?? []).map((s) => s.student_id))

console.log(`\n═══ ${date}(${dow}) — 첫 수업 전인데 미작성으로 잡히는 학생 ═══\n`)

const all = (opsStu ?? []).filter((s) => s.first_class_date)
console.log(`OPS 에 첫 수업일이 적힌 학생 ${all.length}명`)
const future = all.filter((s) => s.first_class_date > date)
console.log(`그중 ${date} 기준 아직 첫 수업 전 ${future.length}명\n`)

let hit = 0
for (const st of students ?? []) {
  if (!onToday.has(st.id) || hasRow.has(st.id)) continue      // 그날 수업이 없거나 이미 기록이 있으면 넘어감
  const o = st.ops_student_id ? opsBy.get(st.ops_student_id) : null
  if (!o?.first_class_date || o.first_class_date <= date) continue
  hit++
  console.log(`  · ${st.name} ${st.grade} (${teacher(st.teacher_name)}) — 첫 수업 ${o.first_class_date}${o.first_class_time ? ' ' + String(o.first_class_time).slice(0, 5) : ''}`)
}
console.log(`\n미작성 명단에서 빠져야 할 학생 ${hit}명`)

// 첫 수업일이 OPS 에만 있고 연결이 없는 학생도 짚어 둔다
const noLink = (students ?? []).filter((s) => !s.ops_student_id && onToday.has(s.id) && !hasRow.has(s.id))
if (noLink.length) console.log(`\n(OPS 연결이 없어 첫 수업일을 볼 수 없는 학생 ${noLink.length}명)`)
console.log('')
