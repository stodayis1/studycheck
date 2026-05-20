'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
  wise_step: string
}

interface LearningNote {
  id: string
  student_id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  workbook_done: boolean
}

interface ClassSession {
  id: string
  student_id: string
  session_date: string
}

interface StudentWorksheet {
  id: string
  student_id: string
  status: string
  score: number | null
}

interface StudentProgress {
  id: string
  student_id: string
  textbook_id: string
  textbook_type: string
}

interface ElementaryTextbook {
  id: string
  grade: string
  semester: number
  chapter_no: number
  lesson_type: string
}

const TEACHERS = ['전체', '조윤희', '윤주희', '김은수', '신애진', '박경미', '최윤정', '주한']
const GRADE_GROUPS = ['전체', '초등', '중등', '고등']

export default function AdminPage() {
  const { currentUser, isAdmin } = useAuth()
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [progress, setProgress] = useState<StudentProgress[]>([])
  const [elementaryTBs, setElementaryTBs] = useState<ElementaryTextbook[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTeacher, setSelectedTeacher] = useState('전체')
  const [selectedGroup, setSelectedGroup] = useState('전체')

  useEffect(() => {
    if (!isAdmin()) { router.push('/teacher/dashboard'); return }
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    const [{ data: sData }, { data: nData }, { data: ssData }, { data: wsData }, { data: pgData }, { data: etData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('teacher_name').order('grade').order('name'),
      supabase.from('learning_notes').select('*'),
      supabase.from('class_sessions').select('id, student_id, session_date').gte('session_date', monthStart),
      supabase.from('student_worksheets').select('id, student_id, status, score'),
      supabase.from('student_progress').select('*'),
      supabase.from('elementary_textbooks').select('id, grade, semester, chapter_no, lesson_type'),
    ])
    if (sData) setStudents(sData)
    if (nData) setNotes(nData)
    if (ssData) setSessions(ssData)
    if (wsData) setWorksheets(wsData)
    if (pgData) setProgress(pgData)
    if (etData) setElementaryTBs(etData)
    setLoading(false)
  }

  const filteredStudents = students.filter(s => {
    const teacherMatch = selectedTeacher === '전체' || s.teacher_name === selectedTeacher
    const groupMatch = selectedGroup === '전체' ||
      (selectedGroup === '초등' && s.grade.includes('초')) ||
      (selectedGroup === '중등' && s.grade.includes('중')) ||
      (selectedGroup === '고등' && s.grade.includes('고'))
    return teacherMatch && groupMatch
  })

  function getMonthStats(studentId: string) {
    const studentSessions = sessions.filter(s => s.student_id === studentId)
    const studentNotes = notes.filter(n => studentSessions.some(s => s.id === n.session_id))
    const total = studentNotes.length
    const attendRate = total > 0 ? Math.round(studentNotes.filter(n => n.attendance === '정시').length / total * 100) : null
    const taskRate = total > 0 ? Math.round(studentNotes.filter(n => n.worksheet_submitted).length / total * 100) : null
    return { total, attendRate, taskRate }
  }

  function getWSStats(studentId: string) {
    const sws = worksheets.filter(w => w.student_id === studentId)
    const active = sws.filter(w => w.status !== 'passed')
    const passed = sws.filter(w => w.status === 'passed')
    const scored = sws.filter(w => w.score != null)
    const avg = scored.length > 0 ? Math.round(scored.reduce((a, w) => a + (w.score ?? 0), 0) / scored.length) : null
    return { active: active.length, passed: passed.length, avg }
  }

  function getProgressRate(studentId: string, grade: string) {
    if (!grade.includes('초')) return null
    const gradeConceptTBs = elementaryTBs.filter(tb => tb.grade === grade && tb.lesson_type === 'concept')
    if (gradeConceptTBs.length === 0) return null
    const done = gradeConceptTBs.filter(tb =>
      progress.some(p => p.student_id === studentId && p.textbook_id === tb.id)
    ).length
    return Math.round(done / gradeConceptTBs.length * 100)
  }

  // 강사별 요약
  const teacherSummary = TEACHERS.slice(1).map(teacher => {
    const ts = students.filter(s => s.teacher_name === teacher)
    const totalSessions = sessions.filter(s => ts.some(st => st.id === s.student_id)).length
    const totalNotes = notes.filter(n => sessions.some(s => s.id === n.session_id && ts.some(st => st.id === s.student_id))).length
    const attendRate = totalNotes > 0
      ? Math.round(notes.filter(n => n.attendance === '정시' && sessions.some(s => s.id === n.session_id && ts.some(st => st.id === s.student_id))).length / totalNotes * 100)
      : null
    return { teacher, count: ts.length, attendRate, totalNotes }
  }).filter(t => t.count > 0)

  function StatBadge({ value, suffix = '%', good = 80 }: { value: number | null; suffix?: string; good?: number }) {
    if (value === null) return <span className="text-xs text-gray-300">-</span>
    return (
      <span className={cx('text-xs font-bold',
        value >= good ? 'text-blue-600' : value >= good * 0.7 ? 'text-gray-500' : 'text-gray-400')}>
        {value}{suffix}
      </span>
    )
  }

  function MiniBar({ rate }: { rate: number | null }) {
    if (rate === null) return <div className="h-1 bg-gray-100 rounded-full w-16" />
    return (
      <div className="h-1 bg-gray-100 rounded-full w-16 overflow-hidden">
        <div className={cx('h-full rounded-full transition-all',
          rate >= 80 ? 'bg-blue-400' : rate >= 50 ? 'bg-gray-300' : 'bg-gray-200')}
          style={{ width: `${rate}%` }} />
      </div>
    )
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="관리자" subtitle={`전체 학생 ${students.length}명`} />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 강사별 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {teacherSummary.map(t => (
            <button key={t.teacher}
              onClick={() => setSelectedTeacher(t.teacher === selectedTeacher ? '전체' : t.teacher)}
              className={cx('rounded-2xl p-3 text-left border transition-all',
                selectedTeacher === t.teacher
                  ? 'bg-[#1a2f5e] text-white border-[#1a2f5e]'
                  : 'bg-white border-gray-100 shadow-sm hover:border-blue-200')}>
              <p className={cx('text-xs font-bold mb-1', selectedTeacher === t.teacher ? 'text-blue-200' : 'text-gray-400')}>
                {t.teacher}
              </p>
              <p className={cx('text-lg font-black', selectedTeacher === t.teacher ? 'text-white' : 'text-gray-800')}>
                {t.count}명
              </p>
              <p className={cx('text-[10px] mt-0.5', selectedTeacher === t.teacher ? 'text-blue-200' : 'text-gray-400')}>
                {t.attendRate != null ? `출석 ${t.attendRate}%` : '수업기록 없음'}
              </p>
            </button>
          ))}
        </div>

        {/* 필터 */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {GRADE_GROUPS.map(g => (
            <button key={g} onClick={() => setSelectedGroup(g)}
              className={cx('px-3 py-1.5 rounded-xl text-xs font-bold border whitespace-nowrap transition-all',
                selectedGroup === g ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-500 border-gray-200')}>
              {g}
              <span className="ml-1 opacity-60">
                {students.filter(s =>
                  (selectedTeacher === '전체' || s.teacher_name === selectedTeacher) &&
                  (g === '전체' || (g === '초등' && s.grade.includes('초')) || (g === '중등' && s.grade.includes('중')) || (g === '고등' && s.grade.includes('고')))
                ).length}
              </span>
            </button>
          ))}
        </div>

        {/* 학생 테이블 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-800">
              {selectedTeacher !== '전체' ? `${selectedTeacher} 선생님` : '전체'} · {filteredStudents.length}명
            </h3>
            <p className="text-[10px] text-gray-400">이번 달 기준</p>
          </div>

          {filteredStudents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">해당하는 학생이 없어요</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['학생', '담당', '수업', '출석률', '과제달성', '학습지', '교재진도'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-gray-400 font-semibold whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredStudents.map(student => {
                    const { total, attendRate, taskRate } = getMonthStats(student.id)
                    const { active, passed, avg } = getWSStats(student.id)
                    const progressRate = getProgressRate(student.id, student.grade)

                    return (
                      <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* 학생 */}
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            <div className={cx('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black text-white shrink-0',
                              student.grade.includes('초') ? 'bg-amber-400' :
                              student.grade.includes('중') ? 'bg-blue-400' : 'bg-slate-500')}>
                              {student.name[0]}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{student.name}</p>
                              <p className="text-gray-400 text-[10px]">{student.grade}</p>
                            </div>
                          </div>
                        </td>
                        {/* 담당 */}
                        <td className="px-3 py-3 text-gray-500 whitespace-nowrap">{student.teacher_name}</td>
                        {/* 수업 횟수 */}
                        <td className="px-3 py-3">
                          <span className={cx('font-bold', total > 0 ? 'text-gray-700' : 'text-gray-300')}>
                            {total}회
                          </span>
                        </td>
                        {/* 출석률 */}
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <StatBadge value={attendRate} />
                            <MiniBar rate={attendRate} />
                          </div>
                        </td>
                        {/* 과제달성 */}
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <StatBadge value={taskRate} />
                            <MiniBar rate={taskRate} />
                          </div>
                        </td>
                        {/* 학습지 */}
                        <td className="px-3 py-3">
                          {active + passed > 0 ? (
                            <div>
                              <p className="font-bold text-gray-700">
                                {avg != null ? `${avg}점` : '-'}
                              </p>
                              <p className="text-[10px] text-gray-400">완료 {passed}개</p>
                            </div>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                        {/* 교재 진도 */}
                        <td className="px-3 py-3">
                          {progressRate !== null ? (
                            <div className="space-y-1">
                              <StatBadge value={progressRate} good={50} />
                              <MiniBar rate={progressRate} />
                            </div>
                          ) : <span className="text-gray-300">-</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
