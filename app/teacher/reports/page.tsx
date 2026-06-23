'use client'

import { useState, useEffect, useRef } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { cx } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface Student {
  id: string
  name: string
  school: string
  grade: string
  teacher_name: string
}

interface WorksheetRecord {
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
  memo: string | null
}

const GRADE_GROUPS = [
  { label: '초등', grades: ['초1','초2','초3','초4','초5','초6'] },
  { label: '중등', grades: ['중1','중2','중3'] },
  { label: '고등', grades: ['고1','고2','고3'] },
]

interface Concept {
  id: string
  grade: string
  semester: number
  chapter: string
  sub_chapter: string
  concept_order: number
  concept_name: string
}

interface StudentTextbook {
  id: string
  student_id: string
  textbook_name: string
  textbook_type: string
  grade: string | null
  semester: number | null
  status: string
}

interface ProgressCheck {
  id: string
  student_id: string
  concept_id: string
  check_count: number
}

interface Exam {
  id: string
  student_id: string
  exam_type: string
  exam_date: string
  title: string | null
  unit: string | null
  unit_name: string | null
  level: number | null
  score: number | null
  total_score: number
  memo: string | null
}

const EXAM_CONFIG: Record<string, { color: string; bg: string; dot: string }> = {
  '입학테스트': { color: '#085041', bg: '#F0FBF7', dot: '#9FE1CB' },
  '진단평가':   { color: '#633806', bg: '#FAEEDA', dot: '#EF9F27' },
  '코어테스트': { color: '#27500A', bg: '#EAF3DE', dot: '#639922' },
  '학교시험':   { color: '#1e3a5f', bg: '#EFF6FF', dot: '#3b82f6' },
}

export default function TeacherReportsPage() {
  const { currentUser, isAdmin } = useAuth()
  const [students, setStudents] = useState<Student[]>([])
  const [worksheets, setWorksheets] = useState<WorksheetRecord[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [searchText, setSearchText] = useState('')
  const [selectedGroup, setSelectedGroup] = useState('초등')
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null)
  const [selectedTeacher, setSelectedTeacher] = useState<string | null>(null)
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [studentTextbooks, setStudentTextbooks] = useState<StudentTextbook[]>([])
  const [progressChecks, setProgressChecks] = useState<ProgressCheck[]>([])
  const [examPreps, setExamPreps] = useState<any[]>([])
  const [deleting, setDeleting] = useState<string | null>(null)

  // 월간보고서 상태
  const [activeTab, setActiveTab] = useState<'report' | 'monthly'>('report')
  const [mStudent, setMStudent] = useState<Student | null>(null)
  const [mSearchText, setMSearchText] = useState('')
  const [mYear, setMYear] = useState(new Date().getFullYear())
  const [mMonth, setMMonth] = useState(new Date().getMonth() + 1)
  const [mComment, setMComment] = useState('')
  const [mGenerating, setMGenerating] = useState(false)
  const [mData, setMData] = useState<any>(null)
  const [mLoading, setMLoading] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => { fetchData() }, [])

  useEffect(() => {
    if (!selectedStudent) return
    async function fetchStudentProgress() {
      const { data } = await supabase.from('progress_checks').select('*').eq('student_id', selectedStudent.id)
      if (data) setProgressChecks(data)
    }
    fetchStudentProgress()
  }, [selectedStudent])

  // 권한 체크: 관리자는 전부, 강사는 본인 입력분만
  function canDelete(teacherName: string | null | undefined) {
    if (isAdmin()) return true
    return teacherName === currentUser?.name
  }

  // 평가 기록 삭제
  async function deleteExam(examId: string) {
    if (!confirm('이 평가 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    setDeleting(examId)
    const { error } = await supabase.from('exams').delete().eq('id', examId)
    if (!error) setExams((prev) => prev.filter((e) => e.id !== examId))
    else alert('삭제 실패: ' + error.message)
    setDeleting(null)
  }

  // 학습지 기록 삭제
  async function deleteWorksheet(wsId: string) {
    if (!confirm('이 학습지 기록을 삭제할까요? 되돌릴 수 없어요.')) return
    setDeleting(wsId)
    const { error } = await supabase.from('student_worksheets').delete().eq('id', wsId)
    if (!error) setWorksheets((prev) => prev.filter((w) => w.id !== wsId))
    else alert('삭제 실패: ' + error.message)
    setDeleting(null)
  }

  async function fetchData() {
    setLoading(true)
    const [{ data: studentData }, { data: worksheetData }, { data: conceptData }, { data: tbData }, { data: pcData }, { data: examData }, { data: epData }] = await Promise.all([
      supabase.from('students').select('*').eq('is_active', true).order('name'),
      supabase.from('student_worksheets').select('*').order('assigned_at', { ascending: true }),
      supabase.from('concepts').select('*').order('grade').order('semester').order('concept_order'),
      supabase.from('student_textbooks').select('*'),
      supabase.from('progress_checks').select('*').limit(10000),
      supabase.from('exams').select('*').order('exam_date', { ascending: true }),
      supabase.from('student_exam_prep').select('*, inner_enough(*)').order('exam_date', { ascending: true }),
    ])
    if (studentData) setStudents(studentData)
    if (worksheetData) setWorksheets(worksheetData)
    if (conceptData) setConcepts(conceptData)
    if (tbData) setStudentTextbooks(tbData)
    if (pcData) setProgressChecks(pcData)
    if (examData) setExams(examData)
    if (epData) setExamPreps(epData)
    setLoading(false)
  }

  const currentGrades = GRADE_GROUPS.find((g) => g.label === selectedGroup)?.grades ?? []
  const teachers = [...new Set(
    students.flatMap((s) => (s.teacher_name ?? '').split(/[,，、]/).map((t) => t.trim()).filter(Boolean))
  )].sort()

  const myStudents = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    const ts = s.teacher_name.split(/[,，、]/).map((t) => t.trim()).filter(Boolean)
    return ts.includes(currentUser.name)
  })

  const filteredStudents = myStudents.filter((s) => {
    const gradeMatch = currentGrades.some((g) =>
      selectedGroup === '초등' ? s.grade?.includes('초') && s.grade?.includes(g.replace('초','')) :
      selectedGroup === '중등' ? s.grade?.includes('중') :
      s.grade?.includes('고')
    )
    const gradeFilterMatch = selectedGrade ? s.grade === selectedGrade : true
    const teacherMatch = selectedTeacher
      ? ((s.teacher_name ?? '').split(/[,，、]/).map((t) => t.trim()).includes(selectedTeacher))
      : true
    const searchMatch = s.name.includes(searchText) || s.school?.includes(searchText)
    return gradeMatch && gradeFilterMatch && teacherMatch && searchMatch
  })

  // ── 초등용: 단원 × 레벨 테이블 ──
  function getStudentUnits(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    const units = [...new Set(studentWS.map((w) => `${w.grade_level}__${w.unit}__${w.unit_name ?? ''}`))]
    return units.map((u) => {
      const [grade_level, unit, unit_name] = u.split('__')
      return { grade_level, unit, unit_name }
    })
  }

  function getRecord(studentId: string, gradeLevel: string, unit: string, level: number) {
    const records = worksheets.filter((w) =>
      w.student_id === studentId && w.grade_level === gradeLevel &&
      w.unit === unit && w.current_level === level
    )
    return records.length > 0 ? records[records.length - 1] : null
  }

  function getUsedLevels(studentId: string) {
    const levels = [...new Set(worksheets.filter((w) => w.student_id === studentId).map((w) => w.current_level))].sort((a, b) => a - b)
    return levels.length > 0 ? levels : [1.0, 1.5, 2.0, 2.5, 3.0]
  }

  function getCellStyle(record: WorksheetRecord | null) {
    if (!record) return { bg: 'bg-white', text: '-', textColor: 'text-gray-300' }
    if (record.status === 'assigned') return { bg: 'bg-white border border-blue-200', text: '진행중', textColor: 'text-gray-800' }
    if (record.status === 'similar_assigned' || record.status === 'similar_submitted') return { bg: 'bg-purple-50 border border-purple-200', text: '오답유사', textColor: 'text-[#712B13]' }
    if (record.status === 'submitted') return { bg: 'bg-orange-50 border border-orange-200', text: '채점대기', textColor: 'text-orange-500' }
    if (record.score != null) {
      if (record.score >= 85) return { bg: 'bg-green-100', text: `${record.score}점`, textColor: 'text-green-700' }
      if (record.score >= 80) return { bg: 'bg-yellow-100', text: `${record.score}점`, textColor: 'text-yellow-700' }
      return { bg: 'bg-red-100', text: `${record.score}점`, textColor: 'text-red-600' }
    }
    return { bg: 'bg-white', text: '-', textColor: 'text-gray-300' }
  }

  // ── 중등용: 단원/차시별 1차/오답유사 점수 ──
  function getMiddleUnitGroups(studentId: string) {
    const studentWS = worksheets.filter((w) => w.student_id === studentId)
    // unit 기준으로 그룹핑
    const unitMap: Record<string, WorksheetRecord[]> = {}
    studentWS.forEach((w) => {
      const key = `${w.unit}__${w.unit_name ?? ''}`
      if (!unitMap[key]) unitMap[key] = []
      unitMap[key].push(w)
    })
    return Object.entries(unitMap).map(([key, records]) => {
      const [unit, unit_name] = key.split('__')
      // 1차: main, 오답유사: similar
      const mainRecords = records.filter((r) => r.worksheet_type === 'main').sort(
        (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      )
      const similarRecords = records.filter((r) => r.worksheet_type === 'similar').sort(
        (a, b) => new Date(a.assigned_at).getTime() - new Date(b.assigned_at).getTime()
      )
      return { unit, unit_name, mainRecords, similarRecords, allRecords: records }
    })
  }

  function scoreColor(score: number | null) {
    if (score == null) return 'text-gray-400'
    if (score >= 85) return 'text-green-600'
    if (score >= 80) return 'text-yellow-600'
    return 'text-red-500'
  }

  function scoreBg(score: number | null) {
    if (score == null) return 'bg-white'
    if (score >= 85) return 'bg-green-50'
    if (score >= 80) return 'bg-yellow-50'
    return 'bg-red-50'
  }

  const isMiddleOrHigh = selectedStudent
    ? selectedStudent.grade.includes('중') || selectedStudent.grade.includes('고')
    : false

  const studentUnits = selectedStudent && !isMiddleOrHigh ? getStudentUnits(selectedStudent.id) : []
  const middleUnitGroups = selectedStudent && isMiddleOrHigh ? getMiddleUnitGroups(selectedStudent.id) : []


  // ── 월간보고서 데이터 로딩 ──
  async function loadMonthlyData(student: Student, year: number, month: number) {
    setMLoading(true)
    setMData(null)
    setMComment('')
    const startStr = `${year}-${String(month).padStart(2,'0')}-01`
    const endDate = new Date(year, month, 0)
    const endStr = `${year}-${String(month).padStart(2,'0')}-${String(endDate.getDate()).padStart(2,'0')}`

    const [{ data: sessionsData }, { data: notesData }, { data: wsData }, { data: examData }, { data: tbData }, { data: pcData }] = await Promise.all([
      supabase.from('class_sessions').select('*').eq('student_id', student.id).gte('session_date', startStr).lte('session_date', endStr),
      supabase.from('learning_notes').select('*'),
      supabase.from('student_worksheets').select('*').eq('student_id', student.id),
      supabase.from('exams').select('*').eq('student_id', student.id).gte('exam_date', startStr).lte('exam_date', endStr),
      supabase.from('student_textbooks').select('*').eq('student_id', student.id).eq('status','assigned'),
      supabase.from('progress_checks').select('*').limit(10000).eq('student_id', student.id),
    ])

    const sessions = sessionsData ?? []
    const sessionIds = sessions.map((s: any) => s.id)
    const notes = (notesData ?? []).filter((n: any) => sessionIds.includes(n.session_id))

    const attendance = { 정시: 0, 지각: 0, 결석: 0 }
    notes.forEach((n: any) => {
      if (n.attendance === '정시') attendance.정시++
      else if (n.attendance === '지각') attendance.지각++
      else if (n.attendance === '결석') attendance.결석++
    })
    const totalSessions = sessions.length

    const hwNotes = notes.filter((n: any) => n.attendance !== '결석')
    const hwDone = hwNotes.filter((n: any) => n.workbook_done || n.worksheet_submitted).length
    const hwRate = hwNotes.length > 0 ? Math.round(hwDone / hwNotes.length * 100) : 0

    const monthWS = (wsData ?? []).filter((w: any) => w.assigned_at >= startStr && w.assigned_at <= endStr)
    const scoredWS = monthWS.filter((w: any) => w.score != null)
    const avgScore = scoredWS.length > 0 ? Math.round(scoredWS.reduce((s: number, w: any) => s + w.score, 0) / scoredWS.length) : null
    const passedWS = monthWS.filter((w: any) => w.status === 'passed').length
    const passRate = monthWS.length > 0 ? Math.round(passedWS / monthWS.length * 100) : 0

    const tbs = (tbData ?? []).filter((t: any) => t.textbook_type !== '연산서')
    const calcTbs = (tbData ?? []).filter((t: any) => t.textbook_type === '연산서')
    const tbProgress = tbs.map((tb: any) => {
      const tbC = concepts.filter((c: any) => c.grade === tb.grade && String(c.semester) === String(tb.semester))
      if (tbC.length === 0) return null
      const checked = tbC.filter((c: any) => (pcData ?? []).some((p: any) => p.concept_id === c.id && p.check_count >= 1))
      return { name: tb.textbook_name, type: tb.textbook_type, rate: Math.round(checked.length / tbC.length * 100) }
    }).filter(Boolean)
    const calcProgress = calcTbs.map((tb: any) => ({ name: tb.textbook_name, percent: tb.progress_percent ?? 0 }))

    setMData({ totalSessions, attendance, hwRate, avgScore, passRate, monthWS: monthWS.length, tbProgress, calcProgress, monthExams: examData ?? [], student, year, month })
    setMLoading(false)
  }

  async function generateAIComment() {
    if (!mData) return
    setMGenerating(true)
    try {
      const prompt = `다음은 수학 학원 학생의 한 달 학습 데이터입니다. 학부모에게 보내는 따뜻하고 전문적인 한 줄 평(2~3문장)을 작성해주세요. 이모지 사용 금지. 학생 이름: ${mData.student.name}, 학년: ${mData.student.grade}, 수업 횟수: ${mData.totalSessions}회, 출결: 정시 ${mData.attendance.정시}회/지각 ${mData.attendance.지각}회/결석 ${mData.attendance.결석}회, 과제달성률: ${mData.hwRate}%, 학습지 평균: ${mData.avgScore ?? '미채점'}점, 통과율: ${mData.passRate}%, 교재진도: ${mData.tbProgress.map((t: any) => t.name + ' ' + t.rate + '%').join(', ')}`
      const res = await fetch('/api/generate-feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }) })
      const data = await res.json()
      setMComment(data.message ?? '')
    } catch { setMComment('') }
    setMGenerating(false)
  }

  async function saveAsImage() {
    if (!reportRef.current) return
    const html2canvas = (await import('html2canvas')).default
    const el = reportRef.current; const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: '#0f3460', width: el.offsetWidth, height: el.offsetHeight, windowWidth: el.offsetWidth, windowHeight: el.offsetHeight, imageTimeout: 0, allowTaint: true })
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `${mData?.student?.name}_${mData?.year}년${mData?.month}월_학습보고서.png`
    a.click()
  }

  const myStudentsForMonthly = students.filter((s) => {
    if (isAdmin()) return true
    if (!currentUser?.name || !s.teacher_name) return false
    return s.teacher_name.split(/[,，、]/).map((t: string) => t.trim()).includes(currentUser.name)
  }).filter((s) => s.name.includes(mSearchText) || s.school?.includes(mSearchText))

  return (
    <div style={{ background: '#ffffff', minHeight: '100vh' }}>
      <Header title="보고서" subtitle="학생별 학습 현황" />
      <div className="px-4 py-4 space-y-4 md:px-6">

        {/* 탭 */}
        <div className="flex gap-2">
          {([['report','학습 보고서'],['monthly','월간 보고서']] as [string,string][]).map(([tab,label]) => (
            <button key={tab} onClick={() => setActiveTab(tab as 'report'|'monthly')}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all"
              style={activeTab === tab ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#6b7280' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ══ 월간보고서 탭 ══ */}
        {activeTab === 'monthly' && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wide">학생 · 월 선택</p>
              <input value={mSearchText} onChange={e => setMSearchText(e.target.value)} placeholder="이름 검색"
                className="w-full text-sm rounded-xl px-3 py-2 mb-3 outline-none"
                style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }} />
              <div className="flex flex-wrap gap-2 mb-4 max-h-32 overflow-y-auto">
                {myStudentsForMonthly.map(s => (
                  <button key={s.id} onClick={() => { setMStudent(s); setMData(null); setMComment('') }}
                    className="text-xs px-3 py-1.5 rounded-xl font-medium transition-all"
                    style={mStudent?.id === s.id ? { background: '#1a1a2e', color: 'white' } : { background: '#f3f4f6', color: '#374151' }}>
                    {s.name} <span style={{ opacity: 0.5 }}>{s.grade}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <select value={mYear} onChange={e => setMYear(Number(e.target.value))}
                  className="text-sm rounded-xl px-3 py-2 outline-none flex-1"
                  style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  {[2024,2025,2026].map(y => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select value={mMonth} onChange={e => setMMonth(Number(e.target.value))}
                  className="text-sm rounded-xl px-3 py-2 outline-none flex-1"
                  style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                  {Array.from({length:12},(_,i)=>i+1).map(m => <option key={m} value={m}>{m}월</option>)}
                </select>
                <button onClick={() => mStudent && loadMonthlyData(mStudent, mYear, mMonth)}
                  disabled={!mStudent || mLoading}
                  className="px-4 py-2 rounded-xl text-sm font-bold"
                  style={{ background: mStudent ? '#1a1a2e' : '#e5e7eb', color: mStudent ? 'white' : '#9ca3af' }}>
                  {mLoading ? '로딩...' : '불러오기'}
                </button>
              </div>
            </div>

            {mData && (
              <div className="rounded-2xl p-4" style={{ background: 'white', border: '1px solid #f3f4f6' }}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">선생님 한 줄 평</p>
                  <button onClick={generateAIComment} disabled={mGenerating}
                    className="text-xs px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5"
                    style={{ background: '#F0FBF7', color: '#085041', border: '1px solid #9FE1CB' }}>
                    <i className="ti ti-sparkles" style={{ fontSize: 12 }} />
                    {mGenerating ? 'AI 생성 중...' : 'AI 자동생성'}
                  </button>
                </div>
                <textarea value={mComment} onChange={e => setMComment(e.target.value)}
                  placeholder="학부모에게 전달할 한 줄 평을 입력하거나 AI 자동생성을 눌러주세요" rows={3}
                  className="w-full text-sm rounded-xl px-3 py-2.5 outline-none resize-none"
                  style={{ background: '#f9fafb', border: '1px solid #e5e7eb', lineHeight: 1.6 }} />
              </div>
            )}

            {mData && (
              <>
                {/* 보고서 카드 (이미지 캡처 대상) */}
                <div ref={reportRef} style={{ background: '#0f3460', borderRadius: 20, padding: 28, fontFamily: 'Pretendard, sans-serif', color: 'white' }}>
                  {/* 헤더 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#9FE1CB', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>수학의지혜 · MONTHLY REPORT</div>
                      <div style={{ fontSize: 22, fontWeight: 900 }}>{mData.student.name}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{mData.student.school} · {mData.student.grade} · {currentUser?.name} 선생님</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 32, fontWeight: 900, color: '#9FE1CB', lineHeight: 1 }}>{mData.month}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>월 보고서 · {mData.year}</div>
                    </div>
                  </div>
                  <div style={{ height: 1, background: '#9FE1CB', marginBottom: 20 }} />

                  {/* 출결 + 과제 */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)' }}>
                      <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>출결 현황</div>
                      <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{mData.totalSessions}<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>회</span></div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span style={{ fontSize: 10, color: '#9FE1CB' }}>정시 {mData.attendance.정시}</span>
                        <span style={{ fontSize: 10, color: '#FAEEDA' }}>지각 {mData.attendance.지각}</span>
                        <span style={{ fontSize: 10, color: '#F5C4B3' }}>결석 {mData.attendance.결석}</span>
                      </div>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)' }}>
                      <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>과제 달성률</div>
                      <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{mData.hwRate}<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 1 }}>%</span></div>
                      <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                        <div style={{ height: 4, borderRadius: 4, width: `${mData.hwRate}%`, background: mData.hwRate >= 80 ? '#9FE1CB' : mData.hwRate >= 60 ? '#FAEEDA' : '#F5C4B3' }} />
                      </div>
                    </div>
                  </div>

                  {/* 학습지 */}
                  {mData.monthWS > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>학습지 현황</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                        <div><div style={{ fontSize: 18, fontWeight: 900 }}>{mData.monthWS}</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>총 학습지</div></div>
                        <div><div style={{ fontSize: 18, fontWeight: 900, color: mData.avgScore != null ? (mData.avgScore >= 85 ? '#9FE1CB' : mData.avgScore >= 70 ? '#FAEEDA' : '#F5C4B3') : 'rgba(255,255,255,0.4)' }}>{mData.avgScore ?? '-'}</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>평균점수</div></div>
                        <div><div style={{ fontSize: 18, fontWeight: 900, color: mData.passRate >= 80 ? '#9FE1CB' : '#FAEEDA' }}>{mData.passRate}%</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>통과율</div></div>
                      </div>
                    </div>
                  )}

                  {/* 교재 진도 */}
                  {(mData.tbProgress.length > 0 || mData.calcProgress.length > 0) && (
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>교재 진도</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {mData.tbProgress.map((tb: any, i: number) => (
                          <div key={i}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{tb.name}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: tb.rate >= 80 ? '#9FE1CB' : '#FAEEDA' }}>{tb.rate}%</span>
                            </div>
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, width: `${tb.rate}%`, background: tb.rate >= 80 ? '#9FE1CB' : '#FAEEDA' }} />
                            </div>
                          </div>
                        ))}
                        {mData.calcProgress.map((tb: any, i: number) => (
                          <div key={`c${i}`}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{tb.name} <span style={{ color: '#c4b5fd', fontSize: 9 }}>연산</span></span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#c4b5fd' }}>{tb.percent}%</span>
                            </div>
                            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                              <div style={{ height: 4, borderRadius: 4, width: `${tb.percent}%`, background: '#c4b5fd' }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 평가 */}
                  {mData.monthExams.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>평가 성적</div>
                      {mData.monthExams.map((e: any) => {
                        const pct = e.total_score > 0 ? Math.round(e.score / e.total_score * 100) : null
                        return (
                          <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{e.exam_type}{e.unit ? ` · ${e.unit}` : ''}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: pct != null ? (pct >= 85 ? '#9FE1CB' : pct >= 70 ? '#FAEEDA' : '#F5C4B3') : 'rgba(255,255,255,0.4)' }}>
                              {e.score != null ? `${e.score}/${e.total_score} (${pct}%)` : '미채점'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 한 줄 평 */}
                  {mComment && (
                    <div style={{ background: 'rgba(159,225,203,0.1)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.3)', marginBottom: 12 }}>
                      <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>선생님 코멘트</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7 }}>{mComment}</div>
                    </div>
                  )}

                  {/* 푸터 */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>수학의지혜 학원</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{mData.year}.{String(mData.month).padStart(2,'0')}</div>
                  </div>
                </div>

                <button onClick={saveAsImage}
                  className="w-full py-3.5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: '#1a1a2e', color: 'white' }}>
                  <i className="ti ti-download" style={{ fontSize: 16 }} />
                  이미지 저장 (카카오톡 전송용)
                </button>
              </>
            )}
          </div>
        )}

        {/* ══ 기존 학습보고서 탭 ══ */}
        {activeTab === 'report' && (
          <>
        {/* 학생 선택 */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-50">
            <h3 className="text-sm font-bold text-gray-800">학생 선택</h3>
          </div>
          <div className="p-3 space-y-3">
            {/* 학교급 탭 */}
            <div className="flex gap-2">
              {GRADE_GROUPS.map((g) => {
                const count = myStudents.filter((s) =>
                  g.label === '초등' ? s.grade?.includes('초') :
                  g.label === '중등' ? s.grade?.includes('중') :
                  s.grade?.includes('고')
                ).length
                return (
                  <button key={g.label}
                    onClick={() => { setSelectedGroup(g.label); setSelectedGrade(null); setSelectedStudent(null) }}
                    className={cx('flex-1 py-2 rounded-xl text-sm font-bold border transition-all',
                      selectedGroup === g.label ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-600 border-gray-200')}>
                    {g.label}
                    <span className={cx('ml-1 text-xs', selectedGroup === g.label ? 'text-blue-200' : 'text-gray-400')}>
                      {count}명
                    </span>
                  </button>
                )
              })}
            </div>

            {/* 학년 필터 */}
            <div className="flex gap-1.5 flex-wrap">
              <button onClick={() => setSelectedGrade(null)}
                className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                  selectedGrade === null ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200')}>
                전체
              </button>
              {currentGrades.map((g) => {
                const count = myStudents.filter((s) => s.grade === g).length
                return (
                  <button key={g} onClick={() => setSelectedGrade(g)}
                    className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                      selectedGrade === g ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200')}>
                    {g} <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>

            {/* 선생님 필터 - 관리자만 */}
            {isAdmin() && teachers.length > 0 && (
              <div className="flex gap-1.5 flex-wrap">
                <button onClick={() => setSelectedTeacher(null)}
                  className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                    selectedTeacher === null ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                  👩‍🏫 전체
                </button>
                {teachers.map((t) => (
                  <button key={t} onClick={() => setSelectedTeacher(t)}
                    className={cx('px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all',
                      selectedTeacher === t ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' : 'bg-white text-gray-500 border-gray-200')}>
                    {t}
                  </button>
                ))}
              </div>
            )}

            <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
              placeholder="이름 또는 학교로 검색"
              className="w-full px-3.5 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#9FE1CB]" />

            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto">
              {filteredStudents.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">해당하는 학생이 없어요</p>
              ) : (
                filteredStudents.map((s) => {
                  const hasRecord = worksheets.some((w) => w.student_id === s.id)
                  return (
                    <button key={s.id} onClick={() => setSelectedStudent(s)}
                      className={cx('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all',
                        selectedStudent?.id === s.id ? 'bg-[#9FE1CB] text-white border-[#9FE1CB]' :
                        hasRecord ? 'bg-white text-gray-700 border-gray-300 hover:border-blue-300' :
                        'bg-white text-gray-400 border-gray-100')}>
                      {s.name}
                      {s.teacher_name && <span className="ml-1 opacity-50 text-[10px]">{s.teacher_name}</span>}
                    </button>
                  )
                })
              )}
            </div>
            <p className="text-[10px] text-gray-400">총 {filteredStudents.length}명 · 과제기록 있는 학생은 진하게 표시</p>
          </div>
        </div>

        {/* 보고서 영역 */}
        {selectedStudent ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {/* 학생 헤더 */}
            <div className="px-4 py-3 border-b border-gray-50 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-sm font-bold text-blue-700 shrink-0">
                {selectedStudent.name[0]}
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-gray-900">{selectedStudent.name}</p>
                <p className="text-xs text-gray-400">
                  {selectedStudent.school} · {selectedStudent.grade}
                  {selectedStudent.teacher_name && ` · ${selectedStudent.teacher_name} 선생님`}
                </p>
              </div>
              <span className={cx('text-xs font-bold px-2 py-1 rounded-full',
                isMiddleOrHigh ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700')}>
                {isMiddleOrHigh ? '중등/고등 보고서' : '초등 진단표'}
              </span>
            </div>

            {/* ── 교재 진도 보고서 ── */}
            {(() => {
              const myTBs = studentTextbooks.filter((t) => t.student_id === selectedStudent.id)
              if (myTBs.length === 0) return null

              const activeTBs = myTBs.filter(t => t.status === 'assigned')
              const completedTBs = myTBs.filter(t => t.status === 'completed')
              const pausedTBs = myTBs.filter(t => t.status === 'paused')

              const GRADE_ORDER = ['초1','초2','초3','초4','초5','초6','중1','중2','중3','고1','고2','고3']
              const TYPE_ORDER: Record<string, number> = { '개념서': 0, '유형서': 1, '심화서': 2, '연산서': 3 }
              const TYPE_STYLE: Record<string, { dot: string; fill: string; text: string; label: string }> = {
                '개념서': { dot: '#EF9F27', fill: '#FAEEDA', text: '#633806', label: '개념' },
                '유형서': { dot: '#639922', fill: '#EAF3DE', text: '#27500A', label: '유형' },
                '심화서': { dot: '#dc2626', fill: '#fee2e2', text: '#991b1b', label: '심화' },
                '연산서': { dot: '#7c3aed', fill: '#ede9fe', text: '#5b21b6', label: '연산' },
              }

              return (
                <div className="border-b border-gray-100">
                  <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: "#fafafa", borderBottom: "1px solid #f0f0f0" }}><div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#FAECE7" }}><i className="ti ti-books" style={{ fontSize: 14, color: "#993C1D" }} /></div><span className="text-sm font-bold" style={{ color: "#1f2937" }}>교재 진도 현황</span></div>
                  <div className="px-4 py-4 space-y-4">
                    {/* 진행중 교재 - 격자 표시 */}
                    {activeTBs
                      .sort((a, b) => {
                        const gA = GRADE_ORDER.indexOf(a.grade ?? '')
                        const gB = GRADE_ORDER.indexOf(b.grade ?? '')
                        if (gA !== gB) return gA - gB
                        return (TYPE_ORDER[a.textbook_type] ?? 9) - (TYPE_ORDER[b.textbook_type] ?? 9)
                      })
                      .map((tb) => {
                        if (!tb.grade) return null
                        const tbConcepts = concepts.filter(
                          (c) => c.grade === tb.grade && c.semester === tb.semester
                        )
                        if (tbConcepts.length === 0) return null

                        const myChecks = progressChecks.filter((p) => p.student_id === selectedStudent.id)
                        // targetCount 제거

                        const checkedConcepts = tbConcepts.filter((c) =>
                          myChecks.some((p) => p.concept_id === c.id && p.check_count >= 1)
                        )
                        const rate = Math.round(checkedConcepts.length / tbConcepts.length * 100)
                        const style = TYPE_STYLE[tb.textbook_type] ?? TYPE_STYLE['개념서']

                        // 대단원별 그룹
                        const chapters = [...new Set(tbConcepts.map((c) => c.chapter))]

                        return (
                          <div key={tb.id}>
                            {/* 헤더 */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                                style={{ background: style.dot, color: '#fff' }}>
                                {style.label}
                              </span>
                              <span className="text-xs font-bold" style={{ color: '#1f2937' }}>
                                {tb.textbook_name}
                              </span>
                              <span className="text-[10px]" style={{ color: '#1f2937' }}>
                                {tb.grade} {tb.semester}학기
                              </span>
                              <span className="ml-auto text-xs font-bold" style={{ color: style.dot }}>
                                {rate}%
                              </span>
                            </div>

                            {/* 진도율 바 */}
                            <div className="h-1.5 rounded-full mb-3" style={{ background: '#f3f0ea' }}>
                              <div className="h-1.5 rounded-full transition-all"
                                style={{ width: `${rate}%`, background: style.dot }} />
                            </div>

                            {/* 대단원별 정방형 격자 */}
                            <div className="space-y-2">
                              {chapters.map((ch) => {
                                const chConcepts = tbConcepts.filter((c) => c.chapter === ch)
                                return (
                                  <div key={ch}>
                                    <p className="text-[10px] mb-1" style={{ color: '#1f2937' }}>{ch}</p>
                                    <div className="flex flex-wrap gap-1">
                                      {chConcepts.map((c) => {
                                        const check = myChecks.find((p) => p.concept_id === c.id)
                                        const done = check && check.check_count >= 1
                                        const partial = false
                                        return (
                                          <div key={c.id}
                                            title={c.concept_name}
                                            style={{
                                              width: 16, height: 16,
                                              borderRadius: 3,
                                              background: done ? style.dot : partial ? style.fill : '#f3f0ea',
                                              border: `1px solid ${done ? style.dot : partial ? style.dot + '80' : '#e5d5c5'}`,
                                              cursor: 'default',
                                              flexShrink: 0,
                                            }} />
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            {/* 범례 */}
                            <div className="flex gap-3 mt-2">
                              <div className="flex items-center gap-1">
                                <div style={{ width:10, height:10, borderRadius:2, background: style.dot }} />
                                <span className="text-[9px]" style={{ color: '#1f2937' }}>완료</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div style={{ width:10, height:10, borderRadius:2, background: style.fill, border: `1px solid ${style.dot}80` }} />
                                <span className="text-[9px]" style={{ color: '#1f2937' }}>진행중</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <div style={{ width:10, height:10, borderRadius:2, background: '#f3f0ea', border: '1px solid #9FE1CB60' }} />
                                <span className="text-[9px]" style={{ color: '#1f2937' }}>미진도</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    {/* 완료 교재 - 텍스트만 */}
                    {completedTBs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wide">완료한 교재</p>
                        <div className="flex flex-wrap gap-2">
                          {completedTBs.map(tb => (
                            <div key={tb.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                              style={{ background: '#F0FBF7', border: '1px solid #9FE1CB' }}>
                              <i className="ti ti-circle-check" style={{ fontSize: 11, color: '#085041' }} />
                              <span className="text-xs font-medium" style={{ color: '#085041' }}>{tb.textbook_name}</span>
                              {tb.grade && <span className="text-[10px]" style={{ color: '#9FE1CB' }}>{tb.grade}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* 중단 교재 - 텍스트만 */}
                    {pausedTBs.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wide">중단한 교재</p>
                        <div className="flex flex-wrap gap-2">
                          {pausedTBs.map(tb => (
                            <div key={tb.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
                              style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                              <i className="ti ti-pause" style={{ fontSize: 11, color: '#9ca3af' }} />
                              <span className="text-xs font-medium text-gray-500">{tb.textbook_name}</span>
                              {tb.grade && <span className="text-[10px] text-gray-400">{tb.grade}</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* ── 학습지 현황 (최근 6개월) ── */}
            {(() => {
              const sixMonthsAgo = new Date()
              sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
              const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]

              const recentWS = worksheets.filter((w) =>
                w.student_id === selectedStudent.id &&
                w.assigned_at >= sixMonthsAgoStr
              )
              if (recentWS.length === 0) return null

              const scored = recentWS.filter((w) => w.score != null)
              const avgScore = scored.length > 0
                ? Math.round(scored.reduce((s, w) => s + (w.score ?? 0), 0) / scored.length)
                : null
              const passedCount = recentWS.filter((w) => w.status === 'passed').length
              const passRate = Math.round(passedCount / recentWS.length * 100)

              // 레벨별 분포
              const levelMap: Record<number, number> = {}
              recentWS.forEach((w) => { levelMap[w.current_level] = (levelMap[w.current_level] ?? 0) + 1 })
              const levels = Object.entries(levelMap).sort((a, b) => Number(a[0]) - Number(b[0]))
              const maxCount = Math.max(...levels.map(([, c]) => c))

              // 최고 레벨
              const maxLevel = Math.max(...recentWS.map((w) => w.current_level))

              return (
                <div className="border-b border-gray-100">
                  <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                      <i className="ti ti-file-text" style={{ fontSize: 14, color: '#993C1D' }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: '#1f2937' }}>학습지 현황</span>
                    <span className="text-[10px] text-gray-400 ml-1">최근 6개월</span>
                  </div>
                  <div className="px-4 py-4">
                  {/* 요약 카드 */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                      <p className="text-[10px] text-gray-400 mb-0.5">총 학습지</p>
                      <p className="text-base font-bold text-gray-800">{recentWS.length}<span className="text-[10px] font-normal text-gray-400 ml-0.5">개</span></p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                      <p className="text-[10px] text-gray-400 mb-0.5">통과율</p>
                      <p className="text-base font-bold text-gray-800">{passRate}<span className="text-[10px] font-normal text-gray-400 ml-0.5">%</span></p>
                    </div>
                    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: '#f3f4f6' }}>
                      <p className="text-[10px] text-gray-400 mb-0.5">평균점수</p>
                      <p className="text-base font-bold text-gray-800">{avgScore ?? '-'}<span className="text-[10px] font-normal text-gray-400 ml-0.5">점</span></p>
                    </div>
                  </div>

                  {/* 레벨별 분포 막대 */}
                  <p className="text-[10px] text-gray-400 mb-2">레벨별 분포 <span className="ml-1 font-semibold text-gray-600">최고 {maxLevel}레벨</span></p>
                  <div className="flex items-end gap-2 h-10">
                    {levels.map(([level, count]) => {
                      const barH = Math.max(4, Math.round((count / maxCount) * 36))
                      const lv = Number(level)
                      const barColor = lv >= 4 ? '#F5C4B3' : '#D3D1C7'
                      const textColor = lv >= 4 ? '#993C1D' : '#6b7280'
                      return (
                        <div key={level} className="flex-1 flex flex-col items-center justify-end gap-0.5">
                          <span className="text-[9px] font-bold" style={{ color: textColor }}>{count}</span>
                          <div className="w-full rounded-t-sm" style={{ height: barH, background: barColor }} />
                          <span className="text-[9px] text-gray-400">{level}레벨</span>
                        </div>
                      )
                    })}
                  </div>
                  </div>
                </div>
              )
            })()}

            {/* ── 중등/고등 보고서 ── */}
            {isMiddleOrHigh ? (
              middleUnitGroups.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">아직 학습지 기록이 없어요</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {middleUnitGroups.map(({ unit, unit_name, mainRecords, similarRecords }, idx) => {
                    const latest = mainRecords[mainRecords.length - 1]
                    const first = mainRecords[0]
                    const latestSimilar = similarRecords[similarRecords.length - 1]
                    const isDone = latest?.status === 'passed' || latest?.status === 'scored'
                    return (
                      <div key={idx} className="px-4 py-3">
                        {/* 단원/차시 헤더 */}
                        <div className="flex items-start gap-2 mb-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-gray-800 truncate">
                              {unit}
                              {unit_name && <span className="text-gray-500 font-normal ml-1">· {unit_name}</span>}
                            </p>
                            {latest?.memo && (
                              <p className="text-[10px] text-blue-500 mt-0.5">{latest.memo}</p>
                            )}
                          </div>
                          <span className={cx('text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0',
                            isDone ? 'bg-green-100 text-green-600' :
                            latest?.status === 'assigned' ? 'bg-blue-100 text-gray-800' :
                            latest?.status === 'submitted' ? 'bg-orange-100 text-orange-500' :
                            'bg-gray-100 text-gray-400')}>
                            {isDone ? '완료' : latest?.status === 'assigned' ? '진행중' : latest?.status === 'submitted' ? '채점대기' : '-'}
                          </span>
                          {isAdmin() && (
                            <button
                              onClick={() => {
                                if (!confirm(`"${unit}" 단원의 학습지 기록 ${mainRecords.length + similarRecords.length}개를 모두 삭제할까요? 되돌릴 수 없어요.`)) return
                                const ids = [...mainRecords, ...similarRecords].map((r) => r.id)
                                Promise.all(ids.map((id) => supabase.from('student_worksheets').delete().eq('id', id)))
                                  .then(() => setWorksheets((prev) => prev.filter((w) => !ids.includes(w.id))))
                              }}
                              className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                              title="이 단원 기록 삭제">
                              <i className="ti ti-trash" style={{ fontSize: 14 }} />
                            </button>
                          )}
                        </div>

                        {/* 레벨 + 점수 */}
                        <div className="flex flex-wrap gap-2">
                          {/* 1차 시험 */}
                          {mainRecords.map((r, i) => (
                            <div key={r.id} className={cx('px-3 py-2 rounded-xl text-center min-w-[72px]', scoreBg(r.score))}>
                              <p className="text-[10px] text-gray-400 mb-0.5">
                                {i === 0 ? '1차' : `${i+1}차`} · {r.current_level}레벨
                              </p>
                              {r.score != null ? (
                                <p className={cx('text-sm font-black', scoreColor(r.score))}>{r.score}점</p>
                              ) : (
                                <p className={cx('text-xs font-bold',
                                  r.status === 'assigned' ? 'text-blue-500' :
                                  r.status === 'submitted' ? 'text-orange-500' : 'text-gray-400')}>
                                  {r.status === 'assigned' ? '과제중' : r.status === 'submitted' ? '채점대기' : '-'}
                                </p>
                              )}
                            </div>
                          ))}

                          {/* 오답유사 */}
                          {similarRecords.map((r, i) => (
                            <div key={r.id} className={cx('px-3 py-2 rounded-xl text-center min-w-[72px] border',
                              scoreBg(r.score), 'border-purple-200')}>
                              <p className="text-[10px] text-purple-400 mb-0.5">오답유사 · {r.current_level}레벨</p>
                              {r.score != null ? (
                                <p className={cx('text-sm font-black', scoreColor(r.score))}>{r.score}점</p>
                              ) : (
                                <p className={cx('text-xs font-bold',
                                  r.status === 'similar_assigned' ? 'text-purple-500' : 'text-orange-500')}>
                                  {r.status === 'similar_assigned' ? '과제중' : '채점대기'}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            ) : (
              /* ── 초등 진단표 ── */
              studentUnits.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-3xl mb-2">📋</p>
                  <p className="text-sm text-gray-400">아직 과제 기록이 없어요</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    {(() => {
                      const usedLevels = getUsedLevels(selectedStudent.id)
                      return (
                        <table className="w-full text-xs border-collapse">
                          <thead>
                            <tr className="bg-white">
                              <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[80px]">단원</th>
                              <th className="px-3 py-2.5 text-left text-gray-500 font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[120px]">단원명</th>
                              {usedLevels.map((l) => (
                                <th key={l} className={cx('px-3 py-2.5 text-center font-semibold border-b border-r border-gray-100 whitespace-nowrap min-w-[70px]',
                                  l >= 4 ? 'text-orange-500' : 'text-gray-500')}>
                                  {l}레벨
                                  {l >= 4 && <span className="block text-[9px] text-orange-400">심화</span>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {studentUnits.map(({ grade_level, unit, unit_name }, idx) => (
                              <tr key={idx} className="hover:bg-white/50">
                                <td className="px-3 py-2.5 border-b border-r border-gray-100">
                                  <p className="font-bold text-gray-800">{unit}</p>
                                  <p className="text-gray-400 text-[10px]">{grade_level}</p>
                                </td>
                                <td className="px-3 py-2.5 border-b border-r border-gray-100 text-gray-600">{unit_name || '-'}</td>
                                {usedLevels.map((level) => {
                                  const record = getRecord(selectedStudent.id, grade_level, unit, level)
                                  const cell = getCellStyle(record)
                                  return (
                                    <td key={level} className={cx('px-2 py-2.5 border-b border-r border-gray-100 text-center', cell.bg)}>
                                      <span className={cx('font-bold', cell.textColor)}>{cell.text}</span>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    })()}
                  </div>
                  {/* 범례 */}
                  <div className="px-4 py-3 border-t border-gray-50 flex flex-wrap gap-3">
                    <p className="text-[10px] font-bold text-gray-400 mr-1">범례:</p>
                    {[
                      { bg: 'bg-green-100', text: 'text-green-700', label: '85점↑ 통과' },
                      { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '80~84점' },
                      { bg: 'bg-red-100', text: 'text-red-600', label: '80점↓ 재도전' },
                      { bg: 'bg-white border border-blue-200', text: 'text-gray-800', label: '진행중' },
                      { bg: 'bg-purple-50 border border-purple-200', text: 'text-[#712B13]', label: '오답유사' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center gap-1">
                        <div className={cx('w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold', item.bg, item.text)}>점</div>
                        <span className="text-[10px] text-gray-500">{item.label}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-sm font-semibold text-gray-600">학생을 선택하면 보고서가 나와요</p>
            <p className="text-xs text-gray-400 mt-1">초등: 레벨별 진단표 · 중등: 단원/차시별 1차/오답유사 점수</p>
          </div>
        )}

        {/* ── 시험대비(이너프원) 섹션 ── */}
        {selectedStudent && (() => {
          const myPreps = examPreps.filter((ep) => ep.student_id === selectedStudent.id)
          if (myPreps.length === 0) return null
          return (
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden" style={{ borderColor: '#F5C4B3' }}>
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#FFF5F2', borderBottom: '1px solid #f0f0f0' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#F5C4B3' }}>
                  <i className="ti ti-pencil-check" style={{ fontSize: 14, color: '#712B13' }} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#712B13' }}>시험대비 현황</span>
                <span className="text-[10px] text-gray-400 ml-auto">{myPreps.length}개 단원</span>
              </div>
              <div className="divide-y divide-gray-50">
                {myPreps
                  .sort((a, b) => {
                    const sA = ['전범위','복합'].includes(a.inner_enough?.unit_name ?? '')
                    const sB = ['전범위','복합'].includes(b.inner_enough?.unit_name ?? '')
                    if (sA && !sB) return 1
                    if (!sA && sB) return -1
                    return (a.inner_enough?.unit_no ?? '').localeCompare(b.inner_enough?.unit_no ?? '', 'ko', { numeric: true })
                  })
                  .map((ep) => {
                    const ie = ep.inner_enough
                    if (!ie) return null
                    const totalSteps = ep.total_steps || 1
                    const pct = Math.round((ep.progress_step || 0) / totalSteps * 100)
                    return (
                      <div key={ep.id} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-gray-800 truncate">{ie.unit_name}</p>
                            <p className="text-[10px] text-gray-400 truncate">{ie.sub_unit_name} · {ie.problem_count}문항{ep.exam_date ? ` · 시험일 ${ep.exam_date}` : ''}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {ep.score != null && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                style={{ background: ep.score >= 90 ? '#EAF3DE' : ep.score >= 70 ? '#FAEEDA' : '#fee2e2', color: ep.score >= 90 ? '#27500A' : ep.score >= 70 ? '#633806' : '#991b1b' }}>{ep.score}점</span>
                            )}
                            <span className="text-xs font-black" style={{ color: pct >= 100 ? '#27500A' : pct > 0 ? '#993C1D' : '#9ca3af' }}>{pct}%</span>
                            {isAdmin() && (
                              <button onClick={async () => {
                                if (!confirm(`"${ie.unit_name}" 시험대비 배정을 삭제할까요?`)) return
                                const { error } = await supabase.from('student_exam_prep').delete().eq('id', ep.id)
                                if (!error) setExamPreps((prev) => prev.filter((x) => x.id !== ep.id))
                              }}
                                className="text-gray-300 hover:text-red-500 transition-colors" title="삭제">
                                <i className="ti ti-trash" style={{ fontSize: 13 }} />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="h-1.5 rounded-full" style={{ background: '#f3f4f6' }}>
                          <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? '#639922' : '#EF9F27' }} />
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )
        })()}

        {/* ── 평가 이력 섹션 ── */}
        {selectedStudent && (() => {
          const studentExams = exams.filter((e) => e.student_id === selectedStudent.id)
          if (studentExams.length === 0) return null

          const examTypes = ['입학테스트', '진단평가', '코어테스트', '학교시험'] as const

          return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3" style={{ background: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#FAECE7' }}>
                  <i className="ti ti-chart-bar" style={{ fontSize: 14, color: '#993C1D' }} />
                </div>
                <span className="text-sm font-bold" style={{ color: '#1f2937' }}>평가 이력</span>
              </div>

              <div className="divide-y divide-gray-50">
                {examTypes.map((type) => {
                  const typeExams = studentExams
                    .filter((e) => e.exam_type === type)
                    .sort((a, b) => a.exam_date.localeCompare(b.exam_date))
                  if (typeExams.length === 0) return null

                  const cfg = EXAM_CONFIG[type]
                  // 점수 퍼센트 계산
                  const scored = typeExams.filter((e) => e.score != null)
                  const pct = (e: Exam) => e.total_score > 0 ? Math.round((e.score ?? 0) / e.total_score * 100) : null

                  return (
                    <div key={type} className="px-4 py-4">
                      {/* 타입 헤더 */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold px-2.5 py-1 rounded-full"
                          style={{ background: '#FAECE7', color: '#993C1D' }}>
                          {type}
                        </span>
                        <span className="text-[10px] text-gray-400">{typeExams.length}회</span>
                        {scored.length > 0 && (
                          <span className="text-[10px] text-gray-400 ml-auto">
                            평균 {Math.round(scored.reduce((s, e) => s + (pct(e) ?? 0), 0) / scored.length)}%
                          </span>
                        )}
                      </div>

                      {/* 막대그래프 */}
                      {scored.length > 0 && (
                        <div className="mb-3">
                          <div className="flex items-end gap-1.5 h-16">
                            {typeExams.map((e, i) => {
                              const p = pct(e)
                              if (p == null) return (
                                <div key={e.id} className="flex-1 flex flex-col items-center justify-end gap-1">
                                  <div className="w-full rounded-t-sm" style={{ height: 4, background: '#f3f4f6' }} />
                                </div>
                              )
                              const barH = Math.max(4, Math.round(p * 0.44))
                              const isCoreMain = type === '코어테스트' && e.title === '본고사'
                              const barColor = isCoreMain ? '#F5C4B3' : '#D3D1C7'
                              return (
                                <div key={e.id} className="flex-1 flex flex-col items-center justify-end gap-1">
                                  <span className="text-[9px] font-bold" style={{ color: isCoreMain ? '#993C1D' : '#6b7280' }}>{p}%</span>
                                  <div className="w-full rounded-t-sm transition-all"
                                    style={{ height: barH, background: barColor, opacity: 0.85 }} />
                                </div>
                              )
                            })}
                          </div>
                          {/* x축 날짜 + 회차 */}
                          <div className="flex gap-1.5 mt-1">
                            {typeExams.map((e) => (
                              <div key={e.id} className="flex-1 text-center">
                                <span className="text-[9px] text-gray-400 block">
                                  {e.exam_date.slice(5).replace('-', '/')}
                                </span>
                                {type === '코어테스트' && e.title && (
                                  <span className="text-[8px] font-bold"
                                    style={{ color: e.title === '본고사' ? '#639922' : '#EF9F27' }}>
                                    {e.title === '본고사' ? '본' : e.title === '예비 1회' ? '예1' : '예2'}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* 상세 목록 */}
                      <div className="space-y-1.5">
                        {typeExams.map((e) => {
                          const p = pct(e)
                          const isCoreMain = type === '코어테스트' && e.title === '본고사'
                          const isCorePrep = type === '코어테스트' && e.title?.startsWith('예비')
                          const scoreColor = p == null ? '#9ca3af' : p >= 85 ? '#27500A' : p >= 70 ? '#633806' : '#991b1b'
                          const scoreBg = p == null ? '#f3f4f6' : p >= 85 ? '#EAF3DE' : p >= 70 ? '#FAEEDA' : '#fee2e2'
                          return (
                            <div key={e.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                              style={{ background: isCoreMain ? '#EAF3DE' : '#fafafa', border: isCoreMain ? '1px solid #c0dd97' : 'none' }}>
                              <span className="text-[10px] text-gray-400 w-12 shrink-0">{e.exam_date.slice(5).replace('-', '/')}</span>
                              {/* 코어테스트 회차 배지 */}
                              {type === '코어테스트' && e.title && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                                  style={isCoreMain
                                    ? { background: '#639922', color: 'white' }
                                    : { background: '#FAEEDA', color: '#633806' }}>
                                  {e.title}
                                </span>
                              )}
                              <span className="text-xs text-gray-700 flex-1 truncate">
                                {e.unit ?? (!isCoreMain && !isCorePrep ? e.title : null) ?? type}
                                {e.unit_name ? <span className="text-gray-400"> · {e.unit_name}</span> : null}
                              </span>
                              {e.level != null && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                                  style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                  Lv.{e.level}
                                </span>
                              )}
                              {e.score != null ? (
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full shrink-0"
                                  style={{ background: scoreBg, color: scoreColor }}>
                                  {e.score}/{e.total_score} ({p}%)
                                </span>
                              ) : (
                                <span className="text-[10px] text-gray-400 shrink-0">미채점</span>
                              )}
                              {canDelete(e.teacher_name) && (
                                <button onClick={() => deleteExam(e.id)} disabled={deleting === e.id}
                                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                                  title="삭제">
                                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}
          </>
        )}
      </div>
    </div>
  )
}
