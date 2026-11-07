// 진로 설문 — 서버 쪽 공용 (app/api/career, app/api/career/test 가 같이 쓴다)
// ★ 서버(service_role)에서만 import 한다. 브라우저 코드에서 부르지 말 것.

import { createClient } from '@supabase/supabase-js'
import { CONSENT_VERSION, FORMS, cleanAnswers, formForGrade, surveyKeyOf, type FormId } from '@/lib/careerSurvey'
import { isTestStudentId } from '@/lib/testStudents'

export type Db = ReturnType<typeof serviceDb>
export function serviceDb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/** 이 학생이 할 수 있는 설문 — 대상 학년이면 그 하나, 테스트 학생이면 둘 다 */
export function formsFor(student: { id: string; grade: string | null }): FormId[] {
  if (isTestStudentId(student.id)) return ['pre1', 'pre2']
  const f = formForGrade(student.grade)
  return f ? [f] : []
}

/** 지금 판 문구에 동의했고 철회하지 않은 가장 최근 동의 */
export async function activeConsent(db: Db, studentId: string, role: string) {
  const { data } = await db.from('career_consents')
    .select('id, signer_name, required_agreed, optional_agreed, agreed_at, consent_version')
    .eq('student_id', studentId).eq('signer_role', role).is('revoked_at', null)
    .eq('consent_version', CONSENT_VERSION).eq('required_agreed', true)
    .order('agreed_at', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

/** 화면이 처음 열릴 때 필요한 것 한 묶음 */
export async function loadState(db: Db, student: { id: string; name: string; grade: string | null }, role: 'student' | 'parent') {
  const forms = formsFor(student)
  const consent = await activeConsent(db, student.id, role)
  const answers: Record<string, { answers: any; updated_at: string } | null> = {}
  for (const f of forms) {
    const { data } = await db.from('career_surveys').select('answers, updated_at')
      .eq('student_id', student.id).eq('survey_key', surveyKeyOf(f)).eq('respondent', role).maybeSingle()
    answers[f] = data ?? null
  }
  return {
    role, student: { name: student.name, grade: student.grade },
    isTest: isTestStudentId(student.id), forms, consent, answers,
  }
}

/**
 * 설문 내기 — 동의가 없으면 함께 온 동의를 먼저 저장하고, 답을 저장한다.
 * 잘못이면 { status, error } 를, 잘 되면 null 을 돌려준다.
 */
export async function submitSurvey(
  db: Db, student: { id: string; grade: string | null }, role: 'student' | 'parent', b: any, userAgent: string,
): Promise<{ status: number; error: string } | null> {
  const form = String(b?.form ?? '') as FormId
  if (!FORMS[form] || !formsFor(student).includes(form))
    return { status: 400, error: '이 학생이 할 수 있는 설문이 아니에요.' }

  let consent = await activeConsent(db, student.id, role)
  if (!consent) {
    const c = b?.consent ?? {}
    if (c.required !== true) return { status: 400, error: '개인정보 수집·이용 [필수] 항목에 동의해 주세요.' }
    const name = String(c.signer_name ?? '').trim().slice(0, 20)
    if (!name) return { status: 400, error: '동의하시는 분 이름을 적어 주세요.' }
    const { count } = await db.from('career_consents').select('id', { count: 'exact', head: true })
      .eq('student_id', student.id).gte('agreed_at', new Date(Date.now() - 60_000).toISOString())
    if ((count ?? 0) >= 3) return { status: 429, error: '조금 뒤에 다시 해 주세요.' }
    const { data, error } = await db.from('career_consents').insert({
      student_id: student.id, signer_role: role, signer_name: name,
      consent_version: CONSENT_VERSION, required_agreed: true, optional_agreed: c.optional === true,
      user_agent: userAgent.slice(0, 300),
    }).select('id, signer_name, required_agreed, optional_agreed, agreed_at, consent_version').single()
    if (error || !data) { console.error('career consent', error); return { status: 500, error: '저장하지 못했어요. 다시 눌러 주세요.' } }
    consent = data
  }

  const answers = cleanAnswers(form, b?.answers)
  if (!answers.field) return { status: 400, error: '「관심 있는 계열」을 하나 이상 골라 주세요.' }
  const { error } = await db.from('career_surveys').upsert({
    student_id: student.id, survey_key: surveyKeyOf(form), respondent: role,
    answers, consent_id: consent.id, updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id,survey_key,respondent' })
  if (error) { console.error('career answer', error); return { status: 500, error: '저장하지 못했어요. 다시 눌러 주세요.' } }
  return null
}

export async function revokeConsent(db: Db, studentId: string, role: string) {
  const { error } = await db.from('career_consents').update({ revoked_at: new Date().toISOString() })
    .eq('student_id', studentId).eq('signer_role', role).is('revoked_at', null)
  if (error) console.error('career revoke', error)
  return !error
}
