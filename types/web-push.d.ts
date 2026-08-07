// web-push 패키지가 자체 타입 선언을 제공하지 않아서(=@types/web-push 미설치),
// 우리가 실제로 쓰는 함수 2개만 최소한으로 타입을 선언해준다.
declare module 'web-push' {
  interface PushSubscriptionKeys {
    p256dh: string
    auth: string
  }

  interface PushSubscription {
    endpoint: string
    keys: PushSubscriptionKeys
  }

  interface SendResult {
    statusCode: number
    body: string
    headers: Record<string, string>
  }

  interface RequestOptions {
    TTL?: number
    headers?: Record<string, string>
    contentEncoding?: string
    vapidDetails?: { subject: string; publicKey: string; privateKey: string }
  }

  export function setVapidDetails(subject: string, publicKey: string, privateKey: string): void
  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions
  ): Promise<SendResult>

  const webpush: {
    setVapidDetails: typeof setVapidDetails
    sendNotification: typeof sendNotification
  }
  export default webpush
}
