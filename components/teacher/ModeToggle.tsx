'use client'

import { useAuth } from '@/hooks/useAuth'

/**
 * 모바일 머리글의 모드 단추 (관리자↔강사 · 주임 켜기/끄기).
 *
 * ★ 예전에는 두 단추가 **둘 다** `fixed top-3 right-3` 이었다.
 *   원장님은 admin 이라 두 조건을 다 만족해서 **같은 자리에 겹쳐** 그려졌고,
 *   나중에 그려지는 주임 단추가 위를 덮어 관리자 단추는 아예 눌리지 않았다
 *   (원장님 2026-10-22 「관리자모드 변환이 안된다 … 버튼이 겹쳐져서 눌려」).
 *   게다가 떠 있는 자리가 화면 머리글의 알림 종과도 겹쳤다.
 *
 * → 이제 떠 있지 않고 **머리글 줄 안에** 종과 나란히 들어간다. 겹칠 자리가 없다.
 */
export default function ModeToggle({ className = '' }: { className?: string }) {
  const {
    currentUser, adminMode, toggleAdminMode,
    isSupervisorAccount, supervisorMode, toggleSupervisorMode, supervisorLabel,
  } = useAuth()

  const showAdmin = currentUser?.role === 'admin'
  const showSup = isSupervisorAccount()
  if (!showAdmin && !showSup) return null

  const pill = 'text-[10px] font-bold px-2.5 py-1.5 rounded-full shrink-0 whitespace-nowrap flex items-center gap-1 transition-all'

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {showAdmin && (
        <button onClick={toggleAdminMode} className={pill}
          style={adminMode
            ? { background: '#085041', color: 'white', border: '1px solid #085041' }
            : { background: '#F5C4B3', color: '#712B13', border: '1px solid #F5C4B3' }}>
          <i className={adminMode ? 'ti ti-crown' : 'ti ti-user'} style={{ fontSize: 11 }} />
          {adminMode ? '관리자' : '강사'}
        </button>
      )}
      {showSup && (
        // ★ 켜짐·꺼짐 모두 「주임」이라고 적는다. 예전엔 꺼졌을 때 「강사」라고 적어서
        //   옆의 관리자 단추가 꺼졌을 때와 **글자가 똑같았다** — 어느 쪽인지 알 수 없었다.
        <button onClick={toggleSupervisorMode} className={pill}
          style={supervisorMode
            ? { background: '#1D4ED8', color: 'white', border: '1px solid #1D4ED8' }
            : { background: 'white', color: '#9ca3af', border: '1px solid #e5e7eb' }}>
          <i className={supervisorMode ? 'ti ti-eye' : 'ti ti-eye-off'} style={{ fontSize: 11 }} />
          {/* 단추가 둘 다 뜨는 분(원장님)께는 「주임」으로 줄인다 — 머리글이 좁아 이름이 잘린다.
              주임 선생님은 단추가 하나뿐이라 담당 범위(「중등주임」)를 그대로 보여 드린다. */}
          {showAdmin ? '주임' : supervisorLabel() ?? '주임'}
        </button>
      )}
    </div>
  )
}
