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
  student_textbook_id?: string | null
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
  progress_percent?: number | null
  grade: string | null
  semester: number | null
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
  const [selectedSessionDate, setSelectedSessionDate] = useState<string | null>(null)
  const [examPreps, setExamPreps] = useState<any[]>([])
  const [feedbacks, setFeedbacks] = useState<any[]>([])
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

        const [{ data: scData }, { data: ssData }, { data: nData }, { data: wsData }, { data: tbData }, { data: cData }, { data: pcData }, { data: fbData }] = await Promise.all([
          supabase.from('schedules').select('*').eq('student_id', session.id).eq('is_active', true),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('concepts').select('*').order('concept_order'),
          supabase.from('progress_checks').select('*').eq('student_id', session.id),
          supabase.from('feedbacks').select('*').eq('student_id', session.id).order('created_at', { ascending: false }).limit(20),
        ])
        if (scData) setSchedules(scData)
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
        if (cData) setConcepts(cData)
        if (pcData) setProgressChecks(pcData)
        if (fbData) setFeedbacks(fbData)

        // 시험대비 - NULL이거나 4주 이내 시험
        const maxDate = new Date(Date.now() + 35*86400000).toISOString().split('T')[0]
        const minDate = new Date(Date.now() - 7*86400000).toISOString().split('T')[0]
        const { data: epData } = await supabase
          .from('student_exam_prep')
          .select('*, inner_enough(*)')
          .eq('student_id', session.id)
          .or(`exam_date.is.null,and(exam_date.lte.${maxDate},exam_date.gte.${minDate})`)
          .neq('status', 'done')
          .order('exam_date', { ascending: true, nullsFirst: false })
        if (epData) setExamPreps(epData)
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

        {/* 알림장(피드백) — 선생님이 작성한 메시지 */}
        {feedbacks.length > 0 && (
          <div className="bg-white rounded-2xl border-2 shadow-sm overflow-hidden" style={{ borderColor: '#F5C4B3' }}>
            <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#FFF5F2', borderBottom: '1px solid #f5d6cc' }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F5C4B3' }}>
                <i className="ti ti-message-circle" style={{ fontSize: 14, color: '#712B13' }} />
              </div>
              <span className="text-sm font-bold" style={{ color: '#712B13' }}>선생님 알림장</span>
              <span className="text-[10px] ml-auto" style={{ color: '#993C1D' }}>{feedbacks.length}개</span>
            </div>
            <div className="divide-y" style={{ borderColor: '#fde4dc' }}>
              {feedbacks.map((fb) => {
                // ai_message 필드에 JSON.stringify({ images: [...] }) 형태로 저장됨
                let images: string[] = []
                if (fb.ai_message) {
                  try {
                    const parsed = JSON.parse(fb.ai_message)
                    if (parsed && Array.isArray(parsed.images)) images = parsed.images
                  } catch {}
                }
                const dateStr = new Date(fb.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
                return (
                  <div key={fb.id} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold" style={{ color: '#993C1D' }}>
                        <i className="ti ti-user" style={{ fontSize: 11, marginRight: 4 }} />
                        {fb.teacher_name ?? '선생님'}
                      </p>
                      <p className="text-[10px] text-gray-400">{dateStr}</p>
                    </div>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{fb.content}</p>
                    {images.length > 0 && (
                      <div className="flex gap-2 flex-wrap mt-3">
                        {images.map((url, idx) => (
                          <a key={idx} href={url} target="_blank" rel="noopener noreferrer"
                            className="block w-24 h-24 rounded-xl overflow-hidden border border-gray-200">
                            <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

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
                    const myChecks = progressChecks.filter(p =>
                      p.student_textbook_id === tb.id || (!p.student_textbook_id && tb.textbook_type === '개념서')
                    )
                    const checkedConcepts = tbConcepts.filter(c =>
                      myChecks.some(p => p.concept_id === c.id && p.check_count >= 1)
                    )
                    const rate = tb.status === 'completed' ? 100 : Math.round(checkedConcepts.length / tbConcepts.length * 100)
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
                                    const check = myChecks.find(p => p.concept_id === c.id)
                                    const done = tb.status === 'completed' || (check && check.check_count >= 1)
                                    const partial = false
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
              {Object.entries(activeTBByType).map(([type, tb]) => {
                const isCalc = type === '연산서'
                const pct = tb.progress_percent ?? 0
                return (
                  <div key={type} className={isCalc ? 'w-full px-3 py-2.5 rounded-xl text-xs' : 'px-3 py-2.5 rounded-xl text-xs'}
                    style={{ background: '#FAECE7', border: '1px solid #F5C4B380' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold" style={{ color: '#993C1D' }}>{type}</p>
                        <p className="mt-0.5 text-[11px] text-gray-600">{tb.textbook_name}</p>
                      </div>
                      {isCalc && (
                        <span className="text-sm font-bold" style={{ color: pct >= 80 ? '#22c55e' : pct >= 40 ? '#3b82f6' : '#f59e0b' }}>{pct}%</span>
                      )}
                    </div>
                    {isCalc && (
                      <div className="bg-white rounded-full h-1.5 mt-2 overflow-hidden">
                        <div className="h-1.5 rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 40 ? '#3b82f6' : '#f59e0b' }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 최근 수업 기록 - 날짜 탭 */}
        {sessions.length > 0 && (() => {
          // 같은 날짜 중 가장 최근 session만 (중복 날짜 제거)
          const seenDates = new Set<string>()
          const recentSessions = sessions.filter(s => {
            if (seenDates.has(s.session_date)) return false
            seenDates.add(s.session_date)
            return true
          }).slice(0, 7)
          const activeDate = selectedSessionDate ?? recentSessions[0]?.session_date
          const activeSession = recentSessions.find(s => s.session_date === activeDate)
          const activeNote = activeSession ? notes.find(n => n.session_id === activeSession.id) : null
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-notebook" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold text-gray-700">최근 수업 기록</h3>
              </div>
              {/* 날짜 탭 */}
              <div className="flex gap-2 overflow-x-auto px-3 py-2.5 no-scrollbar" style={{ borderBottom: '1px solid #f0f0f0' }}>
                {recentSessions.map(session => {
                  const d = new Date(session.session_date)
                  const isToday = session.session_date === todayStr
                  const isSelected = activeDate === session.session_date
                  return (
                    <button key={session.session_date}
                      onClick={() => setSelectedSessionDate(session.session_date)}
                      className="flex flex-col items-center px-3 py-1.5 rounded-xl shrink-0 transition-all"
                      style={isSelected
                        ? { background: '#F5C4B3', color: '#712B13' }
                        : { background: '#f3f4f6', color: '#9ca3af' }}>
                      <span className="text-[10px] font-semibold">{DAYS[d.getDay()]}요일</span>
                      <span className="text-sm font-black">{d.getMonth()+1}/{d.getDate()}</span>
                      {isToday && <span className="text-[9px] font-bold" style={{ color: isSelected ? '#712B13' : '#993C1D' }}>오늘</span>}
                    </button>
                  )
                })}
              </div>
              {/* 선택된 날짜 내용 */}
              {activeSession && (
                <div className="px-4 py-3 space-y-3">
                  {/* 출결 */}
                  {activeNote && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">출결</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: activeNote.attendance === '정시' ? '#EAF3DE' : activeNote.attendance === '지각' ? '#FAEEDA' : '#fee2e2',
                          color: activeNote.attendance === '정시' ? '#27500A' : activeNote.attendance === '지각' ? '#633806' : '#991b1b'
                        }}>{activeNote.attendance}</span>
                    </div>
                  )}
                  {/* 수업 내용 */}
                  {activeSession.progress_content && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">수업 내용</p>
                      <p className="text-xs font-semibold text-gray-800 flex items-start gap-1.5">
                        <i className="ti ti-books" style={{ fontSize: 13, color: '#993C1D', marginTop: 1, flexShrink: 0 }} />
                        {activeSession.progress_content}
                      </p>
                    </div>
                  )}
                  {/* 데일리 테스트 */}
                  {activeSession.daily_test_unit && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1">데일리 테스트</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gray-700">{activeSession.daily_test_unit}</span>
                        {activeSession.daily_test_score != null && (
                          <span className="text-sm font-black" style={{
                            color: activeSession.daily_test_score >= 90 ? '#27500A' : activeSession.daily_test_score >= 70 ? '#633806' : '#991b1b'
                          }}>{activeSession.daily_test_score}점</span>
                        )}
                      </div>
                    </div>
                  )}
                  {/* 오늘 과제 */}
                  {(activeSession.hw_textbook_name || activeSession.hw_worksheet_range) && (
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1.5">오늘 과제</p>
                      <div className="rounded-xl px-3 py-2.5 space-y-2" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                        {activeSession.hw_textbook_name && activeSession.hw_textbook_name.split(',').map((name, i) => {
                          const pageEntry = activeSession.hw_textbook_page
                            ? activeSession.hw_textbook_page.split('/').find((p: string) => p.includes(name.trim()))
                            : null
                          const pageOnly = pageEntry ? pageEntry.split('·').slice(-1)[0]?.trim() : null
                          return (
                            <div key={i} className="flex items-center gap-2">
                              <i className="ti ti-book" style={{ fontSize: 12, color: '#993C1D', flexShrink: 0 }} />
                              <span className="text-xs font-semibold text-gray-800 flex-1">{name.trim()}</span>
                              {pageOnly && <span className="text-[10px] text-gray-400">{pageOnly}</span>}
                            </div>
                          )
                        })}
                        {activeSession.hw_worksheet_range && (
                          <div className="flex items-center gap-2">
                            <i className="ti ti-file-text" style={{ fontSize: 12, color: '#993C1D', flexShrink: 0 }} />
                            <span className="text-xs font-semibold text-gray-800">{activeSession.hw_worksheet_range}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  {/* 달성률 / 성취율 */}
                  {activeNote && (
                    <div className="flex gap-1.5 flex-wrap">
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: '#f3f4f6', color: '#6b7280' }}>
                        달성률 <span style={{ fontWeight: 700, color: activeNote.workbook_done ? '#27500A' : activeNote.worksheet_submitted ? '#633806' : '#991b1b' }}>
                          {activeNote.workbook_done ? '100' : activeNote.worksheet_submitted ? '70' : '0'}%
                        </span>
                        <span style={{ color: '#d1d5db' }}> · 수행도</span>
                      </span>
                      {activeNote.worksheet_score != null && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ background: '#f3f4f6', color: '#6b7280' }}>
                          성취율 <span style={{ fontWeight: 700, color: activeNote.worksheet_score >= 85 ? '#27500A' : activeNote.worksheet_score >= 70 ? '#633806' : '#991b1b' }}>
                            {activeNote.worksheet_score}%
                          </span>
                          <span style={{ color: '#d1d5db' }}> · 정답률</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* 시험대비 현황 카드 - 4주 이내 시험 있을 때만 */}
        {examPreps.length > 0 && (() => {
          const todayMid = new Date(); todayMid.setHours(0,0,0,0)
          const upcomingExams = examPreps.filter(e => e.exam_date && new Date(e.exam_date) >= todayMid)
          const nearestExam = upcomingExams.length > 0 ? upcomingExams[0] : examPreps[examPreps.length - 1]
          const diffDays = Math.ceil((new Date(nearestExam.exam_date).getTime() - todayMid.getTime()) / 86400000)
          const totalPct = Math.round(examPreps.reduce((sum, ep) => sum + Math.round((ep.progress_step||0)/(ep.total_steps||1)*100), 0) / examPreps.length)
          const avgScore = (() => {
            const scored = examPreps.filter(ep => ep.score != null)
            if (scored.length === 0) return null
            return Math.round(scored.reduce((s, ep) => s + (ep.score ?? 0), 0) / scored.length)
          })()
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#FFF5F2', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-pencil-check" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold" style={{ color: '#712B13' }}>시험대비 현황</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: '#F5C4B3', color: '#712B13' }}>
                  {diffDays >= 0 ? `D-${diffDays}` : '시험 종료'} · {nearestExam.exam_date}
                </span>
              </div>
              {/* 전체 요약 */}
              <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: '1px solid #f0f0f0' }}>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] text-gray-400">전체 완성률</span>
                    <span className="text-sm font-black" style={{ color: totalPct >= 100 ? '#27500A' : '#993C1D' }}>{totalPct}%</span>
                  </div>
                  <div className="h-2 rounded-full" style={{ background: '#f3f4f6' }}>
                    <div className="h-2 rounded-full" style={{ width: `${totalPct}%`, background: totalPct >= 100 ? '#639922' : '#EF9F27' }} />
                  </div>
                </div>
                {avgScore != null && (
                  <div className="text-center shrink-0">
                    <p className="text-lg font-black" style={{ color: avgScore >= 90 ? '#27500A' : avgScore >= 70 ? '#633806' : '#991b1b' }}>{avgScore}점</p>
                    <p className="text-[10px] text-gray-400">평균 성취도</p>
                  </div>
                )}
              </div>
              {/* 단원별 */}
              <div className="divide-y divide-gray-50">
                {examPreps
          .sort((a: any, b: any) => {
            const isSpecialA = ['전범위','복합'].includes(a.inner_enough?.unit_name ?? '')
            const isSpecialB = ['전범위','복합'].includes(b.inner_enough?.unit_name ?? '')
            if (isSpecialA && !isSpecialB) return 1
            if (!isSpecialA && isSpecialB) return -1
            return (a.inner_enough?.unit_no ?? '').localeCompare(b.inner_enough?.unit_no ?? '', 'ko', { numeric: true })
          })
              .map((ep: any) => {
                  const ie = ep.inner_enough
                  if (!ie) return null
                  const totalSteps = ep.total_steps || 1
                  const pct = Math.round((ep.progress_step || 0) / totalSteps * 100)
                  return (
                    <div key={ep.id} className="px-4 py-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <span className="text-xs font-semibold text-gray-800">{ie.unit_name}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">{ie.problem_count}문항</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {ep.score != null && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: ep.score >= 90 ? '#EAF3DE' : ep.score >= 70 ? '#FAEEDA' : '#fee2e2',
                                color: ep.score >= 90 ? '#27500A' : ep.score >= 70 ? '#633806' : '#991b1b'
                              }}>{ep.score}점</span>
                          )}
                          <span className="text-[10px] font-bold" style={{ color: pct >= 100 ? '#27500A' : '#993C1D' }}>{pct}%</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: pct >= 100 ? '#639922' : '#EF9F27' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
