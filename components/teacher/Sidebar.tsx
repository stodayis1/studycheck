'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

type NavItem = { href: string; label: string; icon: string }
type NavGroup = { title: string | null; items: NavItem[] }

// 아이콘은 전부 Tabler 외곽선 아이콘 한 종류로 통일 (이모지·채운 아이콘 섞지 않기)
const ITEM = {
  dashboard:     { href: '/teacher/dashboard',      label: '대시보드',     icon: 'ti-layout-dashboard' },
  announcements: { href: '/teacher/announcements',  label: '공지사항',     icon: 'ti-speakerphone' },
  manual:        { href: '/teacher/manual',         label: '사용 매뉴얼',  icon: 'ti-book-2' },
  notes:         { href: '/teacher/learning-notes', label: '학습관리',     icon: 'ti-notebook' },
  weekly:        { href: '/teacher/weekly',         label: '학습현황',     icon: 'ti-calendar-week' },
  myRecords:     { href: '/teacher/my-records',     label: '내 기록',      icon: 'ti-history' },
  bulk:          { href: '/teacher/bulk-progress',  label: '진도일괄입력', icon: 'ti-list-check' },
  students:      { href: '/teacher/students',       label: '학생관리',     icon: 'ti-users' },
  curriculum:    { href: '/teacher/curriculum',     label: '과정관리',     icon: 'ti-books' },
  consultations: { href: '/teacher/consultations',  label: '상담내역',     icon: 'ti-message-circle' },
  assignments:   { href: '/teacher/assignments',    label: '학습지관리',   icon: 'ti-file-text' },
  exams:         { href: '/teacher/exams',          label: '평가관리',     icon: 'ti-clipboard-check' },
  examPrep:      { href: '/teacher/exam-prep',      label: '시험배정',     icon: 'ti-target' },
  reports:       { href: '/teacher/reports',        label: '보고서',       icon: 'ti-chart-bar' },
  importRecords: { href: '/teacher/import-records', label: '학습기록가져오기', icon: 'ti-file-import' },
  worksheets:    { href: '/teacher/worksheets',     label: '학습지출제',   icon: 'ti-file-plus' },
  sheetList:     { href: '/teacher/worksheets/list', label: '출제한 학습지', icon: 'ti-files' },
  gradings:      { href: '/teacher/gradings',       label: '채점결과',     icon: 'ti-checkbox' },
  scan:          { href: '/teacher/scan',           label: 'QR 채점',      icon: 'ti-qrcode' },
  workStatus:    { href: '/teacher/work-status',    label: '업무현황',     icon: 'ti-briefcase' },
  settings:      { href: '/teacher/settings',       label: '설정',         icon: 'ti-settings' },
} satisfies Record<string, NavItem>

// 같은 성격끼리 묶는다. 업무현황·학습지출제·채점결과·설정은 원장 전용 화면이라(강사가 들어가면
// "관리자만 접근" 안내만 뜸) 원장(관리자 모드)에게만 '원장 전용' 묶음으로 보인다.
function buildNavGroups(admin: boolean, showBulk: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { title: null, items: [ITEM.dashboard, ITEM.announcements, ITEM.manual] },
    { title: '수업', items: [ITEM.notes, ITEM.weekly, ITEM.myRecords, ...(showBulk ? [ITEM.bulk] : [])] },
    { title: '학생', items: [ITEM.students, ITEM.curriculum, ITEM.consultations] },
    { title: '과제 · 평가', items: [ITEM.assignments, ITEM.exams, ITEM.examPrep, ITEM.scan] },
    { title: '보고', items: [ITEM.reports, ITEM.importRecords] },
  ]
  if (admin) groups.push({ title: '원장 전용', items: [ITEM.worksheets, ITEM.sheetList, ITEM.gradings, ITEM.workStatus, ITEM.settings] })
  return groups
}

// 모바일 하단탭 4개 (나머지는 더보기)
const MOBILE_MAIN: NavItem[] = [ITEM.dashboard, ITEM.students, ITEM.notes, ITEM.myRecords]

export function TeacherSidebar() {
  const pathname = usePathname()
  const { currentUser, signOut, isAdmin, adminMode, toggleAdminMode, isSupervisorAccount, supervisorMode, toggleSupervisorMode, supervisorLabel } = useAuth()
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
  const navGroups = buildNavGroups(isAdmin(), showBulk)
  const mobileMainHrefs = new Set(MOBILE_MAIN.map((i) => i.href))
  const mobileMoreGroups = navGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => !mobileMainHrefs.has(i.href)) }))
    .filter((g) => g.items.length > 0)
  const isActiveHref = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      {/* 데스크톱 사이드바 */}
      <aside className="hidden md:flex print:hidden flex-col w-56 h-screen sticky top-0"
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

        {/* 주임/강사 모드 토글 - 주임으로 지정된 강사 계정에게만 보임 */}
        {isSupervisorAccount() && (
          <div className="px-3 pt-3 pb-1">
            <button onClick={toggleSupervisorMode}
              className="w-full text-xs py-2 rounded-xl font-semibold transition-all flex items-center justify-center gap-1.5"
              style={supervisorMode
                ? { background: '#1D4ED8', color: 'white' }
                : { background: '#EFF4FF', color: '#1D4ED8' }}>
              <i className={supervisorMode ? 'ti ti-eye' : 'ti ti-user'} style={{ fontSize: 13 }} />
              {supervisorMode ? `${supervisorLabel()} 모드` : '강사 모드'}
            </button>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          {navGroups.map((group, gi) => (
            <div key={group.title ?? 'top'} className={gi > 0 ? 'mt-3 pt-3' : ''}
              style={gi > 0 ? { borderTop: '1px solid #e5e7eb' } : undefined}>
              {group.title && (
                <p className="px-3 pb-1 text-[10px] font-bold tracking-wider"
                  style={{ color: group.title === '원장 전용' ? '#0F6E56' : '#9ca3af' }}>
                  {group.title}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive = isActiveHref(item.href)
                  return (
                    <Link key={item.href} href={item.href}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all"
                      style={isActive ? {
                        background: '#9FE1CB',
                        color: '#085041',
                        fontWeight: 600,
                        borderLeft: '3px solid #085041',
                      } : {
                        color: '#4b5563',
                        borderLeft: '3px solid transparent',
                      }}>
                      <i className={`ti ${item.icon}`} style={{ fontSize: 17, width: 18, textAlign: 'center',
                        color: isActive ? '#085041' : '#6b7280' }} />
                      {item.label}
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* 캐릭터 */}
        <div className="flex justify-center px-4 pb-1 shrink-0">
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
        <div className="md:hidden print:hidden fixed top-3 right-3 z-50">
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

      {/* 모바일 주임 토글 - 상단 고정 */}
      {isSupervisorAccount() && (
        <div className="md:hidden print:hidden fixed top-3 right-3 z-50">
          <button onClick={toggleSupervisorMode}
            className="text-[10px] font-bold px-3 py-1.5 rounded-full shadow-lg transition-all flex items-center gap-1"
            style={supervisorMode
              ? { background: '#1D4ED8', color: 'white', border: '1px solid #1D4ED8' }
              : { background: '#EFF4FF', color: '#1D4ED8', border: '1px solid #BFD3FA' }}>
            <i className={supervisorMode ? 'ti ti-eye' : 'ti ti-user'} style={{ fontSize: 11 }} />
            {supervisorMode ? supervisorLabel() : '강사'}
          </button>
        </div>
      )}

      {/* 모바일 더보기 시트 */}
      {moreOpen && (
        <div className="md:hidden print:hidden fixed inset-0 z-50" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.3)' }} />
          <div className="absolute bottom-16 left-0 right-0 rounded-t-2xl p-4 pb-6"
            style={{ background: 'white', boxShadow: '0 -4px 24px rgba(0,0,0,0.1)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full mx-auto mb-4" style={{ background: '#e5e7eb' }} />
            <div className="space-y-3 max-h-[65vh] overflow-y-auto">
              {mobileMoreGroups.map((group) => (
                <div key={group.title ?? 'top'}>
                  {group.title && (
                    <p className="px-1 pb-1.5 text-[10px] font-bold tracking-wider" style={{ color: '#9ca3af' }}>{group.title}</p>
                  )}
                  <div className="grid grid-cols-4 gap-2">
                    {group.items.map((item) => {
                      const isActive = isActiveHref(item.href)
                      return (
                        <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                          className="flex flex-col items-center justify-center gap-1.5 py-3 rounded-xl transition-all"
                          style={isActive
                            ? { background: '#9FE1CB', color: '#085041' }
                            : { background: '#f9fafb', color: '#6b7280' }}>
                          <i className={`ti ${item.icon}`} style={{ fontSize: 22 }} />
                          <span className="text-center leading-tight px-1" style={{ fontSize: 11, fontWeight: isActive ? 600 : 400 }}>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 모바일 하단 탭 */}
      <nav className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ background: '#F0FBF7', borderTop: '1px solid #e5e7eb' }}>
        <div className="flex h-16 max-w-lg mx-auto">
          {MOBILE_MAIN.map((item) => {
            const isActive = isActiveHref(item.href)
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
