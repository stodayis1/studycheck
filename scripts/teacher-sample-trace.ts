/**
 * 「담당강사에게 샘플」이 **누구에게 무엇을 보냈는지** 다시 계산해 본다.
 *
 * 왜 필요한가 — 샘플 발송은 일부러 briefing_sends 에 기록을 남기지 않는다(그래야 그날
 * 진짜 학부모 발송이 「이미 보냄」으로 막히지 않는다). 그래서 나중에 「누구에게 갔지?」를
 * 확인할 길이 없다. 고르는 규칙이 정해져 있으므로 **같은 함수로 다시 계산**하면 된다.
 *
 * 규칙(app/api/kakao-briefing/route.ts 의 runTeacherSample 과 같다)
 *   그날 보낼 수 있는 학생을 모두 만들고 → 담당 강사별로 묶어 → **본문이 가장 짧은 한 명**을
 *   골라 그 선생님 번호로 보낸다.
 *
 *   node scripts/teacher-sample-trace.ts 2026-10-07
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing } from '../lib/briefing.ts'
import { fetchOpsMakeups } from '../lib/opsMakeups.ts'
import { fetchOpsTeacherPhones } from '../lib/opsTeachers.ts'
import { isExamAbsence } from '../lib/attendance.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000 - 86400_000).toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const { data: sessions } = await db.from('class_sessions').select('*').eq('session_date', date)
if (!sessions?.length) { console.log(`${date} 수업이 없습니다.`); process.exit(0) }

const studentIds = [...new Set(sessions.map((s: any) => s.student_id))]
const [{ data: students }, { data: notes }, { data: fbs }] = await Promise.all([
  db.from('students').select('*').in('id', studentIds),
  db.from('learning_notes').select('*').in('session_id', sessions.map((s: any) => s.id)),
  db.from('feedbacks').select('*').in('student_id', studentIds)
    .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
])

const studentBy = new Map((students ?? []).map((s: any) => [s.id, s]))
const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
const opsIds = (students ?? []).map((s: any) => s.ops_student_id).filter(Boolean)
const makeupsBy = await fetchOpsMakeups(opsIds, date)

type Row = { teacher: string; name: string; grade: string; bodyLen: number; body: string }
const rows: Row[] = []
for (const ses of sessions as any[]) {
  const student: any = studentBy.get(ses.student_id)
  if (!student) continue
  const note: any = noteBy.get(ses.id)
  if (!note || !note.attendance) continue
  if (isExamAbsence(note.attendance)) continue
  if (!student.parent_phone) continue

  const makeup = (student.ops_student_id ? makeupsBy.get(student.ops_student_id) ?? [] : [])
    .find((m: any) => m.absentDate === date) ?? null
  const brief = buildBriefing({
    studentName: student.name, session: ses, note,
    feedbacks: (fbs ?? []).filter((f: any) => f.student_id === student.id),
    makeup,
    noNoteTemplate: !!process.env.ALIGO_BRIEFING_TPL_CODE_NONOTE,
  })
  const teacher = String(student.teacher_name ?? '').split(/[,，、]/)[0].trim()
  if (!teacher) continue
  // 결석한 날은 뺀다 — 선생님이 쓴 글이 아니라 자동 문구라서(원장님 2026-10-12)
  if (note.attendance === '결석') continue
  rows.push({ teacher, name: student.name, grade: student.grade, bodyLen: brief.bodyLen, body: brief.body })
}

const phones = await fetchOpsTeacherPhones()
const pick = new Map<string, Row>()
for (const r of rows) {
  const cur = pick.get(r.teacher)
  if (!cur || r.bodyLen < cur.bodyLen) pick.set(r.teacher, r)
}

console.log(`\n${date} 「담당강사에게 샘플」로 나간 것 (다시 계산)\n`)
for (const [teacher, r] of [...pick].sort((a, b) => a[0].localeCompare(b[0], 'ko'))) {
  const phone = phones.get(teacher)
  const masked = phone ? phone.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2') : '번호 없음 → 안 감'
  const mine = rows.filter((x) => x.teacher === teacher).length
  console.log(`${teacher} 선생님 (${masked})`)
  console.log(`  → ${r.name} ${r.grade} · 본문 ${r.bodyLen}자   [그날 담당 ${mine}명 중 가장 짧은 글]`)
  for (const line of r.body.split(/\r?\n/)) console.log('     | ' + line)
}
const noPhone = [...pick.keys()].filter((t) => !phones.get(t))
if (noPhone.length) console.log(`\n번호가 없어 못 간 선생님: ${noPhone.join(', ')}`)
console.log(`\n대상 학생 ${rows.length}명 · 선생님 ${pick.size}분`)
