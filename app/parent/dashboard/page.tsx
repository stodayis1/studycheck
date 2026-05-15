'use client'

import { useState } from 'react'
import { Header } from '@/components/common/Header'
import { getMockChildWeeklySummary, MOCK_CLASSES, MOCK_ASSIGNMENT_ITEMS } from '@/data/mockData'
import { formatDate, formatDateTime, formatDueDate, formatRelativeTime, cx } from '@/lib/utils'
import type { StudentAssignmentItem, SubmissionStatus, AssignmentItemType } from '@/types'

const CURRENT_PARENT_ID = 'parent-user-001'

export default function ParentDashboardPage() {
  const summary = getMockChildWeeklySummary(CURRENT_PARENT_ID)

  if (!summary) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-5xl mb-4">👨‍👩‍👧</div>
        <h2 className="text-base font-bold text-gray-700 mb-1">연결된 자녀가 없습니다</h2>
        <p className="text-sm text-gray-400">선생님에게 자녀 계정 연결을 요청해주세요.</p>
      </div>
    )
  }

  const { student, total_assignments, completed_count, not_started_count, late_count, completion_rate, feedback_count, assignments } = summary

  const cls = MOCK_CLASSES.find((c) => c.id === student.class_group_id)
  const completedList = assignments.filter((a) => ['submitted','checked'].includes(a.submission?.final_status ?? ''))
  const incompleteList = assignments.filter((a) => !a.submission || ['not_started','in_progress'].includes(a.submission.final_status))
  const lateList = assignments.filter((a) => a.submission?.final_status === 'late')
  const feedbackList = assignments.filter((a) => a.submission?.teacher_feedback)

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={`${student.name} 학생`} subtitle={cls?.name ?? ''} />
      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 프로필 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
            <span className="text-blue-600 font-bold text-lg">{student.name[0]}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-base font-bold text-gray-900">{student.name}</p>
              {student.grade && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-md">고{student.grade}</span>}
            </div>
            <p className="text-xs text-gray-400 truncate mt-0.5">{[student.school, cls?.name].filter(Boolean).join(' · ')}</p>
          </div>
          <span className="shrink-0 text-[10px] font-bold text-gray-300 border border-gray-100 px-2 py-1 rounded-full">보기 전용</span>
        </div>

        {/* 완료율 히어로 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className={cx('px-5 py-5 bg-gradient-to-r', completion_rate>=80?'from-emerald-500 to-green-400':completion_rate>=50?'from-blue-600 to-blue-400':'from-orange-500 to-amber-400')}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-white/80 text-xs font-medium mb-0.5">이번 주 과제 완료율</p>
                <div className="flex items-end gap-2">
                  <span className="text-5xl font-black text-white leading-none">{completion_rate}</span>
                  <span className="text-white/90 text-xl font-bold mb-1">%</span>
                </div>
              </div>
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-3xl">
                {completion_rate>=80?'🏆':completion_rate>=50?'📚':'⚡'}
              </div>
            </div>
            <div className="h-2.5 bg-white/25 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-700" style={{width:`${completion_rate}%`}} />
            </div>
          </div>
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            {[
              {label:'전체', value:total_assignments, color:'text-gray-800'},
              {label:'완료', value:completed_count, color:'text-green-600'},
              {label:'미완료', value:not_started_count, color:not_started_count>0?'text-orange-500':'text-gray-300'},
              {label:'지각', value:late_count, color:late_count>0?'text-red-500':'text-gray-300'},
            ].map((item) => (
              <div key={item.label} className="py-3.5 text-center">
                <p className={cx('text-xl font-black', item.color)}>{item.value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5 font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 미완료 */}
        {incompleteList.length > 0 && (
          <Section title="미완료 과제" icon="⚠️" count={incompleteList.length} color="text-orange-500">
            {incompleteList.map((a) => {
              const due = formatDueDate(a.assignment_set.due_date)
              return (
                <div key={a.assignment_set.id} className={cx('rounded-xl border p-3.5', due.isOverdue?'border-red-100 bg-red-50':'border-orange-100 bg-orange-50')}>
                  <p className="text-sm font-semibold text-gray-800">{a.assignment_set.title}</p>
                  <p className={cx('text-xs mt-0.5', due.isOverdue?'text-red-500':'text-orange-500')}>
                    마감 {formatDate(a.assignment_set.due_date)} · {due.text}
                  </p>
                </div>
              )
            })}
          </Section>
        )}

        {/* 지각 */}
        {lateList.length > 0 && (
          <Section title="지각 제출" icon="🚨" count={lateList.length} color="text-red-500">
            {lateList.map((a) => (
              <div key={a.assignment_set.id} className="bg-red-50 border border-red-100 rounded-xl p-3.5">
                <p className="text-sm font-semibold text-gray-800">{a.assignment_set.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">마감 {formatDate(a.assignment_set.due_date)}</p>
              </div>
            ))}
          </Section>
        )}

        {/* 완료 */}
        {completedList.length > 0 && (
          <Section title="완료한 과제" icon="✅" count={completedList.length} color="text-green-600">
            {completedList.map((a) => (
              <div key={a.assignment_set.id} className="bg-green-50 border border-green-100 rounded-xl p-3.5 flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-800">{a.assignment_set.title}</p>
                <span className="text-green-500 text-lg">✓</span>
              </div>
            ))}
          </Section>
        )}

        {/* 피드백 */}
        {feedbackList.length > 0 && (
          <Section title="선생님 피드백" icon="💬" count={feedbackList.length} color="text-blue-600">
            {feedbackList.map((a) => (
              <div key={a.assignment_set.id} className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                <p className="text-xs font-bold text-blue-700 mb-2">{a.assignment_set.title}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{a.submission?.teacher_feedback}</p>
              </div>
            ))}
          </Section>
        )}

        {/* 주간 요약 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
          <p className="text-sm font-bold text-gray-800">📊 주간 학습 요약</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              {icon:'✅', label:'완료', value:completed_count, bg:'bg-green-50', text:'text-green-600'},
              {icon:'⏰', label:'지각', value:late_count, bg:late_count>0?'bg-red-50':'bg-gray-50', text:late_count>0?'text-red-500':'text-gray-300'},
              {icon:'💬', label:'피드백', value:feedback_count, bg:feedback_count>0?'bg-blue-50':'bg-gray-50', text:feedback_count>0?'text-blue-600':'text-gray-300'},
            ].map(({icon, label, value, bg, text}) => (
              <div key={label} className={cx('rounded-xl p-3 text-center', bg)}>
                <p className="text-lg mb-0.5">{icon}</p>
                <p className={cx('text-xl font-black', text)}>{value}</p>
                <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-gray-300 pb-2">학부모 화면은 읽기 전용입니다 🔒</p>
      </div>
    </div>
  )
}

function Section({ title, icon, count, color, children }: {
  title: string; icon: string; count: number; color: string; children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <button onClick={() => setOpen(v => !v)} className="w-full px-4 py-3.5 flex items-center gap-2.5 border-b border-gray-50">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-bold text-gray-800 flex-1 text-left">{title}</span>
        <span className={cx('text-[11px] font-bold px-2 py-0.5 rounded-full bg-gray-100', color)}>{count}개</span>
        <svg viewBox="0 0 12 8" className={cx('w-3 h-3 text-gray-400 transition-transform', open ? 'rotate-180' : '')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 1l5 5 5-5"/></svg>
      </button>
      {open && <div className="px-4 py-3.5 space-y-2">{children}</div>}
    </div>
  )
}