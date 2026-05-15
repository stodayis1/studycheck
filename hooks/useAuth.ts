'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { User, UserRole } from '@/types'
import { MOCK_TEACHER } from '@/data/mockData'

const SESSION_KEY = 'studycheck_student'

export function useAuth() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [currentStudent, setCurrentStudent] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student' | 'parent' | null>(null)

  useEffect(() => {
    async function init() {
      // 선생님 세션 확인
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setCurrentUser(MOCK_TEACHER)
        setRole('teacher')
        setLoading(false)
        return
      }

      // 학생/학부모 세션 확인
      try {
        const stored = sessionStorage.getItem(SESSION_KEY)
        if (stored) {
          const data = JSON.parse(stored)
          setCurrentStudent(data)
          setRole(data.role)
        }
      } catch {}
      setLoading(false)
    }
    init()
  }, [])

  async function signIn(email: string, password: string): Promise<{ error?: string }> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
    setCurrentUser(MOCK_TEACHER)
    setRole('teacher')
    router.push('/teacher/dashboard')
    return {}
  }

  function signOut() {
    supabase.auth.signOut()
    sessionStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
    setCurrentStudent(null)
    setRole(null)
    router.push('/auth/login')
  }

  return { currentUser, currentStudent, loading, role, signIn, signOut }
}