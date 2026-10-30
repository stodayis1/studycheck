// GPT-EXEC-021 정적 회귀 — 패치 파일이 「원본 + 그 한 줄」인지 본다
//
// 실행: npm run test:twin   (PostgreSQL 없이 도는 검사다)
//
// 실제 런타임 대조는 `lib/twin/pgtest/exec021.pg.test.ts` 가 진짜 PostgreSQL 에서 한다.
// 여기서 보는 것은 **패치 파일 자체가 약속한 모양인가** 뿐이다.
//   - 두 패치 파일이 바이트까지 같은가
//   - 패치가 담은 원본 본문이 설치 SQL 과 글자까지 같은가 (옮겨 적다 틀리지 않았는가)
//   - 수정본이 원본에서 **딱 한 줄**만 다른가
//   - 금지된 우회(인덱스 재생성 · DO NOTHING · 예외 삼키기 · 권한 확대)가 없는가
//   - 사전확인·사후확인·트랜잭션이 들어 있는가
//   - 014 기준선과 017 검증의 원본이 그대로인가
//
// ⚠ 이 파일은 SQL 을 실행하지 않는다. 통과가 DB 실행 성공을 뜻하지 않는다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const readRaw = (p: string) => readFileSync(join(ROOT, p))
const sha = (p: string) => createHash('sha256').update(readRaw(p)).digest('hex')
const NL = String.fromCharCode(10)

const INSTALL = 'docs/sql/쌍둥이_설치.sql'
const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const MIGRATION = 'docs/sql/migrations/021_fix_practice_publication_conflict.sql'
const PATCH = 'PATCH_PUBLICATION_021.sql'
const RUNBOOK = 'PATCH_RUNBOOK_021.md'

const OLD_LINE = 'on conflict (practice_id)'
const NEW_LINE = 'on conflict (practice_id) where practice_id is not null'

/** 줄바꿈만 맞춘다 — 패치의 [2] 비교와 같은 기준 */
const lf = (s: string) => s.replace(/\r/g, '')

/** dollar-quote 로 감싼 상수를 꺼낸다 */
function dollarConst(sql: string, tag: string): string {
  const open = `$${tag}$`
  const a = sql.indexOf(open)
  assert.ok(a >= 0, `${open} 를 찾지 못했습니다`)
  const b = sql.indexOf(open, a + open.length)
  assert.ok(b > a, `${open} 의 닫는 짝을 찾지 못했습니다`)
  return sql.slice(a + open.length, b)
}

/** 설치 SQL 에서 게시 함수의 선언부와 본문을 떠 온다 */
function installedFunction(): { head: string; body: string } {
  const s = read(INSTALL)
  const start = s.indexOf('create function public.admin_set_practice_publication(')
  assert.ok(start >= 0, '설치 SQL 에서 게시 함수를 찾지 못했습니다')
  const tag = '$fn$'
  const b0 = s.indexOf(tag, start) + tag.length
  const b1 = s.indexOf(tag, b0)
  assert.ok(b1 > b0)
  return { head: lf(s.slice(start, b0 - tag.length)), body: lf(s.slice(b0, b1)) }
}

// ════════════════════════════════════════════════════════════════════
// 두 패치 파일과 원본 보존
// ════════════════════════════════════════════════════════════════════

test('PATCH_PUBLICATION_021.sql 과 migration 파일은 바이트까지 같다 (§112)', () => {
  assert.deepEqual(readRaw(PATCH), readRaw(MIGRATION))
  assert.equal(sha(PATCH), sha(MIGRATION))
})

test('과거 원본은 그대로다 — 이미 고쳐져 있던 것처럼 만들지 않았다 (§143)', () => {
  const frozen: Record<string, string> = {
    'INSTALL_TO_RUN_014.sql': 'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0',
    [INSTALL]: 'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0',
    'POSTINSTALL_TO_RUN_017.sql': '4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb',
    [VERIFY]: '4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb',
    'POSTINSTALL_TO_RUN_016.sql': 'fbbf52b78006393e6b8c9c537707cbd9910557601300785426220d8af67b27ad',
    'POSTINSTALL_TO_RUN_014.sql': '3f4949d1f9e11bc02dc73ea25e10b8f5685b13776f9bba6b7e83435a6bbe9dc7',
    'PREFLIGHT_TO_RUN_010.sql': '723419f0f998c43ee97c96666cafca8e2274f7b3c4de22ec445cb0d8fbf2023a',
    'PREFLIGHT_COUNTS_TO_RUN_012.sql': '4aad024c0cdcb94df76197ae80b4d29e303f884f12b5d63e533cb580494fcc11',
  }
  for (const [p, h] of Object.entries(frozen)) {
    assert.equal(sha(p), h, `${p} 가 바뀌었습니다`)
  }
})

test('설치 SQL 에는 문제의 그 줄이 **그대로 남아 있다** (역사를 바꾸지 않는다)', () => {
  const { body } = installedFunction()
  const lines = body.split(NL).map(l => l.trim())
  assert.equal(lines.filter(l => l === OLD_LINE).length, 1,
    '014 기준선은 고치지 않는다. 고칠 곳은 021 패치다')
  assert.equal(lines.filter(l => l === NEW_LINE).length, 0)
})

test('021 번호의 설치·검증·전체 rollback SQL 을 만들지 않았다 (§150)', () => {
  for (const p of ['INSTALL_TO_RUN_021.sql', 'POSTINSTALL_TO_RUN_021.sql', 'ROLLBACK_021.sql']) {
    assert.throws(() => readRaw(p), `${p} 를 만들면 안 됩니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 패치가 「원본 + 그 한 줄」인가
// ════════════════════════════════════════════════════════════════════

test('패치가 담은 c_orig 는 설치 SQL 의 본문과 글자까지 같다', () => {
  const { body } = installedFunction()
  assert.equal(dollarConst(read(PATCH), 'orig'), body,
    '패치의 원본 본문이 설치 SQL 과 다릅니다 — 옮겨 적다 틀렸을 수 있습니다')
})

test('패치의 선언부는 설치 SQL 의 선언부에 create or replace 만 붙인 것이다', () => {
  const { head } = installedFunction()
  const expected = head.replace('create function ', 'create or replace function ')
    .replace(/as\s*$/, '').replace(/\n+$/, '')
  assert.equal(dollarConst(read(PATCH), 'head'), expected)
})

test('c_fixed 는 c_orig 에서 **딱 한 줄**만 다르다', () => {
  const s = read(PATCH)
  const orig = dollarConst(s, 'orig').split(NL)
  const fixed = dollarConst(s, 'fixed').split(NL)
  assert.equal(fixed.length, orig.length, '줄 수가 달라졌습니다')
  const diff = orig.map((l, i) => [i, l, fixed[i]] as const).filter(([, a, b]) => a !== b)
  assert.equal(diff.length, 1, `달라진 줄이 ${diff.length}개입니다: ` + JSON.stringify(diff))
  assert.equal(diff[0][1].trim(), OLD_LINE)
  assert.equal(diff[0][2].trim(), NEW_LINE)
})

test('WHERE 는 do update 앞의 conflict target 에 붙는다 (§91)', () => {
  const fixed = dollarConst(read(PATCH), 'fixed')
  const i = fixed.indexOf(NEW_LINE)
  assert.ok(i > 0)
  const rest = fixed.slice(i + NEW_LINE.length)
  assert.match(rest.trimStart(), /^do update set/,
    'conflict target 뒤에 곧바로 do update 가 와야 합니다 (SET 뒤의 WHERE 와 혼동 금지)')
})

test('인덱스 조건과 게시문 조건이 같은 뜻으로 적혀 있다', () => {
  const install = read(INSTALL)
  assert.match(install, /create unique index tla_practice_uidx[\s\S]{0,120}where practice_id is not null;/)
  assert.ok(dollarConst(read(PATCH), 'fixed').includes('where practice_id is not null'))
})

// ════════════════════════════════════════════════════════════════════
// 금지한 우회를 쓰지 않았는가 (§98~§105)
// ════════════════════════════════════════════════════════════════════

test('패치는 인덱스·제약·권한·RLS 를 건드리지 않는다', () => {
  // 주석은 설명에 같은 낱말을 쓰므로 실행문만 본다
  const exec = read(PATCH).split(NL)
    .filter(l => !l.trimStart().startsWith('--')).join(NL).toLowerCase()
  const banned = [
    'drop index', 'create index', 'create unique index',
    'alter table', 'alter policy', 'create policy', 'drop policy',
    'drop function', 'grant ', 'revoke ',
    'on conflict on constraint', 'do nothing',
    'truncate', 'delete from', 'alter function',
  ]
  for (const b of banned) {
    assert.ok(!exec.includes(b), `패치에 ${b} 가 있습니다 — 금지된 우회입니다`)
  }
})

test('패치는 42P10 을 삼키지 않는다 — 실패는 실패로 남는다', () => {
  const exec = read(PATCH).split(NL)
    .filter(l => !l.trimStart().startsWith('--')).join(NL)
  // 게시문의 오류를 잡아 넘기는 handler 가 없어야 한다
  assert.ok(!/exception\s+when/i.test(exec),
    '패치에 exception handler 가 있습니다 — 실패를 삼킬 수 있습니다')
  assert.ok(/raise exception/i.test(exec), '확인 실패 시 예외를 내야 합니다')
  assert.ok(!/42P10/i.test(exec), '실행문에서 42P10 을 특별 취급하지 않습니다')
})

test('패치는 게시 함수를 시험 호출하지 않는다 (§137)', () => {
  // 순서가 중요하다 — **상수를 먼저 떼고** 그 뒤에 주석을 걷는다.
  // 거꾸로 하면 c_orig 안의 `-- D-064` 같은 주석이 먼저 사라져 상수가 더 이상
  // 원문과 일치하지 않고, `.replace` 가 아무것도 지우지 못한다. 실제로 그렇게 실패했다.
  const raw = read(PATCH)
  const withoutConsts = raw
    .replace(dollarConst(raw, 'orig'), '')
    .replace(dollarConst(raw, 'fixed'), '')
    .split(NL).filter(l => !l.trimStart().startsWith('--')).join(NL)
  assert.ok(!withoutConsts.includes('D-064'), '상수를 떼어내지 못했습니다 — 검사가 무의미해집니다')
  assert.ok(!/perform\s+public\.admin_set_practice_publication/i.test(withoutConsts))
  assert.ok(!/select\s+public\.admin_set_practice_publication/i.test(withoutConsts))
  // 운영 데이터를 고르지 않는다
  assert.ok(!/from\s+public\.students/i.test(withoutConsts))
  assert.ok(!/from\s+ai_question_private\./i.test(withoutConsts))
})

test('패치는 임시 표도 영구 백업 표도 만들지 않는다 (§136)', () => {
  const exec = read(PATCH).split(NL)
    .filter(l => !l.trimStart().startsWith('--')).join(NL).toLowerCase()
  assert.ok(!exec.includes('create temp table'))
  assert.ok(!exec.includes('create table'))
})

// ════════════════════════════════════════════════════════════════════
// 트랜잭션·사전확인·사후확인이 들어 있는가 (§114·§128~§132)
// ════════════════════════════════════════════════════════════════════

test('패치는 begin ... commit 하나이고 timeout 을 건다', () => {
  const exec = read(PATCH).split(NL)
    .filter(l => !l.trimStart().startsWith('--')).join(NL)
  assert.equal((exec.match(/^begin;$/gm) ?? []).length, 1)
  assert.equal((exec.match(/^commit;$/gm) ?? []).length, 1)
  assert.equal((exec.match(/^rollback;$/gm) ?? []).length, 0,
    '검증 SQL 과 달리 이 패치는 커밋해야 한다 (§130)')
  assert.match(exec, /set local lock_timeout/)
  assert.match(exec, /set local statement_timeout/)
  assert.ok(exec.indexOf('begin;') < exec.indexOf('commit;'))
})

test('사전확인이 시그니처·본문·인덱스를 모두 본다 (§118~§121)', () => {
  const s = read(PATCH)
  // 시그니처
  assert.match(s, /p\.pronargs = 2/)
  assert.match(s, /proargtypes\[0\] = 'pg_catalog\.uuid'::regtype/)
  assert.match(s, /proargtypes\[1\] = 'pg_catalog\.bool'::regtype/)
  assert.match(s, /proargnames = array\['p_practice_problem_id','p_publish'\]/)
  assert.match(s, /prorettype = 'pg_catalog\.void'::regtype/)
  assert.match(s, /lanname = 'plpgsql'/)
  assert.match(s, /p\.prosecdef/)
  assert.match(s, /search_path=/)
  // 본문 — 두 가지 알려진 정의와만 비교하고, 그 밖이면 중단
  assert.match(s, /v_norm = c_fixed/)
  assert.match(s, /v_norm = c_orig/)
  assert.match(s, /알려진 정의와 다릅니다/)
  // 인덱스 — 이름만이 아니라 유효성·키·조건까지
  assert.match(s, /indisunique/)
  assert.match(s, /indisvalid/)
  assert.match(s, /indisready/)
  assert.match(s, /indimmediate/)
  assert.match(s, /indisexclusion/)
  assert.match(s, /\(practice_id IS NOT NULL\)/)
})

test('본문 비교는 줄바꿈만 맞춘다 — 공백·주석을 지우지 않는다 (§119)', () => {
  const s = read(PATCH)
  assert.match(s, /replace\(coalesce\(v_src, ''\), chr\(13\), ''\)/)
  // 공백·주석을 걷어내는 정규화가 없어야 한다
  assert.ok(!/regexp_replace\s*\(\s*v_src/i.test(s))
  assert.ok(!/btrim\s*\(\s*v_src/i.test(s))
  assert.ok(!/lower\s*\(\s*v_src/i.test(s))
})

test('NULL 때문에 확인이 건너뛰어지지 않는다 (§122)', () => {
  const s = read(PATCH)
  assert.match(s, /coalesce\(v_cnt, 0\)/)
  assert.match(s, /coalesce\(v_idx\.indisunique, false\)/)
  assert.match(s, /coalesce\(v_idx\.indisexclusion, true\)/)
  assert.match(s, /is distinct from/)
})

test('사후확인이 OID·소유자·ACL·속성·RLS 를 대조한다 (§132)', () => {
  const s = read(PATCH)
  assert.match(s, /v_oid_after is distinct from v_oid_before/)
  assert.match(s, /v_owner_after is distinct from v_owner_before/)
  assert.match(s, /v_acl_after is distinct from v_acl_before/)
  assert.match(s, /v_fn_after is distinct from v_fn_before/)
  assert.match(s, /v_rls_after is distinct from v_rls_before/)
  assert.match(s, /relrowsecurity/)
  assert.match(s, /pg_policy/)
})

test('이미 수정본이면 already_applied 로 끝낸다 (§135)', () => {
  const s = read(PATCH)
  assert.match(s, /already_applied/)
  const i = s.indexOf("v_state = 'already_applied'")
  const j = s.indexOf('execute v_ddl')
  assert.ok(i > 0 && j > i, 'already_applied 판정이 DDL 실행보다 앞에 있어야 합니다')
})

// ════════════════════════════════════════════════════════════════════
// 런북과 미승인 표시 (§149·§214)
// ════════════════════════════════════════════════════════════════════

test('런북이 적용 경로 두 가지와 **미승인**을 분명히 적는다', () => {
  const r = read(RUNBOOK)
  assert.match(r, /미승인/)
  assert.match(r, /기존 운영/)
  assert.match(r, /새 설치/)
  assert.match(r, /014/)
  assert.match(r, /021/)
  assert.match(r, /017/)
})

test('패치 파일 첫머리에 운영 실행 미승인이라고 적혀 있다 (§220)', () => {
  const firstLines = read(PATCH).split(NL).slice(0, 12).join(NL)
  assert.match(firstLines, /미승인/)
})

test('과거 런북을 고쳐 이미 수정돼 있던 것처럼 만들지 않았다 (§149)', () => {
  const old = read('INSTALL_RUNBOOK_014.md')
  assert.ok(!old.includes('021'), 'INSTALL_RUNBOOK_014.md 에 021 을 끼워 넣지 않는다')
  assert.ok(!old.includes(NEW_LINE))
})

// ════════════════════════════════════════════════════════════════════
// 로컬 PostgreSQL 시험이 저장소에 실제로 있는가
// ════════════════════════════════════════════════════════════════════

test('실제 런타임 대조 시험과 합성 기반 스키마가 저장소에 있다 (§215)', () => {
  const t = read('lib/twin/pgtest/exec021.pg.test.ts')
  for (const id of ['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8']) {
    assert.ok(t.includes(id + ' '), `${id} 시험이 없습니다`)
  }
  // 정적 검사기나 SQLite 를 PostgreSQL 이라고 하지 않는다 (§175)
  const h = read('lib/twin/pgtest/harness.ts')
  assert.match(h, /embedded-postgres/)
  assert.ok(!/sqlite|duckdb/i.test(h))
  assert.match(h, /server_version/)
  // 대역이 무엇인지 적혀 있다 (§196)
  const base = read('docs/sql/pgtest/합성기반_스키마.sql')
  assert.match(base, /대역/)
  assert.match(base, /증거가 아니다/)
})

test('로컬 시험은 운영 자원을 쓰지 않는다', () => {
  for (const p of ['lib/twin/pgtest/harness.ts', 'lib/twin/pgtest/exec021.pg.test.ts',
                   'docs/sql/pgtest/합성기반_스키마.sql', 'docs/sql/pgtest/합성데이터.sql']) {
    const s = read(p)
    assert.ok(!/supabase\.co/i.test(s), `${p} 에 운영 URL 이 있습니다`)
    assert.ok(!/sb_secret|service_role_key|SERVICE_ROLE_KEY/i.test(s), `${p} 에 키가 있습니다`)
    assert.ok(!/process\.env\.(NEXT_PUBLIC_)?SUPABASE/i.test(s), `${p} 가 운영 환경변수를 읽습니다`)
  }
})
