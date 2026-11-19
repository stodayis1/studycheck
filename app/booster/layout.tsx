/**
 * 부스터 특강 신청 링크의 **전용 썸네일**.
 *
 * 이 주소는 문자·카카오톡으로 나간다. 그대로 두면 기본 「수학의지혜 StudyCheck」 그림이
 * 뜨는데, 학부모님은 그걸 보고 「뭘 깔라는 건가」 하신다. 특강 포스터가 떠야 누른다.
 *
 * ★ 확인하는 법 (배포 뒤):
 *     curl -s https://studycheck-five.vercel.app/booster | grep -i 'og:image\|og:title'
 */
import type { Metadata } from 'next'
import { BOOSTER } from '@/lib/booster'

const 주소 = 'https://studycheck-five.vercel.app/booster'
const 그림 = 'https://studycheck-five.vercel.app/booster/poster.webp'
const 설명 = `${BOOSTER.기간} · ${BOOSTER.요일시간} · 총 ${BOOSTER.총회차}회 · 수강료 ${BOOSTER.수강료} · 선착순 ${BOOSTER.정원}명`

export const metadata: Metadata = {
  title: `${BOOSTER.이름} 신청`,
  description: 설명,
  openGraph: {
    title: `${BOOSTER.이름} · 선착순 ${BOOSTER.정원}명`,
    description: 설명,
    url: 주소,
    siteName: '수학의지혜 수학학원',
    images: [{ url: 그림, width: 1240, height: 1240, alt: BOOSTER.이름 }],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: `${BOOSTER.이름} · 선착순 ${BOOSTER.정원}명`,
    description: 설명,
    images: [그림],
  },
  // 선착순 자리라 검색에 뜰 필요가 없다 — 링크 받으신 분만 들어오시면 된다
  robots: { index: false, follow: false },
}

export default function BoosterLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
