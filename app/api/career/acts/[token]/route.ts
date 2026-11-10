/**
 * 학생이 **자기 활동을 직접 적는** 길 — 문자로 받은 개인 링크(/a/<token>)가 부르는 API.
 * **로그인 없이** 연다.
 *
 * 원장님 2026-11-10 「학생이 직접 적는 것 만들어줘 … 학생들은 스터디체크에 보통 로그인 잘 안 하거든.
 *   링크를 만들어 보내 주든가 해야 돼」
 *
 *   GET                                   내 활동 목록 (제목·종류·적어 둔 다섯 칸)
 *   POST {action:'save', id?, kind, title, detail}   새로 적거나, 이미 있는 기록의 칸을 채운다
 *
 * ★ 일부러 열어 둔 길이다(/c/<token> 설문과 같은 자리). 대신
 *   · 토큰은 12자 무작위이고 **학생 한 명**에만 매여 있다. 학생 id 는 토큰에서만 꺼낸다
 *   · **학생 링크만** 열린다 — 학부모 토큰으로는 못 연다(학생부 활동은 학생 본인이 적는다)
 *   · 돌려주는 것은 그 학생 이름·학년과 그 학생 활동뿐이다 (연락처·다른 학생 정보 없음)
 *   · **지우지 못한다.** 고치는 것은 그 학생 기록만, 그것도 종류·제목·내용 세 칸뿐
 *   · 세특은 학생이 못 만든다 — 학생부 문구는 선생님이 옮겨 적는 칸이다
 */
import { NextResponse } from 'next/server'
import { serviceDb, isToken } from '@/lib/careerServer'
import { ACTIVITY_KINDS } from '@/lib/careerSurvey'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const gone = () => NextResponse.json({ error: '없는 주소예요. 받으신 문자의 주소를 다시 눌러 주세요.' }, { status: 404 })

/** 학생이 고를 수 있는 종류 — 세특만 뺀다 */
const STUDENT_KINDS = ACTIVITY_KINDS.filter((k) => k !== '세특')

const SELECT = 'id, kind, title, detail, subject, grade_at, school_year, semester, status, activity_date, source, updated_at'

async function open(token: string) {
  if (!isToken(token)) return null
  const db = serviceDb()
  const { data: link } = await db.from('career_links')
    .select('id, student_id, respondent, opened_at').eq('token', token).maybeSingle()
  if (!link || link.respondent !== 'student') return null
  const { data: student } = await db.from('students').select('id, name, grade').eq('id', link.student_id).maybeSingle()
  if (!student) return null
  return { db, link, student }
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await open(token)
  if (!o) return gone()
  if (!o.link.opened_at) await o.db.from('career_links').update({ opened_at: new Date().toISOString() }).eq('id', o.link.id)
  const { data: acts } = await o.db.from('student_activities').select(SELECT)
    .eq('student_id', o.student.id).is('deleted_at', null).order('created_at', { ascending: false })
  return NextResponse.json({
    student: { name: o.student.name, grade: o.student.grade },
    kinds: STUDENT_KINDS,
    acts: acts ?? [],
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const o = await open(token)
  if (!o) return gone()
  const b = await req.json().catch((): any => null)
  if (!b || b.action !== 'save') return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const title = String(b.title ?? '').trim().slice(0, 200)
  const detail = String(b.detail ?? '').trim().slice(0, 4000)
  if (!title) return NextResponse.json({ error: '무엇을 한 것인지 제목을 적어 주세요.' }, { status: 400 })
  const kind = STUDENT_KINDS.includes(String(b.kind)) ? String(b.kind) : '탐구보고서'
  const now = new Date().toISOString()

  if (b.id) {
    // ★ 그 학생 기록인지 **서버에서** 확인한다. 남의 id 를 보내도 안 걸리게.
    const { data: mine } = await o.db.from('student_activities').select('id, kind')
      .eq('id', String(b.id)).eq('student_id', o.student.id).is('deleted_at', null).maybeSingle()
    if (!mine) return NextResponse.json({ error: '그 기록을 찾지 못했어요.' }, { status: 404 })
    // 선생님이 만든 세특은 학생이 못 고친다 (학생부 문구 그대로여야 한다)
    if (mine.kind === '세특') return NextResponse.json({ error: '이 기록은 선생님이 적는 칸이에요.' }, { status: 403 })
    const { data, error } = await o.db.from('student_activities')
      .update({ title, detail: detail || null, updated_at: now }).eq('id', mine.id).select(SELECT).single()
    if (error) return NextResponse.json({ error: '저장하지 못했어요.' }, { status: 500 })
    return NextResponse.json({ ok: true, act: data })
  }

  const { data, error } = await o.db.from('student_activities').insert({
    student_id: o.student.id, kind, title, detail: detail || null,
    grade_at: o.student.grade ?? null, source: 'student', created_by_name: o.student.name,
  }).select(SELECT).single()
  if (error) return NextResponse.json({ error: '저장하지 못했어요.' }, { status: 500 })
  return NextResponse.json({ ok: true, act: data })
}
