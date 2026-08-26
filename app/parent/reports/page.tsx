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

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
  sub_chapter: string
  concept_name: string
  concept_order: number
}

interface ProgressCheck {
  id: string
  student_id: string
  concept_id: string
  check_count: number
  student_textbook_id?: string | null
}

interface StudentTextbook {
  id: string
  textbook_name: string
  textbook_type: string
  grade: string | null
  semester: number | null
  status: string
}

// 학습분석리포트용 - 다른 화면(teacher/reports, report/[token])과 동일한 SVG 레이더 로직
function laTierColor(v: number | null, good = 85, mid = 70) {
  if (v == null) return '#9ca3af'
  if (v >= good) return '#27500A'
  if (v >= mid) return '#633806'
  return '#991b1b'
}
function laPolarPoint(cx: number, cy: number, angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function laRingPoints(n: number, cx: number, cy: number, maxR: number, frac: number) {
  return Array.from({ length: n })
    .map((_, i) => laPolarPoint(cx, cy, i * (360 / n), maxR * frac))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

const DAYS = ['일','월','화','수','목','금','토']
const TYPE_ORDER: Record<string, number> = { '개념서': 0, '유형서': 1, '심화서': 2, '연산서': 3 }
const TYPE_STYLE: Record<string, { dot: string; fill: string; label: string }> = {
  '개념서': { dot: '#EF9F27', fill: '#FAEEDA', label: '개념' },
  '유형서': { dot: '#639922', fill: '#EAF3DE', label: '유형' },
  '심화서': { dot: '#dc2626', fill: '#fee2e2', label: '심화' },
  '연산서': { dot: '#7c3aed', fill: '#ede9fe', label: '연산' },
}

export default function ParentReportsPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
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

        const [{ data: ssData }, { data: nData }, { data: wsData }, { data: fbData }, { data: cData }, { data: pcData }, { data: tbData }] = await Promise.all([
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date'),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at'),
          supabase.from('feedbacks').select('*').eq('student_id', session.id).order('created_at', { ascending: false }),
          supabase.from('concepts').select('*').order('concept_order'),
          supabase.from('progress_checks').select('*').eq('student_id', session.id),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).not('status', 'in', '("checked")'),
        ])
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (fbData) setFeedbacks(fbData)
        if (cData) setConcepts(cData)
        if (pcData) setProgressChecks(pcData)
        if (tbData) setTextbooks(tbData)
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

  // 학습분석리포트 - teacher/reports, report/[token]과 완전히 동일한 로직(단원+학년으로 묶고,
  // 3건 미만이면 생략, 단원이 1개뿐이면 '취약 단원' 계산 안 함)으로 값이 화면마다 어긋나지 않게 함
  const scoredMonthWS = monthWS.filter(w => w.score != null)
  const learningAnalysis = (() => {
    if (scoredMonthWS.length < 3) return null
    const unitMap = new Map<string, { label: string; scores: number[]; lastAssignedAt: string }>()
    scoredMonthWS.forEach((w) => {
      const key = `${w.grade_level ?? ''}__${w.unit ?? '기타'}`
      const label = w.unit_name || `${w.grade_level ?? ''} ${w.unit ?? '기타'}`.trim()
      const existing = unitMap.get(key)
      if (existing) {
        existing.scores.push(w.score as number)
        if (w.assigned_at > existing.lastAssignedAt) existing.lastAssignedAt = w.assigned_at
      } else {
        unitMap.set(key, { label, scores: [w.score as number], lastAssignedAt: w.assigned_at })
      }
    })
    const unitAverages = Array.from(unitMap.values())
      .map((u) => ({ label: u.label, avg: Math.round(u.scores.reduce((s, v) => s + v, 0) / u.scores.length), count: u.scores.length }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ko'))
      .slice(0, 6)
    const sortedByDate = [...scoredMonthWS].sort((a, b) => a.assigned_at.localeCompare(b.assigned_at))
    const recent5 = sortedByDate.slice(-5)
    const recentAvg = Math.round(recent5.reduce((s, w) => s + (w.score as number), 0) / recent5.length)
    const worksheetAvg = Math.round(scoredMonthWS.reduce((s, w) => s + (w.score as number), 0) / scoredMonthWS.length)
    const overallScore = avgDailyTest != null ? Math.round((worksheetAvg + avgDailyTest) / 2) : worksheetAvg
    const weakest = unitAverages.length >= 2 ? [...unitAverages].sort((a, b) => a.avg - b.avg)[0] : null
    const latest = sortedByDate[sortedByDate.length - 1]
    const latestUnitAvg = unitMap.get(`${latest.grade_level ?? ''}__${latest.unit ?? '기타'}`)
    const latestUnitAvgExcludingLast = latestUnitAvg && latestUnitAvg.scores.length > 1
      ? Math.round((latestUnitAvg.scores.reduce((s, v) => s + v, 0) - (latest.score as number)) / (latestUnitAvg.scores.length - 1))
      : null
    const recentDrop = latestUnitAvgExcludingLast != null && latestUnitAvgExcludingLast - (latest.score as number) >= 15
      ? { label: latest.unit_name || `${latest.grade_level ?? ''} ${latest.unit ?? '기타'}`.trim(), from: latestUnitAvgExcludingLast, to: latest.score as number }
      : null
    const solutions: string[] = []
    if (recentDrop) {
      solutions.push(`${recentDrop.label} 최근 정답률 급락(${recentDrop.from}→${recentDrop.to}점) — 재점검 필요`)
    } else if (weakest) {
      solutions.push(`${weakest.label} 평균이 상대적으로 낮음(${weakest.avg}점) — 보충 학습 권장`)
    }
    if (recentAvg < worksheetAvg - 5) {
      solutions.push(`최근 5회 평균(${recentAvg}점)이 전체 평균(${worksheetAvg}점)보다 낮음 — 난이도 조정 검토`)
    } else if (solutions.length === 0) {
      solutions.push('전반적으로 안정적인 흐름을 유지하고 있음')
    }
    return { overallScore, unitAverages, recentAvg, weakestLabel: weakest?.label ?? null, weakestAvg: weakest?.avg ?? null, recentDrop, solutions }
  })()

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

  // 교재 진도 현황 - 월과 무관하게 현재 배정된 교재 기준 (연산서는 진도율 관리 방식이 달라 제외)
  const myTBs = textbooks.filter(t => t.grade && t.textbook_type !== '연산서')

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

        {/* 교재 진도 현황 - 현재 배정된 교재 기준, 월 선택과 무관하게 항상 표시 */}
        {myTBs.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                <i className="ti ti-books" style={{ fontSize: 14, color: '#993C1D' }} />
              </div>
              <span className="text-sm font-bold text-gray-800">교재 진도 현황</span>
            </div>
            <div className="px-4 py-4 space-y-5">
              {myTBs
                .sort((a, b) => (TYPE_ORDER[a.textbook_type] ?? 9) - (TYPE_ORDER[b.textbook_type] ?? 9))
                .map(tb => {
                  if (!tb.grade) return null
                  const tbConcepts = concepts.filter(c => c.grade === tb.grade && (tb.semester ? c.semester === tb.semester : true))
                  if (tbConcepts.length === 0) return null
                  const myChecks = progressChecks.filter(p =>
                    p.student_textbook_id === tb.id || (!p.student_textbook_id && tb.textbook_type === '개념서')
                  )
                  const checkedConcepts = tbConcepts.filter(c =>
                    myChecks.some(p => p.concept_id === c.id && p.check_count >= 1)
                  )
                  const rate = tb.status === 'completed' ? 100 : Math.round(checkedConcepts.length / tbConcepts.length * 100)
                  const style = TYPE_STYLE[tb.textbook_type] ?? TYPE_STYLE['개념서']
                  const chapters = [...new Set(tbConcepts.map(c => c.chapter))]
                  const isCompleted = tb.status === 'completed'
                  return (
                    <div key={tb.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: style.dot, color: '#fff' }}>
                          {style.label}
                        </span>
                        <span className="text-xs font-bold text-gray-800">{tb.textbook_name}</span>
                        <span className="text-[10px] text-gray-400">{tb.grade} {tb.semester}학기</span>
                        {isCompleted ? (
                          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: style.dot, color: '#fff' }}>완료</span>
                        ) : (
                          <span className="ml-auto text-xs font-bold" style={{ color: style.dot }}>{rate}%</span>
                        )}
                      </div>
                      <div className="h-1.5 rounded-full mb-3" style={{ background: '#f3f0ea' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${rate}%`, background: style.dot }} />
                      </div>
                      {isCompleted ? (
                        <p className="text-[10px] text-gray-400">완료 처리된 교재예요 · 개념별 진도는 표시하지 않아요</p>
                      ) : (
                        <>
                          <div className="space-y-2">
                            {chapters.map(ch => {
                              const chConcepts = tbConcepts.filter(c => c.chapter === ch)
                              return (
                                <div key={ch}>
                                  <p className="text-[10px] text-gray-500 mb-1">{ch}</p>
                                  <div className="flex flex-wrap gap-1">
                                    {chConcepts.map(c => {
                                      const check = myChecks.find(p => p.concept_id === c.id)
                                      const done = check && check.check_count >= 1
                                      return (
                                        <div key={c.id} title={c.concept_name} style={{
                                          width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                                          background: done ? style.dot : '#f3f0ea',
                                          border: `1px solid ${done ? style.dot : '#e5d5c5'}`,
                                        }} />
                                      )
                                    })}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                          <div className="flex gap-3 mt-2">
                            {[['완료', style.dot, ''], ['미진도', '#f3f0ea', '1px solid #e5d5c5']].map(([label, bg, border]) => (
                              <div key={label} className="flex items-center gap-1">
                                <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: border || 'none' }} />
                                <span className="text-[9px] text-gray-500">{label}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

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

            {/* 수학의지혜 학습분석리포트 - 다른 화면들과 동일 디자인/로직 (2026-08 확정) */}
            {learningAnalysis && (() => {
              const la = learningAnalysis
              const showRadar = la.unitAverages.length >= 3
              const n = la.unitAverages.length
              const cx = 80, cy = 80, maxR = 56
              const dataPts = la.unitAverages
                .map((u, i) => laPolarPoint(cx, cy, i * (360 / n), maxR * (u.avg / 100)))
                .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
                .join(' ')
              return (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                    <i className="ti ti-chart-radar" style={{ fontSize: 16, color: '#993C1D' }} />
                    <h3 className="text-sm font-bold text-gray-700">수학의지혜 학습분석리포트</h3>
                  </div>
                  <div className="px-4 py-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="shrink-0">
                        <p className="text-[10px] text-gray-400 mb-0.5">종합 점수</p>
                        <p style={{ color: laTierColor(la.overallScore) }} className="text-3xl font-black">
                          {la.overallScore ?? '-'}<span className="text-xs text-gray-400 ml-0.5">/100</span>
                        </p>
                      </div>
                      {showRadar && (
                        <svg viewBox="0 0 160 160" width={110} height={110} className="shrink-0">
                          {[0.25, 0.5, 0.75, 1].map((frac) => (
                            <polygon key={frac} points={laRingPoints(n, cx, cy, maxR, frac)} fill="none" stroke="#e5e7eb" strokeWidth={1} />
                          ))}
                          {la.unitAverages.map((_, i) => {
                            const p = laPolarPoint(cx, cy, i * (360 / n), maxR)
                            return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth={1} />
                          })}
                          <polygon points={dataPts} fill="rgba(153,60,29,0.12)" stroke="#993C1D" strokeWidth={1.5} />
                          {la.unitAverages.map((u, i) => {
                            const label = laPolarPoint(cx, cy, i * (360 / n), maxR + 16)
                            const anchor = label.x < cx - 5 ? 'end' : label.x > cx + 5 ? 'start' : 'middle'
                            return (
                              <text key={i} x={label.x} y={label.y} textAnchor={anchor} dominantBaseline="middle" fontSize={9} fill="#6b7280">
                                {u.label.length > 6 ? u.label.slice(0, 6) : u.label}
                              </text>
                            )
                          })}
                        </svg>
                      )}
                    </div>
                    <div className="space-y-1.5 pt-3 border-t border-gray-50 mb-3">
                      {la.unitAverages.map((u, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 w-16 shrink-0 truncate">{u.label}</span>
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                            <div className="h-1.5 rounded-full" style={{ width: `${u.avg}%`, background: laTierColor(u.avg) }} />
                          </div>
                          <span className="text-[10px] text-gray-600 w-7 text-right shrink-0">{u.avg}점</span>
                        </div>
                      ))}
                    </div>
                    {la.weakestLabel && (
                      <div className="mb-3">
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-lg" style={{ background: '#FAECE7', color: '#993C1D' }}>
                          취약 단원 · {la.weakestLabel} ({la.weakestAvg}점)
                        </span>
                      </div>
                    )}
                    <div className="pt-3 border-t border-gray-50">
                      <p className="text-[10px] font-semibold mb-1.5" style={{ color: '#993C1D' }}>솔루션</p>
                      {la.solutions.map((s, i) => (
                        <p key={i} className="text-xs text-gray-600 leading-relaxed">{i + 1}. {s}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

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
                <div className="px-4 py-3" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <div className="flex items-center gap-2">
                    <i className="ti ti-message-circle" style={{ fontSize: 16, color: '#993C1D' }} />
                    <h3 className="text-sm font-bold text-gray-700">선생님 피드백</h3>
                    <span className="text-[10px] text-gray-400 ml-1">{monthFeedbacks.length}개</span>
                  </div>
                  <p className="text-[10px] mt-1 pl-6 text-gray-400">특이사항이 있을 때만 남겨요 · 매 수업마다 작성하는 건 아니에요</p>
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
                                {fb.content}
                              </p>
                            )}
                          </div>
                          <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                            style={{ fontSize: 14, color: '#9ca3af', flexShrink: 0 }} />
                        </button>
                        {isExpanded && (() => {
                          // ai_message 필드는 메시지 텍스트가 아니라 이미지 URL을 담은 JSON({ images: [...] })
                          let fbImages: string[] = []
                          if (fb.ai_message) {
                            try {
                              const parsed = JSON.parse(fb.ai_message)
                              if (parsed && Array.isArray(parsed.images)) fbImages = parsed.images
                            } catch {}
                          }
                          return (
                            <div className="px-4 pb-4" style={{ borderTop: '1px solid #f5f5f5' }}>
                              <div className="rounded-xl px-4 py-3 mt-3 text-xs leading-relaxed"
                                style={{ background: '#FFF5F2', border: '1px solid #F5C4B3', color: '#712B13' }}>
                                {fb.content.split('\n').map((line, i) => (
                                  <p key={i} className={i > 0 ? 'mt-1' : ''}>{line}</p>
                                ))}
                              </div>
                              {fbImages.length > 0 && (
                                <div className="flex gap-2 flex-wrap mt-2.5">
                                  {fbImages.map((url, idx) => (
                                    <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                                      className="block w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                                      <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
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
