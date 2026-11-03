/**
 * 첫 소량 생성(스모크) 전용 **계량·예산** 장치 — GPT-EXEC-032 → 033 개정.
 *
 * 032 에서는 이 파일이 자기 SDK 호출부를 들고 있었다. 그러면 스모크가 검사한 경로와
 * 서비스 경로가 갈라진다. 033 §55·§58 이 공통화를 정했으므로, 이제 실제 전송은
 * **`lib/twin/openaiSend.ts` 한 곳**이고 이 파일은 그 위에 다음만 올린다:
 *
 *   - 요청 횟수 상한 (총 3 · 생성 1 · 검토 2)
 *   - 사전 금액 예약과 예산 상한 ($1 / 1회 실행)
 *   - 사용량 기록 (**두 값이 모두 비음수 정수일 때만** 확인으로 본다)
 *   - 실패·시간초과 뒤 다음 유료 요청 차단 (`AbortGate` 공유)
 *
 * 033 에서 고친 것 (R032-02)
 *   `readUsage` 가 OR 조건이어서 `input_tokens` 만 와도 "완전 확인"이 됐고,
 *   그때 출력 합계가 **0 으로 적혔다.** 음수·비정수도 받았다. 실제로 재현해 확인했다.
 *   판정은 `openaiSend.readUsage` 로 옮겼고 AND·비음수·정수 조건으로 바꿨다.
 */
import {
  createLimitedSender, createInputCounter, AbortGate, ROLE_MODEL,
  ROLE_MAX_OUTPUT_TOKENS, ROLE_MAX_INPUT_TOKENS, SEND_TIMEOUT_MS, SERVICE_TIER,
  type SendRole, type UsageReading, type FetchLike, type SendRequest, type CountOutcome,
} from './openaiSend'
import type { Transport } from './generate'

/** 한 원문에 허용하는 **유료 요청 총량**. 생성 1 + 검토 최대 2 = 3 (§29) */
export const SMOKE_MAX_PAID_CALLS = 3

/** 역할별 상한. "둘 중 아무거나"가 아니라 역할마다 따로 막는다 */
export const SMOKE_MAX_CALLS_BY_ROLE: Record<SendRole, number> = { generation: 1, review: 2 }

/** 한 번의 전체 실행(생성+검토 포함)에 허용하는 금액. 요청 하나당이 아니다 (§36) */
export const SMOKE_RUN_BUDGET_USD = 1

/**
 * 사전 금액 산정에 쓰는 **공개 단가** (확인일 2026-10-05).
 * 1M 토큰당 달러. `https://developers.openai.com/api/docs/models/*`
 *
 * ⚠ 034 §56: 입력 단가로 **cache-write 단가**를 쓴다.
 *   033 은 $10/$2 를 쓰고 "할인에 의존하지 않는 보수적 상한"이라고 적었는데,
 *   할인하지 않는 것만으로 cache-write 의 **더 높은** 단가가 포함되지는 않는다.
 *   공개 모델 페이지의 cache-write 는 Astra $12.50 · Sol $2.50 / 1M input tokens 다.
 *   실제 응답이 할인을 받는지와 무관하게, 사전 예약은 불리한 쪽을 쓴다.
 */
export const PRICE_USD_PER_1M: Record<SendRole, { input: number; output: number }> = {
  generation: { input: 12.5, output: 50 },   // gpt-6-astra (cache-write 입력)
  review: { input: 2.5, output: 10 },        // gpt-6-sol  (cache-write 입력)
}

/**
 * 지역 처리 가산 여유 (034 §57).
 *
 * 공개일·거주지로 추측하지 않는다. 가산이 붙는지 **확정하지 못했으므로**
 * "미확정이라 미포함"을 확정 상한으로 쓰지 않고 10% 여유를 **따로 반영한다.**
 */
export const REGIONAL_HEADROOM = 1.10



export class SmokeBudgetError extends Error {
  constructor(public code: string, detail: string) {
    super(`스모크 상한에 걸려 호출하지 않았습니다: ${code} (${detail})`)
    this.name = 'SmokeBudgetError'
  }
}

/**
 * 호출 1건 기록.
 *
 * `inputTokens`·`outputTokens` 는 **둘 다 비음수 정수로 읽혔을 때만** 숫자다.
 * 하나라도 아니면 둘 다 `null` 로 두지 않고 읽힌 쪽만 남기되 `usageComplete=false` 다 —
 * 부분 확인과 완전 확인을 구분해야 하기 때문이다 (§48).
 */
export type SmokeCallRecord = {
  seq: number
  role: SendRole
  model: string
  ms: number
  outcome: 'ok' | 'refusal' | 'incomplete' | 'empty' | 'error'
  /** 전송 실패·잘림의 **분류 코드.** 원문 오류를 넣지 않는다 */
  code: string | null
  inputTokens: number | null
  outputTokens: number | null
  /** 두 값이 모두 비음수 정수였는가 */
  usageComplete: boolean
  /** 이 요청에 **예약한** 금액 (달러). 불명확하게 끝나면 0 으로 되돌리지 않는다 (§47) */
  reservedUsd: number
  /** 확인된 사용량으로 **계산한** 금액. 실제 청구액이 아니다. 미확인이면 null */
  computedUsd: number | null
}

/**
 * 요청 전에 예약하는 금액 — **실측 입력 토큰**에 연결된다 (034 §40).
 *
 * `measuredInputTokens` 는 `POST /responses/input_tokens` 로 **같은 요청**을 계수한 값이다.
 * 출력은 코드가 강제하는 천장을 쓰고, 지역 가산 여유를 곱한다.
 *
 * 계수하지 못했으면 이 함수를 부르지 않는다 — 추론을 **0회**로 끝낸다.
 */
export function reserveUsd(role: SendRole, measuredInputTokens: number): number {
  const p = PRICE_USD_PER_1M[role]
  const base = (measuredInputTokens / 1e6) * p.input
    + (ROLE_MAX_OUTPUT_TOKENS[role] / 1e6) * p.output
  return base * REGIONAL_HEADROOM
}

/**
 * 입력이 천장까지 찼을 때의 예약액 — 계획 문서에 적는 **최악 상한**이다.
 *
 * 생성 12,000×12.50/1M + 4,000×50/1M = $0.350
 * 검토  8,000× 2.50/1M + 2,000×10/1M = $0.040
 * 합계 0.350 + 0.040×2 = $0.430 → 10% 여유 포함 **$0.473**
 *
 * ⚠ 이것은 **해당 요금 가정 아래의 계산 예시**다. 미확정 계수 요금까지 포함한
 *   실제 청구 상한이 아니다 (§58).
 */
export function reserveCeilingUsd(role: SendRole): number {
  return reserveUsd(role, ROLE_MAX_INPUT_TOKENS[role])
}

/** 확인된 사용량으로 금액을 계산한다. **미확인이면 null** — 0 이 아니다 (§49) */
export function computeUsd(role: SendRole, u: UsageReading): number | null {
  if (!u.complete) return null
  const p = PRICE_USD_PER_1M[role]
  return (u.inputTokens! / 1e6) * p.input + (u.outputTokens! / 1e6) * p.output
}

/**
 * 호출을 세고 금액을 예약하는 계량기.
 *
 * transport 들이 **같은 인스턴스**를 공유해야 총량과 예산이 맞는다.
 */
export class SmokeMeter {
  readonly calls: SmokeCallRecord[] = []
  private byRole: Record<SendRole, number> = { generation: 0, review: 0 }
  private reserved = 0

  constructor(readonly budgetUsd: number = SMOKE_RUN_BUDGET_USD) {}

  /** 지금까지 예약한 금액. 불명확하게 끝난 요청도 **예약을 되돌리지 않는다** */
  get reservedTotalUsd(): number { return this.reserved }

  /** 예약 내역. 비정상 종료 뒤에도 읽을 수 있게 기록에 남긴다 (§65) */
  readonly reservations: Array<{ seq: number; role: SendRole; inputTokens: number; usd: number }> = []

  /**
   * 요청 **전에** 부른다. 상한·예산을 넘으면 throw — 호출 자체가 나가지 않는다.
   *
   * `measuredInputTokens` 는 `POST /responses/input_tokens` 로 **같은 요청**을 계수한 값이다.
   * 034 §40: 계수하지 못했으면 이 함수를 부르지 않고 추론을 0회로 끝낸다.
   *
   * `persist` 는 **전송 전에 기록을 남기는 통로**다 (§64). 던지면 예약이 취소되고
   * 전송도 일어나지 않는다 — "기록 실패면 전송 0".
   */
  reserve(
    role: SendRole,
    measuredInputTokens: number,
    persist?: (snapshot: {
      seq: number; role: SendRole; inputTokens: number; usd: number; reservedTotalUsd: number
    }) => void,
  ): { seq: number; reservedUsd: number } {
    if (this.calls.length >= SMOKE_MAX_PAID_CALLS) {
      throw new SmokeBudgetError('total_calls_exceeded', `허용 ${SMOKE_MAX_PAID_CALLS}회`)
    }
    if (this.byRole[role] >= SMOKE_MAX_CALLS_BY_ROLE[role]) {
      throw new SmokeBudgetError('role_calls_exceeded', `${role} 허용 ${SMOKE_MAX_CALLS_BY_ROLE[role]}회`)
    }
    // 계수 실측값이 천장을 넘으면 **보내지 않는다.** 자동으로 잘라내지 않는다 (§46)
    if (!Number.isInteger(measuredInputTokens) || measuredInputTokens < 0) {
      throw new SmokeBudgetError('input_count_invalid', '계수값이 비음수 정수가 아닙니다')
    }
    if (measuredInputTokens > ROLE_MAX_INPUT_TOKENS[role]) {
      throw new SmokeBudgetError(
        'input_tokens_exceeded',
        `${role} 실측 ${measuredInputTokens} > 허용 ${ROLE_MAX_INPUT_TOKENS[role]}`,
      )
    }
    const r = reserveUsd(role, measuredInputTokens)
    if (this.reserved + r > this.budgetUsd) {
      // 예산을 넘기면 **보내지 않는다.** 설명할 수 없는 상한으로 보내는 것보다 멈추는 것이 낫다 (§46)
      throw new SmokeBudgetError(
        'budget_exceeded',
        `예약 ${(this.reserved + r).toFixed(3)} > 한도 ${this.budgetUsd.toFixed(2)} USD`,
      )
    }
    const seq = this.calls.length + 1
    // ── 기록을 **먼저** 남긴다. 실패하면 예약도 취소하고 전송하지 않는다 (§64)
    if (persist !== undefined) {
      try {
        persist({ seq, role, inputTokens: measuredInputTokens, usd: r, reservedTotalUsd: this.reserved + r })
      } catch {
        throw new SmokeBudgetError('reservation_record_failed', '예약 기록에 실패해 전송하지 않았습니다')
      }
    }
    this.byRole[role]++
    this.reserved += r
    this.reservations.push({ seq, role, inputTokens: measuredInputTokens, usd: r })
    return { seq, reservedUsd: r }
  }

  record(r: SmokeCallRecord): void { this.calls.push(r) }

  /**
   * 집계.
   *
   * `tokensComplete` 는 **호출이 1건 이상이고 모든 호출의 두 값이 확인된 경우**에만 true 다.
   * 아니면 "확인된 것만의 합"이며 전체가 아니다 — 보고문에 그대로 적는다.
   */
  report() {
    const completeCalls = this.calls.filter((c) => c.usageComplete).length
    const sum = (f: (c: SmokeCallRecord) => number | null) =>
      this.calls.reduce((a, c) => a + (f(c) ?? 0), 0)
    const anyUnknownCost = this.calls.some((c) => c.computedUsd === null)
    return {
      totalCalls: this.calls.length,
      byRole: { ...this.byRole },
      usageCompleteCalls: completeCalls,
      tokensComplete: this.calls.length > 0 && completeCalls === this.calls.length,
      confirmedInputTokens: sum((c) => c.inputTokens),
      confirmedOutputTokens: sum((c) => c.outputTokens),
      reservedUsd: this.reserved,
      budgetUsd: this.budgetUsd,
      /** 확인된 사용량만으로 계산한 금액. `costComplete` 가 false 면 전체가 아니다 */
      computedUsd: sum((c) => c.computedUsd),
      costComplete: this.calls.length > 0 && !anyUnknownCost,
      calls: this.calls.map((c) => ({ ...c })),
    }
  }
}

/**
 * 계량·예산을 건 transport. 실제 전송은 **공통 전송기**가 한다.
 *
 * 시간초과는 **취소가 아니다.** 이미 떠난 HTTP 요청을 끊지 못하므로 과금될 수 있고,
 * 그래서 호출 1회로 세고 예약도 되돌리지 않는다.
 */
export function createSmokeTransport(args: {
  role: SendRole
  meter: SmokeMeter
  gate: AbortGate
  allowLiveCall: boolean
  /** 시험에서만 넘긴다. 넘기면 실제 네트워크로 나가지 않는다 (§82) */
  fetchImpl?: FetchLike
  apiKey?: string
  now?: () => number
  /** 전송 **전에** 예약을 기록하는 통로. 던지면 전송하지 않는다 (§64) */
  persistReservation?: (s: {
    seq: number; role: SendRole; inputTokens: number; usd: number; reservedTotalUsd: number
  }) => void
  /**
   * 입력 계수기. 넘기지 않으면 **공통 전송기와 같은 설정으로 만든다.**
   * 시험에서 계수 응답을 바꿔 보려면 넘긴다.
   */
  countInput?: (req: SendRequest) => Promise<CountOutcome>
}): Transport {
  const now = args.now ?? (() => Date.now())
  const send = createLimitedSender({
    allowLiveCall: args.allowLiveCall,
    gate: args.gate,
    fetchImpl: args.fetchImpl,
    apiKey: args.apiKey,
  })
  const count = args.countInput ?? createInputCounter({
    allowLiveCall: args.allowLiveCall,
    gate: args.gate,
    fetchImpl: args.fetchImpl,
    apiKey: args.apiKey,
  })

  return async (req) => {
    if (req.role !== args.role) {
      throw new SmokeBudgetError('role_mismatch', `transport=${args.role} 요청=${req.role}`)
    }
    if (req.model !== ROLE_MODEL[args.role]) {
      throw new SmokeBudgetError('model_not_allowed', `${args.role} 역할의 모델이 아닙니다`)
    }
    // 나갈 수 없는 요청에 예산을 예약하지 않는다. 예약은 되돌리지 않는 값이라
    // 여기서 미리 걸러야 뒤 요청이 예산 부족으로 엉뚱하게 막히지 않는다
    if (!args.allowLiveCall) {
      throw new SmokeBudgetError('live_call_blocked', '실제 호출이 잠겨 있습니다')
    }
    if (args.gate.aborted) {
      throw new SmokeBudgetError('aborted_after_failure', `앞선 실패=${args.gate.abortReason}`)
    }

    // ── 계수 → 검사 → 예약 → 전송 (034 §40~§46) ───────────────────
    // **같은 요청 객체**를 계수와 전송에 넘긴다. 사이에 입력을 바꾸지 않는다 (§45)
    const sendReq: SendRequest = {
      role: req.role, model: req.model, instructions: req.instructions,
      input: req.input, textFormat: req.textFormat,
    }
    const counted = await count(sendReq)
    if (!counted.ok || counted.inputTokens === null) {
      // 계수 실패·미확인이면 **추론 0회**다. 고정 상수로 대신하지 않는다
      args.gate.abort(`count_${counted.code ?? 'unknown'}`)
      throw new SmokeBudgetError(counted.code ?? 'input_count_failed', '입력을 계수하지 못했습니다')
    }

    let seq: number
    let reservedUsd: number
    try {
      const got = args.meter.reserve(args.role, counted.inputTokens, args.persistReservation)
      seq = got.seq
      reservedUsd = got.reservedUsd
    } catch (e) {
      // 천장 초과·예산 초과·기록 실패 — 전송하지 않고 뒤 요청도 막는다
      const code = e instanceof SmokeBudgetError ? e.code : 'reserve_failed'
      args.gate.abort(code)
      throw e
    }
    const started = now()

    const finish = (
      outcome: SmokeCallRecord['outcome'],
      code: string | null,
      usage: UsageReading,
    ) => {
      args.meter.record({
        seq, role: args.role, model: req.model, ms: now() - started, outcome, code,
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        usageComplete: usage.complete,
        reservedUsd,
        computedUsd: computeUsd(args.role, usage),
      })
    }
    const none: UsageReading = { inputTokens: null, outputTokens: null, complete: false }

    const r = await send({
      role: req.role, model: req.model, instructions: req.instructions,
      input: req.input, textFormat: req.textFormat,
    })

    /**
     * 034 §82·§60 — **하나의 공유 stop 상태**가 아래 전부를 다음 유료 요청 차단에 연결한다:
     *   transport_error · timeout · refusal · incomplete · empty · 사용량 미확인 ·
     *   예약 입력/금액 초과.
     *
     * 033 은 transport_error 와 incomplete 만 막았다. GPT 검수에서 **검토 refusal/empty
     * 뒤에도 두 번째 검토가 전송되는 것**과 **사용량 미확인 뒤에도 전송되는 것**이 확인됐다.
     */
    const stopIf = (cond: boolean, code: string) => { if (cond) args.gate.abort(code) }

    switch (r.kind) {
      case 'ok': {
        finish('ok', null, r.usage)
        // 성공했어도 **사용량을 확인하지 못하면** 다음 유료 요청을 막는다 (§60)
        stopIf(!r.usage.complete, 'usage_unknown')
        // 응답 입력이 예약한 입력을 넘었으면 멈춘다. 이미 나간 비용을 되돌린다고 하지 않는다 (§59)
        stopIf(
          r.usage.inputTokens !== null && r.usage.inputTokens > counted.inputTokens,
          'input_over_reserved',
        )
        const spent = computeUsd(args.role, r.usage)
        stopIf(spent !== null && spent > reservedUsd, 'cost_over_reserved')
        return { output_parsed: r.output_parsed, refusal: null, incomplete: null, usage: r.usage }
      }
      case 'refusal':
        finish('refusal', 'model_refusal', r.usage)
        stopIf(true, 'model_refusal')
        return { output_parsed: undefined, refusal: 'model_refusal', incomplete: null, usage: r.usage }
      case 'incomplete':
        finish('incomplete', r.reasonCode, r.usage)
        stopIf(true, `incomplete_${r.reasonCode}`)
        return { output_parsed: undefined, refusal: null, incomplete: r.reasonCode, usage: r.usage }
      case 'empty':
        finish('empty', 'empty_response', r.usage)
        stopIf(true, 'empty_response')
        return { output_parsed: undefined, refusal: null, incomplete: null, usage: r.usage }
      case 'transport_error':
        finish('error', r.code, none)
        stopIf(true, r.code)
        throw new SmokeBudgetError(r.code, '전송 실패')
    }
  }
}

export { AbortGate, ROLE_MODEL, ROLE_MAX_OUTPUT_TOKENS, ROLE_MAX_INPUT_TOKENS, SEND_TIMEOUT_MS, SERVICE_TIER }
export type { SendRole, UsageReading }
