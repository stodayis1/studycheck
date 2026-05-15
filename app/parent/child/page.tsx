'use client'

import { Header } from '@/components/common/Header'
import { SectionCard, Badge, ProgressBar } from '@/components/ui'
import { getMockChildWeeklySummary, MOCK_CLASSES } from '@/data/mockData'
import { cx } from '@/lib/utils'

const CURRENT_PARENT_ID = 'parent-user-001'

export default function ParentChildPage() {
  const summary = getMockChildWeeklySummary(CURRENT_PARENT_ID)
  if (!summary) return (
    <div className="p-8 text-center">
      <p className="text-gray-400">연결된 자녀가 없습니다</p>
    </div>
  )

  const { student, completion_rate, total_assignments, completed_count, late_count } = summary
  const cls = MOCK_CLASSES.find((c) => c.id === student.class_group_id)

  return (
    <div>
      <Header title="자녀 정보" />
      <div className="px-4 py-4 space-y-4">

        {/* 프로필 카드 */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-400 rounded-2xl p-5 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-3xl font-black text-white">{student.name[0]}</span>
            </div>
            <div>
              <h2 className="text-xl font-black">{student.name}</h2>
              <p className="text-blue-100 text-sm mt-0.5">
                {student.school} · 고{student.grade}
              </p>
              <p className="text-blue-100 text-xs mt-0.5">{cls?.name}</p>
            </div>
          </div>
        </div>

        {/* 이번 주 현황 */}
        <SectionCard title="📊 이번 주 현황">
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-1.5">
                <span className="text-sm text-gray-600">과제 완료율</span>
                <span className="text-sm font-bold text-gray-800">{completion_rate}%</span>
              </div>
              <ProgressBar value={completion_rate} showLabel={false} />
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '전체 과제', value: total_assignments, color: 'bg-gray-50 text-gray-700' },
                { label: '완료',     value: completed_count,   color: 'bg-green-50 text-green-600' },
                { label: '지각',     value: late_count,        color: late_count > 0 ? 'bg-red-50 text-red-500' : 'bg-gray-50 text-gray-300' },
              ].map(({ label, value, color }) => (
                <div key={label} className={cx('rounded-xl p-3 text-center', color)}>
                  <p className="text-xl font-black">{value}</p>
                  <p className="text-[10px] mt-0.5">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* 학생 정보 */}
        <SectionCard title="👤 기본 정보">
          <div className="space-y-3">
            {[
              { label: '이름',   value: student.name },
              { label: '학교',   value: student.school ?? '-' },
              { label: '학년',   value: `고${student.grade}` },
              { label: '소속 반', value: cls?.name ?? '-' },
              { label: '학부모', value: '연결됨 ✓' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-400">{label}</span>
                <span className="text-sm font-semibold text-gray-800">{value}</span>
              </div>
            ))}
          </div>
        </SectionCard>

        <p className="text-center text-xs text-gray-300 pb-2">학부모 화면은 읽기 전용입니다 🔒</p>
      </div>
    </div>
  )
}