// GPT-EXEC-034 §6 유한한 완료 기준 — 수용 시험
//
// 여기서 닫는 것 (032·033 시험과 겹치지 않게)
//   K) 실제 입력 계수 — 같은 요청의 전달, 정상/과대/미확인/오류, 과대면 추론 0
//   L) 전송 계약 — service_tier=default 가 실제 요청에 실린다
//   M) 비용 실패 — 사용량·예약·예산 실패 뒤 후속 추론 0
//   N) 검토 상태 — 정상동의·정상불일치·refusal·empty·parse_error·timeout·incomplete 구분
//   O) 기록 — 예약 기록 실패 시 전송 0, crash 예약 보존, 종료 기록 실패 비0
//   P) 외부 격리 — 차단 장치가 적재됐는가, 음성 경로
//   Q) 조회 설정 분리 — 셸 우선, 공유파일 자동 적재 금지, 전용 출처 성공
//   R) 이미지 크기 — 메모리 PNG 에서 확인, 모르면 생성 전 중단
//
// ⚠ 운영 DB·Storage·실제 키·유료 요청 0건. 모델 요청은 **주입 fetch** 로만 간다.
//   `test/netguard.cjs` 가 애플리케이션·SDK 보다 **먼저** 적재돼 외부 전송을 막는다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { zodTextFormat } from 'openai/helpers/zod'

import {
  SmokeMeter, createSmokeTransport, SmokeBudgetError,
  reserveUsd, reserveCeilingUsd, SMOKE_RUN_BUDGET_USD, PRICE_USD_PER_1M, REGIONAL_HEADROOM,
} from './smoke'
import {
  AbortGate, ROLE_MODEL, ROLE_MAX_INPUT_TOKENS, ROLE_MAX_OUTPUT_TOKENS,
  SERVICE_TIER, createLimitedSender, type FetchLike,
} from './openaiSend'
import { TwinGenerationResult, TwinReviewResult } from './schema'
import {
  readPngSize, inspectImageDataUrl, patchCountFor, imageTokenUpperBound,
  checkImageWithinHighDetail, HIGH_DETAIL_MAX_PATCHES,
} from './imageSize'
import { runTwinPipelineForSource, type PipelineDeps } from './pipeline'
import type { SourceProblem } from './targets'
import type { StorageMeta } from './fingerprint'
import type {
  BatchCandidateState, CreateCandidatePayload, ServerTwinRepository, ValidationUpdate,
} from './repository'

import {
  run, EXIT, EXECUTE_FLAG, LIVE_ENV_NAME, LIVE_ENV_VALUE,
  SMOKE_SOURCE_ID, SMOKE_TYPE_CODE, SMOKE_GRADE, classifyResult, approvalKey,
  runRecordPath, PROMPT_FILES, RUN_STATE_DIR, exitCodeFor, EXPERIMENT_ID, EXPERIMENT_LOCK_FILE,
  APPROVED_PLAN_KEY, scanExperimentRecords, classifyStopReason,
  type SmokeDeps, type SmokeFs, type RunRecord, type RunClassification,
} from '../../scripts/run-twin-smoke-032'
import { EXPECTED_ORIGIN } from '../../scripts/check-storage-sample-029'
import {
  ISOLATED_ENV_FILENAME, CODE_NOT_ISOLATED, resolveIsolatedOpenAiEnvPath,
  resolveOpenAiConfig, describeOpenAiConfig, defaultEnvParser,
} from './openaiConfig'

/**
 * **실제** Node 환경 파서. 036 §49 — 합성 파서로 대신하지 않는다.
 * 없으면 여기서 바로 드러나야 하므로 던진다.
 */
const REAL_ENV_PARSER = (() => {
  const p = defaultEnvParser()
  if (p === null) throw new Error('이 Node 에는 node:util.parseEnv 가 없습니다')
  return p
})()
import {
  run as runAccess, EXIT as ACCESS_EXIT, MODEL_IDS, METADATA_BASE,
  EXECUTE_FLAG as ACCESS_FLAG, LIVE_ENV_NAME as ACCESS_ENV, LIVE_ENV_VALUE as ACCESS_VALUE,
  type AccessDeps,
} from '../../scripts/check-model-access-033'

const ROOT = resolve(__dirname, '..', '..')
const NL = String.fromCharCode(10)
const GOOD_KEY = 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN'
/** 합성 OpenAI 키. 모양만 맞춘 값이고 실제 키가 아니다 */
const SYN_OPENAI_KEY = 'sk-syn-not-real-0000000000000000'
const SECRET = 'SYNTH_SECRET_NOT_REAL_034'

type Guard = {
  snapshot(): {
    active: boolean; attempts: number; blocked: number
    localAllowed: number; measurementScope: string; targets: string[]
  }
  reset(): void
}
const guard = (globalThis as unknown as { __NETGUARD__?: Guard }).__NETGUARD__

// ════════════════════════════════════════════════════════════════════
// 합성 SDK 대역 — 계수 요청과 추론 요청을 **따로** 센다
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
    schema_version: '1.0', generation_status: 'generated',
    unsupported_reason: null as string | null,
    source_summary: {
      core_concepts: ['순열'], solution_structure: ['공식', '대입'], estimated_difficulty: 'medium',
    },
    candidates: cands, ...over,
  }
}
/** 후보 1 의 답(`30`)과 같아 **합의 true** 가 되는 정상 검토 응답 */
const REVIEW_AGREE = {
  valid: true, answer_kind: 'number', answer_text: '30',
  single_answer: true, missing_condition: false, ambiguous: false,
  curriculum_mismatch: false, solution_outline: ['공식', '대입'], issues: [] as string[],
}
/** 정상 스키마지만 **답이 다른** 검토 — 기술 실패가 아니다 */
const REVIEW_DISAGREE = { ...REVIEW_AGREE, answer_text: '999' }

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
const OK_USAGE = { input_tokens: 2000, output_tokens: 800 }

type Replier = (b: Record<string, unknown>) => { json: unknown; status?: number }

function injectFetch(opts: {
  reply: Replier
  countReply?: Replier
}): { fetchImpl: FetchLike; sent: Record<string, unknown>[]; counted: Record<string, unknown>[] } {
  const sent: Record<string, unknown>[] = []
  const counted: Record<string, unknown>[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const i = (init ?? {}) as { body?: string }
    const body = i.body ? (JSON.parse(i.body) as Record<string, unknown>) : {}
    const isCount = String(url).includes('/responses/input_tokens')
    let r: { json: unknown; status?: number }
    if (isCount) {
      counted.push(body)
      r = opts.countReply !== undefined ? opts.countReply(body) : {
        json: {
          object: 'response.input_tokens',
          input_tokens: Math.floor(
            ROLE_MAX_INPUT_TOKENS[body.model === ROLE_MODEL.review ? 'review' : 'generation'] / 2,
          ),
        },
      }
    } else {
      sent.push(body)
      r = opts.reply(body)
    }
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200, headers: { 'content-type': 'application/json' },
    }) as unknown as never
  }
  return { fetchImpl, sent, counted }
}

const GEN_FORMAT = zodTextFormat(TwinGenerationResult, 'twin_generation_result')
const REV_FORMAT = zodTextFormat(TwinReviewResult, 'twin_review_result')

const genReq = (over: Record<string, unknown> = {}) => ({
  role: 'generation' as const, model: ROLE_MODEL.generation,
  instructions: '생성 지침', input: [] as unknown[], textFormat: GEN_FORMAT, ...over,
})

function mkTransport(
  role: 'generation' | 'review', meter: SmokeMeter, gate: AbortGate, fetchImpl: FetchLike,
  extra: Record<string, unknown> = {},
) {
  return createSmokeTransport({
    role, meter, gate, allowLiveCall: true, fetchImpl, apiKey: 'syn-injected', ...extra,
  })
}

// ════════════════════════════════════════════════════════════════════
// P) 외부 격리 (§121) — **가장 먼저** 확인한다
// ════════════════════════════════════════════════════════════════════

test('P1 차단 장치가 애플리케이션보다 먼저 적재됐다', () => {
  assert.ok(guard !== undefined,
    '전송 차단 장치가 없습니다. `npm run test:twin`(차단 실행기)으로 돌리십시오')
  assert.equal(guard!.snapshot().active, true)
})

test('P2 차단 장치는 외부 호스트를 막고 로컬 IPC 는 통과시킨다', async () => {
  guard!.reset()
  // 외부 — 막혀야 한다
  let code = 'nope'
  try {
    await (globalThis.fetch as unknown as (u: string) => Promise<unknown>)('https://api.openai.com/v1/models')
  } catch (e) { code = String((e as { code?: string }).code) }
  assert.equal(code, 'OUTBOUND_BLOCKED')
  const s = guard!.snapshot()
  assert.equal(s.attempts, 1)
  // **가로챈 것은 전부 막혔다.** 035 §92: `escaped` 같은 "실측 전송" 필드를 두지 않는다 —
  // 그 값을 갱신하는 코드가 없었고, 고정 0 을 패킷 실측처럼 보고한 것이 과했다.
  assert.equal(s.blocked, s.attempts, '가로챘는데 막히지 않은 호출이 있습니다')
  assert.match(s.measurementScope, /패킷 실측이 아니다/,
    '수치의 측정 경계를 함께 내보내지 않습니다')
  assert.ok(s.targets.some((t) => t.includes('api.openai.com')))
  guard!.reset()
})

test('P3 음성: 주입을 빠뜨린 공통 sender 는 **실제 연결 전에** 잡힌다 (§30)', async () => {
  // 033 의 사고를 그대로 재현한다: 모양 정상 가짜 키 + 실제 origin + 주입 없음
  guard!.reset()
  const noInjection = createLimitedSender({
    allowLiveCall: true,
    apiKey: GOOD_KEY,          // 모양은 정상, 값은 가짜
    // fetchImpl 를 **일부러 넘기지 않는다**
  })
  const r = await noInjection(genReq())
  assert.equal(r.kind, 'transport_error')
  assert.equal(r.kind === 'transport_error' ? r.code : '', 'outbound_blocked',
    '차단을 network 와 섞었습니다 — 시도·차단을 구분해야 합니다')
  const s = guard!.snapshot()
  // **「시도 1 / 차단 1」** 이다. 「시도 0」 과 다르다 (§31)
  assert.equal(s.attempts, 1)
  assert.equal(s.blocked, 1)
  assert.equal(s.localAllowed, 0, '외부 대상을 로컬로 분류했습니다')
  guard!.reset()
})

test('P4 양성 대조군: 주입이 있으면 차단 경계를 지나지 않는다 (시도 0)', async () => {
  guard!.reset()
  const { fetchImpl, sent } = injectFetch({ reply: () => ({ json: sdkReply('{}', OK_USAGE) }) })
  const withInjection = createLimitedSender({ allowLiveCall: true, apiKey: 'syn', fetchImpl })
  await withInjection(genReq())
  const s = guard!.snapshot()
  assert.equal(sent.length, 1, '합성 fetch 가 불리지 않았습니다')
  assert.equal(s.attempts, 0, '주입이 있는데 차단 경계를 건드렸습니다')
  assert.equal(s.blocked, 0)
  guard!.reset()
})

test('P5 실행기가 차단 장치를 먼저 적재한다', () => {
  const src = readFileSync(join(ROOT, 'scripts/run-twin-tests.cjs'), 'utf8')
  const exec = src.split(NL).filter((l) => !l.trimStart().startsWith('//')).join(NL)
  // NODE_OPTIONS 로 둬야 tsx 의 자식 프로세스까지 물려받는다 (P1 이 이것을 잡아냈다)
  assert.match(exec, /NODE_OPTIONS/, '차단 장치를 자손 프로세스로 전파하지 않습니다')
  assert.match(exec, /--require /, '차단 장치를 미리 적재하지 않습니다')
  // 차단 장치가 없으면 **시험을 돌리지 않는다**
  assert.match(exec, /차단 없이 시험을 돌리지 않습니다/)
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.match(pkg.scripts['test:twin'], /run-twin-tests\.cjs/)
})

// ════════════════════════════════════════════════════════════════════
// K) 실제 입력 계수 (§116)
// ════════════════════════════════════════════════════════════════════

test('K1 계수 요청에 추론과 **같은** 모델·지침·입력·format 이 들어간다 (§44·§45)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent, counted } = injectFetch({
    reply: () => ({ json: sdkReply(JSON.stringify(genPayload([cand(1), cand(2)])), OK_USAGE) }),
  })
  const imageUrl = 'data:image/png;base64,AAAA'
  const input = [{
    role: 'user',
    content: [
      { type: 'input_text', text: '{"task":"generate_twin_candidates"}' },
      { type: 'input_image', image_url: imageUrl, detail: 'high' },
    ],
  }]
  await mkTransport('generation', meter, gate, fetchImpl)(genReq({ input }))

  assert.equal(counted.length, 1, '계수 요청이 1회가 아닙니다')
  assert.equal(sent.length, 1, '추론 요청이 1회가 아닙니다')
  const c = counted[0]
  const s = sent[0]
  assert.equal(c.model, s.model)
  assert.equal(c.instructions, s.instructions)
  assert.deepEqual(c.input, s.input, '계수와 추론의 입력이 다릅니다')
  assert.deepEqual(c.text, s.text, '계수와 추론의 format 이 다릅니다')
  // 이미지 data URL 과 detail=high 가 **계수 요청에도** 들어 있다
  const cImg = ((c.input as Array<{ content: Array<Record<string, unknown>> }>)[0].content)
    .find((x) => x.type === 'input_image')
  assert.equal(cImg!.image_url, imageUrl)
  assert.equal(cImg!.detail, 'high')
  // 계수 요청에는 출력 상한·tier 가 없다 (계수에는 해당 없음)
  assert.equal(c.max_output_tokens, undefined)
})

test('K2 계수값이 천장을 넘으면 추론 0회 (§46)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent, counted } = injectFetch({
    reply: () => ({ json: sdkReply('{}', OK_USAGE) }),
    countReply: () => ({
      json: { object: 'response.input_tokens', input_tokens: ROLE_MAX_INPUT_TOKENS.generation + 1 },
    }),
  })
  await assert.rejects(
    () => mkTransport('generation', meter, gate, fetchImpl)(genReq()),
    (e: unknown) => {
      assert.ok(e instanceof SmokeBudgetError)
      assert.equal(e.code, 'input_tokens_exceeded')
      return true
    },
  )
  assert.equal(counted.length, 1)
  assert.equal(sent.length, 0, '천장을 넘었는데 추론 요청이 나갔습니다')
  assert.equal(meter.report().reservedUsd, 0, '보내지 않았는데 예약했습니다')
  // 뒤따르는 유료 요청도 막힌다
  assert.equal(gate.aborted, true)
})

test('K3 계수 실패·미확인이면 추론 0회 — 고정 상수로 대신하지 않는다', async () => {
  for (const countReply of [
    () => ({ json: { object: 'response.input_tokens' } }),                         // 누락
    () => ({ json: { object: 'response.input_tokens', input_tokens: -1 } }),        // 음수
    () => ({ json: { object: 'response.input_tokens', input_tokens: 1.5 } }),       // 비정수
    () => ({ json: { object: 'response.input_tokens', input_tokens: '1200' } }),    // 숫자 아님
    () => ({ json: { error: { message: 'syn' } }, status: 500 }),                   // 오류
  ] as Replier[]) {
    const meter = new SmokeMeter()
    const gate = new AbortGate()
    const { fetchImpl, sent } = injectFetch({
      reply: () => ({ json: sdkReply('{}', OK_USAGE) }), countReply,
    })
    await assert.rejects(() => mkTransport('generation', meter, gate, fetchImpl)(genReq()), SmokeBudgetError)
    assert.equal(sent.length, 0, '계수 실패인데 추론 요청이 나갔습니다')
    assert.equal(meter.report().reservedUsd, 0)
    assert.equal(gate.aborted, true)
  }
})

test('K4 예약은 **실측 계수값**으로 정해진다 (§38 반례)', async () => {
  // 033 은 입력 크기가 바뀌어도 예약이 같았다. 이제 계수값이 달라지면 예약도 달라진다
  const seen: number[] = []
  for (const n of [1000, 6000, ROLE_MAX_INPUT_TOKENS.generation]) {
    const meter = new SmokeMeter()
    const gate = new AbortGate()
    const { fetchImpl } = injectFetch({
      reply: () => ({ json: sdkReply(JSON.stringify(genPayload([cand(1), cand(2)])), OK_USAGE) }),
      countReply: () => ({ json: { object: 'response.input_tokens', input_tokens: n } }),
    })
    await mkTransport('generation', meter, gate, fetchImpl)(genReq())
    const r = meter.report()
    assert.equal(r.reservedUsd, reserveUsd('generation', n), `계수 ${n}`)
    seen.push(r.reservedUsd)
  }
  assert.ok(seen[0] < seen[1] && seen[1] < seen[2], `예약이 입력에 따라 변하지 않습니다: ${seen.join(',')}`)
})

// ════════════════════════════════════════════════════════════════════
// L) 전송 계약 (§117)
// ════════════════════════════════════════════════════════════════════

test('L1 두 역할의 모델·출력 상한·tier 가 실제 요청에 실린다', async () => {
  for (const role of ['generation', 'review'] as const) {
    const meter = new SmokeMeter()
    const gate = new AbortGate()
    const { fetchImpl, sent } = injectFetch({
      reply: () => ({
        json: sdkReply(JSON.stringify(role === 'review' ? REVIEW_AGREE : genPayload([cand(1)])), OK_USAGE),
      }),
    })
    await mkTransport(role, meter, gate, fetchImpl)({
      role, model: ROLE_MODEL[role], instructions: 'x', input: [],
      textFormat: role === 'review' ? REV_FORMAT : GEN_FORMAT,
    })
    const b = sent[0]
    assert.equal(b.model, ROLE_MODEL[role], role)
    assert.equal(b.max_output_tokens, ROLE_MAX_OUTPUT_TOKENS[role], role)
    assert.equal(b.service_tier, SERVICE_TIER, `${role} — service_tier 가 요청에 없습니다 (§55)`)
  }
})

test('L2 요청 주소는 공식 base URL 하나다 — 프록시로 바뀌지 않는다', async () => {
  const urls: string[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    urls.push(String(url))
    const isCount = String(url).includes('/responses/input_tokens')
    const json = isCount
      ? { object: 'response.input_tokens', input_tokens: 100 }
      : sdkReply(JSON.stringify(genPayload([cand(1)])), OK_USAGE)
    void init
    return new Response(JSON.stringify(json), {
      status: 200, headers: { 'content-type': 'application/json' },
    }) as unknown as never
  }
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  assert.equal(urls.length, 2, '계수 1 + 추론 1 이 아닙니다')
  for (const u of urls) {
    assert.ok(u.startsWith('https://api.openai.com/v1/'), u)
  }
  assert.ok(urls.some((u) => u.endsWith('/responses/input_tokens')))
  assert.ok(urls.some((u) => u.endsWith('/responses')))
})

// ════════════════════════════════════════════════════════════════════
// M) 비용 실패 (§118)
// ════════════════════════════════════════════════════════════════════

test('M1 사용량 미확인이면 **다음 유료 요청을 막는다** (§60)', async () => {
  for (const usage of [
    undefined,
    { input_tokens: 100 },
    { output_tokens: 100 },
    { input_tokens: -1, output_tokens: 1 },
    { input_tokens: 1.5, output_tokens: 1 },
  ]) {
    const meter = new SmokeMeter()
    const gate = new AbortGate()
    const { fetchImpl, sent } = injectFetch({
      reply: () => ({ json: sdkReply(JSON.stringify(genPayload([cand(1)])), usage) }),
    })
    await mkTransport('generation', meter, gate, fetchImpl)(genReq())
    assert.equal(gate.aborted, true, `${JSON.stringify(usage)} — 미확인인데 gate 가 열려 있습니다`)
    assert.equal(gate.abortReason, 'usage_unknown')
    // 다음 요청은 나가지 않는다
    await assert.rejects(
      () => mkTransport('review', meter, gate, fetchImpl)({
        role: 'review', model: ROLE_MODEL.review, instructions: 'x', input: [], textFormat: REV_FORMAT,
      }),
      SmokeBudgetError,
    )
    assert.equal(sent.length, 1, '미확인 뒤에도 추론이 나갔습니다')
  }
})

test('M2 응답 입력이 예약한 입력을 넘으면 멈춘다 (§59)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl } = injectFetch({
    // 계수는 1,000 인데 응답 usage 는 9,000 — 예약을 넘었다
    reply: () => ({ json: sdkReply(JSON.stringify(genPayload([cand(1)])), { input_tokens: 9000, output_tokens: 10 }) }),
    countReply: () => ({ json: { object: 'response.input_tokens', input_tokens: 1000 } }),
  })
  await mkTransport('generation', meter, gate, fetchImpl)(genReq())
  assert.equal(gate.aborted, true)
  assert.equal(gate.abortReason, 'input_over_reserved')
  // 이미 나간 비용을 되돌린다고 하지 않는다 — 예약은 그대로 남는다
  assert.ok(meter.report().reservedUsd > 0)
})

test('M3 예산을 넘으면 보내지 않고 뒤 요청도 막는다', async () => {
  const meter = new SmokeMeter(0.05)   // 생성 예약보다 작은 한도
  const gate = new AbortGate()
  const { fetchImpl, sent, counted } = injectFetch({
    reply: () => ({ json: sdkReply('{}', OK_USAGE) }),
  })
  await assert.rejects(
    () => mkTransport('generation', meter, gate, fetchImpl)(genReq()),
    (e: unknown) => {
      assert.ok(e instanceof SmokeBudgetError)
      assert.equal(e.code, 'budget_exceeded')
      return true
    },
  )
  assert.equal(counted.length, 1, '계수는 하고 나서 예산에서 막혀야 합니다')
  assert.equal(sent.length, 0, '예산을 넘었는데 추론이 나갔습니다')
  assert.equal(gate.aborted, true)
})

test('M4 단가는 cache-write 를 쓰고 지역 여유를 반영한다 (§56·§57)', () => {
  assert.equal(PRICE_USD_PER_1M.generation.input, 12.5)
  assert.equal(PRICE_USD_PER_1M.review.input, 2.5)
  assert.equal(PRICE_USD_PER_1M.generation.output, 50)
  assert.equal(PRICE_USD_PER_1M.review.output, 10)
  assert.equal(REGIONAL_HEADROOM, 1.1)
  // §58 의 계산 예시와 같아야 한다
  const total = reserveCeilingUsd('generation') + reserveCeilingUsd('review') * 2
  assert.ok(Math.abs(total - 0.473) < 0.0005, total.toFixed(4))
  assert.ok(total <= SMOKE_RUN_BUDGET_USD)
})

// ════════════════════════════════════════════════════════════════════
// N) 검토 상태 (§119)
// ════════════════════════════════════════════════════════════════════

const BATCH = '34343434-3434-4434-8434-343434343434'
const META: StorageMeta = { updated_at: '2026-01-01T00:00:00Z', etag: 'syn-etag' }
const SOURCE: SourceProblem = {
  id: SMOKE_SOURCE_ID, book: '쎈', grade: SMOKE_GRADE, semester: 1,
  type_code: SMOKE_TYPE_CODE, step: 'B', difficulty: '대표',
  answer_kind: 'number', answer_text: '12', image_path: 'hc1-1/ssen/01/0001.png',
  twin_id: null as number | null, is_essay: false,
}

class SynRepo implements ServerTwinRepository {
  created: CreateCandidatePayload[] = []
  updated: Array<{ id: string; v: ValidationUpdate }> = []
  batchRows: BatchCandidateState[] = []
  async getBatchState(): Promise<BatchCandidateState[]> { return this.batchRows }
  async createCandidate(p: CreateCandidatePayload): Promise<string> {
    this.created.push(p); return `syn-${this.created.length}`
  }
  async updateValidation(id: string, v: ValidationUpdate): Promise<void> { this.updated.push({ id, v }) }
}

function pipeHarness(reviewReply: Replier, repo = new SynRepo()) {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent, counted } = injectFetch({
    reply: (b) => b.model === ROLE_MODEL.review
      ? reviewReply(b)
      : { json: sdkReply(JSON.stringify(genPayload([cand(1), cand(2)])), OK_USAGE) },
  })
  const deps: PipelineDeps = {
    loadStorageMeta: async () => META,
    loadImageDataUrl: async (p) => (p ? 'data:image/png;base64,AAAA' : null),
    generationTransport: mkTransport('generation', meter, gate, fetchImpl),
    reviewTransport: mkTransport('review', meter, gate, fetchImpl),
    repo, generationInstructions: '생성 지침', reviewInstructions: '검토 지침',
  }
  return { deps, meter, gate, repo, sent, counted }
}
const runPipe = (h: { deps: PipelineDeps }) =>
  runTwinPipelineForSource({ source: SOURCE, batchId: BATCH, candidateCount: 2, deps: h.deps })

test('N1 정상 동의 — 검토 상태 ok · 합의 true · 완료', async () => {
  const h = pipeHarness(() => ({ json: sdkReply(JSON.stringify(REVIEW_AGREE), OK_USAGE) }))
  const r = await runPipe(h)
  assert.equal(r.kind, 'ok')
  const c = classifyResult(r, {
    stopReason: h.gate.abortReason, tokensComplete: h.meter.report().tokensComplete,
    paidCalls: h.meter.report().totalCalls,
  })
  assert.equal(c.code, 'complete', JSON.stringify(c))
  assert.equal(c.reviewFailedCount, 0)
  assert.equal(h.meter.report().byRole.review, 2)
})

test('N2 정상 불일치 — 기술 오류가 **아니다** (§83)', async () => {
  const h = pipeHarness(() => ({ json: sdkReply(JSON.stringify(REVIEW_DISAGREE), OK_USAGE) }))
  const r = await runPipe(h)
  const c = classifyResult(r, {
    stopReason: h.gate.abortReason, tokensComplete: true, paidCalls: 3,
  })
  assert.equal(c.reviewFailedCount, 0, '합의 불일치를 기술 실패로 셌습니다')
  assert.ok(c.consensusMismatchCount >= 1, '합의 불일치를 세지 않았습니다')
  assert.equal(c.code, 'complete', '정상 검토의 불일치로 완료를 막았습니다')
  if (r.kind === 'ok') {
    for (const cc of r.candidates) assert.equal(cc.review_status, 'ok')
  }
})

test('N3 검토 기술 실패는 **완료가 아니다** (§84) — refusal·empty·parse_error', async () => {
  const cases: Array<[string, Replier]> = [
    ['refusal', () => ({
      json: {
        id: 'r', object: 'response', status: 'completed',
        output: [{ type: 'message', role: 'assistant', id: 'm', status: 'completed',
                   content: [{ type: 'refusal', refusal: SECRET }] }],
        usage: OK_USAGE,
      },
    })],
    ['empty', () => ({
      json: { id: 'r', object: 'response', status: 'completed', output: [], usage: OK_USAGE },
    })],
    ['parse_error', () => ({
      // 스키마에 맞지 않는 본문 → SDK 파서가 실패
      json: sdkReply('{"nope":1}', OK_USAGE),
    })],
  ]
  for (const [label, reply] of cases) {
    const h = pipeHarness(reply)
    const r = await runPipe(h)
    const m = h.meter.report()
    const c = classifyResult(r, {
      stopReason: h.gate.abortReason, tokensComplete: m.tokensComplete, paidCalls: m.totalCalls,
    })
    assert.notEqual(c.code, 'complete', `${label} — 검토 실패인데 완료로 끝났습니다`)
    assert.equal(EXIT[c.code === 'review_failed' ? 'reviewFailed' : 'partialSave'] > 0, true)
    // 첫 검토 실패 뒤 **두 번째 검토를 보내지 않는다** (§76)
    assert.ok(m.byRole.review <= 1, `${label} — 검토 실패 뒤에도 또 보냈습니다 (${m.byRole.review}회)`)
    // 원문·합성 표식이 분류 결과에 실리지 않는다
    assert.equal(JSON.stringify(c).includes(SECRET), false, `${label} — 비밀표식이 실렸습니다`)
  }
})

test('N4 잘린 검토·시간초과도 완료가 아니고 후속 호출을 막는다', async () => {
  const h = pipeHarness(() => ({
    json: sdkReply(JSON.stringify(REVIEW_AGREE), OK_USAGE, {
      status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    }),
  }))
  const r = await runPipe(h)
  const m = h.meter.report()
  const c = classifyResult(r, {
    stopReason: h.gate.abortReason, tokensComplete: m.tokensComplete, paidCalls: m.totalCalls,
  })
  assert.notEqual(c.code, 'complete')
  assert.equal(m.byRole.review, 1, '잘린 뒤에도 두 번째 검토를 보냈습니다')
  // **어느 한도에 걸렸는지**까지 남아야 한다. `incomplete` 만 남기면 정보를 잃는다
  assert.equal(h.gate.abortReason, 'incomplete_max_output_tokens')
})

test('N5 형식에서 걸린 후보의 검토는 skipped — 실패가 아니다', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent } = injectFetch({
    reply: () => ({
      json: sdkReply(JSON.stringify(genPayload([
        cand(1, { solution_outline: [] }), cand(2, { solution_outline: [] }),
      ])), OK_USAGE),
    }),
  })
  const deps: PipelineDeps = {
    loadStorageMeta: async () => META,
    loadImageDataUrl: async () => 'data:image/png;base64,AAAA',
    generationTransport: mkTransport('generation', meter, gate, fetchImpl),
    reviewTransport: mkTransport('review', meter, gate, fetchImpl),
    repo: new SynRepo(), generationInstructions: 'g', reviewInstructions: 'r',
  }
  const r = await runTwinPipelineForSource({ source: SOURCE, batchId: BATCH, candidateCount: 2, deps })
  if (r.kind === 'ok') {
    for (const c of r.candidates) assert.equal(c.review_status, 'skipped')
  }
  assert.equal(meter.report().byRole.review, 0)
  assert.equal(sent.length, 1, '형식 실패인데 검토를 보냈습니다')
})

// ════════════════════════════════════════════════════════════════════
// O) 기록 (§120)
// ════════════════════════════════════════════════════════════════════

test('O1 예약 기록이 실패하면 **전송하지 않는다** (§64)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const { fetchImpl, sent, counted } = injectFetch({
    reply: () => ({ json: sdkReply('{}', OK_USAGE) }),
  })
  const t = mkTransport('generation', meter, gate, fetchImpl, {
    persistReservation: () => { throw new Error('디스크 실패') },
  })
  await assert.rejects(() => t(genReq()), (e: unknown) => {
    assert.ok(e instanceof SmokeBudgetError)
    assert.equal(e.code, 'reservation_record_failed')
    return true
  })
  assert.equal(counted.length, 1)
  assert.equal(sent.length, 0, '기록이 실패했는데 전송했습니다')
  assert.equal(meter.report().reservedUsd, 0)
  assert.equal(gate.aborted, true)
})

test('O2 예약은 **전송 전에** 기록되고 내역이 남는다 (§65)', async () => {
  const meter = new SmokeMeter()
  const gate = new AbortGate()
  const order: string[] = []
  const { fetchImpl } = injectFetch({
    reply: () => { order.push('send'); return { json: sdkReply(JSON.stringify(genPayload([cand(1)])), OK_USAGE) } },
  })
  const t = mkTransport('generation', meter, gate, fetchImpl, {
    persistReservation: (s: { usd: number }) => { order.push(`reserve:${s.usd.toFixed(4)}`) },
  })
  await t(genReq())
  assert.equal(order.length, 2)
  assert.ok(order[0].startsWith('reserve:'), `순서가 틀렸습니다: ${order.join(' → ')}`)
  assert.equal(order[1], 'send')
  // 내역이 남아 비정상 종료 뒤에도 읽을 수 있다
  assert.equal(meter.reservations.length, 1)
  assert.equal(meter.reservations[0].role, 'generation')
  assert.ok(meter.reservations[0].inputTokens > 0)
})

// ── 진입점 기록 ─────────────────────────────────────────────────────

function makeWorkdir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'exec034-'))
  mkdirSync(join(dir, '.git'))
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/x')
  mkdirSync(join(dir, 'prompts'))
  for (const spec of Object.values(PROMPT_FILES)) {
    writeFileSync(join(dir, spec.path), readFileSync(join(ROOT, spec.path)))
  }
  writeFileSync(join(dir, '.env.local'), 'SYNTHETIC=1')
  return dir
}

function realFs(over: Partial<SmokeFs> = {}): SmokeFs {
  return {
    isDir: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
    isFile: (p) => { try { return statSync(p).isFile() } catch { return false } },
    read: (p) => readFileSync(p, 'utf8'),
    readBytes: (p) => readFileSync(p),
    writeNew: (p, d) => writeFileSync(p, d, { flag: 'wx' }),
    // 036 R035-02 — ENOENT 만 `missing`. 그 밖의 오류는 `unknown` 이다
    statDir: (p) => {
      try { return statSync(p).isDirectory() ? 'dir' : 'not_dir' } catch (e) {
        return (e as { code?: string } | null)?.code === 'ENOENT' ? 'missing' : 'unknown'
      }
    },
    // 036 R035-02 — 오류를 `[]` 로 덮지 않는다. 던진다
    listDir: (p) => readdirSync(p),
    write: (p, d) => writeFileSync(p, d),
    mkdirp: (p) => mkdirSync(p, { recursive: true }),
    ...over,
  }
}

function entryDeps(dir: string, over: Partial<SmokeDeps> = {}) {
  const lines: string[] = []
  const d: SmokeDeps = {
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
      SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
      // 035 §102: OpenAI 설정은 셸 값으로 공급한다 — 환경파일 읽기 0회 경로
      OPENAI_API_KEY: SYN_OPENAI_KEY,
    } as unknown as NodeJS.ProcessEnv,
    log: (l) => { lines.push(l) },
    fs: realFs(),
    cwd: dir,
    loadEnvFile: () => {},
    makeClient: async () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: SMOKE_SOURCE_ID, book: '쎈', grade: SMOKE_GRADE, semester: 1,
                type_code: SMOKE_TYPE_CODE, step: 'B', difficulty: '대표',
                answer_kind: 'number', answer_text: 'ANSWER-987654321',
                image_path: 'hc1-1/ssen/01/0001.png', twin_id: null as number | null,
                is_essay: false,
              },
              error: null as unknown,
            }),
          }),
        }),
      }),
    }),
    runPipeline: async () => ({
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [
        { candidate_no: 1, candidate_id: 'c1', status: 'pending_review',
          format_ok: true, ai_consensus: true, issues: [], review_status: 'ok' },
        { candidate_no: 2, candidate_id: 'c2', status: 'pending_review',
          format_ok: true, ai_consensus: true, issues: [], review_status: 'ok' },
      ],
    } as never),
    now: () => '2026-10-05T00:00:00.000Z',
    ...over,
  }
  return { deps: d, lines }
}

test('O3 종료 기록이 실패하면 **비0 종료** — 빈 catch 로 삼키지 않는다 (§66)', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines } = entryDeps(dir, {
      fs: realFs({
        write: () => {
          // runPipeline 을 주입했으므로 예약 기록은 일어나지 않는다.
          // 여기 오는 write 는 **종료 기록** 하나다 — 그것을 실패시킨다
          throw new Error('디스크 실패')
        },
      }),
    })
    const code = await run(deps)
    assert.equal(code, EXIT.recordIncomplete, `종료코드 ${code} — 기록 실패를 성공으로 끝냈습니다`)
    const out = lines.join(NL)
    assert.match(out, /실행 기록을 닫지 못했습니다/)
    assert.match(out, /이미 저장된 후보는 그대로 둡니다/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('O4 정상 종료면 기록에 예약 내역과 호출 수가 함께 남는다', async () => {
  const dir = makeWorkdir()
  try {
    const { deps } = entryDeps(dir)
    assert.equal(await run(deps), EXIT.ok)
    const rec = JSON.parse(readFileSync(runRecordPath(dir, approvalKey()), 'utf8')) as RunRecord
    assert.equal(rec.status, 'finished')
    assert.equal(typeof rec.reservedUsd, 'number')
    assert.ok(Array.isArray(rec.reservations))
    // 키·정답·이미지를 기록하지 않는다
    const raw = readFileSync(runRecordPath(dir, approvalKey()), 'utf8')
    for (const s of [GOOD_KEY, 'ANSWER-987654321', 'hc1-1/ssen', 'data:image']) {
      assert.equal(raw.includes(s), false, `기록에 ${s} 가 들어갔습니다`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ════════════════════════════════════════════════════════════════════
// Q) 조회 설정 분리 (§122)
// ════════════════════════════════════════════════════════════════════

function accessDeps(over: Partial<AccessDeps> = {}) {
  const lines: string[] = []
  const urls: string[] = []
  const envReads: string[] = []
  const d: AccessDeps = {
    argv: ['node', 'x', ACCESS_FLAG],
    env: { [ACCESS_ENV]: ACCESS_VALUE } as unknown as NodeJS.ProcessEnv,
    log: (l) => { lines.push(l) },
    fs: { isDir: (p) => p.endsWith('/.git'), isFile: () => false, read: () => '' },
    cwd: '/syn/repo',
    loadEnvFile: (p) => { envReads.push(p) },
    fetchImpl: async (url) => { urls.push(url); return { status: 200 } },
    ...over,
  }
  return { deps: d, lines, urls, envReads }
}

test('Q1 셸에 OpenAI 키가 있으면 **환경파일을 전혀 읽지 않는다** (§94)', async () => {
  const { deps, urls, envReads, lines } = accessDeps({
    env: {
      [ACCESS_ENV]: ACCESS_VALUE, OPENAI_API_KEY: 'sk-syn-shell-0000000000000000',
    } as unknown as NodeJS.ProcessEnv,
  })
  assert.equal(await runAccess(deps), ACCESS_EXIT.ok)
  assert.equal(envReads.length, 0, `환경파일을 ${envReads.length}회 읽었습니다`)
  assert.equal(urls.length, 2)
  assert.match(lines.join(NL), /환경파일을 읽지 않았습니다/)
})

test('Q2 공유 .env.local 만 있으면 **접속 전에 중단** (§95·§96)', async () => {
  const { deps, urls, envReads, lines } = accessDeps({
    // 공유 `.env.local` 은 있지만 전용 파일은 없다
    fs: {
      isDir: (p) => p.endsWith('/.git'),
      isFile: (p) => p.endsWith('/.env.local'),
      read: () => '',
    },
  })
  assert.equal(await runAccess(deps), ACCESS_EXIT.configNotIsolated)
  assert.equal(envReads.length, 0, '공유 파일을 적재했습니다')
  assert.equal(urls.length, 0, '중단해야 하는데 조회했습니다')
  const out = lines.join(NL)
  assert.match(out, new RegExp(CODE_NOT_ISOLATED))
  assert.match(out, /공유 \.env\.local 을 자동으로 읽지 않습니다/)
})

test('Q3 전용 출처가 있으면 그것만 읽는다 — 036: 적재가 아니라 **내용 파싱**이다', async () => {
  const reads: string[] = []
  const { deps, urls, envReads } = accessDeps({
    fs: {
      isDir: (p) => p.endsWith('/.git'),
      isFile: (p) => p.endsWith(`/${ISOLATED_ENV_FILENAME}`) || p.endsWith('/.env.local'),
      read: (p) => {
        reads.push(p)
        // 전용 파일의 **내용**. 적재하지 않고 파싱만 한다
        return `OPENAI_API_KEY=sk-syn-isolated-000000000000${NL}`
      },
    },
  })
  assert.equal(await runAccess(deps), ACCESS_EXIT.ok)
  // 036 R035-02 — `loadEnvFile` 은 **한 번도** 불리지 않는다
  assert.equal(envReads.length, 0, 'process.env 를 건드리는 적재가 일어났습니다')
  assert.equal(reads.length, 1, `전용 파일을 ${reads.length}회 읽었습니다`)
  assert.ok(reads[0].endsWith(`/${ISOLATED_ENV_FILENAME}`), reads[0])
  // Supabase 키는 어디에도 들어오지 않았다
  assert.equal(deps.env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(urls.length, 2)
})

test('Q4 전용 경로 해석은 공유 파일로 되돌아가지 않는다', () => {
  const fs = {
    isDir: (p: string) => p.endsWith('/.git'),
    isFile: (p: string) => p.endsWith('/.env.local'),   // 전용 파일은 없다
    read: () => '',
  }
  assert.equal(resolveIsolatedOpenAiEnvPath('/syn/repo', fs), null)
  const fs2 = { ...fs, isFile: (p: string) => p.endsWith(`/${ISOLATED_ENV_FILENAME}`) }
  assert.ok(String(resolveIsolatedOpenAiEnvPath('/syn/repo', fs2)).endsWith(ISOLATED_ENV_FILENAME))
})

test('Q5 조회는 두 GET 뿐이고 Responses·DB·Storage 0 (§98 보존)', async () => {
  const { deps, urls } = accessDeps({
    env: {
      [ACCESS_ENV]: ACCESS_VALUE, OPENAI_API_KEY: 'sk-syn-0000000000000000',
    } as unknown as NodeJS.ProcessEnv,
  })
  await runAccess(deps)
  assert.deepEqual(urls, [`${METADATA_BASE}/${MODEL_IDS[0]}`, `${METADATA_BASE}/${MODEL_IDS[1]}`])
})

// ════════════════════════════════════════════════════════════════════
// R) 이미지 크기 (§126)
// ════════════════════════════════════════════════════════════════════

/** 합성 PNG — IHDR 까지만 올바르게 만든다. 실제 이미지가 아니다 */
function synPng(width: number, height: number, over: { ihdrLen?: number; sig?: boolean } = {}): Buffer {
  const b = Buffer.alloc(24)
  const sig = over.sig === false
    ? [0x00, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    : [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  for (let i = 0; i < 8; i++) b[i] = sig[i]
  b.writeUInt32BE(over.ihdrLen ?? 13, 8)
  b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(width, 16)
  b.writeUInt32BE(height, 20)
  return b
}

test('R1 메모리 PNG 에서 폭·높이와 패치 수를 읽는다', () => {
  const v = readPngSize(synPng(780, 600))
  assert.equal(v.ok, true)
  assert.equal(v.width, 780)
  assert.equal(v.height, 600)
  // ceil(780/32)=25 · ceil(600/32)=19 → 475
  assert.equal(v.patchCount, 475)
  assert.equal(patchCountFor(780, 600), 475)
  assert.equal(imageTokenUpperBound(475), 570)
})

test('R2 크기를 모르거나 지원하지 않으면 **실패**로 둔다 — 추측하지 않는다', () => {
  for (const [label, bytes] of [
    ['너무 짧음', Buffer.alloc(10)],
    ['PNG 아님', synPng(10, 10, { sig: false })],
    ['IHDR 길이 이상', synPng(10, 10, { ihdrLen: 99 })],
    ['0 크기', synPng(0, 10)],
  ] as Array<[string, Buffer]>) {
    const v = readPngSize(bytes)
    assert.equal(v.ok, false, label)
    assert.equal(v.width, null, label)
    assert.equal(v.patchCount, null, `${label} — 모르는 크기를 숫자로 채웠습니다`)
    assert.ok(v.code !== null, label)
  }
})

test('R3 data URL 검사 — PNG 만 받고 다른 형식은 중단 사유를 준다', () => {
  const ok = inspectImageDataUrl(`data:image/png;base64,${synPng(320, 320).toString('base64')}`)
  assert.equal(ok.ok, true)
  assert.equal(ok.width, 320)
  for (const [label, url] of [
    ['없음', null],
    ['빈 값', ''],
    ['data URL 아님', 'https://example.com/a.png'],
    ['jpeg', 'data:image/jpeg;base64,AAAA'],
    ['빈 본문', 'data:image/png;base64,'],
  ] as Array<[string, string | null]>) {
    const v = inspectImageDataUrl(url)
    assert.equal(v.ok, false, label)
    assert.ok(v.code !== null, label)
  }
})

test('R4 high 패치 예산을 넘으면 생성 전에 멈춘다 — 자동으로 줄이지 않는다 (§93)', () => {
  const small = inspectImageDataUrl(`data:image/png;base64,${synPng(800, 800).toString('base64')}`)
  assert.equal(checkImageWithinHighDetail(small).ok, true, '정상 크기를 막았습니다')
  // ceil(2000/32)=63 · ceil(2000/32)=63 → 3969 > 2500
  const big = inspectImageDataUrl(`data:image/png;base64,${synPng(2000, 2000).toString('base64')}`)
  assert.ok(big.patchCount! > HIGH_DETAIL_MAX_PATCHES)
  const r = checkImageWithinHighDetail(big)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_patches_exceeded')
  // 크기를 모를 때도 통과시키지 않는다
  assert.equal(checkImageWithinHighDetail(inspectImageDataUrl(null)).ok, false)
})

test('R5 이미지 모듈은 네트워크를 쓰지 않는다 — 재다운로드 경로가 없다', () => {
  const src = readFileSync(join(ROOT, 'lib/twin/imageSize.ts'), 'utf8')
  const exec = src.split(NL)
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join(NL)
  for (const bad of ['fetch(', 'http', 'createClient', 'storage', 'download']) {
    assert.ok(!exec.includes(bad), `이미지 모듈에 ${bad} 가 있습니다`)
  }
  // 과거 관측 바이트 수를 픽셀 대신 쓰지 않는다
  assert.ok(!src.includes('42665'), '과거 바이트 수가 코드에 박혀 있습니다')
})

test('R6 진입점이 이미지 검사를 생성 **전에** 한다', () => {
  const src = readFileSync(join(ROOT, 'scripts/run-twin-smoke-032.ts'), 'utf8')
  assert.match(src, /loadImageDataUrl: loadAndInspectImage/,
    '진입점이 이미지 검사를 끼우지 않았습니다')
  assert.match(src, /checkImageWithinHighDetail/)
  // 자동 축소·재다운로드 경로가 없다
  const exec = src.split(NL).filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join(NL)
  for (const bad of ['resize', 'reCrop', 'detail: \'low\'', 'original']) {
    assert.ok(!exec.includes(bad), `진입점에 ${bad} 가 있습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 기본 모드 (§124) — 034 로 늘어난 것만
// ════════════════════════════════════════════════════════════════════

test('S1 계획 모드는 계수·추론·설정·네트워크를 건드리지 않는다', async () => {
  guard!.reset()
  const touched: string[] = []
  const { deps, lines } = entryDeps('/syn/none', {
    argv: ['node', 'x'],
    fs: {
      isDir: () => { touched.push('isDir'); return false },
      isFile: () => { touched.push('isFile'); return false },
      read: () => { touched.push('read'); return '' },
      readBytes: () => { touched.push('readBytes'); return Buffer.alloc(0) },
      writeNew: () => { touched.push('writeNew') },
      statDir: () => { touched.push('statDir'); return 'missing' },
      listDir: () => { touched.push('listDir'); return [] },
      write: () => { touched.push('write') },
      mkdirp: () => { touched.push('mkdirp') },
    },
    makeClient: async () => { touched.push('makeClient'); throw new Error('불려서는 안 됩니다') },
  })
  assert.equal(await run(deps), EXIT.planned)
  assert.deepEqual(touched, [])
  assert.equal(guard!.snapshot().attempts, 0)
  const out = lines.join(NL)
  assert.match(out, /POST \/responses\/input_tokens/)
  assert.match(out, /service_tier=default/)
  assert.match(out, /계산 예시/)
})

test('S2 실행 플래그가 섞여도 무실행 (§124)', async () => {
  for (const argv of [
    ['node', 'x', EXECUTE_FLAG, '--plan'],
    ['node', 'x', EXECUTE_FLAG, '--force'],
  ]) {
    const touched: string[] = []
    const { deps } = entryDeps('/syn/none', {
      argv,
      env: { [LIVE_ENV_NAME]: LIVE_ENV_VALUE } as unknown as NodeJS.ProcessEnv,
      fs: {
        isDir: () => { touched.push('isDir'); return false },
        isFile: () => { touched.push('isFile'); return false },
        read: () => '', readBytes: () => Buffer.alloc(0),
        writeNew: () => { touched.push('writeNew') },
        statDir: () => { touched.push('statDir'); return 'missing' },
        listDir: () => { touched.push('listDir'); return [] },
        write: () => { touched.push('write') },
        mkdirp: () => { touched.push('mkdirp') },
      },
      makeClient: async () => { touched.push('makeClient'); throw new Error('x') },
    })
    const code = await run(deps)
    assert.ok(code === EXIT.planned || code === EXIT.badArgs, `${argv.join(' ')} → ${code}`)
    assert.deepEqual(touched, [], argv.join(' '))
  }
})

test('S3 이 시험 파일은 실제 의존성을 만들지 않는다', () => {
  const src = readFileSync(join(ROOT, 'lib/twin/exec034.test.ts'), 'utf8')
  assert.ok(!/createClient\(/.test(src))
  assert.ok(!/defaultDeps\(/.test(src))
  // 실행 기록이 저장소에 남지 않는다 (임시 폴더만 쓴다)
  assert.ok(!existsSync(join(ROOT, '.twin-smoke')), '.twin-smoke 가 저장소에 남았습니다')
})

// ════════════════════════════════════════════════════════════════════
// T) 실험 단위 잠금 — GPT-EXEC-035 §3 (R034-02)
// ════════════════════════════════════════════════════════════════════

/** 다른 승인키의 기록을 심는다. GPT 가 재현에 쓴 것과 같은 모양이다 */
function seedForeignRecord(dir: string, body: string): void {
  mkdirSync(join(dir, RUN_STATE_DIR), { recursive: true })
  writeFileSync(join(dir, RUN_STATE_DIR, 'run-0000000000000000.json'), body)
}

test('T1 다른 승인키의 in_progress 기록이 있으면 외부 요청 전에 막힌다', async () => {
  const dir = makeWorkdir()
  try {
    seedForeignRecord(dir, JSON.stringify({
      approvalKey: '0000000000000000', status: 'in_progress', reservedUsd: 3.1,
    }))
    const touched: string[] = []
    const { deps, lines } = entryDeps(dir, {
      makeClient: async () => { touched.push('makeClient'); throw new Error('불려서는 안 됩니다') },
    })
    assert.equal(await run(deps), EXIT.lockHeld)
    assert.deepEqual(touched, [], '잠금인데 클라이언트를 만들었습니다')
    const out = lines.join(NL)
    assert.match(out, /앞선 실행 기록이 1건 있습니다/)
    assert.match(out, /다른 승인키/)
    assert.match(out, /누적 예약\(읽힌 것만\) = \$3\.100/)
    assert.match(out, /승인키를 바꿔도 이 실험의 잠금을 피할 수 없습니다/)
    // 기록을 지우지 않았다
    assert.ok(existsSync(join(dir, RUN_STATE_DIR, 'run-0000000000000000.json')))
    // 새 run 파일을 만들지 않았다
    assert.ok(!existsSync(runRecordPath(dir, approvalKey())), '새 run 파일을 만들었습니다')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T2 다른 승인키의 **파손된** 기록도 막는다 — 읽히지 않는 것을 없는 것으로 보지 않는다', async () => {
  const dir = makeWorkdir()
  try {
    seedForeignRecord(dir, '{ 깨진 JSON')
    const touched: string[] = []
    const { deps, lines } = entryDeps(dir, {
      makeClient: async () => { touched.push('makeClient'); throw new Error('x') },
    })
    assert.equal(await run(deps), EXIT.lockHeld)
    assert.deepEqual(touched, [])
    assert.match(lines.join(NL), /상태=읽을 수 없음/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T3 다른 승인키의 finished·미정산 기록도 막는다', async () => {
  const dir = makeWorkdir()
  try {
    seedForeignRecord(dir, JSON.stringify({
      approvalKey: '0000000000000000', status: 'finished', reservedUsd: 3.1,
    }))
    const touched: string[] = []
    const { deps, lines } = entryDeps(dir, {
      makeClient: async () => { touched.push('makeClient'); throw new Error('x') },
    })
    assert.equal(await run(deps), EXIT.lockHeld)
    assert.deepEqual(touched, [])
    assert.match(lines.join(NL), /상태=finished/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T4 기록 훑기는 `.twin-smoke` 안만 본다 — 다른 폴더를 뒤지지 않는다', () => {
  const dir = makeWorkdir()
  try {
    const looked: string[] = []
    const fsSpy = {
      statDir: (p: string) => {
        looked.push(p)
        return (p.endsWith(RUN_STATE_DIR) ? 'dir' : 'missing') as 'dir' | 'missing'
      },
      isFile: () => false,
      read: () => '{}',
      listDir: (p: string) => { looked.push(p); return ['run-aaaa.json', 'other.txt'] },
    }
    const r = scanExperimentRecords(fsSpy, dir)
    assert.equal(r.records.length, 1, 'run-*.json 만 세야 합니다')
    assert.equal(r.records[0].file, 'run-aaaa.json')
    for (const p of looked) {
      assert.ok(p.endsWith(RUN_STATE_DIR), `범위 밖을 봤습니다: ${p}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T5 실험 잠금이 이미 잡혀 있으면 하나만 진입한다 (§76)', async () => {
  const dir = makeWorkdir()
  try {
    // 기록은 없지만 실험 잠금만 미리 잡혀 있는 상태 — 동시 실행의 두 번째 프로세스
    mkdirSync(join(dir, RUN_STATE_DIR), { recursive: true })
    writeFileSync(join(dir, RUN_STATE_DIR, EXPERIMENT_LOCK_FILE), '{}')
    const touched: string[] = []
    const { deps, lines } = entryDeps(dir, {
      makeClient: async () => { touched.push('makeClient'); throw new Error('x') },
    })
    assert.equal(await run(deps), EXIT.lockHeld)
    assert.deepEqual(touched, [], '잠금이 잡혀 있는데 진행했습니다')
    assert.match(lines.join(NL), /이 실험의 잠금이 이미 잡혀 있습니다/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('T6 실험 잠금 이름은 승인키와 무관하다', () => {
  assert.equal(EXPERIMENT_LOCK_FILE, `experiment-${EXPERIMENT_ID}.lock`)
  assert.ok(!EXPERIMENT_LOCK_FILE.includes(approvalKey()),
    '잠금 이름에 승인키가 들어가면 키를 바꿔 피할 수 있습니다')
  // 실험 식별자는 코드에서 계산하지 않는 **고정 문자열**이다
  const src = readFileSync(join(ROOT, 'scripts/run-twin-smoke-032.ts'), 'utf8')
  assert.match(src, /export const EXPERIMENT_ID = 'twin-smoke-first-46284'/)
})

test('T7 지금 조건이 승인된 계획과 다르면 막는다 (§77)', async () => {
  // 현재 코드가 계산한 키가 고정 기준과 같아야 통과한다
  assert.equal(approvalKey(), APPROVED_PLAN_KEY,
    '계획 조건이 바뀌었습니다. APPROVED_PLAN_KEY 를 사람이 갱신하고 보고해야 합니다')
  // 기준을 다르게 보면 막히는지 — 분기 자체를 확인한다
  const src = readFileSync(join(ROOT, 'scripts/run-twin-smoke-032.ts'), 'utf8')
  assert.match(src, /if \(key !== APPROVED_PLAN_KEY\)/)
  assert.match(src, /EXIT\.planMismatch/)
  // 자동 갱신 경로가 없다
  const exec = src.split(NL).filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*')).join(NL)
  assert.ok(!/APPROVED_PLAN_KEY\s*=\s*approvalKey\(\)/.test(exec),
    '승인 기준을 코드가 스스로 갱신합니다')
})

test('T8 기록이 없으면 실험 잠금을 만들고 진행한다 (대조군)', async () => {
  const dir = makeWorkdir()
  try {
    const { deps } = entryDeps(dir)
    assert.equal(await run(deps), EXIT.ok)
    assert.ok(existsSync(join(dir, RUN_STATE_DIR, EXPERIMENT_LOCK_FILE)), '실험 잠금을 만들지 않았습니다')
    assert.ok(existsSync(runRecordPath(dir, approvalKey())))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ════════════════════════════════════════════════════════════════════
// U) OpenAI 설정 공급 — 035 §5 (조회 도구와 스모크가 같은 출처)
// ════════════════════════════════════════════════════════════════════

test('U1 셸 값이 먼저다 — 환경파일을 전혀 읽지 않는다', () => {
  const reads: string[] = []
  const c = resolveOpenAiConfig({
    shellKey: SYN_OPENAI_KEY,
    sharedEnvPath: '/main/.env.local',
    // 전용 파일이 있어도 읽지 않는다
    fs: { isFile: () => true, read: (p) => { reads.push(p); return '' } },
    parseEnv: REAL_ENV_PARSER,
  })
  assert.equal(c.ok, true)
  assert.equal(c.source, 'shell')
  assert.equal(c.envReads, 0)
  assert.deepEqual(reads, [], '셸 값이 있는데 파일을 읽었습니다')
  assert.equal(c.apiKey, SYN_OPENAI_KEY)
})

test('U2 셸에 없으면 **전용 파일만** 읽는다 — 036: 실제 Node 파서로', () => {
  const reads: string[] = []
  const c = resolveOpenAiConfig({
    shellKey: undefined,
    sharedEnvPath: '/main/.env.local',
    fs: {
      isFile: (p) => p.endsWith(`/${ISOLATED_ENV_FILENAME}`),
      read: (p) => { reads.push(p); return `OPENAI_API_KEY=${SYN_OPENAI_KEY}${NL}` },
    },
    parseEnv: REAL_ENV_PARSER,
  })
  assert.equal(c.ok, true)
  assert.equal(c.source, 'isolated_file')
  assert.equal(c.envReads, 1)
  assert.equal(c.apiKey, SYN_OPENAI_KEY)
  assert.equal(reads.length, 1)
  assert.ok(reads[0].endsWith(`/${ISOLATED_ENV_FILENAME}`), reads[0])
  // 공유 파일은 읽지 않았다
  assert.ok(!reads.some((p) => p.endsWith('/.env.local')), '공유 파일을 읽었습니다')
})

test('U3 공유 파일만 있으면 **중단**한다 — 무언의 fallback 금지 (§103)', () => {
  const reads: string[] = []
  const c = resolveOpenAiConfig({
    shellKey: undefined,
    sharedEnvPath: '/main/.env.local',
    // 전용 파일은 없다
    fs: { isFile: (p) => p.endsWith('/.env.local'), read: (p) => { reads.push(p); return '' } },
    parseEnv: REAL_ENV_PARSER,
  })
  assert.equal(c.ok, false)
  assert.equal(c.code, CODE_NOT_ISOLATED)
  assert.equal(c.apiKey, null)
  assert.deepEqual(reads, [], '공유 파일을 읽었습니다')
})

test('U4 설정 설명에 키 값이 들어가지 않는다 (§104)', () => {
  const ok = resolveOpenAiConfig({
    shellKey: SYN_OPENAI_KEY, sharedEnvPath: null,
    fs: { isFile: () => false, read: () => '' }, parseEnv: REAL_ENV_PARSER,
  })
  const text = describeOpenAiConfig(ok)
  assert.ok(!text.includes(SYN_OPENAI_KEY), '설명에 키가 실렸습니다')
  assert.match(text, /값은 출력하지 않습니다/)
  assert.match(text, new RegExp(String(SYN_OPENAI_KEY.length) + '자'))
})

test('U5 전용 경로 해석은 공유 파일로 되돌아가지 않는다', () => {
  assert.equal(resolveIsolatedOpenAiEnvPath(null, { isFile: () => true }), null)
  assert.equal(resolveIsolatedOpenAiEnvPath('/m/.env.local', { isFile: () => false }), null)
  assert.ok(String(resolveIsolatedOpenAiEnvPath('/m/.env.local', { isFile: () => true }))
    .endsWith(`/${ISOLATED_ENV_FILENAME}`))
})

test('U6 스모크 CLI 도 같은 공용 함수를 쓰고 키를 **명시 전달**한다 (§102·§103)', () => {
  const src = readFileSync(join(ROOT, 'scripts/run-twin-smoke-032.ts'), 'utf8')
  assert.match(src, /from '\.\.\/lib\/twin\/openaiConfig'/, '공용 모듈을 쓰지 않습니다')
  assert.match(src, /resolveOpenAiConfig\(\{/)
  // SDK 가 process.env 에서 알아서 집어가게 두지 않는다
  assert.match(src, /apiKey: openai\.apiKey \?\? undefined/)
  assert.ok(!/apiKey: undefined as string \| undefined/.test(src),
    'apiKey 를 undefined 로 두는 자리가 남아 있습니다')
  // 공유 파일 적재 **전에** 셸 값을 떠 둔다
  const shellAt = src.indexOf('const shellOpenAiKey = deps.env.OPENAI_API_KEY')
  const loadAt = src.indexOf('deps.loadEnvFile(envPath)')
  assert.ok(shellAt > 0 && loadAt > 0 && shellAt < loadAt,
    '공유 파일을 적재한 뒤에 셸 값을 읽습니다 — 무언의 fallback 이 됩니다')
})

test('U7 스모크: OpenAI 전용 출처가 없으면 외부 요청 전에 멈춘다', async () => {
  const dir = makeWorkdir()
  try {
    const touched: string[] = []
    const { deps, lines } = entryDeps(dir, {
      // 셸에 OpenAI 키가 없고 전용 파일도 없다
      env: {
        [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
        NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
        SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
      } as unknown as NodeJS.ProcessEnv,
      makeClient: async () => { touched.push('makeClient'); throw new Error('불려서는 안 됩니다') },
    })
    assert.equal(await run(deps), EXIT.configNotIsolated)
    assert.deepEqual(touched, [], '설정이 없는데 클라이언트를 만들었습니다')
    const out = lines.join(NL)
    assert.match(out, new RegExp(CODE_NOT_ISOLATED))
    assert.match(out, /공유 \.env\.local 의 값을 OpenAI 키로 쓰지 않습니다/)
    // 실험 잠금을 쓰지 않았다 — 설정 문제로 잠금을 소모하지 않는다
    assert.ok(!existsSync(join(dir, RUN_STATE_DIR, EXPERIMENT_LOCK_FILE)),
      '설정 실패인데 실험 잠금을 잡았습니다')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('U8 런북에 평문 키를 넣는 명령 예시가 없다 (§107)', () => {
  const rb = readFileSync(join(ROOT, 'SMOKE_RUNBOOK_035.md'), 'utf8')
  assert.ok(!/\$env:OPENAI_API_KEY\s*=/.test(rb),
    '런북에 평문 OpenAI 키를 넣는 명령이 있습니다')
  // 전용 파일 경로가 기본 안내여야 한다
  assert.match(rb, new RegExp(ISOLATED_ENV_FILENAME))
})

test('U9 전용 파일이 git·묶음에 들어가지 않게 막혀 있다 (§108)', () => {
  const gi = readFileSync(join(ROOT, '.gitignore'), 'utf8')
  assert.match(gi, new RegExp(ISOLATED_ENV_FILENAME.replace('.', '\.')),
    '.gitignore 가 전용 설정파일을 막지 않습니다')
  // 묶음 목록에도 없어야 한다
  const manifest = readFileSync(join(ROOT, 'MANIFEST.sha256'), 'utf8')
  assert.ok(!manifest.includes(ISOLATED_ENV_FILENAME), 'manifest 에 전용 설정파일이 있습니다')
})

// ════════════════════════════════════════════════════════════════════
// V) 끝에서 끝까지 — 설치 SDK + 주입 fetch → 파이프라인 → **최종 CLI 분류** (035 §66)
// ════════════════════════════════════════════════════════════════════
//
// 034 시험은 분류기와 전송기를 각각 봤다. GPT 는 "마지막 필수 검토" 의 실패·초과가
// **실제 CLI 종료코드와 기록에** 반영되는지 보라고 했다. 여기서 그것을 한 줄로 잇는다.

/** 진입점이 쓰는 파이프라인을 **실제로** 돌린다 (대역은 fetch·DB 뿐) */
function e2eDeps(dir: string, opts: {
  reviewReplies: Replier[]          // 검토 응답을 호출 순서대로
  countTokens?: number[]            // 계수 응답을 호출 순서대로
}) {
  const repo = new SynRepo()
  let reviewSeq = 0
  let countSeq = 0
  const { fetchImpl, sent, counted } = injectFetch({
    reply: (b) => {
      if (b.model === ROLE_MODEL.review) {
        const r = opts.reviewReplies[Math.min(reviewSeq, opts.reviewReplies.length - 1)]
        reviewSeq++
        return r(b)
      }
      return { json: sdkReply(JSON.stringify(genPayload([cand(1), cand(2)])), OK_USAGE) }
    },
    countReply: (b) => {
      const n = opts.countTokens?.[Math.min(countSeq, (opts.countTokens.length - 1))]
        ?? Math.floor(ROLE_MAX_INPUT_TOKENS[b.model === ROLE_MODEL.review ? 'review' : 'generation'] / 2)
      countSeq++
      return { json: { object: 'response.input_tokens', input_tokens: n } }
    },
  })
  const lines: string[] = []
  const deps: SmokeDeps = {
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
      SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
      OPENAI_API_KEY: SYN_OPENAI_KEY,
    } as unknown as NodeJS.ProcessEnv,
    log: (l) => { lines.push(l) },
    fs: realFs(),
    cwd: dir,
    loadEnvFile: () => {},
    makeClient: async () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: SMOKE_SOURCE_ID, book: '쎈', grade: SMOKE_GRADE, semester: 1,
                type_code: SMOKE_TYPE_CODE, step: 'B', difficulty: '대표',
                answer_kind: 'number', answer_text: 'ANSWER-987654321',
                image_path: 'hc1-1/ssen/01/0001.png', twin_id: null as number | null,
                is_essay: false,
              },
              error: null as unknown,
            }),
          }),
        }),
      }),
      // 파이프라인의 repo·Storage 는 진입점이 실제 모듈로 만든다 → 아래에서 가로챈다
    }),
    fetchImpl,
    now: () => '2026-10-12T00:00:00.000Z',
    // 파이프라인은 **실제로** 돌린다. 대신 Storage·repo 만 대역으로 바꾼다
    runPipeline: (a) => runTwinPipelineForSource({
      ...a,
      deps: {
        ...a.deps,
        loadStorageMeta: async () => META,
        loadImageDataUrl: async () => `data:image/png;base64,${synPngBase64(320, 320)}`,
        repo,
      },
    }),
  }
  return { deps, lines, repo, sent, counted }
}

/** 합성 320×320 PNG (IHDR 까지만). 실제 이미지가 아니다 */
function synPngBase64(w: number, h: number): string {
  const b = Buffer.alloc(24)
  for (const [i, v] of [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].entries()) b[i] = v
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  return b.toString('base64')
}

const reviewOk: Replier = () => ({ json: sdkReply(JSON.stringify(REVIEW_AGREE), OK_USAGE) })

test('V1 끝에서 끝까지 정상 — 기술적 완료 · exit 0', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines, repo, sent, counted } = e2eDeps(dir, { reviewReplies: [reviewOk] })
    const code = await run(deps)
    assert.equal(code, EXIT.ok, lines.join(NL))
    assert.equal(counted.length, 3, '계수 3회가 아닙니다')
    assert.equal(sent.length, 3, '추론 3회가 아닙니다')
    assert.equal(repo.created.length, 2)
    assert.match(lines.join(NL), /기술적 완료/)
    const rec = JSON.parse(readFileSync(runRecordPath(dir, approvalKey()), 'utf8')) as RunRecord
    assert.equal(rec.classification, 'complete')
    assert.equal(rec.exitCode, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V2 **마지막** 검토가 예약 입력을 넘으면 CLI 가 비0 으로 끝난다 (§66)', async () => {
  const dir = makeWorkdir()
  try {
    // 첫 검토는 정상, **두 번째(마지막)** 검토만 usage.input 을 예약보다 크게
    let n = 0
    const lastOver: Replier = () => {
      n++
      return n === 1
        ? { json: sdkReply(JSON.stringify(REVIEW_AGREE), OK_USAGE) }
        : { json: sdkReply(JSON.stringify(REVIEW_AGREE), { input_tokens: 9000, output_tokens: 50 }) }
    }
    const { deps, lines, repo } = e2eDeps(dir, {
      reviewReplies: [lastOver],
      // 생성·첫 검토의 계수는 응답보다 **크게** 둔다 (그쪽이 먼저 초과하면 안 된다).
      // 마지막 검토만 계수 1000 인데 응답이 9000 이다
      countTokens: [6000, 6000, 1000],
    })
    const code = await run(deps)
    assert.notEqual(code, 0, `exit ${code} — 마지막 검토 초과인데 성공으로 끝났습니다`)
    assert.equal(code, EXIT.reservationExceeded)
    const out = lines.join(NL)
    assert.match(out, /예약 초과/)
    // **기존 저장은 보존된다** (§64)
    assert.equal(repo.created.length, 2, '저장된 후보가 사라졌습니다')
    assert.match(out, /저장=2/)
    const rec = JSON.parse(readFileSync(runRecordPath(dir, approvalKey()), 'utf8')) as RunRecord
    assert.equal(rec.exitCode, EXIT.reservationExceeded)
    assert.equal(rec.classification, 'reservation_exceeded')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V3 **마지막** 검토가 계산액을 넘으면 CLI 가 비0 으로 끝난다', async () => {
  const dir = makeWorkdir()
  try {
    let n = 0
    const lastCostOver: Replier = () => {
      n++
      return n === 1
        ? { json: sdkReply(JSON.stringify(REVIEW_AGREE), OK_USAGE) }
        : { json: sdkReply(JSON.stringify(REVIEW_AGREE), { input_tokens: 1000, output_tokens: 10000 }) }
    }
    const { deps, lines, repo } = e2eDeps(dir, {
      reviewReplies: [lastCostOver], countTokens: [6000, 6000, 1000],
    })
    const code = await run(deps)
    assert.equal(code, EXIT.reservationExceeded, lines.join(NL))
    assert.equal(repo.created.length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('V4 **두 번째** 계수 오류 — 그 추론만 미전송, 앞선 저장·추론 수는 보존', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines, repo, sent, counted } = e2eDeps(dir, {
      reviewReplies: [reviewOk],
      // 생성 계수는 정상, 첫 검토 계수에서 천장을 넘긴다
      countTokens: [6000, ROLE_MAX_INPUT_TOKENS.review + 1, 1000],
    })
    const code = await run(deps)
    assert.notEqual(code, 0, `exit ${code}`)
    const out = lines.join(NL)
    // 생성 1회는 나갔고 검토는 나가지 않았다
    assert.equal(sent.length, 1, `추론 ${sent.length}회 — 생성 1회만이어야 합니다`)
    assert.equal(counted.length, 2, '계수는 생성 1 + 검토 1(막힘) = 2회')
    // **앞선 저장을 0 으로 만들지 않는다** (§61)
    assert.ok(repo.created.length >= 1, '저장이 일어나지 않았습니다')
    assert.match(out, /저장=/)
    assert.ok(!/저장=0 /.test(out), `저장 수를 0 으로 보고했습니다: ${out}`)
    // '그 요청 미전송' 과 '실험 전체 추론 0회' 를 구분한다 (§62)
    assert.match(out, /그 추론을\*\* 보내지 않았습니다|보내지 않았습니다/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('W1 사유→분류 대응이 뜻을 잃지 않는다 (§60)', () => {
  const pairs: Array<[string, string]> = [
    ['count_server', 'input_rejected'],
    ['count_invalid', 'input_rejected'],
    ['input_tokens_exceeded', 'input_rejected'],
    ['input_count_invalid', 'input_rejected'],
    ['input_over_reserved', 'reservation_exceeded'],
    ['cost_over_reserved', 'reservation_exceeded'],
    ['budget_exceeded', 'budget_exceeded'],
    ['reservation_record_failed', 'record_failed'],
    ['usage_unknown', 'usage_unknown'],
  ]
  for (const [reason, code] of pairs) {
    assert.equal(classifyStopReason(reason), code, reason)
  }
  // **모르는 사유는 안전한 비정상 종료** (§59). 성공으로 가지 않는다
  for (const unknown of ['model_refusal', 'empty_response', 'incomplete_max_output_tokens',
                         'aborted_after_failure', 'live_call_blocked', 'server',
                         'brand_new_code_from_the_future']) {
    assert.equal(classifyStopReason(unknown), 'aborted', unknown)
  }
  // 어느 분류도 0 이 아니다
  for (const [, code] of pairs) {
    assert.notEqual(exitCodeFor({
      code: code as RunClassification['code'],
      savedCount: 0, rejectedCount: 0, errorCount: 0,
      reviewFailedCount: 0, consensusMismatchCount: 0,
      stage: null, failCode: null, stopReason: null,
      inferenceCount: 0, lastRequestUnsent: false,
    }), 0, code)
  }
})
