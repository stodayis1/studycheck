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

const WS_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  assigned:          { label: '과제중',   color: 'text-blue-600',   bg: 'bg-blue-50' },
  submitted:         { label: '제출완료', color: 'text-orange-500', bg: 'bg-orange-50' },
  similar_assigned:  { label: '오답유사', color: 'text-purple-600', bg: 'bg-purple-50' },
  similar_submitted: { label: '유사제출', color: 'text-pink-500',   bg: 'bg-pink-50' },
  scored:            { label: '결과대기', color: 'text-gray-500',   bg: 'bg-gray-50' },
  passed:            { label: '완료✓',   color: 'text-green-600',  bg: 'bg-green-50' },
  retry:             { label: '재도전',   color: 'text-red-500',    bg: 'bg-red-50' },
}

const TB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  assigned:  { label: '과제중',   color: 'text-blue-600',   bg: 'bg-blue-50' },
  submitted: { label: '제출완료', color: 'text-orange-500', bg: 'bg-orange-50' },
  checked:   { label: '채점완료', color: 'text-green-600',  bg: 'bg-green-50' },
}

export default function ParentAssignmentsPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'worksheet' | 'textbook' | 'video'>('worksheet')

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

  function getNoteBySession(sessionId: string) {
    return notes.find((n) => n.session_id === sessionId)
  }

  const activeWS = worksheets.filter((w) => w.status !== 'passed')
  const completedWS = worksheets.filter((w) => w.status === 'passed')
  const activeTB = textbooks.filter((t) => t.status !== 'checked')
  const sessionsWithVideo = sessions.filter((s) => s.video_url)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div>
      <Header title="과제 현황" subtitle={`${studentName} 학생`} />
      <div className="px-4 py-4 space-y-4 pb-10">

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: '학습지 진행', value: activeWS.length, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: '학습지 완료', value: completedWS.length, color: 'text-green-600', bg: 'bg-green-50' },
            { label: '교재 진행', value: activeTB.length, color: 'text-amber-600', bg: 'bg-amber-50' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={cx('rounded-2xl p-3 text-center', bg)}>
              <p className={cx('text-2xl font-black', color)}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'worksheet', label: '📝 학습지' },
            { key: 'textbook',  label: '📖 교재' },
            { key: 'video',     label: '📹 영상' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={cx('px-3 py-2 rounded-xl text-xs font-semibold border transition-all',
                tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 학습지 탭 */}
        {tab === 'worksheet' && (
          <div className="space-y-2">
            {worksheets.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p className="text-sm text-gray-400">학습지 과제가 없어요</p>
              </div>
            ) : worksheets.map((w) => {
              const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
              return (
                <div key={w.id} className={cx('bg-white rounded-2xl border-2 p-3.5 flex items-center gap-3', cfg.bg,
                  w.status === 'submitted' || w.status === 'similar_submitted' ? 'border-orange-200' : 'border-gray-100')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{w.grade_level} {w.unit}</p>
                      <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      {w.worksheet_type === 'similar' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-md">오답유사</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      <span className={cx('font-bold', w.current_level >= 4 ? 'text-orange-500' : 'text-blue-600')}>
                        {w.current_level}레벨
                      </span>
                      {w.score != null && (
                        <span className={cx('ml-2 font-bold',
                          w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                          {w.score}점
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 교재 탭 */}
        {tab === 'textbook' && (
          <div className="space-y-2">
            {textbooks.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p className="text-sm text-gray-400">교재 과제가 없어요</p>
              </div>
            ) : textbooks.map((t) => {
              const cfg = TB_STATUS[t.status] ?? TB_STATUS.assigned
              return (
                <div key={t.id} className={cx('bg-white rounded-2xl border-2 p-3.5 flex items-center gap-3', cfg.bg,
                  t.status === 'submitted' ? 'border-orange-200' : 'border-gray-100')}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-900">{t.textbook_name}</p>
                      <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-600 rounded-md">
                        {t.textbook_type}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(t.assigned_at).toLocaleDateString('ko-KR')} 배정
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 영상 탭 */}
        {tab === 'video' && (
          <div className="space-y-2">
            {sessionsWithVideo.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
                <p className="text-sm text-gray-400">영상 과제가 없어요</p>
              </div>
            ) : sessionsWithVideo.map((s) => {
              const note = getNoteBySession(s.id)
              return (
                <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-3.5 flex items-center gap-3">
                  <span className="text-2xl shrink-0">📹</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900">{s.session_date}</p>
                    {s.today_textbook_name && (
                      <p className="text-xs text-gray-400 mt-0.5">{s.today_textbook_name}</p>
                    )}
                  </div>
                  <span className={cx('text-[10px] font-bold px-2 py-1 rounded-full shrink-0',
                    note?.video_completed_at ? 'bg-green-100 text-green-600' :
                    note?.video_started_at ? 'bg-blue-100 text-blue-600' :
                    'bg-gray-100 text-gray-400')}>
                    {note?.video_completed_at ? '시청완료✓' : note?.video_started_at ? '시청중' : '미시청'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
