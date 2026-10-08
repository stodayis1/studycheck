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

// 상담 주기 — 초등은 6주(42일), 중·고등은 3개월(90일)
const OVERDUE_DAYS_ELEM = 42
const OVERDUE_DAYS_SECONDARY = 90
function overdueDaysFor(grade?: string) {
  return (grade || '').startsWith('초') ? OVERDUE_DAYS_ELEM : OVERDUE_DAYS_SECONDARY
}

// 강사가 '이 학생은 원장님이 상담해 주세요'라고 올린 요청
interface ConsultRequest {
  id: string
  student_id: string
  reason: string | null
  status: string
  requested_by_name: string | null
  created_at: string
}

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
  const [requests, setRequests] = useState<ConsultRequest[]>([])
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
    const [{ data: sData }, { data: cData }, { data: rData }] = await Promise.all([
      supabase.from('students').select('id, name, school, grade, teacher_name').eq('is_active', true).order('name'),
      supabase.from('consultations').select('*').order('consulted_at', { ascending: false }),
      supabase.from('consultation_requests').select('*').eq('status', 'open').order('created_at', { ascending: false }),
    ])
    if (sData) setStudents(sData)
    if (cData) setConsultations(cData)
    setRequests(rData || [])
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

  // 상담 필요 판단 — 초등 42일(6주), 중·고 90일(3개월) 초과.
  // 상담기록이 아예 없는 학생도 "상담 필요"로 본다 (2026-10-08 원장님 지시로 변경.
  // 그 전에는 기록이 없으면 기준 날짜가 없다는 이유로 제외했었음)
  function isOverdue(studentId: string) {
    const student = students.find((s) => s.id === studentId)
    const last = lastConsultByStudent.get(studentId)
    if (!last) return true
    return daysSince(last.consulted_at) > overdueDaysFor(student?.grade)
  }

  const overdueStudents = myStudents.filter((s) => isOverdue(s.id))

  // 원장님이 담당 강사에게 보내는 '학부모 상담 요청' — 이미 요청해 둔 학생은 버튼 대신 '요청됨'으로 표시.
  // 요청을 거는 쪽은 원장/직원, 받는 쪽(대시보드에 뜨는 쪽)은 그 학생의 담당 강사다.
  const requestedStudentIds = useMemo(() => new Set(requests.map((r) => r.student_id)), [requests])
  const studentById = useMemo(() => new Map(students.map((s) => [s.id, s])), [students])
  // 강사는 자기 담당 학생 요청만, 원장/직원은 전체
  const myStudentIds = useMemo(() => new Set(myStudents.map((s) => s.id)), [myStudents])
  const myRequests = useMemo(
    () => (canManageAllStudents() ? requests : requests.filter((r) => myStudentIds.has(r.student_id))),
    [requests, myStudentIds, currentUser, adminMode])

  async function requestConsult(student: Student) {
    const who = student.teacher_name || '담당 선생님'
    const reason = window.prompt(
      `${student.name} 학생의 학부모 상담을 ${who}께 요청해요.\n사유를 적어주세요 (예: 성적 하락, 결석이 잦음)`, '')
    if (reason === null) return
    const { error } = await supabase.from('consultation_requests').insert({
      student_id: student.id,
      reason: reason.trim() || null,
      requested_by: currentUser?.id ?? null,
      requested_by_name: currentUser?.name ?? null,
    })
    if (error) { alert('요청에 실패했어요: ' + error.message); return }
    alert(`${who}께 상담 요청을 보냈어요. 선생님 대시보드에 떠요.`)
    fetchData()
  }

  async function resolveRequest(id: string) {
    const { error } = await supabase.from('consultation_requests')
      .update({ status: 'done', resolved_by: currentUser?.id ?? null, resolved_at: new Date().toISOString() })
      .eq('id', id)
    if (error) { alert('처리에 실패했어요: ' + error.message); return }
    fetchData()
  }

  const visibleStudents = myStudents
    // 학교가 비어 있는 학생이 있다(전아윤 등). ?? '' 없이 school.includes()를 부르면
    // 검색어를 넣는 순간 그 학생에서 터져서 화면 전체가 "This page couldn't load"가 된다.
    .filter((s) => !search.trim() || s.name.includes(search.trim()) || (s.school ?? '').includes(search.trim()))
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
    // 원장님이 걸어둔 상담 요청이 있으면, 상담기록을 남긴 시점에 자동으로 처리 완료로 바꾼다
    if (requestedStudentIds.has(openStudent.id)) {
      await supabase.from('consultation_requests')
        .update({ status: 'done', resolved_by: currentUser?.id ?? null, resolved_at: new Date().toISOString() })
        .eq('student_id', openStudent.id).eq('status', 'open')
    }
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

        {/* 원장님이 보낸 상담 요청 — 강사에게는 '내 담당 학생' 것만, 원장/직원에게는 전부 보인다 */}
        {myRequests.length > 0 && (
          <div className="rounded-2xl px-4 py-3 space-y-2" style={{ background: '#EEF2FF', border: '1.5px solid #A5B4FC' }}>
            <p className="text-sm font-bold" style={{ color: '#3730a3' }}>
              {canManageAllStudents() ? '내가 보낸 상담 요청' : '원장님이 보낸 상담 요청'} {myRequests.length}건
            </p>
            {myRequests.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold" style={{ color: '#3730a3' }}>
                    {studentById.get(r.student_id)?.name ?? '(알 수 없는 학생)'}
                    <span className="font-normal" style={{ color: '#6366f1' }}>
                      {' · 담당 '}{studentById.get(r.student_id)?.teacher_name ?? '미지정'}
                      {r.requested_by_name ? ` · 요청 ${r.requested_by_name}` : ''}
                    </span>
                  </p>
                  {r.reason && <p className="text-[11px]" style={{ color: '#4f46e5' }}>{r.reason}</p>}
                </div>
                <button onClick={() => resolveRequest(r.id)} className="text-[11px] font-bold px-2 py-1 rounded-lg shrink-0" style={{ background: 'white', color: '#3730a3', border: '1px solid #A5B4FC' }}>처리 완료</button>
              </div>
            ))}
          </div>
        )}

        {overdueStudents.length > 0 && (
          <div className="rounded-2xl px-4 py-3" style={{ background: '#FFF7ED', border: '1.5px solid #FDBA74' }}>
            <div className="flex items-center gap-2 mb-1">
              <i className="ti ti-phone" style={{ fontSize: 16 }} />
              <p className="text-sm font-bold" style={{ color: '#9a3412' }}>
                상담 필요 학생 {overdueStudents.length}명 · 초등 6주 / 중·고 3개월 초과 (기록 없는 학생 포함)
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
                        {last
                          ? `마지막 상담 ${last.consulted_at} (${daysSince(last.consulted_at)}일 전 · 기준 ${overdueDaysFor(s.grade)}일)`
                          : '상담기록 없음 · 상담 필요'}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 shrink-0">
                      {requestedStudentIds.has(s.id) && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#EEF2FF', color: '#3730a3' }}>
                          상담 요청
                        </span>
                      )}
                      {overdue && (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#FFF7ED', color: '#9a3412' }}>
                          상담 필요
                        </span>
                      )}
                    </span>
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
              {/* 원장님이 담당 강사에게 "이 학생 학부모와 상담해 주세요"라고 요청 — 강사 대시보드에 뜬다 */}
              {requestedStudentIds.has(openStudent.id) ? (
                <p className="text-[11px] font-bold mt-2" style={{ color: '#3730a3' }}>
                  상담 요청됨 {requests.find((r) => r.student_id === openStudent.id)?.reason
                    ? `· ${requests.find((r) => r.student_id === openStudent.id)?.reason}` : ''}
                  {' · 상담기록을 남기면 자동으로 처리돼요'}
                </p>
              ) : canManageAllStudents() ? (
                <button onClick={() => requestConsult(openStudent)}
                  className="text-[11px] font-bold px-2.5 py-1 rounded-lg mt-2"
                  style={{ background: '#EEF2FF', color: '#3730a3', border: '1px solid #A5B4FC' }}>
                  담당 강사에게 상담 요청
                </button>
              ) : null}
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
