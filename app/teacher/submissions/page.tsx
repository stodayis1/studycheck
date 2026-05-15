'use client'

import { useState } from 'react'
import { Header } from '@/components/common/Header'
import { SectionCard, StatusBadge, Badge, Card } from '@/components/ui'
import { getMockSubmissionRows, MOCK_ASSIGNMENT_SETS } from '@/data/mockData'
import { formatDateTime, formatRelativeTime, cx } from '@/lib/utils'
import type { SubmissionStatus } from '@/types'

export default function TeacherSubmissionsPage() {
  const [selectedSetId, setSelectedSetId] = useState('aset-001')
  const [feedbackModal, setFeedbackModal] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  const rows = getMockSubmissionRows(selectedSetId)
  const selectedSet = MOCK_ASSIGNMENT_SETS.find((a) => a.id === selectedSetId)!

  const submittedCount = rows.filter((r) =>
    ['submitted', 'checked', 'late'].includes(r.submission?.final_status ?? '')
  ).length

  return (
    <div>
      <Header title="제출 현황" subtitle="과제별 학생 제출 상태" />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 과제 선택 탭 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {MOCK_ASSIGNMENT_SETS.map((aset) => (
            <button
              key={aset.id}
              onClick={() => setSelectedSetId(aset.id)}
              className={cx(
                'shrink-0 px-3 py-2 rounded-xl text-xs font-semibold border transition-all',
                selectedSetId === aset.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300',
              )}
            >
              {aset.title.replace(/^\d+월 \d+일 /, '')}
            </button>
          ))}
        </div>

        {/* 요약 카드 */}
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">{selectedSet.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              마감: {formatDateTime(selectedSet.due_date)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-blue-600">{submittedCount}/{rows.length}</p>
            <p className="text-xs text-gray-400">제출 완료</p>
          </div>
        </Card>

        {/* 현황 표 */}
        <SectionCard title="학생별 제출 현황">
          {/* 헤더 */}
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 pb-2 border-b border-gray-100 mb-2">
            {['학생', '영상', '교재', '학습지', '최종'].map((h) => (
              <span key={h} className="text-[10px] font-semibold text-gray-400 text-center last:text-right first:text-left">
                {h}
              </span>
            ))}
          </div>

          {/* 행 */}
          <div className="space-y-1">
            {rows.map((row) => {
              const s = row.submission
              return (
                <div key={row.student.id} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 py-2.5 border-b border-gray-50 last:border-0 items-center">
                  {/* 학생명 */}
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                      {row.student.name[0]}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-800">{row.student.name}</p>
                      {s?.submitted_at && (
                        <p className="text-[10px] text-gray-400">{formatRelativeTime(s.submitted_at)}</p>
                      )}
                    </div>
                  </div>

                  {/* 항목별 상태 */}
                  <MiniDot status={s?.video_status} />
                  <MiniDot status={s?.textbook_status} />
                  <MiniDot status={s?.worksheet_status} />

                  {/* 최종 상태 + 피드백 */}
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={s?.final_status ?? 'not_started'} size="sm" />
                    <button
                      onClick={() => {
                        setFeedbackModal(row.student.id)
                        setFeedbackText(s?.teacher_feedback ?? '')
                      }}
                      className="text-[10px] text-blue-500 hover:underline"
                    >
                      {s?.teacher_feedback ? '피드백 수정' : '피드백 작성'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>

        {/* 미완료 학생 */}
        <SectionCard title="⚠️ 미완료 학생">
          {rows
            .filter((r) => !r.submission || r.submission.final_status === 'not_started')
            .map((row) => (
              <div key={row.student.id} className="flex items-center gap-2 py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-red-400 font-bold">✕</span>
                <span className="text-sm text-gray-700">{row.student.name}</span>
                <span className="text-xs text-gray-400">{row.student.school}</span>
              </div>
            ))}
          {rows.every((r) => r.submission && r.submission.final_status !== 'not_started') && (
            <p className="text-sm text-green-600 font-medium py-2">✓ 모든 학생이 제출했습니다</p>
          )}
        </SectionCard>

      </div>

      {/* 피드백 모달 */}
      {feedbackModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end" onClick={() => setFeedbackModal(null)}>
          <div className="bg-white w-full max-w-lg mx-auto rounded-t-3xl p-6 pb-8" onClick={(e) => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />
            <h3 className="text-base font-bold text-gray-900 mb-3">피드백 작성</h3>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
              placeholder="학생에게 전달할 피드백을 입력하세요..."
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setFeedbackModal(null)} className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">
                취소
              </button>
              <button
                onClick={() => {
                  alert(`피드백 저장 완료!\n"${feedbackText}"`)
                  setFeedbackModal(null)
                }}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MiniDot({ status }: { status?: SubmissionStatus }) {
  const s = status ?? 'not_started'
  const dot: Record<string, string> = {
    not_started: 'bg-gray-200',
    in_progress: 'bg-blue-400',
    submitted: 'bg-green-400',
    checked: 'bg-indigo-500',
    need_retry: 'bg-orange-400',
    late: 'bg-red-400',
  }
  return (
    <div className="flex justify-center">
      <span className={cx('w-2.5 h-2.5 rounded-full', dot[s])} title={s} />
    </div>
  )
}