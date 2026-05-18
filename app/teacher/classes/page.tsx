'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface Schedule {
  id: string
  student_id: string
  day_of_week: string
  start_time: string
  periods: number
}

const DAYS = ['월', '화', '수', '목', '금', '토']

const GRADE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  '초1': { bg: '#fffde7', border: '#ffe082', text: '#f57f17' },
  '초2': { bg: '#fff9c4', border: '#ffd54f', text: '#f57f17' },
  '초3': { bg: '#fff176', border: '#ffca28', text: '#e65100' },
  '초4': { bg: '#ffe0b2', border: '#ffb74d', text: '#e65100' },
  '초5': { bg: '#ffcc80', border: '#ffa726', text: '#bf360c' },
  '초6': { bg: '#ffb300', border: '#ff8f00', text: '#bf360c' },
  '중1': { bg: '#e8f5e9', border: '#a5d6a7', text: '#2e7d32' },
  '중2': { bg: '#c8e6c9', border: '#66bb6a', text: '#1b5e20' },
  '중3': { bg: '#a5d6a7', border: '#43a047', text: '#1b5e20' },
  '고1': { bg: '#ffebee', border: '#ef9a9a', text: '#c62828' },
  '고2': { bg: '#ffcdd2', border: '#e57373', text: '#b71c1c' },
  '고3': { bg: '#ef9a9a', border: '#e53935', text: '#7f0000' },
  'default': { bg: '#f5f5f5', border: '#bdbdbd', text: '#424242' },
}

export default function TeacherClassesPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState('월')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [{ data: sData }, { data: scData }] = await Promise.all([
        supabase.from('students').select('*').eq('is_active', true).order('name'),
        supabase.from('schedules').select('*').eq('is_active', true),
      ])
      if (sData) setStudents(sData)
      if (scData) setSchedules(scData)
      setLoading(false)
    }
    fetchData()
  }, [])

  // 담당 학생 필터
  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    return s.teacher_name === currentUser?.name
  })

  // 선택된 요일의 시간표
  const daySchedules = schedules.filter((sc) => {
    const student = myStudents.find((s) => s.id === sc.student_id)
    return sc.day_of_week === selectedDay && student
  })

  // 시간대별 그룹핑
  const times = [...new Set(daySchedules.map((sc) => sc.start_time))].sort()

  // 요일별 학생 수
  const dayCount = (day: string) => {
    return schedules.filter((sc) => {
      const student = myStudents.find((s) => s.id === sc.student_id)
      return sc.day_of_week === day && student
    }).length
  }

  function getStudent(studentId: string) {
    return myStudents.find((s) => s.id === studentId)
  }

  return (
    <div>
      <Header
        title="반 관리"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
      />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 요일 탭 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {DAYS.map((day) => {
            const count = dayCount(day)
            return (
              <button key={day} onClick={() => setSelectedDay(day)}
                className={cx('px-4 py-2 rounded-xl text-sm font-semibold border whitespace-nowrap transition-all flex flex-col items-center',
                  selectedDay === day ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                <span>{day}요일</span>
                {count > 0 && (
                  <span className={cx('text-[10px] font-bold mt-0.5',
                    selectedDay === day ? 'text-blue-100' : 'text-gray-400')}>
                    {count}명
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : times.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📅</p>
            <p className="text-sm font-semibold text-gray-600">{selectedDay}요일 수업이 없어요</p>
          </div>
        ) : (
          <div className="space-y-4">
            {times.map((time) => {
              const studentsAtTime = daySchedules
                .filter((sc) => sc.start_time === time)
                .map((sc) => ({ schedule: sc, student: getStudent(sc.student_id)! }))
                .filter((x) => x.student)
                .sort((a, b) => a.student.name.localeCompare(b.student.name))

              if (studentsAtTime.length === 0) return null

              // 대표 교시 수
              const periods = studentsAtTime[0].schedule.periods

              return (
                <div key={time} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* 시간 헤더 */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-sm font-black">{time.slice(0,5)}</span>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-800">{time.slice(0,5)} 수업</p>
                      <p className="text-xs text-gray-400">{periods}교시 · {studentsAtTime.length}명</p>
                    </div>
                  </div>

                  {/* 학생 목록 */}
                  <div className="p-3 flex flex-wrap gap-2">
                    {studentsAtTime.map(({ student, schedule }) => {
                      const color = GRADE_COLORS[student.grade] ?? GRADE_COLORS['default']
                      return (
                        <div key={student.id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl"
                          style={{ backgroundColor: color.bg, borderLeft: `3px solid ${color.border}` }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0"
                            style={{ backgroundColor: color.border }}>
                            {student.name[0]}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{student.name}</p>
                            <p className="text-[10px] font-semibold" style={{ color: color.text }}>
                              {student.grade} · {student.school || '-'}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* 요약 */}
            <div className="bg-blue-50 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-blue-800">{selectedDay}요일 전체</p>
                <p className="text-xs text-blue-500 mt-0.5">{times.length}타임 · {dayCount(selectedDay)}명</p>
              </div>
              <div className="flex gap-3">
                {['초등', '중등', '고등'].map((level) => {
                  const count = daySchedules.filter((sc) => {
                    const s = getStudent(sc.student_id)
                    return s && (
                      level === '초등' ? s.grade.includes('초') :
                      level === '중등' ? s.grade.includes('중') :
                      s.grade.includes('고')
                    )
                  }).length
                  if (count === 0) return null
                  return (
                    <div key={level} className="text-center">
                      <p className="text-lg font-black text-blue-700">{count}</p>
                      <p className="text-[10px] text-blue-400">{level}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
