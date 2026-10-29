/**
 * 유튜브에 올린 영상 ↔ 영상 폴더 이중 대조 (읽기만, 할당량 몇 점) — yt_update_concepts.mjs 돌리기 전에
 *
 *   node scripts/lesson-video/yt_crosscheck.mjs "<영상 폴더>"            (개념·증명: 학년 폴더 / 풀이: <학년>/풀이영상)
 *
 * 파일 이름 그대로 올라간 영상(「01 개념 …」「02 증명1 …」「02 풀이01 …」)마다
 *  ① 제목 = 이 폴더의 mp4 파일 이름 (번호가 같은 다른 학년 영상은 「안 맞는 영상」으로 따로 센다)
 *  ② 유튜브가 받은 원본 크기(fileDetails.fileSize) = 폴더 mp4 크기, _옛판 과 같으면 ★
 *     (_옛판 은 길이까지 같아서 길이로는 못 가른다 — 2026-10-29)
 *  ③ 길이 = .구간.json duration (±2초)   ④ 같은 번호 중복 업로드   ⑤ .유튜브.txt 제목 번호·주제, .jpg 이름
 *  ⑥ 폴더에 있는데 아직 안 올라온 번호
 */
import fs from 'node:fs'
import path from 'node:path'

for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const E = process.env, dir = process.argv[2]
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.YOUTUBE_OAUTH_CLIENT_ID, client_secret: E.YOUTUBE_OAUTH_CLIENT_SECRET, refresh_token: E.YOUTUBE_OAUTH_REFRESH_TOKEN, grant_type: 'refresh_token' }) })).json())
if (!tok.access_token) { console.log('유튜브 로그인 실패:', tok.error, tok.error_description, '→ yt_thumbnails.mjs 기기 로그인으로 다시'); process.exit(1) }
const get = async (u) => (await fetch('https://www.googleapis.com/youtube/v3/' + u, { headers: { authorization: 'Bearer ' + tok.access_token } })).json()

const up = (await get('channels?part=contentDetails&mine=true')).items[0].contentDetails.relatedPlaylists.uploads
let pt = '', all = []
do { const j = await get(`playlistItems?part=snippet&maxResults=50&playlistId=${up}&pageToken=${pt}`); all.push(...j.items); pt = j.nextPageToken || '' } while (pt)
const RAW = /^(\d\d) (개념|증명\d+|풀이\d+) /
const raw = all.filter((it) => RAW.test(it.snippet.title))
const det = {}
for (let i = 0; i < raw.length; i += 50)
  for (const v of (await get(`videos?part=contentDetails,status,fileDetails&id=${raw.slice(i, i + 50).map((x) => x.snippet.resourceId.videoId).join(',')}`)).items) det[v.id] = v

const sec = (d) => { const m = (d || '').match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/); return m ? (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0) : 0 }
// 유튜브는 파일 이름의 _ 를 띄어쓰기로, ( ) - 를 빼거나 띄어쓰기로 바꾼다
const norm = (s) => s.normalize('NFC').replace(/\.mp4$/i, '').replace(/[()\-]/g, ' ').replace(/[_\s]+/g, ' ').trim()
const files = fs.readdirSync(dir), oldDir = path.join(dir, '_옛판'), old = fs.existsSync(oldDir) ? fs.readdirSync(oldDir) : []
const seen = {}, ok = [], bad = [], other = []
for (const it of raw) {
  const t = it.snippet.title, id = it.snippet.resourceId.videoId, [, a, b] = t.match(RAW)
  const no = b === '개념' ? a : `${a}-${b}`, pre = `${a}_${b}_`
  const mp4 = files.find((f) => f.startsWith(pre) && f.endsWith('.mp4'))
  if (!mp4 || norm(t) !== norm(mp4)) { other.push(`${id} ${t.slice(0, 40)}`); continue }
  ;(seen[no] ||= []).push(id)
  const errs = [], v = det[id], base = mp4.slice(0, -4)
  const txt = base + '.유튜브.txt', gj = base + '.구간.json'
  if (!files.includes(txt) || !files.includes(gj)) errs.push('.유튜브.txt/.구간.json 없음')
  else {
    const G = JSON.parse(fs.readFileSync(path.join(dir, gj), 'utf8'))
    const size = +v?.fileDetails?.fileSize, mine = fs.statSync(path.join(dir, mp4)).size
    const oldSize = old.includes(mp4) ? fs.statSync(path.join(oldDir, mp4)).size : -1
    if (!size) errs.push('유튜브 원본 크기 못 읽음')
    else if (size === oldSize) errs.push('★ _옛판 영상이 올라감')
    else if (size !== mine) errs.push(`크기 다름 (유튜브 ${size} · 파일 ${mine})`)
    const ys = sec(v?.contentDetails?.duration)
    if (ys && Math.abs(ys - G.duration) > 2) errs.push(`길이 다름 (유튜브 ${ys}s · 파일 ${G.duration.toFixed(1)}s)`)
    const title = fs.readFileSync(path.join(dir, txt), 'utf8').replace(/\r\n/g, '\n').match(/제목:\n(.*)\n/)[1]
    if (!new RegExp(`^\\[[^\\]]+\\] ${no}\\. `).test(title) || !title.includes(G.title)) errs.push('.유튜브.txt 제목 번호·주제 다름: ' + title)
    if (!files.includes(base + '.jpg')) errs.push('썸네일 없음')
  }
  ;(errs.length ? bad : ok).push(`${no}\t${id}\t${v?.status?.uploadStatus}` + (errs.length ? '\t' + errs.join(' / ') : ''))
}
for (const [no, v] of Object.entries(seen)) if (v.length > 1) bad.push(`${no}\t중복 업로드 ${v.join(' · ')} — 하나는 스튜디오에서 지운다`)
const want = files.filter((f) => RAW.test(f.replace(/_/g, ' ')) && f.endsWith('.mp4')).map((f) => { const [, a, b] = f.replace(/_/g, ' ').match(RAW); return b === '개념' ? a : `${a}-${b}` })
console.log(`${path.basename(dir)}: 폴더 ${want.length}편 · 올라온 번호 ${Object.keys(seen).length} · 통과 ${ok.length} · 문제 ${bad.length}`)
bad.forEach((r) => console.log('  ✗', r))
console.log('아직 안 올라온 번호:', want.filter((n) => !seen[n]).join(', ') || '없음')
if (other.length) console.log(`이 폴더 파일과 안 맞는 영상 ${other.length}개 (다른 학년·과정):`, other.slice(0, 5).join(' | '))
