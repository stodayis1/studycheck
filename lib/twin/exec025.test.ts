// GPT-EXEC-025 정적 회귀 — 025 패치가 「021 + 양쪽 줄끝 처리」인지 본다
//
// 실행: npm run test:twin   (PostgreSQL 없이 도는 검사다)
//
// 실제 런타임 대조는 `lib/twin/pgtest/exec025.pg.test.ts` 가 진짜 PostgreSQL 에서
// **입력 자체를 CRLF 로 보내** 한다. 여기서 보는 것은 파일의 모양뿐이다.
//   - 두 파일이 바이트까지 같은가
//   - 담긴 원본 본문이 설치 SQL 과 글자까지 같은가 (옮겨 적다 틀리지 않았는가)
//   - 수정본이 원본에서 **딱 한 줄**만 다른가 (업무 로직은 021 과 같다)
//   - **입력 상수와 DB 본문 양쪽에** 같은 줄끝 처리를 하는가  ← 021 이 빠뜨린 그 지점
//   - 단독 CR 을 지워서 통과시키지 않는가
//   - 느슨한 정규화(공백 삭제·주석 제거·btrim·lower·유사도)를 쓰지 않는가
//   - 금지된 우회(인덱스 재생성 · DO NOTHING · 예외 삼키기 · 권한 확대)가 없는가
//   - 운영 OID·서버 버전을 박아 넣지 않았는가
//   - 014·017·021 원본이 그대로인가
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
const CR = String.fromCharCode(13)

const INSTALL = 'docs/sql/쌍둥이_설치.sql'
const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const MIGRATION = 'docs/sql/migrations/025_fix_publication_patch_line_endings.sql'
const PATCH = 'PATCH_PUBLICATION_025.sql'
const PATCH_021 = 'PATCH_PUBLICATION_021.sql'
const RUNBOOK = 'PATCH_RUNBOOK_025.md'

const OLD_LINE = 'on conflict (practice_id)'
const NEW_LINE = 'on conflict (practice_id) where practice_id is not null'

const lf = (s: string) => s.split(CR + NL).join(NL)

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
  const b0 = s.indexOf('$fn$', start) + 4
  const b1 = s.indexOf('$fn$', b0)
  assert.ok(b1 > b0)
  return { head: lf(s.slice(start, b0 - 4)), body: lf(s.slice(b0, b1)) }
}

/** 주석을 뺀 실행문만. **상수를 먼저 떼고** 나서 주석을 걷는다 */
function execLines(): string {
  const raw = read(PATCH)
  const stripped = raw
    .replace(dollarConst(raw, 'orig'), '')
    .replace(dollarConst(raw, 'fixed'), '')
  assert.ok(!stripped.includes('D-064'), '상수를 떼어내지 못했습니다 — 검사가 무의미해집니다')
  return stripped.split(NL).filter(l => !l.trimStart().startsWith('--')).join(NL)
}

// ════════════════════════════════════════════════════════════════════
// 두 파일과 원본 보존
// ════════════════════════════════════════════════════════════════════

test('PATCH_PUBLICATION_025.sql 과 migration 파일은 바이트까지 같다', () => {
  assert.deepEqual(readRaw(PATCH), readRaw(MIGRATION))
  assert.equal(sha(PATCH), sha(MIGRATION))
})

test('025 파일 자체는 LF-only 다', () => {
  assert.ok(!read(PATCH).includes(CR), '패치 파일에 CR 이 있습니다')
})

test('014·017·021 원본은 그대로다 — 이력을 바꾸지 않았다 (§123)', () => {
  const frozen: Record<string, string> = {
    'INSTALL_TO_RUN_014.sql': 'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0',
    [INSTALL]: 'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0',
    'POSTINSTALL_TO_RUN_017.sql': '4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb',
    [VERIFY]: '4c913d8d4beef1fb8247afee5e31084d7163b5cafe9271ecea613bbffccb5deb',
    [PATCH_021]: '7bf1a27297df43d13c530be13b389210ea1e36fb6f3671443f5624dbcd13de1e',
    'docs/sql/migrations/021_fix_practice_publication_conflict.sql':
      '7bf1a27297df43d13c530be13b389210ea1e36fb6f3671443f5624dbcd13de1e',
    'POSTINSTALL_TO_RUN_016.sql': 'fbbf52b78006393e6b8c9c537707cbd9910557601300785426220d8af67b27ad',
    'POSTINSTALL_TO_RUN_014.sql': '3f4949d1f9e11bc02dc73ea25e10b8f5685b13776f9bba6b7e83435a6bbe9dc7',
    'PREFLIGHT_TO_RUN_010.sql': '723419f0f998c43ee97c96666cafca8e2274f7b3c4de22ec445cb0d8fbf2023a',
    'PREFLIGHT_COUNTS_TO_RUN_012.sql': '4aad024c0cdcb94df76197ae80b4d29e303f884f12b5d63e533cb580494fcc11',
  }
  for (const [p, h] of Object.entries(frozen)) {
    assert.equal(sha(p), h, `${p} 가 바뀌었습니다`)
  }
})

test('설치 SQL 에는 문제의 그 줄이 그대로 남아 있다 (기준선을 고치지 않는다)', () => {
  const lines = installedFunction().body.split(NL).map(l => l.trim())
  assert.equal(lines.filter(l => l === OLD_LINE).length, 1)
  assert.equal(lines.filter(l => l === NEW_LINE).length, 0)
})

test('025 번호의 설치·검증·전체 rollback SQL 을 만들지 않았다 (§140)', () => {
  for (const p of ['INSTALL_TO_RUN_025.sql', 'POSTINSTALL_TO_RUN_025.sql', 'ROLLBACK_025.sql']) {
    assert.throws(() => readRaw(p), `${p} 를 만들면 안 됩니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 「021 + 그 한 줄」인가 — 업무 로직은 021 과 같다 (§104)
// ════════════════════════════════════════════════════════════════════

test('025 의 c_orig 는 설치 SQL 의 본문과 글자까지 같다', () => {
  assert.equal(dollarConst(read(PATCH), 'orig'), installedFunction().body)
})

test('025 의 c_orig·c_fixed 는 021 의 것과 같다 — 업무 변경이 늘지 않았다', () => {
  const a = read(PATCH), b = read(PATCH_021)
  assert.equal(dollarConst(a, 'orig'), dollarConst(b, 'orig'))
  assert.equal(dollarConst(a, 'fixed'), dollarConst(b, 'fixed'))
  assert.equal(dollarConst(a, 'head'), dollarConst(b, 'head'))
})

test('c_fixed 는 c_orig 에서 **딱 한 줄**만 다르다', () => {
  const s = read(PATCH)
  const orig = dollarConst(s, 'orig').split(NL)
  const fixed = dollarConst(s, 'fixed').split(NL)
  assert.equal(fixed.length, orig.length)
  const diff = orig.map((l, i) => [i, l, fixed[i]] as const).filter(([, a, b]) => a !== b)
  assert.equal(diff.length, 1, `달라진 줄이 ${diff.length}개입니다: ` + JSON.stringify(diff))
  assert.equal(diff[0][1].trim(), OLD_LINE)
  assert.equal(diff[0][2].trim(), NEW_LINE)
})

test('WHERE 는 do update 앞의 conflict target 에 붙는다', () => {
  const fixed = dollarConst(read(PATCH), 'fixed')
  const i = fixed.indexOf(NEW_LINE)
  assert.ok(i > 0)
  assert.match(fixed.slice(i + NEW_LINE.length).trimStart(), /^do update set/)
})

// ════════════════════════════════════════════════════════════════════
// ★ 이번 수정의 핵심 — 양쪽에 같은 줄끝 처리 (§82~§95)
// ════════════════════════════════════════════════════════════════════

test('CRLF 쌍만 LF 로 바꾼다 — chr(13)||chr(10) → chr(10)', () => {
  const s = read(PATCH)
  assert.match(s, /k_crlf\s+constant\s+text\s*:=\s*chr\(13\)\s*\|\|\s*chr\(10\)/)
  assert.match(s, /k_lf\s+constant\s+text\s*:=\s*chr\(10\)/)
  assert.match(s, /k_cr\s+constant\s+text\s*:=\s*chr\(13\)/)
  // 021 처럼 CR 을 **전부 지우는** 방식이 아니어야 한다.
  //
  // 실행문만 본다 — 이 패치의 머리말은 021 의 잘못된 코드를 **설명으로 인용**하고 있어서,
  // 원문 전체에 걸면 제 설명에 제 검사가 걸린다. 016·017·021 에서 겪은 그 방식이다.
  assert.ok(!/replace\([^)]*chr\(13\)\s*,\s*''\s*\)/.test(execLines()),
    "CR 을 빈 문자열로 지우고 있습니다 — 단독 CR 을 몰래 삼키게 됩니다")
  // 머리말에는 021 의 코드가 인용돼 있어야 한다 (왜 고쳤는지 읽을 수 있게)
  assert.match(s, /021\s*:\s*v_norm := replace/)
})

test('입력 상수 세 개를 모두 정규화한다 — 021 이 빠뜨린 그 단계', () => {
  const s = read(PATCH)
  for (const v of ['c_head', 'c_orig', 'c_fixed']) {
    assert.match(s, new RegExp(`${v}\\s*:=\\s*replace\\(${v}_in,\\s*k_crlf,\\s*k_lf\\)`),
      `${v} 를 정규화하지 않습니다`)
  }
  // 원문 상수는 `_in` 으로만 받고, 비교·DDL 에는 정규화한 것만 쓴다
  for (const v of ['c_head_in', 'c_orig_in', 'c_fixed_in']) {
    const uses = s.split(v).length - 1
    assert.equal(uses, 2, `${v} 가 선언·정규화 외에 ${uses - 2}번 더 쓰입니다`)
  }
})

test('DB 본문도 같은 기준으로 정규화한다 — 사전·사후 두 곳 모두', () => {
  const s = read(PATCH)
  const hits = s.match(/replace\(coalesce\((?:v_src|p\.prosrc),\s*''\),\s*k_crlf,\s*k_lf\)/g) ?? []
  assert.equal(hits.length, 2, `DB 본문 정규화가 ${hits.length}곳입니다 (사전·사후 2곳이어야 합니다)`)
})

test('비교·DDL·사후검사가 전부 정규화한 상수를 쓴다', () => {
  const s = read(PATCH)
  assert.match(s, /v_norm = c_fixed/)      // 사전 — already_applied
  assert.match(s, /v_norm = c_orig/)       // 사전 — needs_patch
  assert.match(s, /quote_literal\(c_fixed\)/)  // 교체
  assert.match(s, /v_norm <> c_fixed/)     // 사후
  assert.match(s, /v_ddl := c_head \|\| k_lf \|\| 'as ' \|\| quote_literal\(c_fixed\)/)
})

test('단독 CR 은 지우지 않고 미지원으로 막는다 — 입력·본문·교체 후 세 곳 (§94)', () => {
  const s = read(PATCH)
  const guards = s.match(/position\(k_cr in [^)]+\) > 0/g) ?? []
  assert.ok(guards.length >= 4,
    `단독 CR 검사가 ${guards.length}곳뿐입니다 (입력 3개 + DB 본문 + 교체 후)`)
  assert.ok(s.includes('position(k_cr in c_head)'))
  assert.ok(s.includes('position(k_cr in c_orig)'))
  assert.ok(s.includes('position(k_cr in c_fixed)'))
  assert.ok(s.includes('position(k_cr in v_norm)'))
  assert.equal((s.match(/단독 CR/g) ?? []).length >= 3, true)
})

test('느슨한 정규화를 쓰지 않는다 (§98)', () => {
  const s = execLines()
  for (const bad of ['btrim(', 'lower(', 'upper(', 'regexp_replace', 'normalize(',
                     'similarity', 'levenshtein', 'translate(']) {
    assert.ok(!s.includes(bad), `패치 실행문에 ${bad} 가 있습니다 — 비교가 느슨해집니다`)
  }
  // 공백·주석을 걷어내는 replace 가 없어야 한다
  assert.ok(!/replace\([^)]*,\s*' '\s*,\s*''\s*\)/.test(s), '공백을 지우고 있습니다')
  assert.ok(!/replace\([^)]*,\s*'--'/.test(s), '주석을 지우고 있습니다')
})

test('운영 body_raw 를 새 기대값으로 자동 학습하지 않는다', () => {
  const s = execLines()
  // 기대값은 파일 안의 고정 상수뿐이다. DB 에서 읽은 것을 기대값에 대입하지 않는다
  assert.ok(!/c_orig\s*:=\s*v_(src|norm)/.test(s))
  assert.ok(!/c_fixed\s*:=\s*v_(src|norm)/.test(s))
  assert.ok(!/c_(orig|fixed)\s*:=\s*(select|p\.prosrc)/i.test(s))
})

test('운영 OID 나 서버 버전을 박아 넣지 않았다 (§117)', () => {
  const s = read(PATCH)
  // 024 진단에 나온 값들. 함수는 시그니처로만 찾아야 한다
  for (const v of ['20914', '20905', '17.6']) {
    assert.ok(!s.includes(v), `운영 진단 값 ${v} 가 패치에 있습니다`)
  }
  assert.ok(!/p\.oid\s*=\s*\d/.test(s), 'OID 를 직접 지정하고 있습니다')
  assert.match(s, /p\.proname = 'admin_set_practice_publication'/)
})

// ════════════════════════════════════════════════════════════════════
// 금지한 우회 (§115)
// ════════════════════════════════════════════════════════════════════

test('인덱스·제약·권한·RLS·테이블을 건드리지 않는다', () => {
  const s = execLines().toLowerCase()
  for (const b of ['drop index', 'create index', 'create unique index',
                   'alter table', 'alter policy', 'create policy', 'drop policy',
                   'drop function', 'alter function', 'grant ', 'revoke ',
                   'on conflict on constraint', 'do nothing',
                   'truncate', 'delete from', 'create table', 'create temp table']) {
    assert.ok(!s.includes(b), `패치에 ${b} 가 있습니다 — 금지된 우회입니다`)
  }
})

test('실패를 삼키지 않는다', () => {
  const s = execLines()
  assert.ok(!/exception\s+when/i.test(s), 'exception handler 가 있습니다')
  assert.ok(/raise exception/i.test(s), '확인 실패 시 예외를 내야 합니다')
  assert.ok(!/42P10/i.test(s), '42P10 을 특별 취급하지 않습니다')
})

test('게시 함수를 시험 호출하지 않고 운영 데이터를 고르지 않는다', () => {
  const s = execLines()
  assert.ok(!/(perform|select)\s+public\.admin_set_practice_publication/i.test(s))
  assert.ok(!/from\s+public\.students/i.test(s))
  assert.ok(!/from\s+ai_question_private\./i.test(s))
})

// ════════════════════════════════════════════════════════════════════
// 트랜잭션·사전확인·사후확인 (§113~§114)
// ════════════════════════════════════════════════════════════════════

test('begin ... commit 하나이고 timeout 을 건다', () => {
  const s = execLines()
  assert.equal((s.match(/^begin;$/gm) ?? []).length, 1)
  assert.equal((s.match(/^commit;$/gm) ?? []).length, 1)
  assert.equal((s.match(/^rollback;$/gm) ?? []).length, 0)
  assert.match(s, /set local lock_timeout/)
  assert.match(s, /set local statement_timeout/)
  assert.ok(s.indexOf('begin;') < s.indexOf('commit;'))
})

test('사전확인이 시그니처·본문·인덱스를 모두 본다', () => {
  const s = read(PATCH)
  assert.match(s, /p\.pronargs = 2/)
  assert.match(s, /proargtypes\[0\] = 'pg_catalog\.uuid'::regtype/)
  assert.match(s, /proargtypes\[1\] = 'pg_catalog\.bool'::regtype/)
  assert.match(s, /proargnames = array\['p_practice_problem_id','p_publish'\]/)
  assert.match(s, /prorettype = 'pg_catalog\.void'::regtype/)
  assert.match(s, /lanname = 'plpgsql'/)
  assert.match(s, /p\.prosecdef/)
  assert.match(s, /search_path=/)
  assert.match(s, /알려진 두 정의와 다릅니다/)
  for (const f of ['indisunique', 'indisvalid', 'indisready', 'indimmediate', 'indisexclusion']) {
    assert.match(s, new RegExp(f))
  }
  assert.match(s, /\(practice_id IS NOT NULL\)/)
})

test('사후확인이 OID·소유자·ACL·속성·RLS 를 대조한다', () => {
  const s = read(PATCH)
  for (const g of ['v_oid_after is distinct from v_oid_before',
                   'v_owner_after is distinct from v_owner_before',
                   'v_acl_after is distinct from v_acl_before',
                   'v_fn_after is distinct from v_fn_before',
                   'v_rls_after is distinct from v_rls_before']) {
    assert.ok(s.includes(g), `${g} 가 없습니다`)
  }
  assert.match(s, /relrowsecurity/)
  assert.match(s, /pg_policy/)
})

test('NULL 때문에 확인이 건너뛰어지지 않는다', () => {
  const s = read(PATCH)
  assert.match(s, /coalesce\(v_cnt, 0\)/)
  assert.match(s, /coalesce\(v_idx\.indisunique, false\)/)
  assert.match(s, /coalesce\(v_idx\.indisexclusion, true\)/)
  assert.match(s, /is distinct from/)
})

test('이미 수정본이면 already_applied 로 끝낸다', () => {
  const s = read(PATCH)
  assert.match(s, /already_applied/)
  const i = s.indexOf("v_state = 'already_applied'")
  const j = s.indexOf('execute v_ddl')
  assert.ok(i > 0 && j > i, 'already_applied 판정이 DDL 실행보다 앞에 있어야 합니다')
})

test('불일치 메시지가 「누가 바꿨다」고 단정하지 않는다 (§119)', () => {
  const s = read(PATCH)
  const i = s.indexOf('알려진 두 정의와 다릅니다')
  const msg = s.slice(i, i + 400)
  assert.match(msg, /전달 과정/, '전달 과정의 변형 가능성을 함께 적어야 합니다')
  assert.ok(!/누가 무엇을 바꿨/.test(msg), '변경을 단정하는 문구가 남아 있습니다')
})

// ════════════════════════════════════════════════════════════════════
// 런북과 미승인 표시
// ════════════════════════════════════════════════════════════════════

test('런북이 적용 경로 두 가지와 **미승인**을 분명히 적는다 (§135)', () => {
  const r = read(RUNBOOK)
  for (const w of ['미승인', '기존 운영', '새 설치', '014', '025', '017', 'already_applied']) {
    assert.ok(r.includes(w), `런북에 "${w}" 가 없습니다`)
  }
  // 021 을 먼저 실행할 필요가 없다는 점
  assert.match(r, /021/)
})

test('패치 파일 첫머리에 운영 실행 미승인이라고 적혀 있다', () => {
  assert.match(read(PATCH).split(NL).slice(0, 12).join(NL), /미승인/)
})

test('과거 런북을 고쳐 이미 수정돼 있던 것처럼 만들지 않았다', () => {
  for (const p of ['INSTALL_RUNBOOK_014.md', 'PATCH_RUNBOOK_021.md']) {
    assert.ok(!read(p).includes('025'), `${p} 에 025 를 끼워 넣지 않는다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 로컬 PostgreSQL 시험이 실제로 CRLF 를 보내는가 (§170)
// ════════════════════════════════════════════════════════════════════

test('PG 시험이 네 조합을 모두 돌린다', () => {
  const t = read('lib/twin/pgtest/exec025.pg.test.ts')
  for (const id of ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'B4', 'C ', 'D ', 'E ', 'F ', 'G ', 'H ', 'I ']) {
    assert.ok(t.includes(id), `${id} 시험이 없습니다`)
  }
  assert.match(t, /db: 'lf', input: 'lf'/)
  assert.match(t, /db: 'crlf', input: 'lf'/)
  assert.match(t, /db: 'lf', input: 'crlf'/)
  assert.match(t, /db: 'crlf', input: 'crlf'/)
})

test('PG 시험이 보내기 전에 CR 을 지우지 않는다 — 입력 통계를 남긴다', () => {
  const t = read('lib/twin/pgtest/exec025.pg.test.ts')
  // 입력 통계 기록
  assert.match(t, /inputStats\(/)
  assert.match(t, /st\.cr > 50/)
  assert.match(t, /assert\.equal\(st\.cr, st\.lf/)
  // 보내기 직전에 LF 로 되돌리는 전처리가 없어야 한다
  assert.ok(!/await p\.q\(toLF\(/.test(t), '보내기 직전에 CR 을 지우고 있습니다')
  assert.ok(!/\.replace\([^)]*k_?cr[^)]*,\s*''\)/i.test(t), '시험이 CR 을 지우고 보냅니다')
  const h = read('lib/twin/pgtest/harness.ts')
  assert.match(h, /export const toCRLF/)
  assert.match(h, /export async function installBaselineAs/)
})

test('로컬 시험은 운영 자원을 쓰지 않는다', () => {
  for (const p of ['lib/twin/pgtest/harness.ts', 'lib/twin/pgtest/exec025.pg.test.ts',
                   'docs/sql/pgtest/합성기반_스키마.sql', 'docs/sql/pgtest/합성데이터.sql']) {
    const s = read(p)
    assert.ok(!/supabase\.co/i.test(s), `${p} 에 운영 URL 이 있습니다`)
    assert.ok(!/sb_secret|service_role_key|SERVICE_ROLE_KEY/i.test(s), `${p} 에 키가 있습니다`)
    assert.ok(!/process\.env\.(NEXT_PUBLIC_)?SUPABASE/i.test(s), `${p} 가 운영 환경변수를 읽습니다`)
  }
})
