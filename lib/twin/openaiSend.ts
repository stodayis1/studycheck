/**
 * OpenAI 로 나가는 **단 하나의** 전송 경로 — GPT-EXEC-033 §2.
 *
 * 왜 이 파일이 생겼나 (F-01 / R032-03)
 *   032 에서는 운영 `createOpenAiTransport` 에 상한이 하나도 없고, 스모크만 자기 호출부를
 *   따로 들고 상한을 걸었다. 그러면 **스모크가 검사한 경로와 서비스 경로가 갈라진다.**
 *   033 §55 가 "최초 유료 호출 전에 공통화하라"고 정했다. 그래서 실제 SDK 전송은 여기 한 곳이다.
 *
 *   그리고 032 의 두 호출부는 이렇게 쓰고 있었다:
 *
 *     const call = client.responses.parse as unknown as (a: unknown) => Promise<unknown>
 *     await call(body)
 *
 *   설치된 openai 7.22.0 의 `parse` 본문은 `return this._client.responses.create(...)` 다.
 *   함수를 변수로 떼어내면 receiver 가 사라져 **fetch 전에 TypeError 로 죽는다.**
 *   실제 설치본으로 재현했다: `TypeError: Cannot read properties of undefined (reading '_client')`.
 *   타입 단언은 런타임 바인딩을 만들어 주지 않는다. 그래서 여기서는 `client.responses.parse(...)`
 *   를 **메서드 호출로** 쓴다. 변수에 담지 않는다.
 *
 * 이 파일이 지키는 것
 *   - 역할별 모델 **고정** (생성=Astra, 검토=Sol). "둘 중 아무거나"가 아니다 (§64).
 *   - `maxRetries: 0` · 요청 timeout 120초 · `max_output_tokens` 가 **실제 SDK 요청에 도달**한다 (§65).
 *   - endpoint 를 공식 기본 주소로 못박는다. 환경변수나 프록시로 조용히 바뀌지 않는다 (§44).
 *   - 잘린 응답(incomplete)을 **정상 완결로 취급하지 않고**, 한도를 늘려 재시도하지 않는다 (§66).
 *   - 한 번 실패·시간초과하면 공유 중단 상태를 켜서 **다음 유료 요청을 자동 발송하지 않는다** (§67).
 *   - 원문 오류·stack·모델 자유서술을 밖으로 내보내지 않는다. 구조화된 코드만 준다 (§142).
 */
import OpenAI from 'openai'

export type SendRole = 'generation' | 'review'

/** 역할마다 **하나의** 모델. 역할과 모델을 바꿔 끼울 수 없다 (§64) */
export const ROLE_MODEL: Record<SendRole, string> = {
  generation: 'gpt-6-astra',
  review: 'gpt-6-sol',
}

/**
 * 출력 토큰 상한. **모델의 reasoning token 도 여기에 포함된다** (§66).
 * 이 한도에 걸려 잘리면 `incomplete` 로 돌려주고 정상 완결로 세지 않는다.
 */
export const ROLE_MAX_OUTPUT_TOKENS: Record<SendRole, number> = {
  generation: 4000,
  review: 2000,
}

/**
 * 입력 토큰 **허용 상한**. 실측값과 비교하는 천장이다 (034 §46).
 *
 * 032·033 에서는 이 숫자가 예약 상수였고 **실제 요청과 비교되지 않았다.**
 * GPT 검수에서 지침 20만자를 그대로 넣어도 같은 예약액으로 전송되는 것이 확인됐다.
 * 이제 `POST /responses/input_tokens` 로 **같은 요청**을 계수해 이 천장과 맞춘다.
 * 초과·누락·비정수·계수 오류면 그 추론은 **0회**다. 자동 잘라내기·프롬프트 수정을 하지 않는다.
 */
export const ROLE_MAX_INPUT_TOKENS: Record<SendRole, number> = {
  generation: 12_000,
  review: 8_000,
}

export const SEND_TIMEOUT_MS = 120_000
export const SEND_MAX_RETRIES = 0

/**
 * 요금 tier 를 **요청에 명시한다** (034 §55).
 *
 * 공식 base URL 고정만으로 Standard 가 보장되지 않는다. 공개 문서에
 * 프로젝트 기본 tier 가 Fast 면 `service_tier` 생략 요청도 Fast 가 될 수 있다고 적혀 있다.
 * Standard 를 받으려면 `'default'` 를 명시해야 한다.
 */
export const SERVICE_TIER = 'default' as const

/**
 * 공식 기본 endpoint. **환경변수로 바뀌지 않게 명시한다** (§44).
 * SDK 는 `OPENAI_BASE_URL` 을 읽으므로, 여기서 못박지 않으면 환경파일 한 줄로
 * 다른 주소·프록시·다른 요금의 처리로 요청이 새어나갈 수 있다.
 */
export const OFFICIAL_BASE_URL = 'https://api.openai.com/v1'

/** 생성 이미지 입력의 해상도 처리 (§88). `auto`·생략·`low` 로 두지 않는다 */
export const IMAGE_DETAIL = 'high' as const

/**
 * 사용량 읽기 — **두 값이 모두 비음수 정수일 때만** 확인된 것이다 (§48).
 *
 * 032 의 `readUsage` 는 `seen: input !== null || output !== null` 이었다. OR 이라서
 * `input_tokens` 만 와도 "완전 확인"이 됐고, 그때 출력 합계가 **0 으로 적혔다.**
 * 미확인을 0 으로 적는 것이 바로 §91 이 금지한 것이다. 실제로 재현해 확인했다:
 *   `{input_tokens: 100000}` → tokensComplete=true · 출력 합계 0
 *   `{input_tokens: -5}`     → 수락
 *   `{input_tokens: 1.5}`    → 수락
 * 그래서 AND 로 바꾸고 **비음수 정수** 조건을 넣었다.
 */
export type UsageReading = {
  inputTokens: number | null
  outputTokens: number | null
  /** 둘 다 비음수 정수로 읽혔는가. 하나라도 아니면 false = 미확인 */
  complete: boolean
}

function nonNegativeInt(v: unknown): number | null {
  if (typeof v !== 'number') return null
  if (!Number.isInteger(v)) return null
  if (v < 0) return null
  return v
}

export function readUsage(u: unknown): UsageReading {
  if (u === null || typeof u !== 'object') {
    return { inputTokens: null, outputTokens: null, complete: false }
  }
  const o = u as Record<string, unknown>
  const inputTokens = nonNegativeInt(o.input_tokens)
  const outputTokens = nonNegativeInt(o.output_tokens)
  return { inputTokens, outputTokens, complete: inputTokens !== null && outputTokens !== null }
}

export const NO_USAGE: UsageReading = { inputTokens: null, outputTokens: null, complete: false }

/**
 * 전송 결과. **잘린 응답과 거부와 오류를 서로 다른 종류로** 돌려준다 (§84·§161).
 *
 * `refusal` 은 최상위 필드가 아니다. 실제 응답은 `output[].content[]` 안에
 * `{type: 'refusal', refusal: '...'}` 로 들어온다. 032 는 최상위 `refusal` 하나가
 * 늘 있다고 가정했다 — 그러면 중첩 거부를 "빈 응답"으로 잘못 분류한다.
 */
export type SendOutcome =
  | { kind: 'ok'; output_parsed: unknown; usage: UsageReading }
  | { kind: 'refusal'; usage: UsageReading }
  | { kind: 'incomplete'; reasonCode: string; usage: UsageReading }
  | { kind: 'empty'; usage: UsageReading }
  | { kind: 'transport_error'; code: TransportErrorCode }

/** 밖으로 내보내는 오류 **코드**. 원문 메시지는 내보내지 않는다 (§142) */
export type TransportErrorCode =
  | 'live_call_blocked'
  | 'role_model_mismatch'
  | 'aborted_after_failure'
  | 'timeout'
  | 'auth'
  | 'rate_limit'
  | 'bad_request'
  | 'server'
  | 'network'
  /**
   * 시험 프로세스의 전송 차단에 걸렸다 (034 §1).
   *
   * 이 코드가 나오면 **주입 fetch 를 빠뜨린 것**이다. 운영에서는 나올 수 없고,
   * 나온다면 시험 격리가 제 일을 한 것이다. `network` 와 섞지 않는다 —
   * 「시도 1 / 차단 1 / 전송 0」 과 「실제로 나갔다가 실패」 는 다른 사건이다.
   */
  | 'outbound_blocked'
  | 'unknown'

/**
 * 한 번 실패하면 그 뒤 유료 요청을 막는 공유 상태 (§67).
 *
 * 왜 — 생성이 시간초과로 끝났는데 검토 2회가 그대로 나가면, 돈은 나가고 쓸 결과는 없다.
 * 이미 **저장된 후보를 지우지는 않는다.** 보내는 것만 멈춘다.
 */
export class AbortGate {
  private reason: string | null = null
  get aborted(): boolean { return this.reason !== null }
  get abortReason(): string | null { return this.reason }
  abort(code: string): void { if (this.reason === null) this.reason = code }
}

export type SendRequest = {
  role: SendRole
  /** 호출부가 넘긴 모델. `ROLE_MODEL[role]` 과 다르면 **보내지 않는다** */
  model: string
  instructions: string
  input: unknown[]
  textFormat: unknown
}

export type Sender = (req: SendRequest) => Promise<SendOutcome>

/** 테스트에서 실제 네트워크 대신 끼우는 fetch (§82). 운영에서는 넘기지 않는다 */
export type FetchLike = (input: unknown, init?: unknown) => Promise<unknown>

/**
 * 시험의 전송 차단이 원인인지 **원인 사슬을 훑어** 본다.
 *
 * SDK 는 fetch 실패를 `APIConnectionError` 로 감싸므로 최상위 `code` 만 봐서는 보이지 않는다.
 */
function hasOutboundBlockedCause(e: unknown): boolean {
  let cur: unknown = e
  for (let depth = 0; depth < 5 && cur !== null && cur !== undefined; depth++) {
    if (typeof cur === 'object' && 'code' in cur && (cur as { code: unknown }).code === 'OUTBOUND_BLOCKED') {
      return true
    }
    cur = typeof cur === 'object' && 'cause' in cur ? (cur as { cause: unknown }).cause : null
  }
  return false
}

function classify(e: unknown): TransportErrorCode {
  const name = e !== null && typeof e === 'object' && 'name' in e ? String((e as { name: unknown }).name) : ''
  const status = e !== null && typeof e === 'object' && 'status' in e
    ? Number((e as { status: unknown }).status) : NaN

  // 시험 전송 차단이 먼저다. SDK 가 이 오류를 APIConnectionError 로 감싸므로 원인을 훑는다
  if (hasOutboundBlockedCause(e)) return 'outbound_blocked'
  if (name === 'APIUserAbortError' || name === 'APIConnectionTimeoutError') return 'timeout'
  if (status === 401 || status === 403) return 'auth'
  if (status === 429) return 'rate_limit'
  if (Number.isFinite(status) && status >= 500) return 'server'
  if (Number.isFinite(status) && status >= 400) return 'bad_request'
  if (name === 'APIConnectionError') return 'network'
  return 'unknown'
}

/** 중첩 거부를 찾는다. `output[].content[]` 안의 `{type:'refusal'}` */
function hasNestedRefusal(res: unknown): boolean {
  if (res === null || typeof res !== 'object') return false
  const out = (res as { output?: unknown }).output
  if (!Array.isArray(out)) return false
  for (const item of out) {
    if (item === null || typeof item !== 'object') continue
    const content = (item as { content?: unknown }).content
    if (!Array.isArray(content)) continue
    for (const c of content) {
      if (c !== null && typeof c === 'object' && (c as { type?: unknown }).type === 'refusal') return true
    }
  }
  return false
}

/** 잘렸는가. `status==='incomplete'` 또는 `incomplete_details` 가 있으면 잘린 것이다 */
function incompleteReason(res: unknown): string | null {
  if (res === null || typeof res !== 'object') return null
  const o = res as { status?: unknown; incomplete_details?: unknown }
  const det = o.incomplete_details
  if (det !== null && typeof det === 'object') {
    const r = (det as { reason?: unknown }).reason
    return typeof r === 'string' && r !== '' ? r : 'unknown'
  }
  if (o.status === 'incomplete') return 'unknown'
  return null
}

/**
 * 입력 계수 결과.
 *
 * **판별 유니온으로 두지 않는다** — `strictNullChecks` 가 꺼져 있어 좁혀지지 않는다
 * (AGENTS.md 함정 3. 033 에서 이걸로 TS2339 를 맞았다).
 */
export type CountOutcome = {
  ok: boolean
  /** 계수된 입력 토큰. 실패하면 null — **0 으로 두지 않는다** */
  inputTokens: number | null
  /** 실패 사유 코드. 성공하면 null */
  code: string | null
}

/**
 * 같은 요청의 입력 토큰을 **실제로 센다** — 034 §42.
 *
 * `POST /responses/input_tokens` (설치된 SDK 의 `client.responses.inputTokens.count`).
 * 모델·지침·입력·구조화 출력 format 을 **추론과 똑같이** 넘긴다. 이미지 data URL 과
 * `detail=high` 도 `input` 안에 그대로 들어간다.
 *
 * 하지 않는 것
 *   - base64 문자열 길이를 텍스트 토큰처럼 세지 않는다
 *   - 고정 상수를 계수 결과로 쓰지 않는다
 *   - 계수와 생성 사이에 입력을 바꾸지 않는다 (같은 객체를 넘긴다)
 *
 * ⚠ 이것도 **키와 문제 입력을 쓰는 외부 요청**이다. 요청 1건으로 센다.
 *   무료인지는 공개 문서만으로 단정하지 않는다 (§49 — 미확정으로 보고).
 */
export function createInputCounter(opts: {
  allowLiveCall: boolean
  gate?: AbortGate
  fetchImpl?: FetchLike
  apiKey?: string
}): (req: SendRequest) => Promise<CountOutcome> {
  const gate = opts.gate ?? new AbortGate()

  return async (req) => {
    if (!opts.allowLiveCall) return { ok: false, inputTokens: null, code: 'live_call_blocked' }
    if (req.model !== ROLE_MODEL[req.role]) {
      return { ok: false, inputTokens: null, code: 'role_model_mismatch' }
    }
    if (gate.aborted) return { ok: false, inputTokens: null, code: 'aborted_after_failure' }

    const client = new OpenAI({
      maxRetries: SEND_MAX_RETRIES,
      timeout: SEND_TIMEOUT_MS,
      baseURL: OFFICIAL_BASE_URL,
      ...(opts.apiKey === undefined ? {} : { apiKey: opts.apiKey }),
      ...(opts.fetchImpl === undefined ? {} : { fetch: opts.fetchImpl as never }),
    })

    let res: unknown
    try {
      // 메서드 호출로 쓴다 — 이쪽도 `this._client.post(...)` 를 쓴다
      res = await client.responses.inputTokens.count({
        model: req.model,
        instructions: req.instructions,
        input: req.input as never,
        text: { format: req.textFormat as never },
      })
    } catch (e) {
      const code = classify(e)
      gate.abort(`count_${code}`)
      return { ok: false, inputTokens: null, code }
    }

    const n = res !== null && typeof res === 'object'
      ? nonNegativeInt((res as { input_tokens?: unknown }).input_tokens) : null
    if (n === null) {
      // 비정수·음수·누락 — **0 으로 처리하지 않는다**
      gate.abort('count_invalid')
      return { ok: false, inputTokens: null, code: 'count_invalid' }
    }
    return { ok: true, inputTokens: n, code: null }
  }
}

/**
 * 제한이 걸린 전송기를 만든다. **이것이 유일한 실제 SDK 전송 경로다.**
 *
 * `allowLiveCall` 이 false 면 아무것도 보내지 않는다 (기본값은 호출부가 명시한다 — §68).
 */
export function createLimitedSender(opts: {
  allowLiveCall: boolean
  gate?: AbortGate
  /** 시험에서만 넘긴다. 넘기면 실제 네트워크로 나가지 않는다 */
  fetchImpl?: FetchLike
  /** 시험에서만 넘긴다. 운영에서는 SDK 가 환경에서 읽는다 */
  apiKey?: string
}): Sender {
  const gate = opts.gate ?? new AbortGate()

  return async (req) => {
    if (!opts.allowLiveCall) {
      return { kind: 'transport_error', code: 'live_call_blocked' }
    }
    // 역할과 모델이 어긋나면 보내지 않는다. 검토에 비싼 생성 모델이 들어가는 것을 막는다
    if (req.model !== ROLE_MODEL[req.role]) {
      return { kind: 'transport_error', code: 'role_model_mismatch' }
    }
    // 앞선 요청이 실패·시간초과했다면 더 보내지 않는다
    if (gate.aborted) {
      return { kind: 'transport_error', code: 'aborted_after_failure' }
    }

    const client = new OpenAI({
      maxRetries: SEND_MAX_RETRIES,
      timeout: SEND_TIMEOUT_MS,
      baseURL: OFFICIAL_BASE_URL,
      ...(opts.apiKey === undefined ? {} : { apiKey: opts.apiKey }),
      ...(opts.fetchImpl === undefined ? {} : { fetch: opts.fetchImpl as never }),
    })

    let res: unknown
    try {
      // ⚠ **메서드 호출로 쓴다.** 변수에 떼어 담으면 receiver 가 사라져 TypeError 가 난다
      res = await client.responses.parse({
        model: req.model,
        instructions: req.instructions,
        input: req.input as never,
        text: { format: req.textFormat as never },
        max_output_tokens: ROLE_MAX_OUTPUT_TOKENS[req.role],
        // 034 §55: Standard 처리를 **명시한다.** 생략하면 프로젝트 기본 tier 를 따른다
        service_tier: SERVICE_TIER,
      })
    } catch (e) {
      const code = classify(e)
      gate.abort(code)
      return { kind: 'transport_error', code }
    }

    const usage = readUsage((res as { usage?: unknown }).usage)

    // 잘림을 먼저 본다. 잘린 응답에는 파싱된 값이 같이 올 수도 있는데, 그것을 정상으로 받으면
    // **반쪽 문항이 후보로 저장된다.** 한도를 늘려 재시도하지도 않는다 (§66)
    const trunc = incompleteReason(res)
    if (trunc !== null) {
      // 사유를 함께 남긴다. 'incomplete' 만 남기면 어느 한도에 걸렸는지 잃는다
      gate.abort(`incomplete_${trunc}`)
      return { kind: 'incomplete', reasonCode: trunc, usage }
    }
    if (hasNestedRefusal(res)) {
      return { kind: 'refusal', usage }
    }
    const parsed = (res as { output_parsed?: unknown }).output_parsed
    if (parsed === null || parsed === undefined) {
      return { kind: 'empty', usage }
    }
    return { kind: 'ok', output_parsed: parsed, usage }
  }
}
