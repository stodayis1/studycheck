/**
 * 「내 활동 적기」(/a/<token>) 링크 미리보기 — 문자·카톡에 뜨는 제목·설명·대표 그림.
 *
 * ★ 문자로 나가는 주소는 전용 대표 그림을 붙인다 (원장님 2026-11-07 「대표 썸네일 좀 신경 좀 써줘」).
 *   이 layout 이 없으면 앱 기본(스터디체크 그림)이 나간다.
 * ★ 학생 이름은 미리보기에 넣지 않는다. 검색 제외(noindex).
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/careerServer'

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params
  const title = '내 활동 적기 — 수학의지혜 학생부 로드맵'
  const description = '학교에서 한 탐구·수행평가·동아리를 적어 두면 선생님이 다음 걸음을 같이 찾아 드려요'
  const image = `${SITE}/og/career.png`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title, description, url: `${SITE}/a/${token}`, siteName: '수학의지혜 수학학원', locale: 'ko_KR', type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children
}
