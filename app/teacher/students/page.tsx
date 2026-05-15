'use client'

import { useState, useRef, useEffect } from 'react'
import { Header } from '@/components/common/Header'
import { SectionCard, Badge } from '@/components/ui'
import { cx } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'

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
}

export default function TeacherStudentsPage() {
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
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 학생 목록 불러오기
  async function fetchStudents() {
    setLoading(true)
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (!error && data) setStudents(data)
    setLoading(false)
  }

  useEffect(() => { fetchStudents() }, [])

  const filtered = students.filter((s) =>
    s.name?.includes(searchText) || s.school?.includes(searchText)
  )

  // 엑셀 파일 읽기
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
            name:         String(row['이름'] ?? '').trim(),
            school:       String(row['학교'] ?? '').trim(),
            grade:        String(row['학년'] ?? '').trim(),
            class_time:   String(row['수업'] ?? '').trim(),
            teacher_name: String(row['담임강사'] ?? '').trim(),
            parent_name:  String(row['보호자이름'] ?? '').trim(),
            parent_phone: String(row['보호자연락처'] ?? '').trim(),
            is_active:    true,
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

  // 일괄 등록 (중복 체크 포함)
  async function handleImport() {
    setImporting(true)
    let added = 0
    let skipped = 0

    for (const student of importedStudents) {
      // 이름+학교 중복 체크
      const { data: existing } = await supabase
        .from('students')
        .select('id')
        .eq('name', student.name)
        .eq('school', student.school)
        .maybeSingle()

      if (existing) {
        skipped++
        continue
      }

      const { error } = await supabase
        .from('students')
        .insert({
          name:         student.name,
          school:       student.school,
          grade:        student.grade,
          class_time:   student.class_time,
          teacher_name: student.teacher_name,
          parent_name:  student.parent_name,
          parent_phone: student.parent_phone,
          is_active:    true,
        })

      if (!error) added++
      else skipped++
    }

    setImportResult({ added, skipped })
    setImporting(false)
    setImportDone(true)
    fetchStudents()
  }

  // 학생 수정
  async function handleSaveEdit() {
    if (!editStudent?.id) return
    const { error } = await supabase
      .from('students')
      .update({
        name:         editStudent.name,
        school:       editStudent.school,
        grade:        editStudent.grade,
        class_time:   editStudent.class_time,
        teacher_name: editStudent.teacher_name,
        parent_name:  editStudent.parent_name,
        parent_phone: editStudent.parent_phone,
      })
      .eq('id', editStudent.id)
    if (!error) {
      setShowEditModal(false)
      fetchStudents()
    } else {
      alert('수정 중 오류가 발생했습니다.')
    }
  }

  // 학생 삭제 (비활성화)
  async function handleDelete(studentId: string, name: string) {
    if (!confirm(`${name} 학생을 삭제할까요?`)) return
    const { error } = await supabase
      .from('students')
      .update({ is_active: false })
      .eq('id', studentId)
    if (!error) fetchStudents()
    else alert('삭제 중 오류가 발생했습니다.')
  }

  return (
    <div>
      <Header
        title="학생 관리"
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
                  className="mt-4 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl">
                  확인
                </button>
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
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2">
                    {importing
                      ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />등록 중...</>
                      : <>✅ {importedStudents.length}명 일괄 등록하기</>
                    }
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
              <p className="text-sm text-gray-400 mt-2">학생 목록 불러오는 중...</p>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-400 py-8">등록된 학생이 없어요</p>
          ) : (
            <div className="space-y-2">
              {filtered.map((student) => (
                <div key={student.id} className="flex items-center gap-3 p-3 rounded-xl border-2 border-transparent hover:bg-gray-50">
                  {/* 아바타 */}
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {student.name[0]}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-800">{student.name}</p>
                      {student.grade && <Badge variant="gray" size="sm">{student.grade}</Badge>}
                      {student.teacher_name && <Badge variant="blue" size="sm">{student.teacher_name}</Badge>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[student.school, student.class_time].filter(Boolean).join(' · ')}
                    </p>
                    {student.parent_name && (
                      <p className="text-xs text-gray-400">보호자: {student.parent_name} {student.parent_phone}</p>
                    )}
                  </div>

                  {/* 수정/삭제 버튼 */}
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => { setEditStudent(student); setShowEditModal(true) }}
                      className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => handleDelete(student.id!, student.name)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-red-500 bg-red-50 rounded-lg hover:bg-red-100"
                    >
                      삭제
                    </button>
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
          <div className="bg-white w-full max-w-lg rounded-t-3xl md:rounded-2xl p-6 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">학생 정보 수정</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400">✕</button>
            </div>

            {[
              { label: '이름',     key: 'name',         placeholder: '학생 이름' },
              { label: '학교',     key: 'school',       placeholder: '학교명' },
              { label: '학년',     key: 'grade',        placeholder: '예: 중3, 고1' },
              { label: '수업시간', key: 'class_time',   placeholder: '예: 월수금4' },
              { label: '담임강사', key: 'teacher_name', placeholder: '담임 선생님 이름' },
              { label: '보호자',   key: 'parent_name',  placeholder: '보호자 이름' },
              { label: '보호자 연락처', key: 'parent_phone', placeholder: '010-0000-0000' },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                <input
                  type="text"
                  value={String(editStudent[key as keyof Student] ?? '')}
                  onChange={(e) => setEditStudent({ ...editStudent, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}

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