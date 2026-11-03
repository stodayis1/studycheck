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
const { failoverOn } = await import(pathToFileURL(path.resolve('lib/aligo.ts')).href)
const { fetchAligoRows, summarize, aligoProblems } = await import(pathToFileURL(path.resolve('lib/aligoResults.ts')).href)
const { RESEND_KEY, pickResend, dropDate, addResend, allDates, dropDates } = await import(pathToFileURL(path.resolve('lib/briefingResend.ts')).href)

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

// ── 브리핑 다시 보내기 예약 (2026-11-02) ───────────────────────────────────
//   한 번 나간 학생은 자동 발송에서 빠진다. 고쳐서 다시 보내려면 그 시각에 사람이
//   화면 앞에 있어야 했다 — 적어 두면 다음 오전 발송이 같이 보낸다.
T('예약한 날짜의 사람만 꺼낸다', () => {
  const v = { '2026-11-02': ['a', 'b'], '2026-11-01': ['c'] }
  const got = pickResend(v, '2026-11-02')
  return got.length === 2 && got.includes('a') && got.includes('b')
    && pickResend(v, '2026-11-03').length === 0
})

T('값이 이상해도 자동 발송을 멈추지 않는다 (빈 목록)', () =>
  pickResend(null, '2026-11-02').length === 0
  && pickResend({ '2026-11-02': '학생' }, '2026-11-02').length === 0
  && pickResend({}, '2026-11-02').length === 0)

T('같은 사람을 두 번 적어도 한 번만 보낸다', () =>
  pickResend({ '2026-11-02': ['a', 'a', ' a ', ''] }, '2026-11-02').length === 1)

// ★ 보낸 뒤 지우지 않으면 **다음 날에도 또 나간다.**
T('보낸 날짜만 지우고 다른 날짜 예약은 남긴다', () => {
  const v = { '2026-11-02': ['a'], '2026-11-01': ['c'] }
  const got = dropDate(v, '2026-11-02')
  return !('2026-11-02' in got) && got['2026-11-01']?.[0] === 'c'
})

// ★ 오전 발송은 「어제」만 보낸다. 다시 보낼 것은 더 옛날 수업일 수 있다.
T('예약된 날짜를 전부 돈다 (옛날 수업도)', () => {
  const v = { '2026-10-29': ['a'], '2026-11-02': ['b'], '엉뚱한키': ['c'], '2026-10-30': [] }
  const got = allDates(v)
  return got.length === 2 && got[0] === '2026-10-29' && got[1] === '2026-11-02'
})

T('한 번에 열 날짜까지만 (나머지는 다음 날)', () => {
  const v: any = {}
  for (let d = 1; d <= 15; d++) v[`2026-10-${String(d).padStart(2, '0')}`] = ['a']
  return allDates(v).length === 10 && allDates(v, 3).length === 3
})

T('보낸 날짜들만 지운다', () => {
  const got = dropDates({ '2026-10-29': ['a'], '2026-11-02': ['b'] }, ['2026-10-29'])
  return !('2026-10-29' in got) && got['2026-11-02']?.[0] === 'b'
})

T('사람을 더해도 이미 있는 사람은 겹치지 않는다', () => {
  const got = addResend({ '2026-11-02': ['a'] }, '2026-11-02', ['a', 'b'])
  return got['2026-11-02'].length === 2
})

// ★ 함수만 있고 **자동 발송이 그걸 안 읽으면** 아무 일도 안 일어난다.
//   2026-11-02 에 「판정은 맞는데 화면이 안 쓴다」로 한 번 당했다 — 부르는 자리까지 본다.
T('오전 자동 발송이 예약을 실제로 읽고, 보낸 뒤 지운다', () => {
  const src = fs.readFileSync(path.resolve('app/api/kakao-briefing/route.ts'), 'utf8')
  return src.includes('pickResend(') && src.includes('dropDates(') && src.includes('allDates(')
    && src.includes('RESEND_KEY') && /phase === 2/.test(src)
    && /resend: true/.test(src)
})

// ── 알림톡이 거절되면 문자로 대신 (원장님 2026-11-03 「켜줘」) ──────────────
//   그 전까지는 꺼져 있어서, 카카오가 거절한 건은 아무 데도 안 가고 조용히 사라졌다.
//   우리 기록에는 「나감」으로 남아 몇 주 동안 아무도 몰랐다.
// ★ 원장님 2026-11-03 「문자대체하면 안될거 같아」 — 기본은 **꺼짐**이다.
//   그래서 거절을 빨리 아는 것이 유일한 방어다(아래 알리고 점검).
T('문자 대신 보내기는 따로 켜지 않으면 꺼져 있다', () =>
  failoverOn(undefined) === false && failoverOn('') === false && failoverOn('N') === false)

T('일부러 Y 로 두면 켜진다', () =>
  failoverOn('Y') === true && failoverOn(' y ') === true)

// ── 알리고 실제 결과 점검 (2026-11-03) ─────────────────────────────────────
//   우리 기록은 「접수됨」까지만 안다. 카카오가 거절해도 「나감」으로 남아서,
//   10-20 ~ 10-31 에 1,074건이 거절된 것을 열하루 동안 아무도 몰랐다.
const 줄 = (rslt: string, msg: string, when = '2026-11-03 11:01:00') =>
  ({ phone: '01000000000', rslt, msg, tpl: 'UM_0000', when })

T('성공만 있으면 아무 말도 안 한다', () => {
  const s = summarize([줄('0', '성공'), 줄('0', '성공')])
  return s.성공 === 2 && s.실패 === 0 && aligoProblems(s, '2026-11-03').length === 0
})

// ★ 한 건이 보통 전조다 — 2026-10-20 에도 처음엔 몇 건이었다.
T('거절이 한 건이라도 있으면 알린다', () => {
  const s = summarize([줄('0', '성공'), 줄('U', '메시지가 템플릿과 일치하지않음')])
  const p = aligoProblems(s, '2026-11-03')
  return s.실패 === 1 && p.length === 1 && p[0].kind === '오류'
    && p[0].detail.includes('메시지가 템플릿과 일치하지않음') && p[0].detail.includes('1건')
})

T('사유가 여럿이면 많은 것부터, 사유마다 따로 알린다', () => {
  const s = summarize([줄('U', '템플릿 불일치'), 줄('U', '템플릿 불일치'), 줄('M', '템플릿 없음')])
  const p = aligoProblems(s, '2026-11-03')
  return p.length === 2 && p[0].detail.startsWith('2건') && p[1].detail.startsWith('1건')
})

// 같은 사유를 날마다 한 번만 알린다 (문자가 쏟아지지 않게)
T('같은 날 같은 사유는 열쇠가 같다', () => {
  const a = aligoProblems(summarize([줄('U', '템플릿 불일치')]), '2026-11-03')[0]
  const b = aligoProblems(summarize([줄('U', '템플릿 불일치'), 줄('U', '템플릿 불일치')]), '2026-11-03')[0]
  const c = aligoProblems(summarize([줄('U', '템플릿 불일치')]), '2026-11-04')[0]
  return a.key === b.key && a.key !== c.key
})

T('실패한 날짜도 센다', () => {
  const s = summarize([줄('U', 'x', '2026-11-02 20:00:00'), 줄('U', 'x', '2026-11-03 11:00:00')])
  return s.실패날짜별['2026-11-02'] === 1 && s.실패날짜별['2026-11-03'] === 1
})

// ★ 그물에 안 걸리고 시험한다 — 알리고 대신 **가짜 부르개**를 넣는다.
let 목록부름 = 0, 상세부름 = 0
const 가짜알리고 = async (path: string, params: Record<string, string>) => {
  if (path.includes('list')) {
    목록부름++
    return { list: 목록부름 === 1 ? [{ mid: '1' }, { mid: '2' }] : [] }
  }
  상세부름++
  return { list: [{ phone: '01011112222', rslt: params.mid === '1' ? '0' : 'U',
    rslt_message: params.mid === '1' ? '성공' : '거절', tpl_code: 'UM_1', sentdate: '2026-11-03 11:00:00' }] }
}
const 가짜줄들 = await fetchAligoRows(가짜알리고 as any, '2026-11-02', '2026-11-03')

T('묶음 목록을 받아 묶음마다 수신자별 결과를 모은다', () =>
  가짜줄들.length === 2 && 상세부름 === 2
  && 가짜줄들.filter((r: any) => r.rslt === '0').length === 1
  && summarize(가짜줄들).실패 === 1)

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
