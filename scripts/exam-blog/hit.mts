/**
 * 카드뉴스의 「이너프원 적중」 재료를 내 컴퓨터로 받는다 (블로그 글을 쓸 때 build.mjs 로 카드를 찍으려고).
 *
 *   npx tsx scripts/exam-blog/hit.mts <시험지 id> "<시험 폴더>"
 *
 * 스터디체크 화면과 **같은 코드**(lib/examBlogAnalysis.ts gather)로 적중률 · 매칭표(grid) · 사진으로 실을 매칭(pairs)을 구해
 * <시험 폴더>/blog/hit.json 에 쓰고, pairs 의 그림(기출 q_<번호>.png · 이너프원 e_<번호>.png)을 같은 폴더에 받는다.
 * hit.json 을 analysis.json 의 "hit" 자리에 그대로 넣으면 된다 (그림 열쇠가 이미 파일 이름으로 바뀌어 있다).
 * 사진으로 실을 매칭 = 원장님이 「블로그 사용」에 체크한 것 가운데 정도가 높은 5개 (없으면 쌍둥이 · 매우 유사에서).
 */
import fs from 'node:fs'
import path from 'node:path'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const [paperId, folder] = process.argv.slice(2)
if (!paperId || !folder) { console.error('쓰는 법: npx tsx scripts/exam-blog/hit.mts <시험지 id> "<시험 폴더>"'); process.exit(1) }
const { blogAdmin, gather, imageUrls } = await import('@/lib/examBlogAnalysis')
const supabase = blogAdmin()
const g = await gather(supabase, paperId)
if (!g) { console.error('시험지를 찾을 수 없습니다.'); process.exit(1) }
const urls = await imageUrls(supabase, g)
const dir = path.join(folder, 'blog')
fs.mkdirSync(dir, { recursive: true })
const hit = JSON.parse(JSON.stringify(g.hit))
for (const p of hit.pairs) {
  for (const side of ['exam', 'enough'] as const) {
    const key = p[side], file = key.replace(':', '_') + '.png'
    if (!urls[key]) { console.error(`그림을 받지 못했습니다: ${key}`); process.exit(1) }
    fs.writeFileSync(path.join(dir, file), Buffer.from(await (await fetch(urls[key])).arrayBuffer()))
    p[side] = file
  }
}
fs.writeFileSync(path.join(dir, 'hit.json'), JSON.stringify(hit, null, 1))
console.log(`적중률 ${hit.rate}% (${hit.total}문항 중 ${hit.hit}) · 사진으로 실을 매칭 ${hit.pairs.map((p: any) => `${p.no}번(${p.level})`).join(', ') || '없음'}`)
console.log('→', path.join(dir, 'hit.json'))
