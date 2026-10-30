// GPT-EXEC-019 회귀 테스트 — R018-01 · R018-02 (고정 기대 토큰 대조)
//
// 실행: npm run test:twin
//
// 018 검수가 018 감사기를 다섯 가지로 더 뚫었다. 전부 이 저장소에서 재현했다.
//   sentinel 대입을 주석 처리 · 두 번째 `set local role` 추가 · 같은 조회 2회 ·
//   판정을 `if false then` 안으로 · RESET 을 exception handler 안으로
//
// 017·018 은 「이 조건도 확인하자」를 하나씩 붙였고, 그때마다 새 우회로가 나왔다.
// 019 는 방향을 바꾼다 — **검수된 do 블록 하나를 통째로 고정 기대 토큰과 맞춘다.**
// 무엇이 빠지든 늘든 자리가 바뀌든 불일치다. 막을 구멍을 미리 알 필요가 없다.
//
// 이 파일이 **스스로 건너뛰지 않게** 하는 장치 (016·017 에서 두 번 겪은 실패 방식)
//   - 변이 헬퍼는 대상 블록 **안에서** 앵커가 **정확히 한 번** 나오는지 확인한다.
//     이 SQL 은 CRLF 이고 `v_sqlstate := sqlstate;` 는 파일에 8곳 있다. 그냥
//     `replace` 하면 엉뚱한 곳을 고치고도 "변이했다" 고 착각한다. 실제로 겪었다.
//   - 치환 뒤 문자열이 정말 달라졌는지도 확인한다.
//
// ⚠ 정적 검사다. PostgreSQL 문법·런타임 통과를 뜻하지 않는다. 전체 파서도 아니다 (§88).
// 변이는 메모리 문자열에만 적용한다. 실행·배포용 SQL 은 건드리지 않는다 (§111).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

import { auditVerifySql, formatIssues } from './verifySqlAudit'
import { execTokens, sig } from './sqlExecTokens'
import { findDoBlocks } from './verifyBlockTemplate'
import { EXPECTED_BLOCK } from './verifyBlockExpected'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const readRaw = (p: string) => readFileSync(join(ROOT, p))
const NL = String.fromCharCode(10)

const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const RUN_017 = 'POSTINSTALL_TO_RUN_017.sql'

const sql = () => read(VERIFY)

// ════════════════════════════════════════════════════════════════════
// 변이 도구 — 대상 블록 안에서만, 정확히 한 번만 고친다
// ════════════════════════════════════════════════════════════════════

/** 검수 대상 do 블록의 [from, to) 오프셋 */
function targetBlock(s: string): { from: number; to: number } {
  const { blocks } = findDoBlocks(s)
  const hits = blocks.filter(b =>
    /\bperform\s+1\s+from\s+ai_question_private\s*\.\s*ai_practice_problems\s+limit\s+1\s*;/i
      .test(s.slice(b.from, b.to)))
  assert.equal(hits.length, 1, `검수 블록을 하나로 좁히지 못했습니다 (${hits.length}개)`)
  return { from: hits[0].from, to: hits[0].to }
}

/**
 * 대상 블록 안에서만 치환한다.
 *
 * 앵커가 블록 안에 **정확히 한 번** 없으면 실패시킨다. 조용히 건너뛰지 않는다.
 * 줄바꿈은 원문(CRLF)에 맞춘다 — 안 맞추면 치환이 아무 일도 하지 않는다.
 */
function mutate(anchor: string, replacement: string): string {
  const s = sql()
  const eol = s.includes('\r' + NL) ? '\r' + NL : NL
  const a = anchor.split(NL).join(eol)
  const r = replacement.split(NL).join(eol)
  const { from, to } = targetBlock(s)
  const block = s.slice(from, to)

  const hits = block.split(a).length - 1
  assert.equal(hits, 1, `앵커가 블록 안에 ${hits}번 나옵니다 (1번이어야 합니다): ${anchor.slice(0, 50)}`)

  const out = s.slice(0, from) + block.replace(a, r) + s.slice(to)
  assert.notEqual(out, s, '치환이 아무것도 바꾸지 않았습니다')
  return out
}

/**
 * 이 변이를 감사기가 잡아야 한다.
 *
 * 기대 **코드**를 고정하지 않는다 — 코드 이름이 바뀌었다고 시험이 죽으면
 * 기대 목록만 고치고 넘어가게 된다. 여기서 지키는 것은 `issues.length > 0` 이다 (§109).
 * `TWIN_AUDIT_REPORT=1` 이면 보고서에 넣을 표를 함께 찍는다.
 */
function mustReject(name: string, mutated: string) {
  const issues = auditVerifySql(mutated)
  if (process.env.TWIN_AUDIT_REPORT === '1') {
    const codes = [...new Set(issues.map(i => i.code))].join(', ')
    console.log(`| ${name} | ${issues.length > 0 ? '잡음' : '**미탐**'} | ${codes || '-'} |`)
  }
  assert.ok(
    issues.length > 0,
    `${name} 를 감사기가 통과시켰습니다 — 잡아야 합니다`,
  )
}

// ════════════════════════════════════════════════════════════════════
// C1·C2 — 정상 대조군
// ════════════════════════════════════════════════════════════════════

test('C1 공식 검증 SQL 은 위반 0 이다', () => {
  const issues = auditVerifySql(sql())
  assert.deepEqual(issues, [], NL + formatIssues(issues))
})

test('C1 실행용 SQL 도 위반 0 이고 공식본과 바이트가 같다', () => {
  assert.deepEqual(auditVerifySql(read(RUN_017)), [])
  assert.deepEqual(readRaw(RUN_017), readRaw(VERIFY))
})

test('C2 CRLF 를 LF 로 바꿔도 통과한다 — 줄바꿈은 실행 토큰이 아니다', () => {
  const lf = sql().split('\r' + NL).join(NL)
  assert.notEqual(lf, sql(), 'CRLF 가 없어 시험이 무의미합니다')
  assert.deepEqual(auditVerifySql(lf), [])
})

test('C2 대상 블록 안의 설명 주석을 고쳐도 통과한다', () => {
  const s = mutate(
    '-- 학생이 읽을 수 있는 테이블에 정답 칼럼이 있으면 안 된다',
    '-- (설명 주석을 고쳐 본다) 학생이 읽는 테이블에 정답 칼럼이 있으면 안 된다',
  )
  assert.deepEqual(auditVerifySql(s), [], NL + formatIssues(auditVerifySql(s)))
})

test('C2 실행문 사이의 공백·들여쓰기를 바꿔도 통과한다', () => {
  const s = mutate('  reset role;', '      reset  role   ;')
  assert.deepEqual(auditVerifySql(s), [], NL + formatIssues(auditVerifySql(s)))
})

// ════════════════════════════════════════════════════════════════════
// M1~M10 — 018 검수가 뚫은 것들. 전부 실패해야 한다 (§94)
// ════════════════════════════════════════════════════════════════════

const SENTINEL = "    v_sqlstate := '__NO_ERROR__';"

test('M1 sentinel 대입을 줄 주석으로 처리하면 잡는다 (R018-01)', () => {
  mustReject('M1', mutate(SENTINEL, '    -- ' + SENTINEL.trim()))
})

test('M2 sentinel 대입을 블록 주석으로 처리하면 잡는다 (R018-01)', () => {
  mustReject('M2', mutate(SENTINEL, '    /* ' + SENTINEL.trim() + ' */'))
})

test('M3 sentinel 을 예외 수집 뒤 블록 밖으로 옮기면 잡는다 (R018-01)', () => {
  mustReject('M3', mutate(
    SENTINEL + NL + '  exception when others then' + NL
      + '    v_sqlstate := sqlstate;' + NL + '  end;',
    '  exception when others then' + NL + '    v_sqlstate := sqlstate;' + NL
      + '  end;' + NL + "  v_sqlstate := '__NO_ERROR__';",
  ))
})

test('M4 authenticated 뒤에 anon SET 을 더하면 잡는다 (R018-02)', () => {
  mustReject('M4-anon', mutate(
    '  set local role authenticated;',
    '  set local role authenticated;' + NL + '  set local role anon;',
  ))
})

test('M4 authenticated 뒤에 service_role SET 을 더해도 잡는다 (R018-02)', () => {
  mustReject('M4-service_role', mutate(
    '  set local role authenticated;',
    '  set local role authenticated;' + NL + '  set local role service_role;',
  ))
})

test('M5 RESET 을 exception handler 안으로 옮기면 잡는다 (R018-02)', () => {
  mustReject('M5', mutate(
    '    v_sqlstate := sqlstate;' + NL + '  end;' + NL + '  reset role;',
    '    v_sqlstate := sqlstate;' + NL + '    reset role;' + NL + '  end;',
  ))
})

test('M6 의도적 조회를 2회로 늘리면 잡는다 (R018-02)', () => {
  const probe = '    perform 1 from ai_question_private.ai_practice_problems limit 1;'
  mustReject('M6', mutate(probe, probe + NL + probe))
})

test('M7 최종 판정을 삼키는 바깥 handler 를 두르면 잡는다 (R018-02)', () => {
  mustReject('M7', mutate(
    "  if v_sqlstate <> '42501' then",
    '  begin' + NL + '    null;' + NL + '  end;' + NL
      + '  begin' + NL + "  if v_sqlstate <> '42501' then",
  ))
})

test('M8 성공 판정 RAISE 를 IF false 안으로 옮기면 잡는다 (R018-02)', () => {
  mustReject('M8', mutate(
    "    raise exception '[5-나] authenticated 가 private 스키마를 읽었습니다. 즉시 롤백하세요.';",
    "    if false then raise exception '[5-나] authenticated 가 private 스키마를 읽었습니다. 즉시 롤백하세요.'; end if;",
  ))
})

test('M9 sentinel 을 일반 문자열 안으로 옮기면 잡는다', () => {
  mustReject('M9', mutate(SENTINEL, "    perform '" + "v_sqlstate := ''__NO_ERROR__'';" + "';"))
})

test('M9 판정을 dollar-quoted 문자열 안으로 옮겨도 잡는다', () => {
  mustReject('M9-dollar', mutate(
    "  if v_sqlstate <> '42501' then",
    '  perform $probe$' + NL + "  if v_sqlstate <> '42501' then",
  ))
})

test('M10 do 블록의 끝을 지우면 파일 끝으로 늘리지 않고 잡는다', () => {
  const s = sql()
  const { to } = targetBlock(s)
  // 닫는 `$t$;` 를 지운다 → 끝을 알 수 없다. 018 은 파일 끝까지 늘렸다
  const broken = s.slice(0, to - 4) + s.slice(to)
  mustReject('M10-끝 누락', broken)
})

test('M10 주석·문자열 안의 가짜 경계를 실행 경계로 세지 않는다', () => {
  const s = sql()
  const before = findDoBlocks(s).blocks.length
  const anchor = '-- 5) 학생 조회에 정답이 나타나지 않는지'
  assert.equal(s.split(anchor).length - 1, 1, '앵커 주석이 한 번 나와야 합니다')
  const withFake = s.replace(anchor, '-- 5) do $t$ 가짜 경계 $t$; 학생 조회에 정답이 나타나지 않는지')
  assert.ok(withFake !== s, '치환이 일어나지 않았습니다')
  assert.equal(findDoBlocks(withFake).blocks.length, before,
    '주석 안의 do 블록을 실행 경계로 셌습니다')
  assert.deepEqual(auditVerifySql(withFake), [])
})

test('M10 진짜 do 블록을 하나 더 넣으면 자리가 달라진 것을 잡는다', () => {
  const s = sql()
  const { from } = targetBlock(s)
  const extra = 'do $x$ begin raise notice ' + "'끼워 넣은 블록'" + '; end; $x$;' + NL + NL
  mustReject('M10-블록 삽입', s.slice(0, from) + extra + s.slice(from))
})

// ════════════════════════════════════════════════════════════════════
// 고정 기대값 자체를 점검한다 (§64·§69)
// ════════════════════════════════════════════════════════════════════

test('기대 토큰은 지금 SQL 에서 뽑은 것이다 — 출처 해시가 맞는다', () => {
  const h = createHash('sha256').update(readRaw(EXPECTED_BLOCK.sourcePath)).digest('hex')
  assert.equal(h, EXPECTED_BLOCK.sourceSha256,
    'SQL 이 바뀌었는데 기대 토큰이 그대로입니다 — 사람이 검수한 뒤에만 고쳐야 합니다')
})

test('기대 토큰은 블록 전체다 — 경계와 선언부까지 들어 있다 (§62)', () => {
  const t = EXPECTED_BLOCK.tokens
  assert.equal(t[0], 'w:do')
  assert.equal(t[1], 'q:$t$')
  assert.equal(t[2], 'w:declare', '선언부가 범위에 없습니다')
  assert.equal(t[t.length - 2], 'q:$t$')
  assert.equal(t[t.length - 1], 'p:;', '닫는 경계가 범위에 없습니다')
})

test('기대 토큰은 감사 입력에서 만들지 않는다 — 상수 파일에 적혀 있다', () => {
  const src = read('lib/twin/verifyBlockExpected.ts')
  // 파일 안에 실제 토큰 문자열이 그대로 적혀 있어야 한다
  assert.ok(src.includes('"w:declare"'), '토큰이 상수로 적혀 있지 않습니다')
  assert.ok(src.includes('"s:single:__NO_ERROR__"'), 'sentinel 리터럴이 상수에 없습니다')
  assert.ok(src.includes('"s:single:42501"'), '42501 리터럴이 상수에 없습니다')
  // 읽어서 만들지 않는다
  assert.ok(!/readFileSync|execTokens|require\(/.test(src),
    '기대값을 실행 중에 만들고 있습니다 — 자기 자신과 비교하게 됩니다')
})

test('기대 토큰을 저절로 갱신하는 코드가 저장소에 없다 (§69)', () => {
  for (const f of [
    'lib/twin/exec019.test.ts', 'lib/twin/verifyBlockTemplate.ts',
    'lib/twin/sqlExecTokens.ts', 'lib/twin/verifySqlAudit.ts',
  ]) {
    const src = read(f)
    // 016·017 에서 두 번 겪었다 — 제 소스의 문자열에 제 검사가 걸리면 안 된다.
    // 여기서 보는 것은 **쓰기 함수**뿐이다. 경로를 읽는 것은 상관없다
    assert.ok(!/write(?:File|FileSync)\s*\(|appendFileSync\s*\(/.test(src),
      `${f} 가 파일을 쓰고 있습니다 — 기대값이 저절로 갱신될 수 있습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 실행 토큰 분해기 자체
// ════════════════════════════════════════════════════════════════════

test('주석과 공백은 실행 토큰이 아니다', () => {
  const a = execTokens('select 1;')
  const b = execTokens('  select /* 주석 */ 1 ;  -- 꼬리' + NL)
  assert.deepEqual(a.errors, [])
  assert.deepEqual(b.errors, [])
  assert.deepEqual(a.tokens.map(sig), b.tokens.map(sig))
})

test('문자열 값은 소문자로 바꾸지 않고 그대로 지킨다 (§77)', () => {
  const r = execTokens("select 'MixedCase 값';")
  assert.deepEqual(r.errors, [])
  assert.ok(r.tokens.some(t => t.t === 's' && t.v === 'MixedCase 값'))
})

test('키워드·식별자는 대소문자를 맞춘다 — SQL 이 구분하지 않는다', () => {
  assert.deepEqual(
    execTokens('SELECT Count(*) FROM T;').tokens.map(sig),
    execTokens('select count(*) from t;').tokens.map(sig),
  )
})

test('문자열 값이 다르면 다른 토큰이다', () => {
  assert.notDeepEqual(
    execTokens("if v <> '42501' then").tokens.map(sig),
    execTokens("if v <> '42502' then").tokens.map(sig),
  )
})

test(':= 를 : 와 = 로 쪼개지 않는다', () => {
  assert.deepEqual(execTokens('v := 1;').tokens.map(sig), ['w:v', 'p::=', 'n:1', 'p:;'])
})

test('do 본문 태그는 경계로, 본문 안의 dollar-quote 는 문자열로 읽는다 (§80)', () => {
  const r = execTokens('do $t$ begin perform $x$안쪽$x$; end; $t$;')
  assert.deepEqual(r.errors, [])
  const s = r.tokens.map(sig)
  assert.equal(s.filter(x => x === 'q:$t$').length, 2)
  assert.ok(s.includes('s:dollar:안쪽'), '안쪽 dollar-quote 를 문자열로 읽지 않았습니다')
})

test('닫히지 않은 구조는 오류로 돌려준다 — 조용히 통과시키지 않는다 (§79)', () => {
  assert.ok(execTokens("select 'x").errors.length > 0, '닫히지 않은 문자열')
  assert.ok(execTokens('select /* x').errors.length > 0, '닫히지 않은 블록 주석')
  assert.ok(execTokens('do $t$ begin end;').errors.length > 0, '닫히지 않은 본문')
})

test('모르는 글자는 실패시킨다 — 읽지 못한 채 통과하지 않는다 (§79)', () => {
  const r = execTokens("select x ? 'k';")
  assert.ok(r.errors.length > 0, 'jsonb ? 연산자를 조용히 넘겼습니다')
})

test('findDoBlocks 는 닫히지 않은 블록을 파일 끝으로 늘리지 않는다 (§80)', () => {
  const { blocks, issues } = findDoBlocks('do $t$ begin null; end;' + NL + 'select 1;')
  assert.equal(blocks.length, 0)
  assert.ok(issues.some(i => i.code === 'template_block_unterminated'))
})

// ════════════════════════════════════════════════════════════════════
// 018 까지의 검사를 그대로 두었는가 (§92·§116)
// ════════════════════════════════════════════════════════════════════

test('[4] 역할 경계 감사가 여전히 돈다 — [4-8] reset 삭제를 잡는다', () => {
  const s = sql()
  const i = s.indexOf('-- ── 4-8)')
  assert.ok(i > 0, '[4-8] 표식을 찾지 못했습니다')
  const j = s.indexOf('-- ── 4-9)', i)
  assert.ok(j > i)
  const seg = s.slice(i, j)
  const eol = s.includes('\r' + NL) ? '\r' + NL : NL
  assert.ok(seg.includes('reset role;'), '[4-8] 에 reset role 이 없습니다')
  const broken = s.slice(0, i) + seg.replace('  reset role;' + eol, '') + s.slice(j)
  assert.notEqual(broken, s)
  assert.ok(auditVerifySql(broken).length > 0, '[4-8] reset 삭제를 놓쳤습니다')
})

test('[3] 의 의도적 음성 시나리오를 위반으로 오인하지 않는다', () => {
  const s = sql()
  assert.ok(s.includes('[3-가]') && s.includes("set local role anon;"))
  assert.deepEqual(auditVerifySql(s), [])
})

test('R017-02 입력 수집은 그대로다 — read( 와 readRaw( 를 모두 잡는다', () => {
  const re = /\bread(?:Raw)?\(\s*'([^']+)'\s*\)/g
  // 견본 문자열을 그대로 쓰면 **017 의 수집기가 이 줄을 진짜 경로로 읽는다.**
  // 실제로 그렇게 돼서 "a/b.sql 이 없다" 로 테스트가 깨졌다. 그래서 이어 붙인다
  const demo = 'read' + "('a/b.sql') " + 'readRaw' + "('c/d.md')"
  const found = [...demo.matchAll(re)].map(m => m[1])
  assert.deepEqual(found, ['a/b.sql', 'c/d.md'])
})

test('test:twin 이 돌리는 테스트가 모두 입력 수집 목록에 있다', () => {
  // 034 §1: `test:twin` 은 이제 전송 차단을 먼저 적재하는 실행기를 부른다.
  // 파일 목록은 `test:twin:files` 로 옮겼으므로 그쪽을 읽는다. 검사의 뜻은 같다.
  const scripts: Record<string, string> = JSON.parse(read('package.json')).scripts
  assert.match(scripts['test:twin'], /run-twin-tests\.cjs/,
    'test:twin 이 차단 실행기를 거치지 않습니다')
  const script = scripts['test:twin:files']
  const ran = script.match(/lib\/twin\/[\w.]+\.test\.ts/g) ?? []
  assert.ok(ran.length > 0)
  const collector = read('lib/twin/exec017.test.ts')
  const missing = ran.filter(f => !collector.includes("'" + f + "'"))
  assert.deepEqual(missing, [],
    `filesReadByTests() 에 빠진 테스트: ${missing.join(' ')}`)
})
