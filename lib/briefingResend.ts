// 브리핑 **다시 보내기 예약** — 다음 오전 11시 발송에 같이 내보낼 사람.
//
// 왜 필요한가 (원장님 2026-11-02 「이미나간 3명 기출유사 점수 추가해서 내일 오전 11시에
// 다시 보내줘」)
//   한 번 나간 학생은 briefing_sends 에 기록이 남아 자동 발송에서 빠진다(두 번 가지 않게).
//   그래서 「고쳐서 다시 보내기」를 하려면 사람이 그 시각에 화면 앞에 있어야 했다.
//   보낼 사람을 적어 두면 **다음 오전 발송이 같이 보내고 그 예약을 지운다.**
//
// ★ 기록을 지우지 않는다. briefing_sends 의 그 줄은 그대로 두고 resend_count 만 올라간다 —
//   「언제 처음 나갔고 몇 번 다시 보냈나」가 남아야 한다.
// ★ 한 번 쓰면 사라진다(보낸 뒤 그 날짜를 지운다). 남겨 두면 다음 날에도 또 나간다.

/** app_settings 의 열쇠말. 값은 { "2026-11-02": ["<학생id>", …] } 꼴 */
export const RESEND_KEY = 'briefing_resend_queue'

/** 그 날짜에 다시 보낼 학생. 값이 이상하면 빈 목록 — 자동 발송을 멈추지 않는다. */
export function pickResend(value: any, date: string): string[] {
  const list = (value ?? {})[date]
  if (!Array.isArray(list)) return []
  return [...new Set(list.map((x: any) => String(x ?? '').trim()).filter(Boolean))]
}

/** 보낸 뒤 그 날짜를 뺀 값. 다른 날짜 예약은 건드리지 않는다. */
export function dropDate(value: any, date: string): Record<string, string[]> {
  const out: Record<string, string[]> = {}
  for (const [k, v] of Object.entries((value ?? {}) as Record<string, any>)) {
    if (k === date || !Array.isArray(v)) continue
    out[k] = v
  }
  return out
}

/**
 * 예약된 **모든 날짜.** 오래된 것부터.
 *
 * ★ 오전 발송은 「어제」만 보낸다. 그런데 다시 보낼 것은 **더 옛날 수업**일 수 있다
 *   (원장님 2026-11-03 「지호는 29일꺼 보내고」 — 닷새 전 수업이다).
 *   그래서 예약은 날짜를 가리지 않고 **적힌 날짜를 전부** 처리한다.
 * ★ 한 번에 너무 많이 돌지 않게 열 날짜까지만 본다. 남은 것은 다음 날 나간다.
 */
export function allDates(value: any, max = 10): string[] {
  return Object.keys((value ?? {}) as Record<string, any>)
    .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && pickResend(value, k).length > 0)
    .sort()
    .slice(0, max)
}

/** 보낸 날짜들을 뺀 값. */
export function dropDates(value: any, dates: string[]): Record<string, string[]> {
  let out = (value ?? {}) as Record<string, string[]>
  for (const d of dates) out = dropDate(out, d)
  return out
}

/** 그 날짜에 사람을 더한 값. 이미 있으면 겹쳐 넣지 않는다. */
export function addResend(value: any, date: string, ids: string[]): Record<string, string[]> {
  const out = { ...(dropDate(value, date)) }
  const 이미 = pickResend(value, date)
  const 더할것 = ids.map((x) => String(x ?? '').trim()).filter(Boolean)
  const 합침 = [...new Set([...이미, ...더할것])]
  if (합침.length) out[date] = 합침
  return out
}
