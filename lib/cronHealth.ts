// 자동 발송이 **조용히 멈췄는지** 보는 점검.
//
// 왜: 10월 13일 저녁 발송이 통째로 안 나갔는데 아무도 몰랐다. 일이 돌면 cron_runs 에 한 줄이
// 생기지만, **안 돈 날은 줄이 아예 없다** — 그래서 표를 들여다보지 않으면 멈춘 것이 안 보인다.
// pg_cron 의 「succeeded」는 요청을 보냈다는 뜻일 뿐이라 그것도 증거가 아니다.
//
// 여기서는 「그 시각이 지났는데 줄이 있나 · 늦지 않았나 · 끝났나 · 오류가 없나」만 본다.
// 평소엔 빈 배열이다. 감시(/api/cron/briefing/watch)와 원장 대시보드가 같은 함수를 쓴다.
//
// ★ 순수 함수다(DB·시계를 직접 안 만진다). 그래야 일부러 망가뜨린 가짜 기록으로 시험할 수 있다
//   (scripts/cron-health-check.ts).
import type { SupabaseClient } from '@supabase/supabase-js'

export interface CronRunRow {
  phase: string
  run_date: string          // 한국 날짜 'YYYY-MM-DD' — 그 일이 돈 날
  started_at: string | null
  finished_at: string | null
  result: any
}

export type CronProblemKind = '안 돎' | '늦음' | '멈춤' | '오류' | '잔액 부족'

export interface CronProblem {
  key: string               // phase|date|kind — 같은 문제를 문자로 두 번 보내지 않으려고 쓴다
  phase: string
  label: string
  date: string
  kind: CronProblemKind
  detail: string
}

/** from: 이 날짜부터 돌기 시작했다 — 그 전 날 기록이 없는 것은 「안 돎」이 아니다. */
interface Slot { phase: string; label: string; due: (date: string) => string; from?: string }

/** 토요일은 저녁 발송이 오후 6시다 (lib/cronBriefing.ts eveningNotBefore 와 같게). */
const isSaturday = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay() === 6

/** 매일 돌아야 하는 것과 그 시각(한국). 감시 자신도 넣는다 — 감시가 죽으면 대시보드에 뜬다. */
export const CRON_SLOTS: Slot[] = [
  { phase: 'premorning', label: '미작성 알림(10:30)', due: () => '10:30' },
  { phase: 'morning', label: '오전 발송(11:00)', due: () => '11:00' },
  { phase: 'watch-noon', label: '점검(12:30)', due: () => '12:30', from: '2026-10-27' },
  { phase: 'evening', label: '저녁 발송', due: (d) => (isSaturday(d) ? '18:00' : '20:00') },
  { phase: 'watch-night', label: '점검(21:30)', due: () => '21:30', from: '2026-10-27' },
]

/** 이만큼 지나도 줄이 없으면 「안 돎」. 예약은 10분마다 깨우니 한 시간이면 넉넉하다. */
const MISSING_AFTER_MIN = 60
/** 정해진 시각보다 이만큼 넘게 늦게 시작했으면 「늦음」 — pg_cron 이 죽고 Vercel 예비 예약이 대신 돈 것이다. */
const LATE_AFTER_MIN = 30
/** 시작하고 이만큼 지나도 끝난 시각이 없으면 「멈춤」. 함수 한도가 5분이다. */
const STUCK_AFTER_MIN = 15
/** 알리고 잔여 포인트가 이 아래면 알린다. 건당 6.5 원 · 하루 100건쯤이라 열흘치쯤이다. */
export const LOW_POINT = 7000

const KST = 9 * 3600_000
const kstDate = (ms: number) => new Date(ms + KST).toISOString().slice(0, 10)
/** 한국 날짜·시각 → UTC ms */
const kstToMs = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+09:00`)
const hhmmKst = (iso: string) => new Date(Date.parse(iso) + KST).toISOString().slice(11, 16)
const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`

/** 한 번 돈 기록 안의 오류를 찾는다. 「보낼 학생이 없음(0건)」·「건너뜀」은 오류가 아니다. */
export function runErrors(result: any): string[] {
  const out: string[] = []
  if (!result || typeof result !== 'object') return out
  const sectionNames: Record<string, string> = {
    polish: '교정', firstClass: '첫 수업일', opsExtra: 'OPS 추가수업', send: '발송', remind: '강사 문자', sample: '샘플',
    check: '점검', sms: '원장 문자',   // 감시(watch-*) 자신의 기록
  }
  for (const [k, name] of Object.entries(sectionNames)) {
    const err = result[k]?.error
    if (err) out.push(`${name}: ${err}`)
  }
  const send = result.send
  if (send && typeof send === 'object') {
    if (Number(send.failed) > 0) out.push(`발송 실패 ${send.failed}건`)
    if (Array.isArray(send.errors) && send.errors.length) {
      out.push(`발송 오류 ${send.errors.length}건${typeof send.errors[0] === 'string' ? ` (${send.errors[0]})` : ''}`)
    }
  }
  // 강사 문자: '이름(3건 · 연락처가 없어요)' 처럼 실패한 것만 ' · ' 뒤에 이유가 붙는다.
  const teachers = result.remind?.선생님
  if (Array.isArray(teachers)) {
    const bad = teachers.filter((t: any) => typeof t === 'string' && t.includes(' · '))
    if (bad.length) out.push(`강사 문자 실패: ${bad.join(', ')}`)
  }
  const picks = result.sample?.picks
  if (Array.isArray(picks)) {
    const bad = picks.filter((p: any) => p && p.ok === false)
    if (bad.length) out.push(`샘플 실패 ${bad.length}건`)
  }
  return out
}

/**
 * 어제·오늘(한국) 것 중 **시각이 지난 것**만 본다.
 * @param rows  cron_runs 의 최근 줄 (어제·오늘 run_date 를 포함해야 한다)
 * @param nowMs 지금 (시험할 때는 가짜 시각)
 */
export function checkCronRuns(rows: CronRunRow[], nowMs: number): CronProblem[] {
  const problems: CronProblem[] = []
  const today = kstDate(nowMs)
  const yesterday = kstDate(nowMs - 86400_000)
  const byKey = new Map(rows.map((r) => [`${r.phase}|${r.run_date}`, r]))
  const push = (s: Slot, date: string, kind: CronProblemKind, detail: string) =>
    problems.push({ key: `${s.phase}|${date}|${kind}`, phase: s.phase, label: s.label, date, kind, detail })

  for (const date of [yesterday, today]) {
    for (const s of CRON_SLOTS) {
      if (s.from && date < s.from) continue
      const due = s.due(date)
      const dueMs = kstToMs(date, due)
      if (nowMs < dueMs) continue                       // 아직 그 시각 전
      const row = byKey.get(`${s.phase}|${date}`)
      if (!row) {
        if (nowMs >= dueMs + MISSING_AFTER_MIN * 60_000) push(s, date, '안 돎', `${short(date)} ${due} 예정인데 기록이 없어요`)
        continue
      }
      if (row.started_at) {
        const startedMs = Date.parse(row.started_at)
        if (startedMs > dueMs + LATE_AFTER_MIN * 60_000) {
          push(s, date, '늦음', `${short(date)} ${due} 예정인데 ${hhmmKst(row.started_at)}에 돌았어요`)
        }
        if (!row.finished_at && nowMs > startedMs + STUCK_AFTER_MIN * 60_000) {
          push(s, date, '멈춤', `${short(date)} ${hhmmKst(row.started_at)}에 시작해서 끝난 기록이 없어요`)
        }
      }
      const errs = runErrors(row.result)
      if (errs.length) push(s, date, '오류', `${short(date)} ${errs.join(' / ')}`)
      const point = Number(row.result?.send?.pointLeft)
      if (Number.isFinite(point) && point < LOW_POINT) {
        push(s, date, '잔액 부족', `알리고 잔여 ${point.toLocaleString()}포인트 — 충전이 필요해요`)
      }
    }
  }
  // 잔액 부족은 가장 최근 것 하나만 남긴다(같은 이야기를 두세 번 할 필요가 없다).
  const low = problems.filter((p) => p.kind === '잔액 부족')
  return low.length > 1 ? problems.filter((p) => p.kind !== '잔액 부족' || p === low[low.length - 1]) : problems
}

/** 어제·오늘 줄을 읽는다. 하루에 다섯 줄이라 페이지를 넘길 일은 없다. */
export async function loadRecentCronRuns(db: SupabaseClient, nowMs = Date.now()): Promise<CronRunRow[]> {
  const { data, error } = await db.from('cron_runs')
    .select('phase, run_date, started_at, finished_at, result')
    .gte('run_date', kstDate(nowMs - 86400_000))
    .order('run_date', { ascending: true })
  if (error) throw new Error(`cron_runs 를 못 읽었어요: ${error.message}`)
  return (data ?? []) as CronRunRow[]
}
