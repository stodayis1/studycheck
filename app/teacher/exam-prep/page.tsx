'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Student {
  id: string
  name: string
  grade: string
  school: string
  teacher_name: string
}

interface InnerEnough {
  id: string
  school_name: string
  grade: string
  level: string
  unit_no: string
  unit_name: string
  sub_unit_no: string
  sub_unit_name: string
  problem_count: number
}

interface StudentExamPrep {
  id: string
  student_id: string
  inner_enough_id: string
  exam_date: string
  assigned_by: string
  status: string
  memo: string | null
  progress_step: number
  total_steps: number
  score: number | null
  inner_enough: InnerEnough
}

interface ExamSchedule {
  id: string
  school_name: string
  grade: string
  exam_name: string
  exam_date: string
  created_by: string
}

// 학교 매핑은 inner_enough 테이블에서 동적으로 가져옴

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string }> = {
  assigned:    { label: '배정됨',  bg: '#f3f4f6', color: '#6b7280' },
  in_progress: { label: '진행중',  bg: '#FAECE7', color: '#993C1D' },
  done:        { label: '완료',    bg: '#EAF3DE', color: '#27500A' },
}

export default function TeacherExamPrepPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [innerEnough, setInnerEnough] = useState<InnerEnough[]>([])
  const [assignments, setAssignments] = useState<StudentExamPrep[]>([])
  const [examSchedules, setExamSchedules] = useState<ExamSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [scheduleSchools, setScheduleSchools] = useState<string[]>([])
  const [searchText, setSearchText] = useState('')
  const [viewTab, setViewTab] = useState<'assign' | 'status' | 'schedule'>('assign')
  const [statusStudent, setStatusStudent] = useState<Student | null>(null)

  // 배정 모달
  const [showModal, setShowModal] = useState(false)
  const [selStudent, setSelStudent] = useState<Student | null>(null)
  const [bulkMode, setBulkMode] = useState(false)  // 같은 조건 학생 전체 일괄 배정
  const [selLevel, setSelLevel] = useState('')
  const [selHighRange, setSelHighRange] = useState('')
  const [selUnitIds, setSelUnitIds] = useState<string[]>([])
  const [examDate, setExamDate] = useState('')
  const [assigning, setAssigning] = useState(false)

  // 성취도 입력 모달
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [scorePrep, setScorePrep] = useState<StudentExamPrep | null>(null)
  const [inputScore, setInputScore] = useState('')
  const [savingScore, setSavingScore] = useState(false)

  // 시험일정 모달
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [expandedStudents, setExpandedStudents] = useState<string[]>([])
  const [schSchool, setSchSchool] = useState('')
  const [schGrade, setSchGrade] = useState('')
  const [schName, setSchName] = useState('1학기 중간고사')
  const [schDate, setSchDate] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: sData }, { data: ieData }, { data: aData }, { data: esData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('inner_enough').select('*').order('school_name').order('grade').order('level').order('unit_no'),
      supabase.from('student_exam_prep').select('*, inner_enough(*)').order('exam_date', { ascending: true }),
      supabase.from('exam_schedule').select('*').order('exam_date'),
    ])
    if (sData) {
      setStudents(sData)
      const uniqueSchools = [...new Set((sData as any[]).map((s: any) => s.school).filter(Boolean))].sort() as string[]
      setScheduleSchools(uniqueSchools)
    }
    if (ieData) setInnerEnough(ieData)
    if (aData) setAssignments(aData as StudentExamPrep[])
    if (esData) setExamSchedules(esData)
    setLoading(false)
  }

  const myStudents = students.filter(s => isAdmin() ? true : s.teacher_name === currentUser?.name)
  const filteredStudents = myStudents.filter(s =>
    searchText === '' || s.name.includes(searchText) || s.school?.includes(searchText)
  )

  // inner_enough 학교 목록에서 매칭 (innerEnough state 직접 참조)
  function getSchoolName(student: Student) {
    if (!student.school) return ''
    const schoolList = [...new Set(innerEnough.map(ie => ie.school_name))]
    const matched = schoolList.find(s => student.school.includes(s))
    return matched ?? student.school
  }

  function getSchoolGrade(student: Student) {
    const m = student.grade.match(/[0-9]/)
    return m ? m[0] : ''
  }

  function isHighSchool(student: Student) {
    return student.grade.includes('고')
  }

  // 고등 공통 범위 목록
  const highRanges = [...new Set(innerEnough
    .filter(ie => ie.school_name.startsWith('공통_'))
    .map(ie => ie.school_name))]

  const availableLevels = selStudent
    ? isHighSchool(selStudent)
      ? selHighRange
        ? [...new Set(innerEnough.filter(ie => ie.school_name === selHighRange).map(ie => ie.level))]
        : []
      : [...new Set(innerEnough
          .filter(ie => ie.school_name === getSchoolName(selStudent) && ie.grade === getSchoolGrade(selStudent))
          .map(ie => ie.level))]
    : []

  const availableUnits = selStudent && selLevel
    ? innerEnough
        .filter(ie =>
          isHighSchool(selStudent)
            ? ie.school_name === selHighRange && ie.level === selLevel
            : ie.school_name === getSchoolName(selStudent) &&
              ie.grade === getSchoolGrade(selStudent) &&
              ie.level === selLevel
        )
        .sort((a, b) => {
          // 전범위/복합 맨 뒤
          const isSpecialA = ['전범위','복합'].includes(a.unit_name)
          const isSpecialB = ['전범위','복합'].includes(b.unit_name)
          if (isSpecialA && !isSpecialB) return 1
          if (!isSpecialA && isSpecialB) return -1
          return (a.unit_no ?? '').localeCompare(b.unit_no ?? '', 'ko', { numeric: true })
        })
    : []

  const unitGroups = availableUnits.reduce((acc, ie) => {
    if (!acc[ie.unit_name]) acc[ie.unit_name] = []
    acc[ie.unit_name].push(ie)
    return acc
  }, {} as Record<string, InnerEnough[]>)

  async function handleAssign() {
    if (!selStudent || selUnitIds.length === 0) return
    setAssigning(true)

    // 일괄 모드: 같은 학교+학년의 학생 전체, 아니면 선택 학생 1명
    let targetStudents = [selStudent]
    if (bulkMode) {
      targetStudents = students.filter(s =>
        getSchoolName(s) === getSchoolName(selStudent!) &&
        getSchoolGrade(s) === getSchoolGrade(selStudent!)
      )
    }

    for (const stu of targetStudents) {
      for (const id of selUnitIds) {
        const ie = innerEnough.find(i => i.id === id)
        const totalSteps = ie ? Math.max(1, Math.round(ie.problem_count / 30)) : 1
        // 이미 배정된 단원은 건너뛰기 (중복 방지)
        const already = assignments?.some?.(ep => ep.student_id === stu.id && ep.inner_enough_id === id)
        if (already) continue
        await supabase.from('student_exam_prep').insert({
          student_id: stu.id, inner_enough_id: id,
          exam_date: examDate || null,
          assigned_by: currentUser?.name,
          status: 'assigned', progress_step: 0, total_steps: totalSteps,
        })
      }
    }
    setShowModal(false); setSelStudent(null); setSelLevel(''); setSelUnitIds([]); setSelHighRange(''); setExamDate(''); setBulkMode(false)
    setAssigning(false); fetchAll()
  }

  async function handleStatusChange(id: string, status: string) {
    await supabase.from('student_exam_prep').update({ status }).eq('id', id)
    fetchAll()
  }

  async function handleDelete(id: string) {
    await supabase.from('student_exam_prep').delete().eq('id', id)
    fetchAll()
  }

  async function handleSaveScore() {
    if (!scorePrep) return
    const score = parseInt(inputScore)
    if (isNaN(score) || score < 0 || score > 100) { alert('0~100 점수를 입력해주세요'); return }
    setSavingScore(true)
    await supabase.from('student_exam_prep').update({ score }).eq('id', scorePrep.id)
    setSavingScore(false); setShowScoreModal(false); setInputScore(''); fetchAll()
  }

  async function handleSaveSchedule() {
    if (!schSchool || !schGrade || !schDate) return
    setSavingSchedule(true)
    await supabase.from('exam_schedule').insert({
      school_name: schSchool, grade: schGrade,
      exam_name: schName, exam_date: schDate,
      created_by: currentUser?.name,
    })
    setSavingSchedule(false); setShowScheduleModal(false)
    setSchSchool(''); setSchGrade(''); setSchDate('')
    fetchAll()
  }

  async function handleDeleteSchedule(id: string) {
    await supabase.from('exam_schedule').delete().eq('id', id)
    fetchAll()
  }

  // D-day 계산
  function getDday(dateStr: string) {
    const diff = Math.ceil((new Date(dateStr).getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    if (diff === 0) return 'D-day'
    if (diff > 0) return `D-${diff}`
    return `D+${Math.abs(diff)}`
  }

  const schools = [...new Set(innerEnough.map(ie => ie.school_name))]

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="시험대비 관리" subtitle="이너프원 내신대비" action={
        <button onClick={() => setShowModal(true)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg"
          style={{ background: '#F5C4B3', color: '#712B13' }}>
          + 배정
        </button>
      } />

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2 flex-wrap">
          {[
            { key: 'assign',   label: '배정 현황',  icon: 'ti-clipboard-list' },
            { key: 'status',   label: '학생별 진도', icon: 'ti-chart-bar' },
            { key: 'schedule', label: '시험 일정',  icon: 'ti-calendar-event' },
          ].map(t => (
            <button key={t.key} onClick={() => setViewTab(t.key as typeof viewTab)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={viewTab === t.key
                ? { background: '#F5C4B3', color: '#712B13' }
                : { background: '#f3f4f6', color: '#9ca3af' }}>
              <i className={`ti ${t.icon}`} style={{ fontSize: 14 }} />
              {t.label}
            </button>
          ))}
        </div>

        {viewTab !== 'schedule' && (
          <input value={searchText} onChange={e => setSearchText(e.target.value)}
            placeholder="학생 이름 검색"
            className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none" />
        )}

        {/* ── 배정 현황 ── */}
        {viewTab === 'assign' && (() => {
          // 담당 학생별로 그룹핑
          const myStudentIds = myStudents.map(s => s.id)
          const grouped = myStudents
            .filter(s => !searchText || s.name.includes(searchText))
            .map(s => ({
              student: s,
              preps: assignments
                .filter(a => a.student_id === s.id)
                .sort((a, b) => {
                  const isSpecialA = ['전범위','복합'].includes(a.inner_enough?.unit_name ?? '')
                  const isSpecialB = ['전범위','복합'].includes(b.inner_enough?.unit_name ?? '')
                  if (isSpecialA && !isSpecialB) return 1
                  if (!isSpecialA && isSpecialB) return -1
                  return (a.inner_enough?.unit_no ?? '').localeCompare(b.inner_enough?.unit_no ?? '', 'ko', { numeric: true })
                })
            }))
            .filter(g => g.preps.length > 0)

          if (grouped.length === 0) return (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <i className="ti ti-book" style={{ fontSize: 32, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
              <p className="text-sm text-gray-500">배정된 시험대비 교재가 없어요</p>
            </div>
          )

          return (
            <div>
              {/* 범례 */}
              <p className="text-[11px] text-gray-400 mb-2 px-1">
                <i className="ti ti-info-circle" style={{ fontSize: 11 }} /> 백분율(%)은 완성률 · 점수는 성취도를 나타냅니다
              </p>
              {/* 3열 그리드 */}
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                {grouped.map(({ student, preps }) => {
                  const totalPct = Math.round(preps.reduce((sum, a) => sum + Math.round((a.progress_step||0)/(a.total_steps||1)*100), 0) / preps.length)
                  const doneCount = preps.filter(a => a.status === 'done').length
                  const overallStatus = doneCount === preps.length ? 'done' : preps.some(a => a.status === 'in_progress' || (a.progress_step||0) > 0) ? 'in_progress' : 'assigned'
                  const cfg = STATUS_STYLE[overallStatus] ?? STATUS_STYLE.assigned
                  const avgScore = (() => {
                    const scored = preps.filter(a => a.score != null)
                    if (scored.length === 0) return null
                    return Math.round(scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length)
                  })()
                  const examDate = preps[0]?.exam_date
                  const isExpanded = expandedStudents.includes(student.id)

                  return (
                    <div key={student.id} className="bg-white rounded-2xl border overflow-hidden"
                      style={{ borderColor: isExpanded ? '#F5C4B3' : '#f0f0f0' }}>
                      {/* 카드 헤더 - 클릭으로 펼침/접힘 */}
                      <button className="w-full text-left p-3"
                        onClick={() => setExpandedStudents(prev =>
                          isExpanded ? prev.filter(id => id !== student.id) : [...prev, student.id]
                        )}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>{student.name[0]}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-bold text-gray-800">{student.name}</span>
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">{student.grade}</p>
                          </div>
                          {examDate && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: '#F5C4B3', color: '#712B13' }}>{getDday(examDate)}</span>
                          )}
                        </div>
                        {/* 진도바 */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                            <div className="h-1.5 rounded-full transition-all"
                              style={{ width: `${totalPct}%`, background: totalPct >= 100 ? '#639922' : '#EF9F27' }} />
                          </div>
                          <span className="text-[10px] font-bold shrink-0"
                            style={{ color: totalPct >= 100 ? '#27500A' : '#993C1D' }}>{totalPct}%</span>
                          {avgScore != null && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{
                                background: avgScore >= 90 ? '#EAF3DE' : avgScore >= 70 ? '#FAEEDA' : '#fee2e2',
                                color: avgScore >= 90 ? '#27500A' : avgScore >= 70 ? '#633806' : '#991b1b'
                              }}>{avgScore}점</span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          {preps.length}단원 · {doneCount}개 완료
                          <i className={`ti ${isExpanded ? 'ti-chevron-up' : 'ti-chevron-down'}`}
                            style={{ fontSize: 11, marginLeft: 'auto' }} />
                        </p>
                      </button>

                      {/* 펼쳐진 단원 목록 */}
                      {isExpanded && (
                        <div style={{ borderTop: '1px solid #f0f0f0' }}>
                          {preps.map(a => {
                            const ie = a.inner_enough
                            const totalSteps = a.total_steps || 1
                            const pct = Math.round((a.progress_step || 0) / totalSteps * 100)
                            const isSpecial = ['전범위','복합'].includes(ie?.unit_name ?? '')
                            return (
                              <div key={a.id} className="px-3 py-2.5" style={{ borderBottom: '1px solid #f5f5f5' }}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-semibold"
                                    style={{ color: isSpecial ? '#9ca3af' : '#712B13' }}>
                                    {ie?.unit_name}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    {a.score != null ? (
                                      <button onClick={() => { setScorePrep(a); setInputScore(a.score?.toString() ?? ''); setShowScoreModal(true) }}
                                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                        style={{
                                          background: a.score >= 90 ? '#EAF3DE' : a.score >= 70 ? '#FAEEDA' : '#fee2e2',
                                          color: a.score >= 90 ? '#27500A' : a.score >= 70 ? '#633806' : '#991b1b'
                                        }}>{a.score}점</button>
                                    ) : (
                                      <button onClick={() => { setScorePrep(a); setInputScore(''); setShowScoreModal(true) }}
                                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                                        style={{ background: '#f3f4f6', color: '#9ca3af' }}>점수</button>
                                    )}
                                    {isAdmin() && (
                                      <button onClick={() => handleDelete(a.id)}
                                        className="text-[10px] px-1.5 py-0.5 rounded-full ml-1"
                                        style={{ background: '#f3f4f6', color: '#9ca3af' }}>
                                        <i className="ti ti-trash" style={{ fontSize: 10 }} />
                                      </button>
                                    )}
                                  </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mb-1.5">{ie?.sub_unit_name} · {ie?.problem_count}문항</p>
                                {/* 진도 단계 버튼 (줄바꿈) */}
                                <div className="flex flex-wrap gap-1">
                                  {Array.from({ length: totalSteps + 1 }).map((_, step) => {
                                    const stepPct = totalSteps === 1
                                      ? (step === 0 ? 0 : 100)
                                      : Math.round(step / totalSteps * 100)
                                    const isActive = (a.progress_step || 0) === step
                                    return (
                                      <button key={step}
                                        onClick={async () => {
                                          const status = step === 0 ? 'assigned' : step >= totalSteps ? 'done' : 'in_progress'
                                          await supabase.from('student_exam_prep')
                                            .update({ progress_step: step, status }).eq('id', a.id)
                                          fetchAll()
                                        }}
                                        className="py-1 rounded-md text-[10px] font-bold transition-all"
                                        style={{ minWidth: '38px', flexGrow: 1, ...(isActive
                                          ? { background: '#F5C4B3', color: '#712B13' }
                                          : step < (a.progress_step || 0)
                                          ? { background: '#EAF3DE', color: '#27500A' }
                                          : { background: '#f3f4f6', color: '#9ca3af' }) }}>
                                        {stepPct}%
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
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
        })()}

        {/* ── 학생별 진도 ── */}
        {viewTab === 'status' && (
          !statusStudent ? (
            <div className="space-y-2">
              {filteredStudents.map(s => {
                const myA = assignments.filter(a => a.student_id === s.id)
                const done = myA.filter(a => a.status === 'done').length
                const totalPct = myA.length > 0
                  ? Math.round(myA.reduce((sum, a) => sum + Math.round((a.progress_step||0)/(a.total_steps||1)*100), 0) / myA.length)
                  : 0
                return (
                  <button key={s.id} onClick={() => setStatusStudent(s)}
                    className="w-full bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 text-left">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                      style={{ background: '#FAECE7', color: '#993C1D' }}>{s.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800">{s.name}</p>
                      <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                    </div>
                    {myA.length > 0 ? (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black" style={{ color: totalPct >= 100 ? '#27500A' : '#993C1D' }}>{totalPct}%</p>
                        <p className="text-[10px] text-gray-400">{done}/{myA.length} 완료</p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-300 shrink-0">배정없음</p>
                    )}
                    <i className="ti ti-chevron-right" style={{ fontSize: 14, color: '#d1d5db' }} />
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                  style={{ background: '#FAECE7', color: '#993C1D' }}>{statusStudent.name[0]}</div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{statusStudent.name}</p>
                  <p className="text-xs text-gray-400">{statusStudent.grade}</p>
                </div>
                <button onClick={() => setStatusStudent(null)} className="ml-auto text-xs text-gray-400 flex items-center gap-1">
                  <i className="ti ti-arrow-left" style={{ fontSize: 13 }} />목록
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-pencil-check" style={{ fontSize: 15, color: '#993C1D' }} />
                  <span className="text-sm font-bold text-gray-700">시험대비 단원별 진도</span>
                </div>
                {assignments.filter(a => a.student_id === statusStudent.id).length === 0 ? (
                  <div className="p-8 text-center"><p className="text-sm text-gray-400">배정된 교재가 없어요</p></div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {assignments.filter(a => a.student_id === statusStudent.id).map(a => {
                      const ie = a.inner_enough
                      const totalSteps = a.total_steps || 1
                      const pct = Math.round((a.progress_step || 0) / totalSteps * 100)
                      const cfg = STATUS_STYLE[a.status] ?? STATUS_STYLE.assigned
                      return (
                        <div key={a.id} className="px-4 py-3">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{ie?.unit_name}</p>
                              <p className="text-[10px] text-gray-400">{ie?.sub_unit_name} · {ie?.problem_count}문항</p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 ml-2">
                              {a.score != null && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                  style={{
                                    background: a.score >= 90 ? '#EAF3DE' : a.score >= 70 ? '#FAEEDA' : '#fee2e2',
                                    color: a.score >= 90 ? '#27500A' : a.score >= 70 ? '#633806' : '#991b1b'
                                  }}>{a.score}점</span>
                              )}
                              <button onClick={() => { setScorePrep(a); setInputScore(a.score?.toString() ?? ''); setShowScoreModal(true) }}
                                className="px-2 py-1 text-[10px] font-semibold rounded-lg"
                                style={{ background: '#FAECE7', color: '#993C1D' }}>성취도</button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 rounded-full" style={{ background: '#f3f4f6' }}>
                              <div className="h-2 rounded-full transition-all"
                                style={{ width: `${pct}%`, background: pct >= 100 ? '#639922' : '#EF9F27' }} />
                            </div>
                            <span className="text-[10px] font-bold shrink-0" style={{
                              color: pct >= 100 ? '#27500A' : '#993C1D'
                            }}>{pct}%</span>
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                          </div>
                          {/* 회차 표시 */}
                          <div className="flex gap-1 mt-2">
                            {Array.from({ length: totalSteps }).map((_, i) => (
                              <div key={i} className="flex-1 h-1 rounded-full"
                                style={{ background: i < (a.progress_step || 0) ? '#639922' : '#f3f4f6' }} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )
        )}

        {/* ── 시험 일정 ── */}
        {viewTab === 'schedule' && (
          <div className="space-y-3">
            <button onClick={() => setShowScheduleModal(true)}
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              <i className="ti ti-plus" style={{ fontSize: 16 }} />
              시험 일정 추가
            </button>

            {examSchedules.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <i className="ti ti-calendar-event" style={{ fontSize: 32, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
                <p className="text-sm text-gray-500">등록된 시험 일정이 없어요</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <i className="ti ti-calendar-event" style={{ fontSize: 16, color: '#993C1D' }} />
                  <h3 className="text-sm font-bold text-gray-700">시험 일정</h3>
                </div>
                <div className="divide-y divide-gray-50">
                  {examSchedules.map(es => (
                    <div key={es.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-bold text-gray-800">{es.school_name}</span>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                            style={{ background: '#FAECE7', color: '#993C1D' }}>{es.grade}학년</span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto"
                            style={{ background: '#F5C4B3', color: '#712B13' }}>
                            {getDday(es.exam_date)}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{es.exam_name} · {es.exam_date}</p>
                      </div>
                      <button onClick={() => handleDeleteSchedule(es.id)}
                        className="px-2 py-1 text-[10px] rounded-lg shrink-0"
                        style={{ background: '#f3f4f6', color: '#9ca3af' }}>
                        <i className="ti ti-trash" style={{ fontSize: 11 }} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 배정 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => { setShowModal(false); setBulkMode(false) }}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 flex items-center justify-between" style={{ borderBottom: '1px solid #f0f0f0' }}>
              <div className="flex items-center gap-2">
                <i className="ti ti-book" style={{ fontSize: 18, color: '#993C1D' }} />
                <h3 className="text-base font-bold text-gray-900">시험대비 교재 배정</h3>
              </div>
              <button onClick={() => { setShowModal(false); setBulkMode(false) }} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5">
              {/* 학생 */}
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">학생 *</label>
                {selStudent ? (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                    style={{ background: '#FAECE7', border: '2px solid #F5C4B3' }}>
                    <p className="text-sm font-bold flex-1" style={{ color: '#712B13' }}>
                      {selStudent.name} · {selStudent.grade}
                    </p>
                    <p className="text-xs" style={{ color: '#993C1D' }}>
                      {getSchoolName(selStudent)} {getSchoolGrade(selStudent)}학년
                    </p>
                    <button onClick={() => { setSelStudent(null); setSelLevel(''); setSelUnitIds([]); setSelHighRange('') }}
                      className="text-gray-400"><i className="ti ti-x" /></button>
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                    {filteredStudents.map(s => (
                      <button key={s.id} onClick={() => { setSelStudent(s); setSelLevel(''); setSelUnitIds([]); setSelHighRange(''); setSelHighRange(''); setSelHighRange('') }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>{s.name[0]}</div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.grade} · {s.school}</p>
                        </div>
                        <span className="text-[10px] text-gray-400">{getSchoolName(s)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 고등 범위 선택 */}
              {selStudent && isHighSchool(selStudent) && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">시험 범위 *</label>
                  <div className="flex flex-col gap-2">
                    {highRanges.map(range => {
                      const label = range.replace('공통_', '')
                      return (
                        <button key={range}
                          onClick={() => { setSelHighRange(range); setSelLevel(''); setSelUnitIds([]) }}
                          className="px-4 py-2.5 rounded-xl text-sm font-bold transition-all text-left"
                          style={selHighRange === range
                            ? { background: '#F5C4B3', color: '#712B13' }
                            : { background: '#f3f4f6', color: '#9ca3af' }}>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 레벨 */}
              {selStudent && (!isHighSchool(selStudent) || selHighRange) && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">
                    반(레벨) * {isHighSchool(selStudent) && <span className="font-normal text-gray-400">S=상위반 · B=기본반</span>}
                  </label>
                  {availableLevels.length === 0 ? (
                    <p className="text-xs text-red-400">해당 학교/학년 데이터가 없어요</p>
                  ) : (
                    <div className="flex gap-2">
                      {availableLevels.map(lv => (
                        <button key={lv} onClick={() => { setSelLevel(lv); setSelUnitIds([]) }}
                          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                          style={selLevel === lv
                            ? { background: '#F5C4B3', color: '#712B13' }
                            : { background: '#f3f4f6', color: '#9ca3af' }}>
                          {lv}반
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 단원 */}
              {/* 일괄 배정 옵션 */}
              {selLevel && selStudent && (
                <button onClick={() => setBulkMode(!bulkMode)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 rounded-xl transition-all text-left"
                  style={bulkMode
                    ? { background: '#FFF5F2', border: '1.5px solid #F5C4B3' }
                    : { background: '#fafafa', border: '1.5px solid #f0f0f0' }}>
                  <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                    style={{ background: bulkMode ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                    {bulkMode && <i className="ti ti-check" style={{ fontSize: 11, color: '#712B13' }} />}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold" style={{ color: bulkMode ? '#712B13' : '#374151' }}>
                      같은 학교·학년 학생에게 일괄 배정
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: '#9ca3af' }}>
                      {bulkMode
                        ? `${getSchoolName(selStudent)} ${getSchoolGrade(selStudent)}학년 전체에게 같은 단원을 배정해요 (이미 배정된 건 건너뜀)`
                        : '체크하면 선택한 단원을 같은 조건 학생 모두에게 한번에 배정해요'}
                    </p>
                  </div>
                </button>
              )}

              {selLevel && Object.keys(unitGroups).length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-gray-700">단원 선택 *</label>
                    <button onClick={() => setSelUnitIds(
                      selUnitIds.length === availableUnits.length ? [] : availableUnits.map(u => u.id)
                    )}
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg"
                      style={{ background: '#f3f4f6', color: '#6b7280' }}>
                      {selUnitIds.length === availableUnits.length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="space-y-3">
                    {Object.entries(unitGroups).map(([unitName, units]) => (
                      <div key={unitName}>
                        <p className="text-xs font-bold text-gray-600 mb-1.5">{unitName}</p>
                        <div className="space-y-1.5">
                          {units.map(ie => {
                            const isChecked = selUnitIds.includes(ie.id)
                            const steps = Math.max(1, Math.round(ie.problem_count / 30))
                            return (
                              <button key={ie.id}
                                onClick={() => setSelUnitIds(prev =>
                                  isChecked ? prev.filter(id => id !== ie.id) : [...prev, ie.id]
                                )}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all"
                                style={{
                                  background: isChecked ? '#FFF5F2' : '#fafafa',
                                  border: `1px solid ${isChecked ? '#F5C4B3' : '#f0f0f0'}`
                                }}>
                                <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                                  style={{ background: isChecked ? '#F5C4B3' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                                  {isChecked && <i className="ti ti-check" style={{ fontSize: 9, color: '#712B13' }} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-gray-800 truncate">{ie.sub_unit_name}</p>
                                  <p className="text-[10px] text-gray-400">{ie.problem_count}문항 · {steps}회차</p>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 시험 날짜 */}
              {selUnitIds.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">시험 날짜 <span className="text-gray-400 font-normal">(선택)</span></label>
                  {/* 학교 일정에서 자동 가져오기 */}
                  {selStudent && (() => {
                    const matchedSchedules = examSchedules.filter(es =>
                      es.school_name === getSchoolName(selStudent) && es.grade === getSchoolGrade(selStudent)
                    )
                    if (matchedSchedules.length > 0) return (
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {matchedSchedules.map(es => (
                            <button key={es.id} onClick={() => setExamDate(examDate === es.exam_date ? '' : es.exam_date)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                              style={examDate === es.exam_date
                                ? { background: '#F5C4B3', color: '#712B13' }
                                : { background: '#f3f4f6', color: '#6b7280' }}>
                              {es.exam_name} ({es.exam_date})
                            </button>
                          ))}
                        </div>
                        {!examDate && (
                          <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
                            placeholder="직접 입력"
                            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                        )}
                        {examDate && (
                          <p className="text-[10px] text-gray-400 flex items-center gap-1">
                            <i className="ti ti-calendar-check" style={{ fontSize: 11, color: '#993C1D' }} />
                            시험일: {examDate}
                            <button onClick={() => setExamDate('')} className="ml-1 text-gray-300">
                              <i className="ti ti-x" style={{ fontSize: 10 }} />
                            </button>
                          </p>
                        )}
                      </div>
                    )
                    return (
                      <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
                    )
                  })()}
                </div>
              )}

              <button onClick={handleAssign}
                disabled={!selStudent || selUnitIds.length === 0 || assigning}
                className="w-full py-3.5 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: '#F5C4B3', color: '#712B13' }}>
                {assigning
                  ? <><span className="w-4 h-4 border-2 border-[#712B13]/30 border-t-[#712B13] rounded-full animate-spin" />배정 중...</>
                  : <><i className="ti ti-clipboard-check" style={{ fontSize: 16 }} />{bulkMode ? `전체 학생에게 ${selUnitIds.length}개 단원 일괄 배정` : `${selUnitIds.length}개 단원 배정`}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 성취도 입력 모달 */}
      {showScoreModal && scorePrep && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowScoreModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">단원 성취도 입력</h3>
              <button onClick={() => setShowScoreModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#fafafa' }}>
              <p className="text-sm font-bold text-gray-800">{students.find(s => s.id === scorePrep.student_id)?.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">{scorePrep.inner_enough?.unit_name} · {scorePrep.inner_enough?.sub_unit_name}</p>
            </div>
            <input type="number" min="0" max="100" value={inputScore}
              onChange={e => setInputScore(e.target.value)}
              placeholder="0~100" autoFocus
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-center focus:outline-none" />
            {inputScore && (
              <div className="rounded-xl p-3 text-center text-sm font-bold"
                style={{
                  background: parseInt(inputScore) >= 90 ? '#EAF3DE' : parseInt(inputScore) >= 70 ? '#FAEEDA' : '#fee2e2',
                  color: parseInt(inputScore) >= 90 ? '#27500A' : parseInt(inputScore) >= 70 ? '#633806' : '#991b1b'
                }}>
                {parseInt(inputScore) >= 90 ? '우수 👍' : parseInt(inputScore) >= 70 ? '양호' : '추가 학습 필요'}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowScoreModal(false)}
                className="flex-1 py-3 rounded-xl font-bold" style={{ background: '#f3f4f6', color: '#6b7280' }}>취소</button>
              <button onClick={handleSaveScore} disabled={!inputScore || savingScore}
                className="flex-1 py-3 rounded-xl font-bold disabled:opacity-50"
                style={{ background: '#F5C4B3', color: '#712B13' }}>
                {savingScore ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 시험 일정 추가 모달 */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowScheduleModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">시험 일정 추가</h3>
              <button onClick={() => setShowScheduleModal(false)} className="text-gray-400">
                <i className="ti ti-x" style={{ fontSize: 18 }} />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학교 *</label>
              <select value={schSchool} onChange={e => setSchSchool(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none">
                <option value="">학교 선택</option>
                <optgroup label="중학교">
                  {scheduleSchools.filter(s => s.endsWith('중') || s.includes('중학교')).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </optgroup>
                <optgroup label="고등학교">
                  {scheduleSchools.filter(s => s.endsWith('고') || s.includes('고등학교')).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학년 *</label>
              <div className="flex gap-2">
                {['1','2','3'].map(g => (
                  <button key={g} onClick={() => setSchGrade(g)}
                    className="px-5 py-2 rounded-xl text-sm font-bold transition-all"
                    style={schGrade === g
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#9ca3af' }}>
                    {g}학년
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시험명</label>
              <div className="flex gap-2 flex-wrap">
                {['1학기 중간고사','1학기 기말고사','2학기 중간고사','2학기 기말고사'].map(n => (
                  <button key={n} onClick={() => setSchName(n)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                    style={schName === n
                      ? { background: '#F5C4B3', color: '#712B13' }
                      : { background: '#f3f4f6', color: '#6b7280' }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시험 날짜 *</label>
              <input type="date" value={schDate} onChange={e => setSchDate(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
            </div>
            <button onClick={handleSaveSchedule}
              disabled={!schSchool || !schGrade || !schDate || savingSchedule}
              className="w-full py-3.5 font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
              style={{ background: '#F5C4B3', color: '#712B13' }}>
              {savingSchedule ? '저장중...' : <><i className="ti ti-calendar-plus" style={{ fontSize: 16 }} />일정 저장</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
