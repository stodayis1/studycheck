// 「그날 수업을 다른 날로 옮긴 학생」 목록. 화면에서 그날 수업 목록을 만들 때 빼려고 쓴다.
//
//   GET /api/ops-moved-away?date=2026-10-14
//
// 수학OPS 를 읽어야 해서 서버에서만 된다(OPS 키는 브라우저에 못 내보낸다).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { fetchMovedAway } from '@/lib/opsMovedAway'

export async function GET(req: NextRequest) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const date = new URL(req.url).searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: '날짜를 YYYY-MM-DD 로 주세요.' }, { status: 400 })
  }

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })

  const moved = await fetchMovedAway(db, date)
  return NextResponse.json({ date, moved })
}
