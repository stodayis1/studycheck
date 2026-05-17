'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

interface NavItem {
  href: string; label: string; icon: string; activeIcon: string
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname()
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100">
      <div className="flex items-stretch h-16 max-w-lg mx-auto">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={item.href} className={cx('flex-1 flex flex-col items-center justify-center gap-1 transition-colors', isActive?'text-blue-600':'text-gray-400 hover:text-gray-600')}>
              <span className="text-xl leading-none">{isActive?item.activeIcon:item.icon}</span>
              <span className={cx('text-[10px] font-medium', isActive?'text-blue-600':'text-gray-400')}>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

export const STUDENT_NAV_ITEMS: NavItem[] = [
  { href:'/student/dashboard', label:'오늘 과제', icon:'☐', activeIcon:'☑' },
  { href:'/student/learning-notes', label:'배움노트', icon:'📓', activeIcon:'📓' },
  { href:'/student/assignments', label:'전체 과제', icon:'◎', activeIcon:'●' },
  { href:'/student/feedback', label:'피드백', icon:'○', activeIcon:'●' },
]

export const PARENT_NAV_ITEMS: NavItem[] = [
  { href:'/parent/dashboard', label:'현황', icon:'◎', activeIcon:'●' },
  { href:'/parent/learning-notes', label:'배움노트', icon:'📓', activeIcon:'📓' },
  { href:'/parent/assignments', label:'과제', icon:'☐', activeIcon:'☑' },
  { href:'/parent/reports', label:'리포트', icon:'◇', activeIcon:'◆' },
]