'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/common/Header'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  grade: string
  teacher_name: string
}

interface ParsedRecord {
  date: string
  type: string       // 학습지 / 진단평가 / 월간평가 / 코어테스트 / 오답유사 등
  subject: string    // 과목/교재
  title: string      // 시험지 제목/단원명
  score: number | null
  totalScore: number | null
  selected: boolean
  studentName?: string
}

const TYPE_MAP: Record<string, { table: 'exams' | 'student_worksheets'; examType?: string }> = {
  '학습지':   { table: 'student_worksheets' },
  '오답유사': { table: 'student_worksheets' },
  '진단평가': { table: 'exams', examType: '진단평가' },
  '월간평가': { table: 'exams', examType: '월간평가' },
  '코어테스트': { table: 'exams', examType: '코어테스트' },
  '주간평가': { table: 'exams', examType: '주간평가' },
}

export default function ImportRecordsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedRecord[]>([])
  const [matchedStudent, setMatchedStudent] = useState<Student | null>(null)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [parseError, setParseError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchStudents() }, [])

  async function fetchStudents() {
    let q = supabase.from('students').select('id, name, grade, teacher_name').eq('is_active', true)
    if (!isAdmin() && currentUser?.name) q = q.ilike('teacher_name', `%${currentUser.name}%`)
    const { data } = await q
    setStudents(data ?? [])
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImage(file)
    setImagePreview(URL.createObjectURL(file))
    setParsed([])
    setMatchedStudent(null)
    setParseError('')
  }

  async function parseImage() {
    if (!image) return
    setParsing(true)
    setParseError('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(image)
      })

      const res = await fetch('/api/parse-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mimeType: image.type }),
      })
      const data = await res.json()

      if (!data.records || data.records.length === 0) {
        setParseError('학습 기록을 찾을 수 없어요. 다른 이미지를 시도해보세요.')
        setParsing(false)
        return
      }

      // 학생 자동 매칭
      if (data.studentName) {
        const matched = students.find(s =>
          s.name === data.studentName ||
          s.name.includes(data.studentName) ||
          data.studentName.includes(s.name)
        )
        setMatchedStudent(matched ?? null)
      }

      setParsed(data.records.map((r: any) => ({ ...r, selected: true })))
    } catch (e) {
      setParseError('파싱 중 오류가 발생했어요.')
    }
    setParsing(false)
  }

  async function saveRecords() {
    if (!matchedStudent) { alert('학생을 선택해주세요.'); return }
    const toSave = parsed.filter(r => r.selected)
    if (toSave.length === 0) { alert('저장할 항목을 선택해주세요.'); return }
    setSaving(true)

    for (const r of toSave) {
      const typeInfo = TYPE_MAP[r.type] ?? { table: 'exams', examType: r.type }

      if (typeInfo.table === 'student_worksheets') {
        await supabase.from('student_worksheets').insert({
          student_id: matchedStudent.id,
          subject: '수학',
          grade_level: matchedStudent.grade,
          unit: r.title,
          unit_name: r.title,
          current_level: 1,
          score: r.score,
          status: r.score != null ? 'scored' : 'assigned',
          worksheet_type: r.type === '오답유사' ? 'similar' : 'main',
          assigned_at: r.date,
        })
      } else {
        await supabase.from('exams').insert({
          student_id: matchedStudent.id,
          teacher_name: currentUser?.name ?? '',
          exam_type: typeInfo.examType ?? r.type,
          unit: r.subject,
          unit_name: r.title,
          score: r.score,
          total_score: r.totalScore ?? 100,
          exam_date: r.date,
        })
      }
    }

    setSaving(false)
    showToast(`✅ ${toSave.length}건 저장 완료!`)
    setParsed([])
    setImage(null)
    setImagePreview(null)
    setMatchedStudent(null)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const TYPE_COLOR: Record<string, { bg: string; color: string }> = {
    '학습지':    { bg: '#FAEEDA', color: '#633806' },
    '오답유사':  { bg: '#fee2e2', color: '#991b1b' },
    '진단평가':  { bg: '#EAF3DE', color: '#27500A' },
    '월간평가':  { bg: '#EFF6FF', color: '#1e3a5f' },
    '코어테스트': { bg: '#F5C4B3', color: '#712B13' },
    '주간평가':  { bg: '#f3e8ff', color: '#7e22ce' },
  }

  return (
    <div style={{ background: '#f9fafb', minHeight: '100vh' }}>
      <Header title="학습기록 가져오기" subtitle="이미지에서 학습 데이터를 자동으로 추출해요" />

      <div className="px-4 py-5 max-w-2xl mx-auto space-y-4">

        {/* 안내 */}
        <div className="rounded-2xl px-4 py-3 flex items-start gap-2.5"
          style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
          <i className="ti ti-info-circle mt-0.5" style={{ fontSize: 15, color: '#085041', flexShrink: 0 }} />
          <p className="text-xs" style={{ color: '#085041', lineHeight: 1.7 }}>
            외부 프로그램의 학습 기록 화면을 캡처해서 업로드하면<br />
            AI가 자동으로 날짜, 종류, 점수를 읽어서 StudyCheck에 저장해요.
          </p>
        </div>

        {/* 이미지 업로드 */}
        <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
          <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">이미지 업로드</p>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />

          {!imagePreview ? (
            <button onClick={() => fileRef.current?.click()}
              className="w-full py-10 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 transition-all hover:border-[#9FE1CB]"
              style={{ borderColor: '#e5e7eb' }}>
              <i className="ti ti-upload" style={{ fontSize: 28, color: '#9ca3af' }} />
              <p className="text-sm text-gray-400">클릭해서 이미지 업로드</p>
              <p className="text-[10px] text-gray-300">JPG, PNG 지원</p>
            </button>
          ) : (
            <div className="space-y-3">
              <div className="relative rounded-xl overflow-hidden">
                <img src={imagePreview} alt="업로드 이미지" className="w-full object-contain max-h-64" />
                <button onClick={() => { setImage(null); setImagePreview(null); setParsed([]); setMatchedStudent(null) }}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow">
                  <i className="ti ti-x" style={{ fontSize: 13, color: '#6b7280' }} />
                </button>
              </div>
              <button onClick={parseImage} disabled={parsing}
                className="w-full py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
                style={{ background: parsing ? '#e5e7eb' : '#085041', color: parsing ? '#9ca3af' : 'white' }}>
                <i className="ti ti-sparkles" style={{ fontSize: 15 }} />
                {parsing ? 'AI가 분석 중...' : 'AI로 학습기록 추출'}
              </button>
            </div>
          )}

          {parseError && (
            <p className="text-xs text-red-500 mt-2 text-center">{parseError}</p>
          )}
        </div>

        {/* 파싱 결과 */}
        {parsed.length > 0 && (
          <>
            {/* 학생 매칭 */}
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
              <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학생 매칭</p>
              {matchedStudent ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                  style={{ background: '#F0FBF7', border: '1.5px solid #9FE1CB' }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                    style={{ background: '#9FE1CB', color: '#085041' }}>
                    {matchedStudent.name[0]}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold" style={{ color: '#085041' }}>{matchedStudent.name}</p>
                    <p className="text-[10px] text-gray-400">{matchedStudent.grade}</p>
                  </div>
                  <button onClick={() => setMatchedStudent(null)}
                    className="text-[10px] text-gray-400 hover:text-red-400">변경</button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-orange-500 mb-2">⚠ 학생을 찾지 못했어요. 직접 선택해주세요.</p>
                  <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto">
                    {students.map(s => (
                      <button key={s.id} onClick={() => setMatchedStudent(s)}
                        className="px-2 py-1.5 rounded-xl text-xs font-medium transition-all text-left"
                        style={{ background: '#f3f4f6', color: '#374151' }}>
                        {s.name} <span style={{ opacity: 0.5 }}>{s.grade}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 파싱된 항목 */}
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">추출된 항목 ({parsed.length}건)</p>
                <button onClick={() => setParsed(prev => prev.map(r => ({ ...r, selected: !prev.every(x => x.selected) })))}
                  className="text-[10px] text-gray-400 hover:text-gray-600">
                  {parsed.every(r => r.selected) ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div className="space-y-2">
                {parsed.map((r, idx) => {
                  const tc = TYPE_COLOR[r.type] ?? { bg: '#f3f4f6', color: '#374151' }
                  const scoreColor = r.score == null ? '#9ca3af' : r.score / (r.totalScore ?? 100) >= 0.85 ? '#27500A' : r.score / (r.totalScore ?? 100) >= 0.7 ? '#633806' : '#991b1b'
                  return (
                    <div key={idx}
                      onClick={() => setParsed(prev => prev.map((x, i) => i === idx ? { ...x, selected: !x.selected } : x))}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all"
                      style={{
                        background: r.selected ? '#F0FBF7' : '#fafafa',
                        border: `1px solid ${r.selected ? '#9FE1CB' : '#f3f4f6'}`,
                      }}>
                      <div className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                        style={{ background: r.selected ? '#9FE1CB' : '#e5e7eb' }}>
                        {r.selected && <i className="ti ti-check" style={{ fontSize: 11, color: '#085041' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={tc}>{r.type}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{r.date}</span>
                        </div>
                        <p className="text-xs text-gray-700 truncate">{r.title}</p>
                        {r.subject && r.subject !== r.title && (
                          <p className="text-[10px] text-gray-400 truncate">{r.subject}</p>
                        )}
                      </div>
                      {r.score != null && (
                        <p className="text-sm font-black shrink-0" style={{ color: scoreColor }}>
                          {r.score}{r.totalScore ? `/${r.totalScore}` : ''}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 저장 버튼 */}
            <button onClick={saveRecords} disabled={saving || !matchedStudent}
              className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all"
              style={{
                background: saving || !matchedStudent ? '#e5e7eb' : '#085041',
                color: saving || !matchedStudent ? '#9ca3af' : 'white'
              }}>
              <i className="ti ti-device-floppy" style={{ fontSize: 16 }} />
              {saving ? '저장 중...' : `${parsed.filter(r => r.selected).length}건 StudyCheck에 저장`}
            </button>
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-lg text-sm font-medium"
          style={{ background: '#085041', color: 'white', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
