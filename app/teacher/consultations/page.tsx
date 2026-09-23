'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface Consultation {
  id: string
  student_id: string
  consulted_at: string // YYYY-MM-DD
  content: string
  teacher_name: string | null
  created_by: string | null
  created_at: string
}

const OVERDUE_DAYS = 90

const CONSULTATION_TEMPLATE = `1.
성적 및 학습상담


2.
학부모님 건의 및 당부사항


3.
안내드린 사항 정리
`

export default function ConsultationsPage() {
  const { currentUser, canManageAllStudents, canViewStudent, isSupervisorModeActive, supervisorGrades, supervisorMode, adminMode } = useAuth()
  const searchParams = useSearchParams()
  const deepLinkedStudentId = searchParams.get('student')

  const [students, setStudents] = useState<Student[]>([])
  const [consultations, setConsultations] = useState<Consultation[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [onlyOverdue, setOnlyOverdue] = useState(false)

  const [openStudent, setOpenStudent] = useState<Student | null>(null)
  const [newDate, setNewDate] = useState(() => new Date().toISOString().split('T')[0])
  const [newContent, setNewContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editContent, setEditContent] = useState('')

  useEffect(() => { fetchData() }, [])

  async function fetchData() {
    setLoading(true)
    const [{ data: sData }, { data: cData }] = await Promise.all([
      supabase.from('students').select('id, name, school, grade, teacher_name').eq('is_active', true).order('name'),
      supabase.from('consultations').select('*').order('consulted_at', { ascending: false }),
    ])
    if (sData) setStudents(sData)
    if (cData) setConsultations(cData)
    setLoading(false)
  }

  // 주임모드는 담당 학년 범위까지 "조회"는 가능하되, 상담 기록 작성은 실제 담당 학생에게만 허용
  // 주임모드/관리자모드를 바꾸면 보이는 범위가 달라지므로 그 값들도 의존성에 넣어야 한다.
  // (빠져 있으면 모드를 바꿔도 목록이 예전 그대로 남는다)
  const myStudents = useMemo(() => students.filter((s) =>
    canViewStudent(s) || (isSupervisorModeActive() && supervisorGrades.includes(s.grade))
  ), [students, currentUser, supervisorMode, adminMode])

  const lastConsultByStudent = useMemo(() => {
    const map = new Map<string, Consultation>()
    for (const c of consultations) {
      const cur = map.get(c.student_id)
      if (!cur || c.consulted_at > cur.consulted_at) map.set(c.student_id, c)
    }
    return map
  }, [consultations])

  function daysSince(dateStr: string) {
    const d = new Date(dateStr + 'T00:00:00')
    const today = new Date()
    return Math.floor((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
  }

  function isOverdue(studentId: string) {
    const last = lastConsultByStudent.get(studentId)
    // "오늘부터 새로 카운트" 원칙 - 상담기록이 아예 없는 학생(대부분의 기존 재원생)은
    // 아직 기준 삼을 날짜가 없으니 초과 알림 대상에서 제외한다. 처음 기록을 남기는 순간부터 3개월을 센다.
    if (!last) return false
    return daysSince(last.consulted_at) > OVERDUE_DAYS
  }

  const overdueStudents = myStudents.filter((s) => isOverdue(s.id))

  const visibleStudents = myStudents
    .filter((s) => !search.trim() || s.name.includes(search.trim()) || s.school.includes(search.trim()))
    .filter((s) => !onlyOverdue || isOverdue(s.id))
    .sort((a, b) => {
      const la = lastConsultByStudent.get(a.id)?.consulted_at ?? ''
      const lb = lastConsultByStudent.get(b.id)?.consulted_at ?? ''
      // 상담기록 없는 학생 먼저, 그 다음 오래된 순
      if (!la && lb) return -1
      if (la && !lb) return 1
      return la.localeCompare(lb)
    })

  useEffect(() => {
    if (!deepLinkedStudentId || loading || openStudent) return
    const target = myStudents.find((s) => s.id === deepLinkedStudentId)
    if (target) setOpenStudent(target)
  }, [deepLinkedStudentId, loading, myStudents])

  function openStudentModal(s: Student) {
    setOpenStudent(s)
    setNewDate(new Date().toISOString().split('T')[0])
    setNewContent('')
    setEditingId(null)
  }

  const openStudentHistory = openStudent
    ? consultations.filter((c) => c.student_id === openStudent.id).sort((a, b) => b.consulted_at.localeCompare(a.consulted_at))
    : []

  async function handleAdd() {
    if (!openStudent || !newContent.trim()) return
    setSaving(true)
    const { error } = await supabase.from('consultations').insert({
      student_id: openStudent.id,
      consulted_at: newDate,
      content: newContent.trim(),
      teacher_name: currentUser?.name ?? null,
      created_by: currentUser?.id ?? null,
    })
    setSaving(false)
    if (error) { alert('저장에 실패했어요: ' + error.message); return }
    setNewContent('')
    fetchData()
  }

  function startEdit(c: Consultation) {
    setEditingId(c.id)
    setEditDate(c.consulted_at)
    setEditContent(c.content)
  }

  async function saveEdit() {
    if (!editingId) return
    setSaving(true)
    const { error } = await supabase.from('consultations')
      .update({ consulted_at: editDate, content: editContent.trim(), updated_at: new Date().toISOString() })
      .eq('id', editingId)
    setSaving(false)
    if (error) { alert('수정에 실패했어요: ' + error.message); return }
    setEditingId(null)
    fetchData()
  }

  async function handleDelete(c: Consultation) {
    if (!confirm('이 상담기록을 삭제할까요? 되돌릴 수 없어요.')) return
    const { error } = await supabase.from('consultations').delete().eq('id', c.id)
    if (error) { alert('삭제에 실패했어요: ' + error.message); return }
    fetchData()
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title="상담내역" subtitle="학생 상담기록 관리" />

      <div className="px-4 py-5 space-y-4 max-w-2xl mx-auto">

        {overdueStudents.length > 0 && (
          <div className="rounded-2xl px-4 py-3" style={{ background: '#FFF7ED', border: '1.5px solid #FDBA74' }}>
            <div className="flex items-center gap-2 mb-1">
              <i className="ti ti-phone" style={{ fontSize: 16 }} />
              <p className="text-sm font-bold" style={{ color: '#9a3412' }}>
                상담 필요 학생 {overdueStudents.length}명 · 마지막 상담 후 {OVERDUE_DAYS}일 초과
              </p>
            </div>
            <p className="text-xs" style={{ color: '#B45309' }}>
              {overdueStudents.map((s) => s.name).join(', ')}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="학생 이름 또는 학교 검색"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm"
            style={{ border: '1px solid #e5e7eb', background: 'white' }}
          />
          <button
            onClick={() => setOnlyOverdue((v) => !v)}
            className="text-xs font-bold px-3 py-2 rounded-xl whitespace-nowrap"
            style={onlyOverdue
              ? { background: '#F5C4B3', color: '#712B13' }
              : { background: 'white', color: '#6b7280', border: '1px solid #e5e7eb' }}>
            초과만 보기
          </button>
        </div>

        <div className="rounded-2xl overflow-hidden" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">불러오는 중...</div>
          ) : visibleStudents.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              {canManageAllStudents() ? '학생이 없어요' : '담당 학생이 없어요'}
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: '#f3f4f6' }}>
              {visibleStudents.map((s) => {
                const last = lastConsultByStudent.get(s.id)
                const overdue = isOverdue(s.id)
                return (
                  <button key={s.id} onClick={() => openStudentModal(s)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-all">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-gray-800">{s.name}</span>
                        <span className="text-[11px] text-gray-400">{s.school} · {s.grade}</span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: overdue ? '#c2410c' : '#9ca3af' }}>
                        {last ? `마지막 상담 ${last.consulted_at} (${daysSince(last.consulted_at)}일 전)` : '상담기록 없음'}
                      </p>
                    </div>
                    {overdue && (
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: '#FFF7ED', color: '#9a3412' }}>
                        초과
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 상담기록 모달 */}
      {openStudent && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setOpenStudent(null)}>
          <div className="w-full md:max-w-lg bg-white rounded-t-2xl md:rounded-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 sticky top-0 bg-white" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center justify-between">
                <p className="font-bold text-gray-800">{openStudent.name} 학생 상담기록</p>
                <button onClick={() => setOpenStudent(null)} className="text-gray-400 text-sm">닫기</button>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">{openStudent.school} · {openStudent.grade}</p>
            </div>

            <div className="px-5 py-4 space-y-3" style={{ borderBottom: '1px solid #f3f4f6' }}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-gray-500">상담기록 추가</p>
                <button
                  onClick={() => {
                    if (newContent.trim() && !confirm('입력 중인 내용을 표준 양식으로 바꿀까요?')) return
                    setNewContent(CONSULTATION_TEMPLATE)
                  }}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg"
                  style={{ background: '#F0F5F3', color: '#085041' }}>
                  표준 양식 넣기
                </button>
              </div>
              <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
                className="w-full rounded-xl px-3 py-2 text-sm" style={{ border: '1px solid #e5e7eb' }} />
              <textarea value={newContent} onChange={(e) => setNewContent(e.target.value)}
                placeholder={'상담 내용을 입력해주세요\n\n예시 양식) 1. 성적 및 학습상담 / 2. 학부모님 건의 및 당부사항 / 3. 안내드린 사항 정리\n(우측 상단 "표준 양식 넣기" 버튼을 누르면 자동으로 채워져요)'}
                rows={6}
                className="w-full rounded-xl px-3 py-2 text-sm resize-none" style={{ border: '1px solid #e5e7eb' }} />
              <button onClick={handleAdd} disabled={saving || !newContent.trim()}
                className="w-full rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: '#085041' }}>
                {saving ? '저장 중...' : '기록 추가'}
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <p className="text-xs font-bold text-gray-500">지난 기록 ({openStudentHistory.length}건)</p>
              {openStudentHistory.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">아직 상담기록이 없어요</p>
              ) : (
                openStudentHistory.map((c) => (
                  <div key={c.id} className="rounded-xl p-3" style={{ background: '#f9fafb' }}>
                    {editingId === c.id ? (
                      <div className="space-y-2">
                        <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                          className="w-full rounded-lg px-2 py-1.5 text-sm" style={{ border: '1px solid #e5e7eb' }} />
                        <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={6}
                          className="w-full rounded-lg px-2 py-1.5 text-sm resize-none" style={{ border: '1px solid #e5e7eb' }} />
                        <div className="flex gap-2">
                          <button onClick={saveEdit} disabled={saving} className="flex-1 rounded-lg py-1.5 text-xs font-bold text-white" style={{ background: '#085041' }}>저장</button>
                          <button onClick={() => setEditingId(null)} className="flex-1 rounded-lg py-1.5 text-xs font-bold text-gray-500" style={{ background: '#e5e7eb' }}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-gray-600">{c.consulted_at}</span>
                          <span className="text-[10px] text-gray-400">{c.teacher_name ?? ''}</span>
                        </div>
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.content}</p>
                        <div className="flex gap-3 mt-2">
                          <button onClick={() => startEdit(c)} className="text-[11px] font-semibold text-gray-400">수정</button>
                          <button onClick={() => handleDelete(c)} className="text-[11px] font-semibold text-red-400">삭제</button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
