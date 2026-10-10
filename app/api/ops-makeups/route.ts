// 보강에서 적은 학습일지를 **담당 강사에게만** 보여 주기 위한 읽기 전용 API.
//
// 왜: 보강은 학생이 빠진 정규수업에 대한 서비스라, 그 달 수업 횟수에 세지 않는다.
// 그래서 스터디체크에 수업으로 만들지 않는다. 하지만 담당 강사는 **그날 보강에서
// 무엇을 했는지** 알아야 다음 수업을 이어 간다(원장님 2026-10-10).
// 기록은 OPS 에만 있으므로 서버에서 읽어 넘겨 준다 — OPS 키는 브라우저에 가면 안 된다.
//
// 학부모에게는 이 내용을 따로 보내지 않는다. 의무수업(추가·대체)만 학부모까지 간다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { fetchOpsMakeups } from '@/lib/opsMakeups'

export async function POST(req: NextRequest) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  try {
    const body = (await req.json().catch(() => ({}))) as { studentIds?: string[]; fromDate?: string }
    const ids = (body.studentIds ?? []).filter(Boolean)
    if (!ids.length) return NextResponse.json({ ok: true, items: [] })

    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )
    const { data: students } = await db.from('students')
      .select('id, name, grade, ops_student_id').in('id', ids)

    const opsIds = (students ?? []).map((s: any) => s.ops_student_id).filter(Boolean)
    // 기본 30일 — 담당 강사가 보는 것은 「최근에 무엇을 했나」다.
    const fromDate = body.fromDate
      ?? new Date(Date.now() + 9 * 3600_000 - 30 * 86400_000).toISOString().slice(0, 10)
    const byOps = await fetchOpsMakeups(opsIds, fromDate)

    const items: any[] = []
    for (const st of students ?? []) {
      const list = (st as any).ops_student_id ? byOps.get((st as any).ops_student_id) ?? [] : []
      for (const m of list) {
        // 적은 것이 하나도 없으면 보여 줄 내용이 없다(상태는 학부모 리포트가 이미 보여 준다).
        if (!m.lessonTextbook && !m.lessonWorksheet && !m.lessonNote && m.lessonScore == null) continue
        items.push({
          studentId: (st as any).id,
          studentName: (st as any).name,
          grade: (st as any).grade,
          absentDate: m.absentDate,
          makeupDate: m.makeupDate,
          makeupTime: m.makeupTime,
          state: m.state,
          teacherName: m.teacherName,
          lesson: [
            m.lessonTextbook,
            m.lessonWorksheet
              ? `${m.lessonWorksheet}${m.lessonScore != null ? ` ${m.lessonScore}점` : ''}`
              : (m.lessonScore != null ? `${m.lessonScore}점` : null),
            m.lessonNote,
          ].filter(Boolean),
        })
      }
    }
    items.sort((a, b) => String(b.makeupDate ?? '').localeCompare(String(a.makeupDate ?? '')))
    return NextResponse.json({ ok: true, items })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? '불러오지 못했어요.' }, { status: 500 })
  }
}
