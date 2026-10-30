/**
 * 학습 한 바퀴를 저장하는 **기록 모양** — GPT-EXEC-041 · 042 §3-A
 *
 *   학생 진입 → 배정 문항 → 막힌 지점 → 승인된 도움 → 확인 행동
 *     → 원문 복귀 → 재시도 결과 → 강사 요약 · 다음 과제 draft
 *
 * 042 §3-A 로 바뀐 것 — **행동 단위 기록**
 *   041 은 `firstResult` · `retryResult` 같은 **칸 하나**에 덮어썼고, 이벤트 id 를
 *   「행동 종류」(`attempt:answer:first`)로 고정했다. 그래서
 *   ① 같은 요청을 다시 보내면 발생시각이 바뀌어 **충돌**로 보이고
 *   ② 충돌이라면서 **저장된 값은 바뀌어** 있었다.
 *
 *   이제 학생의 **행동 하나 = 기록 하나**다. 기록은 **덧붙이기만** 한다.
 *   「첫 결과」·「마지막 결과」는 저장하지 않고 **목록에서 계산**한다. 그래서
 *   첫 시도와 뒤 시도가 서로를 덮지 않는다 (042 §3-A-5).
 *
 * 경계
 *   - 여기 적힌 이름은 **운영 DB 열이 아니다.** 확인된 열만 나중에 맞춘다.
 *   - 저장 구현은 `store.ts` 가 고른다. 지금은 **시험 저장소(파일)** 다.
 */

/** 이 자료가 어디서 왔는가. 화면·보고에 **그대로 표시한다** */
export type Provenance =
  | 'operational'   // 운영에서 그대로 가져온 것
  | 'local_real'    // 저장소 안의 실제 자료 (예: PILOT_TYPES_014.json 의 유형 코드)
  | 'demo'          // 이번 시범용으로 만든 것. 운영 자료가 아니다

export type AxisCode = 'goal' | 'condition' | 'represent' | 'recall' | 'formulate' | 'compute'

export const AXIS_LABEL: Record<AxisCode, string> = {
  goal: '① 무엇을 구하는지 모르겠다',
  condition: '② 조건을 어떻게 읽는지 모르겠다',
  represent: '③ 식·그림으로 바꾸는 게 막힌다',
  recall: '④ 쓸 개념·공식이 생각나지 않는다',
  formulate: '⑤ 식을 어떻게 세우는지 모르겠다',
  compute: '⑥ 계산·검산에서 막힌다',
}

export const AXES = Object.keys(AXIS_LABEL) as AxisCode[]

export type StudentRow = {
  studentId: string
  /** 시험 계정 입장 코드. 운영의 이름+뒷4자리 로그인과 **다른 것** */
  loginCode: string
  displayName: string
  provenance: Provenance
}

export type TaskRow = {
  taskId: string
  studentId: string
  label: string
  typeCode: string
  problemIds: string[]
  /** 교사가 배정했는가. 배정 안 된 것은 학생에게 내보내지 않는다 */
  assigned: boolean
  provenance: Provenance
}

// ════════════════════════════════════════════════════════════════════
// 행동 — 042 §3-A-1
// ════════════════════════════════════════════════════════════════════

/**
 * 학생의 **행동 하나**를 가리키는 봉투.
 *
 * `actionId` 는 **행동마다 새로** 만든다. 망이 끊겨 같은 요청을 다시 보낼 때는
 * **같은 `actionId` · 같은 내용 · 같은 `occurredAt`** 을 그대로 보낸다.
 * 서버 수신시각은 여기 넣지 않는다 — 그건 `StoredEvent.received_at` 이다.
 *
 * ⚠️ `actionId` 는 **학생 범위 안에서만** 뜻이 있다. 중복 열쇠가
 * `(서버가 확정한 학생, 검증된 producer, actionId)` 라서 남의 기록을 건드릴 수 없다.
 */
export type ActionEnvelope = {
  actionId: string
  occurredAt: string
}

export type AnswerRecord = ActionEnvelope & {
  answer: string
  /** 채점 기준이 없으면 null. 모르는 것을 맞음/틀림으로 바꾸지 않는다 */
  graded: 'correct' | 'wrong' | null
}

/**
 * 시각을 **실제 시점으로** 견준다 (042 §2-B · R042-02).
 *
 * 문자열로 견주면 `+09:00` 표기와 `Z` 표기가 섞였을 때 순서가 뒤집힌다.
 * 못 읽는 값은 `NaN` 이고, 그런 값은 **순서를 확인하지 못한 것**으로 다룬다.
 */
export function epochOf(iso: string): number {
  return Date.parse(iso)
}

/**
 * 이 제출이 **도움 뒤**인가.
 *
 * 저장하지 않고 **볼 때마다 계산**한다. 늦게 도착한 도움 기록이 있으면 그것까지 반영된다.
 * 041 처럼 칸에 굳혀 두면, 늦은 도움이 와도 옛 해석이 그대로 남는다.
 *
 * 같은 시각이면 **뒤로 보지 않는다** — 순서를 알 수 없기 때문이다.
 */
export function isAfterHelp(a: AttemptRow, answer: AnswerRecord): boolean {
  const t = epochOf(answer.occurredAt)
  if (!Number.isFinite(t)) return false
  return a.helpOpened.some((h) => {
    const ht = epochOf(h.occurredAt)
    return Number.isFinite(ht) && ht < t
  })
}

export type StuckRecord = ActionEnvelope & {
  axis: AxisCode | null
}

export type VideoObservationRecord = {
  method: 'window_elapsed' | 'player_coverage' | 'self_report'
  coveragePct?: number
  coveredSeconds?: number
  focusLostSeconds?: number
  sceneSeconds?: Record<string, number>
  /** **서버가** 유효 구간과 기준으로 센 완료. 구간을 모르면 비워 둔다 (미확인) */
  completed?: boolean
  /** 학생 화면이 보낸 주장. 서버 계산과 **구별해** 둔다 (042 §2-C) */
  completedClaimed?: boolean
  /** 반복 재생까지 합친 총 재생 초. `coveredSeconds`(서로 다른 구간)와 **다른 척도** */
  playedSeconds?: number
  windowElapsedMs?: number
  /**
   * 실제로 본 구간들 (042 §3-C). 승인 구간 **안쪽만** 들어간다.
   *
   * 왜 초 합계만 두지 않는가: 학생이 나갔다 다시 들어오면 앞에 본 데가 어디였는지
   * 알아야 **이어서** 셀 수 있다. 합계만 있으면 다시 0 부터 세거나 두 번 센다.
   */
  watchedRanges?: Array<[number, number]>
}

export type HelpOpenRecord = ActionEnvelope & {
  relationId: string
  contentRefId: string
  segmentKey: string
  /**
   * 재생 관측. **값이 없는 칸은 넣지 않는다** — 0 으로 채우지 않는다 (R040-A).
   * 같은 영상을 더 보면 **새 행동**이라 기록이 하나 더 붙는다. 덮어쓰지 않는다.
   */
  observation: VideoObservationRecord
}

export type ConfirmSubmission = ActionEnvelope & {
  itemRef: string
  answer: string
  graded: 'correct' | 'wrong' | null
  origin: 'operational' | 'demo'
}

/**
 * 한 문항에 대한 시도. **모든 목록이 덧붙이기 전용**이다.
 *
 * 041 의 `firstResult` · `retryResult` · `stuckAxis` 칸은 없앴다.
 * 같은 값을 `summarize()` 로 **계산**한다 — 그래야 덮어쓰기가 생기지 않는다.
 */
export type AttemptRow = {
  attemptId: string
  studentId: string
  taskId: string
  problemId: string
  startedAt: string
  answers: AnswerRecord[]
  stuckReports: StuckRecord[]
  helpOpened: HelpOpenRecord[]
  confirmSubmissions: ConfirmSubmission[]
  updatedAt: string
}

export function emptyAttempt(
  attemptId: string, studentId: string, taskId: string, problemId: string, now: string,
): AttemptRow {
  return {
    attemptId, studentId, taskId, problemId, startedAt: now,
    answers: [], stuckReports: [], helpOpened: [], confirmSubmissions: [],
    updatedAt: now,
  }
}

// ════════════════════════════════════════════════════════════════════
// 계산해서 보는 값 — 저장하지 않는다
// ════════════════════════════════════════════════════════════════════

export type AttemptSummary = {
  /** 첫 제출의 채점. 제출이 없으면 null */
  firstResult: 'correct' | 'wrong' | null
  /** 마지막 제출의 채점 */
  lastResult: 'correct' | 'wrong' | null
  /** **도움을 연 뒤** 낸 제출 중 마지막 것 (042 §3-B) */
  resultAfterHelp: 'correct' | 'wrong' | null
  answerCount: number
  /** 틀린 제출이 2번 이상인가. **「같은 오개념 반복」이라고 쓰지 않는다** */
  repeatedWrong: boolean
  /** 마지막으로 고른 막힌 지점 */
  stuckAxis: AxisCode | null
  helpOpenCount: number
  /** (관계+구간)별 **가장 나중** 관측. 앞 관측을 지우지 않는다 */
  latestObservation: HelpOpenRecord | null
  /** 확인 항목별 마지막 제출 */
  latestConfirm: ConfirmSubmission[]
  /** 확인 항목에서 맞힌 것이 하나라도 있는가 */
  anyConfirmCorrect: boolean
}

function lastOf<T>(xs: T[]): T | null {
  return xs.length === 0 ? null : xs[xs.length - 1]
}

/**
 * 같은 시각이면 **들어온 순서**를 지킨다 (안정 정렬).
 *
 * 042 §2-B — 문자열이 아니라 **실제 시점**으로 견준다. 표기가 섞여도 순서가 맞는다.
 * 읽을 수 없는 시각은 **맨 뒤**로 보내고, 그 사실이 다른 값을 바꾸지 않게 둔다.
 */
function byTime<T extends ActionEnvelope>(xs: T[]): T[] {
  return xs
    .map((x, i) => ({ x, i, t: epochOf(x.occurredAt) }))
    .sort((a, b) => {
      const at = Number.isFinite(a.t) ? a.t : Number.POSITIVE_INFINITY
      const bt = Number.isFinite(b.t) ? b.t : Number.POSITIVE_INFINITY
      return at - bt || a.i - b.i
    })
    .map(({ x }) => x)
}

/** 목록에서 계산한다. **덮어쓴 값을 읽는 것이 아니다** */
export function summarize(a: AttemptRow): AttemptSummary {
  const answers = byTime(a.answers)
  const first = answers[0] ?? null
  const last = lastOf(answers)
  // 042 §2-B — 저장된 칸이 아니라 **지금 이력으로** 센다. 늦게 온 도움도 반영된다
  const afterHelp = lastOf(answers.filter((x) => isAfterHelp(a, x)))

  const confirmByItem = new Map<string, ConfirmSubmission>()
  for (const c of byTime(a.confirmSubmissions)) confirmByItem.set(c.itemRef, c)
  const latestConfirm = [...confirmByItem.values()]

  const stuck = lastOf(byTime(a.stuckReports))

  return {
    firstResult: first === null ? null : first.graded,
    lastResult: last === null ? null : last.graded,
    resultAfterHelp: afterHelp === null ? null : afterHelp.graded,
    answerCount: a.answers.length,
    repeatedWrong: a.answers.filter((x) => x.graded === 'wrong').length >= 2,
    stuckAxis: stuck === null ? null : stuck.axis,
    helpOpenCount: a.helpOpened.length,
    latestObservation: lastOf(byTime(a.helpOpened)),
    latestConfirm,
    anyConfirmCorrect: latestConfirm.some((c) => c.graded === 'correct'),
  }
}

// ════════════════════════════════════════════════════════════════════
// 저장된 이벤트
// ════════════════════════════════════════════════════════════════════

/** `learningPreview.compareEvents` 의 봉투와 같은 모양 */
export type StoredEvent = {
  resolvedStudentScope: string
  validatedProducer: string
  eventId: string
  clientEvent: Record<string, unknown>
  /** 서버가 붙인다. 의미 비교에서 빠진다 */
  received_at: string
  /** 이 이벤트가 상태에 반영됐는가 */
  verdict: 'applied' | 'duplicate' | 'conflict' | 'rejected'
}

export type PlanDraftRow = {
  studentId: string
  attemptId: string
  approvalState: 'draft'
  items: string[]
  recheckMethod: string
  rationaleEventIds: string[]
  overwritesApprovedPlan: false
  createdAt: string
  /** 어느 행동까지 보고 만든 초안인가 — 근거를 고정한다 */
  basedOnActionIds: string[]
}
