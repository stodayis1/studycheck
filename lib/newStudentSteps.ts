// 새로 온 학생에게 **무엇을 어디서 해야 하나** — 순서대로 보여 준다.
//
// 왜 (원장님 2026-11-04)
//   「새 학생을 배정했어. 순차적으로 시간표까지 배정되어 들어온단 말이지. 그럼 그 학생에게
//   교재 배정을 어디에서 하고 학습일지 쓰는 순서는 어떻게 되는지 직관적으로 보이게끔」
//
//   시간표까지는 OPS 에서 들어온다. 그 **다음부터**가 선생님 몫인데, 어느 화면에서
//   무엇을 해야 하는지가 머릿속에만 있었다. 새로 오신 선생님은 알 길이 없다.
//
// ★ 새 단계를 만들지 않는다. **이미 하고 있는 일**을 순서대로 적고, 했는지 안 했는지만
//   기록을 보고 표시한다. 그래서 틀릴 수가 없다 — 기록이 곧 상태다.

export interface StepCounts {
  /** 시간표 줄 (schedules) — OPS 에서 들어온다 */
  schedules: number
  /** 배정된 교재 (student_textbooks) */
  textbooks: number
  /** 쓴 학습일지 (learning_notes) */
  notes: number
  /** 배정된 학습지 (student_worksheets) */
  worksheets: number
  /** 학부모께 나간 브리핑 (briefing_sends) */
  briefings: number
}

export interface Step {
  no: number
  title: string
  /** 어디서 하나 */
  where: string
  href: string | null
  done: boolean
  /** 지금 할 차례 — 앞 단계가 다 끝났고 이건 아직인 것 하나 */
  next: boolean
  /** 한 줄 설명 */
  hint: string
}

/**
 * 순서는 **실제로 일하는 순서**다.
 *   ① 시간표(OPS) → ② 교재 → ③ 첫 학습일지 → ④ 학습지 → ⑤ 브리핑(저절로)
 *
 * ★ ②와 ③의 순서를 바꾸지 않는다. 교재가 있어야 학습일지의 「오늘 나간 진도」에
 *   교재를 고를 수 있다 — 교재 없이 일지를 쓰면 진도 칸을 손으로 적게 된다.
 * ★ ⑤는 선생님이 하는 일이 아니다. 일지를 쓰면 **저절로** 나간다는 것을 알려 주는 칸이다.
 */
export function buildSteps(c: StepCounts): Step[] {
  const raw: Omit<Step, 'next'>[] = [
    {
      no: 1, title: '반·시간표 배정', where: '수학OPS (행정)', href: null,
      done: c.schedules > 0,
      hint: '여기까지는 OPS 에서 들어와요. 안 돼 있으면 행정팀에 말씀해 주세요.',
    },
    {
      no: 2, title: '교재 배정', where: '학습지관리 → 병행교재', href: '/teacher/assignments',
      done: c.textbooks > 0,
      hint: '먼저 교재를 배정해야 학습일지의 진도 칸에서 그 교재를 고를 수 있어요.',
    },
    {
      no: 3, title: '첫 학습일지 쓰기', where: '학습관리', href: '/teacher/learning-notes',
      done: c.notes > 0,
      hint: '수업한 날 출결 → 진도 → 과제 순서로 적어요. 이게 학부모 브리핑의 바탕이 돼요.',
    },
    {
      no: 4, title: '학습지 배정', where: '학습지관리', href: '/teacher/assignments',
      done: c.worksheets > 0,
      hint: '레벨학습지를 배정해요. 초등은 70점을 넘어야 다음 단원으로 넘어가요.',
    },
    {
      no: 5, title: '학부모 브리핑', where: '저절로 나가요', href: null,
      done: c.briefings > 0,
      hint: '학습일지를 쓰면 그날 저녁 8시(또는 다음 날 오전 11시)에 저절로 나가요.',
    },
  ]
  const 할차례 = raw.find((s) => !s.done)?.no ?? null
  return raw.map((s) => ({ ...s, next: s.no === 할차례 }))
}

/** 다 끝났나 — 끝난 학생은 안내를 접는다 */
export const allDone = (steps: Step[]) => steps.every((s) => s.done)

/** 「2/5 단계」 처럼 적을 말 */
export const stepLabel = (steps: Step[]) => `${steps.filter((s) => s.done).length}/${steps.length}`
