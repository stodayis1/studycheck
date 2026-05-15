'use client'

import { Header } from '@/components/common/Header'
import { SectionCard, StatusBadge, Badge } from '@/components/ui'
import { getMockChildWeeklySummary } from '@/data/mockData'
import { formatDate, formatDueDate, cx } from '@/lib/utils'

const CURRENT_PARENT_ID = 'parent-user-001'

export default function ParentAssignmentsPage() {
  const summary = getMockChildWeeklySummary(CURRENT_PARENT_ID)
  if (!summary) return (
    <div className="p-8 text-center">
      <p className="text-gray-400">연결된 자녀가 없습니다</p>
    </div>
  )

  const { student, assignments } = summary

  const completed  = assignments.filter((a) => ['submitted','checked'].includes(a.submission?.final_status ?? ''))
  const incomplete = assignments.filter((a) => !a.submission || ['not_started','in_progress'].includes(a.submission.final_status))
  const late       = assignments.filter((a) => a.submission?.final_status === 'late')

  return (
    <div>
      <Header title="과제 목록" subtitle={`${student.name} 학생`} />
      <div className="px-4 py-4 space-y-4">

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '전체', value: assignments.length, color: 'bg-gray-50 text-gray-700' },
            { label: '완료', value: completed.length,  color: 'bg-green-50 text-green-600' },
            { label: '미완료', value: incomplete.length, color: incomplete.length > 0 ? 'bg-orange-50 text-orange-500' : 'bg-gray-50 text-gray-300' },
          ].map(({ label, value, color }) => (
            <div key={label} className={cx('rounded-2xl p-3 text-center', color)}>
              <p className="text-2xl font-black">{value}</p>
              <p className="text-xs mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 미완료 과제 */}
        {incomplete.length > 0 && (
          <SectionCard
            title="⚠️ 미완료 과제"
            action={<Badge variant="orange" size="sm">{incomplete.length}개</Badge>}
          >
            <div className="space-y-2">
              {incomplete.map((a) => {
                const due = formatDueDate(a.assignment_set.due_date)
                return (
                  <div key={a.assignment_set.id} className={cx(
                    'rounded-xl border p-3.5',
                    due.isOverdue ? 'border-red-100 bg-red-50' : 'border-orange-100 bg-orange-50'
                  )}>
                    <p className="text-sm font-semibold text-gray-800">{a.assignment_set.title}</p>
                    <p className={cx('text-xs mt-1 font-medium', due.isOverdue ? 'text-red-500' : 'text-orange-500')}>
                      {due.isOverdue ? '⚠️' : '📅'} 마감 {formatDate(a.assignment_set.due_date)} · {due.text}
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={a.submission?.final_status ?? 'not_started'} size="sm" />
                    </div>
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )}

        {/* 지각 제출 */}
        {late.length > 0 && (
          <SectionCard
            title="🚨 지각 제출"
            action={<Badge variant="red" size="sm">{late.length}개</Badge>}
          >
            <div className="space-y-2">
              {late.map((a) => (
                <div key={a.assignment_set.id} className="bg-red-50 border border-red-100 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{a.assignment_set.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">마감 {formatDate(a.assignment_set.due_date)}</p>
                  </div>
                  <StatusBadge status="late" size="sm" />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* 완료 과제 */}
        {completed.length > 0 && (
          <SectionCard
            title="✅ 완료한 과제"
            action={<Badge variant="green" size="sm">{completed.length}개</Badge>}
          >
            <div className="space-y-2">
              {completed.map((a) => (
                <div key={a.assignment_set.id} className="bg-green-50 border border-green-100 rounded-xl p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{a.assignment_set.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">마감 {formatDate(a.assignment_set.due_date)}</p>
                  </div>
                  <StatusBadge status={a.submission?.final_status ?? 'submitted'} size="sm" />
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {/* 읽기 전용 안내 */}
        <p className="text-center text-xs text-gray-300 pb-2">학부모 화면은 읽기 전용입니다 🔒</p>
      </div>
    </div>
  )
}