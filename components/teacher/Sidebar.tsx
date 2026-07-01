'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

const NAV_ITEMS = [
  { href: '/teacher/dashboard',      label: '대시보드',   icon: 'ti-layout-dashboard' },
  { href: '/teacher/students',       label: '학생관리',   icon: 'ti-users' },
  { href: '/teacher/learning-notes', label: '학습관리',   icon: 'ti-notebook' },
  { href: '/teacher/my-records',     label: '내 기록',     icon: 'ti-history' },
  { href: '/teacher/assignments',    label: '학습지관리', icon: 'ti-file-text' },
  { href: '/teacher/exams',          label: '평가관리',   icon: 'ti-trophy' },
  { href: '/teacher/curriculum',     label: '과정관리',   icon: 'ti-books' },
  { href: '/teacher/work-status',    label: '업무현황',   icon: 'ti-briefcase' },
  { href: '/teacher/exam-prep',      label: '시험배정',   icon: 'ti-clipboard-list' },
  { href: '/teacher/reports',        label: '보고서',     icon: 'ti-chart-bar' },
]

const BULK_ITEM = { href: '/teacher/bulk-progress', label: '진도일괄입력', icon: 'ti-list-check' }
const SETTINGS_ITEM = { href: '/teacher/settings', label: '설정', icon: 'ti-settings' }
const IMPORT_ITEM = { href: '/teacher/import-records', label: '학습기록가져오기', icon: 'ti-file-import' }

// 모바일 하단탭: 앞 4개만 노출, 나머지는 더보기
const MOBILE_MAIN = NAV_ITEMS.slice(0, 4)
const MOBILE_MORE = NAV_ITEMS.slice(4)

export function TeacherSidebar() {
  const pathname = usePathname()
  const { currentUser, signOut, isAdmin, adminMode, toggleAdminMode } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const [bulkEnabled, setBulkEnabled] = useState(false)

  useEffect(() => {
    async function fetchBulkSetting() {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'bulk_progress_enabled').single()
      if (data) setBulkEnabled(data.value === true || data.value === 'true')
    }
    fetchBulkSetting()
  }, [])

  const showBulk = isAdmin() || bulkEnabled

  const adminItems = isAdmin() ? [SETTINGS_ITEM] : []
  const desktopNavItems = showBulk
    ? [...NAV_ITEMS, BULK_ITEM, IMPORT_ITEM, ...adminItems]
    : [...NAV_ITEMS, IMPORT_ITEM, ...adminItems]
  const mobileMoreItems = showBulk
    ? [...MOBILE_MORE, BULK_ITEM, IMPORT_ITEM, ...adminItems]
    : [...MOBILE_MORE, IMPORT_ITEM, ...adminItems]

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex flex-col w-56 min-h-screen sticky top-0"
        style={{ background: '#F0FBF7', borderRight: '1px solid #e5e7eb' }}>

        {/* 로고 */}
        <div className="px-5 py-5 flex flex-col items-center gap-1.5"
          style={{ borderBottom: '1px solid #e5e7eb' }}>
          <img src="/logo.png" alt="수학의지혜" className="h-11 object-contain"
            onError={(e) => { e.currentTarget.style.display='none' }} />
          <p className="text-[10px] font-medium tracking-wide" style={{ color: '#9ca3af' }}>
            학원관리 시스템
          </p>
        </div>

        {/* 관리자/강사 모드 토글 */}
        {currentUser?.role === 'admin' && (
          <div className="px-3 pt-3 pb-1">
            <button onClick={toggleAdminMode}
              className="w-full text-xs py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5"
              style={adminMode
                ? { background: '#085041', color: 'white' }
                : { background: '#F5C4B3', color: '#712B13' }}>
              <i className={adminMode ? 'ti ti-crown' : 'ti ti-user'} style={{ fontSize: 13 }} />
              {adminMode ? '관리자 모드' : '강사 모드'}
            </button>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {desktopNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const isBulk = item.href === '/teacher/bulk-progress' || item.href === '/teacher/import-records' || item.href === '/teacher/settings'
            return (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={isActive ? {
                  background: '#9FE1CB',
                  color: '#085041',
                  fontWeight: 600,
                  borderLeft: '3px solid #085041',
                } : isBulk ? {
                  color: '#6b7280',
                  borderLeft: '3px solid transparent',
                  borderTop: '1px dashed #e5e7eb',
                  marginTop: 4,
                } : {
                  color: '#6b7280',
                  borderLeft: '3px solid transparent',
                }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: 16 }} />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* 캐릭터 */}
        <div className="flex justify-center px-4 pb-1">
          <img src="/character.png" alt="캐릭터" className="h-20 object-contain"
            onError={(e) => { e.currentTarget.style.display='none' }} />
        </div>

        {/* 유저 정보 */}
        <div className="px-4 py-3" style={{ borderTop: '1px solid #e5e7eb' }}>
          <div className="flex items-center gap-2.5 mb-2.5">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ background: '#9FE1CB', color: '#085041' }}>
              {currentUser?.name?.[0] ?? 'T'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: '#1f2937' }}>
                {currentUser?.name}
              </p>
              <p className="text-[10px] truncate" style={{ color: '#9ca3af' }}>
                {currentUser?.email}
              </p>
            </div>
          </div>

          <button onClick={signOut}
            className="w-full text-xs py-1.5 rounded-xl transition-all flex items-center justify-center gap-1.5"
            style={{ color: '#9ca3af' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = '' }}>
            <i className="ti ti-logout" style={{ fontSize: 13 }} />
            로그아웃
          </button>
        </div>
      </aside>

      {/* 모바일 관리자 토글 - 상단 고정 */}
      {currentUser?.role === 'admin' && (
        <div className="md:hidden fixed top-3 right-3 z-50">
          <button onClick={toggleAdminMode}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg transition-all flex items-center gap-1"
            style={adminMode
              ? { background: '#085041', color: 'white', border: '1px solid #085041' }
              : { background: '#F5C4B3', color: '#712B13', border: '1px solid #F5C4B3' }}>
            <i className={adminMode ? 'ti ti-crown' : 'ti ti-user'} style={{ fontSize: 11 }} />
            {adminMode ? '관리자' : '강사'}
          </button>
        </div>
      )}

      {/* 모바일 더보기 시트 */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)' }} />
          <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl p-4 pb-6"
            style={{ background: 'white', boxShadow: '0 -4px 24px rgba(0,0,0,0.1)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: '#e5e7eb' }} />
            <div className="grid grid-cols-4 gap-3">
              {mobileMoreItems.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all"
                    style={isActive
                      ? { background: '#9FE1CB', color: '#085041' }
                      : { background: '#f9fafb', color: '#6b7280' }}>
                    <i className={`ti ${item.icon}`} style={{ fontSize: 22 }} />
                    <span style={{ fontSize: 11, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* 모바일 하단 탭 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ background: '#F0FBF7', borderTop: '1px solid #e5e7eb' }}>
        <div className="flex h-16 max-w-lg mx-auto">
          {MOBILE_MAIN.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link key={item.href} href={item.href}
                className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
                style={{ color: isActive ? '#085041' : '#9ca3af' }}>
                <i className={`ti ${item.icon}`} style={{ fontSize: 20 }} />
                <span style={{ fontSize: 9, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
              </Link>
            )
          })}
          {/* 더보기 버튼 */}
          <button onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition-colors"
            style={{ color: moreOpen ? '#085041' : '#9ca3af' }}>
            <i className="ti ti-dots" style={{ fontSize: 20 }} />
            <span style={{ fontSize: 9, fontWeight: moreOpen ? 600 : 400 }}>더보기</span>
          </button>
        </div>
      </nav>
    </>
  )
}
