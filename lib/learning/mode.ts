/**
 * 시험(demo) 모드인가 — GPT-EXEC-042 §3-D
 *
 * 왜 있나
 *   041 의 시험 입장 코드(`A-2026`·`T-2026`)·고정 서명 열쇠·파일 저장소는
 *   **합성 자료만 있는 로컬에서 쓰라고 둔 편의**다. 그런데 꺼지는 장치가 없어서
 *   `NODE_ENV=production` 으로 `isStaffRequest` 를 불러도 시험 강사 쿠키가 통했다
 *   (R041-04). 운영 빌드에 그대로 올라가면 그게 **뒷문**이 된다.
 *
 * 규칙 — **기본은 꺼짐**
 *   `LEARNING_DEMO_MODE=1` 을 **명시적으로** 켰고, 동시에 `NODE_ENV` 가
 *   `production` 이 아닐 때만 켜진다. 둘 중 하나라도 아니면 꺼진다.
 *   운영 빌드에서는 환경변수를 어떻게 넣어도 켜지지 않는다 — `production` 검사가 먼저다.
 *
 * 켜는 법 (로컬)
 *   `npm run dev:learning-demo`
 *
 * 꺼져 있으면 무엇이 되나
 *   시험 입장 코드·시험 강사 쿠키·파일 저장소 접근이 **전부 막힌다.**
 *   학생 인증은 기존 `student_login` 경로로, 직원 인가는 `denyIfNotStaff` 로 가야 하는데
 *   그 연결은 **아직 안 돼 있다.** 그래서 운영 모드에서는 「미연결」이라고 답한다 —
 *   조용히 시험 장치로 되돌아가지 않는다 (EXEC-042 §2).
 */

export type LearningMode = 'local_demo' | 'operational'

export function learningMode(): LearningMode {
  // 운영 빌드면 환경변수와 상관없이 꺼진다. 이 순서를 바꾸지 말 것
  if (process.env.NODE_ENV === 'production') return 'operational'
  if (process.env.LEARNING_DEMO_MODE !== '1') return 'operational'
  return 'local_demo'
}

export function demoEnabled(): boolean {
  return learningMode() === 'local_demo'
}

/** 꺼져 있을 때 화면·API 에 그대로 보여 줄 안내 */
export const DEMO_OFF_NOTICE = {
  mode: 'operational' as const,
  error: '시험(demo) 모드가 꺼져 있습니다',
  how: 'npm run dev:learning-demo',
  why: '시험 입장 코드·시험 강사 쿠키·파일 저장소는 로컬 시험 전용입니다. '
     + '운영 인증(student_login · denyIfNotStaff)은 아직 연결되지 않았습니다.',
}
