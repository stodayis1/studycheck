/**
 * S코어반 학습 기록 보고서 — 링크 만들기 (원장님 2026-11-19).
 *
 *   GET  /api/score-class-report?from=&to=   → 고를 수 있는 학생 + 이미 만든 링크
 *   POST /api/score-class-report             → { studentIds, from, to } 로 링크를 만든다
 *
 * ★ 링크를 찍을 때 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
 *   나중에 학습지가 지워지거나 교재가 바뀌어도 보내 드린 보고서는 그대로여야 한다.
 * ★ 이 라우트는 서비스롤로 RLS 를 지나간다 — **반드시** 직원 확인을 먼저 한다.
 *   보고서를 만드는 것은 **원장님만**이다(adminOnly).
 * ★ **보내지 않는다.** 링크만 만들고 문자는 원장님이 직접 보내신다
 *   (원장님 2026-11-19 「보내는건 내가 보낼거야」).
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildScoreClassReport } from '@/lib/scoreClassReport'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TYPE = 'score_class'
const APP = process.env.NEXT_PUBLIC_APP_URL || 'https://studycheck-five.vercel.app'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

/** 기본 구간 — 올해 들어 지금까지. 보고서는 「그동안」을 보여 주는 것이라 길게 잡는다. */
function 기본구간() {
  const 오늘 = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  return { from: 오늘.slice(0, 4) + '-01-01', to: 오늘 }
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny
  const db = admin()
  const url = new URL(req.url)
  const { from, to } = { ...기본구간(), ...Object.fromEntries(url.searchParams) } as any

  // 고를 수 있는 학생 — 재원·휴원 (가상 학생은 뺀다)
  const { data: students, error } = await db.from('students')
    .select('id, name, grade, teacher_name, parent_phone, is_test')
    .or('is_active.eq.true,on_leave.eq.true').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: links } = await db.from('report_links')
    .select('student_id, token, period_label, created_at')
    .eq('report_type', TYPE).order('created_at', { ascending: false }).limit(200)

  return NextResponse.json({
    from, to,
    students: (students ?? []).filter((s: any) => !s.is_test)
      .map(({ is_test, parent_phone, ...s }: any) => ({ ...s, hasPhone: !!String(parent_phone ?? '').trim() })),
    links: (links ?? []).map((l: any) => ({ ...l, url: `${APP}/report/${l.token}` })),
  })
}

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 }) }
  const ids: string[] = Array.isArray(body?.studentIds) ? body.studentIds.map(String) : []
  if (!ids.length) return NextResponse.json({ error: '학생을 한 명 이상 골라 주세요.' }, { status: 400 })
  const 기본 = 기본구간()
  const from = String(body?.from || 기본.from).slice(0, 10)
  const to = String(body?.to || 기본.to).slice(0, 10)
  if (from > to) return NextResponse.json({ error: '시작일이 끝일보다 뒤예요.' }, { status: 400 })

  const db = admin()

  // ★ 보고서 종류가 DB 에 열려 있는지 먼저 본다. 안 열려 있으면 **한 건도 만들지 않고** 멈춘다 —
  //   사람마다 되고 안 되고가 갈리면 누구 것이 나갔는지 알 수 없게 된다.
  const { error: 막힘 } = await db.from('report_links').select('id').eq('report_type', TYPE).limit(1)
  if (막힘) return NextResponse.json({ error: 막힘.message }, { status: 500 })

  const out: { studentId: string; name: string; url: string | null; error?: string }[] = []
  for (const id of ids) {
    try {
      const data = await buildScoreClassReport(db, id, from, to)
      const token = randomBytes(16).toString('hex')
      const { error } = await db.from('report_links').insert({
        student_id: id, report_type: TYPE,
        period_label: data.period.label, period_start: from, period_end: to,
        data, token, sent_at: new Date().toISOString(),
      })
      if (error) {
        out.push({
          studentId: id, name: data.student.name, url: null,
          error: /report_type/.test(error.message)
            ? 'docs/sql/S코어반보고서_종류추가.sql 을 먼저 넣어 주세요.'
            : error.message,
        })
        continue
      }
      out.push({ studentId: id, name: data.student.name, url: `${APP}/report/${token}` })
    } catch (e: any) {
      out.push({ studentId: id, name: '', url: null, error: e?.message ?? '만들지 못했어요.' })
    }
  }
  return NextResponse.json({ ok: true, from, to, results: out })
}
