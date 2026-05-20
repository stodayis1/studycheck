'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  session_type: string
  today_textbook_name: string | null
  today_chapter: string | null
  video_url: string | null
}

interface LearningNote {
  id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  textbook_page: string | null
  textbook_progress: number | null
  workbook_done: boolean
  memo: string | null
  video_started_at: string | null
  video_completed_at: string | null
}

interface Feedback {
  id: string
  teacher_name: string
  content: string
  is_read: boolean
  created_at: string
}

function getLocalDateStr(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getWeekDates(weekOffset: number) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() + 1 + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return getLocalDateStr(d)
  })
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const TEXTBOOK_PROGRESS = [0, 30, 50, 70, 90, 100]

export default function StudentLearningNotesPage() {
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentGrade, setStudentGrade] = useState<string>('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)

  // 배움노트 작성 모달
  const [showModal, setShowModal] = useState(false)
  const [activeSession, setActiveSession] = useState<ClassSession | null>(null)
  const [attendance, setAttendance] = useState('정시')
  const [wsSubmitted, setWsSubmitted] = useState(false)
  const [wsScore, setWsScore] = useState('')
  const [tbProgress, setTbProgress] = useState(0)
  const [tbPage, setTbPage] = useState('')
  const [wbDone, setWbDone] = useState(false)
  const [videoWatched, setVideoWatched] = useState<'yes' | 'no' | null>(null)
  const [memo, setMemo] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)
        setStudentId(session.id)

        const { data: studentData } = await supabase
          .from('students').select('grade').eq('id', session.id).single()
        if (studentData) setStudentGrade(studentData.grade)

        await fetchData(session.id)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  async function fetchData(sid: string) {
    const [{ data: ssData }, { data: nData }, { data: fbData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', sid).order('session_date', { ascending: false }),
      supabase.from('learning_notes').select('*').eq('student_id', sid),
      supabase.from('feedbacks').select('*').eq('student_id', sid).order('created_at', { ascending: false }),
    ])
    if (ssData) setSessions(ssData)
    if (nData) setNotes(nData)
    if (fbData) setFeedbacks(fbData)
  }

  function getNoteBySession(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  function getFeedbacksByDate(dateStr: string) {
    return feedbacks.filter((fb) => fb.created_at.startsWith(dateStr))
  }

  function openModal(session: ClassSession) {
    const existing = getNoteBySession(session.id)
    setActiveSession(session)
    setAttendance(existing?.attendance ?? '정시')
    setWsSubmitted(existing?.worksheet_submitted ?? false)
    setWsScore(existing?.worksheet_score?.toString() ?? '')
    setTbProgress(existing?.textbook_progress ?? 0)
    setTbPage(existing?.textbook_page ?? '')
    setWbDone(existing?.workbook_done ?? false)
    setVideoWatched(existing?.video_completed_at ? 'yes' : existing?.video_started_at ? 'no' : null)
    setMemo(existing?.memo ?? '')
    setShowModal(true)
  }

  async function handleSave() {
    if (!activeSession || !studentId) return
    setSaving(true)
    const existing = getNoteBySession(activeSession.id)
    const noteData = {
      student_id: studentId,
      session_id: activeSession.id,
      attendance,
      worksheet_submitted: wsSubmitted,
      worksheet_score: wsSubmitted && wsScore ? parseInt(wsScore) : null,
      textbook_submitted: tbProgress > 0,
      textbook_progress: tbProgress,
      textbook_page: tbPage || null,
      workbook_done: wbDone,
      memo: memo || null,
    }
    if (existing) {
      await supabase.from('learning_notes').update(noteData).eq('id', existing.id)
    } else {
      await supabase.from('learning_notes').insert(noteData)
    }
    setShowModal(false)
    setSaving(false)
    if (studentId) fetchData(studentId)
  }

  const isElementary = studentGrade.includes('초')
  const weekDates = getWeekDates(weekOffset)
  const todayStr = getLocalDateStr(new Date())

  function fmtDate(d: string) {
    const [, m, day] = d.split('-')
    return `${parseInt(m)}/${parseInt(day)}`
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="배움노트" subtitle="학원에서 수업 후 작성해주세요" />
      <div className="px-4 py-4 space-y-3 pb-10">

        {/* 주간 네비게이션 */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <button onClick={() => setWeekOffset(weekOffset - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg">‹</button>
          <div className="text-center">
            <p className="text-sm font-bold text-gray-800">
              {fmtDate(getWeekDates(weekOffset)[0])} ~ {fmtDate(getWeekDates(weekOffset)[6])}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {weekOffset === 0 ? '이번 주' : weekOffset === -1 ? '지난 주' : `${Math.abs(weekOffset)}주 전`}
            </p>
          </div>
          <button onClick={() => setWeekOffset(Math.min(0, weekOffset + 1))}
            disabled={weekOffset === 0}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg disabled:opacity-30">›</button>
        </div>

        {/* 날짜별 카드 */}
        {weekDates.map((date, idx) => {
          const daySessions = sessions.filter((s) => s.session_date === date)
          const dayFeedbacks = getFeedbacksByDate(date)
          const isToday = date === todayStr
          if (daySessions.length === 0 && dayFeedbacks.length === 0) return null

          return (
            <div key={date} className={cx(
              'bg-white rounded-2xl border-2 overflow-hidden shadow-sm',
              isToday ? 'border-blue-200' : 'border-gray-100'
            )}>
              {/* 날짜 헤더 */}
              <div className={cx('px-4 py-2.5 flex items-center gap-2',
                isToday ? 'bg-blue-50' : 'bg-gray-50')}>
                <span className={cx('text-xs font-black px-2 py-0.5 rounded-full',
                  isToday ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600')}>
                  {DAY_LABELS[idx]}
                </span>
                <span className="text-sm font-bold text-gray-800">{fmtDate(date)}</span>
                {isToday && <span className="text-xs text-blue-500 font-bold">오늘</span>}
              </div>

              <div className="px-4 py-3 space-y-3">
                {daySessions.map((session) => {
                  const note = getNoteBySession(session.id)
                  return (
                    <div key={session.id} className="space-y-2">
                      {/* 수업 정보 */}
                      {session.today_textbook_name && (
                        <p className="text-xs text-gray-500">
                          📖 {session.today_textbook_name}
                          {session.today_chapter && ` · ${session.today_chapter}`}
                        </p>
                      )}

                      {/* 배움노트 내용 */}
                      {note ? (
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1.5">
                            {/* 출석 */}
                            <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                              note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                              note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                              'bg-green-100 text-green-600')}>
                              {note.attendance === '정시' ? '✅ 정시출석' : note.attendance === '지각' ? '⚠️ 지각' : '❌ 결석'}
                            </span>
                            {/* 학습지 */}
                            <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                              note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                              📝 학습지 {note.worksheet_submitted
                                ? `제출${note.worksheet_score != null ? ` ${note.worksheet_score}점` : ''}`
                                : '미제출'}
                            </span>
                            {/* 교재 */}
                            <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                              (note.textbook_progress ?? 0) > 0 ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-500')}>
                              📖 교재 {(note.textbook_progress ?? 0) > 0 ? `${note.textbook_progress}%` : '0%'}
                            </span>
                            {/* 연산서 (초등) */}
                            {isElementary && (
                              <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                                note.workbook_done ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                                🔢 연산서 {note.workbook_done ? '완료' : '미완료'}
                              </span>
                            )}
                            {/* 영상 */}
                            {session.video_url && (
                              <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                                note.video_completed_at ? 'bg-green-50 text-green-700' :
                                note.video_started_at ? 'bg-blue-50 text-blue-600' :
                                'bg-gray-50 text-gray-400')}>
                                📹 영상 {note.video_completed_at ? '완료' : note.video_started_at ? '시청중' : '미시청'}
                              </span>
                            )}
                          </div>
                          {note.memo && <p className="text-xs text-gray-400">💬 {note.memo}</p>}
                          <button onClick={() => openModal(session)}
                            className="text-[10px] text-gray-400 hover:text-gray-600">✏️ 수정하기</button>
                        </div>
                      ) : (
                        <button onClick={() => openModal(session)}
                          className="w-full py-2.5 text-sm font-bold text-blue-600 bg-blue-50 rounded-xl border border-blue-100">
                          ✏️ 배움노트 작성하기
                        </button>
                      )}
                    </div>
                  )
                })}

                {/* 선생님 피드백 */}
                {dayFeedbacks.map((fb) => (
                  <div key={fb.id} className="bg-purple-50 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-bold text-purple-500 mb-1">💬 {fb.teacher_name} 선생님 피드백</p>
                    <p className="text-xs text-gray-700 leading-relaxed">{fb.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {weekDates.every((date) =>
          !sessions.some((s) => s.session_date === date) &&
          !getFeedbacksByDate(date).length
        ) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📓</p>
            <p className="text-sm font-semibold text-gray-600">이번 주 수업 기록이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">← 버튼으로 지난 주를 확인해보세요</p>
          </div>
        )}
      </div>

      {/* 배움노트 작성 모달 */}
      {showModal && activeSession && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📓 배움노트 작성</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl px-4 py-3 text-xs text-gray-600">
              <p className="font-bold">{activeSession.session_date} 수업</p>
              {activeSession.today_textbook_name && (
                <p className="mt-0.5">📖 {activeSession.today_textbook_name} · {activeSession.today_chapter}</p>
              )}
            </div>

            {/* 출석 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">출석</label>
              <div className="flex gap-2">
                {['정시', '지각', '결석'].map((att) => (
                  <button key={att} onClick={() => setAttendance(att)}
                    className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      attendance === att
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
              <label className="block text-xs font-bold text-gray-700">📝 학습지 제출 여부</label>
              <div className="flex gap-2">
                <button onClick={() => setWsSubmitted(true)}
                  className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                    wsSubmitted ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                  ✅ 제출했어요
                </button>
                <button onClick={() => setWsSubmitted(false)}
                  className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                    !wsSubmitted ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                  ❌ 못 했어요
                </button>
              </div>
              {wsSubmitted && (
                <input type="number" min="0" max="100" value={wsScore}
                  onChange={(e) => setWsScore(e.target.value)}
                  placeholder="점수 입력 (선택)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            {/* 교재 달성률 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                📖 교재 과제 달성률 <span className="text-blue-600 font-black">{tbProgress}%</span>
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {TEXTBOOK_PROGRESS.map((pct) => (
                  <button key={pct} onClick={() => setTbProgress(pct)}
                    className={cx('px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all',
                      tbProgress === pct
                        ? pct === 100 ? 'bg-green-600 text-white border-green-600'
                        : pct >= 70 ? 'bg-blue-600 text-white border-blue-600'
                        : pct >= 30 ? 'bg-yellow-500 text-white border-yellow-500'
                        : 'bg-red-500 text-white border-red-500'
                        : 'bg-white text-gray-600 border-gray-200')}>
                    {pct}%
                  </button>
                ))}
              </div>
              <input type="text" value={tbPage} onChange={(e) => setTbPage(e.target.value)}
                placeholder="풀었던 페이지 범위 (예: p.24~35)"
                className="w-full mt-2 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 연산서 (초등) */}
            {isElementary && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">🔢 연산서</label>
                <div className="flex gap-2">
                  <button onClick={() => setWbDone(true)}
                    className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      wbDone ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                    ✅ 완료
                  </button>
                  <button onClick={() => setWbDone(false)}
                    className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      !wbDone ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                    ❌ 미완료
                  </button>
                </div>
              </div>
            )}

            {/* 영상 (학원에서 시청 여부) */}
            {activeSession.video_url && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">📹 영상 과제 시청 여부</label>
                <div className="flex gap-2">
                  <button onClick={() => setVideoWatched('yes')}
                    className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      videoWatched === 'yes' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                    ✅ 봤어요
                  </button>
                  <button onClick={() => setVideoWatched('no')}
                    className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      videoWatched === 'no' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                    ❌ 아직요
                  </button>
                </div>
              </div>
            )}

            {/* 한마디 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">💬 한마디 <span className="text-gray-400 font-normal">(선택)</span></label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)}
                rows={2} placeholder="오늘 수업 어땠나요?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</> : '📓 배움노트 저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
