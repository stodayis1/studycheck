// 학생부 로드맵 화면(질문지 /c/ · 소식 /r/ · 앱 안 질문지)의 큰 제목 명조체.
// 휴대폰에는 한글 명조가 거의 없어서 그냥 'serif' 로 두면 고딕으로 나온다 → 구글 폰트를 쓴다.
// (원장님 2026-11-07 「학생부 로드맵 설문지 디자인 안 바뀐 채로 그냥 오는데?」 — 썸네일처럼 가는 명조로)
//
// ★ `next/font/google` 을 **쓰지 않는다** (2026-11-13).
//   한글 Noto Serif KR 은 @font-face 가 천 줄 넘게 나오는데, Vercel 빌드에서 Turbopack 이 그걸
//   받아 넣다가 터졌다 — 「next/font/google queries have exactly one entry」 로 **배포가 통째로 실패**했다.
//   내 컴퓨터에서는 깨끗이 지우고 다시 빌드해도 통과해서(로컬 6.7초, 에러 0) 눈으로는 안 보이던 자리다.
//   폰트 하나 때문에 배포가 막히면 안 되므로, 빌드 때 받아 넣지 말고 **브라우저가 받게** 둔다.
//   글꼴은 그대로고, 못 받으면 아래 대체 명조로 흐른다.

export const ROADMAP_SERIF_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@300;400&display=swap'

/** 쓰던 자리를 그대로 두려고 모양을 맞춰 둔다 — `roadmapSerif.style.fontFamily` */
export const roadmapSerif = {
  style: { fontFamily: "'Noto Serif KR', 'Nanum Myeongjo', 'Apple SD Gothic Neo', serif" },
} as const

/**
 * 이 글꼴을 쓰는 화면 안에 한 번 넣는다. React 가 알아서 <head> 로 올린다.
 * 여러 번 넣어도 주소가 같으면 한 번만 받는다.
 */
export function RoadmapSerifLink() {
  return <link rel="stylesheet" href={ROADMAP_SERIF_HREF} />
}
