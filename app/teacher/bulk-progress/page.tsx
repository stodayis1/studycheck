'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface Textbook {
  id: string
  student_id: string
  textbook_name: string
  textbook_type: string
  grade: string
  semester: string
  status: string
}

interface Concept {
  id: string
  grade: string
  semester: string
  chapter: string
  sub_chapter: string
  concept_name: string
  concept_order: number
}

interface ProgressCheck {
  concept_id: string
  check_count: number
}

export default function BulkProgressPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [textbooks, setTextbooks] = useState<Textbook[]>([])
  const [selectedTextbook, setSelectedTextbook] = useState<Textbook | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => { if (currentUser) fetchStudents() }, [currentUser])

  async function fetchStudents() {
    let q = supabase.from('students').select('id, name, school, grade, teacher_name').eq('is_active', true).order('name')
    if (!isAdmin() && currentUser?.name) q = q.ilike('teacher_name', `%${currentUser.name}%`)
    const { data } = await q
    setStudents(data ?? [])
  }

  async function selectStudent(student: Student) {
    setSelectedStudent(student)
    setSelectedTextbook(null)
    setConcepts([])
    setProgressChecks([])
    setLoading(true)
    // 연산서 제외
    const { data } = await supabase.from('student_textbooks')
      .select('*')
      .eq('student_id', student.id)
      .neq('textbook_type', '연산서')
      .eq('status', 'assigned')
      .order('assigned_at')
    setTextbooks(data ?? [])
    setLoading(false)
  }

  async function selectTextbook(tb: Textbook) {
    setSelectedTextbook(tb)
    setLoading(true)
    const { data: conceptData } = await supabase.from('concepts')
      .select('*')
      .eq('grade', tb.grade)
      .eq('semester', tb.semester)
      .order('concept_order')
    const conceptList = conceptData ?? []
    setConcepts(conceptList)

    if (conceptList.length > 0 && selectedStudent) {
      const ids = conceptList.map((c: Concept) => c.id)
      const { data: pcData } = await supabase.from('progress_checks')
        .select('concept_id, check_count')
        .eq('student_id', selectedStudent.id)
        .in('concept_id', ids)
      setProgressChecks(pcData ?? [])
    }
    setLoading(false)
  }

  function getCheckCount(conceptId: string) {
    return progressChecks.find(p => p.concept_id === conceptId)?.check_count ?? 0
  }

  // 대단원 목록
  const chapters = Array.from(new Set(concepts.map(c => c.chapter))).filter(Boolean)

  async function toggleConcept(concept: Concept) {
    if (!selectedStudent) return
    const current = getCheckCount(concept.id)
    const newCount = current >= 1 ? 0 : 1
    if (newCount === 0) {
      await supabase.from('progress_checks').delete()
        .eq('student_id', selectedStudent.id).eq('concept_id', concept.id)
    } else {
      await supabase.from('progress_checks').upsert(
        { student_id: selectedStudent.id, concept_id: concept.id, check_count: 1 },
        { onConflict: 'student_id,concept_id' }
      )
    }
    setProgressChecks(prev => {
      const updated = prev.filter(p => p.concept_id !== concept.id)
      if (newCount > 0) updated.push({ concept_id: concept.id, check_count: newCount })
      return updated
    })
    showToast(newCount >= 1 ? `✅ "${concept.concept_name}" 완료` : `↩ "${concept.concept_name}" 해제`)
  }

  async function toggleChapter(chapter: string) {
    if (!selectedStudent) return
    const chapterConcepts = concepts.filter(c => c.chapter === chapter)
    const allDone = chapterConcepts.every(c => getCheckCount(c.id) >= 1)
    setSaving(true)
    if (allDone) {
      // 전체 해제
      await supabase.from('progress_checks').delete()
        .eq('student_id', selectedStudent.id)
        .in('concept_id', chapterConcepts.map(c => c.id))
      setProgressChecks(prev => prev.filter(p => !chapterConcepts.some(c => c.id === p.concept_id)))
      showToast(`↩ "${chapter}" 전체 해제`)
    } else {
      // 전체 체크
      const rows = chapterConcepts.map(c => ({ student_id: selectedStudent.id, concept_id: c.id, check_count: 1 }))
      await supabase.from('progress_checks').upsert(rows, { onConflict: 'student_id,concept_id' })
      setProgressChecks(prev => {
        const updated = prev.filter(p => !chapterConcepts.some(c => c.id === p.concept_id))
        chapterConcepts.forEach(c => updated.push({ concept_id: c.id, check_count: 1 }))
        return updated
      })
      showToast(`✅ "${chapter}" 전체 완료`)
    }
    setSaving(false)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const filteredStudents = students.filter(s =>
    s.name.includes(searchQuery) || s.school?.includes(searchQuery)
  )

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title="진도 일괄입력" subtitle="교재 단원까지 한 번에 완료 처리" />

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">

        {/* 안내 */}
        <div className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
          style={{ background: '#FFF9E6', border: '1px solid #FAEEDA' }}>
          <i className="ti ti-info-circle mt-0.5" style={{ fontSize: 15, color: '#633806', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#633806', lineHeight: 1.6 }}>
            개념을 클릭하면 <b>체크/해제</b>가 토글됩니다.<br />
            대단원 버튼은 해당 단원 전체를 일괄 체크/해제합니다.
          </p>
        </div>

        {/* 학생 선택 */}
        <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
          <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학생 선택</p>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="이름 또는 학교 검색"
            className="w-full text-sm rounded-xl px-3 py-2 mb-3 outline-none"
            style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}
          />
          <div className="flex flex-wrap gap-2">
            {filteredStudents.map(s => (
              <button key={s.id} onClick={() => selectStudent(s)}
                className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                style={selectedStudent?.id === s.id
                  ? { background: '#9FE1CB', color: '#085041', fontWeight: 700 }
                  : { background: '#f3f4f6', color: '#374151' }}>
                {s.name} <span style={{ opacity: 0.5 }}>{s.grade}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 교재 선택 */}
        {selectedStudent && (
          <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
            <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">
              {selectedStudent.name} · 교재 선택
            </p>
            {loading ? (
              <p className="text-xs text-gray-400">불러오는 중...</p>
            ) : textbooks.length === 0 ? (
              <p className="text-xs text-gray-400">배정된 교재가 없어요 (연산서 제외)</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {textbooks.map(tb => (
                  <button key={tb.id} onClick={() => selectTextbook(tb)}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                    style={selectedTextbook?.id === tb.id
                      ? { background: '#085041', color: 'white' }
                      : { background: '#F0FBF7', color: '#085041', border: '1px solid #9FE1CB' }}>
                    {tb.textbook_name}
                    <span className="ml-1 opacity-60">{tb.textbook_type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 단원/개념 목록 */}
        {selectedTextbook && (
          <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
            <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">
              {selectedTextbook.textbook_name} · 단원 선택
            </p>
            {loading ? (
              <p className="text-xs text-gray-400">불러오는 중...</p>
            ) : concepts.length === 0 ? (
              <p className="text-xs text-gray-400">등록된 개념이 없어요</p>
            ) : (
              <div className="space-y-3">
                {chapters.map(chapter => {
                  const chapterConcepts = concepts.filter(c => c.chapter === chapter)
                  const allDone = chapterConcepts.every(c => getCheckCount(c.id) >= 1)
                  return (
                    <div key={chapter}>
                      {/* 대단원 버튼 */}
                      <button
                        onClick={() => toggleChapter(chapter)}
                        disabled={saving}
                        className="w-full text-left px-3 py-2.5 rounded-xl mb-1.5 flex items-center justify-between transition-all"
                        style={{
                          background: allDone ? '#9FE1CB' : '#F0FBF7',
                          border: `1.5px solid ${allDone ? '#5ECFB0' : '#9FE1CB'}`,
                        }}>
                        <span className="text-sm font-bold" style={{ color: '#085041' }}>{chapter}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{ background: allDone ? '#085041' : '#9FE1CB', color: allDone ? 'white' : '#085041' }}>
                          {allDone ? '전체해제' : '전체체크'}
                        </span>
                      </button>

                      {/* 개념 목록 */}
                      <div className="ml-2 space-y-1">
                        {chapterConcepts.map(c => {
                          const cnt = getCheckCount(c.id)
                          return (
                            <button key={c.id}
                              onClick={() => toggleConcept(c)}
                              className="w-full text-left px-3 py-2 rounded-lg flex items-center gap-2.5 transition-all"
                              style={{ background: cnt >= 1 ? '#F0FBF7' : '#fafafa', border: '1px solid #f3f4f6' }}>
                              <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: cnt >= 1 ? '#9FE1CB' : '#e5e7eb' }}>
                                {cnt >= 1 && <i className="ti ti-check" style={{ fontSize: 11, color: '#085041' }} />}
                              </div>
                              <span className="text-xs flex-1" style={{ color: cnt >= 1 ? '#085041' : '#6b7280' }}>
                                {c.concept_name}
                              </span>
                              {cnt >= 1 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                                  style={{ background: '#085041', color: 'white' }}>
                                  완료
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>



      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium"
          style={{ background: '#085041', color: 'white', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
