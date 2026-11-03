// GPT-EXEC-016 회귀 테스트 — 검증 SQL 의 역할 수명 관리 (D-121)
//
// 실행: npm run test:twin
//
// 014 검증 SQL 이 운영에서 42501 로 실패했다. 원인은 보안 결함이 아니라
// **검증문이 `authenticated` 역할인 채로 `ai_question_private` 를 직접 읽은 것**이다.
// 그 42501 은 비공개 스키마 차단이 작동한다는 증거였다 (D-120).
//
// 여기서 고정하는 것
//   1) 관리자 RPC 호출 뒤 내부 상태 조회 전에 `reset role` 이 있다
//   2) `set local role` ~ `reset role` 사이에 private 직접 조회가 없다
//      (단 `[5-나]` 의 의도적 접근 한 줄만 예외)
//   3) 실패가 예상되는 RPC 도 `reset role` 로 끝난다
//   4) 실행용 016 파일이 공식 검증 SQL 과 바이트 동일하다
//
// ⚠ 이 테스트는 **정적 검사**다. SQL 런타임 통과를 보장하지 않는다 (§195).
//    실제 확인은 원장님이 수정본을 운영에서 1회 실행해야 끝난다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

import { auditVerifySql, formatIssues } from './verifySqlAudit'

const ROOT = join(__dirname, '..', '..')
const readRaw = (p: string) => readFileSync(join(ROOT, p))
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)
const sha256 = (p: string) => createHash('sha256').update(readRaw(p)).digest('hex')

const VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const RUN_016 = 'POSTINSTALL_TO_RUN_016.sql'
const RUN_014 = 'POSTINSTALL_TO_RUN_014.sql'
const INSTALL = 'docs/sql/쌍둥이_설치.sql'

/** 주석과 캐리지리턴을 지운 실행 본문을 줄 배열로 */
function execLines(path: string): string[] {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split(NL)
    .map(l => l.split(CR).join('').replace(/--.*$/, ''))
}

/** `[5-나]` 가 일부러 시도하는 단 하나의 직접 접근 */
const INTENTIONAL_PRIVATE_PROBE = 'perform 1 from ai_question_private.ai_practice_problems limit 1'

// ════════════════════════════════════════════════════════════════════
// 1·2·3) 역할 수명 관리
// ════════════════════════════════════════════════════════════════════

type Violation = { line: number; role: string; text: string }

/** 역할을 켠 채로 private 스키마를 직접 건드리는 줄을 모두 찾는다 */
function privateReadsWhileInRole(path: string): Violation[] {
  const lines = execLines(path)
  const bad: Violation[] = []
  let role: string | null = null

  lines.forEach((raw, i) => {
    const l = raw.trim()
    const setRole = /^set\s+local\s+role\s+(\w+)\s*;/i.exec(l)
    if (setRole) { role = setRole[1]; return }
    if (/^reset\s+role\s*;/i.test(l)) { role = null; return }

    if (role !== null && l.includes('ai_question_private')) {
      if (l.includes(INTENTIONAL_PRIVATE_PROBE)) return   // [5-나] 는 일부러 한다
      bad.push({ line: i + 1, role, text: l.slice(0, 100) })
    }
  })
  return bad
}

test('역할을 켠 채로 private 스키마를 직접 읽는 곳이 없다 (D-121)', () => {
  const bad = privateReadsWhileInRole(VERIFY)
  assert.deepEqual(bad, [],
    '42501 을 다시 부르는 곳이 있습니다:' + NL +
    bad.map(b => `  ${b.line}행 (role=${b.role}) ${b.text}`).join(NL))
})

test('실행용 016 파일에도 같은 위반이 없다', () => {
  assert.deepEqual(privateReadsWhileInRole(RUN_016), [])
})

test('[4-6] 승인 RPC 뒤 첫 private 조회 전에 reset role 이 있다 (§185)', () => {
  const lines = execLines(VERIFY)
  const rpcAt = lines.findIndex(l => l.includes('public.admin_approve_twin_candidate(v_c1'))
  assert.ok(rpcAt > 0, '[4-6] 승인 RPC 를 찾지 못했습니다')

  const after = lines.slice(rpcAt + 1)
  const resetAt = after.findIndex(l => /^\s*reset\s+role\s*;/i.test(l))
  const privateAt = after.findIndex(l => l.includes('ai_question_private'))
  assert.ok(resetAt >= 0, 'RPC 뒤에 reset role 이 없습니다')
  assert.ok(privateAt >= 0, 'RPC 뒤에 private 조회가 없습니다 (검증이 사라졌습니다)')
  assert.ok(resetAt < privateAt,
    `reset role 이 private 조회보다 뒤에 있습니다 (reset=+${resetAt}, private=+${privateAt})`)
})

// GPT-EXEC-018 §93: 여기 있던 검사는 **아무것도 확인하지 않았다.**
// 주석을 지운 뒤 주석 안의 표식(`4-8)`)을 찾아 전부 -1 이 됐고 `continue` 로 넘어갔다.
// 남은 것은 파일 전체 set/reset **개수 비교**뿐이라, `[4-8]` 의 reset 을 지워도 통과했다.
//
// 개수 비교를 지우고 **현재 검증기에 위임한다.** 구간 경계를 원본에서 찾고,
// 구간마다 역할 상태를 추적하며, 주석·문자열 안의 가짜 실행문을 코드로 세지 않는다.
test('[4-6]·[4-8]~[4-12] 의 역할 경계를 검증기로 확인한다 (§93)', () => {
  const issues = auditVerifySql(read(VERIFY))
  const inSections = issues.filter(i =>
    ['[4-6]', '[4-8]', '[4-9]', '[4-10]', '[4-11]', '[4-12]'].includes(i.section))
  assert.deepEqual(inSections, [],
    '관리자 RPC 구간에 위반이 있습니다:' + NL + formatIssues(inSections))

  // 구간 경계 자체가 온전한지도 검증기가 본다 (표식 누락·중복·순서)
  const structural = issues.filter(i =>
    i.code === 'section_missing' || i.code === 'section_duplicated'
    || i.code === 'section_out_of_order' || i.code === 'lex_error')
  assert.deepEqual(structural, [], formatIssues(structural))
})

test('모든 set local role 이 reset role 로 닫힌다 (끝까지 열린 채 끝나지 않는다)', () => {
  const lines = execLines(VERIFY)
  let role: string | null = null
  let lastSet = -1
  lines.forEach((raw, i) => {
    const l = raw.trim()
    if (/^set\s+local\s+role\s+\w+\s*;/i.test(l)) { role = l; lastSet = i + 1 }
    else if (/^reset\s+role\s*;/i.test(l)) role = null
  })
  assert.equal(role, null, `${lastSet}행의 역할 전환이 닫히지 않은 채 파일이 끝납니다`)
})

test('실패가 예상되는 RPC 도 예외를 삼킨 뒤 reset role 로 끝낸다 (§188)', () => {
  const code = read(VERIFY)
  // begin 안에서 판정용 raise 를 하면 자기 handler 에 잡혀 메시지가 뒤섞이고
  // reset role 에 도달하지 못한다. 그래서 sentinel 로 빼 두었다.
  assert.ok(code.includes("v_msg := '__NO_ERROR__';"), '[4-8]/[4-12] sentinel 이 없습니다')
  assert.ok(code.includes("v_sqlstate := '__NO_ERROR__';"), '[5-나] sentinel 이 없습니다')
  for (const m of ['[4-8] safe=false 인데 게시됐습니다',
                   '[4-12] retired 를 재게시했습니다',
                   '[5-나] authenticated 가 private 스키마를 읽었습니다']) {
    assert.ok(code.includes(m), `${m} 판정이 사라졌습니다`)
  }
})

test('[5-나] 는 의도적 직접 접근을 유지하고 42501 을 그대로 본다 (§189)', () => {
  const code = read(VERIFY)
  assert.ok(code.includes(INTENTIONAL_PRIVATE_PROBE), '의도적 접근 테스트가 사라졌습니다')
  assert.ok(code.includes("if v_sqlstate <> '42501' then"), '42501 기대 검사가 사라졌습니다')
  assert.ok(code.includes('[5-나] authenticated 의 private 스키마 접근 거부: OK (42501)'))
})

// ════════════════════════════════════════════════════════════════════
// 권한을 완화하지 않았다 (§150 B)
// ════════════════════════════════════════════════════════════════════

test('authenticated 에게 private 스키마 권한을 주지 않았다', () => {
  for (const f of [VERIFY, RUN_016, INSTALL]) {
    const code = execLines(f).join(NL)
    assert.ok(!/grant\s+usage\s+on\s+schema\s+ai_question_private\s+to\s+(authenticated|anon|public)/i.test(code),
      `${f} 가 private 스키마 usage 를 넓힙니다`)
    assert.ok(!/grant\s+select\s+on\s+(all\s+tables\s+in\s+schema\s+)?ai_question_private/i.test(code),
      `${f} 가 private 테이블 select 를 넓힙니다`)
  }
})

test('검증 SQL 이 권한·RLS 를 바꾸지 않는다', () => {
  const code = execLines(VERIFY).join(NL)
  for (const w of ['grant', 'revoke', 'alter policy', 'drop policy', 'alter table']) {
    assert.ok(!new RegExp(`\\b${w.replace(' ', '\\s+')}\\b`, 'i').test(code),
      `검증 SQL 에 ${w} 가 있습니다`)
  }
})

test('설치 SQL 은 이번 회차에 바뀌지 않았다 (§158)', () => {
  // 014 설치가 운영에 이미 들어갔다. 같은 파일이어야 한다 (D-119)
  assert.equal(sha256(INSTALL),
    'a5e441e59c2c08aa65d6a0b85b2a4737b0799aaece5376e0a151a5105946f9b0',
    '운영에 설치된 SQL 과 저장소 파일이 달라졌습니다')
  assert.equal(sha256('INSTALL_TO_RUN_014.sql'), sha256(INSTALL))
})

test('관리자 RPC 를 service-role 로 우회 호출하지 않는다', () => {
  const lines = execLines(VERIFY)
  let role: string | null = null
  for (const raw of lines) {
    const l = raw.trim()
    const setRole = /^set\s+local\s+role\s+(\w+)\s*;/i.exec(l)
    if (setRole) { role = setRole[1].toLowerCase(); continue }
    if (/^reset\s+role\s*;/i.test(l)) { role = null; continue }
    if (role === 'service_role' && /public\.admin_\w+\s*\(/.test(l)) {
      assert.fail(`service_role 로 관리자 RPC 를 부릅니다: ${l.slice(0, 80)}`)
    }
  }
})

// ════════════════════════════════════════════════════════════════════
// 4) 실행용 016 파일 (§190 · §191)
// ════════════════════════════════════════════════════════════════════

// GPT-EXEC-017 §156: 공식 SQL 이 017 로 바뀌었다.
// 여기서는 **016 기록본의 해시 유지**만 본다.
// "현행 공식 SQL 과 실행본이 같다" 는 검사는 `exec017.test.ts` 가
// `POSTINSTALL_TO_RUN_017.sql` 로 이어받았다. 검증 의미를 지운 것이 아니라 옮긴 것이다.
test('POSTINSTALL_TO_RUN_016.sql 이 016 당시 해시 그대로다 (기록본)', () => {
  assert.equal(sha256(RUN_016),
    'fbbf52b78006393e6b8c9c537707cbd9910557601300785426220d8af67b27ad',
    '016 기록본이 바뀌었습니다')
  // 현행 공식 SQL 과는 **달라야** 한다 — 실수로 구판을 실행하지 않게
  assert.notEqual(sha256(RUN_016), sha256(VERIFY))
})

test('016 실행 파일에 placeholder 가 0건이다', () => {
  const s = read(RUN_016)
  for (const token of ['PUT-', 'PUT_', 'UUID-HERE', '<<', 'TODO:', 'YOUR-', '여기에 입력']) {
    assert.ok(!s.includes(token), `${token} 가 남아 있습니다`)
  }
})

test('016 이 begin 으로 시작하고 rollback 으로 끝나며 commit 이 0건이다', () => {
  const stmts = execLines(RUN_016).map(l => l.trim()).filter(l => l !== '')
  assert.equal(stmts[0], 'begin;')
  assert.equal(stmts[stmts.length - 1], 'rollback;')
  // `on commit drop` 의 commit 은 트랜잭션 commit 이 아니다
  const code = execLines(RUN_016).join(NL).replace(/on\s+commit\s+drop/gi, ' ')
  assert.equal((code.match(/\bcommit\b/gi) ?? []).length, 0)
})

test('016 에 설치·롤백 SQL 이 섞여 있지 않다 (§173)', () => {
  const code = execLines(RUN_016).join(NL)
  assert.ok(!/create\s+schema\s+ai_question_private/i.test(code), '설치 구문이 섞였습니다')
  assert.ok(!/drop\s+function\s+if\s+exists/i.test(code), '롤백 구문이 섞였습니다')
  assert.ok(!/drop\s+schema/i.test(code))
})

test('016 에 실제 uuid 가 없다', () => {
  const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i
  assert.ok(!uuid.test(read(RUN_016)))
})

test('014 판 검증 파일은 그대로 남기되 폐기본임을 안다', () => {
  // 지우지 않는다. 014 기록의 일부다. 다만 **운영에서 실패한 판**이므로
  // 016 과 다르다는 사실을 테스트로 못 박아, 실수로 014 를 다시 돌리지 않게 한다.
  assert.equal(sha256(RUN_014),
    '3f4949d1f9e11bc02dc73ea25e10b8f5685b13776f9bba6b7e83435a6bbe9dc7',
    '014 판이 바뀌었습니다 (기록이어야 합니다)')
  assert.notEqual(sha256(RUN_014), sha256(RUN_016))
  // 014 판에는 고쳐진 sentinel 이 없다 — 그것이 구판이라는 표식이다
  assert.ok(!read(RUN_014).includes("v_msg := '__NO_ERROR__';"))
})

// ════════════════════════════════════════════════════════════════════
// 검증 의미가 사라지지 않았다
// ════════════════════════════════════════════════════════════════════

test('검증 항목이 하나도 사라지지 않았다', () => {
  const s = read(VERIFY)
  for (const marker of ['[1]', '[2]', '[3-가]', '[3-나]', '[3-다]', '[3-라]', '[3-마]', '[3-바]',
                        '[4-1]', '[4-2]', '[4-3]', '[4-4]', '[4-5]', '[4-6]', '[4-7]',
                        '[4-8]', '[4-9]', '[4-10]', '[4-11]', '[4-12]', '[4-13]', '[4-14]',
                        '[5-가]', '[5-나]', '[5-다]']) {
    assert.ok(s.includes(marker), `검증 항목 ${marker} 가 사라졌습니다`)
  }
})

test('자동 선택(D-112)이 그대로 남아 있다', () => {
  const code = execLines(VERIFY).join(NL)
  assert.ok(code.includes("where u.role = 'admin'"))
  assert.ok(code.includes('order by a.id::text'))
  assert.ok(code.includes('where s.session_uid is not null'))
  assert.ok(code.includes('order by s.session_uid::text'))
})

test('uuid 를 출력문에 싣지 않는 성질이 유지된다', () => {
  const code = execLines(VERIFY).join(NL)
  for (const m of code.matchAll(/raise\s+(?:notice|exception)[^;]*;/gi)) {
    for (const v of ['v_admin', 'v_stu', 'admin_uid_text', 'student_uid_text']) {
      assert.ok(!m[0].includes(v), `출력문에 ${v} 가 실립니다: ${m[0].slice(0, 90)}`)
    }
  }
})
