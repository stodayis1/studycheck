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
for (const action of ['start', 'question', 'finish', 'assign', 'delete']) {
  const r = await call(POST, 'http://x/api/pdf-worksheets', { action, code: 'ABC123', no: 1, image: 'x' })
  ok(r.status === 401, `POST action=${action} → 401 (DB 에 닿지 않는다)`, r)
}

console.log('\n■ 가드 줄이 글자로 있는지 (route 가 highOrDeny 를 쓰는가)')
const src = fs.readFileSync('app/api/pdf-worksheets/route.ts', 'utf8')
ok((src.match(/await highOrDeny\(req\)/g) ?? []).length === 2, 'GET · POST 둘 다 첫 줄에 highOrDeny')
ok(/if \(who\.deny\) return who\.deny/.test(src), 'deny 를 그대로 돌려준다')
ok(!/denyIfNotStaff/.test(src), 'denyIfNotStaff 로 넓게 열어 두지 않았다')
ok(/asUser\(req\)\.from\('students'\)/.test(src), '배정은 **그 사람 토큰으로** students 를 되읽어 가린다')

console.log('\n■ 지우기는 **원장만** 이고, 푼 기록이 있으면 지우지 않는다 (원장님 2026-11-17 「관리자한테만」)')
{
  // ★ exam_sheets 를 지우면 gradings · exam_sheet_problems · exam_sheet_targets 가 **CASCADE 로 같이 날아간다**.
  //   그래서 푼 기록이 하나라도 있으면 막아야 한다 — 막는 줄이 사라지면 학생 채점 기록이 조용히 사라진다.
  const d = src.slice(src.indexOf("case 'delete'"), src.indexOf("case 'assign'"))
  ok(d.length > 100, '지우기 가지가 있다')
  ok(/who\.role !== 'admin'/.test(d), '원장이 아니면 막는다 (role !== admin → 403)')
  ok(/from\('gradings'\)[\s\S]{0,200}eq\('sheet_id'/.test(d), '푼 기록을 센다')
  ok(/이미 푼 기록이/.test(d), '푼 기록이 있으면 사람 말로 거절한다')
  ok(/neq\('sheet_id', sheet\.id\)/.test(d), '다른 학습지에도 쓰인 문항은 남긴다')
  for (const t of ['exam_questions', 'learning_attempts', 'twin_id'])
    ok(d.includes(t), `${t} 에 걸린 문항도 남긴다`)
  ok(/storage\.from\(PROBLEM_BUCKET\)\.remove/.test(d), '보관함 그림도 지운다')
  // 지우는 차례 — 그림을 먼저 지워야 어느 그림이었는지 알 수 있다
  ok(d.indexOf('.remove(') < d.indexOf("from('problems').delete()"), '그림을 문항 줄보다 **먼저** 지운다')
  ok(d.indexOf("from('problems').delete()") < d.indexOf("from('exam_sheets').delete()"), '문항을 학습지보다 먼저 지운다')
}

console.log('\n■ PDF 학습지는 권한 규칙을 베껴 적지 않는다 — lib/apiAuth.ts 의 highOrDeny 한 곳만 본다')
{
  // 설명 주석에는 함수 이름이 나와도 된다. **부르는 줄**이 있으면 규칙을 베껴 적은 것이다.
  ok(!/\.rpc\(\s*['"]can_see_high_curriculum/.test(src),
    'PDF 학습지 route 가 can_see_high_curriculum 을 직접 부르지 않는다')
  ok(/\.rpc\('can_see_high_curriculum'\)/.test(fs.readFileSync('lib/apiAuth.ts', 'utf8')),
    '그 한 곳(lib/apiAuth.ts 의 highOrDeny)에는 있다')
}

console.log('\n■ 진급 배정판은 **자기 가드**를 쓴다 — 건드리지 않았는지 (2026-11-17 main 에서 두 갈래로 갈렸다)')
{
  // can_see_move_assign() 으로 들여보내고 can_see_high_curriculum() 으로 고등부까지 볼 사람을 가른다.
  // 초6 담당 선생님은 「초6 → 중등」 탭만 본다 — highOrDeny 로 바꾸면 그 갈래가 통째로 없어진다.
  const ma: any = await import('../app/api/move-assign/route')
  const g = await call(ma.GET, 'http://x/api/move-assign')
  ok(g.status === 401, 'GET /api/move-assign → 401 (전과 같다)', g)
  const p2 = await call(ma.POST, 'http://x/api/move-assign', { studentId: 'x', track: '고등' })
  ok(p2.status === 401, 'POST /api/move-assign → 401 (DB 에 닿지 않는다)', p2)
  const src2 = fs.readFileSync('app/api/move-assign/route.ts', 'utf8')
  ok(/can_see_move_assign/.test(src2), '두 갈래 가운데 「들여보내기」(can_see_move_assign)가 살아 있다')
  ok(/can_see_high_curriculum/.test(src2), '두 갈래 가운데 「고등부까지」(can_see_high_curriculum)가 살아 있다')
  ok(!/highOrDeny/.test(src2), 'highOrDeny 로 바꿔 두 갈래를 하나로 뭉개지 않았다')
}

console.log('\n■ 망가뜨린 사본에서는 실패해야 한다')
{
  const broken = src.replace(/await highOrDeny\(req\)/g, 'await Promise.resolve({ deny: null })')
  ok(!/await highOrDeny\(req\)/.test(broken), '가드를 뺀 사본은 위 글자 검사에서 걸린다')
}

console.log(fail ? `\n✗ ${fail}건 실패\n` : '\n✓ 모두 통과\n')
process.exit(fail ? 1 : 0)
