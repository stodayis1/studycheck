/**
 * 카톡 브리핑을 **실제 데이터로** 미리 본다 — 보내지 않고 링크만 만든다.
 *
 * 발송 라우트와 같은 함수(lib/briefing.ts · lib/briefingSnapshots.ts)를 쓴다.
 * 그래서 여기서 본 글과 화면이 실제로 학부모에게 가는 것과 같다.
 *
 * 쓰는 법
 *   node scripts/briefing-preview.ts                 # 어제 수업 중 아무 한 명
 *   node scripts/briefing-preview.ts 2026-10-07      # 그 날짜
 *   node scripts/briefing-preview.ts 2026-10-07 윤수지
 *
 * 만들어진 링크는 7일 뒤 닫힌다(실제 발송분은 90일).
 */
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing } from '../lib/briefing.ts'
import { snapshots } from '../lib/briefingSnapshots.ts'
import { fetchOpsMakeups } from '../lib/opsMakeups.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const APP_URL = process.env.PREVIEW_APP_URL ?? 'https://studycheck-five.vercel.app'

const argDate = process.argv[2]
const argName = process.argv[3]
const date = argDate ?? new Date(Date.now() + 9 * 3600_000 - 86400_000).toISOString().slice(0, 10)

// 그날 수업 중, 알림장이 있고 과제도 있는 건을 고른다 — 빈 칸만 보면 미리보기가 쓸모없다.
let q = db.from('class_sessions').select('*').eq('session_date', date)
const { data: sessions } = await q
if (!sessions?.length) {
  console.error(`✗ ${date} 에 수업 기록이 없습니다.`)
  process.exit(1)
}
const { data: students } = await db.from('students').select('id, name, grade, parent_phone, ops_student_id')
  .in('id', [...new Set(sessions.map((s: any) => s.student_id))])
const { data: notes } = await db.from('learning_notes').select('*').in('session_id', sessions.map((s: any) => s.id))
const { data: fbs } = await db.from('feedbacks').select('*')
  .in('student_id', sessions.map((s: any) => s.student_id))
  .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`)

const nameBy = new Map((students ?? []).map((s: any) => [s.id, s]))
const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))

const candidates = sessions
  .filter((s: any) => noteBy.get(s.id)?.attendance)
  .filter((s: any) => !argName || nameBy.get(s.student_id)?.name === argName)
  // 알림장이 있는 건을 먼저 (볼 것이 많은 쪽)
  .sort((a: any, b: any) => {
    const n = (x: any) => (fbs ?? []).filter((f: any) => f.student_id === x.student_id).length
    return n(b) - n(a)
  })
if (!candidates.length) {
  console.error(`✗ ${date}${argName ? ' / ' + argName : ''} 에 기록이 끝난 수업이 없습니다.`)
  process.exit(1)
}

const ses = candidates[0]
const student: any = nameBy.get(ses.student_id)
const note: any = noteBy.get(ses.id)
const dayFbs = (fbs ?? []).filter((f: any) => f.student_id === student.id)

const mks = student.ops_student_id
  ? (await fetchOpsMakeups([student.ops_student_id], date)).get(student.ops_student_id) ?? []
  : []
const brief = buildBriefing({
  studentName: student.name, session: ses, note, feedbacks: dayFbs,
  makeup: mks.find((m) => m.absentDate === date) ?? null,
})
const snaps = await snapshots(db, student, date, ses, note, dayFbs)

const mk = async (report_type: string, data: any) => {
  const token = randomBytes(16).toString('hex')
  const { error } = await db.from('report_links').insert({
    student_id: student.id, report_type, period_label: `${date} (미리보기)`,
    period_start: date, period_end: date, data, token,
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
  })
  if (error) throw new Error(`${report_type}: ${error.message}`)
  return `${APP_URL}/report/${token}`
}

const [score, att, notice] = await Promise.all([
  mk('worksheet_scores', snaps.worksheetSnapshot),
  mk('attendance_rate', snaps.attendanceSnapshot),
  mk('daily_notice', snaps.noticeSnapshot),
])

console.log(`${student.name} (${student.grade}) · ${date}`)
console.log('─'.repeat(54))
console.log(brief.body)
console.log('─'.repeat(54))
console.log(`본문 ${brief.bodyLen}자 / 1000자 · 알림장 사진 ${brief.photoCount}장\n`)
console.log('① 레벨학습지 점수 현황   ' + score)
console.log(`   (받은 학습지 ${snaps.worksheetSnapshot.count}장 · 평균 ${snaps.worksheetSnapshot.avgScore ?? '-'}점)`)
console.log('② 출결·과제달성률 현황   ' + att)
console.log(`   (수업 ${snaps.attendanceSnapshot.total}회 · 정시율 ${snaps.attendanceSnapshot.onTimeRate ?? '-'}% · 평균 달성률 ${snaps.attendanceSnapshot.avgPct ?? '-'}%)`)
console.log('③ 알림장·사진 보기       ' + notice)
console.log(`   (알림장 ${snaps.noticeSnapshot.notices.length}건 · 사진 ${snaps.noticeSnapshot.notices.reduce((a: number, n: any) => a + n.images.length, 0)}장)`)
console.log('\n이 미리보기 링크는 7일 뒤 닫힙니다.')
