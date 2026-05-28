'use client'

import { useState, useEffect } from 'react'
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
  wise_step: string
}

interface Schedule {
  id: string
  day_of_week: string
  start_time: string
  periods: number
}

interface ClassSession {
  id: string
  session_date: string
  today_textbook_name: string | null
  progress_content: string | null
  hw_textbook_name: string | null
  hw_textbook_page: string | null
  hw_worksheet_range: string | null
  video_url: string | null
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
  video_started_at: string | null
  video_completed_at: string | null
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

interface StudentTextbook {
  id: string
  textbook_name: string
  textbook_type: string
  status: string
}

const DAYS = ['일','월','화','수','목','금','토']

function ProgressBar({ rate, color, height = 'h-2' }: { rate: number; color: string; height?: string }) {
  return (
    <div className={cx(height, 'bg-gray-100 rounded-full overflow-hidden')}>
      <div className={cx('h-full rounded-full transition-all duration-700', color)}
        style={{ width: `${Math.min(100, Math.max(0, rate))}%` }} />
    </div>
  )
}

export default function ParentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase.from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        const [{ data: scData }, { data: ssData }, { data: nData }, { data: wsData }, { data: tbData }, { data: cData }, { data: pcData }] = await Promise.all([
          supabase.from('schedules').select('*').eq('student_id', session.id).eq('is_active', true),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('concepts').select('*').order('concept_order'),
          supabase.from('progress_checks').select('*').eq('student_id', session.id),
        ])
        if (scData) setSchedules(scData)
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
        if (cData) setConcepts(cData)
        if (pcData) setProgressChecks(pcData)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  function signOut() {
    sessionStorage.removeItem('studycheck_student')
    router.push('/auth/login')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!student) return null

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const todayDay = DAYS[today.getDay()]

  // 기간 설정
  const periodStart = new Date(today)
  if (viewMode === 'week') {
    periodStart.setDate(today.getDate() - today.getDay() + 1)
  } else {
    periodStart.setDate(1)
  }
  const periodStartStr = periodStart.toISOString().split('T')[0]

  // 기간 내 수업
  const periodSessions = sessions.filter(s => s.session_date >= periodStartStr && s.session_date <= todayStr)
  const periodNotes = notes.filter(n => periodSessions.some(s => s.id === n.session_id))

  // 통계
  const totalSessions = periodNotes.length
  const attendRate = totalSessions > 0
    ? Math.round(periodNotes.filter(n => n.attendance === '정시').length / totalSessions * 100) : 0
  const wsSubmitRate = totalSessions > 0
    ? Math.round(periodNotes.filter(n => n.worksheet_submitted).length / totalSessions * 100) : 0
  const tbSubmitRate = totalSessions > 0
    ? Math.round(periodNotes.filter(n => n.textbook_submitted).length / totalSessions * 100) : 0
  const videoSessions = periodSessions.filter(s => s.video_url)
  const videoCompleteRate = videoSessions.length > 0
    ? Math.round(notes.filter(n => videoSessions.some(s => s.id === n.session_id) && n.video_completed_at).length / videoSessions.length * 100) : 0

  // 학습지 현황
  const activeWS = worksheets.filter(w => w.status !== 'passed')

  // 오늘/다음 수업
  const todaySchedule = schedules.find(s => s.day_of_week === todayDay)
  const todaySession = sessions.find(s => s.session_date === todayStr)
  const nextSchedule = (() => {
    const dayOrder = ['월','화','수','목','금','토','일']
    const todayIdx = dayOrder.indexOf(todayDay)
    for (let i = 1; i <= 7; i++) {
      const nextDay = dayOrder[(todayIdx + i) % 7]
      const sc = schedules.find(s => s.day_of_week === nextDay)
      if (sc) return { schedule: sc, day: nextDay }
    }
    return null
  })()

  // 학습지 현황 (최근 6개월)
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]
  const recentWS = worksheets.filter(w => w.assigned_at >= sixMonthsAgoStr)
  const wsScored = recentWS.filter(w => w.score != null)
  const wsAvgScore = wsScored.length > 0 ? Math.round(wsScored.reduce((s, w) => s + (w.score ?? 0), 0) / wsScored.length) : null
  const wsPassedCount = recentWS.filter(w => w.status === 'passed').length
  const wsPassRate = recentWS.length > 0 ? Math.round(wsPassedCount / recentWS.length * 100) : null
  const levelMap: Record<number, number> = {}
  recentWS.forEach(w => { levelMap[w.current_level] = (levelMap[w.current_level] ?? 0) + 1 })
  const levels = Object.entries(levelMap).sort((a, b) => Number(a[0]) - Number(b[0]))
  const maxCount = levels.length > 0 ? Math.max(...levels.map(([, c]) => c)) : 1
  const maxLevel = recentWS.length > 0 ? Math.max(...recentWS.map(w => w.current_level)) : 0

  // 교재 진도 스타일
  const TYPE_ORDER: Record<string, number> = { '개념서': 0, '유형서': 1, '심화서': 2, '연산서': 3 }
  const TYPE_STYLE: Record<string, { dot: string; fill: string; label: string }> = {
    '개념서': { dot: '#EF9F27', fill: '#FAEEDA', label: '개념' },
    '유형서': { dot: '#639922', fill: '#EAF3DE', label: '유형' },
    '심화서': { dot: '#dc2626', fill: '#fee2e2', label: '심화' },
    '연산서': { dot: '#7c3aed', fill: '#ede9fe', label: '연산' },
  }

  // 병행교재
  const activeTBByType: Record<string, StudentTextbook> = {}
  textbooks.filter(t => t.status === 'assigned').forEach(t => {
    if (!activeTBByType[t.textbook_type]) activeTBByType[t.textbook_type] = t
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`${student.name} 학생`} subtitle="학습 현황"
        action={<button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600">로그아웃</button>} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 프로필 카드 */}
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: '#FAECE7' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#F5C4B3' }}>
            <span className="text-xl font-black" style={{ color: '#712B13' }}>{student.name[0]}</span>
          </div>
          <div className="flex-1">
            <p className="font-black text-base" style={{ color: '#712B13' }}>{student.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#993C1D' }}>{student.school} · {student.grade}</p>
            <div className="flex items-center gap-2 mt-0.5">
              {student.teacher_name && <span className="text-xs" style={{ color: '#993C1D' }}>{student.teacher_name} 선생님</span>}
              {student.wise_step && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F5C4B3', color: '#712B13' }}>
                  {student.wise_step}단계
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 오늘/다음 수업 */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl p-4" style={{ background: todaySchedule ? '#F5C4B3' : '#f3f4f6' }}>
            <div className="flex items-center gap-1.5 mb-2">
              <i className="ti ti-calendar-event" style={{ fontSize: 13, color: todaySchedule ? '#712B13' : '#9ca3af' }} />
              <span className="text-[10px] font-semibold" style={{ color: todaySchedule ? '#712B13' : '#9ca3af' }}>오늘 수업</span>
            </div>
            {todaySchedule ? (
              <>
                <p className="text-2xl font-black" style={{ color: '#712B13' }}>{todaySchedule.start_time.slice(0,5)}</p>
                <p className="text-xs mt-0.5" style={{ color: '#993C1D' }}>{todaySchedule.periods}교시</p>
                {todaySession?.progress_content && (
                  <p className="text-xs mt-1 truncate" style={{ color: '#993C1D', opacity: 0.8 }}>{todaySession.progress_content}</p>
                )}
              </>
            ) : <p className="text-sm font-semibold text-gray-400">수업 없음</p>}
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <div className="flex items-center gap-1.5 mb-2">
              <i className="ti ti-calendar-stats" style={{ fontSize: 13, color: '#9ca3af' }} />
              <span className="text-[10px] font-semibold text-gray-400">다음 수업</span>
            </div>
            {nextSchedule ? (
              <>
                <p className="text-sm font-bold text-gray-600">{nextSchedule.day}요일</p>
                <p className="text-2xl font-black" style={{ color: '#993C1D' }}>{nextSchedule.schedule.start_time.slice(0,5)}</p>
              </>
            ) : <p className="text-sm font-semibold text-gray-400">-</p>}
          </div>
        </div>

        {/* 주간/월간 토글 */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: '#f3f4f6' }}>
          {([['week','이번 주'],['month','이번 달']] as const).map(([mode, label]) => (
            <button key={mode} onClick={() => setViewMode(mode as typeof viewMode)}
              className="flex-1 py-2.5 text-sm font-bold transition-all"
              style={viewMode === mode
                ? { background: '#F5C4B3', color: '#712B13' }
                : { background: 'transparent', color: '#9ca3af' }}>
              {label}
            </button>
          ))}
        </div>

        {/* 핵심 지표 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <div className="flex items-center gap-2">
            <i className="ti ti-chart-bar" style={{ fontSize: 16, color: '#993C1D' }} />
            <h3 className="text-sm font-bold text-gray-800">
              {viewMode === 'week' ? '이번 주' : '이번 달'} 학습 현황
              <span className="text-xs font-normal text-gray-400 ml-2">수업 {totalSessions}회 기준</span>
            </h3>
          </div>

          {totalSessions === 0 ? (
            <p className="text-xs text-gray-400 text-center py-2">이 기간 수업 기록이 없어요</p>
          ) : (
            <div className="space-y-3">
              {[
                { label: '정시 출석률', rate: attendRate, icon: 'ti-circle-check' },
                { label: '과제 달성률', rate: wsSubmitRate, icon: 'ti-file-text', sub: '과제 수행도' },
                { label: '교재 제출률', rate: tbSubmitRate, icon: 'ti-book', sub: '교재 과제 완료' },
                ...(videoSessions.length > 0 ? [{ label: '영상 완료율', rate: videoCompleteRate, icon: 'ti-player-play' }] : []),
              ].map((item: any) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5">
                      <i className={`ti ${item.icon}`} style={{ fontSize: 13, color: '#993C1D' }} />
                      <span className="text-xs font-semibold text-gray-700">{item.label}</span>
                      {item.sub && <span className="text-[10px] text-gray-400">· {item.sub}</span>}
                    </div>
                    <span className="text-sm font-black" style={{
                      color: item.rate >= 90 ? '#27500A' : item.rate >= 70 ? '#633806' : '#991b1b'
                    }}>{item.rate}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: '#f3f4f6' }}>
                    <div className="h-2 rounded-full transition-all" style={{
                      width: `${Math.min(100, Math.max(0, item.rate))}%`,
                      background: item.rate >= 90 ? '#639922' : item.rate >= 70 ? '#EF9F27' : '#e24b4a'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 레벨학습지 현황 — 보고서와 동일 */}
        {recentWS.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                <i className="ti ti-file-text" style={{ fontSize: 14, color: '#993C1D' }} />
              </div>
              <span className="text-sm font-bold text-gray-800">학습지 현황</span>
              <span className="text-[10px] text-gray-400 ml-1">최근 6개월</span>
            </div>
            <div className="px-4 py-4">
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: '총 학습지', value: recentWS.length, unit: '개' },
                  { label: '통과율', value: wsPassRate ?? '-', unit: '%' },
                  { label: '평균점수', value: wsAvgScore ?? '-', unit: '점' },
                ].map(item => (
                  <div key={item.label} className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                    <p className="text-[10px] text-gray-400 mb-0.5">{item.label}</p>
                    <p className="text-base font-bold text-gray-800">{item.value}<span className="text-[10px] font-normal text-gray-400 ml-0.5">{item.unit}</span></p>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mb-2">레벨별 분포 <span className="ml-1 font-semibold text-gray-600">최고 {maxLevel}레벨</span></p>
              <div className="flex items-end gap-2 h-10">
                {levels.map(([level, count]) => {
                  const barH = Math.max(4, Math.round((count / maxCount) * 36))
                  const lv = Number(level)
                  const barColor = lv >= 4 ? '#F5C4B3' : '#D3D1C7'
                  const textColor = lv >= 4 ? '#993C1D' : '#6b7280'
                  return (
                    <div key={level} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                      <span className="text-[9px] font-bold" style={{ color: textColor }}>{count}</span>
                      <div className="w-full rounded-t-sm" style={{ height: barH, background: barColor }} />
                      <span className="text-[9px] text-gray-400">{level}레벨</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* 교재 진도 현황 — 보고서와 동일 */}
        {(() => {
          const myTBs = textbooks.filter(t => t.grade)
          if (myTBs.length === 0) return null
          return (
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
                    const targetCount = tb.textbook_type === '개념서' ? 1 : tb.textbook_type === '유형서' ? 2 : 3
                    const checkedConcepts = tbConcepts.filter(c =>
                      progressChecks.some(p => p.concept_id === c.id && p.check_count >= targetCount)
                    )
                    const rate = Math.round(checkedConcepts.length / tbConcepts.length * 100)
                    const style = TYPE_STYLE[tb.textbook_type] ?? TYPE_STYLE['개념서']
                    const chapters = [...new Set(tbConcepts.map(c => c.chapter))]
                    return (
                      <div key={tb.id}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: style.dot, color: '#fff' }}>
                            {style.label}
                          </span>
                          <span className="text-xs font-bold text-gray-800">{tb.textbook_name}</span>
                          <span className="text-[10px] text-gray-400">{tb.grade} {tb.semester}학기</span>
                          <span className="ml-auto text-xs font-bold" style={{ color: style.dot }}>{rate}%</span>
                        </div>
                        <div className="h-1.5 rounded-full mb-3" style={{ background: '#f3f0ea' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${rate}%`, background: style.dot }} />
                        </div>
                        <div className="space-y-2">
                          {chapters.map(ch => {
                            const chConcepts = tbConcepts.filter(c => c.chapter === ch)
                            return (
                              <div key={ch}>
                                <p className="text-[10px] text-gray-500 mb-1">{ch}</p>
                                <div className="flex flex-wrap gap-1">
                                  {chConcepts.map(c => {
                                    const check = progressChecks.find(p => p.concept_id === c.id)
                                    const done = check && check.check_count >= targetCount
                                    const partial = check && check.check_count > 0 && check.check_count < targetCount
                                    return (
                                      <div key={c.id} title={c.concept_name} style={{
                                        width: 16, height: 16, borderRadius: 3, flexShrink: 0,
                                        background: done ? style.dot : partial ? style.fill : '#f3f0ea',
                                        border: `1px solid ${done ? style.dot : partial ? style.dot + '80' : '#e5d5c5'}`,
                                      }} />
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        <div className="flex gap-3 mt-2">
                          {[['완료', style.dot, ''], ['진행중', style.fill, `1px solid ${style.dot}80`], ['미진도', '#f3f0ea', '1px solid #e5d5c5']].map(([label, bg, border]) => (
                            <div key={label} className="flex items-center gap-1">
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: bg, border: border || 'none' }} />
                              <span className="text-[9px] text-gray-500">{label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })()}

                {/* 병행교재 현황 */}
        {Object.keys(activeTBByType).length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <i className="ti ti-stack" style={{ fontSize: 16, color: '#993C1D' }} />
              <h3 className="text-sm font-bold text-gray-700">병행교재 현황</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(activeTBByType).map(([type, tb]) => (
                <div key={type} className="px-3 py-2.5 rounded-xl text-xs" style={{ background: '#FAECE7', border: '1px solid #F5C4B380' }}>
                  <p className="font-bold" style={{ color: '#993C1D' }}>{type}</p>
                  <p className="mt-0.5 text-[11px] text-gray-600">{tb.textbook_name}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 최근 수업 기록 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
            <i className="ti ti-notebook" style={{ fontSize: 16, color: '#993C1D' }} />
            <h3 className="text-sm font-bold text-gray-700">최근 수업 기록</h3>
          </div>
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">수업 기록이 없어요</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {sessions.slice(0, 4).map((session) => {
                const note = notes.find(n => n.session_id === session.id)
                const isToday = session.session_date === todayStr
                return (
                  <div key={session.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <p className="text-xs font-bold text-gray-700">{session.session_date}</p>
                      {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: '#F5C4B3', color: '#712B13' }}>오늘</span>}
                      {note && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto"
                        style={{
                          background: note.attendance === '정시' ? '#EAF3DE' : note.attendance === '지각' ? '#FAEEDA' : '#fee2e2',
                          color: note.attendance === '정시' ? '#27500A' : note.attendance === '지각' ? '#633806' : '#991b1b'
                        }}>
                        {note.attendance}
                      </span>
                      )}
                    </div>
                    {session.progress_content && (
                      <p className="text-xs text-gray-500 mb-1">📖 {session.progress_content}</p>
                    )}
                    {note && (
                      <div className="flex flex-wrap gap-1.5">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: '#f3f4f6', color: '#6b7280' }}>
                          달성률 <span style={{ fontWeight: 700, color: note.workbook_done ? '#27500A' : note.worksheet_submitted ? '#633806' : '#991b1b' }}>
                            {note.workbook_done ? '100' : note.worksheet_submitted ? '70' : '0'}%
                          </span>
                          <span style={{ color: '#d1d5db' }}> · 과제 수행도</span>
                        </span>
                        {note.worksheet_score != null && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            성취율 <span style={{ fontWeight: 700, color: note.worksheet_score >= 85 ? '#27500A' : note.worksheet_score >= 70 ? '#633806' : '#991b1b' }}>
                              {note.worksheet_score}%
                            </span>
                            <span style={{ color: '#d1d5db' }}> · 정답률</span>
                          </span>
                        )}
                        {session.daily_test_score != null && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                            style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            데일리 <span style={{ fontWeight: 700, color: session.daily_test_score >= 90 ? '#27500A' : session.daily_test_score >= 70 ? '#633806' : '#991b1b' }}>
                              {session.daily_test_score}점
                            </span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
