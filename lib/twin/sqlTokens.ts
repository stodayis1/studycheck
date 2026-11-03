// SQL 어휘 분해 — 실행문과 "실행문이 아닌 것" 을 가른다 (GPT-EXEC-018 §52)
//
// 왜 필요한가
//   017 의 감사기는 줄 주석(`--`)만 지웠다. 그래서 GPT 검수가 이것들을 통과시켰다.
//     - `[5-나]` 의 42501 판정을 `/* ... */` 로 감싸기          → 실행되지 않는데 통과
//     - 같은 판정을 `$probe$ ... $probe$` 문자열 안으로 옮기기  → 실행되지 않는데 통과
//   주석과 문자열 안의 `if` / `raise` 는 **코드가 아니다.**
//
// 무엇을 하는가
//   원문과 **같은 길이**의 마스킹된 문자열을 만든다. 주석·문자열 자리를 공백으로 덮되
//   줄바꿈은 살려서, 오프셋과 줄 번호가 원문과 1:1로 유지된다.
//   그리고 지운 문자열 리터럴의 **값**을 오프셋과 함께 따로 보관한다 — §56 이
//   "모든 문자열을 지운 뒤 필요한 상수를 잃는 구현은 피한다" 고 했기 때문이다.
//   `'42501'` 같은 값을 구조 안에서 다시 확인할 수 있어야 한다.
//
// PL/pgSQL 본문과 그 안의 문자열을 구분한다 (§57)
//   `do $t$ ... $t$;` 의 `$t$` 는 **본문 경계**라 코드로 남긴다.
//   본문 **안에서** 다시 나오는 dollar-quote(`$probe$` 등)는 문자열로 덮는다.
//
// 모르는 구조는 조용히 통과시키지 않는다 — `errors` 로 돌려준다 (§59).

const NL = String.fromCharCode(10)

/** 지워진 문자열 리터럴 하나 */
export type StringLiteral = {
  /** 원문에서의 시작 오프셋 (여는 따옴표 위치) */
  start: number
  /** 원문에서의 끝 오프셋 (닫는 따옴표 다음) */
  end: number
  /** 따옴표를 벗긴 값. `''` 는 `'` 로 풀어 둔다 */
  value: string
  kind: 'single' | 'escape' | 'dollar'
}

export type TokenizeResult = {
  /** 원문과 길이가 같고, 주석·문자열이 공백으로 덮인 문자열 */
  code: string
  literals: StringLiteral[]
  /** 어휘 분해에 실패한 이유. 비어 있지 않으면 감사를 통과시키지 않는다 */
  errors: string[]
}

/** dollar-quote 여는 태그를 읽는다. `$tag$` 또는 `$$` */
function readDollarTag(s: string, i: number): string | null {
  if (s[i] !== '$') return null
  let j = i + 1
  while (j < s.length && /[A-Za-z0-9_]/.test(s[j])) j++
  if (s[j] !== '$') return null
  return s.slice(i, j + 1)
}

/**
 * 주석과 문자열을 공백으로 덮는다. 길이·줄 번호는 그대로 유지한다.
 *
 * 지원하는 것
 *   `-- 줄 주석` · `/* 블록 주석 *​/`(중첩 포함) · `'문자열'`(`''` escape) ·
 *   `E'문자열'`(백슬래시 escape) · `$tag$ ... $tag$`
 *
 * `do $tag$` 뒤의 dollar-quote 는 **PL/pgSQL 본문**이라 코드로 남긴다.
 */
export function tokenizeSql(sql: string): TokenizeResult {
  const out = sql.split('')
  const literals: StringLiteral[] = []
  const errors: string[] = []

  /** 지금 열려 있는 PL/pgSQL 본문 태그들 (보통 하나) */
  const bodyStack: string[] = []
  let i = 0

  /** [from, to) 를 공백으로 덮되 줄바꿈은 남긴다 */
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== NL && out[k] !== String.fromCharCode(13)) out[k] = ' '
    }
  }

  while (i < sql.length) {
    const c = sql[i]

    // ── 줄 주석 ──────────────────────────────────────────────────────
    if (c === '-' && sql[i + 1] === '-') {
      let j = i
      while (j < sql.length && sql[j] !== NL) j++
      blank(i, j)
      i = j
      continue
    }

    // ── 블록 주석 (중첩 지원) ────────────────────────────────────────
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1
      let j = i + 2
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; continue }
        if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; continue }
        j++
      }
      if (depth > 0) {
        errors.push(`닫히지 않은 블록 주석 (오프셋 ${i})`)
        blank(i, sql.length)
        break
      }
      blank(i, j)
      i = j
      continue
    }

    // ── dollar-quote ────────────────────────────────────────────────
    if (c === '$') {
      const tag = readDollarTag(sql, i)
      if (tag !== null) {
        // 이 태그가 지금 열려 있는 본문의 **닫는** 태그인가
        if (bodyStack.length > 0 && bodyStack[bodyStack.length - 1] === tag) {
          bodyStack.pop()
          i += tag.length
          continue
        }

        // `do $tag$` 처럼 앞에 do 가 있으면 **본문을 여는** 태그다 → 코드로 남긴다
        const before = sql.slice(Math.max(0, i - 40), i)
        const opensBody = /\bdo\s*$/i.test(before)
        if (opensBody) {
          bodyStack.push(tag)
          i += tag.length
          continue
        }

        // 그 밖의 dollar-quote 는 **문자열**이다
        const close = sql.indexOf(tag, i + tag.length)
        if (close < 0) {
          errors.push(`닫히지 않은 dollar-quote ${tag} (오프셋 ${i})`)
          blank(i, sql.length)
          break
        }
        const end = close + tag.length
        literals.push({
          start: i, end,
          value: sql.slice(i + tag.length, close),
          kind: 'dollar',
        })
        blank(i, end)
        i = end
        continue
      }
    }

    // ── escape 문자열 E'...' ────────────────────────────────────────
    if ((c === 'E' || c === 'e') && sql[i + 1] === "'" && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? ' ')) {
      let j = i + 2
      let value = ''
      let closed = false
      while (j < sql.length) {
        if (sql[j] === '\\' && j + 1 < sql.length) { value += sql[j + 1]; j += 2; continue }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { value += "'"; j += 2; continue }
          j++; closed = true; break
        }
        value += sql[j]; j++
      }
      if (!closed) {
        errors.push(`닫히지 않은 escape 문자열 (오프셋 ${i})`)
        blank(i, sql.length)
        break
      }
      literals.push({ start: i, end: j, value, kind: 'escape' })
      blank(i, j)
      i = j
      continue
    }

    // ── 보통 문자열 '...' ───────────────────────────────────────────
    if (c === "'") {
      let j = i + 1
      let value = ''
      let closed = false
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") { value += "'"; j += 2; continue }
          j++; closed = true; break
        }
        value += sql[j]; j++
      }
      if (!closed) {
        errors.push(`닫히지 않은 문자열 (오프셋 ${i})`)
        blank(i, sql.length)
        break
      }
      literals.push({ start: i, end: j, value, kind: 'single' })
      blank(i, j)
      i = j
      continue
    }

    i++
  }

  if (bodyStack.length > 0) {
    errors.push(`닫히지 않은 PL/pgSQL 본문: ${bodyStack.join(' ')}`)
  }

  return { code: out.join(''), literals, errors }
}

/** 오프셋 → 1-based 줄 번호 */
export function lineAt(sql: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < sql.length; i++) if (sql[i] === NL) line++
  return line
}

/** [start, end) 안에 있는 문자열 리터럴의 값들 */
export function literalsIn(
  literals: StringLiteral[], start: number, end: number,
): string[] {
  return literals.filter(l => l.start >= start && l.end <= end).map(l => l.value)
}

/**
 * `if ... then` 의 대응하는 `end if` 를 찾는다. 중첩을 센다.
 *
 * @param code 마스킹된 코드 (주석·문자열이 덮인 것)
 * @param ifAt `if` 키워드 시작 오프셋
 * @returns 본문 [thenEnd, endIfStart) 또는 null
 */
export function ifBody(code: string, ifAt: number): { from: number; to: number } | null {
  const thenRe = /\bthen\b/gi
  thenRe.lastIndex = ifAt
  const thenM = thenRe.exec(code)
  if (thenM === null) return null
  const from = thenM.index + thenM[0].length

  let depth = 1
  const re = /\bif\b|\bend\s+if\b/gi
  re.lastIndex = from
  let m: RegExpExecArray | null
  while ((m = re.exec(code)) !== null) {
    if (/^if$/i.test(m[0])) { depth++; continue }
    depth--
    if (depth === 0) return { from, to: m.index }
  }
  return null
}
