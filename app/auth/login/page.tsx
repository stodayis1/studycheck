'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

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

  // 저장된 로그인 정보 불러오기
  useEffect(() => {
    const saved = localStorage.getItem('studycheck_remember')
    if (saved) {
      const { mode: savedMode, loginId: savedId, password: savedPw } = JSON.parse(saved)
      setMode(savedMode)
      setLoginId(savedId)
      setPassword(savedPw)
      setRememberMe(true)
    }
  }, [])

  // 이름 입력 시 동명이인 체크
  async function checkDuplicate(name: string) {
    if (mode === 'teacher' || name.length < 2) {
      setIsDuplicate(false)
      return
    }
    const { data } = await supabase
      .from('students')
      .select('id')
      .eq('name', name.trim())
      .eq('is_active', true)
    setIsDuplicate((data?.length ?? 0) > 1)
  }

  async function handleLogin() {
    setError('')
    setLoading(true)

    try {
      if (mode === 'teacher') {
        const { error } = await supabase.auth.signInWithPassword({
          email: loginId,
          password,
        })
        if (error) throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
        // 로그인 정보 저장
        if (rememberMe) {
          localStorage.setItem('studycheck_remember', JSON.stringify({ mode, loginId, password }))
        } else {
          localStorage.removeItem('studycheck_remember')
        }
        router.push('/teacher/dashboard')

      } else {
        // 학생/학부모 로그인
        const { data: student } = await supabase
          .from('students')
          .select('*')
          .eq('login_id', loginId.trim())
          .eq('is_active', true)
          .maybeSingle()

        if (!student) {
          // 동명이인 안내
          const name = loginId.trim()
          const { data: duplicates } = await supabase
            .from('students')
            .select('id')
            .eq('name', name)
            .eq('is_active', true)

          if ((duplicates?.length ?? 0) > 1) {
            throw new Error(`"${name}" 이름의 학생이 여러 명이에요!\n전화번호 뒷 4자리를 이름 뒤에 붙여주세요.\n예) ${name}1234`)
          }
          throw new Error('아이디를 찾을 수 없어요. 학원에 문의해주세요.')
        }

        // 비밀번호 확인 (전화번호 뒷 4자리)
        const phone = student.parent_phone ?? ''
        const last4 = phone.replace(/[^0-9]/g, '').slice(-4)

        if (password !== last4) throw new Error('비밀번호가 올바르지 않습니다.\n보호자 전화번호 뒷 4자리를 입력해주세요.')

        sessionStorage.setItem('studycheck_student', JSON.stringify({
          id: student.id,
          name: student.name,
          role: mode,
        }))

        // 로그인 정보 저장
        if (rememberMe) {
          localStorage.setItem('studycheck_remember', JSON.stringify({ mode, loginId, password }))
        } else {
          localStorage.removeItem('studycheck_remember')
        }

        if (mode === 'student') router.push('/student/dashboard')
        else router.push('/parent/dashboard')
      }
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f3ee] to-white flex flex-col items-center justify-center px-4">

      {/* 로고 */}
      <div className="mb-8 text-center">
        <img src="/logo.png" alt="수학의지혜" className="h-24 object-contain mb-2 mx-auto" />
        <p className="text-sm text-gray-500 font-medium">과제 관리 플랫폼</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-md border border-gray-100 p-6">

        {/* 역할 선택 */}
        <div className="grid grid-cols-3 gap-2 mb-5">
          {[
            { key: 'teacher', label: '선생님', icon: '👩‍🏫' },
            { key: 'student', label: '학생',   icon: '📚' },
            { key: 'parent',  label: '학부모', icon: '👨‍👩‍👧' },
          ].map((m) => (
            <button key={m.key}
              onClick={() => { setMode(m.key as LoginMode); setError(''); setLoginId(''); setPassword(''); setIsDuplicate(false) }}
              className={cx('py-2.5 rounded-xl text-xs font-bold border transition-all flex flex-col items-center gap-1',
                mode === m.key ? 'bg-[#1a2f5e] text-white border-[#1a2f5e]' : 'bg-gray-50 text-gray-500 border-gray-100 hover:border-gray-300')}>
              <span className="text-lg">{m.icon}</span>
              {m.label}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {/* 아이디 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {mode === 'teacher' ? '이메일' : '아이디 (이름)'}
            </label>
            <input
              type="text"
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value)
                if (mode !== 'teacher') checkDuplicate(e.target.value)
              }}
              placeholder={mode === 'teacher' ? 'teacher@test.com' : '예) 김환희'}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]"
            />
            {/* 동명이인 안내 */}
            {isDuplicate && mode !== 'teacher' && (
              <div className="mt-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5">
                <p className="text-xs font-bold text-orange-600">⚠️ 동명이인 안내</p>
                <p className="text-xs text-orange-500 mt-0.5">
                  같은 이름의 학생이 여러 명이에요!<br/>
                  전화번호 뒷 4자리를 이름 뒤에 붙여주세요.<br/>
                  <span className="font-bold">예) {loginId}1234</span>
                </p>
              </div>
            )}
          </div>

          {/* 비밀번호 */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {mode === 'teacher' ? '비밀번호' : '비밀번호 (보호자 전화번호 뒷 4자리)'}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder={mode === 'teacher' ? '비밀번호' : '예) 1234'}
              maxLength={mode === 'teacher' ? 100 : 4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2f5e]"
            />
          </div>

          {/* 안내문 */}
          {mode !== 'teacher' && !isDuplicate && (
            <div className="bg-blue-50 rounded-xl px-4 py-3">
              <p className="text-xs text-blue-600 font-medium">💡 로그인 안내</p>
              <p className="text-xs text-blue-500 mt-0.5">
                아이디: 학생 이름<br/>
                비밀번호: 보호자 전화번호 뒷 4자리
              </p>
            </div>
          )}

          {/* 에러 */}
          {error && (
            <div className="text-xs text-red-500 bg-red-50 px-3 py-2.5 rounded-xl whitespace-pre-line">
              {error}
            </div>
          )}

          {/* 로그인 정보 기억하기 */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="rememberMe" checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="w-4 h-4 accent-blue-600 cursor-pointer" />
            <label htmlFor="rememberMe" className="text-sm text-gray-500 cursor-pointer select-none">
              로그인 정보 기억하기
            </label>
          </div>

          <button onClick={handleLogin} disabled={loading || !loginId || !password}
            className="w-full py-3 bg-[#1a2f5e] text-white font-bold rounded-xl hover:bg-[#243d7a] disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            로그인
          </button>
        </div>

        {/* 선생님 테스트 계정 */}
        {mode === 'teacher' && (
          <div className="mt-4">
            <div className="flex items-center gap-3 my-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400">테스트 계정</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            <button onClick={() => { setLoginId('teacher@test.com'); setPassword('test1234') }}
              className="w-full py-2.5 rounded-xl text-xs font-semibold border bg-blue-50 border-blue-200 text-blue-700">
              👩‍🏫 선생님 테스트 로그인
            </button>
          </div>
        )}
      </div>
    </div>
  )
}