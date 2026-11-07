/**
 * 진로 설문 문자 링크(/c/<token>)의 **링크 미리보기** — 카톡·문자에 뜨는 제목·설명·대표 그림.
 *
 * 원장님 2026-11-07 「항상 이런 설문 조사 나갈 때 대표 썸네일 좀 신경 좀 써줘.
 *   지금 또 스터디체크 대표 썸네일이 나갔잖아」
 *   → 이 layout 이 없으면 앱 기본(스터디체크 그림·「수학의지혜 StudyCheck」)이 나간다.
 *
 * ★ 화면(page.tsx)은 'use client' 라 metadata 를 못 내보낸다. 그래서 이 layout 이 대신 낸다
 *   (app/survey/[key]/layout.tsx 와 같은 방식).
 * ★ 링크마다 예비고1·예비고2 그림이 다르다 — 토큰으로 설문 종류만 읽는다.
 *   학생 이름은 미리보기에 넣지 않는다 (카톡이 미리보기를 서버에 저장해 둔다).
 * ★ 그림은 `python scripts/make-career-og.py` 로 만든다 (public/og/career-*.png).
 * ★ 카톡은 한 번 본 미리보기를 한동안 기억한다. 그림을 바꿨는데 옛 그림이 보이면
 *   카카오 개발자센터 「캐시 초기화」를 쓰거나 주소 뒤에 ?v=2 를 붙인다.
 * ★ 검색에는 안 뜨게 한다(noindex).
 */
import type { Metadata } from 'next'
import { serviceDb, isToken, SITE } from '@/lib/careerServer'
import { FORMS, type FormId } from '@/lib/careerSurvey'

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> },
): Promise<Metadata> {
  const { token } = await params
  let form: FormId | null = null
  if (isToken(token)) {
    try {
      const { data } = await serviceDb().from('career_links').select('form').eq('token', token).maybeSingle()
      if (data && FORMS[data.form as FormId]) form = data.form as FormId
    } catch { /* 못 읽으면 기본 그림 */ }
  }

  const title = form ? `수학의지혜 ${FORMS[form].label} 진로 설문` : '수학의지혜 진로 설문'
  const description = form === 'pre1'
    ? '고1 첫 학기부터 학생부가 쌓입니다 — 진로에 맞춰 미리 준비해요 · 약 3분, 로그인 없이'
    : form === 'pre2'
      ? '선택과목·탐구·비교과를 진로에 맞춰 함께 챙깁니다 · 약 3분, 로그인 없이'
      : '내신과 비교과, 진로에 맞춰 함께 챙깁니다 · 약 3분, 로그인 없이'
  const image = `${SITE}/og/${form ? `career-${form}` : 'career'}.png`

  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: `${SITE}/c/${token}`,
      siteName: '수학의지혜 수학학원',
      locale: 'ko_KR',
      type: 'website',
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [image] },
  }
}

export default function CareerLinkLayout({ children }: { children: React.ReactNode }) {
  return children
}
