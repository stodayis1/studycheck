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

interface Schedule {
  id: string
  student_id: string
  day_of_week: string
  start_time: string
  periods: number
}

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  session_type: string
  today_textbook_name: string | null
  today_chapter: string | null
}

interface LearningNote {
  id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  textbook_page: string | null
  workbook_done: boolean
  memo: string | null
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

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export default function ParentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase
          .from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        const [{ data: scData }, { data: ssData }, { data: nData }, { data: wsData }] = await Promise.all([
          supabase.from('schedules').select('*').eq('student_id', session.id).eq('is_active', true),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
        ])

        if (scData) setSchedules(scData)
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
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

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const todayDay = DAYS[today.getDay()]

  // ── 오늘 / 다음 수업 ──
  const todaySchedule = schedules.find((s) => s.day_of_week === todayDay)
  const todaySession = sessions.find((s) => s.session_date === todayStr)

  // 다음 수업 찾기 (오늘 이후 가장 가까운 요일)
  const nextSchedule = (() => {
    const dayOrder = ['월', '화', '수', '목', '금', '토', '일']
    const todayIdx = dayOrder.indexOf(todayDay)
    for (let i = 1; i <= 7; i++) {
      const nextDay = dayOrder[(todayIdx + i) % 7]
      const sc = schedules.find((s) => s.day_of_week === nextDay)
      if (sc) {
        // 날짜 계산
        const nextDate = new Date(today)
        nextDate.setDate(today.getDate() + i)
        return { schedule: sc, date: nextDate.toISOString().split('T')[0], day: nextDay }
      }
    }
    return null
  })()

  // ── 이번 주 배움노트 성실성 ──
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay() + 1) // 이번 주 월요일
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  const weekSessions = sessions.filter((s) =>
    s.session_date >= weekStartStr && s.session_date <= weekEndStr
  )
  const weekNotes = notes.filter((n) =>
    weekSessions.some((s) => s.id === n.session_id)
  )

  const weekTotal = weekSessions.length
  const wsSubmitRate = weekTotal > 0
    ? Math.round(weekNotes.filter((n) => n.worksheet_submitted).length / weekTotal * 100) : null
  const tbSubmitRate = weekTotal > 0
    ? Math.round(weekNotes.filter((n) => n.textbook_submitted).length / weekTotal * 100) : null
  const wbDoneRate = weekTotal > 0
    ? Math.round(weekNotes.filter((n) => n.workbook_done).length / weekTotal * 100) : null

  // ── 최근 배움노트 (최근 3개) ──
  const recentSessions = [...sessions].slice(0, 3)
  const getNoteBySession = (sessionId: string) => notes.find((n) => n.session_id === sessionId)

  // ── 학습지 현황 ──
  const activeWorksheets = worksheets.filter((w) => !['passed'].includes(w.status))
  const completedWorksheets = worksheets.filter((w) => w.status === 'passed')

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
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black text-white">{student.name[0]}</span>
            </div>
            <div>
              <p className="text-white font-black text-lg">{student.name}</p>
              <p className="text-blue-100 text-sm">{student.school} · {student.grade}</p>
              {student.teacher_name && (
                <p className="text-blue-200 text-xs mt-0.5">담당: {student.teacher_name} 선생님</p>
              )}
            </div>
          </div>
        </div>

        {/* 오늘 수업 / 다음 수업 */}
        <div className="grid grid-cols-2 gap-2">
          {/* 오늘 수업 */}
          <div className={cx('rounded-2xl p-4',
            todaySchedule ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100')}>
            <p className={cx('text-xs font-bold mb-2', todaySchedule ? 'text-blue-100' : 'text-gray-400')}>
              📅 오늘 수업
            </p>
            {todaySchedule ? (
              <>
                <p className="text-lg font-black">{todaySchedule.start_time.slice(0,5)}</p>
                <p className="text-xs text-blue-200 mt-0.5">{todaySchedule.periods}교시</p>
                {todaySession?.today_textbook_name && (
                  <p className="text-xs text-blue-100 mt-1 truncate">
                    📖 {todaySession.today_textbook_name}
                  </p>
                )}
                {todaySession?.today_chapter && (
                  <p className="text-xs text-blue-200 truncate">{todaySession.today_chapter}</p>
                )}
              </>
            ) : (
              <p className="text-sm font-bold text-gray-400">수업 없음</p>
            )}
          </div>

          {/* 다음 수업 */}
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-bold text-gray-400 mb-2">⏭ 다음 수업</p>
            {nextSchedule ? (
              <>
                <p className="text-sm font-black text-gray-800">{nextSchedule.day}요일</p>
                <p className="text-lg font-black text-blue-600">{nextSchedule.schedule.start_time.slice(0,5)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{nextSchedule.schedule.periods}교시</p>
              </>
            ) : (
              <p className="text-sm font-bold text-gray-400">-</p>
            )}
          </div>
        </div>

        {/* 이번 주 과제 성실성 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-gray-800">📊 이번 주 과제 성실성</h3>
            <span className="text-xs text-gray-400">수업 {weekTotal}회 기준</span>
          </div>
          {weekTotal === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">이번 주 수업 기록이 없어요</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: '📝 학습지 제출', rate: wsSubmitRate },
                { label: '📖 교재 제출', rate: tbSubmitRate },
                { label: '🔢 연산서 완료', rate: wbDoneRate },
              ].map((item) => (
                item.rate !== null && (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-600">{item.label}</span>
                      <span className={cx('font-black',
                        item.rate >= 80 ? 'text-green-600' :
                        item.rate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                        {item.rate}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cx('h-full rounded-full transition-all',
                        item.rate >= 80 ? 'bg-green-500' :
                        item.rate >= 60 ? 'bg-yellow-400' : 'bg-red-400')}
                        style={{ width: `${item.rate}%` }} />
                    </div>
                  </div>
                )
              ))}
            </div>
          )}
        </div>

        {/* 최근 배움노트 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">📓 최근 배움노트</h3>
          </div>
          {recentSessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">수업 기록이 없어요</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentSessions.map((session) => {
                const note = getNoteBySession(session.id)
                const isToday = session.session_date === todayStr
                return (
                  <div key={session.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs font-bold text-gray-700">{session.session_date}</p>
                      {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">오늘</span>}
                      {note ? (
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto',
                          note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                          note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-green-100 text-green-600')}>
                          {note.attendance}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400 ml-auto">미작성</span>
                      )}
                    </div>
                    {session.today_textbook_name && (
                      <p className="text-xs text-gray-500 mb-1">
                        📖 {session.today_textbook_name} · {session.today_chapter}
                      </p>
                    )}
                    {note && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                          note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                          학습지 {note.worksheet_submitted ? '✓제출' : '✗미제출'}
                          {note.worksheet_score != null && ` ${note.worksheet_score}점`}
                        </span>
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                          note.textbook_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                          교재 {note.textbook_submitted ? '✓제출' : '✗미제출'}
                        </span>
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                          note.workbook_done ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                          연산서 {note.workbook_done ? '✓완료' : '✗미완료'}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 학습지 현황 요약 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📝 학습지 현황</h3>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: '진행중', value: activeWorksheets.length, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: '완료', value: completedWorksheets.length, color: 'text-green-600', bg: 'bg-green-50' },
              { label: '전체', value: worksheets.length, color: 'text-gray-700', bg: 'bg-gray-50' },
            ].map(({ label, value, color, bg }) => (
              <div key={label} className={cx('rounded-xl p-3 text-center', bg)}>
                <p className={cx('text-2xl font-black', color)}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
          {activeWorksheets.slice(0, 2).map((w) => (
            <div key={w.id} className="flex items-center gap-2 py-2 border-t border-gray-50">
              <div className="flex-1">
                <p className="text-xs font-bold text-gray-700">{w.grade_level} {w.unit}</p>
                <p className="text-xs text-gray-400">{w.current_level}레벨</p>
              </div>
              <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                w.status === 'assigned' ? 'bg-blue-50 text-blue-600' :
                w.status === 'submitted' ? 'bg-orange-50 text-orange-500' :
                'bg-gray-50 text-gray-500')}>
                {w.status === 'assigned' ? '과제중' :
                 w.status === 'submitted' ? '채점대기' :
                 w.status === 'similar_assigned' ? '오답유사' : '진행중'}
              </span>
            </div>
          ))}
          {activeWorksheets.length > 2 && (
            <p className="text-xs text-gray-400 text-center pt-2">+{activeWorksheets.length - 2}개 더</p>
          )}
        </div>

        <p className="text-center text-xs text-gray-300 pb-2">학부모 화면은 읽기 전용입니다 🔒</p>
      </div>
    </div>
  )
}
