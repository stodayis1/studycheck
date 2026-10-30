// 선생님이 학생 수업 시간표 변경을 **요청**하면 원장님께 바로 알림이 가게 한다.
//
// 왜 — 시간표(schedules) 쓰기는 2026-10-14 부터 원장님 전용이다. 그래서 선생님은 수업
// 시간이 바뀌어도 말로 전할 수밖에 없었고, 말은 잊힌다. 교재 삭제요청과 같은 꼴로
// 요청을 남기고 알림을 보낸다. **시간표를 바꾸는 일은 여기서 하지 않는다** —
// 원장님이 학생관리 화면에서 「반영」을 누를 때 바뀐다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { staffCanSeeStudent } from '@/lib/teachers'
import { sendPush } from '@/lib/sendPush'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

type Want = { day: string; time: string; periods: number }

const DAY_ORDER = ['월', '화', '수', '목', '금', '토', '일']

/** [{월,16:00,2}] → 「월16:00·2교시」 — 사람이 읽는 한 줄 */
function wantText(rows: Want[]) {
  return [...rows]
    .filter((r) => r.day && r.time)
    .sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day))
    .map((r) => `${r.day}${String(r.time).slice(0, 5)}·${r.periods}교시`)
    .join(', ')
}

export async function POST(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny

  const body: any = await req.json().catch((): any => null)
  const db = admin()

  // 요청 취소 — 올린 사람 본인 또는 원장님
  if (body?.cancel === true) {
    const id = body?.requestId as string | undefined
    if (!id) return NextResponse.json({ error: '요청을 알 수 없어요.' }, { status: 400 })
    const { data: row } = await db.from('schedule_change_requests')
      .select('id, requested_by').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: '요청을 찾을 수 없어요.' }, { status: 404 })
    if (who.role !== 'admin' && (row as any).requested_by !== who.id)
      return NextResponse.json({ error: '본인이 올린 요청만 취소할 수 있어요.' }, { status: 403 })
    const { error } = await db.from('schedule_change_requests').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cancelled: true })
  }

  // 결정 알림 — 원장님이 반영·거절한 뒤 올린 선생님에게 알려 준다.
  // (상태 글자는 화면에서 이미 바꿔 두었다. 여기서는 알림만 보낸다.)
  if (body?.notifyDecision === true) {
    if (who.role !== 'admin')
      return NextResponse.json({ error: '원장님만 할 수 있어요.' }, { status: 403 })
    const id = body?.requestId as string | undefined
    if (!id) return NextResponse.json({ error: '요청을 알 수 없어요.' }, { status: 400 })
    const { data: row } = await db.from('schedule_change_requests')
      .select('id, student_id, requested_by, want_text, status, decided_note').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: '요청을 찾을 수 없어요.' }, { status: 404 })
    const { data: student } = await db.from('students')
      .select('name, grade').eq('id', (row as any).student_id).maybeSingle()
    const 반영 = (row as any).status === 'applied'
    let push: Awaited<ReturnType<typeof sendPush>> = { sent: 0, failed: 0 }
    if ((row as any).requested_by) {
      push = await sendPush({ userIds: [(row as any).requested_by] }, {
        title: 반영 ? '시간표 변경 반영됨' : '시간표 변경 안 함',
        body: `${student?.name ?? '학생'}(${student?.grade ?? ''}) ${(row as any).want_text ?? ''}`
          + (반영 ? '' : ` — ${(row as any).decided_note || '원장님 확인 결과 바꾸지 않았어요'}`),
        url: '/teacher/students',
        tag: 'schedule-change-decision',
      })
    }
    return NextResponse.json({ ok: true, push })
  }

  // 새 요청
  const studentId = body?.studentId as string | undefined
  const want = Array.isArray(body?.want) ? (body.want as Want[]) : null
  if (!studentId || !want) return NextResponse.json({ error: '학생과 바꿀 시간표가 필요해요.' }, { status: 400 })

  const clean = want
    .filter((r) => r && typeof r.day === 'string' && typeof r.time === 'string')
    .map((r) => ({ day: r.day, time: String(r.time).slice(0, 5), periods: Number(r.periods) || 1 }))
  if (!clean.length) return NextResponse.json({ error: '바꿀 시간표를 한 줄 이상 넣어주세요.' }, { status: 400 })

  const { data: student, error: sErr } = await db.from('students')
    .select('id, name, grade, teacher_name, class_time').eq('id', studentId).maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!student) return NextResponse.json({ error: '학생을 찾을 수 없어요.' }, { status: 404 })

  // ★ 이 API 는 service_role 로 돌아 RLS 를 비껴간다 — 담당 확인을 여기서 해야 한다.
  if (!staffCanSeeStudent(who, student as any))
    return NextResponse.json({ error: '담당 학생만 요청할 수 있어요.' }, { status: 403 })

  // 같은 학생에 아직 안 본 요청이 있으면 또 쌓지 않는다 — 원장님이 둘 중 무엇을 반영할지
  // 알 수 없게 된다. 먼저 올린 것을 취소하고 다시 올리게 한다.
  const { data: dup } = await db.from('schedule_change_requests')
    .select('id, requested_by_name').eq('student_id', studentId).eq('status', 'open').maybeSingle()
  if (dup)
    return NextResponse.json({
      error: `${student.name} 학생은 이미 올라간 요청이 있어요`
        + `(${(dup as any).requested_by_name ?? ''}). 그 요청을 취소하고 다시 올려주세요.`,
    }, { status: 409 })

  const wt = wantText(clean)
  const { data: inserted, error } = await db.from('schedule_change_requests').insert({
    student_id: studentId,
    requested_by: who.id,
    requested_by_name: who.name,
    before_text: (student as any).class_time ?? null,
    want: clean,
    want_text: wt,
    note: typeof body?.note === 'string' ? body.note.slice(0, 500) : null,
  }).select('id, requested_at').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: admins } = await db.from('users').select('id').eq('role', 'admin')
  const adminIds = (admins ?? []).map((u: any) => u.id)
  let push: Awaited<ReturnType<typeof sendPush>> = { sent: 0, failed: 0 }
  if (adminIds.length > 0) {
    push = await sendPush({ userIds: adminIds }, {
      title: '시간표 변경요청',
      body: `${who.name} 선생님 · ${student.name}(${student.grade ?? ''}) `
        + `${(student as any).class_time ?? '시간표 없음'} → ${wt}`,
      url: '/teacher/students?schedule=1',
      tag: 'schedule-change-request',
    })
  }

  return NextResponse.json({ ok: true, id: (inserted as any)?.id, wantText: wt, push })
}

// 원장님 화면의 「시간표요청 N건」 뱃지가 쓰는 숫자.
export async function GET(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny
  if (who.role !== 'admin') return NextResponse.json({ count: 0 })

  const { count, error } = await admin().from('schedule_change_requests')
    .select('id', { count: 'exact', head: true }).eq('status', 'open')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ count: count ?? 0 })
}
