/**
 * 시험분석 블로그용 카드 그림 만들기 (수학의지혜 양식) — 내 컴퓨터에서 Edge 로 찍는 판.
 * 같은 카드를 스터디체크 화면(「블로그」 탭 → 카드뉴스 만들기)에서도 만든다. 양식은 lib/examBlogCards.mjs 한 곳에 있다.
 *
 *   node scripts/exam-blog/build.mjs "<시험 폴더>/blog/analysis.json"
 *
 * analysis.json 하나로 카드 그림을 만든다 (가로 1080, 네이버 블로그 본문용):
 *   00_thumb.png          대표 썸네일 (1080×1080)
 *   01_summary.png        시험분석 요약 — 문항 수 · 난이도 · 변별문항 · 적중률 / 단원 비중 / 출제 경향 / 다음 시험 전략
 *   02_killers.png        변별력 문항 카드
 *   03_deep_<번호>.png    변별문항 심층분석 (문제 · 풀이 4단계 · 왜 어려웠나 · 선생님 한마디)
 *   04_hit.png            이너프원 적중 — 큰 적중률 + 매칭표 (analysis.hit.grid 가 있을 때)
 *   05_pairs_<n>.png      적중 문항 사진 비교 (analysis.hit.pairs, 5문항까지)
 *   06_review.png         이번 시험 총평
 * 글과 숫자는 전부 analysis.json 에서 온다 — 여기서 지어내지 않는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { buildCards, cardDocument } from '../../lib/examBlogCards.mjs'

const file = process.argv[2]
if (!file) { console.error('쓰는 법: node scripts/exam-blog/build.mjs <analysis.json>'); process.exit(1) }
const dir = path.dirname(path.resolve(file))
const A = JSON.parse(fs.readFileSync(file, 'utf8'))
const here = path.dirname(fileURLToPath(import.meta.url))
const asset = (p) => pathToFileURL(path.join(here, '..', '..', 'public', 'exam-blog', p)).href
const img = (p) => pathToFileURL(path.resolve(dir, p)).href
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))
if (!EDGE) { console.error('Edge 또는 Chrome 을 찾지 못했습니다.'); process.exit(1) }
const SHOT = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=9000']

const tmp = path.join(dir, '_html')
fs.mkdirSync(tmp, { recursive: true })
for (const card of buildCards(A, { asset, img })) {
  const html = path.join(tmp, `${card.name}.html`)
  fs.writeFileSync(html, cardDocument(card))
  const out = path.join(dir, `${card.name}.png`)
  execFileSync(EDGE, [...SHOT, `--window-size=${card.w},${card.h}`, `--screenshot=${out}`, pathToFileURL(html).href], { stdio: 'ignore' })
  console.log('만듦:', out)
}
