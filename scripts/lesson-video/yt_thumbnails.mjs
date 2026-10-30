/**
 * 유튜브 썸네일 한꺼번에 바꾸기 — YouTube Data API thumbnails.set (원장님 채널 OAuth)
 *
 *   node scripts/lesson-video/yt_thumbnails.mjs "<영상 폴더>/풀이영상" [--only 01-풀이01,02-풀이03] [--dry]
 *
 * · 로그인: 「TV 및 입력 제한 기기」 OAuth 클라이언트로 기기 로그인(google.com/device 에 코드 입력).
 *   .env.local 에 YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET 가 있어야 하고,
 *   처음 로그인하면 YOUTUBE_OAUTH_REFRESH_TOKEN 을 .env.local 에 덧붙여 다음부터는 바로 돈다(.env* 는 git 에 안 올라감).
 * · 어느 영상인지: 재생목록(YOUTUBE_PLAYLIST_CM2)의 제목 「[공통수학2] 01-풀이01.」 ↔ 폴더의 01_풀이01_….jpg
 * · 할당량: thumbnails.set 은 50 단위 → 126장 = 6,300 (하루 10,000)
 */
import fs from 'node:fs'
import path from 'node:path'

const ENV = '.env.local'
for (const line of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const args = process.argv.slice(2)
const dir = args[0]
const only = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null
const dry = args.includes('--dry')
const CID = process.env.YOUTUBE_OAUTH_CLIENT_ID, SECRET = process.env.YOUTUBE_OAUTH_CLIENT_SECRET
if (!CID || !SECRET) { console.error('.env.local 에 YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET 를 넣어 주세요'); process.exit(1) }
const SCOPE = 'https://www.googleapis.com/auth/youtube'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function token() {
  if (process.env.YOUTUBE_OAUTH_REFRESH_TOKEN) {
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
      client_id: CID, client_secret: SECRET, refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN, grant_type: 'refresh_token' }) })
    const j = await r.json(); if (j.access_token) return j.access_token
    console.log('저장된 로그인이 만료됨 → 다시 로그인')
  }
  const d = await (await fetch('https://oauth2.googleapis.com/device/code', { method: 'POST',
    body: new URLSearchParams({ client_id: CID, scope: SCOPE }) })).json()
  if (!d.device_code) throw new Error('기기 로그인 시작 실패: ' + JSON.stringify(d))
  console.log(`\n▶ ${d.verification_url} 에 들어가서 코드 「${d.user_code}」 를 넣고, 채널 계정으로 허용해 주세요.\n`)
  fs.writeFileSync(path.join(process.env.TEMP || '.', 'yt_device_code.txt'), `${d.verification_url}\n${d.user_code}\n`)
  for (let t = 0; t < d.expires_in; t += d.interval) {
    await sleep(d.interval * 1000)
    const j = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({
      client_id: CID, client_secret: SECRET, device_code: d.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) })).json()
    if (j.access_token) {
      // 덧붙이면 만료된 옛 줄이 먼저 읽혀 계속 실패한다 (2026-10-29) → 그 줄을 바꿔 쓴다
      if (j.refresh_token) {
        const lines = fs.readFileSync(ENV, 'utf8').split(/\r?\n/).filter((l) => !/^\s*YOUTUBE_OAUTH_REFRESH_TOKEN\s*=/.test(l))
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
        fs.writeFileSync(ENV, [...lines, `YOUTUBE_OAUTH_REFRESH_TOKEN=${j.refresh_token}`, ''].join('\n'))
      }
      console.log('로그인 완료'); return j.access_token
    }
    if (j.error && j.error !== 'authorization_pending' && j.error !== 'slow_down') throw new Error('로그인 실패: ' + j.error)
  }
  throw new Error('로그인 시간 초과')
}

const at = await token()
const H = { Authorization: 'Bearer ' + at }
// 재생목록 → 「01-풀이01」 : videoId
const list = (process.env.YOUTUBE_PLAYLIST_CM2 || '').match(/list=([\w-]+)/)?.[1]
const idBy = {}
let tok = ''
do {
  const j = await (await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${list}${tok ? '&pageToken=' + tok : ''}`, { headers: H })).json()
  if (j.error) throw new Error('재생목록: ' + j.error.message)
  for (const it of j.items) { const m = it.snippet.title.match(/공통수학2\]\s*(\d{2}-풀이\d{2})\./); if (m) idBy[m[1]] = it.contentDetails.videoId }
  tok = j.nextPageToken
} while (tok)
// 재생목록이 일부만 돌려줄 때가 있다(2026-10-21: 125편 → 30편) → 강의 목록(lesson_videos)의 youtube_id 로 채운다
{
  const { createClient } = await import('@supabase/supabase-js')
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data } = await db.from('lesson_videos').select('order_label, youtube_id').eq('kind', '대표예제').not('youtube_id', 'is', null)
  for (const r of data || []) if (!idBy[r.order_label]) idBy[r.order_label] = r.youtube_id
}

const jobs = fs.readdirSync(dir).filter((f) => /^\d\d_풀이\d\d_.*\.jpg$/.test(f)).map((f) => {
  const [, a, b] = f.match(/^(\d\d)_풀이(\d\d)_/); return { key: `${a}-풀이${b}`, file: path.join(dir, f) }
}).filter((j) => !only || only.has(j.key))
console.log(`썸네일 ${jobs.length}장 · 재생목록에서 찾은 풀이 영상 ${Object.keys(idBy).length}편`)
let ok = 0; const miss = [], fail = []
for (const j of jobs) {
  const vid = idBy[j.key]
  if (!vid) { miss.push(j.key); continue }
  if (dry) { console.log('dry', j.key, vid); continue }
  const body = fs.readFileSync(j.file)
  let done = false, last = ''
  for (let i = 0; i < 3 && !done; i++) {
    const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${vid}&uploadType=media`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg' }, body })
    if (r.ok) { ok++; done = true; break }
    last = `${r.status} ${(await r.text()).slice(0, 160)}`
    if (r.status === 403 && last.includes('quota')) { fail.push(`${j.key} 하루 사용량 초과`); break }
    // 너무 자주 보내면 429 — 실패한 요청도 할당량(50)을 먹으니 길게 쉬고 몇 번만 다시 (2026-10-21 이걸로 하루치를 다 썼다)
    if (r.status === 429 || r.status >= 500) { await sleep(60000); if (i >= 1) break; continue }
    break
  }
  if (!done) fail.push(`${j.key} ${last}`)          // 여러 번 막힌 것도 실패로 센다
  if (fail.at(-1)?.includes('하루 사용량')) break     // 오늘은 더 해도 안 된다
  await sleep(10000)                                // 한꺼번에 몰아 보내면 막힌다 — 10초 간격
  if (ok % 20 === 0) console.log(`  ${ok}장…`)
}
console.log(`\n바꿈 ${ok}장 · 재생목록에 없음 ${miss.length}${miss.length ? ' (' + miss.join(', ') + ')' : ''} · 실패 ${fail.length}`)
fail.forEach((f) => console.log('  ✗', f))
