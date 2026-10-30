/**
 * 학습 한 바퀴가 **무엇에 기대어 도는가** — GPT-EXEC-045 §3 · GPT_REVIEW_043_044 §6
 *
 * 왜 생겼나
 *   043·044 까지 `engine.ts` 는 `catalog.ts` 의 **상수**와 `testStore()` 를 직접 불렀다.
 *   그래서 043 §3-A·§3-B 로 만들어 둔 provider 가 **실제 학습 경로에 닿지 않았다** —
 *   GPT 가 직접 호출해 보고 그 사실을 짚었다 (§6: 「작성한 content/auth/store provider 가
 *   실제 학습 경로에 주입되지 않는다」). 맞는 지적이다.
 *
 *   이 파일이 그 자리다. **엔진은 더 이상 `catalog.ts` 도 `testStore()` 도 모른다.**
 *   둘 다 여기서, `local_demo` 일 때만 불린다.
 *
 * 지키는 선
 *   · 운영 모드에서 **시연으로 되돌아가지 않는다.** 설정이 없으면 `NotConfiguredError`
 *     로 멈춘다. demo 보호를 없앤 것이 아니라 **모드별로 갈라 끼운** 것이다 (045 §3).
 *   · 정답·해설은 서버 쪽에만 둔다. 학생 모양은 `forStudent()` 의 **허용 목록**으로 만든다.
 *   · 승인되지 않은 자료는 관계가 **생기지 않는다** — `approval.ts` 에 줄이 없으면 없다.
 *
 * 왜 「한 장면(snapshot)」인가
 *   파일 저장소의 `transact()` 는 **동기**다 (한 번 읽고 한 번 쓴다). 운영 조회는 비동기다.
 *   그래서 한 요청이 쓸 콘텐츠를 **먼저 다 읽어 두고** 엔진에 넘긴다. 그러면 판정 로직은
 *   동기로 남고, 저장소는 파일이든 RPC 든 같은 자리에 끼워진다.
 */
import type { ApprovedRelation, ConfirmActionItem } from '@/lib/twin/learningPreview'

import type { CatalogAsset, CatalogProblem } from './catalog'
import type {
  AttemptRow, PlanDraftRow, StoredEvent, StudentRow, TaskRow,
} from './contract'
import { gradeAnswerDetailed, type GradeOutcome } from './grading'
import { learningMode, type LearningMode } from './mode'
import {
  NotConfiguredError, type StudentAuthProvider, type VideoReadiness,
} from './providers'

// ════════════════════════════════════════════════════════════════════
// 콘텐츠 한 장면
// ════════════════════════════════════════════════════════════════════

export type TypeLabel = { title: string; chapter: string; provenance: string }

/**
 * 이 요청이 쓸 콘텐츠를 **미리 다 읽어 둔 것**.
 *
 * 전부 동기 함수다 — 조회는 이 장면을 만들 때 이미 끝났다.
 */
export type ContentSnapshot = {
  source: 'demo' | 'supabase'
  /** 화면에 그대로 띄우는 출처 설명 */
  note: string
  /**
   * 이 요청이 쓸 **첫 세트 문항 전부**. 정답이 들어 있는 **서버용** 모양이다 —
   * 학생에게 보낼 때는 `forStudent()` 의 허용 목록을 통과해야 한다.
   */
  problems: CatalogProblem[]
  /** 이 요청이 쓸 자산 전부 */
  assets: CatalogAsset[]
  typeLabel(typeCode: string): TypeLabel
  problemById(problemId: string): CatalogProblem | null
  /**
   * 원문 그림의 **서명된 임시 주소**. 그림이 없으면 `null`.
   *
   * 저장소 경로를 학생에게 보내지 않기 위해 서버가 서명해 둔 것을 돌려준다
   * (`app/api/grade/[code]` 와 같은 `problem-images` 버킷·같은 방식).
   * **해설 그림은 서명하지 않는다** — 서명할 길이 없다.
   */
  problemImageUrl(problemId: string): string | null
  assetById(assetId: string): CatalogAsset | null
  relationsFor(problemId: string): ApprovedRelation[]
  /** 원문 채점. **이유까지** 돌려준다 — 「미지원」을 오답으로 적지 않는다 */
  gradeProblem(problemId: string, answer: string): GradeOutcome
  /** 확인 항목 채점 */
  gradeConfirmItem(itemRef: string, answer: string): GradeOutcome
  /** 첫 세트 영상의 검수 상태. 시연에는 없다 (044 §6-3) */
  videoReadiness: VideoReadiness[] | null
}

// ════════════════════════════════════════════════════════════════════
// 저장소 — 파일이든 RPC 든 **같은 구멍**
// ════════════════════════════════════════════════════════════════════

export type ActionKind = 'open' | 'answer' | 'stuck' | 'help' | 'confirm'
export type SourceKind = 'class_session' | 'worksheet' | 'exam_sheet' | 'standalone'

export type CommitRequest = {
  student: StudentRow
  taskId: string
  problemId: string
  actionId: string
  occurredAt: string
  receivedAt: string
  kind: ActionKind
  producer: string
  /** 이 학습이 **어느 기존 자료**에서 왔는가. 운영 되돌리기·문맥 판정의 열쇠 */
  sourceKind: SourceKind
  sourceRef: string | null
  payload: Record<string, unknown>
  /** **서버가 채점한** 값. 학생이 보낸 값이 아니다 */
  graded: 'correct' | 'wrong' | null
  /**
   * 새 행동으로 **받아들여졌을 때만** 불린다.
   * 중복·충돌이면 불리지 않는다 — 상태를 다시 바꾸지 않기 위해서다 (042 §3-A).
   */
  mutate: (attempt: AttemptRow) => void
  /** 받아들여졌고 계획 초안을 쓸 차례면. `null` 이면 쓰지 않는다 */
  makePlanDraft: ((attempt: AttemptRow) => PlanDraftRow) | null
}

export type CommitOutcome = {
  verdict: 'applied' | 'duplicate' | 'conflict'
  changedFields: string[]
  attempt: AttemptRow | null
  /** 저장된 채점 결과. 중복이면 **처음 저장된 값** */
  graded: 'correct' | 'wrong' | null
  planDraft: PlanDraftRow | null
}

export interface LearningActionStore {
  readonly backend: 'test_file' | 'supabase'
  readonly location: string
  /**
   * 계획 초안을 **실제로 저장하는가**.
   *
   * 운영에는 계획 초안 표가 **없다** (043 DDL 은 표 2개뿐이다). 그 사실을 숨기지
   * 않고 이 칸으로 드러낸다 — 화면·보고가 「저장됐다」고 말하지 않게.
   */
  readonly planDraftPersisted: boolean
  getStudent(studentId: string): Promise<StudentRow | null>
  listAssignedTasks(studentId: string): Promise<TaskRow[]>
  findAttempt(studentId: string, taskId: string, problemId: string): Promise<AttemptRow | null>
  listAttempts(studentId: string): Promise<AttemptRow[]>
  listEvents(studentId: string): Promise<StoredEvent[]>
  getPlanDraft(studentId: string, attemptId: string): Promise<PlanDraftRow | null>
  /** 강사 요약이 볼 학생들. 운영에서는 **기록이 있는 학생만** */
  listStudentsWithWork(): Promise<StudentRow[]>
  commit(req: CommitRequest): Promise<CommitOutcome>
}

// ════════════════════════════════════════════════════════════════════
// 한 요청이 쓰는 것 전부
// ════════════════════════════════════════════════════════════════════

export type LearningDeps = {
  mode: LearningMode
  content: ContentSnapshot
  store: LearningActionStore
  auth: StudentAuthProvider
  /** 이 시범의 생성 트랙. client 가 보낸 문자열을 쓰지 않는다 */
  producer: string
}

// ── 시험 대역 ───────────────────────────────────────────────────────
// 합성 provider 로 **실제 route 를 끝에서 끝까지** 돌리기 위한 구멍이다 (045 §6-1).
// 운영 빌드에서는 끼울 수 없다 — R041-04 의 뒷문을 반복하지 않는다.

let injected: LearningDeps | null = null

export function __setLearningDepsForTest(d: LearningDeps | null): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('운영 빌드에서는 학습 의존성 대역을 끼울 수 없습니다 (R041-04)')
  }
  injected = d
}

/** 지금 의존성이 **대역**인가. 보고에서 운영 접속과 섞지 않는다 */
export function learningDepsAreInjected(): boolean { return injected !== null }

/**
 * **인증만** 먼저 고른다 — 콘텐츠를 읽지 않는다.
 *
 * 045 §3: 「타 학생/미배정/범위 밖 요청은 **콘텐츠 읽기·저장 전에** 차단한다.」
 * 그래서 route 는 이것으로 학생을 확정한 **뒤에** `resolveLearningDeps()` 를 부른다.
 */
export async function resolveLearningAuth(): Promise<StudentAuthProvider> {
  if (injected !== null) return injected.auth
  if (learningMode() === 'local_demo') {
    const { demoStudentAuth } = await import('./demoAuth')
    return demoStudentAuth
  }
  const { supabaseStudentAuth } = await import('./supabaseAuth')
  return supabaseStudentAuth()
}

/**
 * 지금 모드에 맞는 의존성.
 *
 * **자동 fallback 이 없다.** 운영인데 설정이 없으면 `NotConfiguredError` 가 올라간다.
 */
export async function resolveLearningDeps(): Promise<LearningDeps> {
  if (injected !== null) return injected
  const mode = learningMode()
  if (mode === 'local_demo') {
    const { demoDeps } = await import('./demoDeps')
    return demoDeps()
  }
  const { operationalDeps } = await import('./operationalDeps')
  return operationalDeps()
}

/** 운영 설정이 없을 때 그대로 올린다 — 시연으로 바꾸지 않는다 */
export { NotConfiguredError }

// ════════════════════════════════════════════════════════════════════
// 확인 항목 — **문제은행 다른 문항**으로 만든다 (045 §4)
// ════════════════════════════════════════════════════════════════════

/** 확인 문항의 `itemRef`. 어떤 문항인지 되읽을 수 있어야 한다 */
export const CONFIRM_ITEM_PREFIX = 'confirm-problem:'

export function confirmItemRefOf(problemId: string): string {
  return `${CONFIRM_ITEM_PREFIX}${problemId}`
}

export function problemIdOfConfirmItemRef(itemRef: string): string | null {
  if (!itemRef.startsWith(CONFIRM_ITEM_PREFIX)) return null
  const id = itemRef.slice(CONFIRM_ITEM_PREFIX.length)
  return id === '' ? null : id
}

/**
 * 문제은행 문항 하나를 확인 항목으로 바꾼다.
 *
 * **정답을 넣지 않는다.** 채점은 서버가 `gradeConfirmItem` 에서 한다.
 */
export function confirmItemFromProblem(
  p: CatalogProblem,
  /** 그 문항 그림의 **서명된 임시 주소**. 없으면 `null` — 경로를 대신 넣지 않는다 */
  imageUrl: string | null = null,
): ConfirmActionItem {
  const item: ConfirmActionItem = {
    itemRef: confirmItemRefOf(p.problemId),
    // 본문이 그림인 운영 문항은 지문 글자가 비어 있다. 그 사실을 그대로 적는다
    prompt: p.stem !== '' ? p.stem : `문항 ${p.localNo ?? p.problemId}`,
    choices: p.choices,
    origin: p.provenance === 'demo' ? 'demo' : 'operational',
  }
  // 그림이 있으면 **서명된 주소만** 넣는다. 없으면 칸을 만들지 않는다
  if (imageUrl !== null) item.imageUrl = imageUrl
  return item
}

/** 문항 하나를 서버 채점에 넘길 모양으로 */
export function gradableOf(p: CatalogProblem): Parameters<typeof gradeAnswerDetailed>[0] {
  return {
    answerKind: p.answerKind ?? (p.choices === null ? 'number' : 'choice'),
    answerText: p.answer === '' ? null : p.answer,
    isEssay: p.isEssay ?? (p.taskGoal === 'prove'),
  }
}
