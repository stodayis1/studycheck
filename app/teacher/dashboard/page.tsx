'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Card, SectionCard, StatCard, StatusBadge, ProgressBar, Badge } from '@/components/ui'
import { getMockAssignmentSummaries, getMockSubmissionRows, MOCK_ASSIGNMENT_SETS, MOCK_STUDENTS } from '@/data/mockData'
import { formatDueDate, formatRelativeTime } from '@/lib/utils'

function cx(...classes: (string|boolean|undefined|null)[]) {
  return classes.filter(Boolean).join(' ')
}

export default function TeacherDashboard() {
  const router = useRouter()
  const summaries = getMockAssignmentSummaries()
  const todayRows = getMockSubmissionRows('aset-001')
  const totalStudents = MOCK_STUDENTS.filter((s) => s.class_group_id === 'class-001').length
  const notStartedCount = todayRows.filter((r) => !r.submission || r.submission.final_status === 'not_started').length
  const submittedCount = todayRows.filter((r) => ['submitted','checked','late'].includes(r.submission?.final_status ?? '')).length
  const avgRate = Math.round(summaries.reduce((acc,s) => acc+s.completion_rate,0) / summaries.length)

  return (
    <div>
      <Header title="대시보드" subtitle="2025 수학1 화목반"
        action={<button onClick={()=>router.push('/teacher/assignments/new')} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">+ 과제 등록</button>}
      />
      <div className="px-4 py-4 space-y-5 md:px-6">

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="총 학생 수" value={totalStudents} sub="화목반" accent="blue" icon="👥" />
          <StatCard label="이번 주 완료율" value={`${avgRate}%`} accent="green" icon="✅" />
          <StatCard label="미완료 학생" value={notStartedCount} accent="orange" icon="⏳" />
          <StatCard label="제출 완료" value={submittedCount} accent="gray" icon="📥" />
        </div>

        <SectionCard title="오늘 마감 과제" subtitle={MOCK_ASSIGNMENT_SETS[0].title}
          action={<Badge variant="orange" size="sm">{notStartedCount}명 미완료</Badge>}
        >
          <div className="space-y-3">
            {todayRows.map((row) => {
              const status = row.submission?.final_status ?? 'not_started'
              return (
                <div key={row.student.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                    {row.student.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{row.student.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {(['video','textbook','worksheet'] as const).map((type) => {
                        const statusKey = `${type}_status` as 'video_status'|'textbook_status'|'worksheet_status'
                        const s = row.submission?.[statusKey] ?? 'not_started'
                        const dot: Record<string,string> = { not_started:'bg-gray-200', in_progress:'bg-blue-400', submitted:'bg-green-400', checked:'bg-indigo-500', need_retry:'bg-orange-400', late:'bg-red-400' }
                        const label = { video:'영상', textbook:'교재', worksheet:'학습지' }[type]
                        return (
                          <span key={type} className="flex items-center gap-0.5">
                            <span className={cx('w-2 h-2 rounded-full', dot[s])} />
                            <span className="text-[9px] text-gray-400">{label}</span>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <StatusBadge status={status} size="sm" />
                    {row.submission?.submitted_at && <span className="text-[10px] text-gray-400">{formatRelativeTime(row.submission.submitted_at)}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard title="이번 주 과제 현황">
          <div className="space-y-4">
            {summaries.map(({assignment_set, completion_rate, submitted_count, total_assigned}) => {
              const due = formatDueDate(assignment_set.due_date)
              return (
                <div key={assignment_set.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{assignment_set.title}</p>
                      <p className={cx('text-xs mt-0.5', due.isOverdue?'text-red-400':due.isUrgent?'text-orange-500':'text-gray-400')}>{due.text}</p>
                    </div>
                    <span className="text-sm font-bold text-gray-700 ml-3">{submitted_count}/{total_assigned}명</span>
                  </div>
                  <ProgressBar value={completion_rate} showLabel size="sm" />
                </div>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard title="최근 제출" action={<button className="text-xs text-blue-600 font-medium" onClick={()=>router.push('/teacher/submissions')}>전체 보기</button>}>
          <div className="space-y-3">
            {[
              {name:'이지수', time:'3시간 전', status:'checked' as const, assignment:'지수법칙 과제'},
              {name:'박민준', time:'30분 전',  status:'in_progress' as const, assignment:'지수법칙 과제'},
            ].map((item,i) => (
              <div key={i} className="flex items-center gap-3 py-1">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">{item.name[0]}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-800">{item.name}<span className="text-gray-400 font-normal"> · {item.assignment}</span></p>
                  <p className="text-xs text-gray-400">{item.time}</p>
                </div>
                <StatusBadge status={item.status} size="sm" />
              </div>
            ))}
          </div>
        </SectionCard>

      </div>
    </div>
  )
}