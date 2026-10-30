// 후보 저장 계층 (GPT-EXEC-005 작업 E·G·H 반영)
//
// 두 가지가 이전 판과 다르다.
//
//  1) **RPC 응답을 Zod 로 엄격하게 파싱한다** (D-059).
//     `Boolean(...)`·`Number(...)`·String 변환·잘못된 배열을 `[]` 로 바꾸는 식의
//     묵시적 보정을 하지 않는다. DB 계약이 깨졌을 때 화면이 조용히 그럴듯한
//     잘못된 상태를 보여주면 검수 안전장치가 무력화되기 때문이다.
//
//  2) **관리자 저장소와 서버 저장소를 구조적으로 분리한다** (D-060).
//     `AdminTwinRepository` 에는 생성·검증 메서드가 **존재하지 않는다.**
//     `ServerTwinRepository` 에는 승인·게시 메서드가 **존재하지 않는다.**
//     DB 권한 거부에만 기대지 않고 애플리케이션 구조에서도 경로를 없앤다.
//
// `private.*` 를 `.from()` 이나 `.schema()` 로 직접 부르는 코드는 이 파일에 없다.

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'

// ════════════════════════════════════════════════════════════════════
// 도메인 타입 — DB CHECK 제약과 같은 값만 허용한다
// ════════════════════════════════════════════════════════════════════

export const CandidateStatusZ = z.enum(['generated', 'pending_review', 'approved', 'rejected'])
export const VerificationStatusZ = z.enum(['verified', 'unverified', 'failed'])
export const CheckMethodZ = z.enum(['rule', 'cas', 'second_model', 'none'])
export const PracticeStatusZ = z.enum(['approved', 'published', 'retired'])
export const AnswerKindZ = z.enum(['number', 'choice'])
export const ReverseRiskZ = z.enum(['low', 'medium', 'high'])

export type CandidateStatus = z.infer<typeof CandidateStatusZ>
export type VerificationStatus = z.infer<typeof VerificationStatusZ>
export type PracticeStatus = z.infer<typeof PracticeStatusZ>

const StrArray = z.array(z.string())
const FormatIssue = z.object({ code: z.string(), detail: z.string() }).strict()
const FiniteNumber = z.number().finite()

/** RPC 한 행. 여기서 걸러진 값만 도메인으로 들어온다. */
const CandidateRowZ = z.object({
  id: z.string().uuid(),
  batch_id: z.string().uuid(),
  source_problem_id: z.number().int(),
  candidate_no: z.number().int().min(1),
  source_fingerprint: z.string(),
  type_code: z.string().nullable(),
  status: CandidateStatusZ,

  problem_text_latex: z.string(),
  answer_kind: AnswerKindZ,
  answer_text: z.string(),
  solution_outline: StrArray,
  concepts: StrArray,
  common_mistakes: StrArray,
  transformations: StrArray,
  self_check_notes: StrArray,
  variant_kind: z.string().nullable(),
  difficulty_delta: z.number().int().nullable(),

  // 모델 자기보고 — 화면에 보이되 승인 근거가 아니다
  reverse_derivation_risk: ReverseRiskZ.nullable(),
  single_answer_claim: z.boolean().nullable(),

  // 서버 판정
  format_validation_passed: z.boolean(),
  deterministic_check_passed: z.boolean(),
  independent_check_passed: z.boolean(),
  ai_consensus_passed: z.boolean(),
  teacher_approved: z.boolean(),
  verification_status: VerificationStatusZ,
  unverified_reason: z.string().nullable(),
  check_method: CheckMethodZ.nullable(),
  format_issues: z.array(FormatIssue),
  ai_issues: StrArray,
  ai_answer_text: z.string().nullable(),
  similarity_to_source: FiniteNumber.nullable(),

  teacher_edited: z.boolean(),
  reject_reason: z.string().nullable(),

  // practice 요약
  practice_problem_id: z.string().uuid().nullable(),
  practice_status: PracticeStatusZ.nullable(),
  student_publish_approved: z.boolean().nullable(),
  is_published: z.boolean().nullable(),

  generation_model: z.string().nullable(),
  prompt_version: z.string(),
  created_at: z.string(),

  // 원문 메타
  source_book: z.string().nullable(),
  source_difficulty: z.string().nullable(),
  source_step: z.string().nullable(),
  source_answer_kind: z.string().nullable(),
  source_answer_text: z.string().nullable(),
  source_image_path: z.string().nullable(),
  source_type_title: z.string().nullable(),
})

/** 목록 envelope. `items`·`total`·`limit`·`offset` 이 모두 필수다 (§155). */
const ListEnvelopeZ = z.object({
  items: z.array(CandidateRowZ),
  total: z.number().int().min(0),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
})

export type CandidateRow = z.infer<typeof CandidateRowZ>

export type CandidateRecord = {
  id: string
  batch_id: string
  source_problem_id: number
  candidate_no: number
  source_fingerprint: string
  prompt_version: string
  type_code: string
  status: CandidateStatus

  problem_text_latex: string
  answer_kind: 'number' | 'choice'
  answer_text: string
  solution_outline: string[]
  concepts: string[]
  common_mistakes: string[]
  transformations: string[]
  self_check_notes: string[]

  // D-066: DB 가 null 을 주면 null 로 둔다.
  // 'low'·0·false 로 바꾸면 "확인 안 됨"이 "낮은 위험/정상"처럼 보여 교사 판단을 잘못 유도한다.
  variant_kind: string | null
  difficulty_delta: number | null
  reverse_derivation_risk: 'low' | 'medium' | 'high' | null
  single_answer_claim: boolean | null

  flags: {
    format_validation_passed: boolean
    deterministic_check_passed: boolean
    independent_check_passed: boolean
    ai_consensus_passed: boolean
    teacher_approved: boolean
    /** D-066: 확인되지 않았으면 null 이다. 'none' 으로 바꾸지 않는다 */
    check_method: 'rule' | 'cas' | 'second_model' | 'none' | null
  }
  verification_status: VerificationStatus
  unverified_reason: string | null
  format_issues: { code: string; detail: string }[]
  ai_issues: string[]
  ai_answer_text: string | null
  similarity_to_source: number | null

  teacher_edited: boolean
  reject_reason: string | null

  practice_problem_id: string | null
  practice_status: PracticeStatus | null
  student_publish_approved: boolean
  is_published: boolean

  generation_model: string | null
  created_at: string
}

export type SourceRecord = {
  id: number
  book: string | null
  type_code: string | null
  type_title: string | null
  difficulty: string | null
  step: string | null
  answer_kind: string
  answer_text: string
  image_path: string | null
}

export type ReviewPair = { source: SourceRecord; candidates: CandidateRecord[] }

export type ApprovalEdits = Partial<{
  problem_text_latex: string
  answer_kind: 'number' | 'choice'
  answer_text: string
  solution_outline: string[]
  concepts: string[]
  common_mistakes: string[]
}>

export const EDITABLE_KEYS = [
  'problem_text_latex', 'answer_kind', 'answer_text',
  'solution_outline', 'concepts', 'common_mistakes',
] as const

export const REJECT_REASONS = [
  '조건 모순', '복수 정답', '난이도 과다', '원문 복제',
  '개념 불일치', '계산 오류', '표현 어색',
] as const
export type RejectReason = typeof REJECT_REASONS[number]

export type CreateCandidatePayload = {
  // D-065: 생성 고유키 다섯 값. batch_id 는 **필수**다.
  // 같은 batch 재시도는 같은 행을 돌려주고, 새 batch 면 같은 프롬프트라도 새 후보를 만든다.
  source_problem_id: number
  source_fingerprint: string
  prompt_version: string
  batch_id: string
  candidate_no: number
  problem_text_latex: string
  answer_kind: 'number' | 'choice'
  answer_text: string
  solution_outline: string[]
  concepts: string[]
  common_mistakes: string[]
  transformations: string[]
  type_code: string | null
  difficulty_delta: number
  variant_kind: string
  reverse_derivation_risk: string
  single_answer_claim: boolean
  needs_new_image: boolean
  self_check_notes: string[]
  generation_status: 'generated' | 'unsupported'
  unsupported_reason: string | null
  generation_model: string
}

/**
 * 검증 갱신 입력. `independent_check_passed` 가 **없다.**
 * RPC 가 `deterministic_check_passed` 하나만 보고 그 값을 정하므로,
 * 호출부가 AI 합의로 독립 검산을 켜는 경로가 타입에 존재하지 않는다.
 */
export type ValidationUpdate = {
  format_validation_passed: boolean
  deterministic_check_passed: boolean
  ai_consensus_passed: boolean
  verification_status: VerificationStatus
  unverified_reason: string | null
  check_method: 'rule' | 'cas' | 'second_model' | 'none'
  check_detail: Record<string, unknown>
  format_issues: { code: string; detail: string }[]
  ai_issues: string[]
  ai_answer_text: string | null
  similarity_to_source: number | null
}

// ════════════════════════════════════════════════════════════════════
// 인터페이스 — 관리자와 서버를 나눈다 (D-060)
// ════════════════════════════════════════════════════════════════════

/** 원장이 검수 화면에서 하는 일. **생성·검증 메서드가 없다.** */
export interface AdminTwinRepository {
  listPendingReview(limit?: number): Promise<ReviewPair[]>
  approve(candidateId: string, edits?: ApprovalEdits): Promise<string>
  reject(candidateId: string, reason: RejectReason): Promise<void>
  setPublication(practiceProblemId: string, publish: boolean): Promise<void>
  setStudentPublishApproval(practiceProblemId: string, enabled: boolean): Promise<void>
}

/**
 * 한 생성 묶음(batch)에 이미 들어 있는 후보의 **최소 상태** (D-076).
 *
 * 정답·풀이·원문 본문·검산 상세는 들어 있지 않다. 재시도 판정에 필요한 것만 있다.
 */
export type BatchCandidateState = {
  batch_id: string
  candidate_no: number
  candidate_id: string
  status: CandidateStatus
}

/** 생성 파이프라인이 하는 일. **승인·게시 메서드가 없다.** */
export interface ServerTwinRepository {
  /** D-076: 같은 batch 를 다시 돌릴 때 모델을 또 부르지 않기 위한 읽기 전용 조회 */
  getBatchState(key: {
    source_problem_id: number
    source_fingerprint: string
    prompt_version: string
    batch_id: string
  }): Promise<BatchCandidateState[]>
  createCandidate(payload: CreateCandidatePayload): Promise<string>
  updateValidation(candidateId: string, validation: ValidationUpdate): Promise<void>
}

// ════════════════════════════════════════════════════════════════════
// 오류
// ════════════════════════════════════════════════════════════════════

export class TwinRepositoryError extends Error {
  constructor(public code: string, public op: string) {
    super(`twin_repository_error:${code}`)
    this.name = 'TwinRepositoryError'
  }
}

/** SQL 이 던지는 안정 코드 전부 (§166). 그 밖의 메시지는 내용을 흘리지 않도록 뭉갠다. */
export const KNOWN_CODES = new Set([
  'forbidden', 'not_found', 'invalid_state', 'invalid_argument', 'invalid_status',
  'invalid_edits', 'unknown_edit_key', 'reason_required',
  'empty_problem_text', 'empty_answer', 'empty_type_code',
  'invalid_answer_kind', 'invalid_json_type', 'invalid_payload',
  'invalid_verification_status', 'unknown_validation_key',
  'validation_invariant_violation', 'student_publish_approval_required',
  // GPT-EXEC-007
  'source_not_found', 'source_already_has_twin', 'source_answer_missing',
  'source_answer_kind_unsupported', 'source_is_essay', 'type_code_mismatch',
  // GPT-EXEC-009: D-090(is_essay 코드 분리) · D-088(이미지 필수)
  'source_is_essay_unknown', 'source_image_missing',
  'unknown_payload_key', 'invalid_generation_status', 'invalid_enum_value',
  'invalid_number_range',
])

/**
 * 긴 코드부터 본다.
 *
 * D-090 으로 `source_is_essay_unknown` 이 생기면서, 짧은 `source_is_essay` 가
 * 그 부분문자열이 됐다. Set 삽입 순서대로 훑으면 `..._unknown` 메시지가
 * **`source_is_essay` 로 잘못 보고된다** — 그러면 "데이터가 비어서 뺐다"와
 * "서술형이라 뺐다"를 구분하려고 코드를 나눈 의미가 사라진다.
 */
const CODES_LONGEST_FIRST = Array.from(KNOWN_CODES).sort((a, b) => b.length - a.length)

function toError(op: string, message: string | undefined): TwinRepositoryError {
  const raw = (message ?? '').trim()
  // RPC 가 던진 코드가 메시지에 포함돼 있으면 그것을 쓴다
  for (const code of CODES_LONGEST_FIRST) {
    if (raw === code || raw.includes(code)) return new TwinRepositoryError(code, op)
  }
  return new TwinRepositoryError('rpc_failed', op)
}

// ════════════════════════════════════════════════════════════════════
// 엄격 파싱 (D-059)
// ════════════════════════════════════════════════════════════════════

/**
 * 목록 응답을 파싱한다. 모양이나 타입이 조금이라도 어긋나면 **보정하지 않고 거부**한다.
 * `'false'` 같은 문자열이 true 가 되거나 `'42'` 가 숫자가 되는 일이 없다.
 */
export function parseListEnvelope(data: unknown): CandidateRow[] {
  const parsed = ListEnvelopeZ.safeParse(data)
  if (!parsed.success) throw new TwinRepositoryError('bad_response', 'list')
  return parsed.data.items
}

/** 검수 화면이 쓰는 모양으로 바꾼다. 이 시점에 값은 이미 검증돼 있다. */
export function toRecords(rows: CandidateRow[]): { source: SourceRecord; candidate: CandidateRecord }[] {
  return rows.map(r => ({
    source: {
      id: r.source_problem_id,
      book: r.source_book,
      type_code: r.type_code,
      type_title: r.source_type_title,
      difficulty: r.source_difficulty,
      step: r.source_step,
      answer_kind: r.source_answer_kind ?? '',
      answer_text: r.source_answer_text ?? '',
      image_path: r.source_image_path,
    },
    candidate: {
      id: r.id,
      batch_id: r.batch_id,
      source_problem_id: r.source_problem_id,
      candidate_no: r.candidate_no,
      source_fingerprint: r.source_fingerprint,
      prompt_version: r.prompt_version,
      type_code: r.type_code ?? '',
      status: r.status,
      problem_text_latex: r.problem_text_latex,
      answer_kind: r.answer_kind,
      answer_text: r.answer_text,
      solution_outline: r.solution_outline,
      concepts: r.concepts,
      common_mistakes: r.common_mistakes,
      transformations: r.transformations,
      self_check_notes: r.self_check_notes,
      // D-066: null 을 정상값으로 가장하지 않는다. 화면이 '미확인'으로 표시한다
      variant_kind: r.variant_kind,
      difficulty_delta: r.difficulty_delta,
      reverse_derivation_risk: r.reverse_derivation_risk,
      single_answer_claim: r.single_answer_claim,
      flags: {
        format_validation_passed: r.format_validation_passed,
        deterministic_check_passed: r.deterministic_check_passed,
        independent_check_passed: r.independent_check_passed,
        ai_consensus_passed: r.ai_consensus_passed,
        teacher_approved: r.teacher_approved,
        check_method: r.check_method,
      },
      verification_status: r.verification_status,
      unverified_reason: r.unverified_reason,
      format_issues: r.format_issues,
      ai_issues: r.ai_issues,
      ai_answer_text: r.ai_answer_text,
      similarity_to_source: r.similarity_to_source,
      teacher_edited: r.teacher_edited,
      reject_reason: r.reject_reason,
      practice_problem_id: r.practice_problem_id,
      practice_status: r.practice_status,
      // practice 가 아직 없는 후보에서는 null 이다. 화면용 false 변환은
      // **"승인 안 됨 / 게시 안 됨"이라는 보수적 방향**이므로 허용한다 (§331).
      // 반대 방향(null → true)으로는 절대 바꾸지 않는다.
      student_publish_approved: r.student_publish_approved ?? false,
      is_published: r.is_published ?? false,
      generation_model: r.generation_model,
      created_at: r.created_at,
    },
  }))
}

export function groupIntoPairs(
  parsed: { source: SourceRecord; candidate: CandidateRecord }[],
): ReviewPair[] {
  const bySource = new Map<number, ReviewPair>()
  for (const { source, candidate } of parsed) {
    const existing = bySource.get(source.id)
    if (existing) existing.candidates.push(candidate)
    else bySource.set(source.id, { source, candidates: [candidate] })
  }
  return [...bySource.values()]
}

// ════════════════════════════════════════════════════════════════════
// 실DB 구현 — 관리자
// ════════════════════════════════════════════════════════════════════

/**
 * 관리자 동작 전용. **요청 JWT 가 담긴 클라이언트**만 받는다.
 *
 * service-role 클라이언트를 아예 갖지 않으므로 생성·검증 RPC 를 부를 수단이 없다.
 * DB 쪽에서도 `service_role` 은 `admin_*` 실행 권한을 부여받지 않았고,
 * 설령 부여되더라도 `auth.uid()` 가 null 이라 `is_admin()` 이 false 가 된다 — 이중이다.
 */
export class SupabaseAdminRepository implements AdminTwinRepository {
  constructor(private userClient: SupabaseClient) {}

  async listPendingReview(limit = 50): Promise<ReviewPair[]> {
    const { data, error } = await this.userClient.rpc('admin_list_twin_candidates', {
      p_status: 'pending_review', p_batch_id: null, p_limit: limit, p_offset: 0,
    })
    if (error) throw toError('list', error.message)
    return groupIntoPairs(toRecords(parseListEnvelope(data)))
  }

  async approve(candidateId: string, edits: ApprovalEdits = {}): Promise<string> {
    const { data, error } = await this.userClient.rpc('admin_approve_twin_candidate', {
      p_candidate_id: candidateId, p_edits: edits,
    })
    if (error) throw toError('approve', error.message)
    if (typeof data !== 'string') throw new TwinRepositoryError('bad_response', 'approve')
    return data
  }

  async reject(candidateId: string, reason: RejectReason): Promise<void> {
    const { error } = await this.userClient.rpc('admin_reject_twin_candidate', {
      p_candidate_id: candidateId, p_reason: reason,
    })
    if (error) throw toError('reject', error.message)
  }

  async setPublication(practiceProblemId: string, publish: boolean): Promise<void> {
    const { error } = await this.userClient.rpc('admin_set_practice_publication', {
      p_practice_problem_id: practiceProblemId, p_publish: publish,
    })
    if (error) throw toError('publish', error.message)
  }

  async setStudentPublishApproval(practiceProblemId: string, enabled: boolean): Promise<void> {
    const { error } = await this.userClient.rpc('admin_set_student_publish_approval', {
      p_practice_problem_id: practiceProblemId, p_enabled: enabled,
    })
    if (error) throw toError('safe', error.message)
  }
}

// ════════════════════════════════════════════════════════════════════
// 실DB 구현 — 서버 (생성 파이프라인)
// ════════════════════════════════════════════════════════════════════

/**
 * 생성·검증 전용. **service-role 클라이언트**만 받는다.
 * 승인·게시 메서드가 이 클래스에 존재하지 않으므로 호출할 수단이 없다.
 */
/**
 * batch 상태 응답 계약 (§182). `.strict()` 라 계약 밖 필드가 오면 거부한다.
 * 타입 단언과 묵시적 보정을 쓰지 않는다.
 */
const BatchStateRowZ = z.object({
  batch_id: z.string().uuid(),
  candidate_no: z.number().int().positive(),
  candidate_id: z.string().uuid(),
  status: z.enum(['generated', 'pending_review', 'approved', 'rejected']),
}).strict()

const BatchStateEnvelopeZ = z.object({
  items: z.array(BatchStateRowZ),
}).strict()

export class SupabaseServerRepository implements ServerTwinRepository {
  constructor(private serviceClient: SupabaseClient) {}

  async getBatchState(key: {
    source_problem_id: number
    source_fingerprint: string
    prompt_version: string
    batch_id: string
  }): Promise<BatchCandidateState[]> {
    const { data, error } = await this.serviceClient.rpc('server_get_twin_batch_state', {
      p_source_problem_id: key.source_problem_id,
      p_source_fingerprint: key.source_fingerprint,
      p_prompt_version: key.prompt_version,
      p_batch_id: key.batch_id,
    })
    if (error) throw toError('batch_state', error.message)

    const parsed = BatchStateEnvelopeZ.safeParse(data)
    if (!parsed.success) throw new TwinRepositoryError('bad_response', 'batch_state')

    return parsed.data.items.map((r): BatchCandidateState => ({
      batch_id: r.batch_id,
      candidate_no: r.candidate_no,
      candidate_id: r.candidate_id,
      status: r.status,
    }))
  }

  async createCandidate(payload: CreateCandidatePayload): Promise<string> {
    const { data, error } = await this.serviceClient
      .rpc('server_create_twin_candidate', { p_payload: payload })
    if (error) throw toError('create', error.message)
    if (typeof data !== 'string') throw new TwinRepositoryError('bad_response', 'create')
    return data
  }

  async updateValidation(candidateId: string, validation: ValidationUpdate): Promise<void> {
    const { error } = await this.serviceClient.rpc('server_update_twin_validation', {
      p_candidate_id: candidateId, p_validation: validation,
    })
    if (error) throw toError('validate', error.message)
  }
}

// ════════════════════════════════════════════════════════════════════
// fixture 구현 — 화면 개발·테스트용
// ════════════════════════════════════════════════════════════════════
// **운영에서 쓰지 않는다** (`lib/twin/mode.ts` 가 production 에서 막는다).
// 상태 전이와 자동 거부 범위를 실제 RPC 와 똑같이 지킨다.

export type FixturePractice = {
  id: string
  candidate_id: string
  status: PracticeStatus
  student_publish_approved: boolean
  publish_first_approved_by: string | null
  publish_first_approved_at: string | null
  first_published_at: string | null
  retired_at: string | null
  is_asset_active: boolean
}

export class FixtureAdminRepository implements AdminTwinRepository {
  practices: FixturePractice[] = []

  constructor(private pairs: ReviewPair[], private actor = 'fixture-admin') {}

  async listPendingReview(limit = 50): Promise<ReviewPair[]> {
    return this.pairs
      .map(p => ({ ...p, candidates: p.candidates.filter(c => c.status === 'pending_review') }))
      .filter(p => p.candidates.length > 0)
      .slice(0, limit)
  }

  async approve(candidateId: string, edits: ApprovalEdits = {}): Promise<string> {
    for (const k of Object.keys(edits)) {
      if (!(EDITABLE_KEYS as readonly string[]).includes(k)) {
        throw new TwinRepositoryError('unknown_edit_key', 'approve')
      }
    }
    const c = this.find(candidateId)
    if (c.status !== 'pending_review') throw new TwinRepositoryError('invalid_state', 'approve')
    if (!c.type_code.trim()) throw new TwinRepositoryError('empty_type_code', 'approve')

    const text = edits.problem_text_latex ?? c.problem_text_latex
    const kind = edits.answer_kind ?? c.answer_kind
    const answer = edits.answer_text ?? c.answer_text
    const outline = edits.solution_outline ?? c.solution_outline
    const concepts = edits.concepts ?? c.concepts
    const mistakes = edits.common_mistakes ?? c.common_mistakes
    if (!text.trim()) throw new TwinRepositoryError('empty_problem_text', 'approve')
    if (!answer.trim()) throw new TwinRepositoryError('empty_answer', 'approve')

    // §134: concepts·common_mistakes 변경도 교사 수정으로 본다
    const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
    const edited = text !== c.problem_text_latex || kind !== c.answer_kind
      || answer !== c.answer_text
      || !same(outline, c.solution_outline)
      || !same(concepts, c.concepts)
      || !same(mistakes, c.common_mistakes)

    c.status = 'approved'
    c.teacher_edited = edited
    c.problem_text_latex = text
    c.answer_kind = kind
    c.answer_text = answer
    c.solution_outline = outline
    c.concepts = concepts
    c.common_mistakes = mistakes
    c.flags = {
      ...c.flags,
      teacher_approved: true,
      // D-055: 교사가 고쳤으면 수정 전 자동검산은 전부 무효다
      format_validation_passed: edited ? false : c.flags.format_validation_passed,
      deterministic_check_passed: edited ? false : c.flags.deterministic_check_passed,
      independent_check_passed: edited ? false : c.flags.independent_check_passed,
      ai_consensus_passed: edited ? false : c.flags.ai_consensus_passed,
      check_method: edited ? 'none' : c.flags.check_method,
    }
    if (edited) {
      c.verification_status = 'unverified'
      c.unverified_reason = 'teacher_edited'
    }

    const practiceId = `practice-${candidateId}`
    c.practice_problem_id = practiceId
    c.practice_status = 'approved'
    c.student_publish_approved = false
    c.is_published = false
    this.practices.push({
      id: practiceId, candidate_id: candidateId, status: 'approved',
      student_publish_approved: false, publish_first_approved_by: null, publish_first_approved_at: null,
      first_published_at: null, retired_at: null, is_asset_active: false,
    })

    // D-058: **같은 생성 그룹** 안에서만 나머지를 거부한다.
    // 새 프롬프트·새 배치로 만든 정상 후보까지 거부하면 안 된다.
    for (const p of this.pairs) {
      for (const other of p.candidates) {
        if (other.id !== candidateId
            && other.status === 'pending_review'
            && other.source_problem_id === c.source_problem_id
            && other.source_fingerprint === c.source_fingerprint
            && other.prompt_version === c.prompt_version
            && other.batch_id === c.batch_id) {
          other.status = 'rejected'
          other.flags = { ...other.flags, teacher_approved: false }
          other.reject_reason = other.reject_reason ?? '같은 묶음의 다른 후보가 승인됨'
        }
      }
    }
    return practiceId
  }

  async reject(candidateId: string, reason: RejectReason): Promise<void> {
    if (!String(reason ?? '').trim()) throw new TwinRepositoryError('reason_required', 'reject')
    const c = this.find(candidateId)
    if (c.status !== 'pending_review' && c.status !== 'approved') {
      throw new TwinRepositoryError('invalid_state', 'reject')
    }

    // D-051: 승인됐던 후보를 거부하면 연결 예제를 폐기하고 학생에게서 즉시 내린다
    if (c.practice_problem_id) {
      const p = this.practices.find(x => x.id === c.practice_problem_id)
      if (p) {
        p.status = 'retired'
        p.student_publish_approved = false
        p.is_asset_active = false
        p.retired_at = new Date().toISOString()
        this.syncCandidate(p)
      }
    }

    c.status = 'rejected'
    // 거부된 것이 승인 상태로 남아 있으면 안 된다
    c.flags = { ...c.flags, teacher_approved: false }
    c.reject_reason = reason
  }

  async setPublication(practiceProblemId: string, publish: boolean): Promise<void> {
    const p = this.findPractice(practiceProblemId)
    if (p.status === 'retired') throw new TwinRepositoryError('invalid_state', 'publish')
    if (publish && p.status !== 'approved') throw new TwinRepositoryError('invalid_state', 'publish')
    if (!publish && p.status !== 'published') throw new TwinRepositoryError('invalid_state', 'publish')
    // D-050: 안전 승인 없이는 게시할 수 없다
    if (publish && !p.student_publish_approved) {
      throw new TwinRepositoryError('student_publish_approval_required', 'publish')
    }
    p.status = publish ? 'published' : 'approved'
    if (publish && !p.first_published_at) p.first_published_at = new Date().toISOString()
    p.is_asset_active = publish
    this.syncCandidate(p)
  }

  async setStudentPublishApproval(practiceProblemId: string, enabled: boolean): Promise<void> {
    const p = this.findPractice(practiceProblemId)
    if (p.status === 'retired') throw new TwinRepositoryError('invalid_state', 'student_publish')

    // D-050: 게시 중에 안전 승인을 끄면 같은 동작에서 게시를 내린다
    if (!enabled && p.status === 'published') {
      p.status = 'approved'
      p.is_asset_active = false
    }
    p.student_publish_approved = enabled
    // D-048: 최초 승인 이력은 한 번만 기록하고 끄더라도 지우지 않는다
    if (enabled && !p.publish_first_approved_at) {
      p.publish_first_approved_by = this.actor
      p.publish_first_approved_at = new Date().toISOString()
    }
    this.syncCandidate(p)
  }

  /** practice 상태를 후보 행에 되비춘다. 화면이 서버 상태를 기준으로 보게 한다. */
  private syncCandidate(p: FixturePractice) {
    for (const pair of this.pairs) {
      const c = pair.candidates.find(x => x.practice_problem_id === p.id)
      if (c) {
        c.practice_status = p.status
        c.student_publish_approved = p.student_publish_approved
        c.is_published = p.status === 'published'
      }
    }
  }

  private find(id: string): CandidateRecord {
    for (const p of this.pairs) {
      const c = p.candidates.find(x => x.id === id)
      if (c) return c
    }
    throw new TwinRepositoryError('not_found', 'find')
  }
  private findPractice(id: string): FixturePractice {
    const p = this.practices.find(x => x.id === id)
    if (!p) throw new TwinRepositoryError('not_found', 'findPractice')
    return p
  }
}

/** fixture 는 생성을 지원하지 않는다. 그 경로는 service_role RPC 전용이다. */
export class FixtureServerRepository implements ServerTwinRepository {
  async getBatchState(_key: {
    source_problem_id: number
    source_fingerprint: string
    prompt_version: string
    batch_id: string
  }): Promise<BatchCandidateState[]> {
    void _key
    throw new TwinRepositoryError('not_supported', 'getBatchState')
  }
  async createCandidate(_payload: CreateCandidatePayload): Promise<string> {
    void _payload
    throw new TwinRepositoryError('not_supported', 'createCandidate')
  }
  async updateValidation(_candidateId: string, _validation: ValidationUpdate): Promise<void> {
    void _candidateId; void _validation
    throw new TwinRepositoryError('not_supported', 'updateValidation')
  }
}
