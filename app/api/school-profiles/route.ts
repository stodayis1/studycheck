// 학교 자료집 읽기·저장.
//
// 읽기는 직원 전체(상담·시험대비에서 쓴다), 저장은 원장만.
// 학생 수는 여기서 같이 세어 보낸다 — 화면에서 학생 220명을 통째로 받아 세는 것보다 싸다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { normalizeSchool } from '@/lib/school'
import { fetchAllRows } from '@/lib/utils'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const db = admin()
  const name = new URL(req.url).searchParams.get('school')

  // 한 학교만
  if (name) {
    const key = normalizeSchool(name)
    const { data, error } = await db.from('school_profiles')
      .select('*').eq('school_name', key).maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: '아직 정리된 자료가 없어요.' }, { status: 404 })

    // 우리 학생 — 이 학교 다니는 아이들을 학년과 함께
    // ★ 퇴원생(is_active=false)은 빼야 한다. 안 그러면 몇 달 전 나간 아이가 계속 뜬다.
    //   휴원(on_leave)은 아직 재원이므로 그대로 둔다.
    // ★ order 없이 range 로 넘기면 행을 놓친다. 정렬 기준을 반드시 준다.
    const students = await fetchAllRows(() =>
      db.from('students').select('id, name, grade, school')
        .eq('school', key).eq('is_active', true).order('grade').order('name')
    )
    return NextResponse.json({ profile: data, students })
  }

  // 목록
  const { data, error } = await db.from('school_profiles')
    .select('school_name, school_level, official_name, source_year, region, foundation, school_type, stats, updated_at')
    .order('school_level').order('school_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 학교별 우리 학생 수 — 학교 칸만 읽어 센다 (퇴원생 제외. 상세 화면과 같은 기준이어야 한다)
  const rows = await fetchAllRows(() =>
    db.from('students').select('id, school').eq('is_active', true).order('id'))
  const counts: Record<string, number> = {}
  for (const r of rows as any[]) {
    const k = normalizeSchool(r.school)
    if (k) counts[k] = (counts[k] ?? 0) + 1
  }

  return NextResponse.json({ profiles: data ?? [], counts })
}

export async function PUT(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  const body = await req.json().catch(() => null)
  if (!body?.school_name || !body?.school_level || !body?.source_year)
    return NextResponse.json({ error: '학교명·학교급·공시연도는 있어야 해요.' }, { status: 400 })

  // ★ 들어오는 이름은 무조건 한 번 더 통일한다. 「고양일고등학교」로 들어오면
  //   students.school(「고양일고」)과 영영 안 만난다 — 에러도 안 난다.
  const row = {
    ...body,
    school_name: normalizeSchool(body.school_name),
    updated_at: new Date().toISOString(),
  }
  delete row.id

  const { data, error } = await admin().from('school_profiles')
    .upsert(row, { onConflict: 'school_name' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}
