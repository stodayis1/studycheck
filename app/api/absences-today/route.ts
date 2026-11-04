// 오늘 결석인 학생 — 대시보드가 쓴다.
//
//   GET /api/absences-today            (오늘)
//   GET /api/absences-today?date=2026-11-05
//
// 왜 서버인가 — 결석은 **수학OPS** 가 들고 있고 브라우저는 OPS 키를 가질 수 없다.
//
// ★ 보이는 범위는 다른 화면과 같다(staffCanSeeStudent).
//   담당 강사는 본인 담당만, 주임은 담당 학년, 원장·행정은 전체.
//   원장님 2026-11-04 「담당 선생님 전달사항에 … 당연히 행정선생님 전달사항에도」.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { staffCanSeeStudent } from '@/lib/teachers'
import { fetchOpsAbsences, absenceLine } from '@/lib/opsAbsences'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

export async function GET(req: NextRequest) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny

  const date = new URL(req.url).searchParams.get('date') ?? kstToday()
  try {
    const rows = await fetchOpsAbsences(date)
    if (!rows.length) return NextResponse.json({ date, items: [] })

    const db = admin()
    const { data: students } = await db.from('students')
      .select('id, name, grade, teacher_name, is_active, is_test')
      .in('id', rows.map((r) => r.studentId))
    const byId = new Map((students ?? []).map((s: any) => [s.id, s]))

    const items = rows.flatMap((r) => {
      const s: any = byId.get(r.studentId)
      // 퇴원생·연습용 학생은 뺀다. 못 보는 학생도 뺀다.
      if (!s || !s.is_active || s.is_test) return []
      if (!staffCanSeeStudent(who, s)) return []
      return [{
        studentId: s.id, name: s.name, grade: s.grade, teacherName: s.teacher_name,
        reason: r.reason, personalLeave: r.personalLeave, makeupRequired: r.makeupRequired,
        line: absenceLine(s.name, s.grade, r),
      }]
    })
    return NextResponse.json({ date, items })
  } catch (e: any) {
    // 결석을 못 읽어도 대시보드는 떠야 한다.
    return NextResponse.json({ date, items: [], error: e?.message ?? '결석을 읽지 못했어요.' })
  }
}
