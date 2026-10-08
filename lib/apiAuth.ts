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
  return (await staffOrDeny(req, opts)).deny
}

// denyIfNotStaff 와 같은 검사를 하고, 통과하면 그 직원이 누구인지도 같이 돌려준다.
// 「누가 했는지」가 필요한 API 는 이걸 쓴다 — 신원을 두 번 물으면 그만큼 느려진다.
//   const who = await staffOrDeny(req)
//   if (who.deny) return who.deny
//   who.name · who.role · who.supervisorGrades
export type StaffCheck = { deny: NextResponse | null; id: string; name: string; role: string; supervisorGrades: string[] }
export async function staffOrDeny(req: Request, opts: { adminOnly?: boolean } = {}): Promise<StaffCheck> {
  const out = (deny: NextResponse | null, u: any = {}): StaffCheck =>
    ({ deny, id: u.id ?? '', name: u.name ?? '', role: u.role ?? '', supervisorGrades: u.supervisor_grades ?? [] })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    return out(NextResponse.json({ error: '서버 설정이 올바르지 않아요.' }, { status: 500 }))

  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  if (!token)
    return out(NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 }))

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: authResult, error } = await admin.auth.getUser(token)
  if (error || !authResult?.user)
    return out(NextResponse.json({ error: '인증에 실패했어요. 다시 로그인해주세요.' }, { status: 401 }))

  const { data: profile } = await admin.from('users').select('id, name, role, supervisor_grades, is_locked').eq('id', authResult.user.id).single()
  const role = profile?.role as string | undefined
  if (!role || !['admin', 'teacher', 'staff'].includes(role))
    return out(NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 }))
  // ★ 퇴사한 계정은 막는다. 2026-10-08 까지 users.is_locked 는 **아무 데서도 안 쓰이고 있어서**
  //   '잠근' 계정도 그대로 로그인되고 API 도 다 통했다. 실제 차단은 Auth 쪽(banned_until)에서
  //   하지만, 세션이 남아 있는 기기를 위해 여기서도 한 번 더 막는다.
  if ((profile as { is_locked?: boolean } | null)?.is_locked)
    return out(NextResponse.json({ error: '사용이 중지된 계정입니다.' }, { status: 403 }))
  if (opts.adminOnly && role !== 'admin')
    return out(NextResponse.json({ error: '원장님만 사용할 수 있습니다.' }, { status: 403 }))

  return out(null, profile)   // 통과
}
