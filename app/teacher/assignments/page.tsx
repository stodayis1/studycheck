'use client'

import { useState, useEffect } from 'react'
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
  worksheet_type: string
  score: number | null
  parent_worksheet_id: string | null
  assigned_at: string
  submitted_at: string | null
}

const LEVELS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]
const GRADE_LEVELS = ['초1', '초2', '초3', '초4', '초5', '초6']
const UNITS = ['1단원', '2단원', '3단원', '4단원', '5단원', '6단원', '7단원', '8단원']

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:        { label: '과제중',       color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  submitted:       { label: '점수입력대기', color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
  similar_assigned:{ label: '오답유사중',   color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  similar_submitted:{ label: '오답유사채점', color: 'text-pink-500',  bg: 'bg-pink-50 border-pink-200' },
  passed:          { label: '레벨업✓',      color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  retry:           { label: '재도전',        color: 'text-red-500',    bg: 'bg-red-50 border-red-200' },
}

export default function TeacherAssignmentsPage() {
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')

  // 과제 배정 모달
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [formGradeLevel, setFormGradeLevel] = useState('초4')
  const [formUnit, setFormUnit] = useState('1단원')
  const [formUnitName, setFormUnitName] = useState('')
  const [formLevel, setFormLevel] = useState(2.5)
  const [assigning, setAssigning] = useState(false)

  // 점수 입력 모달
  const [showScoreModal, setShowScoreModal] = useState(false)
  const [scoreWorksheet, setScoreWorksheet] = useState<StudentWorksheet | null>(null)
  const [inputScore, setInputScore] = useState('')
  const [savingScore, setSavingScore] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const { data: studentData } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('name')

    const { data: worksheetData } = await supabase
      .from('student_worksheets')
      .select('*')
      .order('assigned_at', { ascending: false })

    if (studentData) setStudents(studentData)
    if (worksheetData) setWorksheets(worksheetData)
    setLoading(false)
  }

  function getStudentName(studentId: string) {
    return students.find((s) => s.id === studentId)?.name ?? '알 수 없음'
  }

  // 진행중인 과제만 (passed 제외)
  const activeWorksheets = worksheets.filter((w) =>
    !['passed'].includes(w.status) &&
    (getStudentName(w.student_id).includes(searchText) || w.unit.includes(searchText))
  )

  // 전체 이력
  const historyWorksheets = worksheets.filter((w) =>
    getStudentName(w.student_id).includes(searchText) || w.unit.includes(searchText)
  )

  // ── 과제 배정 ──────────────────────────────────────
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
        worksheet_type: 'main',
      })
    if (!error) {
      setShowAssignModal(false)
      setSelectedStudent(null)
      setFormUnitName('')
      fetchData()
    } else {
      alert('배정 중 오류가 발생했습니다.')
    }
    setAssigning(false)
  }

  // ── 제출 확인 ──────────────────────────────────────
  async function handleSubmitted(worksheetId: string, currentStatus: string) {
    const nextStatus = currentStatus === 'similar_assigned' ? 'similar_submitted' : 'submitted'
    await supabase
      .from('student_worksheets')
      .update({ status: nextStatus, submitted_at: new Date().toISOString() })
      .eq('id', worksheetId)
    fetchData()
  }

  // ── 점수 입력 저장 ──────────────────────────────────
  async function handleSaveScore() {
    if (!scoreWorksheet) return
    const score = parseInt(inputScore)
    if (isNaN(score) || score < 0 || score > 100) {
      alert('0~100 사이의 점수를 입력해주세요.')
      return
    }
    setSavingScore(true)

    // 점수 저장
    await supabase
      .from('student_worksheets')
      .update({ score })
      .eq('id', scoreWorksheet.id)

    // 점수에 따른 다음 단계 결정
    if (scoreWorksheet.status === 'submitted') {
      // 일반 학습지 채점
      if (score < 80) {
        // 80점 미만 → 오답유사 학습지 배정
        await supabase
          .from('student_worksheets')
          .update({ status: 'retry' })
          .eq('id', scoreWorksheet.id)

        await supabase
          .from('student_worksheets')
          .insert({
            student_id:          scoreWorksheet.student_id,
            subject:             '수학',
            grade_level:         scoreWorksheet.grade_level,
            unit:                scoreWorksheet.unit,
            unit_name:           scoreWorksheet.unit_name,
            current_level:       scoreWorksheet.current_level,
            status:              'similar_assigned',
            worksheet_type:      'similar',
            parent_worksheet_id: scoreWorksheet.id,
          })
      } else {
        // 80점 이상 → 레벨업/재도전 선택 대기
        await supabase
          .from('student_worksheets')
          .update({ status: 'scored' })
          .eq('id', scoreWorksheet.id)
      }
    } else if (scoreWorksheet.status === 'similar_submitted') {
      // 오답유사 학습지 채점 완료 → 레벨업/재도전 선택 대기
      await supabase
        .from('student_worksheets')
        .update({ status: 'scored' })
        .eq('id', scoreWorksheet.id)
    }

    setSavingScore(false)
    setShowScoreModal(false)
    setInputScore('')
    fetchData()
  }

  // ── 레벨업 ──────────────────────────────────────────
  async function handleLevelUp(worksheet: StudentWorksheet) {
    const nextLevel = Math.min(6.0, worksheet.current_level + 0.5)
    await supabase
      .from('student_worksheets')
      .update({ status: 'passed' })
      .eq('id', worksheet.id)
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
        worksheet_type: 'main',
      })
    fetchData()
  }

  // ── 재도전 ──────────────────────────────────────────
  async function handleRetry(worksheet: StudentWorksheet) {
    await supabase
      .from('student_worksheets')
      .update({ status: 'passed' })
      .eq('id', worksheet.id)
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
        worksheet_type: 'main',
      })
    fetchData()
  }

  const displayWorksheets = tab === 'active' ? activeWorksheets : historyWorksheets

  return (
    <div>
      <Header
        title="과제 관리"
        action={
          <button onClick={() => setShowAssignModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
            + 과제 배정
          </button>
        }
      />

      {/* 탭 */}
      <div className="flex gap-2 px-4 pt-4">
        {[
          { key: 'active',  label: '📝 진행중' },
          { key: 'history', label: '📋 전체이력' },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
            className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
              tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-4 space-y-3 md:px-6">
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름 또는 단원으로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

        {loading ? (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : displayWorksheets.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-4xl mb-3">📝</p>
            <p className="text-sm font-semibold text-gray-600">
              {tab === 'active' ? '진행중인 과제가 없어요' : '과제 이력이 없어요'}
            </p>
          </div>
        ) : (
          displayWorksheets.map((w) => {
            const statusCfg = STATUS_CONFIG[w.status] ?? STATUS_CONFIG.assigned
            const studentName = getStudentName(w.student_id)
            const isSimilar = w.worksheet_type === 'similar'

            return (
              <div key={w.id} className={cx('bg-white rounded-2xl border-2 shadow-sm overflow-hidden', statusCfg.bg)}>
                <div className="px-4 py-3.5">
                  <div className="flex items-start justify-between gap-2">
                    {/* 학생 정보 */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                        {studentName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{studentName}</p>
                          <span className={cx('text-[10px] font-bold px-2 py-0.5 rounded-full border', statusCfg.color, statusCfg.bg)}>
                            {statusCfg.label}
                          </span>
                          {isSimilar && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
                              오답유사
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {w.grade_level} · {w.unit}
                          {w.unit_name ? ` (${w.unit_name})` : ''} ·{' '}
                          <span className="font-bold text-blue-600">{w.current_level}레벨</span>
                          {w.score != null && (
                            <span className={cx('ml-2 font-bold', w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-orange-500' : 'text-red-500')}>
                              {w.score}점
                            </span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
                      {/* 제출확인 */}
                      {(w.status === 'assigned' || w.status === 'similar_assigned') && (
                        <button onClick={() => handleSubmitted(w.id, w.status)}
                          className="px-2.5 py-1.5 text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100">
                          제출확인
                        </button>
                      )}

                      {/* 점수 입력 */}
                      {(w.status === 'submitted' || w.status === 'similar_submitted') && (
                        <button onClick={() => { setScoreWorksheet(w); setShowScoreModal(true) }}
                          className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100">
                          점수입력
                        </button>
                      )}

                      {/* 레벨업 / 재도전 */}
                      {w.status === 'scored' && (
                        <>
                          <button onClick={() => handleLevelUp(w)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100">
                            레벨업 ↑
                          </button>
                          <button onClick={() => handleRetry(w)}
                            className="px-2.5 py-1.5 text-xs font-semibold text-red-500 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100">
                            재도전
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })
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
                      <button key={s.id} onClick={() => setSelectedStudent(s)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0">
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
              <input type="text" value={formUnitName} onChange={(e) => setFormUnitName(e.target.value)}
                placeholder="예: 분수의 덧셈과 뺄셈"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
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
              <p className="text-[10px] text-gray-400 mt-1.5">💡 3.5이하: 응용 · 4.0이상: 심화</p>
            </div>

            <button onClick={handleAssign} disabled={!selectedStudent || assigning}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {assigning
                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />배정 중...</>
                : <>📝 학습지 과제 배정하기</>}
            </button>
          </div>
        </div>
      )}

      {/* 점수 입력 모달 */}
      {showScoreModal && scoreWorksheet && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowScoreModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">점수 입력</h3>
              <button onClick={() => setShowScoreModal(false)} className="text-gray-400">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-sm font-bold text-gray-800">{getStudentName(scoreWorksheet.student_id)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {scoreWorksheet.grade_level} · {scoreWorksheet.unit} · {scoreWorksheet.current_level}레벨
                {scoreWorksheet.worksheet_type === 'similar' && ' · 오답유사'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">점수 입력 (0~100)</label>
              <input
                type="number" min="0" max="100"
                value={inputScore}
                onChange={(e) => setInputScore(e.target.value)}
                placeholder="점수를 입력하세요"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 text-2xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
            </div>

            {/* 점수 미리보기 */}
            {inputScore && (
              <div className={cx('rounded-xl p-3 text-center text-sm font-bold',
                parseInt(inputScore) >= 85 ? 'bg-green-50 text-green-600' :
                parseInt(inputScore) >= 80 ? 'bg-orange-50 text-orange-500' :
                'bg-red-50 text-red-500')}>
                {parseInt(inputScore) >= 85 ? '✓ 85점 이상 → 레벨업/재도전 선택' :
                 parseInt(inputScore) >= 80 ? '△ 80점 이상 → 레벨업/재도전 선택' :
                 '✕ 80점 미만 → 오답유사 학습지 자동 배정'}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setShowScoreModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
              <button onClick={handleSaveScore} disabled={!inputScore || savingScore}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                {savingScore
                  ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장중...</>
                  : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}