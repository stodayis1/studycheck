// 학교 자료집 — 학교알리미에서 받아 한 장을 만들거나(새 학교), 숫자만 새로 받는다(있는 학교).
//
//   POST { shl, level, sigungu }   학교 찾기에서 고른 학교를 새로 만든다
//   POST { school_name }           있는 학교의 숫자를 다시 받는다(stats.schoolinfo 로 찾아간다)
//
// ★ 사람이 정리한 수학 편제·정기시험·메모·성취도는 덮지 않는다(lib/schoolinfo.ts mergeProfile).
// 공시자료(공공데이터)를 넣는 일이라 직원이면 누구나 — 상담 직전에 선생님이 직접 추가한다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { normalizeSchool } from '@/lib/school'
import { fetchSchool, mergeProfile, isNoKey, LEVEL_CODE, type Level } from '@/lib/schoolinfo'

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const body = await req.json().catch((): any => null)
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })

  try {
    let shl: string, level: Level, region: { adrcd?: string; sigungu?: string }
    let prev: any = null

    if (body?.school_name) {
      const { data } = await db.from('school_profiles').select('*')
        .eq('school_name', normalizeSchool(body.school_name)).maybeSingle()
      const key = data?.stats?.schoolinfo
      if (!key?.shl) return NextResponse.json({ error: '이 학교는 학교알리미 연결 정보가 없어요.' }, { status: 400 })
      prev = data; shl = key.shl; level = key.level; region = { adrcd: key.adrcd }
    } else {
      shl = String(body?.shl ?? ''); level = body?.level; region = { sigungu: String(body?.sigungu ?? '') }
      if (!/^[0-9a-f-]{36}$/.test(shl) || !(level in LEVEL_CODE) || !/^\d{10}$/.test(region.sigungu!))
        return NextResponse.json({ error: '학교를 다시 골라주세요.' }, { status: 400 })
    }

    const fetched = await fetchSchool(shl, level, region)
    if (!prev) {
      const { data } = await db.from('school_profiles').select('*').eq('school_name', fetched.school_name).maybeSingle()
      prev = data
    }
    const row = { ...mergeProfile(prev, fetched), updated_at: new Date().toISOString() }
    delete (row as any).id

    const { data, error } = await db.from('school_profiles')
      .upsert(row, { onConflict: 'school_name' }).select('school_name').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, school_name: data.school_name, created: !prev })
  } catch (e: any) {
    if (isNoKey(e)) return NextResponse.json({ error: '학교알리미 인증키가 서버에 아직 없어요. 원장님께 말씀해주세요.' }, { status: 503 })
    return NextResponse.json({ error: e?.message ?? '학교알리미에서 받지 못했어요.' }, { status: 502 })
  }
}
