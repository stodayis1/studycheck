/**
 * 진로 설문 — 학생·학부모가 앱에서 부르는 API
 *
 * 원장님 2026-11-07 「스터디체크 안에서 설문조사처럼 받아서 정보 반영」 「그전에 개인정보제공 동의 꼭」
 *
 *   GET                          내 학생 · 할 수 있는 설문 · 내 동의 · 내가 낸 답
 *   POST {action:'submit', form, consent?:{signer_name, required, optional}, answers}
 *                                동의(처음 한 번) + 설문 답을 한 번에 낸다
 *   POST {action:'revoke'}       동의 철회 (행은 남기고 revoked_at 만 채운다)
 *
 * ★ 학생·학부모용이라 denyIfNotStaff 를 못 쓴다. 토큰 주인 → students.session_uid(학생) /
 *   parent_session_uid(학부모) 로 **본인을 서버가 정한다.** body 의 학생 id 는 받지 않는다.
 * ★ 표(career_consents · career_surveys)에는 쓰기 정책이 없다 — 이 API(service_role)만 쓴다.
 * ★ 테스트 학생(윤수지·테스트)은 학년과 상관없이 두 설문을 다 해 볼 수 있다 (lib/testStudents.ts).
 */
import { NextResponse } from 'next/server'
import { serviceDb, loadState, submitSurvey, revokeConsent, type Db } from '@/lib/careerServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Me = { student: { id: string; name: string; grade: string | null }; role: 'student' | 'parent' } | null

async function whoAmI(req: Request, db: Db): Promise<Me> {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token) return null
  const { data: au } = await db.auth.getUser(token)
  const uid = au?.user?.id
  if (!uid) return null
  const { data: s } = await db.from('students').select('id, name, grade').eq('session_uid', uid).maybeSingle()
  if (s) return { student: s, role: 'student' }
  const { data: p } = await db.from('students').select('id, name, grade').eq('parent_session_uid', uid).maybeSingle()
  if (p) return { student: p, role: 'parent' }
  return null
}

const unauth = () => NextResponse.json({ error: '앱에 다시 로그인해 주세요.' }, { status: 401 })

export async function GET(req: Request) {
  const db = serviceDb()
  const me = await whoAmI(req, db)
  if (!me) return unauth()
  return NextResponse.json(await loadState(db, me.student, me.role))
}

export async function POST(req: Request) {
  const db = serviceDb()
  const me = await whoAmI(req, db)
  if (!me) return unauth()
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  if (b.action === 'submit') {
    const bad = await submitSurvey(db, me.student, me.role, b, req.headers.get('user-agent') ?? '')
    if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status })
    return NextResponse.json(await loadState(db, me.student, me.role))
  }
  if (b.action === 'revoke') {
    if (!(await revokeConsent(db, me.student.id, me.role)))
      return NextResponse.json({ error: '처리하지 못했어요. 다시 해 주세요.' }, { status: 500 })
    return NextResponse.json(await loadState(db, me.student, me.role))
  }
  return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
}
