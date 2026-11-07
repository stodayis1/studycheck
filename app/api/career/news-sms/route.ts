/**
 * 학생부 로드맵 소식 문자 — 원장 전용. 2주에 한 번, 원장님이 행사를 승인한 뒤 누른다.
 *
 * 원장님 2026-11-07 「해당 학부모·학생에게 정보를 공유할 수 있도록」
 *   정한 것: 확인 후 발송 · 2주에 한 번 · 문자 + 개인 페이지 링크 · 질문지 낸 학생·학부모
 *
 *   POST { toParent, toStudent, parentText, studentText, testOnly?, send }
 *     · 받는 사람 = 질문지(학생 답 또는 학부모 답)를 낸 학생의 집. 승인·진행 예정 행사 중 그 학생 계열에
 *       맞는 것이 **하나 이상** 있을 때만 보낸다 (0건이면 「맞는 행사 없음」으로 빠진다)
 *     · 글 속 {이름} → 학생 이름, {건수} → 맞는 행사 수, {링크} → 그 사람의 /r/<token>
 *     · testOnly 면 테스트 학생(윤수지·테스트)에게만 — 먼저 원장님 휴대폰으로 받아 보는 용도.
 *       아니면 테스트 학생은 뺀다
 *     · send 가 true 가 아니면 미리보기
 * ★ 한 번 나가면 못 되돌린다. 문자는 수학OPS 를 거친다(lib/opsSms.ts).
 */
import { NextResponse } from 'next/server'
import { staffOrDeny } from '@/lib/apiAuth'
import { sendSmsViaOps } from '@/lib/opsSms'
import { serviceDb, ensureLink, formForSend, SITE } from '@/lib/careerServer'
import { matches, isUpcoming, type CareerEvent } from '@/lib/careerEvents'
import { isTestStudentId } from '@/lib/testStudents'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const okPhone = (d: string) => /^01\d{8,9}$/.test(d)
const pretty = (d: string) => (d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d)

export async function POST(req: Request) {
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  const toParent = b.toParent === true, toStudent = b.toStudent === true
  if (!toParent && !toStudent) return NextResponse.json({ error: '학부모·학생 중 받을 사람을 골라 주세요.' }, { status: 400 })
  const pText = String(b.parentText ?? '').trim(), sText = String(b.studentText ?? '').trim()
  for (const [on, t, w] of [[toParent, pText, '학부모'], [toStudent, sText, '학생']] as const) {
    if (on && !t.includes('{링크}')) return NextResponse.json({ error: `${w} 문자에 {링크} 자리가 없어요.` }, { status: 400 })
    if (on && t.length > 800) return NextResponse.json({ error: `${w} 문자가 너무 길어요.` }, { status: 400 })
  }

  const db = serviceDb()
  const { data: evRows } = await db.from('career_events').select('id, fields, grades, starts_on, ends_on').eq('status', '승인')
  const events = ((evRows ?? []) as Pick<CareerEvent, 'id' | 'fields' | 'grades' | 'starts_on' | 'ends_on'>[]).filter((e) => isUpcoming(e))
  if (!events.length) return NextResponse.json({ error: '승인된 진행 예정 행사가 없어요. 먼저 행사를 승인해 주세요.' }, { status: 400 })

  // 질문지를 낸 학생과 그 계열
  const { data: sv } = await db.from('career_surveys').select('student_id, answers')
  const fieldsBy = new Map<string, Set<string>>()
  for (const r of sv ?? []) {
    if (!fieldsBy.has(r.student_id)) fieldsBy.set(r.student_id, new Set())
    for (const f of (r.answers?.field ?? []) as string[]) fieldsBy.get(r.student_id)!.add(f)
  }
  const ids = [...fieldsBy.keys()].filter((id) => (b.testOnly === true ? isTestStudentId(id) : !isTestStudentId(id)))
  if (!ids.length) return NextResponse.json({ error: '질문지를 낸 학생이 없어요.' }, { status: 400 })
  const { data: students } = await db.from('students').select('id, name, grade, parent_phone, student_phone, is_active').in('id', ids)

  type T = { phone: string; label: string; text: string; studentId: string }
  const targets: T[] = [], noMatch: string[] = [], missing: string[] = []
  const used = new Set<string>()
  for (const s of students ?? []) {
    if (s.is_active === false && !isTestStudentId(s.id)) continue
    const fields = [...(fieldsBy.get(s.id) ?? [])]
    const mine = events.filter((e) => matches(e, fields, isTestStudentId(s.id) ? null : s.grade))   // 테스트 학생은 학년 무관
    if (!mine.length) { noMatch.push(s.name); continue }
    mine.forEach((e) => used.add(e.id))
    const form = formForSend(s, 'pre2')
    if (!form) { noMatch.push(`${s.name}(대상 학년 아님)`); continue }
    for (const [on, role, phone, text] of [
      [toParent, 'parent', digits(s.parent_phone), pText],
      [toStudent, 'student', digits(s.student_phone), sText],
    ] as const) {
      if (!on) continue
      if (!okPhone(phone)) { missing.push(`${s.name} ${role === 'parent' ? '학부모' : '학생'}`); continue }
      const token = await ensureLink(db, s.id, role, form)
      targets.push({
        phone, studentId: s.id, label: `${s.name} ${role === 'parent' ? '학부모' : '학생'} · ${mine.length}건`,
        text: text.replaceAll('{이름}', s.name).replaceAll('{건수}', String(mine.length)).replaceAll('{링크}', `${SITE}/r/${token}`),
      })
    }
  }

  const summary = {
    행사: events.length, 보낼문자: targets.length,
    받는분: targets.map((t) => `${pretty(t.phone)} — ${t.label}`),
    맞는행사없음: noMatch, 번호없음: missing, 예시: targets[0]?.text ?? null,
  }
  if (b.send !== true) return NextResponse.json({ dryRun: true, ...summary })
  if (!targets.length) return NextResponse.json({ error: '보낼 사람이 없어요.' }, { status: 400 })

  let sent = 0, opsDryRun = false
  const failed: string[] = []
  for (const t of targets) {
    const r = await sendSmsViaOps({ to: t.phone, text: t.text, refType: 'roadmap_news', refId: t.studentId })
    if (r.ok) { sent++; opsDryRun = opsDryRun || !!r.dryRun } else failed.push(t.label)
  }
  await db.from('career_news_sends').insert({
    event_ids: [...used], recipients: targets.length, sent, failed: failed.length, ops_test: opsDryRun, sent_by: who.name,
  })
  return NextResponse.json({ ...summary, 보냄: sent, 실패: failed.length ? failed : undefined, 테스트모드: opsDryRun || undefined })
}
