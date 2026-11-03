/**
 * 운영 조회·쓰기용 Supabase client 를 **한 곳에서** 만든다 — GPT-EXEC-045 §3
 *
 * 왜 한 곳인가
 *   043·044 에서는 `supabaseAuth` · `supabaseContent` · `supabaseStore` 가 각자
 *   `createClient` 를 불렀다. 그러면 ① 설정 누락 처리가 세 벌이 되고
 *   ② **실제 어댑터를 합성 응답으로 끝까지 돌려 볼 자리가 없다.**
 *   045 §6-2 가 요구하는 「어댑터가 실제 경로에 연결되어 있음을 호출 추적/시험으로
 *   확인」을 하려면, 어댑터는 그대로 두고 **SDK 만** 갈아 끼울 수 있어야 한다.
 *
 * 열쇠
 *   `SUPABASE_SERVICE_ROLE_KEY` 는 **이 파일 밖으로 나가지 않는다.** 값을 로그·오류
 *   문구·검수 묶음에 적지 않는다. 설정이 없으면 `NotConfiguredError` 로 멈추고
 *   **시연 자료로 넘어가지 않는다** (043 §3-A).
 *
 * 시험 대역 (`__setLearningClientFactoryForTest`)
 *   합성 SDK 를 끼워 실제 어댑터·실제 route 를 끝에서 끝까지 돌리는 **시험 전용**
 *   구멍이다. 그래서 두 가지를 못 박는다.
 *     · `NODE_ENV === 'production'` 이면 **던진다.** 운영 빌드에 뒷문이 되지 않게.
 *     · 끼운 사실을 `learningClientIsDouble()` 로 **드러낸다.** 보고에서
 *       「합성으로 돌렸다」와 「운영에 붙었다」를 섞지 않으려고.
 *   R041-04 에서 시험 장치가 운영에서 통한 일이 있었다. 같은 실수를 반복하지 않는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { NotConfiguredError } from './providers'

export type LearningClientFactory = (what: string) => SupabaseClient

let override: LearningClientFactory | null = null

/**
 * 합성 SDK 를 끼운다. **시험에서만.** 운영 빌드에서는 던진다.
 * `null` 을 주면 원래대로 돌린다.
 */
export function __setLearningClientFactoryForTest(f: LearningClientFactory | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('운영 빌드에서는 학습 SDK 대역을 끼울 수 없습니다 (R041-04)')
  }
  override = f
}

/** 지금 SDK 가 **대역**인가. 보고에 그대로 적는다 — 운영 접속과 섞지 않는다 */
export function learningClientIsDouble(): boolean {
  return override !== null
}

/**
 * 서비스 역할 client.
 *
 * `what` 은 설정이 없을 때 **무엇을 하려다 멈췄는지** 적는 말이다.
 * 열쇠 값은 넣지 않는다.
 */
export function learningClient(what: string): SupabaseClient {
  if (override !== null) return override(what)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new NotConfiguredError(what)
  return createClient(url, key, { auth: { persistSession: false } })
}

/** 운영 설정이 **있는가**. 열쇠 값을 돌려주지 않는다 — 있고 없음만 */
export function learningClientConfigured(): boolean {
  if (override !== null) return true
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
