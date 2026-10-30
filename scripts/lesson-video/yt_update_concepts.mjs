/**
 * 새로 올린 개념·증명 영상의 제목·설명·썸네일을 맞추고 「일부 공개」로 바꾼다 (OAuth — .env.local 의 YOUTUBE_OAUTH_*)
 *
 *   node scripts/lesson-video/yt_update_concepts.mjs "<영상 폴더>" [--dry]
 *
 * · 채널 업로드 목록에서 파일 이름 그대로 올라간 영상(「01 개념 다항식 …」)을 번호로 찾는다
 * · 제목·설명: 같은 번호의 NN_개념_….유튜브.txt (concept_youtube.py), 썸네일: NN_개념_….jpg (thumbnails.py)
 * · 비공개 → 일부 공개: 학생 앱은 유튜브를 화면 안에서 트는데 비공개 영상은 재생이 안 된다 (공통수학2 도 일부 공개)
 * · 할당량: 영상마다 videos.update 50 + thumbnails.set 50 (하루 10,000)
 * · 결과: <영상 폴더>/_유튜브_주소.json (번호 → 영상 id) — sync_lesson_videos.mjs --ids 로 앱에 잇는다
 */
import fs from 'node:fs'
import path from 'node:path'

for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const E = process.env
const dir = process.argv[2], dry = process.argv.includes('--dry')
// --only 02-증명1,07-증명1 : 그 번호만 (할당량 아끼기 — 영상마다 100)
const onlyArg = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null
const tok = (await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: E.YOUTUBE_OAUTH_CLIENT_ID, client_secret: E.YOUTUBE_OAUTH_CLIENT_SECRET, refresh_token: E.YOUTUBE_OAUTH_REFRESH_TOKEN, grant_type: 'refresh_token' }) })).json()).access_token
const H = { authorization: 'Bearer ' + tok }
const api = async (url, opt = {}) => {
  const r = await fetch('https://www.googleapis.com/' + url, { ...opt, headers: { ...H, ...(opt.headers || {}) } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(j.error?.message || j).slice(0, 200)}`)
  return j
}

const up = (await api('youtube/v3/channels?part=contentDetails&mine=true')).items[0].contentDetails.relatedPlaylists.uploads
const vids = []; let pt = ''
do { const j = await api(`youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=${up}&pageToken=${pt}`); vids.push(...j.items); pt = j.nextPageToken || '' } while (pt && vids.length < 200)

const files = fs.readdirSync(dir)
const idsPath = path.join(dir, '_유튜브_주소.json')
const ids = fs.existsSync(idsPath) ? JSON.parse(fs.readFileSync(idsPath, 'utf8')) : {}
let done = 0
for (const it of vids) {
  // 파일 이름 그대로 올라간 영상: 「01 개념 …」「02 증명1 …」「02 풀이01 …」(밑줄이 띄어쓰기로 바뀐다). 풀이는 <영상 폴더>/풀이영상 을 넘긴다
  // 이미 맞춘 영상(「[공통수학1] 02-증명1. …」「[공통수학1] 01. …」)도 다시 맞출 수 있다 (--only 와 함께)
  const m = it.snippet.title.match(/^(\d\d) (개념|증명\d+|풀이\d+) /)
    || (it.snippet.title.match(/^\[[^\]]+\] (\d\d)(?:-(증명\d+|풀이\d+))?\. /) || []).slice(0, 3).map((x, i) => i === 2 && !x ? '개념' : x)
  if (!m || !m[1]) continue
  const no = m[2] === '개념' ? m[1] : `${m[1]}-${m[2]}`, pre = `${m[1]}_${m[2]}_`, id = it.snippet.resourceId.videoId
  if (onlyArg && !onlyArg.includes(no)) continue
  const txt = files.find((f) => f.startsWith(pre) && f.endsWith('.유튜브.txt'))
  const jpg = files.find((f) => f.startsWith(pre) && f.endsWith('.jpg'))
  if (!txt) { console.log(no, '! 유튜브.txt 없음'); continue }
  const t = fs.readFileSync(path.join(dir, txt), 'utf8').replace(/\r\n/g, '\n')
  const title = t.match(/제목:\n(.*)\n/)[1].trim()
  // 이미 맞춘 영상은 과정까지 같아야 고친다 — 「[공통수학2] 02-증명1.」을 공통수학1 글로 덮어쓰면 안 된다 (2026-10-28 발견)
  const course = (title.match(/^\[([^\]]+)\]/) || [])[1], cur = (it.snippet.title.match(/^\[([^\]]+)\]/) || [])[1]
  if (cur && course !== cur) continue
  const desc = t.split('설명:\n')[1].trim().replace(/</g, '＜').replace(/>/g, '＞')
  if (dry) { console.log('dry', no, id, title); continue }
  const v = (await api(`youtube/v3/videos?part=snippet,status&id=${id}`)).items[0]
  await api('youtube/v3/videos?part=snippet,status', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
    id, snippet: { title, description: desc, categoryId: v.snippet.categoryId, defaultLanguage: 'ko', tags: ['수학의지혜', '수지쌤', (title.match(/^\[(중\d)/) || [])[1] ? title.match(/^\[(중\d)/)[1] + '수학' : '고1수학'] },
    status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: v.status.madeForKids ?? false, embeddable: true } }) })
  if (jpg) await api(`upload/youtube/v3/thumbnails/set?videoId=${id}&uploadType=media`, { method: 'POST', headers: { 'content-type': 'image/jpeg' }, body: fs.readFileSync(path.join(dir, jpg)) })
  ids[no] = id; fs.writeFileSync(idsPath, JSON.stringify(ids, null, 1))
  console.log(no, id, '제목·설명' + (jpg ? '·썸네일' : '') + ' · 일부 공개'); done++
  await new Promise((s) => setTimeout(s, 1500))
}
console.log('끝', done, '편')
