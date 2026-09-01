'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_KEY = 'studycheck_student'
const ADMIN_MODE_KEY = 'studycheck_admin_mode'
const SUPERVISOR_MODE_KEY = 'studycheck_supervisor_mode'

// 중등 학년 전체를 담당하는 주임인지 판별할 때 쓰는 기준 집합 (supervisor_grades가 이 셋과 정확히
// 같으면 "중등주임"으로, 한 학년만 있으면 "OO 학년주임"으로 표시함 - middle-school-only 가정)
const MIDDLE_GRADES = ['중1', '중2', '중3']

export function useAuth() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<any | null>(null)
  const [currentStudent, setCurrentStudent] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [role, setRole] = useState<'teacher' | 'student' | 'parent' | 'admin' | null>(null)
  const [adminMode, setAdminModeState] = useState<boolean>(true) // true=관리자, false=강사
  const [supervisorMode, setSupervisorModeState] = useState<boolean>(false) // true=주임모드(담당 범위 전체 조회), false=강사모드(내 학생만)

  useEffect(() => {
    const savedMode = localStorage.getItem(ADMIN_MODE_KEY)
    if (savedMode !== null) setAdminModeState(savedMode === 'true')
    const savedSupMode = localStorage.getItem(SUPERVISOR_MODE_KEY)
    if (savedSupMode !== null) setSupervisorModeState(savedSupMode === 'true')

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

  // 이 계정이 주임으로 지정되어 있는지 (원장님이 관리자 화면에서 supervisor_grades를 지정해줌)
  function isSupervisorAccount() {
    return Array.isArray(currentUser?.supervisor_grades) && currentUser.supervisor_grades.length > 0
  }

  const supervisorGrades: string[] = Array.isArray(currentUser?.supervisor_grades) ? currentUser.supervisor_grades : []

  // 주임모드가 실제로 켜져있는 상태인지 (계정이 주임이 아니면 토글값과 무관하게 항상 false)
  function isSupervisorModeActive() {
    return isSupervisorAccount() && supervisorMode
  }

  // 주임 표시용 라벨 - 담당 범위가 중1~중3 전부면 "중등주임", 한 학년만이면 "OO 학년주임"
  function supervisorLabel() {
    if (!isSupervisorAccount()) return null
    const g = supervisorGrades
    if (g.length === MIDDLE_GRADES.length && MIDDLE_GRADES.every((m) => g.includes(m))) return '중등주임'
    if (g.length === 1) return `${g[0]} 학년주임`
    return `${g.join('·')} 주임`
  }

  // 주임모드 토글 (강사모드 ↔ 주임모드)
  function toggleSupervisorMode() {
    const newMode = !supervisorMode
    setSupervisorModeState(newMode)
    localStorage.setItem(SUPERVISOR_MODE_KEY, String(newMode))
  }

  // 이 학생을 "볼" 권한이 있는지 - 화면마다 제각각 구현되어 있던 teacher_name 매칭 로직을 한 곳으로 모음.
  // admin/staff는 기존과 동일하게 전체를 봄. 주임모드가 켜진 주임 계정은 담당 학년 범위 내 학생을 봄
  // (수정/삭제 권한은 별개 - 이 함수는 "조회"만 판단하며, 실제 수정 가능 여부는 각 화면에서 isAdmin()/
  // canManageAllStudents()로 그대로 따로 체크해야 함).
  function canViewStudent(student: { grade?: string | null; teacher_name?: string | null }) {
    if (canManageAllStudents()) return true
    if (isSupervisorModeActive() && student.grade && supervisorGrades.includes(student.grade)) return true
    if (!currentUser?.name || !student.teacher_name) return false
    const teachers = student.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  }

  // 서버 조회용 - 지금 이 계정이 볼 수 있는 학년 범위. 'all'이면 전체 조회(관리자/직원),
  // 배열이면 그 학년들만 넓게 조회(주임모드), null이면 기존처럼 담당 학생(teacher_name)만 걸러야 함.
  function visibleGradeScope(): 'all' | string[] | null {
    if (canManageAllStudents()) return 'all'
    if (isSupervisorModeActive()) return supervisorGrades
    return null
  }

  return {
    currentUser, currentStudent, loading, role, signIn, signOut, isAdmin, canManageAllStudents, adminMode, toggleAdminMode,
    isSupervisorAccount, isSupervisorModeActive, supervisorMode, toggleSupervisorMode, supervisorGrades, supervisorLabel,
    canViewStudent, visibleGradeScope,
  }
}