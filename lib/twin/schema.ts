// 쌍둥이 문항 생성·검토의 Structured Outputs 스키마 (CP-007 §5·§6)
//
// 한 곳에서 Zod로 정의하고 OpenAI SDK helper로 JSON Schema를 뽑는다.
// 그래야 런타임 타입과 모델에 보내는 스키마가 갈라지지 않는다.
//
// 주의 — 이 파일의 타입은 "모델이 이렇게 답하기로 했다"는 약속일 뿐이다.
// 모델의 자기보고(single_answer_claim, reverse_derivation_risk, self_check_notes)는
// 검산 통과 근거로 쓰지 않는다. 판정은 서버가 따로 한다 (verify.ts).
//
// 패키지: zod@4.6.5, openai@7.22.0 (D-045로 설치 승인됨)

import { z } from 'zod'

// ── 생성 ────────────────────────────────────────────────────────────

export const VariantKind = z.enum(['numeric', 'wording', 'context', 'representation', 'mixed'])

// 파일럿에서는 number | choice만 허용한다 (CP-007 §256).
// image는 answer_text가 없어 서버 판정·누출 검사가 불가능하다 (D-025).
export const AnswerKind = z.enum(['number', 'choice'])

export const TwinCandidate = z.object({
  candidate_no: z.number().int(),
  variant_kind: VariantKind,
  problem_text_latex: z.string(),
  answer_kind: AnswerKind,
  answer_text: z.string(),
  solution_outline: z.array(z.string()),   // 2~6단계. 길이는 서버에서 검사한다
  concepts: z.array(z.string()),
  type_code: z.string(),
  difficulty_delta: z.number().int(),      // -1 | 0 | +1. 범위는 서버에서 검사한다
  common_mistakes: z.array(z.string()),
  transformations: z.array(z.string()),    // 원문에서 무엇을 바꿨는지. 최소 2개여야 한다

  // ↓ 여기부터는 모델의 자기보고다. 통과 근거로 쓰지 않는다 (CP-007 §259)
  reverse_derivation_risk: z.enum(['low', 'medium', 'high']),
  single_answer_claim: z.boolean(),
  needs_new_image: z.boolean(),
  self_check_notes: z.array(z.string()),
})

export const TwinGenerationResult = z.object({
  schema_version: z.literal('1.0'),
  generation_status: z.enum(['generated', 'unsupported']),
  unsupported_reason: z.string().nullable(),
  source_summary: z.object({
    core_concepts: z.array(z.string()),
    solution_structure: z.array(z.string()),
    estimated_difficulty: z.enum(['easy', 'medium', 'hard', 'unknown']),
  }),
  candidates: z.array(TwinCandidate),
})

// ── 독립 검토 ────────────────────────────────────────────────────────
// 검토 모델에는 후보 문제와 선택지만 준다. 원문도 생성 답도 주지 않는다 (CP-007 §265).

export const TwinReviewResult = z.object({
  valid: z.boolean(),
  answer_kind: AnswerKind,
  answer_text: z.string().nullable(),
  single_answer: z.boolean(),
  missing_condition: z.boolean(),
  ambiguous: z.boolean(),
  curriculum_mismatch: z.boolean(),
  solution_outline: z.array(z.string()),
  issues: z.array(z.string()),
})

export type TwinCandidateT = z.infer<typeof TwinCandidate>
export type TwinGenerationResultT = z.infer<typeof TwinGenerationResult>
export type TwinReviewResultT = z.infer<typeof TwinReviewResult>

// ── 모델·프롬프트 설정 ───────────────────────────────────────────────
// 모델명을 코드에 하드코딩하지 않는다 (CP-006 §231). 환경변수가 없을 때의
// 기본값은 CP-007 D-036에서 정한 값이고, 2026-09-23 공식 문서에서 존재를 확인했다.

export const twinConfig = {
  generationModel: process.env.OPENAI_TWIN_GENERATION_MODEL ?? 'gpt-6-astra',
  reviewModel: process.env.OPENAI_TWIN_REVIEW_MODEL ?? 'gpt-6-sol',
  promptVersion: process.env.TWIN_PROMPT_VERSION ?? 'twin-gen-v1.1',
}

// ── 형식 검증 (CP-007 §250) ─────────────────────────────────────────
// 모델 응답이 스키마를 통과했더라도 아래를 서버가 따로 확인한다.
// 여기서 걸리면 status='rejected'로 보내고 생성 비용만 기록한다.

export type FormatIssue = { code: string; detail: string }

/** 전체 응답이 아니라 판정에 필요한 부분만 받는다. 테스트에서 최소 객체로 부를 수 있다. */
type FormatCheckInput = {
  generation_status: 'generated' | 'unsupported'
  candidates: TwinCandidateT[]
}

export function checkGenerationFormat(
  result: FormatCheckInput,
  opts: { requestedCount: number; sourceTypeCode: string; sourceAnswerText: string },
): FormatIssue[] {
  const issues: FormatIssue[] = []

  if (result.generation_status === 'unsupported') {
    // unsupported면 candidates는 비어 있어야 한다
    if (result.candidates.length > 0)
      issues.push({ code: 'unsupported_with_candidates', detail: '그림이 필요하다고 해놓고 후보를 냈다' })
    return issues
  }

  if (result.candidates.length !== opts.requestedCount)
    issues.push({
      code: 'candidate_count',
      detail: `요청 ${opts.requestedCount}개인데 ${result.candidates.length}개가 왔다`,
    })

  for (const c of result.candidates) {
    const at = `후보 ${c.candidate_no}`

    // type_code는 입력값과 정확히 같아야 한다
    if (c.type_code !== opts.sourceTypeCode)
      issues.push({ code: 'type_code_mismatch', detail: `${at}: ${c.type_code} ≠ ${opts.sourceTypeCode}` })

    // 정답이 원문과 같으면 숫자를 안 바꿨다는 뜻이다
    if (normalizeAnswer(c.answer_text) === normalizeAnswer(opts.sourceAnswerText))
      issues.push({ code: 'answer_same_as_source', detail: `${at}: 원문과 정답이 같다` })

    // 파일럿에서는 새 이미지가 필요한 문항을 쓰지 않는다
    if (c.needs_new_image)
      issues.push({ code: 'needs_new_image', detail: `${at}: 새 그림이 필요하다고 표시됐다` })

    // 표면 변형을 최소 2개 해야 한다 (프롬프트 규칙 4)
    if (c.transformations.length < 2)
      issues.push({ code: 'too_few_transformations', detail: `${at}: 바꾼 것이 ${c.transformations.length}개뿐` })

    // solution_outline은 2~6단계
    if (c.solution_outline.length < 2 || c.solution_outline.length > 6)
      issues.push({ code: 'outline_length', detail: `${at}: 풀이 개요가 ${c.solution_outline.length}단계` })

    // difficulty_delta는 -1 | 0 | +1
    if (![-1, 0, 1].includes(c.difficulty_delta))
      issues.push({ code: 'difficulty_delta_range', detail: `${at}: ${c.difficulty_delta}` })

    // 문제 본문에 정답·해설이 섞이면 안 된다 (프롬프트 규칙 12)
    if (/정답|해설|힌트/.test(c.problem_text_latex))
      issues.push({ code: 'answer_in_problem_text', detail: `${at}: 본문에 정답·해설·힌트 표현이 있다` })
  }

  return issues
}

// 정답 비교용 정규화. 공백·달러기호·후행 0을 지운다.
// 판정에 쓰는 값이므로 느슨하게 만들지 않는다 — 다르면 다르다고 해야 한다.
export function normalizeAnswer(s: string): string {
  return (s ?? '')
    .replace(/\$/g, '')
    .replace(/\s+/g, '')
    .replace(/^\+/, '')
    .toLowerCase()
}
