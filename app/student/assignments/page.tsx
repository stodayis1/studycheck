'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface StudentWorksheet {
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

interface StudentTextbook {
  id: string
  concept_id: string
  textbook_name: string
  textbook_type: string
  status: string
  assigned_at: string
}

interface ClassSession {
  id: string
  session_date: string
  session_type: string
  today_textbook_name: string | null
  today_chapter: string | null
  video_url: string | null
}

interface LearningNote {
  id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  textbook_submitted: boolean
  workbook_done: boolean
  video_started_at: string | null
  video_completed_at: string | null
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

export default function StudentAssignmentsPage() {
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentGrade, setStudentGrade] = useState('')
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)
        setStudentId(session.id)

        const { data: studentData } = await supabase
          .from('students').select('grade').eq('id', session.id).single()
        if (studentData) setStudentGrade(studentData.grade)

        const [{ data: wsData }, { data: tbData }, { data: ssData }, { data: nData }] = await Promise.all([
          supabase.from('student_worksheets').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('student_textbooks').select('*').eq('student_id', session.id).order('assigned_at', { ascending: false }),
          supabase.from('class_sessions').select('*').eq('student_id', session.id).order('session_date', { ascending: false }),
          supabase.from('learning_notes').select('*').eq('student_id', session.id),
        ])
        if (wsData) setWorksheets(wsData)
        if (tbData) setTextbooks(tbData)
        if (ssData) setSessions(ssData)
        if (nData) setNotes(nData)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  // 달력 계산
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = new Date().toISOString().split('T')[0]

  // 날짜별 과제 현황
  function getDayData(dateStr: string) {
    const session = sessions.find((s) => s.session_date === dateStr)
    const note = session ? notes.find((n) => n.session_id === session.id) : null
    const ws = worksheets.filter((w) => w.assigned_at.startsWith(dateStr))
    const tb = textbooks.filter((t) => t.assigned_at.startsWith(dateStr))

    return { session, note, ws, tb, hasData: !!(session || ws.length > 0 || tb.length > 0) }
  }

  // 선택된 날짜 데이터
  const selectedData = selectedDate ? getDayData(selectedDate) : null

  const isElementary = studentGrade.includes('초')

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="전체 과제" subtitle="달력으로 확인하세요" />
      <div className="px-4 py-4 space-y-4 pb-10">

        {/* 달력 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {/* 달력 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
              ‹
            </button>
            <p className="text-sm font-bold text-gray-800">{year}년 {MONTHS[month]}</p>
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500">
              ›
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 px-2 pt-2">
            {DAYS.map((d) => (
              <div key={d} className="text-center text-[10px] font-bold text-gray-400 pb-1">{d}</div>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="grid grid-cols-7 px-2 pb-3">
            {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(day).padStart(2,'0')}`
              const data = getDayData(dateStr)
              const isToday = dateStr === todayStr
              const isSelected = dateStr === selectedDate

              // 도트 표시
              const dots = []
              if (data.session) {
                const note = data.note
                if (data.session.video_url) dots.push({ color: note?.video_completed_at ? '#10b981' : note?.video_started_at ? '#3b82f6' : '#d1d5db' })
              }
              if (data.ws.length > 0) {
                const allDone = data.ws.every((w) => w.status === 'passed')
                dots.push({ color: allDone ? '#10b981' : '#3b82f6' })
              }
              if (data.tb.length > 0) {
                const allDone = data.tb.every((t) => t.status === 'checked')
                dots.push({ color: allDone ? '#10b981' : '#f59e0b' })
              }
              if (data.session) {
                const note = data.note
                if (note?.workbook_done !== undefined) {
                  dots.push({ color: note.workbook_done ? '#10b981' : '#ef4444' })
                }
              }

              return (
                <div key={dateStr} onClick={() => data.hasData ? setSelectedDate(dateStr === selectedDate ? null : dateStr) : null}
                  className={cx('flex flex-col items-center py-1 rounded-lg transition-all',
                    data.hasData ? 'cursor-pointer hover:bg-gray-50' : '',
                    isSelected ? 'bg-blue-50' : '')}>
                  <span className={cx('text-xs w-7 h-7 flex items-center justify-center rounded-full font-semibold',
                    isToday ? 'bg-blue-600 text-white font-black' :
                    isSelected ? 'text-blue-600 font-bold' :
                    'text-gray-700')}>
                    {day}
                  </span>
                  {dots.length > 0 && (
                    <div className="flex gap-0.5 mt-0.5">
                      {dots.slice(0, 3).map((dot, idx) => (
                        <span key={idx} className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: dot.color }} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 범례 */}
          <div className="px-4 pb-3 flex gap-3 flex-wrap">
            {[
              { color: '#3b82f6', label: '진행중' },
              { color: '#10b981', label: '완료' },
              { color: '#f59e0b', label: '교재' },
              { color: '#ef4444', label: '미완료' },
              { color: '#d1d5db', label: '미시청' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[10px] text-gray-400">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 선택된 날짜 상세 */}
        {selectedDate && selectedData && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
              <p className="text-sm font-bold text-blue-800">{selectedDate} 과제 현황</p>
            </div>
            <div className="p-4 space-y-3">

              {/* 수업/영상 */}
              {selectedData.session && (
                <div className="space-y-2">
                  {selectedData.session.today_textbook_name && (
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <span>📖</span>
                      <span>{selectedData.session.today_textbook_name} · {selectedData.session.today_chapter}</span>
                    </div>
                  )}
                  {selectedData.session.video_url && (
                    <div className={cx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold',
                      selectedData.note?.video_completed_at ? 'bg-green-50 text-green-700' :
                      selectedData.note?.video_started_at ? 'bg-blue-50 text-blue-600' :
                      'bg-gray-50 text-gray-400')}>
                      <span>📹</span>
                      <span>영상 과제 {selectedData.note?.video_completed_at ? '✅ 완료' : selectedData.note?.video_started_at ? '▶ 시청중' : '미시청'}</span>
                    </div>
                  )}
                  {selectedData.note && (
                    <div className="flex flex-wrap gap-2">
                      <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                        selectedData.note.worksheet_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                        📝 학습지 {selectedData.note.worksheet_submitted ? '제출✓' : '미제출'}
                      </span>
                      <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                        selectedData.note.textbook_submitted ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                        📖 교재 {selectedData.note.textbook_submitted ? '제출✓' : '미제출'}
                      </span>
                      {isElementary && (
                        <span className={cx('text-[10px] font-bold px-2 py-1 rounded-lg',
                          selectedData.note.workbook_done ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-500')}>
                          🔢 연산서 {selectedData.note.workbook_done ? '완료✓' : '미완료'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* 학습지 */}
              {selectedData.ws.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-gray-500">📝 학습지</p>
                  {selectedData.ws.map((w) => (
                    <div key={w.id} className={cx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs',
                      w.status === 'passed' ? 'bg-green-50' : 'bg-blue-50')}>
                      <span className={cx('font-bold', w.current_level >= 4 ? 'text-orange-500' : 'text-blue-600')}>
                        {w.current_level}레벨
                      </span>
                      <span className="text-gray-600">{w.grade_level} {w.unit}</span>
                      <span className={cx('ml-auto font-bold text-[10px]',
                        w.status === 'passed' ? 'text-green-600' :
                        w.status === 'submitted' ? 'text-orange-500' : 'text-blue-600')}>
                        {w.status === 'passed' ? '완료✓' : w.status === 'submitted' ? '제출완료' : '진행중'}
                      </span>
                      {w.score != null && <span className={cx('font-black text-xs', w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>{w.score}점</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 교재 */}
              {selectedData.tb.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold text-gray-500">📖 교재</p>
                  {selectedData.tb.map((t) => (
                    <div key={t.id} className={cx('flex items-center gap-2 px-3 py-2 rounded-xl text-xs',
                      t.status === 'checked' ? 'bg-green-50' : 'bg-amber-50')}>
                      <span className="text-gray-600">{t.textbook_name}</span>
                      <span className={cx('ml-auto font-bold text-[10px]',
                        t.status === 'checked' ? 'text-green-600' :
                        t.status === 'submitted' ? 'text-orange-500' : 'text-blue-600')}>
                        {t.status === 'checked' ? '채점완료✓' : t.status === 'submitted' ? '제출완료' : '진행중'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {!selectedData.session && selectedData.ws.length === 0 && selectedData.tb.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-2">이 날은 과제가 없어요</p>
              )}
            </div>
          </div>
        )}

        {/* 진행중인 과제 요약 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3">📋 현재 진행중인 과제</h3>
          <div className="space-y-2">
            {worksheets.filter((w) => !['passed'].includes(w.status)).slice(0, 3).map((w) => (
              <div key={w.id} className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-xl">
                <span className="text-xs font-bold text-blue-600">{w.current_level}레벨</span>
                <span className="text-xs text-gray-600">{w.grade_level} {w.unit}</span>
                <span className={cx('ml-auto text-[10px] font-bold',
                  w.status === 'submitted' ? 'text-orange-500' : 'text-blue-600')}>
                  {w.status === 'submitted' ? '채점대기' : w.status === 'similar_assigned' ? '오답유사' : '과제중'}
                </span>
              </div>
            ))}
            {worksheets.filter((w) => !['passed'].includes(w.status)).length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">진행중인 학습지가 없어요 🎉</p>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
