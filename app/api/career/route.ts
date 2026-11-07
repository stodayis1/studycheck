/**
 * 진로 설문 · 개인정보 동의 — 학생·학부모가 앱에서 부르는 API
 *
 * 원장님 2026-11-07 「스터디체크 안에서 설문조사처럼 받아서 정보 반영」 「그전에 개인정보제공 동의 꼭」
 *
 *   GET                         내 학생 · 이번 설문 종류 · 내 동의 상태 · 내가 낸 답
 *   POST {action:'consent', signer_name, required, optional}   동의 (필수 항목에 동의해야 저장)
 *   POST {action:'revoke'}      동의 철회 (행은 남기고 revoked_at 만 채운다)
 *   POST {action:'answer', answers}                            설문 답 저장 (동의가 있어야)
 *
 * ★ 학생·학부모용이라 denyIfNotStaff 를 못 쓴다. 토큰 주인 → students.session_uid(학생) /
 *   parent_session_uid(학부모) 로 **본인을 서버가 정한다.** body 의 studentId 는 받지 않는다.
 * ★ 표(career_consents · career_surveys)에는 쓰기 정책이 없다 — 이 API(service_role)만 쓴다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { CONSENT_VERSION, formForGrade, surveyKeyOf, cleanAnswers, FORMS } from '@/lib/careerSurvey'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

type Me = { student: { id: string; name: string; grade: string | null }; role: 'student' | 'parent' } | null

async function whoAmI(req: Request, supabase: ReturnType<typeof db>): Promise<Me> {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return null
  const { data: au } = await supabase.auth.getUser(token)
  const uid = au?.user?.id
  if (!uid) return null
  const { data: s } = await supabase.from('students').select('id, name, grade')
    .eq('session_uid', uid).maybeSingle()
  if (s) return { student: s, role: 'student' }
  const { data: p } = await supabase.from('students').select('id, name, grade')
    .eq('parent_session_uid', uid).maybeSingle()
  if (p) return { student: p, role: 'parent' }
  return null
}

/** 지금 판 문구에 동의했고 철회하지 않은 가장 최근 동의 */
async function activeConsent(supabase: ReturnType<typeof db>, studentId: string, role: string) {
  const { data } = await supabase.from('career_consents')
    .select('id, signer_name, required_agreed, optional_agreed, agreed_at, consent_version')
    .eq('student_id', studentId).eq('signer_role', role).is('revoked_at', null)
    .eq('consent_version', CONSENT_VERSION).eq('required_agreed', true)
    .order('agreed_at', { ascending: false }).limit(1)
  return data?.[0] ?? null
}

const unauth = () => NextResponse.json({ error: '앱에 다시 로그인해 주세요.' }, { status: 401 })

export async function GET(req: Request) {
  const supabase = db()
  const me = await whoAmI(req, supabase)
  if (!me) return unauth()
  const form = formForGrade(me.student.grade)
  const consent = await activeConsent(supabase, me.student.id, me.role)
  let answers = null, answeredAt = null
  if (form) {
    const { data } = await supabase.from('career_surveys').select('answers, updated_at')
      .eq('student_id', me.student.id).eq('survey_key', surveyKeyOf(form)).eq('respondent', me.role).maybeSingle()
    answers = data?.answers ?? null
    answeredAt = data?.updated_at ?? null
  }
  return NextResponse.json({
    role: me.role,
    student: { name: me.student.name, grade: me.student.grade },
    form, formLabel: form ? FORMS[form].label : null,
    consent, answers, answeredAt,
  })
}

export async function POST(req: Request) {
  const supabase = db()
  const me = await whoAmI(req, supabase)
  if (!me) return unauth()
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  if (b.action === 'consent') {
    if (b.required !== true) return NextResponse.json({ error: '필수 항목에 동의해 주셔야 설문을 할 수 있어요.' }, { status: 400 })
    const name = String(b.signer_name ?? '').trim().slice(0, 20)
    if (!name) return NextResponse.json({ error: '동의하시는 분 이름을 적어 주세요.' }, { status: 400 })
    // 1분에 3번 넘게 누르면 막는다 (두 번 눌린 것과 장난을 가른다)
    const { count } = await supabase.from('career_consents').select('id', { count: 'exact', head: true })
      .eq('student_id', me.student.id).gte('agreed_at', new Date(Date.now() - 60_000).toISOString())
    if ((count ?? 0) >= 3) return NextResponse.json({ error: '조금 뒤에 다시 해 주세요.' }, { status: 429 })
    const { data, error } = await supabase.from('career_consents').insert({
      student_id: me.student.id, signer_role: me.role, signer_name: name,
      consent_version: CONSENT_VERSION, required_agreed: true, optional_agreed: b.optional === true,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    }).select('id, signer_name, required_agreed, optional_agreed, agreed_at, consent_version').single()
    if (error) { console.error('career consent', error); return NextResponse.json({ error: '저장하지 못했어요. 다시 해 주세요.' }, { status: 500 }) }
    return NextResponse.json({ consent: data })
  }

  if (b.action === 'revoke') {
    const { error } = await supabase.from('career_consents').update({ revoked_at: new Date().toISOString() })
      .eq('student_id', me.student.id).eq('signer_role', me.role).is('revoked_at', null)
    if (error) { console.error('career revoke', error); return NextResponse.json({ error: '처리하지 못했어요. 다시 해 주세요.' }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  }

  if (b.action === 'answer') {
    const form = formForGrade(me.student.grade)
    if (!form) return NextResponse.json({ error: '지금 학년에는 진로 설문이 없어요.' }, { status: 400 })
    const consent = await activeConsent(supabase, me.student.id, me.role)
    if (!consent) return NextResponse.json({ error: '먼저 개인정보 수집·이용에 동의해 주세요.' }, { status: 403 })
    const answers = cleanAnswers(form, b.answers)
    if (!Object.keys(answers).length) return NextResponse.json({ error: '한 문항 이상 답해 주세요.' }, { status: 400 })
    const { error } = await supabase.from('career_surveys').upsert({
      student_id: me.student.id, survey_key: surveyKeyOf(form), respondent: me.role,
      answers, consent_id: consent.id, updated_at: new Date().toISOString(),
    }, { onConflict: 'student_id,survey_key,respondent' })
    if (error) { console.error('career answer', error); return NextResponse.json({ error: '저장하지 못했어요. 다시 해 주세요.' }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
}
