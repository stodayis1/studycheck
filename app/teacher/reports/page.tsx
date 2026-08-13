'use client'

import { useState, useEffect, useRef } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx, fetchAllRows } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { computeCurriculumProgressGroups } from '@/lib/curriculumProgress'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface WorksheetRecord {
  id: string
  student_id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  status: string
  worksheet_type: string
  score: number | null
  assigned_at: string
  memo: string | null
}

const GRADE_GROUPS = [
  { label: '초등', grades: ['초1','초2','초3','초4','초5','초6'] },
  { label: '중등', grades: ['중1','중2','중3'] },
  { label: '고등', grades: ['고1','고2','고3'] },
]

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
  sub_chapter: string
  concept_order: number
  concept_name: string
}

interface StudentTextbook {
  id: string
  student_id: string
  textbook_name: string
  textbook_type: string
  grade: string | null
  semester: number | null
  status: string
}

interface ProgressCheck {
  id: string
  student_id: string
  concept_id: string
  check_count: number
  student_textbook_id?: string | null
}

interface Exam {
  id: string
  student_id: string
  exam_type: string
  exam_date: string
  title: string | null
  unit: string | null
  unit_name: string | null
  level: number | null
  score: number | null
  total_score: number
  memo: string | null
}

const EXAM_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  '입학테스트': { color: '#085041', bg: '#F0FBF7', dot: '#9FE1CB' },
  '진단평가':   { color: '#633806', bg: '#FAEEDA', dot: '#EF9F27' },
  '코어테스트': { color: '#27500A', bg: '#EAF3DE', dot: '#639922' },
  '학교시험':   { color: '#1e3a5f', bg: '#EFF6FF', dot: '#3b82f6' },
}

export default function TeacherReportsPage() {
  const { currentUser, isAdmin, canManageAllStudents } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('초등')
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null)
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [studentTextbooks, setStudentTextbooks] = useState<StudentTextbook[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  // 학생 목록에서 "과제기록 있는 학생 진하게 표시"용 - 전체 학습지 내용은 필요 없고 학생별 존재 여부만 있으면 됨
  const [worksheetHasRecordIds, setWorksheetHasRecordIds] = useState<Set<string>>(new Set())
  const [examPreps, setExamPreps] = useState<any[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dailyTestSessions, setDailyTestSessions] = useState<{ session_date: string; daily_test_unit: string | null; daily_test_score: number }[]>([])

  // 월간보고서 상태
  const [activeTab, setActiveTab] = useState<'report' | 'monthly' | 'grade' | 'ranking'>('report')
  const [mStudent, setMStudent] = useState<Student | null>(null)
  const [mSearchText, setMSearchText] = useState('')
  const [mYear, setMYear] = useState(new Date().getFullYear())
  const [mMonth, setMMonth] = useState(new Date().getMonth() + 1)
  const [mComment, setMComment] = useState('')
  const [mGenerating, setMGenerating] = useState(false)
  const [mData, setMData] = useState<any>(null)
  const [mLoading, setMLoading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  // 성적표(코어테스트+학습지) 상태
  const [gStudent, setGStudent] = useState<Student | null>(null)
  const [gSearchText, setGSearchText] = useState('')
  const [gData, setGData] = useState<any>(null)
  const [gLoading, setGLoading] = useState(false)
  const gradeRef = useRef<HTMLDivElement>(null)

  // 코어테스트 학년별 등수 상태 (관리자 전용) - 매달 회차별로 같은 학년끼리 점수를 비교해 등수를 매긴다
  const [rankGrade, setRankGrade] = useState<string | null>(null)
  const [rankAllExams, setRankAllExams] = useState<Exam[]>([])
  const [rankLoading, setRankLoading] = useState(false)
  const [rankLoaded, setRankLoaded] = useState(false)
  const [rankFocusStudentId, setRankFocusStudentId] = useState<string | null>(null)
  const [rankSearchText, setRankSearchText] = useState('')

  useEffect(() => { fetchData() }, [])

  // 등수 탭을 처음 열 때만 전체 코어테스트 점수를 한 번 불러온다 (학생별로 나눠 불러오던 다른 탭과 달리
  // 등수는 학년 전체를 비교해야 해서 전체 조회가 불가피함 - 대신 탭을 열 때 딱 한 번만)
  useEffect(() => {
    if (activeTab === 'ranking' && isAdmin() && !rankLoaded && !rankLoading) {
      (async () => {
        setRankLoading(true)
        const rows = await fetchAllRows<Exam>(() =>
          supabase.from('exams').select('*').eq('exam_type', '코어테스트').not('score', 'is', null).order('exam_date', { ascending: true })
        )
        setRankAllExams(rows)
        setRankLoaded(true)
        setRankLoading(false)
      })()
    }
  }, [activeTab])

  const rankStudentMap = new Map(students.map((s) => [s.id, s]))
  const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']
  const rankGradesAvailable = Array.from(new Set(
    rankAllExams.map((e) => rankStudentMap.get(e.student_id)?.grade).filter((g): g is string => !!g)
  )).sort((a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b))

  // 선택한 학년의 코어테스트를 "연월 + 회차"별로 묶어 세션(=매달 한 번씩 보는 그 회차)마다 등수를 매긴다.
  // 동점자는 공동 순위(1,1,3 식)로 처리
  function buildRankSessions(grade: string) {
    const rowsForGrade = rankAllExams.filter((e) => rankStudentMap.get(e.student_id)?.grade === grade)
    const groups = new Map<string, { yearMonth: string; title: string; rows: Exam[] }>()
    rowsForGrade.forEach((e) => {
      const yearMonth = e.exam_date.slice(0, 7)
      const title = e.title || '코어테스트'
      const key = `${yearMonth}__${title}`
      if (!groups.has(key)) groups.set(key, { yearMonth, title, rows: [] })
      groups.get(key)!.rows.push(e)
    })
    return Array.from(groups.values()).map((g) => {
      // 같은 세션에 학생당 여러 건이 잘못 들어간 경우 가장 최근 것만 사용
      const byStudent = new Map<string, Exam>()
      g.rows.forEach((e) => {
        const existing = byStudent.get(e.student_id)
        if (!existing || e.exam_date >= existing.exam_date) byStudent.set(e.student_id, e)
      })
      const entries = Array.from(byStudent.values())
        .map((e) => ({
          studentId: e.student_id,
          name: rankStudentMap.get(e.student_id)?.name ?? '알수없음',
          score: e.score as number, total: e.total_score,
          pct: e.total_score > 0 ? Math.round(((e.score as number) / e.total_score) * 100) : 0,
          examDate: e.exam_date,
        }))
        .sort((a, b) => b.pct - a.pct)
      let rank = 0, prevPct: number | null = null
      const rankedEntries = entries.map((en, i) => {
        if (en.pct !== prevPct) rank = i + 1
        prevPct = en.pct
        return { ...en, rank }
      })
      return { key: `${g.yearMonth}__${g.title}`, yearMonth: g.yearMonth, title: g.title, entries: rankedEntries }
    }).sort((a, b) => b.yearMonth.localeCompare(a.yearMonth) || b.title.localeCompare(a.title))
  }

  const rankSessions = rankGrade ? buildRankSessions(rankGrade) : []

  function studentRankTrend(studentId: string) {
    return rankSessions
      .map((s) => ({ yearMonth: s.yearMonth, title: s.title, total: s.entries.length, entry: s.entries.find((e) => e.studentId === studentId) }))
      .filter((x) => x.entry)
      .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth) || a.title.localeCompare(b.title))
  }

  useEffect(() => {
    if (!selectedStudent) return
    const sid = selectedStudent.id
    async function fetchStudentProgress() {
      // 학습지/진도체크/교재/평가 기록은 전부 이 학생 것만 걸러서 가져온다 - 예전엔 전체 학생의
      // 진도체크(16,000행+)를 페이지 열 때마다 통째로 불러왔는데, 실제로는 화면에 학생을 선택했을 때
      // 그 학생 것만 쓰였어서 낭비였음
      const [{ data: pcData }, { data: tbData }, { data: dtData }, { data: wsData }, { data: examData }, { data: epData }] = await Promise.all([
        supabase.from('progress_checks').select('*').eq('student_id', sid),
        supabase.from('student_textbooks').select('*').eq('student_id', sid),
        supabase.from('class_sessions').select('session_date, daily_test_unit, daily_test_score')
          .eq('student_id', sid).not('daily_test_score', 'is', null).order('session_date', { ascending: false }),
        supabase.from('student_worksheets').select('*').eq('student_id', sid),
        supabase.from('exams').select('*').eq('student_id', sid).order('exam_date', { ascending: true }),
        supabase.from('student_exam_prep').select('*, inner_enough(*)').eq('student_id', sid).order('exam_date', { ascending: true }),
      ])
      if (pcData) setProgressChecks(pcData)
      if (tbData) {
        setStudentTextbooks((prev) => [
          ...prev.filter((t) => t.student_id !== sid),
          ...tbData,
        ])
      }
      setDailyTestSessions(dtData ?? [])
      if (wsData) setWorksheets(wsData)
      if (examData) setExams(examData)
      if (epData) setExamPreps(epData)
    }
    fetchStudentProgress()
  }, [selectedStudent])

  // 권한 체크: 관리자는 전부, 강사는 본인 입력분만
  function canDelete(teacherName: string | null | undefined) {
    if (isAdmin()) return true
    return teacherName === currentUser?.name
  }

  // 평가 기록 삭제
  async function deleteExam(examId: string) {
    if (!confirm('이 평가 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    setDeleting(examId)
    const { error } = await supabase.from('exams').delete().eq('id', examId)
    if (!error) setExams((prev) => prev.filter((e) => e.id !== examId))
    else alert('삭제 실패: ' + error.message)
    setDeleting(null)
  }

  // 학습지 기록 삭제
  async function deleteWorksheet(wsId: string) {
    if (!confirm('이 학습지 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    setDeleting(wsId)
    const { error } = await supabase.from('student_worksheets').delete().eq('id', wsId)
    if (!error) setWorksheets((prev) => prev.filter((w) => w.id !== wsId))
    else alert('삭제 실패: ' + error.message)
    setDeleting(null)
  }

  async function fetchData() {
    setLoading(true)
    // progress_checks(16,000행+)/exams/student_exam_prep/학습지 상세는 학생을 선택했을 때만 실제로 쓰이므로
    // (아래 fetchStudentProgress 참고) 여기서는 전체를 매번 불러오지 않는다. 학습지는 "과제기록 있는 학생"
    // 표시(진하게)에만 필요해서 학생 id만 가볍게 가져온다.
    const [{ data: studentData }, wsIdRows, { data: conceptData }, { data: tbData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      fetchAllRows<{ student_id: string }>(() => supabase.from('student_worksheets').select('student_id')),
      supabase.from('concepts').select('*').order('grade').order('semester').order('concept_order'),
      supabase.from('student_textbooks').select('*').limit(5000),
    ])
    if (studentData) setStudents(studentData)
    setWorksheetHasRecordIds(new Set(wsIdRows.map((w) => w.student_id)))
    if (conceptData) setConcepts(conceptData)
    if (tbData) setStudentTextbooks(tbData)
    setLoading(false)
  }

  const currentGrades = GRADE_GROUPS.find((g) => g.label === selectedGroup)?.grades ?? []
  const teachers = [...new Set(
    students.flatMap((s) => (s.teacher_name ?? '').split(/[,，、]/).map((t) => t.trim()).filter(Boolean))
  )].sort()

  // 직원(행정)도 보고서 발송 업무를 할 수 있어야 함
  const myStudents = students.filter((s) => {
    if (canManageAllStudents()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const ts = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return ts.includes(currentUser.name)
  })

  const filteredStudents = myStudents.filter((s) => {
    const gradeMatch = currentGrades.some((g) =>
      selectedGroup === '초등' ? s.grade?.includes('초') && s.grade?.includes(g.replace('초','')) :
      selectedGroup === '중등' ? s.grade?.includes('중') :
      s.grade?.includes('고')
    )
    const gradeFilterMatch = selectedGrade ? s.grade === selectedGrade : true
    const teacherMatch = selectedTeacher
      ? ((s.teacher_name ?? '').split(/[,，、]/).map((t) => t.trim()).includes(selectedTeacher))
      : true
    const searchMatch = s.name.includes(searchText) || s.school?.includes(searchText)
    return gradeMatch && gradeFilterMatch && teacherMatch && searchMatch
  })

  // ── 초등용: 단원 × 레벨 테이블 ──
  // 같은 단원(예: 4단원)은 단원명이 기록마다 달라도 한 행으로 합친다
  function getStudentUnits(studentId: string) {
    const studentWS = worksheets
      .filter((w) => w.student_id === studentId)
      .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
    const map = new Map<string, { grade_level: string; unit: string; unit_name: string }>()
    studentWS.forEach((w) => {
      const key = `${w.grade_level}__${w.unit}`
      const existing = map.get(key)
      if (!existing) {
        map.set(key, { grade_level: w.grade_level, unit: w.unit, unit_name: w.unit_name ?? '' })
      } else if (w.unit_name && !existing.unit_name) {
        map.set(key, { ...existing, unit_name: w.unit_name })
      }
    })
    return Array.from(map.values())
  }

  // 같은 단원 × 같은 레벨의 학습지를 여러 번 했다면 전부 반환 (2차/3차 표시용)
  function getRecords(studentId: string, gradeLevel: string, unit: string, level: number) {
    return worksheets
      .filter((w) =>
        w.student_id === studentId && w.grade_level === gradeLevel &&
        w.unit === unit && w.current_level === level
      )
      .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
  }

  function getUsedLevels(studentId: string) {
    const levels = [...new Set(worksheets.filter((w) => w.student_id === studentId).map((w) => w.current_level))].sort((a, b) => a - b)
    return levels.length > 0 ? levels : [1.0, 1.5, 2.0, 2.5, 3.0]
  }

  function getCellStyle(record: WorksheetRecord | null) {
    if (!record) return { bg: 'bg-white', text: '-', textColor: 'text-gray-300' }
    if (record.status === 'assigned') return { bg: 'bg-white border border-blue-200', text: '진행중', textColor: 'text-gray-800' }
    if (record.status === 'similar_assigned' || record.status === 'similar_submitted') return { bg: 'bg-purple-50 border border-purple-200', text: '오답유사', textColor: 'text-[#712B13]' }
    if (record.status === 'submitted') return { bg: 'bg-orange-50 border border-orange-200', text: '채점대기', textColor: 'text-orange-500' }
    if (record.score != null) {
      if (record.score >= 85) return { bg: 'bg-green-100', text: `${record.score}점`, textColor: 'text-green-700' }
      if (record.score >= 80) return { bg: 'bg-yellow-100', text: `${record.score}점`, textColor: 'text-yellow-700' }
      return { bg: 'bg-red-100', text: `${record.score}점`, textColor: 'text-red-600' }
    }
    return { bg: 'bg-white', text: '-', textColor: 'text-gray-300' }
  }

  // ── 중등용: 단원/차시별 1차/오답유사 점수 ──
  function getMiddleUnitGroups(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId && w.worksheet_type !== 'twin')
    const unitMap: Record<string, WorksheetRecord[]> = {}
    studentWS.forEach((w) => {
      const key = `${w.unit}__${w.unit_name ?? ''}`
      if (!unitMap[key]) unitMap[key] = []
      unitMap[key].push(w)
    })
    return Object.entries(unitMap).map(([key, records]) => {
      const [unit, unit_name] = key.split('__')
      const mainRecords = records.filter((r) => r.worksheet_type === 'main').sort(
        (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      )
      const similarRecords = records.filter((r) => r.worksheet_type === 'similar').sort(
        (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      )
      return { unit, unit_name, mainRecords, similarRecords, allRecords: records }
    })
  }

  function getTwinGroups(studentId: string) {
    const twinWS = worksheets.filter((w) => w.student_id === studentId && w.worksheet_type === 'twin')
    // 각 레코드별로 독립 그룹 (같은 단원도 차수별로 개별 표시)
    // unit_name은 "개념1, 개념2, ..." 형태 → 첫개념~마지막개념으로 요약
    return twinWS
      .sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
      .map(w => {
        const conceptList = (w.unit_name ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
        const first = conceptList[0] ?? ''
        const last = conceptList[conceptList.length - 1] ?? ''
        const rangeLabel = !first ? '' : first === last ? first : `${first} ~ ${last}`
        return { unit: w.unit ?? '', rangeLabel, record: w }
      })
  }

  function scoreColor(score: number | null) {
    if (score == null) return 'text-gray-400'
    if (score >= 85) return 'text-green-600'
    if (score >= 80) return 'text-yellow-600'
    return 'text-red-500'
  }

  function scoreBg(score: number | null) {
    if (score == null) return 'bg-white'
    if (score >= 85) return 'bg-green-50'
    if (score >= 80) return 'bg-yellow-50'
    return 'bg-red-50'
  }

  const isMiddleOrHigh = selectedStudent
    ? selectedStudent.grade.includes('중') || selectedStudent.grade.includes('고')
    : false

  const studentUnits = selectedStudent && !isMiddleOrHigh ? getStudentUnits(selectedStudent.id) : []
  const middleUnitGroups = selectedStudent && isMiddleOrHigh ? getMiddleUnitGroups(selectedStudent.id) : []
  const twinGroups = selectedStudent ? getTwinGroups(selectedStudent.id) : []


  // ── 월간보고서 데이터 로딩 ──
  async function loadMonthlyData(student: Student, year: number, month: number) {
    setMLoading(true)
    setMData(null)
    setMComment('')
    const startStr = `${year}-${String(month).padStart(2,'0')}-01`
    const endDate = new Date(year, month, 0)
    const endStr = `${year}-${String(month).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`

    const [{ data: sessionsData }, { data: wsData }, { data: examData }, { data: tbData }, { data: pcData }, { data: schedulesData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', student.id).gte('session_date', startStr).lte('session_date', endStr),
      supabase.from('student_worksheets').select('*').eq('student_id', student.id),
      supabase.from('exams').select('*').eq('student_id', student.id).gte('exam_date', startStr).lte('exam_date', endStr),
      supabase.from('student_textbooks').select('*').eq('student_id', student.id),
      supabase.from('progress_checks').select('*').limit(10000).eq('student_id', student.id),
      supabase.from('schedules').select('*').eq('student_id', student.id).eq('is_active', true),
    ])
    // learning_notes는 전체 테이블에서 limit()으로 긁으면 PostgREST 1000행 상한에 걸려
    // 이 학생 것이 빠질 수 있다 - 이 달 세션 id로만 걸러서 정확히 가져온다.
    const sessionIdsForNotes = (sessionsData ?? []).map((s) => s.id)
    const { data: notesData } = sessionIdsForNotes.length > 0
      ? await supabase.from('learning_notes').select('*').in('session_id', sessionIdsForNotes)
      : { data: [] as any[] }

    const sessions = sessionsData ?? []
    const sessionIds = sessions.map((s: any) => s.id)
    const notes = (notesData ?? []).filter((n: any) => sessionIds.includes(n.session_id))

    const attendance = { 정시: 0, 지각: 0, 결석: 0 }
    notes.forEach((n: any) => {
      if (n.attendance === '정시') attendance.정시++
      else if (n.attendance === '지각') attendance.지각++
      else if (n.attendance === '결석') attendance.결석++
    })
    const totalSessions = sessions.length

    // 결석/미입력 상세 - 정규 시간표 기준 예정일과 실제 출결 비교 (업무 확인용)
    const dayMap: Record<number, string> = { 0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토' }
    const scheduleDays = new Set((schedulesData ?? []).map((s: any) => s.day_of_week))
    const todayStr9 = new Date().toISOString().slice(0, 10)
    const attendanceDetail: { date: string; dow: string; status: string }[] = []
    if (scheduleDays.size > 0) {
      const cursor = new Date(startStr + 'T00:00:00')
      const endD = new Date(endStr + 'T00:00:00')
      while (cursor <= endD) {
        const dateStr = cursor.toISOString().slice(0, 10)
        if (dateStr > todayStr9) break
        const dow = dayMap[cursor.getDay()]
        if (scheduleDays.has(dow)) {
          const session = sessions.find((s: any) => s.session_date === dateStr)
          const note = session ? notes.find((n: any) => n.session_id === session.id) : null
          attendanceDetail.push({ date: dateStr, dow, status: note?.attendance ?? '미입력' })
        }
        cursor.setDate(cursor.getDate() + 1)
      }
    }

    const hwNotes = notes.filter((n: any) => n.attendance !== '결석')
    const hwDone = hwNotes.filter((n: any) => n.workbook_done || n.worksheet_submitted).length
    const hwRate = hwNotes.length > 0 ? Math.round(hwDone / hwNotes.length * 100) : 0

    // 데일리테스트 (고등부는 학습지보다 매 수업 데일리테스트 위주라 이 항목이 훨씬 중요함)
    const dailyTests = sessions
      .filter((s: any) => s.daily_test_score != null)
      .sort((a: any, b: any) => a.session_date.localeCompare(b.session_date))
    const avgDailyTest = dailyTests.length > 0
      ? Math.round(dailyTests.reduce((s: number, ss: any) => s + ss.daily_test_score, 0) / dailyTests.length) : null

    const monthWS = (wsData ?? []).filter((w: any) => w.assigned_at && w.assigned_at.slice(0, 10) >= startStr && w.assigned_at.slice(0, 10) <= endStr)
    const scoredWS = monthWS.filter((w: any) => w.score != null)
    const avgScore = scoredWS.length > 0 ? Math.round(scoredWS.reduce((s: number, w: any) => s + w.score, 0) / scoredWS.length) : null
    const passedWS = monthWS.filter((w: any) => w.status === 'passed').length
    const passRate = monthWS.length > 0 ? Math.round(passedWS / monthWS.length * 100) : 0

    const WS_STATUS_LABEL: Record<string, string> = {
      assigned: '진행중', submitted: '채점대기', similar_assigned: '오답유사중',
      similar_submitted: '오답유사채점', scored: '결과대기', passed: '완료', retry: '재도전',
    }
    const worksheetDetail = [...monthWS]
      .sort((a: any, b: any) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
      .map((w: any) => ({
        unit: `${w.grade_level} ${w.unit}${w.unit_name ? ' ' + w.unit_name : ''}`.trim(),
        level: w.current_level,
        score: w.score,
        status: WS_STATUS_LABEL[w.status] ?? w.status,
        isSimilar: w.worksheet_type === 'similar',
        assignedAt: w.assigned_at,
      }))

    // 진도표(과정관리)와 동일한 기준으로, 기록이 있는 학년+학기만 회차/진행률로 압축 (generate-report API와 동일 함수 사용 -
    // 여기(미리보기)랑 실제 발송되는 보고서가 서로 다른 로직으로 계산돼서 값이 어긋나는 일이 없도록)
    const curriculumProgress = computeCurriculumProgressGroups(concepts, pcData ?? [])
    const calcProgress = (tbData ?? [])
      .filter((t: any) => t.textbook_type === '연산서')
      .map((tb: any) => ({ name: tb.textbook_name, percent: tb.progress_percent ?? 0, grade: tb.grade, semester: tb.semester }))

    setMData({ totalSessions, attendance, hwRate, avgScore, passRate, monthWS: monthWS.length, worksheetDetail, curriculumProgress, calcProgress, monthExams: examData ?? [], student, year, month, attendanceDetail, dailyTests, avgDailyTest })
    setMLoading(false)
  }

  async function generateAIComment() {
    if (!mData) return
    setMGenerating(true)
    try {
      const prompt = `다음은 수학 학원 학생의 한 달 학습 데이터입니다. 학부모에게 보내는 따뜻하고 전문적인 한 줄 평(2~3문장)을 작성해주세요. 이모지 사용 금지. 학생 이름: ${mData.student.name}, 학년: ${mData.student.grade}, 수업 횟수: ${mData.totalSessions}회, 출결: 정시 ${mData.attendance.정시}회/지각 ${mData.attendance.지각}회/결석 ${mData.attendance.결석}회, 과제달성률: ${mData.hwRate}%, 학습지 평균: ${mData.avgScore ?? '미채점'}점, 통과율: ${mData.passRate}%, 교재진도: ${mData.tbProgress.map((t: any) => t.name + ' ' + t.rate + '%').join(', ')}`
      const res = await fetch('/api/generate-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
      const data = await res.json()
      setMComment(data.message ?? '')
    } catch { setMComment('') }
    setMGenerating(false)
  }

  async function saveAsImage() {
    if (!reportRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const el = reportRef.current; const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: 'white', width: el.offsetWidth, height: el.offsetHeight, windowWidth: el.offsetWidth, windowHeight: el.offsetHeight, imageTimeout: 0, allowTaint: true })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${mData?.student?.name}_${mData?.year}년${mData?.month}월_학습보고서.png`
    a.click()
    // 이미지를 저장(=발송 준비)하는 시점에 앱 알림을 켜둔 학부모/학생에게도 푸시 발송
    if (mData?.student?.id) {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: { studentIds: [mData.student.id] },
          payload: {
            title: `${mData.student.name} 학생 ${mData.year}년 ${mData.month}월 학습보고서`,
            body: '이번 달 학습보고서가 도착했어요. 눌러서 확인해보세요.',
            tag: 'monthly-report',
          },
        }),
      }).catch(() => {})
    }
  }

  // ── 성적표(코어테스트+학습지) 데이터 로딩 ──
  // 코어테스트 점수는 exams 테이블에 exam_type='코어테스트'로 저장돼 있고(별도 core_tests 테이블은 예전에
  // 쓰다 만 것이라 비어있음), 학습지 단원 대분류는 student_worksheets.unit 필드가 "V. 도형의 성질" 처럼
  // 이미 대단원 단위로 깔끔하게 들어있어서 이 값 그대로 그룹핑 기준으로 쓴다.
  async function loadGradeData(student: Student) {
    setGLoading(true)
    setGData(null)
    const [{ data: examData }, { data: wsData }] = await Promise.all([
      supabase.from('exams').select('*').eq('student_id', student.id).eq('exam_type', '코어테스트').order('exam_date', { ascending: true }),
      supabase.from('student_worksheets').select('*').eq('student_id', student.id).not('score', 'is', null).order('assigned_at', { ascending: true }),
    ])

    const coreTests = (examData ?? []).filter((e: any) => e.score != null)
    const recentCore = coreTests.slice(-6) // 최근 6회까지만 추이 차트에 표시
    const pct = (e: any) => e.total_score > 0 ? Math.round((e.score / e.total_score) * 100) : null
    const corePts = recentCore.map((e: any) => ({
      date: e.exam_date,
      dateLabel: `${Number(e.exam_date.slice(5, 7))}/${Number(e.exam_date.slice(8, 10))}`,
      title: e.title || '코어테스트',
      range: e.unit_name || null, // 시험범위 - 코어테스트 일괄입력 시 직접 입력한 값
      pct: pct(e), score: e.score, total: e.total_score,
    }))
    const latestCore = recentCore[recentCore.length - 1] ?? null
    const prevCore = recentCore.length > 1 ? recentCore[recentCore.length - 2] : null
    const coreAvgPct = corePts.length > 0 ? Math.round(corePts.reduce((s: number, c: any) => s + (c.pct ?? 0), 0) / corePts.length) : null
    const coreBestPct = corePts.length > 0 ? Math.max(...corePts.map((c: any) => c.pct ?? 0)) : null
    const coreTrend = latestCore && prevCore
      ? (pct(latestCore)! > pct(prevCore)! ? '상승' : pct(latestCore)! === pct(prevCore)! ? '유지' : '하락')
      : null

    // 학습지 단원(대단원)별 평균 - 최근 학습지들을 unit 기준으로 묶어 평균 점수 계산, 최근에 한 단원 위주로 최대 7개
    const wsAll = wsData ?? []
    const unitMap = new Map<string, { scores: number[]; lastDate: string }>()
    wsAll.forEach((w: any) => {
      const key = w.unit || '기타'
      const existing = unitMap.get(key)
      if (existing) { existing.scores.push(w.score); if (w.assigned_at > existing.lastDate) existing.lastDate = w.assigned_at }
      else unitMap.set(key, { scores: [w.score], lastDate: w.assigned_at })
    })
    const unitStats = Array.from(unitMap.entries())
      .map(([unit, v]) => ({ unit, avg: Math.round(v.scores.reduce((s, x) => s + x, 0) / v.scores.length), count: v.scores.length, lastDate: v.lastDate }))
      .sort((a, b) => b.lastDate.localeCompare(a.lastDate))
      .slice(0, 7)

    const wsAvg = wsAll.length > 0 ? Math.round(wsAll.reduce((s: number, w: any) => s + w.score, 0) / wsAll.length) : null
    const wsPassRate = wsAll.length > 0 ? Math.round(wsAll.filter((w: any) => w.status === 'passed').length / wsAll.length * 100) : null

    setGData({
      student, coreTests: corePts, latestCorePct: latestCore ? pct(latestCore) : null,
      coreAvgPct, coreBestPct, coreTrend, unitStats, wsAvg, wsPassRate, wsCount: wsAll.length,
      comment: computeGradeComment({ unitStats, coreTrend, latestCorePct: latestCore ? pct(latestCore) : null, coreAvgPct }),
    })
    setGLoading(false)
  }

  // 강점/보완/다음목표 자동 코멘트 - 참고한 영어학원 모의고사 성적표 양식의 로직을 그대로 차용
  function computeGradeComment({ unitStats, coreTrend, latestCorePct, coreAvgPct }: any) {
    if (unitStats.length === 0 && latestCorePct == null) return ''
    const parts: string[] = []
    if (latestCorePct != null) {
      const trendText = coreTrend === '상승' ? '최근 코어테스트 점수가 이전보다 올랐어요. 잘하고 있어요.'
        : coreTrend === '하락' ? '최근 코어테스트 점수가 이전보다 조금 떨어졌어요. 놓친 부분을 같이 짚어볼게요.'
        : '코어테스트 점수가 안정적으로 유지되고 있어요.'
      parts.push(trendText)
    }
    if (unitStats.length > 0) {
      const sorted = [...unitStats].sort((a, b) => b.avg - a.avg)
      const best = sorted[0]
      const worst = sorted[sorted.length - 1]
      if (best.unit !== worst.unit) {
        parts.push(`강점 단원은 "${best.unit}"(평균 ${best.avg}점)이고, 보완이 필요한 단원은 "${worst.unit}"(평균 ${worst.avg}점)이에요.`)
      } else {
        parts.push(`"${best.unit}" 단원 평균이 ${best.avg}점이에요.`)
      }
    }
    return parts.join(' ')
  }

  const myStudentsForGrade = students.filter((s) => {
    if (canManageAllStudents()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    return s.teacher_name.split(/[,，、]/).map((t: string) => t.trim()).includes(currentUser.name)
  }).filter((s) => s.name.includes(gSearchText) || s.school?.includes(gSearchText))

  async function saveGradeAsImage() {
    if (!gradeRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const el = gradeRef.current
    const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: 'white', width: el.offsetWidth, height: el.offsetHeight, windowWidth: el.offsetWidth, windowHeight: el.offsetHeight, imageTimeout: 0, allowTaint: true })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${gData?.student?.name}_성적표.png`
    a.click()
    // 이미지를 저장(=발송 준비)하는 시점에 앱 알림을 켜둔 학부모/학생에게도 푸시 발송
    if (gData?.student?.id) {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: { studentIds: [gData.student.id] },
          payload: {
            title: `${gData.student.name} 학생 성적표`,
            body: '새 성적표가 도착했어요. 눌러서 확인해보세요.',
            tag: 'grade-report',
          },
        }),
      }).catch(() => {})
    }
  }

  const myStudentsForMonthly = students.filter((s) => {
    if (canManageAllStudents()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    return s.teacher_name.split(/[,，、]/).map((t: string) => t.trim()).includes(currentUser.name)
  }).filter((s) => s.name.includes(mSearchText) || s.school?.includes(mSearchText))

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="보고서" subtitle="학생별 학습 현황" />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2">
          {([['report','학습 보고서'],['monthly','월간 보고서'],['grade','성적표'], ...(isAdmin() ? [['ranking','코어테스트 등수']] : [])] as [string,string][]).map(([tab,label]) => (
            <button key={tab} onClick={() => setActiveTab(tab as 'report'|'monthly'|'grade'|'ranking')}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={activeTab === tab ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ 월간보고서 탭 ══ */}
        {activeTab === 'monthly' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학생 · 월 선택</p>
              <input value={mSearchText} onChange={e => setMSearchText(e.target.value)} placeholder="이름 검색"
                className="w-full text-sm rounded-xl px-3 py-2 mb-3 outline-none"
                style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }} />
              <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
                {myStudentsForMonthly.map(s => (
                  <button key={s.id} onClick={() => { setMStudent(s); setMData(null); setMComment('') }}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                    style={mStudent?.id === s.id ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#374151' }}>
                    {s.name} <span style={{ opacity: 0.5 }}>{s.grade}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <select value={mYear} onChange={e => setMYear(Number(e.target.value))}
                  className="text-sm rounded-xl px-3 py-2 outline-none flex-1"
                  style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  {[2024,2025,2026].map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select value={mMonth} onChange={e => setMMonth(Number(e.target.value))}
                  className="text-sm rounded-xl px-3 py-2 outline-none flex-1"
                  style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
                <button onClick={() => mStudent && loadMonthlyData(mStudent, mYear, mMonth)}
                  disabled={!mStudent || mLoading}
                  className="px-4 py-2 rounded-xl text-sm font-bold"
                  style={{ background: mStudent ? '#1a1a2e' : '#e5e7eb', color: mStudent ? 'white' : '#9ca3af' }}>
                  {mLoading ? '로딩...' : '불러오기'}
                </button>
              </div>
            </div>

            {mData && (
              <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">선생님 한 줄 평</p>
                  <button onClick={generateAIComment} disabled={mGenerating}
                    className="text-xs px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5"
                    style={{ background: '#F0FBF7', color: '#085041', border: '1px solid #9FE1CB' }}>
                    <i className="ti ti-sparkles" style={{ fontSize: 12 }} />
                    {mGenerating ? 'AI 생성 중...' : 'AI 자동생성'}
                  </button>
                </div>
                <textarea value={mComment} onChange={e => setMComment(e.target.value)}
                  placeholder="학부모에게 전달할 한 줄 평을 입력하거나 AI 자동생성을 눌러주세요" rows={3}
                  className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none"
                  style={{ background: '#f9fafb', border: '1px solid #e5e7eb', lineHeight: 1.6 }} />
              </div>
            )}

            {mData && (
              <>
                {/* 미입력 경고 (전송 전 확인용, 캡처 이미지에는 포함 안 됨) */}
                {mData.attendanceDetail?.some((a: any) => a.status === '미입력') && (
                  <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 12, padding: '10px 14px', marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#9a3412', marginBottom: 4 }}>
                      ⚠ 학습일지 미입력 {mData.attendanceDetail.filter((a: any) => a.status === '미입력').length}건
                    </div>
                    <div style={{ fontSize: 11, color: '#c2410c' }}>
                      {mData.attendanceDetail.filter((a: any) => a.status === '미입력')
                        .map((a: any) => `${Number(a.date.slice(5,7))}/${Number(a.date.slice(8,10))}(${a.dow})`).join(', ')}
                      {' '}· 결석인지 미기록인지 선생님께 확인 후 발송해주세요
                    </div>
                  </div>
                )}

                {/* 보고서 카드 (이미지 캡처 대상) - 흰 배경 + 네이비/오렌지 배색 */}
                <div ref={reportRef} style={{ background: 'white', borderRadius: 20, padding: 28, fontFamily: 'Pretendard, sans-serif', border: '1px solid #e5e7eb' }}>
                  {/* 헤더 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <img src="/icon-192.png" alt="" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 10, color: '#D85A30', fontWeight: 500, letterSpacing: 2, marginBottom: 4 }}>수학의지혜 · MONTHLY REPORT</div>
                        <div style={{ fontSize: 22, fontWeight: 500, color: '#0f3460' }}>{mData.student.name}</div>
                        <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{mData.student.school} · {mData.student.grade} · {currentUser?.name} 선생님</div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 32, fontWeight: 500, color: '#0f3460', lineHeight: 1 }}>{mData.month}</div>
                      <div style={{ fontSize: 10, color: '#9ca3af' }}>월 보고서 · {mData.year}</div>
                    </div>
                  </div>
                  <div style={{ height: 1, background: 'rgba(15,52,96,0.15)', marginBottom: 20 }} />

                  {/* 출결 + 과제 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                    <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460' }}>
                      <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>출결 현황</div>
                      <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: '#0f3460' }}>{mData.totalSessions}<span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 2 }}>회</span></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#0f3460' }}>정시 {mData.attendance.정시}</span>
                        <span style={{ fontSize: 10, color: '#D85A30' }}>지각 {mData.attendance.지각}</span>
                        <span style={{ fontSize: 10, color: '#dc2626' }}>결석 {mData.attendance.결석}</span>
                      </div>
                    </div>
                    <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460' }}>
                      <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>과제 달성률</div>
                      <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 6, color: '#0f3460' }}>{mData.hwRate}<span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 1 }}>%</span></div>
                      <div style={{ height: 4, background: '#e9edf3', borderRadius: 4 }}>
                        <div style={{ height: 4, borderRadius: 4, width: `${mData.hwRate}%`, background: mData.hwRate >= 80 ? '#0f3460' : mData.hwRate >= 60 ? '#D85A30' : '#dc2626' }} />
                      </div>
                    </div>
                  </div>

                  {/* 출결 상세 (결석일 표시) */}
                  {mData.attendanceDetail && mData.attendanceDetail.length > 0 && (() => {
                    const absentDates = mData.attendanceDetail.filter((a: any) => a.status === '결석')
                    return (
                      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>수업 일정</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {mData.attendanceDetail.map((a: any, i: number) => {
                            const isAbsent = a.status === '결석'
                            const isLate = a.status === '지각'
                            const noEntry = a.status === '미입력'
                            return (
                              <div key={i} title={`${a.date} (${a.dow}) · ${a.status}`}
                                style={{
                                  minWidth: 34, textAlign: 'center', borderRadius: 8, padding: '4px 5px',
                                  background: isAbsent ? '#fee2e2' : noEntry ? '#f1f2f4' : 'white',
                                  border: isAbsent ? '1px solid #dc2626' : '1px solid #e9edf3',
                                }}>
                                <div style={{ fontSize: 9, fontWeight: 500, color: isAbsent ? '#dc2626' : isLate ? '#D85A30' : noEntry ? '#9ca3af' : '#0f3460' }}>
                                  {Number(a.date.slice(5,7))}/{Number(a.date.slice(8,10))}
                                </div>
                                <div style={{ fontSize: 8, color: '#9ca3af', marginTop: 1 }}>{a.dow}</div>
                              </div>
                            )
                          })}
                        </div>
                        {absentDates.length > 0 && (
                          <div style={{ marginTop: 10, fontSize: 10, color: '#dc2626', lineHeight: 1.6 }}>
                            결석 {absentDates.length}회 · {absentDates.map((a: any) => `${Number(a.date.slice(5,7))}/${Number(a.date.slice(8,10))}(${a.dow})`).join(', ')}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* 데일리테스트 - 고등부는 학습지보다 매 수업 데일리테스트가 핵심이라 별도 섹션으로 표시 */}
                  {mData.dailyTests?.length > 0 && (
                    <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>데일리테스트</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 10 }}>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 500, color: '#0f3460' }}>{mData.dailyTests.length}</div>
                          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>응시 횟수</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 500, color: mData.avgDailyTest != null ? (mData.avgDailyTest >= 85 ? '#0f3460' : mData.avgDailyTest >= 70 ? '#D85A30' : '#dc2626') : '#9ca3af' }}>
                            {mData.avgDailyTest ?? '-'}
                          </div>
                          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>평균점수</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid #e9edf3' }}>
                        {mData.dailyTests.map((t: any, i: number) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 10, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {Number(t.session_date.slice(5,7))}/{Number(t.session_date.slice(8,10))}{t.daily_test_unit ? ` · ${t.daily_test_unit}` : ''}
                            </span>
                            <span style={{ fontSize: 10, fontWeight: 500, flexShrink: 0, color: t.daily_test_score >= 85 ? '#0f3460' : t.daily_test_score >= 70 ? '#D85A30' : '#dc2626' }}>
                              {t.daily_test_score}점
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 학습지 */}
                  {mData.monthWS > 0 && (
                    <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>학습지 현황</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                        <div><div style={{ fontSize: 18, fontWeight: 500, color: '#0f3460' }}>{mData.monthWS}</div><div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>총 학습지</div></div>
                        <div><div style={{ fontSize: 18, fontWeight: 500, color: mData.avgScore != null ? (mData.avgScore >= 85 ? '#0f3460' : mData.avgScore >= 70 ? '#D85A30' : '#dc2626') : '#9ca3af' }}>{mData.avgScore ?? '-'}</div><div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>평균점수</div></div>
                        <div><div style={{ fontSize: 18, fontWeight: 500, color: mData.passRate >= 80 ? '#0f3460' : '#D85A30' }}>{mData.passRate}%</div><div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>통과율</div></div>
                      </div>
                      {mData.worksheetDetail?.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e9edf3', display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {mData.worksheetDetail.map((w: any, i: number) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: 10, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {w.unit} · {w.level}레벨{w.isSimilar ? ' (오답유사)' : ''}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 500, color: w.score != null ? (w.score >= 85 ? '#0f3460' : w.score >= 70 ? '#D85A30' : '#dc2626') : '#9ca3af', flexShrink: 0 }}>
                                {w.score != null ? `${w.score}점` : w.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 교재 진도 - 기록이 있는 학년/학기만, 회차 + 진행률로 압축해서 보여줌 (실제 발송 보고서와 동일 로직) */}
                  {(mData.curriculumProgress.length > 0 || mData.calcProgress.length > 0) && (
                    <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>교재 진도</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {mData.curriculumProgress.map((g: any, i: number) => (
                          <div key={i}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: '#374151' }}>{g.grade} {g.semester}학기</span>
                              <span style={{ fontSize: 9, fontWeight: 500, color: '#0f3460', background: '#e6ecf5', borderRadius: 8, padding: '1px 6px' }}>{g.round}회독</span>
                              <span style={{ fontSize: 10, fontWeight: 500, color: g.rate >= 80 ? '#0f3460' : '#D85A30', marginLeft: 'auto' }}>{g.rate}%</span>
                            </div>
                            <div style={{ height: 4, background: '#e9edf3', borderRadius: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, width: `${g.rate}%`, background: g.rate >= 80 ? '#0f3460' : '#D85A30' }} />
                            </div>
                          </div>
                        ))}
                        {mData.calcProgress.map((tb: any, i: number) => (
                          <div key={`c${i}`} style={{ borderTop: i === 0 && mData.curriculumProgress.length > 0 ? '1px solid #e9edf3' : undefined, paddingTop: i === 0 && mData.curriculumProgress.length > 0 ? 8 : 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 9, fontWeight: 500, color: '#993C1D', background: '#FAECE7', borderRadius: 8, padding: '1px 6px' }}>연산서</span>
                              <span style={{ fontSize: 10, color: '#374151' }}>{tb.name}{tb.grade ? ` · ${tb.grade}${tb.semester ? ` ${tb.semester}학기` : ''}` : ''}</span>
                              <span style={{ fontSize: 10, fontWeight: 500, color: '#D85A30', marginLeft: 'auto' }}>{tb.percent}%</span>
                            </div>
                            <div style={{ height: 4, background: '#e9edf3', borderRadius: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, width: `${tb.percent}%`, background: '#D85A30' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 평가 */}
                  {mData.monthExams.length > 0 && (
                    <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>평가 성적</div>
                      {mData.monthExams.map((e: any) => {
                        const pct = e.total_score > 0 ? Math.round(e.score / e.total_score * 100) : null
                        return (
                          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: '#374151' }}>
                              {[e.exam_type, e.title, e.unit, e.unit_name].filter(Boolean).join(' · ')}
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 500, color: pct != null ? (pct >= 85 ? '#0f3460' : pct >= 70 ? '#D85A30' : '#dc2626') : '#9ca3af' }}>
                              {e.score != null ? `${e.score}/${e.total_score} (${pct}%)` : '미채점'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 한 줄 평 */}
                  {mComment && (
                    <div style={{ background: '#FAECE7', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #D85A30', marginBottom: 8 }}>
                      <div style={{ fontSize: 9, color: '#993C1D', fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>선생님 코멘트</div>
                      <div style={{ fontSize: 11, color: '#712B13', lineHeight: 1.7 }}>{mComment}</div>
                    </div>
                  )}

                  {/* 푸터 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: '#9ca3af' }}>수학의지혜 학원</div>
                    <div style={{ fontSize: 9, color: '#9ca3af' }}>{mData.year}.{String(mData.month).padStart(2,'0')}</div>
                  </div>
                </div>

                <button onClick={saveAsImage}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: '#1a1a2e', color: 'white' }}>
                  <i className="ti ti-download" style={{ fontSize: 16 }} />
                  이미지 저장 (카카오톡 전송용)
                </button>
              </>
            )}
          </div>
        )}

        {/* ══ 성적표 탭 (코어테스트 + 학습지 누적) ══ */}
        {activeTab === 'grade' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학생 선택</p>
              <input value={gSearchText} onChange={e => setGSearchText(e.target.value)} placeholder="이름 검색"
                className="w-full text-sm rounded-xl px-3 py-2 mb-3 outline-none"
                style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }} />
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {myStudentsForGrade.map(s => (
                  <button key={s.id} onClick={() => { setGStudent(s); loadGradeData(s) }}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                    style={gStudent?.id === s.id ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#374151' }}>
                    {s.name} <span style={{ opacity: 0.5 }}>{s.grade}</span>
                  </button>
                ))}
              </div>
            </div>

            {gLoading && <div className="text-center py-8 text-sm text-gray-400">불러오는 중...</div>}

            {gData && !gLoading && (
              gData.coreTests.length === 0 && gData.unitStats.length === 0 ? (
                <div className="rounded-2xl p-8 text-center" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">아직 코어테스트나 학습지 점수 기록이 없어요</p>
                </div>
              ) : (
                <>
                  <div ref={gradeRef} style={{ background: 'white', borderRadius: 20, padding: 28, fontFamily: 'Pretendard, sans-serif', border: '1px solid #e5e7eb' }}>
                    {/* 헤더 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                      <img src="/icon-192.png" alt="" style={{ width: 36, height: 36, borderRadius: 9 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 10, color: '#D85A30', fontWeight: 500, letterSpacing: 2, marginBottom: 2 }}>수학의지혜 · 성적표</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#0f3460' }}>{gData.student.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{gData.student.school} · {gData.student.grade}</div>
                      </div>
                    </div>
                    <div style={{ height: 1, background: 'rgba(15,52,96,0.15)', marginBottom: 20 }} />

                    {/* 요약 지표 */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460' }}>
                        <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>최근 코어테스트</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#0f3460' }}>{gData.latestCorePct ?? '-'}<span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 2 }}>{gData.latestCorePct != null ? '%' : ''}</span></div>
                        {gData.coreTrend && (
                          <div style={{ fontSize: 10, marginTop: 4, fontWeight: 500, color: gData.coreTrend === '상승' ? '#0f3460' : gData.coreTrend === '하락' ? '#dc2626' : '#D85A30' }}>
                            {gData.coreTrend === '상승' ? '▲ 상승' : gData.coreTrend === '하락' ? '▼ 하락' : '● 유지'}
                          </div>
                        )}
                      </div>
                      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460' }}>
                        <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>{gData.coreTests.length}회 평균 · 최고</div>
                        <div style={{ fontSize: 20, fontWeight: 500, color: '#0f3460' }}>{gData.coreAvgPct ?? '-'}<span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 2 }}>%</span></div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4 }}>최고 {gData.coreBestPct ?? '-'}%</div>
                      </div>
                    </div>

                    {/* 코어테스트 추이 차트 */}
                    {gData.coreTests.length > 0 && (
                      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>코어테스트 점수 추이 (최근 {gData.coreTests.length}회)</div>
                        {(() => {
                          const chartW = 400, chartH = 140, padL = 26, padR = 10, padT = 16, padB = 40
                          const innerW = chartW - padL - padR, innerH = chartH - padT - padB
                          const n = gData.coreTests.length
                          const gap = innerW / n
                          const pts = gData.coreTests.map((c: any, i: number) => {
                            const cx = padL + gap * i + gap / 2
                            const cy = padT + innerH - ((c.pct ?? 0) / 100) * innerH
                            return { cx, cy, ...c }
                          })
                          const d = pts.map((p: any, i: number) => `${i === 0 ? 'M' : 'L'}${p.cx},${p.cy}`).join(' ')
                          return (
                            <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" style={{ display: 'block' }}>
                              {[100, 85, 50].map(v => {
                                const y = padT + innerH - (v / 100) * innerH
                                return (
                                  <g key={v}>
                                    <line x1={padL} y1={y} x2={chartW - padR} y2={y} stroke={v === 85 ? 'rgba(15,52,96,0.35)' : '#e5e7eb'} strokeWidth={v === 85 ? 1 : 0.6} strokeDasharray="4 3" />
                                    <text x={padL - 3} y={y + 3} textAnchor="end" fontSize={7.5} fill="#9ca3af">{v}</text>
                                  </g>
                                )
                              })}
                              <path d={d} fill="none" stroke="#0f3460" strokeWidth={2} />
                              {pts.map((p: any, i: number) => (
                                <g key={i}>
                                  <circle cx={p.cx} cy={p.cy} r={3.5} fill="#0f3460" />
                                  <text x={p.cx} y={p.cy - 9} textAnchor="middle" fontSize={9} fontWeight="500" fill="#0f3460">{p.pct}%</text>
                                  <text x={p.cx} y={padT + innerH + 14} textAnchor="middle" fontSize={8.5} fontWeight="500" fill="#374151">{p.dateLabel}</text>
                                  <text x={p.cx} y={padT + innerH + 25} textAnchor="middle" fontSize={7.5} fill="#9ca3af">{p.title}</text>
                                </g>
                              ))}
                            </svg>
                          )
                        })()}
                        {/* 회차별 상세 - 날짜/회차/시험범위를 목록으로도 보여줘 차트 라벨보다 명확하게 확인 가능 */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid #e9edf3' }}>
                          {gData.coreTests.map((c: any, i: number) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                              <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0, width: 34 }}>{c.dateLabel}</span>
                              <span style={{ fontSize: 9, fontWeight: 500, color: '#0f3460', flexShrink: 0 }}>{c.title}</span>
                              <span style={{ fontSize: 10, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {c.range || '시험범위 미입력'}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 500, color: (c.pct ?? 0) >= 85 ? '#0f3460' : (c.pct ?? 0) >= 70 ? '#D85A30' : '#dc2626', flexShrink: 0 }}>{c.pct}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 학습지 단원별 평균 */}
                    {gData.unitStats.length > 0 && (
                      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>학습지 단원별 평균 (최근 {gData.unitStats.length}개 단원)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {gData.unitStats.map((u: any, i: number) => (
                            <div key={i}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                <span style={{ fontSize: 10, color: '#374151', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 8 }}>{u.unit}</span>
                                <span style={{ fontSize: 10, fontWeight: 500, color: u.avg >= 85 ? '#0f3460' : u.avg >= 70 ? '#D85A30' : '#dc2626', flexShrink: 0 }}>{u.avg}점</span>
                              </div>
                              <div style={{ height: 5, background: '#e9edf3', borderRadius: 4 }}>
                                <div style={{ height: 5, borderRadius: 4, width: `${u.avg}%`, background: u.avg >= 85 ? '#0f3460' : u.avg >= 70 ? '#D85A30' : '#dc2626' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 학습지 요약 */}
                    {gData.wsCount > 0 && (
                      <div style={{ background: '#f7f8fa', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #0f3460', marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: '#0f3460', fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>학습지 전체 현황</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                          <div><div style={{ fontSize: 18, fontWeight: 500, color: '#0f3460' }}>{gData.wsCount}</div><div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>총 학습지</div></div>
                          <div><div style={{ fontSize: 18, fontWeight: 500, color: gData.wsAvg != null ? (gData.wsAvg >= 85 ? '#0f3460' : gData.wsAvg >= 70 ? '#D85A30' : '#dc2626') : '#9ca3af' }}>{gData.wsAvg ?? '-'}</div><div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>평균점수</div></div>
                          <div><div style={{ fontSize: 18, fontWeight: 500, color: (gData.wsPassRate ?? 0) >= 80 ? '#0f3460' : '#D85A30' }}>{gData.wsPassRate ?? '-'}%</div><div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>통과율</div></div>
                        </div>
                      </div>
                    )}

                    {/* 분석 코멘트 */}
                    {gData.comment && (
                      <div style={{ background: '#FAECE7', borderRadius: 12, padding: '12px 14px', borderLeft: '3px solid #D85A30', marginBottom: 8 }}>
                        <div style={{ fontSize: 9, color: '#993C1D', fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>학습 분석</div>
                        <div style={{ fontSize: 11, color: '#712B13', lineHeight: 1.7 }}>{gData.comment}</div>
                      </div>
                    )}

                    {/* 푸터 */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                      <div style={{ fontSize: 9, color: '#9ca3af' }}>수학의지혜 학원</div>
                      <div style={{ fontSize: 9, color: '#9ca3af' }}>{new Date().toISOString().slice(0,10)}</div>
                    </div>
                  </div>

                  <button onClick={saveGradeAsImage}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                    style={{ background: '#1a1a2e', color: 'white' }}>
                    <i className="ti ti-download" style={{ fontSize: 16 }} />
                    이미지 저장 (카카오톡 전송용)
                  </button>
                </>
              )
            )}
          </div>
        )}

        {/* ══ 코어테스트 등수 탭 (관리자 전용) ══ */}
        {activeTab === 'ranking' && isAdmin() && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학년 선택</p>
              {rankLoading && rankGradesAvailable.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-400">코어테스트 점수 불러오는 중...</div>
              ) : rankGradesAvailable.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-400">등록된 코어테스트 점수가 없어요</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {rankGradesAvailable.map((g) => (
                    <button key={g} onClick={() => { setRankGrade(g); setRankFocusStudentId(null); setRankSearchText('') }}
                      className="text-xs px-3.5 py-1.5 rounded-xl font-bold transition-all"
                      style={rankGrade === g ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#374151' }}>
                      {g}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {rankGrade && (
              <>
                {/* 개인 등수 변화 조회 */}
                <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
                  <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학생 개인 등수 변화</p>
                  <input value={rankSearchText} onChange={(e) => setRankSearchText(e.target.value)} placeholder="이름 검색"
                    className="w-full text-sm rounded-xl px-3 py-2 mb-3 outline-none"
                    style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }} />
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                    {students.filter((s) => s.grade === rankGrade && s.name.includes(rankSearchText)).map((s) => (
                      <button key={s.id} onClick={() => setRankFocusStudentId(s.id === rankFocusStudentId ? null : s.id)}
                        className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                        style={rankFocusStudentId === s.id ? { background: '#D85A30', color: 'white' } : { background: '#f3f4f6', color: '#374151' }}>
                        {s.name}
                      </button>
                    ))}
                  </div>

                  {rankFocusStudentId && (() => {
                    const trend = studentRankTrend(rankFocusStudentId)
                    if (trend.length === 0) {
                      return <p className="text-sm text-gray-400 mt-4">이 학생의 코어테스트 기록이 없어요</p>
                    }
                    return (
                      <div className="mt-4 pt-4 space-y-2" style={{ borderTop: '1px solid #f3f4f6' }}>
                        {trend.map((t, i) => {
                          const prev = i > 0 ? trend[i - 1] : null
                          const rankDelta = prev && prev.entry ? prev.entry.rank - (t.entry?.rank ?? 0) : null
                          return (
                            <div key={t.yearMonth + t.title} className="flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ background: '#f9fafb' }}>
                              <div style={{ width: 62, flexShrink: 0 }}>
                                <div className="text-xs font-bold text-gray-700">{t.yearMonth}</div>
                                <div className="text-[10px] text-gray-400">{t.title}</div>
                              </div>
                              <div className="flex-1">
                                <span className="text-lg font-bold" style={{ color: '#0f3460' }}>{t.entry!.rank}</span>
                                <span className="text-xs text-gray-400"> / {t.total}명</span>
                              </div>
                              <div className="text-sm font-bold" style={{ color: t.entry!.pct >= 85 ? '#0f3460' : t.entry!.pct >= 70 ? '#D85A30' : '#dc2626' }}>{t.entry!.pct}%</div>
                              {rankDelta != null && (
                                <div className="text-xs font-bold" style={{ width: 44, textAlign: 'right', color: rankDelta > 0 ? '#0f3460' : rankDelta < 0 ? '#dc2626' : '#9ca3af' }}>
                                  {rankDelta > 0 ? `▲${rankDelta}` : rankDelta < 0 ? `▼${Math.abs(rankDelta)}` : '－'}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>

                {/* 회차별 등수표 */}
                {rankSessions.length === 0 ? (
                  <div className="rounded-2xl p-8 text-center" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
                    <p className="text-sm text-gray-400">이 학년은 아직 코어테스트 기록이 없어요</p>
                  </div>
                ) : (
                  rankSessions.map((session) => (
                    <div key={session.key} className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
                      <div className="flex items-baseline justify-between mb-3">
                        <p className="text-sm font-bold" style={{ color: '#0f3460' }}>{session.yearMonth} · {session.title}</p>
                        <p className="text-xs text-gray-400">{session.entries.length}명 응시</p>
                      </div>
                      <div className="space-y-1.5">
                        {session.entries.map((en) => (
                          <div key={en.studentId} className="flex items-center gap-3 rounded-xl px-3 py-2"
                            style={en.studentId === rankFocusStudentId ? { background: '#FAECE7' } : { background: en.rank <= 3 ? '#f7f8fa' : 'transparent' }}>
                            <div className="text-sm font-bold" style={{ width: 28, flexShrink: 0, color: en.rank === 1 ? '#D85A30' : en.rank <= 3 ? '#0f3460' : '#9ca3af' }}>
                              {en.rank === 1 ? '🥇' : en.rank === 2 ? '🥈' : en.rank === 3 ? '🥉' : en.rank}
                            </div>
                            <div className="text-sm font-medium flex-1" style={{ color: '#374151' }}>{en.name}</div>
                            <div className="text-xs text-gray-400">{en.score}/{en.total}</div>
                            <div className="text-sm font-bold" style={{ width: 44, textAlign: 'right', color: en.pct >= 85 ? '#0f3460' : en.pct >= 70 ? '#D85A30' : '#dc2626' }}>{en.pct}%</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        )}

        {/* ══ 기존 학습보고서 탭 ══ */}
        {activeTab === 'report' && (
          <>
        {/* 학생 선택 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">학생 선택</h3>
          </div>
          <div className="p-3 space-y-3">
            {/* 학교급 탭 */}
            <div className="flex gap-2">
              {GRADE_GROUPS.map((g) => {
                const count = myStudents.filter((s) =>
                  g.label === '초등' ? s.grade?.includes('초') :
                  g.label === '중등' ? s.grade?.includes('중') :
                  s.grade?.includes('고')
                ).length
                return (
                  <button key={g.label}
                    onClick={() => { setSelectedGroup(g.label); setSelectedGrade(null); setSelectedStudent(null) }}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      selectedGroup === g.label ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                    {g.label}
                    <span className={cx('ml-1 text-xs', selectedGroup === g.label ? 'text-blue-200' : 'text-gray-400')}>
                      {count}명
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 학년 필터 */}
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setSelectedGrade(null)}
                className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                  selectedGrade === null ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200')}>
                전체
              </button>
              {currentGrades.map((g) => {
                const count = myStudents.filter((s) => s.grade === g).length
                return (
                  <button key={g} onClick={() => setSelectedGrade(g)}
                    className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                      selectedGrade === g ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200')}>
                    {g} <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>

            {/* 선생님 필터 - 관리자만 */}
            {isAdmin() && teachers.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setSelectedTeacher(null)}
                  className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                    selectedTeacher === null ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                  👩‍🏫 전체
                </button>
                {teachers.map((t) => (
                  <button key={t} onClick={() => setSelectedTeacher(t)}
                    className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                      selectedTeacher === t ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름 또는 학교로 검색"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#9FE1CB]" />

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">해당하는 학생이 없어요</p>
              ) : (
                filteredStudents.map((s) => {
                  const hasRecord = worksheetHasRecordIds.has(s.id)
                  return (
                    <button key={s.id} onClick={() => setSelectedStudent(s)}
                      className={cx('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                        selectedStudent?.id === s.id ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' :
                        hasRecord ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-300' :
                        'bg-white text-gray-400 border-gray-100')}>
                      {s.name}
                      {s.teacher_name && <span className="ml-1 opacity-50 text-[10px]">{s.teacher_name}</span>}
                    </button>
                  )
                })
              )}
            </div>
            <p className="text-[10px] text-gray-400">총 {filteredStudents.length}명 · 과제기록 있는 학생은 진하게 표시</p>
          </div>
        </div>

        {/* 보고서 영역 */}
        {selectedStudent ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* 학생 헤더 */}
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                {selectedStudent.name[0]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{selectedStudent.name}</p>
                <p className="text-xs text-gray-400">
                  {selectedStudent.school} · {selectedStudent.grade}
                  {selectedStudent.teacher_name && ` · ${selectedStudent.teacher_name} 선생님`}
                </p>
              </div>
              <span className={cx('text-xs font-bold px-2 py-1 rounded-full',
                isMiddleOrHigh ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                {isMiddleOrHigh ? '중등/고등 보고서' : '초등 진단표'}
              </span>
            </div>

            {/* ── 교재 진도 보고서 ── */}
            {(() => {
              const myTBs = studentTextbooks.filter((t) => t.student_id === selectedStudent.id)
              if (myTBs.length === 0) return null

              const activeTBs = myTBs.filter(t => t.status === 'assigned')
              const completedTBs = myTBs.filter(t => t.status === 'completed')
              const pausedTBs = myTBs.filter(t => t.status === 'paused')

              const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']
              const TYPE_ORDER: Record<string, number> = { '개념서': 0, '유형서': 1, '심화서': 2, '연산서': 3 }
              const TYPE_STYLE: Record<string, { dot: string; fill: string; text: string; label: string }> = {
                '개념서': { dot: '#EF9F27', fill: '#FAEEDA', text: '#633806', label: '개념' },
                '유형서': { dot: '#639922', fill: '#EAF3DE', text: '#27500A', label: '유형' },
                '심화서': { dot: '#dc2626', fill: '#fee2e2', text: '#991b1b', label: '심화' },
                '연산서': { dot: '#7c3aed', fill: '#ede9fe', text: '#5b21b6', label: '연산' },
              }

              return (
                <div className="border-b border-gray-100">
                  <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}><div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FAECE7" }}><i className="ti ti-books" style={{ fontSize: 14, color: "#993C1D" }} /></div><span className="text-sm font-bold" style={{ color: "#1f2937" }}>교재 진도 현황</span></div>
                  <div className="px-4 py-4 space-y-4">
                    {/* 연산서 - 달성률 바만 표시 */}
                    {activeTBs.filter(tb => tb.textbook_type === '연산서').map((tb) => {
                      const style = TYPE_STYLE['연산서']
                      const percent = tb.progress_percent ?? 0
                      return (
                        <div key={tb.id}>
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                              style={{ background: style.dot, color: '#fff' }}>{style.label}</span>
                            <span className="text-xs font-bold" style={{ color: '#1f2937' }}>{tb.textbook_name}</span>
                            {tb.grade && <span className="text-[10px]" style={{ color: '#9ca3af' }}>{tb.grade} {tb.semester}학기</span>}
                            <span className="ml-auto text-xs font-bold" style={{ color: style.dot }}>{percent}%</span>
                          </div>
                          <div className="h-1.5 rounded-full mb-1" style={{ background: '#f3f0ea' }}>
                            <div className="h-1.5 rounded-full transition-all"
                              style={{ width: `${percent}%`, background: style.dot }} />
                          </div>
                        </div>
                      )
                    })}

                    {/* 진행중 교재 (연산서 제외) - 격자 표시 */}
                    {activeTBs
                      .filter(tb => tb.textbook_type !== '연산서')
                      .sort((a, b) => {
                        const gA = GRADE_ORDER.indexOf(a.grade ?? '')
                        const gB = GRADE_ORDER.indexOf(b.grade ?? '')
                        if (gA !== gB) return gA - gB
                        return (TYPE_ORDER[a.textbook_type] ?? 9) - (TYPE_ORDER[b.textbook_type] ?? 9)
                      })
                      .map((tb) => {
                        if (!tb.grade) return null
                        const tbConcepts = concepts.filter(
                          (c) => c.grade === tb.grade && c.semester === tb.semester
                        )
                        if (tbConcepts.length === 0) return null

                        // 이 교재에서 직접 체크한 기록 + (개념서에 한해) 교재 구분 없던 예전 기록도 포함
                        const myChecks = progressChecks.filter((p) =>
                          p.student_id === selectedStudent.id &&
                          (p.student_textbook_id === tb.id || (!p.student_textbook_id && tb.textbook_type === '개념서'))
                        )

                        const checkedConcepts = tbConcepts.filter((c) =>
                          myChecks.some((p) => p.concept_id === c.id && p.check_count >= 1)
                        )
                        const rate = Math.round(checkedConcepts.length / tbConcepts.length * 100)
                        const style = TYPE_STYLE[tb.textbook_type] ?? TYPE_STYLE['개념서']

                        // 대단원별 그룹
                        const chapters = [...new Set(tbConcepts.map((c) => c.chapter))]

                        return (
                          <div key={tb.id}>
                            {/* 헤더 */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                                style={{ background: style.dot, color: '#fff' }}>
                                {style.label}
                              </span>
                              <span className="text-xs font-bold" style={{ color: '#1f2937' }}>
                                {tb.textbook_name}
                              </span>
                              <span className="text-[10px]" style={{ color: '#1f2937' }}>
                                {tb.grade} {tb.semester}학기
                              </span>
                              <span className="ml-auto text-xs font-bold" style={{ color: style.dot }}>
                                {rate}%
                              </span>
                            </div>

                            {/* 진도율 바 */}
                            <div className="h-1.5 rounded-full mb-3" style={{ background: '#f3f0ea' }}>
                              <div className="h-1.5 rounded-full transition-all"
                                style={{ width: `${rate}%`, background: style.dot }} />
                            </div>

                            {/* 대단원별 정방형 격자 */}
                            <div className="space-y-2">
                              {chapters.map((ch) => {
                                const chConcepts = tbConcepts.filter((c) => c.chapter === ch)
                                return (
                                  <div key={ch}>
                                    <p className="text-[10px] mb-1" style={{ color: '#1f2937' }}>{ch}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {chConcepts.map((c) => {
                                        const check = myChecks.find((p) => p.concept_id === c.id)
                                        const done = check && check.check_count >= 1
                                        const partial = false
                                        return (
                                          <div key={c.id}
                                            title={c.concept_name}
                                            style={{
                                              width: 16, height: 16,
                                              borderRadius: 3,
                                              background: done ? style.dot : partial ? style.fill : '#f3f0ea',
                                              border: `1px solid ${done ? style.dot : partial ? style.dot + '80' : '#e5d5c5'}`,
                                              cursor: 'default',
                                              flexShrink: 0,
                                            }} />
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {/* 범례 */}
                            <div className="flex gap-3 mt-2">
                              <div className="flex items-center gap-1">
                                <div style={{ width:10, height:10, borderRadius:2, background: style.dot }} />
                                <span className="text-[9px]" style={{ color: '#1f2937' }}>완료</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div style={{ width:10, height:10, borderRadius:2, background: style.fill, border: `1px solid ${style.dot}80` }} />
                                <span className="text-[9px]" style={{ color: '#1f2937' }}>진행중</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div style={{ width:10, height:10, borderRadius:2, background: '#f3f0ea', border: '1px solid #9FE1CB60' }} />
                                <span className="text-[9px]" style={{ color: '#1f2937' }}>미진도</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    {/* 완료 교재 - 텍스트만 */}
                    {completedTBs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wide">완료한 교재</p>
                        <div className="flex flex-wrap gap-2">
                          {completedTBs.map(tb => (
                            <div key={tb.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                              style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
                              <i className="ti ti-circle-check" style={{ fontSize: 11, color: '#085041' }} />
                              <span className="text-xs font-medium" style={{ color: '#085041' }}>{tb.textbook_name}</span>
                              {tb.grade && <span className="text-[10px]" style={{ color: '#9FE1CB' }}>{tb.grade} {tb.semester ? `${tb.semester}학기` : ''}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 중단 교재 - 텍스트만 */}
                    {pausedTBs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wide">중단한 교재</p>
                        <div className="flex flex-wrap gap-2">
                          {pausedTBs.map(tb => (
                            <div key={tb.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                              style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                              <i className="ti ti-pause" style={{ fontSize: 11, color: '#9ca3af' }} />
                              <span className="text-xs font-medium text-gray-500">{tb.textbook_name}</span>
                              {tb.grade && <span className="text-[10px] text-gray-400">{tb.grade} {tb.semester ? `${tb.semester}학기` : ''}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* ── 데일리테스트 (고등부는 학습지보다 매 수업 데일리테스트가 핵심) ── */}
            {dailyTestSessions.length > 0 && (() => {
              const sixMonthsAgo = new Date()
              sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
              const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]
              const recentTests = dailyTestSessions.filter((t) => t.session_date >= sixMonthsAgoStr)
              if (recentTests.length === 0) return null
              const avg = Math.round(recentTests.reduce((s, t) => s + t.daily_test_score, 0) / recentTests.length)
              return (
                <div className="border-b border-gray-100">
                  <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAEEDA' }}>
                      <i className="ti ti-pencil" style={{ fontSize: 14, color: '#633806' }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#1f2937' }}>데일리테스트</span>
                    <span className="text-[10px] text-gray-400 ml-1">최근 6개월</span>
                  </div>
                  <div className="px-4 pt-4 pb-3">
                    <div className="rounded-xl px-3 py-3 mb-3" style={{ background: '#FAEEDA' }}>
                      <p className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: '#633806' }}>
                        <i className="ti ti-chart-bar" style={{ fontSize: 10 }} />평균점수
                      </p>
                      <p className="text-xl font-black" style={{ color: '#633806' }}>
                        {avg}<span className="text-xs font-normal ml-0.5">점</span>
                      </p>
                      <p className="text-[10px] mt-1" style={{ color: '#633806', opacity: 0.7 }}>
                        응시 {recentTests.length}회
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {recentTests.slice(0, 20).map((t, i) => {
                        const scoreC = t.daily_test_score >= 85 ? '#27500A' : t.daily_test_score >= 70 ? '#633806' : '#991b1b'
                        const scoreBg = t.daily_test_score >= 85 ? '#EAF3DE' : t.daily_test_score >= 70 ? '#FAEEDA' : '#fee2e2'
                        return (
                          <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 rounded-xl"
                            style={{ background: '#fdf8f5', border: '1px solid #f0e5da' }}>
                            <span className="text-xs text-gray-700 flex-1 min-w-0 truncate">
                              {Number(t.session_date.slice(5,7))}/{Number(t.session_date.slice(8,10))}
                              {t.daily_test_unit ? ` · ${t.daily_test_unit}` : ''}
                            </span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ color: scoreC, background: scoreBg }}>
                              {t.daily_test_score}점
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── 학습지 현황 (레벨 + 쌍둥이 통합) ── */}
            {(() => {
              const sixMonthsAgo = new Date()
              sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
              const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]
              const recentWS = worksheets.filter((w) =>
                w.student_id === selectedStudent.id && w.assigned_at >= sixMonthsAgoStr
              )
              const recentLevel = recentWS.filter(w => w.worksheet_type !== 'twin')
              const hasTwin = twinGroups.length > 0
              const hasLevel = recentLevel.length > 0
              if (!hasLevel && !hasTwin) return null

              // 레벨학습지 통계
              const levelScored = recentLevel.filter((w) => w.score != null)
              const levelAvg = levelScored.length > 0 ? Math.round(levelScored.reduce((s, w) => s + (w.score ?? 0), 0) / levelScored.length) : null
              const passedCount = recentLevel.filter((w) => w.status === 'passed').length
              const passRate = recentLevel.length > 0 ? Math.round(passedCount / recentLevel.length * 100) : 0

              // 쌍둥이 통계
              const twinScored = twinGroups.map(g => g.record).filter(r => r.score != null)
              const twinAvg = twinScored.length > 0 ? Math.round(twinScored.reduce((s, r) => s + (r.score ?? 0), 0) / twinScored.length) : null

              // 레벨학습지 단원별 요약 (unit+unit_name → 첫~마지막 개념)
              const levelGroups = (() => {
                const map: Record<string, WorksheetRecord[]> = {}
                recentLevel.forEach(w => {
                  const key = w.unit ?? ''
                  if (!map[key]) map[key] = []
                  map[key].push(w)
                })
                return Object.entries(map).map(([unit, recs]) => {
                  const names = recs.map(r => r.unit_name ?? '').filter(Boolean)
                  const first = names[0] ?? ''
                  const last = names[names.length - 1] ?? ''
                  const rangeLabel = first && first !== last ? `${first} ~ ${last}` : first
                  const latest = recs.sort((a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime())[0]
                  return { unit, rangeLabel, record: latest, allRecs: recs }
                })
              })()

              return (
                <div className="border-b border-gray-100">
                  <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                      <i className="ti ti-file-text" style={{ fontSize: 14, color: '#993C1D' }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#1f2937' }}>학습지 현황</span>
                    <span className="text-[10px] text-gray-400 ml-1">최근 6개월</span>
                  </div>

                  {/* 평균 요약 카드 */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="grid gap-2" style={{ gridTemplateColumns: hasLevel && hasTwin ? '1fr 1fr' : '1fr' }}>
                      {hasLevel && (
                        <div className="rounded-xl px-3 py-3" style={{ background: '#FAECE7' }}>
                          <p className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: '#993C1D' }}>
                            <i className="ti ti-chart-bar" style={{ fontSize: 10 }} />레벨학습지 평균
                          </p>
                          <p className="text-xl font-black" style={{ color: '#712B13' }}>
                            {levelAvg ?? '-'}<span className="text-xs font-normal ml-0.5">점</span>
                          </p>
                          <p className="text-[10px] mt-1" style={{ color: '#993C1D' }}>
                            통과율 {passRate}% <span style={{ opacity: 0.6 }}>(85점 이상 기준)</span>
                          </p>
                        </div>
                      )}
                      {hasTwin && (
                        <div className="rounded-xl px-3 py-3" style={{ background: '#EFF6FF' }}>
                          <p className="text-[10px] font-bold mb-1 flex items-center gap-1" style={{ color: '#1e3a5f' }}>
                            <i className="ti ti-copy" style={{ fontSize: 10 }} />쌍둥이학습지 평균
                          </p>
                          <p className="text-xl font-black" style={{ color: '#1e3a5f' }}>
                            {twinAvg ?? '-'}<span className="text-xs font-normal ml-0.5">점</span>
                          </p>
                          <p className="text-[10px] mt-1" style={{ color: '#1e3a5f', opacity: 0.6 }}>
                            총 {twinGroups.length}회
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {hasLevel && hasTwin && <div style={{ borderTop: '1px solid #f0f0f0', margin: '0 16px 12px' }} />}

                  {/* 레벨학습지 목록 */}
                  {hasLevel && (
                    <div className="px-4 pb-3">
                      <p className="text-[10px] font-bold mb-2 flex items-center gap-1.5"
                        style={{ color: '#993C1D', background: '#FAECE7', display: 'inline-flex', padding: '3px 8px', borderRadius: 6 }}>
                        <i className="ti ti-chart-bar" style={{ fontSize: 11 }} />레벨학습지
                      </p>
                      <div className="space-y-1.5 mt-2">
                        {levelGroups.map(({ unit, rangeLabel, record: r }, idx) => {
                          const scoreC = r.score == null ? '#9ca3af' : r.score >= 85 ? '#27500A' : r.score >= 80 ? '#633806' : '#991b1b'
                          const scoreBg = r.score == null ? '#f9fafb' : r.score >= 85 ? '#EAF3DE' : r.score >= 80 ? '#FAEEDA' : '#fee2e2'
                          return (
                            <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                              style={{ background: '#fdf8f5', border: '1px solid #F5C4B3' }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-800">
                                  {unit}
                                  <span className="text-[10px] font-semibold ml-1.5" style={{ color: '#993C1D' }}>{r.current_level}레벨</span>
                                </p>
                                {rangeLabel && <p className="text-[10px] text-gray-400 mt-0.5 truncate">({rangeLabel})</p>}
                              </div>
                              <div className="px-3 py-1.5 rounded-xl text-center shrink-0" style={{ background: scoreBg, minWidth: 56 }}>
                                {r.score != null
                                  ? <p className="text-sm font-black" style={{ color: scoreC }}>{r.score}점</p>
                                  : <p className="text-xs font-bold" style={{ color: r.status === 'assigned' ? '#3b82f6' : '#f97316' }}>
                                      {r.status === 'assigned' ? '과제중' : '채점대기'}
                                    </p>}
                              </div>
                              <button onClick={() => deleteWorksheet(r.id)}
                                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                                <i className="ti ti-trash" style={{ fontSize: 13 }} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {hasLevel && hasTwin && <div style={{ borderTop: '1px solid #f0f0f0', margin: '0 16px 12px' }} />}

                  {/* 쌍둥이학습지 목록 */}
                  {hasTwin && (
                    <div className="px-4 pb-4">
                      <p className="text-[10px] font-bold mb-2 flex items-center gap-1.5"
                        style={{ color: '#1e3a5f', background: '#EFF6FF', display: 'inline-flex', padding: '3px 8px', borderRadius: 6 }}>
                        <i className="ti ti-copy" style={{ fontSize: 11 }} />쌍둥이학습지
                      </p>
                      <div className="space-y-1.5 mt-2">
                        {twinGroups.map(({ unit, rangeLabel, record: r }, idx) => {
                          const scoreC = r.score == null ? '#9ca3af' : r.score >= 85 ? '#27500A' : r.score >= 80 ? '#633806' : '#991b1b'
                          const scoreBg = r.score == null ? '#f9fafb' : r.score >= 85 ? '#EAF3DE' : r.score >= 80 ? '#FAEEDA' : '#fee2e2'
                          return (
                            <div key={idx} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                              style={{ background: '#f8faff', border: '1px solid #dbeafe' }}>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-800">
                                  {unit}
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded ml-1.5"
                                    style={{ background: '#EFF6FF', color: '#1e3a5f' }}>{r.memo ?? '1차'}</span>
                                </p>
                                {rangeLabel && <p className="text-[10px] text-gray-400 mt-0.5 truncate">({rangeLabel})</p>}
                              </div>
                              <div className="px-3 py-1.5 rounded-xl text-center shrink-0" style={{ background: scoreBg, minWidth: 56 }}>
                                {r.score != null
                                  ? <p className="text-sm font-black" style={{ color: scoreC }}>{r.score}점</p>
                                  : <p className="text-xs font-bold" style={{ color: r.status === 'assigned' ? '#3b82f6' : '#f97316' }}>
                                      {r.status === 'assigned' ? '과제중' : '채점대기'}
                                    </p>}
                              </div>
                              <button onClick={() => deleteWorksheet(r.id)}
                                className="shrink-0 text-gray-300 hover:text-red-500 transition-colors">
                                <i className="ti ti-trash" style={{ fontSize: 13 }} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {!isMiddleOrHigh && (
              /* ── 초등 진단표 ── */
              studentUnits.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">아직 과제 기록이 없어요</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    {(() => {
                      const usedLevels = getUsedLevels(selectedStudent.id)
                      return (
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white">
                              <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[80px]">단원</th>
                              <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[120px]">단원명</th>
                              {usedLevels.map((l) => (
                                <th key={l} className={cx('px-3 py-2.5 text-center font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[70px]',
                                  l >= 4 ? 'text-orange-500' : 'text-gray-500')}>
                                  {l}레벨
                                  {l >= 4 && <span className="block text-[9px] text-orange-400">심화</span>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {studentUnits.map(({ grade_level, unit, unit_name }, idx) => (
                              <tr key={idx} className="hover:bg-white/50">
                                <td className="px-3 py-2.5 border-b border-r border-gray-100">
                                  <p className="font-bold text-gray-800">{unit}</p>
                                  <p className="text-gray-400 text-[10px]">{grade_level}</p>
                                </td>
                                <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{unit_name || '-'}</td>
                                {usedLevels.map((level) => {
                                  const records = getRecords(selectedStudent.id, grade_level, unit, level)
                                  if (records.length === 0) {
                                    const cell = getCellStyle(null)
                                    return (
                                      <td key={level} className={cx('px-2 py-2.5 border-b border-r border-gray-100 text-center', cell.bg)}>
                                        <span className={cx('font-bold', cell.textColor)}>{cell.text}</span>
                                      </td>
                                    )
                                  }
                                  return (
                                    <td key={level} className="px-2 py-1.5 border-b border-r border-gray-100 text-center align-top">
                                      <div className="flex flex-col gap-1">
                                        {records.map((record, i) => {
                                          const cell = getCellStyle(record)
                                          return (
                                            <div key={record.id} className={cx('rounded px-1 py-1', cell.bg)}>
                                              {records.length > 1 && (
                                                <span className="text-[8px] text-gray-400 mr-1">{i + 1}차</span>
                                              )}
                                              <span className={cx('font-bold', cell.textColor)}>{cell.text}</span>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                  {/* 범례 */}
                  <div className="px-4 py-3 border-t border-gray-50 flex flex-wrap gap-3">
                    <p className="text-[10px] font-bold text-gray-400 mr-1">범례:</p>
                    {[
                      { bg: 'bg-green-100', text: 'text-green-700', label: '85점↑ 통과' },
                      { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '80~84점' },
                      { bg: 'bg-red-100', text: 'text-red-600', label: '80점↓ 재도전' },
                      { bg: 'bg-white border border-blue-200', text: 'text-gray-800', label: '진행중' },
                      { bg: 'bg-purple-50 border border-purple-200', text: 'text-[#712B13]', label: '오답유사' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1">
                        <div className={cx('w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold', item.bg, item.text)}>점</div>
                        <span className="text-[10px] text-gray-500">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm font-semibold text-gray-600">학생을 선택하면 보고서가 나와요</p>
            <p className="text-xs text-gray-400 mt-1">초등: 레벨별 진단표 · 중등: 단원/차시별 1차/오답유사 점수</p>
          </div>
        )}

        {/* ── 시험대비(이너프원) 섹션 ── */}
        {selectedStudent && (() => {
          const nowEP = new Date()
          const myPreps = examPreps.filter((ep) => {
            if (ep.student_id !== selectedStudent.id) return false
            if (ep.status === 'done') return false
            if (ep.exam_date) {
              const examEnd = new Date(ep.exam_date)
              examEnd.setDate(examEnd.getDate() + 7)
              if (nowEP > examEnd) return false
            }
            return true
          })
          if (myPreps.length === 0) return null
          return (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#F5C4B3' }}>
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#FFF5F2', borderBottom: '1px solid #f0f0f0' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F5C4B3' }}>
                  <i className="ti ti-pencil-check" style={{ fontSize: 14, color: '#712B13' }} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#712B13' }}>시험대비 현황</span>
                <span className="text-[10px] text-gray-400 ml-auto">{myPreps.length}개 단원</span>
              </div>
              <div className="divide-y divide-gray-50">
                {myPreps
                  .sort((a, b) => {
                    const sA = ['전범위','복합'].includes(a.inner_enough?.unit_name ?? '')
                    const sB = ['전범위','복합'].includes(b.inner_enough?.unit_name ?? '')
                    if (sA && !sB) return 1
                    if (!sA && sB) return -1
                    return (a.inner_enough?.unit_no ?? '').localeCompare(b.inner_enough?.unit_no ?? '', 'ko', { numeric: true })
                  })
                  .map((ep) => {
                    const ie = ep.inner_enough
                    if (!ie) return null
                    const totalSteps = ep.total_steps || 1
                    const pct = Math.round((ep.progress_step || 0) / totalSteps * 100)
                    return (
                      <div key={ep.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-800 truncate">{ie.unit_name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{ie.sub_unit_name} · {ie.problem_count}문항{ep.exam_date ? ` · 시험일 ${ep.exam_date}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {ep.score != null && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: ep.score >= 90 ? '#EAF3DE' : ep.score >= 70 ? '#FAEEDA' : '#fee2e2', color: ep.score >= 90 ? '#27500A' : ep.score >= 70 ? '#633806' : '#991b1b' }}>{ep.score}점</span>
                            )}
                            <span className="text-xs font-black" style={{ color: pct >= 100 ? '#27500A' : pct > 0 ? '#993C1D' : '#9ca3af' }}>{pct}%</span>
                            {isAdmin() && (
                              <button onClick={async () => {
                                if (!confirm(`"${ie.unit_name}" 시험대비 배정을 삭제할까요?`)) return
                                const { error } = await supabase.from('student_exam_prep').delete().eq('id', ep.id)
                                if (!error) setExamPreps((prev) => prev.filter((x) => x.id !== ep.id))
                              }}
                                className="text-gray-300 hover:text-red-500 transition-colors" title="삭제">
                                <i className="ti ti-trash" style={{ fontSize: 13 }} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? '#639922' : '#EF9F27' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })()}

        {/* ── 평가 이력 섹션 ── */}
        {selectedStudent && (() => {
          const studentExams = exams.filter((e) => e.student_id === selectedStudent.id)
          if (studentExams.length === 0) return null

          const examTypes = ['입학테스트', '진단평가', '코어테스트', '학교시험'] as const

          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                  <i className="ti ti-chart-bar" style={{ fontSize: 14, color: '#993C1D' }} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#1f2937' }}>평가 이력</span>
              </div>

              <div className="divide-y divide-gray-50">
                {examTypes.map((type) => {
                  const typeExams = studentExams
                    .filter((e) => e.exam_type === type)
                    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
                  if (typeExams.length === 0) return null

                  const cfg = EXAM_CONFIG[type]
                  // 점수 퍼센트 계산
                  const scored = typeExams.filter((e) => e.score != null)
                  const pct = (e: Exam) => e.total_score > 0 ? Math.round((e.score ?? 0) / e.total_score * 100) : null

                  return (
                    <div key={type} className="px-4 py-4">
                      {/* 타입 헤더 */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>
                          {type}
                        </span>
                        <span className="text-[10px] text-gray-400">{typeExams.length}회</span>
                        {scored.length > 0 && (
                          <span className="text-[10px] text-gray-400 ml-auto">
                            평균 {Math.round(scored.reduce((s, e) => s + (pct(e) ?? 0), 0) / scored.length)}%
                          </span>
                        )}
                      </div>

                      {/* 성적 추이 + 막대그래프 */}
                      {scored.length > 0 && (() => {
                        const chartW = 400
                        const chartH = 120
                        const padL = 28, padR = 8, padT = 20, padB = 36
                        const innerW = chartW - padL - padR
                        const innerH = chartH - padT - padB
                        const n = typeExams.length
                        const barW = Math.min(32, (innerW / n) * 0.55)
                        const gap = innerW / n
                        const scoredPts = typeExams.map(e => pct(e))
                        const avgPct = Math.round(scored.reduce((s, e) => s + (pct(e) ?? 0), 0) / scored.length)

                        return (
                          <div className="mb-3 rounded-xl overflow-hidden" style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                            <svg viewBox={`0 0 ${chartW} ${chartH}`} width="100%" style={{ display: 'block' }}>
                              {/* 기준선 y=100,85,50 */}
                              {[100, 85, 50].map(v => {
                                const y = padT + innerH - (v / 100) * innerH
                                return (
                                  <g key={v}>
                                    <line x1={padL} y1={y} x2={chartW - padR} y2={y}
                                      stroke={v === 85 ? '#9FE1CB' : '#e5e7eb'} strokeWidth={v === 85 ? 1 : 0.7} strokeDasharray={v === 85 ? '4 3' : '3 3'} />
                                    <text x={padL - 3} y={y + 3} textAnchor="end" fontSize={8} fill="#9ca3af">{v}</text>
                                  </g>
                                )
                              })}

                              {/* 막대 */}
                              {typeExams.map((e, i) => {
                                const p = scoredPts[i]
                                const cx = padL + gap * i + gap / 2
                                const isCoreMain = type === '코어테스트' && e.title === '본고사'
                                const barColor = p == null ? '#e5e7eb' : p >= 85 ? '#9FE1CB' : p >= 70 ? '#FAEEDA' : '#F5C4B3'
                                const barH2 = p == null ? 4 : (p / 100) * innerH
                                const barY = padT + innerH - barH2
                                const textColor = p == null ? '#9ca3af' : p >= 85 ? '#085041' : p >= 70 ? '#633806' : '#993C1D'
                                const xLabel = e.unit
                                  ? (e.unit.length > 5 ? e.unit.slice(0, 5) + '…' : e.unit)
                                  : type === '코어테스트' && e.title
                                    ? (e.title === '본고사' ? '본고사' : e.title === '예비 1회' ? '예비1' : '예비2')
                                    : e.exam_date.slice(5).replace('-', '/')
                                const subLabel = e.level != null ? `Lv.${e.level}` : ''
                                return (
                                  <g key={e.id}>
                                    <rect x={cx - barW / 2} y={barY} width={barW} height={barH2}
                                      rx={3} fill={barColor}
                                      stroke={isCoreMain ? '#085041' : 'none'} strokeWidth={isCoreMain ? 1.5 : 0} />
                                    {p != null && (
                                      <text x={cx} y={barY - 4} textAnchor="middle" fontSize={9} fontWeight="700" fill={textColor}>{p}%</text>
                                    )}
                                    <text x={cx} y={padT + innerH + 12} textAnchor="middle" fontSize={8.5} fill="#4b5563" fontWeight="500">{xLabel}</text>
                                    {subLabel && (
                                      <text x={cx} y={padT + innerH + 24} textAnchor="middle" fontSize={8} fill="#9ca3af">{subLabel}</text>
                                    )}
                                  </g>
                                )
                              })}

                              {/* 꺾은선 */}
                              {(() => {
                                const pts = typeExams.map((e, i) => {
                                  const p = pct(e)
                                  if (p == null) return null
                                  const cx = padL + gap * i + gap / 2
                                  const cy = padT + innerH - (p / 100) * innerH
                                  return { cx, cy, p }
                                }).filter(Boolean) as { cx: number; cy: number; p: number }[]
                                if (pts.length < 2) return null
                                const d = pts.map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.cx},${pt.cy}`).join(' ')
                                return (
                                  <g>
                                    <path d={d} fill="none" stroke="#993C1D" strokeWidth={1.5} strokeDasharray="4 2" opacity={0.6} />
                                    {pts.map((pt, i) => (
                                      <circle key={i} cx={pt.cx} cy={pt.cy} r={3} fill="#993C1D" opacity={0.8} />
                                    ))}
                                  </g>
                                )
                              })()}

                              {/* 평균선 */}
                              {(() => {
                                const avgY = padT + innerH - (avgPct / 100) * innerH
                                return (
                                  <g>
                                    <line x1={padL} y1={avgY} x2={chartW - padR} y2={avgY}
                                      stroke="#6b7280" strokeWidth={0.8} strokeDasharray="6 3" opacity={0.5} />
                                    <text x={chartW - padR - 2} y={avgY - 3} textAnchor="end" fontSize={7.5} fill="#6b7280" opacity={0.7}>평균 {avgPct}%</text>
                                  </g>
                                )
                              })()}
                            </svg>
                          </div>
                        )
                      })()}

                      {/* 상세 목록 */}
                      <div className="space-y-1.5">
                        {typeExams.map((e) => {
                          const p = pct(e)
                          const isCoreMain = type === '코어테스트' && e.title === '본고사'
                          const isCorePrep = type === '코어테스트' && e.title?.startsWith('예비')
                          const scoreColor = p == null ? '#9ca3af' : p >= 85 ? '#27500A' : p >= 70 ? '#633806' : '#991b1b'
                          const scoreBg = p == null ? '#f3f4f6' : p >= 85 ? '#EAF3DE' : p >= 70 ? '#FAEEDA' : '#fee2e2'
                          return (
                            <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                              style={{ background: isCoreMain ? '#EAF3DE' : '#fafafa', border: isCoreMain ? '1px solid #c0dd97' : 'none' }}>
                              <span className="text-[10px] text-gray-400 w-12 shrink-0">{e.exam_date.slice(5).replace('-', '/')}</span>
                              {/* 코어테스트 회차 배지 */}
                              {type === '코어테스트' && e.title && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={isCoreMain
                                    ? { background: '#639922', color: 'white' }
                                    : { background: '#FAEEDA', color: '#633806' }}>
                                  {e.title}
                                </span>
                              )}
                              <span className="text-xs text-gray-700 flex-1 truncate">
                                {e.unit ?? (!isCoreMain && !isCorePrep ? e.title : null) ?? type}
                                {e.unit_name ? <span className="text-gray-400"> · {e.unit_name}</span> : null}
                              </span>
                              {e.level != null && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                  style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                  Lv.{e.level}
                                </span>
                              )}
                              {e.score != null ? (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                                  style={{ background: scoreBg, color: scoreColor }}>
                                  {e.score}/{e.total_score} ({p}%)
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400 shrink-0">미채점</span>
                              )}
                              {canDelete(e.teacher_name) && (
                                <button onClick={() => deleteExam(e.id)} disabled={deleting === e.id}
                                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                                  title="삭제">
                                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                                </button>
                              )}
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
          </>
        )}
      </div>
    </div>
  )
}
