/**
 * 자동 채점 — **기존 QR 채점 경로의 규칙 그대로** (043 §3-A)
 *
 * 왜 여기 있나
 *   GPT_EXEC_043 §3-A: 「자동 채점 지원 형식은 **기존 채점 경로로 확인**한다.
 *   단순 문자열 비교로 전체 수학 답안을 맞다고 주장하지 않는다.
 *   미지원 서술형은 첫 자동판에서 제외한다.」
 *
 *   규칙을 새로 만들지 않았다. `app/grade/[code]/page.tsx` 와
 *   `app/api/grade/[code]/route.ts` 가 쓰는 것을 **옮겨 적었다.**
 *
 *     answer_kind = 'choice'  → `answer_text` 안의 ①②③④⑤ 를 숫자로 바꿔 **집합 비교**
 *     answer_kind = 'number'  → 공백·쉼표만 지우고 **글자 비교**
 *     answer_kind = 'image'   → **자동 채점 안 한다** (사진 보고 사람이 본다)
 *     is_essay = true         → **자동 채점 안 한다**
 *
 * 두 벌이 되면 어긋나므로, 운영에 올릴 때는 `grade/[code]` 쪽이
 * **여기를 import 하도록** 바꾼다. 지금 두 벌인 것은 아직 합치지 않았기 때문이다.
 */

/** 객관식 동그라미 숫자. 원본과 같은 순서 */
const CIRCLE = '①②③④⑤'

/** `'③, ⑤'` → `['3','5']` — `app/api/grade/[code]/route.ts` 의 `choiceDigits` */
export function choiceDigits(text: string | null | undefined): string[] {
  if (!text) return []
  return Array.from(text)
    .filter((c) => CIRCLE.includes(c))
    .map((c) => String(CIRCLE.indexOf(c) + 1))
}

/** 숫자형 비교용 정규화 — `app/grade/[code]/page.tsx` 의 `norm` */
export function norm(s: string): string {
  return s.replace(/[\s,]/g, '').trim()
}

export type AnswerKind = 'choice' | 'number' | 'image'

export type GradableProblem = {
  answerKind: AnswerKind
  /** 서버에만 있는 값. 학생 payload 로 내보내지 않는다 */
  answerText: string | null
  isEssay: boolean
}

/**
 * 이 문항을 **자동으로 채점할 수 있는가.**
 *
 * 할 수 없는 것을 첫 자동판에 넣지 않는다 (043 §3-A).
 * 「할 수 없다」와 「틀렸다」는 다른 말이다.
 */
export function autoGradable(p: GradableProblem): boolean {
  if (p.isEssay) return false
  if (p.answerKind === 'image') return false
  if (p.answerText === null || norm(p.answerText) === '') return false
  if (p.answerKind === 'choice') return choiceDigits(p.answerText).length > 0
  return true
}

/**
 * 채점한다. **채점할 수 없으면 `null`** 이다 — 맞음/틀림으로 바꾸지 않는다.
 *
 * `answer` 는 학생이 낸 것이다.
 *   choice: `'③'` · `'3'` · `'③,⑤'` 어느 쪽으로 와도 숫자 집합으로 견준다
 *   number: 공백·쉼표만 지우고 견준다
 */
export type GradeOutcome = {
  /** 맞음·틀림. 채점하지 않았으면 **null** */
  result: 'correct' | 'wrong' | null
  /** `result` 가 null 인 이유. 화면·보고에 그대로 적는다 */
  why: string | null
  /**
   * **읽을 수 없는 입력**이라 채점하지 않았는가 (045 §3 · R045-04 §7.4).
   *
   * 「미지원」은 **오답이 아니다.** 둘을 한 칸에 담으면 못 읽은 제출이
   * 틀린 제출로 기록에 남는다.
   */
  unsupportedInput: boolean
}

/**
 * 학생이 적은 보기 글자를 **보기 번호로 읽는다. 못 읽으면 `null`.**
 *
 * 전에는 `norm(answer)` 의 글자를 `'1'..'5'` 로 **걸러 냈다.** 그래서 `'30'` 이
 * `['3']` 이 되고, 정답이 `③` 인 문항에서 **맞음으로 채점됐다** (GPT 탐침 P08).
 * 걸러 내지 않고 **전부 보기 번호여야** 받는다.
 *
 *   받는다   `'③'` · `'③, ⑤'` · `'⑤③'` · `'3'` · `'3,5'` · `'3 5'`
 *   못 읽는다 `'30'` · `'35x'` · `'6'` · `'0'` · `'33'`(같은 번호 두 번) · `'③번'`
 *
 * 구분자는 공백 · 쉼표 · `/` 만. 나머지 글자가 남으면 받지 않는다 —
 * 무엇을 고른 것인지 **추측하지 않는다.**
 */
export function parseChoiceTokens(answer: string): string[] | null {
  if (typeof answer !== 'string') return null
  const circled = choiceDigits(answer)
  if (circled.length > 0) {
    // 동그라미를 썼다면 **동그라미와 구분자만** 있어야 한다
    const rest = Array.from(answer).filter((c) => !CIRCLE.includes(c) && !/[\s,/]/.test(c))
    if (rest.length > 0) return null
    return dedupedTokens(circled)
  }
  const bare = answer.replace(/[\s,/]/g, '')
  if (bare === '') return null
  if (bare.length > CIRCLE.length) return null
  // **전부** 보기 번호여야 한다. 하나라도 아니면 못 읽은 것이다
  for (const c of bare) if (c < '1' || c > '5') return null
  return dedupedTokens(Array.from(bare))
}

/** 같은 번호를 두 번 적었으면 못 읽은 것으로 둔다 — 무엇을 뜻하는지 모른다 */
function dedupedTokens(xs: string[]): string[] | null {
  const set = new Set(xs)
  return set.size === xs.length ? xs : null
}

/**
 * 채점한다 — **이유까지** 돌려준다.
 *
 * `gradeAnswer` 는 이 함수의 `result` 만 꺼내 쓰는 얇은 껍데기다.
 */
export function gradeAnswerDetailed(p: GradableProblem, answer: string): GradeOutcome {
  const no = whyNotGradable(p)
  if (no !== null) return { result: null, why: no, unsupportedInput: false }
  if (typeof answer !== 'string' || norm(answer) === '') {
    // 아무것도 내지 않은 것은 **읽을 수 없는 입력이 아니라** 빈 제출이다
    return { result: 'wrong', why: null, unsupportedInput: false }
  }

  if (p.answerKind === 'choice') {
    const mine = parseChoiceTokens(answer)
    if (mine === null) {
      return {
        result: null,
        why: '적어 주신 답을 보기 번호로 읽을 수 없어 채점하지 않았습니다 (틀린 것이 아닙니다)',
        unsupportedInput: true,
      }
    }
    const real = choiceDigits(p.answerText).sort().join(',')
    const got = [...mine].sort().join(',')
    return { result: got === real ? 'correct' : 'wrong', why: null, unsupportedInput: false }
  }
  // number — 공백·쉼표만 지우고 글자 그대로 견준다
  return {
    result: norm(answer) === norm(p.answerText ?? '') ? 'correct' : 'wrong',
    why: null, unsupportedInput: false,
  }
}

export function gradeAnswer(p: GradableProblem, answer: string): 'correct' | 'wrong' | null {
  return gradeAnswerDetailed(p, answer).result
}

/** 왜 자동 채점을 못 하는지 — 화면·보고에 그대로 적는다 */
export function whyNotGradable(p: GradableProblem): string | null {
  if (p.isEssay) return '서술형이라 자동 채점하지 않습니다 (선생님이 봅니다)'
  if (p.answerKind === 'image') return '정답이 그림이라 자동 채점하지 않습니다'
  if (p.answerText === null || norm(p.answerText) === '') return '정답 글자가 없어 자동 채점하지 않습니다'
  if (p.answerKind === 'choice' && choiceDigits(p.answerText).length === 0) {
    return '객관식인데 보기 번호를 읽을 수 없어 자동 채점하지 않습니다'
  }
  return null
}
