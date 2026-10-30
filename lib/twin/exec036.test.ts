/**
 * GPT-EXEC-036 유한 대조 — 두 가지만 본다.
 *
 *   R035-01  전용 설정 파일을 읽었다고 보고하면서 **공유 파일의 값을 전달**했다
 *   R035-02  이력 **목록을 읽지 못하면** 없는 것으로 보고 새로 돌았다
 *
 * 범위 (036 §8·§49·§67)
 *   - 실제 `node:util.parseEnv` + **합성 환경파일**로 설정 선택을 본다.
 *   - 실제 `process.loadEnvFile` 은 **직접 만든 합성 파일에만** 쓴다.
 *   - 실제 fs adapter 경계까지 오류를 주입한다.
 *   - 외부 전송은 가드가 import 보다 먼저 막는다. 모델 요청은 합성 대역이다.
 *   - 실제 키·운영 DB·Storage·모델 계정·과금에 닿지 않는다.
 *
 * 로그 규칙
 *   합성 키라도 **값을 단정에 찍지 않는다.** 출처 판정과 참·거짓만 남긴다 (§49).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync,
  statSync, readdirSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  run, EXIT, EXECUTE_FLAG, LIVE_ENV_NAME, LIVE_ENV_VALUE,
  RUN_STATE_DIR, EXPERIMENT_LOCK_FILE, PROMPT_FILES,
  SMOKE_SOURCE_ID, SMOKE_GRADE, SMOKE_TYPE_CODE, SMOKE_CANDIDATE_COUNT,
  scanExperimentRecords, runRecordPath, CODE_HISTORY_UNREADABLE, nodeSmokeFs,
  type SmokeDeps, type SmokeFs, type DirState,
} from '../../scripts/run-twin-smoke-032'
import { EXPECTED_ORIGIN } from '../../scripts/check-storage-sample-029'
import {
  run as runAccess, EXIT as ACCESS_EXIT,
  EXECUTE_FLAG as ACCESS_FLAG, LIVE_ENV_NAME as ACCESS_ENV,
  LIVE_ENV_VALUE as ACCESS_VALUE, type AccessDeps,
} from '../../scripts/check-model-access-033'
import {
  resolveOpenAiConfig, defaultEnvParser, describeOpenAiConfig,
  explainOpenAiConfigFailure,
  ISOLATED_ENV_FILENAME, OPENAI_KEY_NAME,
  CODE_NOT_ISOLATED, CODE_UNREADABLE, CODE_UNPARSABLE,
  CODE_KEY_MISSING, CODE_PARSER_UNAVAILABLE,
} from './openaiConfig'

const ROOT = resolve(__dirname, '..', '..')
const NL = String.fromCharCode(10)
const GOOD_KEY = 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN'

/** 합성 키 세 개. **실제 키가 아니다.** 어느 것이 전달됐는지 가리기 위한 표식이다 */
const SHARED_MARK = 'sk-syn-shared-AAAAAAAAAAAAAAAAAAAA'
const ISOLATED_MARK = 'sk-syn-isolated-BBBBBBBBBBBBBBBBBB'
const SHELL_MARK = 'sk-syn-shell-CCCCCCCCCCCCCCCCCCCCC'

/** 실제 Node 환경 파서. 없으면 바로 드러나야 하므로 던진다 */
const REAL_PARSER = (() => {
  const p = defaultEnvParser()
  if (p === null) throw new Error('이 Node 에는 node:util.parseEnv 가 없습니다')
  return p
})()

// ════════════════════════════════════════════════════════════════════
// 합성 작업 폴더
// ════════════════════════════════════════════════════════════════════

type EnvFiles = {
  /** 공유 `.env.local` 에 넣을 OpenAI 값. null 이면 넣지 않는다 */
  sharedOpenAi: string | null
  /** 전용 파일. null 이면 **파일을 만들지 않는다** */
  isolated: string | null
}

function makeWorkdir(files: EnvFiles): string {
  const dir = mkdtempSync(join(tmpdir(), 'exec036-'))
  mkdirSync(join(dir, '.git'))
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/x')
  mkdirSync(join(dir, 'prompts'))
  for (const spec of Object.values(PROMPT_FILES)) {
    writeFileSync(join(dir, spec.path), readFileSync(join(ROOT, spec.path)))
  }
  // 공유 파일에는 Supabase 설정이 들어 있다. OpenAI 값이 섞여 있을 수 있다 — 그것이 이 사건이다
  const shared = [
    'SYNTHETIC=1',
    ...(files.sharedOpenAi === null ? [] : [`${OPENAI_KEY_NAME}=${files.sharedOpenAi}`]),
  ].join(NL) + NL
  writeFileSync(join(dir, '.env.local'), shared)
  if (files.isolated !== null) {
    writeFileSync(join(dir, ISOLATED_ENV_FILENAME), files.isolated)
  }
  return dir
}

function realFs(over: Partial<SmokeFs> = {}): SmokeFs {
  return {
    isDir: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
    isFile: (p) => { try { return statSync(p).isFile() } catch { return false } },
    read: (p) => readFileSync(p, 'utf8'),
    readBytes: (p) => readFileSync(p),
    writeNew: (p, d) => writeFileSync(p, d, { flag: 'wx' }),
    statDir: (p) => {
      try { return statSync(p).isDirectory() ? 'dir' : 'not_dir' } catch (e) {
        return (e as { code?: string } | null)?.code === 'ENOENT' ? 'missing' : 'unknown'
      }
    },
    listDir: (p) => readdirSync(p),
    write: (p, d) => writeFileSync(p, d),
    mkdirp: (p) => mkdirSync(p, { recursive: true }),
    ...over,
  }
}

/** `init.headers` 에서 Authorization 을 꺼낸다. Headers 든 평범한 객체든 받는다 */
function authOf(init: unknown): string {
  const h = (init as { headers?: unknown } | null)?.headers
  if (h === null || h === undefined) return ''
  const get = (h as { get?: (k: string) => string | null }).get
  if (typeof get === 'function') return get.call(h, 'authorization') ?? ''
  for (const [k, v] of Object.entries(h as Record<string, unknown>)) {
    if (k.toLowerCase() === 'authorization') return String(v)
  }
  return ''
}

/**
 * 실행 모드 deps.
 *
 * **진짜 `process.env` 와 진짜 `process.loadEnvFile` 을 쓴다** — 035 의 결함이
 * "공유 파일이 process.env 를 선점한다" 는 것이었으므로 대역으로는 재현되지 않는다.
 * 호출한 쪽에서 `process.env.OPENAI_API_KEY` 를 **반드시 되돌려야 한다** (`withCleanEnv`).
 */
function liveEnvDeps(dir: string, over: Partial<SmokeDeps> = {}) {
  const lines: string[] = []
  const envLoads: string[] = []
  /** 모델 요청에 실린 Authorization. **값을 단정에 찍지 않는다** */
  const auths: string[] = []
  const urls: string[] = []

  process.env[LIVE_ENV_NAME] = LIVE_ENV_VALUE
  process.env.NEXT_PUBLIC_SUPABASE_URL = EXPECTED_ORIGIN
  process.env.SUPABASE_SERVICE_ROLE_KEY = GOOD_KEY

  const d: SmokeDeps = {
    argv: ['node', 'x', EXECUTE_FLAG],
    env: process.env,
    log: (l) => { lines.push(l) },
    fs: realFs(),
    cwd: dir,
    // **실제** Node 로더. 합성 파일에만 쓴다
    loadEnvFile: (p) => {
      envLoads.push(p)
      ;(process as unknown as { loadEnvFile(p: string): void }).loadEnvFile(p)
    },
    fetchImpl: async (url, init) => {
      urls.push(String(url))
      auths.push(authOf(init))
      // 더 진행시키지 않는다. 설정 전달만 보는 시험이다
      throw new Error('synthetic-stop')
    },
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
    now: () => '2026-10-15T00:00:00.000Z',
    ...over,
  }
  return { deps: d, lines, envLoads, auths, urls }
}

/** 시험이 `process.env` 를 더럽히지 않게 되돌린다 */
async function withCleanEnv(fn: () => Promise<void>): Promise<void> {
  const keep = {
    openai: process.env[OPENAI_KEY_NAME],
    live: process.env[LIVE_ENV_NAME],
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    syn: process.env.SYNTHETIC,
  }
  delete process.env[OPENAI_KEY_NAME]
  try {
    await fn()
  } finally {
    for (const [k, v] of Object.entries({
      [OPENAI_KEY_NAME]: keep.openai, [LIVE_ENV_NAME]: keep.live,
      NEXT_PUBLIC_SUPABASE_URL: keep.url, SUPABASE_SERVICE_ROLE_KEY: keep.key,
      SYNTHETIC: keep.syn,
    })) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

/**
 * 전송기를 **직접 깨워** 전달된 키를 본다.
 *
 * 기본 파이프라인은 운영 Storage 의 이미지를 읽어야 해서 이 시험에서는 앞단에서 멈춘다.
 * 여기서 보려는 것은 "**설정이 어느 값을 전송기에 넣었나**" 하나뿐이므로,
 * 이미 만들어진 전송기를 받아 합성 요청으로 깨운다. 실제 전송은 가드와 대역이 막는다.
 */
function wakeTransports(): NonNullable<SmokeDeps['runPipeline']> {
  return async (args) => {
    for (const t of [args.deps.generationTransport, args.deps.reviewTransport]) {
      try {
        await t({
          role: 'generation', model: 'gpt-6-astra',
          instructions: 'syn', input: [], textFormat: { type: 'json_schema' },
        } as never)
      } catch { /* 합성 중단. 전달만 본다 */ }
    }
    return { kind: 'failed', step: 'generation', code: 'synthetic' } as never
  }
}

/** 전달된 키가 **어느 표식인지**만 돌려준다. 값을 로그에 남기지 않는다 */
function markOf(auth: string): 'shared' | 'isolated' | 'shell' | 'none' | 'other' {
  if (auth === '') return 'none'
  if (auth.includes(SHARED_MARK)) return 'shared'
  if (auth.includes(ISOLATED_MARK)) return 'isolated'
  if (auth.includes(SHELL_MARK)) return 'shell'
  return 'other'
}

// ════════════════════════════════════════════════════════════════════
// X. R035-01 — 설정 출처와 실제로 전달된 값이 같아야 한다
// ════════════════════════════════════════════════════════════════════

test('X1 공유 A + 전용 B → **B 만** 전달된다 (035 는 A 를 보냈다)', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK,
      isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const { deps, auths, lines } = liveEnvDeps(dir, { runPipeline: wakeTransports() })
      await run(deps)
      assert.ok(auths.length > 0, '모델 요청이 만들어지지 않아 전달을 볼 수 없습니다')
      const marks = [...new Set(auths.map(markOf))]
      assert.deepEqual(marks, ['isolated'], `전달된 출처: ${marks.join(',')}`)
      // 출처 보고와 실제 전달이 **같은지**가 이 시험의 요지다
      assert.match(lines.join(NL), new RegExp(`전용 파일\\(${ISOLATED_ENV_FILENAME}`))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X2 셸 값이 있으면 공유·전용 둘 다 있어도 **셸** 이 전달된다', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK,
      isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      process.env[OPENAI_KEY_NAME] = SHELL_MARK
      const { deps, auths, lines } = liveEnvDeps(dir, { runPipeline: wakeTransports() })
      await run(deps)
      assert.ok(auths.length > 0)
      assert.deepEqual([...new Set(auths.map(markOf))], ['shell'])
      assert.match(lines.join(NL), /셸 환경변수/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X3 공유에 OpenAI 값이 없고 전용만 있으면 전용이 전달된다', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: null,
      isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const { deps, auths } = liveEnvDeps(dir, { runPipeline: wakeTransports() })
      await run(deps)
      assert.ok(auths.length > 0)
      assert.deepEqual([...new Set(auths.map(markOf))], ['isolated'])
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X4 공유 A + 전용 파일에 키 **없음** → 설정 실패·요청 0 (A 로 성공하지 않는다)', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({ sharedOpenAi: SHARED_MARK, isolated: `OTHER=1${NL}` })
    try {
      const { deps, urls, lines } = liveEnvDeps(dir)
      assert.equal(await run(deps), EXIT.configMissing)
      assert.equal(urls.length, 0, '중단해야 하는데 요청했습니다')
      const out = lines.join(NL)
      assert.match(out, new RegExp(CODE_KEY_MISSING))
      assert.match(out, /공유 \.env\.local 의 값으로 채우지 않았습니다/)
      // 설정 실패로 실험 잠금을 소모하지 않는다
      assert.ok(!existsSync(join(dir, RUN_STATE_DIR, EXPERIMENT_LOCK_FILE)))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X5 공유 A + 전용 키가 **빈값** → 설정 실패·요청 0', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK, isolated: `${OPENAI_KEY_NAME}=${NL}`,
    })
    try {
      const { deps, urls, lines } = liveEnvDeps(dir)
      assert.equal(await run(deps), EXIT.configMissing)
      assert.equal(urls.length, 0)
      assert.match(lines.join(NL), new RegExp(CODE_KEY_MISSING))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X6 공유 A 만 있고 전용 파일이 **없으면** exit25 · 요청 0', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({ sharedOpenAi: SHARED_MARK, isolated: null })
    try {
      const { deps, urls, lines } = liveEnvDeps(dir)
      assert.equal(await run(deps), EXIT.configNotIsolated)
      assert.equal(urls.length, 0)
      assert.match(lines.join(NL), new RegExp(CODE_NOT_ISOLATED))
      assert.ok(!existsSync(join(dir, RUN_STATE_DIR, EXPERIMENT_LOCK_FILE)))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X7 전용 파일을 **읽지 못하면** 설정 실패 — 공유 값으로 넘어가지 않는다', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const { deps, urls, lines } = liveEnvDeps(dir, {
        fs: realFs({
          read: (p) => {
            if (p.endsWith(ISOLATED_ENV_FILENAME)) {
              const e = new Error('synthetic') as Error & { code: string }
              e.code = 'EACCES'
              throw e
            }
            return readFileSync(p, 'utf8')
          },
        }),
      })
      assert.equal(await run(deps), EXIT.configMissing)
      assert.equal(urls.length, 0)
      assert.match(lines.join(NL), new RegExp(CODE_UNREADABLE))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X8 환경 파서를 쓸 수 없으면 **수제 파싱으로 대신하지 않고** 멈춘다', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const { deps, urls, lines } = liveEnvDeps(dir, { parseEnv: null })
      assert.equal(await run(deps), EXIT.configMissing)
      assert.equal(urls.length, 0)
      assert.match(lines.join(NL), new RegExp(CODE_PARSER_UNAVAILABLE))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X9 전용 파일을 **적재하지 않는다** — 공유 1회만 적재된다', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const { deps, envLoads } = liveEnvDeps(dir)
      await run(deps)
      assert.equal(envLoads.length, 1, `환경파일을 ${envLoads.length}회 적재했습니다`)
      assert.ok(envLoads[0].endsWith('.env.local'), envLoads[0])
      assert.ok(!envLoads.some((p) => p.endsWith(ISOLATED_ENV_FILENAME)),
        '전용 파일을 적재했습니다 — process.env 를 거치면 공유 값과 섞입니다')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X10 생성기와 계수기에 **같은** 키가 간다 (둘 중 하나만 바뀌지 않는다)', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: SHARED_MARK, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const seen: string[] = []
      const { deps } = liveEnvDeps(dir, { runPipeline: wakeTransports() })
      const originalFetch = deps.fetchImpl!
      deps.fetchImpl = async (url, init) => {
        seen.push(markOf(authOf(init)))
        return originalFetch(url, init)
      }
      await run(deps)
      assert.ok(seen.length > 0, '요청이 만들어지지 않았습니다')
      assert.deepEqual([...new Set(seen)], ['isolated'], `출처: ${[...new Set(seen)].join(',')}`)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('X11 조회 도구도 같은 규칙을 쓴다 — 전용 파일 내용만 파싱한다', async () => {
  const dir = makeWorkdir({
    sharedOpenAi: SHARED_MARK, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
  })
  try {
    const loads: string[] = []
    const auths: string[] = []
    const d: AccessDeps = {
      argv: ['node', 'x', ACCESS_FLAG],
      env: { [ACCESS_ENV]: ACCESS_VALUE } as unknown as NodeJS.ProcessEnv,
      log: () => {},
      fs: {
        isDir: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
        isFile: (p) => { try { return statSync(p).isFile() } catch { return false } },
        read: (p) => readFileSync(p, 'utf8'),
      },
      cwd: dir,
      loadEnvFile: (p) => { loads.push(p) },
      fetchImpl: async (_url, init) => { auths.push(authOf(init)); return { status: 200 } },
    }
    assert.equal(await runAccess(d), ACCESS_EXIT.ok)
    assert.deepEqual(loads, [], '적재가 일어났습니다')
    assert.ok(auths.length > 0)
    assert.deepEqual([...new Set(auths.map(markOf))], ['isolated'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('X12 설정 모듈 자체 — 각 실패가 **서로 다른 사유**로 끝난다', () => {
  const base: { shellKey: string | undefined; sharedEnvPath: string } =
    { shellKey: undefined, sharedEnvPath: '/m/.env.local' }
  const cases: Array<[string, ReturnType<typeof resolveOpenAiConfig>]> = [
    [CODE_NOT_ISOLATED, resolveOpenAiConfig({
      ...base, fs: { isFile: () => false, read: () => '' }, parseEnv: REAL_PARSER,
    })],
    [CODE_PARSER_UNAVAILABLE, resolveOpenAiConfig({
      ...base, fs: { isFile: () => true, read: () => '' }, parseEnv: null,
    })],
    [CODE_UNREADABLE, resolveOpenAiConfig({
      ...base, fs: { isFile: () => true, read: () => { throw new Error('x') } },
      parseEnv: REAL_PARSER,
    })],
    [CODE_UNPARSABLE, resolveOpenAiConfig({
      ...base, fs: { isFile: () => true, read: () => 'x' },
      parseEnv: () => { throw new Error('x') },
    })],
    [CODE_KEY_MISSING, resolveOpenAiConfig({
      ...base, fs: { isFile: () => true, read: () => `OTHER=1${NL}` }, parseEnv: REAL_PARSER,
    })],
  ]
  for (const [code, c] of cases) {
    assert.equal(c.ok, false, code)
    assert.equal(c.code, code)
    assert.equal(c.apiKey, null, `${code}: 실패인데 키를 돌려줬습니다`)
    assert.notEqual(explainOpenAiConfigFailure(code), '설정을 확보하지 못했습니다')
  }
  // 파서가 객체가 아닌 것을 돌려줘도 통과시키지 않는다
  const weird = resolveOpenAiConfig({
    ...base, fs: { isFile: () => true, read: () => 'x' },
    parseEnv: (() => 'not-an-object') as never,
  })
  assert.equal(weird.ok, false)
  assert.equal(weird.code, CODE_UNPARSABLE)
})

test('X13 설정 설명·실패 안내에 키 값이 들어가지 않는다', () => {
  const ok = resolveOpenAiConfig({
    shellKey: ISOLATED_MARK, sharedEnvPath: null,
    fs: { isFile: () => false, read: () => '' }, parseEnv: REAL_PARSER,
  })
  assert.ok(!describeOpenAiConfig(ok).includes(ISOLATED_MARK))
  for (const code of [CODE_NOT_ISOLATED, CODE_UNREADABLE, CODE_UNPARSABLE,
    CODE_KEY_MISSING, CODE_PARSER_UNAVAILABLE]) {
    const text = explainOpenAiConfigFailure(code)
    assert.ok(!text.includes(ISOLATED_MARK))
    assert.ok(!text.includes(SHARED_MARK))
    assert.ok(text.length > 0)
  }
})

test('X14 소스 — OpenAI 설정이 `process.env` 를 **되읽지 않는다**', () => {
  const cfgSrc = readFileSync(join(ROOT, 'lib/twin/openaiConfig.ts'), 'utf8')
  // 주석에는 "035 는 readBack 으로 되읽었다" 는 설명이 남아 있다. **코드**만 본다
  const cfgBody = cfgSrc.replace(/^\s*(\*|\/\/|\/\*).*$/gm, '')
  assert.ok(!/readBack/.test(cfgBody), 'readBack 이 코드에 남아 있습니다')
  assert.ok(!/loadEnvFile/.test(cfgBody), '설정 모듈이 환경파일을 적재합니다')
  assert.ok(!/process\.env/.test(cfgBody), '설정 모듈이 process.env 를 봅니다')
  assert.match(cfgSrc, /parseEnv/)

  for (const f of ['scripts/run-twin-smoke-032.ts', 'scripts/check-model-access-033.ts']) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    assert.ok(!/readBack:/.test(src), `${f}: readBack 을 아직 넘깁니다`)
    assert.match(src, /parseEnv: envParser/, `${f}: 같은 설정 공급을 쓰지 않습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// Y. R035-02 — 확인하지 못한 이력을 "없음" 으로 쓰지 않는다
// ════════════════════════════════════════════════════════════════════

/** 이력 조회만 보는 fs. 나머지는 쓰지 않는다 */
function scanFs(over: {
  statDir: (p: string) => DirState
  listDir?: (p: string) => string[]
  read?: (p: string) => string
}) {
  return {
    statDir: over.statDir,
    isFile: () => true,
    read: over.read ?? (() => '{}'),
    listDir: over.listDir ?? (() => []),
  }
}

test('Y1 폴더가 **정말 없으면**(ENOENT) 앞선 실행이 없는 것이다', () => {
  const r = scanExperimentRecords(scanFs({ statDir: () => 'missing' }), '/syn')
  assert.equal(r.ok, true)
  assert.equal(r.state, 'missing')
  assert.equal(r.records.length, 0)
})

test('Y2 정상으로 열린 **빈 폴더**는 기록 없음이다', () => {
  const r = scanExperimentRecords(scanFs({ statDir: () => 'dir', listDir: () => [] }), '/syn')
  assert.equal(r.ok, true)
  assert.equal(r.state, 'empty')
})

test('Y3 폴더 상태를 **확인하지 못하면** 비어 있다고 하지 않는다', () => {
  const r = scanExperimentRecords(scanFs({ statDir: () => 'unknown' }), '/syn')
  assert.equal(r.ok, false)
  assert.equal(r.state, 'unreadable')
  assert.equal(r.code, CODE_HISTORY_UNREADABLE)
  assert.equal(r.records.length, 0)
  assert.ok(r.detail!.length > 0)
})

test('Y4 목록 조회가 **던지면** 빈 목록으로 덮지 않는다', () => {
  const r = scanExperimentRecords(scanFs({
    statDir: () => 'dir',
    listDir: () => { const e = new Error('x') as Error & { code: string }; e.code = 'EACCES'; throw e },
  }), '/syn')
  assert.equal(r.ok, false)
  assert.equal(r.code, CODE_HISTORY_UNREADABLE)
})

test('Y5 기록 위치가 폴더가 아니면 확인 불가다', () => {
  const r = scanExperimentRecords(scanFs({ statDir: () => 'not_dir' }), '/syn')
  assert.equal(r.ok, false)
  assert.equal(r.code, CODE_HISTORY_UNREADABLE)
})

test('Y6 목록의 모양이 이상하면 통과시키지 않는다', () => {
  const r = scanExperimentRecords(scanFs({
    statDir: () => 'dir', listDir: ((): string[] => null as never) as never,
  }), '/syn')
  assert.equal(r.ok, false)
  assert.equal(r.code, CODE_HISTORY_UNREADABLE)
})

test('Y7 **개별 기록**이 읽히지 않아도 기록이 있는 것으로 센다 (035 보존)', () => {
  const r = scanExperimentRecords(scanFs({
    statDir: () => 'dir',
    listDir: () => ['run-old.json'],
    read: () => { throw new Error('x') },
  }), '/syn')
  assert.equal(r.ok, true)
  assert.equal(r.state, 'has_records')
  assert.equal(r.records.length, 1)
  assert.equal(r.records[0].status, null, '읽히지 않은 기록의 상태를 지어냈습니다')
})

test('Y8 CLI — 목록을 못 읽으면 exit26 · 새 잠금 0 · 새 기록 0 · 요청 0', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: null, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      // **읽기는 실패하지만 쓰기는 가능한** 조건이다 (036 §67).
      // "쓰기에서 우연히 막혔다" 를 성공 근거로 쓸 수 없게 한다
      const writes: string[] = []
      const stateDir = join(dir, RUN_STATE_DIR)
      mkdirSync(stateDir, { recursive: true })
      // 과거 방식의 기록 — 새 실험 공통 lock 은 **없다**
      writeFileSync(join(stateDir, 'run-old0000.json'),
        JSON.stringify({ approvalKey: 'old0000', status: 'finished' }))

      const { deps, urls, lines } = liveEnvDeps(dir, {
        fs: realFs({
          listDir: () => {
            const e = new Error('synthetic') as Error & { code: string }
            e.code = 'EACCES'
            throw e
          },
          writeNew: (p, d) => { writes.push(p); writeFileSync(p, d, { flag: 'wx' }) },
          write: (p, d) => { writes.push(p); writeFileSync(p, d) },
        }),
      })
      assert.equal(await run(deps), EXIT.historyUnreadable)
      assert.equal(urls.length, 0, '중단해야 하는데 요청했습니다')
      assert.deepEqual(writes, [], '확인 불가인데 파일을 썼습니다')
      assert.ok(!existsSync(join(stateDir, EXPERIMENT_LOCK_FILE)), '새 잠금을 잡았습니다')
      const out = lines.join(NL)
      assert.match(out, new RegExp(CODE_HISTORY_UNREADABLE))
      assert.match(out, /기록 없음.{0,4}으로 보지 않습니다/)
      // 기록을 지우지 않았다
      assert.ok(existsSync(join(stateDir, 'run-old0000.json')), '과거 기록이 사라졌습니다')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('Y9 CLI — 폴더 상태를 못 보면 exit26 (목록까지 가지 않는다)', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: null, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const listed: string[] = []
      const { deps } = liveEnvDeps(dir, {
        fs: realFs({
          statDir: (p) => (p.endsWith(RUN_STATE_DIR) ? 'unknown' : 'dir'),
          listDir: (p) => { listed.push(p); return [] },
        }),
      })
      assert.equal(await run(deps), EXIT.historyUnreadable)
      assert.deepEqual(listed, [], '상태를 모르는데 목록을 읽었습니다')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('Y10 CLI — 정상으로 읽힌 과거 기록은 그대로 exit14 로 막는다 (035 보존)', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: null, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      const stateDir = join(dir, RUN_STATE_DIR)
      mkdirSync(stateDir, { recursive: true })
      writeFileSync(join(stateDir, 'run-old0000.json'),
        JSON.stringify({ approvalKey: 'old0000', status: 'in_progress', reservedUsd: 0.385 }))
      const { deps, urls, lines } = liveEnvDeps(dir)
      assert.equal(await run(deps), EXIT.lockHeld)
      assert.equal(urls.length, 0)
      assert.match(lines.join(NL), /다른 승인키/)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('Y11 CLI — 폴더가 없으면(ENOENT) 막지 않는다. 확인 불가와 구분된다', async () => {
  await withCleanEnv(async () => {
    const dir = makeWorkdir({
      sharedOpenAi: null, isolated: `${OPENAI_KEY_NAME}=${ISOLATED_MARK}${NL}`,
    })
    try {
      assert.ok(!existsSync(join(dir, RUN_STATE_DIR)))
      const { deps } = liveEnvDeps(dir)
      const code = await run(deps)
      assert.notEqual(code, EXIT.historyUnreadable, 'ENOENT 를 확인 불가로 처리했습니다')
      assert.notEqual(code, EXIT.lockHeld, '기록이 없는데 잠금으로 막았습니다')
      // 여기까지 왔으면 기록·잠금이 만들어져야 한다
      assert.ok(existsSync(join(dir, RUN_STATE_DIR, EXPERIMENT_LOCK_FILE)))
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

test('Y12 실제 fs adapter — ENOENT·권한오류·목록오류를 섞지 않는다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exec036fs-'))
  try {
    const fs = realFs()
    assert.equal(fs.statDir(join(dir, 'nope')), 'missing', 'ENOENT 가 missing 이 아닙니다')
    assert.equal(fs.statDir(dir), 'dir')
    writeFileSync(join(dir, 'f.txt'), 'x')
    assert.equal(fs.statDir(join(dir, 'f.txt')), 'not_dir')
    // 없는 폴더의 목록은 **던져야 한다.** 빈 배열이면 안 된다
    assert.throws(() => fs.listDir(join(dir, 'nope')), /ENOENT/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Y13 **실제 운영 adapter** — ENOENT 와 그 밖의 오류를 섞지 않는다', () => {
  // 시험 안의 복제품이 아니라 CLI 가 실제로 쓰는 통로를 부른다.
  // (035 판은 이 통로가 오류를 `[]` 로 덮어 사건이 났다)
  const fs = nodeSmokeFs()
  const dir = mkdtempSync(join(tmpdir(), 'exec036prod-'))
  try {
    assert.equal(fs.statDir(join(dir, 'nope')), 'missing', 'ENOENT 가 missing 이 아닙니다')
    assert.equal(fs.statDir(dir), 'dir')
    writeFileSync(join(dir, 'f.txt'), 'x')
    assert.equal(fs.statDir(join(dir, 'f.txt')), 'not_dir')

    // ENOENT 가 **아닌** 오류. 널 문자가 든 경로는 ERR_INVALID_ARG_VALUE 로 던진다.
    // 이것을 `missing` 으로 바꾸면 "확인 못 함" 이 "기록 없음" 이 된다
    const bad = 'a' + String.fromCharCode(0) + 'b'
    assert.equal(fs.statDir(bad), 'unknown', 'ENOENT 가 아닌 오류를 missing 으로 바꿨습니다')

    // 목록은 **던져야 한다.** 빈 배열이면 "기록 없음" 이 돼 버린다
    assert.throws(() => fs.listDir(join(dir, 'nope')), /ENOENT/,
      '없는 폴더의 목록이 조용히 빈 배열로 돌아옵니다')
    assert.throws(() => fs.listDir(bad))
    // 정상 폴더는 그대로 읽힌다
    assert.deepEqual(fs.listDir(dir), ['f.txt'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('Y14 소스 — 예외를 `[]`/`false` 로 덮는 자리가 없다', () => {
  const src = readFileSync(join(ROOT, 'scripts/run-twin-smoke-032.ts'), 'utf8')
  const body = src.replace(/^\s*(\*|\/\/).*$/gm, '')   // 주석 제외
  assert.ok(!/catch\s*\{\s*return\s*\[\]\s*\}/.test(body),
    '예외를 빈 배열로 덮는 자리가 남아 있습니다')
  assert.ok(!/listDir:\s*\(p\)\s*=>\s*\{\s*try/.test(body),
    '실제 adapter 가 아직 listDir 오류를 삼킵니다')
  assert.match(body, /statDir/)
  assert.match(body, new RegExp(CODE_HISTORY_UNREADABLE))
  // 확인 불가 분기가 **잠금·기록 생성보다 앞**이어야 한다
  const unreadableAt = src.indexOf('EXIT.historyUnreadable')
  const mkdirAt = src.indexOf('deps.fs.mkdirp(stateDir)')
  assert.ok(unreadableAt > 0 && mkdirAt > 0 && unreadableAt < mkdirAt,
    '확인 불가 분기가 폴더·잠금 생성 뒤에 있습니다')
})

test('Y15 기록 경로·상수는 그대로다 (범위를 넓히지 않았다)', () => {
  assert.equal(RUN_STATE_DIR, '.twin-smoke')
  assert.ok(runRecordPath('/syn', 'abcd').endsWith(join('.twin-smoke', 'run-abcd.json')))
  assert.equal(SMOKE_CANDIDATE_COUNT, 2)
  assert.equal(EXIT.historyUnreadable, 26)
})
