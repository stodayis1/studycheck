/**
 * 자동 발송 점검(lib/cronHealth.ts)이 멈춤·늦음·오류를 **실제로 잡는지** 가짜 기록으로 시험한다.
 *
 * 왜 필요한가
 *   감시는 평소에 아무 말도 안 한다. 그래서 「조용하다」가 「정상이라서」인지 「점검이 고장 나서」인지
 *   겉으로는 구분이 안 된다. 일부러 망가뜨린 기록을 넣어 각각 잡히는지, 정상일 때는 조용한지 본다.
 *   운영 DB 는 건드리지 않는다(기록은 전부 이 파일 안에서 만든다).
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/cron-health-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/cron-health-check.ts <다른 cronHealth.ts 경로>
 *     ↑ 일부러 틀리게 고친 사본을 넣으면 **실패해야** 한다. 실패하지 않으면 그 부분은 시험이 없는 것이다.
 *
 * 마지막 줄 「통과 N / 전체 N」, 종료코드 0 이 통과.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/cronHealth.ts')
const { checkCronRuns, CRON_SLOTS } = await import(pathToFileURL(target).href)

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00+09:00`).toISOString()
const plus = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString()
const okResult = () => ({
  send: { sent: 40, failed: 0, errors: [] as string[], pointLeft: 45000 },
  polish: { checked: 10, 고침: 1 },
  opsExtra: { rows: [{ ok: false, skip: '이미 적혀 있어요' }], filled: 0 },   // 건너뜀은 오류가 아니다
  remind: { 보냄: 1, 선생님: ['주한(2건)'] },
  sample: { sent: 1, picks: [{ ok: true }] },
})
const DUE: Record<string, (d: string) => string> = {
  premorning: () => '10:00', morning: () => '11:00', 'watch-noon': () => '12:30',
  evening: (d) => (new Date(d + 'T00:00:00Z').getUTCDay() === 6 ? '18:00' : '20:00'), 'watch-night': () => '21:30',
}
/** 그 날짜들의 다섯 가지가 전부 제시간에 돌고 1분 만에 끝난 기록. nowIso 뒤의 것은 안 만든다. */
function healthy(dates: string[], nowIso: string) {
  const rows: any[] = []
  for (const d of dates) for (const [phase, due] of Object.entries(DUE)) {
    const started = plus(at(d, due(d)), 0.1)
    if (Date.parse(started) > Date.parse(nowIso)) continue
    rows.push({ phase, run_date: d, started_at: started, finished_at: plus(started, 1), result: okResult() })
  }
  return rows
}
const find = (rows: any[], phase: string, date: string) => rows.find((r) => r.phase === phase && r.run_date === date)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false
  try { ok = fn() } catch (e: any) { console.log(`  ! ${name}: ${e?.message}`) }
  if (ok) pass++
  console.log(`${ok ? '✓' : '✗'} ${name}`)
}
const kinds = (ps: any[]) => ps.map((p) => `${p.phase}:${p.kind}`).sort().join(',')

// 화요일 10/27 밤 21:45 (어제는 월요일 10/26)
const NOW = at('2026-10-27', '21:45')
const DAYS = ['2026-10-26', '2026-10-27']

T('정상 기록이면 아무것도 안 잡는다', () => checkCronRuns(healthy(DAYS, NOW), Date.parse(NOW)).length === 0)

T('저녁 발송 기록이 없으면 「안 돎」', () => {
  const rows = healthy(DAYS, NOW).filter((r) => !(r.phase === 'evening' && r.run_date === '2026-10-27'))
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'evening:안 돎'
})

T('시각이 지난 지 한 시간 전이면 아직 「안 돎」이 아니다', () => {
  const now = at('2026-10-27', '20:50')
  const rows = healthy(DAYS, now).filter((r) => !(r.phase === 'evening' && r.run_date === '2026-10-27'))
  return checkCronRuns(rows, Date.parse(now)).length === 0
})

T('어제 기록이 빠진 것도 잡는다', () => {
  const rows = healthy(DAYS, NOW).filter((r) => !(r.phase === 'premorning' && r.run_date === '2026-10-26'))
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'premorning:안 돎'
})

T('11:49 에 돈 오전 발송은 「늦음」', () => {
  const rows = healthy(DAYS, NOW)
  const r = find(rows, 'morning', '2026-10-27')
  r.started_at = at('2026-10-27', '11:49'); r.finished_at = plus(r.started_at, 1)
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'morning:늦음'
})

T('11:20 에 돈 것은 늦음이 아니다(30분 안)', () => {
  const rows = healthy(DAYS, NOW)
  const r = find(rows, 'morning', '2026-10-27')
  r.started_at = at('2026-10-27', '11:20'); r.finished_at = plus(r.started_at, 1)
  return checkCronRuns(rows, Date.parse(NOW)).length === 0
})

T('시작만 하고 끝난 기록이 없으면 「멈춤」', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'evening', '2026-10-27').finished_at = null
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'evening:멈춤'
})

T('발송 실패 2건은 「오류」', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'evening', '2026-10-27').result.send.failed = 2
  const ps = checkCronRuns(rows, Date.parse(NOW))
  return kinds(ps) === 'evening:오류' && ps[0].detail.includes('발송 실패 2건')
})

T('발송 단계 자체가 터지면 「오류」', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'morning', '2026-10-27').result.send = { error: 'fetch failed' }
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'morning:오류'
})

T('강사 문자 실패(연락처 없음)는 「오류」', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'premorning', '2026-10-27').result.remind.선생님 = ['주한(2건 · 연락처가 없어요)']
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'premorning:오류'
})

T('OPS 반영의 「건너뜀」·보낼 학생 0명은 오류가 아니다', () => {
  const rows = healthy(DAYS, NOW)
  const r = find(rows, 'morning', '2026-10-27')
  r.result.send.sent = 0
  r.result.sample = { sent: 0, note: '그날 보낼 수 있는 학생이 없어요.', picks: [] }
  return checkCronRuns(rows, Date.parse(NOW)).length === 0
})

T('담당 학생이 다 결석이라 샘플을 못 만든 것은 오류가 아니다', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'morning', '2026-10-27').result.sample = {
    sent: 4, picks: [{ ok: true }, { ok: false, teacher: '윤지혜', error: '그날 담당 학생이 모두 결석이라 보낼 글이 없어요' }],
  }
  return checkCronRuns(rows, Date.parse(NOW)).length === 0
})

T('샘플이 정말 못 나갔으면 「오류」 — 누구 것인지까지 적는다', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'morning', '2026-10-27').result.sample = {
    sent: 4, picks: [{ ok: false, teacher: '주한', error: '연락처가 없어요(수학OPS 직원 정보)' }],
  }
  const ps = checkCronRuns(rows, Date.parse(NOW))
  return kinds(ps) === 'morning:오류' && ps[0].detail.includes('주한') && ps[0].detail.includes('연락처가 없어요')
})

T('토요일 저녁은 18:00 기준 — 19:10 에 기록이 없으면 「안 돎」', () => {
  const now = at('2026-10-24', '19:10')
  const rows = healthy(['2026-10-23', '2026-10-24'], now).filter((r) => r.phase !== 'evening' || r.run_date !== '2026-10-24')
  return kinds(checkCronRuns(rows, Date.parse(now))) === 'evening:안 돎'
})

T('토요일 18:50 은 아직 기다린다', () => {
  const now = at('2026-10-24', '18:50')
  const rows = healthy(['2026-10-23', '2026-10-24'], now).filter((r) => r.phase !== 'evening' || r.run_date !== '2026-10-24')
  return checkCronRuns(rows, Date.parse(now)).length === 0
})

T('점검 자신이 안 돌았으면 그것도 잡는다', () => {
  const rows = healthy(DAYS, NOW).filter((r) => !(r.phase === 'watch-noon' && r.run_date === '2026-10-27'))
  return kinds(checkCronRuns(rows, Date.parse(NOW))) === 'watch-noon:안 돎'
})

T('감시를 시작하기 전 날(10/26)에는 감시 기록이 없어도 된다', () => {
  const now = at('2026-10-27', '09:00')
  const rows = healthy(['2026-10-26'], now).filter((r) => !r.phase.startsWith('watch'))
  return checkCronRuns(rows, Date.parse(now)).length === 0
})

T('알리고 잔액이 낮으면 「잔액 부족」을 한 번만', () => {
  const rows = healthy(DAYS, NOW)
  find(rows, 'morning', '2026-10-27').result.send.pointLeft = 5000
  find(rows, 'evening', '2026-10-27').result.send.pointLeft = 4800
  const ps = checkCronRuns(rows, Date.parse(NOW))
  return kinds(ps) === 'evening:잔액 부족' && ps[0].detail.includes('4,800')
})

T('같은 문제는 같은 key (문자 중복 방지용)', () => {
  const rows = healthy(DAYS, NOW).filter((r) => !(r.phase === 'evening' && r.run_date === '2026-10-27'))
  const a = checkCronRuns(rows, Date.parse(NOW))[0]?.key
  const b = checkCronRuns(rows, Date.parse(at('2026-10-27', '23:00')))[0]?.key
  return !!a && a === b && a === 'evening|2026-10-27|안 돎'
})

// ── 알림 시각이 **두 곳**에 적혀 있다 ───────────────────────────────────────────
//    보내는 쪽(lib/cronBriefing.ts 의 「아직 ~ 전이에요」 막는 시각)과
//    점검 쪽(CRON_SLOTS.premorning.due), 그리고 이 시험의 기대값(DUE) 셋이 같아야 한다.
//    ★ 한쪽만 고치면 **에러가 안 난다.** 점검이 엉뚱한 시각을 기다리게 되고, 그건
//      「알림이 안 나갔다」를 못 잡는다는 뜻이다. 2026-10-31 에 10:30 → 10:00 으로
//      당길 때 실제로 네 곳을 같이 고쳐야 했다.

T('미작성 알림 — 보내는 시각과 점검 시각과 시험 기대값이 모두 같다', () => {
  const src = fs.readFileSync('lib/cronBriefing.ts', 'utf8')
  // runRemindCron 의 「!force && now < 'HH:MM'」
  const 막는시각 = src.match(/now\s*<\s*'(\d\d:\d\d)'/)?.[1]
  const 점검시각 = (CRON_SLOTS as any[]).find((x) => x.phase === 'premorning')?.due('2026-10-31')
  const 시험기대 = DUE.premorning('2026-10-31')
  if (!막는시각) return false
  return 막는시각 === 점검시각 && 막는시각 === 시험기대
})

T('미작성 알림은 11시 발송보다 앞선다 (지나서 보내면 「이미 늦었습니다」가 된다)', () => {
  const 알림 = DUE.premorning('2026-10-31')
  const 발송 = DUE.morning('2026-10-31')
  return 알림 < 발송
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
