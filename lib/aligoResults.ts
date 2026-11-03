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
  const out: AligoSummary = { 전체: rows.length, 성공: 0, 실패: 0, 사유별: {}, 실패날짜별: {} }
  for (const r of rows) {
    if (r.rslt === '0') { out.성공++; continue }
    out.실패++
    const 사유 = r.msg || '(사유 없음)'
    out.사유별[사유] = (out.사유별[사유] ?? 0) + 1
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
export function aligoProblems(s: AligoSummary, date: string): CronProblem[] {
  if (!s.실패) return []
  return Object.entries(s.사유별)
    .sort((a, b) => b[1] - a[1])
    .map(([사유, 건수]): CronProblem => ({
      key: `aligo|${date}|${사유}`,
      phase: 'aligo',
      label: '알림톡 거절',
      date,
      kind: '오류',
      detail: `${건수}건 — ${사유} (우리 기록에는 「나감」으로 남습니다)`,
    }))
}
