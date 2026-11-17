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
// 누가 쓸 수 있나 — 직원이면서(staffOrDeny) **고등 커리큘럼을 볼 수 있는 사람**
//   (can_see_high_curriculum, 원장·고등 강사·명단에 넣은 강사). 그 판단은 DB 함수 한 곳에만
//   있고, lib/apiAuth.ts 의 highOrDeny 가 **그 사람의 토큰으로** 불러서 그대로 따른다
//   — 규칙을 베껴 쓰지 않는다. 같은 가드를 app/api/pdf-worksheets 도 쓴다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { highOrDeny } from '@/lib/apiAuth'
import { WD, WE } from '@/lib/moveAssign'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/** 이 판이 보는 학년 */
const GRADES = ['초6', '중1', '중2', '중3', '고1', '고2']

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
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
  const who = await highOrDeny(req)
  if (who.deny) return who.deny
  const db = admin()
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

    const rows = await all(() => db.from('class_move_assign')
      .select('student_id, track, teacher_name, weekday_slot, weekend_slot').order('student_id'))

    return NextResponse.json({ students, schedules, rows })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '읽지 못했어요.' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const who = await highOrDeny(req)
  if (who.deny) return who.deny
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: '잘못된 요청이에요.' }, { status: 400 }) }

  const studentId = String(body?.studentId ?? '')
  const track = String(body?.track ?? '')
  const teacher = String(body?.teacher ?? '')
  const weekday = String(body?.weekday ?? '')
  const weekend = String(body?.weekend ?? '')
  if (!studentId) return NextResponse.json({ error: '학생을 알 수 없어요.' }, { status: 400 })
  if (track !== '고등' && track !== '중등') return NextResponse.json({ error: '판을 알 수 없어요.' }, { status: 400 })
  // 없는 타임 열쇠가 들어오면 화면에서 그 학생이 아무 칸에도 안 그려진다 — 여기서 막는다.
  if (weekday && !WD[weekday]) return NextResponse.json({ error: '없는 평일 타임이에요.' }, { status: 400 })
  if (weekend && !WE[weekend]) return NextResponse.json({ error: '없는 토·일 타임이에요.' }, { status: 400 })

  const db = admin()
  const { error } = await db.from('class_move_assign').upsert({
    student_id: studentId,
    track,
    teacher_name: teacher || null,
    weekday_slot: weekday || null,
    weekend_slot: weekend || null,
    updated_at: new Date().toISOString(),
    updated_by_name: who.name || null,
  }, { onConflict: 'student_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
