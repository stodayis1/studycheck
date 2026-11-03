// 설치 후 검증 SQL 의 역할 경계 감사기
// (GPT-EXEC-017 작업 2 · D-121 · GPT-EXEC-018 R017-01 보완)
//
// 왜 별도 모듈인가
//   회귀 테스트가 **검사를 건너뛰고 있던 일**이 두 번 있었다.
//     016: 주석을 지운 뒤 주석 안의 표식을 찾아 전부 -1 → `continue`
//     017: 줄 주석만 지워서, 판정문을 블록 주석·문자열 안으로 옮기면 못 잡음
//   감사 로직을 순수 함수로 꺼내 두면, 테스트가 **일부러 망가뜨린 사본**을 넣어
//   감사기가 정말 잡는지 확인할 수 있다. 그게 이 파일이 있는 이유다.
//
// 어휘 분해는 `sqlTokens.ts` 가 한다 — 주석·문자열 안의 `if`/`raise` 는 코드가 아니다.
//
// 이 파일은 SQL 을 **실행하지 않는다.** 정적 검사가 PostgreSQL 런타임 통과를 뜻하지 않는다.

import { tokenizeSql, lineAt, ifBody, type StringLiteral } from './sqlTokens'
import { auditVerifyBlockTemplate, type TemplateCode } from './verifyBlockTemplate'

export type AuditIssue = {
  /** `[4-8]` 처럼 구간 이름. 구간 밖이면 `FILE` */
  section: string
  /** 원본 파일 기준 1-based 줄 번호 */
  line: number
  code: AuditCode
  detail: string
}

export type AuditCode =
  // 어휘·구조
  | 'lex_error'                // 주석·문자열을 분해하지 못했다
  | 'section_missing'
  | 'section_duplicated'
  | 'section_out_of_order'
  // 관리자 RPC 경계 (D-121)
  | 'admin_rpc_without_role'
  | 'admin_rpc_wrong_role'
  | 'admin_rpc_without_claims'
  | 'admin_rpc_not_closed'
  | 'private_while_in_role'
  | 'role_overwritten'
  | 'role_left_open'
  | 'verdict_while_in_role'
  // [5-나] 의도적 접근 시험
  | 'probe_missing'
  | 'probe_wrong_role'         // authenticated 가 아닌 역할로 시도했다
  | 'probe_after_reset'        // 역할을 되돌린 뒤에 시도했다 (시험이 무의미해진다)
  | 'sentinel_missing'         // 예상 밖 성공에 sentinel 을 안 심었다
  | 'success_path_missing'     // 예상 밖 성공 판정 자체가 없다
  | 'sqlstate_not_collected'   // 실제 sqlstate 를 수집하지 않는다
  | 'sqlstate_check_missing'   // 42501 판정이 이 구간에 없다
  | 'sqlstate_check_misplaced' // 판정이 역할 복원보다 앞에 있다
  | 'verdict_not_exception'    // 판정 본문이 raise exception 이 아니다 (notice 로 약화)
  | 'verdict_self_caught'      // 판정 raise 가 자기 handler 에 다시 잡힌다
  // 고정 기대 토큰 대조 (GPT-EXEC-019) — 위 개별 조건이 놓치는 것을 끝에서 막는다
  | TemplateCode

const NL = String.fromCharCode(10)

/** 감사할 구간 표식. **주석 표식**이므로 원본에서 찾는다 */
const SECTION_MARKERS = [
  '-- ── 4-6)', '-- ── 4-7)', '-- ── 4-8)', '-- ── 4-9)',
  '-- ── 4-10)', '-- ── 4-11)', '-- ── 4-12)', '-- ── 4-13)',
] as const

/** 관리자 RPC 를 부르는 **양성** 시나리오. 여기만 역할 경계를 강제한다 */
const POSITIVE_SECTIONS = ['[4-6]', '[4-8]', '[4-9]', '[4-10]', '[4-11]', '[4-12]'] as const

/** `[5-나]` 가 일부러 시도하는 단 하나의 직접 접근 */
export const INTENTIONAL_PRIVATE_PROBE =
  'perform 1 from ai_question_private.ai_practice_problems limit 1'

/** `[5-나]` 구간의 시작을 가리키는 주석 */
const NA_START_MARKER = 'authenticated 가 private 스키마에 접근하면 안 된다'

export type Range = { name: string; start: number; end: number }

// ════════════════════════════════════════════════════════════════════
// 구간 찾기 — 원본에서, 중복·순서까지 본다 (§58)
// ════════════════════════════════════════════════════════════════════

export function findSections(sql: string): { ranges: Range[]; issues: AuditIssue[] } {
  const lines = sql.split(NL).map(l => l.replace(/\r/g, ''))
  const issues: AuditIssue[] = []
  const found: { marker: string; at: number }[] = []

  for (const marker of SECTION_MARKERS) {
    const hits: number[] = []
    lines.forEach((l, i) => {
      // **실제 주석 표식**인지 확인한다 — 줄이 `--` 로 시작해야 한다
      if (l.includes(marker) && l.trimStart().startsWith('--')) hits.push(i)
    })
    if (hits.length === 0) {
      issues.push({
        section: marker, line: 0, code: 'section_missing',
        detail: `구간 표식을 찾지 못했습니다: ${marker}`,
      })
      continue
    }
    if (hits.length > 1) {
      issues.push({
        section: marker, line: hits[1] + 1, code: 'section_duplicated',
        detail: `구간 표식이 ${hits.length}번 나옵니다 — 경계가 불분명합니다`,
      })
    }
    found.push({ marker, at: hits[0] })
  }

  for (let i = 1; i < found.length; i++) {
    if (found[i].at <= found[i - 1].at) {
      issues.push({
        section: found[i].marker, line: found[i].at + 1, code: 'section_out_of_order',
        detail: `${found[i - 1].marker} 뒤에 와야 하는데 앞에 있습니다`,
      })
    }
  }

  const ranges: Range[] = found.slice(0, -1).map((f, i) => ({
    name: `[${f.marker.replace('-- ── ', '').replace(')', '')}]`,
    start: f.at,
    end: found[i + 1].at,
  }))
  return { ranges, issues }
}

/**
 * `[5-나]` 구간. 시작은 주석 표식, **끝은 그 do 블록의 끝**이다.
 *
 * 017 은 끝을 "첫 `raise notice '[5-나]`" 로 잡았다. 그래서 notice 메시지 접두어만
 * 바꿔도 구간이 잘렸다 (§58 · R017-01). 블록 끝으로 잡으면 그 조작에 흔들리지 않는다.
 */
function findNaRange(sql: string, code: string): Range | null {
  // **`\r` 을 떼지 않는다** — 떼면 줄 길이가 1씩 줄어 오프셋이 어긋난다
  const lines = sql.split(NL)
  const starts = lineStarts(sql)
  const start = lines.findIndex(l =>
    l.includes(NA_START_MARKER) && l.replace(/\r/g, '').trimStart().startsWith('--'))
  if (start < 0) return null

  // 시작 줄 뒤의 첫 `$t$;` 가 이 do 블록의 끝이다.
  // 017 은 끝을 "첫 `raise notice '[5-나]`" 로 잡아, notice 문구만 바꿔도 구간이 잘렸다.
  const closeRe = /\$t\$\s*;/g
  closeRe.lastIndex = starts[start]
  const m = closeRe.exec(code)
  // 끝을 못 찾으면 **파일 끝으로 늘리지 않는다** (GPT-EXEC-019 §80).
  // 불확실한 끝을 넓게 잡으면 그 안의 조작이 묻힌다. 모르면 실패다.
  if (m === null) return null
  const endOffset = m.index

  let endLine = lines.length - 1
  for (let i = start; i < lines.length; i++) {
    if (starts[i] > endOffset) { endLine = i - 1; break }
  }
  return { name: '[5-나]', start, end: endLine + 1 }
}

/** 각 줄의 시작 오프셋. 원문 기준이라 CRLF 에서도 어긋나지 않는다 */
function lineStarts(sql: string): number[] {
  const out = [0]
  for (let i = 0; i < sql.length; i++) if (sql[i] === NL) out.push(i + 1)
  return out
}

// ════════════════════════════════════════════════════════════════════
// 역할 상태 기계 — 마스킹된 코드 위에서 돈다
// ════════════════════════════════════════════════════════════════════

const SET_ROLE = /^set\s+local\s+role\s+(\w+)\s*;/i
const RESET_ROLE = /^reset\s+role\s*;/i
const ADMIN_RPC = /public\.admin_\w+\s*\(/
const PRIVATE_REF = /ai_question_private\./
const RAISE_VERDICT = /^raise\s+exception\b/i

/** 마스킹된 코드를 줄 배열로. 원본과 줄 번호가 같다 */
function codeLines(code: string): string[] {
  return code.split(NL).map(l => l.replace(/\r/g, '').trim())
}

/**
 * claims 설정 줄인지 본다.
 *
 * 문자열이 덮이므로 `set_config('request.jwt.claims', ...)` 의 첫 인자가 사라진다.
 * 그래서 원본 줄과 리터럴 값을 함께 본다.
 */
function isClaimsLine(rawLine: string): boolean {
  return /set_config\s*\(/.test(rawLine) && rawLine.includes('request.jwt.claims')
}

function auditPositiveSection(
  raw: string[], code: string[], r: Range,
): AuditIssue[] {
  const issues: AuditIssue[] = []
  const st = { role: null as string | null, claims: false, rpcCalled: false }

  for (let i = r.start; i < r.end; i++) {
    const l = code[i]
    if (l === '') continue
    const at = i + 1

    const setRole = SET_ROLE.exec(l)
    if (setRole) {
      if (st.role !== null) {
        issues.push({
          section: r.name, line: at, code: 'role_overwritten',
          detail: `${st.role} 을 되돌리지 않고 ${setRole[1]} 로 바꿉니다`,
        })
      }
      st.role = setRole[1].toLowerCase()
      st.claims = false
      st.rpcCalled = false
      continue
    }

    if (RESET_ROLE.test(l)) {
      st.role = null; st.claims = false; st.rpcCalled = false
      continue
    }

    if (isClaimsLine(raw[i])) { st.claims = true; continue }

    if (ADMIN_RPC.test(l)) {
      if (st.role === null) {
        issues.push({
          section: r.name, line: at, code: 'admin_rpc_without_role',
          detail: `역할 전환 없이 관리자 RPC 를 부릅니다: ${l.slice(0, 70)}`,
        })
      } else if (st.role !== 'authenticated') {
        issues.push({
          section: r.name, line: at, code: 'admin_rpc_wrong_role',
          detail: `${st.role} 로 관리자 RPC 를 부릅니다 (우회): ${l.slice(0, 70)}`,
        })
      } else if (!st.claims) {
        issues.push({
          section: r.name, line: at, code: 'admin_rpc_without_claims',
          detail: `claims 없이 관리자 RPC 를 부릅니다: ${l.slice(0, 70)}`,
        })
      } else if (st.rpcCalled) {
        issues.push({
          section: r.name, line: at, code: 'admin_rpc_not_closed',
          detail: `앞 RPC 를 reset role 로 닫지 않고 또 부릅니다: ${l.slice(0, 70)}`,
        })
      }
      st.rpcCalled = true
      continue
    }

    if (PRIVATE_REF.test(l) && st.role !== null) {
      issues.push({
        section: r.name, line: at, code: 'private_while_in_role',
        detail: `역할(${st.role})이 켜진 채 비공개 스키마를 읽습니다: ${l.slice(0, 70)}`,
      })
      continue
    }

    if (RAISE_VERDICT.test(l) && st.role !== null) {
      issues.push({
        section: r.name, line: at, code: 'verdict_while_in_role',
        detail: `역할(${st.role})이 켜진 채 판정합니다: ${l.slice(0, 70)}`,
      })
    }
  }

  if (st.role !== null) {
    issues.push({
      section: r.name, line: r.end, code: 'role_left_open',
      detail: `구간이 끝났는데 역할(${st.role})이 열려 있습니다`,
    })
  }
  return issues
}

// ════════════════════════════════════════════════════════════════════
// [5-나] — 실행 순서 8단계 (§61)
// ════════════════════════════════════════════════════════════════════

/** 조건식에 특정 리터럴을 비교하는 `if` 를 찾는다. 마스킹된 코드 + 리터럴 값으로 판단 */
function findIfComparing(
  sql: string, code: string, literals: StringLiteral[],
  from: number, to: number, op: '<>' | '=', value: string, varName: string,
): number | null {
  const re = new RegExp(`\\bif\\s+${varName}\\s*${op === '<>' ? '<>' : '='}\\s*''`, 'gi')
  // 마스킹 후 `'42501'` 은 공백이 된다. 그래서 원본에서 찾고 마스킹으로 검증한다
  void re
  const rawRe = new RegExp(`\\bif\\s+${varName}\\s*${op === '<>' ? '<>' : '='}\\s*'([^']*)'\\s+then`, 'gi')
  rawRe.lastIndex = from
  let m: RegExpExecArray | null
  while ((m = rawRe.exec(sql)) !== null) {
    if (m.index >= to) break
    if (m[1] !== value) continue
    // 그 자리가 **실행 코드**인지 확인한다 (주석·문자열 안이면 공백으로 덮여 있다)
    const masked = code.slice(m.index, m.index + 2)
    if (!/if/i.test(masked)) continue
    return m.index
  }
  return null
}

/** 본문에 실제 `raise exception` 이 있는가. `notice`·`warning`·빈 분기는 실패 */
function bodyRaisesException(code: string, ifAt: number): 'ok' | 'weakened' | 'unparsable' {
  const body = ifBody(code, ifAt)
  if (body === null) return 'unparsable'
  const text = code.slice(body.from, body.to)
  if (/\braise\s+exception\b/i.test(text)) return 'ok'
  return 'weakened'
}

/**
 * 판정 `raise` 가 자기 exception handler 에 다시 잡히는 모양인지 본다 (§72).
 * `begin ... raise exception ... exception when ... end` 안에 있으면 삼켜진다.
 */
function isInsideOwnHandler(code: string, at: number, from: number): boolean {
  const before = code.slice(from, at)
  const begins = (before.match(/\bbegin\b/gi) ?? []).length
  const ends = (before.match(/\bend\s*;/gi) ?? []).length
  if (begins <= ends) return false
  // 열려 있는 begin 블록에 exception 절이 붙는지
  const after = code.slice(at)
  const nextEnd = after.search(/\bend\s*;/i)
  const nextExc = after.search(/\bexception\s+when\b/i)
  return nextExc >= 0 && (nextEnd < 0 || nextExc < nextEnd)
}

function auditNa(
  sql: string, code: string, literals: StringLiteral[],
  raw: string[], cl: string[], r: Range,
): AuditIssue[] {
  const issues: AuditIssue[] = []
  const at = (i: number) => r.start + i + 1

  const body = cl.slice(r.start, r.end)

  // 1) 실제 역할 전환이 있고 authenticated 인가
  const roleIdx = body.findIndex(l => SET_ROLE.test(l))
  if (roleIdx < 0) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'probe_wrong_role',
      detail: '역할 전환(set local role)이 없습니다 — authenticated 가 아닌 역할로 시험됩니다',
    })
  } else {
    const role = SET_ROLE.exec(body[roleIdx])![1].toLowerCase()
    if (role !== 'authenticated') {
      issues.push({
        section: r.name, line: at(roleIdx), code: 'probe_wrong_role',
        detail: `${role} 로 시도합니다 — authenticated 의 차단을 시험해야 합니다`,
      })
    }
  }

  // 2) 의도적 접근이 있고, 역할 복원보다 앞인가
  const probeIdx = body.findIndex(l => l.includes(INTENTIONAL_PRIVATE_PROBE))
  const resetIdx = body.findIndex(l => RESET_ROLE.test(l))
  if (probeIdx < 0) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'probe_missing',
      detail: '의도적 private 직접 접근 시도가 없습니다',
    })
  } else if (resetIdx >= 0 && probeIdx > resetIdx) {
    issues.push({
      section: r.name, line: at(probeIdx), code: 'probe_after_reset',
      detail: '역할을 되돌린 뒤에 접근을 시도합니다 — 차단 시험이 무의미해집니다',
    })
  }
  if (roleIdx >= 0 && probeIdx >= 0 && probeIdx < roleIdx) {
    issues.push({
      section: r.name, line: at(probeIdx), code: 'probe_wrong_role',
      detail: '역할 전환보다 앞에서 접근을 시도합니다',
    })
  }

  // 3) 예상 밖 성공에 sentinel 을 심는가
  const sentinelIdx = body.findIndex(l => /v_sqlstate\s*:=\s*''\s*;/.test(l))
  const sentinelRaw = raw.slice(r.start, r.end)
    .findIndex(l => /v_sqlstate\s*:=\s*'__NO_ERROR__'\s*;/.test(l))
  if (sentinelRaw < 0) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'sentinel_missing',
      detail: "예상 밖 성공에 v_sqlstate := '__NO_ERROR__' 를 심지 않습니다",
    })
  }
  void sentinelIdx

  // 4) 실제 sqlstate 를 수집하는가 (상수 대입은 안 된다)
  const collectIdx = body.findIndex(l => /v_sqlstate\s*:=\s*sqlstate\s*;/i.test(l))
  if (collectIdx < 0) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'sqlstate_not_collected',
      detail: 'exception 경로에서 실제 sqlstate 를 수집하지 않습니다',
    })
  }

  // 5) 예외 수집 블록을 벗어난 뒤 역할을 복원하는가
  if (resetIdx < 0) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'role_left_open',
      detail: '역할 복원(reset role)이 없습니다',
    })
  } else if (collectIdx >= 0 && resetIdx < collectIdx) {
    issues.push({
      section: r.name, line: at(resetIdx), code: 'sqlstate_check_misplaced',
      detail: 'sqlstate 수집보다 앞에서 역할을 복원합니다',
    })
  }

  // ── 6·7·8) 두 판정이 **실제 raise exception** 인가 ────────────────
  // 원본 오프셋으로 찾아야 `'__NO_ERROR__'` · `'42501'` 값을 볼 수 있다
  const starts = lineStarts(sql)
  const startOff = starts[r.start] ?? 0
  const endOff = r.end < starts.length ? starts[r.end] : sql.length

  const successIf = findIfComparing(sql, code, literals, startOff, endOff, '=', '__NO_ERROR__', 'v_sqlstate')
  if (successIf === null) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'success_path_missing',
      detail: "예상 밖 성공을 판정하는 if v_sqlstate = '__NO_ERROR__' 가 이 구간에 없습니다",
    })
  } else {
    const verdict = bodyRaisesException(code, successIf)
    if (verdict !== 'ok') {
      issues.push({
        section: r.name, line: lineAt(sql, successIf),
        code: verdict === 'weakened' ? 'verdict_not_exception' : 'lex_error',
        detail: verdict === 'weakened'
          ? '성공 판정 본문이 raise exception 이 아닙니다 (notice/warning/빈 분기로 약화)'
          : '성공 판정의 if ... end if 구조를 해석하지 못했습니다',
      })
    }
    if (isInsideOwnHandler(code, successIf, startOff)) {
      issues.push({
        section: r.name, line: lineAt(sql, successIf), code: 'verdict_self_caught',
        detail: '성공 판정이 자기 exception handler 안에 있어 삼켜집니다',
      })
    }
    if (resetIdx >= 0 && lineAt(sql, successIf) - 1 < r.start + resetIdx) {
      issues.push({
        section: r.name, line: lineAt(sql, successIf), code: 'sqlstate_check_misplaced',
        detail: '성공 판정이 역할 복원보다 앞에 있습니다',
      })
    }
  }

  const codeIf = findIfComparing(sql, code, literals, startOff, endOff, '<>', '42501', 'v_sqlstate')
  if (codeIf === null) {
    issues.push({
      section: r.name, line: r.start + 1, code: 'sqlstate_check_missing',
      detail: "이 구간 안에 42501 판정(if v_sqlstate <> '42501')이 없습니다",
    })
  } else {
    const verdict = bodyRaisesException(code, codeIf)
    if (verdict !== 'ok') {
      issues.push({
        section: r.name, line: lineAt(sql, codeIf),
        code: verdict === 'weakened' ? 'verdict_not_exception' : 'lex_error',
        detail: verdict === 'weakened'
          ? '42501 판정 본문이 raise exception 이 아닙니다 (notice/warning/빈 분기로 약화)'
          : '42501 판정의 if ... end if 구조를 해석하지 못했습니다',
      })
    }
    if (isInsideOwnHandler(code, codeIf, startOff)) {
      issues.push({
        section: r.name, line: lineAt(sql, codeIf), code: 'verdict_self_caught',
        detail: '42501 판정이 자기 exception handler 안에 있어 삼켜집니다',
      })
    }
    if (resetIdx >= 0 && lineAt(sql, codeIf) - 1 < r.start + resetIdx) {
      issues.push({
        section: r.name, line: lineAt(sql, codeIf), code: 'sqlstate_check_misplaced',
        detail: '42501 판정이 역할 복원보다 앞에 있습니다',
      })
    }
  }

  return issues
}

// ════════════════════════════════════════════════════════════════════
// 진입점
// ════════════════════════════════════════════════════════════════════

/**
 * 검증 SQL 전체를 감사한다. 위반 목록을 돌려준다 (빈 배열 = 통과).
 *
 * **문자열만 받는다.** 테스트가 망가뜨린 사본을 넣어 감사기를 시험할 수 있다.
 */
export function auditVerifySql(sql: string): AuditIssue[] {
  const { code, literals, errors } = tokenizeSql(sql)
  const out: AuditIssue[] = errors.map(e => ({
    section: 'FILE', line: 0, code: 'lex_error' as AuditCode, detail: e,
  }))
  // 어휘 분해가 깨졌으면 그 위에서 판단하지 않는다 (§59: 모르는 구조를 통과시키지 않는다)
  if (errors.length > 0) return out

  const raw = sql.split(NL).map(l => l.replace(/\r/g, ''))
  const cl = codeLines(code)

  const { ranges, issues } = findSections(sql)
  out.push(...issues)

  for (const r of ranges) {
    if (!(POSITIVE_SECTIONS as readonly string[]).includes(r.name)) continue
    out.push(...auditPositiveSection(raw, cl, r))
  }

  const na = findNaRange(sql, code)
  if (na === null) {
    out.push({
      section: '[5-나]', line: 0, code: 'section_missing',
      detail: '[5-나] 구간을 찾지 못했습니다 (표식이 없거나 do 블록의 끝을 알 수 없습니다)',
    })
  } else {
    out.push(...auditNa(sql, code, literals, raw, cl, na))
  }

  // ── 마지막 안전장치 — 검수된 블록 전체를 고정 기대 토큰과 맞춘다 ──
  // 위의 개별 조건들은 「무엇을 확인할지」를 미리 알아야 한다. 018 검수는 그 방식이
  // 계속 뚫린다는 것을 보였다. 여기서는 빠지든 늘든 자리가 바뀌든 전부 불일치다 (§84).
  out.push(...auditVerifyBlockTemplate(sql).map(t => ({
    section: '[5-가·5-나] 블록', line: t.line, code: t.code as AuditCode, detail: t.detail,
  })))

  return out
}

export function formatIssues(issues: AuditIssue[]): string {
  return issues.map(i => `  ${i.section} ${i.line}행 [${i.code}] ${i.detail}`).join(NL)
}
