/**
 * 학습 기록 저장소 — GPT-EXEC-041 · 042 §3-A-4
 *
 * 왜 인터페이스인가
 *   이번 시범은 **운영 DB 를 읽거나 쓰지 않는다** (EXEC-041 §5). 그래서 기록은
 *   파일 기반 **시험 저장소**에 넣는다. 다만 화면·API 가 보는 것은
 *   `LearningStore` 하나뿐이라, 뒤에 Supabase 저장소를 끼워도 화면은 그대로다.
 *   **운영 설정이 없을 때 이 저장소로 자동 전환하지 않는다** (EXEC-042 §2).
 *
 * 학생 격리
 *   모든 읽기·쓰기가 `studentId` 를 받고, 이 파일에서 **그 학생 것만** 돌려준다.
 *   `studentId` 는 **요청 본문이 아니라 세션**에서 온다 (`session.ts`).
 *
 * 042 §3-A-4 로 더한 것 — **한 번에 확정하기**
 *   041 은 `putAttempt()` 와 `appendEvent()` 가 각자 읽고 각자 썼다. 그래서
 *   이벤트만 실패해도 시도 상태는 이미 바뀌어 있었다 (R041-01 네 번째 줄).
 *   이제 `transact()` 안에서 **한 번 읽고 한 번 쓴다.** 중간에 던지면 아무것도
 *   저장되지 않는다. 요청끼리 겹치지 않도록 **차례로** 돌린다.
 *
 * 새로고침·재로그인
 *   파일에 쓰므로 브라우저를 새로 열거나 서버를 다시 띄워도 **서버에서 다시 읽힌다.**
 *   localStorage 가 아니다.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs'
import { join, dirname } from 'node:path'

import type {
  AttemptRow, PlanDraftRow, StoredEvent, StudentRow, TaskRow,
} from './contract'

/** 한 번의 읽기–고치기–쓰기 안에서 쓸 수 있는 것들 */
export interface LearningTx {
  getStudent(studentId: string): StudentRow | null
  listAssignedTasks(studentId: string): TaskRow[]
  findAttempt(studentId: string, taskId: string, problemId: string): AttemptRow | null
  putAttempt(row: AttemptRow): void
  findEvent(scope: string, producer: string, eventId: string): StoredEvent | null
  appendEvent(e: StoredEvent): void
  putPlanDraft(row: PlanDraftRow): void
  getPlanDraft(studentId: string, attemptId: string): PlanDraftRow | null
}

export interface LearningStore {
  /** 어디에 쓰는지 **숨기지 않는다.** 화면에 그대로 표시한다 */
  readonly backend: 'test_file' | 'supabase'
  readonly location: string

  findStudentByLoginCode(code: string): Promise<StudentRow | null>
  getStudent(studentId: string): Promise<StudentRow | null>
  listAssignedTasks(studentId: string): Promise<TaskRow[]>
  getAttempt(studentId: string, attemptId: string): Promise<AttemptRow | null>
  findAttempt(studentId: string, taskId: string, problemId: string): Promise<AttemptRow | null>
  listAttempts(studentId: string): Promise<AttemptRow[]>
  listEvents(studentId: string): Promise<StoredEvent[]>
  getPlanDraft(studentId: string, attemptId: string): Promise<PlanDraftRow | null>

  /**
   * 읽기–고치기–쓰기를 **한 덩어리로** 한다.
   * `fn` 이 던지면 저장하지 않는다. 요청끼리 겹치지 않는다.
   */
  transact<T>(fn: (tx: LearningTx) => T): Promise<T>
}

// ════════════════════════════════════════════════════════════════════
// 시험 저장소 — 파일 한 개. 운영 DB 가 아니다
// ════════════════════════════════════════════════════════════════════

type Db = {
  schemaVersion: '042-test-store.1'
  students: StudentRow[]
  tasks: TaskRow[]
  attempts: AttemptRow[]
  events: StoredEvent[]
  planDrafts: PlanDraftRow[]
}

const EMPTY: Db = {
  schemaVersion: '042-test-store.1',
  students: [], tasks: [], attempts: [], events: [], planDrafts: [],
}

export class FileLearningStore implements LearningStore {
  readonly backend = 'test_file' as const
  readonly location: string
  /** 요청을 차례로 돌리는 줄. 같은 파일을 동시에 고치지 않게 한다 */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private readonly file: string) {
    this.location = file
  }

  private read(): Db {
    if (!existsSync(this.file)) return structuredClone(EMPTY)
    let raw: Partial<Db>
    try {
      raw = JSON.parse(readFileSync(this.file, 'utf8')) as Partial<Db>
    } catch {
      // 깨진 파일을 **빈 것으로 덮지 않는다.** 읽기 실패는 올린다
      throw new Error(`시험 저장소를 읽을 수 없습니다: ${this.file}`)
    }
    // 기록 모양이 바뀌었는데 옛 파일을 읽으면 **엉뚱한 곳에서** 깨진다.
    // 여기서 멈추고 무엇을 해야 하는지 알린다 (지우면 씨앗부터 다시 선다).
    if (raw.schemaVersion !== undefined && raw.schemaVersion !== EMPTY.schemaVersion) {
      throw new Error(
        `시험 저장소 판이 다릅니다 (${String(raw.schemaVersion)} ≠ ${EMPTY.schemaVersion}). `
        + `지우고 다시 시작하세요: ${this.file}`,
      )
    }
    return { ...structuredClone(EMPTY), ...raw }
  }

  private write(db: Db): void {
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8')
    renameSync(tmp, this.file)
  }

  /** 줄 세워 한 번에 하나씩. 앞 작업이 실패해도 줄은 이어진다 */
  private serialize<T>(fn: () => T): Promise<T> {
    const run: Promise<T> = this.queue.then(() => fn(), () => fn())
    this.queue = run.then((): void => undefined, (): void => undefined)
    return run
  }

  async transact<T>(fn: (tx: LearningTx) => T): Promise<T> {
    return this.serialize(() => {
      const db = this.read()
      let dirty = false
      const tx: LearningTx = {
        getStudent: (id) => db.students.find((s) => s.studentId === id) ?? null,
        listAssignedTasks: (id) => db.tasks.filter((t) => t.studentId === id && t.assigned),
        findAttempt: (id, taskId, problemId) =>
          db.attempts.find((a) => a.studentId === id && a.taskId === taskId && a.problemId === problemId) ?? null,
        putAttempt: (row) => {
          const i = db.attempts.findIndex((a) => a.attemptId === row.attemptId)
          if (i >= 0) {
            if (db.attempts[i].studentId !== row.studentId) {
              throw new Error('다른 학생의 시도를 덮으려 했습니다')
            }
            db.attempts[i] = row
          } else db.attempts.push(row)
          dirty = true
        },
        findEvent: (scope, producer, eventId) =>
          db.events.find((e) =>
            e.resolvedStudentScope === scope && e.validatedProducer === producer && e.eventId === eventId,
          ) ?? null,
        appendEvent: (e) => { db.events.push(e); dirty = true },   // append-only
        putPlanDraft: (row) => {
          const i = db.planDrafts.findIndex(
            (p) => p.studentId === row.studentId && p.attemptId === row.attemptId,
          )
          if (i >= 0) db.planDrafts[i] = row
          else db.planDrafts.push(row)
          dirty = true
        },
        getPlanDraft: (id, attemptId) =>
          db.planDrafts.find((p) => p.studentId === id && p.attemptId === attemptId) ?? null,
      }
      // fn 이 던지면 아래 write 에 닿지 않는다 → 아무것도 저장되지 않는다
      const out = fn(tx)
      if (dirty) this.write(db)
      return out
    })
  }

  /** 씨앗 자료를 **없을 때만** 넣는다. 기존 기록을 덮지 않는다 */
  async seedIfEmpty(students: StudentRow[], tasks: TaskRow[]): Promise<void> {
    await this.serialize(() => {
      const db = this.read()
      let changed = false
      for (const s of students) {
        if (!db.students.some((x) => x.studentId === s.studentId)) { db.students.push(s); changed = true }
      }
      for (const t of tasks) {
        if (!db.tasks.some((x) => x.taskId === t.taskId)) { db.tasks.push(t); changed = true }
      }
      if (changed) this.write(db)
    })
  }

  // ── 읽기 전용 ─────────────────────────────────────────────────
  async findStudentByLoginCode(code: string): Promise<StudentRow | null> {
    return this.read().students.find((s) => s.loginCode === code) ?? null
  }

  async getStudent(studentId: string): Promise<StudentRow | null> {
    return this.read().students.find((s) => s.studentId === studentId) ?? null
  }

  async listAssignedTasks(studentId: string): Promise<TaskRow[]> {
    return this.read().tasks.filter((t) => t.studentId === studentId && t.assigned)
  }

  async getAttempt(studentId: string, attemptId: string): Promise<AttemptRow | null> {
    // 학생이 다르면 **없는 것으로** 돌려준다. 남의 기록을 알려주지 않는다
    return this.read().attempts.find(
      (a) => a.attemptId === attemptId && a.studentId === studentId,
    ) ?? null
  }

  async findAttempt(studentId: string, taskId: string, problemId: string): Promise<AttemptRow | null> {
    return this.read().attempts.find(
      (a) => a.studentId === studentId && a.taskId === taskId && a.problemId === problemId,
    ) ?? null
  }

  async listAttempts(studentId: string): Promise<AttemptRow[]> {
    return this.read().attempts.filter((a) => a.studentId === studentId)
  }

  async listEvents(studentId: string): Promise<StoredEvent[]> {
    return this.read().events.filter((e) => e.resolvedStudentScope === studentId)
  }

  async getPlanDraft(studentId: string, attemptId: string): Promise<PlanDraftRow | null> {
    return this.read().planDrafts.find(
      (p) => p.studentId === studentId && p.attemptId === attemptId,
    ) ?? null
  }
}

/**
 * 시험 저장소 파일 위치 — git 에 들어가지 않는 폴더.
 *
 * `LEARNING_TEST_STORE_FILE` 로 옮길 수 있다. **시험이 운영 폴더를 더럽히지 않도록**
 * 두는 것이고, 운영 저장소를 고르는 스위치가 아니다 — 이 저장소는 어차피 파일이다.
 *
 * 모듈을 불러올 때가 아니라 **쓸 때** 읽는다. 그래야 import 순서에 걸려 넘어지지 않는다.
 */
export function testStoreFile(): string {
  return process.env.LEARNING_TEST_STORE_FILE
    || join(process.cwd(), '.learning-test-store', 'store.json')
}

let shared: FileLearningStore | null = null
let sharedFile = ''
export function testStore(): FileLearningStore {
  const f = testStoreFile()
  if (shared === null || sharedFile !== f) {
    shared = new FileLearningStore(f)
    sharedFile = f
  }
  return shared
}
