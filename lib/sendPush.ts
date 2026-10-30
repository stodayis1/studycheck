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
  userIds?: string[] // 직원(users.id) 단말에게 — 원장님께 보내는 업무 알림용
  // 「이 학교 이 학년 전부」 — **학생을 서버에서 찾는다.** 2026-10-29 부터 강사·주임 계정은
  // 본인 범위 학생만 읽히기 때문에(students 조회 정책), 브라우저에서 명단을 만들면
  // 나머지 학부모에게 알림이 **조용히 안 간다.** 학년은 '1' 처럼 숫자만 넘긴다.
  schoolGrades?: { school: string; grades: string[] }
}

export async function sendPush(targetIn: PushTarget, payload: PushPayload): Promise<{ sent: number; failed: number; skipped?: string }> {
  let target = targetIn
  if (!vapidPublic || !vapidPrivate) {
    return { sent: 0, failed: 0, skipped: 'VAPID 키가 서버에 설정되지 않았어요.' }
  }
  const supabase = getServiceClient()
  if (!supabase) return { sent: 0, failed: 0, skipped: '서버 설정(SUPABASE_SERVICE_ROLE_KEY)이 없어요.' }

  // 학교+학년으로 받은 대상은 여기서 학생 id 로 바꾼다 (service_role 이라 전체가 보인다)
  if (target.schoolGrades?.school && target.schoolGrades.grades?.length) {
    const { school, grades } = target.schoolGrades
    const { data: rows, error: findErr } = await supabase
      .from('students').select('id, grade').eq('school', school).eq('is_active', true)
    if (findErr) return { sent: 0, failed: 0, skipped: findErr.message }
    const want = new Set(grades.map((g) => String(g).replace(/[^0-9]/g, '')))
    const ids = (rows ?? [])
      .filter((s: { grade?: string | null }) => want.has(String(s.grade ?? '').replace(/[^0-9]/g, '')))
      .map((s: { id: string }) => s.id)
    target = { ...target, studentIds: [...(target.studentIds ?? []), ...ids] }
  }

  let subsQuery = supabase.from('push_subscriptions').select('*')
  if (!target.broadcast) {
    // 학생(+학부모) 단말과 직원 단말은 구독 행이 다른 칸으로 묶여 있다 — student_id / user_id.
    // 둘 다 비면 보낼 데가 없는 것이고, 둘 다 주면 지금은 쓰지 않으므로 받지 않는다.
    const hasStudents = (target.studentIds?.length ?? 0) > 0
    const hasUsers = (target.userIds?.length ?? 0) > 0
    if (!hasStudents && !hasUsers) {
      return { sent: 0, failed: 0, skipped: '보낼 대상이 없어요.' }
    }
    if (hasStudents && hasUsers) {
      return { sent: 0, failed: 0, skipped: '학생과 직원을 한 번에 보내진 않아요.' }
    }
    subsQuery = hasStudents
      ? subsQuery.in('student_id', target.studentIds!)
      : subsQuery.in('user_id', target.userIds!)
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
