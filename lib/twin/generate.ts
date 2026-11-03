// 생성 호출 (GPT-EXEC-001 작업 D-3·D-4, C-6)
//
// 프롬프트는 `prompts/twin-gen-v1.0.md` 의 내용을 그대로 쓴다. Claude가 고치지 않는다 (D-024).
// 모델명은 환경변수로 주입한다. 하드코딩하지 않는다 (CP-006 §231).
//
// ⚠ GPT-EXEC-001 §1: 이번 명령에서 **실제 API 호출은 금지**다.
//    이 모듈은 주입받은 transport 로만 동작하며, 기본 transport 는
//    명시적으로 허용하지 않으면 호출을 거부한다.

import { zodTextFormat } from 'openai/helpers/zod'
import {
  TwinGenerationResult,
  type TwinGenerationResultT,
} from './schema'
import type { GenerationInput } from './source'
import {
  createLimitedSender, ROLE_MODEL, IMAGE_DETAIL, AbortGate,
  type SendRole, type UsageReading, type FetchLike, type TransportErrorCode,
} from './openaiSend'

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export type GenerationOutcome =
  // D-079: `raw` 를 두지 않는다. 모델 원응답을 들고 다니면 로그·오류·API 응답 어딘가로
  // 흘러나간다. 파싱을 통과한 도메인 객체만 다음 단계로 넘긴다.
  | { kind: 'ok'; result: TwinGenerationResultT }
  | { kind: 'refusal'; reason: string }        // 모델이 응답을 거부함
  | { kind: 'parse_error'; reason: string }    // 스키마에 맞지 않는 응답
  | { kind: 'transport_error'; reason: string }
  // 033 §66: 출력 한도에 걸려 **잘린** 응답. 정상 완결이 아니다.
  // 한도를 자동으로 늘려 재시도하지 않는다 — 그러면 비용 상한이 뜻을 잃는다.
  | { kind: 'incomplete'; reason: string }

/**
 * 모델을 부르는 방법. 테스트에서는 mock 을 넣는다.
 *
 * 033 §2: `role` 을 **반드시** 넘긴다. 공통 전송기가 역할별 모델·출력 상한을 그것으로 고른다.
 * 응답의 `incomplete`·`usage` 는 선택이다 — 기존 시험의 대역은 이 두 필드를 주지 않고,
 * 그때는 "잘리지 않았고 사용량은 모른다"로 읽힌다 (0 으로 읽지 않는다).
 */
export type Transport = (req: {
  role: SendRole
  model: string
  instructions: string
  input: unknown[]
  textFormat: unknown
}) => Promise<{
  output_parsed?: unknown
  refusal?: string | null
  incomplete?: string | null
  usage?: UsageReading
}>

/**
 * 실제 OpenAI 호출 transport.
 *
 * 033 §55·§58: **스모크와 똑같은 공통 전송기**(`createLimitedSender`)를 쓴다.
 * 예전에는 이 함수가 자기 SDK 호출부를 들고 있었고 상한이 하나도 없었다(F-01).
 * 그래서 스모크가 검사한 경로와 서비스 경로가 갈라져 있었다. 이제 한 경로다.
 *
 * `allowLiveCall` 이 true 여야만 동작한다. 기본은 계속 차단이다.
 */
export function createOpenAiTransport(opts: {
  allowLiveCall: boolean
  gate?: AbortGate
  /** 시험에서만 넘긴다. 넘기면 실제 네트워크로 나가지 않는다 (§82) */
  fetchImpl?: FetchLike
  apiKey?: string
}): Transport {
  const send = createLimitedSender(opts)
  return async (req) => {
    const r = await send({
      role: req.role,
      model: req.model,
      instructions: req.instructions,
      input: req.input,
      textFormat: req.textFormat,
    })
    switch (r.kind) {
      case 'ok':
        return { output_parsed: r.output_parsed, refusal: null, incomplete: null, usage: r.usage }
      case 'refusal':
        // 모델의 자유서술 사유를 밖으로 내보내지 않는다 (§142). 코드만 남긴다
        return { output_parsed: undefined, refusal: 'model_refusal', incomplete: null, usage: r.usage }
      case 'incomplete':
        return { output_parsed: undefined, refusal: null, incomplete: r.reasonCode, usage: r.usage }
      case 'empty':
        return { output_parsed: undefined, refusal: null, incomplete: null, usage: r.usage }
      case 'transport_error':
        // 원문 오류·stack 을 던지지 않는다. 분류 코드만 던진다
        throw new TransportFailure(r.code)
    }
  }
}

/** 전송 실패. `message` 가 **분류 코드**다. 원문 오류를 담지 않는다 */
export class TransportFailure extends Error {
  constructor(public code: TransportErrorCode) {
    super(code)
    this.name = 'TransportFailure'
  }
}

export async function generateCandidates(args: {
  instructions: string          // prompts/twin-gen-v1.0.md 의 프롬프트 본문
  input: GenerationInput
  imageDataUrl: string | null
  transport: Transport
  model?: string
}): Promise<GenerationOutcome> {
  // 033 §44·§64: 모델을 **역할로** 정한다. 예전에는 `twinConfig.generationModel` 이었고
  // 환경변수 한 줄로 다른 모델로 조용히 바뀔 수 있었다. 공통 전송기가 역할과 모델이
  // 어긋나면 보내지 않으므로, 호출부가 다른 모델을 넘기면 전송 전에 막힌다.
  const model = args.model ?? ROLE_MODEL.generation

  // 텍스트(JSON)와 이미지를 한 요청 안의 별도 content item 으로 보낸다 (D-036)
  const content: unknown[] = [{ type: 'input_text', text: JSON.stringify(args.input) }]
  if (args.imageDataUrl) {
    // 033 §88: `detail` 을 **명시한다.** 생략·auto 는 원본 해상도 처리라 입력량이 예측되지 않고,
    // low 는 수식을 읽지 못할 위험이 있다. high 는 2,500 패치 예산 안에서 처리된다.
    content.push({ type: 'input_image', image_url: args.imageDataUrl, detail: IMAGE_DETAIL })
  }

  let raw: {
    output_parsed?: unknown
    refusal?: string | null
    incomplete?: string | null
    usage?: UsageReading
  }
  try {
    raw = await args.transport({
      role: 'generation',
      model,
      instructions: args.instructions,
      input: [{ role: 'user', content }],
      textFormat: zodTextFormat(TwinGenerationResult, 'twin_generation_result'),
    })
  } catch (e) {
    return { kind: 'transport_error', reason: errMessage(e) }
  }

  // 잘린 응답을 **먼저** 본다. 잘렸는데 파싱된 값이 같이 와도 정상으로 받지 않는다 (§66)
  if (raw.incomplete) return { kind: 'incomplete', reason: raw.incomplete }
  if (raw.refusal) return { kind: 'refusal', reason: raw.refusal }
  if (raw.output_parsed == null) return { kind: 'parse_error', reason: '응답이 비어 있습니다.' }

  const parsed = TwinGenerationResult.safeParse(raw.output_parsed)
  if (!parsed.success) {
    return { kind: 'parse_error', reason: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(' / ') }
  }

  return { kind: 'ok', result: parsed.data }
}

/**
 * `unsupported` 응답 처리 (C-6).
 *
 * 그림이 필요해서 만들 수 없다는 뜻이다. 실패가 아니라 **정상적인 회신**이므로
 * 후보 없이 그대로 기록한다. 억지로 만들게 다시 조르지 않는다
 * (CP-008 변경 불가 원칙 — 그림이 필요한 유형을 텍스트로 억지 변형하지 않는다).
 */
export function isUnsupported(r: TwinGenerationResultT): boolean {
  return r.generation_status === 'unsupported'
}
