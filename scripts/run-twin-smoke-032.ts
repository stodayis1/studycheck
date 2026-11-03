/**
 * 첫 소량 생성(스모크) 진입점 — GPT-EXEC-032 → **033 개정**.
 *
 *   대상: 공통수학1 · 유형 공수1-01-07 · 원문 problems.id = 46284 · 후보 2개
 *   유료 요청: 생성 1회 + 검토 최대 2회 = **최대 3회** (후보가 2개라서 2회가 아니다)
 *   예산: 한 번의 **전체 실행**에 $1 (요청 하나당이 아니다 — 033 §36)
 *
 * **기본 동작은 계획 출력이다.** 아무 인자 없이 실행하면 네트워크·DB·키에 손대지 않는다.
 * 실제 실행에는 **서로 다른 스위치 두 개**가 모두 필요하다:
 *   1) 명령행 플래그 `--execute-approved-smoke`
 *   2) 환경변수 `TWIN_SMOKE_ALLOW_LIVE=yes`
 *
 * ── 033 에서 고친 것 ──────────────────────────────────────────────
 * R032-04 (a) **부분 저장이 종료코드 0 이었다.** 후보 1개만 저장되고 다른 하나가
 *   `candidate_id=null`·`error` 여도 pipeline 이 `kind='ok'` 면 0 을 돌려줬다.
 *   이제 기술적 완료 / 부분 저장 / 품질 거부 / 거절 / 지원 불가를 **각각 다른 비0 코드**로 낸다.
 * R032-04 (b) **원문 오류를 그대로 찍었다.** `c.error` 는 DB 오류 원문이고
 *   `result.detail` 은 생성 단계에서 `gen.reason`(모델 자유서술 거부 사유·Zod 메시지)이다.
 *   GPT 검수에서 합성 표식 `SYNTH_SECRET_NOT_REAL` 이 그대로 출력되는 것이 확인됐다.
 *   이제 **`detail` 과 `error` 본문을 절대 출력하지 않고** 구조화된 코드·개수만 적는다.
 * §6-B 승인 기록과 실행 잠금을 더했다. 같은 조건이 아니면 다른 batch 로 넘어가지 않고,
 *   비정상 종료 뒤 자동 재호출을 막는다.
 *
 * ⚠ 이 스크립트는 **실행 승인을 받지 않았다.** 돌리는 분은 원장님이고, GPT 승인이 먼저다.
 */
import { createHash } from 'node:crypto'
import nodeFs from 'node:fs'
import nodePath from 'node:path'

import {
  runTwinPipelineForSource, REQUIRED_CANDIDATE_COUNT,
  type PipelineDeps, type PipelineResult,
} from '../lib/twin/pipeline'
import { isEligible, toSourceProblem, type SourceProblem } from '../lib/twin/targets'
import {
  inspectImageDataUrl, checkImageWithinHighDetail, imageTokenUpperBound,
} from '../lib/twin/imageSize'
import { loadStorageMeta, loadSourceImageDataUrl } from '../lib/twin/storage'
import { SupabaseServerRepository } from '../lib/twin/repository'
import {
  SmokeMeter, createSmokeTransport, SmokeBudgetError,
  SMOKE_MAX_PAID_CALLS, SMOKE_RUN_BUDGET_USD, reserveCeilingUsd,
  PRICE_USD_PER_1M, REGIONAL_HEADROOM,
} from '../lib/twin/smoke'
import {
  AbortGate, ROLE_MODEL, ROLE_MAX_OUTPUT_TOKENS, ROLE_MAX_INPUT_TOKENS,
  SEND_TIMEOUT_MS, SEND_MAX_RETRIES, OFFICIAL_BASE_URL, IMAGE_DETAIL, SERVICE_TIER,
  type FetchLike,
} from '../lib/twin/openaiSend'
// 030 에서 만든 설정 읽기를 그대로 쓴다. origin 검사와 키 형식 검사가 거기 있다.
// 그 파일은 `require.main === module` 로 감싸져 있어 import 만으로는 아무것도 돌지 않는다.
import { resolveEnvFilePath, readConfig, EXPECTED_ORIGIN } from './check-storage-sample-029'
// 035 §102: OpenAI 설정 공급은 조회 도구와 **같은 공용 모듈**을 쓴다
import {
  resolveOpenAiConfig, describeOpenAiConfig, expectedIsolatedPathForMessage,
  explainOpenAiConfigFailure, defaultEnvParser, CODE_NOT_ISOLATED,
  type EnvParser,
} from '../lib/twin/openaiConfig'

// ─── 대상 ────────────────────────────────────────────────────────────
export const SMOKE_SOURCE_ID = 46284
export const SMOKE_TYPE_CODE = '공수1-01-07'
export const SMOKE_GRADE = '공통수학1'
export const SMOKE_CANDIDATE_COUNT = REQUIRED_CANDIDATE_COUNT   // 2

export const EXECUTE_FLAG = '--execute-approved-smoke'
export const LIVE_ENV_NAME = 'TWIN_SMOKE_ALLOW_LIVE'
export const LIVE_ENV_VALUE = 'yes'
export const HELP_FLAGS = ['--help', '-h', '--plan'] as const

/** 승인 기록·실행 잠금을 두는 폴더. 원장님이 JSON 을 손으로 고치게 하지 않는다 */
export const RUN_STATE_DIR = '.twin-smoke'

/**
 * **실험 식별자** — 승인키와 독립이다 (GPT-EXEC-035 §74, R034-02).
 *
 * 034 판은 `run-<현재 approvalKey>.json` **한 개**만 봤다. 그래서 승인 조건을 조금 바꿔
 * 키가 달라지면 이전 기록을 못 보고 새 실행을 허용했다. GPT 가 격리 폴더에서
 * 다른 키의 `in_progress` · 파손 · `finished`(예약 3.1) 기록 세 경우 모두 exit 0 으로
 * 진행되는 것을 재현했다.
 *
 * 이 값은 "원문 46284 로 처음 한 번 하는 스모크 실험" 을 가리키는 **고정 문자열**이다.
 * 코드에서 계산하지 않는다 — 계산하면 조건을 바꿔 잠금을 피할 수 있다.
 */
export const EXPERIMENT_ID = 'twin-smoke-first-46284'

/** 실험 단위 배타 잠금 파일 이름. 승인키가 바뀌어도 **같은 파일**이다 */
export const EXPERIMENT_LOCK_FILE = `experiment-${EXPERIMENT_ID}.lock`

/**
 * **고정된 계획 식별** — 035 §77.
 *
 * "현재 코드에서 새 hash 를 계산하는 일" 과 "승인된 계획에 일치하는지 확인하는 일" 은
 * 다르다. 034 판은 전자만 했다. 이 상수는 **이번 검수 대상으로 고정한 값**이고,
 * 코드가 계산한 키가 이것과 다르면 조건이 바뀐 것이므로 **멈춘다.**
 *
 * 계획을 바꿔야 하면 이 상수를 사람이 고치고 그 사실을 보고한다.
 * 자동으로 갱신해 자기 자신과 비교하지 않는다.
 */
export const APPROVED_PLAN_KEY = 'd139142ec46c81e3'

/**
 * 프롬프트 파일의 봉인된 해시. 실행 때 다시 계산해 다르면 멈춘다.
 *
 * 저장소 코드 어디에서도 `prompts/*.md` 를 디스크에서 읽지 않는다 — 주입하는 호출부가
 * 없었기 때문이다. 이 진입점이 그 첫 자리다.
 */
export const PROMPT_FILES = {
  generation: {
    path: 'prompts/twin-gen-v1.1.md',
    sha256: '8865e70769a5a5ee9c1232f9c04c99e77b21329fc8a042643ee1f83107221542',
  },
  review: {
    path: 'prompts/twin-review-v1.1.md',
    sha256: 'd6487565c5f9ca966004564cbf67c4df849a7dd44be4592a6e82821f18cba59f',
  },
} as const

export const EXIT = {
  ok: 0,
  planned: 0,
  badArgs: 2,
  notApproved: 3,
  configMissing: 4,
  promptChanged: 5,
  targetMismatch: 6,
  /** 파이프라인이 단계에서 멈췄다 */
  pipelineFailed: 7,
  /** 호출 수·예산 상한에 걸렸다 */
  budgetBlocked: 8,
  unexpected: 9,
  /** 일부만 저장됐다. **전체 성공이 아니다** (§140) */
  partialSave: 10,
  /** 후보가 형식·검산에서 정상적으로 거부됐다. 품질 실패지 저장 오류가 아니다 (§141) */
  qualityRejected: 11,
  /** 모델이 응답을 거절했다 */
  generationRefused: 12,
  /** 모델이 만들 수 없다고 답했다. 실패와 다른 종류다 */
  unsupported: 13,
  /** 앞선 실행 기록이 남아 있다. 자동으로 지우거나 재호출하지 않는다 (§149) */
  lockHeld: 14,
  /** 출력 한도에 걸려 잘렸다. 한도를 늘려 재시도하지 않는다 (§66) */
  incomplete: 15,
  /**
   * 034 §84 — 형식을 통과한 후보에 **필요한 검토가 완료되지 않았다.**
   * 저장이 됐다는 이유로 `complete` 라고 하지 않는다.
   */
  reviewFailed: 16,
  /** 034 §60 — 사용량을 확인하지 못했다. 미확인을 0 으로 적지 않는다 */
  usageUnknown: 17,
  /** 034 §46 — 입력 계수가 천장을 넘었거나 계수에 실패했다. 추론 0회 */
  inputRejected: 18,
  /** 034 §66 — 종료 기록에 실패했다. 빈 catch 로 삼키지 않는다 */
  recordIncomplete: 19,
  /** 035 §60 — 응답이 예약한 입력·금액을 넘었다 */
  reservationExceeded: 20,
  /** 035 §60 — 1회 실행 예산을 넘어 전송하지 않았다 */
  budgetExceeded: 21,
  /** 035 §60 — 예약 기록에 실패해 전송하지 않았다 */
  recordFailed: 22,
  /** 035 §59 — 그 밖의 중단. **모르는 사유를 성공으로 끝내지 않는다** */
  aborted: 23,
  /** 035 §77 — 지금 조건이 **승인된 계획과 다르다** */
  planMismatch: 24,
  /** 035 §106 — OpenAI 전용 설정 출처가 없다. 공유 파일로 대체하지 않는다 */
  configNotIsolated: 25,
  /**
   * 036 R035-02 — 앞선 실행 **이력을 확인하지 못했다.**
   * 확인 불가를 "기록 없음" 으로 바꾸지 않는다. 새 잠금·새 기록을 만들기 전에 멈춘다.
   */
  historyUnreadable: 26,
} as const

/**
 * batch_id 를 **대상에서 정해지게** 만든다.
 *
 * 매번 새 UUID 를 만들면 다시 돌릴 때마다 같은 원문에 후보가 쌓인다 (§193).
 * 같은 승인 조건이면 같은 batch_id 가 나오므로 두 번째 실행은 캐시 경로로 들어간다.
 *
 * ⚠ 다만 **「다시 실행은 항상 유료 0회」가 아니다** (§146). 첫 생성이 실패해 후보가
 *   아예 없으면 캐시가 없어 유료 경로가 다시 열린다. 그래서 §6-B 의 실행 기록이 따로 있다.
 */
export function smokeBatchId(approvalKey: string): string {
  const h = createHash('sha256').update(`twin-smoke-033|${approvalKey}`).digest()
  const b = Buffer.from(h.subarray(0, 16))
  b[6] = (b[6] & 0x0f) | 0x40        // version 4 자리
  b[8] = (b[8] & 0x3f) | 0x80        // variant 자리
  const hex = b.toString('hex')
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-')
}

/**
 * 이번 승인 단위에 묶는 것들 (§148).
 *
 * 원문 ID · 생성/검토 프롬프트 **양쪽 해시** · 두 모델 · detail · 제한값.
 * 하나라도 달라지면 **새 승인 없이 다른 batch 로 넘어가지 않는다.**
 * F-03(batch 스키마에 검토 버전 추가)은 이번 스모크 이후의 설계로 남기고 (§150),
 * 지금은 이 로컬 기록으로 조건을 고정한다.
 */
export function approvalFields() {
  return {
    sourceId: SMOKE_SOURCE_ID,
    typeCode: SMOKE_TYPE_CODE,
    grade: SMOKE_GRADE,
    candidateCount: SMOKE_CANDIDATE_COUNT,
    genPromptSha256: PROMPT_FILES.generation.sha256,
    reviewPromptSha256: PROMPT_FILES.review.sha256,
    generationModel: ROLE_MODEL.generation,
    reviewModel: ROLE_MODEL.review,
    imageDetail: IMAGE_DETAIL,
    maxOutputGeneration: ROLE_MAX_OUTPUT_TOKENS.generation,
    maxOutputReview: ROLE_MAX_OUTPUT_TOKENS.review,
    // 034 §68: 계수 천장·요금 조건·tier 도 승인에 묶는다
    maxInputGeneration: ROLE_MAX_INPUT_TOKENS.generation,
    maxInputReview: ROLE_MAX_INPUT_TOKENS.review,
    serviceTier: SERVICE_TIER,
    priceInputGeneration: PRICE_USD_PER_1M.generation.input,
    priceOutputGeneration: PRICE_USD_PER_1M.generation.output,
    priceInputReview: PRICE_USD_PER_1M.review.input,
    priceOutputReview: PRICE_USD_PER_1M.review.output,
    regionalHeadroom: REGIONAL_HEADROOM,
    maxPaidCalls: SMOKE_MAX_PAID_CALLS,
    maxCountCalls: SMOKE_MAX_PAID_CALLS,   // 추론 1건당 계수 1건
    budgetUsd: SMOKE_RUN_BUDGET_USD,
    timeoutMs: SEND_TIMEOUT_MS,
    maxRetries: SEND_MAX_RETRIES,
    baseUrl: OFFICIAL_BASE_URL,
  }
}

/** 승인 조건을 한 문자열로 눌러 해시한다. 조건이 바뀌면 키가 바뀐다 */
export function approvalKey(): string {
  const f = approvalFields()
  const canonical = Object.keys(f).sort()
    .map((k) => `${k}=${String((f as Record<string, unknown>)[k])}`)
    .join('|')
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16)
}

type Log = (line: string) => void

export function planLines(): string[] {
  const key = approvalKey()
  const f = approvalFields()
  return [
    '첫 소량 생성(스모크) 계획 — GPT-EXEC-034',
    '',
    '[대상]',
    `  과정      ${SMOKE_GRADE}`,
    `  유형      ${SMOKE_TYPE_CODE}`,
    `  원문      problems.id = ${SMOKE_SOURCE_ID} (bigint)`,
    `  후보      ${SMOKE_CANDIDATE_COUNT}개`,
    `  승인키    ${key}  (아래 조건을 눌러 만든 값. 조건이 바뀌면 키도 바뀐다)`,
    `  batch_id  ${smokeBatchId(key)}`,
    '',
    '[모델 — 역할마다 하나로 고정]',
    `  생성      ${f.generationModel}   (출력 상한 ${f.maxOutputGeneration} 토큰)`,
    `  검토      ${f.reviewModel}     (출력 상한 ${f.maxOutputReview} 토큰)`,
    '  역할과 모델이 어긋나면 전송 전에 멈춘다. 환경변수로 바뀌지 않는다.',
    `  endpoint  ${f.baseUrl}  (프록시·다른 주소로 바뀌지 않는다)`,
    `  이미지    detail=${f.imageDetail}  (auto·생략·low 로 두지 않는다)`,
    '',
    '[프롬프트 — 양쪽 해시를 승인에 묶는다]',
    `  생성  ${PROMPT_FILES.generation.path}`,
    `        ${PROMPT_FILES.generation.sha256}`,
    `  검토  ${PROMPT_FILES.review.path}`,
    `        ${PROMPT_FILES.review.sha256}`,
    '  실행 때 다시 계산해 다르면 호출 전에 멈춘다.',
    '',
    '[외부 요청 수 — 계수와 추론을 따로 센다]',
    `  입력 계수  최대 ${f.maxCountCalls}회   POST /responses/input_tokens`,
    `  유료 추론  최대 ${SMOKE_MAX_PAID_CALLS}회   생성 1 + 검토 최대 2`,
    '  (모델 메타데이터 조회 최대 2회는 **별도 실행 단계**이고 여기에 합치지 않는다)',
    '  검토는 형식검사를 통과한 후보에만 돈다. 후보 2개가 모두 형식에서 걸리면 검토는 0회다.',
    `  SDK 자동 재시도 ${f.maxRetries} — 요청 1건이 HTTP 여러 건으로 늘어나지 않는다.`,
    `  대기 상한 ${f.timeoutMs} ms (시간초과로 끝나도 그 호출은 과금될 수 있어 1회로 센다)`,
    '  전송 오류·시간초과·거절·잘림·빈 응답·사용량 미확인 중 하나라도 나면',
    '  **뒤따르는 유료 요청을 보내지 않는다.**',
    `  요금 처리  service_tier=${f.serviceTier} (요청에 명시한다. 주소 고정만으로는 보장되지 않는다)`,
    '',
    '[입력 계수 — 실측값을 천장과 비교한다]',
    `  허용 천장  생성 ${f.maxInputGeneration} · 검토 ${f.maxInputReview} 토큰`,
    '  같은 모델·지침·입력·format·이미지(detail=high)로 계수한 뒤 그 값으로 예약한다.',
    '  천장 초과·누락·비정수·계수 오류면 **그 추론은 0회**다.',
    '  자동 잘라내기·프롬프트 수정·출력 증액을 하지 않는다.',
    '',
    '[예산 — 사전 예약]',
    `  한 번의 전체 실행에 $${f.budgetUsd}  (요청 하나당이 아니다)`,
    `  입력 단가는 **cache-write** 를 쓴다 — 생성 $${f.priceInputGeneration}/1M · 검토 $${f.priceInputReview}/1M`,
    `  출력 단가 생성 $${f.priceOutputGeneration}/1M · 검토 $${f.priceOutputReview}/1M`,
    `  지역 처리 여유 ×${f.regionalHeadroom} (가산 여부 미확정이므로 미포함을 상한으로 쓰지 않는다)`,
    `  천장까지 찼을 때 예약  생성 $${reserveCeilingUsd('generation').toFixed(3)} · 검토 $${reserveCeilingUsd('review').toFixed(3)}`,
    `  3회 모두 나가면 예약 합계 $${(reserveCeilingUsd('generation') + reserveCeilingUsd('review') * 2).toFixed(3)}`,
    '  예약은 **전송 전에 기록에 남긴다.** 기록이 실패하면 전송하지 않는다.',
    '  불명확하게 끝난 요청의 예약은 되돌리지 않는다.',
    '  ⚠ 위 금액은 **이 요금 가정 아래의 계산 예시**다. 미확정 계수 요금까지 포함한',
    '    실제 청구 상한이 아니다. 실제 청구액은 OpenAI 사용량 화면으로 확인한다.',
    '',
    '[DB·Storage]',
    '  읽기  Storage list 1회 + download 1회, problems 조회 1회, server_get_twin_batch_state 1회',
    '  쓰기  server_create_twin_candidate 최대 2회 + server_update_twin_validation 최대 2회',
    '        → twin_candidates 에 최대 2행. problems 행은 건드리지 않는다. 학생에게 공개되지 않는다.',
    '',
    '[실행 조건] — 둘 다 있어야 한다',
    `  명령행   ${EXECUTE_FLAG}`,
    `  환경변수 ${LIVE_ENV_NAME}=${LIVE_ENV_VALUE}`,
    `  접속 대상이 ${EXPECTED_ORIGIN} 이 아니면 접속 전에 멈춘다.`,
    `  앞선 실행 기록이 ${RUN_STATE_DIR}/ 에 남아 있으면 멈춘다 (자동으로 지우지 않는다).`,
    '',
    '⚠ 실행 미승인. 돌리는 것은 원장님이고 그 전에 GPT 승인이 필요하다.',
  ]
}

/**
 * 폴더의 상태 — 036 R035-02.
 *
 * `isDir(): boolean` 하나로는 **"없다"** 와 **"있는지 확인할 수 없다"** 가 구분되지 않는다.
 * `statSync` 가 EACCES 로 던져도 `false` 가 돌아오고, 그러면 코드가 "기록이 없다" 고 판단해
 * 새 실험을 시작해 버린다. 그래서 세 상태를 나눈다.
 */
export type DirState =
  /** ENOENT — **정말 없다.** 아직 만들지 않은 폴더다 */
  | 'missing'
  /** 있고 폴더다 */
  | 'dir'
  /** 있지만 폴더가 아니다 */
  | 'not_dir'
  /** 확인하지 못했다 (권한·I/O 오류 등). **없는 것으로 보지 않는다** */
  | 'unknown'

export type SmokeFs = {
  isDir(p: string): boolean
  isFile(p: string): boolean
  read(p: string): string
  readBytes(p: string): Buffer
  /** 이미 있으면 **실패해야 한다** (`wx`). 이것이 실행 잠금이다 */
  writeNew(p: string, data: string): void
  /**
   * 폴더의 상태. ENOENT 와 그 밖의 오류를 **구분해야 한다** (036 R035-02).
   * `isDir` 처럼 오류를 `false` 로 덮으면 안 된다.
   */
  statDir(p: string): DirState
  /**
   * 폴더의 파일 이름 목록. 알려진  안만 본다 (035 §75).
   *
   * 036 R035-02 — **오류를 빈 배열로 덮지 않는다. 던진다.**
   * 읽히지 않는 것을 "기록 없음" 으로 바꾸면 앞선 실행이 있어도 새로 돌게 된다.
   */
  listDir(p: string): string[]
  write(p: string, data: string): void
  mkdirp(p: string): void
}

export type SmokeDeps = {
  argv: string[]
  env: NodeJS.ProcessEnv
  log: Log
  fs: SmokeFs
  cwd: string
  loadEnvFile(p: string): void
  /**
   * 환경파일 **내용**을 객체로 바꾸는 파서 (036 R035-01).
   *
   * 넣지 않으면 Node 기본 파서(`node:util.parseEnv`)를 쓴다.
   * `null` 을 **명시로** 넣으면 "이 Node 에 파서가 없다" 는 조건이 되고,
   * 그때는 수제 파서로 대신하지 않고 멈춘다.
   *
   * 이 파서는 `process.env` 를 건드리지 않는다 — 그래서 공유 `.env.local` 의 값이
   * 전용 파일의 값을 가리는 일이 생기지 않는다.
   */
  parseEnv?: EnvParser | null
  makeClient(url: string, key: string): Promise<unknown>
  /** 시험에서만 넘긴다. 넘기면 모델 요청이 실제 네트워크로 나가지 않는다 (§82) */
  fetchImpl?: FetchLike
  /** 시험에서 파이프라인을 대신 돌린다. 실제 실행에서는 넘기지 않는다 */
  runPipeline?: (args: {
    source: SourceProblem; batchId: string; candidateCount: number; deps: PipelineDeps
  }) => Promise<PipelineResult>
  now?: () => string
}

type OneRowQuery = {
  from(t: string): {
    select(c: string): {
      eq(c: string, v: unknown): { maybeSingle(): Promise<{ data: unknown; error: unknown }> }
    }
  }
}

/**
 * 원문 1개를 id 로 집어서 읽는다.
 *
 * `pickSourceProblems` 는 유형 단위 `limit` 조회라 **특정 id 를 집을 수 없다.**
 * 지시는 원문 46284 하나이므로 여기서 직접 읽고, 대상 조건은 같은 `isEligible` 로 본다.
 */
export async function loadOneSource(db: OneRowQuery, id: number): Promise<SourceProblem | string> {
  const { data, error } = await db
    .from('problems')
    .select('id, book, grade, semester, type_code, step, difficulty, answer_kind, answer_text, image_path, is_essay, twin_id')
    .eq('id', id)
    .maybeSingle()
  if (error) return `원문 조회에 실패했습니다 (id=${id})`
  if (data === null || data === undefined) return `원문이 없습니다 (id=${id})`
  const row = data as Record<string, unknown>
  if (!isEligible(row)) {
    // 정답 **값**은 적지 않는다
    return `원문 ${id} 이 생성 대상 조건을 만족하지 않습니다 ` +
      `(answer_kind=${row.answer_kind} twin_id=${row.twin_id} is_essay=${row.is_essay} ` +
      `image_path=${row.image_path == null || String(row.image_path).trim() === '' ? '없음' : '있음'})`
  }
  return toSourceProblem(row)
}

/** 대상이 지시받은 그 문항인지 본다. 다르면 모델을 부르지 않는다 */
export function checkTargetIdentity(p: SourceProblem): string | null {
  if (p.id !== SMOKE_SOURCE_ID) return `원문 id 가 ${SMOKE_SOURCE_ID} 이 아닙니다 (${p.id})`
  if (p.type_code !== SMOKE_TYPE_CODE) return `유형이 ${SMOKE_TYPE_CODE} 이 아닙니다 (${p.type_code})`
  if (p.grade !== SMOKE_GRADE) return `과정이 ${SMOKE_GRADE} 이 아닙니다 (${p.grade})`
  return null
}

/** 프롬프트 파일을 읽고 해시를 봉인값과 맞춘다. 다르면 문자열(사유)을 돌려준다 */
export function readSealedPrompts(
  fs: Pick<SmokeFs, 'isFile' | 'readBytes'>,
  root: string,
): { generation: string; review: string } | string {
  const out: Record<string, string> = {}
  for (const [role, spec] of Object.entries(PROMPT_FILES)) {
    const full = nodePath.join(root, spec.path)
    if (!fs.isFile(full)) return `프롬프트 파일이 없습니다: ${spec.path}`
    const buf = fs.readBytes(full)
    const got = createHash('sha256').update(buf).digest('hex')
    if (got !== spec.sha256) {
      return `프롬프트가 봉인값과 다릅니다: ${spec.path}\n` +
        `  봉인 ${spec.sha256}\n` +
        `  실제 ${got}\n` +
        '  프롬프트를 바꿨다면 바꾼 이유를 먼저 기록하고 봉인값을 갱신해야 합니다.'
    }
    out[role] = buf.toString('utf8')
  }
  return { generation: out.generation, review: out.review }
}

// ════════════════════════════════════════════════════════════════════
// §6-A 결과 분류 — 기술적 완료와 부분 저장과 품질 실패를 섞지 않는다
// ════════════════════════════════════════════════════════════════════

/** 바깥으로 내보내는 **안전한** 분류. 원문 오류·모델 자유서술을 담지 않는다 */
export type RunClassification = {
  code:
    | 'complete'             // 후보 2개 저장 + 검증 갱신 완료 + 필요한 검토 완료
    | 'partial_save'         // 일부만 저장됐다
    | 'all_rejected'         // 전부 형식·검산에서 거부됐다 — 품질 실패
    | 'review_failed'        // 034 §84: 필요한 검토가 **기술적으로** 완료되지 않았다
    | 'usage_unknown'        // 034 §60: 사용량을 확인하지 못했다
    | 'input_rejected'       // 034 §46: 계수 실패·천장 초과로 추론 0회
    | 'reservation_exceeded' // 035 §60: 응답이 예약한 입력·금액을 넘었다
    | 'budget_exceeded'      // 035 §60: 1회 실행 예산을 넘어 전송하지 않았다
    | 'record_failed'        // 035 §60: 예약 기록에 실패해 전송하지 않았다
    | 'aborted'              // 035 §59: 그 밖의 중단 — **모르는 사유는 안전한 비정상 종료**
    | 'generation_refused'
    | 'unsupported'
    | 'incomplete_output'
    | 'pipeline_failed'
    | 'cached'
    | 'skipped'
  /** 저장돼 id 를 받은 후보 수 */
  savedCount: number
  /** 형식·검산에서 **정상적으로** 거부된 후보 수. 저장 오류와 다르다 */
  rejectedCount: number
  /** 저장·검증 갱신이 오류로 끝난 후보 수 */
  errorCount: number
  /**
   * 검토가 **기술적으로 실패한** 후보 수. 합의 불일치와 다르다 (034 §83).
   * 정상 검토의 `ai_consensus=false` 는 여기 들어가지 않는다.
   */
  reviewFailedCount: number
  /** 정상 검토였으나 **답이 달랐던** 후보 수. 기술 실패가 아니다 */
  consensusMismatchCount: number
  /** 파이프라인이 멈춘 단계·코드. 둘 다 안전한 값이다 (`detail` 은 담지 않는다) */
  stage: string | null
  failCode: string | null
  /** 공유 stop 상태의 사유. 안전한 코드다 */
  stopReason: string | null
  /** 실제로 나간 유료 추론 수. **실험 전체 0회**와 '이 요청 미전송'을 구분한다 (035 §62) */
  inferenceCount: number
  /** 마지막 요청이 **보내지지 않았는가**. 계수에서 막힌 경우만 true */
  lastRequestUnsent: boolean
}

/**
 * 결과를 **안전한 코드**로 분류한다.
 *
 * 034 §84: pipeline 결과만으로는 부족하다. 공유 stop 상태(`gate`)와
 * 사용량 집계(`meter`)와 후보별 **검토 기술 상태**를 함께 본다.
 * 저장이 됐다는 이유로 `complete` 라고 하지 않는다.
 */
/**
 * 중단 사유를 분류 코드로 옮긴다 — GPT-EXEC-035 §60.
 *
 * 알려진 사유는 뜻을 잃지 않게 각각 옮기고, **모르는 사유는 안전한 비정상 종료**
 * (`aborted`)로 둔다 (§59). "모르니까 성공" 으로 가지 않는다.
 */
export function classifyStopReason(stopReason: string): RunClassification['code'] {
  if (/^count_/.test(stopReason)) return 'input_rejected'
  if (stopReason === 'input_tokens_exceeded' || stopReason === 'input_count_invalid') return 'input_rejected'
  if (stopReason === 'input_over_reserved' || stopReason === 'cost_over_reserved') return 'reservation_exceeded'
  if (stopReason === 'budget_exceeded') return 'budget_exceeded'
  if (stopReason === 'reservation_record_failed') return 'record_failed'
  if (stopReason === 'usage_unknown') return 'usage_unknown'
  // transport_error 계열 · model_refusal · empty_response · incomplete_* ·
  // aborted_after_failure · live_call_blocked · 그 밖의 모르는 코드
  return 'aborted'
}

/** 계수 단계에서 막혀 **그 추론이 나가지 않은** 사유인가 */
function isCountStop(stopReason: string): boolean {
  return /^count_/.test(stopReason)
    || stopReason === 'input_tokens_exceeded' || stopReason === 'input_count_invalid'
}

/**
 * 결과를 **안전한 코드**로 분류한다.
 *
 * ── 035 §2 (R034-01) 에서 고친 것 ────────────────────────────────
 * (a) **중단 사유가 있으면 성공으로 끝내지 않는다.** 034 판은 `input_over_reserved` ·
 *     `cost_over_reserved` · `budget_exceeded` · `reservation_record_failed` 를
 *     `stopReason` 필드에 담기만 하고 `complete`·exit 0 을 돌려줬다.
 *     마지막 요청이라 후속 차단이 드러날 자리가 없어도 **최종 판정이 실패여야 한다.**
 * (b) **수를 먼저 센다.** 034 판은 계수 사유를 조기 반환해 이미 저장된 후보 2개를
 *     `savedCount: 0` 으로 만들었다. 이제 결과에서 먼저 집계하고 사유를 **씌운다.**
 * (c) "이 요청을 보내지 않음" 과 "실험 전체 추론 0회" 를 구분한다 (`inferenceCount`).
 */
export function classifyResult(
  result: PipelineResult,
  ctx: { stopReason?: string | null; tokensComplete?: boolean; paidCalls?: number } = {},
): RunClassification {
  const stopReason = ctx.stopReason ?? null
  const paidCalls = ctx.paidCalls ?? 0

  // ── (1) 수를 **먼저** 센다. 중단 사유가 있어도 집계를 0 으로 만들지 않는다 (§61)
  let saved = 0
  let rejected = 0
  let errored = 0
  let reviewFailed = 0
  let consensusMismatch = 0
  let total = 0

  if (result.kind === 'ok') {
    total = result.candidates.length
    for (const c of result.candidates) {
      if (c.format_ok) {
        if (c.review_status === 'failed') reviewFailed++
        else if (c.review_status === 'ok' && !c.ai_consensus) consensusMismatch++
      }
      if (c.error !== undefined) { errored++; continue }
      if (c.candidate_id === null) { errored++; continue }
      if (c.status === 'rejected') { rejected++; saved++; continue }
      saved++
    }
  } else if (result.kind === 'cached') {
    total = result.candidates.length
    saved = result.candidates.length
  }

  const counts: Omit<RunClassification, 'code'> = {
    savedCount: saved, rejectedCount: rejected, errorCount: errored,
    reviewFailedCount: reviewFailed, consensusMismatchCount: consensusMismatch,
    stage: null, failCode: null, stopReason,
    inferenceCount: paidCalls,
    // 계수에서 막힌 경우에만 "이 요청은 보내지 않았다" 다. 실험 전체 0회와 다르다
    lastRequestUnsent: stopReason !== null && isCountStop(stopReason),
  }

  // ── (2) 결과 종류별 분류
  let byKind: RunClassification['code']
  if (result.kind === 'skipped') byKind = 'skipped'
  else if (result.kind === 'cached') byKind = 'cached'
  else if (result.kind === 'unsupported') byKind = 'unsupported'
  else if (result.kind === 'failed') {
    // `detail` 을 **읽지 않는다.** 거기에 모델 자유서술·Zod 메시지가 들어 있다
    byKind =
      result.code === 'refusal' ? 'generation_refused' :
      result.code === 'incomplete' ? 'incomplete_output' :
      'pipeline_failed'
    counts.stage = result.stage
    counts.failCode = result.code
  } else if (errored > 0 || total < REQUIRED_CANDIDATE_COUNT) byKind = 'partial_save'
  else if (reviewFailed > 0) byKind = 'review_failed'
  else if (ctx.tokensComplete === false && paidCalls > 0) byKind = 'usage_unknown'
  else if (total > 0 && rejected === total) byKind = 'all_rejected'
  else byKind = 'complete'

  // ── (3) 중단 사유가 있으면 **성공으로 끝내지 않는다** (§59)
  if (stopReason === null) return { ...counts, code: byKind }

  // 이미 비성공으로 분류됐다면 자료 상태를 더 잘 설명하는 그쪽을 둔다.
  // 사유는 `stopReason` 필드에 그대로 남으므로 정보를 잃지 않는다.
  if (byKind !== 'complete' && byKind !== 'cached') return { ...counts, code: byKind }

  return { ...counts, code: classifyStopReason(stopReason) }
}

export function exitCodeFor(c: RunClassification): number {
  switch (c.code) {
    case 'complete': return EXIT.ok
    case 'cached': return EXIT.ok
    case 'partial_save': return EXIT.partialSave
    case 'all_rejected': return EXIT.qualityRejected
    case 'generation_refused': return EXIT.generationRefused
    case 'unsupported': return EXIT.unsupported
    case 'incomplete_output': return EXIT.incomplete
    case 'review_failed': return EXIT.reviewFailed
    case 'usage_unknown': return EXIT.usageUnknown
    case 'input_rejected': return EXIT.inputRejected
    case 'reservation_exceeded': return EXIT.reservationExceeded
    case 'budget_exceeded': return EXIT.budgetExceeded
    case 'record_failed': return EXIT.recordFailed
    case 'aborted': return EXIT.aborted
    case 'pipeline_failed': return EXIT.pipelineFailed
    case 'skipped': return EXIT.targetMismatch
  }
}

const CLASSIFICATION_TEXT: Record<RunClassification['code'], string> = {
  complete: '기술적 완료 — 후보가 모두 저장되고 검증 상태가 기록됐습니다',
  partial_save: '부분 저장 — 일부만 저장됐습니다. **전체 성공이 아닙니다**',
  all_rejected: '품질 거부 — 생성은 됐으나 후보 전부가 형식·검산에서 거부됐습니다',
  review_failed: '검토 미완료 — 필요한 독립 검토가 **기술적으로** 실패했습니다. 저장됐어도 완료가 아닙니다',
  usage_unknown: '사용량 미확인 — 토큰·금액을 확인하지 못했습니다. 0 이 아니라 모르는 것입니다',
  input_rejected: '입력 거부 — 입력 계수가 천장을 넘었거나 계수에 실패해 **그 추론을** 보내지 않았습니다',
  reservation_exceeded: '예약 초과 — 응답이 예약한 입력·금액을 넘었습니다. 이미 나간 비용은 되돌리지 못합니다',
  budget_exceeded: '예산 초과 — 1회 실행 예산을 넘어 전송하지 않았습니다',
  record_failed: '기록 실패 — 예약을 기록하지 못해 전송하지 않았습니다',
  aborted: '중단 — 실행이 중간에 멈췄습니다. 성공으로 끝내지 않습니다',
  generation_refused: '모델 거절 — 모델이 응답을 거부했습니다',
  unsupported: '지원 불가 — 모델이 "만들 수 없다"고 답했습니다 (실패와 다릅니다)',
  incomplete_output: '출력 잘림 — 출력 한도에 걸렸습니다. 한도를 늘려 재시도하지 않습니다',
  pipeline_failed: '중단 — 모델·Storage·DB 단계에서 멈췄습니다',
  cached: '이미 만들어진 batch — 유료 호출 없이 끝났습니다',
  skipped: '건너뜀 — 대상 조건을 만족하지 않습니다',
}

// ════════════════════════════════════════════════════════════════════
// §6-B 실행 기록과 잠금
// ════════════════════════════════════════════════════════════════════

export type RunRecord = {
  approvalKey: string
  batchId: string
  status: 'in_progress' | 'finished'
  startedAt: string
  finishedAt?: string
  /** 예약한 금액. 불명확하게 끝나도 0 으로 되돌리지 않는다 */
  reservedUsd?: number
  /**
   * 요청별 예약 내역. **전송 전에** 쓰인다 (034 §64).
   * 비정상 종료 뒤에도 이미 예약한 금액을 읽을 수 있어야 한다 (§65).
   */
  reservations?: Array<{ seq: number; role: string; inputTokens: number; usd: number }>
  lastUpdatedAt?: string
  paidCalls?: number
  classification?: string
  exitCode?: number
  /** 승인에 묶인 조건. 키·정답·이미지는 넣지 않는다 (§149) */
  approval: ReturnType<typeof approvalFields>
}

export function runRecordPath(root: string, key: string): string {
  return nodePath.join(root, RUN_STATE_DIR, `run-${key}.json`)
}

/** 한 기록의 요약. **키·정답·이미지는 담지 않는다** */
export type ScannedRecord = {
  file: string
  status: string | null
  reservedUsd: number | null
  sameKey: boolean
}

/** 이력을 **확인할 수 없을** 때의 사유 코드 (036 R035-02) */
export const CODE_HISTORY_UNREADABLE = 'run_history_unreadable'

/**
 * 이력 조회 결과 — 036 R035-02.
 *
 * **판별 유니온으로 두지 않는다** (`strictNullChecks` 꺼짐, AGENTS.md 함정 3).
 * `state` 로 세 가지를 구분한다:
 *   - `missing`   : 폴더가 **정말 없다** (ENOENT). 앞선 실행이 없다
 *   - `empty`     : 폴더를 **정상으로 열었고** 기록이 없다
 *   - `has_records`: 기록이 있다
 *   - `unreadable`: **확인하지 못했다.** 없는 것으로 보지 않는다
 */
export type ScanOutcome = {
  /** 이력을 확인했는가. `false` 면 `records` 를 "없음" 의 근거로 쓸 수 없다 */
  ok: boolean
  state: 'missing' | 'empty' | 'has_records' | 'unreadable'
  records: ScannedRecord[]
  reservedTotalUsd: number
  /** 확인 실패 사유. 성공하면 null */
  code: string | null
  /** 어디서 막혔는지 (사람 말, 경로·원문 오류는 넣지 않는다) */
  detail: string | null
}

/**
 * `.twin-smoke` **안의** 실행 기록을 전부 살핀다 — 035 §75.
 *
 * 034 판은 현재 승인키의 파일 하나만 봤다. 이제 **알려진 이 폴더 안의** `run-*.json`
 * 전부를 본다. 다른 폴더를 뒤지지 않는다.
 *
 * 읽을 수 없는 파일도 **기록이 있는 것으로 센다** — 읽히지 않는 것을 없는 것으로 보지 않는다.
 */
export function scanExperimentRecords(
  fs: Pick<SmokeFs, 'statDir' | 'isFile' | 'read' | 'listDir'>,
  root: string,
): ScanOutcome {
  const dir = nodePath.join(root, RUN_STATE_DIR)

  // ── 036 R035-02 — 세 상태를 구분한다 ──────────────────────────────
  const st = fs.statDir(dir)
  if (st === 'missing') {
    // ENOENT. 폴더가 정말 없으므로 앞선 실행도 없다
    return { ok: true, state: 'missing', records: [], reservedTotalUsd: 0, code: null, detail: null }
  }
  if (st === 'unknown') {
    // 확인하지 못했다. **빈 것으로 바꾸지 않는다**
    return {
      ok: false, state: 'unreadable', records: [], reservedTotalUsd: 0,
      code: CODE_HISTORY_UNREADABLE, detail: '기록 폴더의 상태를 확인하지 못했습니다',
    }
  }
  if (st === 'not_dir') {
    return {
      ok: false, state: 'unreadable', records: [], reservedTotalUsd: 0,
      code: CODE_HISTORY_UNREADABLE, detail: '기록 위치가 폴더가 아닙니다',
    }
  }

  let names: string[]
  try {
    names = fs.listDir(dir)
  } catch {
    // 035 판은 여기서 `[]` 를 돌려줬다. 그러면 목록을 못 읽어도 새로 돌았다
    return {
      ok: false, state: 'unreadable', records: [], reservedTotalUsd: 0,
      code: CODE_HISTORY_UNREADABLE, detail: '기록 폴더의 목록을 읽지 못했습니다',
    }
  }
  if (!Array.isArray(names)) {
    return {
      ok: false, state: 'unreadable', records: [], reservedTotalUsd: 0,
      code: CODE_HISTORY_UNREADABLE, detail: '기록 목록의 모양이 예상과 다릅니다',
    }
  }

  const currentKey = approvalKey()
  const records: ScannedRecord[] = []
  let reserved = 0
  for (const name of names.sort()) {
    if (!/^run-.*\.json$/.test(name)) continue
    let status: string | null = null
    let usd: number | null = null
    try {
      const parsed = JSON.parse(fs.read(nodePath.join(dir, name))) as Partial<RunRecord>
      status = typeof parsed.status === 'string' ? parsed.status : null
      usd = typeof parsed.reservedUsd === 'number' && Number.isFinite(parsed.reservedUsd)
        ? parsed.reservedUsd : null
      if (usd !== null) reserved += usd
    } catch {
      // 파손 — 없는 것으로 보지 않는다
    }
    records.push({ file: name, status, reservedUsd: usd, sameKey: name === `run-${currentKey}.json` })
  }
  return {
    ok: true,
    state: records.length > 0 ? 'has_records' : 'empty',
    records, reservedTotalUsd: reserved, code: null, detail: null,
  }
}

export async function run(deps: SmokeDeps): Promise<number> {
  const args = deps.argv.slice(2)
  const helpAsked = args.some((a) => (HELP_FLAGS as readonly string[]).includes(a))
  const wantsExecute = args.includes(EXECUTE_FLAG)
  const nowIso = deps.now ?? (() => new Date().toISOString())

  const unknown = args.filter(
    (a) => a !== EXECUTE_FLAG && !(HELP_FLAGS as readonly string[]).includes(a),
  )
  if (unknown.length > 0) {
    deps.log(`모르는 인자입니다: ${unknown.join(' ')}`)
    planLines().forEach(deps.log)
    return EXIT.badArgs
  }

  if (!wantsExecute || helpAsked) {
    planLines().forEach(deps.log)
    deps.log('')
    deps.log('(계획만 출력했습니다. 유료 호출 0회 · DB 쓰기 0회)')
    return EXIT.planned
  }

  // ── 여기부터 실행 모드 ────────────────────────────────────────────
  if (deps.env[LIVE_ENV_NAME] !== LIVE_ENV_VALUE) {
    deps.log(`[035] ${LIVE_ENV_NAME}=${LIVE_ENV_VALUE} 가 없어 멈춥니다.`)
    deps.log('      플래그와 환경변수가 둘 다 있어야 실제 호출이 나갑니다.')
    return EXIT.notApproved
  }

  const envPath = resolveEnvFilePath(deps.cwd, deps.fs)
  if (envPath === null) {
    deps.log('[035] 환경파일 위치를 찾지 못했습니다.')
    return EXIT.configMissing
  }

  /**
   * 035 §103 — 공유 `.env.local` 을 적재하기 **전에** 셸의 OpenAI 값을 떠 둔다.
   *
   * 적재한 뒤의 `process.env.OPENAI_API_KEY` 는 공유 파일에서 딸려 온 값과
   * 구분할 수 없다. 그러면 공유 파일이 **무언의 fallback** 이 된다.
   * 그래서 여기서 먼저 담는다.
   */
  const shellOpenAiKey = deps.env.OPENAI_API_KEY

  try {
    // Supabase 설정은 **별도 용도**다 (§103). 이 적재는 그것 때문이다
    deps.loadEnvFile(envPath)
  } catch {
    deps.log('[035] 환경파일을 읽지 못했습니다. (경로·내용은 출력하지 않습니다)')
    return EXIT.configMissing
  }


  const cfg = readConfig(deps.env as Record<string, string | undefined>)
  if (typeof cfg === 'string') {
    deps.log(`[035] 설정을 쓸 수 없습니다: ${cfg}`)
    return EXIT.configMissing
  }

  const prompts = readSealedPrompts(deps.fs, deps.cwd)
  if (typeof prompts === 'string') {
    deps.log(`[035] ${prompts}`)
    return EXIT.promptChanged
  }
  deps.log('[035] 프롬프트 봉인 확인 통과 (생성·검토 양쪽)')

  // ── OpenAI 설정은 **조회 도구와 같은 공용 함수**로 확보한다 (§102)
  //
  // 036 R035-01: 전용 파일을 **적재**하고 `process.env` 에서 되읽지 않는다.
  // 위에서 Supabase 때문에 공유 `.env.local` 을 이미 적재했으므로, 되읽으면
  // 공유 파일의 값이 전용 파일의 값을 가린다 (`loadEnvFile` 은 기존 값을 덮지 않는다).
  // 그래서 전용 파일 **내용만** 따로 파싱해 그 객체에서 키를 꺼낸다.
  const envParser = Object.prototype.hasOwnProperty.call(deps, 'parseEnv')
    ? deps.parseEnv
    : defaultEnvParser()
  const openai = resolveOpenAiConfig({
    shellKey: shellOpenAiKey,
    sharedEnvPath: envPath,
    fs: deps.fs,
    parseEnv: envParser,
  })
  if (!openai.ok) {
    if (openai.code === CODE_NOT_ISOLATED) {
      deps.log('[035] 중단: OpenAI 전용 설정 출처가 없습니다.')
      deps.log(`      사유코드 = ${CODE_NOT_ISOLATED}`)
      deps.log(`      기대 경로 = ${expectedIsolatedPathForMessage(envPath)}`)
      deps.log('      공유 .env.local 의 값을 OpenAI 키로 쓰지 않습니다 — 그 파일에는 Supabase 키도 있습니다.')
      deps.log('      전용 파일 준비 절차는 런북에 있습니다. 키를 채팅·명령행에 붙여넣지 마십시오.')
      return EXIT.configNotIsolated
    }
    deps.log(`[036] OpenAI 설정을 쓸 수 없습니다 (사유=${openai.code}). 보내지 않았습니다.`)
    deps.log(`      ${explainOpenAiConfigFailure(openai.code)}`)
    deps.log('      공유 .env.local 의 값으로 채우지 않았습니다. 클라이언트 0개 · 요청 0회.')
    return EXIT.configMissing
  }
  deps.log(`[035] OpenAI 설정: ${describeOpenAiConfig(openai)}`)
  // 돌려받은 값을 **명시로** sender·counter 에 넘긴다. SDK 가 process.env 에서
  // 알아서 집어가게 두지 않는다 (036 §45). 전달 지점은 아래 createSmokeTransport 다
  deps.log('      이 값을 생성기·계수기에 명시로 넘깁니다 (환경변수 자동 사용 없음)')

  const key = approvalKey()
  const batchId = smokeBatchId(key)
  deps.log(`[035] 승인키 ${key} · batch_id ${batchId}`)

  // ── 고정된 계획과 대조한다 (035 §77) ─────────────────────────────
  // 코드가 계산한 키를 **그 자체로 승인으로 삼지 않는다.**
  if (key !== APPROVED_PLAN_KEY) {
    deps.log('[035] 중단: 계획 조건이 승인된 계획과 다릅니다.')
    deps.log(`      승인된 계획 식별 = ${APPROVED_PLAN_KEY}`)
    deps.log(`      지금 조건의 식별   = ${key}`)
    deps.log('      조건을 바꿨다면 새 승인을 받아야 합니다. 자동으로 맞추지 않습니다.')
    return EXIT.planMismatch
  }

  // ── 실험 단위 잠금 — 승인키가 달라도 **같은 실험이면 하나만** (035 §74~§76)
  const stateDir = nodePath.join(deps.cwd, RUN_STATE_DIR)
  const scan = scanExperimentRecords(deps.fs, deps.cwd)

  // ── 036 R035-02 — **확인하지 못한 것을 "없음" 으로 쓰지 않는다** ──
  // 035 판은 목록 조회가 실패하면 빈 배열을 받아 "앞선 실행 없음" 으로 보고 진행했다.
  // 이제 확인 불가는 **그 자체로 중단 사유**다. 새 잠금·새 기록을 만들기 **전**이다.
  if (!scan.ok) {
    deps.log('[036] 중단: 앞선 실행 기록을 확인할 수 없습니다.')
    deps.log(`      사유코드 = ${scan.code}`)
    deps.log(`      ${scan.detail}`)
    deps.log(`      기록 위치: ${RUN_STATE_DIR}/`)
    deps.log('      확인하지 못한 것을 "기록 없음" 으로 보지 않습니다 — 이미 돌았을 수 있습니다.')
    deps.log('      클라이언트 0개 · 계수 0회 · 추론 0회 · 새 잠금 0건 · 새 기록 0건.')
    deps.log('      기록을 지우거나 다른 폴더를 뒤지지 않았습니다. 권한·경로를 사람이 확인해야 합니다.')
    return EXIT.historyUnreadable
  }
  if (scan.records.length > 0) {
    deps.log(`[035] 앞선 실행 기록이 ${scan.records.length}건 있습니다. 외부 요청 전에 멈춥니다.`)
    for (const r of scan.records) {
      deps.log(`      ${r.file}  상태=${r.status ?? '읽을 수 없음'}` +
        (r.reservedUsd === null ? '' : ` 예약=$${r.reservedUsd.toFixed(3)}`) +
        (r.sameKey ? '  (같은 승인키)' : '  (다른 승인키)'))
    }
    deps.log(`      누적 예약(읽힌 것만) = $${scan.reservedTotalUsd.toFixed(3)}`)
    deps.log('      승인키를 바꿔도 이 실험의 잠금을 피할 수 없습니다.')
    deps.log(`      기록 위치: ${RUN_STATE_DIR}/`)
    deps.log('      다시 돌려야 한다면 **GPT 승인을 받아** 그 파일들을 지운 뒤 진행하십시오.')
    deps.log('      이 도구는 기록을 자동으로 지우거나 덮어쓰지 않습니다.')
    return EXIT.lockHeld
  }

  deps.fs.mkdirp(stateDir)

  // 실험 단위 **배타** 잠금. 확인과 생성 사이의 경쟁을 `wx` 로 닫는다 (§76)
  const expLockPath = nodePath.join(stateDir, EXPERIMENT_LOCK_FILE)
  try {
    deps.fs.writeNew(expLockPath, JSON.stringify({
      experimentId: EXPERIMENT_ID, approvalKey: key, startedAt: nowIso(),
    }, null, 2))
  } catch {
    deps.log('[035] 이 실험의 잠금이 이미 잡혀 있습니다 (동시 실행일 수 있습니다).')
    deps.log(`      잠금: ${RUN_STATE_DIR}/${EXPERIMENT_LOCK_FILE}`)
    deps.log('      보내지 않았습니다. 자동으로 지우지 않습니다.')
    return EXIT.lockHeld
  }

  const recPath = runRecordPath(deps.cwd, key)
  const record: RunRecord = {
    approvalKey: key, batchId, status: 'in_progress',
    startedAt: nowIso(), approval: approvalFields(),
  }
  try {
    // `wx` — 이미 있으면 실패한다. 동시 실행을 여기서 막는다
    deps.fs.writeNew(recPath, JSON.stringify(record, null, 2))
  } catch {
    deps.log('[035] 실행 기록을 만들지 못했습니다 (동시 실행일 수 있습니다). 보내지 않았습니다.')
    return EXIT.lockHeld
  }

  const gate = new AbortGate()
  const meter = new SmokeMeter(SMOKE_RUN_BUDGET_USD)
  // **이 호출 안에서만** 쓰는 상태다. 모듈 수준에 두면 한 프로세스에서 두 번째 실행의
  // 기록이 닫히지 않는다 (시험이 `run` 을 여러 번 부른다)
  let recordClosed = false
  /** 이미지 크기 판정 실패 사유. 분류에 넘긴다 */
  let imageFailCode: string | null = null

  try {
    const db = await deps.makeClient(cfg.url, cfg.key)
    const source = await loadOneSource(db as OneRowQuery, SMOKE_SOURCE_ID)
    if (typeof source === 'string') {
      deps.log(`[035] ${source}`)
      return finish(EXIT.targetMismatch, 'target_mismatch')
    }
    const mismatch = checkTargetIdentity(source)
    if (mismatch !== null) {
      deps.log(`[035] 대상이 다릅니다: ${mismatch}`)
      return finish(EXIT.targetMismatch, 'target_mismatch')
    }
    deps.log(
      `[035] 대상 확인: ${SMOKE_GRADE} · ${SMOKE_TYPE_CODE} · 원문 ${source.id} · 정답종류 ${source.answer_kind}`,
    )

    /**
     * 034 §64 — **요청 전에** 예약을 기록에 남긴다. 기록이 실패하면 전송하지 않는다.
     *
     * 033 은 종료 처리에서만 `reservedUsd` 를 적었고 그 실패를 빈 catch 로 삼켰다.
     * 그러면 비정상 종료 뒤 **이미 예약한 금액을 읽을 수 없다** (§65).
     */
    const persistReservation = (s: {
      seq: number; role: string; inputTokens: number; usd: number; reservedTotalUsd: number
    }) => {
      record.reservations = [...(record.reservations ?? []), {
        seq: s.seq, role: s.role, inputTokens: s.inputTokens, usd: s.usd,
      }]
      record.reservedUsd = s.reservedTotalUsd
      record.lastUpdatedAt = nowIso()
      // 던지면 `meter.reserve` 가 `reservation_record_failed` 로 막는다
      deps.fs.write(recPath, JSON.stringify(record, null, 2))
    }

    const common = {
      meter, gate, allowLiveCall: true,
      // 035 §103: SDK 가 process.env 에서 알아서 집어가게 두지 않는다.
      // **확보한 값을 명시적으로** 전달한다
      fetchImpl: deps.fetchImpl, apiKey: openai.apiKey ?? undefined,
      persistReservation,
    }
    /**
     * 034 §126 — **이미 읽어 온 PNG 에서** 폭·높이를 확인한다.
     *
     * 원문을 다시 내려받지 않는다. 파이프라인이 생성 **전에** 이미지를 읽으므로
     * 여기서 막으면 유료 요청이 나가지 않는다.
     * 크기를 모르거나 지원하지 않는 형식이면 **멈춘다.** 자동으로 줄이거나 바꾸지 않는다.
     */
    const loadAndInspectImage = async (p: string | null): Promise<string | null> => {
      const url = await loadSourceImageDataUrl(db as never, p)
      const v = inspectImageDataUrl(url)
      const within = checkImageWithinHighDetail(v)
      if (!within.ok) {
        imageFailCode = within.code
        deps.log(`[035] 중단: 이미지 크기를 쓸 수 없습니다 (사유=${within.code}).`)
        deps.log('      생성 요청을 보내지 않습니다. 자동으로 줄이거나 다시 내려받지 않습니다.')
        // 파이프라인의 이미지 실패 경로로 보낸다 — 생성 전에 멈춘다
        throw new Error('image_size_unusable')
      }
      deps.log(
        `[035] 이미지 확인: ${v.width}×${v.height} px · 패치 ${v.patchCount} · ` +
        `detail=high 입력 토큰 상한 ${imageTokenUpperBound(v.patchCount!)}`,
      )
      return url
    }

    const pipelineDeps: PipelineDeps = {
      loadStorageMeta: (p) => loadStorageMeta(db as never, p),
      loadImageDataUrl: loadAndInspectImage,
      generationTransport: createSmokeTransport({ role: 'generation', ...common }),
      reviewTransport: createSmokeTransport({ role: 'review', ...common }),
      repo: new SupabaseServerRepository(db as never),
      generationInstructions: prompts.generation,
      reviewInstructions: prompts.review,
    }

    const runner = deps.runPipeline ?? runTwinPipelineForSource
    let result: PipelineResult
    try {
      result = await runner({ source, batchId, candidateCount: SMOKE_CANDIDATE_COUNT, deps: pipelineDeps })
    } catch (e) {
      // 원문 Error 를 찍지 않는다. 분류 코드만 남긴다
      const c = e instanceof SmokeBudgetError ? e.code : 'unexpected'
      deps.log(`[035] 실행이 예외로 끝났습니다: ${c}`)
      reportMeter(meter, deps.log)
      return finish(e instanceof SmokeBudgetError ? EXIT.budgetBlocked : EXIT.unexpected, c)
    }

    const mr = meter.report()
    const classification = classifyResult(result, {
      stopReason: gate.abortReason ?? imageFailCode,
      tokensComplete: mr.tokensComplete,
      paidCalls: mr.totalCalls,
    })
    const code = exitCodeFor(classification)

    deps.log('')
    deps.log(`[035] 결과: ${CLASSIFICATION_TEXT[classification.code]}`)
    deps.log(`      분류코드=${classification.code}` +
      (classification.stage ? ` 단계=${classification.stage}` : '') +
      (classification.failCode ? ` 사유=${classification.failCode}` : ''))
    deps.log(`      저장=${classification.savedCount} · 형식거부=${classification.rejectedCount}` +
      ` · 오류=${classification.errorCount} (후보 ${SMOKE_CANDIDATE_COUNT}개 기준)`)
    deps.log(`      검토 기술실패=${classification.reviewFailedCount}` +
      ` · 합의 불일치=${classification.consensusMismatchCount} (불일치는 기술 오류가 아닙니다)`)
    // 035 §62 — '이 요청을 보내지 않음' 과 '실험 전체 추론 0회' 를 **구분해서** 적는다
    deps.log(`      실제 나간 유료 추론=${classification.inferenceCount}회` +
      (classification.lastRequestUnsent
        ? ' · 마지막 요청은 **보내지 않았습니다** (계수 단계에서 막힘)'
        : ''))
    if (classification.stopReason !== null) {
      deps.log(`      중단 사유=${classification.stopReason}` +
        ' — 중단 사유가 있으면 성공으로 끝내지 않습니다.')
    }
    if (classification.errorCount > 0) {
      deps.log('      ⚠ 오류로 끝난 후보가 있습니다. 원문 오류 메시지는 출력하지 않습니다.')
      deps.log('        자동으로 지우거나 다시 보내지 않습니다. GPT 검수 대상입니다.')
    }

    reportMeter(meter, deps.log)
    deps.log('')
    deps.log('[035] 네 가지는 서로 다른 상태입니다:')
    deps.log('      기술 실행 성공 / 검산 통과 / 사람 검수 완료 / 학생 게시 가능')
    deps.log('      이 실행은 **첫 번째만** 말할 수 있습니다.')
    deps.log('      만들어진 후보는 학생에게 보이지 않습니다. 사람 검수 뒤에만 공개됩니다.')
    return finish(code, classification.code)
  } finally {
    // 기록을 반드시 닫는다. 예약 금액은 되돌리지 않는다
    if (!recordClosed) closeRecord(EXIT.unexpected, 'not_closed')
  }

  // ── 기록 닫기 ───────────────────────────────────────────────────
  /**
   * 034 §66 — **종료 기록 실패를 빈 catch 로 삼키지 않는다.**
   *
   * 033 은 `catch {}` 로 무시하고 성공으로 끝냈다. 그러면 기록이 불완전한 채
   * 종료코드 0 이 나간다. 이제 실패하면 `recordIncomplete` 로 **비0** 이다.
   * 이미 처리한 후보는 **지우지 않는다.**
   */
  function finish(exitCode: number, label: string): number {
    const closed = closeRecord(exitCode, label)
    if (!closed) {
      deps.log('[035] ⚠ 실행 기록을 닫지 못했습니다. 결과를 성공으로 끝내지 않습니다.')
      deps.log('      이미 저장된 후보는 그대로 둡니다 (지우지 않습니다).')
      return EXIT.recordIncomplete
    }
    return exitCode
  }
  /** 닫았으면 true. 실패하면 false — 호출부가 종료코드를 바꾼다 */
  function closeRecord(exitCode: number, label: string): boolean {
    if (recordClosed) return true
    const r = meter.report()
    const closed: RunRecord = {
      ...record,
      status: 'finished',
      finishedAt: nowIso(),
      reservedUsd: r.reservedUsd,
      reservations: meter.reservations.map((x) => ({ ...x })),
      paidCalls: r.totalCalls,
      classification: label,
      exitCode,
    }
    try {
      deps.fs.write(recPath, JSON.stringify(closed, null, 2))
    } catch {
      return false
    }
    recordClosed = true
    return true
  }
}

/** 계량 보고. 토큰·금액은 **확인된 것만** 합한다 */
export function reportMeter(meter: SmokeMeter, log: Log): void {
  const r = meter.report()
  log('')
  log(`[035] 유료 요청 ${r.totalCalls}회 (생성 ${r.byRole.generation} · 검토 ${r.byRole.review})`)
  for (const c of r.calls) {
    log(
      `  #${c.seq} ${c.role} ${c.model} ${c.ms}ms ${c.outcome}` +
      (c.code ? `/${c.code}` : '') +
      ` 입력=${c.inputTokens ?? '미확인'} 출력=${c.outputTokens ?? '미확인'}` +
      ` 예약=$${c.reservedUsd.toFixed(3)}` +
      ` 계산=${c.computedUsd === null ? '미확인' : '$' + c.computedUsd.toFixed(4)}`,
    )
  }
  log(`  예약 합계 $${r.reservedUsd.toFixed(3)} / 한도 $${r.budgetUsd.toFixed(2)}`)
  if (r.totalCalls === 0) {
    log('  토큰·금액: 호출이 없었습니다.')
    return
  }
  if (r.tokensComplete) {
    log(`  토큰 합계(확인됨): 입력 ${r.confirmedInputTokens} · 출력 ${r.confirmedOutputTokens}`)
  } else {
    log(`  ⚠ 사용량을 ${r.usageCompleteCalls}/${r.totalCalls} 회분만 완전히 확인했습니다.`)
    log(`    확인된 분량만의 합: 입력 ${r.confirmedInputTokens} · 출력 ${r.confirmedOutputTokens}`)
    log('    나머지는 **0이 아니라 미확인**입니다.')
  }
  if (r.costComplete) {
    log(`  계산액 $${r.computedUsd.toFixed(4)} — **계산액이지 실제 청구액이 아닙니다.**`)
  } else {
    log(`  ⚠ 계산액 $${r.computedUsd.toFixed(4)} 는 **확인된 분량만**입니다. 전체가 아닙니다.`)
  }
  log('    실제 청구액은 OpenAI 사용량 화면으로 확인하십시오.')
}

/**
 * **실제** 파일 통로. 036 R035-02 의 시험이 이 함수를 직접 부른다.
 *
 * `defaultDeps()` 안에 숨겨 두면 "오류를 삼키지 않는다" 를 **동작으로** 확인할 수 없고
 * 소스 글자 검사만 남는다. 그래서 밖으로 뺀다.
 */
export function nodeSmokeFs(): SmokeFs {
  return {
    isDir: (p) => { try { return nodeFs.statSync(p).isDirectory() } catch { return false } },
    isFile: (p) => { try { return nodeFs.statSync(p).isFile() } catch { return false } },
    read: (p) => nodeFs.readFileSync(p, 'utf8'),
    readBytes: (p) => nodeFs.readFileSync(p),
    writeNew: (p, d) => nodeFs.writeFileSync(p, d, { flag: 'wx' }),
    /**
     * 036 R035-02 — ENOENT 만 `missing` 이다.
     * 권한·I/O 오류는 `unknown` 이고, **없는 것으로 바꾸지 않는다.**
     */
    statDir: (p) => {
      try {
        return nodeFs.statSync(p).isDirectory() ? 'dir' : 'not_dir'
      } catch (e) {
        const code = (e as { code?: string } | null)?.code
        return code === 'ENOENT' ? 'missing' : 'unknown'
      }
    },
    /**
     * 036 R035-02 — **오류를 `[]` 로 덮지 않는다.** 그대로 던져 보낸다.
     * 035 판은 여기서 빈 배열을 돌려줘, 목록을 못 읽는 상황이 "기록 없음" 이 됐다.
     */
    listDir: (p) => nodeFs.readdirSync(p),
    write: (p, d) => nodeFs.writeFileSync(p, d),
    mkdirp: (p) => nodeFs.mkdirSync(p, { recursive: true }),
  }
}

function defaultDeps(): SmokeDeps {
  return {
    argv: process.argv,
    env: process.env,
    log: (l) => console.log(l),
    fs: nodeSmokeFs(),
    cwd: process.cwd(),
    loadEnvFile: (p) => {
      // Node 20.12+ . 셸 환경변수가 파일 값을 이긴다
      ;(process as unknown as { loadEnvFile(p: string): void }).loadEnvFile(p)
    },
    makeClient: async (url, key) => {
      const { createClient } = await import('@supabase/supabase-js')
      return createClient(url, key, { auth: { persistSession: false } })
    },
  }
}

// 직접 실행했을 때만 돈다. import 로는 아무것도 하지 않는다
if (require.main === module) {
  run(defaultDeps())
    .then((code) => { process.exitCode = code })
    .catch(() => {
      console.log('[035] 중단: 예상하지 못한 실패로 끝났습니다. (원문 오류는 출력하지 않습니다)')
      process.exitCode = EXIT.unexpected
    })
}
