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
}

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
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
  assigned:          { label: '과제중',       color: 'text-gray-800',   bg: 'bg-blue-50 border-blue-200' },
  submitted:         { label: '채점대기',     color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
  similar_assigned:  { label: '오답유사중',   color: 'text-[#712B13]', bg: 'bg-purple-50 border-purple-200' },
  similar_submitted: { label: '오답유사채점', color: 'text-pink-500',   bg: 'bg-pink-50 border-pink-200' },
  scored:            { label: '결과대기',     color: 'text-gray-500',   bg: 'bg-white border-gray-200' },
  passed:            { label: '완료✓',       color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  retry:             { label: '재도전',       color: 'text-red-500',    bg: 'bg-red-50 border-red-200' },
}

const TB_STATUS: Record<string, { label: string; color: string }> = {
  assigned:  { label: '과제중',   color: 'text-gray-800' },
  submitted: { label: '제출완료', color: 'text-orange-500' },
  checked:   { label: '채점완료', color: 'text-green-600' },
}

const TEXTBOOK_LIST: Record<string, string[]> = {
  '개념서': ['개념+유형파워', '개념+유형라이트', '교과서 개념잡기', '리피트', '개념유형 라이트', '개념잡기'],
  '유형서': ['디딤돌 응용', '쎈B', '쎈', 'RPM', '수학리더(기본+응용)', '베이직쎈'],
  '심화서': ['최고수준', '최상위S', '최상위', '왕수학최상위', 'RPMpro', '일품', '고쟁이'],
  '연산서': ['빅데이터 연산', '최상위 연산', '원리셈', '기탄수학'],
}

const WORKSHEET_LEVELS = [1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0]
const WORKSHEET_GRADE_LEVELS = ['초1','초2','초3','초4','초5','초6']
const WORKSHEET_UNITS = ['1단원','2단원','3단원','4단원','5단원','6단원','7단원','8단원']
const GRADE_GROUPS = ['전체','초등','중등','고등']

const GRADE_COUNT: Record<string, number> = { A: 3, B: 2, C: 1 }

// 단원 표시 형식: "3-2 중단원명" 형식으로
function formatUnit(gradeLevel: string, unit: string, unitName: string) {
  // 초등: "초4 3단원 분수의 덧셈" → "초4 3단원 분수의 덧셈"
  // 중등: "중3 Ⅱ. 이차방정식 1. 이차방정식의 풀이" → "중3 Ⅱ-1 이차방정식의 풀이"
  if (unitName) {
    // 대단원에서 번호 추출 (로마자 등)
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

export default function TeacherAssignmentsPage() {
  const { currentUser, isAdmin } = useAuth()
const [tab, setTab] = useState<'worksheet' | 'submissions' | 'unit_status' | 'textbook'>('worksheet')
  const [unitStatusStudent, setUnitStatusStudent] = useState<any | null>(null)
  const [subTab, setSubTab] = useState<'ws' | 'tb'>('ws')
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeGroup, setGradeGroup] = useState('전체')
  const [searchText, setSearchText] = useState('')

  // 학습지 배정 모달
  const [showWSModal, setShowWSModal] = useState(false)
  const [wsStudent, setWsStudent] = useState<Student | null>(null)
  const [wsGradeLevel, setWsGradeLevel] = useState('초4')
  const [wsUnit, setWsUnit] = useState('1단원')
  const [wsUnitName, setWsUnitName] = useState('')
  const [wsLevel, setWsLevel] = useState(2.5)
  // 중등/고등 학습지 배정 - concepts 기반
  const [wsCourseGroup, setWsCourseGroup] = useState<'초등'|'중등'|'고등'>('초등')
  const [wsConceptGrade, setWsConceptGrade] = useState('')
  const [wsChapters, setWsChapters] = useState<string[]>([])
  const [wsSubChapters, setWsSubChapters] = useState<string[]>([])
  const [wsAssigning, setWsAssigning] = useState(false)

  // 중등 학습지 배정 상태
  const [middleWorksheets, setMiddleWorksheets] = useState<MiddleWorksheet[]>([])
  const [mwSemester, setMwSemester] = useState(1)
  const [mwLargeUnit, setMwLargeUnit] = useState('')
  const [mwMediumUnit, setMwMediumUnit] = useState('')
  const [mwSelectedLessons, setMwSelectedLessons] = useState<MiddleWorksheet[]>([])
  const [mwRangeStart, setMwRangeStart] = useState<MiddleWorksheet | null>(null)
  const [mwLevel, setMwLevel] = useState(2.5)

  // 점수 입력 모달
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [scoreWS, setScoreWS] = useState<StudentWorksheet | null>(null)
  const [inputScore, setInputScore] = useState('')
  const [savingScore, setSavingScore] = useState(false)

  // 교재 배정 모달
  const [showTBModal, setShowTBModal] = useState(false)
  const [tbStudent, setTbStudent] = useState<Student | null>(null)
  const [tbCourseGroup, setTbCourseGroup] = useState<'초등' | '중등' | '고등'>('초등') // 과정 탭 (학생 학년과 무관)
  const [tbGrade, setTbGrade] = useState('초4')
  const [tbSemester, setTbSemester] = useState(1)
  const [tbChapter, setTbChapter] = useState('')
  const [tbConcept, setTbConcept] = useState<Concept | null>(null)
  const [tbType, setTbType] = useState('개념서')
  const [tbName, setTbName] = useState('')
  const [tbMemo, setTbMemo] = useState('')
  const [tbAssigning, setTbAssigning] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: wData }, { data: tData }, { data: cData }, { data: mwData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('student_worksheets').select('*').order('assigned_at', { ascending: false }),
      supabase.from('student_textbooks').select('*').order('assigned_at', { ascending: false }),
      supabase.from('concepts').select('*').order('grade').order('semester').order('concept_order'),
      supabase.from('middle_worksheets').select('*').order('grade').order('semester').order('lesson_no'),
    ])
    if (sData) setStudents(sData)
    if (wData) setWorksheets(wData)
    if (tData) setTextbooks(tData)
    if (cData) setConcepts(cData)
    if (mwData) setMiddleWorksheets(mwData)
    setLoading(false)
  }

  const myStudents = students.filter((s) => isAdmin() ? true : s.teacher_name === currentUser?.name)
  const myStudentIds = new Set(myStudents.map((s) => s.id))

  const filteredStudents = myStudents.filter((s) => {
    const groupMatch = gradeGroup === '전체' ? true :
      gradeGroup === '초등' ? s.grade.includes('초') :
      gradeGroup === '중등' ? s.grade.includes('중') : s.grade.includes('고')
    const searchMatch = searchText === '' || s.name.includes(searchText) || s.school?.includes(searchText)
    return groupMatch && searchMatch
  })

  function getStudentName(id: string) {
    return students.find((s) => s.id === id)?.name ?? '알 수 없음'
  }

  function getConceptById(id: string) {
    return concepts.find((c) => c.id === id)
  }

  // 진행중인 레벨학습지
  const activeWorksheets = worksheets.filter((w) => {
    const student = students.find((s) => s.id === w.student_id)
    const groupMatch = gradeGroup === '전체' ? true :
      gradeGroup === '초등' ? student?.grade.includes('초') :
      gradeGroup === '중등' ? student?.grade.includes('중') :
      student?.grade.includes('고')
    return myStudentIds.has(w.student_id) && w.status !== 'passed' && !!groupMatch &&
      (searchText === '' || getStudentName(w.student_id).includes(searchText))
  })

  // 진행중인 교재과제
  const activeTextbooks = textbooks.filter((t) =>
    myStudentIds.has(t.student_id) && t.status !== 'checked' &&
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
    if (!wsStudent) return
    setWsAssigning(true)
    const isMiddleHigh = wsCourseGroup === '중등' || wsCourseGroup === '고등'
    await supabase.from('student_worksheets').insert({
      student_id: wsStudent.id, subject: '수학',
      grade_level: isMiddleHigh ? wsConceptGrade : wsGradeLevel,
      unit: isMiddleHigh ? wsChapters.join(' + ') : wsUnit,
      unit_name: isMiddleHigh ? wsSubChapters.join(' + ') : wsUnitName,
      current_level: wsLevel, status: 'assigned', worksheet_type: 'main',
    })
    setShowWSModal(false); setWsStudent(null); setWsUnitName('')
    setWsAssigning(false); fetchData()
  }

  async function handleMWAssign() {
    if (!wsStudent || mwSelectedLessons.length === 0) return
    setWsAssigning(true)
    const firstLesson = mwSelectedLessons[0]
    const lastLesson = mwSelectedLessons[mwSelectedLessons.length - 1]
    const unitName = mwSelectedLessons.length === 1
      ? firstLesson.lesson_name
      : `${firstLesson.lesson_no}차시~${lastLesson.lesson_no}차시`
    const matholicNos = [...new Set(mwSelectedLessons.map((l) => l.matholic_no).filter(Boolean))].join(', ')

    await supabase.from('student_worksheets').insert({
      student_id: wsStudent.id, subject: '수학',
      grade_level: wsStudent.grade,
      unit: firstLesson.medium_unit || firstLesson.large_unit,
      unit_name: unitName,
      current_level: mwLevel,
      status: 'assigned', worksheet_type: 'main',
      memo: matholicNos ? `매쓰홀릭 ${matholicNos}` : null,
    })
    setShowWSModal(false); setWsStudent(null)
    setMwSelectedLessons([]); setMwRangeStart(null)
    setMwLargeUnit(''); setMwMediumUnit('')
    setWsAssigning(false); fetchData()
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
    await supabase.from('student_worksheets').update({ score }).eq('id', scoreWS.id)
    if (scoreWS.status === 'submitted') {
      if (score < 80) {
        await supabase.from('student_worksheets').update({ status: 'retry' }).eq('id', scoreWS.id)
        await supabase.from('student_worksheets').insert({
          student_id: scoreWS.student_id, subject: '수학',
          grade_level: scoreWS.grade_level, unit: scoreWS.unit,
          unit_name: scoreWS.unit_name, current_level: scoreWS.current_level,
          status: 'similar_assigned', worksheet_type: 'similar', parent_worksheet_id: scoreWS.id,
        })
      } else {
        await supabase.from('student_worksheets').update({ status: 'scored' }).eq('id', scoreWS.id)
      }
    } else if (scoreWS.status === 'similar_submitted') {
      await supabase.from('student_worksheets').update({ status: 'scored' }).eq('id', scoreWS.id)
    }
    setSavingScore(false); setShowScoreModal(false); setInputScore(''); fetchData()
  }

  async function handleLevelUp(w: StudentWorksheet) {
    const nextLevel = Math.min(6.0, w.current_level + 0.5)
    await supabase.from('student_worksheets').update({ status: 'passed' }).eq('id', w.id)
    await supabase.from('student_worksheets').insert({
      student_id: w.student_id, subject: '수학',
      grade_level: w.grade_level, unit: w.unit, unit_name: w.unit_name,
      current_level: nextLevel, status: 'assigned', worksheet_type: 'main',
    })
    fetchData()
  }

  async function handleNextUnit(w: StudentWorksheet) {
    // 현재 단원 passed 처리 → 다음 단원 1레벨로 새 배정
    await supabase.from('student_worksheets').update({ status: 'passed' }).eq('id', w.id)
    // 다음 단원 찾기 (concepts 기반)
    const currentConcepts = concepts.filter((c) => c.grade === w.grade_level)
    const chapters = [...new Set(currentConcepts.map((c) => c.chapter))]
    const currentIdx = chapters.indexOf(w.unit)
    const nextChapter = currentIdx >= 0 && currentIdx < chapters.length - 1 ? chapters[currentIdx + 1] : null
    if (nextChapter) {
      await supabase.from('student_worksheets').insert({
        student_id: w.student_id, subject: '수학',
        grade_level: w.grade_level, unit: nextChapter, unit_name: '',
        current_level: 1, status: 'assigned', worksheet_type: 'main',
      })
    }
    fetchData()
  }

  async function handleRetry(w: StudentWorksheet) {
    await supabase.from('student_worksheets').update({ status: 'passed' }).eq('id', w.id)
    await supabase.from('student_worksheets').insert({
      student_id: w.student_id, subject: '수학',
      grade_level: w.grade_level, unit: w.unit, unit_name: w.unit_name,
      current_level: w.current_level, status: 'assigned', worksheet_type: 'main',
    })
    fetchData()
  }

  async function handleTBAssign() {
    if (!tbStudent || !tbName) return
    setTbAssigning(true)

    const isMiddle = tbCourseGroup === '중등' || tbCourseGroup === '고등'

    if (isMiddle) {
      // 중등/고등 과정: concept 없이 직접 배정
      await supabase.from('student_textbooks').insert({
        student_id: tbStudent.id,
        concept_id: null,
        textbook_name: tbName, textbook_type: tbType,
        status: 'assigned', memo: tbMemo || null,
      })
    } else {
      // 초등: concept 기반 배정
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
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          tab === 'worksheet' ? (
            <button onClick={() => setShowWSModal(true)}
              className="px-3 py-1.5 bg-[#9FE1CB] text-white text-xs font-semibold rounded-lg">
              + 학습지 배정
            </button>
          ) : undefined
        }
      />

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'worksheet',   label: '📝 학습지 배정' },
            { key: 'submissions', label: '◐ 제출현황' },
            { key: 'unit_status', label: '📊 단원 현황' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                tab === t.key ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {GRADE_GROUPS.map((g) => (
            <button key={g} onClick={() => setGradeGroup(g)}
              className={cx('px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all',
                gradeGroup === g ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200')}>
              {g}
            </button>
          ))}
        </div>

        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름으로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#9FE1CB]" />

        {/* ── 레벨학습지 관리 탭 ── */}
        {tab === 'worksheet' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* 채점대기 알림 */}
              {pendingWS.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-orange-500 text-lg">⏳</span>
                  <div>
                    <p className="text-sm font-bold text-orange-700">채점 대기 {pendingWS.length}건</p>
                    <p className="text-xs text-orange-400">학생이 제출한 레벨학습지가 있어요</p>
                  </div>
                </div>
              )}

              {/* 전체 테이블 뷰 */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-gray-800">레벨학습지 전체 현황</h3>
                  <span className="text-xs text-gray-400">{activeWorksheets.length}건 진행중</span>
                </div>
                {activeWorksheets.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">진행중인 레벨학습지가 없어요</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-white">
                        <tr>
                          {['학생명','학년','단원','레벨','점수','상태','담당','액션'].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {activeWorksheets.map((w) => {
                          const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                          const student = students.find((s) => s.id === w.student_id)
                          return (
                            <tr key={w.id} className="hover:bg-white">
                              <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">
                                {getStudentName(w.student_id)}
                                {w.worksheet_type === 'similar' && (
                                  <span className="ml-1 text-[9px] font-bold px-1 py-0.5 bg-purple-100 text-[#712B13] rounded">오답</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{student?.grade ?? '-'}</td>
                              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{formatUnit(w.grade_level, w.unit, w.unit_name)}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={cx('font-black', w.current_level >= 4 ? 'text-orange-500' : 'text-gray-800')}>
                                  {w.current_level}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {w.score != null ? (
                                  <span className={cx('font-black', w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                                    {w.score}점
                                  </span>
                                ) : <span className="text-gray-300">-</span>}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={cx('font-bold', cfg.color)}>{cfg.label}</span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{student?.teacher_name ?? '-'}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <div className="flex gap-1">
                                  {(w.status === 'assigned' || w.status === 'similar_assigned') && (
                                    <button onClick={() => handleSubmitted(w.id, w.status)}
                                      className="px-2 py-1 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg">제출확인</button>
                                  )}
                                  {(w.status === 'submitted' || w.status === 'similar_submitted') && (
                                    <button onClick={() => { setScoreWS(w); setShowScoreModal(true) }}
                                      className="px-2 py-1 text-[10px] font-semibold text-gray-800 bg-blue-50 border border-blue-200 rounded-lg">점수입력</button>
                                  )}
                                  {w.status === 'scored' && (
                                    <>
                                      <button onClick={() => handleLevelUp(w)}
                                        className="px-2 py-1 text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-lg">레벨업↑</button>
                                      <button onClick={() => handleRetry(w)}
                                        className="px-2 py-1 text-[10px] font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg">재도전</button>
                                      <button onClick={() => handleNextUnit(w)}
                                        className="px-2 py-1 text-[10px] font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded-lg">다음단원</button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ── 병행교재 관리 탭 ── */}
        {tab === 'textbook' && (
          <div className="space-y-3">
            {pendingTB.length > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                <span className="text-orange-500 text-lg">⏳</span>
                <div>
                  <p className="text-sm font-bold text-orange-700">채점 대기 {pendingTB.length}건</p>
                  <p className="text-xs text-orange-400">학생이 제출한 병행교재 과제가 있어요</p>
                </div>
              </div>
            )}

            {/* 학생별 병행교재 현황 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-800">📚 학생별 병행교재 진도</h3>
                <span className="text-xs text-gray-400">과제배정 버튼으로 다음 개념 배정</span>
              </div>
              <div className="divide-y divide-gray-50">
                {filteredStudents.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">해당하는 학생이 없어요</p>
                ) : (
                  filteredStudents.map((student) => {
                    const studentTBs = textbooks.filter((t) => t.student_id === student.id)
                    const activeTBs = studentTBs.filter((t) => t.status === 'assigned')
                    // 교재 타입별 그룹
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
                          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">
                            {student.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-800">{student.name}</p>
                              <span className="text-xs text-gray-400">{student.grade}</span>
                              {activeTBs.length > 0 && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-gray-800 rounded-full">
                                  {activeTBs.length}개 병행중
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => { setTbStudent(student); setShowTBModal(true) }}
                            className="px-2.5 py-1 text-xs font-semibold text-gray-800 bg-blue-50 border border-blue-200 rounded-lg shrink-0">
                            + 교재배정
                          </button>
                        </div>

                        {/* 교재 타입별 현황 */}
                        {Object.keys(tbByType).length > 0 ? (
                          <div className="flex flex-wrap gap-2 ml-11">
                            {Object.entries(tbByType).map(([type, tbs]) => (
                              <div key={type} className={cx('px-2.5 py-1.5 rounded-xl text-xs border',
                                type === '개념서' ? 'bg-blue-50 border-blue-200' :
                                type === '유형서' ? 'bg-green-50 border-green-200' :
                                type === '심화서' ? 'bg-orange-50 border-orange-200' :
                                'bg-purple-50 border-purple-200')}>
                                <span className="font-bold text-gray-700">{type}</span>
                                <span className="text-gray-500 ml-1">{tbs[0]?.textbook_name}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-400 ml-11">
                            {lastConcept
                              ? `마지막: ${lastTB?.textbook_name} · ${lastConcept.chapter} > ${lastConcept.concept_name}`
                              : '병행교재 과제 없음 · 첫 배정 필요'}
                          </p>
                        )}

                        {/* 진행중 교재 과제 처리 버튼 */}
                        {activeTextbooks.filter((t) => t.student_id === student.id).map((t) => {
                          const cfg2 = { assigned: { label: '과제중', color: 'text-gray-800' }, submitted: { label: '제출완료', color: 'text-orange-500' }, checked: { label: '채점완료', color: 'text-green-600' } }
                          const concept = getConceptById(t.concept_id)
                          return (
                            <div key={t.id} className="mt-2 ml-11 flex items-center gap-2 px-3 py-2 bg-white rounded-xl">
                              <span className="text-xs text-gray-600 flex-1">{t.textbook_name} · {concept?.concept_name}</span>
                              {t.status === 'assigned' && (
                                <button onClick={() => handleTBSubmitted(t.id)}
                                  className="px-2 py-1 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg">제출확인</button>
                              )}
                              {t.status === 'submitted' && (
                                <button onClick={() => handleTBChecked(t.id)}
                                  className="px-2 py-1 text-[10px] font-semibold text-green-600 bg-green-50 border border-green-200 rounded-lg">채점완료</button>
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
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* 채점대기 학습지 */}
              {pendingWS.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-orange-500 text-lg">⏳</span>
                  <div>
                    <p className="text-sm font-bold text-orange-700">학습지 채점 대기 {pendingWS.length}건</p>
                    <p className="text-xs text-orange-400">학생이 제출한 학습지가 있어요</p>
                  </div>
                </div>
              )}
              {/* 채점대기 교재 */}
              {pendingTB.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3 flex items-center gap-3">
                  <span className="text-blue-500 text-lg">📖</span>
                  <div>
                    <p className="text-sm font-bold text-blue-700">교재 채점 대기 {pendingTB.length}건</p>
                    <p className="text-xs text-blue-400">학생이 제출한 교재 과제가 있어요</p>
                  </div>
                </div>
              )}
              {/* 제출현황 탭 내부 탭 */}
              <div className="flex gap-2">
                {[
                  { key: 'ws',  label: '📝 학습지' },
                  { key: 'tb',  label: '📖 교재' },
                ].map((st) => (
                  <button key={st.key} onClick={() => setSubTab(st.key as 'ws' | 'tb')}
                    className={cx('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                      subTab === st.key ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200')}>
                    {st.label}
                    <span className="ml-1 text-[10px] opacity-70">
                      {st.key === 'ws' ? activeWorksheets.length : activeTextbooks.length}
                    </span>
                  </button>
                ))}
              </div>
              {subTab === 'ws' ? (
                activeWorksheets.length === 0 ? (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <p className="text-3xl mb-3">📝</p>
                    <p className="text-sm text-gray-500">진행중인 학습지 과제가 없어요</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeWorksheets.map((w) => {
                      const student = myStudents.find((s) => s.id === w.student_id)
                      if (!student) return null
                      const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                      return (
                        <div key={w.id} className={cx('bg-white rounded-2xl border-2 p-3.5 flex items-center gap-3',
                          w.status === 'submitted' || w.status === 'similar_submitted' ? 'border-orange-200' : 'border-gray-100')}>
                          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                            {student.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900">{student.name}</p>
                              <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>{cfg.label}</span>
                              {w.worksheet_type === 'similar' && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-[#712B13] rounded-md">오답유사</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {formatUnit(w.grade_level, w.unit, w.unit_name)} ·{' '}
                              <span className={cx('font-bold', w.current_level >= 4 ? 'text-orange-500' : 'text-gray-800')}>{w.current_level}레벨</span>
                              {w.score != null && (
                                <span className={cx('ml-2 font-bold', w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>{w.score}점</span>
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
                    <p className="text-3xl mb-3">📖</p>
                    <p className="text-sm text-gray-500">진행중인 교재 과제가 없어요</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {activeTextbooks.map((t) => {
                      const student = myStudents.find((s) => s.id === t.student_id)
                      if (!student) return null
                      const cfg2 = TB_STATUS[t.status] ?? TB_STATUS.assigned
                      return (
                        <div key={t.id} className={cx('bg-white rounded-2xl border-2 p-3.5 flex items-center gap-3',
                          t.status === 'submitted' ? 'border-orange-200' : 'border-gray-100')}>
                          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">
                            {student.name[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-gray-900">{student.name}</p>
                              <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg2.bg, cfg2.color)}>{cfg2.label}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-600 rounded-md">{t.textbook_type}</span>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">{t.textbook_name}</p>
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
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : !unitStatusStudent ? (
            // 학생 선택 화면
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">학습지 단원 현황을 볼 학생을 선택하세요</p>
              {filteredStudents.map((student) => {
                const studentWS = activeWorksheets.filter((w) => w.student_id === student.id)
                const passedCount = worksheets.filter((w) => w.student_id === student.id && w.status === 'passed').length
                const totalUnits = [...new Set(worksheets.filter((w) => w.student_id === student.id).map((w) => w.unit))].length
                return (
                  <button key={student.id} onClick={() => setUnitStatusStudent(student)}
                    className="w-full bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-blue-200 transition-all text-left">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
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
                    <span className="text-gray-300">›</span>
                  </button>
                )
              })}
            </div>
          ) : (() => {
            // 학생별 단원 현황 상세
            const studentWS = worksheets.filter((w) => w.student_id === unitStatusStudent.id)

            // 학년별 그룹핑
            const gradeGroups = [...new Set(studentWS.map((w) => w.grade_level))].sort()

            // 단원별 최신 상태 계산
            function getUnitStatus(gradeLevel: string, unit: string) {
              const unitWS = studentWS
                .filter((w) => w.grade_level === gradeLevel && w.unit === unit)
                .sort((a, b) => (b.current_level ?? 0) - (a.current_level ?? 0))
              if (unitWS.length === 0) return null
              const passed = unitWS.filter((w) => w.status === 'passed')
              const active = unitWS.find((w) => w.status !== 'passed')
              const maxLevel = Math.max(...passed.map((w) => w.current_level ?? 0))
              return { passed, active, maxLevel, all: unitWS }
            }

            const STATUS_COLOR: Record<string, string> = {
              assigned: '#3b82f6',
              submitted: '#f59e0b',
              scored: '#8b5cf6',
              retry: '#ef4444',
              passed: '#22c55e',
              similar_assigned: '#f97316',
              similar_submitted: '#f59e0b',
            }
            const STATUS_LABEL: Record<string, string> = {
              assigned: '과제중', submitted: '채점대기', scored: '결과대기',
              retry: '재도전', passed: '완료', similar_assigned: '오답유사', similar_submitted: '오답제출',
            }

            return (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700">
                    {unitStatusStudent.name[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{unitStatusStudent.name}</p>
                    <p className="text-xs text-gray-400">{unitStatusStudent.grade} · {unitStatusStudent.teacher_name}</p>
                  </div>
                </div>

                {/* 범례 */}
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

                {/* 학년별 단원 격자 */}
                {gradeGroups.map((grade) => {
                  const gradeWS = studentWS.filter((w) => w.grade_level === grade)
                  const units = [...new Set(gradeWS.map((w) => w.unit))]

                  return (
                    <div key={grade} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-50" style={{ background: '#ffffff' }}>
                        <p className="text-sm font-bold" style={{ color: '#1f2937' }}>{grade}</p>
                      </div>
                      <div className="p-4 space-y-3">
                        {units.map((unit) => {
                          const st = getUnitStatus(grade, unit)
                          if (!st) return null
                          const unitName = gradeWS.find((w) => w.unit === unit)?.unit_name ?? ''

                          return (
                            <div key={unit} className="space-y-1.5">
                              {/* 단원 헤더 */}
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

                              {/* 레벨별 격자 */}
                              <div className="flex gap-1 flex-wrap pl-4">
                                {st.all.sort((a, b) => a.current_level - b.current_level).map((w) => (
                                  <div key={w.id}
                                    title={`${w.current_level}레벨 · ${STATUS_LABEL[w.status] ?? w.status}${w.score != null ? ` · ${w.score}점` : ''}`}
                                    style={{
                                      width: 28, height: 28,
                                      borderRadius: 6,
                                      background: STATUS_COLOR[w.status] ?? '#e5e7eb',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      cursor: 'default', flexShrink: 0,
                                    }}>
                                    <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>
                                      {w.current_level}
                                      {w.worksheet_type === 'similar' ? '*' : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* 점수 표시 */}
                              {st.all.some((w) => w.score != null) && (
                                <div className="flex gap-1.5 flex-wrap pl-4">
                                  {st.all.filter((w) => w.score != null).map((w) => (
                                    <span key={w.id} className="text-[10px] font-bold"
                                      style={{ color: (w.score ?? 0) >= 85 ? '#22c55e' : (w.score ?? 0) >= 80 ? '#f59e0b' : '#ef4444' }}>
                                      {w.current_level}레벨 {w.score}점
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {gradeGroups.length === 0 && (
                  <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                    <p className="text-3xl mb-3">📝</p>
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
              <h3 className="text-base font-bold text-gray-900">📝 레벨학습지 배정</h3>
              <button onClick={() => setShowWSModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
              {wsStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <p className="text-sm font-bold text-blue-800 flex-1">{wsStudent.name} · {wsStudent.grade}</p>
                  <button onClick={() => { setWsStudent(null); setMwSelectedLessons([]); setMwRangeStart(null); setMwLargeUnit(''); setMwMediumUnit('') }} className="text-blue-400">✕</button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredStudents.map((s) => (
                    <button key={s.id} onClick={() => {
                      setWsStudent(s)
                      setMwSelectedLessons([]); setMwRangeStart(null); setMwLargeUnit(''); setMwMediumUnit('')
                      setMwSelectedLessons([]); setMwRangeStart(null)
                      setMwSemester(1)
                    }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white border-b border-gray-50 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">{s.name[0]}</div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 초등/중등/고등 통합 배정 UI */}
            {true && (
              <>
                {/* 과정 탭 */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">과정</label>
                  <div className="flex gap-2">
                    {(['초등','중등','고등'] as const).map((g) => (
                      <button key={g} onClick={() => {
                        setWsCourseGroup(g)
                        setWsConceptGrade(g === '초등' ? '초4' : g === '중등' ? '중1' : '공통수학1')
                        setWsChapters([]); setWsSubChapters([])
                        setWsGradeLevel(g === '초등' ? '초4' : g === '중등' ? '중1' : '공통수학1')
                      }}
                        className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                          wsCourseGroup === g ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
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
                            className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              wsGradeLevel === g ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>{g}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">단원</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {WORKSHEET_UNITS.map((u) => (
                          <button key={u} onClick={() => setWsUnit(u)}
                            className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              wsUnit === u ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>{u}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-2">단원명 <span className="text-gray-400 font-normal">(선택)</span></label>
                      <input type="text" value={wsUnitName} onChange={(e) => setWsUnitName(e.target.value)}
                        placeholder="예: 분수의 덧셈과 뺄셈"
                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                    </div>
                  </>
                ) : (
                  /* 중등/고등: concepts 기반 단원 선택 */
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
                            className={cx('px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                              wsConceptGrade === g ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>{g}</button>
                        ))}
                      </div>
                    </div>
                    {/* 대단원 */}
                    {wsConceptGrade && (() => {
                      const gradeConcepts = concepts.filter((c) => c.grade === wsConceptGrade)
                      const chapters = [...new Set(gradeConcepts.map((c) => c.chapter))]
                      const subChapters = wsChapters.length > 0
                        ? [...new Set(gradeConcepts.filter((c) => wsChapters.includes(c.chapter)).map((c) => c.sub_chapter))]
                        : []
                      return (
                        <>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-2">
                              대단원
                              <span className="ml-1.5 text-[10px] font-normal text-gray-400">복수 선택 가능</span>
                            </label>
                            <div className="flex gap-1.5 flex-wrap">
                              {chapters.map((ch) => {
                                const isChSel = wsChapters.includes(ch)
                                return (
                                  <button key={ch} onClick={() => {
                                    setWsChapters((prev) =>
                                      prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch]
                                    )
                                    setWsSubChapters([])
                                  }}
                                    className={cx('px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                                      isChSel ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>{ch}</button>
                                )
                              })}
                            </div>
                          </div>
                          {subChapters.length > 0 && (
                            <div>
                              <label className="block text-xs font-bold text-gray-700 mb-2">
                                중단원
                                <span className="ml-1.5 text-[10px] font-normal text-gray-400">복수 선택 가능</span>
                              </label>
                              <div className="flex gap-1.5 flex-wrap">
                                {subChapters.map((sub) => {
                                  const isSubSel = wsSubChapters.includes(sub)
                                  return (
                                    <button key={sub} onClick={() =>
                                      setWsSubChapters((prev) =>
                                        prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub]
                                      )}
                                      className={cx('px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                                        isSubSel ? 'bg-[#F5C4B3] text-white border-[#F5C4B3]' : 'bg-white text-gray-600 border-gray-200')}>
                                      {sub}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </>
                )}

                {/* 레벨 선택 (공통) */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">시작 레벨 <span className="text-gray-800 font-bold">{wsLevel}레벨</span></label>
                  <div className="flex gap-1.5 flex-wrap">
                    {WORKSHEET_LEVELS.map((l) => (
                      <button key={l} onClick={() => setWsLevel(l)}
                        className={cx('px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                          wsLevel === l ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>{l}</button>
                    ))}
                  </div>
                </div>
                <button onClick={handleWSAssign} disabled={!wsStudent || wsAssigning}
                  className="w-full py-3.5 bg-[#9FE1CB] text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                  {wsAssigning ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />배정 중...</> : '📝 레벨학습지 배정하기'}
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
              <button onClick={() => setShowScoreModal(false)} className="text-gray-400">✕</button>
            </div>
            <div className="bg-white rounded-xl p-3">
              <p className="text-sm font-bold text-gray-800">{getStudentName(scoreWS.student_id)}</p>
              <p className="text-xs text-gray-500 mt-0.5">{formatUnit(scoreWS.grade_level, scoreWS.unit, scoreWS.unit_name)} · {scoreWS.current_level}레벨</p>
            </div>
            <input type="number" min="0" max="100" value={inputScore}
              onChange={(e) => setInputScore(e.target.value)}
              placeholder="0~100" autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-[#9FE1CB]" />
            {inputScore && (
              <div className={cx('rounded-xl p-3 text-center text-sm font-bold',
                parseInt(inputScore) >= 85 ? 'bg-green-50 text-green-600' :
                parseInt(inputScore) >= 80 ? 'bg-orange-50 text-orange-500' : 'bg-red-50 text-red-500')}>
                {parseInt(inputScore) >= 85 ? '✓ 레벨업/재도전 선택' :
                 parseInt(inputScore) >= 80 ? '△ 레벨업/재도전 선택' : '✕ 오답유사 자동 배정'}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowScoreModal(false)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
              <button onClick={handleSaveScore} disabled={!inputScore || savingScore}
                className="flex-1 py-3 bg-[#9FE1CB] text-white font-bold rounded-xl disabled:opacity-50">
                {savingScore ? '저장중...' : '저장'}
              </button>
            </div>
            {/* 점수 저장 후 액션 선택 */}
            {scoreWS && ['scored', 'retry'].includes(scoreWS.status) && (
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-bold text-gray-600 text-center">다음 액션 선택</p>
                <div className="flex gap-2">
                  <button onClick={() => handleLevelUp(scoreWS)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                    style={{ background: '#EAF3DE', color: '#27500A', borderColor: '#639922' }}>
                    레벨업 ↑
                  </button>
                  <button onClick={() => handleRetry(scoreWS)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                    style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#dc2626' }}>
                    재도전
                  </button>
                  <button onClick={() => handleNextUnit(scoreWS)}
                    className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 transition-all"
                    style={{ background: '#FAEEDA', color: '#633806', borderColor: '#d97706' }}>
                    다음단원
                  </button>
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
              <h3 className="text-base font-bold text-gray-900">📖 병행교재 배정</h3>
              <button onClick={() => setShowTBModal(false)} className="text-gray-400">✕</button>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
              {tbStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-2 border-green-300 rounded-xl">
                  <p className="text-sm font-bold text-green-800 flex-1">{tbStudent.name} · {tbStudent.grade}</p>
                  <button onClick={() => setTbStudent(null)} className="text-green-400">✕</button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredStudents.map((s) => (
                    <button key={s.id} onClick={() => {
                      setTbStudent(s)
                      // 학생 학년에 맞게 과정 탭 자동 설정 (이후 자유롭게 변경 가능)
                      if (s.grade.includes('초')) {
                        setTbCourseGroup('초등')
                        setTbGrade(s.grade.replace('학년','').trim())
                      } else if (s.grade.includes('중')) {
                        setTbCourseGroup('중등')
                        setTbGrade(s.grade.includes('1') ? '중1' : s.grade.includes('2') ? '중2' : '중3')
                      } else if (s.grade.includes('고')) {
                        setTbCourseGroup('고등')
                        setTbGrade(s.grade.includes('1') ? '고1' : s.grade.includes('2') ? '고2' : '고3')
                      }
                      setTbChapter(''); setTbConcept(null)
                    }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 border-b border-gray-50 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">{s.name[0]}</div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.grade} · {s.textbook_grade ?? 'B'}등급</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* 과정 선택 (학생 학년과 무관하게 자유 선택) */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                📚 진행 과정
                <span className="ml-1.5 text-[10px] font-normal text-gray-400">학생 학년과 달라도 돼요</span>
              </label>
              {/* 과정 탭 */}
              <div className="flex gap-2 mb-2">
                {(['초등', '중등', '고등'] as const).map((group) => (
                  <button key={group} onClick={() => {
                    setTbCourseGroup(group)
                    const defaultGrade = group === '초등' ? '초4' : group === '중등' ? '중1' : '고1'
                    setTbGrade(defaultGrade)
                    setTbChapter(''); setTbConcept(null)
                  }}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      tbCourseGroup === group ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                    {group}
                  </button>
                ))}
              </div>
              {/* 학년 선택 */}
              <div className="flex gap-1.5 flex-wrap">
                {(tbCourseGroup === '초등' ? ['초1','초2','초3','초4','초5','초6'] :
                  tbCourseGroup === '중등' ? ['중1','중2','중3'] :
                  ['고1','고2','고3']).map((g) => (
                  <button key={g} onClick={() => { setTbGrade(g); setTbChapter(''); setTbConcept(null) }}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      tbGrade === g ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학기</label>
              <div className="flex gap-2">
                {[1,2].map((s) => (
                  <button key={s} onClick={() => { setTbSemester(s); setTbChapter(''); setTbConcept(null) }}
                    className={cx('px-4 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      tbSemester === s ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{s}학기</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">단원</label>
              <div className="flex gap-2 flex-wrap">
                {tbChapters.map((ch) => (
                  <button key={ch} onClick={() => { setTbChapter(ch); setTbConcept(null) }}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      tbChapter === ch ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{ch}</button>
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
                        className={cx('w-full text-left px-3 py-2.5 text-xs border-b border-gray-50 last:border-0 flex items-center gap-2',
                          tbConcept?.id === c.id ? 'bg-green-50 text-green-700 font-bold' : 'hover:bg-white text-gray-700')}>
                        <span className={cx('w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0',
                          isDone ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400')}>
                          {isDone ? '✓' : c.concept_order}
                        </span>
                        {c.concept_name}
                        {isDone && <span className="ml-auto text-[10px] text-green-500 font-bold">완료</span>}
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
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      tbType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{type}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">교재명</label>
              <div className="flex gap-2 flex-wrap">
                {TEXTBOOK_LIST[tbType].map((name) => (
                  <button key={name} onClick={() => setTbName(name)}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      tbName === name ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{name}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input type="text" value={tbMemo} onChange={(e) => setTbMemo(e.target.value)}
                placeholder="예: p.24~35"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <button onClick={handleTBAssign} disabled={!tbStudent || !tbName || (!tbConcept && tbCourseGroup === '초등') || tbAssigning}
              className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {tbAssigning ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />배정 중...</> : '📖 병행교재 배정하기'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
