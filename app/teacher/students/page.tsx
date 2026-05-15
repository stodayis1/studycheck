'use client'

import { useState } from 'react'
import { Header } from '@/components/common/Header'
import { SectionCard, Badge, StatusBadge } from '@/components/ui'
import { MOCK_STUDENTS, MOCK_CLASSES, getMockStudentAssignments } from '@/data/mockData'
import { cx } from '@/lib/utils'

export default function TeacherStudentsPage() {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')

  const filtered = MOCK_STUDENTS.filter((s) =>
    s.name.includes(searchText) || s.school?.includes(searchText)
  )

  const selectedStudent = MOCK_STUDENTS.find((s) => s.id === selectedStudentId)
  const studentAssignments = selectedStudentId
    ? getMockStudentAssignments(selectedStudentId)
    : []

  return (
    <div>
      <Header
        title="학생 관리"
        action={
          <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
            + 학생 등록
          </button>
        }
      />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 검색 */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름 또는 학교로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* 학생 목록 */}
        <SectionCard title="전체 학생" subtitle={`총 ${filtered.length}명`}>
          <div className="space-y-2">
            {filtered.map((student) => {
              const cls = MOCK_CLASSES.find((c) => c.id === student.class_group_id)
              const isSelected = selectedStudentId === student.id
              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudentId(isSelected ? null : student.id)}
                  className={cx(
                    'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2',
                    isSelected
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-transparent hover:bg-gray-50',
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {student.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{student.name}</p>
                      <Badge variant="gray" size="sm">고{student.grade}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {student.school} · {cls?.name ?? '반 미배정'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant={student.parent_user_id ? 'green' : 'gray'}
                      size="sm"
                    >
                      {student.parent_user_id ? '학부모 ✓' : '학부모 미연결'}
                    </Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* 선택된 학생 상세 */}
        {selectedStudent && (
          <SectionCard title={`${selectedStudent.name} 학생 과제 현황`}>
            <div className="space-y-2">
              {studentAssignments.map((a) => (
                <div key={a.assignment_set.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{a.assignment_set.title}</p>
                  </div>
                  <StatusBadge status={a.submission?.final_status ?? 'not_started'} size="sm" />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  )
}