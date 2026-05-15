'use client'

import { Header } from '@/components/common/Header'
import { EmptyState } from '@/components/ui'
import { getMockStudentAssignments } from '@/data/mockData'
import { formatRelativeTime, cx } from '@/lib/utils'

const CURRENT_STUDENT_ID = 'student-001'

export default function StudentFeedbackPage() {
  const assignments = getMockStudentAssignments(CURRENT_STUDENT_ID)
  const withFeedback = assignments.filter((a) => a.submission?.teacher_feedback)

  return (
    <div>
      <Header title="선생님 피드백" subtitle={`총 ${withFeedback.length}개`} />
      <div className="px-4 py-4 space-y-3">
        {withFeedback.length === 0 ? (
          <EmptyState
            icon="💬"
            title="아직 피드백이 없어요"
            description="과제를 제출하면 선생님이 피드백을 남겨드립니다."
          />
        ) : (
          withFeedback.map((a) => (
            <div key={a.assignment_set.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* 상단 컬러 바 */}
              <div className={cx(
                'h-1',
                a.submission?.final_status === 'checked' ? 'bg-indigo-500' :
                a.submission?.final_status === 'late' ? 'bg-red-400' : 'bg-blue-500'
              )} />

              <div className="p-4">
                {/* 과제명 + 상태 */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-7 h-7 bg-blue-500 rounded-lg flex items-center justify-center shrink-0">
                    <span className="text-white text-xs font-bold">T</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-blue-700 truncate">{a.assignment_set.title}</p>
                    {a.submission?.checked_at && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {formatRelativeTime(a.submission.checked_at)} 확인
                      </p>
                    )}
                  </div>
                </div>

                {/* 피드백 내용 */}
                <div className="bg-blue-50 rounded-xl px-4 py-3 mb-3">
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {a.submission?.teacher_feedback}
                  </p>
                </div>

                {/* 어려웠던 문제 */}
                {a.submission?.difficult_problems && (
                  <div className="flex items-center gap-2 bg-orange-50 rounded-xl px-3 py-2">
                    <span className="text-xs text-orange-400 font-semibold">어려웠던 문제</span>
                    <span className="text-xs font-bold text-gray-700">{a.submission.difficult_problems}</span>
                  </div>
                )}

                {/* 내 영상 요약 */}
                {a.submission?.video_summary && (
                  <div className="flex items-start gap-2 bg-purple-50 rounded-xl px-3 py-2 mt-2">
                    <span className="text-xs text-purple-400 font-semibold shrink-0">내 요약</span>
                    <span className="text-xs text-gray-600">{a.submission.video_summary}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}