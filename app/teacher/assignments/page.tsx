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
  '연산서': ['빅데이터 연산', '최상위 연산', '원리셈', '기탄수학'],
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

export default function TeacherAssignmentsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [tab, setTab] = useState<'worksheet' | 'submissions' | 'unit_status' | 'textbook'>('worksheet')
  const [unitStatusStudent, setUnitStatusStudent] = useState<Student | null>(null)
  const [subTab, setSubTab] = useState<'ws' | 'tb'>('ws')
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeGroup, setGradeGroup] = useState('전체')
  const [searchText, setSearchText] = useState('')

  const [showWSModal, setShowWSModal] = useState(false)
  const [wsStudent, setWsStudent] = useState<Student | null>(null)
  const [wsGradeLevel, setWsGradeLevel] = useState('초4')
  const [wsUnit, setWsUnit] = useState('1단원')
  const [wsUnitName, setWsUnitName] = useState('')
  const [wsLevel, setWsLevel] = useState(2.5)
  const [wsCourseGroup, setWsCourseGroup] = useState<'초등'|'중등'|'고등'>('초등')
  const [wsConceptGrade, setWsConceptGrade] = useState('')
  const [wsChapters, setWsChapters] = useState<string[]>([])
  const [wsSubChapters, setWsSubChapters] = useState<string[]>([])
  const [wsAssigning, setWsAssigning] = useState(false)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkStudentIds, setBulkStudentIds] = useState<string[]>([])
  const [deleteMode, setDeleteMode] = useState(false)
  const [selectedWSIds, setSelectedWSIds] = useState<string[]>([])
  const [middleWorksheets, setMiddleWorksheets] = useState<MiddleWorksheet[]>([])
  const [mwSemester, setMwSemester] = useState(1)
  const [mwLargeUnit, setMwLargeUnit] = useState('')
  const [mwMediumUnit, setMwMediumUnit] = useState('')
  const [mwSelectedLessons, setMwSelectedLessons] = useState<MiddleWorksheet[]>([])
  const [mwRangeStart, setMwRangeStart] = useState<MiddleWorksheet | null>(null)
  const [mwLevel, setMwLevel] = useState(2.5)

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

  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  })
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

  const activeWorksheets = worksheets.filter((w) => {
    const student = students.find((s) => s.id === w.student_id)
    const groupMatch = gradeGroup === '전체' ? true :
      gradeGroup === '초등' ? student?.grade.includes('초') :
      gradeGroup === '중등' ? student?.grade.includes('중') :
      student?.grade.includes('고')
    return myStudentIds.has(w.student_id) && w.status !== 'passed' && !!groupMatch &&
      (searchText === '' || getStudentName(w.student_id).includes(searchText))
  })

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
    setWsAssigning(true)
    const isMiddleHigh = wsCourseGroup === '중등' || wsCourseGroup === '고등'
    const targets = bulkMode ? bulkStudentIds : wsStudent ? [wsStudent.id] : []
    if (targets.length === 0) { setWsAssigning(false); return }
    for (const sid of targets) {
      await supabase.from('student_worksheets').insert({
        student_id: sid, subject: '수학',
        grade_level: isMiddleHigh ? wsConceptGrade : wsGradeLevel,
        unit: isMiddleHigh ? wsChapters.join(' + ') : wsUnit,
        unit_name: isMiddleHigh ? wsSubChapters.join(' + ') : wsUnitName,
        current_level: wsLevel, status: 'assigned', worksheet_type: 'main',
      })
    }
    setShowWSModal(false); setWsStudent(null); setWsUnitName('')
    setBulkStudentIds([]); setBulkMode(false)
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

  async function handleDelete(id: string) {
    const { error } = await supabase.from('student_worksheets').delete().eq('id', id)
    if (error) {
      console.error('삭제 오류:', error)
      alert('삭제 실패: ' + error.message)
      return
    }
    setWorksheets(prev => prev.filter(w => w.id !== id))
  }

  async function handleBulkDelete() {
    if (selectedWSIds.length === 0) return
    const { error } = await supabase.from('student_worksheets').delete().in('id', selectedWSIds)
    if (error) {
      console.error('일괄삭제 오류:', error)
      alert('삭제 실패: ' + error.message)
      return
    }
    setWorksheets(prev => prev.filter(w => !selectedWSIds.includes(w.id)))
    setSelectedWSIds([])
    setDeleteMode(false)
  }

  async function handleBulkAssign() {
    if (bulkStudentIds.length === 0 || !wsStudent) return
    setWsAssigning(true)
    const isMiddleHigh = wsCourseGroup === '중등' || wsCourseGroup === '고등'
    for (const sid of bulkStudentIds) {
      await supabase.from('student_worksheets').insert({
        student_id: sid, subject: '수학',
        grade_level: isMiddleHigh ? wsConceptGrade : wsGradeLevel,
        unit: isMiddleHigh ? wsChapters.join(' + ') : wsUnit,
        unit_name: isMiddleHigh ? wsSubChapters.join(' + ') : wsUnitName,
        current_level: wsLevel, status: 'assigned', worksheet_type: 'main',
      })
    }
    setShowWSModal(false); setBulkStudentIds([]); setWsStudent(null); setWsUnitName('')
    setWsAssigning(false); fetchData()
  }

  async function handleComplete(w: StudentWorksheet) {
    await supabase.from('student_worksheets').update({ status: 'passed' }).eq('id', w.id)
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
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          tab === 'worksheet' ? (
            <button onClick={() => setShowWSModal(true)}
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
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-file-text" style={{ fontSize: 16, color: '#993C1D' }} />
                  <h3 className="text-sm font-bold text-gray-700">레벨학습지 전체 현황</h3>
                  <span className="text-xs text-gray-400">{activeWorksheets.length}건 진행중</span>
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
                {activeWorksheets.length === 0 ? (
                  <p className="text-center text-sm text-gray-400 py-6">진행중인 레벨학습지가 없어요</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: '#fafafa' }}>
                          {deleteMode && (
                            <th className="px-2 py-2.5">
                              <button onClick={() => {
                                if (selectedWSIds.length === activeWorksheets.length) setSelectedWSIds([])
                                else setSelectedWSIds(activeWorksheets.map(w => w.id))
                              }}
                                className="w-4 h-4 rounded flex items-center justify-center"
                                style={{ background: selectedWSIds.length === activeWorksheets.length ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                                {selectedWSIds.length === activeWorksheets.length && <i className="ti ti-check" style={{ fontSize: 9, color: '#712B13' }} />}
                              </button>
                            </th>
                          )}
                          {['학생명','학년','단원','레벨','점수','상태','담당','액션'].map((h) => (
                            <th key={h} className="px-3 py-2.5 text-left font-bold text-gray-500 whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {activeWorksheets.map((w) => {
                          const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                          const student = students.find((s) => s.id === w.student_id)
                          const isChecked = selectedWSIds.includes(w.id)
                          return (
                            <tr key={w.id} className="hover:bg-gray-50"
                              style={isChecked ? { background: '#FFF5F2' } : {}}>
                              {deleteMode && (
                                <td className="px-2 py-2.5">
                                  <button onClick={() => setSelectedWSIds(prev =>
                                    isChecked ? prev.filter(id => id !== w.id) : [...prev, w.id]
                                  )}
                                    className="w-4 h-4 rounded flex items-center justify-center"
                                    style={{ background: isChecked ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb', flexShrink: 0 }}>
                                    {isChecked && <i className="ti ti-check" style={{ fontSize: 9, color: '#712B13' }} />}
                                  </button>
                                </td>
                              )}
                              <td className="px-3 py-2.5 font-bold text-gray-900 whitespace-nowrap">
                                {getStudentName(w.student_id)}
                                {w.worksheet_type === 'similar' && (
                                  <span className="ml-1 text-[9px] font-bold px-1 py-0.5 rounded"
                                    style={{ background: '#FFF5F2', color: '#712B13' }}>오답</span>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{student?.grade ?? '-'}</td>
                              <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{formatUnit(w.grade_level, w.unit, w.unit_name)}</td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="font-black" style={{ color: w.current_level >= 4 ? '#993C1D' : '#374151' }}>
                                  {w.current_level}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {w.score != null ? (
                                  <span className="font-black" style={{
                                    color: w.score >= 85 ? '#27500A' : w.score >= 80 ? '#633806' : '#991b1b'
                                  }}>{w.score}점</span>
                                ) : <span className="text-gray-300">-</span>}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={cx('font-bold', cfg.color)}>{cfg.label}</span>
                              </td>
                              <td className="px-3 py-2.5 text-gray-400 whitespace-nowrap">{student?.teacher_name ?? '-'}</td>
                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-2">
                                  {/* 진행바 */}
                                  {(() => {
                                    const steps = [
                                      { key: 'assigned',   label: '배정' },
                                      { key: 'submitted',  label: '제출' },
                                      { key: 'scored',     label: '채점' },
                                      { key: 'passed',     label: '완료' },
                                    ]
                                    const statusOrder: Record<string,number> = {
                                      assigned: 0, similar_assigned: 0,
                                      submitted: 1, similar_submitted: 1,
                                      scored: 2, retry: 2,
                                      passed: 3,
                                    }
                                    const cur = statusOrder[w.status] ?? 0
                                    return (
                                      <div className="flex items-center gap-0.5">
                                        {steps.map((step, idx) => (
                                          <div key={step.key} className="flex items-center gap-0.5">
                                            <div className="flex flex-col items-center">
                                              <div className="w-4 h-4 rounded-full flex items-center justify-center"
                                                style={{
                                                  background: idx < cur ? '#F5C4B3' : idx === cur ? '#712B13' : '#e5e7eb',
                                                }}>
                                                {idx < cur
                                                  ? <i className="ti ti-check" style={{ fontSize: 8, color: '#712B13' }} />
                                                  : <span style={{ fontSize: 7, color: idx === cur ? 'white' : '#9ca3af', fontWeight: 700 }}>{idx+1}</span>
                                                }
                                              </div>
                                              <span className="text-[8px] mt-0.5 whitespace-nowrap"
                                                style={{ color: idx === cur ? '#712B13' : idx < cur ? '#F5C4B3' : '#9ca3af', fontWeight: idx === cur ? 700 : 400 }}>
                                                {step.label}
                                              </span>
                                            </div>
                                            {idx < steps.length - 1 && (
                                              <div className="w-4 h-px mb-3"
                                                style={{ background: idx < cur ? '#F5C4B3' : '#e5e7eb' }} />
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )
                                  })()}
                                  {/* 액션 버튼 */}
                                  <div className="flex gap-1 ml-1">
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
                                        <button onClick={() => handleComplete(w)}
                                          className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                          style={{ background: '#F5C4B3', color: '#712B13', border: '1px solid #F5C4B3' }}>완료</button>
                                      </>
                                    )}
                                    <button onClick={() => handleDelete(w.id)}
                                      className="px-2 py-1 text-[10px] font-semibold rounded-lg whitespace-nowrap"
                                      style={{ background: '#f3f4f6', color: '#9ca3af', border: '1px solid #e5e7eb' }}>삭제</button>
                                  </div>
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
                          <button onClick={() => { setTbStudent(student); setShowTBModal(true) }}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg shrink-0"
                            style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #e5e7eb' }}>
                            + 배정
                          </button>
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
                              {t.status === 'assigned' && (
                                <button onClick={() => handleTBSubmitted(t.id)}
                                  className="px-2 py-1 text-[10px] font-semibold rounded-lg"
                                  style={{ background: '#FFF5F2', color: '#712B13', border: '1px solid #F5C4B3' }}>제출확인</button>
                              )}
                              {t.status === 'submitted' && (
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
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : !unitStatusStudent ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">학습지 단원 현황을 볼 학생을 선택하세요</p>
              {filteredStudents.map((student) => {
                const passedCount = worksheets.filter((w) => w.student_id === student.id && w.status === 'passed').length
                const totalUnits = [...new Set(worksheets.filter((w) => w.student_id === student.id).map((w) => w.unit))].length
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
            const studentWS = worksheets.filter((w) => w.student_id === unitStatusStudent.id)
            const gradeGroups2 = [...new Set(studentWS.map((w) => w.grade_level))].sort()

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
                                {st.all.sort((a, b) => a.current_level - b.current_level).map((w) => (
                                  <div key={w.id}
                                    title={`${w.current_level}레벨 · ${STATUS_LABEL[w.status] ?? w.status}${w.score != null ? ` · ${w.score}점` : ''}`}
                                    style={{
                                      width: 28, height: 28, borderRadius: 6,
                                      background: STATUS_COLOR[w.status] ?? '#e5e7eb',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      cursor: 'default', flexShrink: 0,
                                    }}>
                                    <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>
                                      {w.current_level}{w.worksheet_type === 'similar' ? '*' : ''}
                                    </span>
                                  </div>
                                ))}
                              </div>
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
                <h3 className="text-base font-bold text-gray-900">레벨학습지 배정</h3>
              </div>
              <button onClick={() => setShowWSModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>

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
                    {filteredStudents.map((s) => (
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
                    if (bulkStudentIds.length === filteredStudents.length) setBulkStudentIds([])
                    else setBulkStudentIds(filteredStudents.map(s => s.id))
                  }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-100"
                    style={{ background: '#fafafa' }}>
                    <div className="w-4 h-4 rounded flex items-center justify-center"
                      style={{ background: bulkStudentIds.length === filteredStudents.length ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                      {bulkStudentIds.length === filteredStudents.length && <i className="ti ti-check" style={{ fontSize: 10, color: '#712B13' }} />}
                    </div>
                    <span className="text-xs font-bold text-gray-600">전체 선택 ({filteredStudents.length}명)</span>
                  </button>
                  {filteredStudents.map((s) => {
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
                    setWsChapters([]); setWsSubChapters([])
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
                  <label className="block text-xs font-bold text-gray-700 mb-2">단원명 <span className="text-gray-400 font-normal">(선택)</span></label>
                  <input type="text" value={wsUnitName} onChange={(e) => setWsUnitName(e.target.value)}
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
                              <button key={sub} onClick={() => setWsSubChapters((prev) => prev.includes(sub) ? prev.filter((x) => x !== sub) : [...prev, sub])}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                                style={wsSubChapters.includes(sub)
                                  ? { background: '#F5C4B3', color: '#712B13' }
                                  : { background: '#f3f4f6', color: '#6b7280' }}>{sub}</button>
                            ))}
                          </div>
                        </div>
                      )}
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

            <button onClick={handleWSAssign} disabled={(!wsStudent && !bulkMode) || (bulkMode && bulkStudentIds.length === 0) || wsAssigning}
              className="w-full py-3.5 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              {wsAssigning
                ? <><span className="w-4 h-4 border-2 border-[#712B13]/30 border-t-[#712B13] rounded-full animate-spin" />배정 중...</>
                : <><i className="ti ti-file-text" style={{ fontSize: 16 }} />{bulkMode ? `${bulkStudentIds.length}명 일괄 배정` : '레벨학습지 배정하기'}</>}
            </button>
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
                {parseInt(inputScore) >= 85 ? '✓ 레벨업/재도전 선택' : parseInt(inputScore) >= 80 ? '△ 레벨업/재도전 선택' : '✕ 오답유사 자동 배정'}
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
                  {filteredStudents.map((s) => (
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
    </div>
  )
}
