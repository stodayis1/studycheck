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

const LEVELS = [1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0, 5.5, 6.0]

export default function TeacherReportsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [searchText, setSearchText] = useState('')

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
    // 가장 최신 기록 반환
    return records[records.length - 1]
  }

  // 셀 스타일 결정
  function getCellStyle(record: WorksheetRecord | null) {
    if (!record) return { bg: 'bg-gray-50', text: '-', textColor: 'text-gray-300' }

    if (record.status === 'assigned') {
      return { bg: 'bg-white border border-blue-200', text: '진행중', textColor: 'text-blue-600' }
    }
    if (record.status === 'similar_assigned' || record.status === 'similar_submitted') {
      return { bg: 'bg-white border border-purple-200', text: '오답유사', textColor: 'text-purple-600' }
    }
    if (record.status === 'submitted') {
      return { bg: 'bg-white border border-orange-200', text: '채점대기', textColor: 'text-orange-500' }
    }
    if (record.score != null) {
      if (record.score >= 85) {
        return { bg: 'bg-green-100', text: `${record.score}점`, textColor: 'text-green-700' }
      } else if (record.score >= 80) {
        return { bg: 'bg-yellow-100', text: `${record.score}점`, textColor: 'text-yellow-700' }
      } else {
        return { bg: 'bg-red-100', text: `${record.score}점`, textColor: 'text-red-600' }
      }
    }
    return { bg: 'bg-gray-50', text: '-', textColor: 'text-gray-300' }
  }

  const filteredStudents = students.filter((s) =>
    s.name.includes(searchText) || s.school?.includes(searchText)
  )

  const studentUnits = selectedStudent ? getStudentUnits(selectedStudent.id) : []

  // 사용된 레벨만 표시 (해당 학생 기록 기반)
  function getUsedLevels(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    const levels = [...new Set(studentWS.map((w) => w.current_level))].sort((a, b) => a - b)
    return levels.length > 0 ? levels : LEVELS.slice(0, 6)
  }

  return (
    <div>
      <Header title="진단표" subtitle="학생별 단원/레벨 학습 현황" />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 검색 + 학생 선택 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">학생 선택</h3>
          </div>
          <div className="p-3">
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름 또는 학교로 검색"
              className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3"
            />
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {filteredStudents.map((s) => {
                const hasRecord = worksheets.some((w) => w.student_id === s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStudent(s)}
                    className={cx(
                      'px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                      selectedStudent?.id === s.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : hasRecord
                        ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
                        : 'bg-gray-50 text-gray-400 border-gray-100',
                    )}
                  >
                    {s.name}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* 진단표 */}
        {selectedStudent && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                {selectedStudent.name[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-gray-900">{selectedStudent.name}</p>
                <p className="text-xs text-gray-400">{selectedStudent.school} · {selectedStudent.grade}</p>
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
                      {/* 테이블 헤더 */}
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[80px]">단원</th>
                          <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[120px]">단원명</th>
                          {usedLevels.map((l) => (
                            <th key={l} className={cx(
                              'px-3 py-2.5 text-center font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[70px]',
                              l >= 4 ? 'text-orange-500' : 'text-gray-500'
                            )}>
                              {l}레벨
                              {l >= 4 && <span className="block text-[9px] text-orange-400">심화</span>}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {studentUnits.map(({ grade_level, unit, unit_name }, idx) => (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            {/* 단원 */}
                            <td className="px-3 py-2.5 border-b border-r border-gray-100">
                              <p className="font-bold text-gray-800">{unit}</p>
                              <p className="text-gray-400 text-[10px]">{grade_level}</p>
                            </td>
                            {/* 단원명 */}
                            <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">
                              {unit_name || '-'}
                            </td>
                            {/* 레벨별 점수 */}
                            {usedLevels.map((level) => {
                              const record = getRecord(selectedStudent.id, grade_level, unit, level)
                              const cell = getCellStyle(record)
                              return (
                                <td key={level} className={cx('px-2 py-2.5 border-b border-r border-gray-100 text-center', cell.bg)}>
                                  <span className={cx('font-bold', cell.textColor)}>
                                    {cell.text}
                                  </span>
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
        )}

        {!selectedStudent && !loading && (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm font-semibold text-gray-600">학생을 선택하면 진단표가 나와요</p>
          </div>
        )}

      </div>
    </div>
  )
}