// 진로 설문 — 서버 쪽 공용 (app/api/career, app/api/career/test 가 같이 쓴다)
// ★ 서버(service_role)에서만 import 한다. 브라우저 코드에서 부르지 말 것.

import { randomBytes } from 'node:crypto'
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
export async function loadState(db: Db, student: { id: string; name: string; grade: string | null }, role: 'student' | 'parent', only?: FormId[]) {
  const forms = only ?? formsFor(student)
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
  allowed?: FormId[],
): Promise<{ status: number; error: string } | null> {
  const form = String(b?.form ?? '') as FormId
  if (!FORMS[form] || !(allowed ?? formsFor(student)).includes(form))
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

// ── 문자 링크 (원장님 2026-11-07 「스터디체크 로그인을 안 하시니 문자로, 설명회 설문처럼」) ──────────


export const SITE = 'https://studycheck-five.vercel.app'
const ALNUM = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'   // 헷갈리는 0·O·1·l·I 빼고
export function newToken(n = 12) {
  const b = randomBytes(n)
  return Array.from(b, (x) => ALNUM[x % ALNUM.length]).join('')
}
export const isToken = (t: string) => /^[A-Za-z0-9]{12}$/.test(t)
export const linkUrl = (token: string) => `${SITE}/c/${token}`

/** 학생·응답자·이번 차수마다 링크 하나. 있으면 그대로, 없으면 만든다 */
export async function ensureLink(db: Db, studentId: string, respondent: 'student' | 'parent', form: FormId) {
  const survey_key = surveyKeyOf(form)
  const { data: old } = await db.from('career_links').select('token, form')
    .eq('student_id', studentId).eq('respondent', respondent).eq('survey_key', survey_key).maybeSingle()
  if (old) return old.token as string
  for (let i = 0; i < 3; i++) {
    const token = newToken()
    const { error } = await db.from('career_links').insert({ token, student_id: studentId, respondent, form, survey_key })
    if (!error) return token
    // 같은 학생 링크가 그새 생겼으면 그것을 쓴다
    const { data: again } = await db.from('career_links').select('token')
      .eq('student_id', studentId).eq('respondent', respondent).eq('survey_key', survey_key).maybeSingle()
    if (again) return again.token as string
  }
  throw new Error('링크를 만들지 못했어요.')
}

/** 이 학생에게 문자로 보낼 설문 종류 — 대상 학년이면 그것, 테스트 학생이면 고른 것(없으면 예비고2) */
export function formForSend(student: { id: string; grade: string | null }, testForm?: string): FormId | null {
  const f = formForGrade(student.grade)
  if (f) return f
  if (isTestStudentId(student.id)) return testForm === 'pre1' ? 'pre1' : 'pre2'
  return null
}

// ── 학생부 로드맵 소식 (2026-11-07) ──────────────────────────────────────────

/** 이 학생이 질문지에서 고른 계열 — 학생 답·학부모 답을 합친다. 아무 답도 없으면 null */
export async function fieldsOfStudent(db: Db, studentId: string): Promise<string[] | null> {
  const { data } = await db.from('career_surveys').select('answers').eq('student_id', studentId)
  if (!data?.length) return null
  const set = new Set<string>()
  for (const r of data) for (const f of (r.answers?.field ?? []) as string[]) set.add(f)
  return [...set]
}
