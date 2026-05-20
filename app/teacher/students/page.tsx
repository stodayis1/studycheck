'use client'

import { useState, useRef, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { SectionCard, Badge } from '@/components/ui'
import { cx } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface Student {
  id?: string
  name: string
  school: string
  grade: string
  class_time: string
  teacher_name: string
  parent_name: string
  parent_phone: string
  is_active: boolean
  textbook_grade: string
  wise_step: string
}

export default function TeacherStudentsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [importedStudents, setImportedStudents] = useState<Student[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)
  const [importResult, setImportResult] = useState({ added: 0, skipped: 0 })
  const [editStudent, setEditStudent] = useState<Student | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editSchedules, setEditSchedules] = useState<{day: string, time: string, periods: number}[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function fetchStudents() {
    setLoading(true)
    let query = supabase.from('students').select('*').eq('is_active', true).order('name')
    const { data, error } = await query
    if (!error && data) setStudents(data)
    setLoading(false)
  }

  useEffect(() => { fetchStudents() }, [])

  // 담당 학생 필터
  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    return s.teacher_name === currentUser?.name
  })

  const filtered = myStudents.filter((s) =>
    s.name?.includes(searchText) || s.school?.includes(searchText)
  )

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const worksheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, string>[]
        const parsed: Student[] = jsonData
          .filter((row) => String(row['재원여부'] ?? '').toUpperCase() === 'O')
          .map((row) => ({
            name:          String(row['이름'] ?? '').trim(),
            school:        String(row['학교'] ?? '').trim(),
            grade:         String(row['학년'] ?? '').trim(),
            class_time:    String(row['수업'] ?? '').trim(),
            teacher_name:  String(row['담임강사'] ?? '').trim(),
            parent_name:   String(row['보호자이름'] ?? '').trim(),
            parent_phone:  String(row['보호자연락처'] ?? '').trim(),
            is_active:     true,
            textbook_grade: 'B',
          }))
          .filter((s) => s.name !== '')
        setImportedStudents(parsed)
        setShowImport(true)
        setImportDone(false)
      } catch {
        alert('파일을 읽는 중 오류가 발생했습니다.')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function handleImport() {
    setImporting(true)
    let added = 0, skipped = 0
    for (const student of importedStudents) {
      const { data: existing } = await supabase
        .from('students').select('id').eq('name', student.name).eq('school', student.school).maybeSingle()
      if (existing) { skipped++; continue }
      const { error } = await supabase.from('students').insert({
        name: student.name, school: student.school, grade: student.grade,
        class_time: student.class_time, teacher_name: student.teacher_name,
        parent_name: student.parent_name, parent_phone: student.parent_phone,
        is_active: true, textbook_grade: 'B',
      })
      if (!error) added++; else skipped++
    }
    setImportResult({ added, skipped })
    setImporting(false)
    setImportDone(true)
    fetchStudents()
  }

  async function handleSaveEdit() {
    if (!editStudent?.id) return
    const { error } = await supabase
      .from('students')
      .update({
        name: editStudent.name, school: editStudent.school, grade: editStudent.grade,
        class_time: editStudent.class_time, teacher_name: editStudent.teacher_name,
        parent_name: editStudent.parent_name, parent_phone: editStudent.parent_phone,
        textbook_grade: editStudent.textbook_grade,
        wise_step: editStudent.wise_step || 'W',
      })
      .eq('id', editStudent.id)
    if (error) { alert('수정 중 오류가 발생했습니다.'); return }

    // schedules 테이블 업데이트 (기존 삭제 후 재등록)
    await supabase.from('schedules').update({ is_active: false }).eq('student_id', editStudent.id)
    for (const sc of editSchedules) {
      if (sc.day && sc.time) {
        await supabase.from('schedules').insert({
          student_id: editStudent.id,
          day_of_week: sc.day,
          start_time: sc.time,
          periods: sc.periods,
          is_active: true,
        })
      }
    }

    // class_time 텍스트 자동 업데이트 (목록 표시용)
    const DAY_ORDER = ['월','화','수','목','금','토','일']
    const sortedSchedules = [...editSchedules]
      .filter(sc => sc.day && sc.time)
      .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
    const classTimeText = sortedSchedules
      .map(sc => `${sc.day}${sc.time.slice(0,5)}·${sc.periods}교시`)
      .join(', ')
    await supabase.from('students').update({ class_time: classTimeText }).eq('id', editStudent.id)

    setShowEditModal(false)
    fetchStudents()
  }

  async function handleDelete(studentId: string, name: string) {
    if (!confirm(`${name} 학생을 삭제할까요?`)) return
    const { error } = await supabase.from('students').update({ is_active: false }).eq('id', studentId)
    if (!error) fetchStudents()
    else alert('삭제 중 오류가 발생했습니다.')
  }

  const GRADE_COLORS: Record<string, string> = {
    A: 'bg-blue-100 text-blue-700',
    B: 'bg-green-100 text-green-700',
    C: 'bg-orange-100 text-orange-700',
  }

  return (
    <div>
      <Header
        title="학생관리"
        action={
          <div className="flex gap-2">
            <button onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg">
              📥 엑셀 업로드
            </button>
            <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
              + 학생 등록
            </button>
          </div>
        }
      />

      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 엑셀 업로드 미리보기 */}
        {showImport && importedStudents.length > 0 && (
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-green-800">📥 엑셀 업로드 미리보기</h3>
                <p className="text-xs text-green-600 mt-0.5">재원중인 학생 {importedStudents.length}명 확인됨</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            {importDone ? (
              <div className="p-6 text-center">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-base font-bold text-green-700">등록 완료!</p>
                <p className="text-sm text-gray-500 mt-1">
                  <span className="text-green-600 font-bold">{importResult.added}명</span> 등록 ·{' '}
                  <span className="text-orange-500 font-bold">{importResult.skipped}명</span> 중복 건너뜀
                </p>
                <button onClick={() => { setShowImport(false); setImportDone(false) }}
                  className="mt-4 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl">확인</button>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['이름','학교','학년','수업시간','담임강사','보호자'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importedStudents.slice(0, 10).map((s, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="px-3 py-2 font-semibold text-gray-800">{s.name}</td>
                          <td className="px-3 py-2 text-gray-600">{s.school}</td>
                          <td className="px-3 py-2 text-gray-600">{s.grade}</td>
                          <td className="px-3 py-2 text-gray-600">{s.class_time}</td>
                          <td className="px-3 py-2 text-gray-600">{s.teacher_name}</td>
                          <td className="px-3 py-2 text-gray-600">{s.parent_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importedStudents.length > 10 && (
                    <p className="text-center text-xs text-gray-400 py-2">외 {importedStudents.length - 10}명 더 있음</p>
                  )}
                </div>
                <div className="p-4 border-t border-gray-100">
                  <button onClick={handleImport} disabled={importing}
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                    {importing
                      ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />등록 중...</>
                      : <>✅ {importedStudents.length}명 일괄 등록하기</>}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 검색 */}
        <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름 또는 학교로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />

        {/* 학생 목록 */}
        <SectionCard title="전체 학생" subtitle={loading ? '불러오는 중...' : `총 ${filtered.length}명`}>
          {loading ? (
            <div className="text-center py-8">
              <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin inline-block" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">등록된 학생이 없어요</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((student) => (
                <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-transparent hover:bg-gray-50">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {student.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{student.name}</p>
                      {student.grade && <Badge variant="gray" size="sm">{student.grade}</Badge>}
                      {student.teacher_name && <Badge variant="blue" size="sm">{student.teacher_name}</Badge>}
                      {/* 교재 등급 */}
                      <span className={cx('text-[10px] font-bold px-2 py-0.5 rounded-full', GRADE_COLORS[student.textbook_grade] ?? 'bg-gray-100 text-gray-500')}>
                        {student.textbook_grade ?? 'B'}등급
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[student.school, student.class_time].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={async () => {
                      setEditStudent(student)
                      // 기존 시간표 불러오기
                      const { data: scData } = await supabase
                        .from('schedules')
                        .select('*')
                        .eq('student_id', student.id)
                        .eq('is_active', true)
                        .order('day_of_week')
                      setEditSchedules(scData ? scData.map((s: any) => ({
                        day: s.day_of_week,
                        time: s.start_time.slice(0, 5),
                        periods: s.periods ?? 2,
                      })) : [])
                      setShowEditModal(true)
                    }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100">수정</button>
                    <button onClick={() => handleDelete(student.id!, student.name)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100">삭제</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 수정 모달 */}
      {showEditModal && editStudent && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end md:items-center md:justify-center"
          onClick={() => setShowEditModal(false)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">학생 정보 수정</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400">✕</button>
            </div>

            {/* 교재 등급 */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">교재 등급</label>
              <div className="flex gap-2">
                {['A','B','C'].map((g) => (
                  <button key={g} onClick={() => setEditStudent({ ...editStudent, textbook_grade: g })}
                    className={cx('flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all',
                      editStudent.textbook_grade === g
                        ? g === 'A' ? 'bg-blue-600 text-white border-blue-600'
                          : g === 'B' ? 'bg-green-600 text-white border-green-600'
                          : 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-500 border-gray-200')}>
                    {g}등급
                    <span className="block text-[10px] font-normal opacity-70">
                      {g === 'A' ? '하루 3개' : g === 'B' ? '하루 2개' : '하루 1개'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* W·I·S·E Step */}
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-2">
                🎯 W·I·S·E Step
                <span className="text-gray-400 font-normal ml-1">(현재 학습 단계)</span>
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { step: 'W', desc: 'Warm-up', sub: '도입' },
                  { step: 'I', desc: 'Input', sub: '개념' },
                  { step: 'S', desc: 'Skill', sub: '유형연습' },
                  { step: 'E', desc: 'Evaluation', sub: '확인' },
                ].map(({ step, desc, sub }) => (
                  <button key={step}
                    onClick={() => setEditStudent({ ...editStudent, wise_step: step })}
                    className={cx('py-2.5 rounded-xl text-sm font-black border-2 transition-all flex flex-col items-center gap-0.5',
                      editStudent.wise_step === step
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200')}>
                    <span>{step}</span>
                    <span className="text-[9px] font-normal opacity-70">{sub}</span>
                  </button>
                ))}
              </div>
              {editStudent.wise_step && (
                <p className="text-xs text-blue-600 mt-1.5 font-semibold">
                  ✓ 수업일지 입력 시 {editStudent.wise_step} 단계가 자동 표시됩니다
                </p>
              )}
            </div>

            {/* 기타 정보 */}
            {[
              { label:'이름',       key:'name',         placeholder:'학생 이름' },
              { label:'학교',       key:'school',       placeholder:'학교명' },
              { label:'학년',       key:'grade',        placeholder:'예: 중3, 고1' },
              { label:'담임강사',   key:'teacher_name', placeholder:'담임 선생님 이름' },
              { label:'보호자',     key:'parent_name',  placeholder:'보호자 이름' },
              { label:'보호자 연락처', key:'parent_phone', placeholder:'010-0000-0000' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                <input type="text"
                  value={String(editStudent[key as keyof Student] ?? '')}
                  onChange={(e) => setEditStudent({ ...editStudent, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            ))}

            {/* 시간표 편집 */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-600">수업 시간표</label>
                <button
                  onClick={() => setEditSchedules([...editSchedules, { day: '월', time: '16:00', periods: 2 }])}
                  className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">
                  + 추가
                </button>
              </div>
              {editSchedules.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-2">등록된 시간표가 없어요</p>
              )}
              {editSchedules.map((sc, idx) => (
                <div key={idx} className="flex items-center gap-2 mb-2">
                  <select value={sc.day}
                    onChange={(e) => {
                      const updated = [...editSchedules]
                      updated[idx] = { ...updated[idx], day: e.target.value }
                      setEditSchedules(updated)
                    }}
                    className="px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none">
                    {['월','화','수','목','금','토'].map((d) => (
                      <option key={d} value={d}>{d}요일</option>
                    ))}
                  </select>
                  <select value={sc.time}
                    onChange={(e) => {
                      const updated = [...editSchedules]
                      updated[idx] = { ...updated[idx], time: e.target.value }
                      setEditSchedules(updated)
                    }}
                    className="px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none flex-1">
                    {['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30','17:00','17:30','18:00','18:30','19:00','19:30','20:00','20:30','21:00'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <select value={sc.periods}
                    onChange={(e) => {
                      const updated = [...editSchedules]
                      updated[idx] = { ...updated[idx], periods: parseFloat(e.target.value) }
                      setEditSchedules(updated)
                    }}
                    className="px-2 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none">
                    {[1, 1.5, 2, 2.5, 3, 3.5, 4].map((p) => (
                      <option key={p} value={p}>{p}교시</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setEditSchedules(editSchedules.filter((_, i) => i !== idx))}
                    className="text-red-400 hover:text-red-600 text-sm font-bold px-1">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={() => setShowEditModal(false)}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-xl">취소</button>
              <button onClick={handleSaveEdit}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl">저장</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}