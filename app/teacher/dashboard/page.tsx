'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { stripRichTokens } from '@/lib/richContent'
import { pickDisplayAnnouncements } from '@/lib/announcements'
import PushSubscribeButton from '@/components/PushSubscribeButton'

const DAYS = ['일','월','화','수','목','금','토']

interface Announcement {
  id: string
  title: string
  content: string
  ends_at: string | null
  created_at: string
  is_important?: boolean
}

export default function TeacherDashboardPage() {
  const { currentUser, isAdmin } = useAuth()
  const [stats, setStats] = useState({
    todayStudents: 0, unwrittenNotes: 0, pendingScore: 0, pendingShare: 0,
    activeWorksheets: 0, activeTextbooks: 0,
  })
  const [loading, setLoading] = useState(true)
  const [bulkProgressEnabled, setBulkProgressEnabled] = useState(false)
  const [togglingBulk, setTogglingBulk] = useState(false)
  const [announcements, setAnnouncements] = useState<Announcement[]>([])

  useEffect(() => { if (currentUser) { fetchStats(); fetchBulkSetting(); fetchAnnouncements() } }, [currentUser])

  // 원장님이 올린 공지 중 지금 표시 대상인 것만 (종료일 지난 건 자동으로 제외)
  async function fetchAnnouncements() {
    const nowIso = new Date().toISOString()
    const { data } = await supabase.from('announcements')
      .select('id, title, content, ends_at, created_at, is_important')
      .eq('is_active', true)
      .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
      .order('created_at', { ascending: false })
    // 최신 2개, 중요 공지가 있으면 그걸 우선해서 최대 3개까지만 대시보드에 노출 (나머지는 공지사항 메뉴에서)
    if (data) setAnnouncements(pickDisplayAnnouncements(data))
  }

  async function fetchBulkSetting() {
    const { data } = await supabase.from('app_settings').select('value').eq('key', 'bulk_progress_enabled').single()
    if (data) setBulkProgressEnabled(data.value === true || data.value === 'true')
  }

  async function toggleBulkProgress() {
    setTogglingBulk(true)
    const newValue = !bulkProgressEnabled
    await supabase.from('app_settings')
      .update({ value: newValue, updated_at: new Date().toISOString() })
      .eq('key', 'bulk_progress_enabled')
    setBulkProgressEnabled(newValue)
    setTogglingBulk(false)
  }

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
    let todayNotes: { session_id: string; attendance: string }[] = []
    if (sessionIds.length > 0) {
      const { data: notes } = await supabase.from('learning_notes').select('session_id, attendance').in('session_id', sessionIds)
      todayNotes = notes ?? []
      const written = new Set(todayNotes.map((n) => n.session_id))
      unwrittenNotes = sessionIds.filter((id: string) => !written.has(id)).length
    }
    const { data: wsData } = await supabase.from('student_worksheets').select('student_id, status').in('status', ['submitted', 'similar_submitted'])
    const pendingScore = (wsData ?? []).filter((w: any) => myIds.has(w.student_id)).length
    // 결석 학생은 진도/과제처럼 학부모에게 공유할 내용 자체가 없어서 "학부모 공유 대기"에서 제외한다.
    // (예전엔 결석 처리 시 "OO 학생은 결석했습니다" 알림장을 자동으로 만들어서 대기에서 빠지게 했었는데,
    //  원장님이 결석한 학생에게 굳이 알림장을 남길 필요 없다고 하셔서 자동생성 대신 아예 대기 계산에서 빼는 방식으로 변경함)
    const absentSessionIds = new Set(todayNotes.filter((n) => n.attendance === '결석').map((n) => n.session_id))
    const absentStudentIds = new Set(mySessions.filter((s: any) => absentSessionIds.has(s.id)).map((s: any) => s.student_id))
    let pendingShare = 0
    const myTodayStudentIds = Array.from(new Set(mySessions.map((s: any) => s.student_id)))
      .filter((sid: string) => !absentStudentIds.has(sid))
    if (myTodayStudentIds.length > 0) {
      const todayStart = todayStr + 'T00:00:00'
      const todayEnd = todayStr + 'T23:59:59'
      const { data: todayFbData } = await supabase.from('feedbacks')
        .select('student_id')
        .in('student_id', myTodayStudentIds)
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)
      const wroteToday = new Set((todayFbData ?? []).map((f: any) => f.student_id))
      pendingShare = myTodayStudentIds.filter((sid: string) => !wroteToday.has(sid)).length
    }
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
    // 방학특강 완주 챌린지 - 이번 방학특강 기간에만 쓰는 임시 메뉴 (일반 로그인 없이 PIN으로 들어가는 별도 화면)
    { href: '/camp/admin',              label: '완주 챌린지', desc: '방학특강 진도 체크',   icon: 'ti-trophy',     color: '#9a3412', bg: '#FFF7ED' },
  ]

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title={`${currentUser?.name ?? ''} 선생님`}
        subtitle={isAdmin() ? '관리자 대시보드' : '수업일지 · 진도관리'}
        action={currentUser?.id ? (
          <PushSubscribeButton role={(currentUser.role as any) || 'teacher'} userId={currentUser.id} />
        ) : undefined} />

      <div className="px-4 py-5 space-y-4 max-w-2xl mx-auto">

        {/* 공지사항 - 원장님이 올린 학원 공지 (강사는 읽기 전용, 관리는 공지사항 메뉴에서) */}
        {announcements.length > 0 && (
          <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #F5C4B3', background: '#FFF5F2' }}>
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ background: '#F5C4B3' }}>
              <div className="flex items-center gap-1.5">
                <i className="ti ti-speakerphone" style={{ fontSize: 14, color: '#712B13' }} />
                <span className="text-xs font-bold" style={{ color: '#712B13' }}>공지사항</span>
              </div>
              <Link href="/teacher/announcements" className="text-[10px] font-semibold" style={{ color: '#712B13' }}>
                전체보기 ›
              </Link>
            </div>
            <div className="divide-y" style={{ borderColor: '#F5C4B360' }}>
              {announcements.map((a) => (
                <Link key={a.id} href="/teacher/announcements" className="block px-4 py-2.5">
                  <p className="text-xs font-bold truncate" style={{ color: '#712B13' }}>{a.is_important && '⭐ '}{a.title}</p>
                  <p className="text-[11px] mt-0.5 line-clamp-1" style={{ color: '#993C1D' }}>{stripRichTokens(a.content)}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* 관리자 전용: 진도 일괄입력 토글 */}
        {isAdmin() && (
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between"
            style={{ background: 'white', border: '1.5px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: bulkProgressEnabled ? '#F0FBF7' : '#f3f4f6' }}>
                <i className="ti ti-list-check" style={{ fontSize: 16, color: bulkProgressEnabled ? '#085041' : '#9ca3af' }} />
              </div>
              <div>
                <p className="text-sm font-bold text-gray-700">진도 일괄입력</p>
                <p className="text-[10px] text-gray-400">강사 전체에게 메뉴 {bulkProgressEnabled ? '표시됨' : '숨겨짐'}</p>
              </div>
            </div>
            <button
              onClick={toggleBulkProgress}
              disabled={togglingBulk}
              className="relative inline-flex items-center rounded-full transition-all duration-200"
              style={{
                width: 44, height: 24,
                background: bulkProgressEnabled ? '#9FE1CB' : '#d1d5db',
                border: 'none', cursor: 'pointer',
              }}>
              <span
                className="absolute rounded-full bg-white shadow transition-all duration-200"
                style={{
                  width: 18, height: 18,
                  left: bulkProgressEnabled ? 22 : 3,
                  top: 3,
                }}
              />
            </button>
          </div>
        )}

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
                  borderRight: idx % 2 === 0 && idx + 1 < QUICK_MENUS.length ? '1px solid #f9fafb' : 'none',
                  borderBottom: idx < QUICK_MENUS.length - (QUICK_MENUS.length % 2 === 0 ? 2 : 1) ? '1px solid #f9fafb' : 'none',
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
