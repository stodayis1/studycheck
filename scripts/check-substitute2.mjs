/** 등록된 대체수업의 **원래 날짜**가 스터디체크에서 어떻게 처리됐는지 본다. 읽기만 한다. */
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
const DOW = ['일', '월', '화', '수', '목', '금', '토']

// ① 류연서가 대체수업 명단에 있나
const { data: ry } = await ops.from('students').select('id, name').eq('name', '류연서')
if (ry?.length) {
  const { data: mine } = await ops.from('extra_classes')
    .select('scheduled_date, original_date, class_type, status').eq('student_id', ry[0].id)
  console.log(`류연서 — OPS 보강/추가/대체 기록 ${mine?.length ?? 0}건`)
  for (const m of mine ?? []) console.log(`   ${m.class_type} ${m.original_date ?? '-'} → ${m.scheduled_date} (${m.status})`)
} else console.log('OPS 에 류연서가 없어요')

// ② 등록된 대체수업들의 원래 날짜가 스터디체크에서 어떻게 됐나
const { data: subs } = await ops.from('extra_classes')
  .select('student_id, scheduled_date, original_date, status')
  .eq('class_type', 'substitute').not('original_date', 'is', null)
  .gte('original_date', '2026-09-01').order('original_date', { ascending: false })
const { data: oStu } = await ops.from('students').select('id, name').in('id', [...new Set(subs.map((s) => s.student_id))])
const oName = new Map((oStu ?? []).map((s) => [s.id, s.name]))

const names = [...new Set(subs.map((s) => oName.get(s.student_id)).filter(Boolean))]
const { data: sStu } = await sc.from('students').select('id, name, grade').in('name', names)
const sByName = new Map((sStu ?? []).map((s) => [s.name, s]))
const ids = (sStu ?? []).map((s) => s.id)
const { data: ses } = await sc.from('class_sessions').select('id, student_id, session_date, session_type').in('student_id', ids)
const { data: notes } = await sc.from('learning_notes').select('session_id, attendance').in('session_id', (ses ?? []).map((s) => s.id))
const nBy = new Map((notes ?? []).map((n) => [n.session_id, n]))
const { data: sch } = await sc.from('schedules').select('student_id, day_of_week, is_active').in('student_id', ids)

console.log('\n원래 날짜 → 옮긴 날짜   |  원래 날짜에 스터디체크는?')
for (const s of subs) {
  const name = oName.get(s.student_id)
  const st = sByName.get(name)
  if (!st) { console.log(`  ${s.original_date} → ${s.scheduled_date}  ${name} — 스터디체크에 없음`); continue }
  const row = (ses ?? []).find((x) => x.student_id === st.id && x.session_date === s.original_date)
  const dow = DOW[new Date(s.original_date + 'T00:00:00').getDay()]
  const onSch = (sch ?? []).some((x) => x.student_id === st.id && x.day_of_week === dow && x.is_active !== false)
  const note = row ? nBy.get(row.id) : null
  const what = !row ? '수업기록 없음' : `기록 있음(${row.session_type ?? '-'}) · 출결 ${note?.attendance ?? '미입력'}`
  console.log(`  ${s.original_date}(${dow}) → ${s.scheduled_date}  ${name} ${st.grade}` +
    `  | ${what}${onSch ? ' · 시간표상 그날 수업 있음' : ''}`)
}
