// 학원 앱이 부르는 **Claude 모델 이름 한 곳**. (2026-11-05)
//
// 왜 한 곳에 두나
//   쓰던 `claude-sonnet-4-5` 가 **2026-11-30 에 서비스가 끝난다.** 그날이 지나면 그 이름으로
//   부르는 곳이 전부 멈춘다. 이름이 네 파일에 흩어져 있어서 한 곳만 빠뜨리기 쉬웠다.
//
// ★ 새 모델(Sonnet 5.5 · Haiku 5.5)은 **「생각하기」가 기본으로 켜져** 있다.
//   그래서 답의 **첫 블록이 글이 아니다.** `content[0].text` 를 그대로 읽던 코드는
//   **에러도 없이 빈 글자**를 돌려준다 — 한 줄 평이 조용히 빈칸으로 나간다.
//   그걸 막으려고 아래 textOf() 로만 꺼낸다.

/**
 * 글 쓰는 일 — 한 줄 평 요약, 알림장 초안, 보고서 코멘트.
 * 요약이라 가장 싼 것으로 충분하다 (실측 견적: 건당 10원 → 0.5원).
 */
export const AI_TEXT_MODEL = 'claude-haiku-5-5'

/**
 * **그림을 읽는 일** — 학습관리 프로그램 화면 사진에서 기록을 뽑아낸다.
 * 사진 판독은 틀리면 숫자가 어긋나므로 글쓰기보다 센 것을 쓴다.
 */
export const AI_VISION_MODEL = 'claude-sonnet-5-5'

/**
 * 답에서 **글을 꺼낸다.**
 *
 * ★ `content[0]` 을 믿으면 안 된다 — 생각하기가 켜진 모델은 첫 블록이 생각 블록이다.
 *   글 블록을 **찾아서** 잇는다(여러 개로 쪼개져 오는 일도 있다).
 */
export function textOf(message: any): string {
  return ((message?.content ?? []) as any[])
    .filter((b) => b?.type === 'text' && typeof b?.text === 'string')
    .map((b) => b.text)
    .join('')
    .trim()
}

/** 답이 `max_tokens` 에 걸려 **잘렸나**. 잘린 글을 학부모께 보내면 안 된다. */
export const wasCut = (message: any) => message?.stop_reason === 'max_tokens'

/**
 * 생각하기를 끈다 — Haiku 5.5 는 끌 수 있다(기본 effort medium 에서 허용).
 * 끄면 생각 토큰을 안 써서 `max_tokens` 를 답이 다 쓴다.
 * ★ Sonnet 5.5 는 끌 수 없다(400). 그쪽은 max_tokens 를 넉넉히 주고 textOf 로 꺼낸다.
 */
export const NO_THINKING = { type: 'disabled' as const }
