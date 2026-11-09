/**
 * 기출 시험지 인쇄 — **쪽이 넘치지 않는지 숫자로** 잰다 (눈으로 보지 않는다).
 *   · 시험지: 한 단의 높이 합이 언제나 BODY_MM 과 같아야 한다
 *   · 빠른 정답: 줄 높이 × 줄 수가 BODY_MM 을 넘으면 A4 밖으로 밀려 **잘린다**
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-answerkey-check.ts [다른lib경로]
 *   (일부러 망가뜨린 사본을 넘기면 **실패해야** 검사다)
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const libPath = path.resolve(process.argv[2] ?? 'lib/examPrintLayout.ts')
const L: any = await import(pathToFileURL(libPath).href)

let pass = 0, all = 0
function ok(말: string, 참: boolean, 덧 = '') {
  all++; if (참) pass++
  console.log(`${참 ? '✓' : '✗'} ${말}${덧 ? ' — ' + 덧 : ''}`)
}

// ── 빠른 정답: A4 한 쪽을 넘지 않는다 ───────────────────────────────────────
ok('한 쪽 줄 수 × 줄 높이가 본문 높이를 안 넘는다',
  L.AK_ROWS * L.AK_ROW_MM <= L.BODY_MM, `${L.AK_ROWS}줄 × ${L.AK_ROW_MM}mm = ${L.AK_ROWS * L.AK_ROW_MM}mm ≤ ${L.BODY_MM}mm`)
ok('한 줄이라도 들어간다', L.AK_ROWS >= 1)
ok('한 쪽 칸 수 = 단 수 × 줄 수', L.AK_PER_PAGE === L.AK_COLS * L.AK_ROWS, `${L.AK_PER_PAGE}칸`)
ok('정답 그림이 줄 높이 안에 들어간다', L.AK_IMG_MM > 0 && L.AK_IMG_MM < L.AK_ROW_MM, `그림 ${L.AK_IMG_MM}mm < 줄 ${L.AK_ROW_MM}mm`)
{
  // 한 칸의 가로 폭 — 「△ABD ≡ △ACE」 같은 정답 그림이 들어갈 만해야 한다
  const 본문폭 = L.PAGE_W - L.PAD_X * 2
  const 칸폭 = (본문폭 - 4 * (L.AK_COLS - 1)) / L.AK_COLS
  ok('한 칸이 30mm 보다 넓다', 칸폭 >= 30, `${칸폭.toFixed(1)}mm`)
}

// ── 쪽 나누기 ───────────────────────────────────────────────────────────────
{
  const n = (k: number) => Array.from({ length: k }, (_, i) => String(i + 1))
  ok('문항이 없어도 빈 쪽 하나는 만든다', L.answerPages([]).length === 1)
  ok('20문항이면 한 쪽', L.answerPages(n(20)).length === 1)
  ok('한 쪽 칸 수만큼이면 한 쪽', L.answerPages(n(L.AK_PER_PAGE)).length === 1)
  ok('한 칸이라도 넘치면 두 쪽', L.answerPages(n(L.AK_PER_PAGE + 1)).length === 2)
  const pages = L.answerPages(n(L.AK_PER_PAGE + 5))
  ok('어느 쪽도 한 쪽 칸 수를 안 넘는다', pages.every((p: string[]) => p.length <= L.AK_PER_PAGE))
  ok('문항을 하나도 잃지 않고 순서도 그대로', pages.flat().join(',') === n(L.AK_PER_PAGE + 5).join(','))
}

// ── 그림 정답은 두 칸을 쓴다 (한 칸이면 글씨가 너무 작다) ──────────────────
{
  const img = (k: number) => Array.from({ length: k }, (_, i) => ({ no: String(i + 1), answerUrl: 'x' }))
  const txt = (k: number) => Array.from({ length: k }, (_, i) => ({ no: 'T' + (i + 1), answerUrl: null }))
  const 무게 = (ps: any[][]) => ps.map((pg) => pg.reduce((a, x) => a + L.akWeight(x), 0))
  ok('그림 정답은 두 칸으로 센다', L.akWeight({ answerUrl: 'x' }) === 2 && L.akWeight({ answerUrl: null }) === 1)
  ok('그림 정답만이면 한 쪽에 절반만 들어간다',
    L.answerPages(img(L.AK_PER_PAGE / 2), L.akWeight).length === 1 && L.answerPages(img(L.AK_PER_PAGE / 2 + 1), L.akWeight).length === 2)
  const mixed = [...txt(30), ...img(6), ...txt(10)]
  const pages = L.answerPages(mixed, L.akWeight)
  ok('글자·그림이 섞여도 어느 쪽도 칸 수를 안 넘는다', 무게(pages).every((w: number) => w <= L.AK_PER_PAGE), 무게(pages).join(' · ') + ' 칸')
  ok('섞여도 문항을 하나도 잃지 않는다', pages.flat().length === mixed.length)
}

// ── 시험지 쪽: 한 단의 높이 합이 본문 높이와 같다 (전부터 있던 규칙) ────────
{
  const items = Array.from({ length: 13 }, (_, i) => ({ no: String(i + 1), url: '', ...L.sizeOf(700, 400 + i * 120, 1) }))
  const pages = L.layout(items, 3)
  const 합이맞다 = pages.every((pg: any[]) => pg.every((col: any[]) =>
    Math.abs(col.reduce((a, p) => a + p.slotMm, 0) - L.BODY_MM) < 0.01))
  ok('한 단의 높이 합이 본문 높이와 같다', 합이맞다)
  ok('한 단에 고른 문항 수를 넘지 않는다', pages.every((pg: any[]) => pg.every((col: any[]) => col.length <= 3)))
  ok('문항을 하나도 잃지 않는다', pages.flat(2).length === items.length)
}
{
  // 한 단보다 긴 그림은 줄여서 넣는다 (안 줄이면 쪽 밖으로 나간다)
  const big = L.sizeOf(700, 4000, 1)
  ok('아주 긴 그림도 한 단 안으로 줄인다', big.hmm <= L.BODY_MM, `${big.hmm.toFixed(1)}mm ≤ ${L.BODY_MM}mm`)
  const wide = L.sizeOf(3000, 300, 1)
  ok('아주 넓은 그림도 단 폭 안으로 줄인다', wide.wmm <= L.IMG_MM + 0.01, `${wide.wmm.toFixed(1)}mm ≤ ${L.IMG_MM}mm`)
}

console.log(`\n통과 ${pass} / 전체 ${all}`)
process.exitCode = pass === all ? 0 : 1
