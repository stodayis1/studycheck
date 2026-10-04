// 학습지를 학생에게 보내기 (교재로 푸는 학습지는 종이 없이 학생 앱에 뜬다)
//
//   GET  /api/sheet-assign?code=ABC123   → 지금 받은 학생 목록
//   POST /api/sheet-assign               → { code, studentIds[], dueDate? } 로 배부
//                                          (studentIds 에 없는 학생은 배부가 취소된다)
//
// 학생 쪽은 이 API 를 쓰지 않는다. 학생 앱은 exam_sheet_targets 를 RLS 로 직접 읽는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

async function sheetOf(supabase: any, code: string) {
  const { data } = await supabase
    .from('exam_sheets')
    .select('id, code, title')
    .eq('code', code)
    .maybeSingle()
  return data ?? null
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ error: '학습지 코드를 주세요.' }, { status: 400 })
  const sheet = await sheetOf(supabase, code)
  if (!sheet) return NextResponse.json({ error: '그런 학습지가 없습니다.' }, { status: 404 })

  // 받은 학생 · 낸 사람 · 푼 사람을 한 번에 (서로 상관없으니 같이 부른다)
  const [targets, gradings] = await Promise.all([
    supabase
      .from('exam_sheet_targets')
      .select('student_id, assigned_at, due_date, students(id, name, grade, class_time, teacher_name)')
      .eq('sheet_id', sheet.id)
      .order('assigned_at'),
    supabase.from('gradings').select('student_id, score, total, submitted_at').eq('sheet_id', sheet.id),
  ])
  const done = new Map<string, any>()
  for (const g of gradings.data ?? []) done.set(g.student_id, g)

  return NextResponse.json({
    sheet,
    targets: (targets.data ?? []).map((t: any) => ({
      studentId: t.student_id,
      name: t.students?.name ?? null,
      grade: t.students?.grade ?? null,
      classTime: t.students?.class_time ?? null,
      teacher: t.students?.teacher_name ?? null,
      assignedAt: t.assigned_at,
      dueDate: t.due_date,
      // 푼 사람은 다시 보내지 않도록 표시해 둔다
      score: done.get(t.student_id)?.score ?? null,
      total: done.get(t.student_id)?.total ?? null,
      submittedAt: done.get(t.student_id)?.submitted_at ?? null,
    })),
  })
}

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const b = await req.json().catch((): any => null)
  if (!b?.code) return NextResponse.json({ error: '학습지 코드를 주세요.' }, { status: 400 })

  const sheet = await sheetOf(supabase, b.code)
  if (!sheet) return NextResponse.json({ error: '그런 학습지가 없습니다.' }, { status: 404 })

  const want: string[] = Array.isArray(b.studentIds) ? b.studentIds.filter(Boolean) : []
  const dueDate: string | null = b.dueDate || null

  const { data: cur, error: e0 } = await supabase
    .from('exam_sheet_targets')
    .select('student_id')
    .eq('sheet_id', sheet.id)
  if (e0) return NextResponse.json({ error: e0.message }, { status: 500 })

  const have = new Set((cur ?? []).map((t: any) => t.student_id))
  const add = want.filter((id) => !have.has(id))
  const remove = [...have].filter((id) => !want.includes(id as string)) as string[]

  if (add.length) {
    const { error } = await supabase.from('exam_sheet_targets').insert(
      add.map((student_id) => ({ sheet_id: sheet.id, student_id, due_date: dueDate }))
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // 이미 푼 학생은 빼지 않는다 — 기록이 사라진 것처럼 보이면 안 된다
  if (remove.length) {
    const { data: solved } = await supabase
      .from('gradings').select('student_id').eq('sheet_id', sheet.id).in('student_id', remove)
    const keep = new Set((solved ?? []).map((g: any) => g.student_id))
    const drop = remove.filter((id) => !keep.has(id))
    if (drop.length) {
      const { error } = await supabase
        .from('exam_sheet_targets').delete().eq('sheet_id', sheet.id).in('student_id', drop)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }
  return NextResponse.json({ ok: true, added: add.length, removed: remove.length })
}
