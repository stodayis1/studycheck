/**
 * 부스터 특강 — 원장님 화면이 쓰는 API. **원장 전용.**
 *
 * 원장님 2026-11-19: 「신청자 명단과 개인정보는 관리자만 열람할 수 있도록 해주세요.」
 *
 * ★ adminOnly: true — 강사가 주소로 직접 불러도 막힌다. 여기엔 학부모 연락처가 있다.
 * ★ 취소해도 자리는 **자동으로 안 열린다.** 원장님이 「자리 다시 열기」를 따로 누르셔야 한다
 *   (원장님: 「자리를 다시 열지, 대기자를 받을지는 관리자가 결정」).
 *
 *   GET    ?slug=…            명단 + 숫자
 *   POST   { action: 'cancel',  id, reason }       신청 취소 (자리는 그대로 막혀 있음)
 *   POST   { action: 'reopen',  slug, howMany }    자리 다시 열기
 *   POST   { action: 'setOpen', slug, isOpen }     접수 창구 자체를 닫기/열기
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { BOOSTER_SLUG, BOOSTER_TEST_SLUG } from '@/lib/booster'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

function 아는특강인가(slug: unknown): slug is string {
  return slug === BOOSTER_SLUG || slug === BOOSTER_TEST_SLUG
}

export async function GET(req: NextRequest) {
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny

  const slug = new URL(req.url).searchParams.get('slug') ?? BOOSTER_SLUG
  if (!아는특강인가(slug)) return NextResponse.json({ error: '없는 특강입니다.' }, { status: 404 })

  const supabase = db()
  const { data: session, error: e1 } = await supabase
    .from('booster_sessions')
    .select('id, slug, title, capacity, seats_taken, opens_at, is_open, is_test')
    .eq('slug', slug).maybeSingle()
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: '없는 특강입니다.' }, { status: 404 })

  const { data: apps, error: e2 } = await supabase
    .from('booster_applications')
    .select('id, seat_no, status, student_name, grade, parent_name, parent_phone, phone_digits, is_enrolled, created_at, cancelled_at, cancel_reason')
    .eq('session_id', session.id)
    .order('seat_no')
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const 목록 = apps ?? []

  // 「중복 신청 여부」 — 같은 번호로 여러 건(형제자매는 정상이라 **표시만** 한다)
  const 번호횟수: Record<string, number> = {}
  for (const a of 목록) 번호횟수[a.phone_digits] = (번호횟수[a.phone_digits] || 0) + 1

  return NextResponse.json({
    session: {
      slug: session.slug, title: session.title, capacity: session.capacity,
      seatsTaken: session.seats_taken, seatsLeft: Math.max(0, session.capacity - session.seats_taken),
      opensAt: session.opens_at, isOpen: session.is_open, isTest: session.is_test,
    },
    serverNow: new Date().toISOString(),
    confirmed: 목록.filter(a => a.status === 'confirmed').length,
    cancelled: 목록.filter(a => a.status === 'cancelled').length,
    applications: 목록.map(a => ({
      ...a,
      // 같은 번호가 둘 이상이면 표시 — 형제자매일 수도, 중복일 수도 있어 원장님이 보신다
      sharedPhone: 번호횟수[a.phone_digits] > 1,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: NextRequest) {
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny

  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const supabase = db()

  /* ── 신청 취소 — 자리는 **그대로 막혀 있다** ───────────────────────── */
  if (b.action === 'cancel') {
    const id = String(b.id ?? '')
    if (!id) return NextResponse.json({ error: '어떤 신청인지 알 수 없어요.' }, { status: 400 })

    const { error } = await supabase.from('booster_applications').update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: String(b.reason ?? '').trim().slice(0, 200) || null,
    }).eq('id', id).eq('status', 'confirmed')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // ★ seats_taken 은 **안 건드린다.** 자동 재오픈 금지 (원장님 2026-11-19).
    return NextResponse.json({ ok: true, note: '자리는 아직 막혀 있습니다. 다시 받으시려면 「자리 다시 열기」를 눌러주세요.' })
  }

  /* ── 자리 다시 열기 ────────────────────────────────────────────────── */
  if (b.action === 'reopen') {
    const slug = 아는특강인가(b.slug) ? b.slug : BOOSTER_SLUG
    const howMany = Math.max(1, Math.min(6, Number(b.howMany) || 1))

    // ★ 자리 수는 DB 함수가 잠그고 고친다 — 여기서 읽고 쓰면 그 사이에 신청이 들어온다.
    //   함수가 is_admin() 을 보므로 **원장님 토큰으로** 부른다(service_role 로 부르면 통과 못 한다).
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
    const asUser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data, error } = await asUser.rpc('booster_reopen_seat', { p_slug: slug, p_how_many: howMany })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.ok) return NextResponse.json({ error: '자리를 열지 못했습니다.' }, { status: 400 })
    return NextResponse.json({ ok: true, seatsTaken: data.seats_taken, seatsLeft: data.seats_left })
  }

  /* ── 접수 창구 닫기 / 열기 ─────────────────────────────────────────── */
  if (b.action === 'setOpen') {
    const slug = 아는특강인가(b.slug) ? b.slug : BOOSTER_SLUG
    const { error } = await supabase.from('booster_sessions')
      .update({ is_open: b.isOpen === true }).eq('slug', slug)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '무엇을 할지 알 수 없어요.' }, { status: 400 })
}
