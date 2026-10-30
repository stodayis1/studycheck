/**
 * 학습일지 화면의 **찾기 색인**이 예전 방식과 같은 답을 내는지 운영 데이터로 대조한다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/check-note-index.mjs
 *   node --import ./scripts/ts-resolve.mjs scripts/check-note-index.mjs --break   ← 일부러 망가뜨려 본다
 *
 * ★ 베껴 쓴 사본이 아니라 화면이 **실제로 쓰는 그 파일**(lib/noteIndex.ts)을 불러 쓴다.
 * ★ --break 를 주면 색인을 한 칸 어긋나게 해서, 이 검사가 그때 **실패하는지** 확인한다.
 *   (실패하지 않으면 이 검사는 아무것도 재지 않는 것이다)
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildSessionIndex, buildNoteIndex } from '../lib/noteIndex.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const BREAK = process.argv.includes('--break')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** 화면과 같은 방식으로 전부 읽는다 (PostgREST 는 한 번에 1000행만 준다). */
async function all(table, cols) {
  let out = []
  let from = 0
  for (;;) {
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out = out.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

const sessions = await all('class_sessions', 'id, student_id, session_date')
const notes = await all('learning_notes', 'id, session_id')
const todayStr = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
console.log(`수업기록 ${sessions.length}행 · 알림장 ${notes.length}행 · 오늘 ${todayStr}`)

const ix = buildSessionIndex(sessions, todayStr)
const noteIx = buildNoteIndex(notes)

if (BREAK) {
  // 일부러 망가뜨린다 — 「가장 최근 수업」을 한 칸씩 밀어 놓는다.
  const ids = [...ix.latest.keys()]
  const was = ids.map((id) => ix.latest.get(id))
  for (let i = 0; i < ids.length; i++) ix.latest.set(ids[i], was[(i + 1) % ids.length])
}

// ── 예전 방식 (고치기 전 page.tsx 에 있던 그대로) ─────────────────────────────
const oldToday = (id) => sessions.find((s) => s.student_id === id && s.session_date === todayStr)
const oldByDate = (id, d) => sessions.find((s) => s.student_id === id && s.session_date === d)
const oldPrev = (id) => sessions
  .filter((s) => s.student_id === id && s.session_date < todayStr)
  .sort((a, b) => b.session_date.localeCompare(a.session_date))[0]
const oldLatest = (id) => sessions
  .filter((s) => s.student_id === id)
  .sort((a, b) => b.session_date.localeCompare(a.session_date))[0]
const oldCount = (id) => sessions.filter((s) => s.student_id === id).length
const oldNote = (sid) => notes.find((n) => n.session_id === sid)

const studentIds = [...new Set(sessions.map((s) => s.student_id))]
const dates = [...new Set(sessions.map((s) => s.session_date))]
const bad = []
const eq = (a, b) => (a?.id ?? null) === (b?.id ?? null)

for (const id of studentIds) {
  if (!eq(ix.today.get(id), oldToday(id))) bad.push(`오늘수업 ${id}`)
  if (!eq(ix.prev.get(id), oldPrev(id))) bad.push(`이전수업 ${id}`)
  if (!eq(ix.latest.get(id), oldLatest(id))) bad.push(`최근수업 ${id}`)
  if ((ix.count.get(id) ?? 0) !== oldCount(id)) bad.push(`기록수 ${id}`)
}
for (const id of studentIds) {
  for (const d of dates) {
    if (!eq(ix.byStudentDate.get(id + '|' + d), oldByDate(id, d))) bad.push(`날짜별 ${id} ${d}`)
  }
}
for (const s of sessions) {
  if (!eq(noteIx.get(s.id), oldNote(s.id))) bad.push(`알림장 ${s.id}`)
}

const checks = studentIds.length * 4 + studentIds.length * dates.length + sessions.length
console.log(`대조 ${checks.toLocaleString()}건 (학생 ${studentIds.length}명 × 날짜 ${dates.length}일)`)
if (bad.length) {
  console.log(`✗ 어긋남 ${bad.length}건`)
  for (const b of bad.slice(0, 10)) console.log('   ·', b)
  process.exit(1)
}
console.log('✓ 예전 방식과 모두 같음')
