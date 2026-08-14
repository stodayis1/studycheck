import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '수학의지혜 StudyCheck',
  description: '수학의지혜 통합 관리 플랫폼',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'StudyCheck',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-icon.png',
  },
  openGraph: {
    title: '수학의지혜 StudyCheck',
    description: '수학의지혜 통합 관리 플랫폼',
    url: 'https://studycheck-five.vercel.app',
    siteName: '수학의지혜 StudyCheck',
    images: [
      {
        url: '/og-image.png',
        width: 1080,
        height: 1080,
        alt: '수학의지혜 StudyCheck',
      },
    ],
    locale: 'ko_KR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: '수학의지혜 StudyCheck',
    description: '수학의지혜 통합 관리 플랫폼',
    images: ['/og-image.png'],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#085041',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 'Pretendard'를 폰트로 지정한 곳이 여러 군데(전역 CSS, 리포트 카드 등) 있지만 실제로
            그 글꼴 파일을 불러오는 곳이 없어서, 지금까지는 기기 기본 글꼴(아이폰=San Francisco,
            안드로이드=Roboto 등)로만 보이고 있었다. CDN에서 실제 Pretendard를 불러와야 의도한
            글씨체가 학부모/학생 화면에 그대로 보인다. */}
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
      </head>
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
