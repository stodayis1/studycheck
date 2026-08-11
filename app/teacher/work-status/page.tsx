'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { fetchAllRows } from '@/lib/utils'

interface Teacher {
  id: string
  name: string
  email: string
  role: string
}

interface Student {
  id: string
  name: string
  grade: string
  school: string
  teacher_name: string
}

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  progress_content: string | null
}

interface Worksheet {
  id: string
  student_id: string
  status: string
  unit: string
  grade_level: string
  assigned_at: string
  score: number | null
}

interface Schedule {
  student_id: string
  day_of_week: string
  is_active: boolean
}

export default function TeacherWorkStatusPage() {
  const { currentUser, isAdmin } = useAuth()
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [worksheets, setWorksheets] = useState<Worksheet[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [viewTab, setViewTab] = useState<'today' | 'worksheets' | 'weekly'>('today')

  const todayStr = new Date().toISOString().split('T')[0]
  const DAYS = ['일','월','화','수','목','금','토']
  const todayDay = DAYS[new Date().getDay()]

  // 주차 관리
  const getWeekStart = (offset = 0) => {
    const d = new Date()
    d.setDate(d.getDate() + offset * 7)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    return new Date(d.setDate(diff)).toISOString().split('T')[0]
  }
  const [weekOffset, setWeekOffset] = useState(0)
  const weekStart = getWeekStart(weekOffset)
  const weekEnd = (() => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 6)
    return d.toISOString().split('T')[0]
  })()
  const weekLabel = (() => {
    const s = new Date(weekStart)
    const e = new Date(weekEnd)
    return `${s.getMonth()+1}/${s.getDate()} ~ ${e.getMonth()+1}/${e.getDate()}`
  })()

  useEffect(() => { fetchAll() }, [weekOffset])

  async function fetchAll() {
    setLoading(true)
    const [{ data: tData }, { data: sData }, { data: ssData }, wData, { data: scData }] = await Promise.all([
      supabase.from('users').select('*').eq('role', 'teacher').order('name'),
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('class_sessions').select('*').gte('session_date', weekStart).order('session_date', { ascending: false }),
      fetchAllRows(() => supabase.from('student_worksheets').select('*').not('status', 'in', '("passed")')),
      // '오늘 수업' 판정엔 활성 스케줄만 필요함(비활성은 예전에 바뀐 시간표 이력) - 서버에서 걸러서
      // 받으면 1000행 상한에도 안 걸려서 페이지 순회 없이 한 번에 가져올 수 있음.
      supabase.from('schedules').select('*').eq('is_active', true),
    ])
    if (tData) setTeachers(tData)
    if (sData) setStudents(sData)
    if (ssData) setSessions(ssData)
    if (wData) setWorksheets(wData)
    if (scData) setSchedules(scData)
    setLoading(false)
  }

  if (!isAdmin()) return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-gray-500">관리자만 접근 가능합니다</p>
    </div>
  )

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // 오늘 수업 있는 학생 (스케줄 기반)
  // is_active를 안 걸러서, 시간표를 수정하며 남은 예전(비활성) 스케줄 행까지 오늘 수업으로 잘못 세던 문제
  // (이규숙 선생님 - 김환희/시지우가 실제론 오늘 수업이 없는데 떴던 원인) - 활성 스케줄만 인정하도록 수정.
  const todayStudents = students.filter(s =>
    schedules.some(sc => sc.student_id === s.id && sc.day_of_week === todayDay && sc.is_active)
  )

  // 오늘 수업일지 작성된 학생
  const todayWritten = sessions.filter(s => s.session_date === todayStr)

  // 강사별 오늘 현황
  const teacherTodayStatus = teachers.map(t => {
    const myStudents = todayStudents.filter((s) => {
      if (!s.teacher_name) return false
      const teachers = s.teacher_name.split(/[,，、]/).map((x) => x.trim()).filter(Boolean)
      return teachers.includes(t.name)
    })
    const written = myStudents.filter(s => todayWritten.some(w => w.student_id === s.id))
    const unwritten = myStudents.filter(s => !todayWritten.some(w => w.student_id === s.id))
    return { teacher: t, total: myStudents.length, written: written.length, unwritten, myStudents }
  }).filter(t => t.total > 0)

  // 미처리 학습지
  const pendingScore = worksheets.filter(w => w.status === 'submitted' || w.status === 'similar_submitted')
  const longPending = worksheets.filter(w => {
    const days = Math.floor((Date.now() - new Date(w.assigned_at).getTime()) / 86400000)
    return (w.status === 'assigned' || w.status === 'similar_assigned') && days >= 5
  })
  const retrying = worksheets.filter(w => w.status === 'retry')

  // 이번주 수업일지 작성률
  const weeklyStats = teachers.map(t => {
    const myStudents = students.filter((s) => {
      if (!s.teacher_name) return false
      const teachers = s.teacher_name.split(/[,，、]/).map((x) => x.trim()).filter(Boolean)
      return teachers.includes(t.name)
    })
    const myScheduledDays = [...new Set(
      schedules.filter(sc => myStudents.some(s => s.id === sc.student_id)).map(sc => sc.day_of_week)
    )]
    const weekDays = ['월','화','수','목','금']
    const passedDays = weekDays.filter(d => {
      const dayIdx = ['월','화','수','목','금','토','일'].indexOf(d)
      return true // 이번주 지난 요일 체크는 복잡하므로 전체 기준
    })
    const mySessions = sessions.filter(s => myStudents.some(ms => ms.id === s.student_id))
    const expectedCount = myStudents.length * 2 // 주 2회 기준
    const rate = expectedCount > 0 ? Math.min(100, Math.round(mySessions.length / expectedCount * 100)) : 100
    return { teacher: t, sessions: mySessions.length, expected: expectedCount, rate }
  })

  // 전체 요약
  const totalUnwritten = teacherTodayStatus.reduce((sum, t) => sum + t.unwritten.length, 0)

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="업무 현황" subtitle="관리자 전용" />

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'today', label: '오늘 현황', icon: 'ti-calendar-today' },
            { key: 'worksheets', label: '미처리 학습지', icon: 'ti-file-alert' },
            { key: 'weekly', label: '주간 작성률', icon: 'ti-chart-bar' },
          ].map(t => (
            <button key={t.key} onClick={() => setViewTab(t.key as typeof viewTab)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
              style={viewTab === t.key
                ? { background: '#F5C4B3', color: '#712B13' }
                : { background: '#f3f4f6', color: '#9ca3af' }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 13 }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 오늘 현황 ── */}
        {viewTab === 'today' && (
          <div className="space-y-3">
            {/* 요약 */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '오늘 수업', value: todayStudents.length, unit: '명', color: '#712B13' },
                { label: '일지 작성', value: todayWritten.length, unit: '건', color: '#27500A' },
                { label: '미작성', value: totalUnwritten, unit: '건', color: totalUnwritten > 0 ? '#991b1b' : '#27500A' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}<span className="text-sm font-normal text-gray-400 ml-0.5">{s.unit}</span></p>
                  <p className="text-[11px] text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 강사별 현황 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-notebook" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold text-gray-700">강사별 수업일지 현황</h3>
                <span className="text-xs text-gray-400 ml-auto">{todayDay}요일 기준</span>
              </div>
              {teacherTodayStatus.length === 0 ? (
                <div className="p-6 text-center">
                  <p className="text-sm text-gray-400">오늘 수업 일정이 없어요</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {teacherTodayStatus.map(({ teacher, total, written, unwritten }) => (
                    <div key={teacher.id} className="px-4 py-3">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>
                          {teacher.name[0]}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-800">{teacher.name}</p>
                          <p className="text-[11px] text-gray-400">오늘 수업 {total}명</p>
                        </div>
                        {unwritten.length === 0 ? (
                          <span className="text-[11px] font-bold px-2 py-1 rounded-full"
                            style={{ background: '#EAF3DE', color: '#27500A' }}>완료</span>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-1 rounded-full"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>{unwritten.length}명 미작성</span>
                        )}
                      </div>
                      {/* 진도바 */}
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                          <div className="h-1.5 rounded-full transition-all"
                            style={{ width: `${total > 0 ? Math.round(written / total * 100) : 100}%`, background: unwritten.length === 0 ? '#639922' : '#EF9F27' }} />
                        </div>
                        <span className="text-[11px] font-bold" style={{ color: unwritten.length === 0 ? '#27500A' : '#993C1D' }}>
                          {written}/{total}
                        </span>
                      </div>
                      {/* 미작성 학생 목록 */}
                      {unwritten.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {unwritten.map(s => (
                            <span key={s.id} className="text-[11px] px-2 py-0.5 rounded-full"
                              style={{ background: '#fef9f9', border: '1px solid #F5C4B3', color: '#712B13' }}>
                              {s.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 미처리 학습지 ── */}
        {viewTab === 'worksheets' && (
          <div className="space-y-3">
            {/* 요약 */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '채점 대기', value: pendingScore.length, color: '#EF9F27', bg: '#FAEEDA' },
                { label: '장기 미제출', value: longPending.length, color: '#991b1b', bg: '#fee2e2' },
                { label: '재도전 중', value: retrying.length, color: '#993C1D', bg: '#FAECE7' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
                  <p className="text-2xl font-black" style={{ color: s.color }}>{s.value}<span className="text-sm font-normal text-gray-400 ml-0.5">건</span></p>
                  <p className="text-[11px] text-gray-500 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* 채점 대기 */}
            {pendingScore.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#FAEEDA', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-pencil" style={{ fontSize: 15, color: '#633806' }} />
                  <h3 className="text-sm font-bold" style={{ color: '#633806' }}>채점 대기</h3>
                  <span className="text-xs ml-auto" style={{ color: '#633806' }}>{pendingScore.length}건</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {pendingScore.map(w => {
                    const student = students.find(s => s.id === w.student_id)
                    const days = Math.floor((Date.now() - new Date(w.assigned_at).getTime()) / 86400000)
                    return (
                      <div key={w.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: '#FAEEDA', color: '#633806' }}>
                          {student?.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{student?.name}</p>
                          <p className="text-[11px] text-gray-400">{w.grade_level} {w.unit}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-bold" style={{ color: '#633806' }}>{days}일 경과</p>
                          <p className="text-[10px] text-gray-400">{student?.teacher_name}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 장기 미제출 */}
            {longPending.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#fee2e2', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-alert-triangle" style={{ fontSize: 15, color: '#991b1b' }} />
                  <h3 className="text-sm font-bold" style={{ color: '#991b1b' }}>장기 미제출 (5일 이상)</h3>
                  <span className="text-xs ml-auto" style={{ color: '#991b1b' }}>{longPending.length}건</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {longPending.map(w => {
                    const student = students.find(s => s.id === w.student_id)
                    const days = Math.floor((Date.now() - new Date(w.assigned_at).getTime()) / 86400000)
                    return (
                      <div key={w.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: '#fee2e2', color: '#991b1b' }}>
                          {student?.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{student?.name}</p>
                          <p className="text-[11px] text-gray-400">{w.grade_level} {w.unit}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-bold text-red-600">{days}일 경과</p>
                          <p className="text-[10px] text-gray-400">{student?.teacher_name}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 재도전 중 */}
            {retrying.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#FAECE7', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-refresh" style={{ fontSize: 15, color: '#993C1D' }} />
                  <h3 className="text-sm font-bold" style={{ color: '#993C1D' }}>재도전 중</h3>
                  <span className="text-xs ml-auto" style={{ color: '#993C1D' }}>{retrying.length}건</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {retrying.map(w => {
                    const student = students.find(s => s.id === w.student_id)
                    const days = Math.floor((Date.now() - new Date(w.assigned_at).getTime()) / 86400000)
                    return (
                      <div key={w.id} className="px-4 py-3 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>
                          {student?.name[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{student?.name}</p>
                          <p className="text-[11px] text-gray-400">{w.grade_level} {w.unit} {w.score != null ? `· ${w.score}점` : ''}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[11px] font-bold" style={{ color: '#993C1D' }}>{days}일째</p>
                          <p className="text-[10px] text-gray-400">{student?.teacher_name}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {pendingScore.length === 0 && longPending.length === 0 && retrying.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <i className="ti ti-circle-check" style={{ fontSize: 36, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
                <p className="text-sm font-bold text-gray-600">미처리 학습지가 없어요 🎉</p>
              </div>
            )}
          </div>
        )}

        {/* ── 주간 작성률 ── */}
        {viewTab === 'weekly' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
              <i className="ti ti-calendar-week" style={{ fontSize: 16, color: '#993C1D' }} />
              <h3 className="text-sm font-bold text-gray-700">수업일지 작성률</h3>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={() => setWeekOffset(prev => prev - 1)}
                  className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-all"
                  style={{ border: '1px solid #e5e7eb' }}>
                  <i className="ti ti-chevron-left" style={{ fontSize: 13, color: '#6b7280' }} />
                </button>
                <span className="text-xs font-bold px-2.5 py-1 rounded-xl"
                  style={{ background: weekOffset === 0 ? '#F0FBF7' : '#f3f4f6', color: weekOffset === 0 ? '#085041' : '#374151', minWidth: 100, textAlign: 'center' }}>
                  {weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주' : `${Math.abs(weekOffset)}주 전`} {weekLabel}
                </span>
                <button onClick={() => setWeekOffset(prev => Math.min(0, prev + 1))}
                  disabled={weekOffset === 0}
                  className="w-7 h-7 rounded-xl flex items-center justify-center hover:bg-gray-100 transition-all disabled:opacity-30"
                  style={{ border: '1px solid #e5e7eb' }}>
                  <i className="ti ti-chevron-right" style={{ fontSize: 13, color: '#6b7280' }} />
                </button>
              </div>
            </div>
            <div className="px-4 py-4 space-y-4">
              {weeklyStats.filter(t => t.expected > 0).map(({ teacher, sessions, expected, rate }) => (
                <div key={teacher.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: '#FAECE7', color: '#993C1D' }}>
                        {teacher.name[0]}
                      </div>
                      <span className="text-sm font-semibold text-gray-800">{teacher.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-400">{sessions}/{expected}건</span>
                      <span className="text-sm font-black" style={{
                        color: rate >= 90 ? '#27500A' : rate >= 70 ? '#633806' : '#991b1b'
                      }}>{rate}%</span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: '#f3f4f6' }}>
                    <div className="h-2 rounded-full transition-all" style={{
                      width: `${rate}%`,
                      background: rate >= 90 ? '#639922' : rate >= 70 ? '#EF9F27' : '#dc2626'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
