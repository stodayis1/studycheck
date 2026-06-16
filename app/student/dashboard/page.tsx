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
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [examPreps, setExamPreps] = useState<any[]>([])
  const [feedbacks, setFeedbacks] = useState<any[]>([])
  const [replies, setReplies] = useState<any[]>([])
  const [replyContent, setReplyContent] = useState<Record<string, string>>({})
  const [replyImages, setReplyImages] = useState<Record<string, File[]>>({})
  const [replyImagePreviews, setReplyImagePreviews] = useState<Record<string, string[]>>({})
  const [savingReply, setSavingReply] = useState<string | null>(null)

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
    // 최근 14일치 날짜 범위
    const fourteenDaysAgo = new Date()
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
    const fromStr = fourteenDaysAgo.toISOString().split('T')[0]

    const [{ data: ssData }, { data: wsData }, { data: tbData }, { data: cData }, { data: pcData }, { data: fbData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', sid)
        .gte('session_date', fromStr).order('session_date', { ascending: false }),
      supabase.from('student_worksheets').select('*').eq('student_id', sid).not('status', 'in', '("passed")').order('assigned_at', { ascending: false }),
      supabase.from('student_textbooks').select('*').eq('student_id', sid).not('status', 'in', '("checked")').order('assigned_at', { ascending: false }),
      supabase.from('concepts').select('*').order('concept_order'),
      supabase.from('progress_checks').select('*').eq('student_id', sid),
      supabase.from('feedbacks').select('*').eq('student_id', sid).order('created_at', { ascending: false }).limit(20),
    ])
    if (ssData && ssData.length > 0) {
      setSessions(ssData)
      setTodaySession(ssData.find(s => s.session_date === todayStr) ?? null)
      const ids = ssData.map(s => s.id)
      const { data: noteData } = await supabase
        .from('learning_notes').select('*').in('session_id', ids)
      if (noteData) setNotes(noteData)
    }
    if (wsData) setWorksheets(wsData)
    if (tbData) setTextbooks(tbData)
    if (cData) setConcepts(cData)
    if (pcData) setProgressChecks(pcData)
    if (fbData) {
      setFeedbacks(fbData)
      const fbIds = fbData.map((f: any) => f.id)
      if (fbIds.length > 0) {
        const { data: rpData } = await supabase
          .from('feedback_replies')
          .select('*')
          .in('feedback_id', fbIds)
          .order('created_at', { ascending: true })
        if (rpData) setReplies(rpData)
      }
    }

    // 시험대비 (이너프원) - 4주 이내 시험 있는 것만
    const today = new Date()
    const fourWeeksLater = new Date(today)
    fourWeeksLater.setDate(today.getDate() + 35)
    const maxDate = fourWeeksLater.toISOString().split('T')[0]
    const todayDate = today.toISOString().split('T')[0]
    const { data: epData } = await supabase
      .from('student_exam_prep')
      .select('*, inner_enough(*)')
      .eq('student_id', sid)
      .or(`exam_date.is.null,and(exam_date.lte.${maxDate},exam_date.gte.${todayDate})`)
      .neq('status', 'done')
      .order('exam_date', { ascending: true, nullsFirst: false })
    if (epData) setExamPreps(epData)
  }

  // 답장 저장 함수
  async function handleSendReply(feedbackId: string) {
    const content = (replyContent[feedbackId] || '').trim()
    const images = replyImages[feedbackId] || []
    if (!content && images.length === 0) return
    if (!student || !studentId) return

    setSavingReply(feedbackId)

    // 사진 업로드
    const imageUrls: string[] = []
    for (const file of images) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const fileName = `${studentId}/reply_${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('feedback-images').upload(fileName, file)
      if (!upErr) {
        const { data: pub } = supabase.storage.from('feedback-images').getPublicUrl(fileName)
        if (pub?.publicUrl) imageUrls.push(pub.publicUrl)
      }
    }

    const { data: newReply } = await supabase.from('feedback_replies').insert({
      feedback_id: feedbackId,
      sender_type: 'student',
      sender_name: student.name,
      content: content || '(사진)',
      images: imageUrls.length > 0 ? imageUrls : null,
      is_read: false,
    }).select().single()

    if (newReply) {
      setReplies((prev) => [...prev, newReply])
      setReplyContent((prev) => ({ ...prev, [feedbackId]: '' }))
      setReplyImages((prev) => ({ ...prev, [feedbackId]: [] }))
      setReplyImagePreviews((prev) => ({ ...prev, [feedbackId]: [] }))
    }
    setSavingReply(null)
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
      const chNum = first.chapter?.match(/^(\d+)/)?.[1] ??
        (first.chapter ? ({ 'Ⅰ':'1','Ⅱ':'2','Ⅲ':'3','Ⅳ':'4','Ⅴ':'5','Ⅵ':'6' } as Record<string,string>)[first.chapter[0]] : null) ?? '?'
      const subNum = first.sub_chapter?.match(/^(\d+)/)?.[1] ?? '?'
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

  const DAYS = ['일','월','화','수','목','금','토']
  const selectedSession = sessions.find(s => s.session_date === (selectedDate ?? sessions[0]?.session_date))

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
          </div>
        </div>

        {/* 날짜 탭 */}
        {sessions.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {sessions.map(session => {
              const d = new Date(session.session_date)
              const isToday = session.session_date === todayStr
              const isSelected = (selectedDate ?? sessions[0]?.session_date) === session.session_date
              return (
                <button key={session.session_date}
                  onClick={() => setSelectedDate(session.session_date)}
                  className="flex flex-col items-center px-3 py-2 rounded-xl shrink-0 transition-all"
                  style={isSelected
                    ? { background: '#F5C4B3', color: '#712B13' }
                    : { background: 'white', color: '#9ca3af', border: '1px solid #f0f0f0' }}>
                  <span className="text-[10px] font-semibold">{DAYS[d.getDay()]}요일</span>
                  <span className="text-sm font-black">{d.getMonth()+1}/{d.getDate()}</span>
                  {isToday && (
                    <span className="text-[9px] font-bold mt-0.5" style={{ color: isSelected ? '#712B13' : '#993C1D' }}>오늘</span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* 선택된 날짜 과제 카드 */}
        {selectedSession ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* 학습 내용 서브헤더 */}
            {(selectedSession.progress_content || buildProgressText(textbooks.filter(t => t.grade)[0])) && (
              <div>
                <div className="px-4 py-2 flex items-center gap-1.5" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-books" style={{ fontSize: 13, color: '#F5C4B3' }} />
                  <span className="text-xs font-bold" style={{ color: '#993C1D' }}>학습 내용</span>
                </div>
                <div className="px-4 py-3">
                  {(() => {
                    const myTBs = textbooks.filter(t => t.grade)
                    const progressLines = myTBs.map(tb => ({ tb, text: buildProgressText(tb) })).filter(x => x.text)
                    if (progressLines.length > 0) {
                      return (
                        <div className="space-y-2">
                          {progressLines.map(({ tb, text }) => (
                            <div key={tb.id} className="flex items-start gap-2">
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5"
                                style={{ background: '#FAECE7', color: '#993C1D' }}>
                                {tb.textbook_type === '개념서' ? '개념' : tb.textbook_type === '유형서' ? '유형' : '심화'}
                              </span>
                              <div>
                                <p className="text-[11px] text-gray-400">{tb.textbook_name}</p>
                                <p className="text-sm font-bold text-gray-800">{text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    return <p className="text-sm font-semibold text-gray-800">{selectedSession.progress_content}</p>
                  })()}
                  {selectedSession.daily_test_unit && (
                    <div className="mt-2.5 flex items-center gap-2 pt-2" style={{ borderTop: '1px solid #f5f5f5' }}>
                      <span className="text-[10px] text-gray-400">데일리 테스트</span>
                      <span className="text-xs font-semibold text-gray-700">{selectedSession.daily_test_unit}</span>
                      {selectedSession.daily_test_score != null && (
                        <span className="text-xs font-black ml-auto" style={{
                          color: selectedSession.daily_test_score >= 90 ? '#27500A' :
                          selectedSession.daily_test_score >= 70 ? '#633806' : '#991b1b'
                        }}>{selectedSession.daily_test_score}점</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 오늘 과제 서브헤더 */}
            <div className="px-4 py-2 flex items-center gap-1.5"
              style={{ background: '#fafafa', borderTop: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0' }}>
              <i className="ti ti-clipboard-check" style={{ fontSize: 13, color: '#F5C4B3' }} />
              <span className="text-xs font-bold" style={{ color: '#993C1D' }}>과제</span>
            </div>

            {/* 교재 과제 */}
            {selectedSession.hw_textbook_name ? (() => {
              const bookNames = selectedSession.hw_textbook_name!.split(',').map(s => s.trim())
              return (
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-[10px] text-gray-400 mb-1.5">교재 과제</p>
                  <div className="space-y-1.5">
                    {bookNames.map((name, i) => {
                      const pageEntry = selectedSession.hw_textbook_page
                        ? selectedSession.hw_textbook_page.split('/').find(p => p.includes(name))
                        : null
                      const pageOnly = pageEntry ? pageEntry.split('·').slice(-1)[0]?.trim() : null
                      return (
                        <div key={i} className="flex items-center justify-between">
                          <p className="text-sm font-bold text-gray-800">{name}</p>
                          {pageOnly && <span className="text-xs text-gray-400">{pageOnly}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })() : (
              <div className="px-4 py-3 border-b border-gray-50">
                <span className="text-[10px] text-gray-300">교재 과제 — 없음</span>
              </div>
            )}

            {/* 학습지 과제 */}
            {selectedSession.hw_worksheet_range ? (
              <div className="px-4 py-3 border-b border-gray-50">
                <p className="text-[10px] text-gray-400 mb-1">학습지 과제</p>
                <p className="text-sm font-bold text-gray-800">{selectedSession.hw_worksheet_range}</p>
              </div>
            ) : (
              <div className="px-4 py-3 border-b border-gray-50">
                <span className="text-[10px] text-gray-300">학습지 과제 — 없음</span>
              </div>
            )}

            {/* 영상 과제 */}
            {(() => {
              const videoUrls = selectedSession.video_url
                ? selectedSession.video_url.split('\n').filter(Boolean)
                : []
              const isToday = selectedSession.session_date === todayStr
              if (videoUrls.length === 0) return (
                <div className="px-4 py-3">
                  <span className="text-[10px] text-gray-300">영상 과제 — 없음</span>
                </div>
              )
              return (
                <div className="px-4 py-3">
                  <p className="text-[10px] text-gray-400 mb-2">영상 과제 {videoUrls.length}개</p>
                  <div className="space-y-2">
                    {videoUrls.map((url, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>{idx + 1}</div>
                        <p className="text-xs text-gray-400 flex-1 truncate">{url}</p>
                        <button onClick={() => handleVideoOpen(url, idx)}
                          className="px-3 py-1 rounded-lg text-xs font-bold shrink-0"
                          style={{ background: '#F5C4B3', color: '#712B13' }}>보기</button>
                      </div>
                    ))}
                  </div>
                  {isToday && todayNote?.video_started_at && (
                    <div className="mt-2 flex justify-end">
                      {!todayNote.video_completed_at ? (
                        <button onClick={handleVideoComplete}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold"
                          style={{ background: '#F5C4B3', color: '#712B13' }}>모두 시청 완료</button>
                      ) : (
                        <span className="text-xs font-bold px-3 py-1 rounded-full"
                          style={{ background: '#F5C4B3', color: '#712B13' }}>시청 완료</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <i className="ti ti-circle-check" style={{ fontSize: 36, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
            <p className="text-sm font-bold text-gray-600">최근 수업 기록이 없어요</p>
          </div>
        )}

        {/* 시험대비 현황 카드 - 독립 표시 (4주 이내 시험) */}
        {examPreps.length > 0 && (() => {
          const nearestExam = examPreps[0]
          const diffDays = Math.ceil((new Date(nearestExam.exam_date).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
          return (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden"
              style={{ borderColor: '#F5C4B3' }}>
              <div className="px-4 py-3 flex items-center gap-2"
                style={{ background: '#FFF5F2', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-pencil-check" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold" style={{ color: '#712B13' }}>시험대비 현황</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-auto"
                  style={{ background: '#F5C4B3', color: '#712B13' }}>
                  D-{diffDays} · {nearestExam.exam_date}
                </span>
              </div>
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
                    <div key={ep.id} className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <div>
                          <p className="text-xs font-bold text-gray-800">{ie.unit_name}</p>
                          <p className="text-[10px] text-gray-400">{ie.sub_unit_name} · {ie.problem_count}문항</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {ep.score != null && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{
                                background: ep.score >= 90 ? '#EAF3DE' : ep.score >= 70 ? '#FAEEDA' : '#fee2e2',
                                color: ep.score >= 90 ? '#27500A' : ep.score >= 70 ? '#633806' : '#991b1b'
                              }}>{ep.score}점</span>
                          )}
                          <span className="text-xs font-black"
                            style={{ color: pct >= 100 ? '#27500A' : pct > 0 ? '#993C1D' : '#9ca3af' }}>
                            {pct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                        <div className="h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%`, background: pct >= 100 ? '#639922' : '#EF9F27' }} />
                      </div>
                      <div className="flex gap-1 mt-1.5">
                        {Array.from({ length: totalSteps }).map((_, i) => (
                          <div key={i} className="flex-1 h-1 rounded-full"
                            style={{ background: i < (ep.progress_step || 0) ? '#639922' : '#f3f4f6' }} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        {/* 선생님 알림장 + 답장 */}
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
                let fbImages: string[] = []
                if (fb.ai_message) {
                  try {
                    const parsed = JSON.parse(fb.ai_message)
                    if (parsed && Array.isArray(parsed.images)) fbImages = parsed.images
                  } catch {}
                }
                const dateStr = new Date(fb.created_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
                const myReplies = replies.filter((r) => r.feedback_id === fb.id)
                const curContent = replyContent[fb.id] || ''
                const curImages = replyImages[fb.id] || []
                const curPreviews = replyImagePreviews[fb.id] || []
                return (
                  <div key={fb.id} className="px-4 py-3">
                    {/* 선생님 메시지 */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[11px] font-semibold" style={{ color: '#993C1D' }}>
                        <i className="ti ti-user" style={{ fontSize: 11, marginRight: 4 }} />
                        {fb.teacher_name ?? '선생님'}
                      </p>
                      <p className="text-[10px] text-gray-400">{dateStr}</p>
                    </div>
                    <div className="rounded-2xl px-3 py-2.5" style={{ background: '#FFF5F2' }}>
                      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{fb.content}</p>
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

                    {/* 답장 스레드 */}
                    {myReplies.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {myReplies.map((rp) => {
                          const isMine = rp.sender_type === 'student'
                          const rpImages: string[] = Array.isArray(rp.images) ? rp.images : []
                          const rpDate = new Date(rp.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          return (
                            <div key={rp.id} className={isMine ? 'flex justify-end' : 'flex justify-start'}>
                              <div className="max-w-[85%]">
                                <p className={`text-[10px] mb-1 ${isMine ? 'text-right' : 'text-left'} text-gray-400`}>
                                  {isMine ? '나' : (rp.sender_name ?? '선생님')} · {rpDate}
                                </p>
                                <div className="rounded-2xl px-3 py-2"
                                  style={isMine
                                    ? { background: '#9FE1CB', color: '#085041' }
                                    : { background: '#f3f4f6', color: '#374151' }}>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{rp.content}</p>
                                  {rpImages.length > 0 && (
                                    <div className="flex gap-1.5 flex-wrap mt-2">
                                      {rpImages.map((url, i) => (
                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                          className="block w-16 h-16 rounded-lg overflow-hidden border border-white/50">
                                          <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* 답장 입력 */}
                    <div className="mt-3 rounded-2xl p-2.5" style={{ background: '#f9fafb', border: '1px solid #f3f4f6' }}>
                      <textarea value={curContent}
                        onChange={(e) => setReplyContent((p) => ({ ...p, [fb.id]: e.target.value }))}
                        placeholder="선생님께 답장 쓰기..."
                        rows={2}
                        className="w-full px-2 py-1.5 rounded-lg text-sm bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#9FE1CB] resize-none" />

                      {curPreviews.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap mt-2">
                          {curPreviews.map((url, idx) => (
                            <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                              <img src={url} alt="" className="w-full h-full object-cover" />
                              <button type="button" onClick={() => {
                                setReplyImages((p) => ({ ...p, [fb.id]: (p[fb.id] || []).filter((_, i) => i !== idx) }))
                                setReplyImagePreviews((p) => ({ ...p, [fb.id]: (p[fb.id] || []).filter((_, i) => i !== idx) }))
                              }}
                                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center justify-between mt-2">
                        {curImages.length < 3 ? (
                          <label className="text-[11px] font-semibold cursor-pointer px-2 py-1 rounded-lg flex items-center gap-1"
                            style={{ background: 'white', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                            <i className="ti ti-camera" style={{ fontSize: 13 }} /> 사진
                            <input type="file" accept="image/*" multiple className="hidden"
                              onChange={(e) => {
                                const files = Array.from(e.target.files ?? [])
                                const remaining = 3 - curImages.length
                                const toAdd = files.slice(0, remaining)
                                setReplyImages((p) => ({ ...p, [fb.id]: [...(p[fb.id] || []), ...toAdd] }))
                                toAdd.forEach((file) => {
                                  const reader = new FileReader()
                                  reader.onload = () => setReplyImagePreviews((p) => ({ ...p, [fb.id]: [...(p[fb.id] || []), reader.result as string] }))
                                  reader.readAsDataURL(file)
                                })
                                e.target.value = ''
                              }} />
                          </label>
                        ) : <span className="text-[10px] text-gray-400">사진 최대 3장</span>}

                        <button onClick={() => handleSendReply(fb.id)}
                          disabled={(!curContent.trim() && curImages.length === 0) || savingReply === fb.id}
                          className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
                          style={{ background: '#9FE1CB', color: '#085041' }}>
                          {savingReply === fb.id ? '전송 중...' : '✉️ 답장 보내기'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 레벨 학습지 전체 현황 */}
        {worksheets.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #efefef' }}>
              <i className="ti ti-file-text" style={{ fontSize: 16, color: '#993C1D' }} />
              <h3 className="text-sm font-bold text-gray-700">레벨 학습지 전체 현황</h3>
              <span className="text-xs text-gray-400 ml-auto">{worksheets.length}개</span>
            </div>
            <div className="divide-y divide-gray-50">
              {worksheets.map((w) => {
                const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                return (
                  <div key={w.id} className="px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className={cx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>{cfg.label}</span>
                      {w.worksheet_type === 'similar' && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                          style={{ background: '#FFF5F2', color: '#712B13' }}>오답유사</span>
                      )}
                      <span className="text-[10px] font-semibold ml-auto" style={{ color: '#9ca3af' }}>{w.current_level}레벨</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-gray-900">
                        {w.grade_level} {w.unit}
                        {w.unit_name && <span className="text-xs font-normal text-gray-400 ml-1">{w.unit_name}</span>}
                      </p>
                      {w.score != null && (
                        <span className="text-sm font-black shrink-0" style={{
                          color: w.score >= 85 ? '#27500A' : w.score >= 70 ? '#633806' : '#991b1b'
                        }}>{w.score}점</span>
                      )}
                    </div>
                    {w.memo && <p className="text-[10px] mt-0.5" style={{ color: '#9ca3af' }}>{w.memo}</p>}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 교재 진도 현황 */}
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
                {myTBs.sort((a, b) => (TYPE_ORDER[a.textbook_type] ?? 9) - (TYPE_ORDER[b.textbook_type] ?? 9))
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
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ background: style.dot, color: '#fff' }}>{style.label}</span>
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
