import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 푸시 구독 저장.
// 여기는 학생·학부모도 부르는 라우트라서 직원 인증(denyIfNotStaff)을 쓸 수 없다. 대신
// '보낸 사람이 정말 그 학생 본인(또는 학부모)인지'를 확인한다 — 예전에는 확인이 없어서
// 아무나 남의 studentId로 구독을 등록하고 그 학생의 알림(이름·학습내용 포함)을 받아볼 수 있었다.
export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: '서버 설정이 없어요.' }, { status: 500 })
    }
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

    const body = await req.json()
    const { role, studentId, endpoint, keys, userAgent } = body as {
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

    // 로그인한 사람의 신원 확인 (학생·학부모는 익명 로그인, 선생님은 이메일 로그인)
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
    if (!token) return NextResponse.json({ error: '로그인이 필요해요.' }, { status: 401 })
    const { data: authResult, error: authErr } = await supabase.auth.getUser(token)
    const uid = authResult?.user?.id
    if (authErr || !uid) {
      return NextResponse.json({ error: '인증에 실패했어요. 다시 로그인해주세요.' }, { status: 401 })
    }

    // body로 넘어온 studentId / userId를 그대로 믿지 않고, 토큰 주인으로 다시 정한다.
    let ownedStudentId: string | null = null
    let ownedUserId: string | null = null

    if (role === 'student' || role === 'parent') {
      if (!studentId) return NextResponse.json({ error: 'studentId가 필요해요.' }, { status: 400 })
      const { data: student } = await supabase
        .from('students')
        .select('id')
        .eq('id', studentId)
        .eq('session_uid', uid)
        .maybeSingle()
      if (!student) return NextResponse.json({ error: '본인 계정의 알림만 설정할 수 있어요.' }, { status: 403 })
      ownedStudentId = student.id
    } else {
      const { data: profile } = await supabase.from('users').select('id, role').eq('id', uid).single()
      if (!profile || !['admin', 'teacher', 'staff'].includes(profile.role as string)) {
        return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
      }
      ownedUserId = profile.id
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        role,
        student_id: ownedStudentId,
        user_id: ownedUserId,
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
