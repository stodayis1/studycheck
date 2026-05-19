'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'

interface StudentInfo {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface ClassSession {
  id: string
  session_date: string
  today_textbook_name: string | null
  today_chapter: string | null
  video_url: string | null
  progress_content: string | null
  daily_test_unit: string | null
  daily_test_score: number | null
  hw_textbook_name: string | null
  hw_textbook_page: string | null
  hw_worksheet_range: string | null
}

interface LearningNote {
  id: string
  session_id: string
  video_started_at: string | null
  video_completed_at: string | null
}

interface StudentWorksheet {
  id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  status: string
  worksheet_type: string
  score: number | null
  memo: string | null
  assigned_at: string
}

interface StudentTextbook {
  id: string
  concept_id: string | null
  textbook_name: string
  textbook_type: string
  status: string
  memo: string | null
  assigned_at: string
}

const WS_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  assigned:          { label: '과제중',   color: 'text-blue-600',   bg: 'bg-blue-50' },
  submitted:         { label: '제출완료', color: 'text-orange-500', bg: 'bg-orange-50' },
  similar_assigned:  { label: '오답유사', color: 'text-purple-600', bg: 'bg-purple-50' },
  similar_submitted: { label: '유사제출', color: 'text-pink-500',   bg: 'bg-pink-50' },
  passed:            { label: '완료✓',   color: 'text-green-600',  bg: 'bg-green-50' },
}

export default function StudentDashboardPage() {
  const router = useRouter()
  const [student, setStudent] = useState<StudentInfo | null>(null)
  const [todaySession, setTodaySession] = useState<ClassSession | null>(null)
  const [todayNote, setTodayNote] = useState<LearningNote | null>(null)
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const session = JSON.parse(stored)
        setStudentId(session.id)

        const { data: studentData } = await supabase
          .from('students').select('*').eq('id', session.id).single()
        if (!studentData) { router.push('/auth/login'); return }
        setStudent(studentData)

        await fetchData(session.id)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  async function fetchData(sid: string) {
    const [{ data: ssData }, { data: wsData }, { data: tbData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', sid).eq('session_date', todayStr).single(),
      supabase.from('student_worksheets').select('*').eq('student_id', sid).not('status', 'in', '("passed")').order('assigned_at', { ascending: false }),
      supabase.from('student_textbooks').select('*').eq('student_id', sid).not('status', 'in', '("checked")').order('assigned_at', { ascending: false }),
    ])

    if (ssData) {
      setTodaySession(ssData)
      // 오늘 배움노트
      const { data: noteData } = await supabase
        .from('learning_notes').select('*').eq('session_id', ssData.id).single()
      if (noteData) setTodayNote(noteData)
    }
    if (wsData) setWorksheets(wsData)
    if (tbData) setTextbooks(tbData)
  }

  // 영상 시작
  async function handleVideoStart() {
    if (!todaySession || !studentId) return
    const now = new Date().toISOString()
    if (todayNote) {
      await supabase.from('learning_notes').update({ video_started_at: now }).eq('id', todayNote.id)
      setTodayNote({ ...todayNote, video_started_at: now })
    } else {
      const { data } = await supabase.from('learning_notes').insert({
        student_id: studentId, session_id: todaySession.id,
        attendance: '정시', worksheet_submitted: false,
        textbook_submitted: false, workbook_done: false,
        video_started_at: now,
      }).select().single()
      if (data) setTodayNote(data)
    }
    window.open(todaySession.video_url!, '_blank')
  }

  // 영상 완료
  async function handleVideoComplete() {
    if (!todayNote || !studentId) return
    const now = new Date().toISOString()
    await supabase.from('learning_notes').update({ video_completed_at: now }).eq('id', todayNote.id)
    setTodayNote({ ...todayNote, video_completed_at: now })
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!student) return null

  const isElementary = student.grade.includes('초')
  const hasVideoTask = !!todaySession?.video_url
  const videoStarted = !!todayNote?.video_started_at
  const videoCompleted = !!todayNote?.video_completed_at

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="오늘 과제" subtitle={`${student.name} 학생`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-4">

        {/* 학생 프로필 */}
        <div className="bg-gradient-to-r from-[#1a2f5e] to-blue-500 rounded-2xl p-4 text-white flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
            <span className="text-xl font-black">{student.name[0]}</span>
          </div>
          <div>
            <p className="font-black text-base">{student.name}</p>
            <p className="text-blue-100 text-xs">{student.school} · {student.grade}</p>
            <p className="text-blue-200 text-xs mt-0.5">{todayStr} 과제</p>
          </div>
        </div>

        {/* 수업 과제 (선생님이 수업일지에서 배부한 것) */}
        {todaySession && (todaySession.hw_textbook_name || todaySession.hw_worksheet_range) && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-base">📋</span>
              <h3 className="text-sm font-bold text-gray-800">오늘 배부된 과제</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {/* 진도 내용 */}
              {todaySession.progress_content && (
                <div className="px-4 py-3">
                  <p className="text-xs text-gray-400 mb-0.5">오늘 진도</p>
                  <p className="text-sm font-semibold text-gray-700">{todaySession.progress_content}</p>
                </div>
              )}
              {/* 교재 과제 */}
              {todaySession.hw_textbook_name && (
                <div className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">📖</span>
                  <div>
                    <p className="text-xs text-gray-400">교재 과제</p>
                    <p className="text-sm font-bold text-gray-800">{todaySession.hw_textbook_name}</p>
                    {todaySession.hw_textbook_page && (
                      <p className="text-xs text-gray-500 mt-0.5">{todaySession.hw_textbook_page}</p>
                    )}
                  </div>
                </div>
              )}
              {/* 학습지 과제 */}
              {todaySession.hw_worksheet_range && (
                <div className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">📝</span>
                  <div>
                    <p className="text-xs text-gray-400">학습지 과제</p>
                    <p className="text-sm font-bold text-gray-800">{todaySession.hw_worksheet_range}</p>
                  </div>
                </div>
              )}
              {/* 데일리 테스트 결과 */}
              {todaySession.daily_test_unit && (
                <div className="px-4 py-3 flex items-center gap-3">
                  <span className="text-xl">📊</span>
                  <div>
                    <p className="text-xs text-gray-400">데일리 테스트</p>
                    <p className="text-sm font-bold text-gray-800">{todaySession.daily_test_unit}</p>
                    {todaySession.daily_test_score != null && (
                      <p className={cx('text-sm font-black mt-0.5',
                        todaySession.daily_test_score >= 90 ? 'text-green-600' :
                        todaySession.daily_test_score >= 70 ? 'text-blue-600' : 'text-red-500')}>
                        {todaySession.daily_test_score}점
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 영상 과제 */}
        {hasVideoTask && (
          <div className={cx('rounded-2xl p-4 border-2',
            videoCompleted ? 'bg-green-50 border-green-200' :
            videoStarted ? 'bg-blue-50 border-blue-200' :
            'bg-white border-gray-100 shadow-sm')}>
            <div className="flex items-center gap-3 mb-3">
              <span className="text-2xl">📹</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">영상 과제</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {videoCompleted ? '✅ 시청 완료!' :
                   videoStarted ? '▶ 시청 중...' :
                   '아직 시청 안 했어요'}
                </p>
              </div>
              {videoCompleted && (
                <span className="text-xs font-bold px-2 py-1 bg-green-100 text-green-700 rounded-full">완료</span>
              )}
            </div>
            <div className="flex gap-2">
              {!videoStarted ? (
                <button onClick={handleVideoStart}
                  className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl text-sm">
                  ▶ 영상 시작하기
                </button>
              ) : !videoCompleted ? (
                <>
                  <button onClick={() => window.open(todaySession!.video_url!, '_blank')}
                    className="flex-1 py-3 bg-blue-100 text-blue-600 font-bold rounded-xl text-sm">
                    ▶ 다시 보기
                  </button>
                  <button onClick={handleVideoComplete}
                    className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl text-sm">
                    ✅ 시청 완료
                  </button>
                </>
              ) : (
                <button onClick={() => window.open(todaySession!.video_url!, '_blank')}
                  className="flex-1 py-3 bg-gray-100 text-gray-500 font-bold rounded-xl text-sm">
                  다시 보기
                </button>
              )}
            </div>
          </div>
        )}

        {/* 학습지 과제 */}
        {worksheets.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-base">📝</span>
              <h3 className="text-sm font-bold text-gray-800">레벨학습지 과제</h3>
              <span className="text-xs text-gray-400 ml-auto">{worksheets.length}개</span>
            </div>
            <div className="divide-y divide-gray-50">
              {worksheets.map((w) => {
                const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                return (
                  <div key={w.id} className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cx('text-xs font-bold px-2 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                        {cfg.label}
                      </span>
                      {w.worksheet_type === 'similar' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-md">오답유사</span>
                      )}
                      <span className={cx('text-xs font-black ml-auto', w.current_level >= 4 ? 'text-orange-500' : 'text-blue-600')}>
                        {w.current_level}레벨
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-800">
                      {w.grade_level} {w.unit}
                      {w.unit_name && <span className="font-normal text-gray-500"> · {w.unit_name}</span>}
                    </p>
                    {w.memo && <p className="text-xs text-blue-500 mt-0.5">{w.memo}</p>}
                    {w.score != null && (
                      <p className={cx('text-sm font-black mt-1',
                        w.score >= 85 ? 'text-green-600' : w.score >= 80 ? 'text-yellow-600' : 'text-red-500')}>
                        {w.score}점
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 교재 과제 */}
        {textbooks.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-2">
              <span className="text-base">📖</span>
              <h3 className="text-sm font-bold text-gray-800">교재 과제</h3>
              <span className="text-xs text-gray-400 ml-auto">{textbooks.length}개</span>
            </div>
            <div className="divide-y divide-gray-50">
              {textbooks.map((t) => (
                <div key={t.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-md',
                        t.textbook_type === '개념서' ? 'bg-blue-100 text-blue-700' :
                        t.textbook_type === '유형서' ? 'bg-green-100 text-green-700' :
                        t.textbook_type === '심화서' ? 'bg-orange-100 text-orange-700' :
                        'bg-purple-100 text-purple-700')}>
                        {t.textbook_type}
                      </span>
                      <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                        t.status === 'submitted' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-600')}>
                        {t.status === 'submitted' ? '제출완료' : '과제중'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-gray-800">{t.textbook_name}</p>
                    {t.memo && <p className="text-xs text-gray-400 mt-0.5">{t.memo}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 과제 없음 */}
        {!hasVideoTask && worksheets.length === 0 && textbooks.length === 0 && !todaySession?.hw_textbook_name && !todaySession?.hw_worksheet_range && (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-sm font-bold text-gray-600">오늘 과제가 없어요!</p>
            <p className="text-xs text-gray-400 mt-1">선생님이 과제를 배정하면 여기에 나타나요</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-300 pb-2">
          배움노트는 학원에서 작성해주세요 📓
        </p>
      </div>
    </div>
  )
}
