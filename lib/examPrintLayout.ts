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
/**
 * 문항 아래 **최대** 풀이 여백. 남는 자리는 단 아래에 그대로 둔다.
 *
 * 원장님 2026-11-17 「문제가 짧으면 한단에 문제더 넣어서 최대한 문제의 간격을 효율적으로 짜줄래」.
 * 전에는 남는 자리를 **전부** 문항 수로 나눠 가져서, 한 단에 문항이 적게 들어간 단(대개 마지막 단)은
 * 한 문항 아래가 170~190mm 씩 비었다. 실측 2026-11-17 —
 *   · 25년 신원고 기말(3문항/단): 평균 40.0mm 인데 **가장 큰 단이 173.2mm**
 *   · 교과서 119문항(자동): 평균 23.9mm 인데 **가장 큰 단이 183.4mm**
 * 멀쩡한 단은 건드리지 않을 값으로 잡았다 — 같은 날 백양고 기말(3문항/단)의 가장 큰 여백이 57.6mm 다.
 */
const MAX_SOLVE_MM = 60
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
export { MIN_SOLVE_MM, MAX_SOLVE_MM }

// 그림 크기(px) → 찍힐 크기(mm). 단보다 넓으면 폭에 맞춰 줄이고, 한 단보다 길면 높이에 맞춰 줄인다
export function sizeOf(wpx: number, hpx: number, zoom: number) {
  let wmm = (wpx / DPI) * 25.4 * zoom
  let hmm = (hpx / DPI) * 25.4 * zoom
  if (wmm > IMG_MM) { hmm *= IMG_MM / wmm; wmm = IMG_MM }
  const maxH = BODY_MM - MIN_SOLVE_MM
  if (hmm > maxH) { wmm *= maxH / hmm; hmm = maxH }
  return { wmm, hmm }
}

/**
 * 쪽 > 단 > 문항. 왼쪽 단을 위에서부터 채우고 오른쪽 단으로 넘어간다.
 *
 * `perCol` 은 **한 단에 넣을 문항 수의 상한**이다. `0`(또는 음수)이면 상한 없이 **높이가 되는 데까지**
 * 채운다 — 화면의 「자동」이다. 짧은 문항이 많은 자료(교과서 · 단계별 학습지)는 이쪽이 훨씬 빽빽하다
 * (실측 2026-11-17 교과서 119문항: 3문항/단 22쪽 → 자동 17쪽, 평균 여백 44.5mm → 23.9mm).
 *
 * 남는 자리는 그 단의 문항들이 나눠 갖되 **한 문항당 MAX_SOLVE_MM 까지만** 가져간다.
 * 그래서 한 단의 높이 합은 BODY_MM **이하**다(전에는 언제나 BODY_MM 과 같았다).
 */
export function layout(items: Sized[], perCol: number): Placed[][][] {
  const cap = perCol > 0 ? perCol : Infinity
  const pages: Placed[][][] = []
  let i = 0
  while (i < items.length) {
    const page: Placed[][] = []
    for (let c = 0; c < 2 && i < items.length; c++) {
      const col: Sized[] = []
      let used = 0
      while (i < items.length && col.length < cap) {
        const need = items[i].hmm + MIN_SOLVE_MM
        if (col.length && used + need > BODY_MM) break
        used += need
        col.push(items[i])
        i++
      }
      // 남는 자리를 고르게 나누되 너무 벌어지지 않게 자른다 → 합이 BODY_MM 이하
      const extra = Math.min((BODY_MM - col.reduce((a, p) => a + p.hmm, 0)) / col.length, MAX_SOLVE_MM)
      page.push(col.map((p) => ({ ...p, slotMm: p.hmm + extra })))
    }
    pages.push(page)
  }
  return pages
}
