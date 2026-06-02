'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type LoginMode = 'teacher' | 'student' | 'parent'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<LoginMode>('teacher')
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDuplicate, setIsDuplicate] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('studycheck_remember')
    if (saved) {
      const { mode: savedMode, loginId: savedId, password: savedPw } = JSON.parse(saved)
      setMode(savedMode); setLoginId(savedId); setPassword(savedPw); setRememberMe(true)
    }
  }, [])

  async function checkDuplicate(name: string) {
    if (mode === 'teacher' || name.length < 2) { setIsDuplicate(false); return }
    const { data } = await supabase.from('students').select('id').eq('name', name.trim()).eq('is_active', true)
    setIsDuplicate((data?.length ?? 0) > 1)
  }

  async function handleLogin() {
    setError(''); setLoading(true)
    try {
      if (mode === 'teacher') {
        const { error } = await supabase.auth.signInWithPassword({ email: loginId, password })
        if (error) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
        if (rememberMe) localStorage.setItem('studycheck_remember', JSON.stringify({ mode, loginId, password }))
        else localStorage.removeItem('studycheck_remember')
        router.push('/teacher/dashboard')
      } else {
        const { data: student } = await supabase.from('students').select('*')
          .eq('login_id', loginId.trim()).eq('is_active', true).maybeSingle()
        if (!student) {
          const name = loginId.trim()
          const { data: duplicates } = await supabase.from('students').select('id').eq('name', name).eq('is_active', true)
          if ((duplicates?.length ?? 0) > 1) throw new Error(`"${name}" 이름의 학생이 여러 명이에요!\n전화번호 뒷 4자리를 이름 뒤에 붙여주세요.\n예) ${name}1234`)
          throw new Error('아이디를 찾을 수 없어요. 학원에 문의해주세요.')
        }
        const phone = student.parent_phone ?? ''
        const last4 = phone.replace(/[^0-9]/g, '').slice(-4)
        if (password !== last4) throw new Error('비밀번호가 올바르지 않습니다.\n보호자 전화번호 뒷 4자리를 입력해주세요.')
        sessionStorage.setItem('studycheck_student', JSON.stringify({ id: student.id, name: student.name, role: mode }))
        if (rememberMe) localStorage.setItem('studycheck_remember', JSON.stringify({ mode, loginId, password }))
        else localStorage.removeItem('studycheck_remember')
        if (mode === 'student') router.push('/student/dashboard')
        else router.push('/parent/dashboard')
      }
    } catch (err: any) { setError(err.message) }
    setLoading(false)
  }

  const MODES = [
    { key: 'teacher', label: '선생님', icon: 'ti-chalkboard' },
    { key: 'student', label: '학생',   icon: 'ti-user-graduate' },
    { key: 'parent',  label: '학부모', icon: 'ti-users' },
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(160deg, #F0FBF7 0%, #ffffff 60%, #FFF5F8 100%)' }}>

      {/* 로고 */}
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="수학의지혜" className="h-48 object-contain mb-3 mx-auto" />
        <p className="text-sm font-medium" style={{ color: '#9ca3af' }}>학생·학부모·선생님을 위한 학원 통합 관리 플랫폼</p>
      </div>

      {/* 카드 */}
      <div className="w-full max-w-sm rounded-3xl p-6 space-y-5"
        style={{ background: 'white', boxShadow: '0 4px 24px rgba(159,225,203,0.2)', border: '1px solid #e5e7eb' }}>

        {/* 역할 선택 */}
        <div className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button key={m.key}
              onClick={() => { setMode(m.key as LoginMode); setError(''); setLoginId(''); setPassword(''); setIsDuplicate(false) }}
              className="py-3 rounded-2xl text-xs font-bold border-2 transition-all flex flex-col items-center gap-1.5"
              style={mode === m.key
                ? { background: '#9FE1CB', color: '#085041', borderColor: '#9FE1CB' }
                : { background: '#f9fafb', color: '#9ca3af', borderColor: '#f3f4f6' }}>
              <i className={`ti ${m.icon}`} style={{ fontSize: 20 }} />
              {m.label}
            </button>
          ))}
        </div>

        {/* 입력 폼 */}
        <div className="space-y-3">
          {/* 아이디 */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
              {mode === 'teacher' ? '이메일' : '아이디 (이름)'}
            </label>
            <input type="text" value={loginId}
              onChange={(e) => { setLoginId(e.target.value); if (mode !== 'teacher') checkDuplicate(e.target.value) }}
              placeholder={mode === 'teacher' ? '이메일을 입력하세요' : '예) 윤수지'}
              className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-all"
              style={{ borderColor: '#e5e7eb' }}
              onFocus={e => e.target.style.borderColor = '#9FE1CB'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
            {isDuplicate && mode !== 'teacher' && (
              <div className="mt-2 rounded-xl px-3 py-2.5" style={{ background: '#FAEEDA', border: '1px solid #EF9F27' }}>
                <p className="text-xs font-bold" style={{ color: '#633806' }}>⚠️ 동명이인 안내</p>
                <p className="text-xs mt-0.5" style={{ color: '#633806' }}>
                  같은 이름의 학생이 여러 명이에요!<br />
                  전화번호 뒷 4자리를 이름 뒤에 붙여주세요.<br />
                  <span className="font-bold">예) {loginId}1234</span>
                </p>
              </div>
            )}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: '#374151' }}>
              {mode === 'teacher' ? '비밀번호' : '비밀번호 (보호자 전화번호 뒷 4자리)'}
            </label>
            <input type="password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder={mode === 'teacher' ? '비밀번호' : '예) 1234'}
              maxLength={mode === 'teacher' ? 100 : 4}
              className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none transition-all"
              style={{ borderColor: '#e5e7eb' }}
              onFocus={e => e.target.style.borderColor = '#9FE1CB'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
          </div>

          {/* 학생/학부모 안내 */}
          {mode !== 'teacher' && !isDuplicate && (
            <div className="rounded-xl px-4 py-3" style={{ background: '#F0FBF7', border: '1px solid #9FE1CB40' }}>
              <p className="text-xs font-semibold" style={{ color: '#085041' }}>💡 로그인 안내</p>
              <p className="text-xs mt-0.5" style={{ color: '#0F6E56' }}>
                아이디: 학생 이름<br />
                비밀번호: 보호자 전화번호 뒷 4자리
              </p>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="rounded-xl px-3 py-2.5 text-xs whitespace-pre-line"
              style={{ background: '#fee2e2', color: '#991b1b' }}>
              {error}
            </div>
          )}

          {/* 기억하기 */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="rememberMe" checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 cursor-pointer"
              style={{ accentColor: '#9FE1CB' }} />
            <label htmlFor="rememberMe" className="text-xs cursor-pointer select-none" style={{ color: '#6b7280' }}>
              로그인 정보 기억하기
            </label>
          </div>

          {/* 로그인 버튼 */}
          <button onClick={handleLogin} disabled={loading || !loginId || !password}
            className="w-full py-3.5 rounded-2xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: '#9FE1CB', color: '#085041' }}>
            {loading && <span className="w-4 h-4 border-2 border-[#085041]/30 border-t-[#085041] rounded-full animate-spin" />}
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </div>

        {/* 테스트 계정 */}
        {mode === 'teacher' && (
          <div>
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: '#f3f4f6' }} />
              <span className="text-[10px]" style={{ color: '#d1d5db' }}>테스트 계정</span>
              <div className="flex-1 h-px" style={{ background: '#f3f4f6' }} />
            </div>
            <button onClick={async () => { setLoginId('test@test.com'); setPassword('test1234'); await new Promise(r => setTimeout(r, 100)); const { error } = await supabase.auth.signInWithPassword({ email: 'test@test.com', password: 'test1234' }); if (!error) router.push('/teacher/dashboard'); }}
              className="w-full py-2.5 rounded-xl text-xs font-semibold border transition-all"
              style={{ background: '#F0FBF7', color: '#085041', borderColor: '#9FE1CB40' }}>
              <i className="ti ti-chalkboard mr-1.5" style={{ fontSize: 13 }} />
              선생님 테스트 로그인
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-[10px]" style={{ color: '#d1d5db' }}>© 수학의 지혜 · StudyCheck</p>
    </div>
  )
}
