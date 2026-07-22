'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'

interface Student {
  id: string
  name: string
  grade: string
  teacher_name: string
}

interface StudentWorksheet {
  id: string
  student_id: string
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
  student_id: string
  concept_id: string
  textbook_name: string
  textbook_type: string
  status: string
  assigned_at: string
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

export default function TeacherSubmissionsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<StudentWorksheet[]>([])
  const [textbooks, setTextbooks] = useState<StudentTextbook[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'worksheet' | 'textbook'>('worksheet')
  const [searchText, setSearchText] = useState('')

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [{ data: sData }, { data: wData }, { data: tData }] = await Promise.all([
        supabase.from('students').select('*').eq('is_active', true).order('name'),
        supabase.from('student_worksheets').select('*').order('assigned_at', { ascending: false }).limit(5000),
        supabase.from('student_textbooks').select('*').order('assigned_at', { ascending: false }).limit(5000),
      ])
      if (sData) setStudents(sData)
      if (wData) setWorksheets(wData)
      if (tData) setTextbooks(tData)
      setLoading(false)
    }
    fetchData()
  }, [])

  // 담당 학생만
  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const teachers = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return teachers.includes(currentUser.name)
  })

  const myStudentIds = new Set(myStudents.map((s) => s.id))

  function getStudent(id: string) {
    return myStudents.find((s) => s.id === id)
  }

  // 진행중인 학습지 (passed 제외, 담당 학생만)
  const activeWorksheets = worksheets.filter((w) =>
    myStudentIds.has(w.student_id) && w.status !== 'passed' &&
    (searchText === '' || getStudent(w.student_id)?.name.includes(searchText))
  )

  // 진행중인 교재 (checked 제외, 담당 학생만)
  const activeTextbooks = textbooks.filter((t) =>
    myStudentIds.has(t.student_id) && t.status !== 'checked' &&
    (searchText === '' || getStudent(t.student_id)?.name.includes(searchText))
  )

  // 제출 대기 학생 (submitted 상태)
  const pendingWS = activeWorksheets.filter((w) =>
    w.status === 'submitted' || w.status === 'similar_submitted'
  )
  const pendingTB = activeTextbooks.filter((t) => t.status === 'submitted')

  return (
    <div>
      <Header
        title="제출 현황"
        subtitle={isAdmin() ? '전체 관리자' : `${currentUser?.name} 선생님`}
      />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2">
          {[
            { key: 'worksheet', label: '📝 학습지' },
            { key: 'textbook',  label: '📖 교재' },
          ].map((t) => (
            <button key={t.key} onClick={() => setTab(t.key as typeof tab)}
              className={cx('px-4 py-2 rounded-xl text-sm font-semibold border transition-all',
                tab === t.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200')}>
              {t.label}
              {tab === t.key && (
                <span className="ml-1.5 text-xs bg-white/20 px-1.5 py-0.5 rounded-full">
                  {tab === 'worksheet' ? activeWorksheets.length : activeTextbooks.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름으로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

        {/* 요약 */}
        {tab === 'worksheet' && pendingWS.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-orange-500 text-lg">⏳</span>
            <div>
              <p className="text-sm font-bold text-orange-700">채점 대기 {pendingWS.length}개</p>
              <p className="text-xs text-orange-400">학생이 제출한 학습지가 있어요</p>
            </div>
          </div>
        )}
        {tab === 'textbook' && pendingTB.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3 flex items-center gap-3">
            <span className="text-orange-500 text-lg">⏳</span>
            <div>
              <p className="text-sm font-bold text-orange-700">채점 대기 {pendingTB.length}개</p>
              <p className="text-xs text-orange-400">학생이 제출한 교재 과제가 있어요</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
          </div>
        ) : tab === 'worksheet' ? (
          activeWorksheets.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="text-3xl mb-3">📝</p>
              <p className="text-sm text-gray-500">진행중인 학습지 과제가 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeWorksheets.map((w) => {
                const student = getStudent(w.student_id)
                if (!student) return null
                const cfg = WS_STATUS[w.status] ?? WS_STATUS.assigned
                return (
                  <div key={w.id} className={cx('bg-white rounded-2xl border-2 p-3.5 flex items-center gap-3',
                    w.status === 'submitted' || w.status === 'similar_submitted'
                      ? 'border-orange-200' : 'border-gray-100')}>
                    <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{student.name}</p>
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                          {cfg.label}
                        </span>
                        {w.worksheet_type === 'similar' && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded-md">오답유사</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {w.grade_level} · {w.unit}
                        {w.unit_name ? ` (${w.unit_name})` : ''} ·{' '}
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
          )
        ) : (
          activeTextbooks.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
              <p className="text-3xl mb-3">📖</p>
              <p className="text-sm text-gray-500">진행중인 교재 과제가 없어요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeTextbooks.map((t) => {
                const student = getStudent(t.student_id)
                if (!student) return null
                const cfg = TB_STATUS[t.status] ?? TB_STATUS.assigned
                return (
                  <div key={t.id} className={cx('bg-white rounded-2xl border-2 p-3.5 flex items-center gap-3',
                    t.status === 'submitted' ? 'border-orange-200' : 'border-gray-100')}>
                    <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-sm font-bold text-green-700 shrink-0">
                      {student.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-bold text-gray-900">{student.name}</p>
                        <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', cfg.bg, cfg.color)}>
                          {cfg.label}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 bg-green-100 text-green-600 rounded-md">
                          {t.textbook_type}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{t.textbook_name}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
