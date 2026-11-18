/**
 * 「오늘 하루만 온 수업」 자가확인 (원장님 2026-11-18).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/one-day-class-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/one-day-class-check.ts <고친 oneDayClass.ts 경로>
 *
 * 왜 검사가 필요한가
 *   진급 이동을 11/18 부터 조금씩 시작하면서, 시간표를 확정하기 전에 학생이 새 반에 와서
 *   앉는 날이 생겼다. 그 학생이 「오늘 수업」 목록에 안 뜨면 **아무도 일지를 안 쓴다** —
 *   에러도 안 나고, 그날 학부모 브리핑이 통째로 빠진다(11/18 서우현·강하라).
 *
 *   거꾸로 하루치가 **매주** 떠 버리면 선생님이 없는 수업을 매주 찾게 된다. 그래서
 *   날짜 한 벌만 유효해야 한다. 두 방향 다 조용히 틀리므로 못박아 둔다.
 *
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/oneDayClass.ts')
const { slotFor, fetchOneDayClasses, ONE_DAY_TABLE } = await import(pathToFileURL(target).href)

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
  else console.log('✓ ' + what)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

const 오늘 = '2026-11-18'
const od = (student_id: string, start_time: string, periods = 2, id = start_time) =>
  ({ id, student_id, class_date: 오늘, start_time, periods, created_by: '최대호', memo: null })

// ── 어느 칸을 쓰나 ───────────────────────────────────────────────────────────
ok(slotFor?.('s1', [{ student_id: 's1', start_time: '19:00:00', periods: 2 }], [])?.start_time === '19:00:00',
  '정규 시간표가 있으면 그 칸을 쓴다')
ok(slotFor?.('s1', [], [od('s1', '16:00:00')])?.start_time === '16:00:00',
  '★ 시간표에 없고 하루 수업만 있으면 **그 칸으로 오늘 목록에 뜬다** (서우현·강하라가 안 뜨던 것)')
ok(slotFor?.('s1', [], [od('s1', '16:00:00')])?.oneDayId === '16:00:00',
  '하루 수업이면 그 줄 id 를 들고 온다 — 「오늘만 취소」에 쓴다')
ok(slotFor?.('s1', [{ student_id: 's1', start_time: '19:00:00', periods: 2 }], [od('s1', '16:00:00')])
  ?.oneDayId === undefined,
  '둘 다 있으면 **정규 시간표가 먼저**다 (시간표 그림이 엉뚱한 자리로 튀지 않게)')
ok(slotFor?.('s1', [], []) === null, '아무것도 없으면 오늘 수업이 아니다')
ok(slotFor?.('s2', [], [od('s1', '16:00:00')]) === null, '남의 하루 수업에 걸리지 않는다')
ok(slotFor?.('s1', [], [od('s1', '19:00:00', 2, 'b'), od('s1', '16:00:00', 2, 'a')])?.start_time === '16:00:00',
  '같은 날 두 칸이면 이른 시각을 쓴다 — 일지는 한 장이다')
ok(Number(slotFor?.('s1', [], [od('s1', '16:00:00', 2.5)])?.periods) === 2.5,
  '교시는 숫자로 바뀐다 (numeric 은 문자열로 내려온다)')

// ── 못 읽었을 때 ─────────────────────────────────────────────────────────────
const 에러DB = { from: () => ({ select: () => ({ eq: async () => ({ data: null, error: { message: '없는 표' } }) }) }) }
const 빈DB = { from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }) }
ok((await fetchOneDayClasses?.(에러DB as any, 오늘)) === null,
  '★ 표를 못 읽으면 null 이다 — 「없다」와 구분해야 단추를 숨길 수 있다 (SQL 전에 배포돼도 안전)')
ok(Array.isArray(await fetchOneDayClasses?.(빈DB as any, 오늘)),
  '읽었는데 없으면 빈 배열이다')

// ── 쓰는 곳이 **이 파일을 그대로** 쓰나 (베껴 쓰면 한쪽만 고쳐진다) ──────────
const page = src('app/teacher/learning-notes/page.tsx')
ok(page.includes("from '@/lib/oneDayClass'"), '학습일지 화면이 lib 의 규칙을 쓴다')
ok(page.includes('slotFor(s.id, todaySchedules, oneDayRows)'),
  '오늘 수업 목록을 slotFor 로 만든다 (schedules.find 사본이 아니다)')
ok(!/const sc = schedules\.find\(\(sc\) => sc\.student_id === s\.id && sc\.day_of_week === todayDay\)/.test(page),
  '옛 사본(시간표만 보는 길)이 남아 있지 않다')
ok(/oneDayReady && \(/.test(page),
  '표를 못 읽으면 「오늘 왔어요」 단추를 아예 안 보인다')
ok(/오늘만/.test(page) && /removeOneDay/.test(page),
  '더해진 하루 수업을 화면에 적어 주고 거기서 취소할 수 있다')

const exp = src('lib/expectedToday.ts')
ok(exp.includes('fetchOneDayClasses'),
  '★ 「그날 일지를 써야 하는 학생」에도 하루 수업이 들어간다 — 안 그러면 미작성 알림에서 빠진다')
ok(exp.indexOf('movedIds.has(id)') < exp.indexOf('addedOneDay'),
  '★ 하루 수업은 **대체수업 제외 뒤에** 더한다 (선생님이 직접 누른 것이 OPS 기록보다 맞다)')
ok(/live\.has\(id\) && !notYet\.has\(id\) && !skipSet\.has\(id\)/.test(exp.split('addedOneDay')[1] ?? ''),
  '하루 수업도 휴원·첫 수업 전·일지 안 쓰는 학생·연습용은 똑같이 거른다')

// ── 정규 시간표를 건드리지 않았나 (이게 이 변경의 전부다) ────────────────────
ok(!/one_day|oneDay/i.test(src('app/teacher/classes/page.tsx')),
  '반별 화면은 안 건드렸다 — 하루치가 다른 화면에 새지 않는다')
ok(!/day_of_week/.test(src('lib/oneDayClass.ts')),
  '하루 수업은 요일이 아니라 **날짜**로만 다룬다')

// ── 운영 DB (.env.local 이 있을 때만 · 읽기만 한다) ─────────────────────────
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.log('(운영 DB 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  const rows = await fetchOneDayClasses?.(db, new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10))
  if (rows === null) {
    console.log(`(운영에 ${ONE_DAY_TABLE} 표가 아직 없다 — docs/sql/하루수업.sql 을 돌려야 한다.`
      + ' 표가 없는 동안 화면은 단추를 안 보여 주므로 고장은 아니다)')
  } else {
    ok(true, `운영에서 ${ONE_DAY_TABLE} 를 읽는다 (오늘 ${rows.length}건)`)
  }
}

console.log(bad ? `\n하루 수업 자가확인 실패 ${bad}건` : '\n하루 수업 자가확인 ✓')
process.exitCode = bad ? 1 : 0
