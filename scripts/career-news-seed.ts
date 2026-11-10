/**
 * 학생부 로드맵 **정기 소식 심기** — 학년별·월별로 그 달에 챙길 것을 `career_events` 에
 * 「검토대기」로 올린다. 원장님이 ④ 행사 소식 탭에서 승인해야 학부모께 나간다.
 *
 * 왜 (원장님 2026-11-10 「연간 캘린더를 career_events 에 심자」)
 *   지금까지 소식은 **찾아낸 행사**뿐이라 행사가 없는 달은 보낼 것이 없었다.
 *   「12월 — 학생부 기록·세특·출결·창체 최종 확인」처럼 **달마다 꼭 챙길 것**을 같이 올린다.
 *
 * 자료: `lib/data/roadmapCalendar.ts` (연간이슈캘린더 2026 중 중3·고1·고2 줄, 107개)
 *
 * 쓰는 법 — 환경 파일이 있는 폴더에서
 *   node --import ./scripts/ts-resolve.mjs scripts/career-news-seed.ts [--months=2] [--save]
 *
 *   기본은 **미리보기**다. `--save` 를 붙여야 넣는다.
 *   `--months=2` = 이번 달과 다음 달. 두 달치씩 심으면 2주에 한 번 보내는 흐름과 맞는다.
 *
 * ★ 같은 줄을 두 번 올리지 않는다 — `url` 뒤에 `#roadmap-<연월>-<학년>-<번호>` 를 붙여
 *   한 줄마다 다른 주소가 되게 하고, 이미 있는 주소는 건너뛴다.
 *   (career_events 는 unique (url, starts_on) 이다.)
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { ROADMAP_CALENDAR } from '../lib/data/roadmapCalendar.ts'
import { buildSeed, type SeedRow } from '../lib/roadmapSeed.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('✗ 환경 파일에 주소와 service_role 열쇠가 필요합니다.'); process.exit(1) }
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

const SAVE = process.argv.includes('--save')
const monthsArg = process.argv.find((a) => a.startsWith('--months='))
const MONTHS = Math.min(Math.max(Number(monthsArg?.split('=')[1] ?? 2) || 2, 1), 12)

/** 서울 기준 오늘 */
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const [y0, m0] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))]


const plan: SeedRow[] = []
for (let k = 0; k < MONTHS; k++) {
  const m = ((m0 - 1 + k) % 12) + 1
  const y = y0 + Math.floor((m0 - 1 + k) / 12)
  plan.push(...buildSeed(ROADMAP_CALENDAR, y, m))
}

// 이미 올라간 것은 건너뛴다
const { data: has } = await db.from('career_events').select('url').in('url', plan.map((p) => p.url))
const had = new Set((has ?? []).map((r: { url: string }) => r.url))
const fresh = plan.filter((p) => !had.has(p.url))

console.log(`\n${MONTHS}달치 ${plan.length}건 중 새것 ${fresh.length}건 (이미 있음 ${plan.length - fresh.length}건)\n`)
for (const r of fresh) {
  console.log(`${r.grades[0].padEnd(3)} | ${r.starts_on.slice(0, 7)} | ${r.title}`)
}
// ★ 윈도에서 process.exit() 는 libuv 가 터져 종료코드를 127 로 만든다 — 끝까지 가고
//   process.exitCode 만 적는다 (matholic-check 에서 같은 일을 겪었다).
if (!fresh.length) {
  console.log('\n새로 올릴 것이 없습니다.')
} else if (!SAVE) {
  console.log('\n미리보기만 했습니다. --save 를 붙이면 「검토대기」로 올립니다.')
} else {
  const { error } = await db.from('career_events').insert(fresh)
  if (error) {
    console.error('✗ 올리지 못했습니다:', error.message)
    process.exitCode = 1
  } else {
    // 올라갔는지 되읽어 확인한다 (올렸다는 말만 믿지 않는다)
    const { data: now } = await db.from('career_events').select('url').in('url', fresh.map((p) => p.url))
    const ok = (now ?? []).length
    console.log(ok === fresh.length
      ? `✓ ${ok}건을 「검토대기」로 올렸습니다 — ④ 행사 소식 탭에서 승인해 주세요.`
      : `✗ 되읽으니 ${ok}건뿐입니다 (올리려던 것은 ${fresh.length}건)`)
    process.exitCode = ok === fresh.length ? 0 : 1
  }
}
