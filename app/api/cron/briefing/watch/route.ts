// 12:30 · 21:30 — 자동 발송이 조용히 멈추지 않았나 점검. 문제가 있을 때만 원장님께 문자.
//
// ★ 쿼리 없는 주소다. 이유는 evening/route.ts 에 적어 뒀다.
import { NextRequest } from 'next/server'
import { runWatchCron } from '@/lib/cronBriefing'

export const maxDuration = 60

export async function GET(req: NextRequest) {
  return runWatchCron(req)
}
