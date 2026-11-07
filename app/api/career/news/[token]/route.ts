/**
 * 학생부 로드맵 소식 — 문자로 받은 개인 링크(/r/<token>)가 부르는 API. **로그인 없이** 연다.
 *
 * 원장님 2026-11-07 「각 계열로 도움이 될 만한 박람회, 컨퍼런스, 설명회 … 해당 학부모·학생에게 공유」
 *
 *   GET  →  { name, grade, role, fields, events[], surveyUrl }
 *
 * ★ 일부러 열어 둔 길이다 (질문지 링크 /api/career/link/<token> 과 **같은 토큰**을 쓴다).
 *   · 원장님이 **승인**했고 아직 안 끝난 행사 중, 이 학생 계열·학년에 맞는 것만 돌려준다
 *   · 검토 메모·승인자 같은 내부 칸은 내보내지 않는다 (PUBLIC_COLS)
 *   · 질문지를 아직 안 냈으면 「공통」 행사만 + 질문지 주소를 함께 준다
 */
import { NextResponse } from 'next/server'
import { serviceDb, isToken, fieldsOfStudent, linkUrl } from '@/lib/careerServer'
import { PUBLIC_COLS, COMMON, matches, isUpcoming, type CareerEvent } from '@/lib/careerEvents'
import { isTestStudentId } from '@/lib/testStudents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const gone = NextResponse.json({ error: '없는 주소예요. 받으신 문자의 주소를 다시 눌러 주세요.' }, { status: 404 })
  if (!isToken(token)) return gone
  const db = serviceDb()
  const { data: link } = await db.from('career_links').select('student_id, respondent').eq('token', token).maybeSingle()
  if (!link) return gone
  const { data: s } = await db.from('students').select('id, name, grade').eq('id', link.student_id).maybeSingle()
  if (!s) return gone

  const fields = await fieldsOfStudent(db, s.id)
  const { data: rows } = await db.from('career_events').select(PUBLIC_COLS)
    .eq('status', '승인').order('starts_on', { ascending: true, nullsFirst: false }).limit(300)
  const events = ((rows ?? []) as unknown as CareerEvent[])
    .filter((e) => isUpcoming(e))
    .filter((e) => (fields ? matches(e, fields, isTestStudentId(s.id) ? null : s.grade) : e.fields.includes(COMMON)))   // 테스트 학생은 학년 무관 — 다 보여야 시험이 된다

  return NextResponse.json({
    name: s.name, grade: s.grade, role: link.respondent,
    fields: fields ?? [], answered: !!fields,
    events,
    surveyUrl: fields ? null : linkUrl(token),
  })
}
