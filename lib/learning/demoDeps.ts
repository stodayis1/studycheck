/**
 * 로컬 체험판이 쓰는 것 — GPT-EXEC-045 §3 · §6-1
 *
 * 045 §6-1: 「로컬 브라우저 체험판 **유지**.」 그래서 이 파일이 있다.
 * `catalog.ts` 의 시연 상수와 `store.ts` 의 파일 저장소를 **여기서만** 부른다.
 * 엔진은 이 파일을 직접 import 하지 않는다 — `deps.resolveLearningDeps()` 가
 * `local_demo` 일 때만 불러온다.
 *
 * 씨앗(`SEED_STUDENTS`·`SEED_TASKS`)이 엔진에서 여기로 옮겨 왔다.
 * 시연 계정·시연 과제는 **시연 쪽 사실**이고, 엔진이 알 일이 아니다.
 */
import type { ApprovedRelation } from '@/lib/twin/learningPreview'

import {
  ASSETS, CATALOG_NOTE, PILOT_TYPES, PROBLEMS,
  assetById, gradeConfirmItem, gradeProblem, problemById, relationsFor,
  type CatalogAsset, type CatalogProblem,
} from './catalog'
import type {
  AttemptRow, PlanDraftRow, StoredEvent, StudentRow, TaskRow,
} from './contract'
import { emptyAttempt, summarize } from './contract'
import { demoStudentAuth } from './demoAuth'
import type {
  CommitOutcome, CommitRequest, ContentSnapshot, LearningActionStore, LearningDeps, TypeLabel,
} from './deps'
import { compareEvents } from '@/lib/twin/learningPreview'
import { testStore } from './store'

// ════════════════════════════════════════════════════════════════════
// 씨앗 — 시험 계정과 **배정된** 과제. 자동 배정이 아니라 고정 씨앗이다
// ════════════════════════════════════════════════════════════════════

export const SEED_STUDENTS: StudentRow[] = [
  { studentId: 'test-student-A', loginCode: 'A-2026', displayName: '시험학생A', provenance: 'demo' },
  { studentId: 'test-student-B', loginCode: 'B-2026', displayName: '시험학생B', provenance: 'demo' },
]

export const SEED_TASKS: TaskRow[] = [
  { taskId: 'task-A-0102', studentId: 'test-student-A', label: '다항식 · 전개식에서 계수 구하기',
    typeCode: '공수1-01-02', problemIds: ['demo-p-0102-1'], assigned: true, provenance: 'demo' },
  { taskId: 'task-A-0107', studentId: 'test-student-A', label: '다항식 · 곱셈 공식의 변형',
    typeCode: '공수1-01-07', problemIds: ['demo-p-0107-1', 'demo-p-0107-2'], assigned: true, provenance: 'demo' },
  { taskId: 'task-A-0102b', studentId: 'test-student-A', label: '다항식 · 계수 조건에서 미지수 구하기',
    typeCode: '공수1-01-02', problemIds: ['demo-p-0102-2'], assigned: true, provenance: 'demo' },
  // B 는 **도움이 없는 과제 하나만** 받는다 → 대체 자산 없음 표시를 보려고
  { taskId: 'task-B-0102b', studentId: 'test-student-B', label: '다항식 · 계수 조건에서 미지수 구하기',
    typeCode: '공수1-01-02', problemIds: ['demo-p-0102-2'], assigned: true, provenance: 'demo' },
  // 배정하지 않은 과제 — 학생 화면에 **나오지 않아야** 한다
  { taskId: 'task-A-unassigned', studentId: 'test-student-A', label: '아직 배정하지 않은 과제',
    typeCode: '공수1-01-07', problemIds: ['demo-p-0107-1'], assigned: false, provenance: 'demo' },
]

export const SEED_LOGIN_CODES = SEED_STUDENTS.map((s) => ({ code: s.loginCode, name: s.displayName }))

export async function ensureDemoSeeded(): Promise<void> {
  await testStore().seedIfEmpty(SEED_STUDENTS, SEED_TASKS)
}

/** 이 체험판의 생성 트랙. client 가 보낸 문자열을 쓰지 않는다 */
export const DEMO_PRODUCER = 'studycheck-learning-041-test'

// ════════════════════════════════════════════════════════════════════
// 콘텐츠 — 시연 상수
// ════════════════════════════════════════════════════════════════════

export function demoContentSnapshot(): ContentSnapshot {
  return {
    source: 'demo',
    note: CATALOG_NOTE,
    problems: PROBLEMS,
    assets: ASSETS,
    typeLabel(code: string): TypeLabel {
      const t = PILOT_TYPES.find((x) => x.typeCode === code)
      return {
        title: t ? t.title : '(유형 이름 없음)',
        chapter: t ? t.chapter : '(단원 없음)',
        provenance: t ? t.provenance : 'demo',
      }
    },
    problemById(id: string): CatalogProblem | null { return problemById(id) },
    // 시연 문항은 지문이 글자다. 그림이 없으므로 서명할 것이 없다
    problemImageUrl(): string | null { return null },
    assetById(id: string): CatalogAsset | null { return assetById(id) },
    relationsFor(problemId: string): ApprovedRelation[] { return relationsFor(problemId) },
    gradeProblem(problemId: string, answer: string) {
      const result = gradeProblem(problemId, answer)
      return {
        result,
        // 문구를 바꾸지 않는다 — 041~044 의 화면·시험이 이 말을 본다
        why: result === null ? '서술형이라 자동 채점하지 않았습니다' : null,
        unsupportedInput: false,
      }
    },
    gradeConfirmItem(itemRef: string, answer: string) {
      const result = gradeConfirmItem(itemRef, answer)
      return {
        result,
        why: result === null ? '채점 기준이 없어 결과를 남기지 않았습니다' : null,
        unsupportedInput: false,
      }
    },
    // 시연 자료의 검수 상태를 **꾸며 내지 않는다** (044 §6-3)
    videoReadiness: null,
  }
}

/** 시연 문항 전부 — 화면이 「무엇이 들어 있나」를 적을 때 쓴다 */
export function demoProblems(): CatalogProblem[] { return PROBLEMS }
export function demoAssets(): CatalogAsset[] { return ASSETS }

// ════════════════════════════════════════════════════════════════════
// 저장소 — 파일 한 개. 중복·충돌 판정이 `transact()` 안에서 한 번에 끝난다
// ════════════════════════════════════════════════════════════════════

export function demoActionStore(): LearningActionStore {
  const s = testStore()
  return {
    backend: s.backend,
    location: s.location,
    planDraftPersisted: true,
    getStudent: (id) => s.getStudent(id),
    listAssignedTasks: (id) => s.listAssignedTasks(id),
    findAttempt: (id, taskId, problemId) => s.findAttempt(id, taskId, problemId),
    listAttempts: (id) => s.listAttempts(id),
    listEvents: (id) => s.listEvents(id),
    getPlanDraft: (id, attemptId) => s.getPlanDraft(id, attemptId),

    async listStudentsWithWork(): Promise<StudentRow[]> {
      const out: StudentRow[] = []
      for (const seed of SEED_STUDENTS) {
        const row = await s.getStudent(seed.studentId)
        if (row !== null) out.push(row)
      }
      return out
    },

    async commit(req: CommitRequest): Promise<CommitOutcome> {
      const scope = req.student.studentId
      return s.transact((tx): CommitOutcome => {
        const attempt = tx.findAttempt(scope, req.taskId, req.problemId)
          ?? emptyAttempt(
            `att-${scope}-${req.taskId}-${req.problemId}`,
            scope, req.taskId, req.problemId, req.receivedAt,
          )
        const envelope = {
          resolvedStudentScope: scope,
          validatedProducer: req.producer,
          eventId: req.actionId,
          clientEvent: req.payload,
        }

        // ── 중복·충돌을 **상태를 바꾸기 전에** 판정한다 (042 §3-A) ──────
        const prev = tx.findEvent(scope, req.producer, req.actionId)
        if (prev !== null) {
          const v = compareEvents(
            {
              resolvedStudentScope: prev.resolvedStudentScope,
              validatedProducer: prev.validatedProducer,
              eventId: prev.eventId,
              clientEvent: prev.clientEvent,
            },
            envelope,
          )
          const saved = tx.findAttempt(scope, req.taskId, req.problemId)
          if (v.verdict === 'duplicate') {
            return {
              verdict: 'duplicate',
              changedFields: [],
              attempt: saved,
              graded: gradedOfRecorded(saved, req.actionId),
              planDraft: tx.getPlanDraft(scope, attempt.attemptId),
            }
          }
          // 같은 id 인데 뜻이 다르다 — **조용히 반영하지 않는다.** 둘 다 남긴다
          tx.appendEvent({ ...envelope, received_at: req.receivedAt, verdict: 'conflict' })
          return {
            verdict: 'conflict',
            changedFields: (v as { changedFields?: string[] }).changedFields ?? [],
            attempt: saved,
            graded: null,
            planDraft: tx.getPlanDraft(scope, attempt.attemptId),
          }
        }

        // ── 새 행동일 때만 상태를 바꾼다 ────────────────────────────
        req.mutate(attempt)
        attempt.updatedAt = req.receivedAt
        tx.appendEvent({ ...envelope, received_at: req.receivedAt, verdict: 'applied' })
        tx.putAttempt(attempt)
        let planDraft: PlanDraftRow | null = tx.getPlanDraft(scope, attempt.attemptId)
        if (req.makePlanDraft !== null) {
          planDraft = req.makePlanDraft(attempt)
          tx.putPlanDraft(planDraft)
        }
        return {
          verdict: 'applied',
          changedFields: [],
          attempt,
          graded: req.graded,
          planDraft,
        }
      })
    },
  }
}

/** 중복 요청에 **처음 저장된 채점 결과**를 그대로 돌려준다. 다시 채점하지 않는다 */
function gradedOfRecorded(saved: AttemptRow | null, actionId: string): 'correct' | 'wrong' | null {
  if (saved === null) return null
  const hit = [...saved.answers, ...saved.confirmSubmissions].find((x) => x.actionId === actionId)
  return hit === undefined ? null : hit.graded
}

export function demoDeps(): LearningDeps {
  return {
    mode: 'local_demo',
    content: demoContentSnapshot(),
    store: demoActionStore(),
    auth: demoStudentAuth,
    producer: DEMO_PRODUCER,
  }
}

export { summarize }
export type { StoredEvent }
