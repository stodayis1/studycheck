'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface StudentInfo {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
  class_time: string
}

interface WorksheetRecord {
  id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  status: string
  worksheet_type: string
  score: number | null
  assigned_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:         { label: '과제중',    color: 'text-blue-600',   bg: 'bg-blue-50' },
  submitted:        { label: '채점대기',  color: 'text-orange-500', bg: 'bg-orange-50' },
  similar_assigned: { label: '오답유사',  color: 'text-purple-600', bg: 'bg-purple-50' },
  similar_submitted:{ label: '오답유사채점', color: 'text-pink-500', bg: 'bg-pink-50' },
  scored:           { label: '결과대기',  color: 'text-gray-500',   bg: 'bg-gray-50' },
  passed:           { label: '완료✓',    color: 'text-green-600',  bg: 'bg-green-50' },
  retry:            { label: '재도전',    color: 'text-red-500',    bg: 'bg-red-50' },
}

export default function ParentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [openSection, setOpenSection] = useState<string | null>('active')

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }

        const session = JSON.parse(stored)

        // 학생 정보 가져오기
        const { data: studentData } = await supabase
          .from('students')
          .select('*')
          .eq('id', session.id)
          .single()

        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        // 학습지 현황 가져오기
        const { data: wsData } = await supabase
          .from('student_worksheets')
          .select('*')
          .eq('student_id', session.id)
          .order('assigned_at', { ascending: false })

        if (wsData) setWorksheets(wsData)
      } catch {
        router.push('/auth/login')
      }
      setLoading(false)
    }
    init()
  }, [])

  function signOut() {
    sessionStorage.removeItem('studycheck_student')
    router.push('/auth/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!student) return null

  const activeWorksheets = worksheets.filter((w) => !['passed'].includes(w.status))
  const completedWorksheets = worksheets.filter((w) => w.status === 'passed')
  const completionRate = worksheets.length > 0
    ? Math.round((completedWorksheets.length / worksheets.length) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title={`${student.name} 학생`}
        subtitle="학부모 화면"
        action={
          <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600">
            로그아웃
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 자녀 프로필 */}
        <div className="bg-gradient-to-r from-[#1a2f5e] to-blue-500 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black text-white">{student.name[0]}</span>
            </div>
            <div>
              <p className="text-white font-black text-lg">{student.name}</p>
              <p className="text-blue-100 text-sm">{student.school} · {student.grade}</p>
              {student.teacher_name && (
                <p className="text-blue-200 text-xs mt-0.5">담당: {student.teacher_name} 선생님</p>
              )}
              {student.class_time && (
                <p className="text-blue-200 text-xs">수업: {student.class_time}</p>
              )}
            </div>
          </div>

          {/* 완료율 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-blue-100">학습지 완료율</span>
              <span className="text-white font-bold">{completedWorksheets.length}/{worksheets.length}개</span>
            </div>
            <div className="h-2.5 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700"
                style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '진행중', value: activeWorksheets.length, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '완료',   value: completedWorksheets.length, color: 'text-green-600', bg: 'bg-green-50' },
            { label: '전체',   value: worksheets.length, color: 'text-gray-700', bg: 'bg-gray-50' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={cx('rounded-2xl p-3 text-center', bg)}>
              <p className={cx('text-2xl font-black', color)}>{value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 진행중인 학습지 */}
        <Section
          title="📝 진행중인 학습지"
          count={activeWorksheets.length}
          isOpen={openSection === 'active'}
          onToggle={() => setOpenSection(openSection === 'active' ? null : 'active')}
        >
          {activeWorksheets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">진행중인 과제가 없어요</p>
          ) : (
            <div className="space-y-2">
              {activeWorksheets.map((w) => {
                const cfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.assigned
                return (
                  <div key={w.id} className={cx('rounded-xl border p-3.5', cfg.bg)}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{w.grade_level} {w.unit}</p>
                          {w.unit_name && <span className="text-xs text-gray-500">({w.unit_name})</span>}
                          {w.worksheet_type === 'similar' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-md">오답유사</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          <span className={cx('font-bold', w.current_level >= 4 ? 'text-orange-500' : 'text-blue-600')}>
                            {w.current_level}레벨
                          </span>
                          {w.current_level >= 4 && ' · 심화'}
                        </p>
                      </div>
                      <span className={cx('text-xs font-bold px-2 py-1 rounded-full shrink-0', cfg.color, cfg.bg)}>
                        {cfg.label}
                      </span>
                    </div>
                    {w.score != null && (
                      <p className={cx('text-sm font-black mt-2',
                        w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                        점수: {w.score}점
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* 완료한 학습지 */}
        <Section
          title="✅ 완료한 학습지"
          count={completedWorksheets.length}
          isOpen={openSection === 'completed'}
          onToggle={() => setOpenSection(openSection === 'completed' ? null : 'completed')}
        >
          {completedWorksheets.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">완료한 과제가 없어요</p>
          ) : (
            <div className="space-y-2">
              {completedWorksheets.map((w) => (
                <div key={w.id} className="bg-green-50 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-800">{w.grade_level} {w.unit}</p>
                    <p className="text-xs text-gray-400">{w.current_level}레벨</p>
                  </div>
                  <div className="text-right">
                    {w.score != null && (
                      <p className={cx('text-sm font-black',
                        w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                        {w.score}점
                      </p>
                    )}
                    <span className="text-xs text-green-500 font-bold">완료 ✓</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <p className="text-center text-xs text-gray-300 pb-2">학부모 화면은 읽기 전용입니다 🔒</p>
      </div>
    </div>
  )
}

function Section({ title, count, isOpen, onToggle, children }: {
  title: string
  count: number
  isOpen: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={onToggle} className="w-full px-4 py-3.5 flex items-center gap-2.5 border-b border-gray-50">
        <span className="text-sm font-bold text-gray-800 flex-1 text-left">{title}</span>
        <span className="text-xs font-bold text-gray-400">{count}개</span>
        <svg viewBox="0 0 12 8" className={cx('w-3 h-3 text-gray-400 transition-transform', isOpen ? 'rotate-180' : '')}
          fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1 1l5 5 5-5" />
        </svg>
      </button>
      {isOpen && <div className="px-4 py-3.5 space-y-2">{children}</div>}
    </div>
  )
}