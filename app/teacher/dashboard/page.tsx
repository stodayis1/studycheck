'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import Link from 'next/link'

const DAYS = ['일','월','화','수','목','금','토']

export default function TeacherDashboardPage() {
  const { currentUser, isAdmin } = useAuth()
  const [stats, setStats] = useState({
    todayStudents: 0,
    unwrittenNotes: 0,
    pendingScore: 0,
    pendingShare: 0,
    activeWorksheets: 0,
    activeTextbooks: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUser) return
    fetchStats()
  }, [currentUser])

  async function fetchStats() {
    setLoading(true)
    const todayDay = DAYS[new Date().getDay()]
    const todayStr = new Date().toISOString().split('T')[0]

    // 담당 학생 ID
    let studentQuery = supabase.from('students').select('id').eq('is_active', true)
    if (!isAdmin()) studentQuery = studentQuery.eq('teacher_name', currentUser?.name)
    const { data: myStudents } = await studentQuery
    const myStudentIds = new Set(myStudents?.map((s: any) => s.id) ?? [])

    // 오늘 수업 학생 수 (schedules 기반)
    const { data: todaySchedules } = await supabase
      .from('schedules')
      .select('student_id')
      .eq('day_of_week', todayDay)
      .eq('is_active', true)
    const todayStudents = (todaySchedules ?? []).filter((s: any) => myStudentIds.has(s.student_id)).length

    // 오늘 수업한 학생 중 수업일지 미입력
    const { data: todaySessions } = await supabase
      .from('class_sessions')
      .select('id, student_id')
      .eq('session_date', todayStr)
    const myTodaySessions = (todaySessions ?? []).filter((s: any) => myStudentIds.has(s.student_id))
    const sessionIds = myTodaySessions.map((s: any) => s.id)

    let unwrittenNotes = 0
    if (sessionIds.length > 0) {
      const { data: notes } = await supabase
        .from('learning_notes')
        .select('session_id')
        .in('session_id', sessionIds)
      const writtenIds = new Set((notes ?? []).map((n: any) => n.session_id))
      unwrittenNotes = sessionIds.filter((id: string) => !writtenIds.has(id)).length
    }

    // 레벨학습지 채점 대기
    const { data: wsData } = await supabase
      .from('student_worksheets')
      .select('student_id, status')
      .in('status', ['submitted', 'similar_submitted'])
    const pendingScore = (wsData ?? []).filter((w: any) => myStudentIds.has(w.student_id)).length

    // 학부모 공유 대기 (ai_message 없는 피드백)
    const { data: fbData } = await supabase
      .from('feedbacks')
      .select('student_id, ai_message')
      .is('ai_message', null)
    const pendingShare = (fbData ?? []).filter((f: any) => myStudentIds.has(f.student_id)).length

    // 진행중 학습지/교재 (보조 지표)
    const { data: allWS } = await supabase.from('student_worksheets').select('student_id, status').not('status', 'in', '("passed")')
    const { data: allTB } = await supabase.from('student_textbooks').select('student_id, status').eq('status', 'assigned')
    const activeWorksheets = (allWS ?? []).filter((w: any) => myStudentIds.has(w.student_id)).length
    const activeTextbooks = (allTB ?? []).filter((t: any) => myStudentIds.has(t.student_id)).length

    setStats({ todayStudents, unwrittenNotes, pendingScore, pendingShare, activeWorksheets, activeTextbooks })
    setLoading(false)
  }

  return (
    <div>
      <Header
        title={`${currentUser?.name ?? ''} 선생님`}
        subtitle={isAdmin() ? '관리자 대시보드' : '수업일지 · 진도관리'}
      />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 핵심 지표 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '오늘 수업 예정', value: stats.todayStudents, unit: '명', color: 'text-blue-600', bg: 'bg-blue-50', icon: '📅', href: '/teacher/learning-notes' },
            { label: '수업일지 미입력', value: stats.unwrittenNotes, unit: '건', color: stats.unwrittenNotes > 0 ? 'text-red-500' : 'text-gray-400', bg: stats.unwrittenNotes > 0 ? 'bg-red-50' : 'bg-gray-50', icon: '📓', href: '/teacher/learning-notes' },
            { label: '레벨학습지 채점대기', value: stats.pendingScore, unit: '건', color: stats.pendingScore > 0 ? 'text-orange-500' : 'text-gray-400', bg: stats.pendingScore > 0 ? 'bg-orange-50' : 'bg-gray-50', icon: '✏️', href: '/teacher/assignments' },
            { label: '학부모 공유 대기', value: stats.pendingShare, unit: '건', color: stats.pendingShare > 0 ? 'text-purple-600' : 'text-gray-400', bg: stats.pendingShare > 0 ? 'bg-purple-50' : 'bg-gray-50', icon: '💬', href: '/teacher/learning-notes' },
          ].map((item) => (
            <Link key={item.label} href={item.href}
              className={cx('rounded-2xl p-4 transition-all hover:shadow-md', item.bg)}>
              <p className="text-xl mb-1">{item.icon}</p>
              {loading ? (
                <div className="w-8 h-6 bg-gray-200 rounded animate-pulse mb-1" />
              ) : (
                <p className={cx('text-2xl font-black', item.color)}>
                  {item.value}<span className="text-sm font-semibold ml-0.5">{item.unit}</span>
                </p>
              )}
              <p className="text-xs text-gray-500 font-medium">{item.label}</p>
            </Link>
          ))}
        </div>

        {/* 보조 지표 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
          <p className="text-xs font-bold text-gray-500 mb-3">📊 현재 진행 현황</p>
          <div className="flex gap-4">
            <div>
              <p className="text-lg font-black text-blue-600">{stats.activeWorksheets}</p>
              <p className="text-xs text-gray-400">레벨학습지 진행중</p>
            </div>
            <div className="w-px bg-gray-100" />
            <div>
              <p className="text-lg font-black text-green-600">{stats.activeTextbooks}</p>
              <p className="text-xs text-gray-400">병행교재 진행중</p>
            </div>
          </div>
        </div>

        {/* 빠른 메뉴 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">빠른 메뉴</h3>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-gray-50">
            {[
              { href: '/teacher/learning-notes', label: '진도관리', icon: '📓', desc: '수업일지 · 진도 입력' },
              { href: '/teacher/students', label: '학생관리', icon: '👨‍🎓', desc: '학생 등록 · 시간표' },
              { href: '/teacher/assignments', label: '레벨학습지', icon: '📝', desc: '학습지 배정 · 채점' },
              { href: '/teacher/reports', label: '보고서', icon: '📊', desc: '학생별 학습 현황' },
            ].map((menu) => (
              <Link key={menu.href} href={menu.href}
                className="flex items-center gap-3 px-4 py-4 hover:bg-gray-50 transition-colors">
                <span className="text-2xl">{menu.icon}</span>
                <div>
                  <p className="text-sm font-bold text-gray-800">{menu.label}</p>
                  <p className="text-xs text-gray-400">{menu.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* 오늘 할 일 */}
        <div className="bg-[#1a2f5e]/5 rounded-2xl px-4 py-4">
          <p className="text-xs text-[#1a2f5e] font-bold mb-1">📌 오늘 할 일</p>
          <div className="space-y-1 text-xs text-gray-500">
            {stats.unwrittenNotes > 0 && <p>• 수업일지 미입력 {stats.unwrittenNotes}건 → 진도관리에서 입력해주세요</p>}
            {stats.pendingScore > 0 && <p>• 레벨학습지 채점 대기 {stats.pendingScore}건 → 레벨학습지에서 점수 입력해주세요</p>}
            {stats.pendingShare > 0 && <p>• 학부모 공유 대기 {stats.pendingShare}건 → 진도관리에서 알림장 생성해주세요</p>}
            {stats.unwrittenNotes === 0 && stats.pendingScore === 0 && stats.pendingShare === 0 && (
              <p>오늘 모든 업무가 완료됐어요! 수고하셨습니다 😊</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
