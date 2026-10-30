// 독립 AI 검토 (GPT-EXEC-001 작업 E)
//
// **이 파일은 `ai_consensus_passed` 까지만 만든다.**
// `independent_check_passed` 를 만들 수 없다 — 반환 타입(AiReviewVerdict)에 그 필드가 없다.
// 두 AI가 같은 오류를 낼 수 있기 때문이다 (CP-007 §301 · CP-008 변경 불가 원칙 2).
//
// 검토 모델에는 **원문도, 원문 정답도, 생성 모델이 낸 답도 주지 않는다.**
// 후보 문제 본문과 선택지만 준다. 그래야 독립 검토다.

import { zodTextFormat } from 'openai/helpers/zod'
import { TwinReviewResult, normalizeAnswer, type TwinCandidateT } from './schema'
import type { AiReviewVerdict } from './flags'
import type { Transport } from './generate'
import { ROLE_MODEL, type UsageReading } from './openaiSend'

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export type ReviewOutcome =
  | { kind: 'ok'; verdict: AiReviewVerdict }
  | { kind: 'refusal'; reason: string }
  | { kind: 'parse_error'; reason: string }
  | { kind: 'transport_error'; reason: string }
  // 033 §66: 출력 한도에 걸려 잘린 응답. 정상 완결이 아니다
  | { kind: 'incomplete'; reason: string }

export async function runAiReview(args: {
  instructions: string         // prompts/twin-review-v1.0.md 의 프롬프트 본문
  candidate: TwinCandidateT
  transport: Transport
  model?: string
}): Promise<ReviewOutcome> {
  // 033 §44·§64: 역할로 모델을 정한다. 환경변수로 조용히 바뀌지 않는다
  const model = args.model ?? ROLE_MODEL.review

  // 검토 모델에 보낼 것 — 문제 본문과 답의 종류뿐이다.
  // candidate.answer_text 를 넣지 않는다. 넣으면 그 답에 끌려가 독립 검토가 아니게 된다.
  const payload = {
    task: 'review_candidate_problem',
    problem_text_latex: args.candidate.problem_text_latex,
    answer_kind: args.candidate.answer_kind,
  }

  let raw: {
    output_parsed?: unknown
    refusal?: string | null
    incomplete?: string | null
    usage?: UsageReading
  }
  try {
    raw = await args.transport({
      role: 'review',
      model,
      instructions: args.instructions,
      input: [{ role: 'user', content: [{ type: 'input_text', text: JSON.stringify(payload) }] }],
      textFormat: zodTextFormat(TwinReviewResult, 'twin_review_result'),
    })
  } catch (e) {
    return { kind: 'transport_error', reason: errMessage(e) }
  }

  // 잘린 응답을 먼저 본다 (§66)
  if (raw.incomplete) return { kind: 'incomplete', reason: raw.incomplete }
  if (raw.refusal) return { kind: 'refusal', reason: raw.refusal }
  if (raw.output_parsed == null) return { kind: 'parse_error', reason: '응답이 비어 있습니다.' }

  const parsed = TwinReviewResult.safeParse(raw.output_parsed)
  if (!parsed.success) {
    return {
      kind: 'parse_error',
      reason: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' / '),
    }
  }

  const r = parsed.data

  // 검토 모델이 낸 답과 생성 모델이 낸 답이 같은가.
  // 같아도 그것은 "두 모델의 의견이 일치했다"는 뜻일 뿐이다.
  const agrees =
    r.valid &&
    r.single_answer &&
    !r.missing_condition &&
    !r.ambiguous &&
    !r.curriculum_mismatch &&
    r.answer_text != null &&
    normalizeAnswer(r.answer_text) === normalizeAnswer(args.candidate.answer_text)

  return {
    kind: 'ok',
    verdict: {
      ai_consensus_passed: agrees,
      ai_answer_text: r.answer_text,
      ai_issues: r.issues,
      ai_flags: {
        valid: r.valid,
        single_answer: r.single_answer,
        missing_condition: r.missing_condition,
        ambiguous: r.ambiguous,
        curriculum_mismatch: r.curriculum_mismatch,
      },
    },
  }
}
