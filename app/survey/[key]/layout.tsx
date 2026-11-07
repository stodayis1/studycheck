/**
 * 설문 주소의 **링크 미리보기** — 카톡·문자로 주소를 보낼 때 뜨는 제목·설명·그림.
 *
 * 원장님 2026-11-07 「링크 나갈때 대표 화면이 스터디체크가 뜨는데
 *   부모학교 만족도·후기 조사로 다른 그림이 나가게 해줘」
 *
 * ★ 화면(page.tsx)은 'use client' 라 metadata 를 못 내보낸다. 그래서 이 layout 이 대신 낸다.
 * ★ 묻는 내용과 마찬가지로 **행사 한 줄(lib/surveyEvents.ts)만 고치면** 미리보기도 따라 바뀐다.
 *   그림은 `scripts/make-survey-og.py` 로 만들어 `public/og/` 에 두고 og 에 적는다.
 * ★ 카톡은 한 번 본 미리보기를 한동안 기억한다. 그림을 바꿨는데 옛 그림이 보이면
 *   카카오 개발자센터의 「캐시 초기화」를 쓰거나 주소 뒤에 ?v=2 를 붙여 보낸다.
 * ★ 검색에는 안 뜨게 한다(noindex) — 행사에 오신 분께만 보내는 주소다.
 */
import type { Metadata } from 'next'
import { findEventBySlug } from '@/lib/surveyEvents'

const SITE = 'https://studycheck-five.vercel.app'

export async function generateMetadata(
  { params }: { params: Promise<{ key: string }> },
): Promise<Metadata> {
  // Next.js 16 — params 는 Promise 다
  const { key } = await params
  const ev = findEventBySlug(decodeURIComponent(key))

  const title = ev ? `수학의지혜 ${ev.name} 만족도·후기 조사` : '수학의지혜 설문'
  const description = ev
    ? `${ev.when} · ${ev.target} — 적어 주신 한 줄이 다음 시간을 바꿉니다`
    : '수학의지혜 수학학원'
  const image = SITE + (ev?.og ?? '/og/survey.png')

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: ev ? `${SITE}/survey/${ev.slug}` : SITE,
      siteName: '수학의지혜 수학학원',
      locale: 'ko_KR',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return children
}
