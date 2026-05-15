'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface StudentWorksheet {
  id: string
  student_id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  status: string
  assigned_at: string
  student?: Student
}

const LEVELS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]
const GRADE_LEVELS = ['초1', '초2', '초3', '초4', '초5', '초6']
const UNITS = ['1단원', '2단원', '3단원', '4단원', '5단원', '6단원', '7단원', '8단원']

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:  { label: '과제중',    color: 'text-blue-600',  bg: 'bg-blue-50 border-blue-200' },
  submitted: { label: '채점대기',  color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
  passed:    { label: '레벨업✓',  color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
  retry:     { label: '재도전',    color: 'text-red-500',   bg: 'bg-red-50 border-red-200' },
}

export default function TeacherAssignmentsPage() {
  const router = useRouter()
  const [tab, setTab] = useState<'worksheet' | 'list'>('worksheet')
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')

  // 과제 배정 폼
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [formGradeLevel, setFormGradeLevel] = useState('초4')
  const [formUnit, setFormUnit] = useState('1단원')
  const [formUnitName, setFormUnitName] = useState('')
  const [formLevel, setFormLevel] = useState(2.5)
  const [assigning, setAssigning] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    // 초등학생만 불러오기
    const { data: studentData } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('name')

    // 학습지 현황 불러오기
    const { data: worksheetData } = await supabase
      .from('student_worksheets')
      .select('*')
      .order('assigned_at', { ascending: false })

    if (studentData) setStudents(studentData)
    if (worksheetData) setWorksheets(worksheetData)
    setLoading(false)
  }

  // 과제 배정
  async function handleAssign() {
    if (!selectedStudent) return
    setAssigning(true)

    const { error } = await supabase
      .from('student_worksheets')
      .insert({
        student_id:    selectedStudent.id,
        subject:       '수학',
        grade_level:   formGradeLevel,
        unit:          formUnit,
        unit_name:     formUnitName,
        current_level: formLevel,
        status:        'assigned',
      })

    if (!error) {
      setShowAssignModal(false)
      setSelectedStudent(null)
      fetchData()
    } else {
      alert('과제 배정 중 오류가 발생했습니다.')
    }
    setAssigning(false)
  }

  // 제출 확인
  async function handleSubmitted(worksheetId: string) {
    await supabase
      .from('student_worksheets')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('id', worksheetId)
    fetchData()
  }

  // 레벨업 (85점 이상)
  async function handleLevelUp(worksheet: StudentWorksheet) {
    const nextLevel = Math.min(6.0, worksheet.current_level + 0.5)
    // 현재 과제 통과 처리
    await supabase
      .from('student_worksheets')
      .update({ status: 'passed' })
      .eq('id', worksheet.id)
    // 다음 레벨 과제 자동 배정
    await supabase
      .from('student_worksheets')
      .insert({
        student_id:    worksheet.student_id,
        subject:       '수학',
        grade_level:   worksheet.grade_level,
        unit:          worksheet.unit,
        unit_name:     worksheet.unit_name,
        current_level: nextLevel,
        status:        'assigned',
      })
    fetchData()
  }

  // 재도전 (80점 미만)
  async function handleRetry(worksheet: StudentWorksheet) {
    await supabase
      .from('student_worksheets')
      .update({ status: 'retry' })
      .eq('id', worksheet.id)
    // 같은 레벨 재도전 과제 배정
    await supabase
      .from('student_worksheets')
      .insert({
        student_id:    worksheet.student_id,
        subject:       '수학',
        grade_level:   worksheet.grade_level,
        unit:          worksheet.unit,
        unit_name:     worksheet.unit_name,
        current_level: worksheet.current_level,
        status:        'assigned',
      })
    fetchData()
  }

  // 학생 이름 찾기
  function getStudentName(studentId: string) {
    return students.find((s) => s.id === studentId)?.name ?? '알 수 없음'
  }

  const filteredWorksheets = worksheets.filter((w) => {
    const name = getStudentName(w.student_id)
    return name.includes(searchText) || w.unit.includes(searchText)
  })

  const filteredStudents = students.filter((s) =>
    s.name.includes(searchText) || s.school?.includes(searchText)
  )

  return (
    <div>
      <Header
        title="과제 관리"
        action={
          <button
            onClick={() => setShowAssignModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
          >
            + 과제 배정
          </button>
        }
      />

      {/* 탭 */}
      <div className="flex gap-2 px-4 pt-4">
        {[
          { key: 'worksheet', label: '📝 학습지 현황' },
          { key: 'list',      label: '📋 전체 과제' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as typeof tab)}
            className={cx(
              'px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              tab === t.key
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 검색 */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름 또는 단원으로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* 학습지 현황 탭 */}
        {tab === 'worksheet' && (
          <div className="space-y-3">
            {loading ? (
              <div className="text-center py-8">
                <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
              </div>
            ) : filteredWorksheets.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <p className="text-4xl mb-3">📝</p>
                <p className="text-sm font-semibold text-gray-600">배정된 과제가 없어요</p>
                <p className="text-xs text-gray-400 mt-1">+ 과제 배정 버튼으로 시작해보세요</p>
              </div>
            ) : (
              filteredWorksheets.map((w) => {
                const statusCfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.assigned
                const studentName = getStudentName(w.student_id)
                return (
                  <div key={w.id} className={cx('bg-white rounded-2xl border-2 shadow-sm overflow-hidden', statusCfg.bg)}>
                    <div className="px-4 py-3 flex items-center justify-between">
                      {/* 학생 정보 */}
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                          {studentName[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-gray-900">{studentName}</p>
                            <span className={cx('text-[10px] font-bold px-2 py-0.5 rounded-full border', statusCfg.bg, statusCfg.color)}>
                              {statusCfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {w.grade_level} · {w.unit} {w.unit_name && `(${w.unit_name})`} · <span className="font-bold text-blue-600">{w.current_level}레벨</span>
                          </p>
                        </div>
                      </div>

                      {/* 액션 버튼 */}
                      <div className="flex gap-1.5 shrink-0">
                        {w.status === 'assigned' && (
                          <button
                            onClick={() => handleSubmitted(w.id)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
                          >
                            제출확인
                          </button>
                        )}
                        {w.status === 'submitted' && (
                          <>
                            <button
                              onClick={() => handleLevelUp(w)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
                            >
                              레벨업 ↑
                            </button>
                            <button
                              onClick={() => handleRetry(w)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                            >
                              재도전
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* 전체 과제 탭 */}
        {tab === 'list' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <h3 className="text-sm font-bold text-gray-800">전체 학습지 이력</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {filteredWorksheets.map((w) => {
                const statusCfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.assigned
                return (
                  <div key={w.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-gray-800">{getStudentName(w.student_id)}</p>
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', statusCfg.color, statusCfg.bg)}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {w.grade_level} · {w.unit} · {w.current_level}레벨
                      </p>
                    </div>
                    <p className="text-xs text-gray-300 shrink-0">
                      {new Date(w.assigned_at).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                )
              })}
              {filteredWorksheets.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">이력이 없어요</p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* 과제 배정 모달 */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowAssignModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">📝 학습지 과제 배정</h3>
              <button onClick={() => setShowAssignModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 선택 <span className="text-red-400">*</span></label>
              {selectedStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <div className="w-8 h-8 rounded-full bg-blue-200 flex items-center justify-center text-sm font-bold text-blue-700">
                    {selectedStudent.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-blue-800">{selectedStudent.name}</p>
                    <p className="text-xs text-blue-500">{selectedStudent.school} · {selectedStudent.grade}</p>
                  </div>
                  <button onClick={() => setSelectedStudent(null)} className="text-blue-400 hover:text-red-400">✕</button>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-xl">
                  {students
                    .filter((s) => s.grade?.includes('초'))
                    .map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStudent(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0"
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                          {s.name[0]}
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-semibold text-gray-800">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.school} · {s.grade}</p>
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* 학년 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학년</label>
              <div className="flex gap-2 flex-wrap">
                {GRADE_LEVELS.map((g) => (
                  <button key={g} onClick={() => setFormGradeLevel(g)}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      formGradeLevel === g ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* 단원 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">단원</label>
              <div className="flex gap-2 flex-wrap">
                {UNITS.map((u) => (
                  <button key={u} onClick={() => setFormUnit(u)}
                    className={cx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      formUnit === u ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* 단원명 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">단원명 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input
                type="text"
                value={formUnitName}
                onChange={(e) => setFormUnitName(e.target.value)}
                placeholder="예: 분수의 덧셈과 뺄셈"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 레벨 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                시작 레벨 <span className="text-blue-600 font-bold">{formLevel}레벨</span>
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {LEVELS.map((l) => (
                  <button key={l} onClick={() => setFormLevel(l)}
                    className={cx('px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      formLevel === l ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200',
                      l >= 4 ? 'border-orange-200' : '')}>
                    {l}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">
                💡 3.5이하: 응용 · 4.0이상: 심화
              </p>
            </div>

            {/* 배정 버튼 */}
            <button
              onClick={handleAssign}
              disabled={!selectedStudent || assigning}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {assigning
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />배정 중...</>
                : <>📝 학습지 과제 배정하기</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  )
}