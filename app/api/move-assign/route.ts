// 진급 배정판(app/teacher/move-assign)이 쓰는 서버 API.
//
//   GET  /api/move-assign          → { students, schedules, rows }
//   POST /api/move-assign          → { studentId, track, teacher, weekday, weekend } 한 줄 저장
//
// ★ 왜 서버로 돌아왔나 (원장님 2026-11-17 「왜 초등이 중등으로 넘어오는 시간표가 안보이는거지?」
//   — 신애진 선생님 화면에서 초6 이 0명으로 나왔다)
//   학생 조회 정책(students.staff_or_own)은 **담당 학생 + 주임 학년**만 읽힌다. 중등 선생님은
//   초6 을 한 명도 못 읽는다 — 그런데 「초6 → 중등」 탭이 보여야 하는 분이 바로 그분들이다.
//   브라우저에서 직접 읽으면 조용히 0명이 된다(에러도 안 난다).
//   그렇다고 students 정책을 넓히면 **앱 전체에서** 초등이 열린다. 그래서 이 화면이 쓰는
//   학생·시간표만 서버가 service_role 로 읽어 내려 준다.
//
// 누가 쓸 수 있나 — 직원이면서(staffOrDeny) can_see_move_assign() 이 참인 사람.
//   판단은 DB 함수 한 곳에만 있고, 여기서는 **그 사람의 토큰으로** 불러서 그대로 따른다
//   (규칙을 TS 로 베껴 쓰지 않는다).
//
// ★ 두 갈래다 (원장님 2026-11-17 「전체 인원을 볼 필요가 없어」)
//   · 전체 — can_see_high_curriculum() 도 참인 사람. 세 탭 모두, 고등부 학생까지 본다.
//   · 고등 빼고 — 진급 배정판 명단에만 든 사람(초6 담당 조윤희·윤주희). 「초6 → 중등」과
//     「초등 진급」 탭만이고, **고1·고2 는 아예 안 내려 준다.** 그분들이 고등부 명단을 볼 까닭이 없다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { WD, WE, EXTRA, GRADES_ELEM } from '@/lib/moveAssign'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * 이 판이 보는 학년 — 고등 권한이 없는 사람에게는 고1·고2 를 뺀다.
 * ★ 초1~초5 는 「초등 진급」 탭이 쓴다 (원장님 2026-11-17). 학생 정책으로는 초등 선생님도
 *   남의 반 초등을 못 읽으므로 여기서 service_role 로 내려 준다.
 */
const GRADES_BASE = [...GRADES_ELEM, '초6', '중1', '중2', '중3']
const GRADES_ALL = [...GRADES_BASE, '고1', '고2']

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

/**
 * 직원인지 보고, 그 다음 **그 사람 토큰으로** 권한 함수 둘을 불러 본다.
 *   deny — 막는 응답(통과면 null)
 *   full — 두 탭 모두 볼 사람인가(can_see_high_curriculum)
 */
async function allow(req: Request): Promise<{ deny: NextResponse | null; full: boolean; name: string }> {
  const who = await staffOrDeny(req)
  if (who.deny) return { deny: who.deny, full: false, name: '' }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!url || !anon)
    return { deny: NextResponse.json({ error: '서버 설정이 올바르지 않아요.' }, { status: 500 }), full: false, name: '' }

  const asUser = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const [board, high] = await Promise.all([
    asUser.rpc('can_see_move_assign'),
    asUser.rpc('can_see_high_curriculum'),
  ])
  if (board.error || high.error)
    return { deny: NextResponse.json({ error: '권한을 확인하지 못했어요.' }, { status: 500 }), full: false, name: '' }
  if (board.data !== true)
    return { deny: NextResponse.json({ error: '이 화면을 볼 수 있는 선생님만 쓸 수 있어요.' }, { status: 403 }), full: false, name: '' }
  return { deny: null, full: high.data === true, name: who.name }
}

/** 수파베이스는 한 번에 1000행만 준다 — 다 읽을 때는 돌려 가며 읽는다. */
async function all(make: () => any): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
  }
}

export async function GET(req: Request) {
  const { deny, full } = await allow(req)
  if (deny) return deny
  const db = admin()
  const GRADES = full ? GRADES_ALL : GRADES_BASE
  try {
    const students = (await all(() => db.from('students')
      .select('id, name, grade, teacher_name, is_test')
      .or('is_active.eq.true,on_leave.eq.true').in('grade', GRADES).order('id')))
      // 가상 학생(테스트용)은 숫자·명단에서 뺀다
      .filter((s: any) => !s.is_test)
      .map(({ is_test, ...s }: any) => s)

    const ids = students.map((s: any) => s.id)
    const schedules: any[] = []
    for (let i = 0; i < ids.length; i += 100) {   // in() 은 100개씩 끊는다
      schedules.push(...await all(() => db.from('schedules')
        .select('student_id, day_of_week, start_time, periods')
        .in('student_id', ids.slice(i, i + 100)).order('id')))
    }

    let rows = await all(() => db.from('class_move_assign')
      .select('student_id, track, teacher_name, weekday_slot, weekend_slot, extra_slot').order('student_id'))
    // 고등 권한이 없는 사람에게는 고등 판 줄도 내려 주지 않는다
    if (!full) rows = rows.filter((r: any) => r.track === '중등' || r.track === '초등')

    return NextResponse.json({ students, schedules, rows, full })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '읽지 못했어요.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const { deny, full, name } = await allow(req)
  if (deny) return deny
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 }) }

  const studentId = String(body?.studentId ?? '')
  const track = String(body?.track ?? '')
  const teacher = String(body?.teacher ?? '')
  const weekday = String(body?.weekday ?? '')
  const weekend = String(body?.weekend ?? '')
  const extra = String(body?.extra ?? '')
  if (!studentId) return NextResponse.json({ error: '학생을 알 수 없어요.' }, { status: 400 })
  if (track !== '고등' && track !== '중등' && track !== '초등')
    return NextResponse.json({ error: '판을 알 수 없어요.' }, { status: 400 })
  // 고등 권한이 없는 사람은 고등 판을 고칠 수 없다 (화면에도 그 탭이 안 뜬다)
  if (track === '고등' && !full)
    return NextResponse.json({ error: '「중3 → 고등」은 고등 선생님만 고칠 수 있어요.' }, { status: 403 })
  // 없는 타임 열쇠가 들어오면 화면에서 그 학생이 아무 칸에도 안 그려진다 — 여기서 막는다.
  if (weekday && !WD[weekday]) return NextResponse.json({ error: '없는 평일 타임이에요.' }, { status: 400 })
  if (weekend && !WE[weekend]) return NextResponse.json({ error: '없는 토·일 타임이에요.' }, { status: 400 })
  if (extra && !EXTRA[extra]) return NextResponse.json({ error: '없는 추가 클리닉이에요.' }, { status: 400 })
  // 중등·초등 판은 **선생님만** 고른다. 타임이 섞여 들어오면 그 학생이 고등 판 칸에 그려진다.
  if (track !== '고등' && (weekday || weekend || extra))
    return NextResponse.json({ error: '이 판은 선생님만 고릅니다.' }, { status: 400 })

  const db = admin()
  const { error } = await db.from('class_move_assign').upsert({
    student_id: studentId,
    track,
    teacher_name: teacher || null,
    weekday_slot: weekday || null,
    weekend_slot: weekend || null,
    extra_slot: extra || null,
    updated_at: new Date().toISOString(),
    updated_by_name: name || null,
  }, { onConflict: 'student_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
