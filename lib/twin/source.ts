// 원문 추출 — 메타데이터 + 이미지 Base64 변환 (GPT-EXEC-001 작업 D-2)
//
// D-036: 이미지는 Storage signed URL 보다 **Base64 data URL** 을 우선한다.
// 비공개 버킷의 URL을 외부로 넘기지 않아도 되고, URL 만료로 실패할 일도 없다.

import type { SourceProblem } from './targets'

/** 모델에 보낼 생성 입력 (CP-007 §179 형식 그대로) */
export type GenerationInput = {
  task: 'generate_twin_candidates'
  schema_version: '1.0'
  candidate_count: number
  target_mode: 'text_latex_no_new_image'
  source: {
    problem_id: number
    grade: string | null
    semester: string | null
    type_code: string | null
    step: string | null
    difficulty: string | null
    answer_kind: 'number' | 'choice'
    answer_text: string
    problem_ocr: string | null
  }
  requested_constraints: {
    same_core_concept: true
    same_solution_structure: true
    target_difficulty_delta: 0
    single_answer_required: true
    answer_must_differ_from_source: true
    reverse_derivation_forbidden: true
    new_image_forbidden: true
  }
}

export function buildGenerationInput(p: SourceProblem, candidateCount: number): GenerationInput {
  return {
    task: 'generate_twin_candidates',
    schema_version: '1.0',
    candidate_count: candidateCount,
    target_mode: 'text_latex_no_new_image',
    source: {
      problem_id: p.id,
      grade: p.grade,
      semester: p.semester == null ? null : String(p.semester),
      type_code: p.type_code,
      step: p.step,
      difficulty: p.difficulty,
      answer_kind: p.answer_kind,
      answer_text: p.answer_text,
      problem_ocr: null,          // OCR은 아직 쓰지 않는다. 쓰더라도 보조 정보로만
    },
    requested_constraints: {
      same_core_concept: true,
      same_solution_structure: true,
      target_difficulty_delta: 0,
      single_answer_required: true,
      answer_must_differ_from_source: true,
      reverse_derivation_forbidden: true,
      new_image_forbidden: true,
    },
  }
}

// 이미지 로드는 `lib/twin/storage.ts` 로 옮겼다 (GPT-EXEC-007 작업 B · D-075).
//
// 여기 있던 `loadSourceImageAsDataUrl` 은 실패해도 `null` 을 돌려줬다. 그래서
// **모델이 원문을 보지 않고** 문항을 만들 수 있었다. 지금은 경로가 있는데 못 받으면 예외다.
// 옛 이름을 호환용으로 남기지 않는다 — 남겨 두면 누군가 그쪽을 부른다.
export { loadSourceImageDataUrl, loadStorageMeta, StorageError, BUCKET } from './storage'
