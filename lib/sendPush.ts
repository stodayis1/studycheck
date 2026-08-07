// 서버 전용 - 저장된 구독자들에게 실제로 푸시 알림을 보내는 헬퍼.
// API 라우트(app/api/push/send/route.ts)에서만 불러와 사용한다 (클라이언트에서 직접 import 금지).
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY

if (vapidPublic && vapidPrivate) {
  webpush.setVapidDetails('mailto:stodayis1@gmail.com', vapidPublic, vapidPrivate)
}

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) return null
  return createClient(supabaseUrl, serviceRoleKey)
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export interface PushTarget {
  broadcast?: boolean // 전체 구독자에게 (공지사항용)
  studentIds?: string[] // 특정 학생 관련 구독자(그 학생 본인 + 학부모)에게
}

export async function sendPush(target: PushTarget, payload: PushPayload): Promise<{ sent: number; failed: number; skipped?: string }> {
  if (!vapidPublic || !vapidPrivate) {
    return { sent: 0, failed: 0, skipped: 'VAPID 키가 서버에 설정되지 않았어요.' }
  }
  const supabase = getServiceClient()
  if (!supabase) return { sent: 0, failed: 0, skipped: '서버 설정(SUPABASE_SERVICE_ROLE_KEY)이 없어요.' }

  let subsQuery = supabase.from('push_subscriptions').select('*')
  if (!target.broadcast) {
    if (!target.studentIds || target.studentIds.length === 0) {
      return { sent: 0, failed: 0, skipped: '보낼 대상이 없어요.' }
    }
    subsQuery = subsQuery.in('student_id', target.studentIds)
  }

  const { data: subs, error } = await subsQuery
  if (error) return { sent: 0, failed: 0, skipped: error.message }
  if (!subs || subs.length === 0) return { sent: 0, failed: 0 }

  let sent = 0
  let failed = 0
  const expiredIds: string[] = []

  await Promise.all(
    subs.map(async (sub: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
          JSON.stringify(payload)
        )
        sent++
      } catch (err: any) {
        failed++
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          expiredIds.push(sub.id)
        }
      }
    })
  )

  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds)
  }

  return { sent, failed }
}
