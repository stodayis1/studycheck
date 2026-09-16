// 서버 API에서 '요청 보낸 사람이 우리 직원이 맞는지' 확인하는 공통 함수.
// 브라우저가 Authorization: Bearer <토큰> 을 같이 보내면 그 토큰으로 신원을 확인한다.
// 학생·학부모는 익명 로그인이라 users 테이블에 없으므로 자동으로 걸러진다.
//
// 쓰는 법:
//   const deny = await denyIfNotStaff(req)
//   if (deny) return deny

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function denyIfNotStaff(
  req: Request,
  opts: { adminOnly?: boolean } = {}
): Promise<NextResponse | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    return NextResponse.json({ error: '서버 설정이 올바르지 않아요.' }, { status: 500 })

  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token)
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: authResult, error } = await admin.auth.getUser(token)
  if (error || !authResult?.user)
    return NextResponse.json({ error: '인증에 실패했어요. 다시 로그인해주세요.' }, { status: 401 })

  const { data: profile } = await admin.from('users').select('role').eq('id', authResult.user.id).single()
  const role = profile?.role as string | undefined
  if (!role || !['admin', 'teacher', 'staff'].includes(role))
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  if (opts.adminOnly && role !== 'admin')
    return NextResponse.json({ error: '원장님만 사용할 수 있습니다.' }, { status: 403 })

  return null   // 통과
}
