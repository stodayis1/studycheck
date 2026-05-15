'use client'

import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Card, SectionCard, StatusBadge, StatCard, Badge, EmptyState } from '@/components/ui'
import { getMockStudentAssignments } from '@/data/mockData'
import { formatDueDate, formatDate, cx } from '@/lib/utils'
import type { StudentAssignmentItem } from '@/types'

const CURRENT_STUDENT_ID = 'student-001'
const CURRENT_STUDENT_NAME = '이지수'

export default function StudentDashboard() {
  const router = useRouter()
  const assignments = getMockStudentAssignments(CURRENT_STUDENT_ID)

  const today = assignments.filter((a) => {
    const due = new Date(a.assignment_set.due_date)
    const now = new Date()
    const diffDay = Math.floor((due.getTime()-now.getTime())/86400000)
    return diffDay <= 1 && diffDay >= -1
  })
  const incomplete = assignments.filter((a) => !a.submission || a.submission.final_status==='not_started'||a.submission.final_status==='in_progress')
  const completed = assignments.filter((a) => ['submitted','checked','late'].includes(a.submission?.final_status??''))
  const hasFeedback = assignments.filter((a) => a.submission?.teacher_feedback)
  const completionRate = assignments.length>0 ? Math.round((completed.length/assignments.length)*100) : 0

  return (
    <div>
      <Header title={`안녕하세요, ${CURRENT_STUDENT_NAME} 학생 👋`} subtitle="오늘도 화이팅!" />
      <div className="px-4 py-4 space-y-5">

        <Card className="bg-gradient-to-r from-blue-600 to-blue-500 border-0" padding="lg">
          <p className="text-blue-100 text-xs font-medium mb-1">이번 주 과제 완료율</p>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-4xl font-bold text-white">{completionRate}%</span>
            <span className="text-blue-200 text-sm mb-1">{completed.length}/{assignments.length}개 완료</span>
          </div>
          <div className="h-2 bg-blue-400/40 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-700" style={{width:`${completionRate}%`}} />
          </div>
        </Card>

        <div className="grid grid-cols-3 gap-2">
          <StatCard label="오늘 마감" value={today.length} accent="orange" />
          <StatCard label="미완료" value={incomplete.length} accent={incomplete.length>0?'red':'green'} />
          <StatCard label="피드백" value={hasFeedback.length} accent="blue" />
        </div>

        <SectionCard title="🔥 오늘의 과제" subtitle={today.length===0?'오늘 마감 과제가 없어요':`${today.length}개 과제`}>
          {today.length===0
            ? <EmptyState icon="🎉" title="오늘 마감 과제가 없어요!" description="잘 하고 있어요" />
            : <div className="space-y-3">{today.map((a) => <AssignmentCard key={a.assignment_set.id} item={a} onClick={()=>router.push(`/student/assignments/${a.assignment_set.id}`)} />)}</div>
          }
        </SectionCard>

        {incomplete.length>0 && (
          <SectionCard title="⚠️ 미완료 과제" action={<Badge variant="red" size="sm">{incomplete.length}개</Badge>}>
            <div className="space-y-3">{incomplete.map((a) => <AssignmentCard key={a.assignment_set.id} item={a} onClick={()=>router.push(`/student/assignments/${a.assignment_set.id}`)} />)}</div>
          </SectionCard>
        )}

        {hasFeedback.length>0 && (
          <SectionCard title="💬 선생님 피드백">
            <div className="space-y-3">
              {hasFeedback.map((a) => (
                <div key={a.assignment_set.id} className="bg-blue-50 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-700 mb-1">{a.assignment_set.title}</p>
                  <p className="text-sm text-gray-700">{a.submission?.teacher_feedback}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  )
}

function AssignmentCard({ item, onClick }: { item: StudentAssignmentItem; onClick: ()=>void }) {
  const due = formatDueDate(item.assignment_set.due_date)
  const status = item.submission?.final_status ?? 'not_started'
  const videoItem = item.items.find((i)=>i.type==='video')
  const textbookItem = item.items.find((i)=>i.type==='textbook')
  const worksheetItem = item.items.find((i)=>i.type==='worksheet')

  return (
    <div onClick={onClick} className={cx('border rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.98] hover:shadow-sm', status==='checked'?'border-green-200 bg-green-50':due.isOverdue?'border-red-200 bg-red-50':due.isUrgent?'border-orange-200 bg-orange-50':'border-gray-100 bg-white')}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-gray-900 flex-1">{item.assignment_set.title}</p>
        <StatusBadge status={status} size="sm" />
      </div>
      <p className={cx('text-xs mb-2 font-medium', due.isOverdue?'text-red-500':due.isUrgent?'text-orange-500':'text-gray-400')}>
        {due.isOverdue?'🚨':due.isUrgent?'⚡':'📅'} {due.text} · {formatDate(item.assignment_set.due_date)}
      </p>
      <div className="flex gap-2">
        {videoItem && <ItemCheck label="영상" done={['submitted','checked','late'].includes(item.submission?.video_status??'')} color="purple" />}
        {textbookItem && <ItemCheck label="교재" done={['submitted','checked','late'].includes(item.submission?.textbook_status??'')} color="blue" />}
        {worksheetItem && <ItemCheck label="학습지" done={['submitted','checked','late'].includes(item.submission?.worksheet_status??'')} color="green" />}
      </div>
    </div>
  )
}

function ItemCheck({ label, done, color }: { label:string; done:boolean; color:string }) {
  const colors: Record<string,{done:string;todo:string}> = {
    purple:{done:'bg-purple-500 text-white',todo:'bg-purple-100 text-purple-400'},
    blue:{done:'bg-blue-500 text-white',todo:'bg-blue-100 text-blue-400'},
    green:{done:'bg-green-500 text-white',todo:'bg-green-100 text-green-400'},
  }
  return (
    <span className={cx('inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold', done?colors[color].done:colors[color].todo)}>
      <span>{done?'✓':'○'}</span>{label}
    </span>
  )
}