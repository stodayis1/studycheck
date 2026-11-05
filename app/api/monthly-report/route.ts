/**
 * 월간 학습 리포트 — 만들어 보기(GET) · 링크 찍기(POST)
 *
 * 원장님 2026-10-20 「이런식으로 나도 학생들 한달에 한번 리포트를 만들건데」
 *
 * ★ 링크를 찍을 때 그 달의 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
 *   나중에 교재가 바뀌거나 학습지가 지워져도 보내 드린 리포트는 그대로 남아야 한다.
 *   매일 브리핑의 버튼 뒤 화면도 같은 방식이다.
 *
 * ★ 이 라우트는 서비스롤로 RLS 를 지나간다 — **반드시** 직원 확인을 먼저 한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildMonthlyReport } from '@/lib/monthlyReport'
import { buildMonthlyMessage, resolveMonthlyTemplate } from '@/lib/monthlyReportTemplate'
import { aligoConfig, sendAlimtalk, AligoError } from '@/lib/aligo'

export const runtime = 'nodejs'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/** 미리보기 — 아직 아무것도 남기지 않는다. */
export async function GET(req: NextRequest) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const q = new URL(req.url).searchParams
  const studentId = q.get('studentId')
  const year = Number(q.get('year')), month = Number(q.get('month'))
  if (!studentId || !year || !month) {
    return NextResponse.json({ error: '학생과 달을 골라 주세요.' }, { status: 400 })
  }
  const data = await buildMonthlyReport(db(), studentId, year, month)
  if (!data) return NextResponse.json({ error: '학생을 찾지 못했어요.' }, { status: 404 })
  return NextResponse.json({ data })
}

/**
 * 링크 찍기 — 학생 여럿을 한 번에.
 * body: { studentIds: string[], year, month, comment?: Record<studentId, string>, send?: boolean, resend?: boolean }
 *
 * ★ send 가 없으면 **주소만** 돌려준다 (지금까지와 같다).
 * ★ send 가 참이면 그 자리에서 **학부모님께 알림톡까지** 보낸다 (원장님 2026-11-05
 *   「한명한명 링크를 만들어서 일일이 보낼수가 없거든… 학년별로 일괄 월말보고서 생성하여
 *    카톡으로 전송하는 기능까지」).
 *
 *   보내는 규칙
 *   · **이미 보낸 학생은 건너뛴다** — 같은 달에 두 번 가면 학부모님이 혼란스럽다.
 *     다시 보내려면 resend 를 켠다.
 *   · 보호자 번호가 없거나 **퇴원·연습용** 학생은 보내지 않는다.
 *   · 한 명이 실패해도 **나머지는 계속 간다.** 실패한 사람은 까닭과 함께 돌려준다.
 *   · 템플릿이 아직 승인 전이면 **한 건도 보내지 않고** 무엇을 해야 하는지 알려 준다
 *     (알리고는 템플릿이 안 맞으면 에러도 없이 그냥 안 보낸다).
 */
export async function POST(req: NextRequest) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const b = await req.json().catch((): any => null)
  const ids: string[] = b?.studentIds ?? []
  const year = Number(b?.year), month = Number(b?.month)
  const send = !!b?.send
  const resend = !!b?.resend
  if (!ids.length || !year || !month) {
    return NextResponse.json({ error: '학생과 달을 골라 주세요.' }, { status: 400 })
  }
  const supabase = db()

  // ★ 보낼 거면 **먼저** 템플릿부터 본다. 한 건이라도 보내 놓고 막히면 수습이 어렵다.
  let tpl: { code: string | null; buttonName: string; note: string } | null = null
  if (send) {
    // ★ 발송 기록 칸이 없으면 **아예 보내지 않는다.** 기록을 못 남기면 다음에 또 보내게 되고,
    //   학부모님께 같은 리포트가 두 번 간다. 막는 쪽이 맞다.
    const { error: 칸없음 } = await supabase.from('report_links').select('kakao_sent_at').limit(1)
    if (칸없음) {
      return NextResponse.json({
        error: '보낸 기록을 남길 칸이 아직 없어요 — docs/sql/월간보고서_발송기록.sql 을 먼저 실행해 주세요. '
             + '(기록을 못 남기면 다음 번에 같은 분께 또 갑니다.)',
      }, { status: 400 })
    }
    tpl = await resolveMonthlyTemplate()
    if (!tpl.code) {
      return NextResponse.json({ error: `카톡을 보낼 수 없어요 — ${tpl.note}` }, { status: 400 })
    }
  }

  // 이미 보낸 사람 — 같은 달에 두 번 보내지 않는다.
  const 이미보냄 = new Set<string>()
  if (send && !resend) {
    const { data: prev } = await supabase.from('report_links')
      .select('student_id, kakao_sent_at')
      .eq('report_type', 'monthly_report')
      .eq('period_start', `${year}-${String(month).padStart(2, '0')}-01`)
      .not('kakao_sent_at', 'is', null)
    for (const r of (prev ?? []) as any[]) 이미보냄.add(String(r.student_id))
  }
  const out: { studentId: string; name: string; url: string | null
               error?: string; skipped?: string; sent?: boolean }[] = []
  const APP = 'https://studycheck-five.vercel.app'

  for (const id of ids) {
    if (이미보냄.has(id)) {
      out.push({ studentId: id, name: '?', url: null, skipped: '이번 달에 이미 보냈어요.' })
      continue
    }
    const data = await buildMonthlyReport(supabase, id, year, month)
    if (!data) { out.push({ studentId: id, name: '?', url: null, error: '학생을 찾지 못했어요.' }); continue }
    // 선생님이 적어 둔 한 줄 평이 있으면 같이 박는다.
    const c = (b?.comment ?? {})[id]
    if (c) data.comment = String(c)

    const token = randomBytes(16).toString('hex')
    const { error } = await supabase.from('report_links').insert({
      student_id: id,
      report_type: 'monthly_report',
      period_label: data.period.label,
      period_start: `${year}-${String(month).padStart(2, '0')}-01`,
      period_end: `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
      data,
      token,
      sent_at: new Date().toISOString(),
    })
    if (error) {
      out.push({ studentId: id, name: data.student.name, url: null, error: error.message })
      continue
    }
    const url = `${APP}/report/${token}`
    if (!send) { out.push({ studentId: id, name: data.student.name, url }); continue }

    // ── 카톡으로 보내기 ────────────────────────────────────────────────
    // ★ 한 명이 실패해도 **나머지는 계속 간다.** 링크는 이미 만들어졌으니 손으로도 보낼 수 있다.
    const { data: st } = await supabase.from('students')
      .select('name, parent_phone, is_active, skip_lesson_note').eq('id', id).maybeSingle()
    const phone = String((st as any)?.parent_phone ?? '').trim()
    if ((st as any)?.skip_lesson_note) {
      out.push({ studentId: id, name: data.student.name, url, skipped: '연습용 학생이라 안 보냈어요.' }); continue
    }
    if ((st as any)?.is_active === false) {
      out.push({ studentId: id, name: data.student.name, url, skipped: '퇴원 학생이라 안 보냈어요.' }); continue
    }
    if (!phone) {
      out.push({ studentId: id, name: data.student.name, url, skipped: '보호자 번호가 없어요.' }); continue
    }
    const msg = buildMonthlyMessage(data, url)
    if (msg.overLimit) {
      out.push({ studentId: id, name: data.student.name, url, error: `본문이 ${msg.bodyLen}자라 한도를 넘어요.` }); continue
    }
    try {
      const r = await sendAlimtalk(aligoConfig(), {
        to: phone, name: (st as any)?.name ?? null,
        subject: msg.subject, message: msg.body,
        // ★ 버튼 이름은 **알리고에 등록된 그대로** 쓴다 — 한 글자만 달라도 안 나간다.
        buttons: [{ name: tpl!.buttonName, linkType: 'WL', linkMo: url, linkPc: url }],
      }, tpl!.code!)
      await supabase.from('report_links')
        .update({ kakao_sent_at: new Date().toISOString(), kakao_mid: r?.mid ? String(r.mid) : null })
        .eq('token', token)
      out.push({ studentId: id, name: data.student.name, url, sent: true })
    } catch (e: any) {
      const 까닭 = e instanceof AligoError ? e.message : (e?.message ?? '보내지 못했어요.')
      out.push({ studentId: id, name: data.student.name, url, error: 까닭 })
    }
  }
  return NextResponse.json({ links: out })
}
