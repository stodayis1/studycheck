'use client'

import { Header } from '@/components/common/Header'
import { SectionCard, ProgressBar } from '@/components/ui'
import { getMockChildWeeklySummary, MOCK_ASSIGNMENT_ITEMS } from '@/data/mockData'
import type { AssignmentItemType } from '@/types'

const CURRENT_PARENT_ID = 'parent-user-001'

export default function ParentReportsPage() {
  const summary = getMockChildWeeklySummary(CURRENT_PARENT_ID)
  if (!summary) return (
    <div className="p-8 text-center">
      <p className="text-gray-400">연결된 자녀가 없습니다</p>
    </div>
  )

  const { student, assignments, completion_rate, completed_count, late_count, feedback_count, total_assignments } = summary

  // 유형별 완료율 계산
  function rateFor(type: AssignmentItemType) {
    const relevant = assignments.filter((a) =>
      MOCK_ASSIGNMENT_ITEMS.some((i) => i.assignment_set_id === a.assignment_set.id && i.type === type)
    )
    if (relevant.length === 0) return 0
    const statusKey = `${type}_status` as 'video_status' | 'textbook_status' | 'worksheet_status'
    const done = relevant.filter((a) => {
      const s = a.submission?.[statusKey]
      return s && ['submitted', 'checked', 'late'].includes(s)
    }).length
    return Math.round((done / relevant.length) * 100)
  }

  const typeRates = {
    video:     rateFor('video'),
    textbook:  rateFor('textbook'),
    worksheet: rateFor('worksheet'),
  }

  // 자동 코멘트 생성
  const comments: string[] = []
  if (completion_rate >= 80) comments.push('이번 주 과제를 성실하게 수행하고 있습니다 👍')
  else if (completion_rate >= 50) comments.push('과제 절반 이상 완료했어요. 나머지도 함께 확인해주세요.')
  else comments.push('아직 완료하지 못한 과제가 많아요. 자녀와 함께 확인해보세요.')
  if (late_count > 0) comments.push(`지각 제출이 ${late_count}건 있어요. 마감일 관리에 신경써주세요.`)
  if (feedback_count > 0) comments.push(`선생님 피드백 ${feedback_count}건이 있습니다. 함께 읽어보세요.`)

  return (
    <div>
      <Header title="주간 리포트" subtitle={`${student.name} 학생`} />
      <div className="px-4 py-4 space-y-4">

        {/* 주간 완료율 */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl p-5 text-white">
          <p className="text-blue-100 text-xs mb-1">이번 주 과제 완료율</p>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-5xl font-black">{completion_rate}</span>
            <span className="text-xl font-bold mb-1">%</span>
            <span className="text-blue-200 text-sm mb-1 ml-2">
              {completed_count}/{total_assignments}개 완료
            </span>
          </div>
          <div className="h-2.5 bg-white/30 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: `${completion_rate}%` }} />
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: '✅', label: '완료',   value: completed_count,  bg: 'bg-green-50', text: 'text-green-600' },
            { icon: '⏰', label: '지각',   value: late_count,       bg: late_count > 0 ? 'bg-red-50' : 'bg-gray-50', text: late_count > 0 ? 'text-red-500' : 'text-gray-300' },
            { icon: '💬', label: '피드백', value: feedback_count,   bg: feedback_count > 0 ? 'bg-blue-50' : 'bg-gray-50', text: feedback_count > 0 ? 'text-blue-600' : 'text-gray-300' },
          ].map(({ icon, label, value, bg, text }) => (
            <div key={label} className={`${bg} rounded-2xl p-3 text-center`}>
              <p className="text-lg mb-0.5">{icon}</p>
              <p className={`text-2xl font-black ${text}`}>{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 유형별 완료율 */}
        <SectionCard title="과제 유형별 현황">
          <div className="space-y-4">
            {[
              { label: '영상 과제',  icon: '▶', rate: typeRates.video },
              { label: '교재 과제',  icon: '📖', rate: typeRates.textbook },
              { label: '학습지',    icon: '📄', rate: typeRates.worksheet },
            ].map(({ label, icon, rate }) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-600 flex items-center gap-1.5">
                    <span>{icon}</span>{label}
                  </span>
                  <span className="text-sm font-bold text-gray-700">{rate}%</span>
                </div>
                <ProgressBar value={rate} size="sm" />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 선생님 코멘트 */}
        <SectionCard title="📝 이번 주 학습 코멘트">
          <div className="space-y-2">
            {comments.map((c, i) => (
              <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-gray-300 mt-0.5 shrink-0">•</span>
                <p className="text-sm text-gray-600 leading-relaxed">{c}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <p className="text-center text-xs text-gray-300 pb-2">학부모 화면은 읽기 전용입니다 🔒</p>
      </div>
    </div>
  )
}