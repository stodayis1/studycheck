// 브라우저에서 서버 API를 부를 때 로그인 토큰을 자동으로 붙여주는 함수.
// 기존 fetch 자리에 그대로 바꿔 쓰면 된다.

import { supabase } from '@/lib/supabase'

export async function apiFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  const headers = new Headers(init.headers ?? {})
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
