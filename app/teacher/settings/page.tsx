'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Profile {
  id: string
  login_id: string
  name: string
  email: string | null
  role: 'admin' | 'teacher' | 'staff'
  is_active: boolean
}

export default function SettingsPage() {
  const { currentUser, isAdmin } = useAuth()
  const router = useRouter()

  const [tab, setTab] = useState<'accounts' | 'system'>('accounts')

  // 계정 관리
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLoginId, setNewLoginId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'teacher' | 'staff'>('teacher')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [toast, setToast] = useState('')
  const [editProfile, setEditProfile] = useState<Profile | null>(null)
  const [editName, setEditName] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // 시스템 설정
  const [bulkEnabled, setBulkEnabled] = useState(false)
  const [togglingBulk, setTogglingBulk] = useState(false)

  useEffect(() => {
    fetchProfiles()
    fetchSettings()
  }, [])

  async function fetchProfiles() {
    setLoadingProfiles(true)
    const { data } = await supabase.from('profiles').select('*').order('role').order('name')
    setProfiles(data ?? [])
    setLoadingProfiles(false)
  }

  async function fetchSettings() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'bulk_progress_enabled').single()
    if (data) setBulkEnabled(data.value === true || data.value === 'true')
  }

  async function handleAddAccount() {
    if (!newName || !newLoginId || !newPassword) { setAddError('모든 항목을 입력해주세요.'); return }
    setAdding(true)
    setAddError('')

    // Supabase Auth에 사용자 생성
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: newLoginId,
      password: newPassword,
      email_confirm: true,
    })

    if (authError) {
      // admin API 없으면 signUp 사용
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: newLoginId,
        password: newPassword,
      })
      if (signUpError) { setAddError('계정 생성 실패: ' + signUpError.message); setAdding(false); return }

      // profiles 테이블에 저장
      const userId = signUpData.user?.id
      if (userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          login_id: newLoginId,
          name: newName,
          role: newRole,
          is_active: true,
        })
      }
    } else {
      const userId = authData.user?.id
      if (userId) {
        await supabase.from('profiles').upsert({
          id: userId,
          login_id: newLoginId,
          name: newName,
          role: newRole,
          is_active: true,
        })
      }
    }

    setAdding(false)
    setShowAddModal(false)
    setNewName(''); setNewLoginId(''); setNewPassword(''); setNewRole('teacher')
    showToast('✅ 계정이 추가됐어요!')
    fetchProfiles()
  }

  async function toggleActive(profile: Profile) {
    if (profile.id === currentUser?.id) { showToast('⚠ 본인 계정은 비활성화할 수 없어요'); return }
    await supabase.from('profiles').update({ is_active: !profile.is_active }).eq('id', profile.id)
    setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, is_active: !p.is_active } : p))
    showToast(profile.is_active ? '계정을 비활성화했어요' : '계정을 활성화했어요')
  }

  async function handleEditSave() {
    if (!editProfile) return
    setEditSaving(true)
    const updates: any = { name: editName }
    await supabase.from('profiles').update(updates).eq('id', editProfile.id)
    if (editPassword) {
      // 비밀번호 변경은 admin API 필요 - 여기서는 안내만
    }
    setEditSaving(false)
    setEditProfile(null)
    showToast('✅ 수정됐어요!')
    fetchProfiles()
  }

  async function toggleBulk() {
    setTogglingBulk(true)
    const newVal = !bulkEnabled
    await supabase.from('app_settings').update({ value: newVal }).eq('key', 'bulk_progress_enabled')
    setBulkEnabled(newVal)
    setTogglingBulk(false)
    showToast(newVal ? '진도 일괄입력이 활성화됐어요' : '진도 일괄입력이 비활성화됐어요')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const ROLE_LABEL: Record<string, string> = { admin: '관리자', teacher: '강사', staff: '직원' }
  const ROLE_COLOR: Record<string, { bg: string; color: string }> = {
    admin:   { bg: '#1a1a2e', color: 'white' },
    teacher: { bg: '#F0FBF7', color: '#085041' },
    staff:   { bg: '#FAEEDA', color: '#633806' },
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title="설정" subtitle="시스템 및 계정 관리" />

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">

        {/* 탭 */}
        <div className="flex gap-2">
          {([['accounts','계정 관리'],['system','시스템 설정']] as const).map(([t,l]) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={tab === t ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {l}
            </button>
          ))}
        </div>

        {/* ── 계정 관리 탭 ── */}
        {tab === 'accounts' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500">전체 {profiles.length}명</p>
              <button onClick={() => { setShowAddModal(true); setAddError('') }}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all"
                style={{ background: '#085041', color: 'white' }}>
                + 계정 추가
              </button>
            </div>

            {loadingProfiles ? (
              <p className="text-sm text-gray-400 text-center py-8">불러오는 중...</p>
            ) : (
              <div className="space-y-2">
                {profiles.map(p => {
                  const rc = ROLE_COLOR[p.role] ?? ROLE_COLOR.teacher
                  return (
                    <div key={p.id} className="rounded-2xl p-4 flex items-center gap-3"
                      style={{ background: 'white', border: '1px solid #f3f4f6', opacity: p.is_active ? 1 : 0.5 }}>
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                        style={{ background: rc.bg, color: rc.color }}>
                        {p.name?.[0] ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-gray-800">{p.name}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={rc}>{ROLE_LABEL[p.role]}</span>
                          {!p.is_active && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ background: '#f3f4f6', color: '#9ca3af' }}>비활성</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">ID: {p.login_id}</p>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditProfile(p); setEditName(p.name); setEditPassword('') }}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                          style={{ background: '#f3f4f6', color: '#374151' }}>
                          수정
                        </button>
                        {p.id !== currentUser?.id && (
                          <button onClick={() => toggleActive(p)}
                            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all"
                            style={p.is_active
                              ? { background: '#fee2e2', color: '#991b1b' }
                              : { background: '#EAF3DE', color: '#27500A' }}>
                            {p.is_active ? '비활성화' : '활성화'}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 시스템 설정 탭 ── */}
        {tab === 'system' && (
          <div className="space-y-3">
            {/* 진도 일괄입력 */}
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: bulkEnabled ? '#F0FBF7' : '#f3f4f6' }}>
                    <i className="ti ti-list-check" style={{ fontSize: 18, color: bulkEnabled ? '#085041' : '#9ca3af' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">진도 일괄입력</p>
                    <p className="text-[10px] text-gray-400">강사 전체에게 메뉴 {bulkEnabled ? '표시됨' : '숨겨짐'}</p>
                  </div>
                </div>
                <button onClick={toggleBulk} disabled={togglingBulk}
                  className="relative inline-flex items-center rounded-full transition-all duration-200"
                  style={{ width: 44, height: 24, background: bulkEnabled ? '#9FE1CB' : '#d1d5db', border: 'none', cursor: 'pointer' }}>
                  <span className="absolute rounded-full bg-white shadow transition-all duration-200"
                    style={{ width: 18, height: 18, left: bulkEnabled ? 22 : 3, top: 3 }} />
                </button>
              </div>
            </div>

            {/* 업무현황 바로가기 */}
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{ background: '#FAEEDA' }}>
                    <i className="ti ti-briefcase" style={{ fontSize: 18, color: '#633806' }} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-800">업무현황</p>
                    <p className="text-[10px] text-gray-400">강사별 수업일지 작성 현황</p>
                  </div>
                </div>
                <a href="/teacher/work-status"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold"
                  style={{ background: '#FAEEDA', color: '#633806' }}>
                  바로가기 →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 계정 추가 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowAddModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">계정 추가</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이름</label>
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="홍길동"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#9FE1CB]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이메일 (로그인 ID)</label>
                <input value={newLoginId} onChange={e => setNewLoginId(e.target.value)}
                  placeholder="example@naver.com"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#9FE1CB]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">초기 비밀번호</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="8자 이상"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#9FE1CB]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">역할</label>
                <div className="flex gap-2">
                  {(['teacher', 'staff'] as const).map(r => (
                    <button key={r} onClick={() => setNewRole(r)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                      style={newRole === r
                        ? { background: '#085041', color: 'white', borderColor: '#085041' }
                        : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {r === 'teacher' ? '강사' : '직원'}
                    </button>
                  ))}
                </div>
              </div>
              {addError && <p className="text-xs text-red-500">{addError}</p>}
              <button onClick={handleAddAccount} disabled={adding}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-all"
                style={{ background: adding ? '#e5e7eb' : '#085041', color: adding ? '#9ca3af' : 'white' }}>
                {adding ? '생성 중...' : '계정 생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 계정 수정 모달 */}
      {editProfile && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setEditProfile(null)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-5"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">{editProfile.name} 수정</h3>
              <button onClick={() => setEditProfile(null)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이름</label>
                <input value={editName} onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#9FE1CB]" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">이메일 (로그인 ID)</label>
                <input value={editProfile.login_id} disabled
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-100 text-sm bg-gray-50 text-gray-400" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">새 비밀번호 <span className="font-normal text-gray-400">(변경 시에만 입력)</span></label>
                <input type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)}
                  placeholder="변경하지 않으면 비워두세요"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-[#9FE1CB]" />
                {editPassword && (
                  <p className="text-[10px] text-orange-500 mt-1">⚠ 비밀번호 변경은 Supabase 대시보드에서 직접 해주세요.</p>
                )}
              </div>
              <button onClick={handleEditSave} disabled={editSaving}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-all"
                style={{ background: editSaving ? '#e5e7eb' : '#085041', color: editSaving ? '#9ca3af' : 'white' }}>
                {editSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium"
          style={{ background: '#085041', color: 'white', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
