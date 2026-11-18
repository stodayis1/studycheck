/**
 * 점수가 들어온 학습지를 **바로 닫을(passed) 수 있는가**.
 *
 * 왜 (원장님 2026-11-14)
 *   「학습지 점수 입력되어 있는걸 굳이 완료까지 눌러야 없어지거든. 그러지 말고 …
 *    점수가 입력되어 뜨면 … 완료처리 되게 하면 어떨까」
 *   「레벨업 기능을 거의 안쓰는듯」 · 「학습지 배정을 따로 여기서 할필요가 없어.
 *    매쓰홀릭에서 긁어오는 대로 반영하면 되니까」
 *
 * ★★ 2026-11-18 — **점수가 들어오면 예외 없이 닫는다.**
 *   11-14 에는 두 자리를 열어 뒀다(초등 본 학습지 70점 미만 · 초등 오답유사 중 원래가
 *   70점 미만). 그런데 그 두 자리가 **남은 손품의 전부**였다 — 11/12~11/18 에 점수가 들어온
 *   314건 중 304건은 저절로 닫히고 **10건만** 사람을 기다렸고, 그 10건이 바로 이 두 자리다.
 *   원장님: 「아예 스터디체크에서는 학습지 관리를 별도로 안하고, 매쓰홀릭에서 긁어서 올린것만
 *   알아서 결과로 올리면 되는거니까 굳이 수기로 또 입력하거나 **재도전 배정을 하거나 안해도
 *   될거잖아**」 · 「다 닫자 — 재도전 배정 안 함」.
 *   재도전 학습지는 선생님이 **매쓰홀릭에서** 내시고(「다시풀기」·「오답과제」), 그것이 다시
 *   긁혀 들어온다. 스터디체크에서 배정할 일이 없다.
 *
 * ★ **70점 미만을 못 본다는 뜻이 아니다.** 학습지관리의 「70점 못 넘기고 멈춘 단원」과
 *   「70점 미만 처리」 표는 상태가 아니라 **점수**를 보고 그리므로 그대로 보인다
 *   (`app/teacher/assignments/page.tsx` 의 PASS_SCORE). 막이만 없애는 것이다.
 *
 * ★ **DB 트리거를 같이 풀어야 한다.** `docs/sql/학습지_자동완료.sql` —
 *   초등 본 학습지 70점 미만을 passed 로 **올리는 update** 를 트리거가 막고 있다
 *   (insert 는 막지 않는다). 안 풀면 점수 채우기가 에러로 떨어진다. 그 사이에도 멈추지
 *   않게 부르는 쪽이 `BLOCKED_BY_TRIGGER` 로 알아보고 'scored' 로 되돌려 넣는다.
 *
 * 기준 점수는 여기와 `app/teacher/assignments/page.tsx` 의 PASS_SCORE,
 * 그리고 DB 트리거 **세 곳**에 있다. 바꿀 때 셋 다 바꾼다.
 */
export const WS_PASS_SCORE = 70

export interface WorksheetForClose {
  worksheet_type?: string | null
  grade_level?: string | null
  score?: number | null
  /** 오답유사일 때, 원래 학습지의 점수. 2026-11-18 부터는 판정에 쓰이지 않는다. */
  parentScore?: number | null
}

/**
 * 점수가 들어온 뒤 가야 할 상태 — 'passed'(닫음) 또는 'scored'(점수만 적힘).
 *
 * ★ 점수가 있으면 **늘 'passed'** 다 (원장님 2026-11-18). 'scored' 는 점수가 아직
 *   없을 때뿐이다 — 이제 「사람이 골라야 하는 자리」는 없다.
 */
export function statusAfterScore(w: WorksheetForClose): 'passed' | 'scored' {
  return w.score == null ? 'scored' : 'passed'
}

/** 닫지 않았다면 그 까닭 — 화면에 그대로 적어 준다. 닫았으면 null. */
export function whyNotClosed(w: WorksheetForClose): string | null {
  return statusAfterScore(w) === 'passed' ? null : '점수가 없어요'
}

/**
 * DB 트리거가 막아서 실패한 것인가 — 「초등 레벨학습지 70점 미만은 …」.
 *
 * 왜 필요한가: SQL 실행은 원장님이 하시니 **앱이 먼저 배포될 수 있다.** 그 사이에
 *   점수 채우기가 통째로 멈추면 그날 점수가 하나도 안 들어간다. 이 글자를 알아보면
 *   'scored'(= 11-14 까지의 동작)로 되돌려 넣어 **점수만은 반드시 남긴다.**
 */
export function blockedByTrigger(message?: string | null): boolean {
  const m = String(message ?? '')
  return /70점 미만/.test(m) || /P0001/.test(m)
}
