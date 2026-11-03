/**
 * OpenAI 설정 공급 — **조회 도구와 스모크가 같은 출처를 쓴다** (GPT-EXEC-035 §5).
 *
 * 왜 공용으로 뺐나
 *   034 에서는 조회 도구만 전용 출처를 쓰고, 스모크 CLI 는 공유 `.env.local` 을 적재한 뒤
 *   SDK 의 `apiKey` 를 `undefined` 로 뒀다. 그러면 SDK 가 `process.env.OPENAI_API_KEY` 를
 *   알아서 집어가는데, 그 값이 **공유 파일에서 딸려 온 것일 수 있다.**
 *   035 §103 이 그것을 "무언의 fallback" 으로 금지했다.
 *
 * 036 에서 고친 것 — R035-01
 *   035 판은 전용 파일을 `loadEnvFile` 로 **적재**하고 값을 `process.env` 에서 다시
 *   꺼냈다(`readBack`). 그런데 Node 의 `process.loadEnvFile` 은 **이미 있는 환경값을
 *   덮어쓰지 않는다.** 스모크는 Supabase 설정을 위해 공유 `.env.local` 을 먼저 적재하므로,
 *   공유 파일에 OpenAI 값이 있으면:
 *
 *     공유 = A · 전용 = B  →  전용 파일을 적재해도 process.env 는 A 그대로
 *                          →  `source: 'isolated_file'` 이라고 보고하면서 **A 를 전달**
 *
 *   즉 출처 보고와 실제로 쓰인 값이 **달랐다.** 그래서 이제
 *   **전용 파일의 내용만 따로 파싱해 그 객체에서 키를 꺼낸다.**
 *   `process.env` 를 다시 읽지 않으므로 공유 상태가 끼어들 자리가 없다.
 *
 * 규칙
 *   1) **셸 값이 먼저다.** 셸에 있으면 환경파일을 **전혀 읽지 않는다** (읽기 0회).
 *   2) 없으면 **전용 파일만** 읽는다 (`<메인 저장소>/.env.openai.local`).
 *      파일 내용을 **별도 객체**로 파싱하고, 그 객체의 `OPENAI_API_KEY` 만 쓴다.
 *   3) 전용 파일이 없거나 읽히지 않거나 키가 없으면 **각각 다른 사유로 멈춘다.**
 *      공유 `.env.local` 로 되돌아가지 않고, 다른 폴더를 뒤지지 않는다.
 *
 * 하지 않는 것
 *   - 키 값·해독 내용·파일 내용을 **반환 로그에 담지 않는다** (§104).
 *   - `process.env` 를 읽거나 쓰지 않는다. 전용 파일을 **적재**하지 않는다.
 *   - 수제 범용 `.env` 파서를 만들지 않는다. Node 기본 파서(`node:util.parseEnv`)를 쓴다 (036 §43).
 *   - 파일을 만들지 않는다. 설정을 자동으로 찾아다니지 않는다.
 */
import nodePath from 'node:path'
import nodeUtil from 'node:util'

/** OpenAI **전용** 설정파일 이름. 공유 `.env.local` 과 다른 파일이다 */
export const ISOLATED_ENV_FILENAME = '.env.openai.local'

/** 전용 파일에서 찾는 변수 이름. 이 하나만 본다 */
export const OPENAI_KEY_NAME = 'OPENAI_API_KEY'

/** 전용 출처가 없을 때의 사유 코드 */
export const CODE_NOT_ISOLATED = 'openai_config_not_isolated'

/** 전용 파일이 있으나 **읽히지 않을** 때 */
export const CODE_UNREADABLE = 'openai_config_unreadable'

/** 전용 파일을 읽었으나 **파싱이 되지 않을** 때 */
export const CODE_UNPARSABLE = 'openai_config_unparsable'

/** 전용 파일에 키가 **없거나 빈값**일 때. 공유 값으로 채우지 않는다 */
export const CODE_KEY_MISSING = 'openai_key_missing'

/**
 * Node 기본 환경 파서를 **쓸 수 없을** 때 (036 §43 — 설치 Node 의 지원 여부를 먼저 본다).
 * 이때 수제 파서로 대신하지 않고 멈춘다.
 */
export const CODE_PARSER_UNAVAILABLE = 'openai_env_parser_unavailable'

/** 설정을 읽을 때 쓰는 통로. `resolveEnvFilePath`(029) 가 받는 모양과 같다 */
export type ConfigFs = {
  isDir(p: string): boolean
  isFile(p: string): boolean
  read(p: string): string
}

/** 환경파일 **내용**을 객체로 바꾸는 파서. `process.env` 를 건드리지 않는다 */
export type EnvParser = (content: string) => Record<string, string | undefined>

/**
 * 판정 결과.
 *
 * **판별 유니온으로 두지 않는다** — 이 저장소는 `strictNullChecks` 가 꺼져 있어
 * 좁혀지지 않는다 (AGENTS.md 함정 3).
 */
export type OpenAiConfig = {
  ok: boolean
  /** 확보한 키. 실패하면 null. **로그에 찍지 않는다** */
  apiKey: string | null
  /** 어디서 왔는가 */
  source: 'shell' | 'isolated_file' | null
  /** 실패 사유 코드. 성공하면 null */
  code: string | null
  /** 환경파일을 몇 번 읽었는가. 셸에서 왔으면 **0** 이다 */
  envReads: number
}

/**
 * Node 기본 환경 파서. 없으면 `null` — **수제 파서로 대신하지 않는다.**
 *
 * `node:util.parseEnv` 는 내용을 객체로만 돌려주고 `process.env` 를 바꾸지 않는다.
 * 그래서 공유 상태가 끼어들지 않는다 (036 §42~§43).
 */
export function defaultEnvParser(): EnvParser | null {
  const parse = (nodeUtil as unknown as { parseEnv?: unknown }).parseEnv
  if (typeof parse !== 'function') return null
  return (content) => (parse as EnvParser)(content)
}

/**
 * 전용 설정파일의 경로. **존재만 확인하고 내용은 열지 않는다.**
 *
 * `sharedEnvPath` 는 `resolveEnvFilePath` 가 찾아 주는 메인 저장소의 `.env.local` 이다.
 * 전용 파일은 **같은 폴더**에서 찾는다. 없으면 null — 공유 파일로 대체하지 않는다.
 */
export function resolveIsolatedOpenAiEnvPath(
  sharedEnvPath: string | null,
  fs: Pick<ConfigFs, 'isFile'>,
): string | null {
  if (sharedEnvPath === null) return null
  const norm = sharedEnvPath.split('\\').join('/')
  const dir = norm.slice(0, norm.lastIndexOf('/'))
  const isolated = `${dir}/${ISOLATED_ENV_FILENAME}`
  return fs.isFile(isolated) ? isolated : null
}

/**
 * OpenAI 키를 확보한다.
 *
 * `shellKey` 는 **공유 환경파일을 적재하기 전에** 호출부가 미리 담아 둔 셸 값이다.
 * 적재 뒤의 `process.env` 를 보면 공유 파일에서 딸려 온 값과 구분할 수 없다 —
 * 그래서 호출부가 먼저 떠서 넘긴다.
 *
 * 셸에 없으면 전용 파일을 **읽어서 파싱만** 한다. 적재(`loadEnvFile`)하지 않고,
 * 결과를 `process.env` 에서 되읽지도 않는다. 돌려준 `apiKey` 를 호출부가
 * sender·counter 에 **명시로 넘겨야** 한다 (036 §45).
 */
export function resolveOpenAiConfig(args: {
  shellKey: string | undefined
  sharedEnvPath: string | null
  fs: Pick<ConfigFs, 'isFile' | 'read'>
  /**
   * 전용 파일 **내용만** 객체로 파싱한다. `null` 이면 파서를 쓸 수 없는 것이고,
   * 그때는 수제 파서로 대신하지 않고 멈춘다.
   */
  parseEnv: EnvParser | null
}): OpenAiConfig {
  const shell = (args.shellKey ?? '').trim()
  if (shell !== '') {
    // 셸 값이 먼저다. **환경파일을 읽지 않는다**
    return { ok: true, apiKey: shell, source: 'shell', code: null, envReads: 0 }
  }

  const isolated = resolveIsolatedOpenAiEnvPath(args.sharedEnvPath, args.fs)
  if (isolated === null) {
    return { ok: false, apiKey: null, source: null, code: CODE_NOT_ISOLATED, envReads: 0 }
  }

  if (typeof args.parseEnv !== 'function') {
    // 파서가 없다는 이유로 공유 값이나 수제 파싱으로 넘어가지 않는다
    return { ok: false, apiKey: null, source: null, code: CODE_PARSER_UNAVAILABLE, envReads: 0 }
  }

  let content: string
  try {
    content = args.fs.read(isolated)
  } catch {
    return { ok: false, apiKey: null, source: null, code: CODE_UNREADABLE, envReads: 0 }
  }

  let parsed: Record<string, string | undefined>
  try {
    parsed = args.parseEnv(content)
  } catch {
    return { ok: false, apiKey: null, source: null, code: CODE_UNPARSABLE, envReads: 1 }
  }
  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, apiKey: null, source: null, code: CODE_UNPARSABLE, envReads: 1 }
  }

  // **파싱한 객체에서만** 꺼낸다. `process.env` 를 보지 않는다
  const raw = parsed[OPENAI_KEY_NAME]
  const got = (typeof raw === 'string' ? raw : '').trim()
  if (got === '') {
    // 파일이 있다는 이유로 공유 값·과거 값으로 채우지 않는다 (036 §44)
    return { ok: false, apiKey: null, source: null, code: CODE_KEY_MISSING, envReads: 1 }
  }
  return { ok: true, apiKey: got, source: 'isolated_file', code: null, envReads: 1 }
}

/** 로그에 적어도 안전한 한 줄. **키 값을 넣지 않는다** */
export function describeOpenAiConfig(c: OpenAiConfig): string {
  if (!c.ok) return `사유=${c.code}`
  const where = c.source === 'shell' ? '셸 환경변수' : `전용 파일(${ISOLATED_ENV_FILENAME})`
  return `${where} · 환경파일 읽기 ${c.envReads}회 · 길이 ${c.apiKey!.length}자 (값은 출력하지 않습니다)`
}

/** 설정 실패를 사람 말로. **경로·내용·값은 넣지 않는다** */
export function explainOpenAiConfigFailure(code: string | null): string {
  switch (code) {
    case CODE_NOT_ISOLATED: return '전용 설정 파일이 없습니다'
    case CODE_UNREADABLE: return '전용 설정 파일을 읽지 못했습니다'
    case CODE_UNPARSABLE: return '전용 설정 파일을 해석하지 못했습니다'
    case CODE_KEY_MISSING: return `전용 설정 파일에 ${OPENAI_KEY_NAME} 가 없거나 빈값입니다`
    case CODE_PARSER_UNAVAILABLE: return '이 Node 에는 기본 환경 파서가 없습니다 (수제 파서로 대신하지 않습니다)'
    default: return '설정을 확보하지 못했습니다'
  }
}

/** 전용 파일이 묶음·git 에 들어가지 않게 둘 이름 (안내용) */
export function isolatedEnvGitignoreLine(): string {
  return ISOLATED_ENV_FILENAME
}

/** 전용 파일의 **기대 경로**를 안내용으로 만든다. 존재 여부는 보지 않는다 */
export function expectedIsolatedPathForMessage(sharedEnvPath: string | null): string {
  if (sharedEnvPath === null) return `<메인 저장소>/${ISOLATED_ENV_FILENAME}`
  const norm = sharedEnvPath.split('\\').join('/')
  return nodePath.posix.join(norm.slice(0, norm.lastIndexOf('/')), ISOLATED_ENV_FILENAME)
}
