'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

/**
 * 학습지 메뉴 안의 탭 — 원장님 2026-10-22
 *   「학습지 메뉴 안으로 들어가면 상단에 … 탭을 만들어주고, 거기서 +새 학습지 만들기를
 *     누르면 지금 학습지 출제 메뉴가 거기서 뜨는 거지」
 *
 * ★ 화면을 새로 만들지 않는다. 「개별과제」는 지금 학습지관리, 「학습지 현황」은 지금
 *   학습현황으로 그냥 간다. 똑같은 화면을 두 벌 만들면 한쪽만 고쳐지는 날이 온다.
 * ★ 원장님께만 보인다. 학습지 출제가 원장 전용이라, 강사에게 이 탭을 보여 주면
 *   눌러도 「관리자만 접근」만 뜬다. adminMode 토글이 아니라 **역할**로 본다 —
 *   원장님이 강사모드로 화면을 보시는 동안 탭이 사라지면 그게 더 혼란스럽다.
 */
const TABS = [
  { href: '/teacher/worksheets',     label: '내 학습지',   icon: 'ti-files' },
  { href: '/teacher/assignments',    label: '개별과제',     icon: 'ti-file-text' },
  { href: '/teacher/weekly',         label: '학습지 현황',  icon: 'ti-calendar-week' },
  { href: '/teacher/worksheets/new', label: '새 학습지 만들기', icon: 'ti-plus', primary: true },
]

export function WorksheetTabs() {
  const { currentUser } = useAuth()
  const path = usePathname()
  if (currentUser?.role !== 'admin') return null

  return (
    <div className="print:hidden border-b bg-white px-4">
      <div className="max-w-[1400px] mx-auto flex items-center gap-1 overflow-x-auto">
        {TABS.map((t) => {
          // 「내 학습지」는 /teacher/worksheets 딱 그 주소일 때만 (하위 화면까지 켜지면 안 된다)
          const on = t.href === '/teacher/worksheets'
            ? path === '/teacher/worksheets'
            : path === t.href || path.startsWith(t.href + '/')
          return (
            <Link key={t.href} href={t.href}
              className="shrink-0 px-3.5 py-3 text-sm font-bold whitespace-nowrap transition-colors"
              style={{
                color: on ? '#085041' : t.primary ? '#0F6E56' : '#9ca3af',
                borderBottom: `2.5px solid ${on ? '#085041' : 'transparent'}`,
              }}>
              <i className={`ti ${t.icon} align-[-0.125em] mr-1`} />{t.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
