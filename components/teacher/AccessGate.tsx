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

  if (currentUser?.is_locked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: '#f9fafb' }}>
        <div className="text-center">
          <p className="text-lg font-bold" style={{ color: '#374151' }}>접근이 제한된 계정입니다</p>
          <p className="text-sm mt-2" style={{ color: '#9ca3af' }}>문의사항은 원장님께 말씀해주세요.</p>
        </div>
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
