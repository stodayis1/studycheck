// 월간 리포트 **한 줄 평** — 선생님 알림장을 요약해 만든다.
//
// 원장님 2026-10-24 「한달동안 써준 알림장 내용을 너가 요약정리해서」
// 원장님 2026-11-05 「2개월치면 선생님이 쓴 코멘트 내용을 요약정리해서 보내줘야 하거든」
//             그리고 「왜 수업태도는 모두다 나열되어 있는거지?」
//
// ★ 알림장을 **그대로 늘어놓지 않는다.** 두 달치면 열 건이 넘고, 학부모님은 그 벽을 안 읽으신다.
//   한 줄 평이 없으면 **요약해서 채운다** — 2026-11-05 에 모델을 Haiku 5.5 로 바꿔
//   건당 0.2원이라, 전교생을 한 번에 돌려도 20원이다(그 전에는 10원씩이라 망설였다).
// ★ 미리보기 화면과 실제 발송이 **이 함수 하나**를 같이 쓴다. 따로 두면 어긋난다.

export interface CommentSource {
  studentName: string
  studentGrade?: string | null
  months: 1 | 2
  /** 그 기간 알림장 — 날짜와 글 */
  notices: { date?: string | null; content?: string | null }[]
  /** 곁들일 숫자 (없으면 안 쓴다) */
  numbers?: {
    sessions?: number | null
    onTime?: number | null
    late?: number | null
    absent?: number | null
    hwRate?: number | null
    hwScore?: number | null
  }
}

/** 한 줄 평을 만들어 달라고 할 때 쓰는 글. */
export function commentPrompt(s: CommentSource): string {
  const 기간 = s.months === 2 ? '두 달' : '한 달'
  const 알림장 = (s.notices ?? [])
    .map((n) => `(${String(n?.date ?? '').slice(5)}) ${String(n?.content ?? '').trim()}`)
    .filter((t) => t.length > 8)

  const n = s.numbers ?? {}
  const 숫자 = [
    n.sessions != null ? `수업 ${n.sessions}회` : '',
    n.onTime != null ? `정시 ${n.onTime}회` : '',
    n.late ? `지각 ${n.late}회` : '',
    n.absent ? `결석 ${n.absent}회` : '',
    n.hwRate != null ? `과제달성률 ${n.hwRate}%` : '',
    n.hwScore != null ? `과제성취도 ${n.hwScore}%` : '',
  ].filter(Boolean).join(', ')

  return [
    `다음은 수학 학원 학생의 ${기간} 학습 기록입니다.`,
    `학부모에게 보내는 따뜻하고 전문적인 한 줄 평을 3~5문장으로 써 주세요.`,
    `이모지와 마크다운은 쓰지 말고, 순수한 글로만 써 주세요.`,
    알림장.length
      ? `**담당 선생님이 ${기간} 동안 쓰신 알림장 ${알림장.length}건을 먼저 읽고, 그 내용을 요약해 녹여 주세요.**`
        + ` 날짜를 하나하나 나열하지 말고, 전체 흐름(무엇을 어려워했고 어떻게 나아졌는지)으로 묶어 주세요.`
        + ` 숫자보다 선생님 말씀이 중심입니다. 알림장: ${알림장.join(' / ')}`
      : `알림장이 없으니 아래 숫자만 가지고 담백하게 써 주세요.`,
    `학생: ${s.studentName}${s.studentGrade ? `(${s.studentGrade})` : ''}`,
    숫자 ? `참고 숫자 — ${숫자}` : '',
  ].filter(Boolean).join(' ')
}

/** 요약할 거리가 있나 — 알림장이 한 건도 없으면 부르지 않는다(돈만 든다). */
export const hasSomethingToSummarize = (s: CommentSource) =>
  (s?.notices ?? []).some((n) => String(n?.content ?? '').trim().length > 8)
