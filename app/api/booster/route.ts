/**
 * 부스터 특강 선착순 신청 — 받기(POST, 로그인 없음) · 현황 보기(GET, 로그인 없음)
 *
 * 원장님 2026-11-19: 「여러 학부모가 같은 순간에 신청하더라도 7명 이상 확정되는 일이
 * 없어야 합니다. 화면에서 인원수를 확인하는 방식만 사용하지 말고, 데이터베이스의
 * 트랜잭션 및 동시성 제어를 통해 서버에서 정원을 보장해 주세요.」
 *
 * ★ POST 는 **일부러 로그인 없이 열어 둔다.** 학부모님은 링크만 받고 들어오신다
 *   (app/api/survey, app/api/grade/[code] 와 같은 자리). 대신 이렇게 막는다:
 *     · 표의 RLS 는 insert 를 **아무에게도 안 연다.** 서버가 service_role 로만 넣는다.
 *     · 정원·접수시각·중복은 **DB 함수 booster_apply() 안에서** 본다.
 *       여기 route 에서 세지 않는다 — 세는 순간과 넣는 순간 사이에 남이 들어간다.
 *     · 칸마다 길이를 자른다.
 *
 * ★ GET 은 **숫자만** 돌려준다. 이름·연락처는 한 글자도 안 나간다.
 *   명단은 /api/booster/admin (원장 전용) 에서만 본다.
 *
 * ★ 돌려주는 now 는 **서버 시각**이다. 화면 카운트다운은 이 값을 기준으로 센다 —
 *   학부모님 폰 시계가 몇 분 틀려도 접수 시작이 어긋나지 않는다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { BOOSTER_SLUG, BOOSTER_TEST_SLUG, 숫자만, 번호꼴, 신청서검사, 동의항목 } from '@/lib/booster'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

/** 주소로 아무 특강이나 찌르지 못하게 — 우리가 아는 두 개만 받는다 */
function 아는특강인가(slug: unknown): slug is string {
  return slug === BOOSTER_SLUG || slug === BOOSTER_TEST_SLUG
}

const 글 = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

/* ── 현황 (로그인 없음) ─────────────────────────────────────────────── */
export async function GET(req: NextRequest) {
  const slug = new URL(req.url).searchParams.get('slug') ?? BOOSTER_SLUG
  if (!아는특강인가(slug)) {
    return NextResponse.json({ error: '없는 특강입니다.' }, { status: 404 })
  }

  const { data, error } = await db().rpc('booster_status', { p_slug: slug })
  if (error) {
    console.error('부스터 현황 조회 실패:', error)
    return NextResponse.json({ error: '현황을 불러오지 못했어요.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: '없는 특강입니다.' }, { status: 404 })

  // ★ 여기서 나가는 것은 숫자와 시각뿐이다.
  return NextResponse.json({
    title: data.title,
    capacity: data.capacity,
    seatsTaken: data.seats_taken,
    seatsLeft: data.seats_left,
    opensAt: data.opens_at,
    isOpen: data.is_open,
    serverNow: data.now,
  }, { headers: { 'Cache-Control': 'no-store' } })
}

/* ── 신청 받기 (로그인 없음) ────────────────────────────────────────── */
export async function POST(req: NextRequest) {
  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const slug = 아는특강인가(b.slug) ? b.slug : BOOSTER_SLUG

  // ★ 화면과 **같은 함수**로 본다 (lib/booster.ts). 화면만 고쳐서는 못 빠져나간다.
  const 틀림 = 신청서검사(b)
  if (틀림.length) return NextResponse.json({ error: 틀림[0] }, { status: 400 })

  const phone_digits = 숫자만(b.parent_phone)
  const 동의수 = Array.isArray(b.agreements) ? b.agreements.filter(Boolean).length : 0

  // 여기까지 왔으면 신청서검사가 이미 봤지만, 한 번 더 — 동의는 돈 대신 받는 약속이다
  if (동의수 !== 동의항목.length) {
    return NextResponse.json({ error: '신청 전 확인 세 가지에 모두 동의해 주세요.' }, { status: 400 })
  }

  // ★ 정원·접수시각·중복은 **전부 DB 함수 안에서** 본다. 여기서 미리 세지 않는다.
  const { data, error } = await db().rpc('booster_apply', {
    p_slug: slug,
    p_student_name: 글(b.student_name, 20),
    p_grade: 글(b.grade, 10),
    p_parent_name: 글(b.parent_name, 20),
    p_parent_phone: 번호꼴(b.parent_phone),
    p_phone_digits: phone_digits,
    p_is_enrolled: b.is_enrolled === true,
    p_agreed_count: 동의수,
  })

  if (error) {
    console.error('부스터 신청 실패:', error)
    return NextResponse.json({ error: '신청 처리 중 문제가 생겼어요. 다시 눌러 주세요.' }, { status: 500 })
  }

  if (!data?.ok) {
    // 까닭마다 다른 말 — 학부모님이 무엇을 하셔야 하는지 알 수 있게
    const 말: Record<string, string> = {
      no_session: '없는 특강입니다.',
      closed: '지금은 신청을 받지 않습니다.',
      not_yet: '아직 접수 시작 전입니다.',
      full: '정원이 모두 찼습니다.',
      race: '정원이 모두 찼습니다.',
      duplicate: '이미 신청하신 학생입니다.',
      need_agreement: '신청 전 확인 세 가지에 모두 동의해 주세요.',
    }
    const reason = String(data?.reason ?? '')
    return NextResponse.json(
      { ok: false, reason, error: 말[reason] ?? '신청을 받지 못했습니다.' },
      // 마감·중복은 잘못된 요청이 아니라 **결과**다. 화면이 까닭을 보고 다른 말을 띄운다.
      { status: 200 },
    )
  }

  return NextResponse.json({ ok: true, seatNo: data.seat_no, seatsLeft: Math.max(0, data.capacity - data.seats_taken) })
}
