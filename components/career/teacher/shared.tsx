// 선생님 「진로·활동 기록」 화면 — 탭끼리 같이 쓰는 모양·자료형

export const GREEN = '#085041'
export const MINT = '#F0FBF7'
export const LINE = '#C7DED6'
export const PEACH = '#F5C4B3'
export const BROWN = '#712B13'
export const BASE = 'https://studycheck-five.vercel.app'

export type Student = {
  id: string; name: string; school: string | null; grade: string | null
  teacher_name: string | null; clinic_teacher_name: string | null; is_test: boolean | null; on_leave: boolean | null
  parent_phone?: string | null
}
export type Consent = {
  id: string; student_id: string; signer_role: 'student' | 'parent'; signer_name: string | null
  consent_version: string; optional_agreed: boolean; agreed_at: string; revoked_at: string | null
}
export type Survey = { id: string; student_id: string; survey_key: string; respondent: 'student' | 'parent'; answers: Record<string, any>; updated_at: string }
export type Activity = {
  id: string; student_id: string; kind: string; school_year: number | null; semester: number | null
  grade_at: string | null; subject: string | null; title: string; detail: string | null; status: string | null
  activity_date: string | null; created_by_name: string | null; created_at: string; updated_at: string
}

/** 학부모님께 보내는 안내 문자 — 앱 첫 화면 띠를 누르게 한다 */
export const SMS_TEXT = '[수학의지혜]\n'
  + '안녕하세요, 수학의지혜입니다.\n'
  + '학생 진로에 맞는 선택과목·탐구 주제·공부 방향을 챙겨 드리려고 짧은 진로 설문(3분)을 준비했습니다.\n'
  + '스터디체크 앱에 로그인하시면 첫 화면 초록색 「진로 설문」 띠에서 하실 수 있어요.\n'
  + '학생 본인과 학부모님 각각 해 주시면 더 정확히 안내드릴 수 있습니다.\n'
  + BASE

export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })

export function Badge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap"
      style={on ? { background: GREEN, color: '#fff' } : { background: '#F3F4F6', color: '#9CA3AF' }}>{children}</span>
  )
}

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl p-5 ${className}`} style={{ border: `1px solid ${LINE}` }}>{children}</div>
}
