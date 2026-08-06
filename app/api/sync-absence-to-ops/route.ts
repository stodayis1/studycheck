import { NextRequest, NextResponse } from 'next/server'

// 학습일지에서 결석이 저장되면 이 라우트를 거쳐 OPS(학원 행정 프로그램)로 전달한다.
// 공유 비밀키(OPS_SYNC_SECRET)는 서버에서만 다뤄야 하므로, 브라우저가 직접 OPS를 호출하지 않고
// 반드시 이 서버 라우트를 한 번 거치도록 함(비밀키가 클라이언트 번들에 노출되지 않게).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })

  const secret = process.env.OPS_SYNC_SECRET
  if (!secret) {
    console.error('OPS_SYNC_SECRET 환경변수가 설정되지 않았습니다')
    return NextResponse.json({ ok: false, error: 'not configured' }, { status: 500 })
  }

  const opsUrl = process.env.OPS_SYNC_URL || 'https://sumath-admin.vercel.app/api/absences/sync-from-studycheck'

  try {
    const res = await fetch(opsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sync-secret': secret },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) console.error('OPS 결석 동기화 실패:', res.status, data)
    return NextResponse.json({ ok: res.ok, opsResponse: data })
  } catch (e: any) {
    console.error('OPS 결석 동기화 요청 중 오류:', e)
    return NextResponse.json({ ok: false, error: e.message }, { status: 502 })
  }
}
