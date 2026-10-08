/**
 * 카톡 브리핑 본문이 **실데이터 전량**에서 알림톡 1,000자 한도를 넘지 않는지 확인한다.
 *
 * 왜 필요한가
 *   평소 본문은 250자쯤이라 눈으로 보면 늘 멀쩡하다. 그런데 긴 알림장을 쓴 날
 *   그 학생 한 명만 조용히 발송 실패한다 — 그걸 알아차릴 방법이 없다.
 *   그래서 사람 눈이 아니라 숫자로 확인한다.
 *
 * 쓰는 법
 *   node scripts/briefing-check.ts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing, BODY_LIMIT, BODY_BUDGET, BRIEFING_TEMPLATE } from '../lib/briefing.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })

/** Supabase 는 한 번에 1000행만 준다. ★ order 없이 페이지를 돌리면 행이 겹치거나 사라진다. */
async function all(table: string, cols: string) {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

const [students, sessions, notes, feedbacks] = await Promise.all([
  all('students', 'id, name'),
  all('class_sessions', 'id, student_id, session_date, progress_content, today_textbook_name, today_chapter, daily_test_unit, daily_test_score, hw_textbook_name, hw_textbook_page, hw_worksheet_range'),
  all('learning_notes', 'id, session_id, attendance, worksheet_submitted, worksheet_score, worksheet_unit, worksheet_level, textbook_submitted, workbook_done, achievement_pct, memo, makeup_note'),
  all('feedbacks', 'id, student_id, content, ai_message, teacher_name, created_at'),
])

const nameOf = new Map(students.map((s: any) => [s.id, s.name]))
const noteOf = new Map(notes.map((n: any) => [n.session_id, n]))
const fbKey = (studentId: string, date: string) => `${studentId}|${date}`
const fbOf = new Map<string, any[]>()
for (const f of feedbacks) {
  // 기기(한국) 시각 기준 날짜로 묶는다 — 발송 서버도 같은 기준을 쓴다.
  const kst = new Date(new Date(f.created_at).getTime() + 9 * 3600_000)
  const d = kst.toISOString().slice(0, 10)
  const k = fbKey(f.student_id, d)
  if (!fbOf.has(k)) fbOf.set(k, [])
  fbOf.get(k)!.push(f)
}

let over = 0
let overBudget = 0
let worst = { len: 0, body: '', who: '', date: '' }
const lens: number[] = []

for (const ses of sessions) {
  const r = buildBriefing({
    studentName: nameOf.get(ses.student_id) ?? '학생',
    session: ses,
    note: noteOf.get(ses.id) ?? null,
    feedbacks: fbOf.get(fbKey(ses.student_id, ses.session_date)) ?? [],
  })
  lens.push(r.bodyLen)
  if (r.overLimit) over++
  if (r.bodyLen > BODY_BUDGET) overBudget++
  if (r.bodyLen > worst.len) {
    worst = { len: r.bodyLen, body: r.body, who: nameOf.get(ses.student_id) ?? '?', date: ses.session_date }
  }
}

lens.sort((a, b) => a - b)
const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))]
console.log(`골격만: ${BRIEFING_TEMPLATE.length}자 (변수 자리 포함)`)
console.log(`수업 ${sessions.length.toLocaleString()}건 검사`)
console.log(`  본문 길이  중간값 ${at(0.5)}자 · 90% ${at(0.9)}자 · 99% ${at(0.99)}자 · 최대 ${worst.len}자`)
console.log(`  ${BODY_BUDGET}자(안전선) 초과 : ${overBudget}건`)
console.log(`  ${BODY_LIMIT}자(카카오 한도) 초과 : ${over}건  ${over === 0 ? '✓' : '✗ 이 건들은 발송이 거부됩니다'}`)
console.log(`\n가장 긴 본문 — ${worst.who} ${worst.date} (${worst.len}자)`)
console.log('─'.repeat(50))
console.log(worst.body)
console.log('─'.repeat(50))

if (over > 0) process.exitCode = 1
