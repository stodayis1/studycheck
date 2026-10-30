// 강사가 교재 삭제를 요청하면 **원장님께 바로 알림이 가게** 한다.
//
// 왜 서버로 옮겼나 — 전에는 화면에서 바로 student_textbooks 를 고쳤다. 그래서 요청이
// 들어와도 아무 데도 안 남고, 원장님은 학생을 하나씩 열어 빨간 뱃지를 봐야만 알 수 있었다.
// 2026-10-27 에 두 달치 36건이 쌓여 있는 걸 뒤늦게 발견했다.
//
// 삭제 자체는 여기서 하지 않는다 — 요청 표시만 남기고 알림을 보낸다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { sendPush } from '@/lib/sendPush'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function POST(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny

  const body: any = await req.json().catch((): any => null)
  const id = body?.textbookId as string | undefined
  if (!id) return NextResponse.json({ error: '교재를 알 수 없어요.' }, { status: 400 })

  const db = admin()

  // 요청 취소(원장님만) — 플래그만 지운다
  if (body?.cancel === true) {
    if (who.role !== 'admin')
      return NextResponse.json({ error: '요청 취소는 원장님만 할 수 있어요.' }, { status: 403 })
    const { error } = await db.from('student_textbooks')
      .update({ delete_requested_by: null, delete_requested_at: null }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, cancelled: true })
  }

  const { data: tb, error: tbErr } = await db.from('student_textbooks')
    .select('id, student_id, textbook_name, textbook_type, status').eq('id', id).maybeSingle()
  if (tbErr) return NextResponse.json({ error: tbErr.message }, { status: 500 })
  if (!tb) return NextResponse.json({ error: '교재를 찾을 수 없어요.' }, { status: 404 })

  const requestedAt = new Date().toISOString()
  const { error } = await db.from('student_textbooks')
    .update({ delete_requested_by: who.name, delete_requested_at: requestedAt }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 알림 — 원장님 단말로. 진도 기록이 걸려 있으면 그 숫자를 제목에 같이 보낸다
  // (지우면 사라지는 것이 무엇인지 알림만 보고도 알 수 있게).
  const [{ data: student }, { count: checks }, { data: admins }] = await Promise.all([
    db.from('students').select('name, grade').eq('id', tb.student_id).maybeSingle(),
    db.from('progress_checks').select('id', { count: 'exact', head: true }).eq('student_textbook_id', id),
    db.from('users').select('id').eq('role', 'admin'),
  ])

  const n = checks ?? 0
  const 꼬리 = tb.status === 'completed'
    ? ' · 이미 「완료」된 교재예요'
    : n > 0 ? ` · 진도 ${n}회가 같이 사라져요` : ''

  let push: Awaited<ReturnType<typeof sendPush>> = { sent: 0, failed: 0 }
  const adminIds = (admins ?? []).map((u: any) => u.id)
  if (adminIds.length > 0) {
    push = await sendPush({ userIds: adminIds }, {
      title: '교재 삭제요청',
      body: `${who.name} 선생님 · ${student?.name ?? '학생'}(${student?.grade ?? ''}) ${tb.textbook_name}${꼬리}`,
      url: '/teacher/curriculum',
      tag: 'textbook-delete-request',
    })
  }

  return NextResponse.json({ ok: true, requestedBy: who.name, requestedAt, checks: n, push })
}

// 원장님 화면의 「삭제요청 N건」 뱃지가 쓰는 숫자.
export async function GET(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny
  if (who.role !== 'admin') return NextResponse.json({ count: 0 })

  // ★ 화면이 보여 주는 것과 **같은 것**을 센다 (원장님 2026-10-29 「뱃지는 1인데 0건」).
  //   과정관리는 재원·휴원 학생만 불러온다. 퇴원생 교재에 남은 요청까지 여기서 세면,
  //   눌러도 아무것도 없는 뱃지가 영영 떠 있게 된다.
  const db = admin()
  const { data: rows, error } = await db.from('student_textbooks')
    .select('id, student_id').not('delete_requested_at', 'is', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = [...new Set((rows ?? []).map((r: any) => r.student_id).filter(Boolean))]
  if (ids.length === 0) return NextResponse.json({ count: 0 })

  // 과정관리 화면과 **글자 그대로 같은 조건**으로 묻는다. 한쪽만 고치면 또 어긋난다.
  const { data: live, error: sErr } = await db.from('students')
    .select('id').in('id', ids).or('is_active.eq.true,on_leave.eq.true')
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  const ok = new Set((live ?? []).map((r: any) => r.id))
  return NextResponse.json({ count: (rows ?? []).filter((r: any) => ok.has(r.student_id)).length })
}
