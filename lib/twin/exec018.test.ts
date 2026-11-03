// GPT-EXEC-018 회귀 테스트 — R017-01 (실행 의미 감사) · R017-02 (입력 수집)
//
// 실행: npm run test:twin
//
// GPT 검수가 017 감사기를 **세 가지 변이로 뚫었다.**
//   1. `[5-나]` 42501 판정을 `/* ... */` 로 감쌈        → 97/97 통과 (놓침)
//   2. `[5-나]` 역할을 `service_role` 로 바꿈            → 97/97 통과 (놓침)
//   3. 비42501 실패문을 `RAISE EXCEPTION` → `NOTICE`     → 97/97 통과 (놓침)
//   추가로 역할 전환문 삭제, 판정을 dollar-quoted 문자열로 옮기기도 놓쳤다.
//
// 원인은 하나다 — **줄 주석만 지우고 블록 주석·문자열을 코드로 셌다.**
// `sqlTokens.ts` 가 어휘를 제대로 가르고, `verifySqlAudit.ts` 가 실행 순서를 본다.
//
// 이 파일은 그 변이들을 **assert 로** 재현해, 감사기가 잡는 것을 확인한다.
// 변이는 메모리 문자열에만 적용한다. 배포·실행용 SQL 은 건드리지 않는다 (§152).
//
// ⚠ 정적 검사다. PostgreSQL 런타임 통과를 뜻하지 않는다 (§139).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { auditVerifySql, formatIssues, type AuditCode } from './verifySqlAudit'
import { tokenizeSql, ifBody } from './sqlTokens'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const RUN_017 = 'POSTINSTALL_TO_RUN_017.sql'

const sql = () => read(VERIFY)

// ════════════════════════════════════════════════════════════════════
// 어휘 분해 — 주석·문자열은 코드가 아니다 (§52)
// ════════════════════════════════════════════════════════════════════

test('줄 주석 안의 실행문을 코드로 세지 않는다', () => {
  const { code } = tokenizeSql("select 1;" + NL + "-- raise exception 'x';" + NL)
  assert.ok(code.includes('select 1;'))
  assert.ok(!/raise/i.test(code))
})

test('블록 주석 안의 실행문을 코드로 세지 않는다 (중첩 포함)', () => {
  const a = tokenizeSql("select 1; /* raise exception 'x'; */ select 2;")
  assert.ok(!/raise/i.test(a.code))
  assert.ok(a.code.includes('select 1;') && a.code.includes('select 2;'))

  const b = tokenizeSql("/* 바깥 /* 안쪽 raise exception */ 아직 주석 */ select 3;")
  assert.ok(!/raise/i.test(b.code), '중첩 주석을 못 다룹니다')
  assert.ok(b.code.includes('select 3;'))
})

test('닫히지 않은 주석·문자열은 조용히 통과시키지 않는다 (§59)', () => {
  assert.ok(tokenizeSql('select 1; /* 안 닫힘').errors.length > 0)
  assert.ok(tokenizeSql("select 'anj").errors.length > 0)
  assert.ok(tokenizeSql('select $q$ 안 닫힘').errors.length > 0)
})

test('문자열 안의 실행문을 코드로 세지 않는다', () => {
  const a = tokenizeSql("select 'raise exception dummy';")
  assert.ok(!/raise/i.test(a.code))
  const b = tokenizeSql("select $p$ if x then raise exception 'y'; end if; $p$;")
  assert.ok(!/raise/i.test(b.code), 'dollar-quoted 문자열을 코드로 셉니다')
})

test('문자열 값을 잃지 않는다 — 구조 안에서 상수를 확인할 수 있다 (§56)', () => {
  const { literals } = tokenizeSql("if v <> '42501' then raise exception 'x'; end if;")
  assert.ok(literals.some(l => l.value === '42501'), "'42501' 값을 잃었습니다")
})

test('PL/pgSQL 본문과 그 안의 문자열을 구분한다 (§57)', () => {
  const src = 'do $t$ begin raise exception $inner$ 문자열 $inner$; end; $t$;'
  const { code } = tokenizeSql(src)
  // 본문은 코드로 남는다
  assert.ok(/begin/i.test(code) && /raise/i.test(code), '본문 전체를 문자열로 지웠습니다')
  // 안쪽 dollar-quote 는 문자열이라 사라진다
  assert.ok(!code.includes('문자열'))
})

test('마스킹 결과가 원문과 길이·줄 수가 같다 (줄 번호 보존)', () => {
  const src = sql()
  const { code } = tokenizeSql(src)
  assert.equal(code.length, src.length)
  assert.equal(code.split(NL).length, src.split(NL).length)
})

test('실제 검증 SQL 을 어휘 분해할 수 있다', () => {
  const { errors } = tokenizeSql(sql())
  assert.deepEqual(errors, [], errors.join(' / '))
})

test('ifBody 가 중첩 if 를 세어 본문을 잡는다', () => {
  const src = 'if a then if b then x; end if; raise exception 1; end if;'
  const at = src.indexOf('if')
  const body = ifBody(src, at)
  assert.ok(body)
  const text = src.slice(body!.from, body!.to)
  assert.ok(text.includes('raise exception'), '중첩 if 에서 본문을 잘못 잘랐습니다')
})

// ════════════════════════════════════════════════════════════════════
// 정상 대조군
// ════════════════════════════════════════════════════════════════════

test('정상 검증 SQL 은 감사를 통과한다 (거짓 양성 없음)', () => {
  const issues = auditVerifySql(sql())
  assert.deepEqual(issues, [], NL + formatIssues(issues))
})

test('실행용 017 파일도 감사를 통과한다', () => {
  assert.deepEqual(auditVerifySql(read(RUN_017)), [])
})

// ════════════════════════════════════════════════════════════════════
// 변이 — GPT 가 뚫은 것들 (§76)
// ════════════════════════════════════════════════════════════════════

/** `[5-나]` 구간의 줄 범위 */
function naSlice(s: string): { lines: string[]; from: number; to: number } {
  const lines = s.split(NL)
  const from = lines.findIndex(l =>
    l.includes('authenticated 가 private 스키마에 접근하면 안 된다'))
  assert.ok(from > 0, '[5-나] 시작을 찾지 못했습니다')
  const to = lines.findIndex((l, i) => i > from && /\$t\$\s*;/.test(l))
  assert.ok(to > from, '[5-나] 끝을 찾지 못했습니다')
  return { lines, from, to }
}

/** 감사기가 이 변이를 잡았는지 확인한다 */
function expectCaught(mutated: string, codes: AuditCode[], what: string) {
  assert.notEqual(mutated, sql(), `${what} — 변이가 적용되지 않았습니다`)
  const issues = auditVerifySql(mutated)
  assert.ok(issues.length > 0,
    `${what} — 감사기가 아무것도 잡지 못했습니다 (GPT 가 재현한 실패가 그대로입니다)`)
  assert.ok(issues.some(i => codes.includes(i.code)),
    `${what} — 기대한 ${codes.join('|')} 가 없습니다. 실제:${NL}${formatIssues(issues)}`)
}

function findInNa(s: string, re: RegExp): { lines: string[]; at: number; to: number } {
  const { lines, from, to } = naSlice(s)
  const at = lines.findIndex((l, i) => i > from && i < to && re.test(l))
  assert.ok(at > 0, `[5-나] 안에서 ${re} 를 찾지 못했습니다`)
  return { lines, at, to }
}

test('변이 GPT1: 42501 판정을 블록 주석으로 감싸면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /if v_sqlstate <> '42501' then/)
  const endAt = lines.findIndex((l, i) => i > at && /^\s*end if;/.test(l))
  lines.splice(endAt + 1, 0, '*/')
  lines.splice(at, 0, '/*')
  expectCaught(lines.join(NL), ['sqlstate_check_missing'], 'GPT1 블록 주석')
})

test('변이 GPT2: [5-나] 역할을 service_role 로 바꾸면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /set local role authenticated;/)
  lines[at] = '  set local role service_role;'
  expectCaught(lines.join(NL), ['probe_wrong_role'], 'GPT2 역할 변경')
})

test('변이 GPT3: 비42501 실패문을 notice 로 약화하면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /if v_sqlstate <> '42501' then/)
  lines[at + 1] = lines[at + 1].replace('raise exception', 'raise notice')
  expectCaught(lines.join(NL), ['verdict_not_exception'], 'GPT3 notice 약화')
})

test('변이 GPT4: [5-나] 역할 전환문을 지우면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /set local role authenticated;/)
  lines.splice(at, 1)
  expectCaught(lines.join(NL), ['probe_wrong_role'], 'GPT4 역할 전환 삭제')
})

test('변이 GPT5: 판정을 dollar-quoted 문자열 안으로 옮기면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /if v_sqlstate <> '42501' then/)
  const endAt = lines.findIndex((l, i) => i > at && /^\s*end if;/.test(l))
  lines.splice(endAt + 1, 0, '$probe$;')
  lines.splice(at, 0, '  perform $probe$')
  expectCaught(lines.join(NL), ['sqlstate_check_missing'], 'GPT5 dollar-quoted')
})

test('변이: 성공 sentinel 대입을 지우면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /v_sqlstate := '__NO_ERROR__';/)
  lines.splice(at, 1)
  expectCaught(lines.join(NL), ['sentinel_missing'], 'sentinel 삭제')
})

test('변이: 실제 sqlstate 수집을 상수 대입으로 바꾸면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /v_sqlstate := sqlstate;/)
  lines[at] = "    v_sqlstate := '42501';"
  expectCaught(lines.join(NL), ['sqlstate_not_collected'], 'sqlstate 상수 대입')
})

test('변이: 실제 sqlstate 수집을 지우면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /v_sqlstate := sqlstate;/)
  lines.splice(at, 1)
  expectCaught(lines.join(NL), ['sqlstate_not_collected'], 'sqlstate 수집 삭제')
})

test('변이: reset 을 접근 앞으로 옮기면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /^\s*reset role;/)
  const line = lines[at]
  lines.splice(at, 1)
  const roleAt = lines.findIndex(l => /set local role authenticated;/.test(l)
    && lines.indexOf(l) > 0)
  const { from } = naSlice(lines.join(NL))
  const naRoleAt = lines.findIndex((l, i) => i > from && /set local role authenticated;/.test(l))
  void roleAt
  lines.splice(naRoleAt, 0, line)
  expectCaught(lines.join(NL), ['probe_after_reset', 'sqlstate_check_misplaced'],
    'reset 위치 이동')
})

test('변이: 성공 판정 EXCEPTION 을 약화하면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /if v_sqlstate = '__NO_ERROR__' then/)
  lines[at + 1] = lines[at + 1].replace('raise exception', 'raise notice')
  expectCaught(lines.join(NL), ['verdict_not_exception'], '성공 판정 약화')
})

test('변이: 성공 판정 자체를 지우면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /if v_sqlstate = '__NO_ERROR__' then/)
  lines.splice(at, 3)
  expectCaught(lines.join(NL), ['success_path_missing'], '성공 판정 삭제')
})

test('변이: 의도적 접근 시도를 지우면 잡는다', () => {
  const { lines, at } = findInNa(sql(), /perform 1 from ai_question_private/)
  lines[at] = '    perform 1;'
  expectCaught(lines.join(NL), ['probe_missing'], '접근 시도 삭제')
})

// ── [4] 관리자 RPC 경계도 여전히 잡는가 (§91) ──────────────────────

test('변이: [4-8] reset role 삭제를 여전히 잡는다', () => {
  const lines = sql().split(NL)
  const start = lines.findIndex(l => l.includes('-- ── 4-8)'))
  const at = lines.findIndex((l, i) => i > start && /^\s*reset role;/.test(l))
  lines.splice(at, 1)
  expectCaught(lines.join(NL),
    ['private_while_in_role', 'verdict_while_in_role', 'role_left_open'],
    '[4-8] reset 삭제')
})

test('변이: [4-9] RPC 를 묶어 부르면 잡는다', () => {
  const lines = sql().split(NL)
  const start = lines.findIndex(l => l.includes('-- ── 4-9)'))
  const at = lines.findIndex((l, i) => i > start && /^\s*reset role;/.test(l))
  lines.splice(at, 1)
  expectCaught(lines.join(NL),
    ['admin_rpc_not_closed', 'role_overwritten', 'private_while_in_role'],
    '[4-9] RPC 묶어 부르기')
})

test('변이: 구간 표식을 지우면 잡는다', () => {
  expectCaught(sql().replace('-- ── 4-8)', '-- ── (지움)'),
    ['section_missing'], '표식 삭제')
})

test('변이: 구간 표식이 중복되면 잡는다 (§58)', () => {
  const lines = sql().split(NL)
  const at = lines.findIndex(l => l.includes('-- ── 4-8)'))
  lines.splice(at + 1, 0, lines[at])
  expectCaught(lines.join(NL), ['section_duplicated'], '표식 중복')
})

test('[3] 의 음성 권한 검사를 양성 규칙으로 오인하지 않는다 (§91)', () => {
  // [3] 에서는 **일부러** anon·학생으로 관리자 RPC 를 부른다. 위반이 아니다.
  const issues = auditVerifySql(sql())
  assert.deepEqual(issues.filter(i => i.section.startsWith('[3')), [])
  const s = sql()
  for (const m of ['[3-가]', '[3-나]', '[3-다]', '[3-라]', '[3-마]', '[3-바]']) {
    assert.ok(s.includes(m), `${m} 가 사라졌습니다`)
  }
  assert.ok(s.includes('set local role anon;'))
})

// ════════════════════════════════════════════════════════════════════
// R017-02 — 입력 경로 수집이 놓쳤던 8개
// ════════════════════════════════════════════════════════════════════

/** `exec017.test.ts` 의 수집기와 같은 규칙 (여기서 독립으로 한 번 더 본다) */
function collectReadPaths(): string[] {
  const testFiles = [
    'lib/twin/exec006.test.ts', 'lib/twin/exec007.test.ts', 'lib/twin/exec008.test.ts',
    'lib/twin/exec009.test.ts', 'lib/twin/exec010.test.ts', 'lib/twin/exec012.test.ts',
    'lib/twin/exec014.test.ts', 'lib/twin/exec016.test.ts', 'lib/twin/exec017.test.ts',
    'lib/twin/exec018.test.ts', 'lib/twin/twin.test.ts', 'lib/twin/repo.test.ts',
  ]
  const found = new Set<string>()
  for (const f of testFiles) {
    const src = read(f)
    for (const m of src.matchAll(/\bread(?:Raw)?\(\s*'([^']+)'\s*\)/g)) found.add(m[1])
    for (const m of src.matchAll(/=\s*'((?:docs|lib|app|components|prompts)\/[^']+)'/g)) found.add(m[1])
    for (const m of src.matchAll(/=\s*'([A-Z][A-Z0-9_]*\.(?:sql|json|md))'/g)) found.add(m[1])
  }
  return [...found].filter(f => /\.(sql|json|md|ts|tsx)$/.test(f)).sort()
}

test('read( 로 읽는 경로 8개가 수집 결과에 실제로 들어온다 (R017-02)', () => {
  const got = collectReadPaths()
  const missed = [
    'INSTALL_RUNBOOK_014.md',
    'app/teacher/twin-review/page.tsx',
    'lib/twin/generate.ts',
    'lib/twin/pipeline.ts',
    'lib/twin/repository.ts',
    'lib/twin/storage.ts',
    'lib/twin/targets.ts',
    'prompts/twin-gen-v1.1.md',
  ]
  const still = missed.filter(f => !got.includes(f))
  assert.deepEqual(still, [], `여전히 놓칩니다: ${still.join(' ')}`)
})

test('옛 정규식이 read( 를 놓쳤음을 재현한다', () => {
  // 고친 것이 실제로 달라졌음을 보인다 — 설명만 바꾼 것이 아니다 (§101)
  const src = read('lib/twin/exec017.test.ts')
  const old = [...src.matchAll(/\breadRaw?\(\s*'([^']+)'\s*\)/g)].map(m => m[1])
  const now = [...src.matchAll(/\bread(?:Raw)?\(\s*'([^']+)'\s*\)/g)].map(m => m[1])
  assert.ok(now.length > old.length,
    `고친 정규식이 더 잡아야 합니다 (옛 ${old.length} / 새 ${now.length})`)
})

test('수집한 파일이 모두 실제로 존재한다', () => {
  const missing = collectReadPaths().filter(f => {
    try { read(f); return false } catch { return true }
  })
  assert.deepEqual(missing, [], `없는 파일: ${missing.join(' ')}`)
})

test('manifest 부재를 통과로 처리하지 않는다 (R017-02)', () => {
  // 주석에 옛 패턴을 인용해 둘 수 있으므로 **주석을 걸러내고** 본다.
  // SQL 감사기에서 배운 것과 같은 규칙이다 — 주석은 코드가 아니다.
  const src = read('lib/twin/exec017.test.ts')
    .split(NL)
    .filter(l => !l.trim().startsWith('//'))
    .join(NL)
  assert.ok(!/catch\s*\{\s*return\s*\}/.test(src),
    'manifest 부재를 조용히 통과시키는 catch 가 남아 있습니다')
  assert.ok(src.includes('MANIFEST.sha256 가 없습니다'),
    'manifest 부재를 실패로 알리는 문구가 없습니다')
})

test('exec016 의 옛 무효 검사가 실검사로 바뀌었다 (§93)', () => {
  const src = read('lib/twin/exec016.test.ts')
  // 주석을 지운 뒤 표식을 찾고 continue 하던 검사가 남아 있으면 안 된다
  assert.ok(!/if \(start < 0\) continue/.test(src),
    '아무것도 확인하지 않는 continue 가 남아 있습니다')
  assert.ok(src.includes('auditVerifySql'),
    'exec016 이 현재 검증기에 위임하지 않습니다')
})
