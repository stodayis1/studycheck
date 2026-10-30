/**
 * 학습 연결 **로컬 미리보기** — GPT-EXEC-040 §4
 *
 * 무엇인가
 *   합성 입력을 받아 **다음 행동 하나**를 고르고 그 근거를 돌려주는 **순수 함수**다.
 *
 *     학습 시도 → 막힘 관측 → 승인된 도움 선택 → 확인 행동
 *       → 재풀이·지연재확인 근거 → 다음 계획 draft · 강사 요약
 *
 * 무엇이 **아닌가**
 *   - 운영 API·DB·UI 가 **아니다.** production route 에서 import 하지 않는다.
 *   - 네트워크·모델·Storage 를 **쓰지 않는다.** 전부 인자로 받는다.
 *   - 추천 **정확도·성적 향상 시험이 아니다.** 연결의 **의미**를 보이는 시범이다.
 *   - 여기 쓰인 논리 키는 **운영 DB 열이 아니다.** 확인되지 않은 열을 확정하지 않는다
 *     (040 §4: "preview 의 논리 키와 기존 DB 열을 분리한다").
 *
 * 지키는 경계 (040 §4 의 수용 대조 6개)
 *   1. 같은 유형이라도 **관측된 막힘과 승인된 관계**에 따라 세 종류 영상 중에서 고른다.
 *      축 ↔ 종류를 **배타적 1:1 로 묶지 않는다.**
 *   2. 영상이 없거나 **원문 답을 노출**하면 승인된 기존 문제·카드로 **대체**한다.
 *      원문 학습 전체를 막지 않는다.
 *   3. 시청 완료·정답 1회·**미측정 도움**만으로 독립해결·숙달을 확정하지 않는다.
 *   4. 창열림·재생·구간·미측정을 **하나의 집중 점수로 합치지 않는다.**
 *   5. 계획·질문·관측방법 변화는 **의미 충돌**, 서버 수신시각만 바뀌면 **중복**.
 *      **다른 학생은 섞지 않는다.**
 *   6. 강사에게 **학생별 새 입력·확인문제 선택·이벤트마다 승인**을 만들지 않는다.
 */

// ════════════════════════════════════════════════════════════════════
// 입력 — 전부 합성이다. 실제 학생·문제·영상 행을 읽지 않는다
// ════════════════════════════════════════════════════════════════════

/** CP-002 §3 의 진단 축 6개. **질문앱이 실제로 저장하는지는 미확인**이다 */
export type Axis =
  | 'goal'        // ① 목표 확인
  | 'condition'   // ② 조건 해석
  | 'represent'   // ③ 표현 변환
  | 'recall'      // ④ 개념·공식 회상
  | 'formulate'   // ⑤ 식 세우기
  | 'compute'     // ⑥ 계산·검산

/** 영상 콘텐츠의 종류. 운영 `lesson_videos.kind` 와 **대응하지만 같은 값이 아니다** */
export type VideoKind = 'concept' | 'worked_example' | 'proof'

/** 이 학습에서 쓰는 **역할**. `video_kind` 와 분리한다 (039 §1-A) */
export type RelationKind =
  | 'concept_explanation'
  | 'type_demonstration'
  | 'theorem_proof'
  | 'concept_card'
  | 'reviewed_problem'

/**
 * 노출 검수가 **무엇에 대해** 내려졌는가. 지금 상황과 이 네 가지가 모두 같아야 쓴다.
 *
 * `segmentKey` 가 범위에 들어가는 것이 핵심이다 — 검수받은 구간과 지금 보여주려는
 * 구간이 다르면(구간을 새로 붙였거나 바꿨으면) 그 검수는 이 상황의 검수가 아니다.
 */
export type ExposureScope = {
  problemRefId: string
  taskGoal: 'solve' | 'prove' | 'explain'
  assetVersion: number
  /** 구간 지정이면 `"start-end"`, 통째면 `"full"` */
  segmentKey: string
}

export type ExposureReview = {
  verdict: 'safe' | 'reveals' | 'unknown'
  scope: ExposureScope
  /** 누가 판단했는가. 학생·client 가 아니다 */
  reviewedBy: string
  reviewedAt: string
}

/** 지금 상황의 구간 열쇠 */
export function segmentKeyOf(segment: { startSeconds: number; endSeconds: number } | undefined): string {
  return segment === undefined ? 'full' : `${segment.startSeconds}-${segment.endSeconds}`
}

/**
 * 확인 행동으로 **실제 풀 수 있는** 항목 하나 (R040-D).
 * 라벨만 출력하지 않고 학생이 고르거나 적어 제출할 수 있는 것을 가리킨다.
 */
export type ConfirmActionItem = {
  itemRef: string
  prompt: string
  /** 객관식이면 보기, 서술이면 null */
  choices: string[] | null
  /** 운영 항목인지 시연 항목인지 **섞지 않는다** (040 리뷰 §3 R040-D) */
  origin: 'operational' | 'demo'
  /**
   * 확인 문항이 **그림**일 때 그 그림의 서명된 임시 주소 (045 이어서).
   *
   * 운영 확인 문항은 문제은행 문항이고 **본문이 그림**이다 (`stem` 이 빈 글자).
   * 그림을 안 보내면 학생 화면에 「문항 102」라는 글자만 뜨고 **문제를 볼 수 없다.**
   * 저장소 경로가 아니라 **서버가 서명한 주소**만 넣는다 — 경로는 학생에게 가지 않는다.
   * 그림이 없거나 서명을 못 했으면 `null`·생략이다 (빈 글자로 채우지 않는다).
   */
  imageUrl?: string | null
}

/**
 * 승인된 **관계** 하나. 자산이 아니라 "이 자산을 이 학습에 써도 되는가" 다.
 *
 * `supportedAxes` 는 **복수**다 — 한 자산이 여러 축을 돕는다 (040 §4-1).
 */
export type ApprovedRelation = {
  relationId: string
  relationKind: RelationKind
  /** 영상이면 종류. 문제·카드면 null */
  videoKind: VideoKind | null
  typeCode: string
  /** 이 관계가 도울 수 있는 축들 */
  supportedAxes: Axis[]
  /** 관계 적합성 검수를 통과했는가 (자산 품질 검수와 **다른 것**) */
  relationReviewed: boolean
  /** 자산 품질 검수를 통과했는가 */
  assetReviewed: boolean
  /** 자산 판(version). 판이 바뀌면 노출 검수를 다시 받아야 한다 */
  assetVersion: number
  /**
   * **서버가 승인한** 노출 판단 (R040-C).
   *
   * 예전 `answerExposure: 'safe'|'reveals'|'unknown'` 한 칸을 대신한다. 그 칸은
   * "증명 원문 + 완성 증명 + 구간 없음 → 제외" 같은 **휴리스틱**과 함께 쓰여서,
   * 같은 자산에 구간 속성만 붙이면 후보가 되는 구멍이 있었다.
   *
   * 이제는 **지금 원문·과제 목적·자산 판·구간** 네 가지를 묶은 범위에 대해
   * 사람이 내린 판단만 쓴다. 범위가 하나라도 다르면 **쓰지 않고 보류**한다.
   * client 가 보낸 참/거짓이 아니라 서버 검수 기록에서 와야 한다 (040 §3-A).
   */
  exposureReview?: ExposureReview
  /**
   * 영상 **파일 전체를 내려준다**는 전제에서, 전체가 이 원문에 안전한가 (042 §3-C).
   *
   * 화면이 구간만 보여 주는 것은 **보장이 아니다.** 파일이 통째로 내려가면 학생은
   * 주소만 알아도 전부 볼 수 있다. 그래서 「구간을 걸었으니 안전하다」로 치지 않고,
   * **전체가 안전하다고 검수된 자산**만 영상으로 쓴다. 없으면 카드·문항으로 간다.
   *
   * 영상이 아니면 `null` (파일을 통째로 내려주는 문제가 없다).
   */
  wholeDeliverySafe: boolean | null
  /** 영상 구간. `lesson_videos.scenes` 에 대응하는 **논리** 값 */
  segment?: { startSeconds: number; endSeconds: number; sceneNo?: number }
  /**
   * 확인 행동으로 **실제 내놓을 수 있는** 항목들 (R040-D).
   * 비어 있으면 라벨만 있는 확인 행동을 만들지 않는다.
   */
  confirmItems?: ConfirmActionItem[]
  /**
   * 학생이 **열 수 있는가** — 운영에서는 학습일지 과제에 들어가야 열린다
   * (`lesson_videos` 의 `own_assigned_read`). 여기서는 입력으로 받는다
   */
  reachableByStudent: boolean
  contentRef: { kind: string; id: string; version?: number }
}

/** 이번 시도에서 **관측된** 것. 해석이 아니라 관측이다 */
export type StuckObservation = {
  /** 막힌 것으로 **보이는** 축. 모르면 null */
  axis: Axis | null
  /** 그 판단의 근거 이벤트 id 들 */
  evidenceEventIds: string[]
  /** 도움을 받았는지 **관측됐는가**. `'unmeasured'` 를 `false` 로 바꾸지 않는다 */
  helpObserved: 'none' | 'hints' | 'video' | 'teacher' | 'unmeasured'
  /** 반복 오류 횟수. 모르면 null */
  repeatedMisconceptions: number | null
}

/** 영상 관측. **서로 다른 측정을 한 점수로 합치지 않는다** (040 §4-4) */
export type VideoObservation = {
  method: 'window_elapsed' | 'player_coverage'
  /** 창이 열려 있던 시간 (옛 경로) */
  windowElapsedMs?: number
  /** 실제 재생·구간 (새 플레이어) */
  coveragePct?: number
  coveredSeconds?: number
  /** 장면별 재생 초 */
  sceneSeconds?: Record<string, number>
  /** 탭·앱 전환 동안의 재생 초. **인지적 집중이 아니다** */
  focusLostSeconds?: number
  completed?: boolean
}

export type PreviewInput = {
  /** 서버가 확정한 학생 범위. **client 값이 아니다** (040 §3-A) */
  resolvedStudentScope: string
  /** 합성 시도 */
  attemptRef: string
  problemRef: { kind: 'problem'; id: string; version?: number }
  typeCode: string
  /** 이 원문의 과제 목적 — 답 노출 판단에 쓴다 */
  taskGoal: 'solve' | 'prove' | 'explain'
  plan?: { planRef: string; planVersion: number; planItemRef: string }
  stuck: StuckObservation
  /** 승인된 관계들 (검수·도달 가능 여부 포함) */
  relations: ApprovedRelation[]
  /** 영상을 이미 봤다면 그 관측 */
  videoObservation?: VideoObservation
  /** 지연 재확인 결과가 있으면 */
  delayedRecheck?: { passed: boolean; delayDays: number; differentItem: boolean }
  /**
   * 도움을 연 **뒤에** 관측된 것들 (042 §3-B).
   *
   * 041 은 이것을 preview 에 넘기지 않아서, 학생이 확인 문제를 맞히고 원문도 다시 맞혀도
   * `successAfterHelp` 가 `null` 이었고 계획 초안이 **바이트 하나 안 바뀌었다** (R041-02).
   *
   * 셋을 **합치지 않는다.** 확인 행동 통과 · 원문 재풀이 성공 · 지연 재확인은 서로 다른
   * 증거다. 그리고 셋 중 무엇도 「도움 때문에 늘었다」는 뜻이 아니다.
   */
  outcomesAfterHelp?: OutcomesAfterHelp
  /** 안 주면 가장 보수적인 값(시험환경·시연콘텐츠)으로 본다 */
  provenance?: PreviewProvenance
  /**
   * 승인된 도움이 하나도 없을 때 **실제로 돌아갈 수 있는** 다른 과제 (R040-D).
   *
   * 서버가 "이 학생에게 이미 배정돼 있고 지금 열린다" 를 확인한 것만 넣는다.
   * 비면 "지금 가능한 다른 과제 계속" 같은 **빈 문장을 만들지 않고**
   * `대체 자산 없음` 으로 정확히 적는다.
   */
  availableFallbackTasks?: FallbackTask[]
}

/**
 * 이 미리보기가 **무엇 위에서** 돌았는가 (042 §1 결정 4).
 *
 * 환경과 콘텐츠를 **따로** 적는다. 학생이 진짜로 눌러서 생긴 기록이라도 시험 계정·시연
 * 문항이면 그렇게 적는다 — 「새로 쓴 자료」라는 이유로 운영으로 올리지 않는다.
 * 관측의 출처(쟀는가·자기보고인가·안 쟀는가)는 항목마다 다르므로 여기가 아니라
 * `evidence` 에 남는다.
 */
export type PreviewProvenance = {
  /** 시험 계정·시험 저장소인가, 운영인가 */
  environment: 'test' | 'operational'
  /** 문항·자산이 시연인가, 저장소의 실제 자료인가, 운영 자료인가 */
  content: 'demo' | 'local_real' | 'operational'
}

const DEFAULT_PROVENANCE: PreviewProvenance = { environment: 'test', content: 'demo' }

export type OutcomesAfterHelp = {
  /** 확인 행동 — 낸 항목 수와 맞힌 수. 채점 기준이 없던 것은 `ungraded` */
  confirm: { attempted: number; correct: number; ungraded: number }
  /**
   * 도움 **뒤에** 낸 원문 제출의 마지막 채점. 없으면 null.
   * 「뒤」는 서버가 **시각을 견줘** 정한다 — client 가 보낸 단계 이름이 아니다.
   */
  sourceRetry: 'correct' | 'wrong' | null
  /** 그 순서를 서버가 확인했는가. 못 했으면 재풀이 성공으로 읽지 않는다 */
  orderVerified: boolean
  /** 도움을 연 적은 있는데 **무엇을 봤는지 못 쟀는가** */
  helpUnmeasured: boolean
}

export type FallbackTask = {
  taskRef: string
  label: string
  /** 서버가 확인한 열람 가능 여부. 열 수 없는 것은 애초에 넣지 않는다 */
  reachableByStudent: boolean
  /** 학생 화면에서 바로 갈 수 있는 길 */
  href: string
}

// ════════════════════════════════════════════════════════════════════
// 출력
// ════════════════════════════════════════════════════════════════════

export type ConfirmAction = {
  /** 영상 종류에 맞는 확인 행동 (040 §4 출력 요구) */
  label: string
  kind: 'apply_condition' | 'choose_start_strategy' | 'justify_step' | 'reviewed_problem'
  /**
   * 실제 제출 가능한 항목들 (R040-D). **반드시 1개 이상**이다 —
   * 검수된 항목이 없으면 `confirmAction` 자체를 `null` 로 둔다.
   */
  items: ConfirmActionItem[]
}

export type RecommendedAction = {
  kind: 'video_segment' | 'reviewed_asset' | 'teacher_async' | 'none'
  relationId: string | null
  contentRef: ApprovedRelation['contentRef'] | null
  segment?: ApprovedRelation['segment']
  /** 왜 이것을 골랐는가 */
  reason: string
  /** 고려했지만 뺀 것과 그 이유 */
  rejected: Array<{ relationId: string; why: string }>
  /**
   * `kind: 'teacher_async'` 일 때 **실제로** 갈 수 있는 다른 과제 (R040-D).
   * 빈 배열이면 대체 자산이 정말 없는 것이다. 문장으로 꾸미지 않는다.
   */
  fallbackTasks: FallbackTask[]
}

/**
 * 네 가지를 **따로** 읽는다. 하나로 합치거나 점수를 만들지 않는다.
 *
 * 특히 `mastery` 는 **언제나 null** 이다. 이 자료로는 숙달을 판정하지 않는다 —
 * 한 번 맞혔다는 것과 할 줄 안다는 것은 다른 말이고, 그 둘을 잇는 근거가 없다.
 */
export type OutcomeReadout = {
  /** 확인 행동을 맞혔는가. 낸 적이 없으면 null */
  confirmPassed: boolean | null
  /** 도움 뒤에 원문을 다시 맞혔는가. 그런 제출이 없으면 null */
  sourceSolvedAfterHelp: boolean | null
  /** 시간차를 두고 **다른 문항**으로 다시 확인했는가 */
  delayedRecheckPassed: boolean | null
  /** 숙달 — 판정하지 않는다 */
  mastery: null
  /** 왜 그렇게 읽으면 안 되는지. 화면·요약에 그대로 보인다 */
  notes: string[]
}

export type EvidenceSummary = {
  /** 기술적으로 **관측된** 것 */
  observed: string[]
  /**
   * 도움 뒤에 무엇이 됐는가 — **합치지 않고 따로** (042 §3-B).
   *
   * 041 의 `successAfterHelp: boolean | null` 한 칸을 대신한다. 그 칸은 지연 재확인만
   * 보느라, 확인 문제를 맞히고 원문도 다시 맞힌 학생에게 `null` 을 돌려줬다.
   */
  outcomes: OutcomeReadout
  /** **확정하지 않은** 것 */
  notClaimed: string[]
  /** 미확인 범위 */
  unknownScope: string[]
}

export type PreviewOutput = {
  schemaVersion: '0.1-draft.3-preview'
  /**
   * 합성·시연 쪽인가. **환경과 콘텐츠 둘 중 하나라도 운영이 아니면 true** 다.
   * 이 한 칸만 보고 운영으로 뒤집지 않는다 — 자세한 것은 `provenance` 를 본다.
   */
  synthetic: boolean
  /** 환경·콘텐츠를 따로 적은 것 (042 §1 결정 4) */
  provenance: PreviewProvenance
  resolvedStudentScope: string
  recommendedAction: RecommendedAction
  confirmAction: ConfirmAction | null
  /** 원문으로 돌아가는 길 또는 안전한 대체 */
  returnPath: 'back_to_source' | 'safe_alternative' | 'async_teacher'
  evidence: EvidenceSummary
  planDraft: {
    approvalState: 'draft'
    items: string[]
    recheckMethod: string
    rationaleEventIds: string[]
    /** 이미 승인된 계획을 **덮어쓰지 않는다** */
    overwritesApprovedPlan: false
  }
  teacherSummary: string
}

// ════════════════════════════════════════════════════════════════════
// 고르는 규칙
// ════════════════════════════════════════════════════════════════════

/**
 * 축 → **우선 후보** 역할. **배타 규칙이 아니다** (040 §4-1).
 * 목록에 없다고 금지가 아니다 — 아래 `scoreRelation` 이 축 밖에서도 고른다.
 *
 * ── 원장님 교육 방침 (2026-10-27 지시) ────────────────────────────
 *
 *   「개념영상보다 해당 문제 유형의 **대표예제 영상이 훨씬 좋다.**
 *    이 유형에서 생각해 풀어라. 그리고 **필요한 개념은 글로** 보여주고.」
 *
 *   그래서 바꾼 것
 *     · `type_demonstration`(대표예제·필수예제 풀이)을 **거의 모든 축에서 1순위**로
 *     · 개념은 `concept_card`(글)로 — 영상이 아니라
 *     · `concept_explanation`(개념영상)은 **선호 목록에서 뺐다.**
 *       금지가 아니다 — 다른 것이 없으면 여전히 쓰인다. 다만 먼저 고르지 않는다.
 *
 *   왜 「계산·검산」만 다른가: 계산에서 막혔을 때는 같은 개념의 **다른 문제**를
 *   풀어 보는 것이 접근법 영상보다 가깝다. 그래서 `reviewed_problem` 이 앞이다.
 *
 *   ⚠️ 이 표는 **학습 흐름**이다. 임의로 바꾸지 않는다 (AGENTS.md).
 *      바꾼 근거는 위 원장님 지시이고, GPT 에 결정으로 올렸다.
 */
const AXIS_PREFERENCE: Record<Axis, RelationKind[]> = {
  recall: ['type_demonstration', 'concept_card', 'theorem_proof'],
  goal: ['type_demonstration', 'reviewed_problem', 'concept_card'],
  condition: ['type_demonstration', 'concept_card', 'reviewed_problem'],
  formulate: ['type_demonstration', 'concept_card'],
  // ③ 표현 변환 · ⑥ 계산·검산 — **영상 금지 축이 아니다**. 선호가 약할 뿐이다
  represent: ['concept_card', 'type_demonstration', 'reviewed_problem'],
  compute: ['reviewed_problem', 'type_demonstration', 'concept_card'],
}

/**
 * 쓸 수 없는 관계를 걸러낸다. 걸러낸 **이유를 남긴다**.
 *
 * R040-C — 노출 판단은 **승인된 검수 기록**으로만 한다.
 *   - "증명 원문이면 완성 증명 금지" 같은 휴리스틱을 쓰지 않는다.
 *   - "구간이 붙어 있으면 안전" 도 쓰지 않는다.
 *   - 검수 범위(원문·목적·자산 판·구간)가 지금과 하나라도 다르면 **보류**한다.
 *     그래서 자산에 구간만 새로 붙이면 `segmentKey` 가 어긋나 다시 보류된다.
 *   - 검수 전 자산은 구간을 붙여도 `assetReviewed` 에서 먼저 막힌다.
 */
function disqualify(
  r: ApprovedRelation,
  taskGoal: PreviewInput['taskGoal'],
  problemRefId: string,
): string | null {
  if (!r.assetReviewed) return '자산 품질 검수 전'
  if (!r.relationReviewed) return '관계 적합성 검수 전'
  if (!r.reachableByStudent) return '학생이 열 수 없음 (과제로 배정되지 않음)'

  const rev = r.exposureReview
  if (rev === undefined || rev === null) return '노출 검수 기록 없음 — 보류'

  const want: ExposureScope = {
    problemRefId,
    taskGoal,
    assetVersion: r.assetVersion,
    segmentKey: segmentKeyOf(r.segment),
  }
  const mismatch: string[] = []
  if (rev.scope.problemRefId !== want.problemRefId) mismatch.push('원문')
  if (rev.scope.taskGoal !== want.taskGoal) mismatch.push('과제 목적')
  if (rev.scope.assetVersion !== want.assetVersion) mismatch.push('자산 판')
  if (rev.scope.segmentKey !== want.segmentKey) mismatch.push('구간')
  if (mismatch.length > 0) {
    return `노출 검수 범위가 지금과 다름 (${mismatch.join('·')}) — 보류`
  }

  if (rev.verdict === 'reveals') return '승인된 검수에서 이 원문의 답이 드러남'
  if (rev.verdict === 'unknown') return '노출 검수 결과가 미확인 — 보류'

  // 042 §3-C — 파일을 통째로 내려주면서 「구간만 보여 준다」를 보장으로 쓰지 않는다
  if (r.videoKind !== null && r.wholeDeliverySafe !== true) {
    return '영상 파일 전체를 내려주는데 전체 노출이 이 원문에 승인되지 않음'
  }

  // 확인 행동으로 실제 내놓을 항목이 없으면 라벨만 있는 도움이 된다 (R040-D)
  if (!Array.isArray(r.confirmItems) || r.confirmItems.length === 0) {
    return '확인 행동으로 낼 검수된 항목이 없음'
  }
  return null
}

/** 높을수록 먼저. 축 선호 + 구간 지정 여부 */
function scoreRelation(r: ApprovedRelation, axis: Axis | null): number {
  let s = 0
  if (axis !== null) {
    if (r.supportedAxes.includes(axis)) s += 10
    const pref = AXIS_PREFERENCE[axis].indexOf(r.relationKind)
    if (pref >= 0) s += 6 - pref
  }
  // 구간이 지정된 영상이 통째보다 낫다
  if (r.segment !== undefined) s += 2
  // 유형을 직접 겨냥한 시범이 가장 좁다
  if (r.relationKind === 'type_demonstration') s += 1
  return s
}

const CONFIRM_BY_RELATION: Record<RelationKind, Omit<ConfirmAction, 'items'>> = {
  concept_explanation: { kind: 'apply_condition', label: '적용 조건 구분 · 예와 반례' },
  type_demonstration: { kind: 'choose_start_strategy', label: '다른 조건의 문제에서 시작점·전략을 스스로 고르기' },
  theorem_proof: { kind: 'justify_step', label: '중간 단계의 근거 고르기 · 빠진 가정 찾기' },
  concept_card: { kind: 'apply_condition', label: '짧은 적용 한 문항' },
  reviewed_problem: { kind: 'reviewed_problem', label: '검수된 같은 개념의 문제 풀기' },
}

/**
 * 도움 뒤의 결과를 **넷으로 갈라** 읽는다 (042 §3-B).
 *
 * 지키는 선
 *   - 하나로 합치거나 점수를 만들지 않는다.
 *   - 순서를 서버가 확인하지 못했으면 「도움 뒤 성공」으로 읽지 않는다.
 *   - 무엇을 봤는지 못 쟀으면(`helpUnmeasured`) 재풀이 성공을 **도움 뒤 성공으로 승격하지 않는다.**
 *   - 숙달은 **언제나 판정하지 않는다.**
 *   - 「도움 덕분」이라는 인과를 어디에도 쓰지 않는다.
 */
function readOutcomes(
  after: OutcomesAfterHelp | undefined,
  delayed: PreviewInput['delayedRecheck'],
  helpUnmeasured: boolean,
): OutcomeReadout {
  const notes: string[] = []
  let confirmPassed: boolean | null = null
  let sourceSolvedAfterHelp: boolean | null = null

  if (after !== undefined && after.confirm.attempted > 0) {
    confirmPassed = after.confirm.correct > 0
    if (after.confirm.ungraded > 0) {
      notes.push(`확인 행동 ${after.confirm.ungraded}개는 채점 기준이 없어 결과를 세지 않았습니다`)
    }
  }

  if (after !== undefined && after.sourceRetry !== null) {
    if (!after.orderVerified) {
      notes.push('원문 재풀이가 도움보다 뒤인지 확인하지 못해 「도움 뒤 성공」으로 읽지 않았습니다')
    } else if (after.helpUnmeasured) {
      notes.push('도움을 열었다는 것만 알고 무엇을 봤는지는 못 쟀습니다. 재풀이 결과만 적습니다')
      sourceSolvedAfterHelp = null
    } else {
      sourceSolvedAfterHelp = after.sourceRetry === 'correct'
    }
  }

  if (helpUnmeasured) notes.push('도움 유무 미측정 — "안 받았다" 로 읽지 않습니다')
  notes.push('어느 항목도 「도움 때문에 늘었다」는 뜻이 아닙니다 — 원인은 재지 않았습니다')
  if (confirmPassed === true && sourceSolvedAfterHelp === true) {
    notes.push('확인 행동 통과와 원문 재풀이 성공은 **서로 다른 증거**입니다. 합쳐서 숙달로 읽지 않습니다')
  }

  return {
    confirmPassed,
    sourceSolvedAfterHelp,
    delayedRecheckPassed: delayed === undefined ? null : delayed.passed,
    mastery: null,
    notes,
  }
}

/** 숫자로 **관측된** 값인가. `undefined`·`null`·NaN 은 측정이 아니다 */
function measured(n: number | undefined | null): boolean {
  return typeof n === 'number' && Number.isFinite(n)
}

/**
 * 영상 관측을 **합치지 않고 따로** 적는다 (040 §4-4).
 * 한 점수로 만들지 않는다.
 *
 * R040-A — 값을 주지 않은 측정을 **0 으로 바꾸지 않는다.**
 * 실제로 0 이면 `0` 으로 적고, 값이 없으면 `unmeasured` 에 넣어 관측에서 뺀다.
 */
function describeVideoObservation(
  v: VideoObservation | undefined,
): { observed: string[]; unmeasured: string[] } {
  if (v === undefined) return { observed: [], unmeasured: [] }
  const observed: string[] = []
  const unmeasured: string[] = []
  if (v.method === 'window_elapsed') {
    if (measured(v.windowElapsedMs)) observed.push(`창 열림 ${v.windowElapsedMs}ms (재생·집중 아님)`)
    else unmeasured.push('창 열림 시간 (값 없음 — 0 으로 읽지 않습니다)')
    unmeasured.push('실제 재생·구간 (창 열림만 보는 옛 경로)')
  } else {
    if (measured(v.coveragePct)) observed.push(`재생 구간 ${v.coveragePct}%`)
    else unmeasured.push('재생 구간 비율')
    if (measured(v.coveredSeconds)) observed.push(`서로 다른 재생 ${v.coveredSeconds}초`)
    else unmeasured.push('서로 다른 재생 초')
    if (v.sceneSeconds !== undefined && v.sceneSeconds !== null) {
      observed.push(`장면별 재생 ${JSON.stringify(v.sceneSeconds)}`)
    } else unmeasured.push('장면별 재생 초')
    if (measured(v.focusLostSeconds)) {
      observed.push(`탭 전환 중 재생 ${v.focusLostSeconds}초 (**집중도 아님**)`)
    } else unmeasured.push('탭 전환 중 재생 초')
    if (v.completed === true) observed.push('시청 완료 표시됨 (이해 완료 아님)')
    else if (v.completed === undefined || v.completed === null) unmeasured.push('시청 완료 여부')
  }
  return { observed, unmeasured }
}

// ════════════════════════════════════════════════════════════════════
// 본체
// ════════════════════════════════════════════════════════════════════

export function previewNextAction(input: PreviewInput): PreviewOutput {
  const rejected: RecommendedAction['rejected'] = []
  const usable: ApprovedRelation[] = []

  for (const r of input.relations) {
    if (r.typeCode !== input.typeCode) {
      rejected.push({ relationId: r.relationId, why: '다른 유형' })
      continue
    }
    const bad = disqualify(r, input.taskGoal, input.problemRef.id)
    if (bad !== null) { rejected.push({ relationId: r.relationId, why: bad }); continue }
    usable.push(r)
  }
  const fallbackTasks = (input.availableFallbackTasks ?? []).filter((t) => t.reachableByStudent)

  usable.sort((a, b) => scoreRelation(b, input.stuck.axis) - scoreRelation(a, input.stuck.axis))
  const best = usable.length > 0 ? usable[0] : null

  let action: RecommendedAction
  let returnPath: PreviewOutput['returnPath']
  let confirm: ConfirmAction | null = null

  if (best === null) {
    // 040 §4-2 — 학습 전체를 멈추지 않는다.
    // R040-D — 다만 **실제로 열리는 과제가 있을 때만** 그렇게 말한다
    action = {
      kind: 'teacher_async', relationId: null, contentRef: null,
      reason: fallbackTasks.length > 0
        ? `쓸 수 있는 승인된 도움이 없습니다. 비동기 교사 신호로 넘기고, 이미 열려 있는 과제 ${fallbackTasks.length}개로 돌아갑니다`
        : '쓸 수 있는 승인된 도움이 없고, 지금 열려 있는 다른 과제도 없습니다 (대체 자산 없음)',
      rejected,
      fallbackTasks,
    }
    returnPath = 'async_teacher'
  } else {
    const isVideo = best.videoKind !== null
    action = {
      kind: isVideo ? 'video_segment' : 'reviewed_asset',
      relationId: best.relationId,
      contentRef: best.contentRef,
      segment: best.segment,
      reason: input.stuck.axis === null
        ? '막힌 축이 관측되지 않아 유형에 가장 가까운 승인된 도움을 골랐습니다'
        : `관측된 막힘(${input.stuck.axis})을 지원하는 승인된 관계 중 가장 가까운 것입니다`,
      rejected,
      fallbackTasks,
    }
    returnPath = 'back_to_source'
    // disqualify 가 빈 confirmItems 를 이미 걸렀으므로 여기선 1개 이상이다
    confirm = { ...CONFIRM_BY_RELATION[best.relationKind], items: best.confirmItems! }
  }

  // ── 근거 요약 — 관측과 **확정하지 않은 것**을 나눈다 ──────────────
  const observed: string[] = []
  if (input.stuck.axis !== null) observed.push(`막힌 것으로 보이는 축: ${input.stuck.axis}`)
  if (input.stuck.repeatedMisconceptions !== null) {
    observed.push(`같은 오개념 반복 ${input.stuck.repeatedMisconceptions}회`)
  }
  const videoSeen = describeVideoObservation(input.videoObservation)
  observed.push(...videoSeen.observed)
  if (input.delayedRecheck !== undefined) {
    observed.push(
      `지연 재확인 ${input.delayedRecheck.delayDays}일 뒤 ` +
      `${input.delayedRecheck.differentItem ? '다른 문항' : '같은 문항'} ` +
      `${input.delayedRecheck.passed ? '통과' : '실패'}`,
    )
  }

  const helpUnmeasured = input.stuck.helpObserved === 'unmeasured'
  const after = input.outcomesAfterHelp
  const outcomes = readOutcomes(after, input.delayedRecheck, helpUnmeasured)
  if (after !== undefined) {
    if (after.confirm.attempted > 0) {
      observed.push(
        `확인 행동 ${after.confirm.attempted}개 제출 · ${after.confirm.correct}개 맞음`
        + (after.confirm.ungraded > 0 ? ` · ${after.confirm.ungraded}개는 채점 기준 없음` : ''),
      )
    }
    if (after.sourceRetry !== null && after.orderVerified) {
      observed.push(`도움 뒤 원문 재풀이 ${after.sourceRetry === 'correct' ? '정답' : '오답'}`)
    }
  }

  const notClaimed = ['독립 해결', '유형 숙달', '이해 완료', '학습 성향', '도움이 원인이라는 것']
  const unknownScope: string[] = []
  if (helpUnmeasured) unknownScope.push('도움 유무 미측정 — "안 받았다" 로 읽지 않습니다')
  // R040-A — 값이 없던 측정은 전부 여기로 온다. observed 에는 들어가지 않는다
  unknownScope.push(...videoSeen.unmeasured)
  if (input.stuck.axis === null) unknownScope.push('막힌 축 미관측')
  unknownScope.push('문항별 풀이시간 미측정')

  // ── 계획 draft — 승인 경계를 넘지 않고, **끝낸 일은 다시 시키지 않는다** ──
  const items: string[] = []
  if (action.kind === 'video_segment' || action.kind === 'reviewed_asset') {
    // 042 §3-B — 이미 한 일을 「해야 할 일」로 또 적지 않는다
    const sawHelp = input.stuck.helpObserved !== 'unmeasured' && input.stuck.helpObserved !== 'none'
    const confirmDone = after !== undefined && after.confirm.attempted > 0
    const solved = outcomes.sourceSolvedAfterHelp === true

    if (!sawHelp) items.push(`${action.contentRef!.kind} ${action.contentRef!.id} 로 보완`)
    else items.push(`(완료) ${action.contentRef!.kind} ${action.contentRef!.id} 를 열었습니다`)

    if (confirm !== null) {
      if (!confirmDone) items.push(`확인 행동: ${confirm.label} (항목 ${confirm.items.length}개)`)
      else if (outcomes.confirmPassed === true) items.push(`(완료) 확인 행동을 맞혔습니다`)
      else items.push(`확인 행동 다시: ${confirm.label} — 아직 맞히지 못했습니다`)
    }

    if (!solved) items.push('원문으로 복귀')
    else {
      items.push('(완료) 도움 뒤 원문을 다시 풀어 맞혔습니다')
      // 여기서 멈추지 않는다. **남은 일**은 시간차 재확인이다
      items.push('남은 일: 시간차를 두고 다른 문항으로 다시 확인 (아직 안 함)')
    }
  } else {
    // R040-D — 실제 경로가 있을 때만 "다른 과제" 라고 쓴다
    if (fallbackTasks.length > 0) {
      for (const t of fallbackTasks) items.push(`다른 과제 계속: ${t.label} (${t.taskRef})`)
    } else {
      items.push('대체 자산 없음 — 지금 열 수 있는 다른 과제가 없습니다')
    }
    items.push('교사 비동기 확인 요청')
  }

  // 강사가 **읽을 한 줄**. 입력을 요구하지 않는다 (040 §4-6).
  // 042 §3-B — 결과를 셋으로 갈라 적고, 인과·숙달은 쓰지 않는다
  const yn = (b: boolean | null, y: string, n: string, none: string): string =>
    b === null ? none : (b ? y : n)
  const prov = input.provenance ?? DEFAULT_PROVENANCE
  const envLabel = prov.environment === 'test' ? '시험환경' : '운영환경'
  const contentLabel = prov.content === 'demo' ? '시연콘텐츠'
    : prov.content === 'local_real' ? '로컬실제자료' : '운영콘텐츠'
  const teacherSummary =
    `[${envLabel}·${contentLabel}] ${input.typeCode} · ` +
    (input.stuck.axis === null ? '막힌 축 미관측' : `막힘 ${input.stuck.axis}`) +
    ` · 도움관측 ${input.stuck.helpObserved}` +
    ` → ${action.kind}` +
    ` · 확인행동 ${yn(outcomes.confirmPassed, '맞음', '아직 못 맞힘', '아직 안 냄')}` +
    ` · 도움 뒤 원문 ${yn(outcomes.sourceSolvedAfterHelp, '정답', '오답', '해당 제출 없음')}` +
    ` · 시간차 재확인 ${yn(outcomes.delayedRecheckPassed, '통과', '실패', '아직 안 함')}` +
    ' · 숙달은 판정하지 않았습니다' +
    (helpUnmeasured ? ' · 도움 미측정이라 독립 해결로 읽지 않았습니다' : '') +
    '. 계획은 draft 이고 승인 전에는 학생에게 적용되지 않습니다.'

  return {
    schemaVersion: '0.1-draft.3-preview',
    synthetic: prov.environment !== 'operational' || prov.content !== 'operational',
    provenance: prov,
    resolvedStudentScope: input.resolvedStudentScope,
    recommendedAction: action,
    confirmAction: confirm,
    returnPath,
    evidence: { observed, outcomes, notClaimed, unknownScope },
    planDraft: {
      approvalState: 'draft',
      items,
      recheckMethod: '시간차 + 다른 문항',
      rationaleEventIds: input.stuck.evidenceEventIds,
      overwritesApprovedPlan: false,
    },
    teacherSummary,
  }
}

// ════════════════════════════════════════════════════════════════════
// 중복·충돌 판정 — 040 §3-A. **다른 학생은 절대 섞지 않는다**
// ════════════════════════════════════════════════════════════════════

export type ClientEvent = Record<string, unknown>

/** 서버가 붙이는 값. **의미 비교에서 뺀다** */
export const SERVER_ENVELOPE_FIELDS = [
  'received_at', 'ingest_node', 'retry_count', 'authz_recheck_at',
] as const

export type EventEnvelope = {
  /** **서버가 확정한** 학생 범위. client 값이 아니다 */
  resolvedStudentScope: string
  /** **서버가 검증한** 생성 트랙. client 자유문자열을 믿지 않는다 */
  validatedProducer: string
  eventId: string
  clientEvent: ClientEvent
}

export type DedupVerdict =
  | { verdict: 'duplicate'; reason: string }
  | { verdict: 'conflict'; reason: string; changedFields: string[] }
  | { verdict: 'distinct'; reason: string }
  | { verdict: 'rejected'; reason: string }

/** 논리 중복 키 — `(학생 범위, 생성 트랙, event_id)` (040 §3-A-3) */
export function dedupKey(e: EventEnvelope): string {
  return `${e.resolvedStudentScope}\u0000${e.validatedProducer}\u0000${e.eventId}`
}

/**
 * **집합**으로 정의한 배열 칸 (039 계약). 순서·중복이 의미를 바꾸지 않는다.
 * 이름이 같으면 중첩 안쪽에서도 집합으로 본다.
 */
const SET_LIKE_ARRAY_KEYS: string[] = ['unmeasured']

/**
 * **순서가 의미인** 배열 칸. 절대 정렬하지 않는다 (040 리뷰 §3 R040-B).
 * 여기 적어 두는 것은 실수로 집합 목록에 들어가지 않게 하려는 것이다.
 */
export const ORDERED_ARRAY_KEYS: string[] = ['content_refs', 'items', 'steps']

/**
 * 비교용 정규형 (R040-B).
 *
 *   - 객체 키 **순서는 의미가 없다** → 키를 정렬한다.
 *   - 배열 **순서는 기본적으로 의미다** → 그대로 둔다.
 *   - `SET_LIKE_ARRAY_KEYS` 의 배열만 집합으로 본다 → 정렬하고 중복을 없앤다.
 *
 * 범용 해시 플랫폼이 아니라 지금 쓰는 JSON 계약 범위의 비교다.
 */
function canonical(v: unknown, keyName: string | null): unknown {
  if (Array.isArray(v)) {
    const items = v.map((x) => canonical(x, null))
    if (keyName !== null && SET_LIKE_ARRAY_KEYS.includes(keyName)) {
      const seen = new Set<string>()
      const uniq: unknown[] = []
      for (const it of items) {
        const s = JSON.stringify(it)
        if (seen.has(s)) continue
        seen.add(s)
        uniq.push(it)
      }
      return uniq.sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? -1 : 1))
    }
    return items
  }
  if (v !== null && typeof v === 'object') {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) out[k] = canonical(o[k], k)
    return out
  }
  return v
}

function meaningfulDiff(a: ClientEvent, b: ClientEvent): string[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const diff: string[] = []
  for (const k of keys) {
    if ((SERVER_ENVELOPE_FIELDS as readonly string[]).includes(k)) continue
    if (JSON.stringify(canonical(a[k], k)) !== JSON.stringify(canonical(b[k], k))) diff.push(k)
  }
  return diff.sort()
}

/**
 * 두 이벤트를 견준다.
 *
 * **학생 범위가 다르면 같은 기록으로 합치지 않는다** — `event_id` 가 같아도 그렇다.
 * 그리고 다른 학생의 기록을 정정·재전송하려는 요청은 **거부**한다 (040 §3-A-4).
 *
 * ⚠️ 호출 전에 서버가 **이미** `resolvedStudentScope` 와 `validatedProducer` 를 확정해야 한다.
 * 이 함수가 문자열을 받는다는 사실은 인가가 구현됐다는 증거가 아니다 (040 리뷰 §3 R040-B).
 * 운영 경로의 인가는 `lib/learning/session.ts` 에서 한다.
 */
export function compareEvents(prev: EventEnvelope, next: EventEnvelope): DedupVerdict {
  if (prev.resolvedStudentScope !== next.resolvedStudentScope) {
    // 같은 event_id 를 다른 학생이 보냈다 — 합치지도, 내용을 알려주지도 않는다
    const corrects = next.clientEvent['corrects_event_id']
    if (corrects !== undefined && corrects !== null) {
      return {
        verdict: 'rejected',
        reason: '다른 학생의 기록을 정정하려는 요청입니다. 권한 경계에서 거부합니다',
      }
    }
    return {
      verdict: 'distinct',
      reason: '학생 범위가 다릅니다. 같은 event_id 라도 별개 기록입니다',
    }
  }
  if (prev.validatedProducer !== next.validatedProducer) {
    return { verdict: 'distinct', reason: '검증된 생성 트랙이 다릅니다' }
  }
  if (prev.eventId !== next.eventId) {
    return { verdict: 'distinct', reason: 'event_id 가 다릅니다' }
  }
  const diff = meaningfulDiff(prev.clientEvent, next.clientEvent)
  if (diff.length === 0) {
    return { verdict: 'duplicate', reason: '의미 payload 가 같습니다. 1회만 반영합니다' }
  }
  return {
    verdict: 'conflict',
    reason: '같은 id 인데 의미 내용이 다릅니다. 자동 병합하지 않고 둘 다 보존합니다',
    changedFields: diff,
  }
}

/**
 * 필수 필드 검증 — **누락을 "해당 없음" 으로 바꾸지 않는다** (040 §3-B).
 *
 * 돌려주는 모양은 **판별 유니온이 아니다** (`strictNullChecks` 꺼짐, AGENTS.md 함정 3).
 */
export function validateRequired(
  e: ClientEvent,
  required: string[],
): { ok: boolean; missing: string[] } {
  const missing = required.filter((k) => !(k in e))
  return { ok: missing.length === 0, missing }
}

/**
 * 학생이 보낸 자기보고를 **서버 판단으로 승격하지 않는다** (040 §3-C).
 * 출처를 갈라 돌려준다.
 */
export function separateClaims(e: ClientEvent): {
  studentReported: unknown
  serverDerived: null
  note: string
} {
  return {
    studentReported: (e['interpretation'] as { claims?: unknown } | undefined)?.claims ?? null,
    serverDerived: null,
    note: '학생 자기보고입니다. 서버의 숙달·계획 판단으로 쓰지 않습니다',
  }
}
