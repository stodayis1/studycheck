/**
 * 「학부모님께 반쪽으로 나간 브리핑」 찾기 — 보내지 않는다, 읽기만 한다.
 *
 * 왜 필요한가
 *   선생님들은 출결을 먼저 찍고 진도·과제·알림장을 나중에 채우신다. 그 사이에
 *   자동 발송 시각이 지나면 「진도 기록 없음 / 따로 낸 과제가 없어요」만 적힌 글이
 *   나가고, 뒤에 채운 내용은 영영 안 나간다(briefing_sends 가 재발송을 막는다).
 *   2026-10-22 에 이지훈·최다윤(고1) 이 그렇게 153자로 나갔다 — 지금 값으로는 519·540자.
 *
 * 어떻게 재는가
 *   briefing_sends.body_len 은 **그때 실제로 나간 글자 수**다.
 *   지금 저장된 값으로 같은 함수(lib/briefing.ts)로 다시 만들어 길이를 견준다.
 *   · 알림장은 **발송 시각 이전에 쓴 것만** 넣는다(feedbacks.created_at 이 있다).
 *   · 판(V1 지난학습지 / V2 과제성취도 / V3 데일리테스트)이 바뀌면 길이도 달라지므로
 *     세 판으로 다 만들어 보고 **가장 짧은 것**과 견준다. 그래도 실제가 더 짧으면
 *     그만큼이 그날 빠진 것이다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-audit.ts            # 10월 1일부터
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-audit.ts 2026-10-21 # 그 날짜만
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

/** ★ 수파베이스는 한 번에 1000행만 준다 — 다 읽을 때는 반드시 돌려 가며 읽는다. */
async function all(make: () => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
  }
}

const arg = process.argv[2]
const FROM = arg ?? '2026-10-01'
const TO = arg ?? '2099-12-31'

const sends = await all(() => db.from('briefing_sends')
  .select('student_id, session_date, session_id, body_len, sent_at, status')
  .gte('session_date', FROM).lte('session_date', TO).eq('status', 'sent'))
if (!sends.length) { console.log('그 기간에 나간 브리핑이 없어요.'); process.exit(0) }

const sids = [...new Set(sends.map((x) => x.session_id).filter(Boolean))]
const stids = [...new Set(sends.map((x) => x.student_id))]

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))
const sessions: any[] = []
for (const c of chunk(sids, 200)) sessions.push(...await all(() => db.from('class_sessions').select('*').in('id', c)))
const notes: any[] = []
for (const c of chunk(sids, 200)) notes.push(...await all(() => db.from('learning_notes').select('*').in('session_id', c)))
const students: any[] = []
for (const c of chunk(stids, 200)) students.push(...await all(() => db.from('students').select('id, name, grade, teacher_name').in('id', c)))
const fbs = await all(() => db.from('feedbacks').select('student_id, content, ai_message, teacher_name, created_at')
  .gte('created_at', `${FROM}T00:00:00+09:00`))
const lvs = await all(() => db.from('lesson_videos').select('youtube_id, kind'))

const sesBy = new Map(sessions.map((s) => [s.id, s]))
const noteBy = new Map(notes.map((n) => [n.session_id, n]))
const stBy = new Map(students.map((s) => [s.id, s]))
const kindOf = new Map(lvs.map((v: any) => [v.youtube_id, v.kind]))
const ytId = (u: string) => u.trim().match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)?.[1] ?? null

type Row = { date: string; name: string; grade: string; teacher: string | null
  sent: number; now: number; gap: number; missing: string[]; at: string }
const rows: Row[] = []

for (const b of sends) {
  const ses = sesBy.get(b.session_id); const st = stBy.get(b.student_id)
  if (!ses || !st) continue
  const note = noteBy.get(b.session_id) ?? null
  // 알림장은 **그 발송 시각 이전에 쓴 것만** — 뒤에 쓴 글을 넣고 견주면 전부 「빠졌다」가 된다.
  const dayFbs = fbs.filter((f) => f.student_id === b.student_id
    && f.created_at >= `${ses.session_date}T00:00:00+09:00`
    && f.created_at < `${ses.session_date}T24:00:00+09:00`
    && f.created_at <= b.sent_at)

  const urls = String(ses.video_url ?? '').split(/\r?\n/)
    .map((u: string) => u.trim()).filter((u: string) => /^https?:\/\//.test(u))
  const videos = { total: urls.length, proof: urls.filter((u) => kindOf.get(ytId(u) ?? '') === '증명').length }

  const make = (s: any, useV2: boolean, useV3: boolean) => buildBriefing({
    studentName: st.name, studentGrade: st.grade, session: s, note, feedbacks: dayFbs,
    videos: s === ses ? videos : { total: 0, proof: 0 },
    makeup: null, noNoteTemplate: true, useV2, useV3, noNoteTemplateV3: true,
  }).body.length
  // 판이 바뀌면 길이도 달라진다 — 셋 중 **가장 짧은 것**과 견준다(제일 너그러운 쪽).
  const shortest = (s: any) => Math.min(make(s, false, false), make(s, true, false), make(s, true, true))
  const now = shortest(ses)
  const sent = b.body_len ?? 0
  const gap = now - sent

  // ★ 「왜」 짧았나를 가린다.
  //   과제 칸을 비운 판으로 만든 길이가 실제와 맞으면 → 그날 **과제가 빠진 채** 나간 것.
  //   진도까지 비워야 맞으면 → 진도·과제가 다 빠진 것.
  //   둘 다 아닌데도 짧으면 → 알림장 같은 글이 **나중에 길어진** 것(나간 글 자체는 멀쩡했다).
  const noHw = { ...ses, hw_textbook_name: null, hw_textbook_page: null, hw_worksheet_range: null, video_url: null }
  const noAll = { ...noHw, progress_content: null, today_textbook_name: null, today_chapter: null }
  const near = (a: number, b2: number) => Math.abs(a - b2) <= 12
  const missing: string[] = []
  if (near(shortest(noAll), sent)) missing.push('진도·과제 둘 다 빠짐')
  else if (near(shortest(noHw), sent)) missing.push('과제 빠짐')
  else missing.push('글이 나중에 길어진 것 (나간 글은 멀쩡)')
  if (videos.total && !missing[0].startsWith('글이')) missing.push(`영상 ${videos.total}편`)

  rows.push({ date: ses.session_date, name: st.name, grade: st.grade, teacher: st.teacher_name ?? null,
    sent, now, gap, missing, at: String(b.sent_at).slice(11, 16) })
}

// 25자까지는 판 차이로도 생길 수 있는 차이라 넘긴다.
const bad = rows.filter((r) => r.gap >= 25).sort((a, b) => b.gap - a.gap)
const real = bad.filter((r) => !r.missing[0].startsWith('글이'))
console.log(`나간 브리핑 ${rows.length}건을 지금 값으로 다시 만들어 견줬어요.`)
console.log(`→ 그때 더 짧게 나간 것: ${bad.length}건`)
console.log(`   그중 **진도·과제가 실제로 빠진 것**: ${real.length}건`)
console.log(`   나머지 ${bad.length - real.length}건은 알림장 같은 글이 나중에 길어진 것 — 나간 글 자체는 멀쩡합니다.\n`)
for (const r of real) {
  console.log(`${r.date} ${r.at}  ${r.name}(${r.grade}) ${r.teacher ?? ''}`
    + `  나간 글 ${r.sent}자 → 지금 ${r.now}자  · ${r.missing.join(', ')}`)
}
const byDate = new Map<string, number>()
for (const r of real) byDate.set(r.date, (byDate.get(r.date) ?? 0) + 1)
console.log('\n진도·과제가 빠진 건 — 날짜별')
for (const [d, n] of [...byDate].sort()) console.log(`  ${d}  ${n}건`)
