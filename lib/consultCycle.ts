// 학부모 상담 주기 — **한 곳에서만** 정한다.
//
// ★ 예전에는 대시보드와 상담내역 화면이 각자 숫자를 들고 있었다(둘 다 `42 : 90`).
//   한쪽만 고치면 「대시보드엔 뜨는데 상담내역엔 없다」가 된다. 그래서 여기로 모았다.
//
// 초등 (원장님 2026-10-22 「기간 그냥 두달에 한번으로 하자. 정신없다」)
//   6주(42일)로 두었더니 상담 필요가 너무 자주 떠서 화면이 어지러웠다 → **2개월(60일)**.
// 중·고등
//   3개월(90일). 그대로다.
export const CONSULT_DAYS_ELEMENTARY = 60
export const CONSULT_DAYS_SECONDARY = 90

/** 그 학년의 상담 주기(일). 학년은 '초3' '중2' '고1' 꼴이다. */
export function consultCycleDays(grade?: string | null): number {
  return String(grade ?? '').startsWith('초') ? CONSULT_DAYS_ELEMENTARY : CONSULT_DAYS_SECONDARY
}

/** 화면에 적는 말 — 「초등 2개월 / 중·고 3개월」. 숫자를 바꾸면 이 글도 같이 바뀐다. */
export const CONSULT_CYCLE_LABEL =
  `초등 ${Math.round(CONSULT_DAYS_ELEMENTARY / 30)}개월 / 중·고 ${Math.round(CONSULT_DAYS_SECONDARY / 30)}개월`
