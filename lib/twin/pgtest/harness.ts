// 격리 로컬 PostgreSQL 시험대 (GPT-EXEC-021 §164~§175)
//
// 왜 이것이 필요한가
//   016~019 는 전부 **문자열 정적 검사**였다. 그런데 이번에 운영에서 난 42P10 은
//   정적 검사가 잡을 수 없는 종류였다 — 인덱스 정의와 게시문이 **엔진의 추론 규칙**에서
//   어긋났기 때문이다. 문법도 맞고 문자열도 그럴싸하다. 실행해 봐야 안다.
//
//   그래서 이번 근거는 **진짜 PostgreSQL** 에서
//     원본이 42P10 으로 실패하고, 같은 조건에서 수정본이 성공하는 대조다.
//
// 무엇을 쓰고 무엇을 쓰지 않는가 (§172)
//   쓴다     — 폐기 가능한 로컬 클러스터, 전부 합성한 데이터
//   쓰지 않는다 — 운영 URL · service-role key · 실제 학생/문항 · Storage · 외부 모델
//
// 의존성 (§173)
//   `embedded-postgres` 와 `pg` 는 **로컬 시험용**이며 앱 production 의존성이 아니다.
//   이 저장소의 `package.json` 에는 넣지 않았다. 아래처럼 따로 설치해서 쓴다.
//
//     mkdir pgtest && cd pgtest && npm init -y
//     npm install embedded-postgres@17.10.0-beta.17
//     # 그리고 그 node_modules 를 NODE_PATH 로 가리킨다
//     NODE_PATH=<그 경로>/node_modules npx tsx --test lib/twin/pgtest/exec021.pg.test.ts
//
//   찾지 못하면 **조용히 건너뛰지 않는다.** 크게 실패시킨다 (§197 — 실행하지 않은
//   시험을 통과라고 쓰지 않는다).

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'

const ROOT = join(__dirname, '..', '..', '..')
export const readRepo = (p: string) => readFileSync(join(ROOT, p), 'utf8')

// `pg` 의 타입 패키지를 앱 의존성에 넣지 않으려고, 쓰는 만큼만 구조로 적는다
export type QueryResult = { rows: Record<string, unknown>[]; rowCount: number | null }
type PgClient = {
  connect: () => Promise<void>
  end: () => Promise<void>
  query: (sql: string, params?: unknown[]) => Promise<QueryResult>
}
type Cluster = {
  initialise: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  getPgClient: (database?: string) => PgClient
}
type ClusterCtor = new (opts: Record<string, unknown>) => Cluster

/** 로컬 시험 의존성을 찾는다. 없으면 이유를 분명히 말하고 실패한다 */
function loadDeps(): { EmbeddedPostgres: ClusterCtor } {
  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const mod = require('embedded-postgres') as { default?: ClusterCtor }
    return { EmbeddedPostgres: (mod.default ?? mod) as ClusterCtor }
  } catch (e) {
    throw new Error(
      '로컬 PostgreSQL 시험 의존성(embedded-postgres)을 찾지 못했습니다.\n'
      + '이 시험은 진짜 PostgreSQL 없이는 의미가 없으므로 건너뛰지 않고 실패시킵니다.\n'
      + '설치 방법은 lib/twin/pgtest/harness.ts 머리말에 적어 두었습니다.\n'
      + `원인: ${(e as Error).message}`,
    )
  }
}

export type Pg = {
  /** 현재 데이터베이스에 대해 SQL 을 실행한다 */
  q: (sql: string, params?: unknown[]) => Promise<QueryResult>
  /** 실패를 기대하는 실행. `{ code, message }` 를 돌려준다 */
  fail: (sql: string, params?: unknown[]) => Promise<{ code: string; message: string }>
  /** 새 빈 데이터베이스로 갈아탄다 */
  fresh: (name: string) => Promise<void>
  version: string
  close: () => Promise<void>
}

/**
 * 폐기 가능한 클러스터를 띄운다.
 *
 * `persistent: false` 라서 `stop()` 이 데이터 디렉터리를 지운다. 임시 폴더도 함께 지운다.
 */
export async function startCluster(): Promise<Pg> {
  const { EmbeddedPostgres } = loadDeps()
  const dir = mkdtempSync(join(tmpdir(), 'twin-pg-'))
  const port = 15000 + Math.floor(Math.random() * 20000)

  const cluster = new EmbeddedPostgres({
    databaseDir: join(dir, 'data'),
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: false,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  })
  await cluster.initialise()
  await cluster.start()

  let client: PgClient = cluster.getPgClient('postgres')
  await client.connect()
  const v = await client.query('select version() as v, current_setting($1) as n', ['server_version'])
  const version = `${v.rows[0].n} (${String(v.rows[0].v).split(',')[0]})`

  /**
   * 실패한 뒤에는 **반드시 트랜잭션을 되돌린다.**
   *
   * 패치·검증 SQL 은 `begin ... commit` 한 덩어리다. 그 안에서 예외가 나면 연결이
   * "current transaction is aborted" 상태로 남고, **다음 시험이 엉뚱한 오류로 실패한다.**
   * 실제로 그렇게 돼서 R7 세 개가 앞 시험의 오류 메시지를 받았다. 여기서 끊어 준다.
   */
  const rollbackQuietly = async () => {
    try { await client.query('rollback') } catch { /* 트랜잭션이 없으면 무시 */ }
  }

  const api: Pg = {
    version,
    q: async (sql, params) => {
      try {
        return await client.query(sql, params)
      } catch (e) {
        await rollbackQuietly()
        throw e
      }
    },
    fail: async (sql, params) => {
      try {
        await client.query(sql, params)
      } catch (e) {
        await rollbackQuietly()
        const err = e as { code?: unknown; message?: unknown }
        return { code: String(err.code ?? ''), message: String(err.message ?? '') }
      }
      // 실패를 기대했는데 성공했다. **이 사실을 삼키지 않는다** (§193)
      throw new Error('실패를 기대했지만 성공했습니다: ' + sql.slice(0, 120))
    },
    fresh: async (name) => {
      await rollbackQuietly()
      try { await client.end() } catch { /* 이미 닫혔으면 무시 */ }
      const admin = cluster.getPgClient('postgres')
      await admin.connect()
      try {
        // force — 남은 연결이 있어도 확실히 지운다. 시험 사이가 섞이면 안 된다
        await admin.query(`drop database if exists ${name} with (force)`)
        await admin.query(`create database ${name}`)
      } finally {
        await admin.end()
      }
      client = cluster.getPgClient(name)
      await client.connect()
    },
    close: async () => {
      try { await client.end() } catch { /* 이미 닫혔으면 무시 */ }
      await cluster.stop()
      rmSync(dir, { recursive: true, force: true })
    },
  }
  return api
}

// ════════════════════════════════════════════════════════════════════
// 저장소 SQL 을 그대로 가져온다 — 시험이 제 문장을 새로 쓰지 않는다
// ════════════════════════════════════════════════════════════════════

export const INSTALL_SQL = 'docs/sql/쌍둥이_설치.sql'
export const VERIFY_SQL = 'docs/sql/쌍둥이_설치후_검증.sql'
export const PATCH_SQL = 'docs/sql/migrations/021_fix_practice_publication_conflict.sql'
export const BASE_SQL = 'docs/sql/pgtest/합성기반_스키마.sql'
export const SEED_SQL = 'docs/sql/pgtest/합성데이터.sql'

/** 합성 기반 + 014 기준선 설치. 설치 SQL 은 **바꾸지 않고** 그대로 돌린다 */
export async function installBaseline(pg: Pg): Promise<void> {
  await pg.q(readRepo(BASE_SQL))
  await pg.q(readRepo(SEED_SQL))
  await pg.q(readRepo(INSTALL_SQL))
}

// ════════════════════════════════════════════════════════════════════
// 줄끝 — 025 가 다루는 바로 그 지점 (GPT-EXEC-025 §142)
// ════════════════════════════════════════════════════════════════════

const CR = String.fromCharCode(13)
const LF = String.fromCharCode(10)

/** CRLF·단독 CR 을 LF 로 모은 뒤 전부 CRLF 로 바꾼다 */
export const toCRLF = (s: string) => toLF(s).split(LF).join(CR + LF)
/** CRLF → LF */
export const toLF = (s: string) => s.split(CR + LF).join(LF)

export type Eol = 'lf' | 'crlf'

/**
 * 014 기준선을 **지정한 줄끝으로** 설치한다.
 *
 * 왜 필요한가 — `prosrc` 는 dollar-quote 안의 바이트를 그대로 담는다. 그래서 설치 SQL 이
 * CRLF 면 저장된 본문도 CRLF 다(운영이 그 상태다: 2,252자 · CR 63개). LF 면 2,189자다.
 * 025 는 **양쪽 어느 조합에서도** 동작해야 하므로 두 상태를 모두 만들 수 있어야 한다.
 */
export async function installBaselineAs(pg: Pg, eol: Eol): Promise<void> {
  const conv = eol === 'crlf' ? toCRLF : toLF
  await pg.q(conv(readRepo(BASE_SQL)))
  await pg.q(conv(readRepo(SEED_SQL)))
  await pg.q(conv(readRepo(INSTALL_SQL)))
}

export type InputStats = {
  label: string; chars: number; cr: number; lf: number; sha256: string
}

/**
 * 보내기 **직전** 입력의 길이·CR/LF 개수·해시를 남긴다 (§169).
 *
 * 이게 없으면 "CRLF 로 보냈다" 를 로그로 확인할 수 없다. 시험 코드가 몰래 CR 을 지우고
 * LF 만 시험해도 아무도 모른다 — 그걸 막기 위한 기록이다.
 */
export function inputStats(label: string, sql: string): InputStats {
  const st: InputStats = {
    label,
    chars: sql.length,
    cr: (sql.match(new RegExp(CR, 'g')) ?? []).length,
    lf: (sql.match(new RegExp(LF, 'g')) ?? []).length,
    sha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
  }
  console.log(`#   입력 [${label}] ${st.chars}자 · CR ${st.cr} · LF ${st.lf} · sha256 ${st.sha256.slice(0, 16)}`)
  return st
}

/** 관리자로 행세한다 — 합성 auth.uid() 대역이 읽는 세션 설정을 심는다 */
export const ADMIN_UID = '11111111-1111-4111-8111-111111111111'
export const TEACHER_UID = '22222222-2222-4222-8222-222222222222'

export async function actAsAdmin(pg: Pg): Promise<void> {
  await pg.q(
    `select set_config('request.jwt.claims',
       json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
    [ADMIN_UID],
  )
}

export async function actAs(pg: Pg, uid: string): Promise<void> {
  await pg.q(
    `select set_config('request.jwt.claims',
       json_build_object('sub', $1::text, 'role', 'authenticated')::text, false)`,
    [uid],
  )
}

/**
 * 게시 직전 상태의 연습문제를 **실제 RPC 경로로** 만든다.
 *
 * 직접 INSERT 하지 않는다 — `ai_practice_problems.candidate_id` 가 NOT NULL 이고
 * 상태 전이 규칙이 함수 안에 있어서, 손으로 넣으면 운영과 다른 모양이 되기 쉽다.
 * 017 이 쓰는 순서를 그대로 따른다.
 *
 * @param approveSafety 학생 게시 안전승인까지 해 둘지. false 면 [4-8] 과 같은 상태
 * @returns 연습문제 id
 */
export async function makePractice(
  pg: Pg, opts: { approveSafety: boolean; fingerprint?: string } = { approveSafety: true },
): Promise<string> {
  const fp = opts.fingerprint ?? 'syn-fp-' + Math.random().toString(16).slice(2, 10)
  const r1 = await pg.q(
    `select public.server_create_twin_candidate(jsonb_build_object(
       'source_problem_id', 1, 'source_fingerprint', $1::text,
       'prompt_version', 'syn-v1', 'candidate_no', 1, 'batch_id', gen_random_uuid()::text,
       'problem_text_latex', '합성 문항', 'answer_kind', 'number', 'answer_text', '7',
       'solution_outline', '["단계1","단계2"]'::jsonb, 'type_code', 'SYN-001')) as id`,
    [fp],
  )
  const candidate = String(r1.rows[0].id)

  // `admin_approve_twin_candidate` 는 pending_review 만 받는다. 새 후보는 generated 이므로
  // 017 의 [4-3] 과 같이 검증 결과를 넣어 검수 대기로 옮긴다.
  await pg.q(
    `select public.server_update_twin_validation($1::uuid, jsonb_build_object(
       'format_validation_passed', true, 'deterministic_check_passed', false,
       'ai_consensus_passed', true, 'verification_status', 'unverified',
       'unverified_reason', 'no_cas', 'check_method', 'second_model'))`,
    [candidate],
  )

  await actAsAdmin(pg)
  const r2 = await pg.q(
    `select public.admin_approve_twin_candidate($1::uuid, '{}'::jsonb) as id`, [candidate],
  )
  const practice = String(r2.rows[0].id)
  if (opts.approveSafety) {
    await pg.q(`select public.admin_set_student_publish_approval($1::uuid, true)`, [practice])
  }
  return practice
}
