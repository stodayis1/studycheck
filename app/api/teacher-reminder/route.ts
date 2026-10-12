// 수업일지가 덜 된 선생님께 본인 몫만 문자로 알린다 (원장님이 미리보기 보고 누르는 길).
// 자동 발송은 app/api/cron/briefing 이 같은 함수(lib/teacherReminder)를 쓴다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { buildTeacherReminders, sendTeacherReminders } from '@/lib/teacherReminder'

function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

export async function POST(req: NextRequest) {
  // 실제 문자가 나가고 요금이 붙는다. 원장님만.
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  try {
    const body = (await req.json().catch(() => ({}))) as { date?: string; dryRun?: boolean; teachers?: string[] }
    const date = body.date ?? kstToday()
    const dryRun = body.dryRun !== false

    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } })
    const { items, noTeacher, note } = await buildTeacherReminders(db, date)

    let sent = 0
    if (!dryRun && items.length) {
      sent = await sendTeacherReminders(items, body.teachers?.length ? new Set(body.teachers) : undefined)
    }
    return NextResponse.json({
      date, dryRun, sent, items, noTeacher,
      note: note ?? (items.length === 0 ? '덜 채워진 수업일지가 없어요.' : undefined),
    })
  } catch (e: any) {
    console.error('수업일지 알림 오류:', e)
    return NextResponse.json({ error: e?.message ?? '보내지 못했어요.' }, { status: 500 })
  }
}
