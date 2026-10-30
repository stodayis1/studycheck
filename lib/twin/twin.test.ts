// 쌍둥이 파이프라인 단위 테스트 (GPT-EXEC-001 완료 기준 5~10)
//
// 실행: npm run test:twin
//
// 여기서 확인하는 것은 "잘 되는가"가 아니라 **안전장치가 뚫리지 않는가**다.
//   - AI 합의만으로 independent_check_passed 가 켜지지 않는가 (기준 6)
//   - student_publish_approved 이 자동으로 켜지지 않는가 (기준 7)
//   - 미승인·미게시 문항이 학생 응답에 섞이지 않는가 (기준 8)
//   - answer_text 없는 문항이 대상 선정에서 빠지는가 (기준 9)

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { mergeFlags, nextStatus, canAutoApprove } from './flags'
import type { FormatVerdict, DeterministicVerdict, AiReviewVerdict } from './flags'
import { runFormatValidation, runDeterministicCheck } from './verify'
import { checkGenerationFormat, normalizeAnswer } from './schema'
import { isEligible } from './targets'
import { buildGenerationInput } from './source'
import { generateCandidates, isUnsupported } from './generate'
import { runAiReview } from './review'
import { studentSafeExample, type ExampleRow } from './publish'
import type { SourceProblem } from './targets'
import type { TwinCandidateT } from './schema'

const detailOf = (d: { check_detail: Record<string, unknown> }, k: string) => String(d.check_detail[k] ?? '')

// ── 픽스처 ──────────────────────────────────────────────────────────

const source: SourceProblem = {
  id: 5479, book: '쎈', grade: '공통수학1', semester: 1,
  type_code: '공수1-09-09', step: 'B', difficulty: '대표',
  answer_kind: 'number', answer_text: '12', image_path: 'hc1-1/ssen/09/0001.png',
  twin_id: null, is_essay: false,
}

function candidate(over: Partial<TwinCandidateT> = {}): TwinCandidateT {
  return {
    candidate_no: 1,
    variant_kind: 'mixed',
    problem_text_latex: '서로 다른 4개의 문자 중 2개를 뽑아 일렬로 나열하는 경우의 수를 구하시오.',
    answer_kind: 'number',
    answer_text: '20',
    solution_outline: ['순열의 수 공식을 떠올린다', 'nPr에 값을 대입한다', '계산한다'],
    concepts: ['순열'],
    type_code: '공수1-09-09',
    difficulty_delta: 0,
    common_mistakes: ['조합과 혼동'],
    transformations: ['계수·수치', '문장 맥락'],
    reverse_derivation_risk: 'low',
    single_answer_claim: true,
    needs_new_image: false,
    self_check_notes: ['검산 완료'],
    ...over,
  }
}

const okFormat: FormatVerdict = { format_validation_passed: true, issues: [] }
const failedDeterministic: DeterministicVerdict = {
  deterministic_check_passed: false, check_method: 'rule', check_detail: {},
}
const passedDeterministic: DeterministicVerdict = {
  deterministic_check_passed: true, check_method: 'cas', check_detail: {},
}
const aiAgrees: AiReviewVerdict = {
  ai_consensus_passed: true, ai_answer_text: '20', ai_issues: [],
  ai_flags: { valid: true, single_answer: true, missing_condition: false, ambiguous: false, curriculum_mismatch: false },
}

// ── 기준 6: AI 합의만으로 독립 검산이 통과되지 않는다 ─────────────────

test('AI 검토가 일치해도 independent_check_passed 는 false 다', () => {
  const flags = mergeFlags(okFormat, failedDeterministic, aiAgrees)
  assert.equal(flags.ai_consensus_passed, true, 'AI 합의는 기록된다')
  assert.equal(flags.independent_check_passed, false, 'AI 합의로 독립 검산이 켜지면 안 된다')
})

test('결정론적 검산이 통과해야만 independent_check_passed 가 true 다', () => {
  const flags = mergeFlags(okFormat, passedDeterministic, null)
  assert.equal(flags.independent_check_passed, true)
  assert.equal(flags.ai_consensus_passed, false, 'AI를 돌리지 않았으면 합의도 없다')
})

test('AI 검토 결과 타입에는 independent_check_passed 가 존재하지 않는다', () => {
  assert.equal('independent_check_passed' in aiAgrees, false)
})

// ── 기준 7: student_publish_approved 이 자동으로 켜지지 않는다 ─────────────

test('자동 승인 경로가 존재하지 않는다', () => {
  assert.equal(canAutoApprove(), false)
})

test('모든 검산을 통과해도 teacher_approved 는 false 로 시작한다', () => {
  const flags = mergeFlags(okFormat, passedDeterministic, aiAgrees)
  assert.equal(flags.teacher_approved, false)
  assert.equal(nextStatus(flags), 'pending_review', '검산을 다 통과해도 사람 검수로 간다')
})

test('형식 검증이 깨지면 사람 검수로 보내지 않고 거부한다', () => {
  const flags = mergeFlags({ format_validation_passed: false, issues: [] } as FormatVerdict, failedDeterministic, null)
  assert.equal(nextStatus(flags), 'rejected')
})

// ── 기준 8: 미승인·미게시 문항이 학생 응답에 섞이지 않는다 ─────────────

test('published 가 아닌 예제는 학생 응답으로 나가지 않는다', () => {
  const approvedOnly: ExampleRow = {
    id: 'a', type_code: 'x', problem_text_latex: '문제',
    answer_text: '42', solution_outline: ['풀이'],
    status: 'approved', student_publish_approved: false, retired_at: null,
  }
  assert.equal(studentSafeExample(approvedOnly), null, 'approved 만으로는 나가면 안 된다')
})

test('published 예제라도 answer_text 와 solution_outline 은 빠진다', () => {
  const published: ExampleRow = {
    id: 'b', type_code: 'x', problem_text_latex: '문제',
    answer_text: '42', solution_outline: ['풀이 1단계'],
    // D-050: 게시된 것은 안전 승인을 받은 상태다
    status: 'published', student_publish_approved: true, retired_at: null,
  }
  const out = studentSafeExample(published)
  assert.ok(out, 'published 는 나간다')
  assert.equal('answer_text' in (out as object), false, '정답이 새면 안 된다')
  assert.equal('solution_outline' in (out as object), false, '풀이가 새면 안 된다')
  assert.equal(out!.problem_text_latex, '문제')
})

test('내려간(retired) 예제는 나가지 않는다', () => {
  const retired: ExampleRow = {
    id: 'c', type_code: 'x', problem_text_latex: '문제',
    answer_text: '42', solution_outline: [],
    status: 'published', student_publish_approved: true, retired_at: '2026-09-23T00:00:00Z',
  }
  assert.equal(studentSafeExample(retired), null)
})

// ── 기준 9: answer_text 없는 문항이 대상 선정에서 빠진다 ───────────────

test('answer_text 가 없으면 생성 대상이 아니다', () => {
  assert.equal(isEligible({ twin_id: null, answer_text: null, answer_kind: 'image', is_essay: false }), false)
  assert.equal(isEligible({ twin_id: null, answer_text: '', answer_kind: 'number', is_essay: false }), false)
})

test('쌍둥이가 이미 있거나 서술형이면 대상이 아니다', () => {
  assert.equal(isEligible({ twin_id: 4581, answer_text: '3', answer_kind: 'number', is_essay: false }), false)
  assert.equal(isEligible({ twin_id: null, answer_text: '3', answer_kind: 'number', is_essay: true }), false)
})

test('조건을 다 만족하면 대상이다', () => {
  // D-088: image_path 가 조건에 들어왔다. 이미지가 없으면 모델이 원문을 못 본다
  assert.equal(isEligible({
    twin_id: null, answer_text: '12', answer_kind: 'number',
    is_essay: false, image_path: 'a/b.png',
  }), true)
  assert.equal(isEligible({
    twin_id: null, answer_text: '③', answer_kind: 'choice',
    is_essay: false, image_path: 'a/b.png',
  }), true)
})

// ── 형식 검증 ───────────────────────────────────────────────────────

test('정답이 원문과 같으면 형식 검증에서 걸린다', () => {
  const v = runFormatValidation(
    { generation_status: 'generated', candidates: [candidate({ answer_text: '12' })] },
    source, 1,
  )
  assert.equal(v.format_validation_passed, false)
  assert.ok(v.issues.some(i => i.code === 'answer_same_as_source'))
})

test('새 그림이 필요하다고 하면 걸린다', () => {
  const v = runFormatValidation(
    { generation_status: 'generated', candidates: [candidate({ needs_new_image: true })] },
    source, 1,
  )
  assert.ok(v.issues.some(i => i.code === 'needs_new_image'))
})

test('변형이 2개 미만이면 걸린다', () => {
  const v = runFormatValidation(
    { generation_status: 'generated', candidates: [candidate({ transformations: ['계수·수치'] })] },
    source, 1,
  )
  assert.ok(v.issues.some(i => i.code === 'too_few_transformations'))
})

test('본문에 정답·해설이 섞이면 걸린다', () => {
  const v = runFormatValidation(
    { generation_status: 'generated', candidates: [candidate({ problem_text_latex: '... (정답: 20)' })] },
    source, 1,
  )
  assert.ok(v.issues.some(i => i.code === 'answer_in_problem_text'))
})

test('type_code 가 원문과 다르면 걸린다', () => {
  const v = runFormatValidation(
    { generation_status: 'generated', candidates: [candidate({ type_code: '중2-1-09-05' })] },
    source, 1,
  )
  assert.ok(v.issues.some(i => i.code === 'type_code_mismatch'))
})

test('정상 후보는 형식 검증을 통과한다', () => {
  const v = runFormatValidation({ generation_status: 'generated', candidates: [candidate()] }, source, 1)
  assert.equal(v.format_validation_passed, true, JSON.stringify(v.issues))
})

test('unsupported 인데 후보를 내면 걸린다', () => {
  const issues = checkGenerationFormat(
    { generation_status: 'unsupported' as const, candidates: [candidate()] },
    { requestedCount: 2, sourceTypeCode: source.type_code!, sourceAnswerText: source.answer_text },
  )
  assert.ok(issues.some(i => i.code === 'unsupported_with_candidates'))
})

// ── 결정론적 검산 ───────────────────────────────────────────────────

test('CAS가 없으므로 정상 후보도 결정론적 검산을 통과하지 못한다', () => {
  const d = runDeterministicCheck(candidate(), source)
  assert.equal(d.deterministic_check_passed, false, '모르는 것을 통과시키면 안 된다')
  assert.match(detailOf(d, 'note'), /CAS 미도입/)
})

test('선택지 답이 둘 이상이면 검산에서 걸린다', () => {
  const d = runDeterministicCheck(candidate({ answer_kind: 'choice', answer_text: '③, ⑤' }), source)
  assert.equal(detailOf(d, 'failed'), '정답 선택지가 둘 이상입니다')
})

test('숫자 답을 해석할 수 없으면 걸린다', () => {
  const d = runDeterministicCheck(candidate({ answer_text: '약 스무 가지' }), source)
  assert.equal(detailOf(d, 'failed'), '숫자 답을 해석할 수 없습니다')
})

test('분수 답은 해석된다', () => {
  const d = runDeterministicCheck(candidate({ answer_text: '3/4' }), source)
  assert.equal(detailOf(d, 'parsed_number'), '0.75')
})

// ── 생성 호출 (mock) ────────────────────────────────────────────────

test('실제 API 호출은 기본적으로 차단돼 있다', async () => {
  // 033 §68: live 잠금은 그대로다. 다만 033 §2 에서 전송이 공통 모듈로 옮겨가면서
  // 던지는 값이 **분류 코드**가 됐다 (원문 메시지를 밖으로 내보내지 않기 위해 — §142).
  // 시험의 뜻은 같다: 허용하지 않으면 요청이 나가지 않는다.
  const { createOpenAiTransport } = await import('./generate')
  const { ROLE_MODEL } = await import('./openaiSend')
  const t = createOpenAiTransport({ allowLiveCall: false })
  await assert.rejects(
    () => t({
      role: 'generation', model: ROLE_MODEL.generation,
      instructions: '', input: [], textFormat: {},
    }),
    (e: unknown) => {
      assert.equal((e as { name?: string }).name, 'TransportFailure')
      assert.equal((e as { code?: string }).code, 'live_call_blocked')
      return true
    },
  )
})

test('mock 응답으로 생성 → 파싱 흐름이 돈다', async () => {
  const out = await generateCandidates({
    instructions: '(프롬프트)',
    input: buildGenerationInput(source, 2),
    imageDataUrl: null,
    transport: async () => ({
      output_parsed: {
        schema_version: '1.0',
        generation_status: 'generated',
        unsupported_reason: null,
        source_summary: { core_concepts: ['순열'], solution_structure: ['공식', '대입'], estimated_difficulty: 'medium' },
        candidates: [candidate({ candidate_no: 1 }), candidate({ candidate_no: 2, answer_text: '30' })],
      },
    }),
  })
  assert.equal(out.kind, 'ok')
  if (out.kind === 'ok') {
    assert.equal(out.result.candidates.length, 2)
    assert.equal(isUnsupported(out.result), false)
  }
})

test('모델이 거부하면 refusal 로 처리한다', async () => {
  const out = await generateCandidates({
    instructions: '', input: buildGenerationInput(source, 2), imageDataUrl: null,
    transport: async () => ({ refusal: '요청을 처리할 수 없습니다' }),
  })
  assert.equal(out.kind, 'refusal')
})

test('스키마에 맞지 않는 응답은 parse_error 다', async () => {
  const out = await generateCandidates({
    instructions: '', input: buildGenerationInput(source, 2), imageDataUrl: null,
    transport: async () => ({ output_parsed: { schema_version: '1.0', generation_status: '엉뚱한값' } }),
  })
  assert.equal(out.kind, 'parse_error')
})

test('unsupported 응답은 실패가 아니라 정상 회신이다', async () => {
  const out = await generateCandidates({
    instructions: '', input: buildGenerationInput(source, 2), imageDataUrl: null,
    transport: async () => ({
      output_parsed: {
        schema_version: '1.0', generation_status: 'unsupported',
        unsupported_reason: '그래프가 있어야 같은 구조를 유지할 수 있습니다',
        source_summary: { core_concepts: [], solution_structure: [], estimated_difficulty: 'unknown' },
        candidates: [],
      },
    }),
  })
  assert.equal(out.kind, 'ok')
  if (out.kind === 'ok') assert.equal(isUnsupported(out.result), true)
})

// ── AI 검토 (mock) ──────────────────────────────────────────────────

test('AI 검토에 생성 답을 넘기지 않는다', async () => {
  let sent = ''
  await runAiReview({
    instructions: '(검토 프롬프트)',
    candidate: candidate(),
    transport: async (req) => {
      sent = JSON.stringify(req.input)
      return { output_parsed: {
        valid: true, answer_kind: 'number', answer_text: '20', single_answer: true,
        missing_condition: false, ambiguous: false, curriculum_mismatch: false,
        solution_outline: ['확인'], issues: [],
      } }
    },
  })
  assert.equal(sent.includes('"20"'), false, '생성 모델의 답이 검토 요청에 섞이면 독립 검토가 아니다')
  assert.ok(sent.includes('problem_text_latex'), '문제 본문은 보낸다')
})

test('AI가 다른 답을 내면 합의가 아니다', async () => {
  const out = await runAiReview({
    instructions: '', candidate: candidate(),
    transport: async () => ({ output_parsed: {
      valid: true, answer_kind: 'number', answer_text: '24', single_answer: true,
      missing_condition: false, ambiguous: false, curriculum_mismatch: false,
      solution_outline: [], issues: [],
    } }),
  })
  assert.equal(out.kind, 'ok')
  if (out.kind === 'ok') assert.equal(out.verdict.ai_consensus_passed, false)
})

test('AI가 조건 부족이라고 하면 답이 같아도 합의가 아니다', async () => {
  const out = await runAiReview({
    instructions: '', candidate: candidate(),
    transport: async () => ({ output_parsed: {
      valid: true, answer_kind: 'number', answer_text: '20', single_answer: true,
      missing_condition: true, ambiguous: false, curriculum_mismatch: false,
      solution_outline: [], issues: ['조건이 부족합니다'],
    } }),
  })
  assert.equal(out.kind, 'ok')
  if (out.kind === 'ok') assert.equal(out.verdict.ai_consensus_passed, false)
})

// ── 정답 정규화 ─────────────────────────────────────────────────────

test('정답 정규화는 공백과 달러기호만 지운다', () => {
  assert.equal(normalizeAnswer(' $12$ '), '12')
  assert.equal(normalizeAnswer('+5'), '5')
  assert.notEqual(normalizeAnswer('12'), normalizeAnswer('12.0'), '다른 값을 같다고 하면 안 된다')
})

