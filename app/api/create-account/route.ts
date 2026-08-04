import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 계정을 서버에서 생성하는 API. 브라우저에서 supabase.auth.signUp()으로 직접 계정을 만들면
// (1) 관리자 세션이 방금 만든 새 계정 세션으로 바뀌어버리고 (2) 그 상태에서 profiles(users) 테이블에
// 쓰려고 하면 RLS 때문에 조용히 실패하는 문제가 있었다. 그래서 delete-account와 동일하게
// 서비스 롤 키를 쓰는 서버 라우트에서 처리해서 관리자 세션에 영향 없이 안전하게 계정을 만든다.
export async function POST(req: NextRequest) {
  try {
    const { name, email, password, role } = await req.json()
    if (!name || !email || !password || !role) {
      return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
    }
    if (!['teacher', 'staff'].includes(role)) {
      return NextResponse.json({ error: '역할 값이 올바르지 않아요.' }, { status: 400 })
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

    // 요청 보낸 사람이 실제로 관리자인지 확인
    const { data: authResult, error: authErr } = await adminClient.auth.getUser(token)
    if (authErr || !authResult?.user) {
      return NextResponse.json({ error: '인증에 실패했어요. 다시 로그인 후 시도해주세요.' }, { status: 401 })
    }
    const { data: callerProfile } = await adminClient.from('users').select('role').eq('id', authResult.user.id).single()
    if (callerProfile?.role !== 'admin') {
      return NextResponse.json({ error: '계정 추가는 원장님만 하실 수 있어요.' }, { status: 403 })
    }

    // 서비스 롤 키로 진짜 관리자 API를 써서 계정 생성 (이메일 인증 없이 바로 사용 가능)
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (createErr || !created?.user) {
      return NextResponse.json({ error: '계정 생성 실패: ' + (createErr?.message ?? '알 수 없는 오류') }, { status: 500 })
    }

    const { error: profileErr } = await adminClient.from('users').upsert({
      id: created.user.id,
      name,
      email,
      role,
    })
    if (profileErr) {
      // 프로필 저장에 실패하면 방금 만든 auth 계정도 롤백(삭제)해서 고아 계정이 남지 않게 한다.
      await adminClient.auth.admin.deleteUser(created.user.id)
      return NextResponse.json({ error: '프로필 저장 실패: ' + profileErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('계정 생성 오류:', error)
    return NextResponse.json({ error: error.message ?? '생성 중 오류가 발생했어요.' }, { status: 500 })
  }
}
