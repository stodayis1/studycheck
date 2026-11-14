/**
 * 점수가 들어온 학습지를 **바로 닫을(passed) 수 있는가**.
 *
 * 왜 (원장님 2026-11-14)
 *   「학습지 점수 입력되어 있는걸 굳이 완료까지 눌러야 없어지거든. 그러지 말고 …
 *    점수가 입력되어 뜨면 … 완료처리 되게 하면 어떨까」
 *   「레벨업 기능을 거의 안쓰는듯」 · 「학습지 배정을 따로 여기서 할필요가 없어.
 *    매쓰홀릭에서 긁어오는 대로 반영하면 되니까」
 *
 *   실측(최근 60일 worksheet_action_logs): 완료 1,647 · 오답유사 451 · 자동재도전 86 ·
 *   재도전 78 · **레벨업 49** · 레벨↓ 12. 사람이 누르는 것의 대부분이 「완료」다.
 *   그 한 번을 없앤다.
 *
 * ★ 두 자리는 **닫지 않는다.** 둘 다 「사람이 골라야 하는 자리」다 —
 *   애매해서가 아니라 **규칙이 정해 둔 갈림길**이다.
 *
 *   ① 초등 본 학습지 70점 미만 — 재도전 · 레벨↓ 재도전 · 오답유사 중에 골라야 한다.
 *      DB 트리거(`docs/sql/초등학습지_70점_차단.sql`)도 같은 줄에서 막는다. 여기서 닫으려 들면
 *      update 가 **에러로 떨어져** 긁어 넣기가 통째로 멈춘다 — 막는 선을 트리거와 **글자까지** 맞춘다.
 *   ② 초등 오답유사 중 **원래 학습지가 70점 미만**이었던 것 — 점수와 상관없이 같은 레벨
 *      재도전이 따라와야 한다(오답유사는 틀린 것만 모아서 점수가 잘 나온다). 닫아 버리면
 *      목록에서 사라져 아무도 그걸 못 본다.
 *
 * 기준 점수는 여기와 `app/teacher/assignments/page.tsx` 의 PASS_SCORE,
 * 그리고 DB 트리거 **세 곳**에 있다. 바꿀 때 셋 다 바꾼다.
 */
export const WS_PASS_SCORE = 70

export interface WorksheetForClose {
  worksheet_type?: string | null
  grade_level?: string | null
  score?: number | null
  /** 오답유사일 때, 원래 학습지의 점수. 모르면 undefined 로 둔다 (그러면 안 닫는다). */
  parentScore?: number | null
}

const 초등 = (g?: string | null) => (g ?? '').startsWith('초')

/** 점수가 들어온 뒤 가야 할 상태 — 'passed'(닫음) 또는 'scored'(사람이 고를 자리로 남김). */
export function statusAfterScore(w: WorksheetForClose): 'passed' | 'scored' {
  if (w.score == null) return 'scored'

  // ① 초등 본 학습지 70점 미만 — DB 트리거가 막는 바로 그 줄
  if (w.worksheet_type === 'main' && 초등(w.grade_level) && w.score < WS_PASS_SCORE) return 'scored'

  // ② 초등 오답유사 — 원래 학습지가 70점 미만이었으면 재도전이 따라와야 한다.
  //    원래 점수를 모르면(undefined) **닫지 않는다** — 모르는 채로 닫는 쪽이 위험하다.
  if (w.worksheet_type === 'similar' && 초등(w.grade_level)) {
    if (w.parentScore == null || w.parentScore < WS_PASS_SCORE) return 'scored'
  }

  return 'passed'
}

/** 닫지 않았다면 그 까닭 — 화면에 그대로 적어 준다. 닫았으면 null. */
export function whyNotClosed(w: WorksheetForClose): string | null {
  if (statusAfterScore(w) === 'passed') return null
  if (w.score == null) return '점수가 없어요'
  if (w.worksheet_type === 'main' && 초등(w.grade_level) && w.score < WS_PASS_SCORE) {
    return `${WS_PASS_SCORE}점 미만 — 재도전·오답유사를 고르셔야 해요`
  }
  return '오답유사 — 원래 학습지가 70점 미만이라 재도전이 필요해요'
}
