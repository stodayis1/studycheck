import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 계정을 Supabase Auth에서 완전히 삭제하는 API. 브라우저(anon key)에서는 관리자 API를 호출할 권한이
// 없어서(admin.deleteUser는 서비스 롤 키가 필요함) 서버 라우트에서 서비스 롤 키로 대신 처리한다.
// public.users 행은 auth.users를 ON DELETE CASCADE로 참조하고 있어서 여기서 따로 안 지워도 자동으로 같이 삭제됨.
export async function POST(req: NextRequest) {
  try {
    const { userId } = await req.json()
    if (!userId) {
      return NextResponse.json({ error: 'userId가 필요합니다.' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    if (!token) {
      return NextResponse.json({ error: '로그인 정보가 없어요. 다시 로그인 후 시도해주세요.' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({
        error: '서버에 SUPABASE_SERVICE_ROLE_KEY가 설정돼 있지 않아요. Vercel 환경변수에 등록한 뒤 다시 배포해주세요.',
      }, { status: 500 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    // 요청을 보낸 사람이 실제로 관리자인지 확인 (토큰으로 본인 확인 -> users 테이블에서 role 조회)
    const { data: authResult, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !authResult?.user) {
      return NextResponse.json({ error: '인증에 실패했어요. 다시 로그인 후 시도해주세요.' }, { status: 401 })
    }
    const { data: callerProfile } = await adminClient.from('users').select('role').eq('id', authResult.user.id).single()
    if (callerProfile?.role !== 'admin') {
      return NextResponse.json({ error: '계정 삭제는 원장님만 하실 수 있어요.' }, { status: 403 })
    }
    if (authResult.user.id === userId) {
      return NextResponse.json({ error: '본인 계정은 삭제할 수 없어요.' }, { status: 400 })
    }

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('계정 삭제 오류:', error)
    return NextResponse.json({ error: error.message ?? '삭제 중 오류가 발생했어요.' }, { status: 500 })
  }
}
