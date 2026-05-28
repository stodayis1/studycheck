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
  session_date: string
  today_textbook_name: string | null
  today_chapter: string | null
  video_url: string | null
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
  video_started_at: string | null
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
  memo: string | null
  assigned_at: string
}

interface StudentTextbook {
  id: string
  concept_id: string | null
  textbook_name: string
  textbook_type: string
  grade: string | null
  semester: number | null
  status: string
  memo: string | null
  assigned_at: string
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

const WS_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  assigned:          { label: '과제중',   color: 'text-gray-500',  bg: 'bg-gray-100' },
  submitted:         { label: '제출완료', color: 'text-[#712B13]', bg: 'bg-[#FFF5F2]' },
  similar_assigned:  { label: '오답유사', color: 'text-[#712B13]', bg: 'bg-[#FFF5F2]' },
  similar_submitted: { label: '유사제출', color: 'text-[#712B13]', bg: 'bg-[#FFF5F2]' },
  passed:            { label: '완료',     color: 'text-[#712B13]', bg: 'bg-[#F5C4B3]' },
}

export default function StudentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [todaySession, setTodaySession] = useState<ClassSession | null>(null)
  const [todayNote, setTodayNote] = useState<LearningNote | null>(null)
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)

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
    const [{ data: ssData }, { data: wsData }, { data: tbData }, { data: cData }, { data: pcData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', sid).eq('session_date', todayStr).single(),
      supabase.from('student_worksheets').select('*').eq('student_id', sid).not('status', 'in', '("passed")').order('assigned_at', { ascending: false }),
      supabase.from('student_textbooks').select('*').eq('student_id', sid).not('status', 'in', '("checked")').order('assigned_at', { ascending: false }),
      supabase.from('concepts').select('*').order('concept_order'),
      supabase.from('progress_checks').select('*').eq('student_id', sid),
    ])
    if (ssData) {
      setTodaySession(ssData)
      const { data: noteData } = await supabase
        .from('learning_notes').select('*').eq('session_id', ssData.id).single()
      if (noteData) setTodayNote(noteData)
    }
    if (wsData) setWorksheets(wsData)
    if (tbData) setTextbooks(tbData)
    if (cData) setConcepts(cData)
    if (pcData) setProgressChecks(pcData)
  }

  // 오늘 진도 텍스트 생성 (교재별)
  function buildProgressText(tb: StudentTextbook): string | null {
    if (!tb.grade) return null
    const targetCount = tb.textbook_type === '개념서' ? 1 : tb.textbook_type === '유형서' ? 2 : 3
    const tbConcepts = concepts.filter(c =>
      c.grade === tb.grade && (tb.semester ? c.semester === tb.semester : true)
    )
    // 오늘 수업에서 진도 나간 개념 (progress_checks 기준)
    const todayChecked = progressChecks.filter(p =>
      p.check_count >= targetCount &&
      tbConcepts.some(c => c.id === p.concept_id)
    )
    if (todayChecked.length === 0) return null

    const checkedConcepts = tbConcepts
      .filter(c => todayChecked.some(p => p.concept_id === c.id))
      .sort((a, b) => a.concept_order - b.concept_order)

    if (tb.textbook_type === '개념서') {
      // 개념서: 교재명 · 대단원-중단원-첫개념~마지막개념
      const first = checkedConcepts[0]
      const last = checkedConcepts[checkedConcepts.length - 1]
      const chNum = first.chapter.match(/^(\d+)/)?.[1] ??
        ({ 'Ⅰ':'1','Ⅱ':'2','Ⅲ':'3','Ⅳ':'4','Ⅴ':'5','Ⅵ':'6' } as Record<string,string>)[first.chapter[0]] ?? '?'
      const subNum = first.sub_chapter.match(/^(\d+)/)?.[1] ?? '?'
      const range = first.concept_name === last.concept_name
        ? first.concept_name
        : `${first.concept_name}~${last.concept_name}`
      return `${chNum}-${subNum} ${range}`
    } else {
      // 유형서/심화서: 대단원명
      const chapters = [...new Set(checkedConcepts.map(c => c.chapter))]
      return chapters.join(', ')
    }
  }

  async function handleVideoOpen(videoUrl: string, idx: number) {
    if (!todaySession || !studentId) return
    const now = new Date().toISOString()
    if (!todayNote) {
      const { data } = await supabase.from('learning_notes').insert({
        student_id: studentId, session_id: todaySession.id,
        attendance: '정시', worksheet_submitted: false,
        textbook_submitted: false, workbook_done: false,
        video_started_at: now,
      }).select().single()
      if (data) setTodayNote(data)
    } else if (!todayNote.video_started_at) {
      await supabase.from('learning_notes').update({ video_started_at: now }).eq('id', todayNote.id)
      setTodayNote({ ...todayNote, video_started_at: now })
    }
    const { data: existingLog } = await supabase
      .from('video_watch_logs').select('id, watch_seconds')
      .eq('student_id', studentId).eq('session_id', todaySession.id).eq('video_url', videoUrl).single()
    if (!existingLog) {
      await supabase.from('video_watch_logs').insert({
        student_id: studentId, session_id: todaySession.id,
        video_url: videoUrl, watch_seconds: 0, started_at: now, last_active_at: now,
      })
    } else {
      await supabase.from('video_watch_logs').update({ last_active_at: now }).eq('id', existingLog.id)
    }
    const startTime = Date.now()
    const videoWindow = window.open(videoUrl, '_blank')
    const checkClosed = setInterval(async () => {
      if (videoWindow?.closed) {
        clearInterval(checkClosed)
        const watchedSec = Math.round((Date.now() - startTime) / 1000)
        const { data: log } = await supabase
          .from('video_watch_logs').select('id, watch_seconds')
          .eq('student_id', studentId).eq('session_id', todaySession!.id).eq('video_url', videoUrl).single()
        if (log) {
          await supabase.from('video_watch_logs').update({
            watch_seconds: (log.watch_seconds ?? 0) + watchedSec,
            last_active_at: new Date().toISOString(),
          }).eq('id', log.id)
        }
      }
    }, 1000)
  }

  async function handleVideoComplete() {
    if (!todayNote || !studentId) return
    const now = new Date().toISOString()
    await supabase.from('learning_notes').update({ video_completed_at: now }).eq('id', todayNote.id)
    setTodayNote({ ...todayNote, video_completed_at: now })
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!student) return null

  const videoUrls = todaySession?.video_url
    ? todaySession.video_url.split('\n').filter(Boolean)
    : []
  const hasVideoTask = videoUrls.length > 0
  const videoStarted = !!todayNote?.video_started_at
  const videoCompleted = !!todayNote?.video_completed_at

  // 오늘 배부된 과제 섹션 표시 여부
  const hasTodayTask = todaySession && (
    todaySession.progress_content ||
    todaySession.hw_textbook_name ||
    todaySession.hw_worksheet_range ||
    todaySession.daily_test_unit
  )

  // hw_textbook_page를 교재별로 파싱 (슬래시 구분)
  const hwPageMap: Record<string, string> = {}
  if (todaySession?.hw_textbook_page) {
    todaySession.hw_textbook_page.split('/').forEach(part => {
      const trimmed = part.trim()
      // "교재명 · 단원 · p.xx" 형식에서 교재명 추출
      const bookName = trimmed.split('·')[0]?.trim()
      if (bookName) hwPageMap[bookName] = trimmed
    })
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="오늘 학습" subtitle={`${student.name} 학생`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 학생 프로필 */}
        <div className="rounded-2xl p-4 flex items-center gap-4" style={{ background: '#FAECE7' }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: '#F5C4B3' }}>
            <span className="text-xl font-black" style={{ color: '#712B13' }}>{student.name[0]}</span>
          </div>
          <div>
            <p className="font-black text-base" style={{ color: '#712B13' }}>{student.name}</p>
            <p className="text-xs mt-0.5" style={{ color: '#993C1D' }}>{student.school} · {student.grade}</p>
            <p className="text-xs mt-0.5" style={{ color: '#993C1D', opacity: 0.7 }}>{todayStr}</p>
          </div>
        </div>

        {/* ── 오늘 학습 내용 및 과제 ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

          {/* 메인 헤더 */}
          <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #efefef' }}>
            <i className="ti ti-notebook" style={{ fontSize: 16, color: '#993C1D' }} />
            <h3 className="text-sm font-bold text-gray-700">오늘 학습 내용 및 과제</h3>
          </div>

          {/* ─── 학습 내용 서브헤더 ─── */}
          <div className="px-4 py-2 flex items-center gap-1.5" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
            <i className="ti ti-books" style={{ fontSize: 13, color: '#F5C4B3' }} />
            <span className="text-xs font-bold" style={{ color: '#993C1D' }}>학습 내용</span>
          </div>

          {/* 오늘 진도 */}
          {(() => {
            const myTBs = textbooks.filter(t => t.grade)
            const progressLines = myTBs
              .map(tb => ({ tb, text: buildProgressText(tb) }))
              .filter(x => x.text)
            const hasFallback = progressLines.length === 0 && todaySession?.progress_content
            if (progressLines.length === 0 && !hasFallback) {
              return (
                <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-50">
                  <span className="text-[10px] text-gray-300">오늘 진도</span>
                  <span className="text-xs text-gray-300">— 기록 없음</span>
                </div>
              )
            }
            return (
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-[10px] text-gray-400 mb-2">오늘 진도</p>
                {hasFallback ? (
                  <p className="text-sm font-bold text-gray-800">{todaySession!.progress_content}</p>
                ) : (
                  <div className="space-y-2.5">
                    {progressLines.map(({ tb, text }) => (
                      <div key={tb.id}>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>
                            {tb.textbook_type === '개념서' ? '개념' : tb.textbook_type === '유형서' ? '유형' : '심화'}
                          </span>
                          <span className="text-[11px] text-gray-400">{tb.textbook_name}</span>
                        </div>
                        <p className="text-sm font-bold text-gray-800">{text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}

          {/* 데일리 테스트 */}
          {todaySession?.daily_test_unit ? (
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <div>
                <p className="text-[10px] text-gray-400 mb-0.5">데일리 테스트</p>
                <p className="text-sm font-bold text-gray-800">{todaySession.daily_test_unit}</p>
              </div>
              {todaySession.daily_test_score != null && (
                <span className="text-sm font-black" style={{
                  color: todaySession.daily_test_score >= 90 ? '#27500A' :
                  todaySession.daily_test_score >= 70 ? '#633806' : '#991b1b' }}>
                  {todaySession.daily_test_score}점
                </span>
              )}
            </div>
          ) : (
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-[10px] text-gray-300">데일리 테스트</span>
              <span className="text-xs text-gray-300">— 기록 없음</span>
            </div>
          )}

          {/* ─── 오늘 과제 서브헤더 ─── */}
          <div className="px-4 py-2 flex items-center gap-1.5" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0', borderTop: '1px solid #efefef' }}>
            <i className="ti ti-clipboard-check" style={{ fontSize: 13, color: '#F5C4B3' }} />
            <span className="text-xs font-bold" style={{ color: '#993C1D' }}>오늘 과제</span>
          </div>

          {/* 교재 과제 */}
          {todaySession?.hw_textbook_name ? (() => {
            const bookNames = todaySession.hw_textbook_name.split(',').map(s => s.trim())
            return (
              <div className="border-b border-gray-50">
                <div className="px-4 pt-3 pb-1">
                  <p className="text-[10px] text-gray-400 mb-2">교재 과제</p>
                  <div className="space-y-2">
                    {bookNames.map((name, i) => {
                      const pageEntry = todaySession.hw_textbook_page
                        ? todaySession.hw_textbook_page.split('/').find(p => p.includes(name))
                        : null
                      const pageOnly = pageEntry ? pageEntry.split('·').slice(-1)[0]?.trim() : null
                      return (
                        <div key={i} className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-800">{name}</p>
                          {pageOnly && <p className="text-xs text-gray-400">{pageOnly}</p>}
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div className="h-3" />
              </div>
            )
          })() : (
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-[10px] text-gray-300">교재 과제</span>
              <span className="text-xs text-gray-300">— 없음</span>
            </div>
          )}

          {/* 학습지 과제 */}
          {todaySession?.hw_worksheet_range ? (
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-[10px] text-gray-400 mb-1">학습지 과제</p>
              <p className="text-sm font-bold text-gray-800">{todaySession.hw_worksheet_range}</p>
            </div>
          ) : (
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-[10px] text-gray-300">학습지 과제</span>
              <span className="text-xs text-gray-300">— 없음</span>
            </div>
          )}

          {/* 영상 과제 */}
          {hasVideoTask ? (
            <div>
              <div className="px-4 pt-3 pb-1">
                <p className="text-[10px] text-gray-400 mb-2">영상 과제 <span className="text-gray-300">{videoUrls.length}개</span></p>
                <div className="space-y-2">
                  {videoUrls.map((url, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: '#FAECE7', color: '#993C1D' }}>{idx + 1}</div>
                      <p className="text-xs text-gray-400 flex-1 truncate">{url}</p>
                      <button onClick={() => handleVideoOpen(url, idx)}
                        className="px-3 py-1 rounded-lg text-xs font-bold shrink-0"
                        style={{ background: '#F5C4B3', color: '#712B13' }}>
                        보기
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {videoStarted && (
                <div className="px-4 py-2 flex justify-end">
                  {!videoCompleted ? (
                    <button onClick={handleVideoComplete}
                      className="px-3 py-1.5 rounded-lg text-xs font-bold"
                      style={{ background: '#F5C4B3', color: '#712B13' }}>
                      모두 시청 완료
                    </button>
                  ) : (
                    <span className="text-xs font-bold px-3 py-1 rounded-full"
                      style={{ background: '#F5C4B3', color: '#712B13' }}>시청 완료</span>
                  )}
                </div>
              )}
              <div className="h-2" />
            </div>
          ) : (
            <div className="px-4 py-3 flex items-center gap-2">
              <span className="text-[10px] text-gray-300">영상 과제</span>
              <span className="text-xs text-gray-300">— 없음</span>
            </div>
          )}
        </div>

        {/* ── 학습지 현황 (최근 6개월) ── */}
        {(() => {
          const sixMonthsAgo = new Date()
          sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
          const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]
          const recentWS = worksheets.filter((w) => w.assigned_at >= sixMonthsAgoStr)
          if (recentWS.length === 0) return null
          const scored = recentWS.filter((w) => w.score != null)
          const avgScore = scored.length > 0
            ? Math.round(scored.reduce((s, w) => s + (w.score ?? 0), 0) / scored.length)
            : null
          const passedCount = recentWS.filter((w) => w.status === 'passed').length
          const passRate = Math.round(passedCount / recentWS.length * 100)
          const levelMap: Record<number, number> = {}
          recentWS.forEach((w) => { levelMap[w.current_level] = (levelMap[w.current_level] ?? 0) + 1 })
          const levels = Object.entries(levelMap).sort((a, b) => Number(a[0]) - Number(b[0]))
          const maxCount = Math.max(...levels.map(([, c]) => c))
          const maxLevel = Math.max(...recentWS.map((w) => w.current_level))
          return (
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
                  <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                    <p className="text-[10px] text-gray-400 mb-0.5">총 학습지</p>
                    <p className="text-base font-bold text-gray-800">{recentWS.length}<span className="text-[10px] font-normal text-gray-400 ml-0.5">개</span></p>
                  </div>
                  <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                    <p className="text-[10px] text-gray-400 mb-0.5">통과율</p>
                    <p className="text-base font-bold text-gray-800">{passRate}<span className="text-[10px] font-normal text-gray-400 ml-0.5">%</span></p>
                  </div>
                  <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                    <p className="text-[10px] text-gray-400 mb-0.5">평균점수</p>
                    <p className="text-base font-bold text-gray-800">{avgScore ?? '-'}<span className="text-[10px] font-normal text-gray-400 ml-0.5">점</span></p>
                  </div>
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
          )
        })()}

        {/* ── 교재 진도 현황 ── */}
        {(() => {
          const TYPE_ORDER: Record<string, number> = { '개념서': 0, '유형서': 1, '심화서': 2, '연산서': 3 }
          const TYPE_STYLE: Record<string, { dot: string; fill: string; label: string }> = {
            '개념서': { dot: '#EF9F27', fill: '#FAEEDA', label: '개념' },
            '유형서': { dot: '#639922', fill: '#EAF3DE', label: '유형' },
            '심화서': { dot: '#dc2626', fill: '#fee2e2', label: '심화' },
            '연산서': { dot: '#7c3aed', fill: '#ede9fe', label: '연산' },
          }
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
                  .map((tb) => {
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
                          {chapters.map((ch) => {
                            const chConcepts = tbConcepts.filter(c => c.chapter === ch)
                            return (
                              <div key={ch}>
                                <p className="text-[10px] text-gray-500 mb-1">{ch}</p>
                                <div className="flex flex-wrap gap-1">
                                  {chConcepts.map((c) => {
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
                          <div className="flex items-center gap-1">
                            <div style={{ width:10, height:10, borderRadius:2, background: style.dot }} />
                            <span className="text-[9px] text-gray-500">완료</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div style={{ width:10, height:10, borderRadius:2, background: style.fill, border: `1px solid ${style.dot}80` }} />
                            <span className="text-[9px] text-gray-500">진행중</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <div style={{ width:10, height:10, borderRadius:2, background: '#f3f0ea', border: '1px solid #e5d5c5' }} />
                            <span className="text-[9px] text-gray-500">미진도</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })()}

        {/* 과제 없음 */}
        {!todaySession && !hasVideoTask && worksheets.length === 0 && textbooks.length === 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <i className="ti ti-circle-check" style={{ fontSize: 36, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
            <p className="text-sm font-bold text-gray-600">오늘 수업 내용이 없어요</p>
            <p className="text-xs text-gray-400 mt-1">선생님이 수업일지를 작성하면 여기에 나타나요</p>
          </div>
        )}

      </div>
    </div>
  )
}
