// 검수 화면 개발·테스트용 fixture
//
// 운영에서 쓰지 않는다 (`lib/twin/mode.ts` 가 production 에서 막는다).
// 원문은 **실제 문제은행에서 확인한 문항**을 썼다 (id 47314·47164).
// 후보는 형태를 보여주기 위한 예시이며 실제 생성 결과가 아니다.
//
// GPT-EXEC-005 §174: 생성 그룹 키(`source_fingerprint`·`prompt_version`·`batch_id`)를
// 실DB 와 같게 갖는다. 그래야 자동 거부 범위가 양쪽에서 같아진다.

import type { CandidateRecord, ReviewPair, SourceRecord } from './repository'

const BATCH_A = '11111111-1111-4111-8111-111111111111'
const BATCH_B = '22222222-2222-4222-8222-222222222222'
const FP_A = 'fp-47314-v1'
const FP_B = 'fp-47164-v1'

const src1: SourceRecord = {
  id: 47314, book: '쎈', type_code: '공수1-09-08',
  type_title: '수형도를 이용하는 경우의 수',
  difficulty: '대표', step: 'B',
  answer_kind: 'choice', answer_text: '①',
  image_path: 'hc1-1/ssen/09/1101.png',
}

const src2: SourceRecord = {
  id: 47164, book: '쎈', type_code: '공수1-08-08',
  type_title: '이차부등식이 해를 가질 조건',
  difficulty: '대표', step: 'B',
  answer_kind: 'choice', answer_text: '⑤',
  image_path: 'hc1-1/ssen/08/0951.png',
}

function mk(
  over: Partial<CandidateRecord> &
    Pick<CandidateRecord, 'id' | 'source_problem_id' | 'type_code' | 'source_fingerprint' | 'batch_id'>,
): CandidateRecord {
  return {
    candidate_no: 1,
    prompt_version: 'twin-gen-v1.1',
    status: 'pending_review',
    problem_text_latex: '',
    answer_kind: 'number',
    answer_text: '',
    solution_outline: [],
    concepts: [],
    common_mistakes: [],
    transformations: [],
    self_check_notes: [],
    variant_kind: 'mixed',
    difficulty_delta: 0,
    reverse_derivation_risk: 'low',
    single_answer_claim: true,
    flags: {
      format_validation_passed: true,
      deterministic_check_passed: false,   // CAS 미도입 — 항상 false
      independent_check_passed: false,     // 결정론적 검산만 켤 수 있다
      ai_consensus_passed: true,           // AI끼리 일치했다는 뜻일 뿐
      teacher_approved: false,
      check_method: 'second_model',
    },
    verification_status: 'unverified',
    unverified_reason: 'no_cas',
    format_issues: [],
    ai_issues: [],
    ai_answer_text: null,
    similarity_to_source: 0.12,
    teacher_edited: false,
    reject_reason: null,
    practice_problem_id: null,
    practice_status: null,
    student_publish_approved: false,
    is_published: false,
    generation_model: 'gpt-6-astra',
    created_at: '2026-09-23T10:00:00Z',
    ...over,
  }
}

export const fixturePairs: ReviewPair[] = [
  {
    source: src1,
    candidates: [
      mk({
        id: 'cand-0001', source_problem_id: 47314, type_code: '공수1-09-08',
        source_fingerprint: FP_A, batch_id: BATCH_A, candidate_no: 1,
        problem_text_latex:
          '$5$개의 숫자 $1,\\,2,\\,3,\\,4,\\,5$를 일렬로 나열하여 다섯 자리 자연수 ' +
          '$b_1b_2b_3b_4b_5$를 만들 때, $b_i \\neq i$를 만족시키는 자연수의 개수는? (단, $i=1,2,3,4,5$)',
        answer_kind: 'number', answer_text: '44',
        solution_outline: [
          '완전순열의 뜻을 확인한다',
          'n=5인 완전순열의 수를 구하는 방법을 세운다',
          '값을 계산한다',
        ],
        concepts: ['완전순열'],
        common_mistakes: ['전체 순열에서 하나만 빼는 실수', '완전순열과 일반 순열을 혼동'],
        transformations: ['계수·수치', '묻는 대상의 표현'],
        ai_answer_text: '44',
      }),
      mk({
        id: 'cand-0002', source_problem_id: 47314, type_code: '공수1-09-08',
        source_fingerprint: FP_A, batch_id: BATCH_A, candidate_no: 2,
        problem_text_latex:
          '$4$명의 학생이 각자 자신의 이름표를 하나씩 가져와 섞은 뒤 임의로 한 개씩 나누어 가질 때, ' +
          '$4$명 모두 자기 것이 아닌 이름표를 갖는 경우의 수는?',
        answer_kind: 'number', answer_text: '9',
        solution_outline: ['완전순열 상황임을 파악한다', 'n=4 완전순열의 수를 센다', '검산한다'],
        concepts: ['완전순열'],
        common_mistakes: ['적어도 한 명이 자기 것을 갖는 경우와 혼동'],
        transformations: ['문장 맥락', '계수·수치'],
        ai_answer_text: '9',
        similarity_to_source: 0.08,
      }),
      // ── 같은 원문이지만 **다른 배치·다른 프롬프트** 로 만든 후보 (D-058) ──
      // cand-0001 을 승인해도 이 후보는 거부되면 안 된다.
      mk({
        id: 'cand-0001-b2', source_problem_id: 47314, type_code: '공수1-09-08',
        source_fingerprint: FP_A, batch_id: BATCH_B, candidate_no: 1,
        prompt_version: 'twin-gen-v1.2',
        problem_text_latex: '$6$명이 각자 다른 모자를 쓰고 있을 때, 모두 남의 모자를 쓰게 되는 경우의 수는?',
        answer_kind: 'number', answer_text: '265',
        solution_outline: ['완전순열임을 파악한다', 'n=6 값을 구한다'],
        concepts: ['완전순열'],
        transformations: ['문장 맥락', '계수·수치'],
        ai_answer_text: '265',
      }),
    ],
  },
  {
    source: src2,
    candidates: [
      mk({
        id: 'cand-0003', source_problem_id: 47164, type_code: '공수1-08-08',
        source_fingerprint: FP_B, batch_id: BATCH_A, candidate_no: 1,
        problem_text_latex:
          '이차부등식 $bx^{2}-6x+b<0$이 해를 갖도록 하는 실수 $b$의 값의 범위는?',
        answer_kind: 'choice', answer_text: '④',
        solution_outline: [
          '이차부등식이므로 b≠0임을 확인한다',
          'b>0과 b<0으로 나누어 판별식 조건을 세운다',
          '두 경우를 합쳐 범위를 정리한다',
        ],
        concepts: ['이차부등식', '판별식'],
        common_mistakes: ['b=0을 빠뜨림', '부등호 방향을 뒤집지 않음'],
        transformations: ['계수·수치', '식 또는 선택지의 표면 표현'],
        reverse_derivation_risk: 'medium',
        ai_answer_text: '④',
        similarity_to_source: 0.41,
        ai_issues: ['선택지 표현이 원문과 비슷합니다'],
      }),
      mk({
        id: 'cand-0004', source_problem_id: 47164, type_code: '공수1-08-08',
        source_fingerprint: FP_B, batch_id: BATCH_A, candidate_no: 2,
        problem_text_latex:
          '이차부등식 $kx^{2}+2x+k>0$의 해가 존재하지 않도록 하는 실수 $k$의 값의 범위는?',
        answer_kind: 'choice', answer_text: '②',
        solution_outline: ['해가 없을 조건을 세운다', '판별식 부호를 확인한다', '범위를 정리한다'],
        concepts: ['이차부등식'],
        common_mistakes: ['"해를 갖는다"와 "해가 없다"를 뒤바꿈'],
        transformations: ['묻는 대상의 표현', '계수·수치'],
        // 형식 검증에서 걸린 예시 — 화면이 이 상태를 어떻게 보여주는지 확인용
        flags: {
          format_validation_passed: false,
          deterministic_check_passed: false,
          independent_check_passed: false,
          ai_consensus_passed: false,
          teacher_approved: false,
          check_method: 'none',
        },
        format_issues: [{ code: 'too_few_transformations', detail: '후보 2: 바꾼 것이 2개뿐' }],
        ai_issues: ['원문과 묻는 방향이 반대라 같은 유형인지 확인이 필요합니다'],
        ai_answer_text: '⑤',
      }),
    ],
  },
]
