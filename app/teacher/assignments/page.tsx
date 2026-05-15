'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { SectionCard, Badge, StatusBadge } from '@/components/ui'
import { MOCK_ASSIGNMENT_SETS, getMockAssignmentSummaries } from '@/data/mockData'
import { formatDateTime, formatDueDate, cx } from '@/lib/utils'

export default function TeacherAssignmentsPage() {
  const router = useRouter()
  const summaries = getMockAssignmentSummaries()

  return (
    <div>
      <Header
        title="과제 관리"
        action={
          <button
            onClick={() => router.push('/teacher/assignments/new')}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg"
          >
            + 과제 등록
          </button>
        }
      />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '전체 과제', value: summaries.length, color: 'bg-gray-50 text-gray-700' },
            { label: '진행 중',  value: summaries.filter((s) => !formatDueDate(s.assignment_set.due_date).isOverdue).length, color: 'bg-blue-50 text-blue-600' },
            { label: '마감 완료', value: summaries.filter((s) => formatDueDate(s.assignment_set.due_date).isOverdue).length, color: 'bg-gray-50 text-gray-400' },
          ].map(({ label, value, color }) => (
            <div key={label} className={cx('rounded-2xl p-3 text-center', color)}>
              <p className="text-2xl font-black">{value}</p>
              <p className="text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 과제 목록 */}
        <SectionCard title="전체 과제 목록">
          <div className="space-y-3">
            {summaries.map(({ assignment_set, completion_rate, submitted_count, total_assigned }) => {
              const due = formatDueDate(assignment_set.due_date)
              return (
                <div
                  key={assignment_set.id}
                  onClick={() => router.push('/teacher/submissions')}
                  className="border border-gray-100 rounded-2xl p-4 cursor-pointer hover:border-blue-200 hover:shadow-sm transition-all active:scale-[0.99]"
                >
                  {/* 제목 + 마감 뱃지 */}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-sm font-bold text-gray-900 flex-1">{assignment_set.title}</p>
                    <Badge
                      variant={due.isOverdue ? 'gray' : due.isUrgent ? 'orange' : 'blue'}
                      size="sm"
                    >
                      {due.text}
                    </Badge>
                  </div>

                  {/* 마감일 */}
                  <p className="text-xs text-gray-400 mb-3">
                    📅 마감: {formatDateTime(assignment_set.due_date)}
                  </p>

                  {/* 완료율 */}
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-gray-500">제출 현황</span>
                    <span className="font-bold text-gray-700">
                      {submitted_count}/{total_assigned}명 ({completion_rate}%)
                    </span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={cx(
                        'h-full rounded-full transition-all',
                        completion_rate >= 80 ? 'bg-green-500' :
                        completion_rate >= 50 ? 'bg-blue-500' : 'bg-orange-400'
                      )}
                      style={{ width: `${completion_rate}%` }}
                    />
                  </div>

                  {/* 클릭 안내 */}
                  <p className="text-[10px] text-gray-300 mt-2 text-right">
                    탭하여 제출 현황 보기 →
                  </p>
                </div>
              )
            })}
          </div>
        </SectionCard>

      </div>
    </div>
  )
}