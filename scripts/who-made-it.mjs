/** 한 학생의 계정이 언제·누구 손에 만들어지고 바뀌었는지 양쪽 DB 에서 긁어 본다. 읽기만 한다.
 *   node scripts/who-made-it.mjs 이도윤
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

const name = process.argv[2] ?? '이도윤'
const kst = (t) => (t ? new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false }) : '-')

console.log(`\n═══ 스터디체크 ═══`)
const { data: rows } = await sc.from('students').select('*').eq('name', name)
for (const r of rows ?? []) {
  console.log(`\n■ ${r.name} ${r.grade ?? ''}  id=${r.id}`)
  console.log(`   만든 때 ${kst(r.created_at)} · 고친 때 ${kst(r.updated_at)}`)
  console.log(`   담당강사 ${r.teacher_name ?? '-'} · 학교 ${r.school ?? '-'} · 재원 ${r.is_active} · 휴원 ${r.on_leave ?? false}`)
  console.log(`   보호자 ${r.parent_phone ?? '(없음)'} · 학생 ${r.student_phone ?? '-'} · ops_student_id ${r.ops_student_id ?? '(없음)'}`)
  const { data: sch } = await sc.from('schedules').select('*').eq('student_id', r.id)
  console.log(`   시간표 ${(sch ?? []).map((s) => `${s.day_of_week}${s.start_time ? ' ' + String(s.start_time).slice(0, 5) : ''}${s.is_active === false ? '(끔)' : ''}`).join(' / ') || '없음'}`)
  for (const s of sch ?? []) console.log(`       └ 만든 때 ${kst(s.created_at)}`)
  const { data: ses } = await sc.from('class_sessions').select('session_date, session_type, created_at')
    .eq('student_id', r.id).order('session_date', { ascending: false }).limit(8)
  console.log(`   최근 수업 ${(ses ?? []).map((s) => s.session_date).join(', ') || '없음'}`)
  const { data: fb } = await sc.from('feedbacks').select('teacher_name, created_at')
    .eq('student_id', r.id).order('created_at', { ascending: false }).limit(5)
  if (fb?.length) console.log(`   알림장 쓴 사람 ${[...new Set(fb.map((f) => f.teacher_name))].join(', ')}`)
}

console.log(`\n═══ 수학OPS ═══`)
const { data: o } = await ops.from('students').select('*').eq('name', name)
for (const r of o ?? []) {
  console.log(`\n■ ${r.name} ${r.grade ?? ''}  id=${r.id}`)
  console.log(`   만든 때 ${kst(r.created_at)} · 고친 때 ${kst(r.updated_at)}`)
  const show = ['teacher_name', 'teacher_id', 'school', 'active', 'on_leave', 'parent_phone', 'created_by', 'updated_by', 'class_name', 'enrolled_date']
  for (const k of show) if (k in r) console.log(`   ${k}: ${r[k] ?? '-'}`)
}

console.log(`\n═══ 선생님 계정 (스터디체크 users) ═══`)
const { data: us } = await sc.from('users').select('*').order('created_at')
for (const u of us ?? []) console.log(`  ${(u.name ?? '-').padEnd(8)} ${String(u.role).padEnd(8)} ${u.email ?? ''}  만든 때 ${kst(u.created_at)}`)
