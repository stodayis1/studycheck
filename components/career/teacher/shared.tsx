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
  student_phone?: string | null
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

/**
 * 진로 설문 문자 — 학생·학부모마다 **자기 링크**가 들어간다 (로그인 없이 열림).
 * {이름} → 학생 이름, {링크} → 그 사람 링크. 원장님 2026-11-07 「설명회 설문조사처럼 문자로」
 */
export const SMS_PARENT = '[수학의지혜]\n'
  + '안녕하세요, {이름} 학생 어머님·아버님.\n'
  + '아이 진로에 맞춰 선택과목·탐구 주제·공부 방향을 챙겨 드리려고 짧은 진로 설문(3분)을 준비했습니다.\n'
  + '로그인 없이 아래 주소를 누르시면 바로 하실 수 있어요.\n'
  + '{링크}'
export const SMS_STUDENT = '[수학의지혜]\n'
  + '{이름} 학생, 안녕하세요! 수학의지혜예요.\n'
  + '진로에 맞는 선택과목·탐구 주제를 같이 챙겨 주려고 짧은 진로 설문(3분)을 준비했어요.\n'
  + '아래 주소를 누르면 바로 할 수 있어요.\n'
  + '{링크}'

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
