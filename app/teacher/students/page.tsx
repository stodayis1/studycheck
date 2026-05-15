'use client'

import { useState, useRef } from 'react'
import { Header } from '@/components/common/Header'
import { SectionCard, Badge, Button } from '@/components/ui'
import { MOCK_STUDENTS, MOCK_CLASSES } from '@/data/mockData'
import { cx } from '@/lib/utils'
import * as XLSX from 'xlsx'

interface ImportedStudent {
  name: string
  school: string
  grade: string
  class_time: string
  teacher: string
  parent_name: string
  parent_phone: string
  is_active: boolean
}

export default function TeacherStudentsPage() {
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')
  const [importedStudents, setImportedStudents] = useState<ImportedStudent[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const filtered = MOCK_STUDENTS.filter((s) =>
    s.name.includes(searchText) || s.school?.includes(searchText)
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
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, string>[]

        // 필요한 컬럼만 추출
        const students: ImportedStudent[] = jsonData
          .filter((row) => row['재원여부'] === 'O' || row['재원여부'] === 'o') // 재원중인 학생만
          .map((row) => ({
            name:         String(row['이름'] ?? ''),
            school:       String(row['학교'] ?? ''),
            grade:        String(row['학년'] ?? ''),
            class_time:   String(row['수업'] ?? ''),
            teacher:      String(row['담임강사'] ?? ''),
            parent_name:  String(row['보호자이름'] ?? ''),
            parent_phone: String(row['보호자연락처'] ?? ''),
            is_active:    true,
          }))
          .filter((s) => s.name !== '')

        setImportedStudents(students)
        setShowImport(true)
        setImportDone(false)
      } catch (err) {
        alert('파일을 읽는 중 오류가 발생했습니다.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  // 일괄 등록 처리
  async function handleImport() {
    setImporting(true)
    // TODO: Supabase 연동 시 여기서 INSERT
    // await supabase.from('students').insert(importedStudents)
    await new Promise((r) => setTimeout(r, 1500))
    setImporting(false)
    setImportDone(true)
  }

  return (
    <div>
      <Header
        title="학생 관리"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg"
            >
              📥 엑셀 업로드
            </button>
            <button className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg">
              + 학생 등록
            </button>
          </div>
        }
      />

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 엑셀 업로드 미리보기 */}
        {showImport && importedStudents.length > 0 && (
          <div className="bg-white rounded-2xl border border-green-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 bg-green-50 border-b border-green-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-green-800">📥 엑셀 업로드 미리보기</h3>
                <p className="text-xs text-green-600 mt-0.5">재원중인 학생 {importedStudents.length}명 확인됨</p>
              </div>
              <button onClick={() => setShowImport(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
            </div>

            {importDone ? (
              <div className="p-6 text-center">
                <p className="text-3xl mb-2">🎉</p>
                <p className="text-base font-bold text-green-700">등록 완료!</p>
                <p className="text-sm text-gray-500 mt-1">{importedStudents.length}명의 학생이 등록되었습니다</p>
                <button
                  onClick={() => { setShowImport(false); setImportDone(false) }}
                  className="mt-4 px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-xl"
                >
                  확인
                </button>
              </div>
            ) : (
              <>
                {/* 미리보기 테이블 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        {['이름', '학교', '학년', '수업시간', '담임강사', '보호자'].map((h) => (
                          <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importedStudents.slice(0, 10).map((s, i) => (
                        <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2 font-semibold text-gray-800">{s.name}</td>
                          <td className="px-3 py-2 text-gray-600">{s.school}</td>
                          <td className="px-3 py-2 text-gray-600">{s.grade}</td>
                          <td className="px-3 py-2 text-gray-600">{s.class_time}</td>
                          <td className="px-3 py-2 text-gray-600">{s.teacher}</td>
                          <td className="px-3 py-2 text-gray-600">{s.parent_name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {importedStudents.length > 10 && (
                    <p className="text-center text-xs text-gray-400 py-2">
                      외 {importedStudents.length - 10}명 더 있음
                    </p>
                  )}
                </div>

                {/* 등록 버튼 */}
                <div className="p-4 border-t border-gray-100">
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {importing ? (
                      <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />등록 중...</>
                    ) : (
                      <>✅ {importedStudents.length}명 일괄 등록하기</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* 검색 */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="학생 이름 또는 학교로 검색"
          className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* 학생 목록 */}
        <SectionCard title="전체 학생" subtitle={`총 ${filtered.length}명`}>
          <div className="space-y-2">
            {filtered.map((student) => {
              const cls = MOCK_CLASSES.find((c) => c.id === student.class_group_id)
              const isSelected = selectedStudentId === student.id
              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudentId(isSelected ? null : student.id)}
                  className={cx(
                    'flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border-2',
                    isSelected ? 'border-blue-300 bg-blue-50' : 'border-transparent hover:bg-gray-50',
                  )}
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                    {student.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-800">{student.name}</p>
                      <Badge variant="gray" size="sm">고{student.grade}</Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {student.school} · {cls?.name ?? '반 미배정'}
                    </p>
                  </div>
                  <Badge variant={student.parent_user_id ? 'green' : 'gray'} size="sm">
                    {student.parent_user_id ? '학부모 ✓' : '미연결'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </SectionCard>

      </div>
    </div>
  )
}