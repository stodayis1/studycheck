/**
 * 강의영상 목록(lesson_videos) 채우기 — 영상 폴더의 .구간.json + 유튜브 재생목록
 *
 *   node scripts/lesson-video/sync_lesson_videos.mjs "<영상 폴더>" [--grade 공통수학2] [--playlist-env YOUTUBE_PLAYLIST_CM2] [--dry] [--linked-only]
 *
 * · 영상 폴더: NN_개념_….구간.json, NN_증명K_….구간.json (lesson_video.py / proof_video.py 결과)
 *   + 하위 폴더 풀이영상/NN_풀이MM_….구간.json (필수예제 풀이 — DB kind 는 '대표예제', order_label 「01-풀이01」)
 * · 재생목록: 제목의 번호 「[공통수학2] 03-증명2.」로 order_label 을 찾아 youtube_id 를 붙인다.
 *   비공개 영상은 제목이 안 읽혀 붙지 않는다 → 「일부 공개」로 바꾸면 다음 실행에 붙는다.
 * · (grade, order_label) 기준으로 덮어쓴다. 같은 영상을 다시 올려 주소가 바뀌어도 이 스크립트만 다시 돌리면 된다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const args = process.argv.slice(2)
const dir = args[0]
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const grade = opt('--grade', '공통수학2')
const plEnv = opt('--playlist-env', 'YOUTUBE_PLAYLIST_CM2')
const dry = args.includes('--dry')
// --ids <json>: 번호 → 유튜브 id 를 파일로 받는다 (재생목록 없이 올린 영상 — yt_update_concepts.mjs 가 만든 _유튜브_주소.json)
const idsFile = opt('--ids', null)

// 1) 영상 폴더 → 행
let rows = []
const conceptCodes = {}
const files = fs.readdirSync(dir).filter(f => f.endsWith('.구간.json'))
for (const f of files.filter(f => /_개념_/.test(f))) {
  const G = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const codes = (G.examples || []).map(e => e.type_code).filter(Boolean)
  conceptCodes[G.no] = codes
  rows.push({
    grade, kind: '개념', concept_no: G.no, order_label: String(G.no).padStart(2, '0'), title: G.title,
    chapter: G.chapter, sub_chapter: G.sub_chapter, book: G.book, book_pages: G.pages,
    duration_seconds: G.duration,
    scenes: G.scenes.map(s => ({ start: s.start, end: s.end, label: s.step, kind: s.kind })),
    type_codes: codes,
  })
}
for (const f of files.filter(f => /_증명\d+_/.test(f))) {
  const G = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  rows.push({
    grade, kind: '증명', concept_no: G.concept_no, order_label: G.order, title: G.title,
    chapter: G.chapter, sub_chapter: G.sub_chapter, book: '개념+유형 개념편 ' + grade, book_pages: G.book_pages || [G.book_page],
    duration_seconds: G.duration,
    scenes: G.steps.map(s => ({ start: s.start, end: s.end, label: s.bubble, kind: '증명' })),
    type_codes: conceptCodes[G.concept_no] || [],
  })
}

const solDir = path.join(dir, '풀이영상')
if (fs.existsSync(solDir)) {
  for (const f of fs.readdirSync(solDir).filter(f => /^\d\d_풀이\d\d_.*\.구간\.json$/.test(f))) {
    const G = JSON.parse(fs.readFileSync(path.join(solDir, f), 'utf8'))
    const [, cn, sn] = f.match(/^(\d\d)_풀이(\d\d)_/)
    rows.push({
      grade, kind: '대표예제', concept_no: G.concept_no, order_label: `${cn}-풀이${sn}`, title: `${G.label} ${G.title}`,
      chapter: G.chapter, sub_chapter: G.sub_chapter, book: '개념+유형 개념편 ' + grade, book_pages: [G.book_page],
      duration_seconds: G.duration,
      scenes: G.steps.map(s => ({ start: s.start, end: s.end, label: s.bubble, kind: '풀이' })),
      type_codes: G.type_code ? [G.type_code] : [],
    })
  }
}

// 2) 유튜브 재생목록 → order_label 별 youtube_id
const ytBy = {}
const key = process.env.YOUTUBE_API_KEY
const list = (process.env[plEnv] || '').match(/list=([\w-]+)/)?.[1]
let privateCount = 0
if (key && list) {
  let tok = ''
  do {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status,contentDetails&maxResults=50&playlistId=${list}&key=${key}${tok ? '&pageToken=' + tok : ''}`)
    const j = await r.json()
    if (j.error) throw new Error('유튜브: ' + j.error.message)
    for (const it of j.items) {
      if (it.status?.privacyStatus === 'private') { privateCount++; continue }
      const m = it.snippet.title.match(new RegExp(grade + '\]\s*(\d{2}(?:-(?:증명|풀이)\d+)?)\.'))
      if (m) ytBy[m[1]] = it.contentDetails.videoId
    }
    tok = j.nextPageToken
  } while (tok)
} else if (!idsFile) {
  console.log('! 유튜브 키나 재생목록이 없어 주소는 붙이지 않음')
}
if (idsFile) Object.assign(ytBy, JSON.parse(fs.readFileSync(idsFile, 'utf8')))
for (const r of rows) r.youtube_id = ytBy[r.order_label] ?? null

rows.sort((a, b) => a.order_label.localeCompare(b.order_label))
const linked = rows.filter(r => r.youtube_id).length
console.log(`영상 ${rows.length}편 (개념 ${rows.filter(r => r.kind === '개념').length}, 증명 ${rows.filter(r => r.kind === '증명').length}, 풀이 ${rows.filter(r => r.kind === '대표예제').length}) · 유튜브 연결 ${linked}편 · 비공개라 못 읽음 ${privateCount}개`)
const stray = Object.keys(ytBy).filter(k => !rows.some(r => r.order_label === k))
if (stray.length) console.log('! 재생목록에 있지만 목록에 없는 번호:', stray.join(', '))
if (dry) { console.log(rows.slice(0, 2)); process.exit(0) }

// 3) 저장 — 유튜브 주소가 이번에 안 읽힌 편은 예전 주소를 지우지 않는다
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: old, error: e0 } = await db.from('lesson_videos').select('order_label, youtube_id').eq('grade', grade)
if (e0) throw e0
const oldBy = Object.fromEntries((old || []).map(o => [o.order_label, o.youtube_id]))
for (const r of rows) { if (!r.youtube_id && oldBy[r.order_label]) r.youtube_id = oldBy[r.order_label]; r.updated_at = new Date().toISOString() }
// --linked-only: 유튜브에 아직 안 올린 편은 넣지 않는다 — 유형 개념 API(type-concepts)는 youtube_id 가 빈 행도 영상 목록에 싣는다
if (args.includes('--linked-only')) rows = rows.filter(r => r.youtube_id)
const { error } = await db.from('lesson_videos').upsert(rows, { onConflict: 'grade,order_label' })
if (error) throw error
console.log('저장 완료')
