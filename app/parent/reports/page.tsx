'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
  concept_order: number
  concept_name: string
}

interface StudentTextbook {
  id: string
  concept_id: string
  textbook_name: string
  textbook_type: string
  status: string
}

interface StudentWorksheet {
  id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  status: string
  score: number | null
  worksheet_type: string
}

export default function ParentReportsPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'textbook' | 'worksheet'>('textbook')
  const [selectedSemester, setSelectedSemester] = useState(1)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)

        const { data: studentData } = await supabase
          .from('students').select('name, grade').eq('id', session.id).single()
        if (studentData) {
          setStudentName(studentData.name)
          setStudentGrade(studentData.grade)
        }

        const [{ data: cData }, { data: tbData }, { data: wsData }] = await Promise.all([
          supabase.from('concepts').select('*').order('semester').order('concept_order'),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id),
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
        ])

        if (cData) setConcepts(cData)
        if (tbData) setTextbooks(tbData)
        if (wsData) setWorksheets(wsData)
      } catch {
        router.push('/auth/login')
      }
      setLoading(false)
    }
    init()
  }, [])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  // ── 교재 분석 ──
  const gradeConcepts = concepts.filter((c) =>
    c.grade === studentGrade && c.semester === selectedSemester
  )
  const chapters = [...new Set(gradeConcepts.map((c) => c.chapter))]
  const doneConceptIds = new Set(textbooks.map((t) => t.concept_id))

  const chapterStats = chapters.map((chapter) => {
    const chapterConcepts = gradeConcepts.filter((c) => c.chapter === chapter)
    const doneConcepts = chapterConcepts.filter((c) => doneConceptIds.has(c.id))
    const rate = chapterConcepts.length > 0
      ? Math.round(doneConcepts.length / chapterConcepts.length * 100) : 0
    return {
      chapter,
      total: chapterConcepts.length,
      done: doneConcepts.length,
      rate,
      concepts: chapterConcepts.map((c) => ({
        ...c,
        isDone: doneConceptIds.has(c.id),
      }))
    }
  })

  const totalConcepts = gradeConcepts.length
  const doneTotalConcepts = gradeConcepts.filter((c) => doneConceptIds.has(c.id)).length
  const overallTextbookRate = totalConcepts > 0
    ? Math.round(doneTotalConcepts / totalConcepts * 100) : 0
  const activeChapters = chapterStats.filter((c) => c.done > 0)

  // ── 학습지 분석 ──
  const passedWorksheets = worksheets.filter((w) => w.status === 'passed')
  const wsTotal = worksheets.length
  const wsPassed = passedWorksheets.length
  const wsRate = wsTotal > 0 ? Math.round(wsPassed / wsTotal * 100) : 0
  const scoredWs = worksheets.filter((w) => w.score != null)
  const avgScore = scoredWs.length > 0
    ? Math.round(scoredWs.reduce((sum, w) => sum + (w.score ?? 0), 0) / scoredWs.length) : null

  // 단원별 그룹
  const wsUnitGroups: Record<string, StudentWorksheet[]> = {}
  worksheets.forEach((w) => {
    const key = `${w.grade_level} ${w.unit}`
    if (!wsUnitGroups[key]) wsUnitGroups[key] = []
    wsUnitGroups[key].push(w)
  })

  return (
    <div>
      <Header title="학습 리포트" subtitle={`${studentName} 학생`} />
      <div className="px-4 py-4 space-y-4 pb-10">

        {/* 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'textbook', label: '📖 교재' },
            { key: 'worksheet', label: '📝 학습지' },
          ].map((t) => (
            <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                activeTab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── 교재 탭 ── */}
        {activeTab === 'textbook' && (
          <div className="space-y-4">
            {/* 학기 선택 */}
            <div className="flex gap-2">
              {[1, 2].map((s) => (
                <button key={s} onClick={() => setSelectedSemester(s)}
                  className={cx('px-4 py-1.5 rounded-lg text-sm font-semibold border transition-all',
                    selectedSemester === s ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-500 border-gray-200')}>
                  {s}학기
                </button>
              ))}
            </div>

            {/* 전체 진행률 */}
            <div className="bg-gradient-to-r from-green-600 to-green-400 rounded-2xl p-5 text-white">
              <p className="text-green-100 text-xs mb-1">{studentGrade} {selectedSemester}학기 교재 진행률</p>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-5xl font-black">{overallTextbookRate}</span>
                <span className="text-xl font-bold mb-1">%</span>
                <span className="text-green-200 text-sm mb-1 ml-2">
                  {activeChapters.length}/{chapters.length}단원 진행 중
                </span>
              </div>
              <div className="h-2.5 bg-white/30 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${overallTextbookRate}%` }} />
              </div>
              <p className="text-green-100 text-xs mt-2">
                전체 {totalConcepts}개 개념 중 {doneTotalConcepts}개 완료
              </p>
            </div>

            {/* 단원별 진행률 */}
            {chapters.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <p className="text-3xl mb-3">📖</p>
                <p className="text-sm text-gray-500">교재 데이터가 없어요</p>
              </div>
            ) : (
              chapterStats.map((cs, idx) => (
                <div key={cs.chapter} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className={cx('w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black shrink-0',
                      cs.done === cs.total && cs.total > 0 ? 'bg-green-100 text-green-600' :
                      cs.done > 0 ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400')}>
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-800 truncate">{cs.chapter}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{cs.total}개 개념 중 {cs.done}개 완료</p>
                    </div>
                    <span className={cx('text-sm font-black shrink-0',
                      cs.rate === 100 ? 'text-green-600' :
                      cs.rate >= 50 ? 'text-blue-600' : 'text-gray-400')}>
                      {cs.rate}%
                    </span>
                  </div>
                  <div className="px-4 pb-2">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className={cx('h-full rounded-full transition-all',
                        cs.rate === 100 ? 'bg-green-500' : 'bg-blue-500')}
                        style={{ width: `${cs.rate}%` }} />
                    </div>
                  </div>
                  <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                    {cs.concepts.map((concept) => (
                      <span key={concept.id}
                        className={cx('text-[10px] font-semibold px-2 py-1 rounded-lg',
                          concept.isDone
                            ? 'bg-green-50 text-green-700 border border-green-200'
                            : 'bg-gray-50 text-gray-400 border border-gray-100')}>
                        {concept.isDone ? '✓ ' : ''}{concept.concept_name}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── 학습지 탭 ── */}
        {activeTab === 'worksheet' && (
          <div className="space-y-4">
            {/* 전체 현황 */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-400 rounded-2xl p-5 text-white">
              <p className="text-blue-100 text-xs mb-1">학습지 완료율 (레벨업 기준)</p>
              <div className="flex items-end gap-2 mb-3">
                <span className="text-5xl font-black">{wsRate}</span>
                <span className="text-xl font-bold mb-1">%</span>
                <span className="text-blue-200 text-sm mb-1 ml-2">{wsPassed}/{wsTotal}개 완료</span>
              </div>
              <div className="h-2.5 bg-white/30 rounded-full overflow-hidden">
                <div className="h-full bg-white rounded-full transition-all duration-700"
                  style={{ width: `${wsRate}%` }} />
              </div>
              {avgScore != null && (
                <p className="text-blue-100 text-xs mt-2">평균 점수 {avgScore}점</p>
              )}
            </div>

            {/* 단원별 레벨별 현황표 */}
            {Object.keys(wsUnitGroups).length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
                <p className="text-3xl mb-3">📝</p>
                <p className="text-sm text-gray-500">학습지 데이터가 없어요</p>
              </div>
            ) : (
              Object.entries(wsUnitGroups).map(([unit, wsList]) => {
                const passed = wsList.filter((w) => w.status === 'passed')
                const unitRate = Math.round(passed.length / wsList.length * 100)
                const sorted = [...wsList].sort((a, b) => a.current_level - b.current_level)

                return (
                  <div key={unit} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
                      <div className="flex-1">
                        <p className="text-sm font-bold text-gray-800">{unit}</p>
                        {wsList[0]?.unit_name && (
                          <p className="text-xs text-gray-400">{wsList[0].unit_name}</p>
                        )}
                      </div>
                      <span className={cx('text-sm font-black',
                        unitRate === 100 ? 'text-green-600' :
                        unitRate >= 50 ? 'text-blue-600' : 'text-gray-400')}>
                        {unitRate}%
                      </span>
                    </div>
                    <div className="p-4 flex flex-wrap gap-2">
                      {sorted.map((w) => (
                        <div key={w.id}
                          className={cx('flex flex-col items-center px-3 py-2 rounded-xl border text-center min-w-[64px]',
                            w.status === 'passed' ? 'bg-green-50 border-green-200' :
                            ['retry','similar_assigned','similar_submitted'].includes(w.status) ? 'bg-red-50 border-red-200' :
                            w.status === 'scored' ? 'bg-gray-50 border-gray-200' :
                            'bg-blue-50 border-blue-200')}>
                          <span className={cx('text-xs font-black',
                            w.current_level >= 4 ? 'text-orange-500' : 'text-blue-600')}>
                            {w.current_level}레벨
                          </span>
                          {w.score != null ? (
                            <span className={cx('text-sm font-black mt-0.5',
                              w.score >= 85 ? 'text-green-600' :
                              w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                              {w.score}점
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400 mt-0.5">
                              {w.status === 'passed' ? '✓' :
                               w.status === 'assigned' ? '진행중' :
                               w.status === 'submitted' ? '채점대기' :
                               w.status === 'scored' ? '결과대기' :
                               w.status === 'similar_assigned' ? '오답유사' : '-'}
                            </span>
                          )}
                          {w.worksheet_type === 'similar' && (
                            <span className="text-[9px] text-purple-500 font-bold">재도전</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
