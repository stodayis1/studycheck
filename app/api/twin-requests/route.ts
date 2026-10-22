// 쌍둥이 만들기 요청 (원장 전용)
//  GET                         -> 상태별 요청 수 { 대기, 확인대기, 반영완료, 실패 }
//  POST { typeCodes | problemIds } -> 그 문항들을 요청 줄에 올린다
// 실제로 만드는 건 Claude — 원장님이 「요청 처리해줘」라고 하면 scripts/twin-gen 으로 처리한다.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { requestTwins, TWIN_BOOK } from '@/lib/twinRequests'

export const dynamic = 'force-dynamic'

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

export async function GET(req: Request) {
  const me = await staffOrDeny(req, { adminOnly: true })
  if (me.deny) return me.deny
  const supabase = db()
  const counts: Record<string, number> = { 대기: 0, 확인대기: 0, 반영완료: 0, 실패: 0 }
  await Promise.all(Object.keys(counts).map(async (s) => {
    const { count } = await supabase.from('twin_requests').select('id', { count: 'exact', head: true }).eq('status', s)
    counts[s] = count ?? 0
  }))
  return NextResponse.json({ counts })
}

export async function POST(req: Request) {
  const me = await staffOrDeny(req, { adminOnly: true })
  if (me.deny) return me.deny
  const supabase = db()
  const body = (await req.json().catch(() => ({}))) as { typeCodes?: string[]; problemIds?: number[] }

  let ids = (body.problemIds ?? []).map(Number).filter(Boolean)
  const codes = (body.typeCodes ?? []).filter(Boolean)
  if (codes.length) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from('problems').select('id')
        .in('type_code', codes).neq('book', TWIN_BOOK).order('id').range(from, from + 999)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      ids.push(...(data ?? []).map((p: any) => p.id))
      if (!data || data.length < 1000) break
    }
  }
  if (!ids.length) return NextResponse.json({ error: '요청할 문항이 없습니다.' }, { status: 400 })

  try {
    const r = await requestTwins(supabase, ids, { source: 'manual', by: me.name })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? '요청을 남기지 못했습니다.' }, { status: 500 })
  }
}
