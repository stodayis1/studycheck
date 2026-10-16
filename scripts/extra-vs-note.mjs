/**
 * 그날 **추가수업이 잡힌 학생**이 스터디체크에 쓴 학습일지와 어떻게 맞물리는지 본다.
 *
 *   node scripts/extra-vs-note.mjs 2026-10-16
 *
 * 읽기만 한다.
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

const { data: extras } = await ops.from('extra_classes')
  .select('id, student_id, scheduled_date, scheduled_time, status, class_type, original_date, target_month, lesson_textbook, lesson_worksheet, lesson_score, lesson_note')
  .eq('scheduled_date', date)
if (!extras?.length) { console.log(`${date} — OPS 에 잡힌 추가·대체수업이 없어요.`); process.exit(0) }

const { data: oStu } = await ops.from('students').select('id, name').in('id', extras.map((e) => e.student_id))
const oName = new Map((oStu ?? []).map((s) => [s.id, s.name]))

const { data: sStu } = await sc.from('students')
  .select('id, name, grade, teacher_name, ops_student_id')
  .in('ops_student_id', extras.map((e) => e.student_id))
const byOps = new Map((sStu ?? []).map((s) => [s.ops_student_id, s]))

const ids = (sStu ?? []).map((s) => s.id)
const { data: ses } = await sc.from('class_sessions').select('*').eq('session_date', date).in('student_id', ids)
const { data: notes } = await sc.from('learning_notes').select('*').in('session_id', (ses ?? []).map((s) => s.id))
const noteBy = new Map((notes ?? []).map((n) => [n.session_id, n]))

console.log(`\n═══ ${date} 추가·대체수업 ${extras.length}건 ═══\n`)
for (const e of extras) {
  const st = byOps.get(e.student_id)
  const label = `${oName.get(e.student_id) ?? e.student_id}`
  const kind = e.class_type === 'substitute' ? '대체' : '추가'
  if (!st) { console.log(`  ${label} [${kind}] — 스터디체크 연결 없음`); continue }
  const mine = (ses ?? []).filter((s) => s.student_id === st.id)
  const written = mine.map((s) => {
    const n = noteBy.get(s.id)
    return `${s.session_type ?? '정규'}/${n?.attendance ?? '출결없음'}`
  }).join(', ') || '그날 수업 기록 없음'
  const opsWritten = [e.lesson_textbook, e.lesson_worksheet, e.lesson_note].some(Boolean)
  console.log(`  ${st.name} ${st.grade} [${kind} ${e.status}${e.target_month ? ' · ' + Number(e.target_month.slice(5, 7)) + '월분' : ''}]`)
  console.log(`      스터디체크: ${written}`)
  console.log(`      OPS 학습일지: ${opsWritten ? '있음' : '비어 있음'}`)
  for (const s of mine) {
    const n = noteBy.get(s.id)
    if (!n) continue
    console.log(`      └ 진도 ${String(s.progress_content ?? '').slice(0, 50) || '(없음)'}`)
    console.log(`        학습지 ${n.worksheet_score ?? '-'}점 · 교재 ${s.today_textbook_name ?? '-'}`)
  }
}
console.log('')
