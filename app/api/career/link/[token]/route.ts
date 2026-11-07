/**
 * 진로 설문 — 문자로 받은 개인 링크(/c/<token>)가 부르는 API. **로그인 없이** 연다.
 *
 * 원장님 2026-11-07 「스터디체크 로그인을 하려고 하질 않으시거든 … 그냥 문자로 설문을 보내는 게 좋을 거 같아.
 *   설명회 설문조사처럼. 학생도 마찬가지로 문자로. 기록된 내용은 스터디체크에 반영되게」
 *
 *   GET                 이 링크의 학생 이름 · 설문 종류 · 동의 · 낸 답 (처음 열면 opened_at 기록)
 *   POST {action:'submit', form, consent?, answers}   동의(처음 한 번) + 답
 *   POST {action:'revoke'}                             동의 철회
 *
 * ★ 일부러 열어 둔 길이다 (QR 채점 /api/grade/<code> 와 같은 자리). 대신
 *   · 토큰이 12자 무작위(추측 불가)이고, 한 토큰은 **학생 한 명·응답자 하나·설문 하나**에만 쓴다
 *   · 학생 id·응답자·설문 종류는 **토큰에서만** 정한다. body 로 받지 않는다
 *   · 돌려주는 것은 그 학생 이름·학년과 이 링크로 낸 동의·답뿐이다 (연락처·다른 학생 정보 없음)
 *   · 동의는 1분에 3번까지 (lib/careerServer.ts submitSurvey)
 */
import { NextResponse } from 'next/server'
import { serviceDb, isToken, loadState, submitSurvey, revokeConsent } from '@/lib/careerServer'
import type { FormId } from '@/lib/careerSurvey'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gone = () => NextResponse.json({ error: '없는 설문 주소예요. 받으신 문자의 주소를 다시 눌러 주세요.' }, { status: 404 })

async function open(token: string) {
  if (!isToken(token)) return null
  const db = serviceDb()
  const { data: link } = await db.from('career_links').select('id, student_id, respondent, form, opened_at').eq('token', token).maybeSingle()
  if (!link) return null
  const { data: student } = await db.from('students').select('id, name, grade').eq('id', link.student_id).maybeSingle()
  if (!student) return null
  return { db, link, student, role: link.respondent as 'student' | 'parent', forms: [link.form as FormId] }
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await open(token)
  if (!o) return gone()
  if (!o.link.opened_at) await o.db.from('career_links').update({ opened_at: new Date().toISOString() }).eq('id', o.link.id)
  return NextResponse.json(await loadState(o.db, o.student, o.role, o.forms))
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await open(token)
  if (!o) return gone()
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  if (b.action === 'submit') {
    const bad = await submitSurvey(o.db, o.student, o.role, { ...b, form: o.forms[0] }, req.headers.get('user-agent') ?? '', o.forms)
    if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status })
  } else if (b.action === 'revoke') {
    await revokeConsent(o.db, o.student.id, o.role)
  } else {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  return NextResponse.json(await loadState(o.db, o.student, o.role, o.forms))
}
