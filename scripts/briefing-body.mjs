/**
 * 그 학생에게 **실제로 나간 글**을 그대로 다시 찍어 본다. 보내지 않는다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-body.mjs 임지훈 2026-10-14
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing } from '../lib/briefing.ts'
import { fetchOpsMakeups } from '../lib/opsMakeups.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const name = process.argv[2]
const date = process.argv[3] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: stu } = await db.from('students').select('*').eq('name', name).limit(1)
const st = stu?.[0]
if (!st) { console.log('학생을 못 찾았어요:', name); process.exit(0) }

const { data: ses } = await db.from('class_sessions').select('*').eq('student_id', st.id).eq('session_date', date)
if (!ses?.length) { console.log('그날 수업 기록이 없어요.'); process.exit(0) }
const { data: notes } = await db.from('learning_notes').select('*').eq('session_id', ses[0].id)
const { data: fbs } = await db.from('feedbacks').select('*').eq('student_id', st.id)
  .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`)

let makeup = null
if (st.ops_student_id) {
  const m = await fetchOpsMakeups([st.ops_student_id], date)
  makeup = (m.get(st.ops_student_id) ?? []).find((x) => x.absentDate === date) ?? null
}

const brief = buildBriefing({
  studentName: st.name, session: ses[0], note: notes?.[0] ?? null,
  feedbacks: fbs ?? [], makeup, noNoteTemplate: !!process.env.ALIGO_BRIEFING_TPL_CODE_NONOTE,
})

console.log(`\n═══ ${st.name} ${st.grade} · ${date} · 출결 ${notes?.[0]?.attendance ?? '(미입력)'} ═══\n`)
console.log(brief.body)
console.log(`\n[${brief.bodyLen}자 · 판 ${brief.template}]`)
if (makeup) console.log(`보강: ${JSON.stringify(makeup)}`)
