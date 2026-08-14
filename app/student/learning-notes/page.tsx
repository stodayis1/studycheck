'use client'

import { useEffect, useState } from 'react'
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

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  progress_content: string | null
  daily_test_unit: string | null
  daily_test_score: number | null
  hw_textbook_name: string | null
  hw_worksheet_range: string | null
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
  // 학생 입력 필드
  student_memo: string | null
  textbook_achievement: number | null
  achievement_reason: string | null
  worksheet_reason: string | null
  student_edited: boolean | null
}

interface StudentTextbook {
  id: string
  textbook_name: string
  textbook_type: string
  grade: string | null
  semester: number | null
}

const DAYS = ['일','월','화','수','목','금','토']

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // 월요일 기준
  const start = new Date(d.setDate(diff))
  start.setHours(0,0,0,0)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return { start, end }
}

function formatMD(date: Date) {
  return `${date.getMonth()+1}/${date.getDate()}`
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return `${d.getMonth()+1}/${d.getDate()}`
}

export default function StudentLearningNotePage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [showModal, setShowModal] = useState(false)
  const [modalSession, setModalSession] = useState<ClassSession | null>(null)
  const [modalNote, setModalNote] = useState<LearningNote | null>(null)
  const [saving, setSaving] = useState(false)

  // 학생 입력 필드
  const [textbookAchievement, setTextbookAchievement] = useState(100)
  const [achievementReason, setAchievementReason] = useState('')
  const [worksheetReason, setWorksheetReason] = useState('')
  const [studentMemo, setStudentMemo] = useState('')

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)
        setStudentId(session.id)
        const { data: studentData } = await supabase
          .from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)
        await fetchData(session.id)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  async function fetchData(sid: string) {
    const [{ data: ssData }, { data: tbData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', sid).order('session_date', { ascending: false }),
      supabase.from('student_textbooks').select('*').eq('student_id', sid),
    ])
    if (ssData) setSessions(ssData)
    if (tbData) setTextbooks(tbData)

    if (ssData && ssData.length > 0) {
      const sessionIds = ssData.map(s => s.id)
      const { data: nData } = await supabase
        .from('learning_notes').select('*').in('session_id', sessionIds)
      if (nData) setNotes(nData)
    }
  }

  // 이번 주 범위 계산
  const baseDate = new Date()
  baseDate.setDate(baseDate.getDate() + weekOffset * 7)
  const { start: weekStart, end: weekEnd } = getWeekRange(baseDate)
  const isCurrentWeek = weekOffset === 0

  // 이번 주 수업일 필터
  const weekSessions = sessions.filter(s => {
    const d = new Date(s.session_date)
    return d >= weekStart && d <= weekEnd
  }).sort((a, b) => a.session_date.localeCompare(b.session_date))

  function getNoteForSession(sessionId: string) {
    return notes.find(n => n.session_id === sessionId) ?? null
  }

  function hasWorkbook() {
    return textbooks.some(t => t.textbook_type === '연산서')
  }

  function openModal(session: ClassSession) {
    const note = getNoteForSession(session.id)
    setModalSession(session)
    setModalNote(note)
    setTextbookAchievement(note?.textbook_achievement ?? 100)
    setAchievementReason(note?.achievement_reason ?? '')
    setWorksheetReason(note?.worksheet_reason ?? '')
    setStudentMemo(note?.student_memo ?? '')
    setShowModal(true)
  }

  async function handleSave() {
    if (!modalSession || !studentId) return
    setSaving(true)

    const data = {
      student_id: studentId,
      session_id: modalSession.id,
      textbook_achievement: textbookAchievement,
      achievement_reason: textbookAchievement < 100 ? achievementReason : null,
      worksheet_reason: modalNote && !modalNote.worksheet_submitted ? worksheetReason : null,
      student_memo: studentMemo || null,
      student_edited: true,
    }

    // 이전에는 저장 결과를 전혀 확인하지 않아서, 실패해도(네트워크 오류는 물론, 권한 문제로 조용히
    // 0건 반영되는 경우까지) 모달이 그냥 닫혀버려 학생 입장에선 "저장이 안 된다"고 느껴도 원인을 알
    // 수 없었음. update/insert 뒤에 .select()로 실제로 반영된 행을 받아와서, 없으면(=조용히 실패)
    // 에러가 안 났어도 실패로 간주해 알려주고 모달을 닫지 않아 다시 시도할 수 있게 한다.
    const { data: savedRows, error } = modalNote
      ? await supabase.from('learning_notes').update(data).eq('id', modalNote.id).select()
      : await supabase.from('learning_notes').insert({
          ...data,
          attendance: '정시',
          worksheet_submitted: false,
          textbook_submitted: false,
          workbook_done: false,
        }).select()

    setSaving(false)

    if (error || !savedRows || savedRows.length === 0) {
      console.error('배움노트 저장 오류:', error ?? '반영된 행 없음(권한 문제일 수 있음)')
      alert('저장 중 오류가 발생했어요. 인터넷 연결을 확인하고 다시 시도해주세요.')
      return
    }

    setShowModal(false)
    if (studentId) await fetchData(studentId)
  }

  const canEdit = (note: LearningNote | null) => !note?.student_edited

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="배움노트" subtitle="수업 후 직접 작성해요" />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-3">

        {/* 주간 네비게이터 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between px-4 py-4">
            <button onClick={() => setWeekOffset(w => w - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
              style={{ background: '#f3f4f6' }}>
              <i className="ti ti-chevron-left" style={{ fontSize: 16, color: '#6b7280' }} />
            </button>
            <div className="text-center">
              <p className="text-base font-black text-gray-800">
                {formatMD(weekStart)} ~ {formatMD(weekEnd)}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {isCurrentWeek ? '이번 주' : weekOffset === -1 ? '지난 주' : `${Math.abs(weekOffset)}주 전`}
              </p>
            </div>
            <button onClick={() => setWeekOffset(w => Math.min(0, w + 1))}
              className="w-8 h-8 flex items-center justify-center rounded-full transition-all"
              style={{ background: weekOffset < 0 ? '#f3f4f6' : 'transparent', opacity: weekOffset >= 0 ? 0.3 : 1 }}
              disabled={weekOffset >= 0}>
              <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#6b7280' }} />
            </button>
          </div>
        </div>

        {/* 수업일 카드 목록 */}
        {weekSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <i className="ti ti-notebook" style={{ fontSize: 36, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
            <p className="text-sm font-bold text-gray-600">이번 주 수업이 없어요</p>
          </div>
        ) : (
          weekSessions.map(session => {
            const note = getNoteForSession(session.id)
            const isToday = session.session_date === todayStr
            const dayIdx = new Date(session.session_date).getDay()
            const edited = !!note?.student_edited

            return (
              <div key={session.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden"
                style={{ borderColor: isToday ? '#F5C4B3' : '#f0f0f0', background: isToday ? '#FFFAF9' : 'white' }}>

                {/* 날짜 헤더 */}
                <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm shrink-0"
                    style={{ background: isToday ? '#F5C4B3' : '#f3f4f6', color: isToday ? '#712B13' : '#6b7280' }}>
                    {DAYS[dayIdx]}
                  </div>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-base font-black text-gray-800">{formatDate(session.session_date)}</span>
                    {isToday && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{ background: '#F5C4B3', color: '#712B13' }}>오늘</span>
                    )}
                    {edited && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto"
                        style={{ background: '#f3f4f6', color: '#9ca3af' }}>작성완료</span>
                    )}
                  </div>
                </div>

                {/* 수업 내용 요약 */}
                <div className="px-4 py-3">
                  {session.progress_content && (
                    <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                      <i className="ti ti-books" style={{ fontSize: 12 }} />
                      {session.progress_content}
                    </p>
                  )}

                  {/* 상태 배지들 */}
                  {note ? (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {/* 출결 */}
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                        style={{
                          background: note.attendance === '정시' ? '#EAF3DE' : note.attendance === '지각' ? '#FAEEDA' : '#fee2e2',
                          color: note.attendance === '정시' ? '#27500A' : note.attendance === '지각' ? '#633806' : '#991b1b'
                        }}>
                        <i className={`ti ${note.attendance === '정시' ? 'ti-circle-check' : note.attendance === '지각' ? 'ti-clock-exclamation' : 'ti-x'}`} style={{ fontSize: 11 }} />
                        {note.attendance}
                      </span>
                      {/* 학습지 */}
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                        style={{
                          background: note.worksheet_submitted ? '#EAF3DE' : '#fee2e2',
                          color: note.worksheet_submitted ? '#27500A' : '#991b1b'
                        }}>
                        <i className="ti ti-file-text" style={{ fontSize: 11 }} />
                        학습지 {note.worksheet_submitted ? `제출 ${note.worksheet_score != null ? note.worksheet_score+'점' : ''}` : '미제출'}
                      </span>
                      {/* 교재 달성률 */}
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                        style={{
                          background: (note.textbook_achievement ?? (note.workbook_done ? 100 : 0)) >= 100 ? '#EAF3DE' : '#FAEEDA',
                          color: (note.textbook_achievement ?? (note.workbook_done ? 100 : 0)) >= 100 ? '#27500A' : '#633806'
                        }}>
                        <i className="ti ti-book" style={{ fontSize: 11 }} />
                        교재 {note.textbook_achievement ?? (note.workbook_done ? 100 : 0)}%
                      </span>
                      {/* 연산서 (배정된 경우만) */}
                      {hasWorkbook() && (
                        <span className="text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1"
                          style={{
                            background: note.workbook_done ? '#EAF3DE' : '#f3f4f6',
                            color: note.workbook_done ? '#27500A' : '#9ca3af'
                          }}>
                          <i className="ti ti-calculator" style={{ fontSize: 11 }} />
                          연산서 {note.workbook_done ? '완료' : '미완료'}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <span className="text-[10px] text-gray-300 px-2 py-1">아직 작성 전이에요</span>
                    </div>
                  )}

                  {/* 작성/수정 버튼 */}
                  {canEdit(note) ? (
                    <button onClick={() => openModal(session)}
                      className="flex items-center gap-1 text-xs font-semibold"
                      style={{ color: '#993C1D' }}>
                      <i className="ti ti-pencil" style={{ fontSize: 13 }} />
                      {note ? '수정하기' : '작성하기'}
                      {note && <span className="text-[10px] text-gray-400 ml-1">(1회만 수정 가능)</span>}
                    </button>
                  ) : (
                    <p className="text-[10px] text-gray-300 flex items-center gap-1">
                      <i className="ti ti-lock" style={{ fontSize: 11 }} />
                      수정 완료 (더 이상 수정할 수 없어요)
                    </p>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── 배움노트 작성 모달 ── */}
      {showModal && modalSession && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>

            {/* 모달 헤더 */}
            <div className="px-6 pt-6 pb-4 flex items-center justify-between"
              style={{ borderBottom: '1px solid #f0f0f0' }}>
              <div className="flex items-center gap-2">
                <i className="ti ti-notebook" style={{ fontSize: 18, color: '#993C1D' }} />
                <h3 className="text-base font-bold text-gray-800">배움노트 작성</h3>
              </div>
              <button onClick={() => setShowModal(false)} style={{ color: '#9ca3af' }}>
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-6">

              {/* 수업 정보 */}
              <div className="rounded-xl px-4 py-3" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                <p className="text-xs font-bold text-gray-500 mb-0.5">{modalSession.session_date} 수업</p>
                {modalSession.progress_content && (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <i className="ti ti-books" style={{ fontSize: 12 }} />
                    {modalSession.progress_content}
                  </p>
                )}
              </div>

              {/* ① 출결 — 읽기전용 */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-sm font-bold text-gray-800">출결</p>
                  <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-full" style={{ background: '#f3f4f6' }}>선생님 입력</span>
                </div>
                <p className="text-[10px] text-gray-400 mb-2">선생님이 입력한 출결 현황이에요</p>
                <div className="flex gap-2">
                  {['정시','지각','결석'].map(att => {
                    const isSelected = (modalNote?.attendance ?? '정시') === att
                    const colors = {
                      정시: { on: { background: '#EAF3DE', color: '#27500A' }, off: { background: '#f3f4f6', color: '#d1d5db' } },
                      지각: { on: { background: '#FAEEDA', color: '#633806' }, off: { background: '#f3f4f6', color: '#d1d5db' } },
                      결석: { on: { background: '#fee2e2', color: '#991b1b' }, off: { background: '#f3f4f6', color: '#d1d5db' } },
                    }
                    const icon = att === '정시' ? 'ti-circle-check' : att === '지각' ? 'ti-clock-exclamation' : 'ti-x'
                    return (
                      <div key={att} className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                        style={isSelected ? colors[att as keyof typeof colors].on : colors[att as keyof typeof colors].off}>
                        <i className={`ti ${icon}`} style={{ fontSize: 15 }} />
                        {att}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* ② 학습지 제출 — 읽기전용 + 미제출 사유 */}
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-sm font-bold text-gray-800">학습지 제출</p>
                  <span className="text-[10px] text-gray-400 px-1.5 py-0.5 rounded-full" style={{ background: '#f3f4f6' }}>선생님 입력</span>
                </div>
                <p className="text-[10px] text-gray-400 mb-2">선생님이 확인한 학습지 제출 여부예요</p>
                <div className="flex gap-2 mb-2">
                  {[true, false].map(val => {
                    const isSelected = (modalNote?.worksheet_submitted ?? false) === val
                    return (
                      <div key={String(val)} className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                        style={isSelected
                          ? val ? { background: '#EAF3DE', color: '#27500A' } : { background: '#fee2e2', color: '#991b1b' }
                          : { background: '#f3f4f6', color: '#d1d5db' }}>
                        <i className={`ti ${val ? 'ti-circle-check' : 'ti-x'}`} style={{ fontSize: 15 }} />
                        {val ? '제출했어요' : '못 했어요'}
                      </div>
                    )
                  })}
                </div>
                {modalNote && !modalNote.worksheet_submitted && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1.5">제출 못한 이유를 적어주세요</p>
                    <textarea value={worksheetReason} onChange={e => setWorksheetReason(e.target.value)}
                      rows={2} placeholder="예: 깜빡했어요 / 시간이 부족했어요"
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm resize-none focus:outline-none"
                      style={{ borderColor: '#f0f0f0', background: '#fafafa' }} />
                  </div>
                )}
                {modalNote?.worksheet_score != null && modalNote.worksheet_submitted && (
                  <div className="px-3 py-2 rounded-xl text-center" style={{ background: '#f3f4f6' }}>
                    <span className="text-xs text-gray-400">점수 </span>
                    <span className="text-sm font-black" style={{
                      color: modalNote.worksheet_score >= 85 ? '#27500A' : modalNote.worksheet_score >= 70 ? '#633806' : '#991b1b'
                    }}>{modalNote.worksheet_score}점</span>
                  </div>
                )}
              </div>

              {/* ③ 교재 과제 달성률 — 학생 입력 */}
              <div>
                <p className="text-sm font-bold text-gray-800 mb-1">교재 과제 달성률</p>
                <p className="text-[10px] text-gray-400 mb-3">숙제를 얼마나 완료했나요? 정답률이 아니라 <span className="font-semibold text-gray-600">얼마나 풀어왔는지</span>예요</p>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {[0, 30, 50, 70, 90, 100].map(pct => (
                    <button key={pct} onClick={() => setTextbookAchievement(pct)}
                      className="px-3 py-2 rounded-xl text-sm font-bold transition-all"
                      style={textbookAchievement === pct
                        ? { background: '#F5C4B3', color: '#712B13' }
                        : { background: '#f3f4f6', color: '#9ca3af' }}>
                      {pct}%
                    </button>
                  ))}
                </div>
                {textbookAchievement < 100 && (
                  <div>
                    <p className="text-[10px] text-gray-500 mb-1.5">100%가 아닌 이유를 적어주세요</p>
                    <textarea value={achievementReason} onChange={e => setAchievementReason(e.target.value)}
                      rows={2} placeholder="예: 마지막 장을 못 풀었어요 / 절반만 풀었어요"
                      className="w-full px-3.5 py-2.5 rounded-xl border text-sm resize-none focus:outline-none"
                      style={{ borderColor: '#f0f0f0', background: '#fafafa' }} />
                  </div>
                )}
              </div>

              {/* ④ 연산서 — 배정된 경우만 */}
              {hasWorkbook() && (
                <div>
                  <p className="text-sm font-bold text-gray-800 mb-1">연산서</p>
                  <p className="text-[10px] text-gray-400 mb-2">선생님이 확인한 연산서 완료 여부예요</p>
                  <div className="flex gap-2">
                    {[true, false].map(val => {
                      const isSelected = (modalNote?.workbook_done ?? false) === val
                      return (
                        <div key={String(val)} className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5"
                          style={isSelected
                            ? val ? { background: '#EAF3DE', color: '#27500A' } : { background: '#f3f4f6', color: '#9ca3af' }
                            : { background: '#f3f4f6', color: '#d1d5db' }}>
                          <i className={`ti ${val ? 'ti-circle-check' : 'ti-x'}`} style={{ fontSize: 15 }} />
                          {val ? '완료' : '미완료'}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ⑤ 한마디 */}
              <div>
                <p className="text-sm font-bold text-gray-800 mb-1">
                  한마디 <span className="text-xs font-normal text-gray-400">(선택)</span>
                </p>
                <p className="text-[10px] text-gray-400 mb-2">오늘 수업 어땠나요? 선생님께 한 마디 남겨요</p>
                <textarea value={studentMemo} onChange={e => setStudentMemo(e.target.value)}
                  rows={3} placeholder="오늘 수업 어땠나요?"
                  className="w-full px-3.5 py-2.5 rounded-xl border text-sm resize-none focus:outline-none"
                  style={{ borderColor: '#f0f0f0', background: '#fafafa' }} />
              </div>

              {/* 수정 1회 안내 */}
              {modalNote && !modalNote.student_edited && (
                <div className="rounded-xl px-4 py-3 flex items-start gap-2"
                  style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                  <i className="ti ti-alert-circle" style={{ fontSize: 14, color: '#993C1D', marginTop: 1, flexShrink: 0 }} />
                  <p className="text-[11px]" style={{ color: '#712B13' }}>
                    저장 후 <span className="font-bold">1회만 수정</span>할 수 있어요. 신중하게 작성해주세요!
                  </p>
                </div>
              )}

              {/* 저장 버튼 */}
              <button onClick={handleSave} disabled={saving}
                className="w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#F5C4B3', color: '#712B13' }}>
                {saving
                  ? <><span className="w-4 h-4 border-2 border-[#712B13]/30 border-t-[#712B13] rounded-full animate-spin" />저장 중...</>
                  : <><i className="ti ti-device-floppy" style={{ fontSize: 16 }} />배움노트 저장</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
