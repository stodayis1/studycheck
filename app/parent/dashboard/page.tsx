'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import { stripRichTokens } from '@/lib/richContent'
import { pickDisplayAnnouncements } from '@/lib/announcements'
import PushSubscribeButton from '@/components/PushSubscribeButton'
import { ATT_EXAM, isExamAbsence } from '@/lib/attendance'

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
  session_type: string | null
  today_textbook_name: string | null
  today_chapter: string | null
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
  memo: string | null
  achievement_pct: number | null   // 그날 과제 달성률 (선생님이 알림장에 적는다)
  makeup_note: string | null   // 결석한 날의 보강 진행 상황 (OPS가 채운다)
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

interface Announcement {
  id: string
  title: string
  content: string
  created_at: string
  is_important?: boolean
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
  const [examPreps, setExamPreps] = useState<any[]>([])
  const [unitExams, setUnitExams] = useState<any[]>([])
  const [coreTests, setCoreTests] = useState<any[]>([])
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week')
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase.from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        const nowIso = new Date().toISOString()
        const [{ data: scData }, { data: ssData }, { data: nData }, { data: wsData }, { data: tbData }, { data: cData }, { data: pcData }, { data: fbData }, { data: anData }] = await Promise.all([
          supabase.from('schedules').select('*').eq('student_id', session.id).eq('is_active', true),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('concepts').select('*').order('concept_order'),
          supabase.from('progress_checks').select('*').eq('student_id', session.id),
          supabase.from('feedbacks').select('*').eq('student_id', session.id).order('created_at', { ascending: false }).limit(80),
          // 학원 공지사항 - 지금 표시 대상인 것만(종료일 지났거나 원장님이 종료 처리한 건 자동 제외)
          supabase.from('announcements').select('id, title, content, created_at, is_important').eq('is_active', true)
            .or(`ends_at.is.null,ends_at.gte.${nowIso}`).order('created_at', { ascending: false }),
        ])
        if (scData) setSchedules(scData.map((s: any) => ({ ...s, periods: Number(s.periods) })))
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
        if (cData) setConcepts(cData)
        if (pcData) setProgressChecks(pcData)
        if (fbData) setFeedbacks(fbData)
        if (anData) setAnnouncements(pickDisplayAnnouncements(anData))

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

        // 학교 단원평가 (초등) - 초등은 중간·기말고사가 없어서 이게 곧 학교 성적이다.
        // exams는 원래 직원 전용 테이블이라, 본인 학생의 단원평가만 읽을 수 있게 RLS를 따로 열었다
        // (docs/sql/단원평가_학부모학생_공개.sql). 정책을 아직 안 건 DB에서는 빈 배열이 와서 카드가 안 보일 뿐 깨지지 않는다.
        // 단원평가(초등 학교시험)와 코어테스트를 한 번에 받아 종류별로 나눈다.
        // 학교 중간·기말 내신 성적과 진단평가·입학테스트는 학원 관리용이라 RLS에서 막혀 있어 여기로 오지 않는다.
        const { data: ueData } = await supabase
          .from('exams')
          .select('exam_type, title, unit, unit_name, score, total_score, exam_date, semester')
          .eq('student_id', session.id)
          .in('exam_type', ['학교시험', '코어테스트'])
          .order('exam_date', { ascending: false })
        if (ueData) {
          setUnitExams(ueData.filter((e: any) => e.exam_type === '학교시험' && e.title === '단원평가'))
          setCoreTests(ueData.filter((e: any) => e.exam_type === '코어테스트' && e.score != null))
        }
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
  // 날짜별 기록 — "하루에 있었던 일이 그 날짜 한 칸에 다 보이게" 가 원장님 요구다.
  //   출결 · 과제를 해왔는지 · 달성률 · 그날 나간 진도 · 다음 과제 배부 · 그날의 알림장.
  // ★ 기간(이번 주)에 묶지 않는다. 그 주에 수업이 없으면 화면이 통째로 비어
  //   "그날그날이 안 보인다"는 말이 나온다. 지난 수업부터 최근 것 위주로 그냥 보여 준다.
  // ★ 알림장은 session_id 가 없고 created_at 밖에 없다(수업과 따로 쓰인다).
  //   그래서 **날짜로** 붙인다. 실제 데이터에서 1477건 중 1454건이 수업 날짜와 맞는다.
  //   나머지(수업 없는 날에 쓴 알림장)도 안 숨기려고 날짜 목록을 합집합으로 만든다.
  const fbDate = (fb: any) => {
    const d = new Date(fb.created_at)   // 기기(한국) 시각 기준 — DB는 UTC로 저장된다
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const dayRows = Array.from(new Set([
    ...sessions.filter((ses) => ses.session_date <= todayStr).map((ses) => ses.session_date),
    ...feedbacks.map(fbDate).filter((d: string) => d <= todayStr),
  ]))
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => {
      const ses = sessions.find((x) => x.session_date === date) ?? null
      return {
        date,
        ses,
        note: ses ? notes.find((n) => n.session_id === ses.id) : undefined,
        fbs: feedbacks.filter((f) => fbDate(f) === date),
      }
    })

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
        action={(
          <div className="flex items-center gap-2">
            <PushSubscribeButton role="parent" studentId={student.id} />
            <button onClick={signOut} className="text-xs text-gray-400 hover:text-gray-600">로그아웃</button>
          </div>
        )} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 데이터 업로드 안내 - 2026년 7월부터 순차 등록 중이라 그 이전 기록은 일부 누락될 수 있음을 고지 */}
        <div className="rounded-2xl px-4 py-3 flex items-start gap-2" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
          <span className="text-sm shrink-0">⚠️</span>
          <p className="text-[11px] leading-relaxed" style={{ color: '#92400E' }}>
            학습 기록은 2026년 7월부터 순차적으로 등록되고 있어요. 그 이전 진행 내역이나 일부 교재 진도는 아직 반영되지 않았을 수 있습니다.
          </p>
        </div>

        {/* 공지사항 - 원장님이 올린 학원 공지 (시험/방학/휴강 등). 최신 2개, 중요 공지가 있으면 최대 3개까지.
            나머지는 "전체보기"로 들어가서 확인 - 카톡채널 공지를 잘 안 보셔서 앱 상단에 노출 */}
        {announcements.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #F5C4B3', background: '#FFF5F2' }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#F5C4B3' }}>
              <div className="flex items-center gap-1.5">
                <span className="text-sm">📢</span>
                <span className="text-xs font-bold" style={{ color: '#712B13' }}>공지사항</span>
              </div>
              <Link href="/parent/announcements" className="text-[10px] font-semibold" style={{ color: '#712B13' }}>
                전체보기 ›
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: '#F5C4B360' }}>
              {announcements.map((a) => (
                <Link key={a.id} href="/parent/announcements" className="block px-4 py-2.5">
                  <p className="text-xs font-bold truncate" style={{ color: '#712B13' }}>{a.is_important && '⭐ '}{a.title}</p>
                  <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: '#993C1D' }}>{stripRichTokens(a.content)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

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

        {/* 날짜별 기록 — 그날 과제를 해왔는지, 지각했는지를 바로 보이게 */}
        {dayRows.length > 0 && (
          <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#f0f0f0' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#FAFAFA', borderBottom: '1px solid #f0f0f0' }}>
              <i className="ti ti-calendar-check" style={{ fontSize: 15, color: '#993C1D' }} />
              <h3 className="text-sm font-bold" style={{ color: '#712B13' }}>날짜별 기록</h3>
              <Link href="/parent/learning-notes" className="ml-auto text-[11px]" style={{ color: '#993C1D' }}>
                전체 보기 ›
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: '#f5f5f5' }}>
              {dayRows.slice(0, 8).map(({ date, ses, note, fbs }) => {
                const d = new Date(date + 'T00:00:00')
                const day = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
                const att = note?.attendance ?? null
                const pct = note?.achievement_pct ?? (note?.workbook_done ? 100 : note?.worksheet_submitted ? 70 : null)
                // 진도 — today_textbook_name 과 progress_content 가 거의 늘 같은 글이다(실데이터로 확인).
                //   같으면 한 번만 보여 준다. today_chapter 는 거의 비어 있어 있을 때만 덧붙는다.
                const prog = [ses?.progress_content, ses?.today_textbook_name, ses?.today_chapter]
                  .map((t) => (t ?? '').trim())
                  .filter((t, i, arr) => t && arr.indexOf(t) === i)
                const hw = ses ? hwOf(ses) : null
                return (
                  <div key={date} className="px-4 py-3">
                    {/* 머리줄 — 날짜 · 출결 · 과제를 해왔는지 · 달성률 */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs font-bold text-gray-700 w-[52px] shrink-0">
                        {date.slice(5).replace('-', '/')}<span className="text-gray-400 font-normal"> {day}</span>
                      </span>
                      {!ses ? (
                        <span className="text-[11px] text-gray-400">수업이 없던 날이에요</span>
                      ) : !note ? (
                        <span className="text-[11px] text-gray-400">아직 기록 전이에요</span>
                      ) : (
                        <>
                          {/* 시험기간 결석은 봐주는 날이라 빨갛게 하지 않는다 */}
                          {isExamAbsence(att) ? (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-lg"
                              style={{ background: '#F3E8FF', color: '#6B21A8' }}>{ATT_EXAM}</span>
                          ) : (
                            <Tag ok={att === '정시'} warn={att === '지각'}>
                              {att === '정시' ? '정시 출석' : att === '지각' ? '지각' : att === '결석' ? '결석' : '출결 미기록'}
                            </Tag>
                          )}
                          <Tag ok={!!note.worksheet_submitted}>
                            학습지 {note.worksheet_submitted
                              ? (note.worksheet_score != null ? `${note.worksheet_score}점` : '해옴')
                              : '안 해옴'}
                          </Tag>
                          <Tag ok={!!note.textbook_submitted}>
                            교재 {note.textbook_submitted ? '해옴' : '안 해옴'}
                          </Tag>
                          {pct != null && (
                            <span className="text-[10px] font-bold px-2 py-1 rounded-lg"
                              style={{
                                background: pct >= 90 ? '#EAF3DE' : pct >= 70 ? '#FAEEDA' : '#fee2e2',
                                color: pct >= 90 ? '#27500A' : pct >= 70 ? '#633806' : '#991b1b',
                              }}>
                              달성률 {pct}%
                            </span>
                          )}
                        </>
                      )}
                    </div>

                    {/* 그날 나간 진도 */}
                    {prog.length > 0 && (
                      <DayLine label="진도">
                        {prog.map((t, i) => <div key={i}>{t}</div>)}
                      </DayLine>
                    )}

                    {/* 데일리 테스트 */}
                    {ses?.daily_test_unit && (
                      <DayLine label="테스트">
                        {ses.daily_test_unit}
                        {ses.daily_test_score != null && (
                          <span className="font-bold ml-1" style={{
                            color: ses.daily_test_score >= 90 ? '#27500A' : ses.daily_test_score >= 70 ? '#633806' : '#991b1b',
                          }}>· {ses.daily_test_score}점</span>
                        )}
                      </DayLine>
                    )}

                    {/* 과제 배부 — 그날 집에서 해올 몫 */}
                    {hw && (hw.books.length > 0 || hw.worksheet || hw.memo) && (
                      <DayLine label="과제 배부">
                        {hw.books.map((b, i) => (
                          <div key={i} className="flex items-baseline gap-1.5">
                            <i className="ti ti-book" style={{ fontSize: 11, color: '#993C1D' }} />
                            <span className="font-semibold text-gray-800">{b.name}</span>
                            {b.page && <span className="text-gray-400">{b.page}</span>}
                          </div>
                        ))}
                        {hw.worksheet && (
                          <div className="flex items-baseline gap-1.5">
                            <i className="ti ti-file-text" style={{ fontSize: 11, color: '#993C1D' }} />
                            <span className="font-semibold text-gray-800">{hw.worksheet}</span>
                          </div>
                        )}
                        {hw.memo && (
                          <div className="flex items-baseline gap-1.5">
                            <i className="ti ti-note" style={{ fontSize: 11, color: '#993C1D' }} />
                            <span className="whitespace-pre-wrap">{hw.memo}</span>
                          </div>
                        )}
                      </DayLine>
                    )}

                    {/* 그날의 알림장 */}
                    {fbs.map((fb: any) => {
                      const imgs = fbImages(fb.ai_message)
                      return (
                        <div key={fb.id} className="mt-2 rounded-xl px-2.5 py-2"
                          style={{ background: '#FFF5F2', border: '1px solid #f5d6cc' }}>
                          <p className="text-[10px] font-bold mb-1" style={{ color: '#993C1D' }}>
                            <i className="ti ti-message-circle" style={{ fontSize: 11, marginRight: 3 }} />
                            알림장 · {fb.teacher_name ?? '선생님'}
                          </p>
                          <p className="text-[11px] text-gray-700 leading-relaxed whitespace-pre-wrap">{fb.content}</p>
                          {imgs.length > 0 && (
                            <div className="flex gap-1.5 mt-1.5 flex-wrap">
                              {imgs.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noreferrer">
                                  <img src={u} alt="" className="w-14 h-14 rounded-lg object-cover border"
                                    style={{ borderColor: '#f5d6cc' }} />
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {note?.memo && (
                      <p className="mt-2 text-[11px] text-gray-600 bg-gray-50 rounded-xl px-2.5 py-1.5 whitespace-pre-wrap">
                        선생님 메모 · {note.memo}
                      </p>
                    )}
                    {(note as any)?.makeup_note && (
                      <p className="mt-1.5 text-[11px] font-semibold rounded-xl px-2.5 py-1.5"
                        style={{ background: '#FFF5F2', color: '#712B13' }}>
                        보강 · {(note as any).makeup_note}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 알림장(피드백) — 미리보기만, 전체 기록은 '보고서' 탭(월별)에서 */}
        {feedbacks.length > 0 && (() => {
          const latest = feedbacks[0]
          const dateStr = new Date(latest.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
          return (
            <Link href="/parent/reports"
              className="block bg-white rounded-2xl border-2 shadow-sm overflow-hidden" style={{ borderColor: '#F5C4B3' }}>
              <div className="px-4 py-3" style={{ background: '#FFF5F2', borderBottom: '1px solid #f5d6cc' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F5C4B3' }}>
                    <i className="ti ti-message-circle" style={{ fontSize: 14, color: '#712B13' }} />
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#712B13' }}>선생님 알림장</span>
                  <span className="text-sm ml-auto" style={{ color: '#712B13' }}>›</span>
                </div>
                <p className="text-[10px] mt-1 pl-9" style={{ color: '#993C1D' }}>
                  특이사항이 있을 때만 남겨요 · 매 수업마다 작성하는 건 아니에요
                </p>
              </div>
              {/* ★ 본문은 위 「날짜별 기록」이 그날 자리에서 보여 준다.
                  여기서 또 쓰면 같은 글이 한 화면에 두 번 나온다 — 길목만 남긴다. */}
              <div className="px-4 py-3 flex items-center gap-2">
                <p className="text-[11px] font-semibold" style={{ color: '#993C1D' }}>
                  <i className="ti ti-user" style={{ fontSize: 11, marginRight: 4 }} />
                  가장 최근 {dateStr} · {latest.teacher_name ?? '선생님'}
                </p>
                <p className="text-[10px] text-gray-400 ml-auto">
                  모두 {feedbacks.length}개 · 달별로 모아 보기 ›
                </p>
              </div>
            </Link>
          )
        })()}

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

        {/* 교재 진도 현황 — 보고서와 동일 (연산서는 개념별이 아니라 진도율로만 관리하므로 제외, 아래 "병행교재 현황"에서 표시) */}
        {(() => {
          const myTBs = textbooks.filter(t => t.grade && t.textbook_type !== '연산서')
          if (myTBs.length === 0) return null
          return (
            <Link href="/parent/reports" className="block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                  <i className="ti ti-books" style={{ fontSize: 14, color: '#993C1D' }} />
                </div>
                <span className="text-sm font-bold text-gray-800">교재 진도 현황</span>
                <span className="text-sm ml-auto" style={{ color: '#993C1D' }}>›</span>
              </div>
              <div className="px-4 py-4 space-y-3">
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
                    const isCompleted = tb.status === 'completed'
                    return (
                      <div key={tb.id}>
                        <div className="flex items-center gap-2 mb-1.5">
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
                        <div className="h-1.5 rounded-full" style={{ background: '#f3f0ea' }}>
                          <div className="h-1.5 rounded-full" style={{ width: `${rate}%`, background: style.dot }} />
                        </div>
                      </div>
                    )
                  })}
                <p className="text-[10px] text-gray-400 pt-1">단원별 상세 진도는 보고서 탭에서 볼 수 있어요</p>
              </div>
            </Link>
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
                        {tb.grade && (
                          <p className="mt-0.5 text-[10px] text-gray-400">{tb.grade} {tb.semester ? `${tb.semester}학기` : ''}</p>
                        )}
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

        {/* 오늘 수업 기록 - 과거 기록은 배움노트/보고서 탭에서 확인 */}
        {(() => {
          const activeSession = todaySession
          const activeNote = activeSession ? notes.find(n => n.session_id === activeSession.id) : null
          if (!activeSession) return null
          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-notebook" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold text-gray-700">오늘 수업 기록</h3>
                <Link href="/parent/learning-notes" className="text-[10px] font-semibold ml-auto" style={{ color: '#993C1D' }}>
                  지난 기록 보기 ›
                </Link>
              </div>
              {/* 오늘 내용 */}
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
                  {/* 보강 — 결석한 날의 보강 진행 상황. OPS가 makeup_note 칸에 넣어준다
                      (선생님 메모와 별개 칸 · docs/sql/보강칸_추가.sql) */}
                  {activeNote?.makeup_note && (
                    <div className="rounded-xl px-3 py-2.5" style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold" style={{ color: '#993C1D' }}>
                          <i className="ti ti-calendar-repeat" style={{ fontSize: 12 }} /> 보강
                        </span>
                        <span className="text-xs font-bold" style={{ color: '#712B13' }}>{activeNote.makeup_note}</span>
                      </div>
                      {activeNote.makeup_note.includes('예정') && (
                        <p className="text-[10px] mt-1.5 leading-relaxed" style={{ color: '#9a6b5a' }}>
                          보강 날짜는 미리 말씀해 주시면 언제든 바꿔 드려요.
                          다만 예약하신 날에 오지 못하면 그 보강은 다시 잡아 드리기 어려우니 양해 부탁드려요.
                        </p>
                      )}
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
                  {(() => {
                    // 교재/학습지를 따로 고르지 않고 메모로만 남긴 과제(예: "교재 과제 없음" 체크 후
                    // 오답첨삭/오답유사 등 다른 과제를 글로 적은 경우)도 hw_textbook_page 안에
                    // "📝 ..." 조각으로 저장돼 있는데, 예전엔 hw_textbook_name/hw_worksheet_range가
                    // 둘 다 비어 있으면 "오늘 과제" 자체가 안 뜨는 문제가 있었음 - 메모도 함께 반영.
                    const memoPart = activeSession.hw_textbook_page
                      ?.split(' / ')
                      .find((p: string) => p.startsWith('📝 '))
                    if (!activeSession.hw_textbook_name && !activeSession.hw_worksheet_range && !memoPart) return null
                    return (
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
                          {memoPart && (
                            <div className="flex items-start gap-2">
                              <i className="ti ti-note" style={{ fontSize: 12, color: '#993C1D', flexShrink: 0, marginTop: 2 }} />
                              <span className="text-xs font-semibold text-gray-800 whitespace-pre-wrap">{memoPart.slice(2).trim()}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })()}
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
                  {activeNote?.memo && (
                    <div className="rounded-xl px-3 py-2.5" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                      <p className="text-[10px] text-gray-400 mb-1">📝 선생님 메모</p>
                      <p className="text-xs text-gray-700 whitespace-pre-wrap">{activeNote.memo}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* 학교 단원평가 카드 - 초등만. 초등은 중간·기말고사가 없어서 단원평가가 곧 학교 성적이다.
            기록이 하나도 없으면 아예 안 보인다(빈 카드가 뜨면 학원이 안 챙기는 것처럼 보이므로). */}
        {(student?.grade ?? '').includes('초') && unitExams.length > 0 && (() => {
          // 학기 판단은 선생님 화면과 같은 규칙(3~8월=1학기). 이번 학기 기록이 없으면 기록이 있는 최근 학기를 보여준다.
          const m = new Date().getMonth()
          const nowSem = m >= 2 && m <= 7 ? 1 : 2
          const semesters = Array.from(new Set(unitExams.map((e: any) => e.semester).filter(Boolean)))
          const sem = semesters.includes(nowSem) ? nowSem : (semesters.sort((a: any, b: any) => b - a)[0] ?? nowSem)

          // 같은 단원을 두 번 봤으면 최근 것만
          const byUnit: Record<number, any> = {}
          unitExams.filter((e: any) => e.semester === sem).forEach((r: any) => {
            const idx = parseInt((r.unit ?? '').replace('단원', ''))
            if (!idx) return
            if (!byUnit[idx] || r.exam_date >= byUnit[idx].exam_date) byUnit[idx] = r
          })
          const rows = Object.entries(byUnit)
            .map(([idx, r]) => ({ idx: Number(idx), ...(r as any) }))
            .filter((r) => r.score != null)
            .sort((a, b) => a.idx - b.idx)
          if (rows.length === 0) return null

          const avg = Math.round(rows.reduce((s, r) => s + (r.score / (r.total_score || 100)) * 100, 0) / rows.length)
          const tone = (p: number) => p >= 90 ? '#27500A' : p >= 70 ? '#633806' : '#991b1b'
          const toneBg = (p: number) => p >= 90 ? '#EAF3DE' : p >= 70 ? '#FAEEDA' : '#fee2e2'

          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#EFF6FF', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-school" style={{ fontSize: 16, color: '#1e3a5f' }} />
                <h3 className="text-sm font-bold" style={{ color: '#1e3a5f' }}>학교 단원평가</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: '#DBEAFE', color: '#1e3a5f' }}>
                  {sem}학기 · 평균 {avg}점
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {rows.map((r) => {
                  const p = Math.round((r.score / (r.total_score || 100)) * 100)
                  return (
                    <div key={r.idx} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                        style={{ background: '#f3f4f6', color: '#6b7280' }}>{r.idx}단원</span>
                      <p className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">
                        {r.unit_name || '-'}
                      </p>
                      <span className="text-[10px] text-gray-400 shrink-0">{(r.exam_date ?? '').slice(5)}</span>
                      <span className="text-sm font-black px-2 py-0.5 rounded-lg shrink-0"
                        style={{ background: toneBg(p), color: tone(p) }}>
                        {r.score}점
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2" style={{ background: '#fafafa' }}>
                <p className="text-[10px] text-gray-400">학교에서 본 단원평가 결과예요. 학원 평가(진단·코어테스트)와는 별개예요.</p>
              </div>
            </div>
          )
        })()}

        {/* 학원 코어테스트 카드 - 2개월마다 보는 학원 정기 평가.
            학교 성적(단원평가)과 구분해서 보여준다. 기록이 없으면 카드를 감춘다. */}
        {coreTests.length > 0 && (() => {
          const rows = coreTests.slice(0, 6)
          const latest = rows[0]
          const tone = (p: number) => p >= 90 ? '#27500A' : p >= 70 ? '#633806' : '#991b1b'
          const toneBg = (p: number) => p >= 90 ? '#EAF3DE' : p >= 70 ? '#FAEEDA' : '#fee2e2'
          const pctOf = (r: any) => Math.round((r.score / (r.total_score || 100)) * 100)
          return (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#D5E7C2' }}>
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#EAF3DE', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-target" style={{ fontSize: 16, color: '#27500A' }} />
                <h3 className="text-sm font-bold" style={{ color: '#27500A' }}>학원 코어테스트</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: '#D5E7C2', color: '#27500A' }}>
                  최근 {(latest.exam_date ?? '').slice(5)} · {latest.score}점
                </span>
              </div>
              <div className="divide-y divide-gray-50">
                {rows.map((r: any, i: number) => {
                  const p = pctOf(r)
                  return (
                    <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0"
                        style={{ background: '#f3f4f6', color: '#6b7280' }}>{r.title || '평가'}</span>
                      <p className="text-xs font-semibold text-gray-700 flex-1 min-w-0 truncate">
                        {r.unit_name || '-'}
                      </p>
                      <span className="text-[10px] text-gray-400 shrink-0">{(r.exam_date ?? '').slice(5)}</span>
                      <span className="text-sm font-black px-2 py-0.5 rounded-lg shrink-0"
                        style={{ background: toneBg(p), color: tone(p) }}>
                        {r.score}점
                      </span>
                    </div>
                  )
                })}
              </div>
              <div className="px-4 py-2" style={{ background: '#fafafa' }}>
                <p className="text-[10px] text-gray-400">학원에서 2개월마다 보는 정기 평가예요. 학교 시험과는 별개예요.</p>
              </div>
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

// 날짜별 기록의 한 줄 — 왼쪽에 회색 이름표, 오른쪽에 내용
function DayLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 mt-1.5">
      <span className="text-[10px] text-gray-400 w-[46px] shrink-0 pt-[2px]">{label}</span>
      <div className="flex-1 min-w-0 text-[11px] text-gray-700 leading-relaxed">{children}</div>
    </div>
  )
}

// 과제 배부 — 교재 이름은 hw_textbook_name 에 쉼표로, 페이지는 hw_textbook_page 에
//   "교재명 · 페이지" 조각이 " / " 로 이어져 들어온다.
//   ★ 같은 페이지가 두 번 적힌 자리가 있다("디딤돌 연산 · 94-97 · 94-97").
//     그래서 조각의 **마지막 칸**만 페이지로 쓴다.
//   ★ 교재를 안 고르고 메모만 남긴 과제는 그 안에 "📝 ..." 조각으로 들어 있다.
//     이걸 안 읽으면 "오늘 과제 없음"처럼 보인다.
function hwOf(ses: ClassSession) {
  const pageParts = (ses.hw_textbook_page ?? '').split(' / ')
  const memo = pageParts.find((p) => p.trim().startsWith('📝 '))
  const books = (ses.hw_textbook_name ?? '')
    .split(',')
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((name) => {
      const entry = pageParts.find((p) => p.includes(name))
      const page = entry ? entry.split('·').slice(-1)[0]?.trim() : null
      return { name, page: page && page !== name ? page : null }
    })
  return { books, worksheet: (ses.hw_worksheet_range ?? '').trim() || null, memo: memo ? memo.slice(2).trim() : null }
}

// ★ 알림장의 ai_message 칸은 **글이 아니라 사진 URL을 담은 JSON**이다({"images":[...]}).
//   글처럼 그리면 학부모 화면에 {"images":["https://..."]} 가 그대로 보인다(실제로 79건).
//   알림장 본문은 언제나 content 쪽이다.
function fbImages(aiMessage: string | null): string[] {
  if (!aiMessage) return []
  try {
    const parsed = JSON.parse(aiMessage)
    if (parsed && Array.isArray(parsed.images)) return parsed.images
  } catch {}
  return []
}

// 날짜별 기록의 작은 꼬리표 — 했으면 초록, 지각 같은 주의는 노랑, 안 했으면 빨강
function Tag({ ok, warn, children }: { ok?: boolean; warn?: boolean; children: React.ReactNode }) {
  const c = warn
    ? { background: '#FAEEDA', color: '#633806' }
    : ok
      ? { background: '#EAF3DE', color: '#27500A' }
      : { background: '#fee2e2', color: '#991b1b' }
  return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-lg" style={c}>
      {children}
    </span>
  )
}
