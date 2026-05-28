'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'

interface ClassSession {
  id: string
  session_date: string
  progress_content: string | null
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

interface Feedback {
  id: string
  teacher_name: string
  content: string
  ai_message: string | null
  created_at: string
}

const DAYS = ['일','월','화','수','목','금','토']

export default function ParentReportsPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [expandedFeedbackId, setExpandedFeedbackId] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase
          .from('students').select('name, grade').eq('id', session.id).single()
        if (studentData) setStudentName(studentData.name)

        const [{ data: ssData }, { data: nData }, { data: wsData }, { data: fbData }] = await Promise.all([
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date'),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at'),
          supabase.from('feedbacks').select('*').eq('student_id', session.id).order('created_at', { ascending: false }),
        ])
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (fbData) setFeedbacks(fbData)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  // 월 목록 (최근 6개월)
  const months = (() => {
    const result: string[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return result
  })()

  // 선택 월 데이터
  const monthSessions = sessions.filter(s => s.session_date.startsWith(selectedMonth))
  const monthNotes = notes.filter(n => monthSessions.some(s => s.id === n.session_id))
  const monthWS = worksheets.filter(w => w.assigned_at?.startsWith(selectedMonth))
  const monthFeedbacks = feedbacks.filter(f => f.created_at.startsWith(selectedMonth))

  const total = monthNotes.length
  const attendRate = total > 0 ? Math.round(monthNotes.filter(n => n.attendance === '정시').length / total * 100) : 0
  const wsSubmitRate = total > 0 ? Math.round(monthNotes.filter(n => n.worksheet_submitted).length / total * 100) : 0
  const tbRate = total > 0 ? Math.round(monthNotes.filter(n => n.textbook_submitted).length / total * 100) : 0
  const passedWS = monthWS.filter(w => w.status === 'passed')
  const wsCompleteRate = monthWS.length > 0 ? Math.round(passedWS.length / monthWS.length * 100) : null
  const scoredNotes = monthNotes.filter(n => n.worksheet_score != null)
  const avgScore = scoredNotes.length > 0
    ? Math.round(scoredNotes.reduce((s, n) => s + (n.worksheet_score ?? 0), 0) / scoredNotes.length) : null
  const dailyTests = monthSessions.filter(s => s.daily_test_score != null)
  const avgDailyTest = dailyTests.length > 0
    ? Math.round(dailyTests.reduce((s, ss) => s + (ss.daily_test_score ?? 0), 0) / dailyTests.length) : null

  // 날짜별 수업 묶기
  const sessionsByDate = monthSessions
    .slice().reverse()
    .map(session => ({
      session,
      note: notes.find(n => n.session_id === session.id),
      dayWS: worksheets.filter(w => w.assigned_at?.startsWith(session.session_date)),
    }))

  function scoreColor(score: number) {
    if (score >= 90) return '#27500A'
    if (score >= 70) return '#633806'
    return '#991b1b'
  }

  function scoreBg(score: number) {
    if (score >= 90) return '#EAF3DE'
    if (score >= 70) return '#FAEEDA'
    return '#fee2e2'
  }

  const [y, mo] = selectedMonth.split('-')
  const monthLabel = `${parseInt(mo)}월`

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="보고서" subtitle={`${studentName} 학생 월간 리포트`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 월 선택 탭 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {months.map(m => {
            const mo = parseInt(m.split('-')[1])
            const isSelected = selectedMonth === m
            return (
              <button key={m} onClick={() => setSelectedMonth(m)}
                className="px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all shrink-0"
                style={isSelected
                  ? { background: '#F5C4B3', color: '#712B13' }
                  : { background: 'white', color: '#9ca3af', border: '1px solid #f0f0f0' }}>
                {mo}월
              </button>
            )
          })}
        </div>

        {total === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <i className="ti ti-chart-bar" style={{ fontSize: 36, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
            <p className="text-sm font-bold text-gray-600">{monthLabel} 수업 기록이 없어요</p>
          </div>
        ) : (
          <>
            {/* 월간 요약 */}
            <div className="rounded-2xl p-4" style={{ background: '#FAECE7' }}>
              <p className="text-xs font-semibold mb-3" style={{ color: '#993C1D' }}>
                {y}년 {monthLabel} · 총 {total}회 수업
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '출석률', value: `${attendRate}%`, sub: `정시 ${monthNotes.filter(n=>n.attendance==='정시').length}회` },
                  { label: '과제 달성', value: `${wsSubmitRate}%`, sub: `${monthNotes.filter(n=>n.worksheet_submitted).length}/${total}회` },
                  { label: '성취도', value: avgScore != null ? `${avgScore}점` : '-', sub: avgScore != null ? `${scoredNotes.length}회 기록` : '기록없음' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl px-3 py-3 text-center"
                    style={{ background: 'rgba(255,255,255,0.6)' }}>
                    <p className="text-xl font-black" style={{ color: '#712B13' }}>{item.value}</p>
                    <p className="text-[10px] font-semibold mt-0.5" style={{ color: '#993C1D' }}>{item.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#993C1D', opacity: 0.7 }}>{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 상세 지표 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-chart-bar" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold text-gray-700">상세 지표</h3>
              </div>
              <div className="px-4 py-4 space-y-3">
                {[
                  { label: '정시 출석률', rate: attendRate, icon: 'ti-circle-check' },
                  { label: '과제 달성률', rate: wsSubmitRate, icon: 'ti-file-text', sub: '과제 수행도' },
                  { label: '교재 제출률', rate: tbRate, icon: 'ti-book', sub: '교재 완료도' },
                  ...(wsCompleteRate != null ? [{ label: '학습지 완료율', rate: wsCompleteRate, icon: 'ti-trophy', sub: `${passedWS.length}/${monthWS.length}개` }] : []),
                  ...(avgDailyTest != null ? [{ label: '데일리 테스트 평균', rate: avgDailyTest, icon: 'ti-pencil', sub: `${dailyTests.length}회` }] : []),
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <i className={`ti ${item.icon}`} style={{ fontSize: 13, color: '#993C1D' }} />
                        <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                        {'sub' in item && item.sub && (
                          <span className="text-[10px] text-gray-400">· {item.sub}</span>
                        )}
                      </div>
                      <span className="text-sm font-black" style={{
                        color: item.rate >= 90 ? '#27500A' : item.rate >= 70 ? '#633806' : '#991b1b'
                      }}>{item.rate}%</span>
                    </div>
                    <div className="h-2 rounded-full" style={{ background: '#f3f4f6' }}>
                      <div className="h-2 rounded-full transition-all" style={{
                        width: `${Math.min(100, item.rate)}%`,
                        background: item.rate >= 90 ? '#639922' : item.rate >= 70 ? '#EF9F27' : '#e24b4a'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 날짜별 수업 기록 (진도+학습지+데일리 통합) */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-notebook" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold text-gray-700">수업 기록</h3>
                <span className="text-[10px] text-gray-400 ml-1">{total}회</span>
              </div>
              <div className="divide-y divide-gray-50">
                {sessionsByDate.map(({ session, note, dayWS }) => {
                  const d = new Date(session.session_date)
                  const dateLabel = `${d.getMonth()+1}/${d.getDate()} (${DAYS[d.getDay()]})`

                  return (
                    <div key={session.id} className="px-4 py-3">
                      {/* 날짜 + 출결 */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-700">{dateLabel}</span>
                        {note && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{
                              background: note.attendance === '정시' ? '#EAF3DE' : note.attendance === '지각' ? '#FAEEDA' : '#fee2e2',
                              color: note.attendance === '정시' ? '#27500A' : note.attendance === '지각' ? '#633806' : '#991b1b'
                            }}>
                            {note.attendance}
                          </span>
                        )}
                      </div>

                      {/* 내용 인라인 배지로 압축 */}
                      <div className="flex flex-wrap gap-1.5">
                        {/* 진도 */}
                        {session.progress_content && (
                          <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1"
                            style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            <i className="ti ti-books" style={{ fontSize: 11 }} />
                            {session.progress_content.length > 20
                              ? session.progress_content.slice(0, 20) + '...'
                              : session.progress_content}
                          </span>
                        )}
                        {/* 데일리 테스트 */}
                        {session.daily_test_score != null && (
                          <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 font-semibold"
                            style={{
                              background: scoreBg(session.daily_test_score),
                              color: scoreColor(session.daily_test_score)
                            }}>
                            <i className="ti ti-pencil" style={{ fontSize: 11 }} />
                            테스트 {session.daily_test_score}점
                          </span>
                        )}
                        {/* 과제 달성 */}
                        {note && (
                          <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 font-semibold"
                            style={{
                              background: note.worksheet_submitted ? '#EAF3DE' : '#fee2e2',
                              color: note.worksheet_submitted ? '#27500A' : '#991b1b'
                            }}>
                            <i className="ti ti-file-text" style={{ fontSize: 11 }} />
                            과제 {note.workbook_done ? '100%' : note.worksheet_submitted ? '70%' : '0%'}
                          </span>
                        )}
                        {/* 학습지 점수 */}
                        {note?.worksheet_score != null && (
                          <span className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1 font-semibold"
                            style={{
                              background: scoreBg(note.worksheet_score),
                              color: scoreColor(note.worksheet_score)
                            }}>
                            성취도 {note.worksheet_score}점
                          </span>
                        )}
                        {/* 학습지 목록 */}
                        {dayWS.map(w => (
                          <span key={w.id} className="text-[10px] px-2 py-1 rounded-lg flex items-center gap-1"
                            style={{
                              background: w.score != null ? scoreBg(w.score) : '#f3f4f6',
                              color: w.score != null ? scoreColor(w.score) : '#9ca3af'
                            }}>
                            {w.current_level}레벨
                            {w.score != null ? ` · ${w.score}점` : ` · ${w.status === 'passed' ? '완료' : '진행중'}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 선생님 피드백 */}
            {monthFeedbacks.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-message-circle" style={{ fontSize: 16, color: '#993C1D' }} />
                  <h3 className="text-sm font-bold text-gray-700">선생님 피드백</h3>
                  <span className="text-[10px] text-gray-400 ml-1">{monthFeedbacks.length}개</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {monthFeedbacks.map(fb => {
                    const isExpanded = expandedFeedbackId === fb.id
                    const d = new Date(fb.created_at)
                    const dateLabel = `${d.getMonth()+1}/${d.getDate()}`
                    return (
                      <div key={fb.id}>
                        <button className="w-full px-4 py-3 flex items-center gap-3 text-left"
                          onClick={() => setExpandedFeedbackId(isExpanded ? null : fb.id)}>
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: '#FAECE7' }}>
                            <i className="ti ti-user" style={{ fontSize: 14, color: '#993C1D' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800">{fb.teacher_name} 선생님</p>
                            <p className="text-[10px] text-gray-400">{dateLabel}</p>
                            {!isExpanded && (
                              <p className="text-[10px] text-gray-500 mt-0.5 truncate">
                                {fb.ai_message ?? fb.content}
                              </p>
                            )}
                          </div>
                          <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                            style={{ fontSize: 14, color: '#9ca3af', flexShrink: 0 }} />
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-2" style={{ borderTop: '1px solid #f5f5f5' }}>
                            {fb.ai_message && (
                              <div className="rounded-xl px-4 py-3 mt-3 text-xs leading-relaxed"
                                style={{ background: '#FFF5F2', border: '1px solid #F5C4B3', color: '#712B13' }}>
                                {fb.ai_message.split('\n').map((line, i) => (
                                  <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                                ))}
                              </div>
                            )}
                            {fb.content && (
                              <div className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                                style={{ background: '#fafafa', border: '1px solid #f0f0f0', color: '#6b7280' }}>
                                {fb.content.split('\n').map((line, i) => (
                                  <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 피드백 없는 달 안내 */}
            {monthFeedbacks.length === 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-message-circle" style={{ fontSize: 16, color: '#9ca3af' }} />
                  <h3 className="text-sm font-bold text-gray-400">선생님 피드백</h3>
                </div>
                <div className="px-4 py-4 text-center">
                  <p className="text-xs text-gray-300">{monthLabel}에 작성된 피드백이 없어요</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
