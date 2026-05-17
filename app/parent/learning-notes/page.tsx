'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface ClassSession {
  id: string
  session_date: string
  session_type: string
  today_textbook_name: string | null
  today_chapter: string | null
}

interface LearningNote {
  id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
  textbook_submitted: boolean
  textbook_page: string | null
  workbook_done: boolean
  memo: string | null
}

export default function ParentLearningNotesPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)

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

        const [{ data: ssData }, { data: nData }] = await Promise.all([
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
        ])
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
      } catch {
        router.push('/auth/login')
      }
      setLoading(false)
    }
    init()
  }, [])

  function getNoteBySession(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  const isElementary = studentGrade.includes('초')

  // 출석 통계
  const allNotes = notes
  const attendanceStats = {
    total: allNotes.length,
    정시: allNotes.filter((n) => n.attendance === '정시').length,
    지각: allNotes.filter((n) => n.attendance === '지각').length,
    결석: allNotes.filter((n) => n.attendance === '결석').length,
  }

  // 과제 달성률
  const submittedNotes = allNotes.filter((n) => n.attendance !== '결석')
  const wsRate = submittedNotes.length > 0
    ? Math.round(submittedNotes.filter((n) => n.worksheet_submitted).length / submittedNotes.length * 100) : 0
  const tbRate = submittedNotes.length > 0
    ? Math.round(submittedNotes.filter((n) => n.textbook_submitted).length / submittedNotes.length * 100) : 0
  const wbRate = submittedNotes.length > 0
    ? Math.round(submittedNotes.filter((n) => n.workbook_done).length / submittedNotes.length * 100) : 0

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="배움노트" subtitle={`${studentName} 학생 수업 기록`} />
      <div className="px-4 py-4 space-y-4 pb-10">

        {/* 통계 카드 */}
        {allNotes.length > 0 && (
          <>
            {/* 출석 현황 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">📅 출석 현황</h3>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '정시', value: attendanceStats.정시, color: 'text-green-600', bg: 'bg-green-50' },
                  { label: '지각', value: attendanceStats.지각, color: 'text-yellow-600', bg: 'bg-yellow-50' },
                  { label: '결석', value: attendanceStats.결석, color: 'text-red-500', bg: 'bg-red-50' },
                ].map((item) => (
                  <div key={item.label} className={cx('rounded-xl p-3 text-center', item.bg)}>
                    <p className={cx('text-2xl font-black', item.color)}>{item.value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* 과제 달성률 */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-800 mb-3">📊 과제 달성률</h3>
              <div className="space-y-3">
                {[
                  { label: '📝 학습지', rate: wsRate },
                  { label: '📖 교재', rate: tbRate },
                  ...(isElementary ? [{ label: '🔢 연산서', rate: wbRate }] : []),
                ].map((item) => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-semibold text-gray-600">{item.label}</span>
                      <span className={cx('font-bold',
                        item.rate >= 80 ? 'text-green-600' : item.rate >= 60 ? 'text-yellow-600' : 'text-red-500')}>
                        {item.rate}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={cx('h-full rounded-full transition-all',
                          item.rate >= 80 ? 'bg-green-500' : item.rate >= 60 ? 'bg-yellow-400' : 'bg-red-400')}
                        style={{ width: `${item.rate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* 수업별 배움노트 */}
        <h3 className="text-sm font-bold text-gray-700 px-1">수업 기록</h3>

        {sessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-3xl mb-3">📓</p>
            <p className="text-sm font-semibold text-gray-600">아직 수업 기록이 없어요</p>
          </div>
        ) : (
          sessions.map((session) => {
            const note = getNoteBySession(session.id)
            const isToday = session.session_date === new Date().toISOString().split('T')[0]

            return (
              <div key={session.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* 수업 헤더 */}
                <div className={cx('px-4 py-3 flex items-center gap-2 flex-wrap', isToday ? 'bg-blue-50' : 'bg-gray-50')}>
                  <p className="text-sm font-bold text-gray-900">{session.session_date}</p>
                  {isToday && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded-full">오늘</span>}
                  {session.session_type === '추가' && <span className="text-[10px] font-bold px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded-full">추가수업</span>}
                  {note && (
                    <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto',
                      note.attendance === '결석' ? 'bg-red-100 text-red-600' :
                      note.attendance === '지각' ? 'bg-yellow-100 text-yellow-600' :
                      'bg-green-100 text-green-600')}>
                      {note.attendance}
                    </span>
                  )}
                  {!note && <span className="text-[10px] text-gray-400 ml-auto">미작성</span>}
                </div>

                {/* 수업 내용 */}
                {session.today_textbook_name && (
                  <div className="px-4 pt-2 pb-1">
                    <p className="text-xs text-gray-500">
                      📖 {session.today_textbook_name}
                      {session.today_chapter && ` · ${session.today_chapter}`}
                    </p>
                  </div>
                )}

                {/* 배움노트 내용 */}
                {note ? (
                  <div className="px-4 py-3 flex flex-wrap gap-2">
                    <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                      note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                      📝 학습지 {note.worksheet_submitted
                        ? `제출${note.worksheet_score != null ? ` · ${note.worksheet_score}점` : ''}`
                        : '미제출'}
                    </span>
                    <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                      note.textbook_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                      📖 교재 {note.textbook_submitted
                        ? `제출${note.textbook_page ? ` · p.${note.textbook_page}` : ''}`
                        : '미제출'}
                    </span>
                    {isElementary && (
                      <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                        note.workbook_done ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                        🔢 연산서 {note.workbook_done ? '완료' : '미완료'}
                      </span>
                    )}
                    {note.memo && (
                      <p className="w-full text-xs text-gray-400 mt-1">💬 {note.memo}</p>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-400">배움노트 미작성</p>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
