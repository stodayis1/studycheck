'use client'

import { useRouter } from 'next/navigation'

export function Header({ title, subtitle, showBack=false, action }: {
  title: string; subtitle?: string; showBack?: boolean; action?: React.ReactNode
}) {
  const router = useRouter()
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
      {showBack && (
        <button onClick={() => router.back()} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 shrink-0">
          ←
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-bold text-gray-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  )
}