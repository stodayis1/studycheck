// 손으로 부를 때 쓰는 입구 — `?phase=1|2`, `?date=YYYY-MM-DD` 를 받는다.
// 예약(Vercel cron)은 이 주소를 쓰지 않는다. 쿼리 없는 evening/morning 을 쓴다.
// 내용은 lib/cronBriefing.ts 한 곳에 있다.
import { NextRequest } from 'next/server'
import { runBriefingCron } from '@/lib/cronBriefing'

// 111명 발송이 51초였다(2026-10-12 실측). 교정·알림까지 더해도 여유가 있어야 한다.
export const maxDuration = 300

export async function GET(req: NextRequest) {
  return runBriefingCron(req)
}
