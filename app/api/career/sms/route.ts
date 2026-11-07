/**
 * 진로 설문 문자 — 학생·학부모마다 **자기 링크**를 넣어 보낸다. 원장 전용.
 *
 * 원장님 2026-11-07 「그냥 문자로 설문을 보내는 게 좋을 거 같아. 설명회 설문조사처럼. 학생도 마찬가지로 문자로」
 *
 *   POST { studentIds, toParent, toStudent, parentText, studentText, testForm?, send }
 *     · 글 속 {이름} → 학생 이름, {링크} → 그 사람 링크(/c/<token>)
 *     · 학부모 = students.parent_phone, 학생 = students.student_phone (없으면 「번호 없음」으로 알려 준다)
 *     · send 가 true 가 아니면 미리보기 — 받는 분 목록만 돌려준다 (링크는 이때 미리 만든다)
 * ★ 한 번 나가면 못 되돌린다. 기본은 미리보기. 형제는 같은 번호라도 링크가 달라 각각 한 통씩 간다.
 * ★ 문자는 수학OPS 를 거친다(lib/opsSms.ts). OPS 가 테스트 모드면 실제로는 안 나가고 그렇다고 알려 준다.
 */
import { NextResponse } from 'next/server'
import { staffOrDeny } from '@/lib/apiAuth'
import { sendSmsViaOps } from '@/lib/opsSms'
import { serviceDb, ensureLink, linkUrl, formForSend } from '@/lib/careerServer'
import { FORMS } from '@/lib/careerSurvey'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const pretty = (d: string) =>
  d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d
const okPhone = (d: string) => /^01\d{8,9}$/.test(d)

export async function POST(req: Request) {
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const ids: string[] = Array.isArray(b.studentIds) ? b.studentIds.map(String).slice(0, 300) : []
  if (!ids.length) return NextResponse.json({ error: '보낼 학생을 골라 주세요.' }, { status: 400 })
  const toParent = b.toParent === true, toStudent = b.toStudent === true
  if (!toParent && !toStudent) return NextResponse.json({ error: '학부모·학생 중 받을 사람을 골라 주세요.' }, { status: 400 })
  const pText = String(b.parentText ?? '').trim(), sText = String(b.studentText ?? '').trim()
  for (const [on, t, who2] of [[toParent, pText, '학부모'], [toStudent, sText, '학생']] as const) {
    if (!on) continue
    if (!t.includes('{링크}')) return NextResponse.json({ error: `${who2} 문자에 {링크} 자리가 없어요.` }, { status: 400 })
    if (t.length > 800) return NextResponse.json({ error: `${who2} 문자가 너무 길어요 (800자 넘음).` }, { status: 400 })
  }

  const db = serviceDb()
  const { data: students, error } = await db.from('students')
    .select('id, name, grade, parent_phone, student_phone').in('id', ids)
  if (error) return NextResponse.json({ error: '학생을 읽지 못했어요.' }, { status: 500 })

  type T = { phone: string; label: string; text: string; studentId: string; respondent: 'student' | 'parent' }
  const targets: T[] = []
  const missing: string[] = []
  const skipped: string[] = []
  for (const s of students ?? []) {
    const form = formForSend(s, b.testForm)
    if (!form) { skipped.push(`${s.name}(${s.grade ?? '-'}) — 설문 대상 학년이 아님`); continue }
    for (const [on, role, phone, text] of [
      [toParent, 'parent', digits(s.parent_phone), pText],
      [toStudent, 'student', digits(s.student_phone), sText],
    ] as const) {
      if (!on) continue
      if (!okPhone(phone)) { missing.push(`${s.name} ${role === 'parent' ? '학부모' : '학생'}`); continue }
      const token = await ensureLink(db, s.id, role, form)
      targets.push({
        phone, studentId: s.id, respondent: role,
        label: `${s.name} ${role === 'parent' ? '학부모' : '학생'} (${FORMS[form].label})`,
        text: text.replaceAll('{이름}', s.name).replaceAll('{링크}', linkUrl(token)),
      })
    }
  }

  const summary = {
    보낼문자: targets.length,
    받는분: targets.map((t) => `${pretty(t.phone)} — ${t.label}`),
    번호없음: missing,
    대상아님: skipped,
    예시: targets[0]?.text ?? null,
  }
  if (b.send !== true) return NextResponse.json({ dryRun: true, ...summary })
  if (!targets.length) return NextResponse.json({ error: '보낼 번호가 없어요.' }, { status: 400 })

  let sent = 0, opsDryRun = false
  const failed: { label: string; error: string }[] = []
  for (const t of targets) {
    const r = await sendSmsViaOps({ to: t.phone, text: t.text, refType: 'career_survey', refId: t.studentId })
    if (r.ok) {
      sent++; opsDryRun = opsDryRun || !!r.dryRun
      await db.from('career_links').update({ sent_at: new Date().toISOString() })
        .eq('student_id', t.studentId).eq('respondent', t.respondent)
    } else failed.push({ label: t.label, error: r.error ?? '알 수 없는 까닭' })
  }
  return NextResponse.json({ ...summary, 보냄: sent, 실패: failed.length ? failed : undefined, 테스트모드: opsDryRun || undefined, 보낸사람: who.name })
}
