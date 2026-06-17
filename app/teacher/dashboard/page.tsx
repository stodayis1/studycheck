'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

const DAYS = ['일','월','화','수','목','금','토']

export default function TeacherDashboardPage() {
  const { currentUser, isAdmin } = useAuth()
  const [stats, setStats] = useState({
    todayStudents: 0, unwrittenNotes: 0, pendingScore: 0, pendingShare: 0,
    activeWorksheets: 0, activeTextbooks: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (currentUser) fetchStats() }, [currentUser])

  async function fetchStats() {
    setLoading(true)
    const todayDay = DAYS[new Date().getDay()]
    const todayStr = new Date().toISOString().split('T')[0]
    let q = supabase.from('students').select('id').eq('is_active', true)
    if (!isAdmin() && currentUser?.name) q = q.ilike('teacher_name', `%${currentUser.name}%`)
    const { data: myStudents } = await q
    const myIds = new Set(myStudents?.map((s: any) => s.id) ?? [])
    const { data: todaySch } = await supabase.from('schedules').select('student_id').eq('day_of_week', todayDay).eq('is_active', true)
    const todayStudents = (todaySch ?? []).filter((s: any) => myIds.has(s.student_id)).length
    const { data: sessions } = await supabase.from('class_sessions').select('id, student_id').eq('session_date', todayStr)
    const mySessions = (sessions ?? []).filter((s: any) => myIds.has(s.student_id))
    const sessionIds = mySessions.map((s: any) => s.id)
    let unwrittenNotes = 0
    if (sessionIds.length > 0) {
      const { data: notes } = await supabase.from('learning_notes').select('session_id').in('session_id', sessionIds)
      const written = new Set((notes ?? []).map((n: any) => n.session_id))
      unwrittenNotes = sessionIds.filter((id: string) => !written.has(id)).length
    }
    const { data: wsData } = await supabase.from('student_worksheets').select('student_id, status').in('status', ['submitted', 'similar_submitted'])
    const pendingScore = (wsData ?? []).filter((w: any) => myIds.has(w.student_id)).length
    const { data: fbData } = await supabase.from('feedbacks').select('student_id, ai_message').is('ai_message', null)
    const pendingShare = (fbData ?? []).filter((f: any) => myIds.has(f.student_id)).length
    const { data: allWS } = await supabase.from('student_worksheets').select('student_id, status').not('status', 'in', '("passed")')
    const { data: allTB } = await supabase.from('student_textbooks').select('student_id').eq('status', 'assigned')
    const activeWorksheets = (allWS ?? []).filter((w: any) => myIds.has(w.student_id)).length
    const activeTextbooks = (allTB ?? []).filter((t: any) => myIds.has(t.student_id)).length
    setStats({ todayStudents, unwrittenNotes, pendingScore, pendingShare, activeWorksheets, activeTextbooks })
    setLoading(false)
  }

  const STAT_CARDS = [
    {
      label: '오늘 수업 예정', value: stats.todayStudents, unit: '명',
      href: '/teacher/learning-notes',
      icon: 'ti-calendar-event',
      color: '#085041', bg: '#F0FBF7', border: '#9FE1CB',
    },
    {
      label: '수업일지 미입력', value: stats.unwrittenNotes, unit: '건',
      href: '/teacher/learning-notes',
      icon: 'ti-notebook',
      color: stats.unwrittenNotes > 0 ? '#991b1b' : '#9ca3af',
      bg: stats.unwrittenNotes > 0 ? '#FFF5F5' : '#f9fafb',
      border: stats.unwrittenNotes > 0 ? '#fca5a5' : '#f3f4f6',
    },
    {
      label: '학습지 채점대기', value: stats.pendingScore, unit: '건',
      href: '/teacher/assignments',
      icon: 'ti-pencil',
      color: stats.pendingScore > 0 ? '#633806' : '#9ca3af',
      bg: stats.pendingScore > 0 ? '#FAEEDA' : '#f9fafb',
      border: stats.pendingScore > 0 ? '#EF9F27' : '#f3f4f6',
    },
    {
      label: '학부모 공유 대기', value: stats.pendingShare, unit: '건',
      href: '/teacher/learning-notes',
      icon: 'ti-message-circle',
      color: stats.pendingShare > 0 ? '#712B13' : '#9ca3af',
      bg: stats.pendingShare > 0 ? '#FFF0F0' : '#f9fafb',
      border: stats.pendingShare > 0 ? '#F5C4B3' : '#f3f4f6',
    },
  ]

  const QUICK_MENUS = [
    { href: '/teacher/learning-notes', label: '학습관리',   desc: '수업일지 · 진도 입력', icon: 'ti-notebook',   color: '#085041', bg: '#F0FBF7' },
    { href: '/teacher/students',        label: '학생관리',   desc: '학생 등록 · 시간표',   icon: 'ti-users',      color: '#27500A', bg: '#EAF3DE' },
    { href: '/teacher/assignments',     label: '학습지관리', desc: '학습지 배정 · 채점',   icon: 'ti-file-text',  color: '#633806', bg: '#FAEEDA' },
    { href: '/teacher/curriculum',      label: '과정관리',   desc: '교재 배정 · 진도표',   icon: 'ti-books',      color: '#712B13', bg: '#FFF0EE' },
  ]

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title={`${currentUser?.name ?? ''} 선생님`}
        subtitle={isAdmin() ? '관리자 대시보드' : '수업일지 · 진도관리'} />

      <div className="px-4 py-5 space-y-4 max-w-2xl mx-auto">

        {/* 핵심 지표 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {STAT_CARDS.map((item) => (
            <Link key={item.label} href={item.href}
              className="rounded-2xl p-4 transition-all hover:shadow-md active:scale-95"
              style={{ background: item.bg, border: `1.5px solid ${item.border}` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: 'white', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <i className={`ti ${item.icon}`} style={{ fontSize: 18, color: item.color }} />
                </div>
                <i className="ti ti-chevron-right" style={{ fontSize: 14, color: item.color, opacity: 0.4 }} />
              </div>
              {loading
                ? <div className="w-12 h-7 rounded-lg animate-pulse" style={{ background: item.border }} />
                : <p className="text-2xl font-black" style={{ color: item.color }}>
                    {item.value}<span className="text-sm font-semibold ml-0.5">{item.unit}</span>
                  </p>
              }
              <p className="text-xs font-medium mt-1" style={{ color: item.color, opacity: 0.7 }}>{item.label}</p>
            </Link>
          ))}
        </div>

        {/* 진행 현황 */}
        <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-bold text-gray-400 mb-3 tracking-wide uppercase">현재 진행 현황</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ background: '#F0FBF7' }}>
              <p className="text-2xl font-black" style={{ color: '#085041' }}>{stats.activeWorksheets}</p>
              <p className="text-xs font-medium" style={{ color: '#0F6E56' }}>학습지 진행중</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: '#EAF3DE' }}>
              <p className="text-2xl font-black" style={{ color: '#27500A' }}>{stats.activeTextbooks}</p>
              <p className="text-xs font-medium" style={{ color: '#3A7012' }}>교재 진행중</p>
            </div>
          </div>
        </div>

        {/* 빠른 메뉴 */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid #f9fafb' }}>
            <h3 className="text-xs font-bold text-gray-400 tracking-wide uppercase">빠른 메뉴</h3>
          </div>
          <div className="grid grid-cols-2">
            {QUICK_MENUS.map((menu, idx) => (
              <Link key={menu.href} href={menu.href}
                className="flex items-center gap-3 px-4 py-4 transition-all hover:opacity-80 active:scale-95"
                style={{
                  borderRight: idx % 2 === 0 ? '1px solid #f9fafb' : 'none',
                  borderBottom: idx < 2 ? '1px solid #f9fafb' : 'none',
                }}>
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: menu.bg }}>
                  <i className={`ti ${menu.icon}`} style={{ fontSize: 18, color: menu.color }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{menu.label}</p>
                  <p className="text-[10px] text-gray-400">{menu.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 오늘 할 일 */}
        <div className="rounded-2xl px-4 py-4"
          style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <p className="text-xs font-bold text-gray-400 mb-2.5 tracking-wide uppercase">오늘 할 일</p>
          <div className="space-y-2 text-xs">
            {stats.unwrittenNotes > 0 && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#FFF5F5' }}>
                <i className="ti ti-alert-circle" style={{ fontSize: 13, color: '#991b1b' }} />
                <p style={{ color: '#991b1b' }}>수업일지 미입력 {stats.unwrittenNotes}건 · 학습관리에서 입력해주세요</p>
              </div>
            )}
            {stats.pendingScore > 0 && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#FAEEDA' }}>
                <i className="ti ti-pencil" style={{ fontSize: 13, color: '#633806' }} />
                <p style={{ color: '#633806' }}>채점 대기 {stats.pendingScore}건 · 학습지관리에서 점수를 입력해주세요</p>
              </div>
            )}
            {stats.pendingShare > 0 && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#FFF0EE' }}>
                <i className="ti ti-message-circle" style={{ fontSize: 13, color: '#712B13' }} />
                <p style={{ color: '#712B13' }}>학부모 공유 대기 {stats.pendingShare}건 · 알림장을 생성해주세요</p>
              </div>
            )}
            {stats.unwrittenNotes === 0 && stats.pendingScore === 0 && stats.pendingShare === 0 && (
              <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: '#F0FBF7' }}>
                <i className="ti ti-circle-check" style={{ fontSize: 13, color: '#085041' }} />
                <p style={{ color: '#085041' }}>오늘 모든 업무 완료! 수고하셨습니다</p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
