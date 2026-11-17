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

/**
 * app_settings 의 열쇠말. 값은 날짜마다 둘 중 하나다.
 *   { "2026-11-02": ["<학생id>", …] }                         ← 예전 꼴, 그대로 읽힌다
 *   { "2026-11-17": { ids: ["<학생id>"], sms: "…" } }          ← 알림 문자를 같이 보낼 때
 *
 * ★ sms 가 있으면 **다시 보내기 전에 그 학부모님께 문자 한 통**이 먼저 간다
 *   (원장님 2026-11-17 「재발송되었다는 문자와 함께」).
 *   왜 알림톡이 아니라 문자인가 — 브리핑 알림톡은 **승인된 템플릿과 글자 단위로 같아야**
 *   나가서, 설명 한 줄을 끼워 넣을 자리가 없다. 「▶ 선생님 알림장」 칸에 넣는 방법도 있지만
 *   그 칸은 300자에서 잘리므로 **선생님이 쓰신 글 끝이 밀려 나간다.** 그래서 따로 보낸다.
 */
export const RESEND_KEY = 'briefing_resend_queue'

/** 그 날짜 칸을 ids·sms 로 푼다. 예전 꼴(배열)도 그대로 읽는다. */
function parseEntry(entry: any): { ids: string[]; sms: string | null } {
  const raw = Array.isArray(entry) ? entry : entry?.ids
  if (!Array.isArray(raw)) return { ids: [], sms: null }
  const ids = [...new Set(raw.map((x: any) => String(x ?? '').trim()).filter(Boolean))]
  const sms = Array.isArray(entry) ? null : String(entry?.sms ?? '').trim() || null
  return { ids, sms }
}

/** 그 날짜에 다시 보낼 학생. 값이 이상하면 빈 목록 — 자동 발송을 멈추지 않는다. */
export function pickResend(value: any, date: string): string[] {
  return parseEntry((value ?? {})[date]).ids
}

/** 그 날짜에 같이 보낼 알림 문자. 없으면 null — 문자 없이 브리핑만 다시 간다. */
export function pickResendSms(value: any, date: string): string | null {
  return parseEntry((value ?? {})[date]).sms
}

/** 보낸 뒤 그 날짜를 뺀 값. 다른 날짜 예약은 건드리지 않는다. */
export function dropDate(value: any, date: string): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries((value ?? {}) as Record<string, any>)) {
    // 예전 꼴(배열)과 새 꼴({ids, sms}) 둘 다 그대로 옮긴다.
    if (k === date || parseEntry(v).ids.length === 0) continue
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
export function dropDates(value: any, dates: string[]): Record<string, any> {
  let out = (value ?? {}) as Record<string, any>
  for (const d of dates) out = dropDate(out, d)
  return out
}

/**
 * 그 날짜에 사람을 더한 값. 이미 있으면 겹쳐 넣지 않는다.
 * sms 를 주면 그 날짜에 **알림 문자**가 붙는다(이미 있던 글은 덮어쓴다).
 * 안 주면 **있던 글을 그대로 둔다** — 사람만 더하다가 문자를 지우면 안 된다.
 */
export function addResend(value: any, date: string, ids: string[], sms?: string | null): Record<string, any> {
  const out: Record<string, any> = { ...(dropDate(value, date)) }
  const 이미 = pickResend(value, date)
  const 더할것 = ids.map((x) => String(x ?? '').trim()).filter(Boolean)
  const 합침 = [...new Set([...이미, ...더할것])]
  if (!합침.length) return out
  const 글 = sms === undefined ? pickResendSms(value, date) : (String(sms ?? '').trim() || null)
  out[date] = 글 ? { ids: 합침, sms: 글 } : 합침
  return out
}
