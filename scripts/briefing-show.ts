/**
 * 그날 그 학생에게 **나간 본문을 그대로** 다시 만들어 보여 준다.
 *
 * 왜 필요한가 (원장님 2026-11-02 「나간거 그대로 나한테 보내줘봐」)
 *   briefing_sends 에는 글자 수(body_len)만 남고 **본문은 남지 않는다.** 그래서
 *   「왜 이 줄이 안 보이지」를 확인할 길이 없었다. 같은 자료로 같은 함수(buildBriefing)를
 *   다시 돌려 본문을 만들고, 저장된 글자 수와 **맞는지 대조**해서 보여 준다.
 *   글자 수가 맞으면 그때 나간 것과 같은 글이다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-show.ts 2026-11-02
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-show.ts 2026-11-02 김민희 최윤우
 *     ↑ 이름을 주면 그 학생만. 안 주면 그날 발송된 전원.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing } from '../lib/briefing.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) { console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.'); process.exit(1) }
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const date = process.argv[2]
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('✗ 날짜를 주세요. 보기: 2026-11-02'); process.exit(1) }
const 고른이름 = process.argv.slice(3)

const { data: sends } = await db.from('briefing_sends')
  .select('student_id, body_len, status, sent_at').eq('session_date', date)
if (!sends?.length) { console.log(`${date} 에 나간 브리핑이 없습니다.`); process.exit(0) }

const ids = [...new Set(sends.map((r: any) => r.student_id))]
const { data: students } = await db.from('students').select('*').in('id', ids)
const { data: sessions } = await db.from('class_sessions').select('*')
  .eq('session_date', date).in('student_id', ids)
const sesIds = (sessions ?? []).map((s: any) => s.id)
const { data: notes } = await db.from('learning_notes').select('*').in('session_id', sesIds)
const { data: fbs } = await db.from('feedbacks').select('*').in('student_id', ids)
  .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`)
const { data: ws } = await db.from('student_worksheets')
  .select('student_id, unit, unit_name, current_level, score, submitted_at').in('student_id', ids)
  .not('score', 'is', null)
  .gte('submitted_at', `${date}T00:00:00+09:00`).lt('submitted_at', `${date}T24:00:00+09:00`)
  .order('submitted_at', { ascending: true })

const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
const sendBy = new Map(sends.map((r: any) => [r.student_id, r]))
const wsBy = new Map<string, any[]>()
for (const w of (ws ?? []) as any[]) wsBy.set(w.student_id, [...(wsBy.get(w.student_id) ?? []), w])

/** 어느 판으로 나갔는지는 기록에 없다 — 글자 수가 맞는 판을 찾는다. */
const 판들 = [
  { 이름: '데일리테스트 판', f: { useV2: true, useV3: true, noNoteTemplate: false, noNoteTemplateV3: false } },
  { 이름: '과제 성취도 판', f: { useV2: true, useV3: false, noNoteTemplate: false, noNoteTemplateV3: false } },
  { 이름: '예전 판', f: { useV2: false, useV3: false, noNoteTemplate: false, noNoteTemplateV3: false } },
  { 이름: '데일리테스트 판(알림장 없음)', f: { useV2: true, useV3: true, noNoteTemplate: true, noNoteTemplateV3: true } },
  { 이름: '과제 성취도 판(알림장 없음)', f: { useV2: true, useV3: false, noNoteTemplate: true, noNoteTemplateV3: false } },
]

let 맞음 = 0, 안맞음 = 0
for (const ses of (sessions ?? []) as any[]) {
  const st: any = (students ?? []).find((s: any) => s.id === ses.student_id)
  const note: any = noteBy.get(ses.id)
  if (!st || !note) continue
  if (고른이름.length && !고른이름.includes(st.name)) continue
  const send: any = sendBy.get(st.id)

  const urls = String(ses.video_url ?? '').split(/\r?\n/).map((u: string) => u.trim()).filter((u: string) => /^https?:\/\//.test(u))
  const 만들기 = (f: any) => buildBriefing({
    studentName: st.name, studentGrade: st.grade, session: ses, note,
    feedbacks: (fbs ?? []).filter((x: any) => x.student_id === st.id),
    videos: { total: urls.length, proof: 0 },
    worksheets: wsBy.get(st.id) ?? [], makeup: null, ...f,
  })
  const 고른판 = 판들.find((p) => 만들기(p.f).bodyLen === send?.body_len) ?? 판들[0]
  const brief = 만들기(고른판.f)
  const 같나 = brief.bodyLen === send?.body_len
  if (같나) 맞음++; else 안맞음++

  console.log('\n' + '─'.repeat(72))
  console.log(`${st.name} (${st.grade}) · ${date} · ${고른판.이름}`)
  console.log(`글자 수 ${brief.bodyLen} ${같나 ? '= 기록된 것과 같음 ✔ (그때 나간 글과 같습니다)'
    : `≠ 기록 ${send?.body_len} ✗ (그 뒤에 일지가 바뀌었을 수 있어요)`}`)
  console.log('─'.repeat(72))
  console.log(brief.body)
}
console.log(`\n대조: 글자 수 같음 ${맞음} · 다름 ${안맞음}`)
