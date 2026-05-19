'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Student {
  id: string
  name: string
  grade: string
  school: string
  teacher_name: string
}

interface CoreTest {
  id: string
  student_id: string
  test_date: string
  test_round: string
  score: number | null
  total_score: number
  needs_extra_class: boolean
  memo: string | null
  created_by: string | null
}

interface SchoolExam {
  id: string
  student_id: string
  exam_date: string
  exam_type: string
  score: number | null
  total_score: number
  class_average: number | null
  grade: number | null
  rank: number | null
  memo: string | null
}

const GRADE_GROUPS = ['전체', '초등', '중등', '고등']
const CORE_ROUNDS = ['예비1', '예비2', '본시험']
const EXAM_TYPES = ['단원평가', '중간고사', '기말고사']

export default function TeacherExamsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [coreTests, setCoreTests] = useState<CoreTest[]>([])
  const [schoolExams, setSchoolExams] = useState<SchoolExam[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'core' | 'school'>('core')
  const [gradeGroup, setGradeGroup] = useState('전체')
  const [searchText, setSearchText] = useState('')

  // CORE 테스트 모달
  const [showCoreModal, setShowCoreModal] = useState(false)
  const [coreStudent, setCoreStudent] = useState<Student | null>(null)
  const [coreDate, setCoreDate] = useState(new Date().toISOString().split('T')[0])
  const [coreRound, setCoreRound] = useState('예비1')
  const [coreScore, setCoreScore] = useState('')
  const [coreTotalScore, setCoreTotalScore] = useState('100')
  const [coreNeedsExtra, setCoreNeedsExtra] = useState(false)
  const [coreMemo, setCoreMemo] = useState('')
  const [savingCore, setSavingCore] = useState(false)

  // 학교 시험 모달
  const [showExamModal, setShowExamModal] = useState(false)
  const [examStudent, setExamStudent] = useState<Student | null>(null)
  const [examDate, setExamDate] = useState(new Date().toISOString().split('T')[0])
  const [examType, setExamType] = useState('중간고사')
  const [examScore, setExamScore] = useState('')
  const [examTotalScore, setExamTotalScore] = useState('100')
  const [examAverage, setExamAverage] = useState('')
  const [examGrade, setExamGrade] = useState('')
  const [examRank, setExamRank] = useState('')
  const [examMemo, setExamMemo] = useState('')
  const [savingExam, setSavingExam] = useState(false)

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: cData }, { data: eData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('core_tests').select('*').order('test_date', { ascending: false }),
      supabase.from('school_exams').select('*').order('exam_date', { ascending: false }),
    ])
    if (sData) setStudents(sData)
    if (cData) setCoreTests(cData)
    if (eData) setSchoolExams(eData)
    setLoading(false)
  }

  // 담당 학생만
  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    return s.teacher_name === currentUser?.name
  })

  // 필터링
  const filteredStudents = myStudents.filter((s) => {
    const groupMatch = gradeGroup === '전체' ? true :
      gradeGroup === '초등' ? s.grade.includes('초') :
      gradeGroup === '중등' ? s.grade.includes('중') :
      s.grade.includes('고')
    const searchMatch = searchText === '' || s.name.includes(searchText)
    return groupMatch && searchMatch
  })

  function getStudent(id: string) {
    return myStudents.find((s) => s.id === id)
  }

  // 학생별 CORE 테스트
  function getStudentCoreTests(studentId: string) {
    return coreTests.filter((t) => t.student_id === studentId)
  }

  // 학생별 학교 시험
  function getStudentSchoolExams(studentId: string) {
    return schoolExams.filter((e) => e.student_id === studentId)
  }

  // CORE 테스트 저장
  async function handleSaveCore() {
    if (!coreStudent || !coreScore) return
    setSavingCore(true)
    const score = parseInt(coreScore)
    const total = parseInt(coreTotalScore) || 100

    await supabase.from('core_tests').insert({
      student_id: coreStudent.id,
      test_date: coreDate,
      test_round: coreRound,
      score,
      total_score: total,
      needs_extra_class: coreNeedsExtra || (coreRound !== '본시험' && score < total * 0.8),
      memo: coreMemo || null,
      created_by: currentUser?.name,
    })

    setShowCoreModal(false)
    setCoreStudent(null)
    setCoreScore('')
    setCoreMemo('')
    setCoreNeedsExtra(false)
    setSavingCore(false)
    fetchData()
  }

  // 학교 시험 저장
  async function handleSaveExam() {
    if (!examStudent || !examScore) return
    setSavingExam(true)

    await supabase.from('school_exams').insert({
      student_id: examStudent.id,
      exam_date: examDate,
      exam_type: examType,
      score: parseInt(examScore),
      total_score: parseInt(examTotalScore) || 100,
      class_average: examAverage ? parseInt(examAverage) : null,
      grade: examGrade ? parseInt(examGrade) : null,
      rank: examRank ? parseInt(examRank) : null,
      memo: examMemo || null,
      created_by: currentUser?.name,
    })

    setShowExamModal(false)
    setExamStudent(null)
    setExamScore('')
    setExamAverage('')
    setExamGrade('')
    setExamRank('')
    setExamMemo('')
    setSavingExam(false)
    fetchData()
  }

  // 점수 색상
  function scoreColor(score: number, total: number) {
    const rate = score / total * 100
    if (rate >= 90) return 'text-green-600'
    if (rate >= 80) return 'text-blue-600'
    if (rate >= 70) return 'text-yellow-600'
    return 'text-red-500'
  }

  return (
    <div>
      <Header
        title="평가 관리"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
        action={
          <button
            onClick={() => tab === 'core' ? setShowCoreModal(true) : setShowExamModal(true)}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
            + {tab === 'core' ? 'CORE 테스트' : '학교 시험'} 입력
          </button>
        }
      />

      <div className="px-4 py-4 space-y-3 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'core', label: '🏆 CORE 테스트' },
            { key: 'school', label: '🏫 학교 시험' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 학교급 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {GRADE_GROUPS.map((g) => (
            <button key={g} onClick={() => setGradeGroup(g)}
              className={cx('px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-all',
                gradeGroup === g ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200')}>
              {g}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름으로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

        {/* 학생별 목록 */}
        {loading ? (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : (
          <div className="space-y-3">
            {filteredStudents.map((student) => {
              const cores = getStudentCoreTests(student.id)
              const exams = getStudentSchoolExams(student.id)
              const hasData = tab === 'core' ? cores.length > 0 : exams.length > 0

              return (
                <div key={student.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {/* 학생 헤더 */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-900">{student.name}</p>
                      <p className="text-xs text-gray-400">{student.grade} · {student.school}</p>
                    </div>
                    <button
                      onClick={() => {
                        if (tab === 'core') { setCoreStudent(student); setShowCoreModal(true) }
                        else { setExamStudent(student); setShowExamModal(true) }
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg">
                      + 입력
                    </button>
                  </div>

                  {/* 시험 기록 */}
                  {tab === 'core' ? (
                    cores.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">CORE 테스트 기록 없음</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {/* 라운드별 그룹 */}
                        {['본시험', '예비2', '예비1'].map((round) => {
                          const roundTests = cores.filter((c) => c.test_round === round)
                          if (roundTests.length === 0) return null
                          const latest = roundTests[0]
                          return (
                            <div key={round} className="px-4 py-2.5 flex items-center gap-3">
                              <span className={cx('text-[10px] font-black px-2 py-0.5 rounded-full shrink-0',
                                round === '본시험' ? 'bg-blue-100 text-blue-700' :
                                round === '예비2' ? 'bg-purple-100 text-purple-700' :
                                'bg-gray-100 text-gray-600')}>
                                {round}
                              </span>
                              <div className="flex-1">
                                <span className="text-xs text-gray-400">{latest.test_date}</span>
                                {latest.memo && <span className="text-xs text-gray-400 ml-2">· {latest.memo}</span>}
                              </div>
                              {latest.score != null && (
                                <div className="text-right">
                                  <span className={cx('text-sm font-black', scoreColor(latest.score, latest.total_score))}>
                                    {latest.score}
                                  </span>
                                  <span className="text-xs text-gray-400">/{latest.total_score}</span>
                                  <span className={cx('text-xs font-semibold ml-1',
                                    scoreColor(latest.score, latest.total_score))}>
                                    ({Math.round(latest.score / latest.total_score * 100)}%)
                                  </span>
                                </div>
                              )}
                              {latest.needs_extra_class && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 bg-red-100 text-red-500 rounded-full shrink-0">보강필요</span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )
                  ) : (
                    exams.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-3">학교 시험 기록 없음</p>
                    ) : (
                      <div className="divide-y divide-gray-50">
                        {exams.slice(0, 5).map((exam) => (
                          <div key={exam.id} className="px-4 py-2.5 flex items-center gap-3">
                            <span className={cx('text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0',
                              exam.exam_type === '중간고사' ? 'bg-blue-100 text-blue-700' :
                              exam.exam_type === '기말고사' ? 'bg-green-100 text-green-700' :
                              'bg-gray-100 text-gray-600')}>
                              {exam.exam_type}
                            </span>
                            <div className="flex-1">
                              <span className="text-xs text-gray-400">{exam.exam_date}</span>
                              {exam.class_average && (
                                <span className="text-xs text-gray-400 ml-2">평균 {exam.class_average}점</span>
                              )}
                            </div>
                            <div className="text-right">
                              {exam.score != null && (
                                <>
                                  <span className={cx('text-sm font-black', scoreColor(exam.score, exam.total_score))}>
                                    {exam.score}
                                  </span>
                                  <span className="text-xs text-gray-400">/{exam.total_score}</span>
                                </>
                              )}
                              {exam.grade && (
                                <span className="text-xs font-bold text-purple-600 ml-1">{exam.grade}등급</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CORE 테스트 입력 모달 */}
      {showCoreModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowCoreModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">🏆 CORE 테스트 입력</h3>
              <button onClick={() => setShowCoreModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
              {coreStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <p className="text-sm font-bold text-blue-800 flex-1">{coreStudent.name} · {coreStudent.grade}</p>
                  <button onClick={() => setCoreStudent(null)} className="text-blue-400">✕</button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredStudents.map((s) => (
                    <button key={s.id} onClick={() => setCoreStudent(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 text-sm">
                      <span className="font-semibold text-gray-800">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{s.grade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 날짜 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시험 날짜</label>
              <input type="date" value={coreDate} onChange={(e) => setCoreDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 회차 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">회차</label>
              <div className="flex gap-2">
                {CORE_ROUNDS.map((r) => (
                  <button key={r} onClick={() => setCoreRound(r)}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      coreRound === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* 점수 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-2">점수 <span className="text-red-400">*</span></label>
                <input type="number" min="0" value={coreScore} onChange={(e) => setCoreScore(e.target.value)}
                  placeholder="점수"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-2">만점</label>
                <input type="number" min="1" value={coreTotalScore} onChange={(e) => setCoreTotalScore(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* 점수 미리보기 */}
            {coreScore && (
              <div className={cx('rounded-xl p-3 text-center text-sm font-bold',
                parseInt(coreScore) / parseInt(coreTotalScore || '100') >= 0.9 ? 'bg-green-50 text-green-600' :
                parseInt(coreScore) / parseInt(coreTotalScore || '100') >= 0.8 ? 'bg-blue-50 text-blue-600' :
                parseInt(coreScore) / parseInt(coreTotalScore || '100') >= 0.7 ? 'bg-yellow-50 text-yellow-600' :
                'bg-red-50 text-red-500')}>
                {Math.round(parseInt(coreScore) / parseInt(coreTotalScore || '100') * 100)}점
                {parseInt(coreScore) / parseInt(coreTotalScore || '100') < 0.8 && coreRound !== '본시험' && (
                  <span className="ml-2 text-xs">→ 보강 권장</span>
                )}
              </div>
            )}

            {/* 보강 필요 */}
            <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
              <input type="checkbox" id="needsExtra" checked={coreNeedsExtra}
                onChange={(e) => setCoreNeedsExtra(e.target.checked)}
                className="w-4 h-4 accent-red-500" />
              <label htmlFor="needsExtra" className="text-sm font-semibold text-gray-700">보강 필요</label>
              <span className="text-xs text-gray-400">
                {coreRound === '중학생' ? '월/금 오후 8~10시' : '셋째주 화/목 오후 7~8시'}
              </span>
            </div>

            {/* 메모 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input type="text" value={coreMemo} onChange={(e) => setCoreMemo(e.target.value)}
                placeholder="특이사항 입력"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleSaveCore} disabled={!coreStudent || !coreScore || savingCore}
              className="w-full py-3.5 bg-blue-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingCore ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</> : '🏆 CORE 테스트 저장'}
            </button>
          </div>
        </div>
      )}

      {/* 학교 시험 입력 모달 */}
      {showExamModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowExamModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">🏫 학교 시험 입력</h3>
              <button onClick={() => setShowExamModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 학생 선택 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">학생 <span className="text-red-400">*</span></label>
              {examStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50 border-2 border-blue-300 rounded-xl">
                  <p className="text-sm font-bold text-blue-800 flex-1">{examStudent.name} · {examStudent.grade}</p>
                  <button onClick={() => setExamStudent(null)} className="text-blue-400">✕</button>
                </div>
              ) : (
                <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-xl">
                  {filteredStudents.map((s) => (
                    <button key={s.id} onClick={() => setExamStudent(s)}
                      className="w-full text-left px-3 py-2.5 hover:bg-blue-50 border-b border-gray-50 last:border-0 text-sm">
                      <span className="font-semibold text-gray-800">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-2">{s.grade}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 날짜 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시험 날짜</label>
              <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* 시험 종류 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">시험 종류</label>
              <div className="flex gap-2 flex-wrap">
                {EXAM_TYPES.map((t) => (
                  <button key={t} onClick={() => setExamType(t)}
                    className={cx('px-3 py-2 rounded-xl text-sm font-bold border transition-all',
                      examType === t ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* 점수 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-2">점수 <span className="text-red-400">*</span></label>
                <input type="number" min="0" value={examScore} onChange={(e) => setExamScore(e.target.value)}
                  placeholder="점수"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-2">만점</label>
                <input type="number" min="1" value={examTotalScore} onChange={(e) => setExamTotalScore(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* 학교 평균 + 등급 + 석차 */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-xs font-bold text-gray-700 mb-2">학교 평균 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input type="number" value={examAverage} onChange={(e) => setExamAverage(e.target.value)}
                  placeholder="평균 점수"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {examStudent?.grade.includes('고') && (
                <div className="w-24">
                  <label className="block text-xs font-bold text-gray-700 mb-2">등급 <span className="text-gray-400 font-normal">(1~5)</span></label>
                  <select value={examGrade} onChange={(e) => setExamGrade(e.target.value)}
                    className="w-full px-2 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none">
                    <option value="">-</option>
                    {[1,2,3,4,5].map((g) => <option key={g} value={g}>{g}등급</option>)}
                  </select>
                </div>
              )}
              <div className="w-24">
                <label className="block text-xs font-bold text-gray-700 mb-2">석차 <span className="text-gray-400 font-normal">(선택)</span></label>
                <input type="number" value={examRank} onChange={(e) => setExamRank(e.target.value)}
                  placeholder="등"
                  className="w-full px-2 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none" />
              </div>
            </div>

            {/* 메모 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">메모 <span className="text-gray-400 font-normal">(선택)</span></label>
              <input type="text" value={examMemo} onChange={(e) => setExamMemo(e.target.value)}
                placeholder="특이사항 입력"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            <button onClick={handleSaveExam} disabled={!examStudent || !examScore || savingExam}
              className="w-full py-3.5 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
              {savingExam ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />저장 중...</> : '🏫 학교 시험 저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
