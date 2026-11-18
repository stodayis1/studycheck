/**
 * 출결만 보고 「그날 학부모 브리핑을 보낼 수 있는 날인가」를 정한다. **규칙은 여기 한 곳**이다.
 *
 * 왜 떼어 냈나 (2026-11-18)
 *   보내지 않는 사유가 세 가지로 늘었고(기록 없음 · 시험기간 결석 · 결석), 발송 라우트 안에
 *   if 세 줄로 박혀 있어서 **검사할 방법이 없었다.** 한 줄이 조용히 빠지면 매일 요금이
 *   새거나(안 막힘) 학부모가 못 받는다(과하게 막힘). 둘 다 에러가 안 난다.
 *
 * 쓰는 곳: `app/api/kakao-briefing/route.ts`. 검사: `scripts/briefing-absent-check.ts`.
 */
import { isExamAbsence } from './attendance'

export type BriefingBlock =
  /** 출결이 안 적혀 있다 — 아직 일지를 쓰는 중이다 */
  | 'noRecord'
  /** 시험기간 결석 — 원장님 결정 2026-10-08. 결석률에도 안 세고 보강도 안 잡는다 */
  | 'exam'
  /** 결석 — 원장님 결정 2026-11-18 「결석인 친구는 아예 내보내지말자」 */
  | 'absent'
  | null

/**
 * @param attendance `learning_notes.attendance` 값 그대로. 글자는 `lib/attendance.ts` 기준.
 *
 * ★ 막는 사유가 있으면 그 이름을, 보낼 수 있으면 null 을 준다.
 *   「정시」·「지각」처럼 수업에 온 날은 null 이다.
 */
export function briefingBlockFor(attendance?: string | null): BriefingBlock {
  const v = String(attendance ?? '').trim()
  if (!v) return 'noRecord'
  if (isExamAbsence(v)) return 'exam'
  if (v === '결석') return 'absent'
  return null
}

/**
 * 그 사유를 **미리보기(dryRun)에서도** 걸러야 하나.
 *
 * ★ 「결석」은 **미리보기에는 남긴다.** 담당강사 샘플(`runTeacherSample`)이 미리보기 목록의
 *   `attendance === '결석'` 을 보고 「그날 담당 학생이 모두 결석이라 보낼 글이 없어요」를
 *   알려 주는데, 미리보기에서 통째로 빼면 그 선생님이 **아무 사유도 없이** 목록에서 사라진다.
 *   화면에서도 「결석이라 일부러 제외 N명」을 적어 줄 수 없게 된다.
 */
export function blocksPreviewToo(block: BriefingBlock): boolean {
  return block === 'noRecord' || block === 'exam'
}
