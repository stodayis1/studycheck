// 검수 API 요청 본문 계약 (GPT-EXEC-006 작업 E §316)
//
// 왜 따로 두나
//   라우트에서 `body as {...}` 로 캐스팅하면 배열 자리에 문자열이 와도, 허용되지 않은
//   편집 키가 섞여도 그대로 통과한다. 그러면 잘못된 값이 RPC 까지 내려가고,
//   오류 메시지는 "처리하지 못했어요" 한 줄이 된다.
//   여기서 먼저 걸러 **어떤 항목이 왜 잘못됐는지** 알 수 있게 한다.
//
// 이건 편의 검사일 뿐 최종 권위가 아니다. 최종 판정은 DB CHECK 와 RPC 가 한다 (D-046).

import { z } from 'zod'

/** 빈 문자열·공백만 있는 문자열을 막는다. 자동으로 다듬지 않는다 — 교사가 넣은 값을 바꾸지 않는다. */
const NonBlank = z.string().refine(s => s.trim() !== '', { message: 'blank' })

/** 줄 단위 입력을 배열로 받는다. 요소가 문자열이 아니면 **거부**한다 (조용한 캐스팅 금지). */
const StringList = z.array(NonBlank)

/**
 * 승인 시 교사가 고칠 수 있는 항목. `.strict()` 라서 목록 밖의 키가 있으면 거부된다.
 * 설치 SQL 의 `v_allowed` 와 같은 여섯 개여야 한다.
 */
export const ApprovalEditsZ = z.object({
  problem_text_latex: NonBlank.optional(),
  answer_kind: z.enum(['number', 'choice']).optional(),
  answer_text: NonBlank.optional(),
  solution_outline: StringList.optional(),
  concepts: StringList.optional(),
  common_mistakes: StringList.optional(),
}).strict()

const Uuid = z.string().uuid()

export const ReviewRequestZ = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    candidateId: Uuid,
    // 수정 없이 승인하면 빈 객체다
    edits: ApprovalEditsZ.optional(),
  }).strict(),
  z.object({
    action: z.literal('reject'),
    candidateId: Uuid,
    reason: NonBlank,
  }).strict(),
  z.object({
    action: z.enum(['publish', 'unpublish']),
    practiceProblemId: Uuid,
  }).strict(),
  z.object({
    action: z.enum(['approve_student_publish', 'revoke_student_publish']),
    practiceProblemId: Uuid,
  }).strict(),
])

export type ReviewRequest = z.infer<typeof ReviewRequestZ>

/** 실패 사유를 사람이 읽을 수 있게 한 줄로. 정답·본문 값을 메시지에 담지 않는다. */
export function describeIssues(err: z.ZodError): string {
  const seen = new Set<string>()
  for (const i of err.issues) {
    const path = i.path.join('.')
    seen.add(path ? `${path}: ${i.message}` : i.message)
  }
  return Array.from(seen).slice(0, 5).join(' / ')
}
