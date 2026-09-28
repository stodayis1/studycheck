import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// 스터디체크가 멀쩡히 돌고 있는지 바깥(수학OPS의 매일 점검 크론)에서 물어보는 곳.
//
// 왜 만들었나: 2026-09-28에 두 가지가 한꺼번에 드러났다.
//   · 푸시 VAPID 키가 서버에 없어서 알림이 몇 달째 한 건도 안 나가고 있었다
//   · OPS가 쥐고 있던 스터디체크 키가 9/16에 만료돼 12일간 연동이 끊겨 있었다
// 둘 다 "실패해도 아무 데도 안 남아서" 늦게 발견됐다. 그래서 매일 한 번 찔러보게 한다.
//
// 값은 절대 돌려주지 않는다 — 설정이 '있는지/되는지'만 참·거짓으로 답한다.
// 아무나 열어보지 못하게 OPS와 나눠 갖고 있는 비밀키(OPS_SYNC_SECRET)를 헤더로 확인한다.

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.OPS_SYNC_SECRET
  if (!secret || req.headers.get('x-sync-secret') !== secret) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const checks: Record<string, boolean> = {}
  const problems: string[] = []

  // 1) 서버가 DB에 붙을 수 있나 (service_role 키가 살아있나)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    checks.db = false
    problems.push('스터디체크 서버에 DB 키가 설정돼 있지 않습니다')
  } else {
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { error } = await db.from('students').select('id').limit(1)
    checks.db = !error
    if (error) problems.push(`스터디체크 DB 연결 실패: ${error.message}`)
  }

  // 2) 푸시 알림을 보낼 수 있나 (VAPID 키 두 개가 다 있어야 한다)
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  checks.push = !!vapidPublic && !!vapidPrivate
  if (!checks.push) {
    problems.push('푸시 알림 키(VAPID)가 없어 앱 알림이 한 건도 나가지 않습니다')
  }

  // 3) OPS로 결석을 보낼 수 있나 (공유 비밀키가 있나)
  checks.opsSync = !!process.env.OPS_SYNC_SECRET
  if (!checks.opsSync) problems.push('OPS 연동 비밀키가 없어 결석이 OPS로 전달되지 않습니다')

  return NextResponse.json({ ok: problems.length === 0, checks, problems })
}
