// 학교 자료집 「학교 추가」 — 학교알리미에서 학교 찾기 (시도 → 시군구 → 학교).
//
// 학교알리미 화면이 쓰는 json 을 대신 불러 준다(브라우저에서 바로 부르면 다른 사이트라 막힌다).
// 직원만. 학교 목록에는 이미 자료집에 있는 학교인지도 같이 붙인다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { normalizeSchool } from '@/lib/school'
import { listSidos, listSigungus, listSchools, LEVEL_CODE, type Level } from '@/lib/schoolinfo'

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const p = new URL(req.url).searchParams
  const step = p.get('step')
  try {
    if (step === 'sido') return NextResponse.json({ items: await listSidos() })

    if (step === 'sigungu') {
      const sido = p.get('sido') ?? ''
      if (!/^\d{10}$/.test(sido)) return NextResponse.json({ error: '시도를 골라주세요.' }, { status: 400 })
      return NextResponse.json({ items: await listSigungus(sido) })
    }

    if (step === 'school') {
      const level = p.get('level') as Level
      const sido = p.get('sido') ?? '', sigungu = p.get('sigungu') ?? ''
      if (!(level in LEVEL_CODE) || !/^\d{10}$/.test(sido) || !/^\d{10}$/.test(sigungu))
        return NextResponse.json({ error: '학교급·시도·시군구를 골라주세요.' }, { status: 400 })

      const schools = await listSchools(level, sido, sigungu)
      const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } })
      const names = schools.map(s => normalizeSchool(s.name))
      const { data } = await db.from('school_profiles').select('school_name').in('school_name', names)
      const have = new Set((data ?? []).map(r => r.school_name))
      return NextResponse.json({
        items: schools.map(s => ({ ...s, school_name: normalizeSchool(s.name), exists: have.has(normalizeSchool(s.name)) })),
      })
    }

    return NextResponse.json({ error: 'step 은 sido · sigungu · school 중 하나예요.' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: `학교알리미에서 목록을 받지 못했어요. (${e?.message ?? e})` }, { status: 502 })
  }
}
