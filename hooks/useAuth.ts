'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_KEY = 'studycheck_student'
const ADMIN_MODE_KEY = 'studycheck_admin_mode'

export function useAuth() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [currentStudent, setCurrentStudent] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student' | 'parent' | 'admin' | null>(null)
  const [adminMode, setAdminModeState] = useState<boolean>(true) // true=관리자, false=강사

  useEffect(() => {
    const savedMode = localStorage.getItem(ADMIN_MODE_KEY)
    if (savedMode !== null) setAdminModeState(savedMode === 'true')

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

  // 관리자 여부 (adminMode 고려)
  function isAdmin() {
    if (currentUser?.role !== 'admin') return false
    return adminMode
  }

  // 직원(staff)은 삭제 등 관리자 전용 기능은 못 쓰지만, 학생 목록/학생 정보 수정/수업(시간표) 배정/
  // 교재·학습지 배정 화면에서는 담당 강사로 지정된 학생만이 아니라 전체 학생을 보고 다뤄야 하는
  // 행정 업무 특성상 admin과 동일하게 전체 학생이 보여야 함. (관리자가 강사모드로 전환했을 때는
  // 여전히 본인 담당 학생만 보이도록 isAdmin()의 adminMode 로직은 그대로 둠)
  function canManageAllStudents() {
    return isAdmin() || currentUser?.role === 'staff'
  }

  // 관리자 모드 토글
  function toggleAdminMode() {
    const newMode = !adminMode
    setAdminModeState(newMode)
    localStorage.setItem(ADMIN_MODE_KEY, String(newMode))
  }

  return { currentUser, currentStudent, loading, role, signIn, signOut, isAdmin, canManageAllStudents, adminMode, toggleAdminMode }
}