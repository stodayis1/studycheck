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
  wise_step: string
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
  video_url: string | null
  progress_content: string | null
  daily_test_unit: string | null
  daily_test_score: number | null
  hw_textbook_name: string | null
  hw_textbook_page: string | null
  hw_worksheet_range: string | null
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
  video_started_at: string | null
  video_completed_at: string | null
}

interface Feedback {
  id: string
  student_id: string
  teacher_name: string
  content: string
  ai_message: string | null
  created_at: string
}

const DAYS = ['월','화','수','목','금','토']
const TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00']
const WISE_STEPS = ['W', 'I', 'S', 'E']
const WISE_DESC: Record<string, string> = {
  W: 'Warm-up (도입)',
  I: 'Input (개념 설명)',
  S: 'Skill (유형 연습)',
  E: 'Evaluation (확인)',
}
const ACHIEVEMENT_OPTIONS = [
  { label: '100%', value: 100, color: 'text-green-600', bg: 'bg-green-50 border-green-300' },
  { label: '70%', value: 70, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-300' },
  { label: '50%', value: 50, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-300' },
  { label: '0%', value: 0, color: 'text-red-500', bg: 'bg-red-50 border-red-300' },
]

const GRADE_COLORS: Record<string, { bg: string; border: string; sub: string }> = {
  '초1': { bg: '#fffde7', border: '#ffe082', sub: '#f9a825' },
  '초2': { bg: '#fff9c4', border: '#ffd54f', sub: '#f57f17' },
  '초3': { bg: '#fff176', border: '#ffca28', sub: '#e65100' },
  '초4': { bg: '#ffe0b2', border: '#ffb74d', sub: '#e65100' },
  '초5': { bg: '#ffcc80', border: '#ffa726', sub: '#bf360c' },
  '초6': { bg: '#ffb300', border: '#ff8f00', sub: '#bf360c' },
  '중1': { bg: '#e8f5e9', border: '#a5d6a7', sub: '#2e7d32' },
  '중2': { bg: '#c8e6c9', border: '#66bb6a', sub: '#1b5e20' },
  '중3': { bg: '#a5d6a7', border: '#43a047', sub: '#1b5e20' },
  '고1': { bg: '#ffebee', border: '#ef9a9a', sub: '#c62828' },
  '고2': { bg: '#ffcdd2', border: '#e57373', sub: '#b71c1c' },
  '고3': { bg: '#ef9a9a', border: '#e53935', sub: '#7f0000' },
  'default': { bg: '#f5f5f5', border: '#bdbdbd', sub: '#757575' },
}

export default function TeacherLearningNotesPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'today' | 'schedule'>('today')
  const [noteTab, setNoteTab] = useState<'basic' | 'daily' | 'hw'>('basic')

  // 수업일지 입력 모달
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteStudent, setNoteStudent] = useState<Student | null>(null)
  const [noteSession, setNoteSession] = useState<ClassSession | null>(null)

  // 수업일지 필드
  const [noteProgress, setNoteProgress] = useState('')        // 진도 내용 (통합)
  const [noteWISE, setNoteWISE] = useState('')
  const [noteAttendance, setNoteAttendance] = useState('정시')
  const [noteAchievement, setNoteAchievement] = useState(100) // 과제 달성률
  const [noteScorePct, setNoteScorePct] = useState(100)       // 과제 성취도 %
  const [noteExtraClass, setNoteExtraClass] = useState(false)
  const [noteExtraTime, setNoteExtraTime] = useState('')
  const [noteMemo, setNoteMemo] = useState('')
  // 데일리 테스트
  const [dailyTestUnit, setDailyTestUnit] = useState('')
  const [dailyTestScore, setDailyTestScore] = useState('')
  // 과제 배부
  const [hwTextbookName, setHwTextbookName] = useState('')
  const [hwTextbookPage, setHwTextbookPage] = useState('')
  const [hwWorksheetRange, setHwWorksheetRange] = useState('')
  const [hwVideoUrl, setHwVideoUrl] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 피드백 모달
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackStudent, setFeedbackStudent] = useState<Student | null>(null)
  const [feedbackContent, setFeedbackContent] = useState('')
  const [savingFeedback, setSavingFeedback] = useState(false)

  // 시간표 모달
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleStudent, setScheduleStudent] = useState<Student | null>(null)
  const [scheduleDay, setScheduleDay] = useState('월')
  const [scheduleTime, setScheduleTime] = useState('16:00')
  const [schedulePeriods, setSchedulePeriods] = useState(2)
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: scData }, { data: ssData }, { data: nData }, { data: fbData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('schedules').select('*').eq('is_active', true),
      supabase.from('class_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('learning_notes').select('*'),
      supabase.from('feedbacks').select('*').order('created_at', { ascending: false }),
    ])
    if (sData) setStudents(sData)
    if (scData) setSchedules(scData)
    if (ssData) setSessions(ssData)
    if (nData) setNotes(nData)
    if (fbData) setFeedbacks(fbData)
    setLoading(false)
  }

  const myStudents = students.filter((s) => isAdmin() ? true : s.teacher_name === currentUser?.name)
  const todayDayIndex = new Date().getDay()
  const dayMap: Record<number, string> = { 1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',0:'일' }
  const todayDay = dayMap[todayDayIndex]
  const todayStr = new Date().toISOString().split('T')[0]

  // 오늘 수업 학생 (시간순)
  const todayStudents = myStudents
    .map((s) => {
      const sc = schedules.find((sc) => sc.student_id === s.id && sc.day_of_week === todayDay)
      return { student: s, schedule: sc }
    })
    .filter((x) => x.schedule)
    .sort((a, b) => (a.schedule!.start_time > b.schedule!.start_time ? 1 : -1))

  const otherStudents = myStudents
    .filter((s) => !schedules.find((sc) => sc.student_id === s.id && sc.day_of_week === todayDay))

  function getStudentSchedules(studentId: string) {
    return schedules.filter((s) => s.student_id === studentId)
  }

  function getTodaySession(studentId: string) {
    return sessions.find((s) => s.student_id === studentId && s.session_date === todayStr)
  }

  function getTodayNote(studentId: string) {
    const session = getTodaySession(studentId)
    if (!session) return null
    return notes.find((n) => n.session_id === session.id)
  }

  function openNoteModal(student: Student) {
    const session = getTodaySession(student.id)
    const note = getTodayNote(student.id)
    // 이전 수업 (오늘 제외 최근 1개)
    const prevSession = sessions
      .filter((s) => s.student_id === student.id && s.session_date < todayStr)
      .sort((a, b) => b.session_date.localeCompare(a.session_date))[0] ?? null

    setNoteStudent(student)
    setNoteSession(session ?? null)
    setNoteTab('basic')
    setNoteProgress(session?.progress_content ?? session?.today_textbook_name ?? '')
    setNoteWISE(student.wise_step || 'W')
    setNoteAttendance(note?.attendance ?? '정시')
    setNoteAchievement(100)
    setNoteScorePct(100)
    setNoteExtraClass(false)
    setNoteExtraTime('')
    setNoteMemo(note?.memo ?? '')
    setDailyTestUnit(session?.daily_test_unit ?? '')
    setDailyTestScore(session?.daily_test_score?.toString() ?? '')
    setHwTextbookName(session?.hw_textbook_name ?? '')
    setHwTextbookPage(session?.hw_textbook_page ?? '')
    setHwWorksheetRange(session?.hw_worksheet_range ?? '')
    setHwVideoUrl(session?.video_url ?? '')
    setShowNoteModal(true)
  }

  async function handleSaveNote() {
    if (!noteStudent) return
    setSavingNote(true)

    // session 없으면 생성, 있으면 업데이트
    let sessionId = noteSession?.id
    const sessionData = {
      student_id: noteStudent.id,
      session_date: todayStr,
      session_type: '정규',
      today_textbook_name: noteProgress || null,
      today_chapter: null,
      progress_content: noteProgress || null,
      daily_test_unit: dailyTestUnit || null,
      daily_test_score: dailyTestScore ? parseInt(dailyTestScore) : null,
      hw_textbook_name: hwTextbookName || null,
      hw_textbook_page: hwTextbookPage || null,
      hw_worksheet_range: hwWorksheetRange || null,
      video_url: hwVideoUrl || null,
      created_by: currentUser?.name,
    }

    if (!sessionId) {
      const { data: newSession } = await supabase.from('class_sessions')
        .insert(sessionData).select().single()
      sessionId = newSession?.id
    } else {
      await supabase.from('class_sessions').update(sessionData).eq('id', sessionId)
    }

    if (!sessionId) { setSavingNote(false); return }

    const existingNote = notes.find((n) => n.session_id === sessionId)
    const memoText = [
      noteWISE ? `[${noteWISE}단계]` : '',
      noteExtraClass ? `추가수업 ${noteExtraTime}` : '',
      noteMemo,
    ].filter(Boolean).join(' ') || null

    const noteData = {
      student_id: noteStudent.id,
      session_id: sessionId,
      attendance: noteAttendance,
      worksheet_submitted: noteAchievement > 0,
      worksheet_score: noteScorePct,
      textbook_submitted: noteAchievement > 0,
      workbook_done: noteAchievement === 100,
      memo: memoText,
    }

    if (existingNote) {
      await supabase.from('learning_notes').update(noteData).eq('id', existingNote.id)
    } else {
      await supabase.from('learning_notes').insert(noteData)
    }

    setShowNoteModal(false)
    setNoteStudent(null)
    setSavingNote(false)
    fetchData()
  }

  async function handleSaveFeedback() {
    if (!feedbackStudent || !feedbackContent.trim()) return
    setSavingFeedback(true)

    const studentSessions = sessions.filter((s) => s.student_id === feedbackStudent.id)
    const studentNotes = notes.filter((n) => studentSessions.some((s) => s.id === n.session_id))
    const recentNotes = studentNotes.slice(0, 3)
    const recentSubmitRate = recentNotes.length > 0
      ? Math.round(recentNotes.filter((n) => n.worksheet_submitted).length / recentNotes.length * 100) : 0
    const recentSession = studentSessions[0]
    const recentNote = recentSession ? notes.find((n) => n.session_id === recentSession.id) : null

    let aiMessage = null
    try {
      const response = await fetch('/api/generate-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: feedbackStudent.name,
          studentGrade: feedbackStudent.grade,
          date: recentSession?.session_date ?? todayStr,
          textbookName: recentSession?.today_textbook_name,
          chapter: recentSession?.today_chapter,
          attendance: recentNote?.attendance,
          worksheetSubmitted: recentNote?.worksheet_submitted ?? false,
          worksheetScore: recentNote?.worksheet_score,
          textbookSubmitted: recentNote?.textbook_submitted ?? false,
          textbookPage: recentNote?.textbook_page,
          workbookDone: recentNote?.workbook_done ?? false,
          videoCompleted: !!recentNote?.video_completed_at,
          videoStarted: !!recentNote?.video_started_at,
          teacherMemo: feedbackContent.trim(),
          recentSubmitRate,
          recentSessions: recentNotes.length,
        }),
      })
      const data = await response.json()
      aiMessage = data.message ?? null
    } catch { console.error('AI 생성 실패') }

    await supabase.from('feedbacks').insert({
      student_id: feedbackStudent.id,
      teacher_name: currentUser?.name,
      content: feedbackContent.trim(),
      ai_message: aiMessage,
      is_read: false,
    })

    setShowFeedbackModal(false)
    setFeedbackStudent(null)
    setFeedbackContent('')
    setSavingFeedback(false)
    fetchData()
  }

  async function handleSaveSchedule() {
    if (!scheduleStudent) return
    setSavingSchedule(true)
    await supabase.from('schedules').insert({
      student_id: scheduleStudent.id,
      day_of_week: scheduleDay,
      start_time: scheduleTime,
      periods: schedulePeriods,
      is_active: true,
    })
    setShowScheduleModal(false)
    setSavingSchedule(false)
    fetchData()
  }

  async function handleDeleteSchedule(id: string) {
    await supabase.from('schedules').update({ is_active: false }).eq('id', id)
    fetchData()
  }

  // 오늘 시간표 시각화
  const HOUR_PX = 72
  const times = [...new Set(todayStudents.map(({ schedule }) => schedule!.start_time))].sort()

  return (
    <div>
      <Header
        title="학습관리"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          <button onClick={() => setShowScheduleModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
            + 시간표
          </button>
        }
      />

      {/* 탭 */}
      <div className="flex gap-2 px-4 pt-4">
        {[
          { key: 'today', label: '📓 수업일지' },
          { key: 'schedule', label: '📅 시간표 관리' },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* ── 수업일지 탭 ── */}
        {tab === 'today' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-4">

              {/* 오늘 시간표 시각화 */}
              {todayStudents.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800">📅 오늘 ({todayDay}요일) 시간표</span>
                    <span className="text-xs text-gray-400">{todayStudents.length}명</span>
                  </div>
                  <div className="p-3 overflow-x-auto">
                    <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
                      <div className="flex flex-col shrink-0" style={{ width: 44 }}>
                        {times.map((time) => {
                          const studentsAtTime = todayStudents.filter(({ schedule }) => schedule!.start_time === time)
                          const maxPeriods = Math.max(...studentsAtTime.map(({ schedule }) => schedule!.periods))
                          return (
                            <div key={time} style={{ height: HOUR_PX * maxPeriods, paddingTop: 8 }}>
                              <span className="text-xs font-bold text-gray-400">{time.slice(0,5)}</span>
                            </div>
                          )
                        })}
                      </div>
                      {todayStudents.map(({ student, schedule }) => {
                        const color = GRADE_COLORS[student.grade] ?? GRADE_COLORS['default']
                        const periods = schedule!.periods
                        const startTime = schedule!.start_time
                        const offsetHeight = times
                          .filter((t) => t < startTime)
                          .reduce((acc, t) => {
                            const studentsAtTime = todayStudents.filter(({ schedule: sc }) => sc!.start_time === t)
                            const maxPeriods = Math.max(...studentsAtTime.map(({ schedule: sc }) => sc!.periods))
                            return acc + HOUR_PX * maxPeriods
                          }, 0)
                        const blockH = HOUR_PX * periods - 8
                        const hasNote = !!getTodayNote(student.id)
                        return (
                          <div key={student.id} className="shrink-0" style={{ width: 80 }}>
                            {offsetHeight > 0 && <div style={{ height: offsetHeight }} />}
                            <button
                              onClick={() => openNoteModal(student)}
                              className="rounded-xl px-2 flex flex-col justify-center w-full transition-all hover:opacity-80"
                              style={{ backgroundColor: color.bg, borderLeft: `4px solid ${hasNote ? '#10b981' : color.border}`, height: blockH }}>
                              <span className="text-xs font-black text-gray-900 truncate">{student.name}</span>
                              <span className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: color.sub }}>
                                {student.grade}
                              </span>
                              {hasNote && <span className="text-[9px] text-green-600 font-bold">✓ 입력완료</span>}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* 오늘 수업 학생 목록 */}
              {todayStudents.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-blue-600 px-1 mb-2">📅 오늘 ({todayDay}요일) 수업 {todayStudents.length}명</p>
                  {todayStudents.map(({ student, schedule }) => {
                    const note = getTodayNote(student.id)
                    const session = getTodaySession(student.id)
                    return (
                      <div key={student.id} className={cx(
                        'bg-white rounded-2xl border-2 shadow-sm overflow-hidden mb-3',
                        note ? 'border-green-200' : 'border-blue-100'
                      )}>
                        <div className={cx('px-4 py-3 flex items-center gap-3', note ? 'bg-green-50' : 'bg-blue-50')}>
                          <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                            {student.name[0]}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">{student.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-gray-500">{student.grade}</p>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                {schedule!.start_time.slice(0,5)} · {schedule!.periods}교시
                              </span>
                              {student.wise_step && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                                  {student.wise_step}단계
                                </span>
                              )}
                              {note && (
                                <span className="text-[10px] font-bold text-green-600">✓ 수업일지 완료</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1.5">
                            <button onClick={() => { setFeedbackStudent(student); setFeedbackContent(''); setShowFeedbackModal(true) }}
                              className="px-2.5 py-1 text-xs font-semibold text-purple-600 bg-white border border-purple-200 rounded-lg">
                              💬 알림장
                            </button>
                            <button onClick={() => openNoteModal(student)}
                              className={cx('px-2.5 py-1 text-xs font-semibold rounded-lg',
                                note ? 'text-gray-600 bg-white border border-gray-200' : 'text-white bg-blue-600')}>
                              {note ? '수정' : '✏️ 입력'}
                            </button>
                          </div>
                        </div>

                        {/* 수업일지 요약 */}
                        {note && session && (
                          <div className="px-4 py-2.5 flex flex-wrap gap-2">
                            {(session.progress_content || session.today_textbook_name) && (
                              <span className="text-[10px] text-gray-500">📖 {session.progress_content || session.today_textbook_name}</span>
                            )}
                            <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                              note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                              note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                              'bg-green-100 text-green-600')}>
                              {note.attendance}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              과제달성률 {note.workbook_done ? '100%' : note.worksheet_submitted ? '70%' : '0%'}
                            </span>
                            {note.worksheet_score != null && (
                              <span className={cx('text-[10px] font-bold', note.worksheet_score >= 85 ? 'text-green-600' : note.worksheet_score >= 70 ? 'text-blue-600' : 'text-red-500')}>
                                과제성취도 {note.worksheet_score}점
                              </span>
                            )}
                            {/* 영상 시청 시간 (선생님만 표시) */}
                            {note.video_started_at && note.video_completed_at && (() => {
                              const start = new Date(note.video_started_at)
                              const end = new Date(note.video_completed_at)
                              const diffMin = Math.round((end.getTime() - start.getTime()) / 60000)
                              return (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                                  📹 영상 {diffMin}분 시청
                                </span>
                              )
                            })()}
                            {note.video_started_at && !note.video_completed_at && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-yellow-50 text-yellow-600 rounded-full">
                                📹 영상 시청중
                              </span>
                            )}
                            {session.video_url && !note.video_started_at && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-50 text-red-500 rounded-full">
                                📹 영상 미시청
                              </span>
                            )}
                            {note.memo && <span className="text-[10px] text-gray-400">📝 {note.memo}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 오늘 수업 없는 학생 */}
              {otherStudents.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 px-1 mb-2">오늘 수업 없는 학생 {otherStudents.length}명</p>
                  {otherStudents.map((student) => (
                    <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-2 px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                        {student.name[0]}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-600">{student.name}</p>
                        <p className="text-xs text-gray-400">{student.grade}</p>
                      </div>
                      <button onClick={() => { setFeedbackStudent(student); setFeedbackContent(''); setShowFeedbackModal(true) }}
                        className="px-2 py-1 text-xs font-semibold text-purple-500 bg-purple-50 border border-purple-100 rounded-lg">
                        💬 알림장
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {todayStudents.length === 0 && otherStudents.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">담당 학생이 없어요</div>
              )}
            </div>
          )
        )}

        {/* ── 시간표 관리 탭 ── */}
        {tab === 'schedule' && (
          <div className="space-y-4">
            <button onClick={() => setShowScheduleModal(true)}
              className="w-full py-3 rounded-xl text-sm font-bold text-blue-600 bg-blue-50 border-2 border-dashed border-blue-200">
              + 시간표 추가
            </button>
            {myStudents.map((student) => {
              const studentSchedules = getStudentSchedules(student.id)
              return (
                <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.grade}</p>
                    </div>
                    <button onClick={() => { setScheduleStudent(student); setShowScheduleModal(true) }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">
                      + 추가
                    </button>
                  </div>
                  {studentSchedules.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-4">등록된 시간표가 없어요</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {studentSchedules
                        .sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week))
                        .map((sc) => (
                          <div key={sc.id} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700">{sc.day_of_week}</span>
                            <span className="text-sm font-semibold text-gray-700 flex-1">{sc.start_time.slice(0,5)}</span>
                            <span className="text-xs text-gray-400">{sc.periods}교시</span>
                            <button onClick={() => handleDeleteSchedule(sc.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 수업일지 입력 모달 ── */}
      {showNoteModal && noteStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowNoteModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">📓 수업일지 입력</h3>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 정보 */}
            <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700">
                {noteStudent.name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">{noteStudent.name}</p>
                <p className="text-xs text-blue-500">{noteStudent.grade} · {todayStr}</p>
              </div>
            </div>

            {/* 이전 수업 요약 */}
            {(() => {
              const prevSession = sessions
                .filter((s) => s.student_id === noteStudent.id && s.session_date < todayStr)
                .sort((a, b) => b.session_date.localeCompare(a.session_date))[0]
              if (!prevSession) return null
              return (
                <div className="bg-gray-50 rounded-xl px-4 py-2.5 mb-4 border border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 mb-1">지난 수업 ({prevSession.session_date})</p>
                  {prevSession.progress_content && (
                    <p className="text-xs text-gray-600">📖 {prevSession.progress_content}</p>
                  )}
                  {prevSession.hw_textbook_name && (
                    <p className="text-xs text-gray-500 mt-0.5">📚 교재과제: {prevSession.hw_textbook_name} {prevSession.hw_textbook_page}</p>
                  )}
                  {prevSession.hw_worksheet_range && (
                    <p className="text-xs text-gray-500 mt-0.5">📝 학습지: {prevSession.hw_worksheet_range}</p>
                  )}
                </div>
              )
            })()}

            {/* 탭 */}
            <div className="flex gap-1.5 mb-4">
              {[
                { key: 'basic', label: '수업내용' },
                { key: 'daily', label: '데일리테스트' },
                { key: 'hw', label: '과제배부' },
              ].map((t) => (
                <button key={t.key} onClick={() => setNoteTab(t.key as typeof noteTab)}
                  className={cx('px-3 py-1.5 rounded-lg text-xs font-bold border transition-all',
                    noteTab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── 수업내용 탭 ── */}
            {noteTab === 'basic' && (
              <div className="space-y-4">
                {/* 진도 내용 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📖 진도 내용</label>
                  <textarea value={noteProgress} onChange={(e) => setNoteProgress(e.target.value)}
                    rows={2} placeholder="예: 이차방정식 - 근의 공식 / 인수분해 응용"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                {/* WISE Step */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700">🎯 W·I·S·E Step</label>
                    <span className="text-[10px] text-gray-400">학생 설정 자동 로드</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {WISE_STEPS.map((step) => (
                      <button key={step} onClick={() => setNoteWISE(step)}
                        className={cx('py-2.5 rounded-xl text-sm font-black border-2 transition-all flex flex-col items-center gap-0.5',
                          noteWISE === step ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                        <span>{step}</span>
                        <span className="text-[9px] font-normal opacity-70">{WISE_DESC[step].split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 출결 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">출결</label>
                  <div className="flex gap-2">
                    {['정시', '지각', '결석'].map((att) => (
                      <button key={att} onClick={() => setNoteAttendance(att)}
                        className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                          noteAttendance === att
                            ? att === '정시' ? 'bg-green-600 text-white border-green-600'
                            : att === '지각' ? 'bg-yellow-500 text-white border-yellow-500'
                            : 'bg-red-500 text-white border-red-500'
                            : 'bg-white text-gray-600 border-gray-200')}>
                        {att === '정시' ? '✅ 정시' : att === '지각' ? '⚠️ 지각' : '❌ 결석'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 과제 달성률 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📊 과제 달성률</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACHIEVEMENT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => setNoteAchievement(opt.value)}
                        className={cx('py-2.5 rounded-xl text-sm font-black border-2 transition-all',
                          noteAchievement === opt.value ? opt.bg : 'bg-white text-gray-600 border-gray-200',
                          noteAchievement === opt.value ? opt.color : '')}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 과제 성취도 % */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">🎯 과제 성취도</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[0, 30, 50, 70, 90, 100].map((pct) => (
                      <button key={pct} onClick={() => setNoteScorePct(pct)}
                        className={cx('px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all',
                          noteScorePct === pct
                            ? pct >= 90 ? 'bg-green-600 text-white border-green-600'
                            : pct >= 70 ? 'bg-blue-600 text-white border-blue-600'
                            : pct >= 50 ? 'bg-yellow-500 text-white border-yellow-500'
                            : 'bg-red-500 text-white border-red-500'
                            : 'bg-white text-gray-600 border-gray-200')}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* 추가수업 */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <input type="checkbox" id="extraClass" checked={noteExtraClass}
                      onChange={(e) => setNoteExtraClass(e.target.checked)}
                      className="w-4 h-4 accent-blue-600" />
                    <label htmlFor="extraClass" className="text-xs font-bold text-gray-700">추가수업</label>
                  </div>
                  {noteExtraClass && (
                    <input type="text" value={noteExtraTime} onChange={(e) => setNoteExtraTime(e.target.value)}
                      placeholder="예: 오후 6시~7시"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  )}
                </div>

                {/* 메모 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📝 메모 <span className="text-gray-400 font-normal">(선택)</span></label>
                  <textarea value={noteMemo} onChange={(e) => setNoteMemo(e.target.value)}
                    rows={2} placeholder="특이사항, 다음 수업 준비사항 등"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            )}

            {/* ── 데일리 테스트 탭 ── */}
            {noteTab === 'daily' && (
              <div className="space-y-4">
                <div className="bg-amber-50 rounded-xl p-3 text-xs text-amber-700">
                  💡 수업 중 진행한 데일리 테스트 결과를 입력해주세요
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">단원명 / 범위</label>
                  <input type="text" value={dailyTestUnit} onChange={(e) => setDailyTestUnit(e.target.value)}
                    placeholder="예: 이차방정식 근의 공식"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">점수</label>
                  <input type="number" min="0" max="100" value={dailyTestScore}
                    onChange={(e) => setDailyTestScore(e.target.value)}
                    placeholder="0 ~ 100"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                {dailyTestScore && (
                  <div className={cx('rounded-xl p-3 text-center text-sm font-bold',
                    parseInt(dailyTestScore) >= 90 ? 'bg-green-50 text-green-600' :
                    parseInt(dailyTestScore) >= 70 ? 'bg-blue-50 text-blue-600' :
                    'bg-red-50 text-red-500')}>
                    {dailyTestScore}점 · {parseInt(dailyTestScore) >= 90 ? '우수 🎉' : parseInt(dailyTestScore) >= 70 ? '양호 👍' : '보완 필요 📚'}
                  </div>
                )}
              </div>
            )}

            {/* ── 과제 배부 탭 ── */}
            {noteTab === 'hw' && (
              <div className="space-y-4">
                <div className="bg-green-50 rounded-xl p-3 text-xs text-green-700">
                  💡 과제 배부 시 학생 앱 "오늘 과제" 탭에 자동으로 표시됩니다
                </div>

                {/* 교재 과제 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📖 교재 과제</label>
                  <input type="text" value={hwTextbookName} onChange={(e) => setHwTextbookName(e.target.value)}
                    placeholder="교재명 (예: 쎈B, RPM)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-2" />
                  <input type="text" value={hwTextbookPage} onChange={(e) => setHwTextbookPage(e.target.value)}
                    placeholder="페이지/범위 (예: p.45~52, 3단원 B유형)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>

                {/* 학습지 과제 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📝 학습지 과제</label>
                  <input type="text" value={hwWorksheetRange} onChange={(e) => setHwWorksheetRange(e.target.value)}
                    placeholder="범위 (예: 이차방정식 2.1.3~2.1.5차시, 3레벨)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                </div>

                {/* 영상 과제 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📹 영상 과제 링크</label>
                  <input type="url" value={hwVideoUrl} onChange={(e) => setHwVideoUrl(e.target.value)}
                    placeholder="https://youtube.com/..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                  {hwVideoUrl && (
                    <p className="text-xs text-green-600 mt-1">✓ 학생이 영상 시작/완료 버튼을 사용할 수 있어요</p>
                  )}
                </div>
              </div>
            )}

            <button onClick={handleSaveNote} disabled={savingNote}
              className="w-full mt-6 py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingNote ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</> : '📓 수업일지 저장'}
            </button>
          </div>
        </div>
      )}

            {/* ── 알림장(피드백) 모달 ── */}
      {showFeedbackModal && feedbackStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowFeedbackModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">💬 학부모 알림장 작성</h3>
              <button onClick={() => setShowFeedbackModal(false)} className="text-gray-400">✕</button>
            </div>
            <div className="bg-purple-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-sm font-bold text-purple-700">
                {feedbackStudent.name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-purple-800">{feedbackStudent.name}</p>
                <p className="text-xs text-purple-500">{feedbackStudent.grade}</p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">간단 메모 <span className="text-red-400">*</span></label>
              <textarea value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)}
                rows={3} placeholder="예: 과제 대충해옴. 자세가 안좋음. 남아서 추가로 마저 고치고 감"
                autoFocus
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div className="bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-600">
              💡 저장하면 AI가 자동으로 학부모용 알림장 4문장을 생성해요
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowFeedbackModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
              <button onClick={handleSaveFeedback} disabled={!feedbackContent.trim() || savingFeedback}
                className="flex-1 py-3 bg-purple-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {savingFeedback
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />AI 알림장 생성 중...</>
                  : '✨ 저장 + AI 알림장 생성'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 시간표 추가 모달 ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowScheduleModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📅 시간표 추가</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400">✕</button>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생</label>
              {scheduleStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <p className="text-sm font-bold text-blue-800 flex-1">{scheduleStudent.name}</p>
                  <button onClick={() => setScheduleStudent(null)} className="text-blue-400">✕</button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                  {myStudents.map((s) => (
                    <button key={s.id} onClick={() => setScheduleStudent(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 text-sm font-semibold text-gray-800">
                      {s.name} <span className="text-xs text-gray-400 font-normal">{s.grade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">요일</label>
              <div className="flex gap-1.5">
                {DAYS.map((d) => (
                  <button key={d} onClick={() => setScheduleDay(d)}
                    className={cx('flex-1 py-2 rounded-lg text-sm font-bold border transition-all',
                      scheduleDay === d ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시간</label>
              <div className="flex gap-1.5 flex-wrap">
                {TIMES.map((t) => (
                  <button key={t} onClick={() => setScheduleTime(t)}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      scheduleTime === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">수업 교시</label>
              <div className="flex gap-2">
                {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((p) => (
                  <button key={p} onClick={() => setSchedulePeriods(p)}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      schedulePeriods === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {p}교시
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleSaveSchedule} disabled={!scheduleStudent || savingSchedule}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingSchedule ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</> : '저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
