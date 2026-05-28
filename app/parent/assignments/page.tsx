'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'

interface ClassSession {
  id: string
  session_date: string
  progress_content: string | null
  hw_textbook_name: string | null
  hw_textbook_page: string | null
  hw_worksheet_range: string | null
  video_url: string | null
  daily_test_unit: string | null
  daily_test_score: number | null
}

interface LearningNote {
  id: string
  session_id: string
  attendance: string
  worksheet_submitted: boolean
  worksheet_score: number | null
}

interface StudentWorksheet {
  id: string
  grade_level: string
  unit: string
  unit_name: string
  current_level: number
  worksheet_type: string
  status: string
  score: number | null
  assigned_at: string
}

interface VideoWatchLog {
  id: string
  session_id: string
  video_url: string
  watch_seconds: number
}

const DAYS = ['일','월','화','수','목','금','토']

function formatSeconds(sec: number): string {
  if (sec === 0) return '미시청'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  if (m === 0) return `${s}초`
  return s > 0 ? `${m}분 ${s}초` : `${m}분`
}

export default function ParentAssignmentsPage() {
  const router = useRouter()
  const [studentName, setStudentName] = useState('')
  const [sessions, setSessions] = useState<ClassSession[]>([])
  const [notes, setNotes] = useState<LearningNote[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [videoLogs, setVideoLogs] = useState<VideoWatchLog[]>([])
  const [loading, setLoading] = useState(true)
  const [monthTab, setMonthTab] = useState<'this' | 'last'>('this')

  const today = new Date()
  const thisMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthStr = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`

  useEffect(() => {
    async function init() {
      try {
        const stored = sessionStorage.getItem('studycheck_student')
        if (!stored) { router.push('/auth/login'); return }
        const s = JSON.parse(stored)

        const { data: studentData } = await supabase
          .from('students').select('name').eq('id', s.id).single()
        if (studentData) setStudentName(studentData.name)

        // 2개월치 데이터
        const twoMonthsAgo = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`

        const [{ data: ssData }, { data: wsData }, { data: vlData }] = await Promise.all([
          supabase.from('class_sessions').select('*')
            .eq('student_id', s.id)
            .gte('session_date', twoMonthsAgo)
            .order('session_date', { ascending: false }),
          supabase.from('student_worksheets').select('*')
            .eq('student_id', s.id)
            .gte('assigned_at', twoMonthsAgo)
            .order('assigned_at', { ascending: false }),
          supabase.from('video_watch_logs').select('*')
            .eq('student_id', s.id),
        ])

        if (ssData) {
          setSessions(ssData)
          const ids = ssData.map(s => s.id)
          if (ids.length > 0) {
            const { data: nData } = await supabase
              .from('learning_notes').select('*').in('session_id', ids)
            if (nData) setNotes(nData)
          }
        }
        if (wsData) setWorksheets(wsData)
        if (vlData) setVideoLogs(vlData)
      } catch { router.push('/auth/login') }
      setLoading(false)
    }
    init()
  }, [])

  const currentMonthStr = monthTab === 'this' ? thisMonthStr : lastMonthStr
  const currentMonthLabel = monthTab === 'this'
    ? `${today.getMonth() + 1}월`
    : `${lastMonth.getMonth() + 1}월`

  // 해당 월 수업일 필터 (과제가 있는 날만)
  const monthSessions = sessions.filter(s => {
    const hasTask = s.hw_textbook_name || s.hw_worksheet_range || s.video_url
    return s.session_date.startsWith(currentMonthStr) && hasTask
  })

  function getNoteForSession(sessionId: string) {
    return notes.find(n => n.session_id === sessionId)
  }

  function getWorksheetsForDate(dateStr: string) {
    return worksheets.filter(w => w.assigned_at?.startsWith(dateStr))
  }

  function getVideoLogsForSession(sessionId: string) {
    return videoLogs.filter(v => v.session_id === sessionId)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <span className="w-8 h-8 border-2 border-[#F5C4B3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="과제 현황" subtitle={`${studentName} 학생`} />

      <div className="max-w-lg mx-auto px-4 pt-4 pb-28 space-y-3">

        {/* 월 탭 */}
        <div className="flex rounded-xl overflow-hidden" style={{ background: '#f3f4f6' }}>
          {([['this', `${today.getMonth() + 1}월 (이번달)`], ['last', `${lastMonth.getMonth() + 1}월 (지난달)`]] as const).map(([tab, label]) => (
            <button key={tab} onClick={() => setMonthTab(tab)}
              className="flex-1 py-2.5 text-sm font-bold transition-all"
              style={monthTab === tab
                ? { background: '#F5C4B3', color: '#712B13' }
                : { background: 'transparent', color: '#9ca3af' }}>
              {label}
            </button>
          ))}
        </div>

        {/* 날짜별 과제 카드 */}
        {monthSessions.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-10 text-center">
            <i className="ti ti-clipboard-list" style={{ fontSize: 36, color: '#F5C4B3', display: 'block', marginBottom: 8 }} />
            <p className="text-sm font-bold text-gray-600">{currentMonthLabel} 과제 기록이 없어요</p>
          </div>
        ) : (
          monthSessions.map(session => {
            const note = getNoteForSession(session.id)
            const dayWS = getWorksheetsForDate(session.session_date)
            const videoLogs = getVideoLogsForSession(session.id)
            const videoUrls = session.video_url
              ? session.video_url.split('\n').filter(Boolean)
              : []

            const d = new Date(session.session_date)
            const dateLabel = `${d.getMonth() + 1}/${d.getDate()} (${DAYS[d.getDay()]})`
            const isToday = session.session_date === new Date().toISOString().split('T')[0]

            return (
              <div key={session.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

                {/* 날짜 헤더 */}
                <div className="px-4 py-3 flex items-center gap-2" style={{ background: '#f5f5f4', borderBottom: '1px solid #f0f0f0' }}>
                  <span className="text-sm font-black text-gray-800">{dateLabel}</span>
                  {isToday && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: '#F5C4B3', color: '#712B13' }}>오늘</span>
                  )}
                  {note && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-auto"
                      style={{
                        background: note.attendance === '정시' ? '#EAF3DE' : note.attendance === '지각' ? '#FAEEDA' : '#fee2e2',
                        color: note.attendance === '정시' ? '#27500A' : note.attendance === '지각' ? '#633806' : '#991b1b'
                      }}>
                      {note.attendance}
                    </span>
                  )}
                </div>

                <div className="divide-y divide-gray-50">

                  {/* 교재 과제 */}
                  {session.hw_textbook_name && (() => {
                    const bookNames = session.hw_textbook_name!.split(',').map(s => s.trim())
                    return (
                      <div className="px-4 py-3">
                        <div className="flex items-center gap-1.5 mb-2">
                          <i className="ti ti-book" style={{ fontSize: 13, color: '#993C1D' }} />
                          <span className="text-[10px] font-semibold" style={{ color: '#993C1D' }}>교재 과제</span>
                        </div>
                        <div className="space-y-1.5">
                          {bookNames.map((name, i) => {
                            const pageEntry = session.hw_textbook_page
                              ? session.hw_textbook_page.split('/').find(p => p.includes(name))
                              : null
                            const pageOnly = pageEntry ? pageEntry.split('·').slice(-1)[0]?.trim() : null
                            return (
                              <div key={i} className="flex items-center justify-between">
                                <p className="text-sm font-bold text-gray-800">{name}</p>
                                {pageOnly && (
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                                    style={{ background: '#FAECE7', color: '#993C1D' }}>
                                    {pageOnly}
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* 학습지 과제 */}
                  {(session.hw_worksheet_range || dayWS.length > 0) && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <i className="ti ti-file-text" style={{ fontSize: 13, color: '#993C1D' }} />
                        <span className="text-[10px] font-semibold" style={{ color: '#993C1D' }}>학습지 과제</span>
                        {note && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full ml-auto"
                            style={{
                              background: note.worksheet_submitted ? '#EAF3DE' : '#fee2e2',
                              color: note.worksheet_submitted ? '#27500A' : '#991b1b'
                            }}>
                            {note.worksheet_submitted ? '제출완료' : '미제출'}
                            {note.worksheet_score != null && ` · ${note.worksheet_score}점`}
                          </span>
                        )}
                      </div>
                      {/* 수업일지 기반 범위 */}
                      {session.hw_worksheet_range && (
                        <p className="text-sm font-bold text-gray-800 mb-1.5">{session.hw_worksheet_range}</p>
                      )}
                      {/* 배정된 학습지 상세 */}
                      {dayWS.length > 0 && (
                        <div className="space-y-1.5">
                          {dayWS.map(w => (
                            <div key={w.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                              style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                              <div>
                                <p className="text-xs font-bold text-gray-800">
                                  {w.grade_level} {w.unit}
                                  {w.unit_name && <span className="font-normal text-gray-400 ml-1">{w.unit_name}</span>}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {w.worksheet_type === 'similar' ? '오답유사 · ' : ''}{w.current_level}레벨
                                </p>
                              </div>
                              <div className="text-right">
                                {w.score != null ? (
                                  <span className="text-sm font-black" style={{
                                    color: w.score >= 85 ? '#27500A' : w.score >= 70 ? '#633806' : '#991b1b'
                                  }}>{w.score}점</span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                                    style={{
                                      background: w.status === 'passed' ? '#F5C4B3' : '#f3f4f6',
                                      color: w.status === 'passed' ? '#712B13' : '#9ca3af'
                                    }}>
                                    {w.status === 'passed' ? '완료' : w.status === 'submitted' ? '채점대기' : '진행중'}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 영상 과제 */}
                  {videoUrls.length > 0 && (
                    <div className="px-4 py-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <i className="ti ti-player-play" style={{ fontSize: 13, color: '#993C1D' }} />
                        <span className="text-[10px] font-semibold" style={{ color: '#993C1D' }}>영상 과제</span>
                        <span className="text-[10px] text-gray-400">{videoUrls.length}개</span>
                      </div>
                      <div className="space-y-2">
                        {videoUrls.map((url, idx) => {
                          const log = videoLogs.find(v => v.video_url === url)
                          const watched = log?.watch_seconds ?? 0
                          return (
                            <div key={idx} className="rounded-lg px-3 py-2.5 flex items-center gap-2"
                              style={{ background: '#fafafa', border: '1px solid #f0f0f0' }}>
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                style={{ background: '#FAECE7', color: '#993C1D' }}>
                                {idx + 1}
                              </div>
                              <p className="text-xs text-gray-500 flex-1 truncate">{url}</p>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                                style={{
                                  background: watched > 0 ? '#EAF3DE' : '#f3f4f6',
                                  color: watched > 0 ? '#27500A' : '#9ca3af'
                                }}>
                                {watched > 0 ? formatSeconds(watched) : '미시청'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
