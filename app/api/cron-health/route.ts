/**
 * 원장 대시보드 맨 위 「자동 발송 점검」 띠가 읽는 곳. 원장 전용.
 *
 * 12:30 · 21:30 감시(/api/cron/briefing/watch)와 **같은 점검**(lib/cronHealth)을 지금 시각으로 돌린다.
 * 감시 예약이 통째로 죽어 문자가 안 와도, 대시보드를 여는 순간 보이게 하려는 것이다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { checkCronRuns, loadRecentCronRuns } from '@/lib/cronHealth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
  try {
    const problems = checkCronRuns(await loadRecentCronRuns(db), Date.now())
    return NextResponse.json({ ok: true, problems })
  } catch (e: any) {
    // 점검을 못 한 것도 문제다 — 조용히 넘기지 않고 띠에 띄운다.
    return NextResponse.json({ ok: true, problems: [
      { key: 'check', phase: 'check', label: '점검', date: '', kind: '오류', detail: e?.message ?? '점검 실패' },
    ] })
  }
}
