// 학생 출결관리 화면이 쓰는 한 달치 묶음.
//
//   GET /api/attendance-overview?month=2026-10
//
// 한 화면에서 보여야 하는 것 (원장님 2026-10-14)
//   · 그 달 수업 횟수 — 정규 몇 번 했고 몇 번 빠졌나
//   · 결석 → 보강 — 언제 빠진 것을 언제 보강했나
//   · 대체수업 — 어느 날 수업을 어느 날로 옮겼나
//   · 추가수업 — 횟수를 채우려고 더 한 수업. 어느 달 몫인가
//
// 보강·대체·추가는 수학OPS 가 들고 있어서 서버에서만 읽을 수 있다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { fetchOpsMakeups } from '@/lib/opsMakeups'
import { fetchOpsExtraClasses } from '@/lib/opsExtraClasses'
import { fetchAllRows } from '@/lib/utils'
import { isExamAbsence } from '@/lib/attendance'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const month = new URL(req.url).searchParams.get('month')
    ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: '달을 YYYY-MM 으로 주세요.' }, { status: 400 })
  }
  const from = `${month}-01`
  const [y, m] = month.split('-').map(Number)
  const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)   // 그 달 마지막 날

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })

  const { data: students } = await db.from('students')
    .select('id, name, grade, teacher_name, ops_student_id')
    .eq('is_active', true).order('name')

  const sessions = await fetchAllRows<any>((f, t) => db.from('class_sessions')
    .select('id, student_id, session_date, session_type')
    .gte('session_date', from).lte('session_date', to).range(f, t))

  const notes = sessions.length
    ? await fetchAllRows<any>((f, t) => db.from('learning_notes')
        .select('session_id, attendance').in('session_id', sessions.map((s) => s.id)).range(f, t))
    : []
  const noteBy = new Map(notes.map((n) => [n.session_id, n]))

  const opsIds = (students ?? []).map((s: any) => s.ops_student_id).filter(Boolean)
  const [makeupsBy, extrasBy] = await Promise.all([
    fetchOpsMakeups(opsIds, from),
    fetchOpsExtraClasses(opsIds, from),
  ])

  const inMonth = (d?: string | null) => !!d && d >= from && d <= to

  const rows = (students ?? []).map((st: any) => {
    const mine = sessions.filter((s) => s.student_id === st.id)
    let done = 0, absent = 0, examAbsent = 0, blank = 0
    for (const s of mine) {
      if (s.session_type && s.session_type !== '정규') continue
      const a = noteBy.get(s.id)?.attendance
      if (!a) { blank++; continue }
      if (isExamAbsence(a)) { examAbsent++; continue }
      if (a === '결석') { absent++; continue }
      done++
    }

    const mk = (st.ops_student_id ? makeupsBy.get(st.ops_student_id) ?? [] : [])
      .filter((x) => inMonth(x.absentDate))
      .map((x) => ({ absentDate: x.absentDate, makeupDate: x.makeupDate, makeupTime: x.makeupTime, state: x.state }))
      .sort((a, b) => String(a.absentDate).localeCompare(String(b.absentDate)))

    const ex = (st.ops_student_id ? extrasBy.get(st.ops_student_id) ?? [] : [])
      .filter((x) => inMonth(x.date) || inMonth(x.originalDate))
      .map((x) => ({ date: x.date, time: x.time, state: x.state,
        classType: x.classType, originalDate: x.originalDate, targetMonth: x.targetMonth }))
      .sort((a, b) => String(a.date).localeCompare(String(b.date)))

    return {
      id: st.id, name: st.name, grade: st.grade, teacherName: st.teacher_name,
      linked: !!st.ops_student_id,
      regular: { done, absent, examAbsent, blank, total: done + absent + examAbsent + blank },
      makeups: mk,
      substitutes: ex.filter((x) => x.classType === 'substitute'),
      extras: ex.filter((x) => x.classType !== 'substitute'),
    }
  })

  return NextResponse.json({ month, from, to, rows })
}
