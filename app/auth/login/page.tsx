'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

const QUICK_ACCOUNTS = [
  { label:'선생님', email:'teacher@test.com',  password:'test1234', color:'bg-blue-50 border-blue-200 text-blue-700' },
  { label:'학생',   email:'student1@test.com', password:'test1234', color:'bg-green-50 border-green-200 text-green-700' },
  { label:'학부모', email:'parent1@test.com',  password:'test1234', color:'bg-purple-50 border-purple-200 text-purple-700' },
]

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const result = await signIn(email, password)
    if (result.error) setError(result.error)
    setLoading(false)
  }

  async function handleQuickLogin(acc: typeof QUICK_ACCOUNTS[0]) {
    setLoading(true)
    await signIn(acc.email, acc.password)
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f5f3ee] to-white flex flex-col items-center justify-center px-4">

      {/* 로고 */}
      <div className="mb-8 text-center flex flex-col items-center">
        <img
          src="/logo.png"
          alt="수학의지혜"
          className="h-24 object-contain mb-2"
        />
        <p className="text-sm text-gray-500 font-medium">과제 관리 플랫폼</p>
      </div>

      {/* 로그인 카드 */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-md border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">이메일</label>
            <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}
              placeholder="이메일 주소 입력" required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2f5e] focus:border-transparent" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">비밀번호</label>
            <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)}
              placeholder="비밀번호 입력" required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2f5e] focus:border-transparent" />
          </div>
          {error && <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-3 bg-[#1a2f5e] text-white font-bold rounded-xl hover:bg-[#243d7a] disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
            로그인
          </button>
        </form>

        <div className="flex items-center gap-3 my-5">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400">테스트 계정</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {QUICK_ACCOUNTS.map((acc) => (
            <button key={acc.email} onClick={()=>handleQuickLogin(acc)} disabled={loading}
              className={cx('py-2.5 rounded-xl text-xs font-semibold border transition-all active:scale-95',
                acc.color, loading&&'opacity-50 cursor-not-allowed')}>
              {acc.label}
            </button>
          ))}
        </div>
        <p className="text-center text-[10px] text-gray-300 mt-3">비밀번호: test1234</p>
      </div>
    </div>
  )
}