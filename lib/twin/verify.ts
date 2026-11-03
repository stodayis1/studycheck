// 형식 검증 + 결정론적 검산 (GPT-EXEC-001 작업 D-5·D-6·D-7, 작업 E)
//
// **이 파일만 `deterministic_check_passed` 를 만든다.**
// AI는 여기에 관여하지 않는다. AI 검토는 review.ts 에 따로 있고,
// 그 결과는 `ai_consensus_passed` 까지만 갈 수 있다 (flags.ts 참고).

import { checkGenerationFormat, normalizeAnswer, type TwinCandidateT } from './schema'
import type { FormatVerdict, DeterministicVerdict } from './flags'
import type { SourceProblem } from './targets'

/** 형식·정책 검증 — 스키마를 통과한 응답을 한 번 더 본다. */
export function runFormatValidation(
  result: { generation_status: 'generated' | 'unsupported'; candidates: TwinCandidateT[] },
  source: SourceProblem,
  requestedCount: number,
): FormatVerdict {
  const issues = checkGenerationFormat(result, {
    requestedCount,
    sourceTypeCode: source.type_code ?? '',
    sourceAnswerText: source.answer_text,
  })
  return { format_validation_passed: issues.length === 0, issues }
}

/**
 * 결정론적 검산 — 규칙 검사.
 *
 * ⚠ 지금은 **CAS 재계산이 없다.** `mathjs` 같은 CAS 라이브러리를 아직 넣지 않았고,
 *   의존성 추가는 GPT Work의 실행 지시를 받아야 한다 (D-042).
 *   그래서 이 함수는 **답의 형태가 규칙에 맞는지**까지만 판정하고,
 *   실제 재계산이 필요한 문항은 `deterministic_check_passed = false` 로 둔다.
 *
 * false 라고 해서 문항이 틀렸다는 뜻이 아니다. **기계가 확인하지 못했다**는 뜻이고,
 * 파일럿에서는 어차피 모든 후보가 사람 검수로 간다 (GPT-EXEC-001 §166).
 */
export function runDeterministicCheck(
  candidate: TwinCandidateT,
  source: SourceProblem,
): DeterministicVerdict {
  const detail: Record<string, unknown> = {}
  const fail = (reason: string): DeterministicVerdict => ({
    deterministic_check_passed: false,
    check_method: 'rule',
    check_detail: { ...detail, failed: reason },
  })

  // 1) 답의 형태가 선언한 종류와 맞는가
  if (candidate.answer_kind === 'choice') {
    const digits = parseChoices(candidate.answer_text)
    detail.parsed_choices = digits
    if (digits.length === 0) return fail('선택지 답을 해석할 수 없습니다')
    if (digits.length > 1) return fail('정답 선택지가 둘 이상입니다')
    if (digits[0] < 1 || digits[0] > 5) return fail('선택지 번호가 1~5 밖입니다')
  } else {
    const num = parseNumber(candidate.answer_text)
    detail.parsed_number = num
    if (num == null) return fail('숫자 답을 해석할 수 없습니다')
    if (!Number.isFinite(num)) return fail('숫자 답이 유한하지 않습니다')
  }

  // 2) 원문과 같은 답이면 숫자를 바꾸지 않은 것이다 (프롬프트 규칙 5)
  if (normalizeAnswer(candidate.answer_text) === normalizeAnswer(source.answer_text))
    return fail('원문과 정답이 같습니다')

  // 3) 새 그림이 필요하면 파일럿 대상이 아니다 (프롬프트 규칙 11)
  if (candidate.needs_new_image) return fail('새 그림이 필요한 문항입니다')

  // 4) 풀이 개요가 검산 가능한 형태인가
  if (candidate.solution_outline.length < 2) return fail('풀이 개요가 너무 짧습니다')

  // ── 여기까지는 "형태가 규칙에 맞다"는 뜻이다. ────────────────────────
  // 실제로 그 답이 나오는지 재계산하려면 CAS가 필요하다. 아직 없다.
  // 그러므로 통과시키지 않는다. 모르는 것을 통과시키면 안 된다.
  detail.note = 'CAS 미도입 — 규칙 검사만 수행했고 실제 재계산은 하지 않았습니다'
  return {
    deterministic_check_passed: false,
    check_method: 'rule',
    check_detail: detail,
  }
}

// ── 원문 복제 정도 (D-074) ──────────────────────────────────────────
//
// 여기 있던 `similarityToSource(후보본문, 원문정답)` 을 **삭제했다.**
//
// 그 함수는 후보의 문제 본문과 원문의 **정답 문자열**을 비교했다. 이건 유사도가 아니다.
// 문제 본문과 정답은 원래 닮을 이유가 없으므로 값이 늘 낮게 나오고,
// 화면에서는 "원문을 베끼지 않았다"는 **잘못된 안심**을 준다.
//
// 제대로 재려면 원문의 OCR·정규화 **본문**이 필요한데 아직 없다.
// 그래서 지금은 `similarity_to_source = null` 로 저장하고 화면은 '미확인'으로 쓴다 (D-066).
//
// 나중에 원문 본문이 생기면 아래 모양의 함수를 새로 만든다.
//   compareProblemTexts(candidateText: string, sourceProblemText: string): number
// 인자 이름이 둘 다 '본문'인 것이 중요하다. 정답을 넘길 수 있는 자리를 두지 않는다.

function parseChoices(s: string): number[] {
  const map: Record<string, number> = { '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5 }
  const out: number[] = []
  for (const ch of s ?? '') {
    if (map[ch]) out.push(map[ch])
    else if (/[1-5]/.test(ch)) out.push(Number(ch))
  }
  return [...new Set(out)]
}

function parseNumber(s: string): number | null {
  const cleaned = (s ?? '').replace(/\s|\$/g, '')
  // 분수 표기 a/b 허용
  const frac = cleaned.match(/^(-?\d+)\/(\d+)$/)
  if (frac) {
    const d = Number(frac[2])
    return d === 0 ? null : Number(frac[1]) / d
  }
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null
  return Number(cleaned)
}
