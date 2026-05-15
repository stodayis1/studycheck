'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { SectionCard, StatusBadge } from '@/components/ui'
import { getMockStudentAssignments } from '@/data/mockData'
import { formatDueDate, cx } from '@/lib/utils'

const CURRENT_STUDENT_ID = 'student-001'

export default function StudentAssignmentsPage() {
  const router = useRouter()
  const assignments = getMockStudentAssignments(CURRENT_STUDENT_ID)
  return (
    <div>
      <Header title="전체 과제" subtitle={`총 ${assignments.length}개`} />
      <div className="px-4 py-4">
        <SectionCard title="과제 목록">
          <div className="space-y-1">
            {assignments.map((a) => {
              const due = formatDueDate(a.assignment_set.due_date)
              return (
                <div key={a.assignment_set.id} onClick={()=>router.push(`/student/assignments/${a.assignment_set.id}`)}
                  className="flex items-center gap-3 py-3 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl px-2 -mx-2 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{a.assignment_set.title}</p>
                    <p className={cx('text-xs mt-0.5', due.isOverdue?'text-red-400':due.isUrgent?'text-orange-400':'text-gray-400')}>{due.text}</p>
                  </div>
                  <StatusBadge status={a.submission?.final_status??'not_started'} size="sm" />
                  <span className="text-gray-300 text-sm">›</span>
                </div>
              )
            })}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}