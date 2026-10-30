// GPT-EXEC-017 회귀 테스트 — 016 검수 지적(R016-01~04) 보완
//
// 실행: npm run test:twin
//
// 016 의 회귀 테스트는 **검사를 건너뛰고 있었다.**
//   - 주석을 지운 뒤 주석 안의 표식(`4-8)`)을 찾아 전부 -1 → `continue`
//   - `[5-나]` 의 42501 판정은 **파일 어디엔가** 있으면 통과
//   그 결과 `[4-8]` 의 reset role 을 지워도, `[5-나]` 판정문을 지워도 20/20 통과했다.
//
// 이번에는 감사 로직을 `verifySqlAudit.ts` 로 꺼내 **순수 함수**로 만들고,
// 일부러 망가뜨린 SQL 을 넣어 **감사기가 정말 잡는지** 확인한다 (변이 테스트).
// 변이는 메모리 문자열에만 적용한다. 배포·실행용 SQL 은 건드리지 않는다 (§93).
//
// ⚠ 정적 검사다. PostgreSQL 런타임 통과를 뜻하지 않는다 (§170).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import {
  auditVerifySql, findSections, formatIssues,
  INTENTIONAL_PRIVATE_PROBE, type AuditCode,
} from './verifySqlAudit'

const ROOT = join(__dirname, '..', '..')
const readRaw = (p: string) => readFileSync(join(ROOT, p))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const sha256 = (p: string) => createHash('sha256').update(readRaw(p)).digest('hex')
const NL = String.fromCharCode(10)

const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const RUN_017 = 'POSTINSTALL_TO_RUN_017.sql'
const RUN_016 = 'POSTINSTALL_TO_RUN_016.sql'
const RUN_014 = 'POSTINSTALL_TO_RUN_014.sql'
const INSTALL = 'docs/sql/쌍둥이_설치.sql'

/** 017 시점의 불변 해시 (§18 · §24) */
const INSTALL_SHA = 'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0'
const RUN_016_SHA = 'fbbf52b78006393e6b8c9c537707cbd9910557601300785426220d8af67b27ad'
const RUN_014_SHA = '3f4949d1f9e11bc02dc73ea25e10b8f5685b13776f9bba6b7e83435a6bbe9dc7'
const COUNTS_012_SHA = '4aad024c0cdcb94df76197ae80b4d29e303f884f12b5d63e533cb580494fcc11'
const PRECHECK_010_SHA = '723419f0f998c43ee97c96666cafca8e2274f7b3c4de22ec445cb0d8fbf2023a'

// ════════════════════════════════════════════════════════════════════
// R016-02 A·B — 구간 경계를 원본에서 찾고, 없으면 실패한다
// ════════════════════════════════════════════════════════════════════

test('구간 표식 8개를 원본에서 모두 찾는다 (주석을 지우기 전에)', () => {
  const { ranges, issues } = findSections(read(VERIFY))
  assert.deepEqual(issues, [], formatIssues(issues))
  assert.deepEqual(ranges.map(r => r.name),
    ['[4-6]', '[4-7]', '[4-8]', '[4-9]', '[4-10]', '[4-11]', '[4-12]'])
  // 순서가 실제로 증가하는지
  for (let i = 1; i < ranges.length; i++) {
    assert.ok(ranges[i].start > ranges[i - 1].start, `${ranges[i].name} 순서가 뒤집혔습니다`)
  }
})

test('현행 검증 SQL 이 역할 경계 감사를 통과한다', () => {
  const issues = auditVerifySql(read(VERIFY))
  assert.deepEqual(issues, [], NL + formatIssues(issues))
})

test('실행용 017 파일도 같은 감사를 통과한다', () => {
  assert.deepEqual(auditVerifySql(read(RUN_017)), [])
})

// ════════════════════════════════════════════════════════════════════
// R016-02 D — 변이 탐지: 필수 요소를 지우면 **반드시** 실패해야 한다
// ════════════════════════════════════════════════════════════════════

/** 원본 SQL 문자열에 변이를 적용한다. 파일은 건드리지 않는다 */
function mutate(replace: (s: string) => string): string {
  const before = read(VERIFY)
  const after = replace(before)
  assert.notEqual(after, before, '변이가 실제로 적용되지 않았습니다 (앵커 불일치)')
  return after
}

/**
 * 감사기가 이 변이를 **잡았는지** 확인한다.
 *
 * 어떤 코드로 잡는지는 구간마다 다르다 — 예를 들어 `[4-8]` 은 private 조회가 없고
 * 판정문만 있어서 `verdict_while_in_role` 로 걸린다. 중요한 것은 **놓치지 않는 것**이므로
 * 허용 코드 목록 중 하나라도 나오면 통과로 본다. 빈 목록이면 실패다.
 */
function expectCaught(sql: string, codes: AuditCode[], what: string) {
  const issues = auditVerifySql(sql)
  assert.ok(issues.length > 0,
    `${what} — 감사기가 아무것도 잡지 못했습니다 (016 의 실패가 재현됩니다)`)
  assert.ok(issues.some(i => codes.includes(i.code)),
    `${what} — 기대한 ${codes.join('|')} 가 없습니다. 실제:${NL}${formatIssues(issues)}`)
}

/** 구간 안의 n번째 `reset role;` 을 지운다 */
function dropResetIn(sql: string, marker: string, nth = 1): string {
  const lines = sql.split(NL)
  const start = lines.findIndex(l => l.includes(marker))
  assert.ok(start > 0, `${marker} 를 찾지 못했습니다`)
  let seen = 0
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*reset\s+role\s*;/i.test(lines[i].replace(/\r/g, ''))) {
      seen++
      if (seen === nth) { lines.splice(i, 1); break }
    }
  }
  return lines.join(NL)
}

test('변이: [4-8] 의 reset role 을 지우면 잡는다 (016 은 못 잡았다)', () => {
  const bad = mutate(s => dropResetIn(s, '-- ── 4-8)'))
  expectCaught(bad, ['private_while_in_role', 'verdict_while_in_role', 'role_left_open'],
    '[4-8] reset role 삭제')
})

test('변이: [5-나] 의 42501 판정문을 지우면 잡는다 (016 은 못 잡았다)', () => {
  // 파일 다른 곳에도 같은 문장이 7곳 있다. 그래서 **구간 안**을 봐야 한다.
  const bad = mutate(s => {
    const lines = s.split(NL)
    const start = lines.findIndex(l => l.includes('authenticated 가 private 스키마에 접근하면 안 된다'))
    assert.ok(start > 0)
    const at = lines.findIndex((l, i) =>
      i > start && /if\s+v_sqlstate\s*<>\s*'42501'\s+then/i.test(l))
    assert.ok(at > 0, '[5-나] 의 42501 판정을 찾지 못했습니다')
    lines.splice(at, 1)
    return lines.join(NL)
  })
  expectCaught(bad, ['sqlstate_check_missing'], '[5-나] 42501 판정 삭제')
})

test('변이: [4-9] 중간 RPC 의 역할 복원을 지우면 잡는다', () => {
  // RPC 를 묶어 부르게 되는 셈이다 (R016-03 이 없애려던 모양)
  const bad = mutate(s => dropResetIn(s, '-- ── 4-9)'))
  expectCaught(bad, ['admin_rpc_not_closed', 'role_overwritten', 'private_while_in_role'],
    '[4-9] 중간 reset role 삭제')
})

test('변이: [4-11] 중간 RPC 의 역할 복원을 지우면 잡는다', () => {
  const bad = mutate(s => dropResetIn(s, '-- ── 4-11)'))
  expectCaught(bad, ['admin_rpc_not_closed', 'role_overwritten', 'private_while_in_role'],
    '[4-11] 중간 reset role 삭제')
})

test('변이: 구간 표식을 지우면 잡는다 (016 은 조용히 건너뛰었다)', () => {
  const bad = mutate(s => s.replace('-- ── 4-8)', '-- ── (지움)'))
  expectCaught(bad, ['section_missing'], '[4-8] 표식 삭제')
})

test('변이: claims 설정을 지우면 잡는다', () => {
  const bad = mutate(s => {
    const lines = s.split(NL)
    const start = lines.findIndex(l => l.includes('-- ── 4-6)'))
    const at = lines.findIndex((l, i) => i > start && l.includes("set_config('request.jwt.claims'"))
    assert.ok(at > 0)
    lines.splice(at, 2)   // set_config 는 두 줄이다
    return lines.join(NL)
  })
  expectCaught(bad, ['admin_rpc_without_claims'], '[4-6] claims 삭제')
})

test('변이: service_role 로 관리자 RPC 를 우회하면 잡는다', () => {
  const bad = mutate(s => {
    const lines = s.split(NL)
    const start = lines.findIndex(l => l.includes('-- ── 4-9)'))
    const at = lines.findIndex((l, i) => i > start && /^\s*set local role authenticated;/.test(l))
    assert.ok(at > 0)
    lines[at] = '  set local role service_role;'
    return lines.join(NL)
  })
  expectCaught(bad, ['admin_rpc_wrong_role'], '[4-9] service_role 우회')
})

test('변이: 역할을 켠 채 파일 끝에서 한 번만 되돌리면 잡는다', () => {
  // 016 의 "파일 전체 set/reset 개수 비교" 는 이걸 통과시켰다
  const bad = mutate(s => {
    const lines = s.split(NL)
    const start = lines.findIndex(l => l.includes('-- ── 4-10)'))
    const at = lines.findIndex((l, i) => i > start && /^\s*reset\s+role\s*;/i.test(l))
    assert.ok(at > 0)
    lines.splice(at, 1)
    return lines.join(NL)
  })
  const issues = auditVerifySql(bad)
  assert.ok(issues.some(i => i.code === 'private_while_in_role' || i.code === 'role_overwritten'),
    `잡지 못했습니다:${NL}${formatIssues(issues)}`)
})

test('변이: [5-나] 의 의도적 접근 시도를 지우면 잡는다', () => {
  const bad = mutate(s => s.replace(INTENTIONAL_PRIVATE_PROBE, 'perform 1'))
  expectCaught(bad, ['probe_missing'], '[5-나] 접근 시도 삭제')
})

test('변이: [5-나] 의 성공 경로 판정을 지우면 잡는다', () => {
  const bad = mutate(s => {
    const lines = s.split(NL)
    const start = lines.findIndex(l => l.includes('authenticated 가 private 스키마에 접근하면 안 된다'))
    const at = lines.findIndex((l, i) =>
      i > start && /if\s+v_sqlstate\s*=\s*'__NO_ERROR__'\s+then/i.test(l))
    assert.ok(at > 0)
    lines.splice(at, 1)
    return lines.join(NL)
  })
  expectCaught(bad, ['success_path_missing'], '[5-나] 성공 판정 삭제')
})

test('정상 SQL 은 어떤 변이도 없이 통과한다 (거짓 양성이 없다)', () => {
  assert.deepEqual(auditVerifySql(read(VERIFY)), [])
  assert.deepEqual(auditVerifySql(read(RUN_017)), [])
})

// ════════════════════════════════════════════════════════════════════
// R016-03 — RPC 마다 경계를 닫는다
// ════════════════════════════════════════════════════════════════════

test('[4-9] 가 RPC 2개를 각각 독립 경계로 부른다', () => {
  const { ranges } = findSections(read(VERIFY))
  const r = ranges.find(x => x.name === '[4-9]')!
  const body = read(VERIFY).split(NL).slice(r.start, r.end)
  const sets = body.filter(l => /^\s*set local role authenticated;/.test(l)).length
  const resets = body.filter(l => /^\s*reset role;/.test(l)).length
  const rpcs = body.filter(l => /public\.admin_\w+\s*\(/.test(l)).length
  assert.equal(rpcs, 2, `[4-9] 의 관리자 RPC 가 ${rpcs}개입니다`)
  assert.equal(sets, 2, `RPC 마다 역할을 켜야 합니다 (set ${sets}회)`)
  assert.equal(resets, 2, `RPC 마다 되돌려야 합니다 (reset ${resets}회)`)
})

test('[4-11] 이 RPC 3개를 각각 독립 경계로 부른다', () => {
  const { ranges } = findSections(read(VERIFY))
  const r = ranges.find(x => x.name === '[4-11]')!
  const body = read(VERIFY).split(NL).slice(r.start, r.end)
  const sets = body.filter(l => /^\s*set local role authenticated;/.test(l)).length
  const resets = body.filter(l => /^\s*reset role;/.test(l)).length
  const rpcs = body.filter(l => /public\.admin_\w+\s*\(/.test(l)).length
  assert.equal(rpcs, 3, `[4-11] 의 관리자 RPC 가 ${rpcs}개입니다`)
  assert.equal(sets, 3)
  assert.equal(resets, 3)
})

test('[3] 의 음성 권한 검사는 건드리지 않았다 (§70)', () => {
  const s = read(VERIFY)
  for (const m of ['[3-가]', '[3-나]', '[3-다]', '[3-라]', '[3-마]', '[3-바]']) {
    assert.ok(s.includes(m), `${m} 가 사라졌습니다`)
  }
  // 학생·anon 이 일부러 admin_*/server_* 를 부르는 음성 시나리오가 남아 있다
  assert.ok(s.includes("set local role anon;"))
  assert.ok(s.includes('42501'))
})

// ════════════════════════════════════════════════════════════════════
// R016-01 — 테스트가 읽는 저장소 파일이 모두 묶음에 들어가는가
// ════════════════════════════════════════════════════════════════════

/** 테스트 파일들이 `read('...')` 로 읽는 저장소 경로를 모두 뽑는다 */
function filesReadByTests(): string[] {
  const testFiles = [
    'lib/twin/exec006.test.ts', 'lib/twin/exec007.test.ts', 'lib/twin/exec008.test.ts',
    'lib/twin/exec009.test.ts', 'lib/twin/exec010.test.ts', 'lib/twin/exec012.test.ts',
    'lib/twin/exec014.test.ts', 'lib/twin/exec016.test.ts', 'lib/twin/exec017.test.ts',
    'lib/twin/exec018.test.ts', 'lib/twin/exec019.test.ts',
    'lib/twin/exec021.test.ts', 'lib/twin/exec025.test.ts',
    'lib/twin/exec028.test.ts', 'lib/twin/exec029.test.ts',
    'lib/twin/exec030.test.ts', 'lib/twin/exec032.test.ts', 'lib/twin/exec033.test.ts', 'lib/twin/exec034.test.ts',
    'lib/twin/exec036.test.ts', 'lib/twin/exec037.test.ts', 'lib/twin/exec038.test.ts', 'lib/twin/exec040.test.ts', 'lib/twin/exec041.test.ts', 'lib/twin/exec042.test.ts', 'lib/twin/exec043.test.ts',
    'lib/twin/exec044.test.ts',
    'lib/twin/exec045.test.ts',
    'lib/twin/twin.test.ts', 'lib/twin/repo.test.ts',
  ]
  const found = new Set<string>()
  for (const f of testFiles) {
    const src = read(f)
    // read('...') / readRaw('...') 의 리터럴 인자
    //
    // R017-02: 예전 패턴 `\breadRaw?\(` 는 `readRa(`·`readRaw(` 만 잡고
    // **`read(` 를 놓쳤다.** 그래서 `read('lib/twin/pipeline.ts')` 같은 8개 경로가
    // 수집되지 않았다. `read(?:Raw)?` 로 두 이름을 모두 잡는다.
    for (const m of src.matchAll(/\bread(?:Raw)?\(\s*'([^']+)'\s*\)/g)) found.add(m[1])
    // 상수로 선언한 경로
    for (const m of src.matchAll(/=\s*'((?:docs|lib|app|components|prompts)\/[^']+)'/g)) found.add(m[1])
    for (const m of src.matchAll(/=\s*'([A-Z][A-Z0-9_]*\.(?:sql|json|md))'/g)) found.add(m[1])
  }
  // 경로처럼 생긴 것만 남긴다. 테스트 소스의 `'...'` 같은 문자열이 섞이지 않게 한다
  return [...found]
    .filter(f => /\.(sql|json|md|ts|tsx)$/.test(f))
    .sort()
}

test('테스트가 읽는 저장소 파일 목록을 뽑아낼 수 있다', () => {
  const files = filesReadByTests()
  assert.ok(files.length > 10, `${files.length}개밖에 못 찾았습니다`)
  // 016 에서 빠졌던 세 파일이 목록에 들어 있어야 한다
  for (const f of [RUN_014, 'PREFLIGHT_COUNTS_TO_RUN_012.sql', 'PREFLIGHT_TO_RUN_010.sql']) {
    assert.ok(files.includes(f), `${f} 를 목록에서 찾지 못했습니다`)
  }
})

test('테스트가 읽는 파일이 모두 실제로 존재한다', () => {
  const missing: string[] = []
  for (const f of filesReadByTests()) {
    try { readRaw(f) } catch { missing.push(f) }
  }
  assert.deepEqual(missing, [], `없는 파일: ${missing.join(' ')}`)
})

test('테스트가 읽는 파일이 모두 MANIFEST 에 들어 있다 (R016-01)', () => {
  // 016 은 manifest 49/49 통과했지만 **테스트 입력 3개가 묶음에 없었다.**
  // 해시 일치는 "적힌 것이 온전한가" 일 뿐 "필요한 것이 다 있는가" 가 아니다.
  // R017-02: 예전 판은 `catch { return }` 로 manifest 부재를 **성공 처리**했다.
  // 없으면 실패다. 개발 중 잠깐 없는 상황을 위해 모드를 두지 않았다 —
  // 모드를 두면 최종 로그가 어느 모드에서 나왔는지 매번 확인해야 하고,
  // 그 확인을 빠뜨리는 것이 바로 016·017 에서 두 번 겪은 실패 방식이다.
  let manifest: string
  try {
    manifest = read('MANIFEST.sha256')
  } catch {
    assert.fail('MANIFEST.sha256 가 없습니다 — 묶음 점검은 부재를 통과시키지 않습니다')
  }
  const listed = new Set(
    manifest.split(NL)
      .map(l => l.replace(/^[0-9a-f]{64}\s+\*?/, '').trim())
      .filter(l => l !== ''),
  )
  const missing = filesReadByTests().filter(f => !listed.has(f))
  assert.deepEqual(missing, [], `MANIFEST 에 없는 테스트 입력: ${missing.join(' ')}`)
})

// ════════════════════════════════════════════════════════════════════
// §5 — 현행 실행 파일과 과거 기록본
// ════════════════════════════════════════════════════════════════════

test('POSTINSTALL_TO_RUN_017.sql 이 현행 공식 검증 SQL 과 바이트 동일하다', () => {
  const a = readRaw(VERIFY)
  const b = readRaw(RUN_017)
  assert.equal(a.length, b.length)
  assert.ok(a.equals(b))
  assert.equal(sha256(VERIFY), sha256(RUN_017))
})

test('과거 기록본 해시가 그대로다 (016 · 014)', () => {
  assert.equal(sha256(RUN_016), RUN_016_SHA, '016 기록본이 바뀌었습니다')
  assert.equal(sha256(RUN_014), RUN_014_SHA, '014 기록본이 바뀌었습니다')
})

test('과거 기록본은 현행 공식 SQL 과 다르다 (실수 실행 방지)', () => {
  assert.notEqual(sha256(RUN_016), sha256(VERIFY))
  assert.notEqual(sha256(RUN_014), sha256(VERIFY))
})

test('설치 SQL 은 변경 금지 해시 그대로다 (§18)', () => {
  assert.equal(sha256(INSTALL), INSTALL_SHA)
  assert.equal(sha256('INSTALL_TO_RUN_014.sql'), INSTALL_SHA)
})

test('과거 사전점검·계수조회 실행본 해시가 그대로다', () => {
  assert.equal(sha256('PREFLIGHT_TO_RUN_010.sql'), PRECHECK_010_SHA)
  assert.equal(sha256('PREFLIGHT_COUNTS_TO_RUN_012.sql'), COUNTS_012_SHA)
})

test('017 실행본이 placeholder 0 · BEGIN 시작 · ROLLBACK 끝 · COMMIT 0 이다', () => {
  const s = read(RUN_017)
  for (const t of ['PUT-', 'UUID-HERE', '<<', 'TODO:', 'YOUR-']) {
    assert.ok(!s.includes(t), `${t} 가 남아 있습니다`)
  }
  const exec = s.split(NL)
    .map(l => l.replace(/\r/g, '').replace(/--.*$/, '').trim())
    .filter(l => l !== '')
  assert.equal(exec[0], 'begin;')
  assert.equal(exec[exec.length - 1], 'rollback;')
  const noOnCommit = exec.join(NL).replace(/on\s+commit\s+drop/gi, ' ')
  assert.equal((noOnCommit.match(/\bcommit\b/gi) ?? []).length, 0)
})

test('017 에 설치·설치제거 구문이 섞여 있지 않다 (§158)', () => {
  const code = read(RUN_017).split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
  assert.ok(!/create\s+schema\s+ai_question_private/i.test(code))
  assert.ok(!/drop\s+function\s+if\s+exists/i.test(code))
  assert.ok(!/drop\s+schema/i.test(code))
})

test('INSTALL_TO_RUN_017.sql 과 ROLLBACK_017.sql 을 만들지 않았다 (§157)', () => {
  for (const f of ['INSTALL_TO_RUN_017.sql', 'ROLLBACK_017.sql']) {
    let exists = true
    try { readRaw(f) } catch { exists = false }
    assert.equal(exists, false, `${f} 가 있습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 권한을 완화하지 않았다
// ════════════════════════════════════════════════════════════════════

test('검증 SQL 이 권한·RLS 를 바꾸지 않는다', () => {
  const code = read(VERIFY).split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
  for (const w of ['grant', 'revoke', 'alter policy', 'drop policy', 'alter table']) {
    assert.ok(!new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'i').test(code),
      `검증 SQL 에 ${w} 가 있습니다`)
  }
})

test('검증 항목 25개가 그대로다', () => {
  const s = read(VERIFY)
  for (const m of ['[1]', '[2]', '[3-가]', '[3-나]', '[3-다]', '[3-라]', '[3-마]', '[3-바]',
                   '[4-1]', '[4-2]', '[4-3]', '[4-4]', '[4-5]', '[4-6]', '[4-7]',
                   '[4-8]', '[4-9]', '[4-10]', '[4-11]', '[4-12]', '[4-13]', '[4-14]',
                   '[5-가]', '[5-나]', '[5-다]']) {
    assert.ok(s.includes(m), `${m} 가 사라졌습니다`)
  }
})

test('uuid 를 출력문에 싣지 않는다', () => {
  const code = read(VERIFY).split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
  for (const m of code.matchAll(/raise\s+(?:notice|exception)[^;]*;/gi)) {
    for (const v of ['v_admin', 'v_stu', 'admin_uid_text', 'student_uid_text']) {
      assert.ok(!m[0].includes(v), `출력문에 ${v} 가 실립니다`)
    }
  }
})
