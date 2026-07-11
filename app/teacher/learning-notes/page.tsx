'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
  wise_step: string
}

interface Schedule {
  id: string
  student_id: string
  day_of_week: string
  start_time: string
  periods: number
}

interface ClassSession {
  id: string
  student_id: string
  session_date: string
  session_type: string
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
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  textbook_page: string | null
  workbook_done: boolean
  memo: string | null
  video_started_at: string | null
  video_completed_at: string | null
  achievement?: number | null
  score_pct?: number | null
  extra_class?: boolean | null
  extra_time?: string | null
}

interface Feedback {
  id: string
  student_id: string
  teacher_name: string
  content: string
  ai_message: string | null
  created_at: string
}

const DAYS = ['월','화','수','목','금','토']
const TIMES = ['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00']
const ACHIEVEMENT_OPTIONS = [
  { label: '100%', value: 100, color: 'text-green-600', bg: 'bg-green-50 border-green-300' },
  { label: '70%',  value: 70,  color: 'text-gray-800',  bg: 'bg-blue-50 border-blue-300' },
  { label: '50%',  value: 50,  color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-300' },
  { label: '0%',   value: 0,   color: 'text-red-500',   bg: 'bg-red-50 border-red-300' },
]

const GRADE_COLORS: Record<string, { bg: string; border: string; sub: string }> = {
  '초1': { bg: '#fffde7', border: '#ffe082', sub: '#f9a825' },
  '초2': { bg: '#fff9c4', border: '#ffd54f', sub: '#f57f17' },
  '초3': { bg: '#fff176', border: '#ffca28', sub: '#e65100' },
  '초4': { bg: '#ffe0b2', border: '#ffb74d', sub: '#e65100' },
  '초5': { bg: '#ffcc80', border: '#ffa726', sub: '#bf360c' },
  '초6': { bg: '#ffb300', border: '#ff8f00', sub: '#bf360c' },
  '중1': { bg: '#e8f5e9', border: '#a5d6a7', sub: '#2e7d32' },
  '중2': { bg: '#c8e6c9', border: '#66bb6a', sub: '#1b5e20' },
  '중3': { bg: '#a5d6a7', border: '#43a047', sub: '#1b5e20' },
  '고1': { bg: '#ffebee', border: '#ef9a9a', sub: '#c62828' },
  '고2': { bg: '#ffcdd2', border: '#e57373', sub: '#b71c1c' },
  '고3': { bg: '#ef9a9a', border: '#e53935', sub: '#7f0000' },
  'default': { bg: '#f5f5f5', border: '#bdbdbd', sub: '#757575' },
}

export default function TeacherLearningNotesPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'today' | 'schedule' | 'progress'>('today')

  // 진도 현황
  const [progressStudent, setProgressStudent] = useState<Student | null>(null)
  const [elementaryTextbooks, setElementaryTextbooks] = useState<any[]>([])
  const [studentProgress, setStudentProgress] = useState<any[]>([])
  const [progressLoading, setProgressLoading] = useState(false)
  const [savingProgress, setSavingProgress] = useState(false)
  const [noteTab, setNoteTab] = useState<'basic' | 'daily' | 'hw'>('basic')

  // 수업일지 입력 모달
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [noteStudent, setNoteStudent] = useState<Student | null>(null)
  const [noteSession, setNoteSession] = useState<ClassSession | null>(null)

  // 수업일지 필드
  const [noteProgress, setNoteProgress] = useState('')
  // 개념DB 기반 진도 선택
  const [concepts, setConcepts] = useState<any[]>([])
  const [studentTextbooks, setStudentTextbooks] = useState<any[]>([])
  const [examPreps, setExamPreps] = useState<any[]>([])
  // 교재별 독립 진도 선택 (tbId → { chapter, subChapters, conceptIds, lastIdx })
  const [noteProgressByTB, setNoteProgressByTB] = useState<Record<string, {
    chapter: string; subChapters: string[]; conceptIds: string[]; lastIdx: number
  }>>({})
  // 현재 선택된 교재 ID (펼쳐진 교재)
  const [noteActiveTBId, setNoteActiveTBId] = useState<string>('')
  // 하위 호환용 (저장 시 사용)
  const [noteProgressType, setNoteProgressType] = useState<'개념서'|'유형서'|'심화서'>('개념서')
  const [noteProgressChapter, setNoteProgressChapter] = useState('')
  const [noteProgressSubChapter, setNoteProgressSubChapter] = useState('')
  const [noteProgressConcepts, setNoteProgressConcepts] = useState<string[]>([])
  const [lastClickedIdx, setLastClickedIdx] = useState<number>(-1)
  const [noteAttendance, setNoteAttendance] = useState('정시')
  const [noteAchievement, setNoteAchievement] = useState(100) // 과제 달성률
  const [noteScorePct, setNoteScorePct] = useState(100)       // 과제 성취도 %
  const [noteExtraClass, setNoteExtraClass] = useState(false)
  const [noteExtraTime, setNoteExtraTime] = useState('')
  const [noteMemo, setNoteMemo] = useState('')
  // 데일리 테스트
  const [dailyTestUnit, setDailyTestUnit] = useState('')
  const [dailyTestScore, setDailyTestScore] = useState('')
  // 데일리테스트 범위 선택 (교재별)
  const [dailyActiveTBId, setDailyActiveTBId] = useState('')
  const [dailyChapter, setDailyChapter] = useState('')
  const [dailySubChapters, setDailySubChapters] = useState<string[]>([])
  const [dailyConceptIds, setDailyConceptIds] = useState<string[]>([])
  const [dailyLastIdx, setDailyLastIdx] = useState(-1)
  // 과제 배부
  const [hwTextbookName, setHwTextbookName] = useState('')
  const [hwTextbookPage, setHwTextbookPage] = useState('')
  const [hwWorksheetRange, setHwWorksheetRange] = useState('')
  const [hwVideoUrls, setHwVideoUrls] = useState<string[]>([''])
  // 교재 과제 - 배정된 교재 기반 (다중 선택)
  const [hwSelectedTBIds, setHwSelectedTBIds] = useState<string[]>([])
  const [hwSelectedEPIds, setHwSelectedEPIds] = useState<string[]>([])  // 시험대비 선택
  const [hwEPPages, setHwEPPages] = useState<Record<string, string>>({})  // 시험대비별 페이지
  const [hwMemo, setHwMemo] = useState('')  // 과제 메모
  const [hwTBChapters, setHwTBChapters] = useState<Record<string, string>>({})
  const [hwTBSubChapters, setHwTBSubChapters] = useState<Record<string, string>>({})
  const [hwTBPages, setHwTBPages] = useState<Record<string, string>>({})
  // 학습지 - 진행중 목록
  const [worksheets, setWorksheets] = useState<any[]>([])
  const [lnCatalog, setLNCatalog] = useState<any[]>([])
  const [progressChecks, setProgressChecks] = useState<any[]>([])
  const [videoWatchLogs, setVideoWatchLogs] = useState<any[]>([])
  const [hwSelectedWSId, setHwSelectedWSId] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  // 피드백 모달
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackImages, setFeedbackImages] = useState<File[]>([])
  const [feedbackImagePreviews, setFeedbackImagePreviews] = useState<string[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [feedbackStudent, setFeedbackStudent] = useState<Student | null>(null)
  const [feedbackContent, setFeedbackContent] = useState('')
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(null)
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([])
  const [feedbackReplies, setFeedbackReplies] = useState<any[]>([])
  const [replyContent, setReplyContent] = useState('')
  const [replyImages, setReplyImages] = useState<File[]>([])
  const [replyImagePreviews, setReplyImagePreviews] = useState<string[]>([])
  const [sendingReply, setSendingReply] = useState(false)
  const [deletingReplyId, setDeletingReplyId] = useState<string | null>(null)
  const [showChatModal, setShowChatModal] = useState(false)
  const [feedbackCategory, setFeedbackCategory] = useState('수업태도')
  const [savingFeedback, setSavingFeedback] = useState(false)

  // 시간표 모달
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleStudent, setScheduleStudent] = useState<Student | null>(null)
  const [scheduleDays, setScheduleDays] = useState<string[]>([])
  const [scheduleTime, setScheduleTime] = useState('16:00')
  const [schedulePeriods, setSchedulePeriods] = useState(2)
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: scData }, { data: ssData }, { data: nData }, { data: fbData }, { data: cData }, { data: stData }, { data: wData }, { data: catLNData }, { data: pcData }, { data: vwData }, { data: epData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('schedules').select('*').eq('is_active', true),
      supabase.from('class_sessions').select('*').order('session_date', { ascending: false }),
      supabase.from('learning_notes').select('*'),
      supabase.from('feedbacks').select('*').order('created_at', { ascending: false }),
      supabase.from('concepts').select('*').order('grade').order('semester').order('concept_order'),
      supabase.from('student_textbooks').select('*').eq('status', 'assigned'),
      supabase.from('student_worksheets').select('*'),
      supabase.from('textbook_catalog').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('progress_checks').select('*').limit(10000),
      supabase.from('video_watch_logs').select('*'),
      supabase.from('student_exam_prep').select('*, inner_enough(*)').neq('status', 'done'),
    ])
    if (sData) setStudents(sData)
    if (scData) setSchedules(scData)
    if (ssData) setSessions(ssData)
    if (nData) setNotes(nData)
    if (fbData) setFeedbacks(fbData)
    if (cData) setConcepts(cData)
    if (stData) setStudentTextbooks(stData)
    if (wData) setWorksheets(wData)
    if (catLNData) setLNCatalog(catLNData)
    if (pcData) setProgressChecks(pcData)
    if (vwData) setVideoWatchLogs(vwData)
    if (epData) setExamPreps(epData)
    setLoading(false)
  }

  async function loadProgress(student: Student) {
    setProgressStudent(student)
    setProgressLoading(true)
    const grade = student.grade // 예: '초6'
    const [{ data: tbData }, { data: pgData }] = await Promise.all([
      supabase.from('elementary_textbooks').select('*')
        .eq('grade', grade).order('semester').order('chapter_no').order('lesson_no'),
      supabase.from('student_progress').select('*').eq('student_id', student.id),
    ])
    if (tbData) setElementaryTextbooks(tbData)
    if (pgData) setStudentProgress(pgData)
    setProgressLoading(false)
  }

  // 연산서 진도 업데이트 (0/20/40/60/80/100)
  async function updateCalcProgress(textbookId: string, percent: number) {
    const { error } = await supabase.from('student_textbooks')
      .update({ progress_percent: percent })
      .eq('id', textbookId)
    if (error) {
      alert('진도 저장 실패: ' + error.message)
      return
    }
    setStudentTextbooks((prev) => prev.map((t) => t.id === textbookId ? { ...t, progress_percent: percent } : t))
  }

  // 시험대비 진도 업데이트 (학습일지에서 직접 입력)
  async function updateExamPrepStep(prepId: string, newStep: number) {
    const { error } = await supabase
      .from('student_exam_prep')
      .update({ progress_step: newStep })
      .eq('id', prepId)
    if (!error) {
      // 화면 즉시 반영
      setExamPreps(prev => prev.map(ep =>
        ep.id === prepId ? { ...ep, progress_step: newStep } : ep
      ))
    } else {
      alert('진도 저장에 실패했어요: ' + error.message)
    }
  }

  async function toggleProgress(textbookId: string, type: string) {
    if (!progressStudent) return
    setSavingProgress(true)
    const existing = studentProgress.find(
      p => p.textbook_id === textbookId && p.textbook_type === type
    )
    if (existing) {
      await supabase.from('student_progress').delete().eq('id', existing.id)
      setStudentProgress(studentProgress.filter(p => p.id !== existing.id))
    } else {
      const { data } = await supabase.from('student_progress').insert({
        student_id: progressStudent.id,
        textbook_id: textbookId,
        textbook_type: type,
      }).select().single()
      if (data) setStudentProgress([...studentProgress, data])
    }
    setSavingProgress(false)
  }

  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    // 콤마/공백으로 구분된 여러 강사명에서 본인 이름 찾기
    const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  })
  const todayDayIndex = new Date().getDay()
  const dayMap: Record<number, string> = { 1:'월',2:'화',3:'수',4:'목',5:'금',6:'토',0:'일' }
  const todayDay = dayMap[todayDayIndex]
  const todayStr = new Date().toISOString().split('T')[0]

  // 오늘 수업 학생 (시간순)
  const todayStudents = myStudents
    .map((s) => {
      const sc = schedules.find((sc) => sc.student_id === s.id && sc.day_of_week === todayDay)
      return { student: s, schedule: sc }
    })
    .filter((x) => x.schedule)
    .sort((a, b) => (a.schedule!.start_time > b.schedule!.start_time ? 1 : -1))

  const otherStudents = myStudents
    .filter((s) => !schedules.find((sc) => sc.student_id === s.id && sc.day_of_week === todayDay))

  function getStudentSchedules(studentId: string) {
    return schedules.filter((s) => s.student_id === studentId)
  }

  function getTodaySession(studentId: string) {
    return sessions.find((s) => s.student_id === studentId && s.session_date === todayStr)
  }

  function getTodayNote(studentId: string) {
    const session = getTodaySession(studentId)
    if (!session) return null
    return notes.find((n) => n.session_id === session.id)
  }

  function openNoteModal(student: Student, targetSession?: ClassSession) {
    // 기존 세션이 있고 편집 권한 체크
    const session = targetSession ?? getTodaySession(student.id)
    if (session && !canEditNote(session.session_date)) {
      alert('수업 당일과 다음날까지만 수정할 수 있어요. 그 이후 수정은 관리자에게 문의해주세요.')
      return
    }
    const note = getTodayNote(student.id)
    // 이전 수업 (오늘 제외 최근 1개)
    const prevSession = sessions
      .filter((s) => s.student_id === student.id && s.session_date < todayStr)
      .sort((a, b) => b.session_date.localeCompare(a.session_date))[0] ?? null

    setNoteStudent(student)
    // 해당 학생 progress_checks만 다시 로딩 (1000행 limit 우회)
    supabase.from('progress_checks').select('*').eq('student_id', student.id).then(({ data }) => {
      if (data && data.length > 0) {
        setProgressChecks((prev) => [
          ...prev.filter((p) => p.student_id !== student.id),
          ...data,
        ])
      }
    })
    setNoteSession(session ?? null)
    setNoteTab('basic')
    setNoteProgress(session?.progress_content ?? session?.today_textbook_name ?? '')
    // 기존 세션이 있으면 진도 데이터 초기화하지 않음 (탭 전환 시 유지)
    if (!session) setNoteProgressByTB({})
    setNoteActiveTBId('')
    setNoteProgressType('개념서')
    setNoteProgressChapter('')
    setNoteProgressSubChapter('')
    setNoteProgressConcepts([])
    setNoteAttendance(note?.attendance ?? '정시')
    setHwSelectedTBIds([])
    setHwTBChapters({})
    setHwTBSubChapters({})
    setHwTBPages({})
    setHwSelectedWSId('')
    setHwSelectedEPIds([])
    setHwEPPages({})
    setHwMemo('')
    setNoteAchievement(note?.achievement ?? 100)
    setNoteScorePct(note?.score_pct ?? 100)
    setNoteExtraClass(note?.extra_class ?? false)
    setNoteExtraTime(note?.extra_time ?? '')
    setNoteMemo(note?.memo ?? '')
    setDailyTestUnit(session?.daily_test_unit ?? '')
    setDailyTestScore(session?.daily_test_score?.toString() ?? '')
    setDailyActiveTBId('')
    setDailyChapter('')
    setDailySubChapters([])
    setDailyConceptIds([])
    setDailyLastIdx(-1)
    setHwTextbookName(session?.hw_textbook_name ?? '')
    setHwTextbookPage(session?.hw_textbook_page ?? '')
    setHwWorksheetRange(session?.hw_worksheet_range ?? '')
    setHwVideoUrls(
      session?.video_url
        ? session.video_url.split('\n').filter(Boolean)
        : ['']
    )
    setShowNoteModal(true)
  }

  async function handleSaveNote() {
    if (!noteStudent) return
    setSavingNote(true)

    // 진도 텍스트 - "대단원번호-중단원번호 첫개념~마지막개념" 형식
    const myTBsForText = studentTextbooks.filter((t) => t.student_id === noteStudent.id)
    const progressParts = Object.entries(noteProgressByTB)
      .filter(([, sel]) => sel.conceptIds.length > 0 || sel.subChapters.length > 0)
      .map(([tbId, sel]) => {
        const tb = myTBsForText.find((t) => t.id === tbId)
        if (!tb) return ''
        // 대단원 번호 추출 (Ⅰ→1, Ⅱ→2 등 or 숫자)
        const chNum = sel.chapter.match(/^[ⅠⅡⅢⅣⅤⅥⅦⅧⅨ]/)?.[0]
          ? {'Ⅰ':'1','Ⅱ':'2','Ⅲ':'3','Ⅳ':'4','Ⅴ':'5','Ⅵ':'6','Ⅶ':'7','Ⅷ':'8','Ⅸ':'9'}[sel.chapter[0]] ?? '?'
          : sel.chapter.match(/^\d+/)?.[0] ?? sel.chapter.slice(0,2)
        // 중단원 번호 추출
        const subNums = sel.subChapters.filter(Boolean).map((s: string) =>
          s?.match(/^(\d+)\./)?.[1] ?? s?.match(/^[ⅠⅡⅢⅣⅤ]/)?.[0] ?? s?.slice(0,1) ?? ''
        )
        // 개념 이름 첫~끝
        const allConcepts = concepts.filter((c) =>
          c.grade === tb.grade && sel.subChapters.includes(c.sub_chapter)
        )
        const selectedConcepts = allConcepts.filter((c) => sel.conceptIds.includes(c.id))
          .sort((a, b) => a.concept_order - b.concept_order)
        let conceptRange = ''
        if (selectedConcepts.length > 0) {
          const first = selectedConcepts[0].concept_name
          const last = selectedConcepts[selectedConcepts.length - 1].concept_name
          conceptRange = first === last ? ` ${first}` : ` ${first}~${last}`
        }
        // 형식: [유형서] 3-1+2 일차함수와 그 그래프~일차방정식
        const subStr = subNums.length > 0 ? `-${subNums.join('+')}` : ''
        return `[${tb.textbook_type}] ${chNum}${subStr}${conceptRange}`
      }).filter(Boolean)
    const progressText = progressParts.length > 0
      ? progressParts.join(' / ')
      : noteProgress || null

    // session 없으면 생성, 있으면 업데이트
    let sessionId = noteSession?.id
    const sessionData = {
      student_id: noteStudent.id,
      session_date: todayStr,
      session_type: '정규',
      today_textbook_name: progressText,
      today_chapter: noteProgressChapter || null,
      progress_content: progressText,
      daily_test_unit: (() => {
        if (dailyChapter) {
          const conceptNames = concepts
            .filter((c) => dailyConceptIds.includes(c.id))
            .map((c) => c.concept_name).join(', ')
          return [dailyChapter, dailySubChapters.join('+'), conceptNames].filter(Boolean).join(' · ')
        }
        return dailyTestUnit || null
      })(),
      daily_test_score: dailyTestScore ? parseInt(dailyTestScore) : null,
      hw_textbook_name: (() => {
        const tbNames = hwSelectedTBIds.map((id) => {
          const tb = studentTextbooks.find((t) => t.id === id)
          return tb ? tb.textbook_name : ''
        }).filter(Boolean)
        const epNames = hwSelectedEPIds.map((id) => {
          const ep = examPreps.find((e) => e.id === id)
          return ep ? `시험대비(${ep.inner_enough?.unit_name ?? ''})` : ''
        }).filter(Boolean)
        const all = [...tbNames, ...epNames]
        if (all.length > 0) return all.join(', ')
        return hwTextbookName || null
      })(),
      hw_textbook_page: (() => {
        const tbParts = hwSelectedTBIds.map((id) => {
          const tb = studentTextbooks.find((t) => t.id === id)
          const ch = hwTBChapters[id] || ''
          const sub = hwTBSubChapters[id] || ''
          const page = hwTBPages[id] || ''
          return [tb?.textbook_name, ch, sub, page].filter(Boolean).join(' · ')
        }).filter(Boolean)
        const epParts = hwSelectedEPIds.map((id) => {
          const ep = examPreps.find((e) => e.id === id)
          if (!ep) return ''
          const page = hwEPPages[id] || ''
          return [`시험대비: ${ep.inner_enough?.unit_name ?? ''}`, page].filter(Boolean).join(' · ')
        }).filter(Boolean)
        const memoPart = hwMemo ? `📝 ${hwMemo}` : ''
        const allParts = [...tbParts, ...epParts, memoPart].filter(Boolean)
        if (allParts.length > 0) return allParts.join(' / ')
        return hwTextbookPage || null
      })(),
      hw_worksheet_range: (() => {
        if (hwSelectedWSId) {
          const ws = worksheets.find((w) => w.id === hwSelectedWSId)
          return ws ? `${ws.grade_level} · ${ws.unit}${ws.unit_name ? ` (${ws.unit_name})` : ''} · ${ws.current_level}레벨` : null
        }
        return hwWorksheetRange || null
      })(),
      video_url: hwVideoUrls.filter((u) => u.trim()).join('\n') || null,
      created_by: currentUser?.name,
    }

    if (!sessionId) {
      // 같은 날짜에 이미 session이 있으면 그걸 사용 (중복 방지)
      const { data: existingSession } = await supabase
        .from('class_sessions')
        .select('id')
        .eq('student_id', noteStudent.id)
        .eq('session_date', todayStr)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (existingSession) {
        sessionId = existingSession.id
        await supabase.from('class_sessions').update(sessionData).eq('id', sessionId)
      } else {
        const { data: newSession } = await supabase.from('class_sessions')
          .insert(sessionData).select().single()
        sessionId = newSession?.id
      }
    } else {
      await supabase.from('class_sessions').update(sessionData).eq('id', sessionId)
    }

    if (!sessionId) { setSavingNote(false); return }

    const existingNote = notes.find((n) => n.session_id === sessionId)
    // 교재별 진도 progress_checks 자동 업데이트
    if (noteStudent && Object.keys(noteProgressByTB).length > 0) {
      // 교재 하나하나(같은 종류/학년/학기라도)마다 진도를 따로 기록 - student_textbook_id로 구분
      const myTBs = studentTextbooks.filter((t) => t.student_id === noteStudent.id)
      for (const [tbId, sel] of Object.entries(noteProgressByTB)) {
        if (sel.conceptIds.length === 0) continue
        const tb = myTBs.find((t) => t.id === tbId)
        if (!tb) continue
        await Promise.all(sel.conceptIds.map(async (conceptId) => {
          const { data: existing } = await supabase
            .from('progress_checks').select('id, check_count')
            .eq('student_id', noteStudent.id).eq('concept_id', conceptId).eq('student_textbook_id', tb.id).single()
          if (existing) {
            if (existing.check_count < 1)
              await supabase.from('progress_checks').update({ check_count: 1, session_id: sessionId }).eq('id', existing.id)
            else
              await supabase.from('progress_checks').update({ session_id: sessionId }).eq('id', existing.id)
          } else {
            await supabase.from('progress_checks').insert({ student_id: noteStudent.id, concept_id: conceptId, check_count: 1, student_textbook_id: tb.id, session_id: sessionId })
          }
        }))
      }
      // 로컬 즉시 반영
      const myTBs2 = myTBs
      setProgressChecks((prev) => {
        const updated = [...prev]
        for (const [tbId, sel] of Object.entries(noteProgressByTB)) {
          const tb = myTBs2.find((t) => t.id === tbId)
          if (!tb) continue
          for (const conceptId of sel.conceptIds) {
            const idx = updated.findIndex((p) => p.student_id === noteStudent!.id && p.concept_id === conceptId && p.student_textbook_id === tb.id)
            if (idx >= 0) { if (updated[idx].check_count < 1) updated[idx] = { ...updated[idx], check_count: 1 } }
            else updated.push({ id: 'temp_' + conceptId + '_' + tb.id, student_id: noteStudent!.id, concept_id: conceptId, check_count: 1, student_textbook_id: tb.id })
          }
        }
        return updated
      })
    }

    const memoText = [
      noteExtraClass ? `추가수업 ${noteExtraTime}` : '',
      noteMemo,
    ].filter(Boolean).join(' ') || null

    const noteData = {
      student_id: noteStudent.id,
      session_id: sessionId,
      attendance: noteAttendance,
      worksheet_submitted: noteAchievement > 0,
      worksheet_score: noteScorePct,
      textbook_submitted: noteAchievement > 0,
      workbook_done: noteAchievement === 100,
      memo: memoText,
    }

    if (existingNote) {
      await supabase.from('learning_notes').update(noteData).eq('id', existingNote.id)
    } else {
      await supabase.from('learning_notes').insert(noteData)
    }

    setSavingNote(false)
    fetchData()
    // 저장 후 모달 유지 - 탭 전환해서 계속 입력 가능
  }

  async function openFeedbackModal(student: Student) {
    setFeedbackStudent(student)
    setFeedbackContent('')
    setFeedbackImages([])
    setFeedbackImagePreviews([])
    setExistingImageUrls([])
    setEditingFeedbackId(null)

    // 오늘 작성한 알림장이 있으면 불러와서 수정 모드
    const startOfDay = todayStr + 'T00:00:00'
    const endOfDay = todayStr + 'T23:59:59'
    const { data } = await supabase.from('feedbacks')
      .select('*')
      .eq('student_id', student.id)
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data) {
      setEditingFeedbackId(data.id)
      setFeedbackContent(data.content || '')
      // 기존 사진 URL 파싱
      if (data.ai_message) {
        try {
          const parsed = JSON.parse(data.ai_message)
          if (parsed && Array.isArray(parsed.images)) setExistingImageUrls(parsed.images)
        } catch {}
      }
      // 답장 스레드 불러오기
      const { data: replies } = await supabase
        .from('feedback_replies')
        .select('*')
        .eq('feedback_id', data.id)
        .order('created_at', { ascending: true })
      setFeedbackReplies(replies || [])
    } else {
      setFeedbackReplies([])
    }
    setReplyContent('')
    setReplyImages([])
    setReplyImagePreviews([])
    setShowFeedbackModal(true)
  }

  // 선생님 답장 보내기
  async function handleSendTeacherReply() {
    if (!editingFeedbackId || (!replyContent.trim() && replyImages.length === 0)) return
    setSendingReply(true)

    // 사진 업로드
    const imageUrls: string[] = []
    for (const file of replyImages) {
      const ext = file.name.split('.').pop() ?? 'jpg'
      const fileName = `replies/${editingFeedbackId}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('feedback-images').upload(fileName, file)
      if (!upErr) {
        const { data: pub } = supabase.storage.from('feedback-images').getPublicUrl(fileName)
        if (pub?.publicUrl) imageUrls.push(pub.publicUrl)
      }
    }

    const { data: newReply } = await supabase.from('feedback_replies').insert({
      feedback_id: editingFeedbackId,
      sender_type: 'teacher',
      sender_name: currentUser?.name,
      content: replyContent.trim() || '(사진)',
      images: imageUrls.length > 0 ? imageUrls : null,
      is_read: false,
    }).select().single()

    if (newReply) {
      setFeedbackReplies((prev) => [...prev, newReply])
      setReplyContent('')
      setReplyImages([])
      setReplyImagePreviews([])
    }
    setSendingReply(false)
  }

  // 답장 삭제 (관리자 또는 본인이 작성한 것)
  async function handleDeleteReply(replyId: string, senderType: string, senderName: string | null) {
    const canDelete = isAdmin() || (senderType === 'teacher' && senderName === currentUser?.name)
    if (!canDelete) {
      alert('이 답장은 삭제 권한이 없어요')
      return
    }
    if (!confirm('이 답장을 삭제할까요?')) return
    setDeletingReplyId(replyId)
    const { error } = await supabase.from('feedback_replies').delete().eq('id', replyId)
    if (!error) {
      setFeedbackReplies((prev) => prev.filter((r) => r.id !== replyId))
    } else {
      alert('삭제 실패: ' + error.message)
    }
    setDeletingReplyId(null)
  }

  // 알림장 자체 삭제 (관리자 또는 작성한 선생님)
  async function handleDeleteFeedback() {
    if (!editingFeedbackId) return
    // 권한 체크: 알림장의 teacher_name 확인
    const { data: fb } = await supabase.from('feedbacks').select('teacher_name').eq('id', editingFeedbackId).maybeSingle()
    const canDelete = isAdmin() || (fb?.teacher_name === currentUser?.name)
    if (!canDelete) {
      alert('이 알림장은 삭제 권한이 없어요')
      return
    }
    if (!confirm('이 알림장과 답장을 모두 삭제할까요? 되돌릴 수 없어요.')) return

    // 답장 먼저 삭제 (외래키 cascade가 있다면 자동이지만 안전하게)
    await supabase.from('feedback_replies').delete().eq('feedback_id', editingFeedbackId)
    await supabase.from('feedbacks').delete().eq('id', editingFeedbackId)

    setShowFeedbackModal(false)
    setFeedbackStudent(null)
    setFeedbackContent('')
    setEditingFeedbackId(null)
    setExistingImageUrls([])
    setFeedbackReplies([])
    fetchData()
  }

  async function handleSaveFeedback() {
    if (!feedbackStudent || !feedbackContent.trim()) return
    setSavingFeedback(true)

    // 새로 추가한 사진 업로드
    const newImageUrls: string[] = []
    if (feedbackImages.length > 0) {
      setUploadingImages(true)
      for (const file of feedbackImages) {
        const ext = file.name.split('.').pop() ?? 'jpg'
        const fileName = `${feedbackStudent.id}/${Date.now()}_${Math.random().toString(36).slice(2,8)}.${ext}`
        const { error: upErr } = await supabase.storage.from('feedback-images').upload(fileName, file)
        if (!upErr) {
          const { data: pub } = supabase.storage.from('feedback-images').getPublicUrl(fileName)
          if (pub?.publicUrl) newImageUrls.push(pub.publicUrl)
        } else {
          console.error('사진 업로드 실패:', upErr)
        }
      }
      setUploadingImages(false)
    }

    // 기존 사진 + 새 사진 합치기 (existingImageUrls는 X 눌러 삭제한 것 빼고 남은 것)
    const allImages = [...existingImageUrls, ...newImageUrls]
    const aiMessageValue = allImages.length > 0 ? JSON.stringify({ images: allImages }) : null

    if (editingFeedbackId) {
      // 수정 모드 - UPDATE
      await supabase.from('feedbacks').update({
        content: feedbackContent.trim(),
        ai_message: aiMessageValue,
        teacher_name: currentUser?.name,
      }).eq('id', editingFeedbackId)
    } else {
      // 신규 - INSERT
      await supabase.from('feedbacks').insert({
        student_id: feedbackStudent.id,
        teacher_name: currentUser?.name,
        content: feedbackContent.trim(),
        ai_message: aiMessageValue,
        is_read: false,
      })
    }

    setShowFeedbackModal(false)
    setFeedbackStudent(null)
    setFeedbackContent('')
    setFeedbackImages([])
    setFeedbackImagePreviews([])
    setExistingImageUrls([])
    setEditingFeedbackId(null)
    setSavingFeedback(false)
    fetchData()
  }

  async function handleSaveSchedule() {
    if (!scheduleStudent || scheduleDays.length === 0) return
    setSavingSchedule(true)
    await Promise.all(
      scheduleDays.map((day) =>
        supabase.from('schedules').insert({
          student_id: scheduleStudent.id,
          day_of_week: day,
          start_time: scheduleTime,
          periods: schedulePeriods,
          is_active: true,
        })
      )
    )
    setShowScheduleModal(false)
    setScheduleDays([])
    setSavingSchedule(false)
    fetchData()
  }

  // 수업일지 삭제 (당일+다음날만 가능, 관리자 예외)
  async function handleDeleteNote(sessionId: string, sessionDate: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const sDate = new Date(sessionDate)
    sDate.setHours(0, 0, 0, 0)
    const canEdit = isAdmin() || sDate >= today && sDate <= tomorrow

    if (!canEdit) {
      alert('수정/삭제는 수업 당일과 다음날까지만 가능해요. 그 이후에는 관리자에게 문의해주세요.')
      return
    }
    if (!confirm('수업일지를 삭제할까요?')) return
    // learning_notes 삭제
    const note = notes.find((n) => n.session_id === sessionId)
    if (note) await supabase.from('learning_notes').delete().eq('id', note.id)
    // class_sessions 삭제
    await supabase.from('class_sessions').delete().eq('id', sessionId)
    fetchData()
  }

  // 수업일지 수정 가능 여부 체크
  function canEditNote(sessionDate: string) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(today.getDate() + 1)
    const sDate = new Date(sessionDate)
    sDate.setHours(0, 0, 0, 0)
    return isAdmin() || (sDate >= today && sDate <= tomorrow)
  }

  async function handleDeleteSchedule(id: string) {
    await supabase.from('schedules').update({ is_active: false }).eq('id', id)
    fetchData()
  }

  // 오늘 시간표 시각화
  const HOUR_PX = 80
  const allStartTimes = todayStudents.map(({ schedule }) => schedule!.start_time)
  const minHour = allStartTimes.length > 0
    ? Math.floor(Math.min(...allStartTimes.map(t => parseInt(t.split(':')[0]))))
    : 14
  const maxEndHour = todayStudents.length > 0
    ? Math.ceil(Math.max(...todayStudents.map(({ schedule }) => {
        const [h, m] = schedule!.start_time.split(':').map(Number)
        return h + m/60 + schedule!.periods
      })))
    : 18
  const hourRange = Array.from({ length: maxEndHour - minHour }, (_, i) => minHour + i)
  const totalHeight = (maxEndHour - minHour) * HOUR_PX

  function timeToOffset(timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number)
    return ((h + m/60) - minHour) * HOUR_PX
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header
        title="학습관리"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          <button onClick={() => { setScheduleDays([]); setShowScheduleModal(true) }}
            className="px-3 py-1.5 bg-[#9FE1CB] text-white text-xs font-semibold rounded-lg">
            + 시간표
          </button>
        }
      />

      {/* 탭 */}
      <div className="flex gap-2 px-4 pt-4 overflow-x-auto pb-1">
        {[
          { key: 'today', label: '📓 수업일지' },
          { key: 'schedule', label: '📅 시간표 관리' },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all whitespace-nowrap',
              tab === t.key ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* ── 수업일지 탭 ── */}
        {tab === 'today' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-4">

              {/* 오늘 시간표 시각화 */}
              {todayStudents.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-800">📅 오늘 ({todayDay}요일) 시간표</span>
                    <span className="text-xs text-gray-400">{todayStudents.length}명</span>
                  </div>
                  <div className="p-3 overflow-x-auto">
                    <div className="flex gap-2" style={{ minWidth: 'max-content' }}>
                      {/* 시간 라벨 (왼쪽) */}
                      <div className="flex flex-col shrink-0 relative" style={{ width: 44, height: totalHeight }}>
                        {hourRange.map((hour) => (
                          <div key={hour} style={{ position: 'absolute', top: (hour - minHour) * HOUR_PX, height: HOUR_PX }}>
                            <span className="text-xs font-bold text-gray-400">{String(hour).padStart(2,'0')}:00</span>
                          </div>
                        ))}
                      </div>

                      {/* 학생 블록들 */}
                      <div className="relative flex gap-1.5" style={{ height: totalHeight, minWidth: 0 }}>
                        {/* 시간 구분선 */}
                        {hourRange.map((hour) => (
                          <div key={hour} style={{
                            position: 'absolute', top: (hour - minHour) * HOUR_PX,
                            left: 0, right: 0, borderTop: '1px dashed #f0f0f0', zIndex: 0
                          }} />
                        ))}
                        {todayStudents.map(({ student, schedule }) => {
                          const color = GRADE_COLORS[student.grade] ?? GRADE_COLORS['default']
                          const periods = schedule!.periods
                          const top = timeToOffset(schedule!.start_time)
                          const blockH = HOUR_PX * periods - 6
                          const hasNote = !!getTodayNote(student.id)
                          return (
                            <div key={student.id} className="shrink-0 relative" style={{ width: 80, height: totalHeight }}>
                              <button
                                onClick={() => openNoteModal(student)}
                                className="rounded-xl px-2 flex flex-col justify-center w-full transition-all hover:opacity-80 absolute"
                                style={{
                                  backgroundColor: color.bg,
                                  borderLeft: `4px solid ${hasNote ? '#10b981' : color.border}`,
                                  height: blockH, top, zIndex: 1
                                }}>
                                <span className="text-xs font-black text-gray-900 truncate">{student.name}</span>
                                <span className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: color.sub }}>
                                  {student.grade}
                                </span>
                                {hasNote && <span className="text-[9px] text-green-600 font-bold">✓ 입력완료</span>}
                                {!hasNote && schedule!.start_time.slice(0,5) && (
                                  <span className="text-[9px] text-gray-400">{schedule!.start_time.slice(0,5)} · {periods}교시</span>
                                )}
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 오늘 수업 학생 목록 */}
              {todayStudents.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-800 px-1 mb-2">📅 오늘 ({todayDay}요일) 수업 {todayStudents.length}명</p>
                  {todayStudents.map(({ student, schedule }) => {
                    const note = getTodayNote(student.id)
                    const session = getTodaySession(student.id)
                    return (
                      <div key={student.id} className={cx(
                        'bg-white rounded-2xl border-2 shadow-sm overflow-hidden mb-3',
                        note ? 'border-green-200' : 'border-blue-100'
                      )}>
                        <div className={cx('px-4 py-3 flex items-center gap-3', note ? 'bg-green-50' : 'bg-blue-50')}>
                          <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                            {student.name[0]}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">{student.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <p className="text-xs text-gray-500">{student.grade}</p>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                                {schedule!.start_time.slice(0,5)} · {schedule!.periods}교시
                              </span>
                              {student.wise_step && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                                  {student.wise_step}단계
                                </span>
                              )}
                              {note && (
                                <span className="text-[10px] font-bold text-green-600">✓ 수업일지 완료</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            <button onClick={() => openFeedbackModal(student)}
                              className="px-2.5 py-1 text-xs font-semibold text-[#712B13] bg-white border border-purple-200 rounded-lg">
                              💬 알림장
                            </button>
                            {note && session ? (() => {
                              const editable = canEditNote(session.session_date)
                              return (
                                <>
                                  <button onClick={() => editable ? openNoteModal(student) : alert('수업 당일과 다음날까지만 수정할 수 있어요. 관리자에게 문의해주세요.')}
                                    className={cx('px-2.5 py-1 text-xs font-semibold rounded-lg',
                                      editable ? 'text-gray-600 bg-white border border-gray-200' : 'text-gray-400 bg-white border border-gray-100 cursor-not-allowed')}>
                                    {editable ? '수정' : '🔒 수정'}
                                  </button>
                                  <button onClick={() => editable ? handleDeleteNote(session.id, session.session_date) : alert('수업 당일과 다음날까지만 삭제할 수 있어요. 관리자에게 문의해주세요.')}
                                    className={cx('px-2.5 py-1 text-xs font-semibold rounded-lg',
                                      editable ? 'text-red-500 bg-red-50 border border-red-100' : 'text-gray-300 bg-white border border-gray-100 cursor-not-allowed')}>
                                    {editable ? '삭제' : '🔒 삭제'}
                                  </button>
                                </>
                              )
                            })() : (
                              <button onClick={() => openNoteModal(student)}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg text-white bg-[#9FE1CB]">
                                ✏️ 입력
                              </button>
                            )}
                          </div>
                        </div>

                        {/* 배정 교재 + 진도 미리보기 (수업일지 없을 때) */}
                        {!note && (() => {
                          const myTBs = studentTextbooks.filter((t) => t.student_id === student.id)
                          if (myTBs.length === 0) return null
                          const recentSession = sessions
                            .filter((s) => s.student_id === student.id && s.session_date < todayStr)
                            .sort((a, b) => b.session_date.localeCompare(a.session_date))[0]
                          return (
                            <div className="px-4 py-2 flex flex-wrap gap-1.5">
                              {myTBs.map((tb) => (
                                <span key={tb.id} className={cx('text-[10px] font-semibold px-2 py-1 rounded-full',
                                  tb.textbook_type === '개념서' ? 'bg-yellow-50 text-yellow-700' :
                                  tb.textbook_type === '유형서' ? 'bg-green-50 text-green-700' :
                                  tb.textbook_type === '심화서' ? 'bg-orange-50 text-orange-700' :
                                  'bg-purple-50 text-purple-700')}>
                                  {tb.textbook_type} {tb.textbook_name}
                                  {tb.grade ? ` · ${tb.grade} ${tb.semester}학기` : ''}
                                </span>
                              ))}
                              {recentSession?.progress_content && (
                                <span className="text-[10px] text-blue-500 w-full">
                                  📖 지난 수업: {recentSession.progress_content}
                                </span>
                              )}
                            </div>
                          )
                        })()}

                        {/* 수업일지 요약 */}
                        {note && session && (
                          <div className="px-4 py-2.5 flex flex-wrap gap-2">
                            {(session.progress_content || session.today_textbook_name) && (
                              <span className="text-[10px] text-gray-500">📖 {session.progress_content || session.today_textbook_name}</span>
                            )}
                            <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                              note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                              note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                              'bg-green-100 text-green-600')}>
                              {note.attendance}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              과제달성률 {note.workbook_done ? '100%' : note.worksheet_submitted ? '70%' : '0%'}
                            </span>
                            {note.worksheet_score != null && (
                              <span className={cx('text-[10px] font-bold', note.worksheet_score >= 85 ? 'text-green-600' : note.worksheet_score >= 70 ? 'text-gray-800' : 'text-red-500')}>
                                과제성취도 {note.worksheet_score}점
                              </span>
                            )}
                            {/* 영상 시청 시간 (선생님만 표시) */}
                            {session.video_url && (() => {
                              const urls = session.video_url.split('\n').filter(Boolean)
                              const logs = videoWatchLogs.filter((v) => v.session_id === session.id)
                              if (urls.length === 0) return null
                              const totalSec = logs.reduce((sum, v) => sum + (v.watch_seconds ?? 0), 0)
                              const totalMin = Math.floor(totalSec / 60)
                              const remainSec = totalSec % 60
                              const timeStr = totalSec === 0 ? '' : totalMin > 0 ? ` · ${totalMin}분${remainSec > 0 ? ` ${remainSec}초` : ''}` : ` · ${totalSec}초`
                              const watchedCount = logs.filter((v) => (v.watch_seconds ?? 0) > 0).length
                              return (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={watchedCount === 0
                                    ? { background: '#fee2e2', color: '#991b1b' }
                                    : watchedCount < urls.length
                                    ? { background: '#FAEEDA', color: '#633806' }
                                    : { background: '#EAF3DE', color: '#27500A' }}>
                                  영상 {watchedCount}/{urls.length}개{timeStr}
                                  {watchedCount === 0 ? ' 미시청' : watchedCount < urls.length ? ' 일부시청' : ' 완료'}
                                </span>
                              )
                            })()}
                            {note.memo && <span className="text-[10px] text-gray-400">📝 {note.memo}</span>}
                            {!canEditNote(session.session_date) && (
                              <span className="text-[10px] text-gray-300 w-full mt-1">🔒 수정기간 종료 · 관리자 문의</span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 오늘 수업 없는 학생 */}
              {otherStudents.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-400 px-1 mb-2">
                    오늘 수업 없는 학생 {otherStudents.length}명
                    <span className="ml-1.5 font-normal text-gray-300">· 클릭하면 수업일지/진도 입력 가능</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {otherStudents.map((student) => {
                      // 최근 진도 확인
                      const recentSession = sessions
                        .filter((s) => s.student_id === student.id)
                        .sort((a, b) => b.session_date.localeCompare(a.session_date))[0]
                      const recentNote = recentSession
                        ? notes.find((n) => n.session_id === recentSession.id)
                        : null
                      const myTBs = studentTextbooks.filter((t) => t.student_id === student.id)
                      const mainTB = myTBs.find((t) => t.textbook_type === '개념서') ?? myTBs[0]

                      return (
                        <button key={student.id}
                          onClick={() => openNoteModal(student)}
                          className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 text-left hover:border-blue-200 hover:shadow-md transition-all w-full md:w-auto min-w-[140px]">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                              {student.name[0]}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-gray-700">{student.name}</p>
                              <p className="text-[10px] text-gray-400">{student.grade}</p>
                            </div>
                          </div>
                          {/* 현재 진도 미리보기 */}
                          {mainTB && (
                            <div className="text-[10px] text-gray-400 truncate">
                              📚 {mainTB.textbook_type} · {mainTB.textbook_name}
                            </div>
                          )}
                          {recentSession?.progress_content && (
                            <div className="text-[10px] text-blue-400 truncate mt-0.5">
                              📖 {recentSession.progress_content}
                            </div>
                          )}
                          {!recentSession && (
                            <div className="text-[10px] text-gray-300 mt-0.5">수업 기록 없음</div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {todayStudents.length === 0 && otherStudents.length === 0 && (
                <div className="text-center py-8 text-sm text-gray-400">담당 학생이 없어요</div>
              )}
            </div>
          )
        )}

        {/* ── 시간표 관리 탭 ── */}
        {/* ── 진도 현황 탭 ── */}

        {tab === 'schedule' && (
          <div className="space-y-4">
            <button onClick={() => { setScheduleDays([]); setShowScheduleModal(true) }}
              className="w-full py-3 rounded-xl text-sm font-bold text-gray-800 bg-blue-50 border-2 border-dashed border-blue-200">
              + 시간표 추가
            </button>
            {myStudents.map((student) => {
              const studentSchedules = getStudentSchedules(student.id)
              return (
                <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.grade}</p>
                    </div>
                    <button onClick={() => { setScheduleStudent(student); setScheduleDays([]); setShowScheduleModal(true) }}
                      className="px-2.5 py-1 text-xs font-semibold text-gray-800 bg-blue-50 border border-blue-200 rounded-lg">
                      + 추가
                    </button>
                  </div>
                  {studentSchedules.length === 0 ? (
                    <p className="text-center text-xs text-gray-400 py-4">등록된 시간표가 없어요</p>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {studentSchedules
                        .sort((a, b) => DAYS.indexOf(a.day_of_week) - DAYS.indexOf(b.day_of_week))
                        .map((sc) => (
                          <div key={sc.id} className="px-4 py-2.5 flex items-center gap-3">
                            <span className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-700">{sc.day_of_week}</span>
                            <span className="text-sm font-semibold text-gray-700 flex-1">{sc.start_time.slice(0,5)}</span>
                            <span className="text-xs text-gray-400">{sc.periods}교시</span>
                            <button onClick={() => handleDeleteSchedule(sc.id)} className="text-xs text-red-400 hover:text-red-600">삭제</button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── 수업일지 입력 모달 ── */}
      {showNoteModal && noteStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowNoteModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>

            {/* 헤더 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-900">📓 수업일지 입력</h3>
              <button onClick={() => setShowNoteModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 정보 */}
            <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700">
                {noteStudent.name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-blue-800">{noteStudent.name}</p>
                <p className="text-xs text-blue-500">{noteStudent.grade} · {todayStr}</p>
              </div>
            </div>

            {/* 이전 수업 요약 */}
            {(() => {
              const prevSession = sessions
                .filter((s) => s.student_id === noteStudent.id && s.session_date < todayStr)
                .sort((a, b) => b.session_date.localeCompare(a.session_date))[0]
              if (!prevSession) return null

              // 선행 진도: 배정된 교재 중 가장 앞선 과정 계산
              const myTBs = studentTextbooks.filter((t) => t.student_id === noteStudent.id)
              const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']
              const TYPE_ORDER = ['개념서','유형서','심화서']
              const topTB = myTBs.reduce((best, t) => {
                if (!best) return t
                const gA = GRADE_ORDER.indexOf(best.grade ?? '')
                const gB = GRADE_ORDER.indexOf(t.grade ?? '')
                if (gB > gA) return t
                if (gB === gA) {
                  const tA = TYPE_ORDER.indexOf(best.textbook_type)
                  const tB = TYPE_ORDER.indexOf(t.textbook_type)
                  if (tB > tA) return t
                }
                return best
              }, null as any)

              // 최근 학습지 (지난 배부된 것)
              const recentWS = worksheets
                .filter((w) => w.student_id === noteStudent.id)
                .sort((a, b) => b.assigned_at?.localeCompare(a.assigned_at ?? '') ?? 0)[0]

              return (
                <div style={{ background: '#ffffff', borderLeft: '3px solid #d97706' }}
                  className="rounded-xl px-4 py-3 mb-4">
                  <p className="text-[10px] font-bold mb-2" style={{ color: '#4b5563' }}>
                    지난 수업 · {prevSession.session_date}
                  </p>
                  <div className="space-y-1.5">
                    {/* 선행 진도 표시 */}
                    {topTB && (
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: '#F5C4B3', color: '#712B13' }}>진도</span>
                        <p className="text-xs flex-1" style={{ color: '#1f2937' }}>
                          {topTB.textbook_type} · {topTB.textbook_name}
                          {topTB.grade ? ` · ${topTB.grade} ${topTB.semester}학기` : ''}
                          {prevSession.progress_content ? ` · ${prevSession.progress_content.replace(/^\[.*?\]\s*/, '')}` : ''}
                        </p>
                      </div>
                    )}
                    {/* 교재 과제 */}
                    {prevSession.hw_textbook_name && (
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: '#92400e', color: '#fdf8f0' }}>교재</span>
                        <p className="text-xs flex-1" style={{ color: '#1f2937' }}>
                          {prevSession.hw_textbook_name}{prevSession.hw_textbook_page ? ` · ${prevSession.hw_textbook_page}` : ''}
                        </p>
                      </div>
                    )}
                    {/* 최근 학습지 */}
                    {recentWS && (
                      <div className="flex items-start gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: '#639922', color: '#fdf8f0' }}>학습지</span>
                        <p className="text-xs flex-1" style={{ color: '#1f2937' }}>
                          {recentWS.grade_level} · {recentWS.unit}{recentWS.unit_name ? ` (${recentWS.unit_name})` : ''} · {recentWS.current_level}레벨
                        </p>
                      </div>
                    )}
                    {!topTB && !prevSession.hw_textbook_name && !recentWS && (
                      <p className="text-xs" style={{ color: '#1f2937' }}>수업 기록이 없어요</p>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* 탭 */}
            <div className="flex gap-1.5 mb-4">
              {[
                { key: 'basic', label: '수업내용' },
                { key: 'daily', label: '데일리테스트' },
                { key: 'hw', label: '과제배부' },
              ].map((t) => (
                <button key={t.key} onClick={() => setNoteTab(t.key as typeof noteTab)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold border transition-all"
                  style={noteTab === t.key
                    ? { background: '#F5C4B3', color: '#712B13', borderColor: '#F5C4B3' }
                    : { background: 'white', color: '#1f2937', borderColor: '#9FE1CB60' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* ── 수업내용 탭 ── */}
            {noteTab === 'basic' && (
              <div className="space-y-4">
                {/* 진도 내용 - 배정된 교재 기반 선택 */}
                {(() => {
                  const month = new Date().getMonth() + 1
                  const currentSem = month >= 3 && month <= 8 ? 1 : 2

                  const TYPE_COLOR: Record<string, { btn: string; badge: string; style?: any; badgeStyle?: any }> = {
                    '개념서': { btn: '', badge: '', style: { background: '#EF9F27', color: '#fdf8f0', borderColor: '#EF9F27' }, badgeStyle: { background: '#FAEEDA', color: '#633806' } },
                    '유형서': { btn: '', badge: '', style: { background: '#639922', color: '#fdf8f0', borderColor: '#639922' }, badgeStyle: { background: '#EAF3DE', color: '#27500A' } },
                    '심화서': { btn: '', badge: '', style: { background: '#dc2626', color: '#fdf8f0', borderColor: '#dc2626' }, badgeStyle: { background: '#fee2e2', color: '#991b1b' } },
                  }

                  // 배정된 교재 목록
                  const myTextbooks = noteStudent
                    ? studentTextbooks.filter((t) => t.student_id === noteStudent.id)
                    : []

                  return (
                    <div className="space-y-2.5">
                      <label className="block text-xs font-bold text-gray-700">진도 내용</label>

                      {myTextbooks.length === 0 ? (
                        <p className="text-xs text-gray-400 px-1">과정관리에서 교재를 먼저 배정해주세요</p>
                      ) : (
                        <div className="space-y-2">
                          {myTextbooks.map((tb) => {
                            const tc = TYPE_COLOR[tb.textbook_type as keyof typeof TYPE_COLOR] ?? TYPE_COLOR['개념서']
                            const isActive = noteActiveTBId === tb.id
                            const sel = noteProgressByTB[tb.id] ?? { chapter: '', subChapters: [], conceptIds: [], lastIdx: -1 }

                            // 이 교재의 개념 목록
                            const tbConcepts = tb.grade
                              ? concepts.filter((c) => c.grade === tb.grade && (tb.semester ? c.semester === tb.semester : true))
                              : []
                            const tbChapters = [...new Set(tbConcepts.map((c) => c.chapter))]
                            const tbSubChapters = sel.chapter
                              ? [...new Set(tbConcepts.filter((c) => c.chapter === sel.chapter).map((c) => c.sub_chapter))]
                              : []
                            // 모든 교재 타입 개념까지 선택 가능
                            const showConcepts = tb.textbook_type === '개념서' || tb.textbook_type === '유형서' || tb.textbook_type === '심화서'
                            const tbConceptList = showConcepts && sel.chapter && sel.subChapters.length > 0
                              ? tbConcepts.filter((c) => c.chapter === sel.chapter && sel.subChapters.includes(c.sub_chapter))
                              : []


                            const updateSel = (patch: Partial<typeof sel>) => {
                              setNoteProgressByTB((prev) => ({
                                ...prev,
                                [tb.id]: { ...sel, ...patch }
                              }))
                            }

                            return (
                              <div key={tb.id} className="rounded-xl border-2 overflow-hidden transition-all"
                                style={{ borderColor: isActive ? tc.style?.borderColor : '#e5d5c5' }}>
                                {/* 교재 헤더 - 클릭으로 펼치기/접기 */}
                                <button onClick={() => setNoteActiveTBId(isActive ? '' : tb.id)}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                                  style={{ background: isActive ? tc.badgeStyle?.background : 'white' }}>
                                  <span className="text-xs font-bold px-2 py-0.5 rounded"
                                    style={tc.style}>
                                    {tb.textbook_type}
                                  </span>
                                  <span className="text-xs font-semibold flex-1" style={{ color: '#1f2937' }}>
                                    {tb.textbook_name}
                                  </span>
                                  {tb.grade && (
                                    <span className="text-[10px]" style={{ color: '#1f2937' }}>
                                      {tb.grade}{tb.semester ? ` ${tb.semester}학기` : ''}
                                    </span>
                                  )}
                                  {/* 선택된 개념 수 표시 */}
                                  {sel.conceptIds.length > 0 && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                      style={tc.badgeStyle}>
                                      {sel.conceptIds.length}개 선택
                                    </span>
                                  )}
                                  <span style={{ color: '#1f2937', fontSize: 10 }}>{isActive ? '▲' : '▼'}</span>
                                </button>

                                {/* 펼쳐진 선택 영역 */}
                                {isActive && (
                                  <div className="px-3 pb-3 space-y-2" style={{ background: '#ffffff' }}>
                                    {tb.textbook_type === '연산서' ? (
                                      // 연산서: 5단계 % 버튼만 표시
                                      <div className="pt-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-bold text-gray-700">달성률</span>
                                          <span className="text-sm font-bold" style={{ color: (tb.progress_percent ?? 0) >= 80 ? '#22c55e' : (tb.progress_percent ?? 0) >= 40 ? '#3b82f6' : '#f59e0b' }}>
                                            {tb.progress_percent ?? 0}%
                                          </span>
                                        </div>
                                        <div className="bg-gray-100 rounded-full h-2 mb-3">
                                          <div className="h-2 rounded-full transition-all duration-500"
                                            style={{ width: `${tb.progress_percent ?? 0}%`, background: (tb.progress_percent ?? 0) >= 80 ? '#22c55e' : (tb.progress_percent ?? 0) >= 40 ? '#3b82f6' : '#f59e0b' }} />
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                          {[0, 20, 40, 60, 80, 100].map((v) => {
                                            const isActiveP = (tb.progress_percent ?? 0) === v
                                            return (
                                              <button key={v} onClick={() => updateCalcProgress(tb.id, v)}
                                                className={cx('flex-1 min-w-[44px] px-2 py-1.5 rounded-lg text-xs font-bold border transition-all',
                                                  isActiveP ? 'bg-[#F5C4B3] text-white border-[#F5C4B3]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#F5C4B3]')}>
                                                {v}%
                                              </button>
                                            )
                                          })}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2">달성률을 선택하면 바로 저장돼요</p>
                                      </div>
                                    ) : tbConcepts.length === 0 ? (
                                      <p className="text-xs text-gray-400 py-2">이 과목의 개념 DB가 없어요</p>
                                    ) : (
                                      <>
                                        {/* 대단원 */}
                                        <div className="flex gap-1.5 flex-wrap pt-2">
                                          {tbChapters.map((ch) => (
                                            <button key={ch}
                                              onClick={() => updateSel({ chapter: ch, subChapters: [], conceptIds: [], lastIdx: -1 })}
                                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                              style={sel.chapter === ch
                                                ? { background: '#F5C4B3', color: '#712B13', borderColor: '#F5C4B3' }
                                                : { background: 'white', color: '#1f2937', borderColor: '#9FE1CB60' }}>
                                              {ch}
                                            </button>
                                          ))}
                                        </div>

                                        {/* 중단원 (다중선택 가능) */}
                                        {tbSubChapters.length > 0 && (
                                          <div className="flex gap-1.5 flex-wrap">
                                            {tbSubChapters.map((sub) => {
                                              const isSubSel = sel.subChapters.includes(sub)
                                              return (
                                                <button key={sub}
                                                  onClick={() => {
                                                    const newSubs = isSubSel
                                                      ? sel.subChapters.filter((x) => x !== sub)
                                                      : [...sel.subChapters, sub]
                                                    updateSel({ subChapters: newSubs, conceptIds: [], lastIdx: -1 })
                                                  }}
                                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                                  style={isSubSel
                                                    ? { background: '#9FE1CB', color: '#fdf8f0', borderColor: '#d97706' }
                                                    : { background: 'white', color: '#1f2937', borderColor: '#9FE1CB60' }}>
                                                  {sub}
                                                </button>
                                              )
                                            })}
                                          </div>
                                        )}

                                        {/* 개념 목록 */}
                                        {tbConceptList.length > 0 && (
                                          <div className="border border-gray-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto bg-white">
                                            <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between"
                                              style={{ background: '#ffffff' }}>
                                              <span className="text-[10px] text-gray-400">Shift+클릭으로 범위 선택</span>
                                              {sel.conceptIds.length > 0 && (
                                                <button onClick={() => updateSel({ conceptIds: [], lastIdx: -1 })}
                                                  className="text-[10px] text-gray-400 hover:text-red-400">전체 해제</button>
                                              )}
                                            </div>
                                            {tbConceptList.map((c, idx) => {
                                              const selected = sel.conceptIds.includes(c.id)
                                              // 이 교재에서 직접 체크한 기록 우선, 없으면 교재 구분 없던 예전 기록(개념서에 한해) 참고
                                              const existingCheck = noteStudent
                                                ? progressChecks.find((p) => p.student_id === noteStudent.id && p.concept_id === c.id && p.student_textbook_id === tb.id)
                                                  ?? (tb.textbook_type === '개념서' ? progressChecks.find((p) => p.student_id === noteStudent.id && p.concept_id === c.id && !p.student_textbook_id) : undefined)
                                                : null
                                              const done = existingCheck && existingCheck.check_count >= 1

                                              return (
                                                <button key={c.id}
                                                  onClick={(e) => {
                                                    if (e.shiftKey && sel.lastIdx !== -1) {
                                                      const start = Math.min(sel.lastIdx, idx)
                                                      const end = Math.max(sel.lastIdx, idx)
                                                      const rangeIds = tbConceptList.slice(start, end + 1).map((x) => x.id)
                                                      updateSel({ conceptIds: [...new Set([...sel.conceptIds, ...rangeIds])] })
                                                    } else {
                                                      updateSel({
                                                        conceptIds: sel.conceptIds.includes(c.id)
                                                          ? sel.conceptIds.filter((x) => x !== c.id)
                                                          : [...sel.conceptIds, c.id],
                                                        lastIdx: idx
                                                      })
                                                    }
                                                  }}
                                                  className={cx('w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-gray-50 last:border-0 transition-all',
                                                    selected ? 'bg-amber-50' : done ? 'bg-white' : 'hover:bg-white')}>
                                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                                    style={selected ? tc.badgeStyle :
                                                      done ? tc.badgeStyle :
                                                      { background: '#f3f4f6', color: '#9ca3af' }}>
                                                    {selected ? '✓' : done ? '✓' : c.concept_order}
                                                  </span>
                                                  <span className={cx('text-xs flex-1',
                                                    selected ? 'text-gray-800 font-semibold' :
                                                    done ? 'text-gray-400 line-through' : 'text-gray-600')}>
                                                    {c.concept_name}
                                                  </span>
                                                  {done && !selected && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded shrink-0"
                                                      style={tc.badgeStyle}>
                                                      완료
                                                    </span>
                                                  )}
                                                </button>
                                              )
                                            })}
                                          </div>
                                        )}

                                        {/* 선택 요약 */}
                                        {sel.conceptIds.length > 0 && (
                                          <div className="px-3 py-2 rounded-xl text-xs font-semibold"
                                            style={tc.badgeStyle}>
                                            {sel.chapter}{sel.subChapters.length > 0 ? ` · ${sel.subChapters.join(' + ')}` : ''}{tbConceptList.length > 0 ? ' ·' : ''}{' '}
                                            {tbConceptList.filter((c) => sel.conceptIds.includes(c.id)).map((c) => c.concept_name).join(', ')}
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 출결 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">출결</label>
                  <div className="flex gap-2">
                    {[
                      { key: '정시', icon: 'ti-circle-check' },
                      { key: '지각', icon: 'ti-clock-exclamation' },
                      { key: '결석', icon: 'ti-x' },
                    ].map((att) => (
                      <button key={att.key} onClick={() => setNoteAttendance(att.key)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5"
                        style={noteAttendance === att.key
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#9ca3af' }}>
                        <i className={`ti ${att.icon}`} style={{ fontSize: 15 }} />
                        {att.key}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 과제 달성률 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📊 과제 달성률</label>
                  <div className="grid grid-cols-4 gap-2">
                    {ACHIEVEMENT_OPTIONS.map((opt) => (
                      <button key={opt.value} onClick={() => setNoteAchievement(opt.value)}
                        className="py-2.5 rounded-xl text-sm font-black transition-all"
                        style={noteAchievement === opt.value
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#9ca3af' }}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 과제 성취도 % */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">🎯 과제 성취도</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {[0, 30, 50, 70, 90, 100].map((pct) => (
                      <button key={pct} onClick={() => setNoteScorePct(pct)}
                        className="px-3 py-2 rounded-xl text-sm font-bold transition-all"
                        style={noteScorePct === pct
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#9ca3af' }}>
                        {pct}%
                      </button>
                    ))}
                  </div>
                </div>

                {/* 추가수업 */}
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <input type="checkbox" id="extraClass" checked={noteExtraClass}
                      onChange={(e) => setNoteExtraClass(e.target.checked)}
                      className="w-4 h-4 accent-blue-600" />
                    <label htmlFor="extraClass" className="text-xs font-bold text-gray-700">추가수업</label>
                  </div>
                  {noteExtraClass && (
                    <input type="text" value={noteExtraTime} onChange={(e) => setNoteExtraTime(e.target.value)}
                      placeholder="예: 오후 6시~7시"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#9FE1CB]" />
                  )}
                </div>

                {/* 메모 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
                  <textarea value={noteMemo} onChange={(e) => setNoteMemo(e.target.value)}
                    rows={2} placeholder="특이사항, 다음 수업 준비사항 등"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#9FE1CB]" />
                </div>

                {/* 시험대비 (이너프원) */}
                {(() => {
                  if (!noteStudent) return null
                  const today7 = new Date(); today7.setHours(0,0,0,0)
                  const myPreps = examPreps.filter(ep => {
                    if (ep.student_id !== noteStudent.id) return false
                    if (ep.status === 'done') return false
                    if (ep.exam_date) {
                      const examDt = new Date(ep.exam_date); examDt.setHours(0,0,0,0)
                      const diff = Math.floor((today7.getTime() - examDt.getTime()) / (1000*60*60*24))
                      if (diff > 7) return false
                    }
                    return true
                  })
                  if (myPreps.length === 0) return null

                  return (
                    <div>
                      <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                        <i className="ti ti-pencil-check" style={{ fontSize: 13, color: '#993C1D' }} />
                        시험대비 진도 (이너프원)
                      </p>
                      <div className="space-y-2">
                        {myPreps.map(ep => {
                          const ie = ep.inner_enough
                          if (!ie) return null
                          // 단계 계산: 문항수 / 30 올림, 최소 1
                          const totalSteps = Math.max(1, Math.round(ie.problem_count / 30))
                          const currentStep = ep.progress_step ?? 0
                          const pct = totalSteps === 1
                            ? (currentStep >= 1 ? 100 : 0)
                            : Math.round(currentStep / totalSteps * 100)

                          return (
                            <div key={ep.id} className="rounded-xl px-3 py-3"
                              style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-800 truncate">{ie.unit_name}</p>
                                  <p className="text-[10px] text-gray-400">{ie.sub_unit_name} · {ie.problem_count}문항</p>
                                </div>
                                <span className="text-xs font-black shrink-0" style={{
                                  color: pct >= 100 ? '#27500A' : pct > 0 ? '#993C1D' : '#9ca3af'
                                }}>{pct}%</span>
                              </div>
                              {/* 진도 입력 (클릭 가능) */}
                              <div className="flex gap-1.5">
                                {Array.from({ length: totalSteps + 1 }).map((_, step) => {
                                  const stepPct = totalSteps === 1
                                    ? (step === 0 ? 0 : 100)
                                    : Math.round(step / totalSteps * 100)
                                  const isActive = currentStep === step
                                  return (
                                    <button key={step}
                                      onClick={() => updateExamPrepStep(ep.id, step)}
                                      className="flex-1 py-1.5 rounded-lg text-[10px] font-bold text-center transition-all active:scale-95"
                                      style={isActive
                                        ? { background: '#F5C4B3', color: '#712B13' }
                                        : step < currentStep
                                        ? { background: '#EAF3DE', color: '#27500A' }
                                        : { background: '#f3f4f6', color: '#9ca3af' }}>
                                      {stepPct}%
                                    </button>
                                  )
                                })}
                              </div>
                              <p className="text-[10px] text-gray-400 mt-1">
                                <i className="ti ti-hand-finger" style={{ fontSize: 10 }} /> 눌러서 진도 입력 (시험대비 관리와 자동 연동)
                              </p>
                              {ep.exam_date && (
                                <p className="text-[10px] text-gray-400 mt-1.5">시험일 {ep.exam_date}</p>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* ── 데일리 테스트 탭 ── */}
            {noteTab === 'daily' && (
              <div className="space-y-4">
                {/* 테스트 범위 선택 - 단원만 선택 */}
                {(() => {
                  const myTBs = noteStudent
                    ? studentTextbooks.filter((t) => t.student_id === noteStudent.id)
                    : []

                  // 배정된 교재 중 첫 번째 grade 기반으로 단원 목록
                  const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','공통수학1','공통수학2','미적분1','확률과통계','대수','기하','고1','고2','고3']
                  const topTB = myTBs.sort((a, b) => {
                    const gradeDiff = GRADE_ORDER.indexOf(b.grade ?? '') - GRADE_ORDER.indexOf(a.grade ?? '')
                    if (gradeDiff !== 0) return gradeDiff
                    return (b.semester ?? 0) - (a.semester ?? 0)
                  })[0]
                  const allConcepts = topTB?.grade
                    ? concepts.filter((c) => c.grade === topTB.grade && (topTB.semester ? c.semester === topTB.semester : true))
                    : []
                  const allChapters = [...new Set(allConcepts.map((c) => c.chapter))]
                  const subChapters = dailyChapter
                    ? [...new Set(allConcepts.filter((c) => c.chapter === dailyChapter).map((c) => c.sub_chapter))]
                    : []
                  // 선택된 중단원들의 개념 합치기
                  const conceptList = dailyChapter && dailySubChapters.length > 0
                    ? allConcepts.filter((c) => c.chapter === dailyChapter && dailySubChapters.includes(c.sub_chapter))
                    : []

                  return (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        테스트 범위
                        {topTB?.grade && <span className="ml-1.5 text-[10px] font-normal text-gray-400">{topTB.grade}</span>}
                      </label>
                      {allConcepts.length === 0 ? (
                        <input type="text" value={dailyTestUnit} onChange={(e) => setDailyTestUnit(e.target.value)}
                          placeholder="예: 이차방정식 근의 공식"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                      ) : (
                        <div className="space-y-2">
                          {/* 대단원 */}
                          <div className="flex gap-1.5 flex-wrap">
                            {allChapters.map((ch) => (
                              <button key={ch} onClick={() => { setDailyChapter(ch); setDailySubChapters([]); setDailyConceptIds([]); setDailyLastIdx(-1) }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                style={dailyChapter === ch
                                  ? { background: '#F5C4B3', color: '#712B13', borderColor: '#F5C4B3' }
                                  : { background: 'white', color: '#1f2937', borderColor: '#9FE1CB60' }}>
                                {ch}
                              </button>
                            ))}
                          </div>
                          {/* 중단원 */}
                          {subChapters.length > 0 && (
                            <div className="flex gap-1.5 flex-wrap">
                              {subChapters.map((sub) => {
                                const isSubSelected = dailySubChapters.includes(sub)
                                return (
                                  <button key={sub} onClick={() => {
                                    setDailySubChapters((prev) =>
                                      prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub]
                                    )
                                    setDailyConceptIds([])
                                    setDailyLastIdx(-1)
                                  }}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                                    style={isSubSelected
                                      ? { background: '#9FE1CB', color: '#fdf8f0', borderColor: '#d97706' }
                                      : { background: 'white', color: '#1f2937', borderColor: '#9FE1CB60' }}>
                                    {sub}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {/* 개념 선택 */}
                          {conceptList.length > 0 && (
                            <div className="border border-gray-200 rounded-xl overflow-hidden max-h-40 overflow-y-auto bg-white">
                              <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between"
                                style={{ background: '#ffffff' }}>
                                <span className="text-[10px] text-gray-400">Shift+클릭 범위 선택</span>
                                {dailyConceptIds.length > 0 && (
                                  <button onClick={() => { setDailyConceptIds([]); setDailyLastIdx(-1) }}
                                    className="text-[10px] text-gray-400 hover:text-red-400">해제</button>
                                )}
                              </div>
                              {conceptList.map((c, idx) => {
                                const selected = dailyConceptIds.includes(c.id)
                                return (
                                  <button key={c.id}
                                    onClick={(e) => {
                                      if (e.shiftKey && dailyLastIdx !== -1) {
                                        const start = Math.min(dailyLastIdx, idx)
                                        const end = Math.max(dailyLastIdx, idx)
                                        const ids = conceptList.slice(start, end + 1).map((x) => x.id)
                                        setDailyConceptIds((prev) => [...new Set([...prev, ...ids])])
                                      } else {
                                        setDailyConceptIds((prev) => selected ? prev.filter((x) => x !== c.id) : [...prev, c.id])
                                        setDailyLastIdx(idx)
                                      }
                                    }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left border-b border-gray-50 last:border-0 transition-all"
                                    style={{ background: selected ? '#fdf8f0' : 'white' }}>
                                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                      style={selected
                                        ? { background: '#9FE1CB', color: '#fdf8f0' }
                                        : { background: '#f3f4f6', color: '#9ca3af' }}>
                                      {selected ? '✓' : c.concept_order}
                                    </span>
                                    <span className="text-xs" style={{ color: selected ? '#3d2b1f' : '#6b7280', fontWeight: selected ? 600 : 400 }}>
                                      {c.concept_name}
                                    </span>
                                  </button>
                                )
                              })}
                            </div>
                          )}
                          {/* 선택 요약 */}
                          {(dailyChapter || dailyConceptIds.length > 0) && (
                            <div className="px-3 py-2 rounded-xl text-xs font-semibold"
                              style={{ background: '#FAEEDA', color: '#633806' }}>
                              {dailyChapter}{dailySubChapters.length > 0 ? ` · ${dailySubChapters.join(' + ')}` : ''}
                              {dailyConceptIds.length > 0 && ` · ${conceptList.filter((c) => dailyConceptIds.includes(c.id)).map((c) => c.concept_name).join(', ')}`}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 점수 입력 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">점수</label>
                  <input type="number" min="0" max="100" value={dailyTestScore}
                    onChange={(e) => setDailyTestScore(e.target.value)}
                    placeholder="0 ~ 100"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
                {dailyTestScore && (
                  <div className="rounded-xl p-3 text-center text-sm font-bold"
                    style={parseInt(dailyTestScore) >= 90
                      ? { background: '#EAF3DE', color: '#27500A' }
                      : parseInt(dailyTestScore) >= 70
                      ? { background: '#FAEEDA', color: '#633806' }
                      : { background: '#fee2e2', color: '#991b1b' }}>
                    {dailyTestScore}점 · {parseInt(dailyTestScore) >= 90 ? '우수' : parseInt(dailyTestScore) >= 70 ? '양호' : '보완 필요'}
                  </div>
                )}
              </div>
            )}

            {/* ── 과제 배부 탭 ── */}
            {noteTab === 'hw' && (
              <div className="space-y-4">
                <div className="bg-green-50 rounded-xl p-3 text-xs text-green-700">
                  💡 과제 배부 시 학생 앱 "오늘 과제" 탭에 자동으로 표시됩니다
                </div>

                {/* 교재 과제 - 배정된 교재 기반 (다중 선택) */}
                {(() => {
                  const myTBs = noteStudent
                    ? studentTextbooks.filter((t) => t.student_id === noteStudent.id)
                    : []

                  const TYPE_COLOR: Record<string, string> = {
                    '개념서': 'bg-yellow-400 text-white border-yellow-400',
                    '유형서': 'bg-green-500 text-white border-green-500',
                    '심화서': 'bg-orange-500 text-white border-orange-500',
                    '연산서': 'bg-purple-500 text-white border-purple-500',
                  }

                  return (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        📖 교재 과제
                        <span className="ml-1.5 text-[10px] font-normal text-gray-400">복수 선택 가능</span>
                      </label>
                      {myTBs.length === 0 ? (
                        <p className="text-xs text-gray-400">과정관리에서 교재를 먼저 배정해주세요</p>
                      ) : (
                        <div className="space-y-3">
                          {myTBs.map((tb) => {
                            const isSelected = hwSelectedTBIds.includes(tb.id)
                            const tbConcepts = concepts.filter((c) =>
                              c.grade === tb.grade && c.semester === tb.semester
                            )
                            const tbChapters = [...new Set(tbConcepts.map((c) => c.chapter))]
                            const selectedChapter = hwTBChapters[tb.id] || ''
                            const tbSubChapters = selectedChapter
                              ? [...new Set(tbConcepts.filter((c) => c.chapter === selectedChapter).map((c) => c.sub_chapter))]
                              : []
                            const selectedSub = hwTBSubChapters[tb.id] || ''
                            const selectedPage = hwTBPages[tb.id] || ''

                            return (
                              <div key={tb.id} className={cx('rounded-xl border-2 overflow-hidden transition-all',
                                isSelected ? 'border-blue-300' : 'border-gray-100')}>
                                {/* 교재 선택 헤더 */}
                                <button onClick={() => {
                                  setHwSelectedTBIds((prev) =>
                                    prev.includes(tb.id) ? prev.filter((x) => x !== tb.id) : [...prev, tb.id]
                                  )
                                  if (!isSelected) {
                                    setHwTBChapters((p) => ({ ...p, [tb.id]: '' }))
                                    setHwTBSubChapters((p) => ({ ...p, [tb.id]: '' }))
                                    setHwTBPages((p) => ({ ...p, [tb.id]: '' }))
                                  }
                                }}
                                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                                  <span className={cx('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                                    isSelected ? 'bg-[#9FE1CB] border-[#9FE1CB]' : 'border-gray-300')}>
                                    {isSelected && <span className="w-2 h-2 bg-white rounded-full" />}
                                  </span>
                                  <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                    isSelected ? TYPE_COLOR[tb.textbook_type] ?? 'bg-gray-400 text-white' : 'bg-gray-100 text-gray-500')}>
                                    {tb.textbook_type}
                                  </span>
                                  <span className="text-xs font-semibold text-gray-700">{tb.textbook_name}</span>
                                  {tb.grade && <span className="text-[10px] text-gray-400 ml-auto">{tb.grade} {tb.semester}학기</span>}
                                </button>

                                {/* 선택된 경우 세부 입력 */}
                                {isSelected && (
                                  <div className="px-3 pb-3 space-y-2 bg-blue-50/30">
                                    {/* 대단원 */}
                                    {tbChapters.length > 0 && (
                                      <div className="flex gap-1.5 flex-wrap">
                                        {tbChapters.map((ch) => (
                                          <button key={ch} onClick={() => {
                                            setHwTBChapters((p) => ({ ...p, [tb.id]: ch }))
                                            setHwTBSubChapters((p) => ({ ...p, [tb.id]: '' }))
                                          }}
                                            className={cx('px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all',
                                              selectedChapter === ch ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                                            {ch}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {/* 중단원 */}
                                    {selectedChapter && tbSubChapters.length > 0 && (
                                      <div className="flex gap-1.5 flex-wrap">
                                        {tbSubChapters.map((sub) => (
                                          <button key={sub} onClick={() =>
                                            setHwTBSubChapters((p) => ({ ...p, [tb.id]: sub }))}
                                            className={cx('px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all',
                                              selectedSub === sub ? 'bg-[#F5C4B3] text-white border-[#F5C4B3]' : 'bg-white text-gray-600 border-gray-200')}>
                                            {sub}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {/* 페이지 입력 */}
                                    <input type="text" value={selectedPage}
                                      onChange={(e) => setHwTBPages((p) => ({ ...p, [tb.id]: e.target.value }))}
                                      placeholder="페이지/범위 (예: p.45~52)"
                                      className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-400" />
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 학습지 과제 - 학습지관리탭 연동 */}
                {(() => {
                  const myWSList = noteStudent
                    ? worksheets.filter((w) =>
                        w.student_id === noteStudent.id &&
                        (w.status === 'assigned' || w.status === 'similar_assigned')
                      )
                    : []

                  return (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        📝 학습지 과제
                        <span className="ml-1.5 text-[10px] font-normal text-gray-400">학습지관리탭과 자동연동</span>
                      </label>
                      {myWSList.length === 0 ? (
                        <p className="text-xs text-gray-400">학습지관리탭에서 배정된 학습지가 없어요</p>
                      ) : (
                        <div className="space-y-1.5">
                          {myWSList.map((ws) => (
                            <button key={ws.id} onClick={() => setHwSelectedWSId(ws.id === hwSelectedWSId ? '' : ws.id)}
                              className={cx('w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all',
                                hwSelectedWSId === ws.id ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200')}>
                              <span className={cx('w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                                hwSelectedWSId === ws.id ? 'bg-[#9FE1CB] border-[#9FE1CB]' : 'border-gray-300')}>
                                {hwSelectedWSId === ws.id && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-gray-800">
                                  {ws.grade_level} · {ws.unit}{ws.unit_name ? ` (${ws.unit_name})` : ''} · {ws.current_level}레벨
                                </p>
                                {ws.worksheet_type === 'similar' && (
                                  <span className="text-[10px] text-[#712B13] font-bold">오답유사</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* 영상 과제 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700">영상 과제 링크</label>
                    <button onClick={() => setHwVideoUrls((prev) => [...prev, ''])}
                      className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-all"
                      style={{ background: '#ffffff', color: '#4b5563', border: '1px solid #9FE1CB60' }}>
                      + 추가
                    </button>
                  </div>
                  <div className="space-y-2">
                    {hwVideoUrls.map((url, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <input type="url" value={url}
                          onChange={(e) => {
                            const next = [...hwVideoUrls]
                            next[idx] = e.target.value
                            setHwVideoUrls(next)
                          }}
                          placeholder="https://youtube.com/..."
                          className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                        {hwVideoUrls.length > 1 && (
                          <button onClick={() => setHwVideoUrls((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-gray-400 hover:text-red-400 text-lg shrink-0">✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                  {hwVideoUrls.some((u) => u.trim()) && (
                    <p className="text-xs mt-1" style={{ color: '#639922' }}>
                      영상 {hwVideoUrls.filter((u) => u.trim()).length}개 · 학생 시청 시간이 선생님에게만 표시돼요
                    </p>
                  )}
                </div>

                {/* 시험대비 과제 - 시험배정 자동연동 */}
                {(() => {
                  const now = new Date()
                  const todayEP = new Date(); todayEP.setHours(0,0,0,0)
                  const myEPs = noteStudent ? examPreps.filter((ep) => {
                    if (ep.exam_date) {
                      const epDt = new Date(ep.exam_date); epDt.setHours(0,0,0,0)
                      const diff = Math.floor((todayEP.getTime() - epDt.getTime()) / (1000*60*60*24))
                      if (diff > 7) return false
                    }
                    if (ep.student_id !== noteStudent.id) return false
                    if (!ep.exam_date) return true
                    const examEnd = new Date(ep.exam_date)
                    examEnd.setDate(examEnd.getDate() + 7)
                    return now <= examEnd
                  }) : []
                  if (myEPs.length === 0) return null
                  return (
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">
                        🎯 시험대비 과제
                        <span className="ml-1.5 text-[10px] font-normal text-gray-400">시험배정 자동연동 · 복수 선택 가능</span>
                      </label>
                      <div className="space-y-2">
                        {myEPs.map((ep) => {
                          const isSelected = hwSelectedEPIds.includes(ep.id)
                          const selPage = hwEPPages[ep.id] || ''
                          return (
                            <div key={ep.id} className={cx('rounded-xl border-2 overflow-hidden transition-all',
                              isSelected ? 'border-orange-300' : 'border-gray-100')}>
                              <button onClick={() => {
                                setHwSelectedEPIds((prev) => prev.includes(ep.id) ? prev.filter((x) => x !== ep.id) : [...prev, ep.id])
                                if (!isSelected) setHwEPPages((p) => ({ ...p, [ep.id]: '' }))
                              }}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left">
                                <span className={cx('w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all',
                                  isSelected ? 'bg-[#F5C4B3] border-[#F5C4B3]' : 'border-gray-300')}>
                                  {isSelected && <span className="w-2 h-2 bg-white rounded-full" />}
                                </span>
                                <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                                  isSelected ? 'bg-[#F5C4B3] text-[#712B13]' : 'bg-gray-100 text-gray-500')}>시험대비</span>
                                <span className="text-xs font-semibold text-gray-700">{ep.inner_enough?.unit_name ?? '이너프원'}</span>
                                {ep.exam_date && <span className="text-[10px] text-gray-400 ml-auto">시험일 {ep.exam_date}</span>}
                              </button>
                              {isSelected && (
                                <div className="px-3 pb-3 bg-orange-50/30">
                                  <input type="text" value={selPage}
                                    onChange={(e) => setHwEPPages((p) => ({ ...p, [ep.id]: e.target.value }))}
                                    placeholder="페이지/범위 (예: p.45~52)"
                                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-orange-400" />
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}

                {/* 메모 (과제 배부) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">📝 메모</label>
                  <textarea value={hwMemo} onChange={(e) => setHwMemo(e.target.value)}
                    placeholder="과제 관련 메모 (선택)"
                    rows={2}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none" />
                </div>
              </div>
            )}


            {/* 저장 버튼 - 모든 탭에서 표시 */}
            <button onClick={handleSaveNote} disabled={savingNote}
              className="w-full mt-4 py-3.5 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              {savingNote
                ? <><span className="w-4 h-4 border-2 border-[#712B13]/30 border-t-[#712B13] rounded-full animate-spin" />저장 중...</>
                : <><i className="ti ti-device-floppy" style={{ fontSize: 17 }} /> 수업일지 저장</>}
            </button>
          </div>
        </div>
      )}

            {/* ── 알림장(피드백) 모달 ── */}
      {showFeedbackModal && feedbackStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowFeedbackModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">💬 학부모 알림장 {editingFeedbackId ? '수정' : '작성'}</h3>
              <div className="flex items-center gap-2">
                {editingFeedbackId && (
                  <button onClick={handleDeleteFeedback} className="text-[11px] text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-all flex items-center gap-1">
                    <i className="ti ti-trash" style={{ fontSize: 12 }} /> 삭제
                  </button>
                )}
                <button onClick={() => setShowFeedbackModal(false)} className="text-gray-400">✕</button>
              </div>
            </div>
            <div className="bg-purple-50 rounded-xl px-4 py-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-purple-200 flex items-center justify-center text-sm font-bold text-purple-700">
                {feedbackStudent.name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-purple-800">{feedbackStudent.name}</p>
                <p className="text-xs text-purple-500">{feedbackStudent.grade}</p>
              </div>
            </div>
            {/* 카테고리별 문장 선택 */}
            {(() => {
              const PHRASES: Record<string, string[]> = {
                '수업태도': [
                  '오늘 수업 태도가 매우 좋았습니다.',
                  '집중력이 좋고 적극적으로 참여했습니다.',
                  '오늘따라 집중력이 조금 떨어졌습니다.',
                  '자세가 바르지 않아 주의를 주었습니다.',
                  '졸음을 참으며 수업에 임했습니다.',
                  '친구들과 잡담이 많아 지적하였습니다.',
                  '질문을 적극적으로 하며 수업에 참여했습니다.',
                  '이해가 빠르고 반응이 좋았습니다.',
                ],
                '과제': [
                  '과제를 성실하게 완료해 왔습니다.',
                  '과제를 꼼꼼하게 잘 해왔습니다.',
                  '과제를 해오지 않아 수업 중 진행했습니다.',
                  '과제 완성도가 아쉬워 보완을 지시했습니다.',
                  '과제량이 많았음에도 잘 완료했습니다.',
                  '오답 수정을 제대로 하지 않아 다시 지도했습니다.',
                  '과제 중 틀린 부분을 함께 확인하고 정리했습니다.',
                  '다음 수업까지 미완성 과제를 마저 완료하도록 했습니다.',
                ],
                '진도': [
                  '오늘 진도를 잘 이해하고 따라왔습니다.',
                  '새로운 개념을 빠르게 습득했습니다.',
                  '개념 이해에 시간이 걸려 추가 설명을 진행했습니다.',
                  '응용문제에서 어려움을 느껴 반복 학습이 필요합니다.',
                  '기초 개념 복습 후 새 단원을 시작했습니다.',
                  '오늘 배운 내용을 잘 정리하도록 지도했습니다.',
                  '계산 실수가 잦아 꼼꼼히 확인하도록 지도했습니다.',
                  '심화 문제까지 훌륭하게 소화했습니다.',
                ],
                '칭찬': [
                  '오늘 수업이 매우 인상적이었습니다.',
                  '열심히 노력하는 모습이 보기 좋습니다.',
                  '실력이 눈에 띄게 향상되고 있습니다.',
                  '포기하지 않고 끝까지 풀어내는 끈기가 훌륭합니다.',
                  '꼼꼼하고 성실한 학습 태도를 칭찬합니다.',
                  '복습을 충실히 한 것이 느껴집니다.',
                  '이해력이 뛰어나 수업 진행이 매우 즐거웠습니다.',
                  '오늘 최선을 다한 모습이 대견합니다.',
                ],
                '당부': [
                  '복습을 꼭 해주시기 바랍니다.',
                  '오늘 배운 개념을 한 번 더 읽어보도록 해주세요.',
                  '다음 수업 전까지 예습을 부탁드립니다.',
                  '규칙적인 수면으로 컨디션 관리를 부탁드립니다.',
                  '핸드폰 사용 시간을 줄여주시면 좋겠습니다.',
                  '수업 중 필기 습관을 길러주시기 바랍니다.',
                  '부족한 부분은 개념부터 다시 정리해 주세요.',
                  '꾸준한 학습 습관이 중요합니다.',
                ],
                '기타': [
                  '오늘 컨디션이 좋지 않아 보여 걱정이 되었습니다.',
                  '추가 수업을 통해 부족한 부분을 보완했습니다.',
                  '다음 시험을 위해 집중적으로 준비 중입니다.',
                  '오늘 시험 결과를 함께 분석하고 대책을 세웠습니다.',
                  '학원 결석 시 미리 연락 부탁드립니다.',
                  '궁금한 점은 언제든지 연락 주세요.',
                  '앞으로도 잘 지도하겠습니다.',
                  '지속적인 관심과 격려 부탁드립니다.',
                ],
              }
              const categories = Object.keys(PHRASES)

              return (
                <div className="space-y-3">
                  {/* 카테고리 탭 */}
                  <div className="flex gap-1.5 flex-wrap">
                    {categories.map((cat) => (
                      <button key={cat} onClick={() => setFeedbackCategory(cat)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                        style={feedbackCategory === cat
                          ? { background: '#F5C4B3', color: '#712B13', borderColor: '#F5C4B3' }
                          : { background: 'white', color: '#1f2937', borderColor: '#9FE1CB60' }}>
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* 문장 버튼 */}
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {PHRASES[feedbackCategory]?.map((phrase) => {
                      const isSelected = feedbackContent.includes(phrase)
                      return (
                        <button key={phrase}
                          onClick={() => {
                            if (isSelected) {
                              setFeedbackContent((prev) => prev.split('\n').filter((s) => s.trim() !== phrase.trim()).join('\n').trim())
                            } else {
                              setFeedbackContent((prev) => prev ? prev + '\n' + phrase : phrase)
                            }
                          }}
                          className="px-2.5 py-1.5 rounded-xl text-xs border transition-all text-left"
                          style={isSelected
                            ? { background: '#FAEEDA', color: '#633806', borderColor: '#d97706', fontWeight: 600 }
                            : { background: '#f9f9f9', color: '#374151', borderColor: '#e5e7eb' }}>
                          {isSelected ? '✓ ' : ''}{phrase}
                        </button>
                      )
                    })}
                  </div>

                  {/* 미리보기 + 직접입력 */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-gray-700">작성 내용</label>
                      {feedbackContent && (
                        <button onClick={() => setFeedbackContent('')}
                          className="text-[10px] text-gray-400 hover:text-red-400">전체 지우기</button>
                      )}
                    </div>
                    <textarea value={feedbackContent} onChange={(e) => setFeedbackContent(e.target.value)}
                      rows={3} placeholder="위 문장을 클릭하거나 직접 입력하세요"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#F5C4B3]" />
                  </div>
                </div>
              )
            })()}
            {/* 사진 첨부 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">📷 사진 첨부 <span className="font-normal text-gray-400">(선택 · 최대 5장)</span></label>
              <div className="flex gap-2 flex-wrap">
                {/* 기존에 저장된 사진들 */}
                {existingImageUrls.map((url, idx) => (
                  <div key={'ex-'+idx} className="relative w-20 h-20 rounded-xl overflow-hidden border-2" style={{ borderColor: '#9FE1CB' }}>
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => setExistingImageUrls((prev) => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">
                      ✕
                    </button>
                    <span className="absolute bottom-0 left-0 right-0 text-[9px] text-white text-center py-0.5" style={{ background: 'rgba(8,80,65,0.7)' }}>기존</span>
                  </div>
                ))}
                {feedbackImagePreviews.map((url, idx) => (
                  <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-gray-200">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => {
                      setFeedbackImages((prev) => prev.filter((_, i) => i !== idx))
                      setFeedbackImagePreviews((prev) => prev.filter((_, i) => i !== idx))
                    }}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center">
                      ✕
                    </button>
                  </div>
                ))}
                {feedbackImages.length < 5 && (
                  <label className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-[#F5C4B3] transition-colors">
                    <i className="ti ti-plus text-gray-400" style={{ fontSize: 22 }} />
                    <span className="text-[10px] text-gray-400 mt-0.5">사진 추가</span>
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? [])
                        const remaining = 5 - feedbackImages.length
                        const toAdd = files.slice(0, remaining)
                        setFeedbackImages((prev) => [...prev, ...toAdd])
                        toAdd.forEach((file) => {
                          const reader = new FileReader()
                          reader.onload = () => setFeedbackImagePreviews((prev) => [...prev, reader.result as string])
                          reader.readAsDataURL(file)
                        })
                        e.target.value = ''
                      }} />
                  </label>
                )}
              </div>
            </div>

            {/* 학생/학부모와의 대화 (별도 모달) */}
            {editingFeedbackId && (
              <button type="button" onClick={() => setShowChatModal(true)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border-2 transition-all hover:bg-orange-50"
                style={{ background: '#FFF5F2', borderColor: '#F5C4B3' }}>
                <span className="flex items-center gap-2 text-sm font-bold" style={{ color: '#712B13' }}>
                  <i className="ti ti-messages" style={{ fontSize: 16 }} />
                  학생과의 대화 보기
                </span>
                <span className="flex items-center gap-1">
                  {feedbackReplies.length > 0 && (
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#F5C4B3', color: '#712B13' }}>
                      {feedbackReplies.length}
                    </span>
                  )}
                  <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#712B13' }} />
                </span>
              </button>
            )}

                        <div className="bg-orange-50 rounded-xl px-4 py-3 text-xs" style={{ color: '#712B13' }}>
              저장하면 학부모 화면에 알림장이 표시돼요
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setShowFeedbackModal(false); setFeedbackImages([]); setFeedbackImagePreviews([]); setExistingImageUrls([]); setEditingFeedbackId(null) }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
              <button onClick={handleSaveFeedback} disabled={!feedbackContent.trim() || savingFeedback}
                className="flex-1 py-3 bg-[#F5C4B3] text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {savingFeedback
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />{uploadingImages ? '사진 업로드 중...' : '저장 중...'}</>
                  : (editingFeedbackId ? '💬 알림장 수정' : '💬 알림장 저장')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 대화 모달 (학생/학부모 답장 스레드) ── */}
      {showChatModal && editingFeedbackId && feedbackStudent && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-end md:items-center md:justify-center"
          onClick={() => setShowChatModal(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-2xl flex flex-col"
            style={{ maxHeight: '85vh' }}
            onClick={(e) => e.stopPropagation()}>
            {/* 헤더 */}
            <div className="px-4 py-3 flex items-center justify-between border-b shrink-0"
              style={{ background: '#FFF5F2', borderColor: '#f5d6cc' }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: '#F5C4B3', color: '#712B13' }}>
                  {feedbackStudent.name[0]}
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: '#712B13' }}>{feedbackStudent.name} 와의 대화</p>
                  <p className="text-[10px] text-gray-500">{feedbackReplies.length}개의 답장</p>
                </div>
              </div>
              <button onClick={() => setShowChatModal(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {/* 스레드 (스크롤 영역) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ background: '#fafafa' }}>
              {feedbackReplies.length === 0 ? (
                <p className="text-center text-xs text-gray-400 py-8">아직 답장이 없어요</p>
              ) : feedbackReplies.map((rp) => {
                const isTeacher = rp.sender_type === 'teacher'
                const rpImages: string[] = Array.isArray(rp.images) ? rp.images : []
                const rpDate = new Date(rp.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                const canDeleteReply = isAdmin() || (isTeacher && rp.sender_name === currentUser?.name)
                return (
                  <div key={rp.id} className={isTeacher ? 'flex justify-end' : 'flex justify-start'}>
                    <div className="max-w-[85%]">
                      <div className={`flex items-center gap-1.5 mb-1 ${isTeacher ? 'justify-end' : 'justify-start'}`}>
                        <p className="text-[10px] text-gray-400">
                          {isTeacher ? (rp.sender_name ?? '선생님') : `${rp.sender_name ?? '학생'} (학생)`} · {rpDate}
                        </p>
                        {canDeleteReply && (
                          <button onClick={() => handleDeleteReply(rp.id, rp.sender_type, rp.sender_name)}
                            disabled={deletingReplyId === rp.id}
                            className="text-[10px] text-gray-300 hover:text-red-500 disabled:opacity-40">
                            <i className="ti ti-trash" style={{ fontSize: 10 }} />
                          </button>
                        )}
                      </div>
                      <div className="rounded-2xl px-3 py-2"
                        style={isTeacher
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: 'white', color: '#374151', border: '1px solid #e5e7eb' }}>
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

            {/* 답장 입력 (하단 고정) */}
            <div className="p-3 border-t shrink-0" style={{ background: 'white', borderColor: '#f3f4f6' }}>
              <textarea value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="답장 쓰기..."
                rows={2}
                className="w-full px-3 py-2 rounded-xl text-sm bg-gray-50 border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#F5C4B3] resize-none" />

              {replyImagePreviews.length > 0 && (
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {replyImagePreviews.map((url, idx) => (
                    <div key={idx} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => {
                        setReplyImages((prev) => prev.filter((_, i) => i !== idx))
                        setReplyImagePreviews((prev) => prev.filter((_, i) => i !== idx))
                      }}
                        className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/60 text-white text-[10px] flex items-center justify-center">✕</button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between mt-2">
                {replyImages.length < 3 ? (
                  <label className="text-[11px] font-semibold cursor-pointer px-2 py-1 rounded-lg flex items-center gap-1"
                    style={{ background: '#f3f4f6', color: '#6b7280' }}>
                    <i className="ti ti-camera" style={{ fontSize: 13 }} /> 사진
                    <input type="file" accept="image/*" multiple className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? [])
                        const remaining = 3 - replyImages.length
                        const toAdd = files.slice(0, remaining)
                        setReplyImages((prev) => [...prev, ...toAdd])
                        toAdd.forEach((file) => {
                          const reader = new FileReader()
                          reader.onload = () => setReplyImagePreviews((prev) => [...prev, reader.result as string])
                          reader.readAsDataURL(file)
                        })
                        e.target.value = ''
                      }} />
                  </label>
                ) : <span className="text-[10px] text-gray-400">사진 최대 3장</span>}

                <button onClick={handleSendTeacherReply}
                  disabled={(!replyContent.trim() && replyImages.length === 0) || sendingReply}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-40 flex items-center gap-1"
                  style={{ background: '#F5C4B3', color: '#712B13' }}>
                  {sendingReply ? '전송 중...' : '✉️ 답장 보내기'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 시간표 추가 모달 ── */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowScheduleModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📅 시간표 추가</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400">✕</button>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생</label>
              {scheduleStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <p className="text-sm font-bold text-blue-800 flex-1">{scheduleStudent.name}</p>
                  <button onClick={() => setScheduleStudent(null)} className="text-blue-400">✕</button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                  {myStudents.map((s) => (
                    <button key={s.id} onClick={() => setScheduleStudent(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-white border-b border-gray-50 last:border-0 text-sm font-semibold text-gray-800">
                      {s.name} <span className="text-xs text-gray-400 font-normal">{s.grade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                요일 <span className="text-gray-400 font-normal">(복수 선택 가능)</span>
                {scheduleDays.length > 0 && (
                  <span className="ml-2 text-gray-800 font-bold">{scheduleDays.join('·')}요일</span>
                )}
              </label>
              <div className="flex gap-1.5">
                {DAYS.map((d) => (
                  <button key={d} onClick={() => {
                    setScheduleDays((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                    )
                  }}
                    className={cx('flex-1 py-2 rounded-lg text-sm font-bold border transition-all',
                      scheduleDays.includes(d) ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시간</label>
              <div className="flex gap-1.5 flex-wrap">
                {TIMES.map((t) => (
                  <button key={t} onClick={() => setScheduleTime(t)}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      scheduleTime === t ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">수업 교시</label>
              <div className="flex gap-2">
                {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((p) => (
                  <button key={p} onClick={() => setSchedulePeriods(p)}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      schedulePeriods === p ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                    {p}교시
                  </button>
                ))}
              </div>
            </div>
            <button onClick={handleSaveSchedule} disabled={!scheduleStudent || scheduleDays.length === 0 || savingSchedule}
              className="w-full py-3.5 bg-[#9FE1CB] text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingSchedule ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</> : scheduleDays.