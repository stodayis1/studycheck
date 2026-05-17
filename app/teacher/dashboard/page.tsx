'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import Link from 'next/link'

export default function TeacherDashboardPage() {
  const { currentUser, isAdmin } = useAuth()
  const [stats, setStats] = useState({
    totalStudents: 0,
    activeWorksheets: 0,
    activeTextbooks: 0,
    pendingScore: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUser) return
    fetchStats()
  }, [currentUser])

  async function fetchStats() {
    setLoading(true)

    // 담당 학생 수
    let studentQuery = supabase.from('students').select('id', { count: 'exact' }).eq('is_active', true)
    if (!isAdmin()) studentQuery = studentQuery.eq('teacher_name', currentUser?.name)
    const { count: studentCount } = await studentQuery

    // 진행중인 학습지
    const { data: wsData } = await supabase
      .from('student_worksheets')
      .select('student_id, status')
      .not('status', 'in', '("passed")')

    // 진행중인 교재
    const { data: tbData } = await supabase
      .from('student_textbooks')
      .select('student_id, status')
      .eq('status', 'assigned')

    // 담당 학생 ID 목록
    const { data: myStudents } = await supabase
      .from('students')
      .select('id')
      .eq('is_active', true)
      .eq('teacher_name', currentUser?.name ?? '')

    const myStudentIds = new Set(myStudents?.map((s) => s.id) ?? [])

    const filterByMyStudents = (items: any[]) =>
      isAdmin() ? items : items.filter((w) => myStudentIds.has(w.student_id))

    const myWS = filterByMyStudents(wsData ?? [])
    const myTB = filterByMyStudents(tbData ?? [])
    const pendingScore = myWS.filter((w) => w.status === 'submitted' || w.status === 'similar_submitted').length

    setStats({
      totalStudents: studentCount ?? 0,
      activeWorksheets: myWS.length,
      activeTextbooks: myTB.length,
      pendingScore,
    })
    setLoading(false)
  }

  return (
    <div>
      <Header
        title={`${currentUser?.name ?? ''} 선생님`}
        subtitle={isAdmin() ? '관리자 대시보드' : '담당 학생 현황'}
      />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: '담당 학생', value: stats.totalStudents, unit: '명', color: 'text-blue-600', bg: 'bg-blue-50', icon: '👨‍🎓' },
            { label: '채점 대기', value: stats.pendingScore, unit: '건', color: 'text-orange-500', bg: 'bg-orange-50', icon: '✏️' },
            { label: '학습지 진행중', value: stats.activeWorksheets, unit: '건', color: 'text-purple-600', bg: 'bg-purple-50', icon: '📝' },
            { label: '교재 진행중', value: stats.activeTextbooks, unit: '건', color: 'text-green-600', bg: 'bg-green-50', icon: '📖' },
          ].map((item) => (
            <div key={item.label} className={cx('rounded-2xl p-4', item.bg)}>
              <p className="text-xl mb-1">{item.icon}</p>
              {loading ? (
                <div className="w-8 h-6 bg-gray-200 rounded animate-pulse mb-1" />
              ) : (
                <p className={cx('text-2xl font-black', item.color)}>
                  {item.value}<span className="text-sm font-semibold ml-0.5">{item.unit}</span>
                </p>
              )}
              <p className="text-xs text-gray-500 font-medium">{item.label}</p>
            </div>
          ))}
        </div>

        {/* 바로가기 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">빠른 메뉴</h3>
          </div>
          <div className="grid grid-cols-2 divide-x divide-y divide-gray-50">
            {[
              { href: '/teacher/assignments', label: '과제 관리', icon: '📝', desc: '학습지·교재 배정' },
              { href: '/teacher/students', label: '학생 관리', icon: '👨‍🎓', desc: '담당 학생 목록' },
              { href: '/teacher/reports', label: '진단표', icon: '📊', desc: '학생별 학습 현황' },
              { href: '/teacher/submissions', label: '제출 현황', icon: '✅', desc: '과제 제출 확인' },
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

        {/* 안내 */}
        <div className="bg-[#1a2f5e]/5 rounded-2xl px-4 py-4">
          <p className="text-xs text-[#1a2f5e] font-bold mb-1">📌 오늘 할 일</p>
          <p className="text-xs text-gray-500">
            {stats.pendingScore > 0
              ? `채점 대기 ${stats.pendingScore}건이 있어요. 과제 관리에서 점수를 입력해주세요!`
              : '오늘 채점 대기 과제가 없어요. 수고하셨습니다! 😊'}
          </p>
        </div>

      </div>
    </div>
  )
}