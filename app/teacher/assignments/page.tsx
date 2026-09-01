'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, formatConceptRangeLabel, fetchAllRows } from '@/lib/utils'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
  textbook_grade: string
}

interface StudentWorksheet {
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
  submitted_at: string | null
  updated_at?: string | null
  semester?: number | null
}

interface StudentTextbook {
  id: string
  student_id: string
  concept_id: string
  textbook_name: string
  textbook_type: string
  status: string
  memo: string | null
  assigned_at: string
  grade?: string
  semester?: number
}

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
  sub_chapter?: string
  concept_order: number
  concept_name: string
}

interface MiddleWorksheet {
  id: string
  grade: string
  semester: number
  large_unit: string
  medium_unit: string
  matholic_no: string | null
  lesson_no: number
  lesson_name: string
}

const WS_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  assigned:          { label: '과제중',       color: 'text-gray-500',   bg: 'bg-gray-100' },
  submitted:         { label: '채점대기',     color: 'text-[#712B13]',  bg: 'bg-[#FFF5F2]' },
  similar_assigned:  { label: '오답유사중',   color: 'text-[#712B13]',  bg: 'bg-[#FFF5F2]' },
  similar_submitted: { label: '오답유사채점', color: 'text-[#712B13]',  bg: 'bg-[#FFF5F2]' },
  scored:            { label: '결과대기',     color: 'text-gray-400',   bg: 'bg-gray-50' },
  passed:            { label: '완료',         color: 'text-[#712B13]',  bg: 'bg-[#F5C4B3]' },
  retry:             { label: '재도전',       color: 'text-[#991b1b]',  bg: 'bg-[#fee2e2]' },
}

const TB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  assigned:  { label: '과제중',   color: 'text-gray-500',  bg: 'bg-gray-100' },
  submitted: { label: '제출완료', color: 'text-[#712B13]', bg: 'bg-[#FFF5F2]' },
  checked:   { label: '채점완료', color: 'text-[#712B13]', bg: 'bg-[#F5C4B3]' },
}

const TEXTBOOK_LIST: Record<string, string[]> = {
  '개념서': ['개념+유형파워', '개념+유형라이트', '교과서 개념잡기', '리피트', '개념유형 라이트', '개념잡기'],
  '유형서': ['디딤돌 응용', '쎈B', '쎈', 'RPM', '수학리더(기본+응용)', '베이직쎈'],
  '심화서': ['최고수준', '최상위S', '최상위', '왕수학최상위', 'RPMpro', '일품', '고쟁이'],
  '연산서': ['빅데이터 연산', '최상위 연산', '원리셈', '기탄수학', '쎈개념연산'],
}

const WORKSHEET_LEVELS = [1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0]
const WORKSHEET_GRADE_LEVELS = ['초1','초2','초3','초4','초5','초6']
const WORKSHEET_UNITS = ['1단원','2단원','3단원','4단원','5단원','6단원','7단원','8단원']
const GRADE_GROUPS = ['전체','초등','중등','고등']
const GRADE_COUNT: Record<string, number> = { A: 3, B: 2, C: 1 }

function formatUnit(gradeLevel: string, unit: string, unitName: string) {
  if (unitName) {
    const chapterNum = unit.match(/^[Ⅰ-Ⅸ\d]+/)?.[0] ?? unit.replace(/[^0-9Ⅰ-Ⅸ]/g, '') ?? ''
    const subNums = unitName.split(' + ').map((s) => {
      const num = s.match(/^[\d]+\./)?.[0]?.replace('.','') ?? ''
      return num
    }).filter(Boolean)
    const subNames = unitName.split(' + ').map((s) => s.replace(/^[\d]+\.\s*/, '')).join(', ')
    if (chapterNum && subNums.length > 0) {
      return `${gradeLevel} ${chapterNum}-${subNums.join('+')} ${subNames}`
    }
    return `${gradeLevel} ${unit} ${unitName}`
  }
  return `${gradeLevel} ${unit}`
}

// 초등 레벨학습지는 "N단원"이라는 숫자만 고르고 학기 구분이 없어서, 같은 6단원이라도 5-1인지 5-2인지
// 시스템이 몰라 단원명이 제각각으로 입력되던 문제가 있었다. 학기를 고르면 concepts 테이블(공식 교육과정
// 단원 목록, concept_order 순)에서 N번째 대단원 이름을 찾아 자동으로 채워준다 - 로마숫자 접두어는 잘라낸다.
function getChapterNameByOrder(concepts: Concept[], grade: string, semester: number, unitIndex: number): string | null {
  const chapters = Array.from(new Set(
    concepts
      .filter((c) => c.grade === grade && c.semester === semester)
      .sort((a, b) => a.concept_order - b.concept_order)
      .map((c) => c.chapter)
  ))
  const raw = chapters[unitIndex - 1]
  if (!raw) return null
  return raw.replace(/^[Ⅰ-Ⅹ]+\s*/, '').trim() || null
}

export default function TeacherAssignmentsPage() {
  const { currentUser, isAdmin, canManageAllStudents, canViewStudent, isSupervisorModeActive, supervisorLabel } = useAuth()
  const [tab, setTab] = useState<'worksheet' | 'submissions' | 'unit_status' | 'textbook'>('worksheet')
  const [unitStatusStudent, setUnitStatusStudent] = useState<Student | null>(null)
  const [subTab, setSubTab] = useState<'ws' | 'tb'>('ws')
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  // '단원 현황' 탭에서만 필요한 학습지 전체 이력(완료된 것 포함, 전체 학생) - 그 탭을 열 때만 불러온다
  const [worksheetsFull, setWorksheetsFull] = useState<StudentWorksheet[]>([])
  const [worksheetsFullLoaded, setWorksheetsFullLoaded] = useState(false)
  const [worksheetsFullLoading, setWorksheetsFullLoading] = useState(false)
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeGroup, setGradeGroup] = useState('전체')
  const [searchText, setSearchText] = useState('')

  const [showWSModal, setShowWSModal] = useState(false)
  const [wsStudent, setWsStudent] = useState<Student | null>(null)
  const [wsGradeLevel, setWsGradeLevel] = useState('초4')
  const [wsSemester, setWsSemester] = useState<1 | 2>(1)
  const [wsUnit, setWsUnit] = useState('1단원')
  const [wsUnitName, setWsUnitName] = useState('')
  const [wsUnitNameTouched, setWsUnitNameTouched] = useState(false)
  const [wsLevel, setWsLevel] = useState(2.5)
  const [wsCourseGroup, setWsCourseGroup] = useState<'초등'|'중등'|'고등'>('초등')
  const [wsConceptGrade, setWsConceptGrade] = useState('')
  const [wsChapters, setWsChapters] = useState<string[]>([])
  const [wsSubChapters, setWsSubChapters] = useState<string[]>([])
  const [wsConceptIds, setWsConceptIds] = useState<string[]>([])
  const [wsAssigning, setWsAssigning] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkStudentIds, setBulkStudentIds] = useState<string[]>([])
  const [deleteMode, setDeleteMode] = useState(false)
  const [expandedStudents, setExpandedStudents] = useState<Set<string>>(new Set())
  const [selectedWSIds, setSelectedWSIds] = useState<string[]>([])
  const [middleWorksheets, setMiddleWorksheets] = useState<MiddleWorksheet[]>([])
  const [mwSemester, setMwSemester] = useState(1)
  const [mwLargeUnit, setMwLargeUnit] = useState('')
  const [mwMediumUnit, setMwMediumUnit] = useState('')
  const [mwSelectedLessons, setMwSelectedLessons] = useState<MiddleWorksheet[]>([])
  const [mwRangeStart, setMwRangeStart] = useState<MiddleWorksheet | null>(null)
  const [mwLevel, setMwLevel] = useState(2.5)

  // 쌍둥이 학습지 상태
  const [wsType, setWsType] = useState<'level' | 'twin'>('level')
  const [twinStudent, setTwinStudent] = useState<Student | null>(null)
  const [twinTextbookId, setTwinTextbookId] = useState('')
  const [twinConcepts, setTwinConcepts] = useState<Concept[]>([])
  const [twinSelectedConcepts, setTwinSelectedConcepts] = useState<string[]>([])
  const [twinRound, setTwinRound] = useState<'1차' | '2차' | '오답' | '오답유사'>('1차')
  const [twinAssigning, setTwinAssigning] = useState(false)
  const [twinSearch, setTwinSearch] = useState('')

  const [showScoreModal, setShowScoreModal] = useState(false)
  const [scoreWS, setScoreWS] = useState<StudentWorksheet | null>(null)
  const [inputScore, setInputScore] = useState('')
  const [savingScore, setSavingScore] = useState(false)

  const [showTBModal, setShowTBModal] = useState(false)
  const [tbStudent, setTbStudent] = useState<Student | null>(null)
  const [tbCourseGroup, setTbCourseGroup] = useState<'초등' | '중등' | '고등'>('초등')
  const [tbGrade, setTbGrade] = useState('초4')
  const [tbSemester, setTbSemester] = useState(1)
  const [tbChapter, setTbChapter] = useState('')
  const [tbConcept, setTbConcept] = useState<Concept | null>(null)
  const [tbType, setTbType] = useState('개념서')
  const [tbName, setTbName] = useState('')
  const [tbMemo, setTbMemo] = useState('')
  const [tbAssigning, setTbAssigning] = useState(false)

  const [toast, setToast] = useState<string | null>(null)
  const [showRecentPassed, setShowRecentPassed] = useState(false)

  function flashToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4000)
  }

  useEffect(() => { fetchData() }, [])

  // 학습지관리 화면(학습지 배정/제출현황 탭)에는 '진행중인' 학습지만 필요한데, 예전엔 완료(passed)된
  // 학습지까지(전체의 80% 이상, 계속 증가) 매번 통째로 불러왔다. 완료 처리 안 지 얼마 안 된 것만
  // (되돌리기·최근완료 표시용) 같이 가져오고, 나머지 완료 이력은 '단원 현황' 탭을 열 때만 따로 불러온다.
  async function fetchActiveWorksheets() {
    const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    const [active, recentPassed] = await Promise.all([
      fetchAllRows(() => supabase.from('student_worksheets').select('*').neq('status', 'passed')),
      fetchAllRows(() => supabase.from('student_worksheets').select('*').eq('status', 'passed')
        .or(`updated_at.gte.${cutoff},and(updated_at.is.null,assigned_at.gte.${cutoff})`)),
    ])
    return [...active, ...recentPassed]
  }

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, wData, { data: tData }, { data: cData }, { data: mwData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      fetchActiveWorksheets(),
      supabase.from('student_textbooks').select('*').order('assigned_at', { ascending: false }).limit(5000),
      supabase.from('concepts').select('*').order('grade').order('semester').order('concept_order').limit(5000),
      supabase.from('middle_worksheets').select('*').order('grade').order('semester').order('lesson_no'),
    ])
    if (sData) setStudents(sData)
    if (wData) setWorksheets(wData)
    if (tData) setTextbooks(tData)
    if (cData) setConcepts(cData)
    if (mwData) setMiddleWorksheets(mwData)
    // 학습지 기록이 바뀌었을 수 있으니 '단원 현황' 탭에서 캐시해둔 전체 이력은 무효화 -
    // 그 탭을 다시 열 때 최신으로 다시 불러온다
    setWorksheetsFullLoaded(false)
    setLoading(false)
  }

  async function loadWorksheetsFull() {
    setWorksheetsFullLoading(true)
    const data = await fetchAllRows<StudentWorksheet>(() => supabase.from('student_worksheets').select('*'))
    setWorksheetsFull(data)
    setWorksheetsFullLoaded(true)
    setWorksheetsFullLoading(false)
  }

  useEffect(() => {
    if (tab === 'unit_status' && !worksheetsFullLoaded && !worksheetsFullLoading) {
      loadWorksheetsFull()
    }
  }, [tab, worksheetsFullLoaded, worksheetsFullLoading])

  // 초등 학습지: 학년/학기/단원을 고르면 concepts(공식 교육과정 단원목록)에서 이름을 찾아 자동으로 채워준다.
  // 선생님이 직접 단원명을 고쳐 입력했다면(wsUnitNameTouched) 그 뒤로는 자동 채우기가 덮어쓰지 않는다.
  useEffect(() => {
    if (wsCourseGroup !== '초등' || wsUnitNameTouched) return
    const unitIndex = parseInt(wsUnit)
    if (!unitIndex) return
    const auto = getChapterNameByOrder(concepts, wsGradeLevel, wsSemester, unitIndex)
    setWsUnitName(auto ?? '')
  }, [wsCourseGroup, wsGradeLevel, wsSemester, wsUnit, wsUnitNameTouched, concepts])

  // 실제 배정/채점/삭제 권한이 있는 학생(관리자/직원 또는 진짜 담당 강사) - 주임모드로 넓게 "보이는" 것과는
  // 별개로 실제 조작(배정 대상 선택, 채점, 삭제 등)은 여기로만 한정한다 (주임은 보기 전용)
  function isEditable(s: Student) {
    if (canManageAllStudents()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  }
  const myEditableStudents = students.filter(isEditable)

  // 화면에 "보이는" 학생 범위 - 관리자/직원은 전체, 주임모드가 켜진 주임은 담당 학년 범위까지 넓게,
  // 강사는 본인 담당만 (canViewStudent가 우선순위를 반영함)
  const myStudents = students.filter((s) => canViewStudent(s))
  const myStudentIds = new Set(myStudents.map((s) => s.id))

  function filterByGroup(list: Student[]) {
    return list.filter((s) => {
      const groupMatch = gradeGroup === '전체' ? true :
        gradeGroup === '초등' ? s.grade.includes('초') :
        gradeGroup === '중등' ? s.grade.includes('중') : s.grade.includes('고')
      const searchMatch = searchText === '' || s.name.includes(searchText) || s.school?.includes(searchText)
      return groupMatch && searchMatch
    })
  }
  const filteredStudents = filterByGroup(myStudents)
  // 학습지/교재 배정 대상 선택 팝업(개별·일괄)에서는 실제 담당 학생만 골라야 하므로 별도로 좁혀서 사용
  const filteredEditableStudents = filterByGroup(myEditableStudents)

  function getStudentName(id: string) {
    return students.find((s) => s.id === id)?.name ?? '알 수 없음'
  }

  function getConceptById(id: string) {
    return concepts.find((c) => c.id === id)
  }

  const activeWorksheets = worksheets.filter((w) => {
    const student = students.find((s) => s.id === w.student_id)
    const groupMatch = gradeGroup === '전체' ? true :
      gradeGroup === '초등' ? student?.grade.includes('초') :
      gradeGroup === '중등' ? student?.grade.includes('중') :
      student?.grade.includes('고')
    return myStudentIds.has(w.student_id) && w.status !== 'passed' && !!groupMatch &&
      (searchText === '' || getStudentName(w.student_id).includes(searchText))
  })
  const activeLevelWS = activeWorksheets.filter(w => w.worksheet_type !== 'twin')
  const activeTwinWS = activeWorksheets.filter(w => w.worksheet_type === 'twin')

  // 완료 처리(재도전/오답유사/레벨업/완료) 직후 "목록에서 사라진 것처럼 보이는" 문제 보완용:
  // 최근 24시간 안에 완료 처리된 항목을 별도로 볼 수 있게 + 되돌리기 제공
  const recentlyPassedLevelWS = worksheets
    .filter((w) => {
      if (w.worksheet_type === 'twin' || w.status !== 'passed' || !myStudentIds.has(w.student_id)) return false
      const ts = w.updated_at ?? w.assigned_at
      return ts && (Date.now() - new Date(ts).getTime()) < 24 * 60 * 60 * 1000
    })
    .sort((a, b) => new Date(b.updated_at ?? b.assigned_at).getTime() - new Date(a.updated_at ?? a.assigned_at).getTime())

  const activeTextbooks = textbooks.filter((t) =>
    myStudentIds.has(t.student_id) && t.status !== 'checked' && t.status !== 'paused' && t.status !== 'completed' &&
    (searchText === '' || getStudentName(t.student_id).includes(searchText))
  )

  const pendingWS = activeWorksheets.filter((w) => w.status === 'submitted' || w.status === 'similar_submitted')
  const pendingTB = activeTextbooks.filter((t) => t.status === 'submitted')

  const tbChapters = [...new Set(
    concepts.filter((c) => c.grade === tbGrade && c.semester === tbSemester).map((c) => c.chapter)
  )]
  const tbConcepts = concepts.filter(
    (c) => c.grade === tbGrade && c.semester === tbSemester && c.chapter === tbChapter
  )

  async function handleWSAssign() {
    setWsAssigning(true)
    const isMiddleHigh = wsCourseGroup === '중등' || wsCourseGroup === '고등'
    const wsConceptNames = formatConceptRangeLabel(concepts.filter((c) => c.grade === wsConceptGrade), wsConceptIds)
    const targets = bulkMode ? bulkStudentIds : wsStudent ? [wsStudent.id] : []
    if (targets.length === 0) { setWsAssigning(false); return }
    for (const sid of targets) {
      await supabase.from('student_worksheets').insert({
        student_id: sid, subject: '수학',
        grade_level: isMiddleHigh ? wsConceptGrade : wsGradeLevel,
        unit: isMiddleHigh ? wsChapters.join(' + ') : wsUnit,
        unit_name: isMiddleHigh ? wsConceptNames : wsUnitName,
        semester: isMiddleHigh ? null : wsSemester,
        current_level: wsLevel, status: 'assigned', worksheet_type: 'main',
      })
    }
    setShowWSModal(false); setWsStudent(null); setWsUnitName(''); setWsUnitNameTouched(false)
    setWsConceptIds([])
    setBulkStudentIds([]); setBulkMode(false)
    setWsAssigning(false); fetchData()
  }

  async function handleTwinAssign() {
    if (!twinStudent || twinSelectedConcepts.length === 0) return
    setTwinAssigning(true)
    const selectedC = twinConcepts.filter(c => twinSelectedConcepts.includes(c.id))
    const unitName = selectedC.map(c => c.concept_name).join(', ')
    const chapterName = [...new Set(selectedC.map(c => c.chapter))].join(' + ')
    await supabase.from('student_worksheets').insert({
      student_id: twinStudent.id,
      subject: '수학',
      grade_level: twinStudent.grade,
      unit: chapterName,
      unit_name: unitName,
      current_level: 1,
      status: 'assigned',
      worksheet_type: 'twin',
      memo: twinRound,
    })
    setTwinStudent(null)
    setTwinSelectedConcepts([])
    setTwinTextbookId('')
    setTwinConcepts([])
    setTwinRound('1차')
    setTwinAssigning(false)
    setShowWSModal(false)
    fetchData()
  }

  async function loadTwinConcepts(textbookId: string, grade: string, semester: number) {
    const { data } = await supabase.from('concepts')
      .select('*')
      .eq('grade', grade)
      .eq('semester', semester)
      .order('concept_order')
    setTwinConcepts(data ?? [])
    setTwinSelectedConcepts([])
  }

  async function handleSubmitted(id: string, currentStatus: string) {
    const nextStatus = currentStatus === 'similar_assigned' ? 'similar_submitted' : 'submitted'
    await supabase.from('student_worksheets').update({ status: nextStatus, submitted_at: new Date().toISOString() }).eq('id', id)
    fetchData()
  }

  async function handleSaveScore() {
    if (!scoreWS) return
    const score = parseInt(inputScore)
    if (isNaN(score) || score < 0 || score > 100) { alert('0~100 사이 점수를 입력해주세요.'); return }
    setSavingScore(true)
    // 점수만 저장하고, 다음 액션(레벨업/재도전/오답유사/완료)은 선생님이 직접 선택
    await supabase.from('student_worksheets').update({ score, status: 'scored' }).eq('id', scoreWS.id)
    setSavingScore(false); setShowScoreModal(false); setInputScore(''); fetchData()
  }

  async function handleLevelUp(w: StudentWorksheet) {
    const nextLevel = Math.min(6.0, w.current_level + 0.5)
    const name = getStudentName(w.student_id)
    await supabase.from('student_worksheets').update({ status: 'passed', updated_at: new Date().toISOString() }).eq('id', w.id)
    await supabase.from('student_worksheets').insert({
      student_id: w.student_id, subject: '수학',
      grade_level: w.grade_level, unit: w.unit, unit_name: w.unit_name, semester: w.semester ?? null,
      current_level: nextLevel, status: 'assigned', worksheet_type: 'main',
    })
    fetchData()
    flashToast(`✅ ${name} ${w.current_level}레벨 완료 처리 → ${nextLevel}레벨 새로 배정했어요`)
  }

  // 오답유사 학습지 배정 (기존엔 80점 미만이면 자동 배정됐지만, 이제 선생님이 직접 선택)
  async function handleSimilarAssign(w: StudentWorksheet) {
    const name = getStudentName(w.student_id)
    await supabase.from('student_worksheets').update({ status: 'passed', updated_at: new Date().toISOString() }).eq('id', w.id)
    await supabase.from('student_worksheets').insert({
      student_id: w.student_id, subject: '수학',
      grade_level: w.grade_level, unit: w.unit, unit_name: w.unit_name, semester: w.semester ?? null,
      current_level: w.current_level, status: 'similar_assigned', worksheet_type: 'similar', parent_worksheet_id: w.id,
    })
    fetchData()
    flashToast(`✅ ${name} ${w.current_level}레벨 완료 처리 → 오답유사 학습지 새로 배정했어요`)
  }

  async function handleDelete(id: string) {
    // 확인 없이 바로 삭제되던 버튼 - 실수로 눌러도 되돌릴 방법이 없어서 확인창 추가
    if (!confirm('이 학습지 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    const { error } = await supabase.from('student_worksheets').delete().eq('id', id)
    if (error) {
      console.error('삭제 오류:', error)
      alert('삭제 실패: ' + error.message)
      return
    }
    setWorksheets(prev => prev.filter(w => w.id !== id))
    // '단원 현황' 탭용으로 캐시해둔 전체 이력도 같이 지워서 삭제한 게 거기서 안 보이게 함
    setWorksheetsFull(prev => prev.filter(w => w.id !== id))
  }

  async function handleBulkDelete() {
    if (selectedWSIds.length === 0) return
    if (!confirm(`선택한 ${selectedWSIds.length}건의 학습지 기록을 삭제할까요? 되돌릴 수 없어요.`)) return
    const { error } = await supabase.from('student_worksheets').delete().in('id', selectedWSIds)
    if (error) {
      console.error('일괄삭제 오류:', error)
      alert('삭제 실패: ' + error.message)
      return
    }
    setWorksheets(prev => prev.filter(w => !selectedWSIds.includes(w.id)))
    setWorksheetsFull(prev => prev.filter(w => !selectedWSIds.includes(w.id)))
    setSelectedWSIds([])
    setDeleteMode(false)
  }

  async function handleBulkAssign() {
    if (bulkStudentIds.length === 0 || !wsStudent) return
    setWsAssigning(true)
    const isMiddleHigh = wsCourseGroup === '중등' || wsCourseGroup === '고등'
    const wsConceptNames = formatConceptRangeLabel(concepts.filter((c) => c.grade === wsConceptGrade), wsConceptIds)
    for (const sid of bulkStudentIds) {
      await supabase.from('student_worksheets').insert({
        student_id: sid, subject: '수학',
        grade_level: isMiddleHigh ? wsConceptGrade : wsGradeLevel,
        unit: isMiddleHigh ? wsChapters.join(' + ') : wsUnit,
        unit_name: isMiddleHigh ? wsConceptNames : wsUnitName,
        semester: isMiddleHigh ? null : wsSemester,
        current_level: wsLevel, status: 'assigned', worksheet_type: 'main',
      })
    }
    setWsConceptIds([])
    setShowWSModal(false); setBulkStudentIds([]); setWsStudent(null); setWsUnitName(''); setWsUnitNameTouched(false)
    setWsAssigning(false); fetchData()
  }

  async function handleComplete(w: StudentWorksheet) {
    const name = getStudentName(w.student_id)
    await supabase.from('student_worksheets').update({ status: 'passed', updated_at: new Date().toISOString() }).eq('id', w.id)
    fetchData()
    flashToast(`✅ ${name} ${w.current_level}레벨 완료 처리했어요 (목록에서 사라진 게 아니라 "최근 완료"로 이동)`)
  }

  async function handleRetry(w: StudentWorksheet) {
    const name = getStudentName(w.student_id)
    await supabase.from('student_worksheets').update({ status: 'passed', updated_at: new Date().toISOString() }).eq('id', w.id)
    await supabase.from('student_worksheets').insert({
      student_id: w.student_id, subject: '수학',
      grade_level: w.grade_level, unit: w.unit, unit_name: w.unit_name, semester: w.semester ?? null,
      current_level: w.current_level, status: 'assigned', worksheet_type: 'main',
    })
    fetchData()
    flashToast(`✅ ${name} ${w.current_level}레벨 완료 처리 → 같은 레벨 재도전 학습지 새로 배정했어요`)
  }

  // 완료 처리를 잘못 눌렀을 때 되돌리기 (점수입력 직후 상태로 복귀)
  async function handleRevertToScored(w: StudentWorksheet) {
    if (!confirm('되돌릴까요? 이 학습지를 다시 "결과대기" 상태로 되돌립니다. (그 사이 새로 배정된 학습지가 있다면 목록에서 따로 삭제해주세요)')) return
    await supabase.from('student_worksheets').update({ status: 'scored', updated_at: new Date().toISOString() }).eq('id', w.id)
    fetchData()
    flashToast(`↩️ ${getStudentName(w.student_id)} ${w.current_level}레벨을 되돌렸어요`)
  }

  async function handleTBAssign() {
    if (!tbStudent || !tbName) return
    setTbAssigning(true)
    const isMiddle = tbCourseGroup === '중등' || tbCourseGroup === '고등'
    if (isMiddle) {
      await supabase.from('student_textbooks').insert({
        student_id: tbStudent.id, concept_id: null,
        textbook_name: tbName, textbook_type: tbType,
        status: 'assigned', memo: tbMemo || null,
      })
    } else {
      if (!tbConcept) { setTbAssigning(false); return }
      const conceptsPerDay = GRADE_COUNT[tbStudent.textbook_grade] ?? 2
      const startIdx = tbConcepts.findIndex((c) => c.id === tbConcept!.id)
      const selectedConcepts = tbConcepts.slice(startIdx, startIdx + conceptsPerDay)
      for (const concept of selectedConcepts) {
        await supabase.from('student_textbooks').insert({
          student_id: tbStudent.id, concept_id: concept.id,
          textbook_name: tbName, textbook_type: tbType,
          status: 'assigned', memo: tbMemo || null,
        })
      }
    }
    setShowTBModal(false); setTbStudent(null); setTbConcept(null)
    setTbChapter(''); setTbMemo(''); setTbName('')
    setTbAssigning(false); fetchData()
  }

  async function handleTBSubmitted(id: string) {
    await supabase.from('student_textbooks').update({ status: 'submitted', submitted_at: new Date().toISOString() }).eq('id', id)
    fetchData()
  }

  async function handleTBChecked(id: string) {
    await supabase.from('student_textbooks').update({ status: 'checked' }).eq('id', id)
    fetchData()
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header
        title="학습지관리"
        subtitle={isAdmin() ? '전체 관리자' : isSupervisorModeActive() ? `${supervisorLabel()} (보기 전용)` : `${currentUser?.name} 선생님`}
        action={
          tab === 'worksheet' ? (
            <button onClick={() => { setWsUnitNameTouched(false); setWsSemester(1); setShowWSModal(true) }}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              + 학습지 배정
            </button>
          ) : undefined
        }
      />

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'worksheet',   label: '학습지 배정', icon: 'ti-file-text' },
            { key: 'submissions', label: '제출현황',     icon: 'ti-clock' },
            { key: 'unit_status', label: '단원 현황',    icon: 'ti-chart-bar' },
            { key: 'textbook',    label: '병행교재',     icon: 'ti-book' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={tab === t.key
                ? { background: '#F5C4B3', color: '#712B13' }
                : { background: '#f3f4f6', color: '#9ca3af' }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
              {t.label}
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {GRADE_GROUPS.map((g) => (
            <button key={g} onClick={() => setGradeGroup(g)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all"
              style={gradeGroup === g
                ? { background: '#1f2937', color: 'white', borderColor: '#1f2937' }
                : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
              {g}
            </button>
          ))}
        </div>

        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름으로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none"
          style={{ borderColor: '#e5e7eb' }}
          onFocus={e => e.target.style.borderColor = '#F5C4B3'}
          onBlur={e => e.target.style.borderColor = '#e5e7eb'} />

        {/* ── 레벨학습지 관리 탭 ── */}
        {tab === 'worksheet' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-3">
              {pendingWS.length > 0 && (
                <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                  <i className="ti ti-clock" style={{ fontSize: 18, color: '#993C1D' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#712B13' }}>채점 대기 {pendingWS.length}건</p>
                    <p className="text-xs" style={{ color: '#993C1D' }}>학생이 제출한 레벨학습지가 있어요</p>
                  </div>
                </div>
              )}

              {recentlyPassedLevelWS.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <button onClick={() => setShowRecentPassed(v => !v)}
                    className="w-full flex items-center gap-2 px-4 py-3 text-left">
                    <i className="ti ti-check" style={{ fontSize: 15, color: '#27500A' }} />
                    <p className="text-sm font-bold text-gray-700 flex-1">최근 24시간 완료 처리 {recentlyPassedLevelWS.length}건</p>
                    <span className="text-[11px] text-gray-400">잘못 눌렀다면 되돌리기 가능</span>
                    <i className={`ti ${showRecentPassed ? 'ti-chevron-up' : 'ti-chevron-down'}`} style={{ fontSize: 14, color: '#9ca3af' }} />
                  </button>
                  {showRecentPassed && (
                    <div className="border-t border-gray-50 divide-y divide-gray-50">
                      {recentlyPassedLevelWS.map((w) => (
                        <div key={w.id} className="px-4 py-2.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800">{getStudentName(w.student_id)}
                              <span className="font-normal text-gray-400 ml-1.5">{formatUnit(w.grade_level, w.unit, w.unit_name)} · {w.current_level}레벨</span>
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(w.updated_at ?? w.assigned_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 완료
                            </p>
                          </div>
                          <button onClick={() => handleRevertToScored(w)}
                            className="px-2.5 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap shrink-0"
                            style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                            ↩️ 되돌리기
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-file-text" style={{ fontSize: 16, color: '#993C1D' }} />
                  <h3 className="text-sm font-bold text-gray-700">레벨학습지 전체 현황</h3>
                  <span className="text-xs text-gray-400">{activeLevelWS.length}건 진행중</span>
                  <div className="flex items-center gap-2 ml-auto">
                      {deleteMode ? (
                        <>
                          <span className="text-xs text-gray-400">{selectedWSIds.length}개 선택</span>
                          <button onClick={handleBulkDelete} disabled={selectedWSIds.length === 0}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold disabled:opacity-40"
                            style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626' }}>
                            선택 삭제
                          </button>
                          <button onClick={() => { setDeleteMode(false); setSelectedWSIds([]) }}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                            style={{ background: '#f3f4f6', color: '#6b7280' }}>
                            취소
                          </button>
                        </>
                      ) : (
                        <button onClick={() => setDeleteMode(true)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                          <i className="ti ti-trash" style={{ fontSize: 12 }} /> 선택삭제
                        </button>
                      )}
                  </div>
                </div>
                {activeLevelWS.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">진행중인 레벨학습지가 없어요</p>
                ) : (() => {
                  // 학생별 그룹핑
                  const studentGroups: Record<string, typeof activeLevelWS> = {}
                  activeLevelWS.forEach(w => {
                    if (!studentGroups[w.student_id]) studentGroups[w.student_id] = []
                    studentGroups[w.student_id].push(w)
                  })
                  return (
                    <div className="divide-y divide-gray-50">
                      {Object.entries(studentGroups).map(([studentId, sWS]) => {
                        const student = students.find(s => s.id === studentId)
                        const isExpanded = expandedStudents.has(studentId)
                        const pendingCount = sWS.filter(w => w.status === 'submitted' || w.status === 'similar_submitted').length
                        const activeCount = sWS.filter(w => w.status === 'assigned' || w.status === 'similar_assigned').length
                        // retry는 예전 방식(현재는 안 쓰임)으로 남겨진 기록일 뿐 더 이상 누를 버튼이 없어서
                        // "결과대기"에 넣으면 실제로 처리할 게 없는데도 대기 건수처럼 보여 혼란을 줌 -> scored만 집계
                        const scoredCount = sWS.filter(w => w.status === 'scored').length
                        return (
                          <div key={studentId}>
                            {/* 학생 헤더 (클릭으로 펼치기) */}
                            <button
                              onClick={() => setExpandedStudents(prev => {
                                const next = new Set(prev)
                                if (next.has(studentId)) next.delete(studentId)
                                else next.add(studentId)
                                return next
                              })}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-all text-left"
                              style={{ background: isExpanded ? '#FFF5F2' : 'white' }}>
                              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                                style={{ background: '#FAECE7', color: '#993C1D' }}>
                                {student?.name?.[0] ?? '?'}
                              </div>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-gray-800">{student?.name ?? '-'}</p>
                                <p className="text-[10px] text-gray-400">{student?.grade} · {sWS.length}개 진행중</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {pendingCount > 0 && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: '#FAECE7', color: '#993C1D' }}>채점대기 {pendingCount}</span>
                                )}
                                {scoredCount > 0 && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: '#FAEEDA', color: '#633806' }}>결과대기 {scoredCount}</span>
                                )}
                                {activeCount > 0 && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                                    style={{ background: '#f3f4f6', color: '#6b7280' }}>진행중 {activeCount}</span>
                                )}
                              </div>
                              <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                                style={{ fontSize: 14, color: '#9ca3af' }} />
                            </button>

                            {/* 펼쳐진 학습지 목록 */}
                            {isExpanded && (
                              <div className="border-t border-gray-50">
                                {sWS.map((w, wIdx) => {
                                  const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                                  const isChecked = selectedWSIds.includes(w.id)
                                  const isSimilar = w.worksheet_type === 'similar'
                                  const statusOrder: Record<string,number> = {
                                    assigned: 0, similar_assigned: 0,
                                    submitted: 1, similar_submitted: 1,
                                    scored: 2, retry: 2, passed: 3,
                                  }
                                  const cur = statusOrder[w.status] ?? 0
                                  return (
                                    <div key={w.id}
                                      className="px-4 py-3 flex items-center gap-3"
                                      style={{
                                        background: isSimilar ? '#FFF9F8' : isChecked ? '#FFF5F2' : wIdx % 2 === 0 ? '#fafafa' : 'white',
                                        borderLeft: isSimilar ? '3px solid #F5C4B3' : '3px solid transparent',
                                      }}>
                                      {deleteMode && student && isEditable(student) && (
                                        <button onClick={() => setSelectedWSIds(prev =>
                                          isChecked ? prev.filter(id => id !== w.id) : [...prev, w.id]
                                        )}
                                          className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                          style={{ background: isChecked ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                                          {isChecked && <i className="ti ti-check" style={{ fontSize: 9, color: '#712B13' }} />}
                                        </button>
                                      )}
                                      {/* 단원 + 레벨 */}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                          {isSimilar && (
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                              style={{ background: '#FFF5F2', color: '#712B13' }}>오답유사</span>
                                          )}
                                          <span className="text-xs font-semibold text-gray-800 truncate">
                                            {formatUnit(w.grade_level, w.unit, w.unit_name)}
                                          </span>
                                          <span className="text-[10px] font-black shrink-0"
                                            style={{ color: w.current_level >= 4 ? '#993C1D' : '#6b7280' }}>
                                            Lv.{w.current_level}
                                          </span>
                                        </div>
                                      </div>
                                      {/* 점수 */}
                                      <div className="shrink-0 w-12 text-right">
                                        {w.score != null
                                          ? <span className="text-xs font-black"
                                              style={{ color: w.score >= 85 ? '#27500A' : w.score >= 80 ? '#633806' : '#991b1b' }}>
                                              {w.score}점
                                            </span>
                                          : <span className="text-[10px] text-gray-300">-</span>}
                                      </div>
                                      {/* 상태 */}
                                      <span className={cx('text-[10px] font-bold shrink-0 w-14 text-center', cfg.color)}>{cfg.label}</span>
                                      {/* 액션 - 주임모드로 넓게 보이는 학생(진짜 담당 아님)은 조회만 가능 */}
                                      {student && isEditable(student) ? (
                                        <div className="flex gap-1 shrink-0">
                                          {(w.status === 'assigned' || w.status === 'similar_assigned') && (
                                            <button onClick={() => handleSubmitted(w.id, w.status)}
                                              className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                              style={{ background: '#FFF5F2', color: '#712B13', border: '1px solid #F5C4B3' }}>제출확인</button>
                                          )}
                                          {(w.status === 'submitted' || w.status === 'similar_submitted') && (
                                            <button onClick={() => { setScoreWS(w); setShowScoreModal(true) }}
                                              className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                              style={{ background: '#FAECE7', color: '#993C1D', border: '1px solid #F5C4B3' }}>점수입력</button>
                                          )}
                                          {w.status === 'scored' && (
                                            <>
                                              <button onClick={() => handleLevelUp(w)}
                                                className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                                style={{ background: '#EAF3DE', color: '#27500A', border: '1px solid #639922' }}>레벨업↑</button>
                                              <button onClick={() => handleRetry(w)}
                                                className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                                style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626' }}>재도전</button>
                                              <button onClick={() => handleSimilarAssign(w)}
                                                className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                                style={{ background: '#FFF5F2', color: '#712B13', border: '1px solid #F5C4B3' }}>오답유사</button>
                                              <button onClick={() => handleComplete(w)}
                                                className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                                style={{ background: '#F5C4B3', color: '#712B13', border: '1px solid #F5C4B3' }}>완료</button>
                                            </>
                                          )}
                                          <button onClick={() => handleDelete(w.id)}
                                            className="px-1.5 py-1 text-[10px] rounded-lg text-gray-300 hover:text-red-500 transition-colors">
                                            <i className="ti ti-trash" style={{ fontSize: 12 }} />
                                          </button>
                                        </div>
                                      ) : (
                                        <span className="text-[10px] text-gray-300 shrink-0">보기 전용</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </div>

              {/* 쌍둥이학습지 현황 */}
              {activeTwinWS.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#EFF6FF', borderBottom: '1px solid #dbeafe' }}>
                    <i className="ti ti-copy" style={{ fontSize: 16, color: '#1e3a5f' }} />
                    <h3 className="text-sm font-bold" style={{ color: '#1e3a5f' }}>쌍둥이학습지 현황</h3>
                    <span className="text-xs" style={{ color: '#3b82f6' }}>{activeTwinWS.length}건 진행중</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: '#f8faff' }}>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500">학생</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500">단원</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500">차수</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500">점수</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-gray-500">상태</th>
                          <th className="px-3 py-2.5"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {activeTwinWS.map((w) => {
                          const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                          const twinRowStudent = students.find((s) => s.id === w.student_id)
                          // 단원명 요약: 첫개념~마지막개념
                          const conceptList = (w.unit_name ?? '').split(',').map((s: string) => s.trim()).filter(Boolean)
                          const first = conceptList[0] ?? ''
                          const last = conceptList[conceptList.length - 1] ?? ''
                          const unitDisplay = w.unit ? (first && first !== last ? `${w.unit} (${first} ~ ${last})` : w.unit) : first
                          return (
                            <tr key={w.id} className="hover:bg-blue-50/30">
                              <td className="px-3 py-2.5 font-bold text-gray-900">{getStudentName(w.student_id)}</td>
                              <td className="px-3 py-2.5 text-gray-600 max-w-[180px]">
                                <span className="text-xs block truncate" title={unitDisplay}>{unitDisplay}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                                  style={{ background: '#EFF6FF', color: '#1e3a5f' }}>{w.memo}</span>
                              </td>
                              <td className="px-3 py-2.5">
                                {w.score != null
                                  ? <span className="font-black" style={{ color: w.score >= 85 ? '#27500A' : w.score >= 80 ? '#633806' : '#991b1b' }}>{w.score}점</span>
                                  : <span className="text-gray-300">-</span>}
                              </td>
                              <td className="px-3 py-2.5">
                                <span className={cx('font-bold', cfg.color)}>{cfg.label}</span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {twinRowStudent && isEditable(twinRowStudent) ? (
                                  <div className="flex items-center gap-1">
                                    {w.status === 'assigned' && (
                                      <button onClick={() => handleSubmitted(w.id, w.status)}
                                        className="px-2 py-1 rounded-lg text-[10px] font-bold"
                                        style={{ background: '#FFF5F2', color: '#712B13', border: '1px solid #F5C4B3' }}>
                                        제출확인
                                      </button>
                                    )}
                                    {(w.status === 'submitted' || w.status === 'similar_submitted') && (
                                      <button onClick={() => { setScoreWS(w); setShowScoreModal(true) }}
                                        className="px-2 py-1 rounded-lg text-[10px] font-bold"
                                        style={{ background: '#EFF6FF', color: '#1e3a5f', border: '1px solid #bfdbfe' }}>
                                        점수입력
                                      </button>
                                    )}
                                    {w.status === 'scored' && (
                                      <div className="flex gap-1">
                                        <button onClick={() => { supabase.from('student_worksheets').update({ status: 'passed' }).eq('id', w.id).then(() => fetchData()) }}
                                          className="px-2 py-1 rounded-lg text-[10px] font-bold"
                                          style={{ background: '#EAF3DE', color: '#27500A', border: '1px solid #639922' }}>
                                          완료
                                        </button>
                                        <button onClick={() => { supabase.from('student_worksheets').update({ status: 'assigned' }).eq('id', w.id).then(() => fetchData()) }}
                                          className="px-2 py-1 rounded-lg text-[10px] font-bold"
                                          style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #dc2626' }}>
                                          재도전
                                        </button>
                                      </div>
                                    )}
                                    <button onClick={() => handleDelete(w.id)}
                                      className="px-1.5 py-1 rounded-lg text-[10px] text-gray-300 hover:text-red-500 transition-colors">
                                      <i className="ti ti-trash" style={{ fontSize: 12 }} />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-gray-300">보기 전용</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {/* ── 병행교재 관리 탭 ── */}
        {tab === 'textbook' && (
          <div className="space-y-3">
            {pendingTB.length > 0 && (
              <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                <i className="ti ti-clock" style={{ fontSize: 18, color: '#993C1D' }} />
                <div>
                  <p className="text-sm font-bold" style={{ color: '#712B13' }}>채점 대기 {pendingTB.length}건</p>
                  <p className="text-xs" style={{ color: '#993C1D' }}>학생이 제출한 병행교재 과제가 있어요</p>
                </div>
              </div>
            )}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                <i className="ti ti-book" style={{ fontSize: 16, color: '#993C1D' }} />
                <h3 className="text-sm font-bold text-gray-700">학생별 병행교재 진도</h3>
                <button onClick={() => setShowTBModal(true)}
                  className="ml-auto px-3 py-1 rounded-lg text-xs font-semibold"
                  style={{ background: '#F5C4B3', color: '#712B13' }}>
                  + 교재배정
                </button>
              </div>
              <div className="divide-y divide-gray-50">
                {filteredStudents.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">해당하는 학생이 없어요</p>
                ) : (
                  filteredStudents.map((student) => {
                    const studentTBs = textbooks.filter((t) => t.student_id === student.id)
                    const activeTBs = studentTBs.filter((t) => t.status === 'assigned')
                    const tbByType: Record<string, StudentTextbook[]> = {}
                    activeTBs.forEach((t) => {
                      if (!tbByType[t.textbook_type]) tbByType[t.textbook_type] = []
                      tbByType[t.textbook_type].push(t)
                    })
                    const lastTB = [...studentTBs].sort((a, b) =>
                      new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
                    )[0]
                    const lastConcept = lastTB ? getConceptById(lastTB.concept_id) : null

                    return (
                      <div key={student.id} className="px-4 py-3">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>
                            {student.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-800">{student.name}</p>
                              <span className="text-xs text-gray-400">{student.grade}</span>
                              {activeTBs.length > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{ background: '#FAECE7', color: '#993C1D' }}>
                                  {activeTBs.length}개 병행중
                                </span>
                              )}
                            </div>
                          </div>
                          {isEditable(student) && (
                            <button onClick={() => { setTbStudent(student); setShowTBModal(true) }}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0"
                              style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                              + 배정
                            </button>
                          )}
                        </div>

                        {Object.keys(tbByType).length > 0 ? (
                          <div className="flex flex-wrap gap-2 ml-11">
                            {Object.entries(tbByType).map(([type, tbs]) => {
                              const typeStyle: Record<string, { bg: string; color: string }> = {
                                '개념서': { bg: '#FAEEDA', color: '#633806' },
                                '유형서': { bg: '#EAF3DE', color: '#27500A' },
                                '심화서': { bg: '#fee2e2', color: '#991b1b' },
                                '연산서': { bg: '#ede9fe', color: '#5b21b6' },
                              }
                              const ts = typeStyle[type] ?? { bg: '#f3f4f6', color: '#6b7280' }
                              return (
                                <div key={type} className="px-2.5 py-1.5 rounded-xl text-xs"
                                  style={{ background: ts.bg, border: `1px solid ${ts.color}40` }}>
                                  <span className="font-bold" style={{ color: ts.color }}>{type}</span>
                                  <span className="text-gray-600 ml-1">{tbs[0]?.textbook_name}</span>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 ml-11">
                            {lastConcept
                              ? `마지막: ${lastTB?.textbook_name} · ${lastConcept.chapter} > ${lastConcept.concept_name}`
                              : '병행교재 과제 없음 · 첫 배정 필요'}
                          </p>
                        )}

                        {activeTextbooks.filter((t) => t.student_id === student.id).map((t) => {
                          const cfg2 = TB_STATUS[t.status] ?? TB_STATUS.assigned
                          const concept = getConceptById(t.concept_id)
                          return (
                            <div key={t.id} className="mt-2 ml-11 flex items-center gap-2 px-3 py-2 rounded-xl"
                              style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                              <span className="text-xs text-gray-600 flex-1">{t.textbook_name}{concept ? ` · ${concept.concept_name}` : ''}</span>
                              <span className={cx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', cfg2.bg, cfg2.color)}>
                                {cfg2.label}
                              </span>
                              {/* 제출확인/채점완료는 연산서(제출형 워크북)에만 해당 - 개념서/유형서/심화서는 개념 체크로 진도를 관리하므로
                                  실수로 이 상태가 되면 "진행중 교재" 목록(status==='assigned' 기준)에서 사라져버린다 */}
                              {isEditable(student) && t.textbook_type === '연산서' && t.status === 'assigned' && (
                                <button onClick={() => handleTBSubmitted(t.id)}
                                  className="px-2 py-1 text-[10px] font-semibold rounded-lg"
                                  style={{ background: '#FFF5F2', color: '#712B13', border: '1px solid #F5C4B3' }}>제출확인</button>
                              )}
                              {isEditable(student) && t.textbook_type === '연산서' && t.status === 'submitted' && (
                                <button onClick={() => handleTBChecked(t.id)}
                                  className="px-2 py-1 text-[10px] font-semibold rounded-lg"
                                  style={{ background: '#EAF3DE', color: '#27500A', border: '1px solid #639922' }}>채점완료</button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── 제출현황 탭 ── */}
        {tab === 'submissions' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-4">
              {pendingWS.length > 0 && (
                <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ background: '#FFF5F2', border: '1px solid #F5C4B3' }}>
                  <i className="ti ti-clock" style={{ fontSize: 18, color: '#993C1D' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#712B13' }}>학습지 채점 대기 {pendingWS.length}건</p>
                    <p className="text-xs" style={{ color: '#993C1D' }}>학생이 제출한 학습지가 있어요</p>
                  </div>
                </div>
              )}
              {pendingTB.length > 0 && (
                <div className="rounded-2xl px-4 py-3 flex items-center gap-3"
                  style={{ background: '#FAECE7', border: '1px solid #F5C4B380' }}>
                  <i className="ti ti-book" style={{ fontSize: 18, color: '#993C1D' }} />
                  <div>
                    <p className="text-sm font-bold" style={{ color: '#712B13' }}>교재 채점 대기 {pendingTB.length}건</p>
                    <p className="text-xs" style={{ color: '#993C1D' }}>학생이 제출한 교재 과제가 있어요</p>
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                {[
                  { key: 'ws', label: '학습지', icon: 'ti-file-text', count: activeWorksheets.length },
                  { key: 'tb', label: '교재',   icon: 'ti-book',      count: activeTextbooks.length },
                ].map((st) => (
                  <button key={st.key} onClick={() => setSubTab(st.key as 'ws' | 'tb')}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    style={subTab === st.key
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#9ca3af' }}>
                    <i className={`ti ${st.icon}`} style={{ fontSize: 13 }} />
                    {st.label}
                    <span className="text-[10px] opacity-70 ml-0.5">{st.count}</span>
                  </button>
                ))}
              </div>

              {subTab === 'ws' ? (
                activeWorksheets.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <i className="ti ti-file-text" style={{ fontSize: 32, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
                    <p className="text-sm text-gray-500">진행중인 학습지 과제가 없어요</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeWorksheets.map((w) => {
                      const student = myStudents.find((s) => s.id === w.student_id)
                      if (!student) return null
                      const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                      return (
                        <div key={w.id} className="bg-white rounded-2xl border p-3.5 flex items-center gap-3"
                          style={{ borderColor: (w.status === 'submitted' || w.status === 'similar_submitted') ? '#F5C4B3' : '#f0f0f0' }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>
                            {student.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <p className="text-sm font-bold text-gray-900">{student.name}</p>
                              <span className={cx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>{cfg.label}</span>
                              {w.worksheet_type === 'similar' && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                  style={{ background: '#FFF5F2', color: '#712B13' }}>오답유사</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">
                              {formatUnit(w.grade_level, w.unit, w.unit_name)} ·{' '}
                              <span className="font-semibold" style={{ color: w.current_level >= 4 ? '#993C1D' : '#374151' }}>{w.current_level}레벨</span>
                              {w.score != null && (
                                <span className="ml-2 font-bold" style={{
                                  color: w.score >= 85 ? '#27500A' : w.score >= 80 ? '#633806' : '#991b1b'
                                }}>{w.score}점</span>
                              )}
                            </p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              ) : (
                activeTextbooks.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <i className="ti ti-book" style={{ fontSize: 32, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
                    <p className="text-sm text-gray-500">진행중인 교재 과제가 없어요</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeTextbooks.map((t) => {
                      const student = myStudents.find((s) => s.id === t.student_id)
                      if (!student) return null
                      const cfg2 = TB_STATUS[t.status] ?? TB_STATUS.assigned
                      return (
                        <div key={t.id} className="bg-white rounded-2xl border p-3.5 flex items-center gap-3"
                          style={{ borderColor: t.status === 'submitted' ? '#F5C4B3' : '#f0f0f0' }}>
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>
                            {student.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <p className="text-sm font-bold text-gray-900">{student.name}</p>
                              <span className={cx('text-[10px] font-semibold px-1.5 py-0.5 rounded-full', cfg2.bg, cfg2.color)}>{cfg2.label}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: '#FAECE7', color: '#993C1D' }}>{t.textbook_type}</span>
                            </div>
                            <p className="text-xs text-gray-500">{t.textbook_name}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              )}
            </div>
          )
        )}

        {/* ── 단원 현황 탭 ── */}
        {tab === 'unit_status' && (
          loading || worksheetsFullLoading || !worksheetsFullLoaded ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : !unitStatusStudent ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">학습지 단원 현황을 볼 학생을 선택하세요</p>
              {filteredStudents.map((student) => {
                const passedCount = worksheetsFull.filter((w) => w.student_id === student.id && w.status === 'passed').length
                const totalUnits = [...new Set(worksheetsFull.filter((w) => w.student_id === student.id).map((w) => w.unit))].length
                return (
                  <button key={student.id} onClick={() => setUnitStatusStudent(student)}
                    className="w-full bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 transition-all text-left"
                    style={{ borderColor: '#f0f0f0' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#F5C4B3')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0')}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: '#FAECE7', color: '#993C1D' }}>
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.grade} · {student.teacher_name}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-gray-800">{totalUnits}단원 진행</p>
                      <p className="text-[10px] text-gray-400">{passedCount}개 완료</p>
                    </div>
                    <i className="ti ti-chevron-right" style={{ fontSize: 16, color: '#d1d5db' }} />
                  </button>
                )
              })}
            </div>
          ) : (() => {
            const studentWS = worksheetsFull.filter((w) => w.student_id === unitStatusStudent.id)
            const gradeGroups2 = [...new Set(studentWS.map((w) => w.grade_level))].sort()
            const SUPERSCRIPT: Record<number, string> = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }

            function getUnitStatus(gradeLevel: string, unit: string) {
              const unitWS = studentWS
                .filter((w) => w.grade_level === gradeLevel && w.unit === unit)
                .sort((a, b) => (b.current_level ?? 0) - (a.current_level ?? 0))
              if (unitWS.length === 0) return null
              const passed = unitWS.filter((w) => w.status === 'passed')
              const active = unitWS.find((w) => w.status !== 'passed')
              const maxLevel = Math.max(...passed.map((w) => w.current_level ?? 0))
              // 같은 레벨을 여러 번 진행했다면 배정순으로 회차(2차/3차...)를 매긴다
              const roundByLevel: Record<number, StudentWorksheet[]> = {}
              unitWS.forEach((w) => {
                if (!roundByLevel[w.current_level]) roundByLevel[w.current_level] = []
                roundByLevel[w.current_level].push(w)
              })
              Object.values(roundByLevel).forEach((arr) =>
                arr.sort((a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime())
              )
              function roundOf(w: StudentWorksheet) {
                const arr = roundByLevel[w.current_level] ?? []
                if (arr.length <= 1) return null
                const idx = arr.findIndex((x) => x.id === w.id)
                return idx + 1
              }
              return { passed, active, maxLevel, all: unitWS, roundOf }
            }

            const STATUS_COLOR: Record<string, string> = {
              assigned: '#3b82f6', submitted: '#f59e0b', scored: '#8b5cf6',
              retry: '#ef4444', passed: '#22c55e', similar_assigned: '#f97316', similar_submitted: '#f59e0b',
            }
            const STATUS_LABEL: Record<string, string> = {
              assigned: '과제중', submitted: '채점대기', scored: '결과대기',
              retry: '재도전', passed: '완료', similar_assigned: '오답유사', similar_submitted: '오답제출',
            }

            return (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: '#FAECE7', color: '#993C1D' }}>
                    {unitStatusStudent.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{unitStatusStudent.name}</p>
                    <p className="text-xs text-gray-400">{unitStatusStudent.grade} · {unitStatusStudent.teacher_name}</p>
                  </div>
                  <button onClick={() => setUnitStatusStudent(null)}
                    className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                    <i className="ti ti-arrow-left" style={{ fontSize: 13 }} />목록
                  </button>
                </div>

                <div className="flex gap-3 flex-wrap px-1">
                  {[
                    { color: '#22c55e', label: '완료' },
                    { color: '#8b5cf6', label: '결과대기' },
                    { color: '#3b82f6', label: '과제중' },
                    { color: '#ef4444', label: '재도전' },
                    { color: '#f59e0b', label: '채점대기' },
                    { color: '#e5e7eb', label: '미배정' },
                  ].map((s) => (
                    <div key={s.label} className="flex items-center gap-1">
                      <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} />
                      <span className="text-[10px] text-gray-500">{s.label}</span>
                    </div>
                  ))}
                </div>

                {gradeGroups2.map((grade) => {
                  const gradeWS = studentWS.filter((w) => w.grade_level === grade)
                  const units = [...new Set(gradeWS.map((w) => w.unit))]
                  return (
                    <div key={grade} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-3" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                        <p className="text-sm font-bold text-gray-800">{grade}</p>
                      </div>
                      <div className="p-4 space-y-3">
                        {units.map((unit) => {
                          const st = getUnitStatus(grade, unit)
                          if (!st) return null
                          const unitName = gradeWS.find((w) => w.unit === unit)?.unit_name ?? ''
                          return (
                            <div key={unit} className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: st.active ? STATUS_COLOR[st.active.status] ?? '#e5e7eb' : '#22c55e' }} />
                                <p className="text-xs font-semibold text-gray-700">
                                  {unit}{unitName ? ` · ${unitName}` : ''}
                                </p>
                                {st.active && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full ml-auto shrink-0"
                                    style={{ background: STATUS_COLOR[st.active.status] + '20', color: STATUS_COLOR[st.active.status] }}>
                                    {STATUS_LABEL[st.active.status]}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-1 flex-wrap pl-4">
                                {st.all.sort((a, b) => a.current_level - b.current_level).map((w) => {
                                  const round = st.roundOf(w)
                                  return (
                                    <div key={w.id}
                                      title={`${w.current_level}레벨${round ? ` ${round}차` : ''} · ${STATUS_LABEL[w.status] ?? w.status}${w.score != null ? ` · ${w.score}점` : ''}`}
                                      style={{
                                        width: 28, height: 28, borderRadius: 6,
                                        background: STATUS_COLOR[w.status] ?? '#e5e7eb',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'default', flexShrink: 0,
                                      }}>
                                      <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>
                                        {w.current_level}{round ? (SUPERSCRIPT[round] ?? `^${round}`) : ''}{w.worksheet_type === 'similar' ? '*' : ''}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                              {st.all.some((w) => w.score != null) && (
                                <div className="flex gap-1.5 flex-wrap pl-4">
                                  {st.all.filter((w) => w.score != null).map((w) => {
                                    const round = st.roundOf(w)
                                    return (
                                      <span key={w.id} className="text-[10px] font-bold"
                                        style={{ color: (w.score ?? 0) >= 85 ? '#22c55e' : (w.score ?? 0) >= 80 ? '#f59e0b' : '#ef4444' }}>
                                        {w.current_level}레벨{round ? ` ${round}차` : ''} {w.score}점
                                      </span>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {gradeGroups2.length === 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <i className="ti ti-file-text" style={{ fontSize: 32, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
                    <p className="text-sm text-gray-500">아직 배정된 학습지가 없어요</p>
                  </div>
                )}
              </div>
            )
          })()
        )}
      </div>

      {/* 학습지 배정 모달 */}
      {showWSModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowWSModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="ti ti-file-text" style={{ fontSize: 18, color: '#993C1D' }} />
                <h3 className="text-base font-bold text-gray-900">학습지 배정</h3>
              </div>
              <button onClick={() => setShowWSModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>

            {/* 학습지 종류 탭 */}
            <div className="flex gap-2">
              {([['level','레벨학습지'],['twin','쌍둥이학습지']] as const).map(([type, label]) => (
                <button key={type} onClick={() => { setWsType(type); setTwinStudent(null); setTwinSelectedConcepts([]) }}
                  className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                  style={wsType === type ? { background: '#F5C4B3', color: '#712B13' } : { background: '#f3f4f6', color: '#9ca3af' }}>
                  {label}
                </button>
              ))}
            </div>

            {wsType === 'twin' ? (
              <>
                {/* 쌍둥이 학습지 UI */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
                  {twinStudent ? (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#FAECE7', border: '2px solid #F5C4B3' }}>
                      <p className="text-sm font-bold flex-1" style={{ color: '#712B13' }}>{twinStudent.name} · {twinStudent.grade}</p>
                      <button onClick={() => { setTwinStudent(null); setTwinConcepts([]); setTwinSelectedConcepts([]) }} className="text-gray-400"><i className="ti ti-x" /></button>
                    </div>
                  ) : (
                    <>
                    <input value={twinSearch} onChange={e => setTwinSearch(e.target.value)}
                      placeholder="이름 검색" className="w-full text-sm rounded-xl px-3 py-2 mb-2 outline-none"
                      style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }} />
                    <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                      {myEditableStudents.filter(s => {
                        const middleOrHigh = s.grade.includes('중') || s.grade.includes('고')
                        // 초등학생이어도 실제 배정된 교재가 중등(또는 고등) 과정이면 쌍둥이학습지 대상에 포함
                        // (예: 초6인데 중1 과정 교재를 배정받은 학생)
                        const onAdvancedCurriculum = textbooks.some(t =>
                          t.student_id === s.id && (t.status === 'assigned' || t.status === 'completed') &&
                          (t.grade?.includes('중') || t.grade?.includes('고')))
                        return (middleOrHigh || onAdvancedCurriculum) && (twinSearch === '' || s.name.includes(twinSearch))
                      }).map(s => (
                        <button key={s.id} onClick={() => setTwinStudent(s)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: '#FAECE7', color: '#993C1D' }}>{s.name[0]}</div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                            <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                    </>
                  )}
                </div>

                {twinStudent && (() => {
                  const studentTBs = textbooks.filter(t => t.student_id === twinStudent.id && (t.status === 'assigned' || t.status === 'completed') && t.textbook_type !== '연산서')
                  return (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2">교재 선택</label>
                        <div className="flex flex-wrap gap-2">
                          {studentTBs.map(tb => (
                            <button key={tb.id} onClick={() => { setTwinTextbookId(tb.id); loadTwinConcepts(tb.id, tb.grade ?? '', tb.semester ?? 1) }}
                              className="px-3 py-1.5 rounded-xl text-xs font-medium transition-all"
                              style={twinTextbookId === tb.id ? { background: '#712B13', color: 'white' } : { background: '#f3f4f6', color: '#374151' }}>
                              {tb.textbook_name}
                            </button>
                          ))}
                        </div>
                      </div>

                      {twinConcepts.length > 0 && (() => {
                        const chapters = [...new Set(twinConcepts.map(c => c.chapter))]
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-xs font-bold text-gray-700">개념 범위 선택 <span className="text-gray-400 font-normal">복수 선택 가능</span></label>
                              <button onClick={() => setTwinSelectedConcepts(twinSelectedConcepts.length === twinConcepts.length ? [] : twinConcepts.map(c => c.id))}
                                className="text-[10px] px-2 py-1 rounded-lg" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                {twinSelectedConcepts.length === twinConcepts.length ? '전체 해제' : '전체 선택'}
                              </button>
                            </div>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {chapters.map(ch => {
                                const chConcepts = twinConcepts.filter(c => c.chapter === ch)
                                const allSelected = chConcepts.every(c => twinSelectedConcepts.includes(c.id))
                                return (
                                  <div key={ch}>
                                    <button onClick={() => {
                                      const ids = chConcepts.map(c => c.id)
                                      if (allSelected) setTwinSelectedConcepts(prev => prev.filter(id => !ids.includes(id)))
                                      else setTwinSelectedConcepts(prev => [...new Set([...prev, ...ids])])
                                    }} className="w-full text-left px-2 py-1.5 rounded-lg mb-1 flex items-center gap-2"
                                      style={{ background: allSelected ? '#FAECE7' : '#fafafa', border: '1px solid #f0f0f0' }}>
                                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                        style={{ background: allSelected ? '#F5C4B3' : '#e5e7eb' }}>
                                        {allSelected && <i className="ti ti-check" style={{ fontSize: 10, color: '#712B13' }} />}
                                      </div>
                                      <span className="text-xs font-bold text-gray-700">{ch}</span>
                                    </button>
                                    <div className="flex flex-wrap gap-1.5 ml-2">
                                      {chConcepts.map(c => {
                                        const sel = twinSelectedConcepts.includes(c.id)
                                        return (
                                          <button key={c.id} onClick={() => setTwinSelectedConcepts(prev => sel ? prev.filter(id => id !== c.id) : [...prev, c.id])}
                                            className="px-2 py-1 rounded-lg text-[11px] font-medium transition-all"
                                            style={sel ? { background: '#F5C4B3', color: '#712B13' } : { background: '#f3f4f6', color: '#6b7280' }}>
                                            {c.concept_name}
                                          </button>
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
                  )
                })()}

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">차수</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['1차','2차','오답','오답유사'] as const).map(r => (
                      <button key={r} onClick={() => setTwinRound(r)}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all"
                        style={twinRound === r ? { background: '#712B13', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <button onClick={handleTwinAssign}
                  disabled={!twinStudent || twinSelectedConcepts.length === 0 || twinAssigning}
                  className="w-full py-3 rounded-2xl text-sm font-bold transition-all"
                  style={!twinStudent || twinSelectedConcepts.length === 0 ? { background: '#f3f4f6', color: '#9ca3af' } : { background: '#712B13', color: 'white' }}>
                  {twinAssigning ? '배정 중...' : `쌍둥이학습지 배정 ${twinSelectedConcepts.length > 0 ? `(${twinSelectedConcepts.length}개 개념)` : ''}`}
                </button>
              </>
            ) : (
              <>
            {/* 개별/일괄 탭 */}
            <div className="flex gap-2">
              {[{ key: false, label: '개별 배정', icon: 'ti-user' }, { key: true, label: '일괄 배정', icon: 'ti-users' }].map((m) => (
                <button key={String(m.key)} onClick={() => { setBulkMode(m.key); setBulkStudentIds([]); setWsStudent(null) }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-bold transition-all"
                  style={bulkMode === m.key
                    ? { background: '#F5C4B3', color: '#712B13' }
                    : { background: '#f3f4f6', color: '#9ca3af' }}>
                  <i className={`ti ${m.icon}`} style={{ fontSize: 14 }} />
                  {m.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                학생 <span className="text-red-400">*</span>
                {bulkMode && bulkStudentIds.length > 0 && (
                  <span className="ml-2 font-normal text-gray-400">{bulkStudentIds.length}명 선택됨</span>
                )}
              </label>
              {!bulkMode ? (
                wsStudent ? (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: '#FAECE7', border: '2px solid #F5C4B3' }}>
                    <p className="text-sm font-bold flex-1" style={{ color: '#712B13' }}>{wsStudent.name} · {wsStudent.grade}</p>
                    <button onClick={() => setWsStudent(null)} className="text-gray-400"><i className="ti ti-x" /></button>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                    {filteredEditableStudents.map((s) => (
                      <button key={s.id} onClick={() => { setWsStudent(s); setMwSelectedLessons([]); setMwSemester(1) }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>{s.name[0]}</div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                  {/* 전체 선택 */}
                  <button onClick={() => {
                    if (bulkStudentIds.length === filteredEditableStudents.length) setBulkStudentIds([])
                    else setBulkStudentIds(filteredEditableStudents.map(s => s.id))
                  }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100"
                    style={{ background: '#fafafa' }}>
                    <div className="w-4 h-4 rounded flex items-center justify-center"
                      style={{ background: bulkStudentIds.length === filteredEditableStudents.length ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                      {bulkStudentIds.length === filteredEditableStudents.length && <i className="ti ti-check" style={{ fontSize: 10, color: '#712B13' }} />}
                    </div>
                    <span className="text-xs font-bold text-gray-600">전체 선택 ({filteredEditableStudents.length}명)</span>
                  </button>
                  {filteredEditableStudents.map((s) => {
                    const isChecked = bulkStudentIds.includes(s.id)
                    return (
                      <button key={s.id} onClick={() => setBulkStudentIds(prev =>
                        isChecked ? prev.filter(id => id !== s.id) : [...prev, s.id]
                      )}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                          style={{ background: isChecked ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                          {isChecked && <i className="ti ti-check" style={{ fontSize: 10, color: '#712B13' }} />}
                        </div>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>{s.name[0]}</div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">과정</label>
              <div className="flex gap-2">
                {(['초등','중등','고등'] as const).map((g) => (
                  <button key={g} onClick={() => {
                    setWsCourseGroup(g)
                    setWsConceptGrade(g === '초등' ? '초4' : g === '중등' ? '중1' : '공통수학1')
                    setWsChapters([]); setWsSubChapters([]); setWsConceptIds([])
                    setWsGradeLevel(g === '초등' ? '초4' : g === '중등' ? '중1' : '공통수학1')
                  }}
                    className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                    style={wsCourseGroup === g
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#9ca3af' }}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {wsCourseGroup === '초등' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">학년</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WORKSHEET_GRADE_LEVELS.map((g) => (
                      <button key={g} onClick={() => setWsGradeLevel(g)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={wsGradeLevel === g
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#6b7280' }}>{g}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    학기 <span className="text-gray-400 font-normal">(단원명 자동입력 및 보고서 정렬에 쓰여요)</span>
                  </label>
                  <div className="flex gap-1.5">
                    {([1, 2] as const).map((sem) => (
                      <button key={sem} onClick={() => setWsSemester(sem)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={wsSemester === sem
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#6b7280' }}>{sem}학기</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">단원</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WORKSHEET_UNITS.map((u) => (
                      <button key={u} onClick={() => setWsUnit(u)}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={wsUnit === u
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#6b7280' }}>{u}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    단원명 <span className="text-gray-400 font-normal">({wsGradeLevel} {wsSemester}학기 기준 자동입력 · 필요하면 수정)</span>
                  </label>
                  <input type="text" value={wsUnitName}
                    onChange={(e) => { setWsUnitName(e.target.value); setWsUnitNameTouched(true) }}
                    placeholder="예: 분수의 덧셈과 뺄셈"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    {wsCourseGroup === '중등' ? '학년' : '과목'}
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(wsCourseGroup === '중등'
                      ? ['중1','중2','중3']
                      : ['공통수학1','공통수학2','미적분1','확률과통계','대수','기하']
                    ).map((g) => (
                      <button key={g} onClick={() => { setWsConceptGrade(g); setWsChapters([]); setWsSubChapters([]) }}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={wsConceptGrade === g
                          ? { background: '#F5C4B3', color: '#712B13' }
                          : { background: '#f3f4f6', color: '#6b7280' }}>{g}</button>
                    ))}
                  </div>
                </div>
                {wsConceptGrade && (() => {
                  const gradeConcepts = concepts.filter((c) => c.grade === wsConceptGrade)
                  const chapters = [...new Set(gradeConcepts.map((c) => c.chapter))]
                  const subChapters = wsChapters.length > 0
                    ? [...new Set(gradeConcepts.filter((c) => wsChapters.includes(c.chapter)).map((c) => c.sub_chapter).filter((s): s is string => !!s))]
                    : []
                  return (
                    <>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 mb-2">대단원 <span className="text-[10px] font-normal text-gray-400">복수 선택 가능</span></label>
                        <div className="flex gap-1.5 flex-wrap">
                          {chapters.map((ch) => (
                            <button key={ch} onClick={() => {
                              const nextChapters = wsChapters.includes(ch) ? wsChapters.filter((x) => x !== ch) : [...wsChapters, ch]
                              setWsChapters(nextChapters)
                              const validSubs = [...new Set(concepts.filter((cc) => cc.grade === wsConceptGrade && nextChapters.includes(cc.chapter)).map((cc) => cc.sub_chapter).filter(Boolean))]
                              setWsSubChapters((prev) => prev.filter((s) => validSubs.includes(s)))
                              setWsConceptIds([])
                            }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                              style={wsChapters.includes(ch)
                                ? { background: '#F5C4B3', color: '#712B13' }
                                : { background: '#f3f4f6', color: '#6b7280' }}>{ch}</button>
                          ))}
                        </div>
                      </div>
                      {subChapters.length > 0 && (
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-2">중단원 <span className="text-[10px] font-normal text-gray-400">복수 선택 가능</span></label>
                          <div className="flex gap-1.5 flex-wrap">
                            {subChapters.filter((s): s is string => !!s).map((sub) => (
                              <button key={sub} onClick={() => {
                                setWsSubChapters((prev) => prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub])
                                setWsConceptIds([])
                              }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                style={wsSubChapters.includes(sub)
                                  ? { background: '#F5C4B3', color: '#712B13' }
                                  : { background: '#f3f4f6', color: '#6b7280' }}>{sub}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      {wsSubChapters.length > 0 && (() => {
                        const subConcepts = gradeConcepts
                          .filter((c) => wsChapters.includes(c.chapter) && wsSubChapters.includes(c.sub_chapter))
                          .sort((a, b) => a.concept_order - b.concept_order)
                        const allSelected = subConcepts.length > 0 && subConcepts.every((c) => wsConceptIds.includes(c.id))
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-2 flex-wrap gap-1.5">
                              <label className="text-xs font-bold text-gray-700">
                                소개념 <span className="text-[10px] font-normal" style={{ color: wsConceptIds.length === 0 ? '#dc2626' : '#9ca3af' }}>
                                  {wsConceptIds.length === 0 ? '필수 선택' : `${wsConceptIds.length}개 선택`}
                                </span>
                              </label>
                              {/* 중단원 단위로 통째로 낼 때는 하나하나 누르지 않고 한 번에 전체 선택/해제 */}
                              <button onClick={() => setWsConceptIds(allSelected ? [] : subConcepts.map((c) => c.id))}
                                className="text-[10px] font-bold px-2 py-1 rounded-lg transition-all"
                                style={allSelected
                                  ? { background: '#fee2e2', color: '#991b1b' }
                                  : { background: '#EAF3DE', color: '#27500A' }}>
                                {allSelected ? '전체 해제' : `중단원 전체선택 (${subConcepts.length}개)`}
                              </button>
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              {subConcepts.map((c) => (
                                <button key={c.id} onClick={() =>
                                  setWsConceptIds((prev) => prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id])}
                                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                  style={wsConceptIds.includes(c.id)
                                    ? { background: '#712B13', color: 'white' }
                                    : { background: '#f3f4f6', color: '#6b7280' }}>{c.concept_name}</button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  )
                })()}
              </>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시작 레벨 <span className="font-bold text-gray-900">{wsLevel}레벨</span></label>
              <div className="flex gap-1.5 flex-wrap">
                {WORKSHEET_LEVELS.map((l) => (
                  <button key={l} onClick={() => setWsLevel(l)}
                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={wsLevel === l
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>{l}</button>
                ))}
              </div>
            </div>

            {(wsCourseGroup === '중등' || wsCourseGroup === '고등') && wsSubChapters.length > 0 && wsConceptIds.length === 0 && (
              <p className="text-[11px] text-center" style={{ color: '#dc2626' }}>소개념을 1개 이상 선택해주세요</p>
            )}
            <button onClick={handleWSAssign}
              disabled={
                (!wsStudent && !bulkMode) || (bulkMode && bulkStudentIds.length === 0) || wsAssigning ||
                ((wsCourseGroup === '중등' || wsCourseGroup === '고등') && wsConceptIds.length === 0)
              }
              className="w-full py-3.5 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              {wsAssigning
                ? <><span className="w-4 h-4 border-2 border-[#712B13]/30 border-t-[#712B13] rounded-full animate-spin" />배정 중...</>
                : <><i className="ti ti-file-text" style={{ fontSize: 16 }} />{bulkMode ? `${bulkStudentIds.length}명 일괄 배정` : '레벨학습지 배정하기'}</>}
            </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 점수 입력 모달 */}
      {showScoreModal && scoreWS && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowScoreModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">점수 입력</h3>
              <button onClick={() => setShowScoreModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#fafafa' }}>
              <p className="text-sm font-bold text-gray-800">{getStudentName(scoreWS.student_id)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatUnit(scoreWS.grade_level, scoreWS.unit, scoreWS.unit_name)} · {scoreWS.current_level}레벨</p>
            </div>
            <input type="number" min="0" max="100" value={inputScore}
              onChange={(e) => setInputScore(e.target.value)}
              placeholder="0~100" autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-center focus:outline-none"
              onFocus={e => e.target.style.borderColor = '#F5C4B3'}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'} />
            {inputScore && (
              <div className="rounded-xl p-3 text-center text-sm font-bold"
                style={{
                  background: parseInt(inputScore) >= 85 ? '#EAF3DE' : parseInt(inputScore) >= 80 ? '#FAEEDA' : '#fee2e2',
                  color: parseInt(inputScore) >= 85 ? '#27500A' : parseInt(inputScore) >= 80 ? '#633806' : '#991b1b'
                }}>
                {scoreWS?.worksheet_type === 'twin'
                  ? '점수 저장 후 다음 액션 선택'
                  : (parseInt(inputScore) >= 85 ? '✓ 레벨업 추천' : parseInt(inputScore) >= 80 ? '△ 레벨업/재도전 선택' : '✕ 재도전/오답유사 선택')}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowScoreModal(false)}
                className="flex-1 py-3 rounded-xl text-gray-700 font-bold" style={{ background: '#f3f4f6' }}>취소</button>
              <button onClick={handleSaveScore} disabled={!inputScore || savingScore}
                className="flex-1 py-3 rounded-xl font-bold disabled:opacity-50"
                style={{ background: '#F5C4B3', color: '#712B13' }}>
                {savingScore ? '저장중...' : '저장'}
              </button>
            </div>
            {scoreWS && ['scored', 'retry'].includes(scoreWS.status) && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-600 text-center">다음 액션 선택</p>
                <div className="flex gap-2">
                  <button onClick={() => { handleComplete(scoreWS); setShowScoreModal(false) }}
                    className="flex-1 py-2.5 text-sm font-bold rounded-xl"
                    style={{ background: '#F5C4B3', color: '#712B13' }}>완료</button>
                  <button onClick={() => handleLevelUp(scoreWS)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: '#EAF3DE', color: '#27500A', border: '2px solid #639922' }}>레벨업 ↑</button>
                  <button onClick={() => handleRetry(scoreWS)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: '#fee2e2', color: '#991b1b', border: '2px solid #dc2626' }}>재도전</button>
                  <button onClick={() => { handleSimilarAssign(scoreWS); setShowScoreModal(false) }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold"
                    style={{ background: '#FFF5F2', color: '#712B13', border: '2px solid #F5C4B3' }}>오답유사</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 병행교재 배정 모달 */}
      {showTBModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowTBModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="ti ti-book" style={{ fontSize: 18, color: '#993C1D' }} />
                <h3 className="text-base font-bold text-gray-900">병행교재 배정</h3>
              </div>
              <button onClick={() => setShowTBModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
              {tbStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: '#FAECE7', border: '2px solid #F5C4B3' }}>
                  <p className="text-sm font-bold flex-1" style={{ color: '#712B13' }}>{tbStudent.name} · {tbStudent.grade}</p>
                  <button onClick={() => setTbStudent(null)} className="text-gray-400"><i className="ti ti-x" /></button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredEditableStudents.map((s) => (
                    <button key={s.id} onClick={() => {
                      setTbStudent(s)
                      if (s.grade.includes('초')) { setTbCourseGroup('초등'); setTbGrade(s.grade.replace('학년','').trim()) }
                      else if (s.grade.includes('중')) { setTbCourseGroup('중등'); setTbGrade(s.grade.includes('1') ? '중1' : s.grade.includes('2') ? '중2' : '중3') }
                      else { setTbCourseGroup('고등'); setTbGrade('고1') }
                      setTbChapter(''); setTbConcept(null)
                    }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: '#FAECE7', color: '#993C1D' }}>{s.name[0]}</div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.grade} · {s.textbook_grade ?? 'B'}등급</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                진행 과정 <span className="text-[10px] font-normal text-gray-400">학생 학년과 달라도 돼요</span>
              </label>
              <div className="flex gap-2 mb-2">
                {(['초등', '중등', '고등'] as const).map((group) => (
                  <button key={group} onClick={() => {
                    setTbCourseGroup(group)
                    setTbGrade(group === '초등' ? '초4' : group === '중등' ? '중1' : '고1')
                    setTbChapter(''); setTbConcept(null)
                  }}
                    className="flex-1 py-2 rounded-xl text-sm font-bold transition-all"
                    style={tbCourseGroup === group
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#9ca3af' }}>
                    {group}
                  </button>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {(tbCourseGroup === '초등' ? ['초1','초2','초3','초4','초5','초6'] :
                  tbCourseGroup === '중등' ? ['중1','중2','중3'] : ['고1','고2','고3']).map((g) => (
                  <button key={g} onClick={() => { setTbGrade(g); setTbChapter(''); setTbConcept(null) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={tbGrade === g
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>{g}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학기</label>
              <div className="flex gap-2">
                {[1,2].map((s) => (
                  <button key={s} onClick={() => { setTbSemester(s); setTbChapter(''); setTbConcept(null) }}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={tbSemester === s
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>{s}학기</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">단원</label>
              <div className="flex gap-2 flex-wrap">
                {tbChapters.map((ch) => (
                  <button key={ch} onClick={() => { setTbChapter(ch); setTbConcept(null) }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={tbChapter === ch
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>{ch}</button>
                ))}
              </div>
            </div>

            {tbChapter && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">시작 개념</label>
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                  {tbConcepts.map((c) => {
                    const isDone = tbStudent ? textbooks.some((t) => t.student_id === tbStudent.id && t.concept_id === c.id) : false
                    return (
                      <button key={c.id} onClick={() => setTbConcept(c)}
                        className="w-full text-left px-3 py-2.5 text-xs border-b border-gray-50 last:border-0 flex items-center gap-2"
                        style={tbConcept?.id === c.id ? { background: '#FAECE7', color: '#712B13', fontWeight: 600 } : {}}>
                        <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                          style={{ background: isDone ? '#EAF3DE' : '#f3f4f6', color: isDone ? '#27500A' : '#9ca3af' }}>
                          {isDone ? '✓' : c.concept_order}
                        </span>
                        {c.concept_name}
                        {isDone && <span className="ml-auto text-[10px] font-bold" style={{ color: '#27500A' }}>완료</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">교재 종류</label>
              <div className="flex gap-2 flex-wrap">
                {Object.keys(TEXTBOOK_LIST).map((type) => (
                  <button key={type} onClick={() => { setTbType(type); setTbName('') }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={tbType === type
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>{type}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">교재명</label>
              <div className="flex gap-2 flex-wrap">
                {TEXTBOOK_LIST[tbType].map((name) => (
                  <button key={name} onClick={() => setTbName(name)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={tbName === name
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>{name}</button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input type="text" value={tbMemo} onChange={(e) => setTbMemo(e.target.value)}
                placeholder="예: p.24~35"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>

            <button onClick={handleTBAssign} disabled={!tbStudent || !tbName || (!tbConcept && tbCourseGroup === '초등') || tbAssigning}
              className="w-full py-3.5 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              {tbAssigning
                ? <><span className="w-4 h-4 border-2 border-[#712B13]/30 border-t-[#712B13] rounded-full animate-spin" />배정 중...</>
                : <><i className="ti ti-book" style={{ fontSize: 16 }} />병행교재 배정하기</>}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed left-1/2 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white"
          style={{ bottom: 24, transform: 'translateX(-50%)', background: '#27500A', maxWidth: '90vw' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
