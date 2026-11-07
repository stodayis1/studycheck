// 학생부 로드맵 화면(질문지 /c/ · 소식 /r/ · 앱 안 질문지)의 큰 제목 명조체.
// 휴대폰에는 한글 명조가 거의 없어서 그냥 'serif' 로 두면 고딕으로 나온다 → 구글 폰트를 실어 보낸다.
// (원장님 2026-11-07 「학생부 로드맵 설문지 디자인 안 바뀐 채로 그냥 오는데?」 — 썸네일처럼 가는 명조로)
import { Noto_Serif_KR } from 'next/font/google'

export const roadmapSerif = Noto_Serif_KR({
  weight: ['300', '400'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,   // 한글 글자는 subsets 로 미리 못 받는다 — 쓰는 화면에서만 받는다
})
