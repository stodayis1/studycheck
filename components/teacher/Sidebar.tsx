'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

const NAV_ITEMS = [
  { href:'/teacher/dashboard',      label:'대시보드',    icon:'⊞' },
  { href:'/teacher/learning-notes', label:'학습관리',    icon:'📓' },
  { href:'/teacher/students',       label:'학생관리',    icon:'◎' },
  { href:'/teacher/assignments',    label:'레벨학습지',  icon:'📝' },
  { href:'/teacher/submissions',    label:'제출현황',    icon:'◐' },
  { href:'/teacher/exams',          label:'평가관리',    icon:'🏆' },
  { href:'/teacher/reports',        label:'보고서',      icon:'◈' },
]

export function TeacherSidebar() {
  const pathname = usePathname()
  const { currentUser, signOut } = useAuth()

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-100 min-h-screen sticky top-0">
        <div className="px-4 py-4 border-b border-gray-100 flex flex-col items-center gap-2">
          <img src="/logo.png" alt="수학의지혜" className="h-12 object-contain"
            onError={(e) => { e.currentTarget.style.display='none' }} />
          <p className="text-[10px] text-gray-400 font-medium text-center">수업일지 · 진도관리</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href+'/')
            return (
              <Link key={item.href} href={item.href}
                className={cx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                  isActive ? 'bg-[#1a2f5e] text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700')}>
                <span className="text-base leading-none">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="flex justify-center px-4 pb-2">
          <img src="/character.png" alt="캐릭터" className="h-24 object-contain"
            onError={(e) => { e.currentTarget.style.display='none' }} />
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-8 h-8 bg-[#1a2f5e] rounded-full flex items-center justify-center text-sm font-semibold text-white">
              {currentUser?.name?.[0] ?? 'T'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate">{currentUser?.name}</p>
              <p className="text-[10px] text-gray-400 truncate">{currentUser?.email}</p>
            </div>
          </div>
          <button onClick={signOut}
            className="w-full text-xs text-gray-400 hover:text-gray-600 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일 하단 탭 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100">
        <div className="flex h-16 max-w-lg mx-auto">
          {NAV_ITEMS.slice(0,5).map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href+'/')
            return (
              <Link key={item.href} href={item.href}
                className={cx('flex-1 flex flex-col items-center justify-center gap-1 transition-colors',
                  isActive ? 'text-[#1a2f5e]' : 'text-gray-400')}>
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[9px] font-medium">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
