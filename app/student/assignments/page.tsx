'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'

interface StudentInfo {
  id: string
  name: string
  grade: string
  school: string
}

interface ClassSession {
  id: string
  session_date: string
  hw_textbook_name: string | null
  hw_worksheet_range: string | null
}

interface LearningNote {
  id: string
  session_id: string
  worksheet_submitted: boolean
  workbook_done: boolean
  textbook_achievement: number | null
  attendance?: string
}

interface StudentTextbook {
  id: string
  textbook_type: string
  textbook_name: string
}

interface StudentWorksheet {
  id: string
  status: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  assigned_at: string
  score: number | null
}

export default function StudentAssignmentsPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [loading, setLoading] = useState(true)
  const [monthOffset, setMonthOffset] = useState(0)
  const [savingItem, setSavingItem] = useState<string | null>(null)

  const today = new Date()
  const baseDate = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1)
  const year = baseDate.getFullYear()
  const month = baseDate.getMonth()
  const todayStr = today.toISOString().split('T')[0]

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const s = JSON.parse(stored)
        const { data: studentData } = await supabase
          .from('students').select('*').eq('id', s.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)
        await fetchData(s.id)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  async function fetchData(sid: string) {
    const [{ data: ssData }, { data: tbData }, { data: wsData }] = await Promise.all([
      supabase.from('class_sessions').select('id, session_date, hw_textbook_name, hw_worksheet_range')
        .eq('student_id', sid).order('session_date'),
      supabase.from('student_textbooks').select('*').eq('student_id', sid),
      supabase.from('student_worksheets').select('*').eq('student_id', sid).order('assigned_at'),
    ])
    if (ssData) {
      setSessions(ssData)
      const ids = ssData.map(s => s.id)
      if (ids.length > 0) {
        const { data: nData } = await supabase
          .from('learning_notes').select('id, session_id, worksheet_submitted, workbook_done, textbook_achievement')
          .in('session_id', ids)
        if (nData) setNotes(nData)
      }
    }
    if (tbData) setTextbooks(tbData)
    if (wsData) setWorksheets(wsData)
  }

  const hasWorkbook = textbooks.some(t => t.textbook_type === '연산서')

  // 오늘 할 일: 학생이 직접 체크할 수 있는 항목들 (자기주도학습 체크리스트)
  const todaySession = sessions.find(s => s.session_date === todayStr) ?? null
  const todayNote = todaySession ? (notes.find(n => n.session_id === todaySession.id) ?? null) : null
  const todayAchievement = todayNote?.textbook_achievement ?? (todayNote?.workbook_done ? 100 : null)
  const todayWorksheets = worksheets.filter(w => w.assigned_at?.startsWith(todayStr) && w.status === 'assigned')
  const showTextbookTodo = !!(todaySession?.hw_textbook_name && (todayAchievement === null || todayAchievement < 100))
  const showWorkbookTodo = hasWorkbook && !!todaySession && !(todayNote?.workbook_done)
  const hasTodoItems = todayWorksheets.length > 0 || showTextbookTodo || showWorkbookTodo

  // 학습지: 학생이 "제출했어요"로 직접 체크 (채점은 선생님/조교 몫이라 상태만 제출로 바꿈)
  async function checkWorksheetDone(wsId: string) {
    setSavingItem('ws-' + wsId)
    const { error } = await supabase.from('student_worksheets').update({ status: 'submitted' }).eq('id', wsId).select()
    setSavingItem(null)
    if (error) { alert('저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.'); return }
    if (student) await fetchData(student.id)
  }

  // 교재 진도: 학생이 직접 "다 했어요" 체크 -> learning_notes에 반영
  async function checkTextbookDone() {
    if (!todaySession || !student) return
    setSavingItem('textbook')
    const result = todayNote
      ? await supabase.from('learning_notes').update({ textbook_achievement: 100 }).eq('id', todayNote.id).select()
      : await supabase.from('learning_notes').insert({
          student_id: student.id, session_id: todaySession.id, attendance: '정시',
          worksheet_submitted: false, workbook_done: false, textbook_achievement: 100,
        }).select()
    setSavingItem(null)
    if (result.error || !result.data || result.data.length === 0) { alert('저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.'); return }
    if (student) await fetchData(student.id)
  }

  // 연산서: 학생이 직접 "다 했어요" 체크 -> learning_notes에 반영
  async function checkWorkbookDone() {
    if (!todaySession || !student) return
    setSavingItem('workbook')
    const result = todayNote
      ? await supabase.from('learning_notes').update({ workbook_done: true }).eq('id', todayNote.id).select()
      : await supabase.from('learning_notes').insert({
          student_id: student.id, session_id: todaySession.id, attendance: '정시',
          worksheet_submitted: false, workbook_done: true, textbook_achievement: null,
        }).select()
    setSavingItem(null)
    if (result.error || !result.data || result.data.length === 0) { alert('저장 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.'); return }
    if (student) await fetchData(student.id)
  }

  // 달력 데이터 생성
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 날짜별 과제 현황 계산
  function getDayStatus(day: number) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const session = sessions.find(s => s.session_date === dateStr)
    if (!session) return null

    const note = notes.find(n => n.session_id === session.id)
    const achievement = note?.textbook_achievement ?? (note?.workbook_done ? 100 : null)

    // 그날 배정된 학습지 (assigned_at 기준)
    const dayWS = worksheets.filter(w => w.assigned_at?.startsWith(dateStr))

    return {
      hasTextbook: !!session.hw_textbook_name,
      textbookDone: achievement !== null && achievement >= 100,
      hasWorksheet: !!session.hw_worksheet_range || dayWS.length > 0,
      worksheetDone: note?.worksheet_submitted ?? false,
      hasWorkbook: hasWorkbook,
      workbookDone: note?.workbook_done ?? false,
      hasNote: !!note,
    }
  }

  // 이번 달 오늘까지 달성률 계산
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const isCurrentMonth = monthOffset === 0

  const monthSessions = sessions.filter(s => s.session_date.startsWith(monthStr))
  const monthSessionsUntilToday = isCurrentMonth
    ? monthSessions.filter(s => s.session_date <= todayStr)
    : monthSessions

  let totalTasks = 0
  let doneTasks = 0

  monthSessionsUntilToday.forEach(session => {
    const note = notes.find(n => n.session_id === session.id)
    const achievement = note?.textbook_achievement ?? (note?.workbook_done ? 100 : null)

    if (session.hw_textbook_name) {
      totalTasks++
      if (achievement !== null && achievement >= 100) doneTasks++
    }
    if (session.hw_worksheet_range) {
      totalTasks++
      if (note?.worksheet_submitted) doneTasks++
    }
    if (hasWorkbook) {
      totalTasks++
      if (note?.workbook_done) doneTasks++
    }
  })

  const achievementRate = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : null

  const DAYS_LABEL = ['일','월','화','수','목','금','토']

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="할일목록" subtitle="오늘 할 일을 직접 체크해요" />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 오늘 할 일 체크리스트 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#FFF5F2', borderBottom: '1px solid #f0f0f0' }}>
            <i className="ti ti-checklist" style={{ fontSize: 16, color: '#993C1D' }} />
            <h3 className="text-sm font-bold" style={{ color: '#712B13' }}>오늘 할 일</h3>
          </div>
          <div className="px-4 py-3">
            {!hasTodoItems ? (
              <p className="text-xs text-gray-400 py-2 text-center">오늘 체크할 할 일이 없어요</p>
            ) : (
              <div className="space-y-2">
                {todayWorksheets.map(ws => (
                  <button key={ws.id} onClick={() => checkWorksheetDone(ws.id)} disabled={savingItem === 'ws-' + ws.id}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all disabled:opacity-50"
                    style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
                    <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0" style={{ borderColor: '#F5C4B3' }} />
                    <span className="flex-1 text-sm font-semibold text-gray-700">
                      학습지 · {ws.grade_level} {ws.unit}{ws.unit_name ? ` (${ws.unit_name})` : ''} · {ws.current_level}레벨
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: '#993C1D' }}>
                      {savingItem === 'ws-' + ws.id ? '저장 중' : '제출 체크'}
                    </span>
                  </button>
                ))}
                {showTextbookTodo && (
                  <button onClick={checkTextbookDone} disabled={savingItem === 'textbook'}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all disabled:opacity-50"
                    style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
                    <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0" style={{ borderColor: '#F5C4B3' }} />
                    <span className="flex-1 text-sm font-semibold text-gray-700">
                      교재 · {todaySession?.hw_textbook_name}
                    </span>
                    <span className="text-[10px] font-bold" style={{ color: '#993C1D' }}>
                      {savingItem === 'textbook' ? '저장 중' : '완료 체크'}
                    </span>
                  </button>
                )}
                {showWorkbookTodo && (
                  <button onClick={checkWorkbookDone} disabled={savingItem === 'workbook'}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left transition-all disabled:opacity-50"
                    style={{ background: '#f9fafb', border: '1px solid #f0f0f0' }}>
                    <span className="w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0" style={{ borderColor: '#F5C4B3' }} />
                    <span className="flex-1 text-sm font-semibold text-gray-700">연산서</span>
                    <span className="text-[10px] font-bold" style={{ color: '#993C1D' }}>
                      {savingItem === 'workbook' ? '저장 중' : '완료 체크'}
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 달력 카드 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* 월 네비게이터 */}
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #f5f5f5' }}>
            <button onClick={() => setMonthOffset(o => o - 1)}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: '#f3f4f6' }}>
              <i className="ti ti-chevron-left" style={{ fontSize: 16, color: '#6b7280' }} />
            </button>
            <p className="text-base font-black text-gray-800">{year}년 {month + 1}월</p>
            <button onClick={() => setMonthOffset(o => Math.min(0, o + 1))}
              className="w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: monthOffset < 0 ? '#f3f4f6' : 'transparent', opacity: monthOffset >= 0 ? 0.3 : 1 }}
              disabled={monthOffset >= 0}>
              <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#6b7280' }} />
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 px-3 pt-3">
            {DAYS_LABEL.map((d, i) => (
              <div key={d} className="text-center text-xs font-semibold pb-2"
                style={{ color: i === 0 ? '#F5C4B3' : i === 6 ? '#93c5fd' : '#9ca3af' }}>
                {d}
              </div>
            ))}
          </div>

          {/* 날짜 격자 */}
          <div className="grid grid-cols-7 px-3 pb-4">
            {/* 빈 칸 */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {/* 날짜 */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
              const isToday = dateStr === todayStr
              const isFuture = dateStr > todayStr
              const dayOfWeek = (firstDay + i) % 7
              const status = getDayStatus(day)

              return (
                <div key={day} className="flex flex-col items-center py-1">
                  {/* 날짜 숫자 */}
                  <div className="w-8 h-8 flex items-center justify-center mb-0.5">
                    <span className={`text-sm font-${isToday ? 'black' : 'medium'} w-8 h-8 flex items-center justify-center rounded-full`}
                      style={{
                        background: isToday ? '#F5C4B3' : 'transparent',
                        color: isToday ? '#712B13' : dayOfWeek === 0 ? '#F5C4B3' : dayOfWeek === 6 ? '#93c5fd' : '#374151',
                      }}>
                      {day}
                    </span>
                  </div>

                  {/* 과제 마커 */}
                  {status && !isFuture && (
                    <div className="flex items-center gap-0.5 flex-wrap justify-center max-w-[32px]">
                      {/* 교재 → ■ 네모 */}
                      {status.hasTextbook && (
                        <div style={{
                          width: 7, height: 7,
                          borderRadius: 2,
                          background: status.textbookDone ? '#3b82f6' : '#ef4444',
                          flexShrink: 0,
                        }} />
                      )}
                      {/* 학습지 → ▲ 세모 */}
                      {status.hasWorksheet && (
                        <div style={{
                          width: 0, height: 0,
                          borderLeft: '4px solid transparent',
                          borderRight: '4px solid transparent',
                          borderBottom: `7px solid ${status.worksheetDone ? '#3b82f6' : '#ef4444'}`,
                          flexShrink: 0,
                        }} />
                      )}
                      {/* 연산서 → ● 동그라미 */}
                      {status.hasWorkbook && (
                        <div style={{
                          width: 7, height: 7,
                          borderRadius: '50%',
                          background: status.workbookDone ? '#3b82f6' : '#ef4444',
                          flexShrink: 0,
                        }} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div className="px-4 py-3 flex flex-wrap gap-3" style={{ borderTop: '1px solid #f5f5f5', background: '#fafafa' }}>
            <div className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#3b82f6' }} />
              <span className="text-[10px] text-gray-400">완료</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444' }} />
              <span className="text-[10px] text-gray-400">미완료</span>
            </div>
            <div className="w-px h-3 bg-gray-200 self-center" />
            <div className="flex items-center gap-1.5">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: '#9ca3af' }} />
              <span className="text-[10px] text-gray-400">■ 교재</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div style={{ width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '8px solid #9ca3af' }} />
              <span className="text-[10px] text-gray-400">▲ 학습지</span>
            </div>
            {hasWorkbook && (
              <div className="flex items-center gap-1.5">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#9ca3af' }} />
                <span className="text-[10px] text-gray-400">● 연산서</span>
              </div>
            )}
          </div>
        </div>

        {/* 이번 달 과제 달성률 */}
        {achievementRate !== null && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
              <i className="ti ti-chart-bar" style={{ fontSize: 16, color: '#993C1D' }} />
              <h3 className="text-sm font-bold text-gray-700">
                {month + 1}월 {isCurrentMonth ? '오늘까지' : ''} 과제 달성률
              </h3>
            </div>
            <div className="px-4 py-5">
              {/* 달성률 숫자 */}
              <div className="flex items-end gap-2 mb-3">
                <span className="text-4xl font-black" style={{
                  color: achievementRate >= 90 ? '#27500A' : achievementRate >= 70 ? '#633806' : '#991b1b'
                }}>{achievementRate}%</span>
                <span className="text-sm text-gray-400 mb-1">{doneTasks}/{totalTasks}개 완료</span>
              </div>
              {/* 프로그레스 바 */}
              <div className="h-3 rounded-full mb-4" style={{ background: '#f3f4f6' }}>
                <div className="h-3 rounded-full transition-all" style={{
                  width: `${achievementRate}%`,
                  background: achievementRate >= 90 ? '#639922' : achievementRate >= 70 ? '#EF9F27' : '#e24b4a'
                }} />
              </div>
              {/* 부연 설명 */}
              <div className="rounded-xl px-4 py-3" style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                <p className="text-xs font-semibold mb-1" style={{ color: '#712B13' }}>꾸준함이 실력이 돼요 💪</p>
                <p className="text-[11px] leading-relaxed" style={{ color: '#993C1D' }}>
                  과제를 성실히 해오는 것이 성적 향상의 가장 확실한 방법이에요.
                  오늘 과제 한 장이 쌓여 실력이 만들어진답니다.
                </p>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
