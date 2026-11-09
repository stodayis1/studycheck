// 기출 시험지 인쇄의 **쪽 짜기** — 화면에서 재지 않고 숫자로 계산한다.
// 생김새는 components/exam-analysis/ExamPaperPrint.tsx, 여기는 숫자만 둔다.
// (컴포넌트는 JSX 라 node 로 못 불러서 검사를 못 쓴다 — 숫자를 여기 두면
//  scripts/exam-answerkey-check.ts 가 그대로 불러서 잰다.)

export type PrintItem = { no: string; url: string }

// ── 쪽 치수 (mm). 여기 숫자를 바꾸면 아래 CSS 도 같이 따라간다
export const PAGE_W = 210
export const PAGE_H = 297
export const PAD_X = 11
export const PAD_TOP = 9
export const PAD_BOTTOM = 7
export const HEAD_MM = 27            // 맨 윗줄 + 머리 상자 + 두 줄
export const FOOT_MM = 9             // 아래 줄 + 쪽 번호
export const BODY_MM = PAGE_H - PAD_TOP - PAD_BOTTOM - HEAD_MM - FOOT_MM   // 245
export const GAP_MM = 8              // 두 단 사이
export const COL_MM = (PAGE_W - PAD_X * 2 - GAP_MM) / 2                    // 90
export const NUM_MM = 6.5            // 문항 번호 자리
export const IMG_MM = COL_MM - NUM_MM                                      // 그림이 쓸 수 있는 폭
const MIN_SOLVE_MM = 12       // 문항 아래 최소 풀이 여백
const DPI = 200

// ── 빠른 정답 (선생님이 손으로 채점할 때 쓰는 번호·정답 한 장)
// 쪽이 넘치는 일이 없게 **칸 높이를 못으로 박고** 한 쪽에 몇 칸인지 나눗셈으로 정한다.
// (AK_ROWS * AK_ROW_MM <= BODY_MM 이어야 한다 — scripts/exam-answerkey-check.ts 가 본다)
export const AK_COLS = 4
export const AK_ROW_MM = 26                                     // 한 줄 높이 (정답 그림도 들어간다)
export const AK_ROWS = Math.floor(BODY_MM / AK_ROW_MM)          // 한 쪽에 몇 줄
export const AK_PER_PAGE = AK_COLS * AK_ROWS                    // 한 쪽에 몇 문항
export const AK_IMG_MM = AK_ROW_MM - 8                          // 정답 그림의 최대 높이

/** 그림으로 된 정답(서술형)은 **두 칸**을 쓴다 — 한 칸(44mm)에 넣으면 글씨가 너무 작아진다 */
export const akWeight = (p: { answerUrl?: string | null }) => (p.answerUrl ? 2 : 1)

/** 빠른 정답을 쪽마다 나눈다. 칸을 두 개 쓰는 문항까지 세어서 **쪽이 넘치지 않게** 한다
 *  (문항이 없어도 빈 쪽 하나는 만든다) */
export function answerPages<T>(items: T[], weight: (x: T) => number = () => 1, per: number = AK_PER_PAGE): T[][] {
  const out: T[][] = []
  let cur: T[] = []
  let used = 0
  for (const it of items) {
    const w = Math.min(per, Math.max(1, weight(it)))
    if (cur.length && used + w > per) { out.push(cur); cur = []; used = 0 }
    cur.push(it)
    used += w
  }
  if (cur.length) out.push(cur)
  return out.length ? out : [[]]
}

export type Sized = PrintItem & { wmm: number; hmm: number }
export type Placed = Sized & { slotMm: number }      // slotMm = 그림 + 풀이 여백 (단 안에서 이 문항이 차지하는 높이)

// 그림 크기(px) → 찍힐 크기(mm). 단보다 넓으면 폭에 맞춰 줄이고, 한 단보다 길면 높이에 맞춰 줄인다
export function sizeOf(wpx: number, hpx: number, zoom: number) {
  let wmm = (wpx / DPI) * 25.4 * zoom
  let hmm = (hpx / DPI) * 25.4 * zoom
  if (wmm > IMG_MM) { hmm *= IMG_MM / wmm; wmm = IMG_MM }
  const maxH = BODY_MM - MIN_SOLVE_MM
  if (hmm > maxH) { wmm *= maxH / hmm; hmm = maxH }
  return { wmm, hmm }
}

// 쪽 > 단 > 문항. 왼쪽 단을 위에서부터 채우고 오른쪽 단으로 넘어간다
export function layout(items: Sized[], perCol: number): Placed[][][] {
  const pages: Placed[][][] = []
  let i = 0
  while (i < items.length) {
    const page: Placed[][] = []
    for (let c = 0; c < 2 && i < items.length; c++) {
      const col: Sized[] = []
      let used = 0
      while (i < items.length && col.length < perCol) {
        const need = items[i].hmm + MIN_SOLVE_MM
        if (col.length && used + need > BODY_MM) break
        used += need
        col.push(items[i])
        i++
      }
      // 남는 자리를 고르게 나눈다 → 합이 정확히 BODY_MM
      const extra = (BODY_MM - col.reduce((a, p) => a + p.hmm, 0)) / col.length
      page.push(col.map((p) => ({ ...p, slotMm: p.hmm + extra })))
    }
    pages.push(page)
  }
  return pages
}
