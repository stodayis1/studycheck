'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_KEY = 'studycheck_student'

export function useAuth() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [currentStudent, setCurrentStudent] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student' | 'parent' | 'admin' | null>(null)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .single()

        const user = userData ?? {
          id: session.user.id,
          email: session.user.email,
          name: session.user.email,
          role: 'teacher'
        }
        setCurrentUser(user)
        setRole(user.role)
        setLoading(false)
        return
      }

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

    const { data: userData } = await supabase
      .from('users')
      .select('*')
      .eq('id', data.user.id)
      .single()

    const user = userData ?? {
      id: data.user.id,
      email: data.user.email,
      name: data.user.email,
      role: 'teacher'
    }
    setCurrentUser(user)
    setRole(user.role)
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

  // 관리자 또는 해당 선생님인지 확인
  function isAdmin() {
    return currentUser?.role === 'admin'
  }

  return { currentUser, currentStudent, loading, role, signIn, signOut, isAdmin }
}