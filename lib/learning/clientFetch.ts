/**
 * 학습 화면이 서버를 부를 때 쓰는 `fetch` — **로그인 토큰을 붙인다** (045 이어서)
 *
 * 왜 `apiFetch` 를 그대로 쓰지 않나
 *   `lib/apiFetch.ts` 는 `lib/supabase.ts` 를 **모듈 최상단에서** 가져온다. 그 파일은
 *   `createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, …)` 를 바로 부르므로,
 *   설정이 없는 환경에서는 **화면이 뜨기도 전에 던진다** (`supabaseUrl is required`).
 *   로컬 체험판(`npm run dev:learning-demo`)에는 그 설정이 없다 — 일부러 없다.
 *   그래서 학생 화면이 하얗게 비어 버린다.
 *
 *   하는 일은 `apiFetch` 와 **같다**: 있으면 `Authorization: Bearer <토큰>` 을 붙인다.
 *   다른 점은 **설정이 없을 때 조용히 넘어가는 것**뿐이고, 그때는 토큰이 없으니
 *   시험 쿠키 경로로 간다. 운영에서는 설정이 있으므로 토큰이 붙는다.
 *
 * 왜 토큰을 붙여야 하나
 *   운영 학생 인증은 **Bearer 토큰 → auth uid → `students.session_uid`** 다
 *   (AGENTS.md 「로그인·권한 구조」). 머리글이 없으면 운영에서 401 이다.
 *   2026-09-22 에 호출부 11곳을 `apiFetch` 로 바꾼 것과 같은 이유다.
 *
 * 붙이지 않는 것
 *   학생 id 를 본문에 담지 않는다. 서버가 **토큰 주인으로** 학생을 정한다.
 */

/** 지금 로그인의 Bearer 머리글. 설정·세션이 없으면 **빈 객체** */
export async function learningAuthHeaders(): Promise<Record<string, string>> {
  try {
    // **동적 import** 라서 설정이 없어 던져도 여기서 잡힌다.
    // 최상단에서 가져오면 화면이 뜨기 전에 깨진다
    const { supabase } = await import('@/lib/supabase')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch {
    // 로컬 체험판에는 Supabase 설정이 없다. 토큰 없이 간다 — 쿠키 경로로 붙는다
    return {}
  }
}

/** `fetch` 자리에 그대로 바꿔 쓴다 */
export async function learningFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers ?? {})
  for (const [k, v] of Object.entries(await learningAuthHeaders())) headers.set(k, v)
  return fetch(input, { ...init, headers })
}
