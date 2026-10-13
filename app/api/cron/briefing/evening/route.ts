// 저녁 8시(11:00 UTC) — 그날 수업 중 **작성이 끝난 것**을 보낸다.
//
// ★ 쿼리 없는 주소다. 예약 경로에 `?phase=1` 을 붙여 뒀더니 10월 13일 저녁 발송이
//   통째로 안 나갔다(CRON_SECRET 은 들어 있었다). 쿼리를 떼어 의심 하나를 지운다.
import { NextRequest } from 'next/server'
import { runBriefingCron } from '@/lib/cronBriefing'

export const maxDuration = 300

export async function GET(req: NextRequest) {
  return runBriefingCron(req, 1)
}
