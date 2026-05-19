'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

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

function ProgressBar({ rate, color }: { rate: number; color: string }) {
  return (
    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.min(100, rate)}%` }} />
    </div>
  )
}

export default function ParentReportsPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase
          .from('students').select('name, grade').eq('id', session.id).single()
        if (studentData) { setStudentName(studentData.name); setStudentGrade(studentData.grade) }

        const [{ data: ssData }, { data: nData }, { data: wsData }] = await Promise.all([
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date'),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at'),
        ])
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  // 월 목록 생성
  const months = (() => {
    const result: string[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return result
  })()

  // 선택된 월 데이터
  const monthSessions = sessions.filter(s => s.session_date.startsWith(selectedMonth))
  const monthNotes = notes.filter(n => monthSessions.some(s => s.id === n.session_id))
  const monthWS = worksheets.filter(w => w.assigned_at.startsWith(selectedMonth))

  const total = monthNotes.length
  const attendStat = {
    정시: monthNotes.filter(n => n.attendance === '정시').length,
    지각: monthNotes.filter(n => n.attendance === '지각').length,
    결석: monthNotes.filter(n => n.attendance === '결석').length,
  }
  const attendRate = total > 0 ? Math.round(attendStat.정시 / total * 100) : 0
  const wsRate = total > 0 ? Math.round(monthNotes.filter(n => n.worksheet_submitted).length / total * 100) : 0
  const tbRate = total > 0 ? Math.round(monthNotes.filter(n => n.textbook_submitted).length / total * 100) : 0
  const scoredNotes = monthNotes.filter(n => n.worksheet_score != null)
  const avgScore = scoredNotes.length > 0
    ? Math.round(scoredNotes.reduce((s, n) => s + (n.worksheet_score ?? 0), 0) / scoredNotes.length) : null

  // 데일리 테스트
  const dailyTests = monthSessions.filter(s => s.daily_test_score != null)
  const avgDailyTest = dailyTests.length > 0
    ? Math.round(dailyTests.reduce((s, ss) => s + (ss.daily_test_score ?? 0), 0) / dailyTests.length) : null

  // 학습지 현황
  const passedWS = monthWS.filter(w => w.status === 'passed')
  const wsRate2 = monthWS.length > 0 ? Math.round(passedWS.length / monthWS.length * 100) : 0

  function scoreColor(score: number) {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-blue-600'
    return 'text-red-500'
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="보고서" subtitle={`${studentName} 학생 월간 리포트`} />
      <div className="px-4 py-4 space-y-4 pb-10">

        {/* 월 선택 */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {months.map((m) => {
            const [y, mo] = m.split('-')
            return (
              <button key={m} onClick={() => setSelectedMonth(m)}
                className={cx('px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all',
                  selectedMonth === m ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200')}>
                {parseInt(mo)}월
              </button>
            )
          })}
        </div>

        {total === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📊</p>
            <p className="text-sm text-gray-500">이 달에 수업 기록이 없어요</p>
          </div>
        ) : (
          <>
            {/* 월간 요약 */}
            <div className="bg-gradient-to-br from-[#1a2f5e] to-blue-500 rounded-2xl p-4 text-white">
              <p className="text-xs text-blue-200 mb-3">
                {selectedMonth.replace('-','년 ')}월 · 총 {total}회 수업
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: '출석률', value: `${attendRate}%`, sub: `정시 ${attendStat.정시}회` },
                  { label: '과제달성', value: `${wsRate}%`, sub: `${monthNotes.filter(n=>n.worksheet_submitted).length}/${total}회` },
                  { label: '성취도', value: avgScore != null ? `${avgScore}%` : '-', sub: avgScore != null ? `${scoredNotes.length}회 기록` : '기록없음' },
                ].map((item) => (
                  <div key={item.label} className="bg-white/10 rounded-xl p-3 text-center">
                    <p className="text-xl font-black">{item.value}</p>
                    <p className="text-[10px] text-blue-200 mt-0.5">{item.label}</p>
                    <p className="text-[10px] text-blue-300 mt-0.5">{item.sub}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 상세 지표 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
              <h3 className="text-sm font-bold text-gray-800">📈 상세 현황</h3>
              {[
                { label: '✅ 정시 출석률', rate: attendRate, color: attendRate >= 90 ? 'bg-green-500' : 'bg-yellow-400' },
                { label: '📝 과제 달성률', rate: wsRate, color: wsRate >= 80 ? 'bg-green-500' : wsRate >= 60 ? 'bg-yellow-400' : 'bg-red-400' },
                { label: '📖 교재 제출률', rate: tbRate, color: tbRate >= 80 ? 'bg-blue-500' : 'bg-yellow-400' },
                ...(monthWS.length > 0 ? [{ label: '🎯 학습지 완료율', rate: wsRate2, color: 'bg-purple-500' }] : []),
              ].map((item) => (
                <div key={item.label}>
                  <div className="flex justify-between text-xs mb-1.5">
                    <span className="font-semibold text-gray-600">{item.label}</span>
                    <span className={cx('font-black', item.rate >= 80 ? 'text-green-600' : item.rate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                      {item.rate}%
                    </span>
                  </div>
                  <ProgressBar rate={item.rate} color={item.color} />
                </div>
              ))}
            </div>

            {/* 출결 상세 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">📅 출결 상세</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '정시', value: attendStat.정시, color: 'text-green-600', bg: 'bg-green-50' },
                  { label: '지각', value: attendStat.지각, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                  { label: '결석', value: attendStat.결석, color: 'text-red-500', bg: 'bg-red-50' },
                ].map((item) => (
                  <div key={item.label} className={cx('rounded-xl p-3 text-center', item.bg)}>
                    <p className={cx('text-2xl font-black', item.color)}>{item.value}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 데일리 테스트 */}
            {dailyTests.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-gray-800">📊 데일리 테스트</h3>
                  {avgDailyTest != null && (
                    <span className={cx('text-sm font-black', scoreColor(avgDailyTest))}>
                      평균 {avgDailyTest}점
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {dailyTests.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-3 py-2 bg-gray-50 rounded-xl">
                      <span className="text-xs text-gray-400 w-20 shrink-0">{s.session_date.slice(5)}</span>
                      <span className="text-xs text-gray-600 flex-1 truncate">{s.daily_test_unit}</span>
                      <span className={cx('text-sm font-black shrink-0', scoreColor(s.daily_test_score ?? 0))}>
                        {s.daily_test_score}점
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 학습지 기록 */}
            {monthWS.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">📝 학습지 기록</h3>
                  <span className="text-xs text-gray-400">완료 {passedWS.length}/{monthWS.length}개</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {monthWS.map((w) => (
                    <div key={w.id} className="px-4 py-2.5 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{w.grade_level} {w.unit}</p>
                        <p className="text-[10px] text-gray-400">
                          {w.worksheet_type === 'similar' ? '오답유사 · ' : ''}{w.current_level}레벨
                        </p>
                      </div>
                      {w.score != null ? (
                        <span className={cx('text-sm font-black shrink-0', scoreColor(w.score))}>
                          {w.score}점
                        </span>
                      ) : (
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                          w.status === 'passed' ? 'bg-green-100 text-green-600' :
                          w.status === 'submitted' ? 'bg-orange-100 text-orange-500' :
                          'bg-blue-100 text-blue-600')}>
                          {w.status === 'passed' ? '완료' : w.status === 'submitted' ? '채점대기' : '진행중'}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 수업 진도 기록 */}
            {monthSessions.filter(s => s.progress_content).length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50">
                  <h3 className="text-sm font-bold text-gray-800">📖 수업 진도 기록</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {monthSessions.filter(s => s.progress_content).map((s) => (
                    <div key={s.id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-xs text-gray-400 w-16 shrink-0">{s.session_date.slice(5)}</span>
                      <span className="text-xs text-gray-700 flex-1">{s.progress_content}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
