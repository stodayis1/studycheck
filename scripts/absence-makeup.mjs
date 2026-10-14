/**
 * 「언제 결석한 것을 언제 보강했나」 — 결석 줄과 OPS 보강을 짝지어 본다.
 *
 *   node scripts/absence-makeup.mjs 2026-09-01
 *
 * 스터디체크의 결석(learning_notes.attendance='결석')과
 * 수학OPS 의 보강(makeups.absent_date)을 날짜로 맞춘다. 읽기만 한다.
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

const from = process.argv[2] ?? '2026-09-01'

async function all(db, table, sel, tweak = (q) => q) {
  const out = []
  for (let at = 0; ; at += 1000) {
    const { data, error } = await tweak(db.from(table).select(sel).range(at, at + 999))
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

// ── 스터디체크 쪽 결석 ──────────────────────────────────────────────────────
const sessions = await all(sc, 'class_sessions', 'id, student_id, session_date',
  (q) => q.gte('session_date', from))
const notes = await all(sc, 'learning_notes', 'session_id, attendance')
const noteBy = new Map(notes.map((n) => [n.session_id, n]))
const students = await all(sc, 'students', 'id, name, grade, teacher_name, ops_student_id')
const stu = new Map(students.map((s) => [s.id, s]))

const absences = []
for (const s of sessions) {
  const n = noteBy.get(s.id)
  if (n?.attendance !== '결석') continue
  const st = stu.get(s.student_id)
  if (!st) continue
  absences.push({ date: s.session_date, st })
}
absences.sort((a, b) => a.date.localeCompare(b.date))

// ── OPS 쪽 보강 ────────────────────────────────────────────────────────────
// 보강은 결석(attendances)과 슬롯(makeup_slots)에 걸쳐 있다 — lib/opsMakeups.ts 와 같은 모양으로 읽는다.
const makeups = await all(ops, 'makeups',
  'student_id, booking_status, custom_date, custom_time, ' +
  'attendance:attendances(absent_date), slot:makeup_slots(slot_date, slot_time)')
const mkBy = new Map()
for (const m of makeups) {
  const absent = m.attendance?.absent_date
  if (!absent) continue
  const k = `${m.student_id}|${absent}`
  if (!mkBy.has(k)) mkBy.set(k, {
    status: m.booking_status,
    makeup_date: m.slot?.slot_date ?? m.custom_date ?? null,
    makeup_time: m.slot?.slot_time ?? m.custom_time ?? null,
  })
}

const STATE = { attended: '보강 완료', booked: '보강 예정', absent: '보강도 결석',
  pending: '날짜 미정', cancelled: '취소' }

let linked = 0, none = 0
console.log(`\n═══ ${from} 이후 결석 ${absences.length}건 ═══\n`)
for (const a of absences) {
  const m = a.st.ops_student_id ? mkBy.get(`${a.st.ops_student_id}|${a.date}`) : null
  const teacher = String(a.st.teacher_name ?? '').split(/[,，、·/\s]+/).filter(Boolean)[0] ?? '-'
  if (m) {
    linked++
    const when = m.makeup_date ? `${m.makeup_date}${m.makeup_time ? ' ' + String(m.makeup_time).slice(0, 5) : ''}` : '날짜 미정'
    console.log(`  ${a.date}  ${a.st.name} ${a.st.grade} (${teacher})  →  ${when}  [${STATE[m.status] ?? m.status}]`)
  } else {
    none++
    console.log(`  ${a.date}  ${a.st.name} ${a.st.grade} (${teacher})  →  (보강 기록 없음)`)
  }
}
console.log(`\n보강이 이어진 결석 ${linked}건 · 안 이어진 결석 ${none}건`)
