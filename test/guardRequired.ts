/**
 * 탐침이 **맨 처음** 적재하는 모듈 — 차단이 없으면 여기서 끝낸다 (GPT-EXEC-037 §45).
 *
 * 왜 이것이 따로 필요한가
 *   `test/bootstrap.cjs` 는 `--require` 로 돌기 때문에 **가장 먼저** 확인합니다.
 *   그래서 `scripts/run-guarded.cjs` 로 띄우면 이 파일 없이도 안전합니다.
 *   그런데 036 의 사고는 **그 wrapper 를 거치지 않고** 손으로 띄운 것이었습니다.
 *
 *   ESM 은 import 를 **소스 순서대로** 평가합니다. 그래서 탐침의 **첫 import** 로 이것을 두면
 *   `openaiSend`·OpenAI SDK·설정·클라이언트가 **적재되기 전에** 멈출 수 있습니다.
 *   탐침 안쪽에서 `__NETGUARD__` 를 확인하는 기존 코드는 이미 SDK 가 올라온 뒤에 돕니다.
 *
 * 하는 일: 창구 확인과 즉시 종료뿐입니다. **실제 연결을 보내지 않습니다** (§48).
 * netguard 를 고치지 않고, 새 차단 알고리즘을 만들지 않습니다 (§43).
 */

/** `test/bootstrap.cjs` 와 같은 값이어야 한다 */
export const EXIT_GUARD_MISSING = 97

type GuardSnapshot = {
  active: boolean
  attempts: number
  blocked: number
  localAllowed: number
  measurementScope: string
  targets: string[]
}
export type Guard = { snapshot(): GuardSnapshot; reset(): void }

export function readGuard(): Guard | undefined {
  return (globalThis as unknown as { __NETGUARD__?: Guard }).__NETGUARD__
}

/**
 * 멈춘 **그 시점에** 앱·SDK 가 적재돼 있었는지 센다.
 *
 * "첫 import 다" 를 말로만 적지 않고 **수로** 남긴다. 이 파일이 정말 첫 import 라면
 * 0 이어야 한다. 누가 import 순서를 뒤로 옮기면 이 수가 0 이 아니게 되고 시험이 잡는다.
 */
export function appModulesLoaded(): number {
  const cache = (require as unknown as { cache?: Record<string, unknown> }).cache
  if (cache === undefined) return -1
  return Object.keys(cache).filter((k) => /openaiSend|openaiConfig|[\/]openai[\/]/.test(k)).length
}

function refuse(reason: string): never {
  console.log('[037] 중단: 외부 전송 차단이 걸리지 않았습니다. 탐침을 시작하지 않습니다.')
  console.log(`[037] 사유 = ${reason}`)
  console.log(`[037] 멈춘 시점에 적재된 앱·SDK 모듈 = ${appModulesLoaded()}개`)
  console.log('[037] 앱·SDK 를 적재하기 전에 멈췄습니다 (이 모듈이 첫 import 입니다).')
  console.log('[037] scripts/run-guarded.cjs 로 띄우십시오.')
  // 즉시 종료다. 뒤의 import 가 평가되면 안 된다
  process.exit(EXIT_GUARD_MISSING)
}

const guard = readGuard()
if (guard === undefined) refuse('guard_not_registered')
else if (guard.snapshot().active !== true) refuse('guard_inactive')
