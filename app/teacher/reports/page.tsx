'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

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

export default function TeacherReportsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('초등')
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null)
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: studentData }, { data: worksheetData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('student_worksheets').select('*').order('assigned_at', { ascending: true }),
    ])
    if (studentData) setStudents(studentData)
    if (worksheetData) setWorksheets(worksheetData)
    setLoading(false)
  }

  const currentGrades = GRADE_GROUPS.find((g) => g.label === selectedGroup)?.grades ?? []
  const teachers = [...new Set(students.map((s) => s.teacher_name).filter(Boolean))].sort()

  const myStudents = students.filter((s) =>
    isAdmin() ? true : s.teacher_name === currentUser?.name
  )

  const filteredStudents = myStudents.filter((s) => {
    const gradeMatch = currentGrades.some((g) =>
      selectedGroup === '초등' ? s.grade?.includes('초') && s.grade?.includes(g.replace('초','')) :
      selectedGroup === '중등' ? s.grade?.includes('중') :
      s.grade?.includes('고')
    )
    const gradeFilterMatch = selectedGrade ? s.grade === selectedGrade : true
    const teacherMatch = selectedTeacher ? s.teacher_name === selectedTeacher : true
    const searchMatch = s.name.includes(searchText) || s.school?.includes(searchText)
    return gradeMatch && gradeFilterMatch && teacherMatch && searchMatch
  })

  // ── 초등용: 단원 × 레벨 테이블 ──
  function getStudentUnits(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    const units = [...new Set(studentWS.map((w) => `${w.grade_level}__${w.unit}__${w.unit_name ?? ''}`))]
    return units.map((u) => {
      const [grade_level, unit, unit_name] = u.split('__')
      return { grade_level, unit, unit_name }
    })
  }

  function getRecord(studentId: string, gradeLevel: string, unit: string, level: number) {
    const records = worksheets.filter((w) =>
      w.student_id === studentId && w.grade_level === gradeLevel &&
      w.unit === unit && w.current_level === level
    )
    return records.length > 0 ? records[records.length - 1] : null
  }

  function getUsedLevels(studentId: string) {
    const levels = [...new Set(worksheets.filter((w) => w.student_id === studentId).map((w) => w.current_level))].sort((a, b) => a - b)
    return levels.length > 0 ? levels : [1.0, 1.5, 2.0, 2.5, 3.0]
  }

  function getCellStyle(record: WorksheetRecord | null) {
    if (!record) return { bg: 'bg-gray-50', text: '-', textColor: 'text-gray-300' }
    if (record.status === 'assigned') return { bg: 'bg-white border border-blue-200', text: '진행중', textColor: 'text-blue-600' }
    if (record.status === 'similar_assigned' || record.status === 'similar_submitted') return { bg: 'bg-purple-50 border border-purple-200', text: '오답유사', textColor: 'text-purple-600' }
    if (record.status === 'submitted') return { bg: 'bg-orange-50 border border-orange-200', text: '채점대기', textColor: 'text-orange-500' }
    if (record.score != null) {
      if (record.score >= 85) return { bg: 'bg-green-100', text: `${record.score}점`, textColor: 'text-green-700' }
      if (record.score >= 80) return { bg: 'bg-yellow-100', text: `${record.score}점`, textColor: 'text-yellow-700' }
      return { bg: 'bg-red-100', text: `${record.score}점`, textColor: 'text-red-600' }
    }
    return { bg: 'bg-gray-50', text: '-', textColor: 'text-gray-300' }
  }

  // ── 중등용: 단원/차시별 1차/오답유사 점수 ──
  function getMiddleUnitGroups(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    // unit 기준으로 그룹핑
    const unitMap: Record<string, WorksheetRecord[]> = {}
    studentWS.forEach((w) => {
      const key = `${w.unit}__${w.unit_name ?? ''}`
      if (!unitMap[key]) unitMap[key] = []
      unitMap[key].push(w)
    })
    return Object.entries(unitMap).map(([key, records]) => {
      const [unit, unit_name] = key.split('__')
      // 1차: main, 오답유사: similar
      const mainRecords = records.filter((r) => r.worksheet_type === 'main').sort(
        (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      )
      const similarRecords = records.filter((r) => r.worksheet_type === 'similar').sort(
        (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      )
      return { unit, unit_name, mainRecords, similarRecords, allRecords: records }
    })
  }

  function scoreColor(score: number | null) {
    if (score == null) return 'text-gray-400'
    if (score >= 85) return 'text-green-600'
    if (score >= 80) return 'text-yellow-600'
    return 'text-red-500'
  }

  function scoreBg(score: number | null) {
    if (score == null) return 'bg-gray-50'
    if (score >= 85) return 'bg-green-50'
    if (score >= 80) return 'bg-yellow-50'
    return 'bg-red-50'
  }

  const isMiddleOrHigh = selectedStudent
    ? selectedStudent.grade.includes('중') || selectedStudent.grade.includes('고')
    : false

  const studentUnits = selectedStudent && !isMiddleOrHigh ? getStudentUnits(selectedStudent.id) : []
  const middleUnitGroups = selectedStudent && isMiddleOrHigh ? getMiddleUnitGroups(selectedStudent.id) : []

  return (
    <div>
      <Header title="보고서" subtitle="학생별 학습 현황" />
      <div className="px-4 py-4 space-y-4 md:px-6">

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
                      selectedGroup === g.label ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
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
                    selectedTeacher === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200')}>
                  👩‍🏫 전체
                </button>
                {teachers.map((t) => (
                  <button key={t} onClick={() => setSelectedTeacher(t)}
                    className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                      selectedTeacher === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름 또는 학교로 검색"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">해당하는 학생이 없어요</p>
              ) : (
                filteredStudents.map((s) => {
                  const hasRecord = worksheets.some((w) => w.student_id === s.id)
                  return (
                    <button key={s.id} onClick={() => setSelectedStudent(s)}
                      className={cx('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                        selectedStudent?.id === s.id ? 'bg-blue-600 text-white border-blue-600' :
                        hasRecord ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-300' :
                        'bg-gray-50 text-gray-400 border-gray-100')}>
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

            {/* ── 중등/고등 보고서 ── */}
            {isMiddleOrHigh ? (
              middleUnitGroups.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">아직 학습지 기록이 없어요</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {middleUnitGroups.map(({ unit, unit_name, mainRecords, similarRecords }, idx) => {
                    const latest = mainRecords[mainRecords.length - 1]
                    const first = mainRecords[0]
                    const latestSimilar = similarRecords[similarRecords.length - 1]
                    const isDone = latest?.status === 'passed' || latest?.status === 'scored'
                    return (
                      <div key={idx} className="px-4 py-3">
                        {/* 단원/차시 헤더 */}
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">
                              {unit}
                              {unit_name && <span className="text-gray-500 font-normal ml-1">· {unit_name}</span>}
                            </p>
                            {latest?.memo && (
                              <p className="text-[10px] text-blue-500 mt-0.5">{latest.memo}</p>
                            )}
                          </div>
                          <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                            isDone ? 'bg-green-100 text-green-600' :
                            latest?.status === 'assigned' ? 'bg-blue-100 text-blue-600' :
                            latest?.status === 'submitted' ? 'bg-orange-100 text-orange-500' :
                            'bg-gray-100 text-gray-400')}>
                            {isDone ? '완료' : latest?.status === 'assigned' ? '진행중' : latest?.status === 'submitted' ? '채점대기' : '-'}
                          </span>
                        </div>

                        {/* 레벨 + 점수 */}
                        <div className="flex flex-wrap gap-2">
                          {/* 1차 시험 */}
                          {mainRecords.map((r, i) => (
                            <div key={r.id} className={cx('px-3 py-2 rounded-xl text-center min-w-[72px]', scoreBg(r.score))}>
                              <p className="text-[10px] text-gray-400 mb-0.5">
                                {i === 0 ? '1차' : `${i+1}차`} · {r.current_level}레벨
                              </p>
                              {r.score != null ? (
                                <p className={cx('text-sm font-black', scoreColor(r.score))}>{r.score}점</p>
                              ) : (
                                <p className={cx('text-xs font-bold',
                                  r.status === 'assigned' ? 'text-blue-500' :
                                  r.status === 'submitted' ? 'text-orange-500' : 'text-gray-400')}>
                                  {r.status === 'assigned' ? '과제중' : r.status === 'submitted' ? '채점대기' : '-'}
                                </p>
                              )}
                            </div>
                          ))}

                          {/* 오답유사 */}
                          {similarRecords.map((r, i) => (
                            <div key={r.id} className={cx('px-3 py-2 rounded-xl text-center min-w-[72px] border',
                              scoreBg(r.score), 'border-purple-200')}>
                              <p className="text-[10px] text-purple-400 mb-0.5">오답유사 · {r.current_level}레벨</p>
                              {r.score != null ? (
                                <p className={cx('text-sm font-black', scoreColor(r.score))}>{r.score}점</p>
                              ) : (
                                <p className={cx('text-xs font-bold',
                                  r.status === 'similar_assigned' ? 'text-purple-500' : 'text-orange-500')}>
                                  {r.status === 'similar_assigned' ? '과제중' : '채점대기'}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
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
                            <tr className="bg-gray-50">
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
                              <tr key={idx} className="hover:bg-gray-50/50">
                                <td className="px-3 py-2.5 border-b border-r border-gray-100">
                                  <p className="font-bold text-gray-800">{unit}</p>
                                  <p className="text-gray-400 text-[10px]">{grade_level}</p>
                                </td>
                                <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{unit_name || '-'}</td>
                                {usedLevels.map((level) => {
                                  const record = getRecord(selectedStudent.id, grade_level, unit, level)
                                  const cell = getCellStyle(record)
                                  return (
                                    <td key={level} className={cx('px-2 py-2.5 border-b border-r border-gray-100 text-center', cell.bg)}>
                                      <span className={cx('font-bold', cell.textColor)}>{cell.text}</span>
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
                      { bg: 'bg-white border border-blue-200', text: 'text-blue-600', label: '진행중' },
                      { bg: 'bg-purple-50 border border-purple-200', text: 'text-purple-600', label: '오답유사' },
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
      </div>
    </div>
  )
}
