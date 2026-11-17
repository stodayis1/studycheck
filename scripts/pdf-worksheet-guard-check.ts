// PDF 학습지 서버 API 의 **가드**를 잰다 — 토큰 없이 부르면 막히는가.
//
//   node --import ./scripts/ts-resolve.mjs scripts/pdf-worksheet-guard-check.ts
//
// ★ 베껴 쓴 사본이 아니라 app/api/pdf-worksheets/route.ts 를 **그대로 불러** GET · POST 를 돌린다
//   (scripts/exam-move-guard-check.ts 와 같은 방식).
// ★ **DB 에 아무것도 쓰지 않는다.** 토큰이 없으면 가드가 첫 줄에서 돌려보내므로 본문까지 가지 않는다.
//   강사 계정이 없어 눌러 볼 수 없는 가드를 이렇게 재 둔다.
//
// .env.local 은 이 워크트리에 없을 수 있어 본 저장소에서도 찾아 읽는다. 값은 화면에 찍지 않는다.

import fs from 'node:fs'
import path from 'node:path'

for (const dir of [process.cwd(), path.resolve(process.cwd(), '../../..')]) {
  const f = path.join(dir, '.env.local')
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  break
}
const haveEnv = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
console.log(`\n.env.local 읽음: ${haveEnv ? '예' : '아니오 (그래도 401 은 재진다)'}`)

const { GET, POST } = await import('../app/api/pdf-worksheets/route')

let fail = 0
const ok = (cond: any, what: string, got?: any) => {
  if (cond) console.log(`  ok   ${what}`)
  else { fail++; console.log(`  FAIL ${what}${got === undefined ? '' : ` — 나온 값: ${JSON.stringify(got)}`}`) }
}

const call = async (fn: any, url: string, body?: any) => {
  const req = new Request(url, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' })
  const res = await fn(req)
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

console.log('\n■ 토큰 없이 부르면 막힌다 (주소로 직접 불러도 열리지 않아야 한다)')
for (const q of ['?list=1', '?print=ABC123', '?assign=ABC123']) {
  const r = await call(GET, `http://x/api/pdf-worksheets${q}`)
  ok(r.status === 401, `GET ${q} → 401`, r)
}
for (const action of ['start', 'question', 'finish', 'assign']) {
  const r = await call(POST, 'http://x/api/pdf-worksheets', { action, code: 'ABC123', no: 1, image: 'x' })
  ok(r.status === 401, `POST action=${action} → 401 (DB 에 닿지 않는다)`, r)
}

console.log('\n■ 가드 줄이 글자로 있는지 (route 가 highOrDeny 를 쓰는가)')
const src = fs.readFileSync('app/api/pdf-worksheets/route.ts', 'utf8')
ok((src.match(/await highOrDeny\(req\)/g) ?? []).length === 2, 'GET · POST 둘 다 첫 줄에 highOrDeny')
ok(/if \(who\.deny\) return who\.deny/.test(src), 'deny 를 그대로 돌려준다')
ok(!/denyIfNotStaff/.test(src), 'denyIfNotStaff 로 넓게 열어 두지 않았다')
ok(/asUser\(req\)\.from\('students'\)/.test(src), '배정은 **그 사람 토큰으로** students 를 되읽어 가린다')

console.log('\n■ 진급 배정판도 같은 가드로 바꿨다 — 전과 똑같이 막히는지 (2026-11-17 highOrDeny 로 모음)')
{
  const ma: any = await import('../app/api/move-assign/route')
  const g = await call(ma.GET, 'http://x/api/move-assign')
  ok(g.status === 401, 'GET /api/move-assign → 401', g)
  const p2 = await call(ma.POST, 'http://x/api/move-assign', { studentId: 'x', track: '고등' })
  ok(p2.status === 401, 'POST /api/move-assign → 401 (DB 에 닿지 않는다)', p2)
  const src2 = fs.readFileSync('app/api/move-assign/route.ts', 'utf8')
  ok((src2.match(/await highOrDeny\(req\)/g) ?? []).length === 2, 'GET · POST 둘 다 highOrDeny')
  // 설명 주석에는 함수 이름이 나와도 된다. **부르는 줄**이 있으면 규칙을 베껴 적은 것이다
  for (const [name, s2] of [['진급 배정판', src2], ['PDF 학습지', src]] as const)
    ok(!/\.rpc\(\s*['"]can_see_high_curriculum/.test(s2),
      `${name} route 가 can_see_high_curriculum 을 직접 부르지 않는다 — lib/apiAuth.ts 한 곳에만`)
  ok(/\.rpc\('can_see_high_curriculum'\)/.test(fs.readFileSync('lib/apiAuth.ts', 'utf8')),
    '그 한 곳(lib/apiAuth.ts 의 highOrDeny)에는 있다')
}

console.log('\n■ 망가뜨린 사본에서는 실패해야 한다')
{
  const broken = src.replace(/await highOrDeny\(req\)/g, 'await Promise.resolve({ deny: null })')
  ok(!/await highOrDeny\(req\)/.test(broken), '가드를 뺀 사본은 위 글자 검사에서 걸린다')
}

console.log(fail ? `\n✗ ${fail}건 실패\n` : '\n✓ 모두 통과\n')
process.exit(fail ? 1 : 0)
