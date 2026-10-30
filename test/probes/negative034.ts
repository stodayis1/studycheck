/**
 * 음성 시험 — **주입을 일부러 빠뜨린** 공통 sender 가 실제 연결 전에 잡히는가 (034 §30).
 *
 * 033 에서 제가 한 실수를 그대로 재현합니다: 모양이 정상인 가짜 키 + 실제 origin +
 * 주입 fetch 없음. 그때는 실제로 POST 1건이 나갔습니다. 이제는 차단 경계가 먼저 잡습니다.
 *
 * **시도·차단·전송을 따로 셉니다.** 「시도 1 / 차단 1」 이지 「시도 0」 이 아닙니다.
 */
// 037 §45 — **첫 import**. 차단이 없으면 SDK·앱이 적재되기 전에 끝낸다
import '../guardRequired'

import { createLimitedSender, ROLE_MODEL } from '../../lib/twin/openaiSend'

type Guard = {
  snapshot(): {
    active: boolean; attempts: number; blocked: number
    localAllowed: number; measurementScope: string; targets: string[]
  }
  reset(): void
}
const guard = (globalThis as unknown as { __NETGUARD__?: Guard }).__NETGUARD__

async function main() {
  if (guard === undefined) {
    console.log('중단: 차단 장치가 적재되지 않았습니다. 이 탐침을 돌리지 않습니다.')
    process.exitCode = 9
    return
  }
  console.log('차단 장치 = 적재됨')

  // ── (A) 음성: 주입 누락 + 모양 정상 가짜 키 + 실제 origin ──
  guard.reset()
  const noInjection = createLimitedSender({
    allowLiveCall: true,
    // fetchImpl 를 **일부러 넘기지 않습니다** — 033 의 실수 그대로
    apiKey: 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN',   // 모양은 정상, 값은 가짜
  })
  const a = await noInjection({
    role: 'generation', model: ROLE_MODEL.generation,
    instructions: '지침', input: [], textFormat: { type: 'json_object' },
  })
  const sA = guard.snapshot()
  console.log(`음성(주입누락)   결과=${a.kind}` + (a.kind === 'transport_error' ? `/${a.code}` : '') +
    ` | 시도=${sA.attempts} 차단=${sA.blocked} 로컬허용=${sA.localAllowed} 대상=${sA.targets.join(',')}`)

  // ── (B) 양성 대조군: 합성 fetch 주입 → 차단 경계를 지나지 않는다 ──
  guard.reset()
  let synthCalls = 0
  const withInjection = createLimitedSender({
    allowLiveCall: true,
    apiKey: 'syn-injected',
    fetchImpl: (async (_u: unknown, init?: unknown) => {
      synthCalls++
      const body = JSON.parse(((init ?? {}) as { body?: string }).body ?? '{}')
      return new Response(JSON.stringify({
        id: 'r', object: 'response', status: 'completed',
        output: [{ type: 'message', role: 'assistant', id: 'm', status: 'completed',
                   content: [{ type: 'output_text', text: '{}', annotations: [] }] }],
        usage: { input_tokens: 10, output_tokens: 5 },
        _echo_model: body.model,
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    }) as never,
  })
  const b = await withInjection({
    role: 'generation', model: ROLE_MODEL.generation,
    instructions: '지침', input: [], textFormat: { type: 'json_object' },
  })
  const sB = guard.snapshot()
  console.log(`양성(주입있음)   결과=${b.kind} 합성fetch=${synthCalls}` +
    ` | 시도=${sB.attempts} 차단=${sB.blocked} 로컬허용=${sB.localAllowed}`)

  // ── (C) 아무것도 하지 않은 대조군: 시도 0 ──
  guard.reset()
  const sC = guard.snapshot()
  console.log(`대조군(무행동)   시도=${sC.attempts} 차단=${sC.blocked} 로컬허용=${sC.localAllowed}`)

  const ok =
    a.kind === 'transport_error' && sA.attempts === 1 && sA.blocked === 1 && sA.blocked === sA.attempts &&
    synthCalls === 1 && sB.attempts === 0 && sB.blocked === 0 &&
    sC.attempts === 0
  console.log(ok ? '판정 = 통과' : '판정 = 실패')
  process.exitCode = ok ? 0 : 1
}
main().catch((e) => {
  console.log('탐침이 예외로 끝났습니다:', (e as { name?: string }).name ?? 'error')
  process.exitCode = 9
})
