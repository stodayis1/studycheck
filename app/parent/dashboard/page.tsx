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
  workbook_done: boolean
  memo: string | null
}

interface StudentWorksheet {
  id: string
  grade_level: string
  unit: string
  current_level: number
  status: string
  score: number | null
}

interface StudentTextbook {
  id: string
  concept_id: string
  textbook_name: string
  textbook_type: string
  status: string
}

const DAYS = ['일','월','화','수','목','금','토']

export default function ParentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase.from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        const [{ data: scData }, { data: ssData }, { data: nData }, { data: wsData }, { data: tbData }] = await Promise.all([
          supabase.from('schedules').select('*').eq('student_id', session.id).eq('is_active', true),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
        ])
        if (scData) setSchedules(scData)
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
      } catch { router.push('/auth/login') }
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

  // 오늘/다음 수업
  const todaySchedule = schedules.find((s) => s.day_of_week === todayDay)
  const todaySession = sessions.find((s) => s.session_date === todayStr)
  const nextSchedule = (() => {
    const dayOrder = ['월','화','수','목','금','토','일']
    const todayIdx = dayOrder.indexOf(todayDay)
    for (let i = 1; i <= 7; i++) {
      const nextDay = dayOrder[(todayIdx + i) % 7]
      const sc = schedules.find((s) => s.day_of_week === nextDay)
      if (sc) {
        const nextDate = new Date(today)
        nextDate.setDate(today.getDate() + i)
        return { schedule: sc, day: nextDay }
      }
    }
    return null
  })()

  // 성취도 통계 (배움노트 기반)
  const allNotes = notes
  const totalSessions = allNotes.length
  const wsSubmitRate = totalSessions > 0
    ? Math.round(allNotes.filter((n) => n.worksheet_submitted).length / totalSessions * 100) : 0
  const tbSubmitRate = totalSessions > 0
    ? Math.round(allNotes.filter((n) => n.textbook_submitted).length / totalSessions * 100) : 0
  const attendRate = totalSessions > 0
    ? Math.round(allNotes.filter((n) => n.attendance === '정시').length / totalSessions * 100) : 0
  const scoredNotes = allNotes.filter((n) => n.worksheet_score != null)
  const avgScore = scoredNotes.length > 0
    ? Math.round(scoredNotes.reduce((sum, n) => sum + (n.worksheet_score ?? 0), 0) / scoredNotes.length) : null

  // 레벨학습지 현황
  const activeWS = worksheets.filter((w) => w.status !== 'passed')
  const completedWS = worksheets.filter((w) => w.status === 'passed')
  const wsRate = worksheets.length > 0
    ? Math.round(completedWS.length / worksheets.length * 100) : 0

  // 병행교재 현황 (타입별)
  const activeTBByType: Record<string, StudentTextbook[]> = {}
  textbooks.filter((t) => t.status !== 'checked').forEach((t) => {
    if (!activeTBByType[t.textbook_type]) activeTBByType[t.textbook_type] = []
    activeTBByType[t.textbook_type].push(t)
  })

  // 최근 수업 기록 (최근 3회)
  const recentSessions = sessions.slice(0, 3)

  function getNote(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  function ProgressBar({ rate, color }: { rate: number; color: string }) {
    return (
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={cx('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${rate}%` }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`${student.name} 학생`} subtitle="학부모 화면"
        action={<button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600">로그아웃</button>} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 프로필 */}
        <div className="bg-gradient-to-r from-[#1a2f5e] to-blue-500 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black">{student.name[0]}</span>
            </div>
            <div>
              <p className="font-black text-lg">{student.name}</p>
              <p className="text-blue-100 text-sm">{student.school} · {student.grade}</p>
              {student.teacher_name && <p className="text-blue-200 text-xs mt-0.5">담당: {student.teacher_name} 선생님</p>}
            </div>
          </div>
        </div>

        {/* 오늘/다음 수업 */}
        <div className="grid grid-cols-2 gap-2">
          <div className={cx('rounded-2xl p-4', todaySchedule ? 'bg-blue-600 text-white' : 'bg-white border border-gray-100')}>
            <p className={cx('text-xs font-bold mb-2', todaySchedule ? 'text-blue-100' : 'text-gray-400')}>📅 오늘 수업</p>
            {todaySchedule ? (
              <>
                <p className="text-lg font-black">{todaySchedule.start_time.slice(0,5)}</p>
                <p className="text-xs text-blue-200 mt-0.5">{todaySchedule.periods}교시</p>
                {todaySession?.today_textbook_name && (
                  <p className="text-xs text-blue-100 mt-1 truncate">📖 {todaySession.today_textbook_name}</p>
                )}
              </>
            ) : <p className="text-sm font-bold text-gray-400">수업 없음</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs font-bold text-gray-400 mb-2">⏭ 다음 수업</p>
            {nextSchedule ? (
              <>
                <p className="text-sm font-black text-gray-800">{nextSchedule.day}요일</p>
                <p className="text-lg font-black text-blue-600">{nextSchedule.schedule.start_time.slice(0,5)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{nextSchedule.schedule.periods}교시</p>
              </>
            ) : <p className="text-sm font-bold text-gray-400">-</p>}
          </div>
        </div>

        {/* 핵심 지표 막대형 카드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">📊 학습 현황</h3>

          {/* 정시 출석률 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-gray-600">✅ 정시 출석률</span>
              <span className={cx('font-black', attendRate >= 90 ? 'text-green-600' : attendRate >= 70 ? 'text-yellow-600' : 'text-red-500')}>
                {totalSessions > 0 ? `${attendRate}%` : '-'}
              </span>
            </div>
            <ProgressBar rate={attendRate} color={attendRate >= 90 ? 'bg-green-500' : attendRate >= 70 ? 'bg-yellow-400' : 'bg-red-400'} />
          </div>

          {/* 과제 달성률 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-gray-600">📝 과제 달성률</span>
              <span className={cx('font-black', wsSubmitRate >= 80 ? 'text-green-600' : wsSubmitRate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                {totalSessions > 0 ? `${wsSubmitRate}%` : '-'}
              </span>
            </div>
            <ProgressBar rate={wsSubmitRate} color={wsSubmitRate >= 80 ? 'bg-green-500' : wsSubmitRate >= 60 ? 'bg-yellow-400' : 'bg-red-400'} />
          </div>

          {/* 교재 제출률 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-gray-600">📖 교재 제출률</span>
              <span className={cx('font-black', tbSubmitRate >= 80 ? 'text-green-600' : tbSubmitRate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                {totalSessions > 0 ? `${tbSubmitRate}%` : '-'}
              </span>
            </div>
            <ProgressBar rate={tbSubmitRate} color={tbSubmitRate >= 80 ? 'bg-blue-500' : tbSubmitRate >= 60 ? 'bg-yellow-400' : 'bg-red-400'} />
          </div>

          {/* 레벨학습지 완료율 */}
          <div>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="font-semibold text-gray-600">🎯 레벨학습지 완료율</span>
              <span className={cx('font-black', wsRate >= 70 ? 'text-green-600' : 'text-blue-600')}>
                {worksheets.length > 0 ? `${wsRate}% (${completedWS.length}/${worksheets.length})` : '-'}
              </span>
            </div>
            <ProgressBar rate={wsRate} color="bg-purple-500" />
          </div>

          {/* 평균 과제 성취도 */}
          {avgScore != null && (
            <div className="flex items-center justify-between px-3 py-2.5 bg-blue-50 rounded-xl">
              <span className="text-xs font-semibold text-gray-600">🏆 평균 과제 성취도</span>
              <span className={cx('text-lg font-black',
                avgScore >= 85 ? 'text-green-600' : avgScore >= 75 ? 'text-blue-600' : 'text-orange-500')}>
                {avgScore}점
              </span>
            </div>
          )}
        </div>

        {/* 병행교재 현황 */}
        {Object.keys(activeTBByType).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">📚 병행교재 현황</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(activeTBByType).map(([type, tbs]) => (
                <div key={type} className={cx('px-3 py-2 rounded-xl border text-xs',
                  type === '개념서' ? 'bg-blue-50 border-blue-200' :
                  type === '유형서' ? 'bg-green-50 border-green-200' :
                  type === '심화서' ? 'bg-orange-50 border-orange-200' :
                  'bg-purple-50 border-purple-200')}>
                  <p className="font-bold text-gray-700">{type}</p>
                  <p className="text-gray-500 mt-0.5">{tbs[0]?.textbook_name}</p>
                  <p className="text-gray-400 text-[10px] mt-0.5">{tbs.length}개 진행중</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최근 수업 기록 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">📓 최근 수업 기록</h3>
          </div>
          {recentSessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">수업 기록이 없어요</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {recentSessions.map((session) => {
                const note = getNote(session.id)
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
                      ) : <span className="text-[10px] text-gray-400 ml-auto">미기록</span>}
                    </div>
                    {session.today_textbook_name && (
                      <p className="text-xs text-gray-500 mb-1.5">
                        📖 {session.today_textbook_name}{session.today_chapter && ` · ${session.today_chapter}`}
                      </p>
                    )}
                    {note && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-lg',
                          note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                          과제달성률 {note.workbook_done ? '100%' : note.worksheet_submitted ? '70%' : '0%'}
                        </span>
                        {note.worksheet_score != null && (
                          <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-lg',
                            note.worksheet_score >= 85 ? 'bg-green-50 text-green-700' :
                            note.worksheet_score >= 70 ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500')}>
                            과제성취도 {note.worksheet_score}점
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
