'use client'

import { useState, useEffect, useMemo } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface Feedback {
  id: string
  student_id: string
  teacher_name: string
  content: string
  ai_message: string | null
  created_at: string
}

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  session_type: string
  today_textbook_name: string | null
  today_chapter: string | null
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
  memo: string | null
  achievement?: number | null
}

function parseImages(aiMessage: string | null): string[] {
  if (!aiMessage) return []
  try {
    const parsed = JSON.parse(aiMessage)
    if (parsed && Array.isArray(parsed.images)) return parsed.images
  } catch {}
  return []
}

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function daysAgoStr(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TeacherMyRecordsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)

  const [tab, setTab] = useState<'feedback' | 'note'>('feedback')
  const [studentFilter, setStudentFilter] = useState<string>('all')
  const [studentSearch, setStudentSearch] = useState('')
  const [showStudentDropdown, setShowStudentDropdown] = useState(false)
  const [startDate, setStartDate] = useState(daysAgoStr(7))
  const [endDate, setEndDate] = useState(todayStr())

  // 알림장 수정 모달
  const [editingFeedback, setEditingFeedback] = useState<Feedback | null>(null)
  const [editContent, setEditContent] = useState('')
  const [editImages, setEditImages] = useState<string[]>([])
  const [savingFeedback, setSavingFeedback] = useState(false)

  // 수업일지 보기 모달
  const [viewingSession, setViewingSession] = useState<ClassSession | null>(null)

  async function fetchData() {
    setLoading(true)
    const [studentsRes, feedbacksRes, sessionsData, notesData] = await Promise.all([
      supabase.from('students').select('id, name, school, grade, teacher_name').eq('is_active', true).order('name'),
      supabase.from('feedbacks').select('*').order('created_at', { ascending: false }),
      // limit()만으론 PostgREST 기본 상한(1000행)에 걸려 최근 기록이 빠질 수 있어 전부 순회
      fetchAllRows<ClassSession>(() => supabase.from('class_sessions').select('*').order('session_date', { ascending: false })),
      fetchAllRows(() => supabase.from('learning_notes').select('*')),
    ])
    if (studentsRes.data) setStudents(studentsRes.data)
    if (feedbacksRes.data) setFeedbacks(feedbacksRes.data)
    if (sessionsData) setSessions(sessionsData)
    if (notesData) setNotes(notesData)
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  // 담당 학생 (학생관리 페이지와 동일한 split/includes 로직)
  const myStudentIds = useMemo(() => {
    if (isAdmin()) return new Set(students.map((s) => s.id))
    return new Set(
      students
        .filter((s) => {
          if (!currentUser?.name || !s.teacher_name) return false
          const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
          return teachers.includes(currentUser.name)
        })
        .map((s) => s.id)
    )
  }, [students, currentUser, isAdmin])

  const myStudents = students.filter((s) => myStudentIds.has(s.id))
  const searchedStudents = myStudents.filter((s) =>
    s.name.includes(studentSearch) || s.school?.includes(studentSearch)
  )
  const selectedStudent = studentFilter !== 'all' ? myStudents.find((s) => s.id === studentFilter) : null
  const studentMap = useMemo(() => {
    const m = new Map<string, Student>()
    students.forEach((s) => m.set(s.id, s))
    return m
  }, [students])

  // 알림장: 본인 작성분만 (관리자는 담당학생 전체), 학생/기간 필터
  const filteredFeedbacks = feedbacks.filter((f) => {
    if (!myStudentIds.has(f.student_id)) return false
    if (!isAdmin() && f.teacher_name !== currentUser?.name) return false
    if (studentFilter !== 'all' && f.student_id !== studentFilter) return false
    const d = f.created_at.slice(0, 10)
    return d >= startDate && d <= endDate
  })

  // 수업일지: session_type이 있는 것 기준, 학생/기간 필터
  const filteredSessions = sessions.filter((s) => {
    if (!myStudentIds.has(s.student_id)) return false
    if (studentFilter !== 'all' && s.student_id !== studentFilter) return false
    return s.session_date >= startDate && s.session_date <= endDate
  })

  function noteFor(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  function openEditFeedback(fb: Feedback) {
    setEditingFeedback(fb)
    setEditContent(fb.content || '')
    setEditImages(parseImages(fb.ai_message))
  }

  async function handleSaveFeedback() {
    if (!editingFeedback) return
    setSavingFeedback(true)
    const aiMessageValue = editImages.length > 0 ? JSON.stringify({ images: editImages }) : null
    await supabase.from('feedbacks').update({
      content: editContent.trim(),
      ai_message: aiMessageValue,
    }).eq('id', editingFeedback.id)
    setSavingFeedback(false)
    setEditingFeedback(null)
    fetchData()
  }

  async function handleDeleteFeedback(fb: Feedback) {
    const canDelete = isAdmin() || fb.teacher_name === currentUser?.name
    if (!canDelete) {
      alert('이 알림장은 삭제 권한이 없어요')
      return
    }
    if (!confirm('이 알림장과 답장을 모두 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.from('feedback_replies').delete().eq('feedback_id', fb.id)
    await supabase.from('feedbacks').delete().eq('id', fb.id)
    setEditingFeedback(null)
    fetchData()
  }

  // 수업일지 수정 가능 여부: 당일+다음날, 관리자는 예외
  function canEditSession(sessionDate: string) {
    if (isAdmin()) return true
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const sDate = new Date(sessionDate)
    sDate.setHours(0, 0, 0, 0)
    return sDate >= today && sDate <= tomorrow
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="내 기록" />

      <div className="p-4 space-y-4 max-w-3xl mx-auto pb-24">
        {/* 필터 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="relative">
            <label className="block text-xs font-bold text-gray-700 mb-1.5">학생</label>
            {selectedStudent ? (
              <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl"
                style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
                <span className="text-sm font-bold flex-1" style={{ color: '#085041' }}>
                  {selectedStudent.name} <span className="text-xs font-normal text-gray-500">({selectedStudent.school} {selectedStudent.grade})</span>
                </span>
                <button onClick={() => { setStudentFilter('all'); setStudentSearch('') }}
                  className="text-gray-400 text-sm px-1">✕</button>
              </div>
            ) : (
              <>
                <input type="text" value={studentSearch}
                  onChange={(e) => { setStudentSearch(e.target.value); setShowStudentDropdown(true) }}
                  onFocus={() => setShowStudentDropdown(true)}
                  placeholder="학생 이름 검색 (비워두면 전체)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2"
                  style={{ '--tw-ring-color': '#9FE1CB' } as React.CSSProperties} />
                {showStudentDropdown && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowStudentDropdown(false)} />
                    <div className="absolute left-0 right-0 mt-1.5 max-h-56 overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-lg z-20">
                      <button onClick={() => { setStudentFilter('all'); setStudentSearch(''); setShowStudentDropdown(false) }}
                        className="w-full text-left px-3.5 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 border-b border-gray-50">
                        전체 학생
                      </button>
                      {searchedStudents.length === 0 && (
                        <p className="px-3.5 py-3 text-xs text-gray-400">검색 결과가 없어요</p>
                      )}
                      {searchedStudents.map((s) => (
                        <button key={s.id}
                          onClick={() => { setStudentFilter(s.id); setStudentSearch(''); setShowStudentDropdown(false) }}
                          className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                          <span className="font-semibold text-gray-900">{s.name}</span>
                          <span className="text-xs text-gray-400 ml-1.5">{s.school} {s.grade}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">시작일</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">종료일</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2">
          <button onClick={() => setTab('feedback')}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all"
            style={tab === 'feedback'
              ? { background: '#9FE1CB', color: '#085041', borderColor: '#9FE1CB' }
              : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
            알림장 ({filteredFeedbacks.length})
          </button>
          <button onClick={() => setTab('note')}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all"
            style={tab === 'note'
              ? { background: '#9FE1CB', color: '#085041', borderColor: '#9FE1CB' }
              : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
            수업일지 ({filteredSessions.length})
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400 text-sm">불러오는 중...</div>
        ) : tab === 'feedback' ? (
          <div className="space-y-2.5">
            {filteredFeedbacks.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">해당 기간에 작성한 알림장이 없어요</div>
            )}
            {filteredFeedbacks.map((fb) => {
              const student = studentMap.get(fb.student_id)
              const images = parseImages(fb.ai_message)
              return (
                <button key={fb.id} onClick={() => openEditFeedback(fb)}
                  className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-900">{student?.name ?? '알 수 없음'}</span>
                    <span className="text-[11px] text-gray-400">
                      {new Date(fb.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2 whitespace-pre-wrap">{fb.content}</p>
                  {images.length > 0 && (
                    <div className="flex gap-1.5 mt-2">
                      {images.slice(0, 4).map((url, i) => (
                        <div key={i} className="w-12 h-12 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      ))}
                      {images.length > 4 && (
                        <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center text-[11px] text-gray-400 shrink-0">
                          +{images.length - 4}
                        </div>
                      )}
                    </div>
                  )}
                  {isAdmin() && fb.teacher_name !== currentUser?.name && (
                    <p className="text-[11px] mt-1.5" style={{ color: '#9ca3af' }}>작성: {fb.teacher_name}</p>
                  )}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="space-y-2.5">
            {filteredSessions.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">해당 기간에 작성한 수업일지가 없어요</div>
            )}
            {filteredSessions.map((s) => {
              const student = studentMap.get(s.student_id)
              const note = noteFor(s.id)
              return (
                <button key={s.id} onClick={() => setViewingSession(s)}
                  className="w-full text-left bg-white rounded-2xl border border-gray-200 p-4 hover:border-gray-300 transition-all">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-bold text-gray-900">{student?.name ?? '알 수 없음'}</span>
                    <span className="text-[11px] text-gray-400">{s.session_date}</span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {s.today_textbook_name ?? '진도 없음'}
                    {s.today_chapter ? ` · ${s.today_chapter}` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {note?.attendance && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#F0FBF7', color: '#085041' }}>{note.attendance}</span>
                    )}
                    {s.daily_test_score != null && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        데일리 {s.daily_test_score}점
                      </span>
                    )}
                    {!canEditSession(s.session_date) && (
                      <span className="text-[11px] text-gray-400">수정 기간 지남</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 알림장 수정 모달 */}
      {editingFeedback && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setEditingFeedback(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {studentMap.get(editingFeedback.student_id)?.name} 알림장 수정
              </h3>
              <button onClick={() => setEditingFeedback(null)} className="text-gray-400">✕</button>
            </div>

            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
              rows={5}
              className="w-full px-3.5 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 resize-none"
              style={{ '--tw-ring-color': '#9FE1CB' } as React.CSSProperties} />

            {editImages.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                {editImages.map((url, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden border border-gray-200">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setEditImages((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              {(isAdmin() || editingFeedback.teacher_name === currentUser?.name) && (
                <button onClick={() => handleDeleteFeedback(editingFeedback)}
                  className="px-4 py-3 bg-red-50 text-red-500 font-bold rounded-xl text-sm">삭제</button>
              )}
              <button onClick={() => setEditingFeedback(null)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
              <button onClick={handleSaveFeedback} disabled={savingFeedback}
                className="flex-1 py-3 text-white font-bold rounded-xl disabled:opacity-50"
                style={{ background: '#9FE1CB' }}>
                {savingFeedback ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 수업일지 상세 보기 모달 (읽기 전용 - 수정은 학습관리 페이지에서) */}
      {viewingSession && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setViewingSession(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-3 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                {studentMap.get(viewingSession.student_id)?.name} · {viewingSession.session_date}
              </h3>
              <button onClick={() => setViewingSession(null)} className="text-gray-400">✕</button>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-50">
                <span className="text-gray-500">오늘 진도</span>
                <span className="font-semibold text-gray-900 text-right">
                  {viewingSession.today_textbook_name ?? '-'} {viewingSession.today_chapter ?? ''}
                </span>
              </div>
              {viewingSession.daily_test_unit && (
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">데일리 테스트</span>
                  <span className="font-semibold text-gray-900 text-right">
                    {viewingSession.daily_test_unit} · {viewingSession.daily_test_score ?? '-'}점
                  </span>
                </div>
              )}
              {viewingSession.hw_textbook_name && (
                <div className="flex justify-between py-2 border-b border-gray-50">
                  <span className="text-gray-500">과제</span>
                  <span className="font-semibold text-gray-900 text-right">
                    {viewingSession.hw_textbook_name} {viewingSession.hw_textbook_page ?? ''}
                  </span>
                </div>
              )}
              {noteFor(viewingSession.id)?.memo && (
                <div className="py-2">
                  <span className="text-gray-500 block mb-1">메모</span>
                  <p className="text-gray-800 whitespace-pre-wrap">{noteFor(viewingSession.id)?.memo}</p>
                </div>
              )}
            </div>

            {!canEditSession(viewingSession.session_date) ? (
              <p className="text-xs text-center text-gray-400 pt-2">
                수정은 수업 당일과 다음날까지만 가능해요. 그 이후엔 관리자에게 문의해주세요.
              </p>
            ) : (
              <p className="text-xs text-center text-gray-400 pt-2">
                자세한 수정은 학습관리 페이지에서 해당 학생을 선택해 진행해주세요.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
