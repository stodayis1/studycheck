'use client'

// 브라우저 푸시 알림 구독/해제를 처리하는 클라이언트 헬퍼.
// 실제 발송은 서버(app/api/push/send)에서 lib/sendPush.ts를 통해 이루어진다.

import { apiFetch } from '@/lib/apiFetch'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

// 이미 있는 구독이 지금 서버의 공개키로 만들어진 것인지 확인한다.
// 확인할 수 없으면(브라우저가 options를 안 주는 경우) 기존 구독을 그대로 두는 쪽을 택한다 —
// 멀쩡한 구독을 괜히 지우는 것보다 낫다.
function usesPublicKey(sub: PushSubscription, publicKey: string): boolean {
  const raw = sub.options?.applicationServerKey
  if (!raw) return true
  const bytes = new Uint8Array(raw)
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  const current = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return current === publicKey.replace(/=+$/, '')
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

    // 서버의 VAPID 공개키가 바뀌면 그 전에 만들어진 구독은 못 쓴다 — 발송이 조용히 실패한다.
    // 이때 그냥 두면 '알림 켜기'를 다시 눌러도 옛 구독을 그대로 재사용해서 계속 안 온다
    // (학부모가 '알림 끄기 → 켜기'를 손으로 해야 한다). 그래서 키가 다르면 자동으로 버리고 새로 만든다.
    if (sub && !usesPublicKey(sub, publicKey)) {
      try { await sub.unsubscribe() } catch {}
      sub = null
    }

    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      })
    }

    const json = sub.toJSON()
    const res = await apiFetch('/api/push/subscribe', {
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
