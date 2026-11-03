/**
 * 학습 한 바퀴를 **엮는 곳** — GPT-EXEC-041 · 042 §3-A · **045 §3 으로 의존성을 갈라냄**
 *
 * 045 에서 달라진 것 — 가장 중요하다
 *   043·044 까지 이 파일은 `catalog.ts` 의 **상수**와 `testStore()` 를 직접 불렀다.
 *   그래서 043 §3-A·§3-B 로 만들어 둔 운영 provider 가 **실제 학습 경로에 닿지 않았다.**
 *   GPT 가 route 를 직접 호출해 그 사실을 짚었다 (GPT_REVIEW_043_044 §6). 맞는 지적이다.
 *
 *   이제 이 파일은 **`catalog.ts` 도 `testStore()` 도 import 하지 않는다.**
 *   쓸 것은 `deps.ts` 가 모드에 맞게 끼워 준다 (`local_demo` → 시연 상수·파일 저장소,
 *   `operational` → 운영 조회·RPC). demo 보호를 없앤 것이 아니라 **갈라 끼운** 것이다.
 *
 * 042 §3-A 의 순서 — **이 차례를 지킨다**
 *   ① 서버가 학생·producer·과제·문항 **접근 범위를 먼저 확정**한다
 *   ② 같은 `actionId` 가 이미 있는지 보고 **중복·충돌을 판정**한다
 *   ③ **새 행동일 때만** 시도·계획을 바꾼다
 *   ④ 이벤트·시도·계획을 **한 번에** 확정한다 (중간에 던지면 아무것도 안 남는다)
 *
 *   ②~④ 는 저장소 안에서 한 덩어리로 끝난다 (`store.commit`). 파일이면 `transact`,
 *   운영이면 `apply_learning_action` RPC 한 번이다. 엔진은 어느 쪽인지 모른다.
 *
 * 왜 콘텐츠를 **먼저 다 읽는가**
 *   파일 저장소의 한 덩어리 쓰기는 동기이고 운영 조회는 비동기다. 그래서 판정에 쓸
 *   콘텐츠를 `deps.content` 장면으로 **미리 받아 둔다.** 판정 로직은 동기로 남는다.
 */
import {
  previewNextAction, compareEvents, dedupKey,
  type PreviewInput, type PreviewOutput, type FallbackTask,
  type OutcomesAfterHelp, type OutcomeReadout, type ApprovedRelation,
} from '@/lib/twin/learningPreview'

import { COMPLETE_PCT, mergeRanges } from '@/lib/lessonVideos'

import { forStudent, type ProblemForStudent } from './catalog'
import {
  resolveLearningDeps,
  type ContentSnapshot, type LearningActionStore, type LearningDeps, type SourceKind,
} from './deps'
import { sourceOfTaskId } from './supabaseStore'
import {
  AXES, emptyAttempt, epochOf, isAfterHelp, summarize,
  type AttemptRow, type AttemptSummary, type AxisCode, type ConfirmSubmission,
  type PlanDraftRow, type StoredEvent, type StudentRow, type TaskRow,
  type VideoObservationRecord,
} from './contract'

// 041~044 의 화면·시험이 이 이름들을 엔진에서 가져간다. 자리만 옮겼다
export { ensureDemoSeeded as ensureSeeded, SEED_LOGIN_CODES } from './demoDeps'

// ════════════════════════════════════════════════════════════════════
// 학생 화면이 보는 상태
// ════════════════════════════════════════════════════════════════════

export type TaskView = {
  taskId: string
  label: string
  typeCode: string
  typeTitle: string
  chapter: string
  /** 유형 코드·이름의 출처. 화면에 그대로 표시한다 */
  typeProvenance: string
  problems: Array<{
    problem: ProblemForStudent
    /**
     * 원문 그림의 **서명된 임시 주소**. 그림이 없거나 서명을 못 했으면 `null`.
     * 저장소 경로는 학생에게 보내지 않는다 (045 §3)
     */
    imageUrl: string | null
    attempt: AttemptRow | null
    summary: AttemptSummary | null
  }>
}

export type StateView = {
  student: { studentId: string; displayName: string }
  storage: { backend: string; location: string }
  /** 콘텐츠 출처 설명. 모드마다 다르다 */
  catalogNote: string
  /** 지금 어느 모드로 돌고 있는가. 화면에 그대로 적는다 — 섞어 보고하지 않는다 */
  mode: LearningDeps['mode']
  contentSource: ContentSnapshot['source']
  /** 계획 초안을 **실제로 저장하는가** (운영에는 표가 없다) */
  planDraftPersisted: boolean
  tasks: TaskView[]
}

function typeViewOf(content: ContentSnapshot, code: string) {
  const info = content.typeLabel(code)
  return {
    title: info.title,
    chapter: info.chapter,
    provenance: info.provenance === 'local_real'
      ? '실제 로컬 자료 (PILOT_TYPES_014.json)'
      : (info.provenance === 'operational' ? '운영 조회 (standard_types)' : '시연'),
  }
}

export async function buildState(student: StudentRow, deps?: LearningDeps): Promise<StateView> {
  const d = deps ?? await resolveLearningDeps()
  const tasks = await d.store.listAssignedTasks(student.studentId)
  const views: TaskView[] = []
  for (const t of tasks) {
    const info = typeViewOf(d.content, t.typeCode)
    const problems: TaskView['problems'] = []
    for (const pid of t.problemIds) {
      const p = d.content.problemById(pid)
      if (p === null) continue
      const attempt = await d.store.findAttempt(student.studentId, t.taskId, pid)
      problems.push({
        // 정답·해설 경로·저장소 경로는 **허용 목록**에서 빠진다 (045 §3 · R045-04 §7.1)
        problem: forStudent(p),
        imageUrl: d.content.problemImageUrl(pid),
        attempt,
        summary: attempt === null ? null : summarize(attempt),
      })
    }
    views.push({
      taskId: t.taskId, label: t.label, typeCode: t.typeCode,
      typeTitle: info.title, chapter: info.chapter,
      typeProvenance: info.provenance,
      problems,
    })
  }
  return {
    student: { studentId: student.studentId, displayName: student.displayName },
    storage: { backend: d.store.backend, location: d.store.location },
    catalogNote: d.content.note,
    mode: d.mode,
    contentSource: d.content.source,
    planDraftPersisted: d.store.planDraftPersisted,
    tasks: views,
  }
}

// ════════════════════════════════════════════════════════════════════
// 행동 적용 — 042 §3-A 의 본체
// ════════════════════════════════════════════════════════════════════

export type Action =
  | { kind: 'open' }
  | { kind: 'answer'; answer: string }
  | { kind: 'stuck'; axis: AxisCode | null }
  | { kind: 'help'; relationId: string; observation: VideoObservationRecord }
  | { kind: 'confirm'; itemRef: string; answer: string }

export type ApplyInput = {
  /** **세션에서 온** 학생. 요청 본문의 학생 id 는 쓰지 않는다 */
  student: StudentRow
  taskId: string
  problemId: string
  actionId: string
  occurredAt: string
  action: Action
}

export type ApplyResult = {
  verdict: 'applied' | 'duplicate' | 'conflict' | 'rejected'
  reason: string
  changedFields: string[]
  /** 적용 뒤(중복이면 기존 그대로) 시도. 거부면 null */
  attempt: AttemptRow | null
  summary: AttemptSummary | null
  /** 채점 결과. 기준이 없거나 **읽을 수 없는 입력**이면 null */
  graded: 'correct' | 'wrong' | null
  gradedNote: string | null
  /** 계획 초안이 바뀌었으면 */
  planDraft: PlanDraftRow | null
}

const DENY = (reason: string): ApplyResult => ({
  verdict: 'rejected', reason, changedFields: [],
  attempt: null, summary: null, graded: null, gradedNote: null, planDraft: null,
})

/** ISO 시각인가. 아니면 받지 않는다 — 발생시각은 의미값이다 */
function validTime(s: string): boolean {
  if (typeof s !== 'string' || s.length < 20) return false
  const t = Date.parse(s)
  return Number.isFinite(t)
}

/**
 * 승인 구간 **밖**을 잘라낸다 (042 §3-C).
 *
 * 화면도 구간을 지키지만 그것만 믿지 않는다 — 요청은 누구나 만들 수 있다.
 * 승인 구간과 실제로 본 구간의 **교집합**만 남기고, 본 초·비율을 거기서 다시 센다.
 * 자르고 나서 남는 것이 없으면 「미측정」으로 둔다. 0 으로 채우지 않는다.
 */
function clampToSegment(
  o: VideoObservationRecord,
  seg: { startSeconds: number; endSeconds: number } | undefined,
): VideoObservationRecord {
  if (o.method !== 'player_coverage' || o.watchedRanges === undefined) return o
  const lo = seg === undefined ? 0 : seg.startSeconds
  const hi = seg === undefined ? Number.POSITIVE_INFINITY : seg.endSeconds

  const inside: Array<[number, number]> = []
  for (const [a, b] of o.watchedRanges) {
    const s = Math.max(a, lo)
    const e = Math.min(b, hi)
    if (e > s) inside.push([s, e])
  }
  const merged = mergeRanges(inside)
  const covered = Math.round(merged.reduce((t, [a, b]) => t + (b - a), 0))

  const out: VideoObservationRecord = { ...o, watchedRanges: merged }

  // 042 §2-C (R042-03) — 「봤다」는 **학생이 보낸 주장**이고, 「봤음」은 **서버 계산**이다.
  // 둘을 갈라 둔다. 그래야 승인 구간 밖만 보냈는데 완료가 살아남는 일이 없다.
  out.completedClaimed = o.completed
  delete out.completed

  if (merged.length === 0) {
    // 승인 구간 밖만 봤다 — 본 것이 없다고 적는다 (0 이 아니라 「측정값 없음」)
    delete out.watchedRanges
    delete out.coveragePct
    delete out.coveredSeconds
    delete out.sceneSeconds
    return out
  }

  out.coveredSeconds = covered
  if (seg !== undefined) {
    const span = seg.endSeconds - seg.startSeconds
    out.coveragePct = span > 0 ? Math.min(100, Math.round((covered / span) * 1000) / 10) : 0
    // 완료는 **유효 구간과 정해진 기준**(COMPLETE_PCT)으로 서버가 센다
    out.completed = out.coveragePct >= COMPLETE_PCT
  }
  // 구간을 모르면 완료를 **확정하지 않는다.** `completed` 를 비워 둔다 (미확인)

  // 탭 전환 초는 **반복 재생을 포함한 숨김 탭 재생시간**이고,
  // `coveredSeconds` 는 **서로 다른 구간의 길이**다. 같은 척도가 아니다.
  // 같은 10초를 숨긴 채 두 번 보면 20초가 정상이다 — 줄이거나 거절하지 않는다.
  // 총 재생(`playedSeconds`)을 알 때만 그것을 넘지 못하게 깎는다
  if (out.focusLostSeconds !== undefined && out.playedSeconds !== undefined
      && out.focusLostSeconds > out.playedSeconds) {
    out.focusLostSeconds = out.playedSeconds
  }
  return out
}

/** 관측에서 **빠진** 칸 이름. 0 으로 채우는 대신 여기에 적는다 (R040-A) */
export function unmeasuredOf(o: VideoObservationRecord): string[] {
  const out: string[] = []
  if (o.method === 'player_coverage') {
    if (o.coveragePct === undefined) out.push('coverage_pct')
    if (o.coveredSeconds === undefined) out.push('covered_seconds')
    if (o.focusLostSeconds === undefined) out.push('focus_lost_seconds')
    if (o.sceneSeconds === undefined) out.push('scene_seconds')
    if (o.completed === undefined) out.push('completed')
  } else {
    if (o.windowElapsedMs === undefined) out.push('window_elapsed_ms')
    out.push('coverage_pct', 'covered_seconds')
  }
  return out.sort()
}

/**
 * 이벤트의 **의미 payload**. 서버 수신시각은 넣지 않는다.
 *
 * 045 §3 (R045-04 §7.2) 로 달라진 것 — **도움 기록**
 *   전에는 `relation_ref` 와 `observed` 만 넣었다. 그래서 되읽을 때 자산·구간이
 *   없어 `''`·`'full'` 로 **만들어** 복원됐다. 이제 도움 시점에 서버가 확정한
 *   `content_ref`·`segment_key`·`asset_version` 을 **payload 에 적는다** — 그 값이
 *   불변 근거다.
 *   그리고 학생 **원요청**(`observed_requested`)과 서버가 **잘라 검증한 관측**
 *   (`observed_verified`)을 **따로** 적는다. 되읽을 때 상태로 쓰는 것은 검증한 쪽뿐이고,
 *   중복 판정은 원요청 그대로 비교된다 (같은 요청을 다시 보내면 같은 지문이다).
 */
type HelpDecision = {
  relationId: string
  contentRefId: string
  assetVersion: number
  segmentKey: string
  segment: { startSeconds: number; endSeconds: number } | undefined
  verified: VideoObservationRecord
}

function payloadOf(
  input: ApplyInput, help: HelpDecision | null,
): Record<string, unknown> {
  const base = {
    schema_version: '0.2-draft.1',
    occurred_at: input.occurredAt,
    task_ref: input.taskId,
    problem_ref: input.problemId,
  }
  const a = input.action
  if (a.kind === 'answer') {
    // 042 §2-B (R042-02) — `after_help` 는 **원요청의 뜻이 아니라 이력 해석**이다.
    // 지문에 넣으면 늦게 도착한 도움 때문에 **같은 요청을 다시 보냈을 때 충돌**이 난다.
    // 지문에서 빼고, 도움 뒤 여부는 관측 이력에서 그때그때 계산한다.
    return { ...base, event_type: 'problem_answered', answer: a.answer }
  }
  if (a.kind === 'stuck') {
    return { ...base, event_type: 'stuck_reported', stuck_axis: a.axis,
             unmeasured: a.axis === null ? ['stuck_axis'] : [] }
  }
  if (a.kind === 'help') {
    if (help === null) throw new Error('도움 결정 없이 payload 를 만들 수 없습니다')
    return {
      ...base,
      event_type: 'help_opened',
      relation_ref: help.relationId,
      // 도움 시점의 **자산·판·승인 구간**. 빈 값으로 복원되지 않게 여기 적는다
      content_ref: help.contentRefId,
      asset_version: help.assetVersion,
      segment_key: help.segmentKey,
      observation_method: a.observation.method,
      // 학생이 **보낸** 것 (중복 판정의 지문이자 감사 기록)
      observed_requested: { ...a.observation },
      // 서버가 승인 구간으로 **잘라 확인한** 것 (상태로 쓰는 값)
      observed_verified: { ...help.verified },
      unmeasured: unmeasuredOf(help.verified),
    }
  }
  if (a.kind === 'confirm') {
    return { ...base, event_type: 'confirm_submitted', item_ref: a.itemRef, answer: a.answer }
  }
  return { ...base, event_type: 'attempt_opened' }
}

/**
 * 행동 하나를 적용한다.
 *
 * ①범위 확정 → ②중복·충돌 판정 → ③새 행동일 때만 상태 변경 → ④한 번에 확정.
 * ②~④ 는 `store.commit` 안에서 한 덩어리다.
 */
export async function applyAction(input: ApplyInput, deps?: LearningDeps): Promise<ApplyResult> {
  const d = deps ?? await resolveLearningDeps()

  // ── ① 범위 확정 — 여기서 막히면 **콘텐츠를 읽지도 저장하지도 않는다** ────
  if (typeof input.actionId !== 'string' || input.actionId.length < 8) {
    return DENY('행동 식별자가 없습니다')
  }
  if (!validTime(input.occurredAt)) return DENY('행동 발생시각이 없거나 모양이 아닙니다')

  const tasks = await d.store.listAssignedTasks(input.student.studentId)
  const task = tasks.find((t) => t.taskId === input.taskId)
  // 남의 과제인지 없는 과제인지 **구별해 알려주지 않는다**
  if (task === undefined) return DENY('배정된 과제가 아닙니다')
  if (!task.problemIds.includes(input.problemId)) return DENY('이 과제의 문항이 아닙니다')

  const problem = d.content.problemById(input.problemId)
  if (problem === null) return DENY('문항을 찾을 수 없습니다')

  const scope = input.student.studentId
  const now = new Date().toISOString()
  const saved = await d.store.findAttempt(scope, input.taskId, input.problemId)
  const attempt = saved ?? emptyAttempt(
    `att-${scope}-${input.taskId}-${input.problemId}`, scope, input.taskId, input.problemId, now,
  )

  // ── 판정 — 상태를 바꾸지 않고 **무엇을 쓸지** 정한다 ──────────────────
  let graded: 'correct' | 'wrong' | null = null
  let gradedNote: string | null = null
  let help: HelpDecision | null = null
  const env = { actionId: input.actionId, occurredAt: input.occurredAt }
  const a = input.action
  let mutate: (row: AttemptRow) => void = () => {}

  if (a.kind === 'answer') {
    const out = d.content.gradeProblem(input.problemId, a.answer)
    graded = out.result
    gradedNote = out.result === null ? out.why : null
    const g = graded
    mutate = (row) => { row.answers.push({ ...env, answer: a.answer, graded: g }) }
  } else if (a.kind === 'stuck') {
    const axis = a.axis !== null && AXES.includes(a.axis) ? a.axis : null
    mutate = (row) => { row.stuckReports.push({ ...env, axis }) }
  } else if (a.kind === 'help') {
    const rels = d.content.relationsFor(input.problemId)
    const chosen = chooseRelation(input.student, attempt, rels, tasks, d.content)
    // 열람 가능 여부를 **client 가 보낸 값으로 정하지 않는다** (R040-C)
    if (chosen.preview.recommendedAction.relationId !== a.relationId) {
      const why = chosen.preview.recommendedAction.rejected.find((r) => r.relationId === a.relationId)
      return DENY(why === undefined
        ? '서버가 이 학습에 승인하지 않은 자료입니다'
        : `열 수 없습니다: ${why.why}`)
    }
    const rel = rels.find((r) => r.relationId === a.relationId)
    const seg = chosen.preview.recommendedAction.segment
    if (rel === undefined) return DENY('서버가 이 학습에 승인하지 않은 자료입니다')
    help = {
      relationId: a.relationId,
      contentRefId: rel.contentRef.id,
      assetVersion: rel.contentRef.version,
      segmentKey: seg === undefined ? 'full' : `${seg.startSeconds}-${seg.endSeconds}`,
      segment: seg,
      // 042 §3-C — 화면이 구간을 지켰다고 **믿지 않는다.** 서버가 다시 자른다
      verified: clampToSegment(a.observation, seg),
    }
    const h = help
    mutate = (row) => {
      row.helpOpened.push({
        ...env,
        relationId: h.relationId,
        contentRefId: h.contentRefId,
        segmentKey: h.segmentKey,
        observation: h.verified,
      })
    }
  } else if (a.kind === 'confirm') {
    const rels = d.content.relationsFor(input.problemId)
    const chosen = chooseRelation(input.student, attempt, rels, tasks, d.content)
    const item = (chosen.preview.confirmAction?.items ?? []).find((x) => x.itemRef === a.itemRef)
    if (item === undefined) return DENY('이 학습에 승인된 확인 항목이 아닙니다')
    const out = d.content.gradeConfirmItem(a.itemRef, a.answer)
    graded = out.result
    gradedNote = out.result === null ? out.why : null
    const g = graded
    const origin = item.origin
    mutate = (row) => {
      row.confirmSubmissions.push({ ...env, itemRef: a.itemRef, answer: a.answer, graded: g, origin })
    }
  }

  const payload = payloadOf(input, help)
  const src: { sourceKind: SourceKind; sourceRef: string | null } =
    d.content.source === 'demo'
      ? { sourceKind: 'standalone', sourceRef: input.taskId }
      : sourceOfTaskId(input.taskId)

  // ── ②~④ 저장소 안에서 한 덩어리로 ────────────────────────────────
  const out = await d.store.commit({
    student: input.student,
    taskId: input.taskId,
    problemId: input.problemId,
    actionId: input.actionId,
    occurredAt: input.occurredAt,
    receivedAt: now,
    kind: a.kind,
    producer: d.producer,
    sourceKind: src.sourceKind,
    sourceRef: src.sourceRef,
    payload,
    graded,
    mutate,
    makePlanDraft: a.kind === 'open' || !d.store.planDraftPersisted
      ? null
      : (row) => planDraftOf(input.student, row, tasks, d.content, now),
  })

  if (out.verdict === 'duplicate') {
    return {
      verdict: 'duplicate',
      reason: '같은 행동을 다시 받았습니다. 한 번만 반영합니다',
      changedFields: [],
      attempt: out.attempt,
      summary: out.attempt === null ? null : summarize(out.attempt),
      graded: out.graded,
      gradedNote: null,
      planDraft: out.planDraft,
    }
  }
  if (out.verdict === 'conflict') {
    return {
      verdict: 'conflict',
      reason: '같은 행동 식별자로 다른 내용이 왔습니다. 자동 반영하지 않고 둘 다 보존합니다',
      changedFields: out.changedFields,
      attempt: out.attempt,
      summary: out.attempt === null ? null : summarize(out.attempt),
      graded: null,
      gradedNote: '충돌이라 채점하지 않았습니다',
      planDraft: out.planDraft,
    }
  }
  return {
    verdict: 'applied',
    reason: '새 행동으로 반영했습니다',
    changedFields: [],
    attempt: out.attempt,
    summary: out.attempt === null ? null : summarize(out.attempt),
    graded: out.graded,
    gradedNote,
    planDraft: out.planDraft,
  }
}

// ════════════════════════════════════════════════════════════════════
// 도움 고르기 — 규칙은 learningPreview, 자료는 `deps.content`
// ════════════════════════════════════════════════════════════════════

export type HelpView = {
  preview: PreviewOutput
  asset: {
    assetId: string
    kind: string
    videoKind: string | null
    title: string
    src: string | null
    body: string | null
    durationSeconds: number | null
    provenance: string
    /**
     * 화면이 어떤 재생기를 써야 하는가 (045 §3).
     * HTML `<video src>` 에 유튜브 주소를 넣는 상태로 두지 않는다.
     */
    media: 'youtube' | 'file' | 'text' | 'none'
    /** `media === 'youtube'` 일 때 영상 id. 전체 주소를 화면이 다시 짜지 않게 */
    youtubeId: string | null
  } | null
  blocked: Array<{ relationId: string; title: string; why: string }>
  /** 운영에서는 막힌 자료의 제목·사유를 보내지 않는다. 있었다는 사실만 */
  blockedHidden: boolean
  /**
   * 이 (관계+구간)에서 **전에 본 구간들** (042 §3-C).
   * 나갔다 다시 들어와도 0 부터 다시 세지 않게 화면에 돌려준다.
   */
  resumeRanges: Array<[number, number]>
}

/** 지금 이 학생이 **실제로 열 수 있는** 다른 과제 (R040-D) */
function realFallbacks(tasks: readonly TaskRow[], exceptTaskId: string): FallbackTask[] {
  return tasks
    .filter((t) => t.taskId !== exceptTaskId && t.problemIds.length > 0)
    .map((t) => ({
      taskRef: t.taskId,
      label: t.label,
      reachableByStudent: true,        // listAssignedTasks 가 배정된 것만 돌려준다
      href: `/learning?task=${encodeURIComponent(t.taskId)}&problem=${encodeURIComponent(t.problemIds[0])}`,
    }))
}

/**
 * 관측된 도움의 **종류**. 카드를 무조건 video 로 적지 않는다 (042 §3-B).
 */
function helpObservedOf(attempt: AttemptRow, content: ContentSnapshot): PreviewInput['stuck']['helpObserved'] {
  if (attempt.helpOpened.length === 0) return 'unmeasured'
  const last = attempt.helpOpened[attempt.helpOpened.length - 1]
  const asset = content.assetById(last.contentRefId)
  if (asset === null) return 'unmeasured'
  return asset.kind === 'video' ? 'video' : 'hints'
}

function chooseRelation(
  student: StudentRow, attempt: AttemptRow,
  relations: ApprovedRelation[], tasks: readonly TaskRow[], content: ContentSnapshot,
): { preview: PreviewOutput } {
  const p = content.problemById(attempt.problemId)
  if (p === null) throw new Error('문항을 찾을 수 없습니다')
  const s = summarize(attempt)
  const input: PreviewInput = {
    resolvedStudentScope: student.studentId,
    attemptRef: attempt.attemptId,
    problemRef: { kind: 'problem', id: attempt.problemId, version: 1 },
    typeCode: p.typeCode,
    taskGoal: p.taskGoal,
    stuck: {
      axis: s.stuckAxis,
      evidenceEventIds: attempt.stuckReports.map((x) => x.actionId),
      helpObserved: helpObservedOf(attempt, content),
      // **같은 오개념인지 확인하지 않았으므로 null 이다** (042 §3-B).
      // 「오답 반복」 관측은 강사 요약에서 따로 적는다
      repeatedMisconceptions: null,
    },
    relations,
    videoObservation: s.latestObservation === null ? undefined : toPreviewObservation(s.latestObservation.observation),
    availableFallbackTasks: realFallbacks(tasks, attempt.taskId),
    outcomesAfterHelp: outcomesAfterHelp(attempt),
    // 042 §1 결정 4 — 환경과 콘텐츠 출처를 **따로** 적는다.
    // 운영 조회로 온 문항이면 `local_real` 이고, 환경은 아직 `test` 다 —
    // 운영 DB 쓰기가 승인되기 전까지는 운영 환경이라고 적지 않는다
    provenance: {
      environment: 'test',
      content: p.provenance === 'demo' ? 'demo' : 'local_real',
    },
  }
  return { preview: previewNextAction(input) }
}

/**
 * 도움 **뒤에** 일어난 것들을 기록에서 뽑는다 (042 §3-B).
 *
 * 시간 순서를 **여기서 확인한다.** 도움을 연 시각보다 뒤에 낸 제출만 「도움 뒤」로 센다.
 * 확인 항목과 원문 재풀이를 **따로** 돌려준다 — 합치지 않는다.
 * 원인은 재지 않으므로 「도움 덕분」이라는 값을 만들지 않는다.
 */
function outcomesAfterHelp(a: AttemptRow): OutcomesAfterHelp | undefined {
  if (a.helpOpened.length === 0) return undefined

  // 확인 항목은 항목별 **마지막** 제출만 센다
  const latest = summarize(a).latestConfirm
  const confirm = {
    attempted: latest.length,
    correct: latest.filter((c) => c.graded === 'correct').length,
    ungraded: latest.filter((c) => c.graded === null).length,
  }

  // 도움보다 **뒤**인 원문 제출만. 042 §2-B — 실제 시점으로 견준다
  const retries = a.answers
    .filter((x) => isAfterHelp(a, x))
    .sort((x, y) => epochOf(x.occurredAt) - epochOf(y.occurredAt))
  const last = retries.length === 0 ? null : retries[retries.length - 1]

  // 두 시각을 **둘 다 읽을 수 있었을 때만** 순서를 확인했다고 한다.
  // 못 읽는 시각이 섞여 있으면 「도움 뒤 성공」으로 올리지 않는다
  const orderVerified = last !== null
    && Number.isFinite(epochOf(last.occurredAt))
    && a.helpOpened.every((h) => Number.isFinite(epochOf(h.occurredAt)))

  // 무엇을 봤는지 쟀는가 — 자기보고(카드 읽음)만 있으면 못 쟨 것이다
  const measured = a.helpOpened.some((h) => {
    const o = h.observation
    return o.method === 'player_coverage'
      && (o.coveragePct !== undefined || o.coveredSeconds !== undefined)
  })

  return {
    confirm,
    sourceRetry: last === null ? null : last.graded,
    orderVerified,
    helpUnmeasured: !measured,
  }
}

/**
 * 저장 모양 → preview 입력 모양.
 *
 * `self_report`(카드를 읽었다고 누름)는 **재생 관측이 아니다.** 창 열림 0ms 로 바꾸지 않고
 * 아예 넘기지 않는다 — 그래야 「0초 봤다」는 관측이 만들어지지 않는다 (042 §3-B).
 */
function toPreviewObservation(o: VideoObservationRecord): PreviewInput['videoObservation'] {
  if (o.method === 'self_report') return undefined
  if (o.method === 'player_coverage') {
    return {
      method: 'player_coverage',
      coveragePct: o.coveragePct, coveredSeconds: o.coveredSeconds,
      focusLostSeconds: o.focusLostSeconds, sceneSeconds: o.sceneSeconds, completed: o.completed,
    }
  }
  return { method: 'window_elapsed', windowElapsedMs: o.windowElapsedMs }
}

export async function chooseHelp(
  student: StudentRow, attempt: AttemptRow, deps?: LearningDeps,
): Promise<HelpView> {
  const d = deps ?? await resolveLearningDeps()
  const tasks = await d.store.listAssignedTasks(student.studentId)
  return helpViewIn(student, attempt, tasks, d)
}

/** 유튜브 주소에서 영상 id. 아니면 null — 화면이 재생기를 고를 수 있게 */
function youtubeIdOf(src: string | null): string | null {
  if (src === null) return null
  const m = src.match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/)
  return m === null ? null : m[1]
}

function helpViewIn(
  student: StudentRow, attempt: AttemptRow, tasks: readonly TaskRow[], d: LearningDeps,
): HelpView {
  const content = d.content
  const relations = content.relationsFor(attempt.problemId)
  const { preview } = chooseRelation(student, attempt, relations, tasks, content)
  const chosenId = preview.recommendedAction.relationId
  const chosen = relations.find((r) => r.relationId === chosenId) ?? null
  const asset = chosen === null ? null : content.assetById(chosen.contentRef.id)
  // 042 §3-D — 「보이지 않는 자료」의 **제목과 검수 사유는 개발 표시**다.
  // 운영 학생에게 내부 검수 사유를 보내지 않는다. demo 모드에서만 채운다
  const showInternal = d.mode === 'local_demo'
  const blocked = showInternal
    ? preview.recommendedAction.rejected.map((r) => {
        const rel = relations.find((x) => x.relationId === r.relationId)
        const aset = rel === undefined ? null : content.assetById(rel.contentRef.id)
        return { relationId: r.relationId, title: aset === null ? '(자산 없음)' : aset.title, why: r.why }
      })
    : []
  const blockedHidden = !showInternal && preview.recommendedAction.rejected.length > 0
  // 이 관계·구간에서 전에 본 구간을 모아 돌려준다 (재진입 이어보기)
  const seg = preview.recommendedAction.segment
  const segKey = seg === undefined ? 'full' : `${seg.startSeconds}-${seg.endSeconds}`
  const prior: Array<[number, number]> = []
  for (const h of attempt.helpOpened) {
    if (h.relationId !== chosenId || h.segmentKey !== segKey) continue
    for (const r of h.observation.watchedRanges ?? []) prior.push(r)
  }

  const youtubeId = asset === null ? null : youtubeIdOf(asset.src)
  const media: NonNullable<HelpView['asset']>['media'] = asset === null ? 'none'
    : asset.kind !== 'video' ? (asset.body === null ? 'none' : 'text')
    : youtubeId !== null ? 'youtube'
    : asset.src !== null ? 'file' : 'none'

  return {
    preview,
    asset: asset === null ? null : {
      assetId: asset.assetId, kind: asset.kind, videoKind: asset.videoKind,
      title: asset.title, src: asset.src, body: asset.body,
      durationSeconds: asset.durationSeconds, provenance: asset.provenance,
      media, youtubeId,
    },
    blocked,
    blockedHidden,
    resumeRanges: mergeRanges(prior),
  }
}

// ════════════════════════════════════════════════════════════════════
// 계획 초안
// ════════════════════════════════════════════════════════════════════

function planDraftOf(
  student: StudentRow, attempt: AttemptRow,
  tasks: readonly TaskRow[], content: ContentSnapshot, now: string,
): PlanDraftRow {
  const { preview } = chooseRelation(student, attempt, content.relationsFor(attempt.problemId), tasks, content)
  const actionIds = [
    ...attempt.answers, ...attempt.stuckReports,
    ...attempt.helpOpened, ...attempt.confirmSubmissions,
  ].map((x) => x.actionId)
  return {
    studentId: student.studentId,
    attemptId: attempt.attemptId,
    approvalState: 'draft',
    items: preview.planDraft.items,
    recheckMethod: preview.planDraft.recheckMethod,
    rationaleEventIds: preview.planDraft.rationaleEventIds,
    overwritesApprovedPlan: false,
    createdAt: now,
    basedOnActionIds: actionIds,
  }
}

// ════════════════════════════════════════════════════════════════════
// 강사 요약
// ════════════════════════════════════════════════════════════════════

export type TeacherRow = {
  studentId: string
  displayName: string
  attemptId: string
  taskLabel: string
  typeCode: string
  typeTitle: string
  problemId: string
  summary: AttemptSummary
  observed: string[]
  unknownScope: string[]
  notClaimed: string[]
  outcomes: OutcomeReadout
  summaryLine: string
  planDraft: PlanDraftRow | null
  confirmSubmissions: ConfirmSubmission[]
}

export async function teacherRows(deps?: LearningDeps): Promise<TeacherRow[]> {
  const d = deps ?? await resolveLearningDeps()
  const store: LearningActionStore = d.store
  const out: TeacherRow[] = []
  for (const student of await store.listStudentsWithWork()) {
    const tasks = await store.listAssignedTasks(student.studentId)
    for (const a of await store.listAttempts(student.studentId)) {
      const task = tasks.find((t) => t.taskId === a.taskId)
      const p = d.content.problemById(a.problemId)
      if (p === null) continue
      const info = typeViewOf(d.content, p.typeCode)
      const help = helpViewIn(student, a, tasks, d)
      out.push({
        studentId: student.studentId,
        displayName: student.displayName,
        attemptId: a.attemptId,
        taskLabel: task ? task.label : '(과제 없음)',
        typeCode: p.typeCode,
        typeTitle: info.title,
        problemId: a.problemId,
        summary: summarize(a),
        observed: help.preview.evidence.observed,
        unknownScope: help.preview.evidence.unknownScope,
        notClaimed: help.preview.evidence.notClaimed,
        outcomes: help.preview.evidence.outcomes,
        summaryLine: help.preview.teacherSummary,
        planDraft: await store.getPlanDraft(student.studentId, a.attemptId),
        confirmSubmissions: summarize(a).latestConfirm,
      })
    }
  }
  return out
}

export function keyOf(student: StudentRow, actionId: string, producer?: string): string {
  return dedupKey({
    resolvedStudentScope: student.studentId,
    validatedProducer: producer ?? 'studycheck-learning-041-test',
    eventId: actionId,
    clientEvent: {},
  })
}

export { summarize, compareEvents }
export type { StoredEvent }
