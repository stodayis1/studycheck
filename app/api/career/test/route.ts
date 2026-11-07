/**
 * 진로 설문 — 선생님이 **테스트 학생으로** 직접 해 보는 API
 *
 * 원장님 2026-11-07 「앞으로 모든 새로운 메뉴는 … 테스트 학생에게 테스트할 수 있는 메뉴도 추가해놔.
 *   내 테스트 학생은 윤수지 학생이야. 강사들의 테스트 학생은 「테스트」 학생이고」
 *
 *   GET  ?—                      내 테스트 학생의 학생 쪽·학부모 쪽 상태
 *   POST {respondent, action:'submit'|'revoke', form, consent, answers}
 *
 * ★ 직원만(staffOrDeny). 대상은 **본인 테스트 학생으로 고정**한다 — 원장님은 윤수지, 강사는 테스트.
 *   body 로 학생 id 를 받지 않는다. 실제 학생의 동의·답을 직원이 대신 쓰는 길은 없다.
 */
import { NextResponse } from 'next/server'
import { staffOrDeny } from '@/lib/apiAuth'
import { serviceDb, loadState, submitSurvey, revokeConsent } from '@/lib/careerServer'
import { myTestStudentId } from '@/lib/testStudents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function target(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return { deny: who.deny, student: null as any }
  const db = serviceDb()
  const { data: student } = await db.from('students').select('id, name, grade').eq('id', myTestStudentId(who.role)).maybeSingle()
  if (!student) return { deny: NextResponse.json({ error: '테스트 학생을 찾지 못했어요.' }, { status: 404 }), student: null as any }
  return { deny: null as NextResponse | null, student, db }
}

const roleOf = (v: unknown): 'student' | 'parent' => (v === 'parent' ? 'parent' : 'student')

export async function GET(req: Request) {
  const t = await target(req)
  if (t.deny) return t.deny
  const role = roleOf(new URL(req.url).searchParams.get('respondent'))
  return NextResponse.json(await loadState(t.db!, t.student, role))
}

export async function POST(req: Request) {
  const t = await target(req)
  if (t.deny) return t.deny
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  const role = roleOf(b.respondent)
  if (b.action === 'submit') {
    const bad = await submitSurvey(t.db!, t.student, role, b, '선생님 화면 · 테스트 학생으로 해 보기')
    if (bad) return NextResponse.json({ error: bad.error }, { status: bad.status })
  } else if (b.action === 'revoke') {
    await revokeConsent(t.db!, t.student.id, role)
  } else {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }
  return NextResponse.json(await loadState(t.db!, t.student, role))
}
