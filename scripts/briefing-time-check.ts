/**
 * 브리핑 자동 발송 시각 자가확인.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-time-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-time-check.ts <고친사본폴더>
 *
 * 무엇을 보나 — **다섯 군데가 서로 어긋나지 않는지**.
 *
 *   ① lib/cronBriefing.ts   eveningNotBefore()  — 그 시각 전이면 라우트가 그냥 돌아간다
 *   ② docs/sql/제시간_자동발송_pgcron.sql        — pg_cron 이 **언제까지** 깨우나
 *   ③ vercel.json                                — 보험으로 두는 Vercel 예약
 *   ④ lib/cronHealth.ts     EVENING_DUE         — 점검이 「몇 시에 돌아야 하나」로 아는 시각
 *   ⑤ 학습일지 화면 글                            — 선생님들이 이걸 보고 일한다
 *
 * 어긋나면 두 가지로 터진다.
 *   · 깨움이 20:50 에 끝나는데 ① 만 21:00 으로 미루면 **그날 저녁 발송이 통째로 안 나간다.**
 *     에러도 안 나고 조용히 빈다.
 *   · ④ 가 20:00 에 머물면 발송이 21:00 에 도는 것을 「30분 넘게 늦음」으로 보고
 *     **날마다 거짓 경보 문자**가 원장님께 간다. (2026-11-17 에 실제로 놓칠 뻔했다.)
 *
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] ?? '.'
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
  else console.log('✓ ' + what)
}

/** 'HH:MM' → 분 */
const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5))

// ── ① 라우트가 막는 시각 ────────────────────────────────────────────────
const cron = read('lib/cronBriefing.ts')
const gate = cron.match(/kstDow\(\) === 6 \? '(\d\d:\d\d)' : '(\d\d:\d\d)'/)
ok(!!gate, 'lib/cronBriefing.ts 에서 eveningNotBefore() 의 두 시각을 읽었다')
const 토 = gate?.[1] ?? '18:00'
const 평일 = gate?.[2] ?? '20:00'

const morning = cron.match(/phase === 1 \? eveningNotBefore\(\) : '(\d\d:\d\d)'/)
ok(!!morning, 'lib/cronBriefing.ts 에서 오전 발송 시각을 읽었다')
const 오전 = morning?.[1] ?? '11:00'

// ── ② pg_cron 이 깨우는 창 (UTC) ────────────────────────────────────────
// 적는 꼴:  cron.schedule('briefing-evening', '*/10 8-12 * * *', ...)
const sql = read('docs/sql/제시간_자동발송_pgcron.sql')
function windowOf(job: string) {
  const line = sql.split('\n').find((l) => l.includes("cron.schedule('" + job + "'"))
  if (!line) return null
  // 두 번째 작은따옴표 묶음이 일정이다.
  const quoted = line.match(/'[^']*'/g) ?? []
  const sched = (quoted[1] ?? '').replace(/'/g, '').trim().split(' ')
  if (sched.length < 5) return null
  const step = Number((sched[0] ?? '').replace('*/', ''))
  const hours = (sched[1] ?? '').split('-')
  const from = Number(hours[0])
  const to = Number(hours[1] ?? hours[0])
  if (!Number.isFinite(step) || !Number.isFinite(from) || !Number.isFinite(to)) return null
  return {
    from, to, step,
    // 그 창의 **마지막** 깨움을 한국시간 분으로
    lastKstMin: ((to + 9) % 24) * 60 + (60 - step),
    firstKstMin: ((from + 9) % 24) * 60,
  }
}
const ev = windowOf('briefing-evening')
const mo = windowOf('briefing-morning')
ok(!!ev, 'pg_cron 저녁 깨움 창을 읽었다')
ok(!!mo, 'pg_cron 오전 깨움 창을 읽었다')

// ── ③ 서로 맞나 ────────────────────────────────────────────────────────
ok(ev != null && ev.lastKstMin >= toMin(평일),
  `저녁 깨움이 평일 발송 시각(${평일}) 뒤까지 간다 — 안 그러면 그날 발송이 통째로 빈다`)
ok(ev != null && ev.lastKstMin >= toMin(토),
  `저녁 깨움이 토요일 발송 시각(${토}) 뒤까지 간다`)
ok(ev != null && ev.firstKstMin <= toMin(토),
  `저녁 깨움이 토요일 발송 시각(${토})보다 먼저 시작한다`)
ok(mo != null && mo.lastKstMin >= toMin(오전),
  `오전 깨움이 발송 시각(${오전}) 뒤까지 간다`)

// ── ④ 점검이 아는 시각 (lib/cronHealth.ts 의 사본) ──────────────────────
// 여기가 뒤처지면 발송은 멀쩡한데 **날마다 「늦음」 문자**가 원장님께 간다.
const health = read('lib/cronHealth.ts')
const due = health.match(/isSaturday\(date\) \? '(\d\d:\d\d)' : '(\d\d:\d\d)'/)
ok(!!due, 'lib/cronHealth.ts 에서 EVENING_DUE 의 두 시각을 읽었다')
ok(due?.[2] === 평일, `점검이 아는 평일 시각(${due?.[2]})이 실제 발송 시각(${평일})과 같다`)
ok(due?.[1] === 토, `점검이 아는 토요일 시각(${due?.[1]})이 실제 발송 시각(${토})과 같다`)
// 슬롯이 그 함수를 실제로 쓰는가 — 값을 또 베껴 적으면 사본이 셋이 된다.
ok(/phase: 'evening',[^}]*due: EVENING_DUE/.test(health),
  'CRON_SLOTS 의 저녁 자리가 EVENING_DUE 를 그대로 쓴다 (시각을 또 베껴 적지 않았다)')

// Vercel 예약은 보험이다. pg_cron 이 죽었을 때 구실을 하려면 발송 시각보다 **뒤**여야 한다.
const vercel = JSON.parse(read('vercel.json'))
const vEv = (vercel.crons ?? []).find((c: any) => String(c.path).includes('briefing/evening'))
ok(!!vEv, 'vercel.json 에 저녁 예약이 있다')
const vEvHour = Number(String(vEv?.schedule ?? '').split(' ')[1])
ok(Number.isFinite(vEvHour) && ((vEvHour + 9) % 24) * 60 >= toMin(평일),
  `Vercel 저녁 예약(UTC ${vEvHour}시 = 한국 ${(vEvHour + 9) % 24}시)이 평일 발송 시각(${평일}) 뒤다`)

// ── ④ 화면 글이 같은 시각을 말하나 ──────────────────────────────────────
const 시 = Number(평일.slice(0, 2))
const 말 = 시 >= 21 ? `밤 ${시 - 12}시` : `저녁 ${시 - 12}시`
const 옛말 = [20, 21].filter((h) => h !== 시).map((h) => (h >= 21 ? `밤 ${h - 12}시` : `저녁 ${h - 12}시`))
for (const p of ['app/teacher/learning-notes/page.tsx', 'lib/newStudentSteps.ts']) {
  const t = read(p)
  ok(t.includes(말), `${p} 가 「${말}」라고 적고 있다`)
  ok(!옛말.some((w) => t.includes(w)), `${p} 에 옛 시각(${옛말.join(' · ')})이 남아 있지 않다`)
}

console.log(bad ? `\n${bad}군데 어긋남` : '\n다 맞음')
process.exit(bad ? 1 : 0)
