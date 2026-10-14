/**
 * 그날 브리핑이 **누구에게** 나갔는지, 그리고 **빠진 사람은 없는지** 본다.
 *
 *   node scripts/briefing-who.mjs 2026-10-14
 *
 * 보낸 시각으로 묶어서 「예약 발송분」과 「손으로 보낸 분」을 갈라 보여 준다.
 * 빠진 사람은 수업 종류(정규·보강·추가수업)를 가리지 않고 전부 찾는다.
 * 읽기만 한다.
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const hhmm = (t) => new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false, hour: '2-digit', minute: '2-digit' })
const teacher = (t) => String(t ?? '').split(/[,，、·/\s]+/).filter(Boolean)[0] ?? '담당없음'

const [{ data: sessions }, { data: sends }] = await Promise.all([
  db.from('class_sessions').select('id, student_id, session_type').eq('session_date', date),
  db.from('briefing_sends').select('student_id, status, error, sent_at, body_len').eq('session_date', date),
])
const ids = [...new Set([...(sessions ?? []).map((s) => s.student_id), ...(sends ?? []).map((s) => s.student_id)])]
const [{ data: students }, { data: notes }] = await Promise.all([
  db.from('students').select('id, name, grade, teacher_name, parent_phone').in('id', ids),
  db.from('learning_notes').select('session_id, attendance').in('session_id', (sessions ?? []).map((s) => s.id)),
])
const stu = new Map((students ?? []).map((s) => [s.id, s]))
const noteBy = new Map((notes ?? []).map((n) => [n.session_id, n]))
const sesBy = new Map((sessions ?? []).map((s) => [s.student_id, s]))

// ── 나간 것 — 보낸 시각이 가까운 것끼리 묶는다(한 번에 쏟아지므로 묶음이 곧 한 번의 발송) ──
const ok = (sends ?? []).filter((s) => s.status === 'sent' && s.sent_at).sort((a, b) => a.sent_at.localeCompare(b.sent_at))
const batches = []
for (const s of ok) {
  const last = batches[batches.length - 1]
  if (last && new Date(s.sent_at) - new Date(last.end) < 10 * 60 * 1000) {
    last.end = s.sent_at; last.rows.push(s)
  } else batches.push({ start: s.sent_at, end: s.sent_at, rows: [s] })
}

console.log(`\n═══ ${date} 학습브리핑 발송 명단 ═══`)
console.log(`\n보낸 것 ${ok.length}건 · 실패 ${(sends ?? []).length - ok.length}건\n`)

batches.forEach((b, i) => {
  console.log(`── ${i + 1}차  ${hhmm(b.start)} ~ ${hhmm(b.end)}  ${b.rows.length}명 ──`)
  const byTeacher = new Map()
  for (const r of b.rows) {
    const st = stu.get(r.student_id)
    if (!st) continue
    const t = teacher(st.teacher_name)
    byTeacher.set(t, [...(byTeacher.get(t) ?? []), st])
  }
  for (const [t, list] of [...byTeacher].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
    const names = list.sort((a, b) => a.name.localeCompare(b.name, 'ko')).map((s) => `${s.name}(${s.grade})`)
    console.log(`   ${t} ${list.length}명 — ${names.join(', ')}`)
  }
  console.log('')
})

// ── 빠진 사람 — 수업 종류를 가리지 않는다 ─────────────────────────────────
const sent = new Set(ok.map((s) => s.student_id))
const missed = []
for (const ses of sessions ?? []) {
  if (sent.has(ses.student_id)) continue
  const st = stu.get(ses.student_id)
  if (!st) { missed.push({ name: `(학생 없음 ${ses.student_id})`, why: '학생 기록이 사라짐' }); continue }
  const n = noteBy.get(ses.id)
  const why = !n ? '수업일지 없음'
    : !n.attendance ? '출결 미입력'
      : /시험기간/.test(n.attendance) ? '시험기간 결석 — 일부러 안 보냄'
        : !st.parent_phone ? '보호자 번호 없음'
          : '사유 불명 — 확인 필요'
  missed.push({ name: `${st.name} ${st.grade} (${teacher(st.teacher_name)})`, why, type: ses.session_type ?? '정규' })
}

console.log(`── 빠진 사람 ${missed.length}명 ──`)
if (!missed.length) console.log('   없습니다. 그날 수업한 학생 전원에게 나갔습니다.')
for (const m of missed) console.log(`   · ${m.name} [${m.type}] — ${m.why}`)

const fail = (sends ?? []).filter((s) => s.status !== 'sent')
if (fail.length) {
  console.log(`\n── 실패 ${fail.length}건 ──`)
  for (const f of fail) console.log(`   ✗ ${stu.get(f.student_id)?.name ?? f.student_id} — ${f.error ?? '사유 없음'}`)
}
console.log('')
