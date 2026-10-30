/**
 * 모델 **메타데이터만** 조회하는 도구 — GPT-EXEC-033 §5 (F-05).
 *
 * 무엇을 답하나
 *   "이 키로 `gpt-6-astra`·`gpt-6-sol` 의 **정보를 읽을 수 있는가**"
 *
 * 무엇을 답하지 **못하나** (§126 — 이걸 혼동하면 안 된다)
 *   - `/v1/responses` 로 **실제 생성을 할 수 있는가** → 모른다. 별개 권한이다.
 *   - 프로젝트의 모델 사용 설정 → 모른다. 대시보드에서 봐야 한다.
 *   - 결제·한도 → 모른다.
 *   그래서 결과를 `modelsReadable` 와 `inferenceVerified` 로 **나눠서** 보고하고,
 *   후자는 첫 승인된 추론 전까지 언제나 `false`(미확인)다.
 *
 * 하지 않는 것
 *   - 유료 추론 요청 (`responses.create('hi')` 같은 것을 섞지 않는다 — §128)
 *   - 이미지·프롬프트·후보 생성 요청
 *   - Supabase 키 읽기·클라이언트 생성·DB·Storage 접근 (**0회**)
 *   - 계정 전체 모델 목록 조회 (`GET /v1/models` 를 부르지 않는다 — §125)
 *   - 자동 재시도 (모델 ID 당 **최대 1회**)
 *
 * ⚠ **이번 라운드에 실행 승인을 받지 않았다.** 도구와 안내만 준비한다 (§116).
 */
import nodeFs from 'node:fs'

import { resolveEnvFilePath, EXPECTED_PROJECT_REF } from './check-storage-sample-029'
// 035 §102: 설정 공급은 **공용 모듈** 하나를 쓴다. 스모크 CLI 도 같은 함수를 쓴다
import {
  resolveOpenAiConfig, describeOpenAiConfig, expectedIsolatedPathForMessage,
  explainOpenAiConfigFailure, defaultEnvParser,
  ISOLATED_ENV_FILENAME, CODE_NOT_ISOLATED, type EnvParser,
} from '../lib/twin/openaiConfig'

/** 조회할 모델. 이 둘만이다. 계정 전체 목록을 받지 않는다 */
export const MODEL_IDS = ['gpt-6-astra', 'gpt-6-sol'] as const

export const METADATA_BASE = 'https://api.openai.com/v1/models'

export const EXECUTE_FLAG = '--execute-approved-metadata-check'
export const LIVE_ENV_NAME = 'TWIN_MODEL_CHECK_ALLOW_LIVE'
export const LIVE_ENV_VALUE = 'yes'
export const HELP_FLAGS = ['--help', '-h', '--plan'] as const

export const EXIT = {
  ok: 0,
  planned: 0,
  badArgs: 2,
  notApproved: 3,
  configMissing: 4,
  /** OpenAI 전용 설정 출처가 없다. 공유 파일로 대체하지 않는다 (034 §96) */
  configNotIsolated: 6,
  /** 조회가 하나라도 200 이 아니었다. **모델이 없다는 뜻이 아니다** */
  notReadable: 5,
  unexpected: 9,
} as const

/** 한 모델 조회의 결과. **원문 오류·헤더·키를 담지 않는다** (§125) */
export type ModelProbe = {
  modelId: string
  /** HTTP 상태. 네트워크 단계에서 끝났으면 null */
  status: number | null
  /** 안정된 분류 */
  classification:
    | 'readable'            // 200
    | 'unauthorized'        // 401 — 키가 거부됐다
    | 'forbidden'           // 403 — 키는 유효하나 이 조회 권한이 없다
    | 'not_found'           // 404 — 이 키의 범위에서 보이지 않는다
    | 'rate_limited'        // 429
    | 'server_error'        // 5xx
    | 'timeout'
    | 'network_error'
    | 'other'
}

export type AccessReport = {
  probes: ModelProbe[]
  /** 두 모델 **모두** 200 이었는가 */
  modelsReadable: boolean
  /** 실제 생성 가능 여부. **이 도구로는 확정할 수 없다. 언제나 false** */
  inferenceVerified: false
}

function classify(status: number | null, errName: string | null): ModelProbe['classification'] {
  if (status === null) {
    if (errName === 'AbortError' || errName === 'TimeoutError') return 'timeout'
    return 'network_error'
  }
  if (status === 200) return 'readable'
  if (status === 401) return 'unauthorized'
  if (status === 403) return 'forbidden'
  if (status === 404) return 'not_found'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'server_error'
  return 'other'
}

export type FetchLike = (url: string, init?: unknown) => Promise<{ status: number }>

export type AccessDeps = {
  argv: string[]
  env: NodeJS.ProcessEnv
  log: (line: string) => void
  fs: {
    isDir(p: string): boolean
    isFile(p: string): boolean
    read(p: string): string
  }
  cwd: string
  loadEnvFile(p: string): void
  /**
   * 환경파일 **내용** 파서 (036 R035-01). 스모크와 **같은 규칙**이다.
   * 넣지 않으면 Node 기본 파서를 쓴다. `null` 은 "파서 없음" 조건이다.
   */
  parseEnv?: EnvParser | null
  /** 시험에서 대역을 넣는다. 실제 실행에서는 전역 fetch */
  fetchImpl: FetchLike
  timeoutMs?: number
}

const HELP = [
  '모델 메타데이터 조회 계획 — GPT-EXEC-034 §4',
  '',
  '[무엇을 하나]',
  `  GET ${METADATA_BASE}/${MODEL_IDS[0]}`,
  `  GET ${METADATA_BASE}/${MODEL_IDS[1]}`,
  '  모델 ID 당 최대 1회. 자동 재시도 없음.',
  '',
  '[무엇을 하지 않나]',
  '  유료 추론 요청 0회 — 프롬프트·이미지·후보 생성을 보내지 않는다',
  '  계정 전체 모델 목록(GET /v1/models) 조회 안 함',
  '  Supabase 키 읽기·DB·Storage 접근 0회',
  '',
  '[무엇을 알 수 있나]',
  '  modelsReadable  = 이 키로 두 모델의 **정보를 읽을 수 있는가**',
  '',
  '[무엇을 알 수 **없나**]',
  '  inferenceVerified = 실제 생성 권한. **이 도구로는 확정 불가. 언제나 미확인**',
  '  200 이 나와도 /v1/responses 실행 권한·프로젝트 모델 설정·결제·한도를 증명하지 않는다',
  '  401/403 이 나와도 "모델이 없다"는 뜻이 아니다 — 권한 문제와 부재는 다르다',
  '',
  '[함께 확인해야 하는 것 — 대시보드]',
  '  1) 프로젝트의 모델 사용 설정에 두 모델이 켜져 있는지',
  '  2) 이 키/역할에 Responses 권한이 있는지 (Models Read 와 별개다)',
  '  3) 결제 수단과 사용 한도',
  '  이 확인을 위해 권한을 전부 열 필요는 없다.',
  '',
  '[설정 공급 — OpenAI 전용만]',
  '  1) 셸에 OPENAI_API_KEY 가 있으면 **환경파일을 전혀 읽지 않는다**',
  `  2) 없으면 <메인 저장소>/${ISOLATED_ENV_FILENAME} 만 읽는다`,
  '  3) 그 파일이 없으면 중단한다 — 공유 .env.local 을 자동으로 읽지 않는다',
  '     (공유 파일에는 Supabase service_role 키가 함께 있다)',
  '  키를 채팅·명령행에 붙여넣지 않는다. 코드에 키를 넣지 않는다.',
  '',
  '[실행 조건] — 둘 다 있어야 한다',
  `  명령행   ${EXECUTE_FLAG}`,
  `  환경변수 ${LIVE_ENV_NAME}=${LIVE_ENV_VALUE}`,
  '',
  '⚠ 실행 미승인. GPT 승인 뒤 원장님이 돌린다.',
]

export function formatReport(r: AccessReport): string[] {
  const out: string[] = []
  for (const p of r.probes) {
    out.push(`  ${p.modelId.padEnd(14)} HTTP=${p.status ?? '-'} 분류=${p.classification}`)
  }
  out.push('')
  out.push(`  modelsReadable    = ${r.modelsReadable}`)
  out.push('  inferenceVerified = false  ← **이 도구로 확정할 수 없다** (§126)')
  if (r.modelsReadable) {
    out.push('')
    out.push('  200 은 "그 키로 모델 정보가 조회됐다"는 뜻이다.')
    out.push('  생성 실행 권한·프로젝트 모델 설정·결제·한도는 여전히 미확인이다.')
  } else {
    out.push('')
    out.push('  읽히지 않은 모델이 있다. **모델이 없다고 단정하지 않는다** —')
    out.push('  권한 오류(401/403)와 부재(404)는 다르고, 둘 다 생성 실패의 증명도 아니다.')
  }
  return out
}

export async function probeModel(
  modelId: string,
  key: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<ModelProbe> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetchImpl(`${METADATA_BASE}/${modelId}`, {
      method: 'GET',
      headers: { authorization: `Bearer ${key}` },
      signal: ac.signal,
    })
    return { modelId, status: res.status, classification: classify(res.status, null) }
  } catch (e) {
    const name = e !== null && typeof e === 'object' && 'name' in e
      ? String((e as { name: unknown }).name) : null
    return { modelId, status: null, classification: classify(null, name) }
  } finally {
    clearTimeout(timer)
  }
}

export async function run(deps: AccessDeps): Promise<number> {
  const args = deps.argv.slice(2)
  const helpAsked = args.some((a) => (HELP_FLAGS as readonly string[]).includes(a))
  const wantsExecute = args.includes(EXECUTE_FLAG)
  const unknown = args.filter(
    (a) => a !== EXECUTE_FLAG && !(HELP_FLAGS as readonly string[]).includes(a),
  )
  if (unknown.length > 0) {
    deps.log(`모르는 인자입니다: ${unknown.join(' ')}`)
    HELP.forEach(deps.log)
    return EXIT.badArgs
  }
  if (!wantsExecute || helpAsked) {
    HELP.forEach(deps.log)
    deps.log('')
    deps.log('(계획만 출력했습니다. 조회 0회 · 유료 요청 0회)')
    return EXIT.planned
  }

  if (deps.env[LIVE_ENV_NAME] !== LIVE_ENV_VALUE) {
    deps.log(`[034] ${LIVE_ENV_NAME}=${LIVE_ENV_VALUE} 가 없어 멈춥니다. 조회하지 않았습니다.`)
    return EXIT.notApproved
  }

  // ── 설정 공급 — **공용 함수**로 통일한다 (035 §102)
  //
  // 034 는 이 파일에만 분리 로직이 있었다. 이제 `lib/twin/openaiConfig.ts` 의
  // 같은 함수를 스모크 CLI 도 쓴다. 규칙은 하나다:
  //   셸 값이 먼저 → 없으면 전용 파일만 → 그것도 없으면 중단.
  const sharedEnvPath = resolveEnvFilePath(deps.cwd, deps.fs)
  // 036 R035-01 — 전용 파일을 적재하지 않고 **내용만** 파싱해 그 객체에서 꺼낸다.
  // 이 도구는 공유 `.env.local` 을 적재하지 않지만, 규칙은 스모크와 **같아야** 한다.
  const envParser = Object.prototype.hasOwnProperty.call(deps, 'parseEnv')
    ? deps.parseEnv
    : defaultEnvParser()
  const cfg = resolveOpenAiConfig({
    shellKey: deps.env.OPENAI_API_KEY,
    sharedEnvPath,
    fs: deps.fs,
    parseEnv: envParser,
  })
  if (!cfg.ok) {
    if (cfg.code === CODE_NOT_ISOLATED) {
      deps.log(`[035] 중단: OpenAI 전용 설정 출처가 없습니다.`)
      deps.log(`      사유코드 = ${CODE_NOT_ISOLATED}`)
      deps.log(`      기대 경로 = ${expectedIsolatedPathForMessage(sharedEnvPath)}`)
      deps.log('      공유 .env.local 을 자동으로 읽지 않습니다 — 그 파일에는 Supabase 키도 있습니다.')
      deps.log('      실제 설정 내용을 열어 찾지도 않았습니다.')
      deps.log('      키를 채팅·명령행에 붙여넣지 마십시오. 전용 파일 준비 절차는 런북에 있습니다.')
      return EXIT.configNotIsolated
    }
    deps.log(`[036] 설정을 쓸 수 없습니다 (사유=${cfg.code}). 조회하지 않았습니다.`)
    deps.log(`      ${explainOpenAiConfigFailure(cfg.code)}`)
    deps.log('      공유 .env.local 의 값으로 채우지 않았습니다. 요청 0회.')
    return EXIT.configMissing
  }
  const key = cfg.apiKey!
  const envReads = cfg.envReads
  deps.log(`[035] 설정: ${describeOpenAiConfig(cfg)}`)
  if (envReads === 0) deps.log('      셸 값을 썼으므로 **환경파일을 읽지 않았습니다**.')
  if (key === '') {
    deps.log('[034] OPENAI_API_KEY 가 없습니다. 조회하지 않았습니다.')
    return EXIT.configMissing
  }
  // 값을 출력하지 않는다. 길이만 적는다
  deps.log(`[034] OpenAI 설정 확인 (${key.length}자, 값은 출력하지 않습니다)`)
  deps.log(`[034] 대상 프로젝트와 무관한 조회입니다 — Supabase(${EXPECTED_PROJECT_REF}) 접근 0회`)

  const probes: ModelProbe[] = []
  for (const id of MODEL_IDS) {
    // 모델 ID 당 **1회**. 재시도 루프가 없다
    probes.push(await probeModel(id, key, deps.fetchImpl, deps.timeoutMs ?? 30_000))
  }
  const report: AccessReport = {
    probes,
    modelsReadable: probes.every((p) => p.classification === 'readable'),
    inferenceVerified: false,
  }
  deps.log('')
  formatReport(report).forEach(deps.log)
  return report.modelsReadable ? EXIT.ok : EXIT.notReadable
}

function defaultDeps(): AccessDeps {
  return {
    argv: process.argv,
    env: process.env,
    log: (l) => console.log(l),
    fs: {
      isDir: (p) => { try { return nodeFs.statSync(p).isDirectory() } catch { return false } },
      isFile: (p) => { try { return nodeFs.statSync(p).isFile() } catch { return false } },
      read: (p) => nodeFs.readFileSync(p, 'utf8'),
    },
    cwd: process.cwd(),
    loadEnvFile: (p) => {
      ;(process as unknown as { loadEnvFile(p: string): void }).loadEnvFile(p)
    },
    fetchImpl: (url, init) => fetch(url, init as RequestInit),
  }
}

// 직접 실행했을 때만 돈다. import 로는 아무것도 하지 않는다
if (require.main === module) {
  run(defaultDeps())
    .then((code) => { process.exitCode = code })
    .catch(() => {
      console.log('[034] 중단: 예상하지 못한 실패 (원문 오류는 출력하지 않습니다)')
      process.exitCode = EXIT.unexpected
    })
}
