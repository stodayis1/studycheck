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

export default function StudentLearningNotesPage() {
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentGrade, setStudentGrade] = useState<string>('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)

  // 배움노트 작성 모달
  const [showModal, setShowModal] = useState(false)
  const [activeSession, setActiveSession] = useState<ClassSession | null>(null)
  const [attendance, setAttendance] = useState('정시')
  const [wsSubmitted, setWsSubmitted] = useState(false)
  const [wsScore, setWsScore] = useState('')
  const [tbSubmitted, setTbSubmitted] = useState(false)
  const [tbPage, setTbPage] = useState('')
  const [wbDone, setWbDone] = useState(false)
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
      } catch {
        router.push('/auth/login')
      }
      setLoading(false)
    }
    init()
  }, [])

  async function fetchData(sid: string) {
    const [{ data: ssData }, { data: nData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', sid).order('session_date', { ascending: false }),
      supabase.from('learning_notes').select('*').eq('student_id', sid),
    ])
    if (ssData) setSessions(ssData)
    if (nData) setNotes(nData)
  }

  function getNoteBySession(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  function openModal(session: ClassSession) {
    const existing = getNoteBySession(session.id)
    setActiveSession(session)
    setAttendance(existing?.attendance ?? '정시')
    setWsSubmitted(existing?.worksheet_submitted ?? false)
    setWsScore(existing?.worksheet_score?.toString() ?? '')
    setTbSubmitted(existing?.textbook_submitted ?? false)
    setTbPage(existing?.textbook_page ?? '')
    setWbDone(existing?.workbook_done ?? false)
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
      textbook_submitted: tbSubmitted,
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

  // 초등 여부 (연산서 표시용)
  const isElementary = studentGrade.includes('초')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="배움노트" subtitle="수업 후 작성해주세요" />
      <div className="px-4 py-4 space-y-3 pb-10">

        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📓</p>
            <p className="text-sm font-semibold text-gray-600">아직 수업 기록이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">선생님이 수업을 추가하면 여기에 나타나요</p>
          </div>
        ) : (
          sessions.map((session) => {
            const note = getNoteBySession(session.id)
            const isToday = session.session_date === new Date().toISOString().split('T')[0]

            return (
              <div key={session.id} className={cx(
                'bg-white rounded-2xl border-2 shadow-sm overflow-hidden',
                isToday ? 'border-blue-200' : 'border-gray-100'
              )}>
                {/* 수업 헤더 */}
                <div className={cx('px-4 py-3 flex items-center gap-3', isToday ? 'bg-blue-50' : 'bg-gray-50')}>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{session.session_date}</p>
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
                      <p className="text-xs text-gray-500 mt-0.5">
                        📖 {session.today_textbook_name}
                        {session.today_chapter && ` · ${session.today_chapter}`}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => openModal(session)}
                    className={cx('px-3 py-1.5 text-xs font-bold rounded-xl shrink-0',
                      note ? 'bg-gray-100 text-gray-600 border border-gray-200' :
                      'bg-blue-600 text-white')}
                  >
                    {note ? '수정' : '✏️ 작성'}
                  </button>
                </div>

                {/* 배움노트 내용 */}
                {note && (
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                      note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                      📝 학습지 {note.worksheet_submitted ? `제출${note.worksheet_score != null ? ` ${note.worksheet_score}점` : ''}` : '미제출'}
                    </span>
                    <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                      note.textbook_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                      📖 교재 {note.textbook_submitted ? `제출${note.textbook_page ? ` p.${note.textbook_page}` : ''}` : '미제출'}
                    </span>
                    {isElementary && (
                      <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                        note.workbook_done ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                        🔢 연산서 {note.workbook_done ? '완료' : '미완료'}
                      </span>
                    )}
                    {note.memo && <span className="text-[10px] text-gray-400 px-2 py-1">💬 {note.memo}</span>}
                  </div>
                )}
              </div>
            )
          })
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
              <label className="block text-xs font-bold text-gray-700">📝 학습지 과제</label>
              <div className="flex gap-2">
                <button onClick={() => setWsSubmitted(true)}
                  className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                    wsSubmitted ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                  ✅ 제출
                </button>
                <button onClick={() => setWsSubmitted(false)}
                  className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                    !wsSubmitted ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                  ❌ 미제출
                </button>
              </div>
              {wsSubmitted && (
                <input type="number" min="0" max="100" value={wsScore}
                  onChange={(e) => setWsScore(e.target.value)}
                  placeholder="선생님께 받은 점수 입력 (선택)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              )}
            </div>

            {/* 교재 */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700">📖 교재 과제</label>
              <div className="flex gap-2">
                <button onClick={() => setTbSubmitted(true)}
                  className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                    tbSubmitted ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                  ✅ 제출
                </button>
                <button onClick={() => setTbSubmitted(false)}
                  className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                    !tbSubmitted ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-600 border-gray-200')}>
                  ❌ 미제출
                </button>
              </div>
              <input type="text" value={tbPage} onChange={(e) => setTbPage(e.target.value)}
                placeholder="페이지 입력 (예: 24~35)"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 연산서 (초등만) */}
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

            {/* 메모 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">💬 한마디 <span className="text-gray-400 font-normal">(선택)</span></label>
              <textarea value={memo} onChange={(e) => setMemo(e.target.value)}
                rows={2} placeholder="오늘 수업 어땠나요?"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleSave} disabled={saving}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {saving
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</>
                : '📓 배움노트 저장하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
