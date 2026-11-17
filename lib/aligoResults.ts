// 알리고에 **실제 전송 결과**를 물어본다 — 자동 점검이 쓴다.
//
// 왜 필요한가 (2026-11-03)
//   우리 기록(briefing_sends.status='sent')은 **알리고가 접수했다**는 뜻일 뿐이다.
//   카카오가 그 뒤에 거절하면 우리 쪽에는 아무 표시도 안 남는다.
//   그래서 10-20 ~ 10-31 알림톡 **1,074건이 거절된 것을 열하루 동안 아무도 몰랐다**
//   (사유: 「메시지가 템플릿과 일치하지않음」 — 등록된 버튼 이름과 한 글자가 달랐다).
//
//   ★ 원장님 2026-11-03: 문자로 대신 보내는 것은 **쓰지 않기로** 하셨다.
//     그러면 거절을 **빨리 아는 것**이 유일한 방어다. 그래서 매일 물어본다.
//
// 어디를 보나
//   /akv10/history/list/   — 보낸 묶음 목록 (mid)
//   /akv10/history/detail/ — 그 묶음의 **수신자별 결과** (rslt · rslt_message · tpl_code)
//   우리는 한 사람씩 보내므로 묶음 하나가 곧 한 통이다.

import type { CronProblem } from './cronHealth'

/** 알리고를 부르는 함수. 시험에서는 가짜를 넣는다(그래서 그물에 안 걸리고 시험할 수 있다). */
export type AligoCaller = (path: string, params: Record<string, string>) => Promise<any>

export interface AligoRow { phone: string; rslt: string; msg: string; tpl: string; when: string }
export interface AligoSummary {
  전체: number
  성공: number
  실패: number
  /** 사유 → 건수 */
  사유별: Record<string, number>
  /** 날짜(YYYY-MM-DD) → 실패 건수 */
  실패날짜별: Record<string, number>
  /**
   * 사유 → 거절된 **번호**들.
   *
   * 왜 (원장님 2026-11-17 「1번 고쳐줘」)
   *   2026-11-17 밤 9시 30분 점검이 「1건 — 스팸」만 알려 왔다. 건수만으로는
   *   **누구에게 안 갔는지 알 수 없어** 다시 보내 드릴 수도, 번호를 고쳐 드릴 수도 없다.
   *   번호를 들고 있다가 이름을 붙여 알린다.
   */
  실패번호별: Record<string, string[]>
}

/** 번호를 가린다 — 이름을 못 찾았을 때만 쓴다. */
export function maskPhone(phone: string): string {
  const d = String(phone ?? '').replace(/[^0-9]/g, '')
  return d.length >= 7 ? `${d.slice(0, 3)}****${d.slice(-4)}` : (d || '번호 모름')
}

/** 번호 비교용 — 숫자만 남긴다(「010-1234-5678」과 「01012345678」이 같게). */
export const phoneKey = (phone: string) => String(phone ?? '').replace(/[^0-9]/g, '')

/**
 * 거절된 사람을 글로. 이름을 못 찾으면 번호를 가려서 적는다.
 * 문자 한 통에 들어가야 하므로 기본 세 명까지만 적고 나머지는 「외 N명」.
 */
export function whoText(
  phones: string[], nameOf?: (phone: string) => string | null | undefined, max = 3,
): string {
  const 이름 = phones.map((p) => nameOf?.(p) || maskPhone(p))
  const 앞 = 이름.slice(0, max).join(', ')
  return 이름.length > max ? `${앞} 외 ${이름.length - max}명` : 앞
}

/**
 * 알림 한 줄. 감시(문자)와 대시보드 띠가 **같은 글**을 쓰게 여기 한 곳에 둔다.
 * 대시보드는 cron_runs 에 적힌 값으로 이 함수를 다시 불러 같은 줄을 만든다.
 */
export function aligoDetail(사유: string, 건수: number, 누구?: string | null): string {
  const 뒤 = 누구 ? ` · ${누구}` : ''
  return `${건수}건 — ${사유}${뒤} (우리 기록에는 「나감」으로 남습니다)`
}

/** 묶음 목록 → 수신자별 결과. 여덟 개씩 나눠 부른다(60초 한도 안에 끝나야 한다). */
export async function fetchAligoRows(
  call: AligoCaller, from: string, to: string, maxMids = 400,
): Promise<AligoRow[]> {
  const ymd = (s: string) => s.replace(/-/g, '')
  const mids: string[] = []
  for (let page = 1; page <= 5 && mids.length < maxMids; page++) {
    const r = await call('/akv10/history/list/', {
      page: String(page), limit: '500', startdate: ymd(from), enddate: ymd(to),
    })
    const list: any[] = r?.list ?? []
    for (const x of list) mids.push(String(x.mid))
    if (list.length < 500) break
  }
  const rows: AligoRow[] = []
  const 볼것 = mids.slice(0, maxMids)
  for (let i = 0; i < 볼것.length; i += 8) {
    const part = await Promise.all(볼것.slice(i, i + 8).map(async (mid) => {
      try { return (await call('/akv10/history/detail/', { mid }))?.list ?? [] } catch { return [] }
    }))
    for (const r of part.flat() as any[]) {
      rows.push({
        phone: String(r.phone ?? ''), rslt: String(r.rslt ?? ''), msg: String(r.rslt_message ?? ''),
        tpl: String(r.tpl_code ?? ''), when: String(r.sentdate ?? r.reqdate ?? ''),
      })
    }
  }
  return rows
}

/** 성공·실패를 센다. rslt 가 '0' 이면 성공이다. */
export function summarize(rows: AligoRow[]): AligoSummary {
  const out: AligoSummary = { 전체: rows.length, 성공: 0, 실패: 0, 사유별: {}, 실패날짜별: {}, 실패번호별: {} }
  for (const r of rows) {
    if (r.rslt === '0') { out.성공++; continue }
    out.실패++
    const 사유 = r.msg || '(사유 없음)'
    out.사유별[사유] = (out.사유별[사유] ?? 0) + 1
    // ★ 번호는 **사유마다 20개까지만** 들고 있는다. 2026-10-20 처럼 1,074건이 거절되면
    //   cron_runs 한 줄이 터무니없이 커진다. 건수는 위에서 다 센다.
    const 번호 = (out.실패번호별[사유] ??= [])
    if (번호.length < 20) 번호.push(r.phone)
    const d = r.when.slice(0, 10)
    if (d) out.실패날짜별[d] = (out.실패날짜별[d] ?? 0) + 1
  }
  return out
}

/**
 * 알릴 만한 문제인가. 실패가 하나라도 있으면 알린다 — **한 건이 보통 전조다**
 * (2026-10-20 에도 처음엔 몇 건이었고, 그대로 두니 열하루 동안 1,074건이 됐다).
 *
 * key 는 「사유 + 날짜」로 만든다. 같은 사유를 날마다 한 번만 알린다.
 */
export function aligoProblems(
  s: AligoSummary, date: string, nameOf?: (phone: string) => string | null | undefined,
): CronProblem[] {
  if (!s.실패) return []
  return Object.entries(s.사유별)
    .sort((a, b) => b[1] - a[1])
    .map(([사유, 건수]): CronProblem => ({
      key: `aligo|${date}|${사유}`,
      phase: 'aligo',
      label: '알림톡 거절',
      date,
      kind: '오류',
      detail: aligoDetail(사유, 건수, whoText(s.실패번호별[사유] ?? [], nameOf)),
    }))
}

/**
 * cron_runs 에 적어 둘 꼴. 대시보드가 이것만 보고 같은 줄을 다시 만든다.
 * ★ **번호는 안 적는다** — 이름을 못 찾은 것만 가린 번호로 남는다.
 */
export function aligoRecord(
  s: AligoSummary, nameOf?: (phone: string) => string | null | undefined,
): { 본것: number; 성공: number; 실패: number; 사유: Record<string, number>; 누구: Record<string, string> } {
  const 누구: Record<string, string> = {}
  for (const [사유, phones] of Object.entries(s.실패번호별)) 누구[사유] = whoText(phones, nameOf)
  return { 본것: s.전체, 성공: s.성공, 실패: s.실패, 사유: s.사유별, 누구 }
}

/** cron_runs 에 적힌 값 → 알림 줄. 감시가 보낸 문자와 **글자까지 같아야** 한다. */
export function aligoProblemsFromRecord(rec: any, date: string): CronProblem[] {
  const 사유별 = rec?.사유
  if (!사유별 || typeof 사유별 !== 'object') return []
  return Object.entries(사유별 as Record<string, number>)
    .filter(([, n]) => Number(n) > 0)
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .map(([사유, 건수]): CronProblem => ({
      key: `aligo|${date}|${사유}`,
      phase: 'aligo',
      label: '알림톡 거절',
      date,
      kind: '오류',
      detail: aligoDetail(사유, Number(건수), rec?.누구?.[사유]),
    }))
}
