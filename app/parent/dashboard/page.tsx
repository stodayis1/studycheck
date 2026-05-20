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
  wise_step: string
}

interface Schedule {
  id: string
  day_of_week: string
  start_time: string
  periods: number
}

interface ClassSession {
  id: string
  session_date: string
  today_textbook_name: string | null
  progress_content: string | null
  hw_textbook_name: string | null
  hw_textbook_page: string | null
  hw_worksheet_range: string | null
  video_url: string | null
  daily_test_unit: string | null
  daily_test_score: number | null
}

interface LearningNote {
  id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  workbook_done: boolean
  video_started_at: string | null
  video_completed_at: string | null
}

interface StudentWorksheet {
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

interface StudentTextbook {
  id: string
  textbook_name: string
  textbook_type: string
  status: string
}

const DAYS = ['일','월','화','수','목','금','토']

function ProgressBar({ rate, color, height = 'h-2' }: { rate: number; color: string; height?: string }) {
  return (
    <div className={cx(height, 'bg-gray-100 rounded-full overflow-hidden')}>
      <div className={cx('h-full rounded-full transition-all duration-700', color)}
        style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
    </div>
  )
}

export default function ParentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [elementaryTBs, setElementaryTBs] = useState<any[]>([])
  const [studentProgress, setStudentProgress] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase.from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        const [{ data: scData }, { data: ssData }, { data: nData }, { data: wsData }, { data: tbData }, { data: pgData }, { data: etData }] = await Promise.all([
          supabase.from('schedules').select('*').eq('student_id', session.id).eq('is_active', true),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_progress').select('*').eq('student_id', session.id),
          supabase.from('elementary_textbooks').select('*').order('semester').order('chapter_no').order('lesson_no'),
        ])
        if (scData) setSchedules(scData)
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
        if (pgData) setStudentProgress(pgData)
        if (etData) setElementaryTBs(etData)
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

  // 기간 설정
  const periodStart = new Date(today)
  if (viewMode === 'week') {
    periodStart.setDate(today.getDate() - today.getDay() + 1)
  } else {
    periodStart.setDate(1)
  }
  const periodStartStr = periodStart.toISOString().split('T')[0]

  // 기간 내 수업
  const periodSessions = sessions.filter(s => s.session_date >= periodStartStr && s.session_date <= todayStr)
  const periodNotes = notes.filter(n => periodSessions.some(s => s.id === n.session_id))

  // 통계
  const totalSessions = periodNotes.length
  const attendRate = totalSessions > 0
    ? Math.round(periodNotes.filter(n => n.attendance === '정시').length / totalSessions * 100) : 0
  const wsSubmitRate = totalSessions > 0
    ? Math.round(periodNotes.filter(n => n.worksheet_submitted).length / totalSessions * 100) : 0
  const tbSubmitRate = totalSessions > 0
    ? Math.round(periodNotes.filter(n => n.textbook_submitted).length / totalSessions * 100) : 0
  const videoSessions = periodSessions.filter(s => s.video_url)
  const videoCompleteRate = videoSessions.length > 0
    ? Math.round(notes.filter(n => videoSessions.some(s => s.id === n.session_id) && n.video_completed_at).length / videoSessions.length * 100) : 0

  // 학습지 현황
  const activeWS = worksheets.filter(w => w.status !== 'passed')
  const recentWS = worksheets.slice(0, 5)

  // 오늘/다음 수업
  const todaySchedule = schedules.find(s => s.day_of_week === todayDay)
  const todaySession = sessions.find(s => s.session_date === todayStr)
  const nextSchedule = (() => {
    const dayOrder = ['월','화','수','목','금','토','일']
    const todayIdx = dayOrder.indexOf(todayDay)
    for (let i = 1; i <= 7; i++) {
      const nextDay = dayOrder[(todayIdx + i) % 7]
      const sc = schedules.find(s => s.day_of_week === nextDay)
      if (sc) return { schedule: sc, day: nextDay }
    }
    return null
  })()

  // 병행교재
  const activeTBByType: Record<string, StudentTextbook> = {}
  textbooks.filter(t => t.status === 'assigned').forEach(t => {
    if (!activeTBByType[t.textbook_type]) activeTBByType[t.textbook_type] = t
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`${student.name} 학생`} subtitle="학습 현황"
        action={<button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600">로그아웃</button>} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 프로필 카드 */}
        <div className="bg-gradient-to-r from-[#1a2f5e] to-blue-500 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black">{student.name[0]}</span>
            </div>
            <div className="flex-1">
              <p className="font-black text-lg">{student.name}</p>
              <p className="text-blue-100 text-sm">{student.school} · {student.grade}</p>
              <div className="flex items-center gap-2 mt-1">
                {student.teacher_name && <span className="text-blue-200 text-xs">{student.teacher_name} 선생님</span>}
                {student.wise_step && (
                  <span className="text-[10px] font-black px-2 py-0.5 bg-white/20 rounded-full">
                    {student.wise_step}단계
                  </span>
                )}
              </div>
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
                {todaySession?.progress_content && (
                  <p className="text-xs text-blue-100 mt-1 truncate">📖 {todaySession.progress_content}</p>
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
              </>
            ) : <p className="text-sm font-bold text-gray-400">-</p>}
          </div>
        </div>

        {/* 주간/월간 토글 */}
        <div className="flex bg-gray-100 rounded-xl p-1">
          {[['week','이번 주'],['month','이번 달']].map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode as typeof viewMode)}
              className={cx('flex-1 py-2 rounded-lg text-sm font-bold transition-all',
                viewMode === mode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500')}>
              {label}
            </button>
          ))}
        </div>

        {/* 핵심 지표 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <h3 className="text-sm font-bold text-gray-800">
            📊 {viewMode === 'week' ? '이번 주' : '이번 달'} 학습 현황
            <span className="text-xs font-normal text-gray-400 ml-2">수업 {totalSessions}회 기준</span>
          </h3>

          {totalSessions === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">이 기간 수업 기록이 없어요</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: '✅ 정시 출석률', rate: attendRate, color: attendRate >= 90 ? 'bg-green-500' : attendRate >= 70 ? 'bg-yellow-400' : 'bg-red-400' },
                { label: '📝 과제 달성률', rate: wsSubmitRate, color: wsSubmitRate >= 80 ? 'bg-green-500' : wsSubmitRate >= 60 ? 'bg-yellow-400' : 'bg-red-400' },
                { label: '📖 교재 제출률', rate: tbSubmitRate, color: tbSubmitRate >= 80 ? 'bg-blue-500' : tbSubmitRate >= 60 ? 'bg-yellow-400' : 'bg-red-400' },
                ...(videoSessions.length > 0 ? [{ label: '📹 영상 완료율', rate: videoCompleteRate, color: videoCompleteRate >= 80 ? 'bg-purple-500' : 'bg-orange-400' }] : []),
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-gray-600">{item.label}</span>
                    <span className={cx('font-black',
                      item.rate >= 80 ? 'text-green-600' : item.rate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                      {item.rate}%
                    </span>
                  </div>
                  <ProgressBar rate={item.rate} color={item.color} height="h-2" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 레벨학습지 현황 */}
        {recentWS.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">📝 레벨학습지 현황</h3>
              <div className="flex gap-2 text-xs text-gray-400">
                <span>진행중 {activeWS.length}개</span>
                <span>·</span>
                <span>완료 {worksheets.filter(w => w.status === 'passed').length}개</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {recentWS.map((w) => (
                <div key={w.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-800 truncate">
                      {w.grade_level} {w.unit}
                      {w.unit_name && <span className="font-normal text-gray-400"> · {w.unit_name}</span>}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {w.worksheet_type === 'similar' ? '오답유사 · ' : ''}{w.current_level}레벨
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    {w.score != null ? (
                      <p className={cx('text-sm font-black',
                        w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                        {w.score}점
                      </p>
                    ) : (
                      <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                        w.status === 'passed' ? 'bg-green-100 text-green-600' :
                        w.status === 'submitted' ? 'bg-orange-100 text-orange-500' :
                        'bg-blue-100 text-blue-600')}>
                        {w.status === 'passed' ? '완료' : w.status === 'submitted' ? '채점대기' : '진행중'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 교재 진도 현황 (초등) */}
        {student.grade.includes('초') && elementaryTBs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-800">📖 교재 진도 현황</h3>
              <div className="flex gap-2 text-[10px] text-gray-400">
                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-yellow-400 inline-block"/>개념</span>
                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-green-500 inline-block"/>유형</span>
                <span className="flex items-center gap-0.5"><span className="w-2 h-2 rounded-sm bg-orange-500 inline-block"/>심화</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {[1, 2].map(semester => {
                const semTBs = elementaryTBs.filter(tb =>
                  tb.grade === student.grade && tb.semester === semester && tb.lesson_type === 'concept'
                )
                if (semTBs.length === 0) return null

                const chapters = [...new Map(semTBs.map(tb => [tb.chapter_no, { no: tb.chapter_no, name: tb.chapter_name }])).values()]

                return (
                  <div key={semester} className="px-4 py-3">
                    <p className="text-xs font-bold text-gray-500 mb-2">{semester}학기</p>
                    <div className="space-y-2">
                      {chapters.map(ch => {
                        const chLessons = semTBs.filter(tb => tb.chapter_no === ch.no)
                        const total = chLessons.length
                        const conceptDone = chLessons.filter(tb =>
                          studentProgress.some(p => p.textbook_id === tb.id && p.textbook_type === 'concept')
                        ).length
                        const practiceDone = chLessons.filter(tb =>
                          studentProgress.some(p => p.textbook_id === tb.id && p.textbook_type === 'practice')
                        ).length
                        const advancedDone = chLessons.filter(tb =>
                          studentProgress.some(p => p.textbook_id === tb.id && p.textbook_type === 'advanced')
                        ).length

                        const conceptRate = total > 0 ? Math.round(conceptDone / total * 100) : 0
                        const practiceRate = total > 0 ? Math.round(practiceDone / total * 100) : 0
                        const advancedRate = total > 0 ? Math.round(advancedDone / total * 100) : 0

                        return (
                          <div key={ch.no}>
                            <div className="flex items-center justify-between mb-1">
                              <p className="text-xs text-gray-600 truncate flex-1">{ch.name}</p>
                              <span className="text-[10px] text-gray-400 ml-2 shrink-0">
                                {conceptDone}/{total}
                              </span>
                            </div>
                            {/* 3단계 진도 바 */}
                            <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
                              <div className="h-full bg-orange-500 transition-all duration-500"
                                style={{ width: `${advancedRate}%` }} />
                              <div className="h-full bg-green-500 transition-all duration-500"
                                style={{ width: `${Math.max(0, practiceRate - advancedRate)}%` }} />
                              <div className="h-full bg-yellow-400 transition-all duration-500"
                                style={{ width: `${Math.max(0, conceptRate - practiceRate)}%` }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 병행교재 현황 */}
        {Object.keys(activeTBByType).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <h3 className="text-sm font-bold text-gray-800 mb-3">📚 병행교재 현황</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(activeTBByType).map(([type, tb]) => (
                <div key={type} className={cx('px-3 py-2 rounded-xl border text-xs',
                  type === '개념서' ? 'bg-blue-50 border-blue-200' :
                  type === '유형서' ? 'bg-green-50 border-green-200' :
                  type === '심화서' ? 'bg-orange-50 border-orange-200' :
                  'bg-purple-50 border-purple-200')}>
                  <p className="font-bold text-gray-700">{type}</p>
                  <p className="text-gray-500 mt-0.5 text-[11px]">{tb.textbook_name}</p>
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
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">수업 기록이 없어요</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {sessions.slice(0, 4).map((session) => {
                const note = notes.find(n => n.session_id === session.id)
                const isToday = session.session_date === todayStr
                return (
                  <div key={session.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs font-bold text-gray-700">{session.session_date}</p>
                      {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">오늘</span>}
                      {note && (
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto',
                          note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                          note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                          'bg-green-100 text-green-600')}>
                          {note.attendance}
                        </span>
                      )}
                    </div>
                    {session.progress_content && (
                      <p className="text-xs text-gray-500 mb-1">📖 {session.progress_content}</p>
                    )}
                    {note && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-lg',
                          note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                          과제달성 {note.workbook_done ? '100%' : note.worksheet_submitted ? '70%' : '0%'}
                        </span>
                        {note.worksheet_score != null && (
                          <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-lg',
                            note.worksheet_score >= 85 ? 'bg-green-50 text-green-700' :
                            note.worksheet_score >= 70 ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-500')}>
                            성취도 {note.worksheet_score}%
                          </span>
                        )}
                        {session.daily_test_score != null && (
                          <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-lg',
                            session.daily_test_score >= 90 ? 'bg-green-50 text-green-700' :
                            session.daily_test_score >= 70 ? 'bg-blue-50 text-blue-600' : 'bg-red-50 text-red-500')}>
                            테스트 {session.daily_test_score}점
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
