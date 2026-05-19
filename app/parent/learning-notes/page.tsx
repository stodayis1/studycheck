'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface ClassSession {
  id: string
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
  workbook_done: boolean
  memo: string | null
  video_started_at: string | null
  video_completed_at: string | null
}

interface Feedback {
  id: string
  teacher_name: string
  content: string
  created_at: string
}

// 주간 날짜 계산
function getWeekDates(weekOffset: number) {
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - now.getDay() + 1 + weekOffset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

export default function ParentLearningNotesPage() {
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [weekOffset, setWeekOffset] = useState(0)
  const [aiMessages, setAiMessages] = useState<Record<string, string>>({})
  const [generatingAI, setGeneratingAI] = useState<Record<string, boolean>>({})

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)
        setStudentId(session.id)

        const { data: studentData } = await supabase
          .from('students').select('name, grade').eq('id', session.id).single()
        if (studentData) {
          setStudentName(studentData.name)
          setStudentGrade(studentData.grade)
        }

        const [{ data: ssData }, { data: nData }, { data: fbData }] = await Promise.all([
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('feedbacks').select('*').eq('student_id', session.id).order('created_at', { ascending: false }),
        ])
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (fbData) setFeedbacks(fbData)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  function getNoteBySession(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  function getFeedbacksByDate(dateStr: string) {
    return feedbacks.filter((fb) => fb.created_at.startsWith(dateStr))
  }

  // AI 피드백 생성
  async function generateAIMessage(date: string, session: ClassSession, note: LearningNote | undefined, feedback: Feedback) {
    const key = `${date}-${session.id}-${feedback.id}`
    if (aiMessages[key] || generatingAI[key]) return
    setGeneratingAI((prev) => ({ ...prev, [key]: true }))

    // 최근 3회 통계
    const recentNotes = notes.slice(0, 3)
    const submitRate = recentNotes.length > 0
      ? Math.round(recentNotes.filter((n) => n.worksheet_submitted).length / recentNotes.length * 100) : 0

    const prompt = `
당신은 수학 학원 선생님이 학부모님께 보내는 알림장을 작성하는 AI입니다.
아래 정보를 바탕으로 따뜻하고 전문적인 4문장의 알림장을 작성해주세요.

[학생 정보]
- 이름: ${studentName}
- 학년: ${studentGrade}
- 날짜: ${date}

[오늘 수업 내용]
- 교재: ${session.today_textbook_name ?? '없음'}
- 단원: ${session.today_chapter ?? '없음'}
- 출석: ${note?.attendance ?? '미기록'}
- 학습지 제출: ${note?.worksheet_submitted ? `제출 (${note.worksheet_score != null ? note.worksheet_score + '점' : '점수 미입력'})` : '미제출'}
- 교재 제출: ${note?.textbook_submitted ? `제출${note.textbook_page ? ` (p.${note.textbook_page})` : ''}` : '미제출'}
- 연산서: ${note?.workbook_done ? '완료' : '미완료'}
- 영상 과제: ${note?.video_completed_at ? '완료' : note?.video_started_at ? '시청중' : '미시청'}

[최근 과제 제출률] ${submitRate}% (최근 ${recentNotes.length}회 기준)

[선생님 한마디]
"${feedback.content}"

위 내용을 바탕으로:
1. 오늘 수업 내용과 진도
2. 과제 수행 현황
3. 선생님의 코멘트를 자연스럽게 녹인 격려/조언
4. 마무리 인사

4문장으로 간결하고 따뜻하게 작성해주세요. 학부모님 입장에서 읽기 좋게, "안녕하세요" 같은 인사 없이 바로 내용으로 시작해주세요.`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: prompt }],
        }),
      })
      const data = await response.json()
      const text = data.content?.[0]?.text ?? '피드백 생성에 실패했어요.'
      setAiMessages((prev) => ({ ...prev, [key]: text }))
    } catch {
      setAiMessages((prev) => ({ ...prev, [key]: '피드백 생성에 실패했어요.' }))
    }
    setGeneratingAI((prev) => ({ ...prev, [key]: false }))
  }

  const isElementary = studentGrade.includes('초')
  const weekDates = getWeekDates(weekOffset)
  const todayStr = new Date().toISOString().split('T')[0]

  function fmtDate(d: string) {
    const [, m, day] = d.split('-')
    return `${parseInt(m)}/${parseInt(day)}`
  }

  // 출석 통계
  const allNotes = notes
  const attendanceStats = {
    정시: allNotes.filter((n) => n.attendance === '정시').length,
    지각: allNotes.filter((n) => n.attendance === '지각').length,
    결석: allNotes.filter((n) => n.attendance === '결석').length,
  }
  const totalSessions = allNotes.length
  const wsRate = totalSessions > 0 ? Math.round(allNotes.filter((n) => n.worksheet_submitted).length / totalSessions * 100) : 0
  const tbRate = totalSessions > 0 ? Math.round(allNotes.filter((n) => n.textbook_submitted).length / totalSessions * 100) : 0

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="배움노트" subtitle={`${studentName} 학생 수업 기록`} />
      <div className="px-4 py-4 space-y-4 pb-10">

        {/* 누적 통계 */}
        {totalSessions > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-xs font-bold text-gray-500 mb-3">📊 누적 현황 ({totalSessions}회 수업)</p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { label: '정시', value: attendanceStats.정시, color: 'text-green-600', bg: 'bg-green-50' },
                { label: '지각', value: attendanceStats.지각, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                { label: '결석', value: attendanceStats.결석, color: 'text-red-500', bg: 'bg-red-50' },
              ].map((item) => (
                <div key={item.label} className={cx('rounded-xl p-2 text-center', item.bg)}>
                  <p className={cx('text-xl font-black', item.color)}>{item.value}</p>
                  <p className="text-[10px] text-gray-400">{item.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              {[
                { label: '📝 학습지 제출률', rate: wsRate },
                { label: '📖 교재 제출률', rate: tbRate },
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">{item.label}</span>
                    <span className={cx('font-bold', item.rate >= 80 ? 'text-green-600' : item.rate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                      {item.rate}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={cx('h-full rounded-full', item.rate >= 80 ? 'bg-green-500' : item.rate >= 60 ? 'bg-yellow-400' : 'bg-red-400')}
                      style={{ width: `${item.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 주간 네비게이션 */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-100 px-4 py-3">
          <button onClick={() => setWeekOffset(weekOffset - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg">
            ‹
          </button>
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
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg disabled:opacity-30">
            ›
          </button>
        </div>

        {/* 날짜별 카드 */}
        {weekDates.map((date, idx) => {
          const daySessions = sessions.filter((s) => s.session_date === date)
          const dayFeedbacks = getFeedbacksByDate(date)
          const isToday = date === todayStr
          const hasContent = daySessions.length > 0 || dayFeedbacks.length > 0
          if (!hasContent) return null

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
                  const sessionFeedbacks = dayFeedbacks

                  return (
                    <div key={session.id} className="space-y-2">
                      {/* 수업 정보 */}
                      {session.today_textbook_name && (
                        <p className="text-xs text-gray-600">
                          📖 {session.today_textbook_name}
                          {session.today_chapter && ` · ${session.today_chapter}`}
                        </p>
                      )}

                      {/* 배움노트 */}
                      {note ? (
                        <div className="flex flex-wrap gap-1.5">
                          <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                            note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                            note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                            'bg-green-100 text-green-600')}>
                            {note.attendance === '정시' ? '✅ 정시' : note.attendance === '지각' ? '⚠️ 지각' : '❌ 결석'}
                          </span>
                          <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                            note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                            📝 학습지 {note.worksheet_submitted ? `제출${note.worksheet_score != null ? ` ${note.worksheet_score}점` : ''}` : '미제출'}
                          </span>
                          <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                            note.textbook_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                            📖 교재 {note.textbook_submitted ? '제출' : '미제출'}
                          </span>
                          {isElementary && (
                            <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                              note.workbook_done ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                              🔢 연산서 {note.workbook_done ? '완료' : '미완료'}
                            </span>
                          )}
                          {session.video_url && (
                            <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                              note.video_completed_at ? 'bg-green-50 text-green-700' :
                              note.video_started_at ? 'bg-blue-50 text-blue-600' :
                              'bg-gray-50 text-gray-400')}>
                              📹 영상 {note.video_completed_at ? '완료' : note.video_started_at ? '시청중' : '미시청'}
                            </span>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">배움노트 미작성</p>
                      )}

                      {/* AI 알림장 (피드백이 있을 때) */}
                      {sessionFeedbacks.map((fb) => {
                        const key = `${date}-${session.id}-${fb.id}`
                        const aiMsg = aiMessages[key]
                        const isGenerating = generatingAI[key]

                        return (
                          <div key={fb.id} className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl p-3 border border-purple-100">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-[10px] font-bold text-purple-600">
                                ✨ {fb.teacher_name} 선생님 알림장
                              </p>
                              {!aiMsg && !isGenerating && (
                                <button
                                  onClick={() => generateAIMessage(date, session, note, fb)}
                                  className="text-[10px] font-bold px-2 py-1 bg-purple-600 text-white rounded-lg">
                                  AI 생성
                                </button>
                              )}
                            </div>
                            {isGenerating ? (
                              <div className="flex items-center gap-2 py-1">
                                <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs text-purple-400">알림장 작성 중...</span>
                              </div>
                            ) : aiMsg ? (
                              <p className="text-xs text-gray-700 leading-relaxed">{aiMsg}</p>
                            ) : (
                              <div>
                                <p className="text-[10px] text-gray-500 mb-1">선생님 메모: {fb.content}</p>
                                <p className="text-[10px] text-purple-400">위 버튼을 눌러 AI 알림장을 생성하세요</p>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}

                {/* 피드백만 있는 경우 (수업 없는 날) */}
                {daySessions.length === 0 && dayFeedbacks.map((fb) => (
                  <div key={fb.id} className="bg-purple-50 rounded-xl px-3 py-2.5">
                    <p className="text-[10px] font-bold text-purple-500 mb-1">💬 {fb.teacher_name} 선생님</p>
                    <p className="text-xs text-gray-700">{fb.content}</p>
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
    </div>
  )
}
