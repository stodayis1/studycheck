'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { User, UserRole } from '@/types'
import { MOCK_TEACHER, MOCK_STUDENTS_USERS, MOCK_PARENT_USER } from '@/data/mockData'

const MOCK_ACCOUNTS: Record<string, { password: string; user: User }> = {
  'teacher@test.com':  { password: 'test1234', user: MOCK_TEACHER },
  'student1@test.com': { password: 'test1234', user: MOCK_STUDENTS_USERS[0] },
  'student2@test.com': { password: 'test1234', user: MOCK_STUDENTS_USERS[1] },
  'parent1@test.com':  { password: 'test1234', user: MOCK_PARENT_USER },
}

const SESSION_KEY = 'studycheck_mock_user'

function getRoleRedirectPath(role: UserRole): string {
  switch (role) {
    case 'teacher': return '/teacher/dashboard'
    case 'student': return '/student/dashboard'
    case 'parent':  return '/parent/dashboard'
  }
}

export function useAuth() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY)
      if (stored) setCurrentUser(JSON.parse(stored))
    } catch {}
    finally { setLoading(false) }
  }, [])

  async function signIn(email: string, password: string): Promise<{ error?: string }> {
    const account = MOCK_ACCOUNTS[email]
    if (!account || account.password !== password) {
      return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
    }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(account.user))
    setCurrentUser(account.user)
    router.push(getRoleRedirectPath(account.user.role))
    return {}
  }

  function signOut() {
    sessionStorage.removeItem(SESSION_KEY)
    setCurrentUser(null)
    router.push('/auth/login')
  }

  return { currentUser, loading, signIn, signOut }
}