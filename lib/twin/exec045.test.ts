/**
 * GPT-EXEC-045 검사 — **실제 route·실제 어댑터를 합성 SDK 로 끝에서 끝까지** 돌린다
 *
 * 무엇을 재는가 (045 §6-1·§6-2)
 *   「문항·영상 읽기 / 인증 / 저장 어댑터가 **실제 경로에 연결되어 있음**을
 *   호출 추적·시험으로 확인」. 그래서 이 파일은 베껴 쓴 사본을 돌리지 않는다 —
 *   `app/api/learning/.../route.ts` 를 **그대로 불러** POST·GET 을 돌리고,
 *   그 아래의 `supabaseAuth` · `supabaseContent` · `supabaseStore` · `operationalDeps` 도
 *   **전부 진짜 모듈**이다. 갈아 끼우는 것은 **SDK 하나**뿐이다
 *   (`__setLearningClientFactoryForTest`).
 *
 * ⚠️ 이 시험이 **증명하지 않는 것** — 숨기지 않고 먼저 적는다
 *   · 운영 DB 에 붙은 적이 **없다.** SDK 는 합성이다. 실제 키·망 접속이 없다.
 *   · `rpc('apply_learning_action')` 의 대역은 **SQL 의 사본이 아니다.** 반환 **계약**만
 *     흉내 낸다 (applied·duplicate·conflict 의 모양). 그래서 이 시험은
 *     **045_learning_actions.sql 이 맞다는 증거가 아니다.** SQL 은 아래 S 묶음에서
 *     글자로만 확인하고, 실제 실행은 격리 PostgreSQL 이 있어야 한다 (045 §5 — 못 했다).
 *   · 실제 브라우저·실제 유튜브 재생을 돌린 것이 아니다.
 *
 * 왜 대역을 둘 수 있나
 *   `__setLearningClientFactoryForTest` 는 `NODE_ENV === 'production'` 이면 **던진다**
 *   (아래 W4 가 그것을 확인한다). R041-04 에서 시험 장치가 운영에서 통한 일이 있어
 *   같은 실수를 반복하지 않으려고 둔 선이다.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { __setLearningClientFactoryForTest } from '../learning/supabaseClient'
import { __setLearningDepsForTest } from '../learning/deps'
import { forStudent, STUDENT_PROBLEM_FIELDS, SERVER_ONLY_PROBLEM_FIELDS } from '../learning/catalog'
import { gradeAnswerDetailed, parseChoiceTokens } from '../learning/grading'
import { parseApprovalSpec, ApprovalSpecError } from '../learning/approval'

const read = (p: string): string => readFileSync(p, 'utf8')
const SQL = 'docs/sql/migrations/045_learning_actions.sql'
const SQL_ROLLBACK = 'docs/sql/migrations/045_learning_actions_rollback.sql'

/** 주석을 뺀 **코드만** 본다 — 설명 글에 적힌 옛 경로가 걸리지 않게 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** SQL 의 주석을 뺀 본문 */
function sqlCode(src: string): string {
  return src.replace(/^\s*--.*$/gm, '')
}

// 시험 저장소를 **건드리지 않았는지** 보려면 따로 둔 폴더가 필요하다
const STORE_DIR = mkdtempSync(join(tmpdir(), 'learning-045-'))
process.env.LEARNING_TEST_STORE_FILE = join(STORE_DIR, 'store.json')
process.env.LEARNING_RUN_ID = 'test-045'
// 이 파일은 **운영 모드**를 본다. demo 는 켜지 않는다
delete process.env.LEARNING_DEMO_MODE
test.after(() => {
  __setLearningClientFactoryForTest(null)
  __setLearningDepsForTest(null)
  rmSync(STORE_DIR, { recursive: true, force: true })
})

// ════════════════════════════════════════════════════════════════════
// 합성 SDK — **표를 메모리에 두고** 어댑터의 조회를 그대로 받는다
// ════════════════════════════════════════════════════════════════════

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>

type CallLog = {
  /** 어느 표에 어떤 순서로 무엇을 걸었나 */
  queries: Array<{ table: string; steps: Array<[string, ...unknown[]]> }>
  rpcs: Array<{ name: string; args: Row }>
  signed: Array<{ bucket: string; paths: string[] }>
  authTokens: string[]
}

const STUDENT_A = '11111111-1111-4111-8111-111111111111'
const STUDENT_B = '22222222-2222-4222-8222-222222222222'
const AUTH_A = 'auth-uid-A'
const SHEET = '33333333-3333-4333-8333-333333333333'
const SHEET_B = '44444444-4444-4444-8444-444444444444'
/** 안전 정수를 **넘는** 문항 id — `Number()` 가 끼면 값이 바뀐다 (탐침 P06) */
const BIG_ID = '9007199254740993'
const VID1 = '350b973a-46f6-4dee-981e-0143f8312423'
const VID2 = '8e59d4bc-1e4f-4e65-b056-40c948da4fd8'
const VID3 = '58671e09-3268-45b1-895a-34f3fca3eaaa'

function freshTables(): Tables {
  return {
    students: [
      { id: STUDENT_A, name: '시험학생A', session_uid: AUTH_A, user_id: null, is_active: true },
      { id: STUDENT_B, name: '시험학생B', session_uid: 'auth-uid-B', user_id: null, is_active: true },
    ],
    standard_types: [
      { code: '공수1-01-02', grade: '공통수학1', chapter_title: '다항식',
        sub_chapter_title: '곱셈 공식', type_title: '다항식 전개식에서 계수 구하기', sort_order: 1 },
      { code: '공수1-01-07', grade: '공통수학1', chapter_title: '다항식',
        sub_chapter_title: '곱셈 공식의 변형', type_title: '곱셈 공식의 변형', sort_order: 2 },
    ],
    problems: [
      { id: BIG_ID, type_code: '공수1-01-02', grade: '공통수학1', book: '쎈', local_no: '001',
        page_no: 10, difficulty: 'B', is_essay: false, answer_kind: 'choice',
        answer_text: '③', image_path: 'ssen/q-001.png', answer_image_path: 'private/a-001.png' },
      { id: '102', type_code: '공수1-01-02', grade: '공통수학1', book: '쎈', local_no: '002',
        page_no: 10, difficulty: 'B', is_essay: false, answer_kind: 'number',
        answer_text: '14', image_path: 'ssen/q-002.png', answer_image_path: 'private/a-002.png' },
      { id: '201', type_code: '공수1-01-07', grade: '공통수학1', book: '쎈', local_no: '003',
        page_no: 20, difficulty: 'C', is_essay: false, answer_kind: 'number',
        answer_text: '26', image_path: 'ssen/q-003.png', answer_image_path: 'private/a-003.png' },
    ],
    lesson_videos: [
      { id: VID1, grade: '공통수학1', kind: '대표예제', order_label: '02-풀이01',
        title: '필수예제 02 다항식의 전개식에서 계수 구하기', chapter: '다항식', sub_chapter: '곱셈 공식',
        book: '개념유형', youtube_id: 'aaaaaaaaaaa', duration_seconds: 86.296,
        // 장면의 초가 **null** 이다 — 0 으로 바뀌면 안 된다 (탐침 P07)
        scenes: [{ start: null, end: null, label: '도입' }],
        type_codes: ['공수1-01-02'], is_active: true },
      { id: VID2, grade: '공통수학1', kind: '개념', order_label: '03', title: '곱셈 공식의 변형',
        chapter: '다항식', sub_chapter: '곱셈 공식의 변형', book: '개념유형',
        youtube_id: 'bbbbbbbbbbb', duration_seconds: 175.867,
        scenes: [{ start: '', end: true, label: '개념 Check 정답' }],
        type_codes: ['공수1-01-07', '공수1-01-07'], is_active: true },
      { id: VID3, grade: '공통수학1', kind: '증명', order_label: '03-증명1',
        title: '곱셈 공식의 변형 (4) 유도', chapter: '다항식', sub_chapter: '곱셈 공식의 변형',
        book: '개념유형', youtube_id: 'ccccccccccc', duration_seconds: 137.425,
        scenes: [{ start: 12, end: 48, label: '유도' }],
        type_codes: ['공수1-01-07'], is_active: true },
    ],
    // 「배정」 = 이 학생이 **실제로 제출한** 시험지 (operationalDeps 가 설명한 그대로)
    gradings: [{ id: 'g-1', sheet_id: SHEET, student_id: STUDENT_A },
               { id: 'g-2', sheet_id: SHEET_B, student_id: STUDENT_B }],
    exam_sheets: [{ id: SHEET, code: 'ABC123', title: '다항식 1차' },
                  { id: SHEET_B, code: 'XYZ789', title: 'B 학생 시험지' }],
    exam_sheet_problems: [
      { sheet_id: SHEET, no: 1, problem_id: BIG_ID },
      { sheet_id: SHEET, no: 2, problem_id: '102' },
      { sheet_id: SHEET_B, no: 1, problem_id: '201' },
    ],
    learning_attempts: [],
    learning_actions: [],
    video_watch_logs: [],
  }
}

function makeClient(tables: Tables, log: CallLog) {
  function builder(table: string) {
    const steps: Array<[string, ...unknown[]]> = []
    let rows = (tables[table] ?? []).map((r) => ({ ...r }))
    const api: Record<string, unknown> = {}

    const push = (name: string, ...args: unknown[]): typeof api => {
      steps.push([name, ...args])
      return api as typeof api
    }
    api.select = (cols: string) => push('select', cols)
    api.eq = (c: string, v: unknown) => {
      rows = rows.filter((r) => String(r[c]) === String(v))
      return push('eq', c, v)
    }
    api.in = (c: string, vs: unknown[]) => {
      const set = new Set(vs.map(String))
      rows = rows.filter((r) => set.has(String(r[c])))
      return push('in', c, vs)
    }
    api.is = (c: string, v: unknown) => {
      rows = rows.filter((r) => (v === null ? (r[c] === null || r[c] === undefined) : r[c] === v))
      return push('is', c, v)
    }
    api.not = (c: string, op: string, v: unknown) => {
      if (op === 'is' && v === null) rows = rows.filter((r) => r[c] !== null && r[c] !== undefined)
      return push('not', c, op, v)
    }
    api.order = (c: string, o?: { ascending?: boolean }) => {
      const asc = o?.ascending !== false
      rows = [...rows].sort((a, b) => {
        const x = String(a[c] ?? ''); const y = String(b[c] ?? '')
        // 큰 정수 id 를 글자로 견주면 자리수 때문에 어긋난다. 길이 먼저 본다
        const cmp = x.length === y.length ? (x < y ? -1 : x > y ? 1 : 0) : x.length - y.length
        return asc ? cmp : -cmp
      })
      return push('order', c, o)
    }
    api.limit = (n: number) => { rows = rows.slice(0, n); return push('limit', n) }
    api.maybeSingle = async (): Promise<{ data: Row | null; error: { message: string } | null }> => {
      steps.push(['maybeSingle'])
      log.queries.push({ table, steps })
      if (rows.length > 1) return { data: null, error: { message: '여러 행' } }
      return { data: rows[0] ?? null, error: null }
    }
    api.then = (res: (v: { data: Row[]; error: null }) => unknown) => {
      log.queries.push({ table, steps })
      return Promise.resolve(res({ data: rows, error: null }))
    }
    return api
  }

  return {
    from: (t: string) => builder(t),
    auth: {
      getUser: async (token: string): Promise<{
        data: { user: { id: string } | null }; error: { message: string } | null
      }> => {
        log.authTokens.push(token)
        if (token !== `token-${AUTH_A}`) return { data: { user: null }, error: { message: '없음' } }
        return { data: { user: { id: AUTH_A } }, error: null }
      },
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[], _s: number): Promise<{
          data: Array<{ path: string; signedUrl: string; error: string | null }>
          error: { message: string } | null
        }> => {
          log.signed.push({ bucket, paths: [...paths] })
          return {
            data: paths.map((p): { path: string; signedUrl: string; error: string | null } => ({
              path: p, signedUrl: `https://signed.example/${p}?t=1`, error: null,
            })),
            error: null,
          }
        },
      }),
    },
    /**
     * `apply_learning_action` 의 **계약 대역**이다. SQL 의 사본이 **아니다.**
     * applied·duplicate·conflict 의 모양과 「중복은 문맥까지 같아야 한다」만 흉내 낸다.
     */
    rpc: async (name: string, args: Row): Promise<{
      data: Row | null; error: { message: string } | null
    }> => {
      log.rpcs.push({ name, args: { ...args } })
      if (name !== 'apply_learning_action') return { data: null, error: { message: '모르는 함수' } }
      const a = args as Record<string, string | null>
      const prev = (tables.learning_actions as Row[]).find((r) =>
        String(r.student_id) === String(a.p_student_id)
        && String(r.producer) === String(a.p_producer)
        && String(r.action_id) === String(a.p_action_id)
        && r.is_canonical === true)
      if (prev !== undefined) {
        const att = (tables.learning_attempts as Row[]).find((t) => t.id === prev.attempt_id) ?? {}
        const same = String(prev.kind) === String(a.p_kind)
          && String(prev.occurred_at) === String(a.p_occurred_at)
          && JSON.stringify(prev.payload) === JSON.stringify(args.p_payload)
          && String(att.problem_id) === String(a.p_problem_id)
          && String(att.source_kind) === String(a.p_source_kind)
          && String(att.source_ref ?? '') === String(a.p_source_ref ?? '')
          && String(att.run_id) === String(a.p_run_id)
        if (same) {
          return { data: { verdict: 'duplicate', attempt_id: prev.attempt_id,
            graded: prev.graded ?? null, action_kind: prev.kind, changed_fields: [], reason: null }, error: null }
        }
        ;(tables.learning_actions as Row[]).push({
          id: `ac-${(tables.learning_actions as Row[]).length + 1}`,
          attempt_id: prev.attempt_id, student_id: a.p_student_id,
          action_id: a.p_action_id, producer: a.p_producer, is_canonical: false,
          kind: a.p_kind, occurred_at: a.p_occurred_at, payload: args.p_payload,
          verdict: 'conflict', graded: null, run_id: a.p_run_id,
        })
        return { data: { verdict: 'conflict', attempt_id: prev.attempt_id, graded: null,
          action_kind: a.p_kind, changed_fields: ['payload'], reason: null }, error: null }
      }
      let att = (tables.learning_attempts as Row[]).find((t) =>
        String(t.student_id) === String(a.p_student_id)
        && String(t.problem_id) === String(a.p_problem_id)
        && String(t.source_kind) === String(a.p_source_kind)
        && String(t.source_ref ?? '') === String(a.p_source_ref ?? '')
        && String(t.run_id) === String(a.p_run_id))
      if (att === undefined) {
        att = {
          id: `at-${(tables.learning_attempts as Row[]).length + 1}`,
          student_id: a.p_student_id, problem_id: a.p_problem_id,
          source_kind: a.p_source_kind, source_ref: a.p_source_ref,
          run_id: a.p_run_id, started_at: '2026-10-29T00:00:00.000Z',
          updated_at: '2026-10-29T00:00:00.000Z',
        }
        ;(tables.learning_attempts as Row[]).push(att)
      }
      ;(tables.learning_actions as Row[]).push({
        id: `ac-${(tables.learning_actions as Row[]).length + 1}`,
        attempt_id: att.id, student_id: a.p_student_id,
        action_id: a.p_action_id, producer: a.p_producer, is_canonical: true,
        kind: a.p_kind, occurred_at: a.p_occurred_at, payload: args.p_payload,
        verdict: 'applied', graded: a.p_graded ?? null, run_id: a.p_run_id,
      })
      return { data: { verdict: 'applied', attempt_id: att.id, graded: a.p_graded ?? null,
        action_kind: a.p_kind, changed_fields: [], reason: null }, error: null }
    },
  }
}

type Harness = { tables: Tables; log: CallLog }

function install(): Harness {
  const tables = freshTables()
  const log: CallLog = { queries: [], rpcs: [], signed: [], authTokens: [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  __setLearningClientFactoryForTest(() => makeClient(tables, log) as any)
  return { tables, log }
}

let seq = 0
const nextId = (): string => `act-045-${Date.now()}-${++seq}`

async function act(body: Row, token = `token-${AUTH_A}`) {
  const { POST } = await import('../../app/api/learning/act/route')
  const req = new Request('http://localhost/api/learning/act', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  return { status: res.status, json: (await res.json()) as Row }
}

async function sessionGet(token = `token-${AUTH_A}`) {
  const { GET } = await import('../../app/api/learning/session/route')
  const req = new Request('http://localhost/api/learning/session', {
    headers: { authorization: `Bearer ${token}` },
  })
  const res = await GET(req)
  return { status: res.status, json: (await res.json()) as Row }
}

const TASK = `exam_sheet:${SHEET}`
const env = (): Row => ({ actionId: nextId(), occurredAt: new Date().toISOString() })

// ════════════════════════════════════════════════════════════════════
// W. 연결 — provider 가 **실제 경로에** 꽂혀 있는가 (045 §6-2)
// ════════════════════════════════════════════════════════════════════

test('W1 엔진이 **시연 상수·시험 저장소를 직접 부르지 않는다**', () => {
  const src = codeOnly(read('lib/learning/engine.ts'))
  assert.ok(!/from '\.\/store'/.test(src), '엔진이 아직 store.ts 를 import 합니다')
  assert.ok(!/testStore\(/.test(src), '엔진이 아직 testStore() 를 부릅니다')
  // `catalog` 에서 가져오는 것은 **학생 모양 만들기와 그 자료형**뿐이어야 한다
  const fromCatalog = src.match(/import \{([^}]*)\} from '\.\/catalog'/)
  assert.ok(fromCatalog !== null, '엔진이 catalog 를 아예 안 쓰면 이 시험을 고치세요')
  const names = fromCatalog[1].split(',').map((x) => x.replace(/\btype\b/, '').trim()).filter(Boolean)
  assert.deepEqual(names.sort(), ['ProblemForStudent', 'forStudent'],
    `엔진이 시연 상수를 아직 가져옵니다: ${names.join(', ')}`)
  for (const bad of ['PILOT_TYPES', 'CATALOG_NOTE', 'PROBLEMS', 'ASSETS', 'problemById', 'assetById',
    'relationsFor', 'gradeProblem', 'gradeConfirmItem']) {
    assert.ok(!names.includes(bad), `엔진이 ${bad} 를 직접 가져옵니다`)
  }
})

test('W2 운영 모드의 의존성은 **운영 조회·운영 저장소**다 — 시연으로 돌아가지 않는다', async () => {
  install()
  const { resolveLearningDeps } = await import('../learning/deps')
  const d = await resolveLearningDeps()
  assert.equal(d.mode, 'operational')
  assert.equal(d.content.source, 'supabase', '운영인데 시연 카탈로그가 들어왔습니다')
  assert.equal(d.store.backend, 'supabase', '운영인데 파일 저장소가 들어왔습니다')
  // 운영에는 계획 초안 표가 **없다.** 숨기지 않는다
  assert.equal(d.store.planDraftPersisted, false)
  // 첫 세트 상한을 넘기지 않았다
  assert.ok(d.content.problems.length <= 10)
  assert.ok(d.content.assets.length <= 3)
})

test('W3 운영 행동은 **RPC 로 가고 시험 저장소를 건드리지 않는다**', async () => {
  const h = install()
  const { testStore } = await import('../learning/store')
  const before = (await testStore().listEvents(STUDENT_A)).length

  const r = await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  assert.equal(r.status, 200, JSON.stringify(r.json))
  assert.equal(r.json.verdict, 'applied')
  assert.equal(r.json.mode, 'operational')
  assert.equal(r.json.contentSource, 'supabase')
  assert.equal((r.json.storage as Row).backend, 'supabase')

  assert.equal(h.log.rpcs.length, 1, 'RPC 를 한 번 부르지 않았습니다')
  assert.equal(h.log.rpcs[0].name, 'apply_learning_action')
  // 인증·문항·영상·배정 조회가 **실제로** 일어났다
  const tablesTouched = new Set(h.log.queries.map((q) => q.table))
  for (const t of ['students', 'problems', 'lesson_videos', 'gradings', 'exam_sheet_problems']) {
    assert.ok(tablesTouched.has(t), `${t} 를 읽지 않았습니다 — 어댑터가 꽂히지 않았습니다`)
  }
  assert.ok(h.log.authTokens.length > 0, '토큰으로 학생을 확정하지 않았습니다')
  assert.equal((await testStore().listEvents(STUDENT_A)).length, before,
    '운영인데 시험 저장소에 기록이 남았습니다')
})

test('W4 시험 대역은 **운영 빌드에서 못 끼운다** (R041-04 반복 금지)', async () => {
  const envs = process.env as Record<string, string | undefined>
  const saved = envs.NODE_ENV
  try {
    envs.NODE_ENV = 'production'
    assert.throws(() => __setLearningClientFactoryForTest(() => ({}) as never), /운영 빌드/)
    assert.throws(() => __setLearningDepsForTest(null), /운영 빌드/)
  } finally {
    if (saved === undefined) delete envs.NODE_ENV
    else envs.NODE_ENV = saved
  }
})

// ════════════════════════════════════════════════════════════════════
// E. 한 바퀴 — 로그인 → 배정 문항 → 답 → 도움 → 재풀이 → 재접속 → 강사 요약
// ════════════════════════════════════════════════════════════════════

test('E1 **같은 route 로 한 바퀴**를 돈다 — 배정 문항만, 서버가 채점한다', async () => {
  const h = install()

  // ① 입장 — 배정은 `gradings` + `exam_sheet_problems` 에서 온다
  const s = await sessionGet()
  assert.equal(s.json.signedIn, true, JSON.stringify(s.json))
  assert.equal(s.json.matchedBy, 'session_uid', '익명 세션이 아니라 다른 칸으로 찾았습니다')
  const tasks = s.json.tasks as Array<Row>
  assert.equal(tasks.length, 1, '배정된 시험지 하나만 나와야 합니다')
  assert.equal(tasks[0].taskId, TASK)
  assert.equal(tasks[0].label, '다항식 1차')
  const entries = tasks[0].problems as Array<Row>
  // B 학생 시험지의 문항(201)은 **들어오지 않는다**
  assert.deepEqual(entries.map((e) => (e.problem as Row).problemId).sort(), ['102', BIG_ID].sort())
  // 원문 그림은 **서명된 주소**로 온다
  assert.match(String(entries[0].imageUrl), /^https:\/\/signed\.example\//)
  assert.equal(h.log.signed[0].bucket, 'problem-images')
  // 해설 그림은 서명하지 않았다
  assert.ok(!h.log.signed.some((x) => x.paths.some((p) => p.startsWith('private/'))),
    '해설 그림을 서명했습니다')

  // ② 열기 → ③ 틀린 답 → ④ 막힘
  await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  const wrong = await act({ action: 'answer', taskId: TASK, problemId: BIG_ID, answer: '④', ...env() })
  assert.equal(wrong.json.verdict, 'applied')
  assert.equal(wrong.json.graded, 'wrong', '서버 채점이 오답을 잡지 못했습니다')
  const stuck = await act({ action: 'stuck', taskId: TASK, problemId: BIG_ID, axis: 'recall', ...env() })
  assert.equal(stuck.json.verdict, 'applied')

  // ⑤ 도움 — **승인 명세가 비어 있으므로 열 자료가 없다.** 그것이 지금의 사실이다
  const help = stuck.json.help as Row
  assert.notEqual(help, null)
  const rec = (help.preview as Row).recommendedAction as Row
  assert.equal(rec.relationId, null, '승인이 없는데 영상을 권했습니다')
  assert.equal(help.asset, null, '승인이 없는데 자산을 보냈습니다')

  // ⑥ 맞는 답으로 재풀이
  const right = await act({ action: 'answer', taskId: TASK, problemId: BIG_ID, answer: '③', ...env() })
  assert.equal(right.json.graded, 'correct')
  const sum = right.json.summary as Row
  assert.equal(sum.firstResult, 'wrong')
  assert.equal(sum.lastResult, 'correct')
  assert.equal(sum.answerCount, 2)

  // ⑦ 계획 초안 — 운영에는 표가 없다. **저장했다고 말하지 않는다**
  assert.equal(right.json.planDraftPersisted, false)
  assert.equal(right.json.planDraft, null)

  // ⑧ 재접속 — 같은 근거로 **다시 세워진다**
  const again = await sessionGet()
  const e2 = ((again.json.tasks as Row[])[0].problems as Row[])
    .find((e) => (e.problem as Row).problemId === BIG_ID)
  const att = e2.attempt as Row
  assert.equal(att.taskId, TASK, '재접속 뒤 과제가 문항 id 로 바뀌었습니다 (§7.2)')
  assert.equal(att.problemId, BIG_ID)
  assert.equal((att.answers as Row[]).length, 2)
  assert.deepEqual((att.answers as Row[]).map((x) => x.graded), ['wrong', 'correct'])

  // ⑨ 강사 요약 — 같은 자료가 같게 보인다
  const { teacherRows } = await import('../learning/engine')
  const { resolveLearningDeps } = await import('../learning/deps')
  const rows = await teacherRows(await resolveLearningDeps())
  const mine = rows.find((x) => x.problemId === BIG_ID)
  assert.notEqual(mine, undefined, '강사 요약에 이 시도가 없습니다')
  assert.equal(mine.taskLabel, '다항식 1차')
  assert.equal(mine.summary.firstResult, 'wrong')
  assert.equal(mine.summary.lastResult, 'correct')
  assert.equal(mine.planDraft, null, '운영에 없는 계획 초안을 만들어 보여 줬습니다')
})

test('E2 학생에게 가는 응답에 **정답·해설·저장소 경로가 없다**', async () => {
  install()
  await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  const answered = await act({
    action: 'answer', taskId: TASK, problemId: BIG_ID, answer: '③', ...env(),
  })
  const s = await sessionGet()

  for (const [label, payload] of [['session', s.json], ['act', answered.json]] as const) {
    const text = JSON.stringify(payload)
    // 정답 글자(`③`)는 학생이 **보낸** 값으로 되돌아올 수 있다. 그래서 칸 이름으로 본다
    for (const bad of ['answer_text', 'answerText', 'answerImagePath', 'answer_image_path',
      'imagePath', 'image_path']) {
      assert.ok(!text.includes(bad), `${label} 응답에 ${bad} 가 들어 있습니다`)
    }
    // 해설 경로는 **어떤 모양으로도** 나가지 않는다 — 서명조차 하지 않았다
    assert.ok(!/private\//.test(text), `${label} 응답에 해설 경로가 들어 있습니다`)
    // 원문 그림은 **서명된 주소 안**에만 있어야 한다. 서명 주소에 대상 경로가
    // 들어 있는 것은 정상이다 (그것이 서명하는 대상이다). 그래서 서명 주소를
    // 덜어 낸 뒤 **날것의 저장소 경로**가 남아 있는지 본다
    const withoutSigned = text.replace(/https:\/\/signed\.example\/[^"\\]*/g, '')
    assert.ok(!/ssen\/q-/.test(withoutSigned),
      `${label} 응답에 서명되지 않은 원문 저장소 경로가 들어 있습니다`)
    // 서명 주소는 실제로 있었다 — 위 치환이 전부 지워 버린 것이 아니다
    if (label === 'session') assert.match(text, /https:\/\/signed\.example\//)
  }
})

test('E3 도움 기록은 **자산·구간을 빈 값으로 복원하지 않는다** (§7.2)', async () => {
  const h = install()
  // 승인 명세를 **그 자리에서** 한 줄 넣어 도움 한 번을 실제로 돌린다.
  // (저장소의 명세 파일은 비어 있다 — 이 시험만의 임시 파일이다)
  const specFile = join(STORE_DIR, 'approval.json')
  const { writeFileSync } = await import('node:fs')
  writeFileSync(specFile, JSON.stringify({
    specVersion: 'test-045', specNote: '시험용',
    problemRoles: [{ problemId: BIG_ID, role: 'source' }, { problemId: '102', role: 'confirm' }],
    relations: [{
      relationId: 'rel-test-1', problemId: BIG_ID, assetId: VID3, assetVersion: 1,
      relationKind: 'concept_explanation', videoKind: 'proof', supportedAxes: ['recall'],
      segment: { startSeconds: 12, endSeconds: 48, sceneNo: 1 },
      wholeFileSafe: true, confirmProblemIds: ['102'],
      exposure: { verdict: 'safe', reviewedBy: '시험', reviewedAt: '2026-10-29T00:00:00Z' },
      evidence: '시험용 한 줄',
    }],
  }), 'utf8')
  const saved = process.env.LEARNING_APPROVAL_SPEC
  process.env.LEARNING_APPROVAL_SPEC = specFile
  const { __clearApprovalSpecCache } = await import('../learning/approval')
  __clearApprovalSpecCache()

  try {
    await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
    await act({ action: 'stuck', taskId: TASK, problemId: BIG_ID, axis: 'recall', ...env() })
    const r = await act({
      action: 'help', taskId: TASK, problemId: BIG_ID, relationId: 'rel-test-1',
      observation: { method: 'player_coverage', coveragePct: 50, coveredSeconds: 18,
        playedSeconds: 20, watchedRanges: [[12, 30]] },
      ...env(),
    })
    assert.equal(r.json.verdict, 'applied', JSON.stringify(r.json))

    // 저장된 payload 에 **자산·판·구간**이 들어 있다
    const sent = h.log.rpcs.find((x) => (x.args as Row).p_kind === 'help')
    const payload = (sent.args as Row).p_payload as Row
    assert.equal(payload.content_ref, VID3)
    assert.equal(payload.asset_version, 1)
    assert.equal(payload.segment_key, '12-48')
    // 학생 원요청과 서버 검증 관측을 **갈라** 적었다
    assert.notEqual(payload.observed_requested, undefined)
    assert.notEqual(payload.observed_verified, undefined)
    assert.notDeepEqual(payload.observed_requested, payload.observed_verified)

    // 되읽어도 그 둘이 **빈 값으로 바뀌지 않는다**
    const s = await sessionGet()
    const e = ((s.json.tasks as Row[])[0].problems as Row[])
      .find((x) => (x.problem as Row).problemId === BIG_ID)
    const opened = ((e.attempt as Row).helpOpened as Row[])[0]
    assert.equal(opened.contentRefId, VID3, '자산이 빈 글자로 복원됐습니다')
    assert.equal(opened.segmentKey, '12-48', "구간이 'full' 로 복원됐습니다")

    // 영상은 **유튜브 재생기**로 가야 한다 — HTML video 에 embed 주소를 꽂지 않는다
    const help = r.json.help as Row
    const asset = help.asset as Row
    assert.equal(asset.media, 'youtube')
    assert.equal(asset.youtubeId, 'ccccccccccc')
  } finally {
    if (saved === undefined) delete process.env.LEARNING_APPROVAL_SPEC
    else process.env.LEARNING_APPROVAL_SPEC = saved
    __clearApprovalSpecCache()
  }
})

test('E4 **남의 시험지·범위 밖 문항은 저장 전에 막힌다** — RPC 가 불리지 않는다', async () => {
  const h = install()
  // B 학생의 시험지 문항
  const other = await act({ action: 'open', taskId: `exam_sheet:${SHEET_B}`, problemId: '201', ...env() })
  assert.equal(other.status, 403)
  assert.equal(other.json.verdict, 'rejected')
  // 배정된 시험지이지만 그 시험지에 없는 문항
  const notOnSheet = await act({ action: 'open', taskId: TASK, problemId: '201', ...env() })
  assert.equal(notOnSheet.status, 403)
  // 과제 id 를 손으로 지어낸 경우
  const made = await act({ action: 'open', taskId: 'exam_sheet:made-up', problemId: BIG_ID, ...env() })
  assert.equal(made.status, 403)

  assert.equal(h.log.rpcs.length, 0, '범위 밖 요청인데 저장을 시도했습니다')
  assert.equal((h.tables.learning_attempts as Row[]).length, 0)
})

test('E5 같은 봉투를 다시 보내면 **중복**이고 채점이 보존된다', async () => {
  const h = install()
  const e = env()
  const body = { action: 'answer', taskId: TASK, problemId: BIG_ID, answer: '③', ...e }
  await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  const first = await act(body)
  assert.equal(first.json.verdict, 'applied')
  assert.equal(first.json.graded, 'correct')

  const canonicalBefore = (h.tables.learning_actions as Row[]).filter((r) => r.is_canonical).length
  const again = await act(body)
  assert.equal(again.json.verdict, 'duplicate')
  assert.equal(again.json.graded, 'correct', '중복에 채점이 빠졌습니다 (§5 가 짚은 반환 모양)')
  assert.equal((h.tables.learning_actions as Row[]).filter((r) => r.is_canonical).length,
    canonicalBefore, '중복인데 받아들인 줄이 늘었습니다')
})

test('E6 같은 id 로 다른 내용이 오면 **충돌**이고 상태가 바뀌지 않는다', async () => {
  const h = install()
  const e = env()
  await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  await act({ action: 'answer', taskId: TASK, problemId: BIG_ID, answer: '③', ...e })
  const before = JSON.stringify(h.tables.learning_attempts)

  const clash = await act({ action: 'answer', taskId: TASK, problemId: BIG_ID, answer: '④', ...e })
  assert.equal(clash.status, 409)
  assert.equal(clash.json.verdict, 'conflict')
  assert.equal(clash.json.graded, null, '충돌을 채점했습니다')
  assert.equal(JSON.stringify(h.tables.learning_attempts), before, '충돌인데 시도가 바뀌었습니다')
  // 둘 다 보존됐다
  assert.equal((h.tables.learning_actions as Row[]).filter((r) => r.verdict === 'conflict').length, 1)
})

test('E7 문항 id 가 **큰 정수여도 글자 그대로** RPC 로 간다 (탐침 P06)', async () => {
  const h = install()
  await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  const sent = h.log.rpcs[0].args as Row
  assert.equal(typeof sent.p_problem_id, 'string', '문항 id 를 숫자로 보냈습니다')
  assert.equal(sent.p_problem_id, BIG_ID)
  assert.notEqual(sent.p_problem_id, 9007199254740992)
  // 조회 쪽도 글자다
  const q = h.log.queries.find((x) => x.table === 'learning_attempts')
  const eqProblem = q.steps.find((st) => st[0] === 'eq' && st[1] === 'problem_id')
  assert.equal(typeof eqProblem[2], 'string')
})

test('E8 운영 설정이 없으면 **503 이고 시연으로 바꾸지 않는다**', async () => {
  __setLearningClientFactoryForTest(null)
  const envs = process.env as Record<string, string | undefined>
  const savedUrl = envs.NEXT_PUBLIC_SUPABASE_URL
  const savedKey = envs.SUPABASE_SERVICE_ROLE_KEY
  try {
    delete envs.NEXT_PUBLIC_SUPABASE_URL
    delete envs.SUPABASE_SERVICE_ROLE_KEY
    const r = await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
    assert.equal(r.status, 401, '토큰 확인이 설정보다 먼저 와야 합니다')
    assert.equal(r.json.deny, 'not_configured')
    assert.ok(!/시연|demo-p-/.test(JSON.stringify(r.json)), '설정이 없는데 시연 자료가 섞였습니다')
  } finally {
    if (savedUrl !== undefined) envs.NEXT_PUBLIC_SUPABASE_URL = savedUrl
    if (savedKey !== undefined) envs.SUPABASE_SERVICE_ROLE_KEY = savedKey
  }
})

// ════════════════════════════════════════════════════════════════════
// F. 칸 단위로 고친 것들
// ════════════════════════════════════════════════════════════════════

test('F1 학생 모양은 **더하는 목록**이다 — 새 칸이 따라 나가지 않는다 (§7.1)', () => {
  const p: Record<string, unknown> = {
    problemId: 'x', typeCode: 'c', taskGoal: 'solve' as const, stem: '', choices: null,
    answer: '③', provenance: 'operational' as const, answerKind: 'choice' as const,
    isEssay: false, imagePath: 'ssen/q.png', answerImagePath: 'private/a.png',
    localNo: '1', book: '쎈',
    // **목록에 없는 새 칸.** 조용히 따라 나가면 안 된다
    internalReviewReason: '답이 드러남',
  }
  const out = forStudent(p as never) as Record<string, unknown>
  for (const bad of [...SERVER_ONLY_PROBLEM_FIELDS, 'internalReviewReason']) {
    assert.equal(out[bad], undefined, `${bad} 가 학생 모양에 남았습니다`)
  }
  for (const k of Object.keys(out)) {
    assert.ok((STUDENT_PROBLEM_FIELDS as readonly string[]).includes(k),
      `허용 목록에 없는 칸이 나갔습니다: ${k}`)
  }
  // 목록 자체가 겹치지 않는다
  for (const k of SERVER_ONLY_PROBLEM_FIELDS) {
    assert.ok(!(STUDENT_PROBLEM_FIELDS as readonly string[]).includes(k))
  }
})

test('F2 객관식 자유 입력은 **유효 토큰만** 받는다 — `30` 을 ③ 로 채점하지 않는다 (탐침 P08)', () => {
  const p = { answerKind: 'choice' as const, answerText: '③', isEssay: false }
  // 그 사고 그대로
  const bad = gradeAnswerDetailed(p, '30')
  assert.equal(bad.result, null, "'30' 을 채점했습니다")
  assert.equal(bad.unsupportedInput, true, '미지원을 오답과 섞었습니다')
  assert.notEqual(bad.why, null)
  // 「미지원」은 **오답이 아니다**
  assert.notEqual(bad.result, 'wrong')

  for (const s of ['30', '0', '6', '3x', '33', '③번', '삼']) {
    assert.equal(parseChoiceTokens(s), null, `'${s}' 를 보기 번호로 읽었습니다`)
  }
  for (const [s, want] of [['③', ['3']], ['3', ['3']], ['③, ⑤', ['3', '5']],
    ['3,5', ['3', '5']], ['3 5', ['3', '5']]] as const) {
    assert.deepEqual(parseChoiceTokens(s), want)
  }
  // 전에 통하던 것은 그대로 통한다
  assert.equal(gradeAnswerDetailed(p, '③').result, 'correct')
  assert.equal(gradeAnswerDetailed(p, '3').result, 'correct')
  assert.equal(gradeAnswerDetailed(p, '④').result, 'wrong')
  assert.equal(gradeAnswerDetailed(p, '').result, 'wrong')   // 빈 제출은 미지원이 아니다
  assert.equal(gradeAnswerDetailed(p, '').unsupportedInput, false)
})

test('F3 **승인 명세가 비어 있으면 영상이 학생에게 나가지 않는다**', async () => {
  install()
  const { resolveLearningDeps } = await import('../learning/deps')
  const d = await resolveLearningDeps()
  // 영상은 세 편 **조회됐다** — 없는 것이 아니다
  assert.equal(d.content.assets.length, 3)
  // 그런데 관계는 0개다 — 승인이 없기 때문이다
  for (const p of d.content.problems) {
    assert.deepEqual(d.content.relationsFor(p.problemId), [],
      '승인 명세가 비었는데 관계가 생겼습니다')
  }
  // 검수 다섯 칸은 **각각 실제 상태**다 (044 §6-3)
  const r = d.content.videoReadiness
  assert.equal(r.length, 3)
  for (const v of r) {
    assert.equal(v.assetExists, 'yes')
    for (const k of ['playbackVerified', 'studentAccess', 'exposureReviewed'] as const) {
      assert.equal(v[k], 'unknown', `${k} 를 모르는데 채웠습니다`)
    }
    assert.equal(v.confirmItemsReady, 'no')
  }
})

test('F4 장면의 초가 **숫자가 아니면 구간이 없다** — 0 으로 채우지 않는다 (탐침 P07)', async () => {
  install()
  const { supabaseContentProvider } = await import('../learning/supabaseContent')
  const assets = await supabaseContentProvider().listAssets()
  const byId = new Map(assets.map((a) => [a.assetId, a]))
  // 합성 자료의 장면은 `null` · `''`/`true` · 제대로 된 숫자 셋이다
  const { sceneSeconds } = await import('../learning/supabaseContent')
  assert.equal(sceneSeconds(byId.get(VID1).scenes[0] as never, 86.296), null)
  assert.equal(sceneSeconds(byId.get(VID2).scenes[0] as never, 175.867), null)
  assert.deepEqual(sceneSeconds(byId.get(VID3).scenes[0] as never, 137.425),
    { startSeconds: 12, endSeconds: 48 })
  // 유형 중복 태그는 **세는 자리에서만** 지운다 (운영 자료를 고치지 않는다)
  assert.deepEqual(byId.get(VID2).typeCodes, ['공수1-01-07'])
})

test('F5 승인 명세는 **쓸 수 없는 승인을 조용히 받지 않는다**', () => {
  // 일부러 틀린 값을 넣어 보려면 칸이 `unknown` 이어야 한다 — 그래서 모양을 적어 둔다
  type RelLiteral = {
    relationId: string
    problemId: string
    assetId: string
    assetVersion: unknown
    relationKind: string
    videoKind: unknown
    supportedAxes: unknown
    segment?: { startSeconds: unknown; endSeconds: unknown }
    wholeFileSafe: unknown
    confirmProblemIds: string[]
    exposure: { verdict: string; reviewedBy: string; reviewedAt: string }
    evidence: string
  }
  type SpecLiteral = {
    specVersion: string; specNote: string; problemRoles: unknown[]; relations: RelLiteral[]
  }
  const base: SpecLiteral = {
    specVersion: 'v', specNote: 'n', problemRoles: [],
    relations: [{
      relationId: 'r1', problemId: 'p1', assetId: 'a1', assetVersion: 1,
      relationKind: 'concept_explanation', videoKind: 'concept', supportedAxes: ['recall'],
      segment: { startSeconds: 1, endSeconds: 2 }, wholeFileSafe: false,
      confirmProblemIds: ['p2'],
      exposure: { verdict: 'safe', reviewedBy: 'x', reviewedAt: 't' }, evidence: 'e',
    }],
  }
  const clone = (): typeof base => JSON.parse(JSON.stringify(base))
  // 제대로 된 것은 통과한다
  assert.equal(parseApprovalSpec(clone()).relations.length, 1)

  const bads: Array<[string, (s: ReturnType<typeof clone>) => void]> = [
    ['초가 null', (s) => { s.relations[0].segment = { startSeconds: null, endSeconds: null } }],
    ['초가 빈 글자', (s) => { s.relations[0].segment = { startSeconds: '', endSeconds: '' } }],
    ['초가 참거짓', (s) => { s.relations[0].segment = { startSeconds: true, endSeconds: true } }],
    ['끝이 시작보다 앞', (s) => { s.relations[0].segment = { startSeconds: 9, endSeconds: 2 } }],
    ['구간도 없고 전체도 불안전', (s) => { delete s.relations[0].segment }],
    ['확인 문항이 원문 자신', (s) => { s.relations[0].confirmProblemIds = ['p1'] }],
    ['모르는 판정', (s) => { s.relations[0].exposure.verdict = 'maybe' }],
    ['자산판이 0', (s) => { s.relations[0].assetVersion = 0 }],
    ['relationId 가 겹침', (s) => { s.relations.push(JSON.parse(JSON.stringify(s.relations[0]))) }],
  ]
  for (const [label, brk] of bads) {
    const s = clone()
    brk(s)
    assert.throws(() => parseApprovalSpec(s), ApprovalSpecError, `「${label}」 를 받아들였습니다`)
  }
  // 그리고 **저장소의 명세는 지금 비어 있다** — 그것이 사실이다
  const real = parseApprovalSpec(JSON.parse(read('lib/learning/approvals/first-set.approval.json')))
  assert.deepEqual(real.relations, [])
})

// ════════════════════════════════════════════════════════════════════
// S. 저장 SQL — R045-01 · R045-02
//
// ⚠️ **글자 확인이다. 실행 결과가 아니다.** 격리 PostgreSQL 이 이 컴퓨터에 없다
//    (045 §5 — CLAUDE_RESULT_045 §5 에 무엇이 없는지 적었다).
// ════════════════════════════════════════════════════════════════════

test('S1 함수는 **서버 전용**이다 — public·anon·authenticated 를 모두 회수한다 (R045-01)', () => {
  const sql = sqlCode(read(SQL))
  assert.match(sql, /revoke all on function/, '회수 구문이 없습니다')
  for (const r of ['anon', 'authenticated']) {
    assert.ok(new RegExp(`'${r}'`).test(sql), `${r} 의 직접 권한을 회수하지 않습니다`)
  }
  assert.match(sql, /from public/, 'PUBLIC 회수가 없습니다')
  // 그리고 **필요한 서버 역할에만** 준다 — 기본권한에 기대지 않는다
  assert.match(sql, /grant execute on function/, '서버 역할 실행권을 명시하지 않습니다')
  assert.match(sql, /service_role/)
  // 전체 프로젝트 기본권한은 건드리지 않는다
  assert.ok(!/alter default privileges/i.test(sql), '프로젝트 기본권한을 바꾸고 있습니다')
})

test('S2 호출자를 **current_user 로 판별하지 않는다** (R045-01)', () => {
  const sql = sqlCode(read(SQL))
  assert.match(sql, /learning_caller_is_server/, '호출자 검사가 없습니다')
  // 함수 본문에서 current_user 를 호출자처럼 쓰지 않는다
  assert.ok(!/current_user/.test(sql), 'current_user 를 호출자 판별에 쓰고 있습니다')
  // session_user 와 요청 역할 claim 을 본다
  assert.match(sql, /session_user/)
  assert.match(sql, /request\.jwt\.claim/)
  // 호출자 검사가 **가장 먼저** 온다
  const body = sql.slice(sql.indexOf('create or replace function public.apply_learning_action'))
  const iGuard = body.indexOf('learning_caller_is_server()')
  const iInsert = body.indexOf('insert into public.learning_attempts')
  assert.ok(iGuard > 0 && iGuard < iInsert, '호출자 검사가 쓰기보다 뒤에 있습니다')
  // search_path 를 비웠다
  assert.match(sql, /set search_path = ''/)
})

test('S3 중복·충돌을 **판정한 뒤에** 시도를 만든다 (R045-02)', () => {
  const sql = sqlCode(read(SQL))
  const fn = sql.slice(sql.indexOf('create or replace function public.apply_learning_action'))
  const iLock = fn.indexOf('pg_advisory_xact_lock')
  const iPrev = fn.indexOf('from public.learning_actions a')
  const iAttempt = fn.indexOf('insert into public.learning_attempts')
  assert.ok(iLock > 0, '같은 행동 키의 동시 처리를 직렬화하지 않습니다')
  assert.ok(iPrev > 0, '기존 canonical 행동을 찾지 않습니다')
  assert.ok(iLock < iPrev, '판정 전에 잠그지 않습니다')
  assert.ok(iPrev < iAttempt, '시도를 판정보다 먼저 만듭니다 (043 의 결함)')
  // 중복이면 `updated_at` 도 바꾸지 않는다 — duplicate 반환이 시도 쓰기보다 앞이다
  const iDup = fn.indexOf("'verdict', 'duplicate'")
  assert.ok(iDup > 0 && iDup < iAttempt, '중복인데 시도를 손댑니다')
})

test('S4 중복 동등성에 **문맥이 들어간다** (R045-02)', () => {
  const sql = sqlCode(read(SQL))
  const fn = sql.slice(sql.indexOf('create or replace function public.apply_learning_action'))
  const dup = fn.slice(fn.indexOf('if found then'), fn.indexOf("'verdict', 'duplicate'"))
  for (const c of ['kind', 'occurred_at', 'payload', 'problem_id', 'source_kind', 'source_ref', 'run_id']) {
    assert.ok(dup.includes(c), `중복 판정에 ${c} 가 빠졌습니다`)
  }
  // 그리고 payload 문맥이 인자와 맞는지도 본다
  assert.match(fn, /payload ->> 'problem_ref'/)
  assert.match(fn, /payload ->> 'occurred_at'/)
})

test('S5 시도 유일키가 **다른 과제의 시도를 합치지 않는다** (R045-02)', () => {
  const sql = sqlCode(read(SQL))
  // 043 의 키가 남아 있지 않다
  assert.ok(!/unique \(student_id, problem_id, run_id\)/.test(sql),
    '043 의 유일키가 그대로입니다 — 다른 과제의 시도가 합쳐집니다')
  const m = sql.match(/create unique index[^;]*learning_attempts[^;]*;/)
  assert.ok(m !== null, '시도 유일키가 없습니다')
  for (const c of ['student_id', 'problem_id', 'source_kind', 'source_ref', 'run_id']) {
    assert.ok(m[0].includes(c), `유일키에 ${c} 가 빠졌습니다`)
  }
  // NULL 끼리 서로 다른 값이 되지 않게 묶었다
  assert.match(m[0], /coalesce\(source_ref/)
})

test('S6 배열에 **array_append** 를 쓴다 — `|| \'payload\'` 중의성 없음 (R045-02)', () => {
  const sql = sqlCode(read(SQL))
  assert.ok(!/v_changed \|\|/.test(sql), "`v_changed || '…'` 가 남아 있습니다")
  assert.match(sql, /array_append\(v_changed, 'payload'\)/)
  assert.match(sql, /array_append\(v_changed, 'occurred_at'\)/)
})

test('S7 applied·duplicate·conflict 의 **반환 모양이 같다** (R045-02)', () => {
  const sql = sqlCode(read(SQL))
  const fn = sql.slice(sql.indexOf('create or replace function public.apply_learning_action'))
  const returns = fn.split('jsonb_build_object(').slice(1)
    .filter((x) => x.includes("'verdict'"))
  assert.equal(returns.length, 3, `반환이 3개가 아닙니다 (${returns.length}개)`)
  for (const r of returns) {
    const head = r.slice(0, r.indexOf(');') + 2)
    for (const k of ["'verdict'", "'attempt_id'", "'graded'", "'action_kind'", "'changed_fields'", "'reason'"]) {
      assert.ok(head.includes(k), `반환에 ${k} 가 빠졌습니다: ${head.slice(0, 120)}`)
    }
  }
})

test('S8 채점은 **답·확인 행동에만** 실린다 — DB 가 채점한다고 적지 않는다', () => {
  const sql = read(SQL)
  assert.match(sqlCode(sql), /learning_actions_graded_kind/)
  assert.match(sqlCode(sql), /kind in \('answer', 'confirm'\)/)
  // 043 의 틀린 주석을 **주장으로 들고 오지 않았다.** 045 는 그 문구를
  // 「043 의 주석은 …였다」로 **인용**한다 — 인용인지 주장인지를 가른다
  assert.match(sql, /043 의 주석은 「DB 함수가 채점을 정한다」/,
    '무엇이 틀렸었는지 적어 두지 않았습니다')
  assert.match(sql, /채점은 누가 하나 — \*\*서버 API 다\*\*/)
  assert.match(sql, /이 함수가 채점하지 않는다/)
})

test('S9 범위·참조 소유권을 **함수 안에서도** 본다 (R045-01)', () => {
  const sql = sqlCode(read(SQL))
  const fn = sql.slice(sql.indexOf('create or replace function public.apply_learning_action'))
  assert.match(fn, /from public\.students s[\s\S]{0,80}is_active/, '활성 학생을 확인하지 않습니다')
  assert.match(fn, /from public\.problems p/, '문항 존재를 확인하지 않습니다')
  assert.match(fn, /video_watch_logs w[\s\S]{0,80}student_id = p_student_id/,
    '남의 시청 기록을 가리켰는지 보지 않습니다')
  assert.match(fn, /from public\.gradings g/, '기존 배정을 확인하지 않습니다')
  assert.match(fn, /from public\.exam_sheet_problems x/, '그 시험지의 문항인지 보지 않습니다')
  // 기존 운영 표에 **쓰지 않는다**
  for (const t of ['gradings', 'problems', 'students', 'exam_sheet_problems', 'video_watch_logs',
    'lesson_videos', 'learning_notes', 'type_learning_assets']) {
    assert.ok(!new RegExp(`(insert into|update) public\\.${t}\\b`).test(sql), `${t} 에 씁니다`)
  }
})

test('S10 되돌리기는 **세 단계**이고 psql 전용 문법이 없다 (R045-02)', () => {
  const sql = read(SQL_ROLLBACK)
  // 단계 머리글로 자른다. 본문 설명 안의 「2단계 안의 …」 같은 언급과 섞이지 않게
  const at = (stage: string): number => {
    const i = sql.indexOf(`\n-- ${stage} —`)
    assert.ok(i > 0, `${stage} 머리글이 없습니다`)
    return i
  }
  const [i1, i2, i3] = ['1단계', '2단계', '3단계'].map(at)
  assert.ok(i1 < i2 && i2 < i3, '단계 순서가 뒤섞였습니다')
  assert.match(sql, /차단/)
  assert.match(sql, /기능 철수/)
  // psql 전용 편집을 요구하지 않는다.
  // 머리 설명에 「`\set`/`:'var'` 를 쓰지 않는다」고 **적어 두었으므로**
  // 주석을 뺀 **실행되는 SQL** 만 본다
  const live = sqlCode(sql)
  assert.ok(!/^\s*\\set/m.test(live), 'psql 전용 \\set 을 씁니다')
  assert.ok(!/:'[a-z_]+'/.test(live), "psql 전용 :'var' 를 씁니다")
  // 1단계는 역할 권한을 **빠짐없이** 회수한다
  const s1 = sql.slice(i1, i2)
  for (const r of ['anon', 'authenticated', 'service_role']) {
    assert.ok(s1.includes(`'${r}'`), `1단계에서 ${r} 권한을 회수하지 않습니다`)
  }
  // 2단계는 run 범위로만 지운다
  const s2 = sql.slice(i2, i3)
  assert.match(s2, /where run_id = /)
  assert.ok(!/delete from public\.learning_attempts;/.test(s2), '범위 없이 지우고 있습니다')
  // 기본은 **주석 처리**다 — 붙여넣기만으로 돌지 않는다
  assert.ok(sql.indexOf('/*') < sql.indexOf('revoke all on function'),
    '되돌리기가 주석 없이 바로 실행되게 되어 있습니다')
})

test('S11 043 판은 **폐기 표시**가 있고 045 가 대신한다', () => {
  for (const f of ['docs/sql/migrations/043_learning_actions.sql',
    'docs/sql/migrations/043_learning_actions_rollback.sql']) {
    const head = read(f).split('\n').slice(0, 3).join('\n')
    assert.match(head, /실행하지 않습니다/, `${f} 에 폐기 표시가 없습니다`)
    assert.match(head, /045/, `${f} 가 무엇으로 대체됐는지 적지 않았습니다`)
  }
  // 그리고 045 가 실제로 있다
  assert.ok(read(SQL).includes('apply_learning_action'))
})

test('S12 재실행·동명 객체를 **확인하고 모르면 멈춘다**', () => {
  const sql = sqlCode(read(SQL))
  const pre = sql.slice(0, sql.indexOf('create table if not exists public.learning_attempts'))
  assert.match(pre, /pg_catalog\.pg_tables/, '기존 표를 확인하지 않습니다')
  assert.match(pre, /raise exception/, '모르는 모양인데 멈추지 않습니다')
  assert.match(pre, /learning_attempts/)
  assert.match(pre, /learning_actions/)
})

test('S13 격리 PG 검증이 **문맥만 다른 충돌과 잠금 자체**를 본다 (회귀 방지)', () => {
  // 처음 쓴 검증은 `problem_ref` 가 payload 에도 들어가서, **문맥 검사를 지워도**
  // 통과했다 (일부러 망가뜨려 보고 알았다). 그래서 payload 에 없는 칸만 바꾸는
  // 경우를 따로 두었다. 그 경우들이 사라지면 이 시험이 걸린다.
  const v = read('scripts/pg-learning-verify.sql')
  for (const [key, why] of [
    ['C11', 'run_id 만 다른 경우'],
    ['C12', 'kind 만 다른 경우'],
    ['C13', 'source_ref 만 다른 경우'],
    ['C14', '정말 같으면 중복인 경우 (과민하지 않다는 확인)'],
    ['C15', 'advisory lock 을 실제로 잡는지'],
  ]) {
    assert.ok(v.includes(key), `격리 PG 검증에 ${key}(${why}) 가 없습니다`)
  }
  // 잠금은 **타이밍이 아니라 pg_locks** 로 본다
  assert.match(v, /pg_catalog\.pg_locks/, '잠금을 pg_locks 로 확인하지 않습니다')
  assert.match(v, /hashtextextended/, '행동 키로 잠그는지 보지 않습니다')
})

test('S14 격리 PG 실행기가 **권한 겹과 호출자 검사 겹을 갈라** 본다 (회귀 방지)', () => {
  const t = read('scripts/pg-learning-test.cjs')
  // 두 설정 (기본 execute 직접권한 있음·없음)
  assert.match(t, /alter default privileges/, '직접권한 있는 설정을 만들지 않습니다')
  assert.match(t, /for \(const withDirect of \[true, false\]\)/, '두 설정을 돌리지 않습니다')
  // 설치 뒤 권한 상태를 **숫자로** 확인한다 — 두 설정이 정말 다른지
  assert.match(t, /has_function_privilege/, '설치 뒤 권한 상태를 확인하지 않습니다')
  // 권한 겹만 재려면 호출자 검사를 통과시킨 채 역할을 바꾼다
  assert.match(t, /jwtRole: 'service_role' \}\)\n\s*say\([\s\S]{0,200}권한에서\*\* 막힌다/,
    '권한 겹을 호출자 검사와 갈라 재지 않습니다')
  // 되돌리기 세 단계와 문서가 말한 한 줄 편집
  assert.match(t, /blocks\[0\]/)
  assert.match(t, /blocks\[1\]/)
  assert.match(t, /blocks\[2\]/)
  assert.match(t, /split\("'pilot-045'"\)/, '문서가 말한 묶음 이름 한 줄을 바꿔 보지 않습니다')
  // 127.0.0.1 에만 연다
  assert.match(t, /listen_addresses = '127\.0\.0\.1'/)
  assert.ok(!/0\.0\.0\.0/.test(t), '외부에 열고 있습니다')
})

// ════════════════════════════════════════════════════════════════════
// U. 화면 — 운영 모드 연결 · 기존 로그인 · 확인문항 그림 · 유튜브 기록
//    (원장님 지시 2026-10-29 「045 구현을 계속 진행하세요」)
// ════════════════════════════════════════════════════════════════════

test('U1 학생 화면이 **모드만 보고 막지 않는다** — 기존 로그인 토큰을 붙인다', () => {
  const src = codeOnly(read('app/learning/page.tsx'))
  // 전에는 `if (state.mode === 'operational') return <차단>` 이 전면 차단이었다
  assert.ok(!/state\.mode === 'operational'\s*\)\s*\{\s*return/.test(src),
    '운영 모드를 모드만으로 다시 막고 있습니다')
  // 학습 API 는 **전부** 토큰을 붙이는 fetch 로 간다 (AGENTS.md 「서버 API 규칙」).
  // `apiFetch` 가 아니라 `learningFetch` 인 이유: `apiFetch` 는 `lib/supabase` 를
  // 최상단에서 가져오고 그 파일이 설정 없이 **던진다.** 로컬 체험판에는 설정이 없어
  // 화면이 뜨기 전에 깨진다. 하는 일(토큰 붙이기)은 같다
  const bare = src.match(/(?<!learning)\bfetch\('\/api\/learning\/[a-z-]+'/g) ?? []
  assert.deepEqual(bare, [], `토큰 없이 부르는 곳이 있습니다: ${bare.join(' ')}`)
  assert.ok(/from '@\/lib\/learning\/clientFetch'/.test(src), 'learningFetch 를 가져오지 않습니다')
  assert.ok(/learningFetch\('\/api\/learning\/act'/.test(src))
  assert.ok(/learningFetch\('\/api\/learning\/session'/.test(src))
  // 운영에서 입장하지 못했으면 **기존 로그인**으로 보낸다. 새 로그인을 만들지 않는다
  assert.match(src, /\/auth\/login/, '기존 로그인 화면으로 보내지 않습니다')
  // 운영 사유를 사람 말로 적는다
  for (const d of ['unknown_student', 'lookup_failed', 'inactive_student']) {
    assert.ok(src.includes(d), `운영 거부 사유 ${d} 를 화면이 설명하지 않습니다`)
  }
})

test('U2 확인 문항 **그림**이 서명된 주소로 학생까지 간다', () => {
  // 자료형에 칸이 있다
  const lp = read('lib/twin/learningPreview.ts')
  assert.match(lp, /imageUrl\?: string \| null/, 'ConfirmActionItem 에 그림 칸이 없습니다')
  // 운영 provider 가 **서명된 주소**를 넘긴다 (경로가 아니다)
  const od = codeOnly(read('lib/learning/operationalDeps.ts'))
  assert.match(od, /confirmItemFromProblem\(p, imageUrls\.get\(id\) \?\? null\)/,
    '확인 문항에 그림 주소를 넘기지 않습니다')
  // 그림이 없으면 **칸을 만들지 않는다** (빈 글자로 채우지 않는다)
  const dp = codeOnly(read('lib/learning/deps.ts'))
  assert.match(dp, /if \(imageUrl !== null\) item\.imageUrl = imageUrl/)
  // 화면이 그린다
  const page = codeOnly(read('app/learning/page.tsx'))
  assert.match(page, /it\.imageUrl != null && \(/, '화면이 확인 문항 그림을 그리지 않습니다')
  assert.match(page, /확인 문항 .*그림을 불러오지 못했습니다|그림을 불러오지 못했습니다/,
    '그림을 못 불러온 사실을 적지 않습니다')
})

test('U3 유튜브 도움은 **열린 시간만** 기록한다 — 본 초를 만들지 않는다', () => {
  const src = codeOnly(read('app/learning/page.tsx'))
  const yt = src.slice(src.indexOf('function YouTubeHelp'), src.indexOf('function SegmentPlayer'))
  assert.ok(yt.length > 200, 'YouTubeHelp 가 없습니다')
  // 창이 열려 있던 시간만 보낸다
  assert.match(yt, /method: 'window_elapsed'/, '관측 방식을 window_elapsed 로 보내지 않습니다')
  assert.match(yt, /windowElapsedMs: Date\.now\(\) - openedAt\.current/)
  // **재지 못하는 것을 만들지 않는다**
  for (const bad of ['coveragePct', 'coveredSeconds', 'watchedRanges', 'completed', 'playedSeconds']) {
    assert.ok(!yt.includes(bad), `유튜브 경로가 ${bad} 를 만들고 있습니다`)
  }
  // 같은 봉투로만 다시 보낸다 (R042-01)
  assert.match(yt, /pending\.current/, '실패한 기록을 같은 봉투로 다시 보내지 않습니다')
  // 못 재는 사실을 화면에 적는다
  assert.match(yt, /몇 초를 봤는지 재지 못합니다/)
})

test('U4 서버가 `window_elapsed` 를 받아 **미측정으로** 적는다', async () => {
  const { unmeasuredOf } = await import('../learning/engine')
  const u = unmeasuredOf({ method: 'window_elapsed', windowElapsedMs: 42_000 })
  for (const k of ['coverage_pct', 'covered_seconds']) {
    assert.ok(u.includes(k), `${k} 를 미측정으로 적지 않습니다`)
  }
  // 그리고 route 의 본문 검사를 통과한다 (실제 모듈을 불러 돌린다)
  const h = install()
  await act({ action: 'open', taskId: TASK, problemId: BIG_ID, ...env() })
  const r = await act({
    action: 'help', taskId: TASK, problemId: BIG_ID, relationId: 'nope',
    observation: { method: 'window_elapsed', windowElapsedMs: 42_000 },
    ...env(),
  })
  // 승인 명세가 비어 있으므로 **거부**된다 — 모양 때문이 아니라 승인이 없어서다
  assert.equal(r.status, 403)
  assert.match(String(r.json.error ?? r.json.reason), /승인하지 않은 자료|열 수 없습니다/)
  assert.ok(h.log.rpcs.length === 1, '승인 없는 도움을 저장했습니다')
})

test('U5 첫 세트 확인 화면·API 가 **원장 전용**이다 (safe-change §1·§4)', () => {
  const api = codeOnly(read('app/api/learning/first-set/route.ts'))
  // API 도 원장 전용 — 강사가 주소로 직접 불러도 막힌다
  assert.match(api, /denyIfNotStaff\(req, \{ adminOnly: true \}\)/, 'API 가 원장 전용이 아닙니다')
  // 핸들러 첫 줄에서 막는다
  for (const m of ['GET', 'POST']) {
    const body = api.slice(api.indexOf(`export async function ${m}(`))
    const head = body.slice(0, body.indexOf('\n\n'))
    assert.match(head, /const deny = await denyUnlessAdmin\(req\)/, `${m} 가 첫 줄에서 막지 않습니다`)
  }
  // 화면은 app/teacher 아래에 있고(AccessGate), 안에서 한 번 더 막는다
  const page = codeOnly(read('app/teacher/learning-first-set/page.tsx'))
  assert.match(page, /if \(!isAdmin\(\)\)/, '화면이 원장 전용으로 한 번 더 막지 않습니다')
  assert.match(page, /관리자만 접근할 수 있습니다/)
  // 브라우저에서는 토큰을 붙여 부른다
  assert.match(page, /learningFetch\('\/api\/learning\/first-set'/)
  assert.ok(!/(?<!learning)\bfetch\('\/api\//.test(page), '토큰 없이 부르는 곳이 있습니다')
  // 메뉴와 매뉴얼을 **같이** 고쳤다 (safe-change §3)
  const side = read('components/teacher/Sidebar.tsx')
  assert.match(side, /learning-first-set/, '사이드바에 메뉴가 없습니다')
  assert.match(side, /ITEM\.firstSet/)
  assert.ok(/원장 전용'[^\n]*ITEM\.firstSet/.test(side), "'원장 전용' 묶음에 넣지 않았습니다")
  assert.match(side, /icon: 'ti-checkup-list'/, 'Tabler 외곽선 아이콘이 아닙니다')
  const manual = read('app/teacher/manual/page.tsx')
  assert.match(manual, /learning-first-set/, '사용 매뉴얼을 같이 고치지 않았습니다')
  assert.match(manual, /adminOnly: true/)
})

test('U6 검수 화면은 **정답을 원장에게만** 주고 해설 그림 주소를 만들지 않는다', () => {
  const api = codeOnly(read('app/api/learning/first-set/route.ts'))
  // 해설 그림은 **있는지만** 알려 준다
  assert.match(api, /hasAnswerImage/, '해설 그림 유무를 알려 주지 않습니다')
  assert.ok(!/answerImagePath: /.test(api), '해설 그림 경로를 내보내고 있습니다')
  assert.ok(!/signProblemImages\(.*answerImage/.test(api))
  // 구간 초는 **쓸 수 있을 때만**. 못 쓰는 장면은 raw 값을 보여 주고 고르지 못하게 한다
  assert.match(api, /usable: sceneSeconds\(/, '장면 초를 검사하지 않습니다')
  const page = codeOnly(read('app/teacher/learning-first-set/page.tsx'))
  assert.match(page, /disabled=\{sc\.usable === null\}/, '못 쓰는 구간을 고를 수 있습니다')
  // 확인 문제로 원문 자신을 고를 수 없다
  assert.match(page, /p\.problemId !== problemId/, '원문 자신을 확인 문제로 고를 수 있습니다')
  // 이 화면은 운영 DB 에 쓰지 않는다
  assert.match(page, /운영 DB 에 쓰지 않습니다/)
  assert.ok(!/from\('learning_a/.test(api), '검수 API 가 학습 기록 표를 건드립니다')
})
