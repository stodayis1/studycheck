'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx, fetchAllRows } from '@/lib/utils'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
  textbook_grade: string
}

interface StudentTextbook {
  id: string
  student_id: string
  progress_percent?: number | null
  concept_id: string | null
  textbook_name: string
  textbook_type: string
  textbook_grade: string | null
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
  concept_order: number
  concept_name: string
}

interface ProgressCheck {
  id: string
  student_id: string
  concept_id: string
  check_count: number
  student_textbook_id?: string | null
}

const TB_STATUS: Record<string, { label: string; color: string }> = {
  assigned:  { label: '과제중',   color: 'text-gray-800' },
  submitted: { label: '제출완료', color: 'text-orange-500' },
  checked:   { label: '채점완료', color: 'text-green-600' },
}

interface TextbookCatalog {
  id: string
  school_level: string
  textbook_type: string
  textbook_name: string
  is_active: boolean
  sort_order: number
}

const GRADE_GROUPS = ['전체', '초등', '중등', '고등']
const HIGH_SUBJECTS = ['공통수학1', '공통수학2', '미적분1', '확률과통계', '대수', '기하']
const TB_TYPES = ['개념서', '유형서', '심화서', '연산서']

export default function TeacherCurriculumPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [examPreps, setExamPreps] = useState<any[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)
  const [gradeGroup, setGradeGroup] = useState('전체')
  const [searchText, setSearchText] = useState('')

  // 교재 배정 모달
  // 진도표
  const [progressTab, setProgressTab] = useState<'progress' | 'textbook'>('textbook')
  const [selectedProgressStudent, setSelectedProgressStudent] = useState<Student | null>(null)
  const [progressSemester, setProgressSemester] = useState(1)
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [updatingProgress, setUpdatingProgress] = useState<string | null>(null)

  // 교재 카탈로그
  const [catalog, setCatalog] = useState<TextbookCatalog[]>([])
  // 관리자 교재 관리
  const [showCatalogManager, setShowCatalogManager] = useState(false)
  const [newTBLevel, setNewTBLevel] = useState('초등')
  const [newTBType, setNewTBType] = useState('개념서')
  const [newTBName, setNewTBName] = useState('')
  const [addingTB, setAddingTB] = useState(false)

  const [showTBModal, setShowTBModal] = useState(false)
  const [tbStudent, setTbStudent] = useState<Student | null>(null)
  const [tbMultiMode, setTbMultiMode] = useState(false)
  const [tbStudentIds, setTbStudentIds] = useState<string[]>([])
  const [tbCourseGroup, setTbCourseGroup] = useState<'초등' | '중등' | '고등'>('초등')
  const [tbGrade, setTbGrade] = useState('초4')
  const [tbSemester, setTbSemester] = useState(1)
  const [tbType, setTbType] = useState('개념서')
  const [tbName, setTbName] = useState('')
  const [tbMemo, setTbMemo] = useState('')
  const [tbAssigning, setTbAssigning] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: tData }, { data: cData }, pData, { data: catData }, { data: epData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('student_textbooks').select('*').order('assigned_at', { ascending: false }).limit(5000),
      supabase.from('concepts').select('*').order('grade').order('semester').order('concept_order'),
      fetchAllRows(() => supabase.from('progress_checks').select('*')), // 8700+행이라 limit로는 언젠가 또 누락됨 - 끝까지 순회해서 전부 가져옴
      supabase.from('textbook_catalog').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('student_exam_prep').select('*, inner_enough(*)').order('exam_date', { ascending: false }),
    ])
    if (sData) setStudents(sData)
    if (tData) setTextbooks(tData)
    if (cData) setConcepts(cData)
    setProgressChecks(pData)
    if (catData) setCatalog(catData)
    if (epData) setExamPreps(epData)
    setLoading(false)
  }

  // 진도 체크 토글 (0→1→2→3→0)
  async function handleProgressCheck(studentId: string, conceptId: string) {
    const key = `${studentId}_${conceptId}`
    if (updatingProgress === key) return
    setUpdatingProgress(key)
    try {

    const existing = progressChecks.find(
      (p) => p.student_id === studentId && p.concept_id === conceptId
    )
    const nextCount = existing ? (existing.check_count >= 3 ? 0 : existing.check_count + 1) : 1

    if (!existing) {
      const { error: insertError } = await supabase.from('progress_checks').insert({ student_id: studentId, concept_id: conceptId, check_count: 1 })
      // 화면에 반영된 목록이 순간적으로 최신이 아니어서(다른 탭/기기에서 방금 만든 행 등) "없다"고 판단했는데
      // 실제로는 이미 있던 경우 - 삽입 대신 업데이트로 전환해서 중복키 오류로 멈추지 않게 함
      if (insertError?.code === '23505') {
        await supabase.from('progress_checks').update({ check_count: 1, updated_at: new Date().toISOString() })
          .eq('student_id', studentId).eq('concept_id', conceptId).is('student_textbook_id', null)
      } else if (insertError) {
        console.error('진도 체크 저장 오류:', insertError)
      }
    } else if (nextCount === 0) {
      await supabase.from('progress_checks').delete().eq('id', existing.id)
    } else {
      await supabase.from('progress_checks').update({ check_count: nextCount, updated_at: new Date().toISOString() }).eq('id', existing.id)
    }

    // 로컬 상태 즉시 반영 (UX)
    setProgressChecks((prev) => {
      if (!existing) return [...prev, { id: 'temp', student_id: studentId, concept_id: conceptId, check_count: 1 }]
      if (nextCount === 0) return prev.filter((p) => !(p.student_id === studentId && p.concept_id === conceptId))
      return prev.map((p) => p.student_id === studentId && p.concept_id === conceptId ? { ...p, check_count: nextCount } : p)
    })
    } catch (err) {
      console.error('진도 체크 처리 중 오류:', err)
    } finally {
      setUpdatingProgress(null)
    }
  }

  // 연산서 진도 업데이트 (0/20/40/60/80/100)
  async function handleCalcProgress(textbookId: string, percent: number) {
    setUpdatingProgress(`calc_${textbookId}_${percent}`)
    const { error } = await supabase.from('student_textbooks')
      .update({ progress_percent: percent, updated_at: new Date().toISOString() })
      .eq('id', textbookId)
    if (!error) {
      setTextbooks((prev) => prev.map((t) => t.id === textbookId ? { ...t, progress_percent: percent } : t))
    } else {
      alert('진도 저장 실패: ' + error.message)
    }
    setUpdatingProgress(null)
  }

  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  })
  const myStudentIds = new Set(myStudents.map((s) => s.id))

  const filteredStudents = myStudents.filter((s) => {
    const matchGrade = gradeGroup === '전체' || s.grade.includes(gradeGroup === '초등' ? '초' : gradeGroup === '중등' ? '중' : '고')
    const matchSearch = searchText === '' || s.name.includes(searchText)
    return matchGrade && matchSearch
  })

  function getConceptById(id: string) {
    return concepts.find((c) => c.id === id)
  }

  async function handleTBAssign() {
    if (!tbName) return
    // 대상 학생 결정: 다중모드면 체크된 학생들, 아니면 단일 학생
    const targetIds = tbMultiMode ? tbStudentIds : (tbStudent ? [tbStudent.id] : [])
    if (targetIds.length === 0) return
    setTbAssigning(true)

    for (const sid of targetIds) {
      // 같은 종류 교재(개념서/유형서/심화서)도 여러 권 동시에 진행할 수 있도록 자동 교체하지 않고 그대로 추가
      // 모의고사 1부/2부는 다른 교재와 진도가 섞이지 않도록 학년/학기를 전용 값으로 자동 지정
      const isMockExam1 = tbName === '모의고사 1부'
      const isMockExam2 = tbName === '모의고사 2부'
      const savedGrade = (isMockExam1 || isMockExam2) ? '중2모의고사' : tbGrade
      const savedSemester = isMockExam1 ? 1 : isMockExam2 ? 2 : tbSemester

      await supabase.from('student_textbooks').insert({
        student_id: sid,
        concept_id: null,
        textbook_name: tbName,
        textbook_type: tbType,
        grade: savedGrade,
        semester: savedSemester,
        status: 'assigned',
        memo: tbMemo || null,
      })
    }
    setShowTBModal(false)
    setTbStudent(null); setTbStudentIds([]); setTbMultiMode(false); setTbName(''); setTbMemo('')
    setTbAssigning(false)
    fetchData()
  }

  // 교재 완료
  async function handleCompleteTB(id: string) {
    if (!confirm('이 교재를 완료 처리할까요? 완료된 교재는 보고서에 이력으로 남아요.')) return
    await supabase.from('student_textbooks').update({ status: 'completed' }).eq('id', id)
    fetchData()
  }

  // 교재 중단
  async function handlePauseTB(id: string) {
    if (!confirm('이 교재를 중단 처리할까요? 나중에 다시 진행중으로 되돌릴 수 있어요.')) return
    await supabase.from('student_textbooks').update({ status: 'paused' }).eq('id', id)
    fetchData()
  }

  // 교재 재개 (중단 → 진행중)
  async function handleResumeTB(id: string) {
    await supabase.from('student_textbooks').update({ status: 'assigned' }).eq('id', id)
    fetchData()
  }

  // 교재 완전 삭제 (완료/중단 교재만)
  async function handleDeleteTB(id: string) {
    if (!confirm('이 교재 기록을 완전히 삭제할까요? 되돌릴 수 없어요.')) return
    await supabase.from('student_textbooks').delete().eq('id', id)
    fetchData()
  }

  // 교재 카탈로그 추가 (관리자)
  async function handleAddCatalog() {
    if (!newTBName.trim()) return
    setAddingTB(true)
    await supabase.from('textbook_catalog').insert({
      school_level: newTBLevel,
      textbook_type: newTBType,
      textbook_name: newTBName.trim(),
      sort_order: catalog.filter((c) => c.school_level === newTBLevel && c.textbook_type === newTBType).length + 1,
    })
    setNewTBName('')
    setAddingTB(false)
    fetchData()
  }

  // 교재 카탈로그 삭제 (관리자)
  async function handleDeleteCatalog(id: string, name: string) {
    if (!confirm(`"${name}" 교재를 목록에서 삭제할까요?`)) return
    await supabase.from('textbook_catalog').update({ is_active: false }).eq('id', id)
    fetchData()
  }

  async function handleTBChecked(id: string) {
    await supabase.from('student_textbooks').update({ status: 'checked' }).eq('id', id)
    fetchData()
  }

  async function handleTBSubmitted(id: string) {
    await supabase.from('student_textbooks').update({ status: 'submitted' }).eq('id', id)
    fetchData()
  }

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header
        title="과정관리"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          progressTab === 'textbook' ? (
            <div className="flex gap-2">
              {isAdmin() && (
                <button onClick={() => setShowCatalogManager(true)}
                  className="px-3 py-1.5 bg-gray-700 text-white text-xs font-semibold rounded-lg">
                  📋 교재 목록
                </button>
              )}
              <button onClick={() => setShowTBModal(true)}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg">
                + 교재 배정
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* 메인 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'progress', label: '📊 진도표' },
            { key: 'textbook', label: '📚 교재배정' },
          ].map((t) => (
            <button key={t.key} onClick={() => setProgressTab(t.key as typeof progressTab)}
              className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                progressTab === t.key ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 공통 검색/필터 */}
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
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />

        {/* ── 진도표 탭 ── */}
        {progressTab === 'progress' && (
          loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : !selectedProgressStudent ? (
            // 학생 선택 화면
            <div className="space-y-2">
              <p className="text-xs text-gray-400 px-1">진도를 확인할 학생을 선택하세요</p>
              {filteredStudents.map((student) => {
                const gradeKey = student.grade.includes('초1') ? '초1' : student.grade.includes('초2') ? '초2'
                  : student.grade.includes('초3') ? '초3' : student.grade.includes('초4') ? '초4'
                  : student.grade.includes('초5') ? '초5' : student.grade.includes('초6') ? '초6'
                  : student.grade.includes('중1') ? '중1' : student.grade.includes('중2') ? '중2'
                  : student.grade.includes('중3') ? '중3' : student.grade.includes('고1') ? '고1'
                  : student.grade.includes('고2') ? '고2' : '고3'
                const studentConcepts = concepts.filter((c) => c.grade === gradeKey)
                // 학습일지/일괄진도체크에서 찍는 체크는 교재(student_textbook_id)에 묶여서 저장되는 경우가 대부분이라
                // 여기서도 스코프 상관없이 전부 봐야 한다 (안 그러면 분명 체크했는데 진도표엔 0%로 보이는 문제 발생)
                const checkedConceptIds = new Set(
                  progressChecks
                    .filter((p) => p.student_id === student.id && p.check_count >= 1)
                    .map((p) => p.concept_id)
                )
                const studentChecks = studentConcepts.filter((c) => checkedConceptIds.has(c.id))
                const totalRate = studentConcepts.length > 0
                  ? Math.round(studentChecks.length / studentConcepts.length * 100) : 0
                return (
                  <button key={student.id} onClick={() => setSelectedProgressStudent(student)}
                    className="w-full bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3 hover:border-blue-200 transition-all text-left">
                    <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.grade} · {student.teacher_name}</p>
                      {/* 진도율 바 */}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${totalRate}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-gray-800 shrink-0">{totalRate}%</span>
                      </div>
                    </div>
                    <span className="text-gray-300 text-lg">›</span>
                  </button>
                )
              })}
              {filteredStudents.length === 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                  <p className="text-3xl mb-3">📊</p>
                  <p className="text-sm text-gray-500">학생이 없어요</p>
                </div>
              )}
            </div>
          ) : (() => {
            // 진도표 상세 화면
            const gradeLabel = selectedProgressStudent.grade.includes('중1') ? '중1'
              : selectedProgressStudent.grade.includes('중2') ? '중2'
              : selectedProgressStudent.grade.includes('중3') ? '중3'
              : selectedProgressStudent.grade.includes('고1') ? '고1'
              : selectedProgressStudent.grade.includes('고2') ? '고2' : '고3'

            const semesterConcepts = concepts.filter(
              (c) => c.grade === gradeLabel && c.semester === progressSemester
            )

            // 대단원 > 중단원 > 소단원 그룹핑
            const grouped: Record<string, Record<string, typeof semesterConcepts>> = {}
            for (const c of semesterConcepts) {
              if (!grouped[c.chapter]) grouped[c.chapter] = {}
              if (!grouped[c.chapter][c.sub_chapter]) grouped[c.chapter][c.sub_chapter] = []
              grouped[c.chapter][c.sub_chapter].push(c)
            }

            // 학습일지/일괄진도체크에서 찍는 체크는 대부분 교재(student_textbook_id)에 묶여서 저장되므로
            // 스코프 상관없이 전부 모아서, 같은 개념이 여러 교재에서 체크됐으면 가장 높이 나간 회차를 기준으로 삼는다
            const checkCountByConcept = new Map<string, number>()
            for (const p of progressChecks) {
              if (p.student_id !== selectedProgressStudent.id) continue
              const cur = checkCountByConcept.get(p.concept_id) ?? 0
              if (p.check_count > cur) checkCountByConcept.set(p.concept_id, p.check_count)
            }
            const checkedCount = semesterConcepts.filter((c) => (checkCountByConcept.get(c.id) ?? 0) >= 1).length
            const totalRate = semesterConcepts.length > 0
              ? Math.round(checkedCount / semesterConcepts.length * 100) : 0

            const CHECK_STYLE: Record<number, { bg: string; text: string; label: string }> = {
              0: { bg: 'bg-gray-100', text: 'text-gray-400', label: '미진도' },
              1: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '개념' },
              2: { bg: 'bg-green-100', text: 'text-green-700', label: '유형' },
              3: { bg: 'bg-orange-100', text: 'text-orange-700', label: '심화' },
            }

            return (
              <div className="space-y-3">
                {/* 상단: 뒤로가기 + 학생 정보 */}
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedProgressStudent(null)}
                    className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 shrink-0">
                    ‹
                  </button>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-900">{selectedProgressStudent.name} · {selectedProgressStudent.grade}</p>
                    <p className="text-xs text-gray-400">{gradeLabel} {progressSemester}학기 · {checkedCount}/{semesterConcepts.length}개 완료</p>
                  </div>
                </div>

                {/* 진도율 바 */}
                <div className="bg-white rounded-2xl border border-gray-100 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-700">전체 진도율</span>
                    <span className="text-lg font-bold text-gray-800">{totalRate}%</span>
                  </div>
                  <div className="bg-gray-100 rounded-full h-3">
                    <div className="h-3 rounded-full transition-all duration-500"
                      style={{ width: `${totalRate}%`, background: totalRate >= 80 ? '#22c55e' : totalRate >= 50 ? '#3b82f6' : '#f59e0b' }} />
                  </div>
                  {/* 범례 */}
                  <div className="flex gap-3 mt-3 flex-wrap">
                    {[1,2,3].map((n) => (
                      <div key={n} className="flex items-center gap-1">
                        <span className={cx('w-3 h-3 rounded-full', CHECK_STYLE[n].bg)} />
                        <span className="text-[10px] text-gray-500">{CHECK_STYLE[n].label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 연산서 진도 (별도 % 5단계) */}
                {(() => {
                  const calcBooks = textbooks.filter((t) => t.student_id === selectedProgressStudent.id && t.textbook_type === '연산서' && t.status !== 'checked')
                  if (calcBooks.length === 0) return null
                  return (
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: '#FFF0EE', color: '#712B13' }}>연산서</span>
                        <span className="text-xs font-bold text-gray-700">달성률</span>
                      </div>
                      {calcBooks.map((tb) => {
                        const pct = tb.progress_percent ?? 0
                        return (
                          <div key={tb.id} className="border border-gray-100 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-sm font-semibold text-gray-800">{tb.textbook_name}</p>
                              <span className="text-sm font-bold" style={{ color: pct >= 80 ? '#22c55e' : pct >= 40 ? '#3b82f6' : '#f59e0b' }}>{pct}%</span>
                            </div>
                            <div className="bg-gray-100 rounded-full h-2 mb-3">
                              <div className="h-2 rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: pct >= 80 ? '#22c55e' : pct >= 40 ? '#3b82f6' : '#f59e0b' }} />
                            </div>
                            <div className="flex gap-1.5 flex-wrap">
                              {[0, 20, 40, 60, 80, 100].map((v) => {
                                const isActive = pct === v
                                const isUpdating = updatingProgress === `calc_${tb.id}_${v}`
                                return (
                                  <button key={v} onClick={() => handleCalcProgress(tb.id, v)} disabled={isUpdating}
                                    className={cx('flex-1 min-w-[44px] px-2 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:opacity-50',
                                      isActive ? 'bg-[#F5C4B3] text-white border-[#F5C4B3]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#F5C4B3]')}>
                                    {v}%
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* 학기 탭 */}
                <div className="flex gap-2">
                  {[1,2].map((s) => (
                    <button key={s} onClick={() => setProgressSemester(s)}
                      className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                        progressSemester === s ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                      {s}학기
                    </button>
                  ))}
                </div>

                {/* 대단원 목록 */}
                {Object.entries(grouped).map(([bigUnit, subGroups]) => {
                  const bigConcepts = Object.values(subGroups).flat()
                  const bigChecked = bigConcepts.filter((c) => (checkCountByConcept.get(c.id) ?? 0) >= 1).length
                  const bigRate = bigConcepts.length > 0 ? Math.round(bigChecked / bigConcepts.length * 100) : 0

                  return (
                    <div key={bigUnit} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                      {/* 대단원 헤더 */}
                      <div className="px-4 py-3 bg-white border-b border-gray-100 flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-800">{bigUnit}</p>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${bigRate}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-gray-800">{bigRate}%</span>
                        </div>
                      </div>

                      {/* 중단원 목록 */}
                      {Object.entries(subGroups).map(([subUnit, subConcepts]) => (
                        <div key={subUnit} className="border-b border-gray-50 last:border-0">
                          <p className="px-4 py-2 text-xs font-bold text-gray-500 bg-white/50">{subUnit}</p>
                          {/* 소단원 목록 */}
                          <div className="divide-y divide-gray-50">
                            {subConcepts.map((concept) => {
                              const count = checkCountByConcept.get(concept.id) ?? 0
                              const style = CHECK_STYLE[count]
                              const isUpdating = updatingProgress === `${selectedProgressStudent.id}_${concept.id}`
                              return (
                                <button key={concept.id}
                                  onClick={() => handleProgressCheck(selectedProgressStudent.id, concept.id)}
                                  disabled={isUpdating}
                                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white transition-all text-left">
                                  {/* 회차 뱃지 */}
                                  <div className={cx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all', style.bg, style.text)}>
                                    {count === 0 ? '·' : `${count}회`}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={cx('text-xs font-medium transition-all', count > 0 ? 'text-gray-800' : 'text-gray-400')}>
                                      {concept.concept_order}. {concept.concept_name}
                                    </p>
                                  </div>
                                  {count > 0 && (
                                    <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0', style.bg, style.text)}>
                                      {style.label}
                                    </span>
                                  )}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )
          })()
        )}

        {/* ── 교재배정 탭 ── */}
        {progressTab === 'textbook' && (loading ? (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📚</p>
            <p className="text-sm text-gray-500">학생이 없어요</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((student) => {
              const studentTBs = textbooks.filter((t) => t.student_id === student.id)
              // 시험대비 교재: 시험일 1주일 후까지만 표시
              const now = new Date()
              const myExamPreps = examPreps.filter((ep) => {
                if (ep.student_id !== student.id) return false
                if (ep.status === 'done') return false
                if (!ep.exam_date) return false
                const examEnd = new Date(ep.exam_date)
                examEnd.setDate(examEnd.getDate() + 7)
                return now <= examEnd
              })
              const activeTBs = studentTBs.filter((t) => t.status === 'assigned')
              const tbByType = activeTBs.reduce((acc, t) => {
                if (!acc[t.textbook_type]) acc[t.textbook_type] = []
                acc[t.textbook_type].push(t)
                return acc
              }, {} as Record<string, StudentTextbook[]>)

              return (
                <div key={student.id} className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                  {/* 학생 헤더 */}
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.grade} · {student.teacher_name}</p>
                    </div>
                    <button onClick={() => { setTbStudent(student); setShowTBModal(true)
                      if (student.grade.includes('초')) { setTbCourseGroup('초등'); setTbGrade(student.grade.replace('학년','').trim()) }
                      else if (student.grade.includes('중')) { setTbCourseGroup('중등'); setTbGrade(student.grade.includes('1') ? '중1' : student.grade.includes('2') ? '중2' : '중3') }
                      else if (student.grade.includes('고')) { setTbCourseGroup('고등'); setTbGrade(student.grade.includes('1') ? '고1' : student.grade.includes('2') ? '고2' : '고3') }
                      
                    }}
                      className="px-2.5 py-1 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-lg shrink-0">
                      + 교재배정
                    </button>
                  </div>

                  {/* 배정된 교재 목록 - 수정/삭제 가능 */}
                  {(studentTBs.length > 0 || myExamPreps.length > 0) ? (
                    <div className="space-y-1.5">
                      {/* 진행중 교재 */}
                      {studentTBs.filter(t => t.status === 'assigned').map((t) => (
                        <div key={t.id} className={cx('flex items-center gap-2 px-3 py-2 rounded-xl border',
                          t.textbook_type === '개념서' ? 'bg-yellow-50 border-yellow-200' :
                          t.textbook_type === '유형서' ? 'bg-green-50 border-green-200' :
                          t.textbook_type === '심화서' ? 'bg-orange-50 border-orange-200' :
                          'bg-purple-50 border-purple-200')}>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-gray-700">{t.textbook_type}</span>
                            <span className="text-xs text-gray-500 ml-1.5">{t.textbook_name}</span>
                            {t.grade && (
                              <span className="text-[10px] text-gray-400 ml-1.5">
                                {t.grade} {t.semester ? `${t.semester}학기` : ''}
                              </span>
                            )}
                          </div>
                          <button onClick={() => handleCompleteTB(t.id)}
                            className="text-[10px] px-2 py-1 rounded-lg transition-all shrink-0"
                            style={{ background: '#F0FBF7', color: '#085041' }}>
                            완료
                          </button>
                          <button onClick={() => handlePauseTB(t.id)}
                            className="text-[10px] px-2 py-1 rounded-lg transition-all shrink-0"
                            style={{ background: '#FAEEDA', color: '#633806' }}>
                            중단
                          </button>
                        </div>
                      ))}
                      {/* 중단 교재 */}
                      {studentTBs.filter(t => t.status === 'paused').map((t) => (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                          style={{ background: '#f9fafb', borderColor: '#e5e7eb' }}>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5"
                              style={{ background: '#e5e7eb', color: '#6b7280' }}>중단</span>
                            <span className="text-xs font-bold text-gray-500">{t.textbook_type}</span>
                            <span className="text-xs text-gray-400 ml-1.5">{t.textbook_name}</span>
                          </div>
                          <button onClick={() => handleResumeTB(t.id)}
                            className="text-[10px] px-2 py-1 rounded-lg transition-all shrink-0"
                            style={{ background: '#9FE1CB', color: '#085041' }}>
                            재개
                          </button>
                          <button onClick={() => handleDeleteTB(t.id)}
                            className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-all shrink-0">
                            삭제
                          </button>
                        </div>
                      ))}
                      {/* 완료 교재 */}
                      {studentTBs.filter(t => t.status === 'completed').map((t) => (
                        <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                          style={{ background: '#F0FBF7', borderColor: '#9FE1CB' }}>
                          <div className="flex-1 min-w-0">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded mr-1.5"
                              style={{ background: '#9FE1CB', color: '#085041' }}>완료</span>
                            <span className="text-xs font-bold text-gray-600">{t.textbook_type}</span>
                            <span className="text-xs text-gray-400 ml-1.5">{t.textbook_name}</span>
                          </div>
                          <button onClick={() => handleDeleteTB(t.id)}
                            className="text-[10px] text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 transition-all shrink-0">
                            삭제
                          </button>
                        </div>
                      ))}
                      {/* 시험대비 교재 (시험배정 자동 연동, 시험일 1주일 후 자동 사라짐) */}
                      {myExamPreps.map((ep) => (
                        <div key={'ep-' + ep.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border"
                          style={{ background: '#FFF5F2', borderColor: '#F5C4B3' }}>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold" style={{ color: '#712B13' }}>시험대비</span>
                            <span className="text-xs text-gray-500 ml-1.5">{ep.inner_enough?.unit_name ?? '이너프원'}</span>
                            {ep.exam_date && (
                              <span className="text-[10px] text-gray-400 ml-1.5">시험일 {ep.exam_date}</span>
                            )}
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0"
                            style={{ background: '#F5C4B3', color: '#712B13' }}>시험배정</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">배정된 교재 없음</p>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* 관리자 교재 목록 관리 모달 */}
      {showCatalogManager && isAdmin() && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowCatalogManager(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📚 교재 목록 관리</h3>
              <button onClick={() => setShowCatalogManager(false)} className="text-gray-400">✕</button>
            </div>

            {/* 교재 추가 */}
            <div className="bg-white rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-gray-700">+ 교재 추가</p>
              <div className="flex gap-2">
                {(['초등','중등','고등'] as const).map((lv) => (
                  <button key={lv} onClick={() => setNewTBLevel(lv)}
                    className={cx('flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all',
                      newTBLevel === lv ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                    {lv}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 flex-wrap">
                {TB_TYPES.map((type) => (
                  <button key={type} onClick={() => setNewTBType(type)}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      newTBType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {type}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newTBName} onChange={(e) => setNewTBName(e.target.value)}
                  placeholder="교재명 입력"
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCatalog()}
                  className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                <button onClick={handleAddCatalog} disabled={!newTBName.trim() || addingTB}
                  className="px-4 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl disabled:opacity-50">
                  추가
                </button>
              </div>
            </div>

            {/* 현재 교재 목록 */}
            <div className="space-y-3">
              {(['초등','중등','고등'] as const).map((lv) => (
                <div key={lv}>
                  <p className="text-xs font-bold text-gray-500 mb-2">{lv}</p>
                  {TB_TYPES.map((type) => {
                    const items = catalog.filter((c) => c.school_level === lv && c.textbook_type === type)
                    if (items.length === 0) return null
                    return (
                      <div key={type} className="mb-2">
                        <p className="text-[10px] font-semibold text-gray-400 mb-1 ml-1">{type}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {items.map((item) => (
                            <div key={item.id} className="flex items-center gap-1 bg-gray-100 rounded-lg px-2.5 py-1">
                              <span className="text-xs text-gray-700">{item.textbook_name}</span>
                              <button onClick={() => handleDeleteCatalog(item.id, item.textbook_name)}
                                className="text-red-400 hover:text-red-600 text-xs ml-1 font-bold">✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 병행교재 배정 모달 */}
      {showTBModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => { setShowTBModal(false); setTbMultiMode(false); setTbStudentIds([]) }}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📚 과정 및 교재 배정</h3>
              <button onClick={() => { setShowTBModal(false); setTbMultiMode(false); setTbStudentIds([]) }} className="text-gray-400">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-gray-700">학생 <span className="text-red-400">*</span></label>
                <button onClick={() => { setTbMultiMode(!tbMultiMode); setTbStudent(null); setTbStudentIds([]) }}
                  className="text-[10px] font-bold px-2.5 py-1 rounded-lg transition-all"
                  style={tbMultiMode
                    ? { background: '#9FE1CB', color: '#085041' }
                    : { background: '#f3f4f6', color: '#6b7280' }}>
                  {tbMultiMode ? '✓ 여러 명 선택중' : '여러 명 선택'}
                </button>
              </div>

              {/* 다중 선택 모드 */}
              {tbMultiMode ? (
                <div>
                  {tbStudentIds.length > 0 && (
                    <p className="text-[11px] font-semibold text-green-700 mb-1.5">{tbStudentIds.length}명 선택됨</p>
                  )}
                  <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl">
                    {filteredStudents.map((s) => {
                      const checked = tbStudentIds.includes(s.id)
                      return (
                        <button key={s.id} onClick={() => {
                          setTbStudentIds(prev => checked ? prev.filter(id => id !== s.id) : [...prev, s.id])
                        }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0 text-left"
                          style={{ background: checked ? '#F0FBF7' : 'white' }}>
                          <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                            style={{ background: checked ? '#9FE1CB' : '#f3f4f6', border: '1px solid #e5e7eb' }}>
                            {checked && <i className="ti ti-check" style={{ fontSize: 11, color: '#085041' }} />}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                            <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1.5">선택한 학생들에게 아래 교재가 동일하게 배정돼요</p>
                </div>
              ) : tbStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-green-50 border-2 border-green-300 rounded-xl">
                  <p className="text-sm font-bold text-green-800 flex-1">{tbStudent.name} · {tbStudent.grade}</p>
                  <button onClick={() => setTbStudent(null)} className="text-green-400">✕</button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredStudents.map((s) => (
                    <button key={s.id} onClick={() => {
                      setTbStudent(s)
                      if (s.grade.includes('초')) { setTbCourseGroup('초등'); setTbGrade(s.grade.replace('학년','').trim()) }
                      else if (s.grade.includes('중')) { setTbCourseGroup('중등'); setTbGrade(s.grade.includes('1') ? '중1' : s.grade.includes('2') ? '중2' : '중3') }
                      else if (s.grade.includes('고')) { setTbCourseGroup('고등'); setTbGrade('공통수학1') }
                    }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-green-50 border-b border-gray-50 last:border-0">
                      <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">{s.name[0]}</div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                        <p className="text-xs text-gray-400">{s.grade} · {s.teacher_name}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ① 과정 + 학년 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">
                ① 진행 과정
                <span className="ml-1.5 text-[10px] font-normal text-gray-400">학생 학년과 달라도 돼요</span>
              </label>
              <div className="flex gap-2 mb-2">
                {(['초등','중등','고등'] as const).map((group) => (
                  <button key={group} onClick={() => {
                    setTbCourseGroup(group)
                    setTbGrade(group === '초등' ? '초4' : group === '중등' ? '중1' : '공통수학1')
                    setTbType('개념서'); setTbName('')
                  }}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      tbCourseGroup === group ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                    {group}
                  </button>
                ))}
              </div>
              {/* 초등/중등: 학년 선택 / 고등: 과목 선택 */}
              {tbCourseGroup === '고등' ? (
                <div className="flex gap-1.5 flex-wrap">
                  {HIGH_SUBJECTS.map((subj) => (
                    <button key={subj} onClick={() => setTbGrade(subj)}
                      className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                        tbGrade === subj ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                      {subj}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex gap-1.5 flex-wrap">
                  {(tbCourseGroup === '초등'
                    ? ['초1','초2','초3','초4','초5','초6']
                    : ['중1','중2','중3']
                  ).map((g) => (
                    <button key={g} onClick={() => setTbGrade(g)}
                      className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                        tbGrade === g ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{g}</button>
                  ))}
                </div>
              )}
            </div>

            {/* ② 학기 (고등은 숨김) */}
            {tbCourseGroup !== '고등' && (
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-2">② 학기</label>
                <div className="flex gap-2">
                  {[1,2].map((s) => (
                    <button key={s} onClick={() => setTbSemester(s)}
                      className={cx('px-6 py-2 rounded-lg text-sm font-semibold border transition-all',
                        tbSemester === s ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{s}학기</button>
                  ))}
                </div>
              </div>
            )}

            {/* ③ 교재 종류 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">③ 교재 종류</label>
              <div className="flex gap-2 flex-wrap">
                {TB_TYPES.map((type) => (
                  <button key={type} onClick={() => { setTbType(type); setTbName('') }}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      tbType === type ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>{type}</button>
                ))}
              </div>
            </div>

            {/* ④ 교재명 - DB 기반 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                ④ 교재명
                {catalog.filter((c) => c.school_level === tbCourseGroup && c.textbook_type === tbType).length === 0 && (
                  <span className="ml-2 text-[10px] text-orange-500 font-normal">등록된 교재 없음 — 관리자에게 추가 요청하세요</span>
                )}
              </label>
              <div className="flex gap-2 flex-wrap">
                {catalog
                  .filter((c) => c.school_level === tbCourseGroup && c.textbook_type === tbType)
                  .map((c) => (
                    <button key={c.id} onClick={() => setTbName(c.textbook_name)}
                      className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                        tbName === c.textbook_name ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                      {c.textbook_name}
                    </button>
                  ))}
              </div>
            </div>

            {/* 선택 요약 */}
            {tbStudent && tbName && (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <p className="text-xs font-bold text-green-800">
                  {tbStudent.name} · {tbGrade}{tbCourseGroup !== '고등' ? ` ${tbSemester}학기` : ''} · {tbType} · {tbName}
                </p>
              </div>
            )}

            <button onClick={handleTBAssign}
              disabled={(tbMultiMode ? tbStudentIds.length === 0 : !tbStudent) || !tbName || tbAssigning}
              className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {tbAssigning ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />배정 중...</> : (tbMultiMode ? `📚 ${tbStudentIds.length}명에게 교재 배정하기` : '📚 교재 배정하기')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
