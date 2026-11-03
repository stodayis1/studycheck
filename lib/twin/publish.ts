// 학생에게 나가는 것을 거르는 곳 (D-063)
//
// ★ 최상위 원칙 — 최종답은 어떤 경우에도 학생에게 가지 않는다.
//
//   원문 문제의 정답은 물론, **쌍둥이 연습문제의 최종 정답도 보내지 않는다.**
//   학생이 답을 제출하면 서버가 정답/오답만 판정하고, 틀렸으면 다음 힌트로 간다.
//
//   이전 판에는 `can_show_final_value` 라는 필드가 있었다. 지금 값이 없더라도
//   "이 예제는 최종값을 보여줘도 된다"는 계약이 남아 있으면, 나중에 호출부가
//   그 문으로 정답을 가져가게 된다. **그래서 필드 자체를 없앴다** (D-063).
//
// 학생 응답에 들어가면 안 되는 것
//   - `published` 가 아닌 예제 (D-041) · `retired` 예제 (D-051)
//   - 학생 게시 안전검수를 통과하지 않은 예제 (D-064)
//   - **정답** · **풀이 개요** · 검산 기록 · 공개 가능성 플래그
//
// 학생용 API 는 DB 행을 그대로 직렬화하지 않고 **반드시 이 함수를 거친다.**
// 필드를 추가로 내보내려면 여기를 고쳐야 하므로, 실수로 정답이 새지 않는다.

/** 서버 내부용 행. 정답·풀이가 들어 있고 **학생에게 나가지 않는다.** */
export type ExampleRow = {
  id: string
  type_code: string
  problem_text_latex: string
  answer_text: string              // 서버 판정용
  solution_outline: string[]       // 서버·교사용
  status: 'approved' | 'published' | 'retired'
  /** D-064. 학생에게 게시해도 안전한지 사람이 확인했는가. **최종답 공개 권한이 아니다.** */
  student_publish_approved: boolean
  retired_at: string | null
}

/**
 * 학생 화면에 보내도 되는 필드. **이 셋이 전부다** (D-063 §146).
 *
 * 공개 가능성 플래그를 두지 않는다. 최종값을 보여줄 수 있는 경로 자체가 없다.
 */
export type StudentSafeExample = {
  id: string
  type_code: string
  problem_text_latex: string
}

/**
 * 학생에게 내보낼 수 있으면 안전한 모양으로, 아니면 `null`.
 *
 * `null` 을 받으면 호출부는 그 예제를 **응답에서 빼야 한다.**
 * 빈 객체나 자리표시자를 넣지 않는다.
 *
 * 세 조건을 모두 만족해야 나간다.
 *   status = 'published'  AND  student_publish_approved = true  AND  retired_at is null
 */
export function studentSafeExample(row: ExampleRow): StudentSafeExample | null {
  if (row.status !== 'published') return null   // approved·retired 는 나가지 않는다
  if (row.retired_at != null) return null
  if (row.student_publish_approved !== true) return null

  // 필요한 셋만 명시적으로 옮긴다. 스프레드(...)를 쓰지 않는다 —
  // 원본에 필드가 늘어나도 학생 응답에 자동으로 섞이지 않게 하기 위해서다.
  return {
    id: row.id,
    type_code: row.type_code,
    problem_text_latex: row.problem_text_latex,
  }
}

/** 목록용. 내보낼 수 없는 것은 조용히 빠진다. */
export function studentSafeExamples(rows: ExampleRow[]): StudentSafeExample[] {
  return rows.map(studentSafeExample).filter((x): x is StudentSafeExample => x !== null)
}
