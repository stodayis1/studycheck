// 검증 플래그 — 섞이면 안 되는 다섯 가지 (GPT-EXEC-001 작업 E)
//
// 이 파일이 존재하는 이유는 하나다.
// **AI 검토가 생성 답과 일치했다는 사실을 독립 검산 완료로 착각하지 않게 하는 것.**
// 두 AI는 같은 오류를 낼 수 있다. 그래서 값을 섞지 않고, 섞을 수 없게 타입으로 막는다.
//
// 규칙 (CP-007 §301 · CP-008 변경 불가 원칙 2)
//   independent_check_passed 는 결정론적 검산(규칙·정확한 계산·CAS)만 켤 수 있다.
//   AI 검토 결과는 ai_consensus_passed 까지만 켠다.

/** 형식·정책 검증 결과. verify.ts 만 만든다. */
export type FormatVerdict = {
  format_validation_passed: boolean
  issues: { code: string; detail: string }[]
}

/** 결정론적 검산 결과. verify.ts 만 만든다. AI가 관여하지 않는다. */
export type DeterministicVerdict = {
  deterministic_check_passed: boolean
  check_method: 'rule' | 'cas' | 'none'
  check_detail: Record<string, unknown>
}

/**
 * AI 검토 결과. review.ts 만 만든다.
 *
 * 이 타입에는 `independent_check_passed` 가 **없다.** 일부러 없앴다.
 * review.ts 가 그 값을 만들 수 없으므로, 실수로라도 AI 합의가
 * 독립 검산으로 승격되지 않는다.
 */
export type AiReviewVerdict = {
  ai_consensus_passed: boolean
  ai_answer_text: string | null
  ai_issues: string[]
  ai_flags: {
    valid: boolean
    single_answer: boolean
    missing_condition: boolean
    ambiguous: boolean
    curriculum_mismatch: boolean
  }
}

/** DB에 저장할 최종 플래그 묶음. */
export type CandidateFlags = {
  format_validation_passed: boolean
  deterministic_check_passed: boolean
  independent_check_passed: boolean
  ai_consensus_passed: boolean
  teacher_approved: boolean
  check_method: 'rule' | 'cas' | 'second_model' | 'none'
}

/**
 * 플래그를 하나로 합치는 **유일한** 경로.
 *
 * `independent_check_passed` 는 여기서 `deterministic.deterministic_check_passed`
 * 하나만 보고 정한다. `aiReview` 는 이 값에 영향을 주지 않는다.
 * `teacher_approved` 는 사람이 승인 버튼을 눌렀을 때만 켜지므로 항상 false 로 시작한다.
 */
export function mergeFlags(
  format: FormatVerdict,
  deterministic: DeterministicVerdict,
  aiReview: AiReviewVerdict | null,
): CandidateFlags {
  return {
    format_validation_passed: format.format_validation_passed,
    deterministic_check_passed: deterministic.deterministic_check_passed,

    // ↓ 여기가 핵심이다. aiReview 를 쳐다보지 않는다.
    independent_check_passed: deterministic.deterministic_check_passed,

    ai_consensus_passed: aiReview?.ai_consensus_passed ?? false,
    teacher_approved: false,
    check_method: deterministic.deterministic_check_passed
      ? deterministic.check_method
      : aiReview
        ? 'second_model'   // 무엇을 돌렸는지 기록만 한다. 통과 근거가 아니다
        : 'none',
  }
}

/**
 * 후보가 사람 검수로 갈 수 있는 상태인지.
 *
 * 파일럿에서는 검산 결과와 관계없이 **모든 후보가 사람 검수를 기다린다**
 * (GPT-EXEC-001 §166). 형식 검증만 통과하면 검수함으로 보낸다.
 * 형식이 깨진 것은 사람이 볼 가치가 없으므로 rejected 로 보낸다.
 */
export function nextStatus(flags: CandidateFlags): 'pending_review' | 'rejected' {
  return flags.format_validation_passed ? 'pending_review' : 'rejected'
}

/**
 * 자동 승인은 존재하지 않는다 (CP-008 변경 불가 원칙 3 · D-040).
 * `approved` 와 `published`, `student_publish_approved` 는 사람만 켤 수 있다 (D-064).
 * 코드 어디에서도 이 함수가 true 를 반환하지 않는다는 사실 자체가 안전장치다.
 */
export function canAutoApprove(): false {
  return false
}
