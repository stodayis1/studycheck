'use client'

import { useRouter } from 'next/navigation'
import ModeToggle from '@/components/teacher/ModeToggle'

export function Header({ title, subtitle, showBack=false, action }: {
  title: string; subtitle?: string; showBack?: boolean; action?: React.ReactNode
}) {
  const router = useRouter()
  return (
    <header className="sticky top-0 z-40 px-4 py-3 flex items-center gap-3"
      style={{
        background: 'rgba(240,251,247,0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #9FE1CB50',
      }}>
      {showBack && (
        <button onClick={() => router.back()}
          className="w-8 h-8 flex items-center justify-center rounded-xl transition-all shrink-0"
          style={{ color: '#0F6E56' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#9FE1CB40' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}>
          ←
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold truncate" style={{ color: '#085041' }}>{title}</h1>
        {subtitle && <p className="text-xs truncate" style={{ color: '#0F6E56' }}>{subtitle}</p>}
      </div>
      {/* 오른쪽 — 모드 단추(모바일만)와 화면별 단추를 **한 줄에** 늘어놓는다.
          모드 단추는 예전엔 화면 위에 떠서 알림 종을 덮었다 (원장님 2026-10-22). */}
      <div className="shrink-0 flex items-center gap-2">
        <ModeToggle className="md:hidden print:hidden" />
        {action}
      </div>
    </header>
  )
}
