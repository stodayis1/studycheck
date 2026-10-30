// 한 원문을 처리하는 종단 오케스트레이터
// (GPT-EXEC-006 작업 D · GPT-EXEC-007 작업 A·B·C·D·E)
//
// 순서 (§185)
//   1 대상 확인 → 2 fingerprint → 3 **같은 batch 상태 조회** → 4 완결이면 즉시 반환
//   → 5 이미지 → 6 생성 → 7 형식검사 → 8 독립 검토 → 9 검증값 → 10 저장 → 11 검증 갱신 → 12 요약
//
// 외부 의존성을 전부 주입받는다. 실제 API·운영 DB 없이 mock 으로 전 과정을 시험할 수 있다.
//
// 안전 규칙
//   - **원문의 실제 `twin_id`·`is_essay` 를 본다.** 상수를 넣지 않는다 (D-077)
//   - 이미지가 없는 원문은 대상이 아니다 — 모델이 원문을 볼 통로가 없다 (D-088)
//   - 이미지 경로가 있는데 못 받으면 **모델을 부르지 않고 중단**한다 (D-075)
//   - 같은 batch 재시도는 모델을 다시 부르지 않는다 (D-076)
//   - 측정할 수 없는 유사도는 `null` 이다. 0 을 넣지 않는다 (D-074)
//   - 형식검사에 실패한 후보도 **감사 목적으로 저장**하되 즉시 `rejected` 가 되게 검증을 갱신한다
//   - 한 후보의 실패가 다른 후보를 잘못 승인시키지 않는다
//   - AI 검토 실패·거부·파싱 실패는 `independent_check_passed` 를 **절대** 켜지 않는다
//   - CAS 가 없으므로 정상 후보는 `unverified`(사유 `no_cas`)로 사람 검수에 간다
//   - 자동승인은 없다
//   - 실제 호출 허용값을 여기서 임의로 켜지 않는다 (transport 를 주입받을 뿐이다)
//   - 원문·정답·이미지 data URL·모델 원응답을 일반 로그에 남기지 않는다 (D-079)

import { generateCandidates, isUnsupported, type Transport } from './generate'
import { runAiReview } from './review'
import { runFormatValidation, runDeterministicCheck } from './verify'
import { buildGenerationInput } from './source'
import { computeSourceFingerprint, FingerprintError, type StorageMeta } from './fingerprint'
import { isEligible, type SourceProblem } from './targets'
import { twinConfig, type TwinCandidateT } from './schema'
import type {
  ServerTwinRepository, CreateCandidatePayload, ValidationUpdate, BatchCandidateState,
} from './repository'

/** 이번 파일럿이 허용하는 후보 수. 정확히 2다 (§217) */
export const REQUIRED_CANDIDATE_COUNT = 2
/** 생성 응답에 반드시 있어야 하는 후보 번호 집합 (§219) */
export const REQUIRED_CANDIDATE_NOS = [1, 2] as const

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v)
}

export type PipelineDeps = {
  /** 원문 이미지의 Storage 메타. 못 받으면 **null 이 아니라 throw** 해야 한다 */
  loadStorageMeta(imagePath: string): Promise<StorageMeta>
  /**
   * 원문 이미지를 Base64 data URL 로.
   * **이미지가 원래 없을 때만 null** 이고, 그 밖의 실패는 throw 해야 한다 (D-075).
   * 주입된 구현이 실수로 null 을 줘도 파이프라인이 한 번 더 막는다.
   */
  loadImageDataUrl(imagePath: string | null): Promise<string | null>
  generationTransport: Transport
  reviewTransport: Transport
  repo: ServerTwinRepository
  /** 프롬프트 본문. prompts/*.md 에서 읽어 주입한다 */
  generationInstructions: string
  reviewInstructions: string
}

export type CandidateOutcome = {
  candidate_no: number
  candidate_id: string | null
  status: 'pending_review' | 'rejected'
  format_ok: boolean
  ai_consensus: boolean
  issues: string[]
  error?: string
  /**
   * 034 §83 — 검토 요청이 **정상 응답·정상 스키마로 완료됐는가.**
   * `ai_consensus` 와 **다른 것**이다.
   *
   *   `'ok'`      정상 완료. `ai_consensus=false` 여도 **기술 오류가 아니다**
   *   `'failed'`  전송 오류·거절·잘림·파싱 실패 등 **기술 실패**
   *   `'skipped'` 형식에서 걸려 검토를 부르지 않았다 (비용을 쓰지 않은 정상 경로)
   *
   * 왜 생겼나 — 033 까지는 검토 실패가 `ai_issues` 문자열로만 남아
   * 최종 기술 완료 판정에 전달되지 않았다. 저장만 되면 `complete`·exit 0 이었다.
   */
  review_status: 'ok' | 'failed' | 'skipped'
  /** 기술 실패의 **안전한 코드**. 모델 자유서술·원문 오류를 담지 않는다 */
  review_fail_code?: string
}

export type PipelineResult =
  | { kind: 'ok'; batch_id: string; fingerprint: string; candidates: CandidateOutcome[] }
  | { kind: 'cached'; batch_id: string; fingerprint: string; candidates: BatchCandidateState[] }
  | { kind: 'unsupported'; batch_id: string; fingerprint: string; reason: string | null }
  | { kind: 'skipped'; reason: 'not_eligible' }
  | {
      kind: 'failed'
      stage: 'input' | 'fingerprint' | 'cache' | 'storage' | 'generation'
      code: string
      detail: string
    }

/**
 * 원문 하나를 처리한다.
 *
 * `batchId` 는 **호출부가 반드시 준다** (§193). 여기서 임의 UUID 를 만들지 않는다 —
 * 만들어 버리면 재시도할 때마다 새 batch 가 되어 같은 원문에 후보가 계속 쌓인다.
 */
export async function runTwinPipelineForSource(args: {
  source: SourceProblem
  batchId: string
  candidateCount?: number
  deps: PipelineDeps
}): Promise<PipelineResult> {
  const { source, deps } = args
  const batchId = args.batchId
  const candidateCount = args.candidateCount ?? REQUIRED_CANDIDATE_COUNT

  // ── 0) 입력 계약 — 모델·Storage·DB 를 부르기 전에 막는다 (§216) ────
  if (!isUuid(batchId)) {
    return { kind: 'failed', stage: 'input', code: 'invalid_batch_id', detail: `source=${source?.id}` }
  }
  if (candidateCount !== REQUIRED_CANDIDATE_COUNT) {
    return {
      kind: 'failed', stage: 'input', code: 'invalid_candidate_count',
      detail: `source=${source?.id}:got=${candidateCount}`,
    }
  }

  // ── 1) 대상 조건 재확인 (D-077) ───────────────────────────────────
  // **원문의 실제 값**을 넘긴다. 예전 판은 twin_id=null·is_essay=false 를 상수로 넣어
  // 사실상 아무것도 검사하지 않았다.
  if (!isEligible({
    twin_id: source.twin_id,
    answer_text: source.answer_text,
    answer_kind: source.answer_kind,
    is_essay: source.is_essay,
    // D-088: 여기서 막지 않으면 아래 5단계가 `image_path` 없음을 정상으로 보고
    // imageDataUrl=null 로 생성까지 간다. 모델이 원문을 못 본 채 만든다는 뜻이다.
    image_path: source.image_path,
  }) || !source.type_code || source.type_code.trim() === '') {
    return { kind: 'skipped', reason: 'not_eligible' }
  }

  // ── 2) fingerprint ────────────────────────────────────────────────
  let fingerprint: string
  try {
    let meta: StorageMeta | null = null
    if (source.image_path) meta = await deps.loadStorageMeta(source.image_path)
    fingerprint = computeSourceFingerprint({
      id: source.id,
      grade: source.grade ?? null,
      semester: source.semester ?? null,
      type_code: source.type_code,
      step: source.step ?? null,
      difficulty: source.difficulty ?? null,
      answer_kind: source.answer_kind,
      answer_text: source.answer_text,
      image_path: source.image_path ?? null,
    }, meta)
  } catch (e) {
    const code = e instanceof FingerprintError ? e.code : 'storage_meta_unavailable'
    return { kind: 'failed', stage: 'fingerprint', code, detail: `source=${source.id}` }
  }

  // ── 3~4) 같은 batch 가 이미 있는가 (D-076) ────────────────────────
  // 여기서 걸러야 재시도가 멱등적이다. 이 조회를 건너뛰면 모델을 또 부르고,
  // 기존 후보를 재사용한 뒤 검증 갱신에서 invalid_state 로 깨진다.
  let existing: BatchCandidateState[]
  try {
    existing = await deps.repo.getBatchState({
      source_problem_id: source.id,
      source_fingerprint: fingerprint,
      prompt_version: twinConfig.promptVersion,
      batch_id: batchId,
    })
  } catch (e) {
    return {
      kind: 'failed', stage: 'cache', code: 'batch_state_unavailable',
      detail: `source=${source.id}:${e instanceof Error ? e.name : 'error'}`,
    }
  }

  if (existing.length > 0) {
    const nos = existing.map(c => c.candidate_no).sort((a, b) => a - b)
    const complete =
      existing.length === REQUIRED_CANDIDATE_COUNT &&
      REQUIRED_CANDIDATE_NOS.every((n, i) => nos[i] === n) &&
      existing.every(c => c.status !== 'generated')   // 검증 갱신까지 끝난 것만 완결로 본다

    if (!complete) {
      // 자동으로 채우지 않는다. 어떤 후보가 빠졌는지 사람이 보고 결정해야 한다
      return {
        kind: 'failed', stage: 'cache', code: 'incomplete_batch',
        detail: `source=${source.id}:nos=${nos.join(',')}`,
      }
    }
    return { kind: 'cached', batch_id: batchId, fingerprint, candidates: existing }
  }

  // ── 5) 이미지 (D-075) ─────────────────────────────────────────────
  let imageDataUrl: string | null = null
  try {
    imageDataUrl = await deps.loadImageDataUrl(source.image_path ?? null)
  } catch {
    return { kind: 'failed', stage: 'storage', code: 'image_load_failed', detail: `source=${source.id}` }
  }
  // 여기 도달하면 1단계가 이미 `image_path` 있음을 보장한다 (D-088).
  // 그래도 주입된 구현이 실수로 null 을 돌려주면 여기서 막는다 (§139).
  // 이게 없으면 모델이 **원문을 보지 않고** 문항을 만든다.
  if (!imageDataUrl) {
    return { kind: 'failed', stage: 'storage', code: 'image_load_failed', detail: `source=${source.id}` }
  }

  // ── 6) 생성 ───────────────────────────────────────────────────────
  const gen = await generateCandidates({
    instructions: deps.generationInstructions,
    input: buildGenerationInput(source, candidateCount),
    imageDataUrl,
    transport: deps.generationTransport,
  })

  if (gen.kind !== 'ok') {
    // refusal · transport_error · parse_error — **후보를 저장하지 않는다**
    return { kind: 'failed', stage: 'generation', code: gen.kind, detail: gen.reason }
  }

  if (isUnsupported(gen.result)) {
    // 그림이 필요해 만들 수 없다는 **정상 회신**이다. 후보를 저장하지 않는다
    return {
      kind: 'unsupported', batch_id: batchId, fingerprint,
      reason: gen.result.unsupported_reason,
    }
  }

  // ── 6-2) 후보 번호 집합 검사 (§219) ───────────────────────────────
  // 중복·0·3·누락이면 **저장 전에** 생성 응답 전체를 실패 처리한다.
  // 모델 원응답은 저장도 로그도 하지 않는다 (§221 · D-079).
  const nos = gen.result.candidates.map(c => c.candidate_no).sort((a, b) => a - b)
  const numbersOk =
    nos.length === REQUIRED_CANDIDATE_COUNT &&
    REQUIRED_CANDIDATE_NOS.every((n, i) => nos[i] === n)
  if (!numbersOk) {
    return {
      kind: 'failed', stage: 'generation', code: 'invalid_candidate_numbers',
      detail: `source=${source.id}:nos=${nos.join(',')}`,
    }
  }

  // ── 7) 형식검사 ───────────────────────────────────────────────────
  // 전체 판정과 후보별 원인을 나눠 둔다. 한 후보의 오류가 다른 후보의 원인을 가리지 않는다
  const overall = runFormatValidation(
    { generation_status: 'generated', candidates: gen.result.candidates },
    source, candidateCount,
  )
  const issuesFor = (c: TwinCandidateT) =>
    overall.issues.filter(i => i.detail.includes(`후보 ${c.candidate_no}`))
  const commonIssues = overall.issues.filter(
    i => !gen.result.candidates.some(c => i.detail.includes(`후보 ${c.candidate_no}`)),
  )

  // ── 8~11) 후보별 처리 ─────────────────────────────────────────────
  const outcomes: CandidateOutcome[] = []

  for (const cand of gen.result.candidates) {
    const own = issuesFor(cand)
    const formatOk = own.length === 0 && commonIssues.length === 0
    const outcome: CandidateOutcome = {
      candidate_no: cand.candidate_no,
      candidate_id: null,
      status: formatOk ? 'pending_review' : 'rejected',
      format_ok: formatOk,
      ai_consensus: false,
      issues: [...own, ...commonIssues].map(i => i.code),
      // 형식에서 걸린 후보는 검토를 부르지 않는다 — 실패가 아니라 비용을 쓰지 않은 것이다
      review_status: formatOk ? 'failed' : 'skipped',
    }

    // 8-1) 결정론적 검산 — AI 가 관여하지 않는다
    const det = runDeterministicCheck(cand, source)

    // 8-2) 독립 AI 검토 — 형식이 깨진 후보에는 비용을 쓰지 않는다
    let aiConsensus = false
    let aiAnswer: string | null = null
    let aiIssues: string[] = []
    if (formatOk) {
      const review = await runAiReview({
        instructions: deps.reviewInstructions,
        candidate: cand,
        transport: deps.reviewTransport,
      })
      if (review.kind === 'ok') {
        aiConsensus = review.verdict.ai_consensus_passed
        aiAnswer = review.verdict.ai_answer_text
        aiIssues = review.verdict.ai_issues
        // 034 §83: **정상 스키마로 완료됐다.** 합의가 false 여도 기술 오류가 아니다
        outcome.review_status = 'ok'
      } else {
        // 검토 실패·거부·파싱 실패 — 합의는 없다.
        // independent_check_passed 는 여기서 손대지 않는다 (det 만 정한다)
        aiIssues = [`ai_review_${review.kind}`]
        // 034 §84: 이 기술 실패가 **최종 판정까지** 전달돼야 한다.
        // `review.reason` 은 모델 자유서술·Zod 메시지라 **담지 않고** 종류만 남긴다
        outcome.review_status = 'failed'
        outcome.review_fail_code = review.kind
      }
    }
    outcome.ai_consensus = aiConsensus

    // 9) 검증값 — AI 합의와 결정론적 검산을 섞지 않는다
    const validation: ValidationUpdate = {
      format_validation_passed: formatOk,
      deterministic_check_passed: det.deterministic_check_passed,
      ai_consensus_passed: aiConsensus,
      verification_status: det.deterministic_check_passed ? 'verified'
        : formatOk ? 'unverified' : 'failed',
      unverified_reason: det.deterministic_check_passed ? null
        : formatOk ? 'no_cas' : 'format_validation_failed',
      check_method: det.deterministic_check_passed ? det.check_method : 'none',
      check_detail: det.check_detail,
      format_issues: [...own, ...commonIssues],
      ai_issues: aiIssues,
      ai_answer_text: aiAnswer,
      // D-074: 원문 본문(OCR·정규화)이 없으므로 유사도를 **측정할 수 없다.**
      // 예전에는 후보 본문과 원문 **정답**을 비교했다. 그건 유사도가 아니고,
      // 낮은 값이 "원문을 베끼지 않았다"는 잘못된 인상을 준다. 화면은 '미확인'으로 쓴다.
      similarity_to_source: null,
    }

    // 10) 후보 저장 — 형식이 깨졌어도 감사 목적으로 남긴다
    const payload: CreateCandidatePayload = {
      source_problem_id: source.id,
      source_fingerprint: fingerprint,
      prompt_version: twinConfig.promptVersion,
      batch_id: batchId,
      candidate_no: cand.candidate_no,
      problem_text_latex: cand.problem_text_latex,
      answer_kind: cand.answer_kind,
      answer_text: cand.answer_text,
      solution_outline: cand.solution_outline,
      concepts: cand.concepts,
      common_mistakes: cand.common_mistakes,
      transformations: cand.transformations,
      type_code: source.type_code,
      difficulty_delta: cand.difficulty_delta,
      variant_kind: cand.variant_kind,
      reverse_derivation_risk: cand.reverse_derivation_risk,
      single_answer_claim: cand.single_answer_claim,
      needs_new_image: cand.needs_new_image,
      self_check_notes: cand.self_check_notes,
      generation_status: 'generated',
      unsupported_reason: null,
      generation_model: twinConfig.generationModel,
    }

    try {
      outcome.candidate_id = await deps.repo.createCandidate(payload)
    } catch (e) {
      // 저장 실패는 성공처럼 보고하지 않는다
      outcome.error = e instanceof Error ? e.message : String(e)
      outcome.status = 'rejected'
      outcomes.push(outcome)
      continue
    }

    // 11) 검증 갱신 — 형식이 깨진 후보는 여기서 rejected 가 된다
    try {
      await deps.repo.updateValidation(outcome.candidate_id, validation)
    } catch (e) {
      outcome.error = e instanceof Error ? e.message : String(e)
      outcome.status = 'rejected'
    }

    outcomes.push(outcome)
  }

  // ── 12) 요약 ──────────────────────────────────────────────────────
  return { kind: 'ok', batch_id: batchId, fingerprint, candidates: outcomes }
}

/** 배치 요약. 성공처럼 보이는 실패가 없도록 실패를 분명히 센다. */
export function summarize(results: PipelineResult[]) {
  let ok = 0, cached = 0, pendingReview = 0, rejected = 0
  let unsupported = 0, failed = 0, skipped = 0
  const errors: string[] = []

  for (const r of results) {
    switch (r.kind) {
      case 'ok':
        ok++
        for (const c of r.candidates) {
          if (c.status === 'pending_review') pendingReview++
          else rejected++
          if (c.error) errors.push(`candidate ${c.candidate_no}: ${c.error}`)
        }
        break
      case 'cached': cached++; break
      case 'unsupported': unsupported++; break
      case 'skipped': skipped++; break
      case 'failed': failed++; errors.push(`${r.stage}:${r.code}`); break
    }
  }
  return { sources_ok: ok, cached, pendingReview, rejected, unsupported, failed, skipped, errors }
}
