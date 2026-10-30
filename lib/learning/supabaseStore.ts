/**
 * 운영 학습 기록 저장소 — GPT-EXEC-043 §3-C · **GPT-EXEC-045 §3 으로 고침**
 *
 * ⚠️ **아직 운영 DB 에 붙은 적이 없다.** `docs/sql/migrations/045_learning_actions.sql`
 *   이 올라가지 않았다. 「연결됐다」고 보고하지 않는다. 여기까지 확인한 것은
 *   **합성 SDK 로 실제 route 를 끝에서 끝까지 돌린 것**뿐이다 (045 §6-1).
 *
 * 045 에서 고친 것 (GPT_REVIEW_043_044 §7.2 · §7.4)
 *   ① `Number(problemId)` 를 없앴다. bigint 는 **글자로** 넘긴다 — `9007199254740993`
 *      이 `…992` 로 바뀌는 일이 없다 (탐침 P06).
 *   ② `loadAttempt` 가 `source_kind`·`source_ref` 를 **읽는다.** 전에는 `emptyAttempt`
 *      의 `taskId` 자리에 `problem_id` 를 넘겨서 과제 `task-X` 가 `101` 로 복원됐다.
 *   ③ 도움 기록의 `content_ref`·`segment_key` 를 payload 에서 **읽는다.** 전에는 없는
 *      값을 읽어 `''`·`'full'` 로 만들었다. 지금은 엔진이 그 둘을 payload 에 적는다.
 *   ④ 학생 **원요청**(`observed_requested`)과 서버가 **검증한 관측**(`observed_verified`)
 *      을 가른다. 되읽을 때 상태로 쓰는 것은 검증한 쪽뿐이다.
 *   ⑤ 첫 `applied` 와 `duplicate` 의 반환 모양을 맞췄다 — `graded` 가 양쪽에 있다.
 *
 * 왜 RPC 한 번인가
 *   SDK write 를 여러 번 순서대로 부르는 것은 트랜잭션이 아니다. 중복 판정 → 사실 기록
 *   → 상태 확정이 한 번에 끝나야 한다. 그 판정은 **SQL 안**에 있다.
 *
 * 계획 초안
 *   운영에는 계획 초안 표가 **없다.** `planDraftPersisted = false` 로 드러낸다 —
 *   화면·보고가 「저장됐다」고 말하지 않게 한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  AttemptRow, StoredEvent, StudentRow, VideoObservationRecord,
} from './contract'
import { emptyAttempt } from './contract'
import type { ActionKind, SourceKind } from './deps'
import { learningClient } from './supabaseClient'

export type ApplyRpcResult = {
  verdict: 'applied' | 'duplicate' | 'conflict' | 'rejected'
  attemptId: string
  graded: 'correct' | 'wrong' | null
  changedFields: string[]
  /** 서버가 거부했으면 사유 코드 */
  reason: string | null
}

/** 이번 시험 묶음. 되돌리기가 **이 범위만** 본다 */
export function learningRunId(): string {
  return process.env.LEARNING_RUN_ID || 'pilot-045'
}

const SOURCE_KINDS: readonly SourceKind[] = ['class_session', 'worksheet', 'exam_sheet', 'standalone']

/**
 * 과제 식별자 ↔ (어느 기존 자료, 그 자료의 id).
 *
 * 한 곳에 둔다. 두 벌이 되면 **시도 유일키가 어긋나** 다른 과제의 시도가 합쳐진다
 * (GPT_REVIEW_043_044 §5).
 */
export function taskIdOfSource(sourceKind: SourceKind, sourceRef: string | null): string {
  return sourceRef === null ? sourceKind : `${sourceKind}:${sourceRef}`
}

export function sourceOfTaskId(taskId: string): { sourceKind: SourceKind; sourceRef: string | null } {
  const i = taskId.indexOf(':')
  if (i > 0) {
    const head = taskId.slice(0, i)
    if (SOURCE_KINDS.includes(head as SourceKind)) {
      return { sourceKind: head as SourceKind, sourceRef: taskId.slice(i + 1) }
    }
  }
  if (SOURCE_KINDS.includes(taskId as SourceKind)) {
    return { sourceKind: taskId as SourceKind, sourceRef: null }
  }
  // 모양을 모르는 과제 id — **추측하지 않는다.** standalone 으로 두고 id 를 그대로 남긴다
  return { sourceKind: 'standalone', sourceRef: taskId }
}

export type SupabaseStoreOptions = {
  runId: string
  producer: string
}

export class SupabaseLearningStore {
  readonly backend = 'supabase' as const
  readonly location: string

  constructor(private readonly opts: SupabaseStoreOptions) {
    this.location = `supabase · run_id=${opts.runId}`
  }

  private db(what: string): SupabaseClient { return learningClient(what) }

  /**
   * 행동 하나를 **한 트랜잭션으로** 확정한다.
   *
   * 중복 판정 · 사실 기록 · 현재 상태가 SQL 함수 안에서 한 번에 끝난다.
   * `p_problem_id` 는 **글자**다 — 함수가 안에서 bigint 로 바꾸며 검사한다.
   */
  async applyAction(args: {
    student: StudentRow
    problemId: string
    sourceKind: SourceKind
    sourceRef: string | null
    actionId: string
    occurredAt: string
    kind: ActionKind
    payload: Record<string, unknown>
    /** **서버가 채점한** 결과. 학생이 보낸 값이 아니다 */
    graded: 'correct' | 'wrong' | null
    watchLogId: string | null
  }): Promise<ApplyRpcResult> {
    const { data, error } = await this.db('학습 기록 저장').rpc('apply_learning_action', {
      p_student_id: args.student.studentId,
      // 글자로 넘긴다. `Number()` 를 쓰지 않는다 (탐침 P06)
      p_problem_id: args.problemId,
      p_source_kind: args.sourceKind,
      p_source_ref: args.sourceRef,
      p_run_id: this.opts.runId,
      p_action_id: args.actionId,
      p_producer: this.opts.producer,
      p_kind: args.kind,
      p_occurred_at: args.occurredAt,
      p_payload: args.payload,
      p_graded: args.graded,
      p_watch_log_id: args.watchLogId,
    })
    if (error) throw new Error(`학습 행동 저장 실패: ${error.message}`)
    const r = (data ?? {}) as Record<string, unknown>
    return {
      verdict: (r.verdict as ApplyRpcResult['verdict']) ?? 'rejected',
      attemptId: String(r.attempt_id ?? ''),
      graded: (r.graded as 'correct' | 'wrong' | null) ?? null,
      changedFields: Array.isArray(r.changed_fields) ? (r.changed_fields as string[]).map(String) : [],
      reason: r.reason === null || r.reason === undefined ? null : String(r.reason),
    }
  }

  /**
   * 한 시도를 **행동 목록에서 다시 세워** 돌려준다.
   *
   * 상태 칸을 읽는 것이 아니다 — 파일 저장소와 같은 규칙이다 (042 §3-A).
   * `is_canonical` 인 줄만 쌓는다. 충돌로 들어온 줄은 **보존되지만 상태에 넣지 않는다.**
   *
   * `taskId` 는 `source_kind`·`source_ref` 에서 **되살린다.** 그 둘이 시도의 문맥이고,
   * 같은 문항이라도 다른 과제·재학습이면 다른 시도다.
   */
  async loadAttempt(
    studentId: string, taskId: string, problemId: string,
  ): Promise<AttemptRow | null> {
    const src = sourceOfTaskId(taskId)
    const db = this.db('학습 기록 조회')
    let q = db
      .from('learning_attempts')
      .select('id, student_id, problem_id, source_kind, source_ref, started_at, updated_at')
      .eq('student_id', studentId)
      // 글자 그대로 넘긴다 — PostgREST 가 bigint 로 비교한다
      .eq('problem_id', problemId)
      .eq('source_kind', src.sourceKind)
      .eq('run_id', this.opts.runId)
    q = src.sourceRef === null ? q.is('source_ref', null) : q.eq('source_ref', src.sourceRef)
    const { data: att, error: e1 } = await q.maybeSingle()
    if (e1) throw new Error(`시도 조회 실패: ${e1.message}`)
    if (att === null || att === undefined) return null

    const { data: acts, error: e2 } = await db
      .from('learning_actions')
      .select('action_id, kind, occurred_at, payload, graded')
      .eq('attempt_id', att.id)
      .eq('is_canonical', true)
      .order('occurred_at', { ascending: true })
      .order('action_id', { ascending: true })
    if (e2) throw new Error(`행동 조회 실패: ${e2.message}`)

    const row = emptyAttempt(
      String(att.id),
      studentId,
      // ← 과제 식별자다. 전에는 여기에 `problem_id` 가 들어갔다 (§7.2)
      taskIdOfSource(att.source_kind as SourceKind, att.source_ref === null ? null : String(att.source_ref)),
      String(att.problem_id),
      String(att.started_at),
    )
    row.updatedAt = String(att.updated_at)

    for (const a of acts ?? []) {
      const env = { actionId: String(a.action_id), occurredAt: String(a.occurred_at) }
      const p = (a.payload ?? {}) as Record<string, unknown>
      const graded = (a.graded as 'correct' | 'wrong' | null) ?? null
      if (a.kind === 'answer') {
        row.answers.push({ ...env, answer: String(p.answer ?? ''), graded })
      } else if (a.kind === 'stuck') {
        row.stuckReports.push({
          ...env,
          axis: (p.stuck_axis as AttemptRow['stuckReports'][0]['axis']) ?? null,
        })
      } else if (a.kind === 'help') {
        // 도움 시점에 **서버가 확정한** 자산·구간을 그대로 되살린다.
        // 없으면 `''`·`'full'` 로 **만들지 않는다** — 없다는 사실을 올린다 (§7.2)
        const contentRefId = p.content_ref === undefined || p.content_ref === null
          ? null : String(p.content_ref)
        const segmentKey = p.segment_key === undefined || p.segment_key === null
          ? null : String(p.segment_key)
        if (contentRefId === null || segmentKey === null) {
          throw new Error(
            `도움 기록에 자산·구간이 없습니다 (action_id=${env.actionId}). `
            + '빈 값으로 복원하지 않습니다 — 저장 당시 payload 를 확인하세요',
          )
        }
        row.helpOpened.push({
          ...env,
          relationId: String(p.relation_ref ?? ''),
          contentRefId,
          segmentKey,
          // **서버가 검증한** 관측만 상태로 쓴다. 학생 원요청은 감사용으로 남아 있다
          observation: (p.observed_verified ?? { method: 'window_elapsed' }) as VideoObservationRecord,
        })
      } else if (a.kind === 'confirm') {
        row.confirmSubmissions.push({
          ...env,
          itemRef: String(p.item_ref ?? ''),
          answer: String(p.answer ?? ''),
          graded,
          origin: 'operational',
        })
      }
    }
    return row
  }

  /** 이 학생의 **이 run** 시도 전부 */
  async listAttempts(studentId: string): Promise<AttemptRow[]> {
    const { data, error } = await this.db('학습 기록 조회')
      .from('learning_attempts')
      .select('problem_id, source_kind, source_ref')
      .eq('student_id', studentId)
      .eq('run_id', this.opts.runId)
      .order('problem_id', { ascending: true })
    if (error) throw new Error(`시도 목록 조회 실패: ${error.message}`)
    const out: AttemptRow[] = []
    for (const a of data ?? []) {
      const taskId = taskIdOfSource(
        a.source_kind as SourceKind,
        a.source_ref === null ? null : String(a.source_ref),
      )
      const row = await this.loadAttempt(studentId, taskId, String(a.problem_id))
      if (row !== null) out.push(row)
    }
    return out
  }

  /** 이 run 에 **기록이 있는** 학생들. 전체 학생 명부를 읽지 않는다 */
  async listStudentsWithWork(): Promise<StudentRow[]> {
    const db = this.db('학습 기록 조회')
    const { data: att, error } = await db
      .from('learning_attempts')
      .select('student_id')
      .eq('run_id', this.opts.runId)
    if (error) throw new Error(`시도 학생 조회 실패: ${error.message}`)
    const ids = [...new Set((att ?? []).map((a) => String(a.student_id)))]
    if (ids.length === 0) return []
    const { data: rows, error: e2 } = await db
      .from('students')
      .select('id, name, is_active')
      .in('id', ids)
      .eq('is_active', true)
    if (e2) throw new Error(`학생 조회 실패: ${e2.message}`)
    return (rows ?? []).map((r): StudentRow => ({
      studentId: String(r.id),
      loginCode: '',
      displayName: String(r.name ?? ''),
      provenance: 'operational',
    }))
  }

  async getStudent(studentId: string): Promise<StudentRow | null> {
    const { data, error } = await this.db('학생 조회')
      .from('students')
      .select('id, name, is_active')
      .eq('id', studentId)
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw new Error(`학생 조회 실패: ${error.message}`)
    if (data === null || data === undefined) return null
    return {
      studentId: String(data.id),
      loginCode: '',
      displayName: String(data.name ?? ''),
      provenance: 'operational',
    }
  }

  /** 충돌로 들어온 줄까지 **전부** 돌려준다 — 보존됐음을 보이려고 */
  async listEvents(studentId: string): Promise<StoredEvent[]> {
    const { data, error } = await this.db('학습 기록 조회')
      .from('learning_actions')
      .select('action_id, producer, payload, received_at, verdict, is_canonical')
      .eq('student_id', studentId)
      .eq('run_id', this.opts.runId)
      .order('received_at', { ascending: true })
    if (error) throw new Error(`이벤트 조회 실패: ${error.message}`)
    return (data ?? []).map((e): StoredEvent => ({
      resolvedStudentScope: studentId,
      validatedProducer: String(e.producer),
      eventId: String(e.action_id),
      clientEvent: (e.payload ?? {}) as Record<string, unknown>,
      received_at: String(e.received_at),
      verdict: e.verdict as StoredEvent['verdict'],
    }))
  }
}
