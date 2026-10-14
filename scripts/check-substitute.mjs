/**
 * 대체수업이 **원래 날짜를 비워 주고 있는가** 를 본다.
 *
 *   node scripts/check-substitute.mjs 2026-10-14
 *
 * 보는 것
 *   · 수학OPS 의 extra_classes 중 class_type='substitute' 인 것
 *   · 그 original_date(원래 수업일)가 스터디체크 쪽에서 어떻게 보이는지
 *
 * 아무것도 고치지 않는다 — 읽기만 한다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function env(file, pick) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return pick.map((k) => out[k])
}

const [SC_URL, SC_KEY] = env('.env.local', ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])
const [OPS_URL, OPS_KEY] = env('C:/Users/USER/sumath-admin/.env.local',
  ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'])

const sc = createClient(SC_URL, SC_KEY, { auth: { persistSession: false } })
const ops = createClient(OPS_URL, OPS_KEY, { auth: { persistSession: false } })

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const dow = DOW[new Date(date + 'T00:00:00').getDay()]

const { data: subs, error } = await ops.from('extra_classes')
  .select('student_id, scheduled_date, scheduled_time, status, class_type, original_date')
  .eq('class_type', 'substitute').order('scheduled_date', { ascending: false }).limit(300)
if (error) { console.log('OPS 읽기 실패:', error.message); process.exit(1) }

const { data: opsStu } = await ops.from('students').select('id, name').in('id', [...new Set(subs.map((s) => s.student_id))])
const opsName = new Map((opsStu ?? []).map((s) => [s.id, s.name]))

console.log(`\n대체수업 전체 ${subs.length}건\n`)

// 오늘이 「원래 날짜」인 대체수업 — 오늘은 수업이 없어야 하는 사람들
const todayOriginal = subs.filter((s) => s.original_date === date)
console.log(`${date}(${dow})가 원래 수업일인 대체수업: ${todayOriginal.length}건`)
for (const s of todayOriginal) {
  console.log(`  · ${opsName.get(s.student_id) ?? s.student_id} — ${s.scheduled_date} 로 옮김 (${s.status})`)
}

// 스터디체크 쪽에서 이 사람들이 오늘 어떻게 보이나
const names = todayOriginal.map((s) => opsName.get(s.student_id)).filter(Boolean)
if (names.length) {
  const { data: sStu } = await sc.from('students').select('id, name, grade, teacher_name').in('name', names)
  const ids = (sStu ?? []).map((s) => s.id)
  const [{ data: ses }, { data: sch }] = await Promise.all([
    sc.from('class_sessions').select('id, student_id, session_date, session_type').eq('session_date', date).in('student_id', ids),
    sc.from('schedules').select('student_id, day_of_week, is_active').in('student_id', ids),
  ])
  console.log('\n스터디체크 쪽 오늘 상태')
  for (const st of sStu ?? []) {
    const has = (ses ?? []).some((x) => x.student_id === st.id)
    const onToday = (sch ?? []).some((x) => x.student_id === st.id && x.day_of_week === dow && x.is_active !== false)
    console.log(`  · ${st.name} ${st.grade} — 오늘 수업기록 ${has ? '있음' : '없음'} · 시간표상 ${dow}요일 ${onToday ? '수업 있음' : '수업 없음'}` +
      (onToday && !has ? '   ← 화면에는 「오늘 수업」으로 뜨는데 기록이 없다' : ''))
  }
}

// 지난 30일 전체로 넓혀 본다 — 같은 일이 얼마나 자주 있나
const from = new Date(Date.parse(date) - 30 * 86400000).toISOString().slice(0, 10)
const recent = subs.filter((s) => s.original_date && s.original_date >= from && s.original_date <= date)
console.log(`\n최근 30일 안에 원래 날짜가 있는 대체수업: ${recent.length}건`)
for (const s of recent.slice(0, 20)) {
  console.log(`  ${s.original_date} → ${s.scheduled_date}  ${opsName.get(s.student_id) ?? ''} (${s.status})`)
}
