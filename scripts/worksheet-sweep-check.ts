/**
 * 「안 닫힌 학습지 쓸어 담기」 자가확인 (원장님 2026-11-18).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-sweep-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-sweep-check.ts <고친 worksheetSweep.ts 경로>
 *
 * 왜 검사가 필요한가
 *   원장님 「날짜 지난지 오래된거나 학습일지에 올라가서 학습브리핑이 발송된건 앞으로 자동으로 닫아줘」.
 *   **너무 적게 닫으면** 손품이 그대로 남고(11/18 에 21건이 그렇게 쌓여 있었다),
 *   **너무 많이 닫으면** 아직 안 푼 숙제가 목록에서 사라진다 — 그 쪽이 훨씬 나쁘다.
 *   둘 다 에러가 안 난다.
 *
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/worksheetSweep.ts')
const { sweepReasonFor, planSweep, briefKey, SWEEP_AFTER_DAYS, runWorksheetSweep } =
  await import(pathToFileURL(target).href)

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
  else console.log('✓ ' + what)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

const 오늘 = '2026-11-18'
const W = (over: any = {}) => ({
  id: 'w1', student_id: 'S1', score: 80, status: 'scored', submitted_at: '2026-11-18T12:00:00+09:00', ...over,
})
const 없음 = { briefed: new Set<string>(), today: 오늘 }
const 나감 = { briefed: new Set([briefKey('S1', '2026-11-18')]), today: 오늘 }

// ── 닫는 까닭 둘 ─────────────────────────────────────────────────────────────
ok(sweepReasonFor?.(W(), 나감) === 'briefed',
  '★ 그날 브리핑이 나갔으면 닫는다 (점수가 이미 학부모께 갔다)')
ok(sweepReasonFor?.(W({ submitted_at: '2026-11-11T12:00:00+09:00' }), 없음) === 'old',
  `★ 푼 지 ${SWEEP_AFTER_DAYS}일 지났으면 닫는다`)
ok(sweepReasonFor?.(W({ submitted_at: '2026-07-16T12:00:00+09:00' }), 없음) === 'old',
  '지난 7월 것도 닫는다')

// ── ★ 닫으면 안 되는 것 (여기가 틀리면 숙제가 사라진다) ──────────────────────
ok(sweepReasonFor?.(W({ score: null, status: 'assigned' }), 나감) === null,
  '★★ 점수가 없는 줄(배정만 한 숙제)은 **브리핑이 나갔어도** 안 닫는다')
ok(sweepReasonFor?.(W({ score: null, status: 'similar_assigned' }), 없음) === null,
  '★★ 오답유사 배정만 한 줄도 안 닫는다')
ok(sweepReasonFor?.(W({ submitted_at: null }), 없음) === null,
  '★ 언제 푼 것인지 모르면 안 닫는다 (「오래됐다」를 말할 수 없다)')
ok(sweepReasonFor?.(W(), 없음) === null,
  '★ 오늘 푼 것이고 브리핑도 아직이면 **그대로 둔다** (선생님이 손볼 수 있어야 한다)')
ok(sweepReasonFor?.(W({ submitted_at: '2026-11-17T12:00:00+09:00' }), 없음) === null,
  '어제 것도 브리핑 전이면 그대로 둔다')
ok(sweepReasonFor?.(W({ status: 'passed' }), 나감) === null, '이미 닫힌 줄은 안 집는다')
ok(sweepReasonFor?.(W({ student_id: 'S2' }), 나감) === null,
  '★ 브리핑은 **그 학생 것**만 본다 (남의 브리핑으로 닫히면 안 된다)')
ok(sweepReasonFor?.(W({ submitted_at: '2026-11-17T12:00:00+09:00' }), nameDay('2026-11-18')) === null,
  '★ 브리핑 날짜도 **그날 것**만 본다 (다른 날 브리핑으로 닫히면 안 된다)')
function nameDay(d: string) { return { briefed: new Set([briefKey('S1', d)]), today: 오늘 } }

// 경계 — 이레째가 되는 날 닫힌다
ok(sweepReasonFor?.(W({ submitted_at: '2026-11-12T12:00:00+09:00' }), 없음) === null,
  `${SWEEP_AFTER_DAYS - 1}일 전은 아직 안 닫는다`)
ok(sweepReasonFor?.(W({ submitted_at: '2026-11-11T12:00:00+09:00' }), 없음) === 'old',
  `${SWEEP_AFTER_DAYS}일 전부터 닫는다`)

// ── 목록 만들기 ──────────────────────────────────────────────────────────────
{
  const rows = [
    W({ id: 'a' }),                                                        // 오늘·브리핑 전 → 둔다
    W({ id: 'b', student_id: 'S2', submitted_at: '2026-11-01T12:00:00+09:00' }), // 오래됨
    W({ id: 'c' }),                                                        // 브리핑 나감
    W({ id: 'd', score: null, status: 'assigned' }),                       // 숙제 → 안 센다
  ]
  const p = planSweep?.(rows, { briefed: new Set([briefKey('S1', '2026-11-18')]), today: 오늘 })
  // a 와 c 는 둘 다 S1·오늘이라 브리핑으로 닫힌다 — 묶음에 둘 다 들어간다
  ok(p.ids.includes('b') && p.ids.includes('c') && p.ids.includes('a'), '닫을 것을 모은다')
  ok(!p.ids.includes('d'), '★ 숙제(점수 없음)는 묶음에 안 들어간다')
  ok(p.briefed === 2 && p.old === 1, '까닭별로 센다 (브리핑 2 · 오래됨 1)')
  ok(p.kept === 0, '남긴 것도 센다')
}

// ── 예약이 **실제로 부르나** (함수만 고치고 안 부르면 아무 일도 안 일어난다) ──
const cron = src('lib/cronBriefing.ts')
ok(/out\.sweep\s*=\s*await runWorksheetSweep\(/.test(cron),
  '★ 브리핑 예약이 쓸어 담기를 부른다')
// ★ 맨 위 import 가 아니라 **부르는 자리**와 견준다 (처음엔 import 에 걸려 늘 거짓이었다)
ok(cron.indexOf('out.send =') < cron.indexOf('await runWorksheetSweep('),
  '★ **발송 뒤에** 부른다 — 그래야 오늘 나간 브리핑까지 세어 그날 것이 닫힌다')
ok(/catch[\s\S]{0,80}학습지 닫기 실패/.test(cron),
  '여기서 터져도 예약 기록은 남는다 (try 로 감쌌다)')

// ── 읽는 법 (지난 사고에서 나온 규칙) ───────────────────────────────────────
const lib = src('lib/worksheetSweep.ts')
ok(/\.order\('id'\)[\s\S]{0,40}\.range\(/.test(lib),
  "★ range 앞에 order('id') 가 있다 — 없으면 행을 놓친다")
ok(/i \+= 100/.test(lib), '★ in() 을 100개씩 끊는다 — 긴 목록은 조용히 잘린다')
ok(/last_action: 'auto_complete'/.test(lib), '누가 닫았는지 처리 기록에 남긴다')

// ── 운영 자료로 (.env.local 이 있을 때만 · **읽기만** 한다) ──────────────────
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key || typeof runWorksheetSweep !== 'function') {
  console.log('(운영 자료 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  // ★ 쓰지 않는다. 지금 열려 있는 줄을 읽어 **무엇이 닫힐지만** 세어 본다.
  const { data: open } = await db.from('student_worksheets')
    .select('id, student_id, score, status, submitted_at')
    .not('score', 'is', null).neq('status', 'passed').order('id').limit(500)
  const rows = (open ?? []) as any[]
  const dates = [...new Set(rows.map((r) => String(r.submitted_at ?? '').slice(0, 10)).filter(Boolean))]
  const briefed = new Set<string>()
  for (let i = 0; i < dates.length; i += 100) {
    const { data } = await db.from('briefing_sends')
      .select('student_id, session_date, status').in('session_date', dates.slice(i, i + 100))
    for (const b of (data ?? []) as any[]) {
      if (b?.status === 'sent') briefed.add(briefKey(b.student_id, String(b.session_date).slice(0, 10)))
    }
  }
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const p = planSweep(rows, { briefed, today })
  ok(p.ids.length + p.kept === rows.length,
    `운영 — 열린 ${rows.length}건이 모두 가려진다 (닫을 것 ${p.ids.length} · 둘 것 ${p.kept})`)
  console.log(`(운영 — 지금 돌면 ${p.ids.length}건이 닫힌다: 브리핑 나감 ${p.briefed} · 오래됨 ${p.old} / 그대로 둘 것 ${p.kept}건)`)
}

console.log(bad ? `\n학습지 쓸어 담기 자가확인 실패 ${bad}건` : '\n학습지 쓸어 담기 자가확인 ✓')
process.exitCode = bad ? 1 : 0
