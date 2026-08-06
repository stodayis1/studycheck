'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { compressRangeLabels } from '@/lib/utils'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

interface Student {
  id: string; name: string; grade: string; school: string; teacher_name: string; is_active: boolean
}
interface Exam {
  id: string; student_id: string; exam_type: string; exam_date: string
  title: string | null; unit: string | null; unit_name: string | null
  level: number | null; score: number | null; total_score: number
  memo: string | null; teacher_name: string | null
}

const EXAM_TYPES = ['입학테스트', '진단평가', '코어테스트', '학교시험'] as const
const GRADE_OPTIONS = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','공통수학1','공통수학2','대수','미적분1','확률과통계','기하']
type ExamType = typeof EXAM_TYPES[number]

const EXAM_CONFIG: Record<ExamType, { color: string; bg: string; badge: string; desc: string; icon: string }> = {
  '입학테스트': { color: '#085041', bg: '#F0FBF7', badge: '#9FE1CB', desc: '신규 학생 기준점 평가', icon: 'ti-door-enter' },
  '진단평가':   { color: '#633806', bg: '#FAEEDA', badge: '#EF9F27', desc: '주간 개별 진단', icon: 'ti-clipboard-check' },
  '코어테스트': { color: '#27500A', bg: '#EAF3DE', badge: '#639922', desc: '2개월 정기 평가', icon: 'ti-target' },
  '학교시험':   { color: '#1e3a5f', bg: '#EFF6FF', badge: '#3b82f6', desc: '중간·기말고사', icon: 'ti-school' },
}

const SCHOOL_EXAM_TYPES = ['중간고사', '기말고사', '단원평가']

// 초등 대단원 입력 패널
function ElementaryEntryPanel({ unitKey, unitLabel, entry, examTotalScore, tab, cfg, onChange, scoreBg, scoreColor, pct }: any) {
  return (
    <div className="rounded-xl p-3 space-y-3" style={{ background: '#f9fafb', border: '1px solid #f3f4f6' }}>
      <p className="text-xs font-bold" style={{ color: cfg.color }}>{unitLabel}</p>
      {tab === '진단평가' && (
        <div>
          <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">레벨</label>
          <div className="flex gap-1 flex-wrap">
            {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((l: number) => (
              <button key={l} onClick={() => onChange({ level: entry.level === l ? null : l })}
                className="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all"
                style={entry.level === l
                  ? { background: '#EF9F27', color: 'white', borderColor: '#EF9F27' }
                  : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">점수</label>
        <div className="flex gap-2 items-center">
          <input type="number" min="0" value={entry.score}
            onChange={(e) => onChange({ score: e.target.value })}
            placeholder="0"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none text-center font-bold text-base" />
          <span className="text-gray-400 text-xs">/ {examTotalScore}</span>
        </div>
        {entry.score && (
          <div className="mt-1.5 rounded-lg px-2 py-1.5 text-center text-xs font-bold"
            style={{ background: scoreBg(parseFloat(entry.score), parseFloat(examTotalScore)||100), color: scoreColor(parseFloat(entry.score), parseFloat(examTotalScore)||100) }}>
            {pct(parseFloat(entry.score), parseFloat(examTotalScore)||100)}%
          </div>
        )}
      </div>
      <input value={entry.memo} onChange={(e) => onChange({ memo: e.target.value })}
        placeholder="메모 (선택)"
        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none" />
    </div>
  )
}

export default function TeacherExamsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<ExamType>('입학테스트')
  const [gradeGroup, setGradeGroup] = useState('전체')
  const [searchText, setSearchText] = useState('')
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [concepts, setConcepts] = useState<any[]>([])
  const [studentTextbooks, setStudentTextbooks] = useState<any[]>([])
  // 단원별 탭 평가 입력
  const [unitEntries, setUnitEntries] = useState<Record<string, { level: number | null; score: string; memo: string }>>({})
  const [activeUnitTabs, setActiveUnitTabs] = useState<string[]>([])
  const [activeSubTabs, setActiveSubTabs] = useState<string[]>([])
  const [rangeGradeOverride, setRangeGradeOverride] = useState('')

  // 등록 모달
  const [showModal, setShowModal] = useState(false)
  const [modalStudent, setModalStudent] = useState<Student | null>(null)
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0])
  const [examTitle, setExamTitle] = useState('')
  const [examUnit, setExamUnit] = useState('')
  const [examUnitName, setExamUnitName] = useState('')
  const [examLevel, setExamLevel] = useState<number | null>(null)
  const [examScore, setExamScore] = useState('')
  const [examTotalScore, setExamTotalScore] = useState('100')
  const [examMemo, setExamMemo] = useState('')
  const [saving, setSaving] = useState(false)

  // 개별 평가 수정/삭제 (등록된 값 실수로 잘못 올렸을 때 고치는 용도)
  const [editingExam, setEditingExam] = useState<Exam | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editUnitName, setEditUnitName] = useState('')
  const [editLevel, setEditLevel] = useState('')
  const [editScore, setEditScore] = useState('')
  const [editTotalScore, setEditTotalScore] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  // 코어테스트 일괄입력
  const [showCoreModal, setShowCoreModal] = useState(false)
  const [coreGrade, setCoreGrade] = useState('')
  const [coreTitle, setCoreTitle] = useState('')
  const [coreDate, setCoreDate] = useState(new Date().toISOString().split('T')[0])
  const [coreTotalScore, setCoreTotalScore] = useState('100')
  const [coreActiveUnits, setCoreActiveUnits] = useState<string[]>([])
  const [coreActiveSubTabs, setCoreActiveSubTabs] = useState<string[]>([])
  const [coreRangeText, setCoreRangeText] = useState('') // 시험범위 - 같은 학년 전체가 같은 범위로 일괄 치르므로 체크박스 대신 직접 입력
  const [coreScores, setCoreScores] = useState<Record<string, string>>({}) // studentId → score
  // 코어테스트는 하루에 다 같이 보는 게 아니라 기간을 두고 학생마다 다른 날 보는 경우가 있어서,
  // 상단 "기본 날짜"를 대부분 학생에게 적용하고, 필요한 학생만 개별로 날짜를 바꿀 수 있게 함
  const [coreScoreDates, setCoreScoreDates] = useState<Record<string, string>>({}) // studentId → date (없으면 coreDate 사용)
  // 이미 저장된 학생의 exams row id (student_id → exam id) - 있으면 새로 만들지 않고 그 행을 업데이트한다.
  // 담당 학생 15명 중 1명만 입력하고 나중에 다시 열어서 나머지를 입력해도, 먼저 입력한 학생 점수가
  // 그대로 남아있게(=중복 저장되지 않게) 하기 위함.
  const [coreExistingIds, setCoreExistingIds] = useState<Record<string, string>>({})
  const [coreSaving, setCoreSaving] = useState(false)
  const [coreSemester, setCoreSemester] = useState(1) // 초/중 단원은 학기별로 나뉘어 있어 구분 필요

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: eData }, { data: cData }, { data: tbData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('exams').select('*').order('exam_date', { ascending: false }),
      supabase.from('concepts').select('*').order('grade').order('concept_order'),
      supabase.from('student_textbooks').select('*'),
    ])
    if (sData) setStudents(sData)
    if (eData) setExams(eData)
    if (cData) setConcepts(cData)
    if (tbData) setStudentTextbooks(tbData)
    setLoading(false)
  }

  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  })

  // 코어테스트 일괄입력 모달: 학년 또는 회차를 고르면(혹은 모달을 다시 열면) 이미 저장된 기록을 불러와 미리 채운다.
  // - 시험범위는 같은 학년+회차라면 어느 선생님이 입력했든(전체 students 기준) 가져와서 재입력할 필요가 없게 함
  // - 점수/날짜/기존 행 id는 화면에 보이는 담당 학생(myStudents)만 채움 - 담당 학생만 보이는 목록 자체는 그대로 유지
  // - 학년·회차가 바뀔 때는 이전 선택의 값이 섞여 들어가지 않도록 먼저 비우고 새로 채운다
  useEffect(() => {
    if (!showCoreModal) return
    setCoreScores({})
    setCoreScoreDates({})
    setCoreExistingIds({})
    if (!coreGrade || !coreTitle) return

    const gradeStudentIds = new Set(students.filter((s) => s.grade === coreGrade).map((s) => s.id))
    const matches = exams.filter((e) => e.exam_type === '코어테스트' && e.title === coreTitle && gradeStudentIds.has(e.student_id))
    if (matches.length === 0) return

    setCoreRangeText((prev) => prev || (matches.find((e) => e.unit_name)?.unit_name ?? ''))

    const scoreUpdates: Record<string, string> = {}
    const dateUpdates: Record<string, string> = {}
    const idUpdates: Record<string, string> = {}
    myStudents.forEach((s) => {
      if (s.grade !== coreGrade) return
      const existing = matches.find((e) => e.student_id === s.id)
      if (existing) {
        idUpdates[s.id] = existing.id
        if (existing.score != null) scoreUpdates[s.id] = String(existing.score)
        dateUpdates[s.id] = existing.exam_date
      }
    })
    if (Object.keys(idUpdates).length > 0) {
      setCoreExistingIds(idUpdates)
      setCoreScores(scoreUpdates)
      setCoreScoreDates(dateUpdates)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCoreModal, coreGrade, coreTitle])

  const filteredStudents = myStudents.filter((s) => {
    const matchGrade = gradeGroup === '전체' || (gradeGroup === '초등' && s.grade.includes('초')) ||
      (gradeGroup === '중등' && s.grade.includes('중')) || (gradeGroup === '고등' && s.grade.includes('고'))
    const matchSearch = !searchText || s.name.includes(searchText) || s.school?.includes(searchText)
    return matchGrade && matchSearch
  })

  // 시험 범위 학년 결정
  // 코어테스트: 학교 현행(학생 실제 학년) 고정 (고등은 concepts가 과목명 기준이라 교재 학년)
  // 입학테스트/진단평가: 선생님이 선택 가능 (기본값=배정 교재 학년, 고등=교재 과목명)
  function getRangeGrade(student: Student | null, examTab: string): string {
    if (!student) return ''
    const myTBs = studentTextbooks.filter((t) => t.student_id === student.id)
    const tbGrade = myTBs[0]?.grade ?? ''
    if (examTab === '코어테스트' && student.grade && !student.grade.includes('고')) {
      return student.grade
    }
    if ((examTab === '입학테스트' || examTab === '진단평가') && rangeGradeOverride) {
      return rangeGradeOverride
    }
    return tbGrade
  }

  function openModal(student: Student) {
    setModalStudent(student)
    setExamDate(new Date().toISOString().split('T')[0])
    setExamTitle('')
    setExamUnit('')
    setExamUnitName('')
    setExamLevel(null)
    setExamScore('')
    setExamTotalScore('100')
    setExamMemo('')
    setUnitEntries({})
    setActiveSubTabs([])
    setRangeGradeOverride('')
    // 초기 탭: 오버라이드 없이 기본 학년 기준으로 계산
    const myTBs = studentTextbooks.filter((t) => t.student_id === student.id)
    const tbGrade = myTBs[0]?.grade ?? ''
    const rangeGrade = (tab === '코어테스트' && student.grade && !student.grade.includes('고'))
      ? student.grade : tbGrade
    const firstGradeConcepts = rangeGrade
      ? concepts.filter((c) => c.grade === rangeGrade)
      : []
    const firstChapter = firstGradeConcepts[0]?.chapter ?? ''
    setActiveUnitTabs(firstChapter ? [firstChapter] : [])
    setShowModal(true)
  }

  function openEditModal(exam: Exam) {
    setEditingExam(exam)
    setEditDate(exam.exam_date)
    setEditTitle(exam.title ?? '')
    setEditUnit(exam.unit ?? '')
    setEditUnitName(exam.unit_name ?? '')
    setEditLevel(exam.level != null ? String(exam.level) : '')
    setEditScore(exam.score != null ? String(exam.score) : '')
    setEditTotalScore(String(exam.total_score ?? 100))
    setEditMemo(exam.memo ?? '')
  }

  async function handleUpdateExam() {
    if (!editingExam) return
    setEditSaving(true)
    const { error } = await supabase.from('exams').update({
      exam_date: editDate,
      title: editTitle || null,
      unit: editUnit || null,
      unit_name: editUnitName || null,
      level: editLevel ? parseFloat(editLevel) : null,
      score: editScore ? parseFloat(editScore) : null,
      total_score: editTotalScore ? parseFloat(editTotalScore) : 100,
      memo: editMemo || null,
    }).eq('id', editingExam.id)
    setEditSaving(false)
    if (error) {
      alert('수정 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
      return
    }
    setEditingExam(null)
    fetchData()
  }

  async function handleDeleteExam() {
    if (!editingExam) return
    if (!confirm('이 평가 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    setEditSaving(true)
    const { error } = await supabase.from('exams').delete().eq('id', editingExam.id)
    setEditSaving(false)
    if (error) {
      alert('삭제 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.')
      return
    }
    setEditingExam(null)
    fetchData()
  }

  async function handleCoreSave() {
    if (!coreGrade || !coreTitle) return
    setCoreSaving(true)

    // 시험범위는 체크박스 대신 직접 입력한 텍스트를 그대로 저장 (같은 학년 학생 전체가 같은 범위로
    // 일괄로 치르는 시험이라 대단원/중단원 체크박스를 일일이 고르는 것보다 직접 입력이 훨씬 간단하고
    // 빠뜨릴 일도 없음 - 성적표 화면에서 이 값을 "시험범위"로 그대로 보여줌)
    const rangeUnits = coreRangeText.trim()

    // 점수 입력된 학생만 저장 - 날짜는 학생별로 따로 지정했으면 그 날짜, 아니면 기본 날짜(coreDate) 사용
    // 이미 저장된 학생(coreExistingIds에 id가 있음)은 새로 추가하지 않고 그 기록을 업데이트한다.
    // - 담당 학생 15명 중 1명만 먼저 입력하고 나중에 나머지를 입력해도 중복 저장되지 않고,
    //   먼저 입력한 학생의 점수가 그대로 남아있게 하기 위함.
    const entries = Object.entries(coreScores).filter(([, s]) => s !== '')
    await Promise.all(entries.map(([studentId, score]) => {
      const payload = {
        exam_date: coreScoreDates[studentId] || coreDate,
        title: coreTitle,
        unit_name: rangeUnits || null,
        score: parseFloat(score),
        total_score: parseFloat(coreTotalScore) || 100,
        teacher_name: currentUser?.name ?? null,
      }
      const existingId = coreExistingIds[studentId]
      return existingId
        ? supabase.from('exams').update(payload).eq('id', existingId)
        : supabase.from('exams').insert({ student_id: studentId, exam_type: '코어테스트', ...payload })
    }))

    setCoreSaving(false)
    setShowCoreModal(false)
    setCoreScores({})
    setCoreScoreDates({})
    setCoreExistingIds({})
    setCoreActiveUnits([])
    setCoreActiveSubTabs([])
    setCoreRangeText('')
    fetchData()
  }

  async function handleSave() {
    if (!modalStudent) return
    setSaving(true)

    // 학교시험은 선생님이 직접 입력한 단원/범위 텍스트를 그대로 사용한다.
    // (대단원·중단원 선택 UI는 입학테스트/진단평가/코어테스트에서만 쓰이는데,
    //  activeUnitTabs가 모달을 열 때 학생의 첫 대단원으로 미리 채워져 있어서
    //  학교시험에서도 그 값이 그대로 저장되며 직접 입력한 단원명을 덮어쓰던 버그였음)
    let rangeUnits: string | null
    if (tab === '학교시험') {
      rangeUnits = examUnitName || null
    } else {
      // 선택한 범위 키 계산 (초등=대단원 / 중고등=중단원, 없으면 대단원)
      const grade0 = getRangeGrade(modalStudent, tab)
      const isElem0 = grade0.includes('초')
      let selectedRangeKeys: string[] = []
      if (isElem0) {
        selectedRangeKeys = activeUnitTabs
      } else {
        const subKeys = activeSubTabs
        // 중단원 선택 안 된 대단원은 대단원 자체를 범위로
        const unitsWithSub = new Set(subKeys.map((k) => k.split('__')[0]))
        const unitsOnly = activeUnitTabs.filter((u) => !unitsWithSub.has(u))
        selectedRangeKeys = [...subKeys, ...unitsOnly]
      }

      // 선택한 순서가 아니라 교육과정 순서 기준으로 "첫구간~마지막구간" 형태로 압축
      const grade0Concepts = concepts.filter((c) => c.grade === grade0)
      const orderedLabels0 = [...new Set(grade0Concepts.map((c) => c.sub_chapter || c.chapter))]
      const selectedLabels0 = selectedRangeKeys.map((k) => k.includes('__') ? k.split('__')[1] : k)
      rangeUnits = selectedRangeKeys.length > 0
        ? compressRangeLabels(orderedLabels0, selectedLabels0) || null
        : (examUnitName || null)
    }

    if (examScore) {
      // 평가 1개 = 점수 1개 (단원은 범위 표시용)
      await supabase.from('exams').insert({
        student_id: modalStudent.id,
        exam_type: tab,
        exam_date: examDate,
        title: examTitle || null,
        unit: examUnit || null,
        unit_name: rangeUnits,
        level: examLevel,
        score: parseFloat(examScore),
        total_score: parseFloat(examTotalScore) || 100,
        memo: examMemo || null,
        teacher_name: currentUser?.name ?? null,
      })
    }
    setSaving(false)
    setShowModal(false)
    fetchData()
  }

  // 학생별 해당 탭 평가 목록
  const studentExams = (studentId: string) =>
    exams.filter((e) => e.student_id === studentId && e.exam_type === tab)
      .sort((a, b) => a.exam_date.localeCompare(b.exam_date))

  const cfg = EXAM_CONFIG[tab]

  // 점수 퍼센트
  const pct = (score: number, total: number) => Math.round((score / total) * 100)

  // 색상 by 점수
  function scoreColor(score: number, total: number) {
    const p = pct(score, total)
    if (p >= 90) return '#27500A'
    if (p >= 80) return '#085041'
    if (p >= 70) return '#633806'
    return '#991b1b'
  }
  function scoreBg(score: number, total: number) {
    const p = pct(score, total)
    if (p >= 90) return '#EAF3DE'
    if (p >= 80) return '#F0FBF7'
    if (p >= 70) return '#FAEEDA'
    return '#fee2e2'
  }

  const LEVELS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]

  return (
    <div className="min-h-screen" style={{ background: '#f9fafb' }}>
      <Header title="평가관리" subtitle={`${currentUser?.name} 선생님`}
        action={
          tab === '코어테스트'
            ? <button onClick={() => { setShowCoreModal(true); setCoreScores({}) }}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#EAF3DE', color: '#27500A' }}>
                + 코어테스트 일괄입력
              </button>
            : <button onClick={() => setShowModal(true)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold"
                style={{ background: '#9FE1CB', color: '#085041' }}>
                + 평가 등록
              </button>
        } />

      <div className="px-4 py-4 space-y-4 max-w-4xl mx-auto">

        {/* 평가 종류 탭 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {EXAM_TYPES.map((type) => {
            const c = EXAM_CONFIG[type]
            const count = exams.filter((e) => e.exam_type === type &&
              myStudents.some((s) => s.id === e.student_id)).length
            return (
              <button key={type} onClick={() => { setTab(type); setSelectedStudent(null) }}
                className="rounded-2xl p-3 text-left transition-all border-2"
                style={tab === type
                  ? { background: c.bg, borderColor: c.badge, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }
                  : { background: 'white', borderColor: '#e5e7eb' }}>
                <div className="flex items-center gap-2 mb-1">
                  <i className={`ti ${c.icon}`} style={{ fontSize: 16, color: tab === type ? c.color : '#9ca3af' }} />
                  <span className="text-xs font-bold" style={{ color: tab === type ? c.color : '#374151' }}>{type}</span>
                </div>
                <p className="text-[10px]" style={{ color: tab === type ? c.color : '#9ca3af' }}>{c.desc}</p>
                <p className="text-lg font-bold mt-1" style={{ color: tab === type ? c.color : '#d1d5db' }}>
                  {count}<span className="text-[10px] font-normal ml-0.5">건</span>
                </p>
              </button>
            )
          })}
        </div>

        {/* 필터 */}
        <div className="flex gap-2 flex-wrap">
          {['전체','초등','중등','고등'].map((g) => (
            <button key={g} onClick={() => setGradeGroup(g)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
              style={gradeGroup === g
                ? { background: '#9FE1CB', color: '#085041', borderColor: '#9FE1CB' }
                : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
              {g}
            </button>
          ))}
          <input value={searchText} onChange={(e) => setSearchText(e.target.value)}
            placeholder="학생 검색"
            className="flex-1 min-w-32 px-3 py-1.5 rounded-xl border border-gray-200 text-xs focus:outline-none"
            style={{ background: 'white' }} />
        </div>

        {/* 입학테스트 안내 */}
        {tab === '입학테스트' && (
          <div className="rounded-xl px-4 py-3 text-xs flex items-center gap-2"
            style={{ background: '#F0FBF7', color: '#085041', border: '1px solid #9FE1CB40' }}>
            <i className="ti ti-info-circle" style={{ fontSize: 14 }} />
            신규 학생에게만 1회 등록 권장. 기존 학생은 건너뛰어도 돼요.
          </div>
        )}

        {/* 학생별 평가 카드 */}
        {loading ? (
          <div className="text-center py-10"><span className="w-6 h-6 border-2 border-[#9FE1CB] border-t-transparent rounded-full animate-spin inline-block" /></div>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((student) => {
              const sExams = studentExams(student.id)
              const isExpanded = selectedStudent?.id === student.id
              const lastExam = sExams[sExams.length - 1]
              const firstExam = sExams[0]
              const trend = sExams.length >= 2
                ? pct(sExams[sExams.length-1].score!, sExams[sExams.length-1].total_score)
                  - pct(sExams[0].score!, sExams[0].total_score)
                : null

              // 입학테스트: 이미 있는 학생은 표시 다르게
              const hasEntry = tab === '입학테스트' && sExams.length > 0

              return (
                <div key={student.id} className="rounded-2xl overflow-hidden"
                  style={{ background: 'white', border: isExpanded ? `2px solid ${cfg.badge}` : '1px solid #e5e7eb' }}>

                  {/* 학생 헤더 */}
                  <button className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    onClick={() => setSelectedStudent(isExpanded ? null : student)}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: cfg.bg, color: cfg.color }}>
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-gray-900">{student.name}</span>
                        <span className="text-xs text-gray-400">{student.grade}</span>
                        {hasEntry && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: cfg.bg, color: cfg.color }}>완료</span>
                        )}
                        {tab === '입학테스트' && !hasEntry && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: '#f3f4f6', color: '#9ca3af' }}>미등록</span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{student.teacher_name}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {lastExam?.score != null && (
                        <div className="text-right">
                          <div className="text-sm font-bold" style={{ color: scoreColor(lastExam.score, lastExam.total_score) }}>
                            {pct(lastExam.score, lastExam.total_score)}점
                          </div>
                          {trend !== null && (
                            <div className="text-[10px] font-semibold" style={{ color: trend > 0 ? '#27500A' : trend < 0 ? '#991b1b' : '#6b7280' }}>
                              {trend > 0 ? `▲${trend}` : trend < 0 ? `▼${Math.abs(trend)}` : '→'}
                            </div>
                          )}
                        </div>
                      )}
                      {sExams.length === 0 && (
                        <span className="text-[10px] text-gray-300">기록없음</span>
                      )}
                      <div onClick={(e) => { e.stopPropagation(); openModal(student) }}
                        className="px-2.5 py-1.5 rounded-xl text-[10px] font-bold transition-all cursor-pointer"
                        style={{ background: cfg.badge, color: cfg.color }}>
                        + 등록
                      </div>
                      <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                        style={{ fontSize: 14, color: '#9ca3af' }} />
                    </div>
                  </button>

                  {/* 펼쳐진 평가 상세 */}
                  {isExpanded && (
                    <div className="px-4 pb-4" style={{ borderTop: '1px solid #f3f4f6' }}>
                      {sExams.length === 0 ? (
                        <p className="text-xs text-gray-400 py-4 text-center">아직 등록된 {tab}가 없어요</p>
                      ) : (
                        <>
                          {/* 점수 추이 그래프 */}
                          {sExams.length >= 2 && (
                            <div className="mt-3 mb-4">
                              <p className="text-[10px] font-semibold text-gray-400 mb-2">점수 추이</p>
                              <div className="flex items-end gap-1.5 h-16">
                                {sExams.map((exam, idx) => {
                                  const p = exam.score != null ? pct(exam.score, exam.total_score) : 0
                                  const h = Math.max(8, (p / 100) * 64)
                                  return (
                                    <div key={exam.id} className="flex flex-col items-center gap-1 flex-1">
                                      <span className="text-[9px] font-bold" style={{ color: scoreColor(exam.score!, exam.total_score) }}>
                                        {p}
                                      </span>
                                      <div className="w-full rounded-t-lg transition-all"
                                        style={{ height: h, background: cfg.badge, opacity: 0.7 + (idx / sExams.length) * 0.3 }} />
                                      <span className="text-[8px] text-gray-400 text-center leading-tight">
                                        {exam.exam_date.slice(5)}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )}

                          {/* 평가 목록 */}
                          <div className="space-y-2">
                            {sExams.slice().reverse().map((exam) => {
                              const isCoreMain = tab === '코어테스트' && exam.title === '본고사'
                              const isCorePrep = tab === '코어테스트' && exam.title?.startsWith('예비')
                              return (
                              <div key={exam.id} className="rounded-xl px-3 py-2.5 flex items-center gap-3"
                                style={{
                                  background: isCoreMain ? '#EAF3DE' : '#f9fafb',
                                  border: isCoreMain ? '1.5px solid #639922' : '1px solid #f3f4f6'
                                }}>
                                <div className="shrink-0 text-center">
                                  <p className="text-[10px] text-gray-400">{exam.exam_date.slice(0,7)}</p>
                                  <p className="text-[9px] text-gray-300">{exam.exam_date.slice(8)}</p>
                                </div>
                                <div className="flex-1 min-w-0">
                                  {exam.title && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-block mb-0.5"
                                      style={isCoreMain
                                        ? { background: '#639922', color: 'white' }
                                        : isCorePrep
                                        ? { background: '#FAEEDA', color: '#633806' }
                                        : { background: cfg.bg, color: cfg.color }}>
                                      {exam.title}
                                    </span>
                                  )}
                                  {(exam.unit || exam.unit_name) && (
                                    <p className="text-[10px] text-gray-400">
                                      {exam.unit}{exam.unit_name ? ` · ${exam.unit_name}` : ''}
                                    </p>
                                  )}
                                  {exam.level && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                      style={{ background: cfg.bg, color: cfg.color }}>
                                      {exam.level}레벨
                                    </span>
                                  )}
                                  {exam.memo && <p className="text-[10px] text-gray-400 mt-0.5">{exam.memo}</p>}
                                </div>
                                {exam.score != null && (
                                  <div className="shrink-0 text-right">
                                    <span className="text-sm font-bold px-2 py-1 rounded-lg"
                                      style={{ background: scoreBg(exam.score, exam.total_score), color: scoreColor(exam.score, exam.total_score) }}>
                                      {exam.score}/{exam.total_score}
                                    </span>
                                    <p className="text-[10px] text-gray-400 mt-0.5">{pct(exam.score, exam.total_score)}%</p>
                                  </div>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); openEditModal(exam) }}
                                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100">
                                  <i className="ti ti-pencil" style={{ fontSize: 14 }} />
                                </button>
                              </div>
                              )
                            })}
                          </div>
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

      {/* 개별 평가 수정 모달 - 잘못 등록한 점수/날짜 등을 고치는 용도 */}
      {editingExam && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setEditingExam(null)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">평가 기록 수정</h3>
              <button onClick={() => setEditingExam(null)} className="text-gray-400 text-xl">✕</button>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">날짜</label>
              <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">제목</label>
              <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="예: 본고사, 예비 1회"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">범위(대단원)</label>
                <input value={editUnit} onChange={(e) => setEditUnit(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">범위(상세)</label>
                <input value={editUnitName} onChange={(e) => setEditUnitName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">점수</label>
                <input type="number" value={editScore} onChange={(e) => setEditScore(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none text-center font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">총점</label>
                <input type="number" value={editTotalScore} onChange={(e) => setEditTotalScore(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none text-center font-bold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">레벨</label>
                <input type="number" step="0.5" value={editLevel} onChange={(e) => setEditLevel(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none text-center font-bold" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">메모</label>
              <input value={editMemo} onChange={(e) => setEditMemo(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>

            <div className="flex gap-2 pt-1">
              <button onClick={handleDeleteExam} disabled={editSaving}
                className="px-4 py-3.5 font-bold rounded-xl disabled:opacity-50 text-red-500 bg-red-50 border border-red-100">
                삭제
              </button>
              <button onClick={handleUpdateExam} disabled={editSaving}
                className="flex-1 py-3.5 font-bold rounded-xl disabled:opacity-50"
                style={{ background: '#F5C4B3', color: '#712B13' }}>
                {editSaving ? '저장 중...' : '수정 저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 평가 등록 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowModal(false)}>
          <div className="bg-white w-full max-w-md rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-gray-900">{tab} 등록</h3>
                <p className="text-xs text-gray-400 mt-0.5">{cfg.desc}</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-gray-400 text-xl">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
              {modalStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2"
                  style={{ background: cfg.bg, borderColor: cfg.badge }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                    style={{ background: cfg.badge, color: cfg.color }}>
                    {modalStudent.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: cfg.color }}>{modalStudent.name}</p>
                    <p className="text-xs" style={{ color: cfg.color, opacity: 0.7 }}>{modalStudent.grade}</p>
                  </div>
                  <button onClick={() => setModalStudent(null)} style={{ color: cfg.color }}>✕</button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredStudents.map((s) => (
                    <button key={s.id} onClick={() => setModalStudent(s)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0 text-left">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {s.name[0]}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 날짜 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">평가 날짜</label>
              <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>

            {/* 시험 종류 (학교시험 / 코어테스트) */}
            {tab === '학교시험' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">시험 종류</label>
                <div className="flex gap-2">
                  {SCHOOL_EXAM_TYPES.map((t) => (
                    <button key={t} onClick={() => setExamTitle(t)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                      style={examTitle === t
                        ? { background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }
                        : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tab === '코어테스트' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">회차</label>
                <div className="flex gap-2">
                  {['예비 1회', '예비 2회', '본고사'].map((t) => (
                    <button key={t} onClick={() => setExamTitle(t)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                      style={examTitle === t
                        ? { background: '#639922', color: 'white', borderColor: '#639922' }
                        : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 만점 설정 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-700 shrink-0">만점</label>
              <input type="number" value={examTotalScore} onChange={(e) => setExamTotalScore(e.target.value)}
                placeholder="100" min="1"
                className="w-24 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none text-center" />
              <span className="text-xs text-gray-400">점 기준</span>
            </div>

            {/* 단원별 탭 입력 (입학테스트/진단평가/코어테스트) */}
            {tab !== '학교시험' && (() => {
              const rangeGrade = getRangeGrade(modalStudent, tab)
              const gradeConcepts = rangeGrade ? concepts.filter((c) => c.grade === rangeGrade) : []
              const chapters = [...new Set(gradeConcepts.map((c) => c.chapter))]
              const canPickGrade = tab === '입학테스트' || tab === '진단평가'
              const gradeOptions = GRADE_OPTIONS.filter((g) => concepts.some((c) => c.grade === g))

              const gradeSelector = canPickGrade ? (
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-xs font-bold text-gray-700 shrink-0">범위 학년/과목</label>
                  <select value={rangeGrade}
                    onChange={(e) => { setRangeGradeOverride(e.target.value); setActiveUnitTabs([]); setActiveSubTabs([]) }}
                    className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none bg-white">
                    <option value="">선택하세요</option>
                    {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
              ) : null

              if (chapters.length === 0) return (
                <div>
                  {gradeSelector}
                  <label className="block text-xs font-bold text-gray-700 mb-2">단원 / 범위</label>
                  <div className="flex gap-2">
                    <input value={examUnit} onChange={(e) => setExamUnit(e.target.value)}
                      placeholder="예: Ⅱ-1" className="w-24 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                    <input value={examUnitName} onChange={(e) => setExamUnitName(e.target.value)}
                      placeholder="단원명" className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                  </div>
                </div>
              )

              // 초등 여부 확인
              const isElementary = rangeGrade.includes('초')
              const getTabKey = (ch, sub) => sub ? ch + '__' + sub : ch

              // 선택 범위 키 (초등=대단원 / 중고등=중단원, 없으면 대단원)
              let selectedRangeKeys: string[] = []
              if (isElementary) {
                selectedRangeKeys = activeUnitTabs
              } else {
                const unitsWithSub = new Set(activeSubTabs.map((k) => k.split('__')[0]))
                const unitsOnly = activeUnitTabs.filter((u) => !unitsWithSub.has(u))
                selectedRangeKeys = [...activeSubTabs, ...unitsOnly]
              }

              return (
                <div>
                  {gradeSelector}
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    시험 범위 <span className="font-normal text-gray-400">(대단원 복수 선택 가능 · 점수는 평가당 1개)</span>
                  </label>

                  {/* 대단원 다중선택 */}
                  <div className="flex gap-1 flex-wrap mb-2 max-h-24 overflow-y-auto">
                    {chapters.map((ch) => {
                      const isActive = activeUnitTabs.includes(ch)
                      return (
                        <button key={ch} type="button" onClick={() => {
                          setActiveUnitTabs((prev) => prev.includes(ch) ? prev.filter((x) => x !== ch) : [...prev, ch])
                        }}
                          className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border transition-all"
                          style={isActive
                            ? { background: cfg.badge, color: cfg.color, borderColor: cfg.badge }
                            : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                          {ch.slice(0, 14)}
                        </button>
                      )
                    })}
                  </div>

                  {/* 중고등: 선택된 대단원마다 중단원 범위 선택 */}
                  {!isElementary && activeUnitTabs.map((ch) => {
                    const subChapters = [...new Set(gradeConcepts.filter((cc) => cc.chapter === ch).map((cc) => cc.sub_chapter).filter(Boolean))]
                    if (subChapters.length === 0) return null
                    return (
                      <div key={ch} className="mb-2 pl-1">
                        <p className="text-[10px] font-semibold text-gray-500 mb-1">{ch}</p>
                        <div className="flex gap-1 flex-wrap">
                          {subChapters.map((sub) => {
                            const key = getTabKey(ch, sub)
                            const isSel = activeSubTabs.includes(key)
                            return (
                              <button key={key} type="button"
                                onClick={() => setActiveSubTabs((prev) => prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])}
                                className="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all"
                                style={isSel
                                  ? { background: '#d97706', color: 'white', borderColor: '#d97706' }
                                  : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                                {sub.replace(/^\d+\.\s*/, '').slice(0, 12)}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* 선택한 범위 요약 */}
                  {selectedRangeKeys.length > 0 && (
                    <div className="mt-2 rounded-xl px-3 py-2" style={{ background: cfg.bg }}>
                      <p className="text-[10px] font-semibold" style={{ color: cfg.color }}>
                        선택 범위: {selectedRangeKeys.map((k) => k.includes('__') ? k.split('__')[1] : k).join(', ')}
                      </p>
                    </div>
                  )}

                  {/* 진단평가 레벨 (평가당 1개) */}
                  {tab === '진단평가' && (
                    <div className="mt-3">
                      <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">레벨</label>
                      <div className="flex gap-1 flex-wrap">
                        {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6].map((l) => (
                          <button key={l} type="button" onClick={() => setExamLevel(examLevel === l ? null : l)}
                            className="px-2 py-1 rounded-lg text-[10px] font-semibold border transition-all"
                            style={examLevel === l
                              ? { background: '#EF9F27', color: 'white', borderColor: '#EF9F27' }
                              : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 점수 (평가당 1개) */}
                  <div className="mt-3">
                    <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">점수</label>
                    <div className="flex gap-2 items-center">
                      <input type="number" min="0" value={examScore}
                        onChange={(e) => setExamScore(e.target.value)}
                        placeholder="점수"
                        className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none text-center font-bold" />
                      <span className="text-gray-400 text-xs shrink-0">/ {examTotalScore}</span>
                      {examScore && (
                        <span className="text-xs font-bold px-2 py-1 rounded-lg shrink-0"
                          style={{ background: scoreBg(parseFloat(examScore), parseFloat(examTotalScore)||100), color: scoreColor(parseFloat(examScore), parseFloat(examTotalScore)||100) }}>
                          {pct(parseFloat(examScore), parseFloat(examTotalScore)||100)}%
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* 학교시험: 단원명 직접 입력 + 전체 점수 */}
            {tab === '학교시험' && (
              <>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">단원 / 범위 <span className="text-gray-400 font-normal">(선택)</span></label>
                  <div className="flex gap-2">
                    <input value={examUnit} onChange={(e) => setExamUnit(e.target.value)}
                      placeholder="예: Ⅱ-1" className="w-24 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                    <input value={examUnitName} onChange={(e) => setExamUnitName(e.target.value)}
                      placeholder="단원명" className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">점수 <span className="text-red-400">*</span></label>
                  <div className="flex gap-2 items-center">
                    <input type="number" value={examScore} onChange={(e) => setExamScore(e.target.value)}
                      placeholder="점수" min="0"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none text-center font-bold text-lg" />
                  </div>
                  {examScore && (
                    <div className="mt-2 rounded-xl px-3 py-2 text-center text-sm font-bold"
                      style={{
                        background: scoreBg(parseFloat(examScore), parseFloat(examTotalScore) || 100),
                        color: scoreColor(parseFloat(examScore), parseFloat(examTotalScore) || 100)
                      }}>
                      {pct(parseFloat(examScore), parseFloat(examTotalScore) || 100)}%
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 메모 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
              <textarea value={examMemo} onChange={(e) => setExamMemo(e.target.value)}
                rows={2} placeholder="특이사항, 취약 부분 등"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none" />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-bold bg-gray-100 text-gray-600">취소</button>
              <button onClick={handleSave} disabled={!modalStudent || !examScore || saving}
                className="flex-1 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: cfg.badge, color: cfg.color }}>
                {saving
                  ? <><span className="w-4 h-4 border-2 border-current/40 border-t-current rounded-full animate-spin" />저장 중...</>
                  : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 코어테스트 일괄입력 모달 */}
      {showCoreModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowCoreModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <i className="ti ti-target" style={{ fontSize: 18, color: '#27500A' }} />
                <h3 className="text-base font-bold text-gray-900">코어테스트 일괄입력</h3>
              </div>
              <button onClick={() => setShowCoreModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              {/* 기본 날짜 + 만점 */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">기본 날짜</label>
                  <input type="date" value={coreDate} onChange={e => setCoreDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                  <p className="text-[10px] text-gray-400 mt-1">대부분 이 날짜로 저장돼요. 학생마다 시험 본 날이 다르면 아래 목록에서 개별로 바꿀 수 있어요.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">만점</label>
                  <input type="number" value={coreTotalScore} onChange={e => setCoreTotalScore(e.target.value)}
                    className="w-24 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none text-center" />
                </div>
              </div>

              {/* 회차 */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">회차</label>
                <div className="flex gap-2">
                  {['예비 1회', '예비 2회', '본고사'].map(t => (
                    <button key={t} onClick={() => setCoreTitle(t)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all"
                      style={coreTitle === t
                        ? { background: '#639922', color: 'white', borderColor: '#639922' }
                        : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* 학년 선택 */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">학년</label>
                <div className="flex flex-wrap gap-2">
                  {['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3'].map(g => (
                    <button key={g} onClick={() => { setCoreGrade(g); setCoreRangeText('') }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                      style={coreGrade === g
                        ? { background: '#27500A', color: 'white', borderColor: '#27500A' }
                        : { background: 'white', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* 시험범위 - 같은 학년 학생 전체가 같은 범위로 일괄 응시하므로 직접 입력이 체크박스보다 빠르고 정확함 */}
              {coreGrade && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">시험범위</label>
                  <input value={coreRangeText} onChange={e => setCoreRangeText(e.target.value)}
                    placeholder="예: 도형의 성질 ~ 도형의 닮음"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                  <p className="text-[10px] text-gray-400 mt-1">여기 입력한 범위가 성적표에 그대로 표시돼요</p>
                </div>
              )}

              {/* 학생별 점수 입력 */}
              {coreGrade && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">
                    학생별 점수 입력 <span className="font-normal text-gray-400">({coreGrade} 학생만 표시)</span>
                  </label>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {myStudents.filter(s => s.grade === coreGrade || s.grade.startsWith(coreGrade)).map(s => {
                      const customDate = coreScoreDates[s.id]
                      return (
                        <div key={s.id} className="px-3 py-2 rounded-xl"
                          style={{ background: coreScores[s.id] ? '#EAF3DE' : '#fafafa', border: '1px solid #f3f4f6' }}>
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: '#EAF3DE', color: '#27500A' }}>
                              {s.name[0]}
                            </div>
                            <span className="text-sm font-semibold flex-1 text-gray-800">{s.name}</span>
                            <span className="text-[10px] text-gray-400">{s.grade}</span>
                            <input
                              type="number" min="0" max={coreTotalScore}
                              value={coreScores[s.id] ?? ''}
                              onChange={e => setCoreScores(prev => ({ ...prev, [s.id]: e.target.value }))}
                              placeholder="-"
                              className="w-16 px-2 py-1.5 rounded-xl border text-sm text-center focus:outline-none"
                              style={{ borderColor: coreScores[s.id] ? '#639922' : '#e5e7eb' }}
                            />
                            <span className="text-[10px] text-gray-400">/{coreTotalScore}</span>
                          </div>
                          {/* 이 학생만 다른 날짜로 시험 봤을 때 - 기본은 안 보이고 필요할 때만 펼침 */}
                          <div className="flex items-center gap-2 mt-1.5 pl-10">
                            {customDate ? (
                              <>
                                <input type="date" value={customDate}
                                  onChange={e => setCoreScoreDates(prev => ({ ...prev, [s.id]: e.target.value }))}
                                  className="px-2 py-1 rounded-lg border text-[11px] focus:outline-none"
                                  style={{ borderColor: '#639922' }} />
                                <button onClick={() => setCoreScoreDates(prev => { const n = { ...prev }; delete n[s.id]; return n })}
                                  className="text-[10px] text-gray-400 hover:text-red-400">기본 날짜로</button>
                              </>
                            ) : (
                              <button onClick={() => setCoreScoreDates(prev => ({ ...prev, [s.id]: coreDate }))}
                                className="text-[10px] text-gray-400 hover:text-gray-600">📅 이 학생만 다른 날짜였어요</button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              <button onClick={handleCoreSave}
                disabled={coreSaving || !coreTitle || !coreGrade || Object.values(coreScores).every(s => !s)}
                className="w-full py-3 rounded-2xl text-sm font-bold transition-all"
                style={{
                  background: coreSaving || !coreTitle || !coreGrade ? '#e5e7eb' : '#27500A',
                  color: coreSaving || !coreTitle || !coreGrade ? '#9ca3af' : 'white'
                }}>
                {coreSaving ? '저장 중...' : `${Object.values(coreScores).filter(s => s).length}명 저장`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  function scoreColor(score: number, total: number) {
    const p = Math.round((score / total) * 100)
    if (p >= 90) return '#27500A'
    if (p >= 80) return '#085041'
    if (p >= 70) return '#633806'
    return '#991b1b'
  }
  function scoreBg(score: number, total: number) {
    const p = Math.round((score / total) * 100)
    if (p >= 90) return '#EAF3DE'
    if (p >= 80) return '#F0FBF7'
    if (p >= 70) return '#FAEEDA'
    return '#fee2e2'
  }
}
