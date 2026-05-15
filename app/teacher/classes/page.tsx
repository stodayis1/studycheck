'use client'

import { useState } from 'react'
import { Header } from '@/components/common/Header'
import { Card, SectionCard, Badge } from '@/components/ui'
import { MOCK_CLASSES, MOCK_STUDENTS } from '@/data/mockData'
import { cx } from '@/lib/utils'

export default function TeacherClassesPage() {
  const [selectedClassId, setSelectedClassId] = useState(MOCK_CLASSES[0].id)
  const selectedClass = MOCK_CLASSES.find((c) => c.id === selectedClassId)!
  const students = MOCK_STUDENTS.filter((s) => s.class_group_id === selectedClassId)

  return (
    <div>
      <Header
        title="반 관리"
        action={
          <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
            + 반 생성
          </button>
        }
      />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 반 탭 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {MOCK_CLASSES.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setSelectedClassId(cls.id)}
              className={cx(
                'shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border transition-all',
                selectedClassId === cls.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
              )}
            >
              {cls.name}
            </button>
          ))}
        </div>

        {/* 반 정보 */}
        <Card>
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">{selectedClass.name}</h2>
              <p className="text-sm text-gray-400 mt-1">{selectedClass.description}</p>
            </div>
            <Badge variant="blue">{students.length}명</Badge>
          </div>
        </Card>

        {/* 학생 목록 */}
        <SectionCard title="학생 목록" subtitle={`총 ${students.length}명`}>
          {students.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">등록된 학생이 없어요</p>
          ) : (
            <div className="space-y-3">
              {students.map((student) => (
                <div key={student.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {student.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{student.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{student.school} · 고{student.grade}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant={student.parent_user_id ? 'green' : 'gray'} size="sm">
                      {student.parent_user_id ? '학부모 연결됨' : '학부모 미연결'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

      </div>
    </div>
  )
}