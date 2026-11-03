/**
 * SDK 계약 탐침 — **설치된 실제 OpenAI SDK + 주입 fetch** (GPT-EXEC-034 §105).
 *
 * 033 의 `SDK_CONTRACT_LOG_033.txt` 는 MODULE_NOT_FOUND 5건뿐이었다. 로그를 만들 때
 * 탐침을 저장소 밖으로 복사하고 import 경로를 `$PWD`(Git-Bash 의 `/c/...`)로 바꿨는데
 * Windows Node 가 그 경로를 해석하지 못했다. 그리고 제 검증 grep 이 그 실패를 보지 못해
 * 성공으로 보고했다. 그 파일은 **실패 이력으로 보존**한다.
 *
 * 이 탐침은 그 재발을 막는다:
 *   - **묶음 안**에 들어 있어 해제한 폴더에서 상대 경로로 돌아간다 (경로를 바꾸지 않는다)
 *   - 전송 차단 경계 **안에서** 돈다 (§29)
 *   - 단계마다 판정을 찍고, 마지막에 **종료코드**를 남긴다
 *   - 기대 성공과 기대 실패를 **둘 다** 보여준다
 *
 * 실제 네트워크 0건. 운영 키·환경파일을 읽지 않는다. 유료 요청 0회.
 */
// 037 §45 — **첫 import**. 차단이 없으면 SDK·앱이 적재되기 전에 끝낸다
import '../guardRequired'

import { zodTextFormat } from 'openai/helpers/zod'

import {
  createLimitedSender, createInputCounter, AbortGate, ROLE_MODEL,
  ROLE_MAX_OUTPUT_TOKENS, ROLE_MAX_INPUT_TOKENS, SERVICE_TIER, IMAGE_DETAIL,
  OFFICIAL_BASE_URL, readUsage, type FetchLike, type SendRequest,
} from '../../lib/twin/openaiSend'
import { TwinGenerationResult, TwinReviewResult } from '../../lib/twin/schema'
import { inspectImageDataUrl, checkImageWithinHighDetail } from '../../lib/twin/imageSize'

type Guard = {
  snapshot(): {
    active: boolean; attempts: number; blocked: number
    localAllowed: number; measurementScope: string; targets: string[]
  }
  reset(): void
}
const guard = (globalThis as unknown as { __NETGUARD__?: Guard }).__NETGUARD__

let failures = 0
function check(label: string, ok: boolean, detail: string) {
  if (!ok) failures++
  console.log(`${ok ? '  통과' : '  실패'}  ${label.padEnd(44)} ${detail}`)
}

// ── 합성 응답 본문 ───────────────────────────────────────────────────
function cand(no: number) {
  return {
    candidate_no: no, variant_kind: 'mixed',
    problem_text_latex: `서로 다른 ${5 + no}개의 수 중 2개를 뽑아 나열하는 경우의 수를 구하시오.`,
    answer_kind: 'number', answer_text: String(20 + no * 10),
    solution_outline: ['공식을 떠올린다', '대입한다', '계산한다'],
    concepts: ['순열'], type_code: '공수1-01-07', difficulty_delta: 0,
    common_mistakes: ['조합과 혼동'], transformations: ['계수·수치', '문장 맥락'],
    reverse_derivation_risk: 'low', single_answer_claim: true,
    needs_new_image: false, self_check_notes: ['검산 완료'],
  }
}
const GEN_PAYLOAD = {
  schema_version: '1.0', generation_status: 'generated', unsupported_reason: null as string | null,
  source_summary: {
    core_concepts: ['순열'], solution_structure: ['공식', '대입'], estimated_difficulty: 'medium',
  },
  candidates: [cand(1), cand(2)],
}
const REVIEW_PAYLOAD = {
  valid: true, answer_kind: 'number', answer_text: '30', single_answer: true,
  missing_condition: false, ambiguous: false, curriculum_mismatch: false,
  solution_outline: ['공식', '대입'], issues: [] as string[],
}
const OK_USAGE = { input_tokens: 7210, output_tokens: 1880 }

function sdkReply(text: string, usage: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: 'resp_syn', object: 'response', status: 'completed',
    output: [{
      type: 'message', role: 'assistant', id: 'msg_syn', status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] as unknown[] }],
    }],
    usage, ...extra,
  }
}

type Captured = { url: string; body: Record<string, unknown> }

function injectFetch(
  reply: (b: Record<string, unknown>, url: string) => { json: unknown; status?: number },
): { fetchImpl: FetchLike; calls: Captured[] } {
  const calls: Captured[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const i = (init ?? {}) as { body?: string }
    const body = i.body ? (JSON.parse(i.body) as Record<string, unknown>) : {}
    calls.push({ url: String(url), body })
    const r = reply(body, String(url))
    return new Response(JSON.stringify(r.json), {
      status: r.status ?? 200, headers: { 'content-type': 'application/json' },
    }) as unknown as never
  }
  return { fetchImpl, calls }
}

const IMAGE_PNG_BASE64 = (() => {
  // 320×320 PNG 머리글만 만든다. 실제 이미지가 아니다
  const b = Buffer.alloc(24)
  for (const [i, v] of [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].entries()) b[i] = v
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'ascii')
  b.writeUInt32BE(320, 16); b.writeUInt32BE(320, 20)
  return b.toString('base64')
})()
const IMAGE_URL = `data:image/png;base64,${IMAGE_PNG_BASE64}`

function genRequest(): SendRequest {
  return {
    role: 'generation',
    model: ROLE_MODEL.generation,
    instructions: '생성 지침(합성)',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text', text: JSON.stringify({ task: 'generate_twin_candidates' }) },
        { type: 'input_image', image_url: IMAGE_URL, detail: IMAGE_DETAIL },
      ],
    }],
    textFormat: zodTextFormat(TwinGenerationResult, 'twin_generation_result'),
  }
}

async function main() {
  console.log('[0] 환경')
  const openaiVersion = (await import('openai/version')).VERSION
    ?? '(version 모듈 없음)'
  console.log(`  설치 SDK        openai ${openaiVersion}`)
  console.log(`  Node            ${process.version}`)
  console.log(`  작업 폴더       ${process.cwd()}`)
  console.log(`  차단 장치       ${guard === undefined ? '없음' : '적재됨'}`)
  if (guard === undefined) {
    console.log('  중단: 전송 차단 없이 SDK 탐침을 돌리지 않습니다 (034 §34).')
    process.exitCode = 9
    return
  }
  console.log('')

  // ── [1] 이미지 크기 — 메모리 PNG 에서 (§126) ──────────────────────
  console.log('[1] 이미지 크기 (이미 메모리에 있는 PNG)')
  const img = inspectImageDataUrl(IMAGE_URL)
  const within = checkImageWithinHighDetail(img)
  check('폭·높이·패치 수를 읽는다', img.ok && img.width === 320 && img.height === 320,
    `${img.width}×${img.height} 패치=${img.patchCount}`)
  check('high 패치 예산 안이다', within.ok, `code=${within.code ?? 'none'}`)
  console.log('')

  // ── [2] 계수 요청 계약 (§116) ─────────────────────────────────────
  console.log('[2] 입력 계수 — 같은 요청을 센다')
  guard.reset()
  {
    const { fetchImpl, calls } = injectFetch(() => ({
      json: { object: 'response.input_tokens', input_tokens: 7100 },
    }))
    const count = createInputCounter({ allowLiveCall: true, fetchImpl, apiKey: 'syn-injected' })
    const req = genRequest()
    const r = await count(req)
    const c = calls[0]
    check('계수 1회', calls.length === 1, `호출=${calls.length}`)
    check('계수 주소', String(c?.url).endsWith('/responses/input_tokens'), String(c?.url))
    check('모델이 같다', c?.body.model === req.model, String(c?.body.model))
    check('지침이 같다', c?.body.instructions === req.instructions, '동일')
    check('입력이 같다', JSON.stringify(c?.body.input) === JSON.stringify(req.input), '동일')
    check('format 이 같다',
      JSON.stringify(c?.body.text) === JSON.stringify({ format: req.textFormat }), '동일')
    const cImg = ((c?.body.input as Array<{ content: Array<Record<string, unknown>> }>)[0].content)
      .find((x) => x.type === 'input_image')
    check('이미지와 detail 이 계수에도 실린다',
      cImg?.image_url === IMAGE_URL && cImg?.detail === IMAGE_DETAIL, `detail=${cImg?.detail}`)
    check('계수값이 비음수 정수', r.ok && r.inputTokens === 7100, `${r.inputTokens}`)
    check('계수값이 천장 안', (r.inputTokens ?? 0) <= ROLE_MAX_INPUT_TOKENS.generation,
      `${r.inputTokens} ≤ ${ROLE_MAX_INPUT_TOKENS.generation}`)
    check('실제 전송 0건', guard.snapshot().attempts === 0, JSON.stringify(guard.snapshot()))
  }
  console.log('')

  // ── [3] 추론 요청 계약 (§117) ─────────────────────────────────────
  console.log('[3] 추론 요청 — 모델·출력상한·tier·detail·주소')
  guard.reset()
  {
    const { fetchImpl, calls } = injectFetch(() => ({
      json: sdkReply(JSON.stringify(GEN_PAYLOAD), OK_USAGE),
    }))
    const send = createLimitedSender({ allowLiveCall: true, fetchImpl, apiKey: 'syn-injected' })
    const r = await send(genRequest())
    const b = calls[0]?.body
    check('추론 1회', calls.length === 1, `호출=${calls.length}`)
    check('주소가 공식 base URL', String(calls[0]?.url).startsWith(OFFICIAL_BASE_URL), String(calls[0]?.url))
    check('model', b?.model === ROLE_MODEL.generation, String(b?.model))
    check('max_output_tokens', b?.max_output_tokens === ROLE_MAX_OUTPUT_TOKENS.generation,
      String(b?.max_output_tokens))
    check('service_tier', b?.service_tier === SERVICE_TIER, String(b?.service_tier))
    check('응답 파싱 성공', r.kind === 'ok', r.kind)
    const parsed = r.kind === 'ok' ? TwinGenerationResult.safeParse(r.output_parsed) : null
    check('Zod 재검증 통과', parsed?.success === true, parsed?.success ? '통과' : '실패')
    check('후보 2개', r.kind === 'ok'
      && (r.output_parsed as { candidates: unknown[] }).candidates.length === 2, '2')
    check('usage 두 값 확인', r.kind === 'ok' && r.usage.complete,
      r.kind === 'ok' ? `in=${r.usage.inputTokens} out=${r.usage.outputTokens}` : '-')
    check('실제 전송 0건', guard.snapshot().attempts === 0, JSON.stringify(guard.snapshot()))
  }
  console.log('')

  // ── [4] 검토 요청 — 텍스트만, 이미지 없음 ─────────────────────────
  console.log('[4] 검토 요청 — 역할별 모델·상한, 이미지 없음')
  {
    const { fetchImpl, calls } = injectFetch(() => ({
      json: sdkReply(JSON.stringify(REVIEW_PAYLOAD), { input_tokens: 5400, output_tokens: 640 }),
    }))
    const send = createLimitedSender({ allowLiveCall: true, fetchImpl, apiKey: 'syn-injected' })
    const r = await send({
      role: 'review', model: ROLE_MODEL.review, instructions: '검토 지침(합성)',
      input: [{ role: 'user', content: [{ type: 'input_text', text: '{"task":"review"}' }] }],
      textFormat: zodTextFormat(TwinReviewResult, 'twin_review_result'),
    })
    const b = calls[0]?.body
    check('model', b?.model === ROLE_MODEL.review, String(b?.model))
    check('max_output_tokens', b?.max_output_tokens === ROLE_MAX_OUTPUT_TOKENS.review,
      String(b?.max_output_tokens))
    check('service_tier', b?.service_tier === SERVICE_TIER, String(b?.service_tier))
    const hasImg = ((b?.input as Array<{ content: Array<Record<string, unknown>> }>)[0].content)
      .some((x) => x.type === 'input_image')
    check('검토에 이미지를 보내지 않는다', !hasImg, hasImg ? '있음' : '없음')
    check('응답 파싱 성공', r.kind === 'ok', r.kind)
    check('Zod 재검증 통과',
      r.kind === 'ok' && TwinReviewResult.safeParse(r.output_parsed).success, '통과')
  }
  console.log('')

  // ── [5] 기대 실패 — 분류가 섞이지 않는가 ──────────────────────────
  console.log('[5] 기대 실패 — 중첩 refusal · 잘림 · 서버 오류 · 역할 불일치')
  {
    const mk = (reply: Parameters<typeof injectFetch>[0], gate = new AbortGate()) => {
      const { fetchImpl, calls } = injectFetch(reply)
      return { send: createLimitedSender({ allowLiveCall: true, gate, fetchImpl, apiKey: 'syn' }), calls, gate }
    }
    // 중첩 refusal — 최상위 refusal 필드가 아니다
    {
      const h = mk(() => ({
        json: {
          id: 'r', object: 'response', status: 'completed',
          output: [{ type: 'message', role: 'assistant', id: 'm', status: 'completed',
                     content: [{ type: 'refusal', refusal: '정책상 불가(합성)' }] }],
          usage: OK_USAGE,
        },
      }))
      const r = await h.send(genRequest())
      check('중첩 refusal 을 refusal 로 분류', r.kind === 'refusal', r.kind)
    }
    // 잘림
    {
      const h = mk(() => ({
        json: sdkReply(JSON.stringify(GEN_PAYLOAD), OK_USAGE, {
          status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
        }),
      }))
      const r = await h.send(genRequest())
      check('잘림을 incomplete 로 분류 (정상 아님)',
        r.kind === 'incomplete' && r.reasonCode === 'max_output_tokens', r.kind)
      check('잘림 뒤 gate 가 사유까지 남긴다',
        h.gate.abortReason === 'incomplete_max_output_tokens', String(h.gate.abortReason))
    }
    // 서버 오류 → 후속 차단
    {
      const gate = new AbortGate()
      const h = mk(() => ({ json: { error: { message: 'syn' } }, status: 503 }), gate)
      const a = await h.send(genRequest())
      const b = await h.send({ ...genRequest(), role: 'review', model: ROLE_MODEL.review })
      check('5xx 를 server 로 분류', a.kind === 'transport_error' && a.code === 'server',
        a.kind === 'transport_error' ? a.code : a.kind)
      check('실패 뒤 후속 요청 차단',
        b.kind === 'transport_error' && b.code === 'aborted_after_failure',
        b.kind === 'transport_error' ? b.code : b.kind)
      check('HTTP 는 1건만 나갔다', h.calls.length === 1, `${h.calls.length}`)
    }
    // 역할·모델 불일치 → 전송 전 차단
    {
      const h = mk(() => ({ json: sdkReply('{}', OK_USAGE) }))
      const r = await h.send({ ...genRequest(), role: 'review' })
      check('역할·모델 불일치는 전송 전 차단',
        r.kind === 'transport_error' && r.code === 'role_model_mismatch',
        r.kind === 'transport_error' ? r.code : r.kind)
      check('HTTP 0건', h.calls.length === 0, `${h.calls.length}`)
    }
    // usage 판정
    check('usage 한쪽만이면 미확인', readUsage({ input_tokens: 10 }).complete === false, 'false')
    check('usage 음수면 미확인', readUsage({ input_tokens: -1, output_tokens: 1 }).complete === false, 'false')
    check('usage 비정수면 미확인', readUsage({ input_tokens: 1.5, output_tokens: 1 }).complete === false, 'false')
    check('usage 둘 다 정수면 확인', readUsage({ input_tokens: 1, output_tokens: 0 }).complete === true, 'true')
  }
  console.log('')

  // ── [6] 음성 — 주입을 빠뜨리면 실제 연결 전에 잡힌다 (§30) ─────────
  console.log('[6] 음성 — 주입 누락 + 모양 정상 가짜 키 + 실제 origin')
  guard.reset()
  {
    const noInjection = createLimitedSender({
      allowLiveCall: true,
      apiKey: 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN',   // 모양만 정상, 값은 가짜
      // fetchImpl 를 **일부러 넘기지 않는다** — 033 의 실수 그대로
    })
    const r = await noInjection(genRequest())
    const s = guard.snapshot()
    check('전송 차단으로 분류', r.kind === 'transport_error' && r.code === 'outbound_blocked',
      r.kind === 'transport_error' ? r.code : r.kind)
    check('시도 1 / 차단 1',
      s.attempts === 1 && s.blocked === 1 && s.blocked === s.attempts,
      `시도=${s.attempts} 차단=${s.blocked} 로컬허용=${s.localAllowed} 대상=${s.targets.join(',')}`)
    guard.reset()
    const s2 = guard.snapshot()
    check('대조군: 시도 0', s2.attempts === 0, `시도=${s2.attempts}`)
  }
  console.log('')

  console.log(`[판정] 실패 ${failures}건`)
  process.exitCode = failures === 0 ? 0 : 1
}

main().catch((e) => {
  // 원문 오류를 그대로 찍지 않는다. 종류만 남긴다
  console.log(`탐침이 예외로 끝났습니다: ${(e as { name?: string }).name ?? 'error'}`)
  process.exitCode = 9
})
