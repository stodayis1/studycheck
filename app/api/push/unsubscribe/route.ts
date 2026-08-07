import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 설정이 없어요.' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { endpoint } = (await req.json()) as { endpoint?: string }
    if (!endpoint) return NextResponse.json({ error: 'endpoint가 없어요.' }, { status: 400 })

    const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '구독 해제에 실패했어요.' }, { status: 500 })
  }
}
