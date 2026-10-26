'use client'

import { useAuth } from '@/hooks/useAuth'
import { TeacherSidebar } from './Sidebar'

// 계정을 잠근(is_locked) 강사는 로그인은 되지만 사이드바/메뉴 없이
// 이 안내 화면만 보이고 아무것도 클릭할 수 없다. (원장님 요청으로 특정 계정 접근 제한용)
export function AccessGate({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useAuth()

  // 인증 상태 확인 전에는 빈 화면만 - 잠긴 계정의 실제 화면이 잠깐이라도 보이지 않게
  if (loading) {
    return <div className="min-h-screen" style={{ background: '#f9fafb' }} />
  }

  // 선생님이 아닌 사람이 주소를 치고 들어온 경우 — 학생·학부모도 익명 로그인이라
  // Auth 세션은 갖고 있다. 데이터는 RLS 가 막지만 화면 구조와 메뉴는 그대로 보였다.
  // 여기서 먼저 세운다 (원장님 2026-10-27).
  if (!currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#F0FBF7' }}>
        <div className="rounded-2xl p-6 max-w-sm w-full text-center"
          style={{ background: '#fff', border: '1px solid #9FE1CB' }}>
          <p className="font-bold mb-1" style={{ color: '#085041' }}>선생님 전용 화면이에요</p>
          <p className="text-sm mb-4" style={{ color: '#0F6E56' }}>
            학생·학부모님은 로그인 화면에서 들어와주세요.
          </p>
          <a href="/auth/login"
            className="inline-block px-4 py-2 rounded-xl text-sm font-bold"
            style={{ background: '#0F6E56', color: '#fff' }}>
            로그인 화면으로
          </a>
        </div>
      </div>
    )
  }

  if (currentUser?.is_locked) {
    // 화면은 평소 대시보드 그대로 보이되, 투명 오버레이가 전체를 덮어서 아무것도 클릭/터치할 수 없게 막는다.
    return (
      <div style={{ position: 'relative' }}>
        <div className="flex min-h-screen bg-gray-50">
          <TeacherSidebar />
          <main className="flex-1 min-w-0 pb-16 md:pb-0">
            {children}
          </main>
        </div>
        <div
          onClick={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onKeyDown={(e) => e.preventDefault()}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'transparent', cursor: 'default' }}
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <TeacherSidebar />
      <main className="flex-1 min-w-0 pb-16 md:pb-0">
        {children}
      </main>
    </div>
  )
}
