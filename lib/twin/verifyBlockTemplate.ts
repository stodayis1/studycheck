// `[5-가]/[5-나]` DO 블록 — 고정 기대 토큰과의 대조 (GPT-EXEC-019 §54)
//
// 왜 이렇게 바꾸는가
//   017·018 은 「이 조건도 확인하자」를 하나씩 붙였다. 018 검수는 그 방식으로는
//   끝이 없다는 것을 보였다 — sentinel 주석 처리 · 두 번째 역할 전환 · 조회 2회 ·
//   `if false then` 안으로 옮긴 판정 · handler 안으로 옮긴 RESET 이 전부 통과했다.
//
//   그래서 방향을 바꾼다. **검수된 블록 하나를 통째로 고정 기대 토큰과 맞춰 본다.**
//   무엇이 빠지든 늘든 자리가 바뀌든 전부 불일치다. 막을 구멍을 미리 알 필요가 없다.
//
// 이것이 무엇이 아닌지 (§88 — 보고할 때 이대로 쓴다)
//   - PostgreSQL 전체 파서가 **아니다.** 실행 의미를 증명하지 않는다.
//   - SQL 을 실행하지 않는다. 정적 검사 통과는 DB 실행 성공의 증거가 아니다.
//   - 파일 해시 비교가 **아니다.** 주석·공백·CRLF 는 달라도 되고, 실행 토큰만 본다.
//
// 기대값은 어디서 오는가 (§64)
//   `verifyBlockExpected.ts` 의 고정 상수다. 입력 SQL 에서 만들지 않고,
//   검사 대상 파일을 다시 읽지도 않으며, 테스트가 자동으로 갱신하지도 않는다.

import { tokenizeSql } from './sqlTokens'
import { execTokens, sig, type ExecToken } from './sqlExecTokens'
import { EXPECTED_BLOCK } from './verifyBlockExpected'

const NL = String.fromCharCode(10)

export type TemplateCode =
  | 'template_lex_error'          // 블록을 토큰으로 분해하지 못했다
  | 'template_block_unterminated' // do 블록이 닫히지 않았다 (파일 끝으로 늘리지 않는다)
  | 'template_block_missing'      // 의도적 접근 시험 블록을 찾지 못했다
  | 'template_block_ambiguous'    // 같은 모양이 여럿이라 어느 것이 검수 대상인지 모른다
  | 'template_block_moved'        // 블록의 자리(몇 번째 do 블록인가)가 달라졌다
  | 'template_mismatch'           // 실행 토큰이 고정 기대값과 다르다

export type TemplateIssue = { line: number; code: TemplateCode; detail: string }

export type DoBlock = {
  /** 몇 번째 do 블록인가 (0-based) */
  index: number
  /** `do` 키워드 시작 오프셋 */
  from: number
  /** 닫는 태그 뒤 `;` 까지의 끝 오프셋 */
  to: number
  tag: string
}

function lineOf(sql: string, off: number): number {
  let n = 1
  for (let i = 0; i < off && i < sql.length; i++) if (sql[i] === NL) n++
  return n
}

/**
 * 파일 안의 **진짜** DO 블록을 모두 찾는다.
 *
 * 마스킹된 코드 위에서 찾으므로 주석·문자열 안의 `do $t$` 는 경계로 세지 않는다 (§81).
 * 닫는 태그가 없으면 **파일 끝으로 늘리지 않고 실패**로 돌려준다 (§80).
 */
export function findDoBlocks(sql: string): { blocks: DoBlock[]; issues: TemplateIssue[] } {
  const { code, errors } = tokenizeSql(sql)
  const issues: TemplateIssue[] = errors.map(e => ({
    line: 0, code: 'template_lex_error' as TemplateCode, detail: e,
  }))
  const blocks: DoBlock[] = []

  const re = /\bdo\s*(\$\w*\$)/gi
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(code)) !== null) {
    const tag = m[1]
    const bodyFrom = m.index + m[0].length
    const close = code.indexOf(tag, bodyFrom)
    if (close < 0) {
      issues.push({
        line: lineOf(sql, m.index), code: 'template_block_unterminated',
        detail: `do ${tag} 블록이 닫히지 않았습니다 — 끝을 알 수 없으므로 통과시키지 않습니다`,
      })
      break
    }
    // 닫는 태그 뒤의 `;` 까지 블록으로 본다
    let to = close + tag.length
    while (to < code.length && /\s/.test(code[to])) to++
    if (code[to] === ';') to++
    blocks.push({ index, from: m.index, to, tag })
    index++
    re.lastIndex = close + tag.length
  }
  return { blocks, issues }
}

/**
 * 이 블록을 다른 블록과 구별하는 단 하나의 표지 — 의도적 private 직접 접근.
 *
 * **마스킹된 코드**에서 찾으므로 주석·문자열 안의 같은 글자는 세지 않는다.
 * 파일의 다른 do 블록도 `ai_question_private.ai_practice_problems` 를 읽지만
 * `perform 1 … limit 1;` 형태는 이 블록에만 있다.
 */
const PROBE_RE =
  /\bperform\s+1\s+from\s+ai_question_private\s*\.\s*ai_practice_problems\s+limit\s+1\s*;/gi

/**
 * 검수 대상 DO 블록을 찾아 고정 기대 토큰과 대조한다.
 *
 * 찾지 못하거나, 둘 이상이거나, 자리가 바뀌었거나, 토큰이 다르면 **전부 실패**다.
 * 어느 경우에도 "모르겠으니 통과" 는 없다.
 */
export function auditVerifyBlockTemplate(sql: string): TemplateIssue[] {
  const { blocks, issues } = findDoBlocks(sql)
  if (issues.some(i => i.code === 'template_lex_error')) return issues

  // 검수 대상 블록을 먼저 고른다. 토큰 분해는 **그 블록에만** 한다 —
  // 지원 범위를 검수된 블록으로 제한하기 때문이다 (§79). 다른 블록에는
  // 이 블록에 없는 문법(jsonb `?` 연산자 등)이 있고, 그건 이 검사의 대상이 아니다.
  const { code } = tokenizeSql(sql)
  const hits = blocks.filter(b => {
    PROBE_RE.lastIndex = 0
    const slice = code.slice(b.from, b.to)
    return PROBE_RE.test(slice)
  })
  if (hits.length === 0) {
    issues.push({
      line: 0, code: 'template_block_missing',
      detail: '의도적 private 접근 시험(perform 1 from ai_question_private.ai_practice_problems limit 1;)을 담은 do 블록이 없습니다',
    })
    return issues
  }
  if (hits.length > 1) {
    issues.push({
      line: lineOf(sql, hits[1].from), code: 'template_block_ambiguous',
      detail: `같은 접근 시험이 do 블록 ${hits.length}곳에 있습니다 — 검수 대상을 특정할 수 없습니다`,
    })
    return issues
  }

  const b = hits[0]
  const r = execTokens(sql, b.from, b.to)
  if (r.errors.length > 0) {
    issues.push({
      line: lineOf(sql, b.from), code: 'template_lex_error',
      detail: `검수 블록을 실행 토큰으로 분해하지 못했습니다: ${r.errors.join(' / ')}`,
    })
    return issues
  }
  if (b.index !== EXPECTED_BLOCK.doBlockIndex) {
    issues.push({
      line: lineOf(sql, b.from), code: 'template_block_moved',
      detail: `${EXPECTED_BLOCK.doBlockIndex}번째 do 블록이어야 하는데 ${b.index}번째입니다 — 앞뒤로 블록이 늘거나 줄었습니다`,
    })
  }

  issues.push(...diffTokens(sql, r.tokens, EXPECTED_BLOCK.tokens))
  return issues
}

/** 기대 토큰과 한 개씩 맞춰 보고, 어긋난 자리를 알려 준다 */
function diffTokens(sql: string, actual: ExecToken[], expected: readonly string[]): TemplateIssue[] {
  const got = actual.map(sig)
  const out: TemplateIssue[] = []
  const n = Math.max(got.length, expected.length)

  for (let i = 0; i < n; i++) {
    if (got[i] === expected[i]) continue
    const at = actual[Math.min(i, actual.length - 1)]?.at ?? 0
    out.push({
      line: lineOf(sql, at), code: 'template_mismatch',
      detail: `실행 토큰 ${i}번째가 다릅니다 — 기대 ${expected[i] ?? '(없음)'} · 실제 ${got[i] ?? '(없음)'}`
        + ` [기대 ${expected.length}개 · 실제 ${got.length}개]`,
    })
    break // 첫 어긋남만 알려 준다. 그 뒤는 밀려서 의미가 없다
  }
  if (out.length === 0 && got.length !== expected.length) {
    out.push({
      line: lineOf(sql, actual[actual.length - 1]?.at ?? 0), code: 'template_mismatch',
      detail: `실행 토큰 개수가 다릅니다 — 기대 ${expected.length}개 · 실제 ${got.length}개`,
    })
  }
  return out
}
