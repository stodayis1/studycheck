/**
 * 2028 권장 이수과목 찾기 — 선생님 화면(③ 학생별 기록)이 쓴다.
 *
 * 자료가 1,300줄이라 **브라우저로 내려보내지 않는다.** 서버에서 골라 맞는 것만 준다.
 * 학생 개인정보는 오가지 않는다 — 계열·학과 이름과 검색어만 받는다.
 */
import { NextResponse } from 'next/server'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { findGuides } from '@/lib/subjectGuide'

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const u = new URL(req.url)
  const fields = (u.searchParams.get('fields') ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const major = u.searchParams.get('major') ?? ''
  const q = u.searchParams.get('q') ?? ''
  const limitRaw = Number(u.searchParams.get('limit') ?? 80)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 80

  const found = findGuides({ fields, major, q, limit })
  return NextResponse.json(found)
}
