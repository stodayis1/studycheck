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
  is_active: boolean
}

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  session_type: string
  today_textbook_name: string | null
  today_chapter: string | null
  created_by: string | null
}

interface LearningNote {
  id: string
  student_id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  textbook_page: string | null
  workbook_done: boolean
  memo: string | null
}

const DAYS = ['월', '화', '수', '목', '금', '토']
const TIMES = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00']

// 학년별 색상 (bg, border, text, sub)
const GRADE_COLORS: Record<string, { bg: string; border: string; text: string; sub: string }> = {
  '초1': { bg: '#fffde7', border: '#ffe082', text: '#212121', sub: '#f9a825' },
  '초2': { bg: '#fff9c4', border: '#ffd54f', text: '#212121', sub: '#f57f17' },
  '초3': { bg: '#fff176', border: '#ffca28', text: '#212121', sub: '#e65100' },
  '초4': { bg: '#ffe0b2', border: '#ffb74d', text: '#212121', sub: '#e65100' },
  '초5': { bg: '#ffcc80', border: '#ffa726', text: '#212121', sub: '#bf360c' },
  '초6': { bg: '#ffb300', border: '#ff8f00', text: '#212121', sub: '#e65100' },
  '중1': { bg: '#e8f5e9', border: '#a5d6a7', text: '#212121', sub: '#2e7d32' },
  '중2': { bg: '#c8e6c9', border: '#66bb6a', text: '#212121', sub: '#1b5e20' },
  '중3': { bg: '#a5d6a7', border: '#43a047', text: '#212121', sub: '#1b5e20' },
  '고1': { bg: '#ffebee', border: '#ef9a9a', text: '#212121', sub: '#c62828' },
  '고2': { bg: '#ffcdd2', border: '#e57373', text: '#212121', sub: '#b71c1c' },
  '고3': { bg: '#ef9a9a', border: '#e53935', text: '#212121', sub: '#7f0000' },
  'default': { bg: '#f5f5f5', border: '#bdbdbd', text: '#212121', sub: '#757575' },
}

export default function TeacherLearningNotesPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [tab, setTab] = useState<'notes' | 'schedule'>('notes')

  // 수업 추가 모달
  const [showSessionModal, setShowSessionModal] = useState(false)
  const [sessionStudent, setSessionStudent] = useState<Student | null>(null)
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [sessionType, setSessionType] = useState('정규')
  const [sessionTextbook, setSessionTextbook] = useState('')
  const [sessionChapter, setSessionChapter] = useState('')
  const [savingSession, setSavingSession] = useState(false)

  // 배움노트 입력 모달
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteSession, setNoteSession] = useState<ClassSession | null>(null)
  const [noteAttendance, setNoteAttendance] = useState('정시')
  const [noteWSSubmitted, setNoteWSSubmitted] = useState(false)
  const [noteWSScore, setNoteWSScore] = useState('')
  const [noteTBSubmitted, setNoteTBSubmitted] = useState(false)
  const [noteTBPage, setNoteTBPage] = useState('')
  const [noteWBDone, setNoteWBDone] = useState(false)
  const [noteMemo, setNoteMemo] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 시간표 모달
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleStudent, setScheduleStudent] = useState<Student | null>(null)
  const [scheduleDay, setScheduleDay] = useState('월')
  const [scheduleTime, setScheduleTime] = useState('16:00')
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: scData }, { data: ssData }, { data: nData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('schedules').select('*').eq('is_active', true),
      supabase.from('class_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('learning_notes').select('*'),
    ])
    if (sData) setStudents(sData)
    if (scData) setSchedules(scData)
    if (ssData) setSessions(ssData)
    if (nData) setNotes(nData)
    setLoading(false)
  }

  // 담당 학생만
  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    return s.teacher_name === currentUser?.name
  })

  // 오늘 요일
  const todayDayIndex = new Date().getDay() // 0=일, 1=월, ...6=토
  const dayMap: Record<number, string> = { 1:'월', 2:'화', 3:'수', 4:'목', 5:'금', 6:'토', 0:'일' }
  const todayDay = dayMap[todayDayIndex]

  // 오늘 수업 있는 학생 시간순 정렬
  const todayStudents = myStudents
    .map((s) => {
      const sc = schedules.find((sc) => sc.student_id === s.id && sc.day_of_week === todayDay)
      return { student: s, schedule: sc }
    })
    .filter((x) => x.schedule)
    .sort((a, b) => {
      const timeA = a.schedule!.start_time
      const timeB = b.schedule!.start_time
      return timeA.localeCompare(timeB)
    })

  // 오늘 수업 없는 학생 (이름순)
  const otherStudents = myStudents
    .filter((s) => !schedules.find((sc) => sc.student_id === s.id && sc.day_of_week === todayDay))
    .sort((a, b) => a.name.localeCompare(b.name))

  // 학생별 시간표
  function getStudentSchedules(studentId: string) {
    return schedules.filter((s) => s.student_id === studentId)
  }

  // 학생별 수업 회차
  function getStudentSessions(studentId: string) {
    return sessions.filter((s) => s.student_id === studentId)
  }

  // 수업 회차의 배움노트
  function getSessionNote(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  // 수업 회차 저장
  async function handleSaveSession() {
    if (!sessionStudent) return
    setSavingSession(true)
    await supabase.from('class_sessions').insert({
      student_id: sessionStudent.id,
      session_date: sessionDate,
      session_type: sessionType,
      today_textbook_name: sessionTextbook || null,
      today_chapter: sessionChapter || null,
      created_by: currentUser?.name,
    })
    setShowSessionModal(false)
    setSessionStudent(null)
    setSessionTextbook('')
    setSessionChapter('')
    setSavingSession(false)
    fetchData()
  }

  // 배움노트 저장
  async function handleSaveNote() {
    if (!noteSession) return
    setSavingNote(true)
    const existingNote = getSessionNote(noteSession.id)
    const noteData = {
      student_id: noteSession.student_id,
      session_id: noteSession.id,
      attendance: noteAttendance,
      worksheet_submitted: noteWSSubmitted,
      worksheet_score: noteWSScore ? parseInt(noteWSScore) : null,
      textbook_submitted: noteTBSubmitted,
      textbook_page: noteTBPage || null,
      workbook_done: noteWBDone,
      memo: noteMemo || null,
    }
    if (existingNote) {
      await supabase.from('learning_notes').update(noteData).eq('id', existingNote.id)
    } else {
      await supabase.from('learning_notes').insert(noteData)
    }
    setShowNoteModal(false)
    setNoteSession(null)
    setSavingNote(false)
    fetchData()
  }

  // 배움노트 모달 열기
  function openNoteModal(session: ClassSession) {
    const existing = getSessionNote(session.id)
    setNoteSession(session)
    setNoteAttendance(existing?.attendance ?? '정시')
    setNoteWSSubmitted(existing?.worksheet_submitted ?? false)
    setNoteWSScore(existing?.worksheet_score?.toString() ?? '')
    setNoteTBSubmitted(existing?.textbook_submitted ?? false)
    setNoteTBPage(existing?.textbook_page ?? '')
    setNoteWBDone(existing?.workbook_done ?? false)
    setNoteMemo(existing?.memo ?? '')
    setShowNoteModal(true)
  }

  // 시간표 저장
  async function handleSaveSchedule() {
    if (!scheduleStudent) return
    setSavingSchedule(true)
    await supabase.from('schedules').insert({
      student_id: scheduleStudent.id,
      day_of_week: scheduleDay,
      start_time: scheduleTime,
      is_active: true,
    })
    setShowScheduleModal(false)
    setSavingSchedule(false)
    fetchData()
  }

  // 시간표 삭제
  async function handleDeleteSchedule(id: string) {
    await supabase.from('schedules').update({ is_active: false }).eq('id', id)
    fetchData()
  }

  const todayStr = new Date().toISOString().split('T')[0]

  return (
    <div>
      <Header
        title="배움노트"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          <button
            onClick={() => setShowSessionModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
          >
            + 수업 추가
          </button>
        }
      />

      {/* 탭 */}
      <div className="flex gap-2 px-4 pt-4">
        {[
          { key: 'notes', label: '📓 배움노트' },
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

        {/* ── 배움노트 탭 ── */}
        {tab === 'notes' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-4">

              {/* ── 오늘 시간표 시각화 ── */}
              {todayStudents.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800">📅 오늘 ({todayDay}요일) 시간표</span>
                    <span className="text-xs text-gray-400">{todayStudents.length}명</span>
                  </div>
                  <div className="p-3">
                    {/* 시간대별 그룹핑 - 연속수업 세로 블록으로 표현 */}
                    {(() => {
                      const times = [...new Set(todayStudents.map(({ schedule }) => schedule!.start_time))].sort()
                      const ROW_HEIGHT = 56 // px per hour

                      return (
                        <div className="relative">
                          {/* 시간 레이블 + 구분선 */}
                          {times.map((time) => (
                            <div key={time} className="flex items-start gap-2 mb-0" style={{ height: ROW_HEIGHT }}>
                              <div className="w-12 shrink-0 pt-1">
                                <span className="text-xs font-bold text-gray-400">{time.slice(0,5)}</span>
                              </div>
                              <div className="flex-1 border-t border-gray-100 pt-1 flex flex-wrap gap-1.5">
                                {todayStudents
                                  .filter(({ schedule }) => schedule!.start_time === time)
                                  .map(({ student, schedule }) => {
                                    const color = GRADE_COLORS[student.grade] ?? GRADE_COLORS['default']
                                    const periods = schedule!.periods
                                    const blockHeight = periods * ROW_HEIGHT - 8
                                    return (
                                      <div key={student.id}
                                        className="rounded-xl px-2.5 flex flex-col justify-center"
                                        style={{
                                          backgroundColor: color.bg,
                                          borderLeft: `4px solid ${color.border}`,
                                          height: blockHeight,
                                          minWidth: 76,
                                        }}>
                                        <span className="text-xs font-black" style={{ color: '#111' }}>
                                          {student.name}
                                        </span>
                                        <span className="text-[10px] font-semibold mt-0.5" style={{ color: color.sub }}>
                                          {student.grade} · {periods}교시
                                        </span>
                                      </div>
                                    )
                                  })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* 오늘 수업 학생 */}
              {todayStudents.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="text-sm font-bold text-blue-600">📅 오늘 ({todayDay}요일) 수업</span>
                    <span className="text-xs text-gray-400">{todayStudents.length}명</span>
                  </div>
                  {todayStudents.map(({ student, schedule }) => {
                    const studentSessions = getStudentSessions(student.id)
                      .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
                      .slice(0, 5)

                    return (
                      <div key={student.id} className="bg-white rounded-2xl border-2 border-blue-100 shadow-sm overflow-hidden mb-3">
                        <div className="px-4 py-3 border-b border-blue-50 bg-blue-50 flex items-center gap-3">
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
                            </div>
                          </div>
                          <button
                            onClick={() => { setSessionStudent(student); setShowSessionModal(true) }}
                            className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-white border border-blue-200 rounded-lg"
                          >
                            + 수업
                          </button>
                        </div>
                        {studentSessions.length === 0 ? (
                          <p className="text-center text-xs text-gray-400 py-4">수업 기록이 없어요</p>
                        ) : (
                          <div className="divide-y divide-gray-50">
                            {studentSessions.map((session) => {
                              const note = getSessionNote(session.id)
                              const isToday = session.session_date === todayStr
                              return (
                                <div key={session.id} className="px-4 py-3 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-semibold text-gray-800">{session.session_date}</p>
                                      {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">오늘</span>}
                                      {session.session_type === '추가' && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full">추가수업</span>}
                                      {note && (
                                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                          note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                                          note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                                          'bg-green-100 text-green-600')}>
                                          {note.attendance}
                                        </span>
                                      )}
                                    </div>
                                    {session.today_textbook_name && (
                                      <p className="text-xs text-gray-400 mt-0.5">📖 {session.today_textbook_name} · {session.today_chapter}</p>
                                    )}
                                    {note && (
                                      <div className="flex gap-2 mt-1 flex-wrap">
                                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                          note.worksheet_submitted ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500')}>
                                          학습지 {note.worksheet_submitted ? '제출' : '미제출'}{note.worksheet_score != null && ` ${note.worksheet_score}점`}
                                        </span>
                                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                          note.textbook_submitted ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500')}>
                                          교재 {note.textbook_submitted ? '제출' : '미제출'}{note.textbook_page && ` p.${note.textbook_page}`}
                                        </span>
                                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                          note.workbook_done ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500')}>
                                          연산서 {note.workbook_done ? '완료' : '미완료'}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => openNoteModal(session)}
                                    className={cx('px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0',
                                      note ? 'text-gray-600 bg-gray-50 border border-gray-200' : 'text-blue-600 bg-blue-50 border border-blue-200')}
                                  >
                                    {note ? '수정' : '기록'}
                                  </button>
                                </div>
                              )
                            })}
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
                  <div className="flex items-center gap-2 px-1 mb-2">
                    <span className="text-sm font-bold text-gray-400">오늘 수업 없는 학생</span>
                    <span className="text-xs text-gray-300">{otherStudents.length}명</span>
                  </div>
                  {otherStudents.map((student) => {
                    const studentSessions = getStudentSessions(student.id)
                      .sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())
                      .slice(0, 3)

                    return (
                      <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-3">
                        <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 shrink-0">
                            {student.name[0]}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-700">{student.name}</p>
                            <p className="text-xs text-gray-400">{student.grade}</p>
                          </div>
                          <button
                            onClick={() => { setSessionStudent(student); setShowSessionModal(true) }}
                            className="px-2.5 py-1 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-lg"
                          >
                            + 수업
                          </button>
                        </div>
                        {studentSessions.length === 0 ? (
                          <p className="text-center text-xs text-gray-400 py-3">수업 기록 없음</p>
                        ) : (
                          <div className="divide-y divide-gray-50">
                            {studentSessions.map((session) => {
                              const note = getSessionNote(session.id)
                              return (
                                <div key={session.id} className="px-4 py-2.5 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-xs font-semibold text-gray-600">{session.session_date}</p>
                                      {note && (
                                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                          note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                                          note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                                          'bg-green-100 text-green-600')}>
                                          {note.attendance}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => openNoteModal(session)}
                                    className={cx('px-2 py-1 text-xs font-semibold rounded-lg shrink-0',
                                      note ? 'text-gray-500 bg-gray-50 border border-gray-200' : 'text-blue-600 bg-blue-50 border border-blue-200')}
                                  >
                                    {note ? '수정' : '기록'}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
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
            <button
              onClick={() => setShowScheduleModal(true)}
              className="w-full py-3 rounded-xl text-sm font-bold text-blue-600 bg-blue-50 border-2 border-dashed border-blue-200"
            >
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
                    <button
                      onClick={() => { setScheduleStudent(student); setShowScheduleModal(true) }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg"
                    >
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
                            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700">
                              {sc.day_of_week}
                            </span>
                            <span className="text-sm font-semibold text-gray-700 flex-1">{sc.start_time.slice(0, 5)}</span>
                            <button
                              onClick={() => handleDeleteSchedule(sc.id)}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              삭제
                            </button>
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

      {/* ── 수업 추가 모달 ── */}
      {showSessionModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowSessionModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📅 수업 추가</h3>
              <button onClick={() => setShowSessionModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 선택 <span className="text-red-400">*</span></label>
              {sessionStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <p className="text-sm font-bold text-blue-800 flex-1">{sessionStudent.name} · {sessionStudent.grade}</p>
                  <button onClick={() => setSessionStudent(null)} className="text-blue-400">✕</button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                  {myStudents.map((s) => (
                    <button key={s.id} onClick={() => setSessionStudent(s)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 text-left">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{s.name[0]}</div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.grade}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 날짜 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">수업 날짜</label>
              <input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 수업 유형 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">수업 유형</label>
              <div className="flex gap-2">
                {['정규', '추가'].map((type) => (
                  <button key={type} onClick={() => setSessionType(type)}
                    className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                      sessionType === type ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* 오늘 진행한 교재 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">오늘 진행한 교재 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input type="text" value={sessionTextbook} onChange={(e) => setSessionTextbook(e.target.value)}
                placeholder="예: 개념+유형라이트"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 단원 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">단원 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input type="text" value={sessionChapter} onChange={(e) => setSessionChapter(e.target.value)}
                placeholder="예: IV 비와 비율 > 비"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleSaveSession} disabled={!sessionStudent || savingSession}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingSession
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</>
                : '📅 수업 추가하기'}
            </button>
          </div>
        </div>
      )}

      {/* ── 배움노트 입력 모달 ── */}
      {showNoteModal && noteSession && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowNoteModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📓 배움노트 작성</h3>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600">
              <p className="font-bold">{students.find((s) => s.id === noteSession.student_id)?.name}</p>
              <p className="mt-0.5">{noteSession.session_date} · {noteSession.session_type}수업
                {noteSession.today_textbook_name && ` · ${noteSession.today_textbook_name}`}
              </p>
            </div>

            {/* 출석 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">출석</label>
              <div className="flex gap-2">
                {['정시', '지각', '결석'].map((att) => (
                  <button key={att} onClick={() => setNoteAttendance(att)}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
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

            {/* 학습지 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">📝 학습지 과제</label>
              <div className="flex gap-2">
                <button onClick={() => setNoteWSSubmitted(true)}
                  className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                    noteWSSubmitted ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                  ✅ 제출
                </button>
                <button onClick={() => setNoteWSSubmitted(false)}
                  className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                    !noteWSSubmitted ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                  ❌ 미제출
                </button>
              </div>
              {noteWSSubmitted && (
                <input type="number" min="0" max="100" value={noteWSScore}
                  onChange={(e) => setNoteWSScore(e.target.value)}
                  placeholder="점수 입력 (0~100)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            {/* 교재 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">📖 교재 과제</label>
              <div className="flex gap-2">
                <button onClick={() => setNoteTBSubmitted(true)}
                  className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                    noteTBSubmitted ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                  ✅ 제출
                </button>
                <button onClick={() => setNoteTBSubmitted(false)}
                  className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                    !noteTBSubmitted ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                  ❌ 미제출
                </button>
              </div>
              <input type="text" value={noteTBPage} onChange={(e) => setNoteTBPage(e.target.value)}
                placeholder="페이지 입력 (예: 24~35)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 연산서 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">🔢 연산서</label>
              <div className="flex gap-2">
                <button onClick={() => setNoteWBDone(true)}
                  className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                    noteWBDone ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                  ✅ 완료
                </button>
                <button onClick={() => setNoteWBDone(false)}
                  className={cx('flex-1 py-2 rounded-xl text-sm font-semibold border transition-all',
                    !noteWBDone ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                  ❌ 미완료
                </button>
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
              <textarea value={noteMemo} onChange={(e) => setNoteMemo(e.target.value)}
                rows={2} placeholder="특이사항 기록..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleSaveNote} disabled={savingNote}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingNote
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</>
                : '📓 배움노트 저장하기'}
            </button>
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

            {/* 학생 선택 */}
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

            {/* 요일 */}
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

            {/* 시간 */}
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

            <button onClick={handleSaveSchedule} disabled={!scheduleStudent || savingSchedule}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingSchedule
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</>
                : '저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
