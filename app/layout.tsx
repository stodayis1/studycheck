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
  maximumScale: 1,
  themeColor: '#085041',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-gray-50 text-gray-900 antialiased">
        {children}
      </body>
    </html>
  )
}
