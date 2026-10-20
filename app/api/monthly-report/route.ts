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
 * body: { studentIds: string[], year, month, talk?: Record<studentId, string> }
 * ★ 보내지는 않는다. 주소만 돌려준다 — 보내는 것은 원장님이 보고 결정하신다.
 */
export async function POST(req: NextRequest) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const b = await req.json().catch((): any => null)
  const ids: string[] = b?.studentIds ?? []
  const year = Number(b?.year), month = Number(b?.month)
  if (!ids.length || !year || !month) {
    return NextResponse.json({ error: '학생과 달을 골라 주세요.' }, { status: 400 })
  }
  const supabase = db()
  const out: { studentId: string; name: string; url: string | null; error?: string }[] = []
  const APP = 'https://studycheck-five.vercel.app'

  for (const id of ids) {
    const data = await buildMonthlyReport(supabase, id, year, month)
    if (!data) { out.push({ studentId: id, name: '?', url: null, error: '학생을 찾지 못했어요.' }); continue }
    // 원장님이 적어 둔 「원장 Talk」 가 있으면 같이 박는다.
    const talk = (b?.talk ?? {})[id]
    if (talk) data.principalTalk = String(talk)

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
    out.push(error
      ? { studentId: id, name: data.student.name, url: null, error: error.message }
      : { studentId: id, name: data.student.name, url: `${APP}/report/${token}` })
  }
  return NextResponse.json({ links: out })
}
