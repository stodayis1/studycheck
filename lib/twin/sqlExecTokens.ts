// 실행 토큰 분해 — 「실제로 실행되는 것」만 순서대로 남긴다 (GPT-EXEC-019 §75)
//
// 왜 또 만드는가
//   017·018 은 정규식 조건을 하나씩 늘려 왔다. 그때마다 GPT 검수가 새 우회로를 찾았다.
//     018 이 놓친 것: sentinel 대입을 주석 처리 · 두 번째 `set local role` 추가 ·
//                     같은 조회를 두 번 · 판정을 `if false then` 안으로 · RESET 을 handler 안으로
//   조건을 더 붙이는 대신, **검수된 블록 하나를 통째로 고정 기대 토큰과 맞춰 본다** (§56).
//   빠지든 늘든 자리가 바뀌든 전부 불일치다. 놓칠 구멍을 하나씩 막는 방식이 아니다.
//
// 무엇을 남기고 무엇을 버리는가 (§76·§77)
//   버린다 — 주석 · 공백 · 줄바꿈 (CRLF 포함)
//   남긴다 — 키워드 · 식별자 · 숫자 · 연산자 · 구두점 · **문자열의 값과 종류**
//   키워드·식별자만 소문자로 맞춘다. 문자열 안은 **건드리지 않는다** — 값이 바뀌면 안 된다.
//
// 모르는 것은 조용히 넘기지 않는다 (§79)
//   분해하지 못한 문자는 `errors` 로 돌려준다. 읽지 못한 채 통과하는 일이 없어야 한다.
//
// 이 파일은 SQL 을 **실행하지 않는다.** PostgreSQL 전체를 해석하는 파서도 아니다.
// 검수된 블록에 실제로 쓰인 문법만 다루고, 그 밖은 실패시킨다 (§88).

const NL = String.fromCharCode(10)
const CR = String.fromCharCode(13)

/**
 * 실행 토큰 하나.
 *
 * - `w` 낱말(키워드·식별자) — 소문자로 맞춘다
 * - `i` 따옴표 식별자 `"..."` — 대소문자를 지킨다
 * - `n` 숫자
 * - `s` 문자열 — 값과 종류를 지킨다
 * - `p` 연산자·구두점
 * - `q` dollar-quote **본문 경계** 태그 (`do $t$` 의 `$t$`)
 */
export type ExecToken = {
  t: 'w' | 'i' | 'n' | 's' | 'p' | 'q'
  v: string
  /** `s` 일 때만 */
  kind?: 'single' | 'escape' | 'dollar'
  /** 원문 오프셋 */
  at: number
}

export type ExecTokenResult = { tokens: ExecToken[]; errors: string[] }

/** 비교용 서명. 종류가 다르면 값이 같아도 다른 토큰이다 */
export function sig(tok: ExecToken): string {
  if (tok.t === 's') return `s:${tok.kind}:${tok.v}`
  return `${tok.t}:${tok.v}`
}

/** 긴 연산자를 먼저 본다 — `:=` 를 `:` `=` 로 쪼개면 안 된다 */
const OPERATORS = [
  ':=', '<>', '!=', '<=', '>=', '||', '::', '->>', '->',
  ';', '(', ')', ',', '.', '*', '=', '<', '>', '+', '-', '/', '%', '[', ']',
] as const

function readDollarTag(s: string, i: number): string | null {
  if (s[i] !== '$') return null
  let j = i + 1
  while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++
  if (s[j] !== '$') return null
  return s.slice(i, j + 1)
}

/**
 * `[from, to)` 를 실행 토큰으로 분해한다.
 *
 * dollar-quote 는 두 가지다 — 하나는 PL/pgSQL **본문 경계**(`do $t$ … $t$`)이고
 * 나머지는 **문자열**이다. `do` 바로 뒤의 첫 태그를 본문으로 보고, 같은 태그가 다시
 * 나오면 본문을 닫는다. 그 사이의 다른 dollar-quote 는 문자열로 읽는다 (§80).
 */
export function execTokens(sql: string, from = 0, to = sql.length): ExecTokenResult {
  const tokens: ExecToken[] = []
  const errors: string[] = []
  let bodyTag: string | null = null
  let i = from

  const lineOf = (off: number) => {
    let n = 1
    for (let k = 0; k < off && k < sql.length; k++) if (sql[k] === NL) n++
    return n
  }

  while (i < to) {
    const c = sql[i]

    if (c === ' ' || c === '\t' || c === NL || c === CR) { i++; continue }

    // ── 주석은 실행되지 않는다 ───────────────────────────────────────
    if (c === '-' && sql[i + 1] === '-') {
      while (i < to && sql[i] !== NL) i++
      continue
    }
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1
      let j = i + 2
      while (j < to && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; continue }
        if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; continue }
        j++
      }
      if (depth > 0) {
        errors.push(`${lineOf(i)}행: 닫히지 않은 블록 주석`)
        return { tokens, errors }
      }
      i = j
      continue
    }

    // ── dollar-quote: 본문 경계인가 문자열인가 ──────────────────────
    if (c === '$') {
      const tag = readDollarTag(sql, i)
      if (tag === null) {
        errors.push(`${lineOf(i)}행: 해석할 수 없는 $`)
        return { tokens, errors }
      }
      const prev = tokens[tokens.length - 1]
      if (bodyTag === null && prev !== undefined && prev.t === 'w' && prev.v === 'do') {
        bodyTag = tag
        tokens.push({ t: 'q', v: tag, at: i })
        i += tag.length
        continue
      }
      if (bodyTag === tag) {
        bodyTag = null
        tokens.push({ t: 'q', v: tag, at: i })
        i += tag.length
        continue
      }
      const close = sql.indexOf(tag, i + tag.length)
      if (close < 0 || close + tag.length > to) {
        errors.push(`${lineOf(i)}행: 닫히지 않은 dollar-quote ${tag}`)
        return { tokens, errors }
      }
      tokens.push({ t: 's', v: sql.slice(i + tag.length, close), kind: 'dollar', at: i })
      i = close + tag.length
      continue
    }

    // ── escape 문자열 E'...' ────────────────────────────────────────
    if ((c === 'E' || c === 'e') && sql[i + 1] === "'" && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? ' ')) {
      let j = i + 2
      let value = ''
      let closed = false
      while (j < to) {
        if (sql[j] === '\\' && j + 1 < to) { value += sql[j + 1]; j += 2; continue }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { value += "'"; j += 2; continue }
          j++; closed = true; break
        }
        value += sql[j]; j++
      }
      if (!closed) {
        errors.push(`${lineOf(i)}행: 닫히지 않은 escape 문자열`)
        return { tokens, errors }
      }
      tokens.push({ t: 's', v: value, kind: 'escape', at: i })
      i = j
      continue
    }

    // ── 보통 문자열 '...' ───────────────────────────────────────────
    if (c === "'") {
      let j = i + 1
      let value = ''
      let closed = false
      while (j < to) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { value += "'"; j += 2; continue }
          j++; closed = true; break
        }
        value += sql[j]; j++
      }
      if (!closed) {
        errors.push(`${lineOf(i)}행: 닫히지 않은 문자열`)
        return { tokens, errors }
      }
      tokens.push({ t: 's', v: value, kind: 'single', at: i })
      i = j
      continue
    }

    // ── 따옴표 식별자 "..." ─────────────────────────────────────────
    if (c === '"') {
      const close = sql.indexOf('"', i + 1)
      if (close < 0 || close >= to) {
        errors.push(`${lineOf(i)}행: 닫히지 않은 따옴표 식별자`)
        return { tokens, errors }
      }
      tokens.push({ t: 'i', v: sql.slice(i + 1, close), at: i })
      i = close + 1
      continue
    }

    // ── 숫자 ────────────────────────────────────────────────────────
    if (/[0-9]/.test(c)) {
      let j = i
      while (j < to && /[0-9]/.test(sql[j])) j++
      if (sql[j] === '.' && /[0-9]/.test(sql[j + 1] ?? '')) {
        j++
        while (j < to && /[0-9]/.test(sql[j])) j++
      }
      tokens.push({ t: 'n', v: sql.slice(i, j), at: i })
      i = j
      continue
    }

    // ── 낱말 (한글 식별자는 이 SQL 에 없지만 들어오면 실패로 잡힌다) ──
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < to && /[A-Za-z0-9_]/.test(sql[j])) j++
      tokens.push({ t: 'w', v: sql.slice(i, j).toLowerCase(), at: i })
      i = j
      continue
    }

    // ── 연산자·구두점 ───────────────────────────────────────────────
    const op = OPERATORS.find(o => sql.startsWith(o, i) && i + o.length <= to)
    if (op !== undefined) {
      tokens.push({ t: 'p', v: op, at: i })
      i += op.length
      continue
    }

    errors.push(`${lineOf(i)}행: 지원하지 않는 문자 ${JSON.stringify(c)}`)
    return { tokens, errors }
  }

  if (bodyTag !== null) errors.push(`닫히지 않은 PL/pgSQL 본문 ${bodyTag}`)
  return { tokens, errors }
}

/** 토큰 배열 안에서 부분열이 나타나는 횟수 */
export function countSubsequence(tokens: ExecToken[], needle: string[]): number {
  if (needle.length === 0) return 0
  let n = 0
  for (let i = 0; i + needle.length <= tokens.length; i++) {
    let ok = true
    for (let k = 0; k < needle.length; k++) {
      if (sig(tokens[i + k]) !== needle[k]) { ok = false; break }
    }
    if (ok) n++
  }
  return n
}
