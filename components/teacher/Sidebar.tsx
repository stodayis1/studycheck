'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/apiFetch'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

type NavItem = { href: string; label: string; icon: string }
// collapsed: 가끔 쓰는 메뉴 묶음. 접어 두고 눌러야 펼쳐진다 — 늘 떠 있으면 매일 쓰는 메뉴가 묻힌다.
type NavGroup = { title: string | null; items: NavItem[]; collapsed?: boolean }

// 아이콘은 전부 Tabler 외곽선 아이콘 한 종류로 통일 (이모지·채운 아이콘 섞지 않기)
const ITEM = {
  dashboard:     { href: '/teacher/dashboard',      label: '대시보드',     icon: 'ti-layout-dashboard' },
  announcements: { href: '/teacher/announcements',  label: '공지사항',     icon: 'ti-speakerphone' },
  manual:        { href: '/teacher/manual',         label: '사용 매뉴얼',  icon: 'ti-book-2' },
  notes:         { href: '/teacher/learning-notes', label: '학습관리',     icon: 'ti-notebook' },
  weekly:        { href: '/teacher/weekly',         label: '학습현황',     icon: 'ti-calendar-week' },
  myRecords:     { href: '/teacher/my-records',     label: '내 기록',      icon: 'ti-history' },
  bulk:          { href: '/teacher/bulk-progress',  label: '진도일괄입력', icon: 'ti-list-check' },
  visualAids:    { href: '/teacher/visual-aids',    label: '수업 시각화',  icon: 'ti-cube' },
  students:      { href: '/teacher/students',       label: '학생관리',     icon: 'ti-users' },
  curriculum:    { href: '/teacher/curriculum',     label: '과정관리',     icon: 'ti-books' },
  consultations: { href: '/teacher/consultations',  label: '상담내역',     icon: 'ti-message-circle' },
  schools:       { href: '/teacher/schools',        label: '학교 자료집',  icon: 'ti-school' },
  // ★ 「학습지 배부」(이 화면)와 「학습지 출제」(원장 전용)는 이름이 거의 같아 헷갈렸다.
  //   하는 일을 이름에 넣어 갈랐다 (원장님 2026-10-26).
  assignments:   { href: '/teacher/assignments',    label: '학습지 배부',  icon: 'ti-file-text' },
  exams:         { href: '/teacher/exams',          label: '평가관리',     icon: 'ti-clipboard-check' },
  // 화면 제목이 「시험대비 관리」인데 메뉴만 「시험배정」이라 서로 달랐다. 화면 쪽에 맞췄다.
  examPrep:      { href: '/teacher/exam-prep',      label: '시험대비',     icon: 'ti-target' },
  examAnalysis:  { href: '/teacher/exam-analysis',  label: '시험지 분석',  icon: 'ti-file-analytics' },
  reports:       { href: '/teacher/reports',        label: '보고서',       icon: 'ti-chart-bar' },
  importRecords: { href: '/teacher/import-records', label: '학습기록가져오기', icon: 'ti-file-import' },
  // ★ 「학습지출제」와 「출제한 학습지」를 한 메뉴로 합쳤다 (원장님 2026-10-22).
  //   안에서 탭으로 간다 — 내 학습지 / 개별과제 / 학습지 현황 / 새 학습지 만들기
  //   (components/teacher/WorksheetTabs.tsx).
  worksheets:    { href: '/teacher/worksheets',     label: '학습지 출제',  icon: 'ti-files' },
  survey:        { href: '/teacher/survey',         label: '학부모 설문',  icon: 'ti-clipboard-text' },
  typeConcepts:  { href: '/teacher/type-concepts',  label: '대표개념 연결', icon: 'ti-bulb' },
  gradings:      { href: '/teacher/gradings',       label: '채점결과',     icon: 'ti-checkbox' },
  scan:          { href: '/teacher/scan',           label: 'QR 채점',      icon: 'ti-qrcode' },
  workStatus:    { href: '/teacher/work-status',    label: '업무현황',     icon: 'ti-briefcase' },
  // 상담 중에 반을 배정하려고 보는 전체 시간표. 학원 전체 인원과 다른 강사 학생이 드러나므로
  // 원장 전용이다 (원장님 2026-10-28 「나만 보이는 화면으로」).
  classMap:      { href: '/teacher/class-map',      label: '반배정 시간표', icon: 'ti-calendar-time' },
  attendance:    { href: '/teacher/attendance',     label: '출결관리',     icon: 'ti-calendar-check' },
  changeLog:     { href: '/teacher/change-log',     label: '변경 기록',    icon: 'ti-history' },
  settings:      { href: '/teacher/settings',       label: '설정',         icon: 'ti-settings' },
} satisfies Record<string, NavItem>

// 같은 성격끼리 묶는다. 업무현황·학습지 출제·채점결과·설정은 원장 전용 화면이라(강사가 들어가면
// "관리자만 접근" 안내만 뜸) 원장(관리자 모드)에게만 '원장 전용' 묶음으로 보인다.
//
// 2026-10-26 정리 (원장님) — 메뉴가 23개까지 늘어 매일 쓰는 것이 묻혔다.
//   · 출결관리는 '보고'가 아니라 '학생' 쪽으로 (학생을 보다가 바로 넘어간다)
//   · 내 기록은 '수업'이 아니라 '보고' 쪽으로 (남이 아니라 내 것을 돌아보는 화면)
//   · 학습기록 가져오기·대표개념 연결·변경 기록은 가끔 쓰므로 접어 둔다
function buildNavGroups(admin: boolean, showBulk: boolean): NavGroup[] {
  const groups: NavGroup[] = [
    { title: null, items: [ITEM.dashboard, ITEM.announcements, ITEM.manual] },
    { title: '수업', items: [ITEM.notes, ITEM.weekly, ...(showBulk ? [ITEM.bulk] : []), ITEM.visualAids] },
    { title: '학생', items: [ITEM.students, ITEM.curriculum, ITEM.attendance, ITEM.consultations, ITEM.schools] },
    { title: '과제 · 평가', items: [ITEM.assignments, ITEM.exams, ITEM.examPrep, ITEM.examAnalysis] },
    { title: '보고', items: [ITEM.reports, ITEM.myRecords] },
  ]
  if (admin) {
    groups.push({ title: '원장 전용', items: [ITEM.classMap, ITEM.worksheets, ITEM.gradings, ITEM.scan, ITEM.survey, ITEM.workStatus, ITEM.settings] })
    groups.push({ title: '가끔 쓰는 것', collapsed: true, items: [ITEM.importRecords, ITEM.typeConcepts, ITEM.changeLog] })
  } else {
    // 강사도 학습기록 가져오기는 쓴다. 나머지 둘은 원장 전용 화면이라 넣지 않는다.
    groups.push({ title: '가끔 쓰는 것', collapsed: true, items: [ITEM.importRecords] })
  }
  return groups
}

// 모바일 하단탭 4개 (나머지는 더보기)
const MOBILE_MAIN: NavItem[] = [ITEM.dashboard, ITEM.students, ITEM.notes, ITEM.myRecords]

export function TeacherSidebar() {
  const pathname = usePathname()
  const { currentUser, signOut, isAdmin, adminMode, toggleAdminMode, isSupervisorAccount, supervisorMode, toggleSupervisorMode, supervisorLabel } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const [bulkEnabled, setBulkEnabled] = useState(false)
  // 접어 둔 묶음('가끔 쓰는 것')을 펼쳐 놓았는지. 그 안의 화면에 들어가 있으면 저절로 펼친다.
  const [openRare, setOpenRare] = useState(false)
  // 강사가 올린 교재 삭제요청 건수(원장님만). 푸시를 못 받는 기기에서도 눈에 띄게 하려고 메뉴에 달아 둔다.
  const [deleteRequests, setDeleteRequests] = useState(0)
  // 선생님이 올린 시간표 변경요청 건수(원장님만) — 같은 이유로 메뉴에 달아 둔다.
  const [schedRequests, setSchedRequests] = useState(0)

  useEffect(() => {
    async function fetchBulkSetting() {
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'bulk_progress_enabled').single()
      if (data) setBulkEnabled(data.value === true || data.value === 'true')
    }
    fetchBulkSetting()
  }, [])

  useEffect(() => {
    // 모드를 따른다 — 강사 모드로 보실 때는 강사 화면과 같아야 하고,
    // 그때는 목록도 담당 학생것만 뜨기 때문에 숫자가 안 맞는다.
    if (!isAdmin()) { setDeleteRequests(0); setSchedRequests(0); return }
    let alive = true
    apiFetch('/api/textbook-delete-request')
      .then((r) => r.json())
      .then((j) => { if (alive) setDeleteRequests(Number(j?.count ?? 0)) })
      .catch(() => {})
    apiFetch('/api/schedule-change-request')
      .then((r) => r.json())
      .then((j) => { if (alive) setSchedRequests(Number(j?.count ?? 0)) })
      .catch(() => {})
    return () => { alive = false }
  }, [currentUser, adminMode, pathname])

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
                : { background: 'white', color: '#9ca3af', border: '1px solid #e5e7eb' }}>
              {/* ★ 꺼졌을 때도 「주임」이라고 적는다. 예전엔 「강사 모드」라고 적어서
                  바로 위 관리자 단추가 꺼졌을 때와 글자가 똑같았다. */}
              <i className={supervisorMode ? 'ti ti-eye' : 'ti ti-eye-off'} style={{ fontSize: 13 }} />
              {`${supervisorLabel()} 모드`}{supervisorMode ? '' : ' 꺼짐'}
            </button>
          </div>
        )}

        {/* 네비게이션 */}
        <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          {navGroups.map((group, gi) => {
            // 접힌 묶음은 그 안의 화면을 보고 있을 때만 저절로 펼쳐진다
            const inside = group.collapsed && group.items.some((i) => isActiveHref(i.href))
            const shown = !group.collapsed || openRare || inside
            return (
            <div key={group.title ?? 'top'} className={gi > 0 ? 'mt-3 pt-3' : ''}
              style={gi > 0 ? { borderTop: '1px solid #e5e7eb' } : undefined}>
              {group.title && (group.collapsed ? (
                <button onClick={() => setOpenRare((v) => !v)}
                  className="w-full px-3 pb-1 text-[10px] font-bold tracking-wider flex items-center gap-1"
                  style={{ color: '#9ca3af' }}>
                  <i className={`ti ${shown ? 'ti-chevron-down' : 'ti-chevron-right'}`} style={{ fontSize: 11 }} />
                  {group.title}
                </button>
              ) : (
                <p className="px-3 pb-1 text-[10px] font-bold tracking-wider"
                  style={{ color: group.title === '원장 전용' ? '#0F6E56' : '#9ca3af' }}>
                  {group.title}
                </p>
              ))}
              <div className="space-y-0.5" style={shown ? undefined : { display: 'none' }}>
                {group.items.map((item) => {
                  const isActive = isActiveHref(item.href)
                  // ★ 삭제요청 뱃지는 **그 건들만 모아 보는 화면**으로 따로 간다.
                  //   과정관리로만 보내면 전체 학생 목록이 떠서 36건을 또 찾아다녀야 한다(원장님 2026-10-27).
                  //   <Link> 안에 <Link> 를 넣을 수 없어 줄을 감싸고 두 개를 나란히 둔다.
                  if (item.href === ITEM.curriculum.href && deleteRequests > 0) {
                    return (
                      <div key={item.href} className="flex items-center gap-1 rounded-xl"
                        style={isActive ? { background: '#9FE1CB', borderLeft: '3px solid #085041' }
                                        : { borderLeft: '3px solid transparent' }}>
                        <Link href={item.href}
                          className="flex items-center gap-2.5 pl-3 py-2 text-sm font-medium flex-1 min-w-0"
                          style={{ color: isActive ? '#085041' : '#4b5563', fontWeight: isActive ? 600 : 500 }}>
                          <i className={`ti ${item.icon}`} style={{ fontSize: 17, width: 18, textAlign: 'center',
                            color: isActive ? '#085041' : '#6b7280' }} />
                          {item.label}
                        </Link>
                        {/* ★ <Link> 가 아니라 <a> 다. 이미 과정관리 화면에 있으면 <Link> 는 주소의 ?delete=1 만
                            바꾸고 화면을 다시 그리지 않아서, 눌러도 전체 목록이 그대로 떠 있었다(원장님 2026-10-28).
                            <a> 는 화면을 새로 열어 주므로 어디서 눌러도 같게 동작한다. */}
                        <a href={`${item.href}?delete=1`} title="삭제요청만 모아 보기"
                          className="text-[10px] font-bold px-1.5 py-0.5 mr-2 rounded-lg shrink-0"
                          style={{ background: '#FEE2E2', color: '#991B1B' }}>
                          삭제요청 {deleteRequests}
                        </a>
                      </div>
                    )
                  }
                  // 시간표 변경요청도 교재 삭제요청과 같은 꼴로 보여 준다. 학생관리 화면
                  // 맨 위에 요청 목록이 뜨므로 주소는 그대로 둔다.
                  if (item.href === ITEM.students.href && schedRequests > 0) {
                    return (
                      <div key={item.href} className="flex items-center gap-1 rounded-xl"
                        style={isActive ? { background: '#9FE1CB', borderLeft: '3px solid #085041' }
                                        : { borderLeft: '3px solid transparent' }}>
                        <Link href={item.href}
                          className="flex items-center gap-2.5 pl-3 py-2 text-sm font-medium flex-1 min-w-0"
                          style={{ color: isActive ? '#085041' : '#4b5563', fontWeight: isActive ? 600 : 500 }}>
                          <i className={`ti ${item.icon}`} style={{ fontSize: 17, width: 18, textAlign: 'center',
                            color: isActive ? '#085041' : '#6b7280' }} />
                          {item.label}
                        </Link>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 mr-2 rounded-lg shrink-0"
                          style={{ background: '#D7F3E8', color: '#085041' }}>
                          시간표요청 {schedRequests}
                        </span>
                      </div>
                    )
                  }
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
            )
          })}
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

      {/* ★ 모바일 모드 단추는 여기서 **떠 있지 않다**.
          예전에는 관리자 단추와 주임 단추가 둘 다 `fixed top-3 right-3` 이었다.
          원장님은 admin 이라 두 조건을 다 만족해서 같은 자리에 겹쳐 그려졌고,
          나중에 그려지는 주임 단추가 덮어 관리자 단추는 아예 눌리지 않았다
          (원장님 2026-10-22 「관리자모드 변환이 안된다 … 버튼이 겹쳐져서 눌려」).
          지금은 화면 머리글 줄 안(components/common/Header.tsx → ModeToggle)에 들어간다. */}

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
