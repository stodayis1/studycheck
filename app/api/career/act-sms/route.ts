/**
 * 「활동 적어 줘」 문자 — 학생 한 명에게 **자기 링크**(/a/<token>)를 보낸다. 원장 전용.
 *
 * 원장님 2026-11-10 「학생이 적었어. 그다음에 뭐가 필요한지 여기서 또 물어야겠지?
 *   학생에게 바로 보낼 수 있는 버튼도 만들어줘. 학생들은 스터디체크에 보통 로그인 잘 안 하거든」
 *
 *   POST { studentId, ask?: string[], send?: boolean }
 *     · ask = 더 물어볼 것 (「○○ — 무엇을 알게 됐나」). 선생님 화면이 로드맵 읽기에서 뽑아 보낸다
 *     · send 가 true 가 아니면 **미리보기**. 보낼 글과 받는 번호만 돌려준다
 *
 * ★ 한 번 나가면 못 되돌린다. 기본은 미리보기다.
 * ★ 링크는 설문과 **같은 토큰**을 쓴다(학생 한 명에 하나). 주소만 /c/ 대신 /a/ 다.
 * ★ 문자는 수학OPS 를 거친다. OPS 가 테스트 모드면 실제로는 안 나가고 그렇다고 알려 준다.
 */
import { NextResponse } from 'next/server'
import { staffOrDeny } from '@/lib/apiAuth'
import { sendSmsViaOps } from '@/lib/opsSms'
import { serviceDb, ensureLink, formForSend, SITE } from '@/lib/careerServer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const okPhone = (d: string) => /^01\d{8,9}$/.test(d)
const pretty = (d: string) =>
  d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d

/** 기본 문자 — 까닭을 먼저 적는다(까닭 없이 「적어 주세요」면 안 읽힌다) */
export function actSmsText(name: string, url: string, ask: string[]): string {
  const head = `[수학의지혜]\n${name} 학생, 학교에서 한 탐구·수행평가·동아리를 적어 두는 칸이에요.`
  const why = '적어 두면 선생님이 보고 다음에 무엇을 하면 좋을지 같이 찾아 줘요. 로그인 없이 바로 열려요.'
  const asks = ask.length
    ? '\n\n이번에 채워 줄 것\n' + ask.slice(0, 5).map((a) => `· ${a}`).join('\n')
    : ''
  return `${head}\n${why}${asks}\n\n${url}`
}

export async function POST(req: Request) {
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny
  const b = await req.json().catch((): any => null)
  if (!b?.studentId) return NextResponse.json({ error: '보낼 학생을 골라 주세요.' }, { status: 400 })
  const ask: string[] = Array.isArray(b.ask) ? b.ask.map((x: unknown) => String(x).slice(0, 80)).slice(0, 5) : []

  const db = serviceDb()
  const { data: s } = await db.from('students')
    .select('id, name, grade, student_phone').eq('id', String(b.studentId)).maybeSingle()
  if (!s) return NextResponse.json({ error: '그 학생을 찾지 못했어요.' }, { status: 404 })

  const phone = digits(s.student_phone)
  if (!okPhone(phone)) {
    return NextResponse.json({ error: `${s.name} 학생 연락처가 없어요. 학생관리 › 학생 수정의 「학생 연락처」를 채워 주세요.` }, { status: 400 })
  }
  const form = formForSend(s)
  if (!form) return NextResponse.json({ error: `${s.name} 학생은 질문지 대상 학년이 아니에요.` }, { status: 400 })

  const token = await ensureLink(db, s.id, 'student', form)
  const url = `${SITE}/a/${token}`
  const text = actSmsText(s.name, url, ask)
  const summary = { 받는분: `${s.name} (${pretty(phone)})`, 주소: url, 글: text }

  if (b.send !== true) return NextResponse.json({ dryRun: true, ...summary })

  const r = await sendSmsViaOps({ to: phone, text, refType: 'career_activity', refId: s.id })
  if (!r.ok) return NextResponse.json({ error: r.error ?? '문자를 보내지 못했어요.' }, { status: 500 })
  await db.from('career_links').update({ sent_at: new Date().toISOString() })
    .eq('student_id', s.id).eq('respondent', 'student')
  return NextResponse.json({ ...summary, 보냄: 1, 테스트모드: r.dryRun || undefined, 보낸사람: who.name })
}
