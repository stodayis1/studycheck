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

    const body = await req.json()
    const { role, studentId, userId, endpoint, keys, userAgent } = body as {
      role: string
      studentId?: string
      userId?: string
      endpoint: string
      keys: { p256dh: string; auth: string }
      userAgent?: string
    }
    if (!role || !endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json({ error: '필수 값이 없어요.' }, { status: 400 })
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        role,
        student_id: studentId ?? null,
        user_id: userId ?? null,
        endpoint,
        p256dh: keys.p256dh,
        auth_key: keys.auth,
        user_agent: userAgent ?? null,
        last_used_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '구독 저장에 실패했어요.' }, { status: 500 })
  }
}
