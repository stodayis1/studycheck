'use client'

// 진로·활동 기록 — /teacher/career
//
// 원장님 2026-11-07
//   「학생의 모든 활동을 기록하고 관리할거야. 탐구보고서 … 세부특기사항도 … 모두 기록」
//   「지금 이게 어떤 설문이 어떻게 진행되는지 알 길이 없는데」
//   「학부모 설문조사처럼 설문조사 형태로 만들어 달라니까? 게시는 각 학생·학부모 화면에 한다 생각하더라도」
//   「앞으로 모든 새로운 메뉴는 … 테스트 학생에게 테스트할 수 있는 메뉴도」
//
// 탭 세 개
//   ① 설문 안내 · 미리보기 — 누구에게 · 어디에 · 어떤 순서로. 미리보기 / 테스트 학생(원장=윤수지, 강사=테스트)으로 해 보기
//   ② 응답 현황           — 학부모 설문처럼 설문별 집계 · 학생별 응답 · 미응답 안내 문자(원장님)
//   ③ 학생별 기록         — 동의 · 학생 답 · 학부모 답 · 활동 기록(탐구보고서 · 세특 …)
//
// ★ 보이는 학생은 학생관리와 같다(canViewStudent). 세 표 모두 RLS 가 직원만 읽게 막는다.

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/utils'
import { formForGrade, type FormId } from '@/lib/careerSurvey'
import { isTestStudentId, myTestStudentId } from '@/lib/testStudents'
import GuideTab from '@/components/career/teacher/GuideTab'
import StatusTab from '@/components/career/teacher/StatusTab'
import RecordsTab from '@/components/career/teacher/RecordsTab'
import EventsTab from '@/components/career/teacher/EventsTab'
import { GREEN, LINE, type Student, type Consent, type Survey, type Activity } from '@/components/career/teacher/shared'

const TABS = [
  { key: 'guide', label: '① 질문지 안내 · 미리보기' },
  { key: 'status', label: '② 응답 현황' },
  { key: 'records', label: '③ 학생별 기록' },
  // 계열별 박람회·설명회 소식 — 2주에 한 번 (원장님 2026-11-07)
  { key: 'events', label: '④ 행사 소식' },
] as const

export default function TeacherCareerPage() {
  const { currentUser, loading: authLoading, canViewStudent } = useAuth()
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('guide')
  const [students, setStudents] = useState<Student[]>([])
  const [consents, setConsents] = useState<Consent[]>([])
  const [surveys, setSurveys] = useState<Survey[]>([])
  const [acts, setActs] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [selId, setSelId] = useState<string | null>(null)

  async function load() {
    const [st, co, sv, ac] = await Promise.all([
      fetchAllRows<Student>(() => supabase.from('students')
        .select('id, name, school, grade, teacher_name, clinic_teacher_name, is_test, on_leave, parent_phone, student_phone')
        .eq('is_active', true).order('name').order('id')),
      fetchAllRows<Consent>(() => supabase.from('career_consents').select('*').order('agreed_at').order('id')),
      fetchAllRows<Survey>(() => supabase.from('career_surveys').select('*').order('updated_at').order('id')),
      fetchAllRows<Activity>(() => supabase.from('student_activities').select('*').is('deleted_at', null)
        .order('created_at', { ascending: false }).order('id')),
    ])
    setStudents(st); setConsents(co); setSurveys(sv); setActs(ac)
    setLoading(false)
  }
  useEffect(() => { if (!authLoading && currentUser) load() }, [authLoading, currentUser?.id])

  // 내 테스트 학생은 담당이 아니어도 늘 보인다 (윤수지는 is_test 가 아니라 강사 화면에 안 보이므로 id 로 넣는다)
  const myTestId = myTestStudentId(currentUser?.role)
  const visible = useMemo(
    () => students.filter((s) => canViewStudent(s) || s.id === myTestId),
    [students, currentUser, canViewStudent, myTestId])
  const counts = useMemo(() => {
    const c: Record<FormId, number> = { pre1: 0, pre2: 0 }
    for (const s of visible) { const f = formForGrade(s.grade); if (f && !isTestStudentId(s.id)) c[f]++ }
    return c
  }, [visible])

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="학생부 로드맵" subtitle="질문지 · 개인정보 동의 · 탐구보고서 · 세특 · 행사 소식" />
      <div className="p-4 lg:p-6 space-y-4">
        <div className="flex gap-2 flex-wrap border-b pb-3" style={{ borderColor: LINE }}>
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className="px-4 py-2 rounded-xl text-sm font-bold border"
              style={tab === t.key ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, background: '#fff', color: '#374151' }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? <div className="p-10 text-center text-gray-400 text-sm">불러오는 중…</div> : (
          <>
            {tab === 'guide' && <GuideTab counts={counts} myTestId={myTestId} onTested={load} />}
            {tab === 'status' && (
              <StatusTab students={visible} consents={consents} surveys={surveys}
                isOwner={currentUser?.role === 'admin'}
                onOpenStudent={(id) => { setSelId(id); setTab('records') }} />
            )}
            {tab === 'records' && (
              <RecordsTab students={visible} consents={consents} surveys={surveys} acts={acts} setActs={setActs}
                selId={selId} setSelId={setSelId} />
            )}
            {tab === 'events' && <EventsTab isOwner={currentUser?.role === 'admin'} myName={currentUser?.name ?? ''} />}
          </>
        )}
      </div>
    </div>
  )
}
