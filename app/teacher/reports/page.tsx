'use client'

import { Header } from '@/components/common/Header'
import { SectionCard, ProgressBar, StatCard } from '@/components/ui'
import { getMockAssignmentSummaries, MOCK_STUDENTS, MOCK_SUBMISSIONS } from '@/data/mockData'
import { cx } from '@/lib/utils'

export default function TeacherReportsPage() {
  const summaries = getMockAssignmentSummaries()
  const students = MOCK_STUDENTS.filter((s) => s.class_group_id === 'class-001')

  const avgRate = Math.round(summaries.reduce((acc, s) => acc + s.completion_rate, 0) / summaries.length)
  const totalSubmissions = MOCK_SUBMISSIONS.filter((s) => ['submitted','checked','late'].includes(s.final_status)).length
  const lateCount = MOCK_SUBMISSIONS.filter((s) => s.final_status === 'late').length
  const feedbackCount = MOCK_SUBMISSIONS.filter((s) => s.teacher_feedback).length

  // 학생별 완료율
  const studentStats = students.map((student) => {
    const subs = MOCK_SUBMISSIONS.filter((s) => s.student_id === student.id)
    const done = subs.filter((s) => ['submitted','checked','late'].includes(s.final_status)).length
    const rate = summaries.length > 0 ? Math.round((done / summaries.length) * 100) : 0
    return { student, rate, done, total: summaries.length }
  }).sort((a, b) => b.rate - a.rate)

  return (
    <div>
      <Header title="보고서" subtitle="주간 학습 통계" />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 주간 요약 통계 */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="평균 완료율"   value={`${avgRate}%`}        accent="blue"   icon="📊" />
          <StatCard label="총 제출 수"    value={totalSubmissions}      accent="green"  icon="📥" />
          <StatCard label="지각 제출"     value={lateCount}             accent={lateCount > 0 ? 'orange' : 'gray'} icon="⏰" />
          <StatCard label="피드백 완료"   value={feedbackCount}         accent="blue"   icon="💬" />
        </div>

        {/* 과제별 완료율 */}
        <SectionCard title="과제별 완료율">
          <div className="space-y-4">
            {summaries.map(({ assignment_set, completion_rate, submitted_count, total_assigned }) => (
              <div key={assignment_set.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm font-medium text-gray-700 truncate flex-1 pr-2">
                    {assignment_set.title}
                  </p>
                  <span className="text-xs font-bold text-gray-600 shrink-0">
                    {submitted_count}/{total_assigned}명
                  </span>
                </div>
                <ProgressBar value={completion_rate} showLabel size="sm" />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 학생별 완료율 순위 */}
        <SectionCard title="🏆 학생별 완료율">
          <div className="space-y-3">
            {studentStats.map(({ student, rate, done, total }, index) => (
              <div key={student.id} className="flex items-center gap-3">
                {/* 순위 */}
                <div className={cx(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0',
                  index === 0 ? 'bg-yellow-100 text-yellow-600' :
                  index === 1 ? 'bg-gray-100 text-gray-500' :
                  index === 2 ? 'bg-orange-100 text-orange-500' :
                  'bg-gray-50 text-gray-400'
                )}>
                  {index + 1}
                </div>

                {/* 아바타 */}
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                  {student.name[0]}
                </div>

                {/* 이름 + 바 */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-gray-800">{student.name}</span>
                    <span className="text-xs font-bold text-gray-600">{done}/{total} ({rate}%)</span>
                  </div>
                  <ProgressBar value={rate} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 이번 주 코멘트 */}
        <SectionCard title="📝 이번 주 요약">
          <div className="space-y-2">
            {[
              avgRate >= 80 ? '이번 주 전체적으로 과제 수행률이 높아요! 👍' :
              avgRate >= 50 ? '절반 이상 완료했어요. 미완료 학생을 확인해보세요.' :
              '전체 완료율이 낮아요. 학생들을 독려해주세요.',
              lateCount > 0 ? `지각 제출이 ${lateCount}건 있어요.` : '지각 제출이 없어요! 👏',
              feedbackCount > 0 ? `피드백 ${feedbackCount}건을 남겼어요.` : '아직 피드백을 남기지 않은 학생이 있어요.',
            ].map((c, i) => (
              <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-gray-300 mt-0.5 shrink-0">•</span>
                <p className="text-sm text-gray-600 leading-relaxed">{c}</p>
              </div>
            ))}
          </div>
        </SectionCard>

      </div>
    </div>
  )
}