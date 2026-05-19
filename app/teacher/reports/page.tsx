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
    const { data: studentData } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('name')

    const { data: worksheetData } = await supabase
      .from('student_worksheets')
      .select('*')
      .order('assigned_at', { ascending: true })

    if (studentData) setStudents(studentData)
    if (worksheetData) setWorksheets(worksheetData)
    setLoading(false)
  }

  // 현재 그룹의 학년 목록
  const currentGrades = GRADE_GROUPS.find((g) => g.label === selectedGroup)?.grades ?? []

  // 선생님 목록 (중복 제거)
  const teachers = [...new Set(students.map((s) => s.teacher_name).filter(Boolean))].sort()

  // 담당 학생 필터
  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    return s.teacher_name === currentUser?.name
  })

  // 필터링된 학생 목록
  const filteredStudents = myStudents.filter((s) => {
    const gradeMatch = currentGrades.some((g) => s.grade?.includes(g.replace('초','').replace('중','').replace('고','')) &&
      (selectedGroup === '초등' ? s.grade?.includes('초') :
       selectedGroup === '중등' ? s.grade?.includes('중') :
       s.grade?.includes('고'))
    )
    const gradeFilterMatch = selectedGrade ? s.grade?.includes(selectedGrade) : true
    const teacherMatch = selectedTeacher ? s.teacher_name === selectedTeacher : true
    const searchMatch = s.name.includes(searchText) || s.school?.includes(searchText)
    return gradeMatch && gradeFilterMatch && teacherMatch && searchMatch
  })

  // 특정 학생의 단원 목록
  function getStudentUnits(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    const units = [...new Set(studentWS.map((w) => `${w.grade_level}__${w.unit}__${w.unit_name ?? ''}`))]
    return units.map((u) => {
      const [grade_level, unit, unit_name] = u.split('__')
      return { grade_level, unit, unit_name }
    })
  }

  // 특정 학생 + 단원 + 레벨의 최신 기록
  function getRecord(studentId: string, gradeLevel: string, unit: string, level: number) {
    const records = worksheets.filter(
      (w) => w.student_id === studentId &&
             w.grade_level === gradeLevel &&
             w.unit === unit &&
             w.current_level === level
    )
    if (records.length === 0) return null
    return records[records.length - 1]
  }

  // 셀 스타일
  function getCellStyle(record: WorksheetRecord | null) {
    if (!record) return { bg: 'bg-gray-50', text: '-', textColor: 'text-gray-300' }
    if (record.status === 'assigned') return { bg: 'bg-white border border-blue-200', text: '진행중', textColor: 'text-blue-600' }
    if (record.status === 'similar_assigned' || record.status === 'similar_submitted') return { bg: 'bg-white border border-purple-200', text: '오답유사', textColor: 'text-purple-600' }
    if (record.status === 'submitted') return { bg: 'bg-white border border-orange-200', text: '채점대기', textColor: 'text-orange-500' }
    if (record.score != null) {
      if (record.score >= 85) return { bg: 'bg-green-100', text: `${record.score}점`, textColor: 'text-green-700' }
      if (record.score >= 80) return { bg: 'bg-yellow-100', text: `${record.score}점`, textColor: 'text-yellow-700' }
      return { bg: 'bg-red-100', text: `${record.score}점`, textColor: 'text-red-600' }
    }
    return { bg: 'bg-gray-50', text: '-', textColor: 'text-gray-300' }
  }

  function getUsedLevels(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    const levels = [...new Set(studentWS.map((w) => w.current_level))].sort((a, b) => a - b)
    return levels.length > 0 ? levels : [1.0, 1.5, 2.0, 2.5, 3.0]
  }

  const studentUnits = selectedStudent ? getStudentUnits(selectedStudent.id) : []

  return (
    <div>
      <Header title="진단표" subtitle="학생별 단원/레벨 학습 현황" />

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
                  g.grades.some((grade) =>
                    s.grade?.includes(grade.replace('초','').replace('중','').replace('고','')) &&
                    (g.label === '초등' ? s.grade?.includes('초') :
                     g.label === '중등' ? s.grade?.includes('중') :
                     s.grade?.includes('고'))
                  )
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
              <button
                onClick={() => setSelectedGrade(null)}
                className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                  selectedGrade === null ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200')}>
                전체
              </button>
              {currentGrades.map((g) => {
                const count = myStudents.filter((s) => s.grade?.includes(g)).length
                return (
                  <button key={g}
                    onClick={() => setSelectedGrade(g)}
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
                <button
                  onClick={() => setSelectedTeacher(null)}
                  className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                    selectedTeacher === null ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200')}>
                  👩‍🏫 전체
                </button>
                {teachers.map((t) => (
                  <button key={t}
                    onClick={() => setSelectedTeacher(t)}
                    className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                      selectedTeacher === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            {/* 검색 */}
            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름 또는 학교로 검색"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

            {/* 학생 버튼 목록 */}
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

        {/* 진단표 */}
        {selectedStudent ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
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
            </div>

            {studentUnits.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-3xl mb-2">📋</p>
                <p className="text-sm text-gray-400">아직 과제 기록이 없어요</p>
              </div>
            ) : (
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
            )}

            {/* 범례 */}
            <div className="px-4 py-3 border-t border-gray-50 flex flex-wrap gap-3">
              <p className="text-[10px] font-bold text-gray-400 mr-1">범례:</p>
              {[
                { bg: 'bg-green-100', text: 'text-green-700', label: '85점↑ 통과' },
                { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '80~84점 통과' },
                { bg: 'bg-red-100', text: 'text-red-600', label: '80점↓ 재도전' },
                { bg: 'bg-white border border-blue-200', text: 'text-blue-600', label: '진행중' },
                { bg: 'bg-white border border-purple-200', text: 'text-purple-600', label: '오답유사' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1">
                  <div className={cx('w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold', item.bg, item.text)}>
                    {item.label.includes('진행') ? '중' : item.label.includes('유사') ? '유' : '점'}
                  </div>
                  <span className="text-[10px] text-gray-500">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm font-semibold text-gray-600">학생을 선택하면 진단표가 나와요</p>
          </div>
        )}
      </div>
    </div>
  )
}