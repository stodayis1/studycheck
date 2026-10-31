// 오전 10시 — 11시 발송 **전** 미작성 알림만. 학부모에게는 아무것도 안 간다.
// (2026-10-31 에 10시 30분에서 당겼다 — 원장님 「문자는 오전 10시에 보내자」.)
//
// ★ 쿼리 없는 주소다. 이유는 evening/route.ts 에 적어 뒀다.
import { NextRequest } from 'next/server'
import { runRemindCron } from '@/lib/cronBriefing'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  return runRemindCron(req)
}
