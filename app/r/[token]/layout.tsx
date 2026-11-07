/**
 * 학생부 로드맵 소식(/r/<token>)의 링크 미리보기 — 카톡·문자에 뜨는 제목·설명·대표 그림.
 *
 * ★ 문자·카톡으로 나가는 주소는 전용 대표 그림을 붙인다 (원장님 2026-11-07 「대표 썸네일 좀 신경 좀 써줘」).
 *   이 layout 이 없으면 앱 기본(스터디체크 그림)이 나간다.
 * ★ 학생 이름은 미리보기에 넣지 않는다. 검색 제외(noindex).
 * ★ 그림은 `python scripts/make-career-og.py` 가 만든다 (public/og/career-news.png).
 */
import type { Metadata } from 'next'
import { SITE } from '@/lib/careerServer'

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params
  const title = '수학의지혜 학생부 로드맵 소식'
  const description = '관심 계열에 맞춘 박람회·설명회·캠프 소식을 2주에 한 번 골라 보내 드려요'
  const image = `${SITE}/og/career-news.png`
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title, description, url: `${SITE}/r/${token}`, siteName: '수학의지혜 수학학원', locale: 'ko_KR', type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default function RoadmapNewsLayout({ children }: { children: React.ReactNode }) {
  return children
}
