// 새로 오신 선생님께만 **일주일 동안** 연습 안내를 띄운다.
//
// 왜 (원장님 2026-11-04)
//   「새로온 학생 이순서대로 해주세요가 왜 나한테도 뜨냐. 최대호 선생님한테만 보이면
//   되는데. 새로온 강사분에게 일주일만 뜨게 해줘」
//
//   처음에는 「새 학생이 있으면 누구에게나」로 만들었는데, 그러면 원장님과 기존 선생님께도
//   날마다 뜬다. 이 안내의 쓰임은 **새 학생**이 아니라 **새 선생님**이다.
//
// ★ 계정 만든 날로는 못 가린다 — 계정은 미리 만들어 두신다(최대호 선생님 계정은
//   2026-10-13 에 만들어졌는데 오시는 건 그 뒤다). 그래서 **보일 마지막 날**을 따로 적는다.
// ★ 칸을 새로 만들지 않고 app_settings 에 둔다. 원장님이 직접 고치실 수 있고,
//   DB 모양을 바꾸지 않아도 된다.
//
//   app_settings.key = 'teacher_onboarding'
//   value            = { "선생님이름": "2026-11-11" }   ← 그날까지 보인다

export const ONBOARDING_KEY = 'teacher_onboarding'

/** 며칠 동안 보여 줄까 — 원장님 「일주일만」 */
export const ONBOARDING_DAYS = 7

/**
 * 이 사람에게 연습 안내를 띄울까.
 *
 * ★ **선생님에게만** 띄운다. 원장님·행정 선생님께는 안 띄운다 — 날마다 보실 이유가 없다.
 * ★ 적힌 날짜가 **지나면 저절로** 사라진다. 지우는 일을 사람이 기억하지 않아도 된다.
 */
export function showOnboarding(
  value: any,
  user: { name?: string | null; role?: string | null } | null | undefined,
  today: string,
): boolean {
  if (!user || user.role !== 'teacher') return false
  const until = (value ?? {})[String(user.name ?? '').trim()]
  if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return false
  return today <= until
}

/** 오늘부터 며칠 동안 보이게 — 설정에 넣을 값을 만든다 */
export function addOnboarding(value: any, name: string, today: string, days = ONBOARDING_DAYS): Record<string, string> {
  // ★ 날짜만 더한다 — `+09:00` 으로 읽어서 더하면 UTC 로 돌려줄 때 하루가 밀린다
  //   (11-04 + 7 이 11-10 으로 나왔다. 검사가 잡았다).
  const 끝날 = new Date(Date.parse(`${today}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10)
  return { ...(value ?? {}), [String(name ?? '').trim()]: 끝날 }
}

/** 지난 사람은 지운 값 — 설정이 끝없이 길어지지 않게 */
export function pruneOnboarding(value: any, today: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries((value ?? {}) as Record<string, any>)) {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && today <= v) out[k] = v
  }
  return out
}
