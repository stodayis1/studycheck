'use client'

// 브라우저 푸시 알림 구독/해제를 처리하는 클라이언트 헬퍼.
// 실제 발송은 서버(app/api/push/send)에서 lib/sendPush.ts를 통해 이루어진다.

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function isPushSupported() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export type PushState = 'unsupported' | 'default' | 'denied' | 'subscribed'

export async function getPushSubscriptionState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) return 'subscribed'
  } catch {}
  return 'default'
}

export async function subscribeToPush(opts: {
  role: 'teacher' | 'staff' | 'admin' | 'student' | 'parent'
  studentId?: string
  userId?: string
}): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) {
    return { ok: false, error: '이 기기/브라우저는 푸시 알림을 지원하지 않아요. (아이폰은 홈 화면에 추가한 뒤에만 가능해요)' }
  }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, error: '알림 권한이 거부되었어요.' }

    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!publicKey) return { ok: false, error: '서버에 푸시 설정이 아직 안 되어 있어요.' }

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }

    const json = sub.toJSON()
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: opts.role,
        studentId: opts.studentId,
        userId: opts.userId,
        endpoint: json.endpoint,
        keys: json.keys,
        userAgent: navigator.userAgent,
      }),
    })
    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: '알 수 없는 오류' }))
      return { ok: false, error: errData.error }
    }
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? '알림 구독에 실패했어요.' }
  }
}

export async function unsubscribeFromPush(): Promise<{ ok: boolean; error?: string }> {
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return { ok: true }
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    })
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? '구독 해제에 실패했어요.' }
  }
}
