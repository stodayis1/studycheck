// GPT-EXEC-032 → **033 개정** — 첫 소량 생성(스모크) 시험
//
// 033 §155: 기존 시험의 **유효한 의미는 보존**하되, '없음'을 고정하던 F1/F2 와
// 바뀐 해시 assertion 은 새 결정에 맞게 갱신한다. 숫자를 맞추려 빈 시험을 늘리지 않는다.
//
// 바뀐 것
//   - 키 가드: `looksLikeServiceKey`(불리언) → `inspectServiceKeyShape`(사유 코드)
//   - 전송: 스모크 전용 `callOpenAi` 주입 → **공통 전송기 + 주입 fetch** (§82)
//   - 사용량: `usageSeen`(OR) → `usageComplete`(AND·비음수·정수)
//   - F1 '운영 상한 없음' 고정 → **'양쪽 경로가 같은 제한된 전송을 쓴다'** 로 책임 이전 (§69)
//
// ⚠ 실제 키·운영 DB·유료 호출을 쓰지 않는다. 모델 요청은 **주입 fetch** 로만 간다.
//   이 시험이 통과한 것은 문턱과 셈이 맞다는 뜻이고, 모델이 좋은 문항을 쓴다는 뜻이 아니다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { zodTextFormat } from 'openai/helpers/zod'

import {
  SmokeMeter, createSmokeTransport, SmokeBudgetError,
  SMOKE_MAX_PAID_CALLS, SMOKE_MAX_CALLS_BY_ROLE, SMOKE_RUN_BUDGET_USD,
  reserveUsd, reserveCeilingUsd, computeUsd, REGIONAL_HEADROOM, PRICE_USD_PER_1M,
} from './smoke'
import {
  AbortGate, ROLE_MODEL, ROLE_MAX_OUTPUT_TOKENS, SEND_TIMEOUT_MS,
  readUsage, ROLE_MAX_INPUT_TOKENS, SERVICE_TIER, type FetchLike,
} from './openaiSend'
import { runTwinPipelineForSource, type PipelineDeps } from './pipeline'
import { TwinGenerationResult, TwinReviewResult } from './schema'
import type { SourceProblem } from './targets'
import type { StorageMeta } from './fingerprint'
import type {
  BatchCandidateState, CreateCandidatePayload, ServerTwinRepository, ValidationUpdate,
} from './repository'

import {
  inspectServiceKeyShape, readConfig, EXPECTED_ORIGIN, EXPECTED_PROJECT_REF,
} from '../../scripts/check-storage-sample-029'
import {
  run, EXIT, EXECUTE_FLAG, LIVE_ENV_NAME, LIVE_ENV_VALUE, HELP_FLAGS,
  SMOKE_SOURCE_ID, SMOKE_TYPE_CODE, SMOKE_GRADE, SMOKE_CANDIDATE_COUNT,
  PROMPT_FILES, smokeBatchId, approvalKey, readSealedPrompts, checkTargetIdentity,
  loadOneSource, planLines, reportMeter, type SmokeDeps, type SmokeFs,
} from '../../scripts/run-twin-smoke-032'

const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const LAUNCHER = 'scripts/run-twin-smoke.cjs'
const ENTRY = 'scripts/run-twin-smoke-032.ts'

/** 주석을 뺀 실행문만. 머리말이 자기 설명을 하느라 쓴 낱말에 검사가 걸리지 않게 한다 */
function execOnly(src: string): string {
  return src.split(NL)
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join(NL)
}

// ════════════════════════════════════════════════════════════════════
// 합성 SDK 응답 — **실제 설치된 SDK** 에 fetch 만 끼운다 (§82·§160)
// ════════════════════════════════════════════════════════════════════

function cand(no: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    candidate_no: no, variant_kind: 'mixed',
    problem_text_latex: `서로 다른 ${5 + no}개의 수 중 2개를 뽑아 나열하는 경우의 수를 구하시오.`,
    answer_kind: 'number', answer_text: String(20 + no * 10),
    solution_outline: ['공식을 떠올린다', '대입한다', '계산한다'],
    concepts: ['순열'], type_code: SMOKE_TYPE_CODE, difficulty_delta: 0,
    common_mistakes: ['조합과 혼동'], transformations: ['계수·수치', '문장 맥락'],
    reverse_derivation_risk: 'low', single_answer_claim: true,
    needs_new_image: false, self_check_notes: ['검산 완료'],
    ...over,
  }
}
function genPayload(cands: Record<string, unknown>[], over: Record<string, unknown> = {}) {
  return {
    schema_version: '1.0', generation_status: 'generated', unsupported_reason: null as string | null,
    source_summary: {
      core_concepts: ['순열'], solution_structure: ['공식', '대입'], estimated_difficulty: 'medium',
    },
    candidates: cands, ...over,
  }
}
/**
 * 검토 응답 — **`TwinReviewResult` 의 실제 모양**이다 (`lib/twin/schema.ts:57-67`).
 *
 * 처음에는 기존 exec007 계열의 대역이 쓰던 `{ai_answer_text, ai_flags, ai_issues}` 를 그대로
 * 썼는데, 그 모양은 스키마에 없다. 예전에는 대역이 transport 자리에서 응답을 돌려줬고
 * `safeParse` 가 실패해도 파이프라인이 `kind='ok'`(합의 false)로 끝나 **시험이 통과했다.**
 * 이제 실제 SDK 가 파싱하므로 모양이 틀리면 전송 단계에서 터진다 — 그래서 드러났다.
 * (기존 파일들은 이번 변경 범위가 아니라 손대지 않고 보고만 한다.)
 */
const REVIEW_PAYLOAD = {
  valid: true,
  answer_kind: 'number',
  answer_text: '30',
  single_answer: true,
  missing_condition: false,
  ambiguous: false,
  curriculum_mismatch: false,
  solution_outline: ['공식을 떠올린다', '대입한다'],
  issues: [] as string[],
}

/** SDK 모양의 성공 응답 */
function sdkReply(bodyText: string, usage: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: 'resp_syn', object: 'response', status: 'completed',
    output: [{
      type: 'message', role: 'assistant', id: 'msg_syn', status: 'completed',
      content: [{ type: 'output_text', text: bodyText, annotations: [] as unknown[] }],
    }],
    usage, ...extra,
  }
}

/**
 * 주입 fetch. 보낸 요청 본문을 모아 두고 정해진 응답을 돌려준다.
 *
 * 034 §47: **계수 요청과 추론 요청을 따로 센다.**
 *   `POST /responses/input_tokens` → `counted`
 *   `POST /responses`             → `sent`
 *
 * `countReply` 를 넘기지 않으면 천장 안의 값(`천장/2`)을 돌려준다.
 */
function injectFetch(
  reply: (bodyIn: Record<string, unknown>) => { json: unknown; status?: number },
  countReply?: (bodyIn: Record<string, unknown>) => { json: unknown; status?: number },
): { fetchImpl: FetchLike; sent: Record<string, unknown>[]; counted: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = []
  const counted: Record<string, unknown>[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const i = (init ?? {}) as { body?: string }
    const body = i.body ? (JSON.parse(i.body) as Record<string, unknown>) : {}
    const isCount = String(url).includes('/responses/input_tokens')
    let r: { json: unknown; status?: number }
    if (isCount) {
      counted.push(body)
      r = countReply !== undefined ? countReply(body) : {
        json: {
          object: 'response.input_tokens',
          input_tokens: Math.floor(
            ROLE_MAX_INPUT_TOKENS[body.model === ROLE_MODEL.review ? 'review' : 'generation'] / 2,
          ),
        },
      }
    } else {
      sent.push(body)
      r = reply(body)
    }
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200, headers: { 'content-type': 'application/json' },
    }) as unknown as never
  }
  return { fetchImpl, sent, counted }
}

/** 사용량이 완전한 흔한 경우 */
const OK_USAGE = { input_tokens: 2000, output_tokens: 800 }

/**
 * 역할에 맞는 본문을 돌려주는 응답기.
 *
 * `usage` 에 **기본값을 두지 않는다.** 두면 `defaultReplier(undefined)` 가 기본값을
 * 끼워 넣어 "usage 없음" 시험이 거짓으로 통과한다. 실제로 그렇게 걸렸다.
 */
function defaultReplier(usage: unknown) {
  return (body: Record<string, unknown>) => {
    const isReview = body.model === ROLE_MODEL.review
    return { json: sdkReply(JSON.stringify(isReview ? REVIEW_PAYLOAD : genPayload([cand(1), cand(2)])), usage) }
  }
}

const GEN_FORMAT = zodTextFormat(TwinGenerationResult, 'twin_generation_result')
const REV_FORMAT = zodTextFormat(TwinReviewResult, 'twin_review_result')

function genReq() {
  return {
    role: 'generation' as const, model: ROLE_MODEL.generation,
    instructions: '지침', input: [] as unknown[], textFormat: GEN_FORMAT,
  }
}
function revReq() {
  return {
    role: 'review' as const, model: ROLE_MODEL.review,
    instructions: '지침', input: [] as unknown[], textFormat: REV_FORMAT,
  }
}

function mkTransport(role: 'generation' | 'review', meter: SmokeMeter, gate: AbortGate, fetchImpl: FetchLike) {
  return createSmokeTransport({ role, meter, gate, allowLiveCall: true, fetchImpl, apiKey: 'syn-injected-key' })
}

// ════════════════════════════════════════════════════════════════════
// A) 서버 키 형식·용도 가드 (원장님 지시 → 033 §101~103 으로 강화)
// ════════════════════════════════════════════════════════════════════

const b64u = (o: unknown) => Buffer.from(JSON.stringify(o), 'utf8').toString('base64url')
const jwt = (payload: unknown) => [b64u({ alg: 'HS256', typ: 'JWT' }), b64u(payload), 'c2lnbmF0dXJl'].join('.')

test('A1 앞선 사고의 가짜 키를 거부한다', () => {
  // 이 값이 **승인된 진짜 origin** 과 같이 들어가 운영 주소로 읽기 4회가 실제로 나갔다.
  // supabase-js 는 키를 로컬에서 검증하지 않으므로 origin 검사만으로는 막히지 않았다.
  const v = inspectServiceKeyShape('syn_fake_key_not_real', EXPECTED_PROJECT_REF)
  assert.equal(v.ok, false)
})

test('A2 GPT 가 찾아낸 수락 범위를 전부 거부한다 (R032-01)', () => {
  // 032 판은 아래를 **전부 수락**했다. 하나하나 사유 코드로 거부되는지 본다
  const cases: Array<[string, string]> = [
    ['sb_publishable_' + 'a'.repeat(30), 'publishable_not_server'],
    ['z'.repeat(40), 'unknown_format'],
    ['z'.repeat(200), 'unknown_format'],
    ['sb_secret_', 'sb_secret_truncated'],
    ['sb_secret_' + 'a'.repeat(10), 'sb_secret_truncated'],
    ['a.b.c', 'jwt_not_decodable'],
    [jwt({ ref: EXPECTED_PROJECT_REF, role: 'anon' }), 'anon_not_server'],
    [jwt({ ref: EXPECTED_PROJECT_REF }), 'jwt_role_missing'],
    [jwt({ ref: EXPECTED_PROJECT_REF, role: 'authenticated' }), 'jwt_role_not_service_role'],
    [jwt({ ref: 'someotherproject', role: 'service_role' }), 'jwt_project_mismatch'],
    ['', 'empty'],
  ]
  for (const [key, wantCode] of cases) {
    const v = inspectServiceKeyShape(key, EXPECTED_PROJECT_REF)
    assert.equal(v.ok, false, `수락됐습니다: ${wantCode}`)
    assert.equal(v.code, wantCode)
  }
})

test('A3 실제로 쓰이는 서버 키 형식만 통과한다 (대조군)', () => {
  const ok1 = inspectServiceKeyShape('sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN', EXPECTED_PROJECT_REF)
  assert.equal(ok1.ok, true)
  assert.equal(ok1.kind, 'sb_secret')

  const ok2 = inspectServiceKeyShape(jwt({ iss: 'supabase', ref: EXPECTED_PROJECT_REF, role: 'service_role' }), EXPECTED_PROJECT_REF)
  assert.equal(ok2.ok, true)
  assert.equal(ok2.kind, 'legacy_service_role_jwt')

  // ref claim 이 없으면 **없다고 막지 않는다** — 있을 때만 대조한다
  const ok3 = inspectServiceKeyShape(jwt({ iss: 'supabase', role: 'service_role' }), EXPECTED_PROJECT_REF)
  assert.equal(ok3.ok, true)
})

test('A4 거부 메시지에 키 값·해독 내용이 들어가지 않는다', () => {
  const key = jwt({ iss: 'supabase', ref: 'someotherproject', role: 'service_role' })
  const r = readConfig({ NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: key })
  assert.equal(typeof r, 'string', '다른 프로젝트의 키가 통과했습니다')
  const msg = r as string
  assert.ok(!msg.includes(key), '거부 메시지에 키 값이 실렸습니다')
  assert.ok(!msg.includes('someotherproject'), '해독한 claim 이 실렸습니다')
  assert.ok(!msg.includes('service_role'), '해독한 role 이 실렸습니다')
  assert.match(msg, /jwt_project_mismatch/)
})

test('A5 진짜 origin + 가짜 키 조합이 설정 단계에서 막힌다 (사고 재현)', () => {
  const r = readConfig({
    NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,       // 승인된 진짜 대상
    SUPABASE_SERVICE_ROLE_KEY: 'syn_fake_key_not_real',
  })
  assert.equal(typeof r, 'string')
})

test('A6 형식이 맞는 키는 설정 검사를 통과한다', () => {
  const r = readConfig({
    NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN',
  })
  assert.equal(typeof r, 'object', '형식이 맞는 키를 거부했습니다')
})

// ════════════════════════════════════════════════════════════════════
// B) 호출 상한·사용량·예산
// ════════════════════════════════════════════════════════════════════

test('B1 총 상한을 넘으면 호출하지 않는다', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(defaultReplier(OK_USAGE))
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  await mkTransport('review', meter, gate, fetchImpl)(revReq())
  await mkTransport('review', meter, gate, fetchImpl)(revReq())
  assert.equal(meter.report().totalCalls, SMOKE_MAX_PAID_CALLS)
  await assert.rejects(
    () => mkTransport('review', meter, gate, fetchImpl)(revReq()),
    (e: unknown) => {
      assert.ok(e instanceof SmokeBudgetError)
      assert.ok(['total_calls_exceeded', 'role_calls_exceeded'].includes(e.code))
      return true
    },
  )
  assert.equal(sent.length, SMOKE_MAX_PAID_CALLS, '상한을 넘은 뒤에도 HTTP 요청이 나갔습니다')
})

test('B2 역할별 상한 — 생성 1회, 검토 2회', async () => {
  assert.deepEqual({ ...SMOKE_MAX_CALLS_BY_ROLE }, { generation: 1, review: 2 })
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(defaultReplier(OK_USAGE))
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  await assert.rejects(() => mkTransport('generation', meter, gate, fetchImpl)(genReq()), SmokeBudgetError)
  assert.equal(sent.length, 1)
  assert.equal(meter.report().byRole.generation, 1)
})

test('B3 역할과 모델이 어긋나면 세기 전에 멈춘다 (§64)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(defaultReplier(OK_USAGE))
  // 검토 역할에 비싼 생성 모델을 넣는다 — 032 는 이것을 수락했다
  await assert.rejects(
    () => mkTransport('review', meter, gate, fetchImpl)({ ...revReq(), model: ROLE_MODEL.generation }),
    (e: unknown) => {
      assert.ok(e instanceof SmokeBudgetError)
      assert.equal(e.code, 'model_not_allowed')
      return true
    },
  )
  for (const bad of ['gpt-6-pro', 'o9-preview', '']) {
    await assert.rejects(
      () => mkTransport('generation', meter, gate, fetchImpl)({ ...genReq(), model: bad }),
      SmokeBudgetError,
    )
  }
  assert.equal(sent.length, 0, '허용되지 않은 모델로 HTTP 요청이 나갔습니다')
  assert.equal(meter.report().totalCalls, 0, '막힌 요청을 유료 요청으로 셌습니다')
})

test('B4 출력 상한이 실제 SDK 요청 본문에 도달한다 (§65)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(defaultReplier(OK_USAGE))
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  await mkTransport('review', meter, gate, fetchImpl)(revReq())
  assert.equal(sent[0].max_output_tokens, ROLE_MAX_OUTPUT_TOKENS.generation)
  assert.equal(sent[1].max_output_tokens, ROLE_MAX_OUTPUT_TOKENS.review)
  assert.equal(sent[0].model, ROLE_MODEL.generation)
  assert.equal(sent[1].model, ROLE_MODEL.review)
})

test('B5 usage 를 못 읽으면 0 이 아니라 미확인이다 (R032-02)', async () => {
  // 032 는 OR 조건이라 한쪽만 와도 "완전 확인"이었고 다른 쪽 합계를 0 으로 적었다
  for (const usage of [
    undefined,
    { input_tokens: 100000 },                          // 한쪽만
    { output_tokens: 500 },                            // 한쪽만
    { prompt_tokens: 1200, completion_tokens: 340 },   // 다른 API 의 이름
    { input_tokens: -5, output_tokens: 50 },           // 음수
    { input_tokens: 1.5, output_tokens: 50 },          // 비정수
    { input_tokens: '1200', output_tokens: 50 },       // 숫자가 아니다
    {},
  ]) {
    const meter = new SmokeMeter()
    const gate = new AbortGate()
    const { fetchImpl } = injectFetch(defaultReplier(usage))
    await mkTransport('generation', meter, gate, fetchImpl)(genReq())
    const r = meter.report()
    const label = JSON.stringify(usage)
    assert.equal(r.calls[0].usageComplete, false, label)
    assert.equal(r.tokensComplete, false, label)
    assert.equal(r.costComplete, false, `${label} — 미확인인데 비용이 완전하다고 했습니다`)
    assert.equal(r.calls[0].computedUsd, null, `${label} — 미확인을 금액으로 계산했습니다`)
  }
})

test('B6 두 값이 모두 비음수 정수일 때만 확인이다', () => {
  assert.deepEqual(readUsage({ input_tokens: 100, output_tokens: 50 }),
    { inputTokens: 100, outputTokens: 50, complete: true })
  assert.equal(readUsage({ input_tokens: 100 }).complete, false)
  assert.equal(readUsage({ input_tokens: 0, output_tokens: 0 }).complete, true, '0 은 정상 값이다')
  assert.equal(readUsage({ input_tokens: -1, output_tokens: 1 }).complete, false)
  assert.equal(readUsage({ input_tokens: 1.5, output_tokens: 1 }).complete, false)
  assert.equal(readUsage(null).complete, false)
})

test('B7 사용량이 완전하면 금액을 계산하고, 계산액임을 밝힌다', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl } = injectFetch(defaultReplier({ input_tokens: 7000, output_tokens: 2000 }))
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  const r = meter.report()
  assert.equal(r.tokensComplete, true)
  assert.equal(r.costComplete, true)
  // 7000/1e6*10 + 2000/1e6*50 = 0.07 + 0.10
  // 034 §56: 입력 단가가 cache-write(12.5)로 바뀌었다
  // 7000/1e6*12.5 + 2000/1e6*50 = 0.0875 + 0.10 = 0.1875
  assert.ok(Math.abs(r.computedUsd - 0.1875) < 1e-9, String(r.computedUsd))
  const lines: string[] = []
  reportMeter(meter, (l) => lines.push(l))
  assert.match(lines.join(NL), /계산액이지 실제 청구액이 아닙니다/)
})

test('B8 예산을 넘으면 보내지 않는다 (§46)', async () => {
  const meter = new SmokeMeter(0.1)        // 생성 예약($0.32)보다 작은 한도
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(defaultReplier(OK_USAGE))
  await assert.rejects(
    () => mkTransport('generation', meter, gate, fetchImpl)(genReq()),
    (e: unknown) => {
      assert.ok(e instanceof SmokeBudgetError)
      assert.equal(e.code, 'budget_exceeded')
      return true
    },
  )
  assert.equal(sent.length, 0, '예산을 넘었는데 HTTP 요청이 나갔습니다')
  assert.equal(meter.report().reservedUsd, 0)
})

test('B9 예약은 요청 전에 이뤄지고 불명확하게 끝나도 되돌리지 않는다 (§47)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  // usage 를 주지 않는 응답 — 사용량이 불명확하게 끝난다
  const { fetchImpl } = injectFetch(defaultReplier(undefined))
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  const r = meter.report()
  assert.ok(r.reservedUsd > 0, '예약이 0 입니다')
  // 예약은 **실측 계수값**으로 정해진다. 대역이 천장의 절반을 돌려준다
  assert.equal(r.reservedUsd, reserveUsd('generation', ROLE_MAX_INPUT_TOKENS.generation / 2))
  assert.equal(r.costComplete, false)
  // 예약이 되돌려지지 않았으므로 남은 예산이 줄어 있다
  assert.ok(r.reservedUsd <= r.budgetUsd)
})

test('B10 3회 모두 나가도 1회 실행 예산 안이다', () => {
  // 천장까지 찼을 때(최악)의 예약 합계가 1회 실행 예산 안이어야 한다.
  // 생성 0.385 + 검토 0.044×2 = 0.473 (034 §58 의 계산 예시와 같다)
  const total = reserveCeilingUsd('generation') + reserveCeilingUsd('review') * 2
  assert.ok(total <= SMOKE_RUN_BUDGET_USD, `예약 합계 ${total} > 예산 ${SMOKE_RUN_BUDGET_USD}`)
  assert.equal(computeUsd('generation', { inputTokens: null, outputTokens: 1, complete: false }), null)
})

test('B11 live 잠금이 기본이고, 잠겨 있으면 예약도 하지 않는다 (§68)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(defaultReplier(OK_USAGE))
  const locked = createSmokeTransport({
    role: 'generation', meter, gate, allowLiveCall: false, fetchImpl, apiKey: 'k',
  })
  await assert.rejects(() => locked(genReq()), (e: unknown) => {
    assert.ok(e instanceof SmokeBudgetError)
    assert.equal(e.code, 'live_call_blocked')
    return true
  })
  assert.equal(sent.length, 0)
  assert.equal(meter.report().reservedUsd, 0, '잠긴 호출에 예산을 예약했습니다')
})

test('B12 실패 뒤에는 다음 유료 요청을 보내지 않는다 (§67)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(() => ({ json: { error: { message: 'syn' } }, status: 500 }))
  await assert.rejects(() => mkTransport('generation', meter, gate, fetchImpl)(genReq()), SmokeBudgetError)
  assert.equal(gate.aborted, true)
  await assert.rejects(() => mkTransport('review', meter, gate, fetchImpl)(revReq()), (e: unknown) => {
    assert.ok(e instanceof SmokeBudgetError)
    assert.equal(e.code, 'aborted_after_failure')
    return true
  })
  assert.equal(sent.length, 1, '중단 뒤에도 요청이 나갔습니다')
  // 실패한 1회는 셌고, 막힌 것은 세지 않았다
  assert.equal(meter.report().totalCalls, 1)
})

test('B13 잘린 응답은 정상 완결이 아니고, 한도를 늘려 재시도하지 않는다 (§66)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch(() => ({
    json: sdkReply('{}', { input_tokens: 10, output_tokens: 4000 }, {
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    }),
  }))
  const r = await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  assert.equal(r.incomplete, 'max_output_tokens')
  assert.equal(r.output_parsed, undefined, '잘렸는데 파싱된 값을 넘겼습니다')
  assert.equal(meter.report().calls[0].outcome, 'incomplete')
  // 한도를 늘려 다시 보내지 않았다
  assert.equal(sent.length, 1)
  assert.equal(sent[0].max_output_tokens, ROLE_MAX_OUTPUT_TOKENS.generation)
})

// ════════════════════════════════════════════════════════════════════
// C) 파이프라인과 붙였을 때 — 유료 요청이 몇 번인가
// ════════════════════════════════════════════════════════════════════

const BATCH = '32323232-3232-4232-8232-323232323232'
const META: StorageMeta = { updated_at: '2026-01-01T00:00:00Z', etag: 'syn-etag' }

const SOURCE: SourceProblem = {
  id: SMOKE_SOURCE_ID, book: '쎈', grade: SMOKE_GRADE, semester: 1,
  type_code: SMOKE_TYPE_CODE, step: 'B', difficulty: '대표',
  answer_kind: 'number', answer_text: '12', image_path: 'hc1-1/ssen/01/0001.png',
  twin_id: null, is_essay: false,
}

class SynRepo implements ServerTwinRepository {
  created: CreateCandidatePayload[] = []
  updated: Array<{ id: string; v: ValidationUpdate }> = []
  batchRows: BatchCandidateState[] = []
  async getBatchState(): Promise<BatchCandidateState[]> { return this.batchRows }
  async createCandidate(p: CreateCandidatePayload): Promise<string> {
    this.created.push(p)
    return `syn-cand-${this.created.length}`
  }
  async updateValidation(id: string, v: ValidationUpdate): Promise<void> { this.updated.push({ id, v }) }
}

function harness(
  replier: (b: Record<string, unknown>) => { json: unknown; status?: number },
  repo = new SynRepo(),
) {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent, counted } = injectFetch(replier)
  const deps: PipelineDeps = {
    loadStorageMeta: async () => META,
    loadImageDataUrl: async (p) => (p ? 'data:image/png;base64,AAAA' : null),
    generationTransport: mkTransport('generation', meter, gate, fetchImpl),
    reviewTransport: mkTransport('review', meter, gate, fetchImpl),
    repo,
    generationInstructions: '생성 지침',
    reviewInstructions: '검토 지침',
  }
  return { deps, meter, repo, gate, sent, counted }
}

const runPipe = (h: { deps: PipelineDeps }, batchId = BATCH) =>
  runTwinPipelineForSource({
    source: SOURCE, batchId, candidateCount: SMOKE_CANDIDATE_COUNT, deps: h.deps,
  })

test('C1 정상이면 유료 요청 3회 — 생성 1 + 검토 2 (후보 수와 다르다)', async () => {
  const h = harness(defaultReplier(OK_USAGE))
  const r = await runPipe(h)
  assert.equal(r.kind, 'ok', JSON.stringify(r))
  const m = h.meter.report()
  assert.equal(m.totalCalls, 3, '유료 요청 수가 3이 아닙니다')
  assert.equal(m.byRole.generation, 1)
  assert.equal(m.byRole.review, 2)
  assert.notEqual(m.totalCalls, SMOKE_CANDIDATE_COUNT, '후보 2개 = 요청 2회로 셌습니다')
  assert.equal(h.sent.length, 3, 'HTTP 요청 수가 유료 요청 수와 다릅니다')
  assert.equal(h.repo.created.length, 2)
  assert.equal(h.repo.updated.length, 2)
})

test('C2 형식에서 걸린 후보는 검토를 부르지 않는다 — 생성 1회로 끝난다', async () => {
  const h = harness((body) => {
    const isReview = body.model === ROLE_MODEL.review
    return {
      json: sdkReply(
        JSON.stringify(isReview ? REVIEW_PAYLOAD : genPayload([
          cand(1, { solution_outline: [] }), cand(2, { solution_outline: [] }),
        ])),
        { input_tokens: 100, output_tokens: 50 },
      ),
    }
  })
  await runPipe(h)
  const m = h.meter.report()
  assert.equal(m.byRole.generation, 1)
  assert.equal(m.byRole.review, 0, '형식에서 걸린 후보에 검토를 불렀습니다')
  assert.equal(m.totalCalls, 1)
})

test('C3 같은 batch 를 다시 돌리면 유료 요청 0회', async () => {
  const repo = new SynRepo()
  repo.batchRows = [
    { batch_id: BATCH, candidate_no: 1, candidate_id: 'syn-1', status: 'pending_review' },
    { batch_id: BATCH, candidate_no: 2, candidate_id: 'syn-2', status: 'pending_review' },
  ]
  const h = harness(defaultReplier(OK_USAGE), repo)
  const r = await runPipe(h)
  assert.equal(r.kind, 'cached', JSON.stringify(r))
  assert.equal(h.meter.report().totalCalls, 0)
  assert.equal(h.sent.length, 0)
})

test('C4 batch_id 는 승인 조건에서 정해지고 다시 돌려도 같다', () => {
  const k = approvalKey()
  assert.equal(smokeBatchId(k), smokeBatchId(k))
  assert.match(smokeBatchId(k), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.notEqual(smokeBatchId(k), smokeBatchId(k + 'x'))
})

test('C5 불완전 batch 는 멈춘다 — 자동으로 채우거나 지우지 않는다', async () => {
  for (const rows of [
    [{ batch_id: BATCH, candidate_no: 1, candidate_id: 'syn-1', status: 'pending_review' as const }],
    [
      { batch_id: BATCH, candidate_no: 1, candidate_id: 'syn-1', status: 'pending_review' as const },
      { batch_id: BATCH, candidate_no: 3, candidate_id: 'syn-3', status: 'pending_review' as const },
    ],
    [
      { batch_id: BATCH, candidate_no: 1, candidate_id: 'syn-1', status: 'generated' as const },
      { batch_id: BATCH, candidate_no: 2, candidate_id: 'syn-2', status: 'pending_review' as const },
    ],
  ]) {
    const repo = new SynRepo()
    repo.batchRows = rows
    const h = harness(defaultReplier(OK_USAGE), repo)
    const r = await runPipe(h)
    assert.equal(r.kind, 'failed', JSON.stringify(rows))
    assert.equal(r.kind === 'failed' ? r.code : '', 'incomplete_batch')
    assert.equal(h.meter.report().totalCalls, 0, '불완전 batch 인데 유료 요청이 나갔습니다')
    assert.equal(h.sent.length, 0)
    assert.equal(repo.created.length, 0, '불완전 batch 를 자동으로 채웠습니다')
  }
})

test('C6 이미지를 못 읽으면 모델 0회 · 쓰기 0회로 멈춘다', async () => {
  for (const loader of [
    async () => { throw new Error('다운로드 실패') },
    async (): Promise<string | null> => null,
  ]) {
    const h = harness(defaultReplier(OK_USAGE))
    h.deps.loadImageDataUrl = loader as PipelineDeps['loadImageDataUrl']
    const r = await runPipe(h)
    assert.equal(r.kind, 'failed')
    assert.equal(r.kind === 'failed' ? r.code : '', 'image_load_failed')
    assert.equal(h.meter.report().totalCalls, 0, '이미지 없이 모델을 불렀습니다')
    assert.equal(h.sent.length, 0)
    assert.equal(h.repo.created.length, 0)
  }
})

test('C7 Storage 메타를 못 받으면 모델 0회로 멈춘다', async () => {
  const h = harness(defaultReplier(OK_USAGE))
  h.deps.loadStorageMeta = async () => { throw new Error('메타 없음') }
  const r = await runPipe(h)
  assert.equal(r.kind, 'failed')
  assert.equal(h.meter.report().totalCalls, 0)
  assert.equal(h.sent.length, 0)
})

test('C8 거절·지원불가·전송실패를 서로 다르게 보고한다', async () => {
  // 중첩 refusal
  {
    const h = harness(() => ({
      json: {
        id: 'r', object: 'response', status: 'completed',
        output: [{ type: 'message', role: 'assistant', id: 'm', status: 'completed',
                   content: [{ type: 'refusal', refusal: '정책상 응답할 수 없습니다' }] }],
        usage: { input_tokens: 10, output_tokens: 2 },
      },
    }))
    const r = await runPipe(h)
    assert.equal(r.kind, 'failed')
    assert.equal(r.kind === 'failed' ? r.code : '', 'refusal')
    assert.equal(h.repo.created.length, 0)
    assert.equal(h.meter.report().totalCalls, 1, '거절도 유료 요청 1회다')
  }
  // 만들 수 없다는 **정상 회신**
  {
    const h = harness(() => ({
      json: sdkReply(JSON.stringify(genPayload([], {
        generation_status: 'unsupported', unsupported_reason: '그림을 새로 그려야 합니다',
      })), { input_tokens: 100, output_tokens: 20 }),
    }))
    const r = await runPipe(h)
    assert.equal(r.kind, 'unsupported', JSON.stringify(r))
    assert.equal(h.repo.created.length, 0, 'unsupported 인데 후보를 저장했습니다')
    assert.equal(h.meter.report().byRole.review, 0, 'unsupported 인데 검토를 불렀습니다')
  }
  // 전송 실패
  {
    const h = harness(() => ({ json: { error: { message: 'syn' } }, status: 503 }))
    const r = await runPipe(h)
    assert.equal(r.kind, 'failed')
    assert.equal(r.kind === 'failed' ? r.stage : '', 'generation')
    assert.equal(h.repo.created.length, 0)
  }
})

test('C9 두 번째 후보 저장이 실패하면 전체 성공으로 요약하지 않는다', async () => {
  class HalfRepo extends SynRepo {
    override async createCandidate(p: CreateCandidatePayload): Promise<string> {
      if (this.created.length >= 1) throw new Error('저장 실패')
      return super.createCandidate(p)
    }
  }
  const repo = new HalfRepo()
  const h = harness(defaultReplier(OK_USAGE), repo)
  const r = await runPipe(h)
  assert.equal(repo.created.length, 1)
  if (r.kind === 'ok') {
    const bad = r.candidates.filter((c) => c.error !== undefined || c.candidate_id === null)
    assert.ok(bad.length >= 1, '저장 실패가 후보 상태에 남지 않았습니다')
  } else {
    assert.equal(r.kind, 'failed')
  }
  assert.equal(h.meter.report().byRole.generation, 1, '생성을 다시 불렀습니다')
})

test('C10 결과 요약에 정답·이미지·ETag·경로를 넣지 않는다', async () => {
  // 정답을 **구별되는 값**으로 둔다. `'12'` 같은 두 글자는 토큰 수 `1200` 안에도 들어 있어
  // 부분문자열 검사가 참인지 거짓인지 알 수 없다
  const marked: SourceProblem = { ...SOURCE, answer_text: 'ANSWER-987654321' }
  const h = harness(defaultReplier(OK_USAGE))
  await runTwinPipelineForSource({
    source: marked, batchId: BATCH, candidateCount: SMOKE_CANDIDATE_COUNT, deps: h.deps,
  })
  const lines: string[] = []
  reportMeter(h.meter, (l) => lines.push(l))
  const text = lines.join(NL)
  for (const secret of [marked.answer_text, 'data:image/png', META.etag, marked.image_path as string]) {
    assert.ok(!text.includes(secret), `요약에 ${secret} 가 들어갔습니다`)
  }
})

test('C11 검산 상태의 뜻을 바꾸지 않았다 — AI 합의는 검산이 아니다', async () => {
  const h = harness(defaultReplier(OK_USAGE))
  await runPipe(h)
  assert.equal(h.repo.updated.length, 2)
  for (const u of h.repo.updated) {
    const v = u.v as unknown as Record<string, unknown>
    if ('deterministic_check_passed' in v) {
      assert.notEqual(v.deterministic_check_passed, true, 'AI 합의를 결정적 검산 통과로 적었습니다')
    }
    if ('verification_status' in v) {
      assert.notEqual(v.verification_status, 'verified', '실제 검산이 없는데 verified 로 적었습니다')
    }
  }
})

test('C12 생성 요청의 이미지 항목에 detail=high 가 실려 나간다 (§92)', async () => {
  const h = harness(defaultReplier(OK_USAGE))
  await runPipe(h)
  const genBody = h.sent.find((b) => b.model === ROLE_MODEL.generation) as
    { input?: Array<{ content?: Array<Record<string, unknown>> }> }
  const img = genBody.input?.[0].content?.find((c) => c.type === 'input_image')
  assert.ok(img !== undefined, '이미지 항목이 요청에 없습니다')
  assert.equal(img!.detail, 'high')
  // 검토 요청에는 이미지를 보내지 않는다
  const revBody = h.sent.find((b) => b.model === ROLE_MODEL.review) as
    { input?: Array<{ content?: Array<Record<string, unknown>> }> }
  assert.ok(!(revBody.input?.[0].content ?? []).some((c) => c.type === 'input_image'))
})

// ════════════════════════════════════════════════════════════════════
// D) 진입점의 문턱
// ════════════════════════════════════════════════════════════════════

function tripwireDeps(over: Partial<SmokeDeps> = {}): SmokeDeps & { lines: string[]; touched: string[] } {
  const lines: string[] = []
  const touched: string[] = []
  const fs: SmokeFs = {
    isDir: () => { touched.push('fs.isDir'); return false },
    isFile: () => { touched.push('fs.isFile'); return false },
    read: () => { touched.push('fs.read'); return '' },
    readBytes: () => { touched.push('fs.readBytes'); return Buffer.alloc(0) },
    writeNew: () => { touched.push('fs.writeNew') },
    statDir: () => { touched.push('fs.statDir'); return 'missing' },
    listDir: () => { touched.push('fs.listDir'); return [] },
    write: () => { touched.push('fs.write') },
    mkdirp: () => { touched.push('fs.mkdirp') },
  }
  const d = {
    argv: ['node', 'run-twin-smoke-032.ts'],
    env: {} as unknown as NodeJS.ProcessEnv,
    log: (l: string) => { lines.push(l) },
    fs,
    cwd: '/syn/repo',
    loadEnvFile: () => { touched.push('loadEnvFile') },
    makeClient: async () => { touched.push('makeClient'); throw new Error('대역이 불려서는 안 됩니다') },
    ...over,
    lines, touched,
  }
  return d as SmokeDeps & { lines: string[]; touched: string[] }
}

test('D1 인자 없이는 계획만 — 설정·네트워크·유료 API·기록을 건드리지 않는다', async () => {
  const d = tripwireDeps()
  assert.equal(await run(d), EXIT.planned)
  assert.deepEqual(d.touched, [], `계획 모드가 ${d.touched.join(',')} 를 건드렸습니다`)
  const out = d.lines.join(NL)
  assert.match(out, /유료 호출 0회/)
  assert.match(out, /실행 미승인/)
})

test('D2 도움말 깃발도 계획만 낸다', async () => {
  for (const flag of HELP_FLAGS) {
    const d = tripwireDeps({ argv: ['node', 'x', flag] })
    assert.equal(await run(d), EXIT.planned, flag)
    assert.deepEqual(d.touched, [], flag)
  }
})

test('D3 깃발과 함께 도움말을 줘도 실행되지 않는다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG, '--plan'],
    env: { [LIVE_ENV_NAME]: LIVE_ENV_VALUE } as unknown as NodeJS.ProcessEnv,
  })
  assert.equal(await run(d), EXIT.planned)
  assert.deepEqual(d.touched, [])
})

test('D4 깃발만 있고 환경변수가 없으면 멈춘다', async () => {
  const d = tripwireDeps({ argv: ['node', 'x', EXECUTE_FLAG] })
  assert.equal(await run(d), EXIT.notApproved)
  assert.deepEqual(d.touched, [], '승인 전에 설정·네트워크를 건드렸습니다')
})

test('D5 환경변수만 있고 깃발이 없으면 계획만 낸다', async () => {
  const d = tripwireDeps({ env: { [LIVE_ENV_NAME]: LIVE_ENV_VALUE } as unknown as NodeJS.ProcessEnv })
  assert.equal(await run(d), EXIT.planned)
  assert.deepEqual(d.touched, [])
})

test('D6 모르는 인자는 실행하지 않고 멈춘다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG, '--force'],
    env: { [LIVE_ENV_NAME]: LIVE_ENV_VALUE } as unknown as NodeJS.ProcessEnv,
  })
  assert.equal(await run(d), EXIT.badArgs)
  assert.deepEqual(d.touched, [])
})

test('D7 환경파일 위치를 못 찾으면 멈춘다 — 모델을 부르지 않는다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG],
    env: { [LIVE_ENV_NAME]: LIVE_ENV_VALUE } as unknown as NodeJS.ProcessEnv,
  })
  assert.equal(await run(d), EXIT.configMissing)
  assert.ok(!d.touched.includes('makeClient'))
})

function synRepoFs(over: Partial<SmokeFs> = {}): SmokeFs {
  return {
    isDir: (p) => p.endsWith('/.git'),
    isFile: () => false,
    read: () => '',
    readBytes: () => Buffer.alloc(0),
    writeNew: () => {},
    statDir: (p) => (p.endsWith('/.git') ? 'dir' : 'missing'),
    listDir: () => [],
    write: () => {},
    mkdirp: () => {},
    ...over,
  }
}

const GOOD_KEY = 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN'

test('D8 가짜 키는 설정 단계에서 막힌다 — 클라이언트를 만들지 않는다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
      SUPABASE_SERVICE_ROLE_KEY: 'syn_fake_key_not_real',
    } as unknown as NodeJS.ProcessEnv,
    fs: synRepoFs(),
  })
  assert.equal(await run(d), EXIT.configMissing)
  assert.ok(!d.touched.includes('makeClient'), '가짜 키로 클라이언트를 만들었습니다')
  assert.match(d.lines.join(NL), /서버 키 형식이 아닙니다/)
})

test('D9 승인되지 않은 주소면 막힌다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: 'https://someoneelse.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
    } as unknown as NodeJS.ProcessEnv,
    fs: synRepoFs(),
  })
  assert.equal(await run(d), EXIT.configMissing)
  assert.ok(!d.touched.includes('makeClient'))
  assert.ok(!d.lines.join(NL).includes('someoneelse'))
})

test('D10 프롬프트가 봉인값과 다르면 모델을 부르지 않는다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
      SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
    } as unknown as NodeJS.ProcessEnv,
    fs: synRepoFs({ isFile: () => true, readBytes: () => Buffer.from('바뀐 프롬프트', 'utf8') }),
  })
  assert.equal(await run(d), EXIT.promptChanged)
  assert.ok(!d.touched.includes('makeClient'), '프롬프트가 바뀐 채로 클라이언트를 만들었습니다')
  assert.match(d.lines.join(NL), /봉인값과 다릅니다/)
})

test('D11 프롬프트 파일이 없으면 멈춘다', async () => {
  const d = tripwireDeps({
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
      SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
    } as unknown as NodeJS.ProcessEnv,
    fs: synRepoFs(),
  })
  assert.equal(await run(d), EXIT.promptChanged)
  assert.match(d.lines.join(NL), /프롬프트 파일이 없습니다/)
})

test('D12 저장소의 프롬프트가 봉인값과 같다 (합성이 아닌 실제 검사)', () => {
  const real: Pick<SmokeFs, 'isFile' | 'readBytes'> = {
    isFile: (p) => { try { readFileSync(p); return true } catch { return false } },
    readBytes: (p) => readFileSync(p),
  }
  const r = readSealedPrompts(real, ROOT)
  assert.equal(typeof r, 'object', typeof r === 'string' ? r : '')
  for (const spec of Object.values(PROMPT_FILES)) {
    const got = createHash('sha256').update(readFileSync(join(ROOT, spec.path))).digest('hex')
    assert.equal(got, spec.sha256, spec.path)
  }
})

test('D13 대상이 다르면 모델을 부르지 않는다', () => {
  assert.equal(checkTargetIdentity(SOURCE), null)
  assert.match(String(checkTargetIdentity({ ...SOURCE, id: 1 })), /원문 id/)
  assert.match(String(checkTargetIdentity({ ...SOURCE, type_code: '공수1-01-08' })), /유형/)
  assert.match(String(checkTargetIdentity({ ...SOURCE, grade: '수학1' })), /과정/)
})

test('D14 원문이 없거나 대상 조건을 못 맞추면 사유를 돌려주고 정답을 싣지 않는다', async () => {
  const q = (data: unknown, error: unknown = null) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }),
  })
  assert.match(String(await loadOneSource(q(null), SMOKE_SOURCE_ID)), /원문이 없습니다/)
  assert.match(String(await loadOneSource(q(null, { message: 'x' }), SMOKE_SOURCE_ID)), /조회에 실패/)
  const withTwin = { ...SOURCE, twin_id: 777 } as unknown as Record<string, unknown>
  const r = await loadOneSource(q(withTwin), SMOKE_SOURCE_ID)
  assert.equal(typeof r, 'string')
  assert.ok(!String(r).includes(SOURCE.answer_text))
})

test('D15 계획문에 모델·프롬프트·호출 수·예산·detail·대상이 모두 적혀 있다', () => {
  const t = planLines().join(NL)
  for (const must of [
    String(SMOKE_SOURCE_ID), SMOKE_TYPE_CODE, SMOKE_GRADE,
    ROLE_MODEL.generation, ROLE_MODEL.review,
    PROMPT_FILES.generation.sha256, PROMPT_FILES.review.sha256,
    '생성 1 + 검토 최대 2', String(SMOKE_MAX_PAID_CALLS),
    String(ROLE_MAX_OUTPUT_TOKENS.generation), String(SEND_TIMEOUT_MS),
    'detail=high', `$${SMOKE_RUN_BUDGET_USD}`,
    // 034 에서 계획문에 들어가야 하는 것들
    'POST /responses/input_tokens',                       // 계수 요청을 따로 적는다 (§47)
    `service_tier=${SERVICE_TIER}`,                       // 요금 처리 명시 (§55)
    String(ROLE_MAX_INPUT_TOKENS.generation),             // 입력 천장 (§46)
    String(ROLE_MAX_INPUT_TOKENS.review),
    `$${PRICE_USD_PER_1M.generation.input}`,              // cache-write 입력 단가 (§56)
    `×${REGIONAL_HEADROOM}`,                              // 지역 처리 여유 (§57)
    '계산 예시',                                           // 실제 청구 상한이 아니라고 적는다 (§58)
    EXECUTE_FLAG, LIVE_ENV_NAME, EXPECTED_ORIGIN, '실행 미승인',
    approvalKey(),
  ]) {
    assert.ok(t.includes(must), `계획문에 ${must} 가 없습니다`)
  }
})

test('D16 성공 종료코드는 0 하나뿐이고 실패는 전부 0 이 아니다', () => {
  assert.equal(EXIT.ok, 0)
  assert.equal(EXIT.planned, 0)
  for (const [k, v] of Object.entries(EXIT)) {
    if (k === 'ok' || k === 'planned') continue
    assert.notEqual(v, 0, `${k} 가 0 입니다 — 실패가 성공으로 보입니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// E) 실행기
// ════════════════════════════════════════════════════════════════════

test('E1 실행기는 저장소에 설치된 tsx 만 쓴다', () => {
  const s = read(LAUNCHER)
  const exec = execOnly(s)
  for (const bad of ['npx', 'npm exec', 'npm install', 'npm i ', 'yarn', 'pnpm',
                     'registry.npmjs', 'https://', 'http://']) {
    assert.ok(!exec.includes(bad), `실행기 실행문에 ${bad} 가 있습니다`)
  }
  assert.match(s, /npx/, '머리말에 왜 그것을 피하는지 적혀 있어야 합니다')
  assert.match(exec, /node_modules', 'tsx', 'dist', 'cli\.mjs'/)
  assert.ok(!/process\.env\.PATH/.test(exec), '전역 경로로 되돌아갑니다')
  const reqs = [...exec.matchAll(/require\('([^']+)'\)/g)].map((m) => m[1]).sort()
  assert.deepEqual(reqs, ['node:child_process', 'node:fs', 'node:path'])
})

test('E2 실행기가 가리키는 진입점은 스모크 진입점이다', () => {
  // 실행기는 **일부러 CommonJS** 다 (tsx 가 있는지도 모르는 단계에서 돌아야 한다).
  // 그래서 `import` 로는 가져올 수 없고, 맨 `require` 는 ESLint 가 막는다.
  // `createRequire` 로 명시적으로 불러온다 — 규칙을 끄지 않는다.
  const requireCjs = createRequire(__filename)
  const mod = requireCjs('../../scripts/run-twin-smoke.cjs') as {
    ENTRY: string; TSX_CLI: string; EXIT: { launcherBlocked: number }
  }
  assert.ok(mod.ENTRY.replace(/\\/g, '/').endsWith('/scripts/run-twin-smoke-032.ts'))
  assert.ok(mod.TSX_CLI.replace(/\\/g, '/').endsWith('/node_modules/tsx/dist/cli.mjs'))
  assert.equal(mod.EXIT.launcherBlocked, 7)
})

test('E3 진입점 도움말이 패키지 실행 도구를 안내하지 않는다', () => {
  assert.ok(!/npx\s+tsx/.test(execOnly(read(ENTRY))), '도움말이 아직 npx 를 안내합니다')
})

// ════════════════════════════════════════════════════════════════════
// F) §69 — '없음 고정' 에서 '한 경로' 로 책임 이전
// ════════════════════════════════════════════════════════════════════

test('F1 스모크와 일반 transport 가 **같은** 제한된 전송기를 쓴다 (§159)', () => {
  // 032 의 F1 은 "운영 경로에 상한이 없다"를 못박았다. 033 §69 가 그 책임을 여기로 옮겼다.
  const gen = execOnly(read('lib/twin/generate.ts'))
  const smoke = execOnly(read('lib/twin/smoke.ts'))
  for (const [name, src] of [['generate.ts', gen], ['smoke.ts', smoke]] as const) {
    assert.match(src, /createLimitedSender/, `${name} 가 공통 전송기를 쓰지 않습니다`)
    // 자기 SDK 클라이언트를 따로 만들지 않는다
    assert.ok(!/new OpenAI\(/.test(src), `${name} 가 자기 SDK 클라이언트를 만듭니다`)
  }
  // 공통 전송기에는 상한이 **있어야** 한다
  const send = execOnly(read('lib/twin/openaiSend.ts'))
  for (const must of ['max_output_tokens', 'maxRetries', 'timeout', 'baseURL']) {
    assert.ok(send.includes(must), `공통 전송기에 ${must} 가 없습니다`)
  }
})

test('F2 SDK 메서드를 변수로 떼어내지 않는다 (R032-03)', () => {
  // 떼어내면 `this._client` 를 잃어 fetch 전에 TypeError 가 난다.
  // 실제 설치본 7.22.0 의 `parse` 본문이 `this._client.responses.create(...)` 다.
  for (const p of ['lib/twin/openaiSend.ts', 'lib/twin/generate.ts', 'lib/twin/smoke.ts']) {
    const src = execOnly(read(p))
    assert.ok(!/=\s*client\.responses\.parse/.test(src), `${p} 가 parse 를 변수로 떼어냅니다`)
    assert.ok(!/responses\.parse as unknown as/.test(src), `${p} 가 parse 를 단언으로 떼어냅니다`)
  }
  // 공통 전송기는 메서드 호출로 쓴다
  assert.match(execOnly(read('lib/twin/openaiSend.ts')), /client\.responses\.parse\(\{/)
})

test('F3 이미지 detail 은 high 로 **명시**돼 있다 (§88)', () => {
  const send = read('lib/twin/openaiSend.ts')
  assert.match(send, /IMAGE_DETAIL = 'high'/)
  const gen = execOnly(read('lib/twin/generate.ts'))
  assert.match(gen, /detail: IMAGE_DETAIL/)
  // auto·low 로 조용히 바꾸지 않는다
  assert.ok(!/detail:\s*'(auto|low)'/.test(execOnly(send) + gen))
})
