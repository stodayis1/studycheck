'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { Card, SectionCard, StatCard, EmptyState } from '@/components/ui'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface StudentInfo {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface WorksheetRecord {
  id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  status: string
  worksheet_type: string
  score: number | null
  assigned_at: string
}

interface TextbookRecord {
  id: string
  concept_id: string
  textbook_name: string
  textbook_type: string
  status: string
  memo: string | null
  assigned_at: string
}

interface Concept {
  id: string
  grade: string
  chapter: string
  concept_name: string
}

const WS_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:          { label: '과제중',       color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  submitted:         { label: '채점대기',     color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
  similar_assigned:  { label: '오답유사',     color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  similar_submitted: { label: '오답유사채점', color: 'text-pink-500',   bg: 'bg-pink-50 border-pink-200' },
  scored:            { label: '결과대기',     color: 'text-gray-500',   bg: 'bg-gray-50 border-gray-200' },
  passed:            { label: '완료✓',       color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  retry:             { label: '재도전',       color: 'text-red-500',    bg: 'bg-red-50 border-red-200' },
}

const TB_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  assigned:  { label: '과제중',   color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  submitted: { label: '제출완료', color: 'text-orange-500', bg: 'bg-orange-50 border-orange-200' },
  checked:   { label: '채점완료', color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
}

export default function StudentDashboard() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [textbooks, setTextbooks] = useState<TextbookRecord[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const [{ data: studentData }, { data: wsData }, { data: tbData }, { data: cData }] = await Promise.all([
          supabase.from('students').select('*').eq('id', session.id).single(),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('concepts').select('id, grade, chapter, concept_name'),
        ])

        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
        if (cData) setConcepts(cData)
      } catch {
        router.push('/auth/login')
      }
      setLoading(false)
    }
    init()
  }, [])

  function getConceptById(id: string) {
    return concepts.find((c) => c.id === id)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!student) return null

  const activeWorksheets = worksheets.filter((w) => !['passed'].includes(w.status))
  const completedWorksheets = worksheets.filter((w) => w.status === 'passed')
  const activeTextbooks = textbooks.filter((t) => t.status !== 'checked')
  const completedTextbooks = textbooks.filter((t) => t.status === 'checked')

  return (
    <div>
      <Header title={`안녕하세요, ${student.name} 학생 👋`} subtitle="오늘도 화이팅!" />
      <div className="px-4 py-4 space-y-5">

        {/* 학생 정보 카드 */}
        <Card className="bg-gradient-to-r from-[#1a2f5e] to-blue-500 border-0" padding="lg">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
              <span className="text-2xl font-black text-white">{student.name[0]}</span>
            </div>
            <div>
              <p className="text-white font-black text-lg">{student.name}</p>
              <p className="text-blue-100 text-sm">{student.school} · {student.grade}</p>
              {student.teacher_name && (
                <p className="text-blue-200 text-xs mt-0.5">담당: {student.teacher_name} 선생님</p>
              )}
            </div>
          </div>
        </Card>

        {/* 통계 */}
        <div className="grid grid-cols-4 gap-2">
          <StatCard label="학습지" value={activeWorksheets.length} accent="blue" />
          <StatCard label="교재" value={activeTextbooks.length} accent="green" />
          <StatCard label="학습지완료" value={completedWorksheets.length} accent="gray" />
          <StatCard label="교재완료" value={completedTextbooks.length} accent="gray" />
        </div>

        {/* 진행중인 교재 과제 */}
        <SectionCard title="📖 진행중인 교재 과제">
          {activeTextbooks.length === 0 ? (
            <EmptyState icon="📚" title="진행중인 교재 과제가 없어요" description="선생님이 곧 새 과제를 배정해드릴 거예요" />
          ) : (
            <div className="space-y-3">
              {activeTextbooks.map((t) => {
                const cfg = TB_STATUS_CONFIG[t.status] ?? TB_STATUS_CONFIG.assigned
                const concept = getConceptById(t.concept_id)
                return (
                  <div key={t.id} className={cx('rounded-2xl border-2 p-4', cfg.bg)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{t.textbook_name}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-600 rounded-md">{t.textbook_type}</span>
                        </div>
                        {concept && (
                          <p className="text-xs text-gray-500 mt-1">
                            {concept.grade} · {concept.chapter} &gt; {concept.concept_name}
                          </p>
                        )}
                        {t.memo && (
                          <p className="text-xs text-gray-400 mt-1">📝 {t.memo}</p>
                        )}
                      </div>
                      <span className={cx('text-xs font-bold px-2.5 py-1 rounded-full border shrink-0', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* 진행중인 학습지 */}
        <SectionCard title="📝 진행중인 학습지">
          {activeWorksheets.length === 0 ? (
            <EmptyState icon="🎉" title="진행중인 과제가 없어요!" description="선생님이 곧 새 과제를 배정해드릴 거예요" />
          ) : (
            <div className="space-y-3">
              {activeWorksheets.map((w) => {
                const cfg = WS_STATUS_CONFIG[w.status] ?? WS_STATUS_CONFIG.assigned
                return (
                  <div key={w.id} className={cx('rounded-2xl border-2 p-4', cfg.bg)}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-gray-900">{w.grade_level} {w.unit}</p>
                          {w.unit_name && <span className="text-xs text-gray-500">({w.unit_name})</span>}
                          {w.worksheet_type === 'similar' && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-md">오답유사</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          <span className={cx('font-bold', w.current_level >= 4 ? 'text-orange-500' : 'text-blue-600')}>
                            {w.current_level}레벨
                          </span>
                          {w.current_level >= 4 && ' · 심화'}
                        </p>
                        {w.score != null && (
                          <p className={cx('text-sm font-black mt-1',
                            w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                            {w.score}점
                          </p>
                        )}
                      </div>
                      <span className={cx('text-xs font-bold px-2.5 py-1 rounded-full border shrink-0', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </SectionCard>

        {/* 완료한 학습지 */}
        {completedWorksheets.length > 0 && (
          <SectionCard title="✅ 완료한 학습지">
            <div className="space-y-2">
              {completedWorksheets.slice(0, 5).map((w) => (
                <div key={w.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-700">{w.grade_level} {w.unit}</p>
                    <p className="text-xs text-gray-400">{w.current_level}레벨</p>
                  </div>
                  {w.score != null && (
                    <span className={cx('text-sm font-black',
                      w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                      {w.score}점
                    </span>
                  )}
                  <span className="text-xs text-green-500 font-bold">✓</span>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

      </div>
    </div>
  )
}
