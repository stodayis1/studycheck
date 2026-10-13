// 다음 날 오전 11시(02:00 UTC) — 전날 수업 중 **그때 못 보낸 나머지**를 보낸다.
//
// ★ 쿼리 없는 주소다. 이유는 evening/route.ts 에 적어 뒀다.
import { NextRequest } from 'next/server'
import { runBriefingCron } from '@/lib/cronBriefing'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  return runBriefingCron(req, 2)
}
