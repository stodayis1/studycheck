/**
 * 기출 시험지 인쇄 — **쪽이 넘치지 않는지 숫자로** 잰다 (눈으로 보지 않는다).
 *   · 시험지: 한 단의 높이 합이 BODY_MM 을 **넘지 않아야** 한다 (2026-11-17 전에는 '언제나 같다' 였다 —
 *     풀이 여백에 상한 MAX_SOLVE_MM 이 생겨 남는 자리는 단 아래에 그대로 둔다)
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
  const cols = (p: any) => p.flat() as any[][]
  const 안넘친다 = cols(pages).every((col) => col.reduce((a: number, p: any) => a + p.slotMm, 0) <= L.BODY_MM + 0.01)
  ok('한 단의 높이 합이 본문 높이를 넘지 않는다', 안넘친다)
  ok('한 단에 고른 문항 수를 넘지 않는다', pages.every((pg: any[]) => pg.every((col: any[]) => col.length <= 3)))
  ok('문항을 하나도 잃지 않는다', pages.flat(2).length === items.length)

  // ── 풀이 여백 (원장님 2026-11-17 「문제가 짧으면 한단에 문제더 넣어서 최대한 효율적으로」) ──
  const gaps = cols(pages).flatMap((col) => col.map((p: any) => p.slotMm - p.hmm))
  ok('풀이 여백은 최소치보다 작지 않다', Math.min(...gaps) >= L.MIN_SOLVE_MM - 0.01, `${Math.min(...gaps).toFixed(1)}mm ≥ ${L.MIN_SOLVE_MM}mm`)
  ok('풀이 여백은 상한을 넘지 않는다', Math.max(...gaps) <= L.MAX_SOLVE_MM + 0.01, `${Math.max(...gaps).toFixed(1)}mm ≤ ${L.MAX_SOLVE_MM}mm`)

  // ★ 짧은 문항 하나만 남은 단이 **한 쪽을 통째로 벌리지 않는다.**
  //   2026-11-17 전에는 25년 신원고 기말의 한 단이 173.2mm, 교과서 119문항이 183.4mm 였다.
  const 짧은것 = Array.from({ length: 5 }, (_, i) => ({ no: String(i + 1), url: '', ...L.sizeOf(700, 100, 1) }))
  const 한단 = L.layout(짧은것, 2)[0][0]
  ok('짧은 문항만 있어도 여백이 상한을 넘지 않는다',
    한단.every((p: any) => p.slotMm - p.hmm <= L.MAX_SOLVE_MM + 0.01),
    `가장 큰 여백 ${Math.max(...한단.map((p: any) => p.slotMm - p.hmm)).toFixed(1)}mm`)

  // ★ 「자동」(perCol 0) — 상한 없이 높이가 되는 데까지 채운다. 교과서처럼 짧은 문항이 많을 때 쓴다.
  const 많은짧은것 = Array.from({ length: 40 }, (_, i) => ({ no: String(i + 1), url: '', ...L.sizeOf(700, 150, 1) }))
  const 셋씩 = L.layout(많은짧은것, 3)
  const 자동 = L.layout(많은짧은것, 0)
  ok('자동이 3문항씩보다 쪽수가 적다', 자동.length < 셋씩.length, `자동 ${자동.length}쪽 < 3문항씩 ${셋씩.length}쪽`)
  ok('자동도 문항을 하나도 잃지 않는다', 자동.flat(2).length === 많은짧은것.length)
  ok('자동도 한 단을 넘기지 않는다',
    cols(자동).every((col) => col.reduce((a: number, p: any) => a + p.slotMm, 0) <= L.BODY_MM + 0.01))
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
