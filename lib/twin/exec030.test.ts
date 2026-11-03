// GPT-EXEC-030 — 실행 명령·설정 공급·작업 위치 (§83)
//
// 실행: npm run test:twin
//
// 무엇을 시험하는가
//   029 는 **함수 대역**으로만 「무접속」을 확인했다. 그런데 런북이 안내한
//   `npx tsx ...` 는 로컬에 tsx 가 없으면 **스크립트가 시작되기 전에** 패키지를 조회한다
//   (R029-01). 그리고 독립 프로세스의 `process.env` 에 `.env.local` 이 자동으로
//   들어오지 않는다 (R029-02a).
//
//   그래서 여기서는 **최상위 명령**과 **설정 공급 경로**를 시험한다.
//
// ⚠ 실제 키를 쓰지 않는다. 합성 환경파일·가짜 값·전송 대역만 쓴다 (§97).
//   운영 Storage 응답 형태를 확인한 것이 아니다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, statSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

import {
  run, EXIT, EXECUTE_FLAG, HELP_FLAGS, PILOT_TYPE_CODE, PILOT_GRADE,
  EXPECTED_PROJECT_REF, EXPECTED_ORIGIN, resolveEnvFilePath,
  type Deps, type PickedSource,
} from '../../scripts/check-storage-sample-029'

const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const LAUNCHER = 'scripts/run-storage-sample.cjs'
const ENTRY = 'scripts/check-storage-sample-029.ts'
const PATH = 'syn/공수1/0001.png'

// ════════════════════════════════════════════════════════════════════
// R029-01 — 최상위 명령에서 npx 를 쓰지 않는다
// ════════════════════════════════════════════════════════════════════

test('실행기는 저장소에 설치된 tsx 만 쓴다 — npx·설치 경로가 없다', () => {
  const s = read(LAUNCHER)
  // 실행문만 본다 — 머리말이 **왜 npx 를 쓰지 않는지** 설명하느라 그 낱말을 쓴다.
  // 원문 전체에 걸면 내 설명에 내 검사가 걸린다 (이 세션에서 여러 번 겪었다)
  const exec = s.split(NL).filter(l => !l.trimStart().startsWith('//')).join(NL)
  for (const bad of ['npx', 'npm exec', 'npm install', 'npm i ', 'yarn', 'pnpm',
                     'registry.npmjs', 'https://', 'http://']) {
    assert.ok(!exec.includes(bad), `실행기 실행문에 ${bad} 가 있습니다`)
  }
  // 머리말에는 왜 npx 를 피하는지 적혀 있어야 한다
  assert.match(s, /npx/)
  // 로컬 tsx 하나만 본다
  assert.match(exec, /node_modules', 'tsx', 'dist', 'cli\.mjs'/)
  // 전역·다른 폴더 fallback 이 없다
  assert.ok(!/process\.env\.PATH/.test(exec))
  // Node 기본 모듈만 쓴다
  const reqs = [...exec.matchAll(/require\('([^']+)'\)/g)].map(m => m[1]).sort()
  assert.deepEqual(reqs, ['node:child_process', 'node:fs', 'node:path'])
})

test('안내·도움말의 명령이 실행기와 같다 (§50)', () => {
  const entry = read(ENTRY)
  const runbook = read('STORAGE_SAMPLE_RUNBOOK_030.md')
  const cmdPlan = 'node scripts/run-storage-sample.cjs --plan'
  const cmdExec = `node scripts/run-storage-sample.cjs ${EXECUTE_FLAG}`
  // 런북은 완성된 문자열을 쓴다
  assert.ok(runbook.includes(cmdPlan), '런북 에 계획 명령이 없습니다')
  assert.ok(runbook.includes(cmdExec), '런북 에 실행 명령이 없습니다')
  // 도움말은 템플릿으로 만든다 (`${EXECUTE_FLAG}`). 소스에는 그 형태로 들어 있다
  assert.ok(entry.includes(cmdPlan), '도움말 에 계획 명령이 없습니다')
  assert.match(entry, /node scripts\/run-storage-sample\.cjs \$\{EXECUTE_FLAG\}/)
  // 둘 다 **안내하는 명령으로는** npx 를 쓰지 않는다.
  //
  // 진입점 머리말은 「npx tsx 는 왜 안 되는지」를 설명하느라 그 낱말을 쓴다. 그래서
  // 주석을 걷어낸 뒤 본다 — 원문 전체에 걸면 내 설명에 내 검사가 걸린다.
  const entryExec = entry.split(NL).filter(l => !l.trimStart().startsWith('//')).join(NL)
  assert.ok(!/npx\s+tsx/.test(entryExec), '도움말이 아직 npx 를 안내합니다')
  // 런북은 029 가 무엇을 틀렸는지 표로 적으므로 명령 블록만 본다
  const runbookCmds = [...runbook.matchAll(/^```bash\n([\s\S]*?)```/gm)].map(m => m[1]).join(NL)
  assert.ok(runbookCmds.trim() !== '', '런북에 명령 블록이 없습니다')
  assert.ok(!/npx\s+tsx/.test(runbookCmds), '런북 명령이 아직 npx 입니다')
  assert.ok(runbookCmds.includes(cmdPlan) && runbookCmds.includes(cmdExec),
    '런북 명령 블록에 두 명령이 없습니다')
  // 실제 도움말 출력에도 두 명령이 나온다 (최상위 실행으로 확인한다)
  const shown = runTop(['--help']).out
  assert.ok(shown.includes(cmdPlan) && shown.includes(cmdExec),
    '실제 도움말 출력에 명령이 없습니다')
})

/** 실행기를 격리 폴더에 복사해 로컬 tsx 가 없는 상태를 만든다 */
function isolatedLauncher(): { dir: string; launcher: string } {
  const dir = mkdtempSync(join(tmpdir(), 'twin-launch-'))
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'scripts', 'run-storage-sample.cjs'), read(LAUNCHER))
  // 진입점도 둔다 — tsx 가 없다는 이유로 멈추는지 보려는 것이므로
  writeFileSync(join(dir, 'scripts', 'check-storage-sample-029.ts'), read(ENTRY))
  return { dir, launcher: join(dir, 'scripts', 'run-storage-sample.cjs') }
}

test('로컬 실행기가 없으면 최상위 명령이 네트워크·설정 전에 멈춘다 (R029-01)', () => {
  const { dir, launcher } = isolatedLauncher()
  try {
    assert.ok(!existsSync(join(dir, 'node_modules')), 'node_modules 가 없어야 합니다')
    const r = spawnSync(process.execPath, [launcher, '--plan'], { encoding: 'utf8' })
    assert.notEqual(r.status, 0, '비0 종료코드여야 합니다')
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    assert.match(out, /중단/)
    assert.match(out, /tsx/)
    assert.match(out, /자동으로 내려받지 않습니다/)
    assert.match(out, /네트워크·설정파일·키를 건드리지 않았습니다/)
    // 설치하려 들지 않는다
    assert.ok(!/npm (WARN|notice|install)/i.test(out), 'npm 이 끼어들었습니다')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('진입점 파일이 없으면 다른 파일로 대체하지 않고 멈춘다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'twin-launch2-'))
  try {
    mkdirSync(join(dir, 'scripts'), { recursive: true })
    mkdirSync(join(dir, 'node_modules', 'tsx', 'dist'), { recursive: true })
    writeFileSync(join(dir, 'node_modules', 'tsx', 'dist', 'cli.mjs'), '// syn')
    writeFileSync(join(dir, 'scripts', 'run-storage-sample.cjs'), read(LAUNCHER))
    const r = spawnSync(process.execPath, [join(dir, 'scripts', 'run-storage-sample.cjs'), '--plan'],
      { encoding: 'utf8' })
    assert.notEqual(r.status, 0)
    assert.match((r.stdout ?? '') + (r.stderr ?? ''), /진입점을 찾지 못했습니다/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('이 저장소에는 로컬 tsx 와 진입점이 실제로 있다 (§54)', () => {
  // 실행기가 보는 바로 그 경로를 같은 방식으로 계산해 **실물이 있는지** 본다.
  // (실행기는 CJS 라 import 로 가져오지 않고, 경로 계산만 같이 맞춘다)
  const tsxCli = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  assert.ok(existsSync(tsxCli) && statSync(tsxCli).isFile(), '로컬 tsx 가 없습니다')
  assert.ok(existsSync(join(ROOT, ENTRY)), '진입점이 없습니다')
  // 실행기 소스가 그 경로를 쓰는지도 확인한다
  const s = read(LAUNCHER)
  assert.match(s, /resolve\(__dirname, '\.\.'\)/)
  assert.match(s, /join\(REPO, 'node_modules', 'tsx', 'dist', 'cli\.mjs'\)/)
  assert.match(s, /join\(REPO, 'scripts', 'check-storage-sample-029\.ts'\)/)
})

// ════════════════════════════════════════════════════════════════════
// 최상위 명령의 세 모드 — 무접속·설정 미열람 (§90·§91)
// ════════════════════════════════════════════════════════════════════

/**
 * 실제 최상위 명령을 돌린다.
 *
 * 환경에서 두 변수를 **지우고** 돌린다. 계획·도움말 모드가 설정파일을 읽지 않는지
 * 보려는 것이므로, 셸에 값이 남아 있으면 시험이 무의미해진다.
 */
function runTop(args: string[]) {
  const env = { ...process.env }
  delete env.NEXT_PUBLIC_SUPABASE_URL
  delete env.SUPABASE_SERVICE_ROLE_KEY
  const r = spawnSync(process.execPath, [join(ROOT, LAUNCHER), ...args],
    { encoding: 'utf8', env, cwd: ROOT })
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

for (const args of [[], ['--help'], ['--plan']]) {
  test(`최상위 ${JSON.stringify(args)} → 종료코드 0 · 표본 미실행 표시 · 설정 미열람`, () => {
    const { status, out } = runTop(args)
    assert.equal(status, 0, out)
    assert.match(out, /미실행/)
    assert.match(out, /설정파일·키·네트워크를 건드리지 않았습니다/)
    assert.match(out, /표본 성공이 아닙니다/)
    assert.match(out, /미승인/)
    // 설정을 읽었다는 표시가 없다
    assert.ok(!/설정: /.test(out), '계획 모드에서 설정을 읽었습니다')
    assert.ok(!/대상 확인/.test(out), '계획 모드에서 대상 확인을 했습니다')
  })
}

test('도움말·계획과 실행 플래그가 섞이면 실행하지 않는다 (§91)', () => {
  for (const args of [['--plan', EXECUTE_FLAG], [EXECUTE_FLAG, '--help']]) {
    const { status, out } = runTop(args)
    assert.equal(status, 0, out)
    assert.match(out, /실행하지 않고/)
    assert.match(out, /미실행/)
    assert.ok(!/대상 확인/.test(out), '실행으로 넘어갔습니다')
  }
})

test('알아볼 수 없는 인자는 실행하지 않고 인자 오류로 끝낸다', () => {
  const { status, out } = runTop(['--whatever'])
  assert.equal(status, EXIT.badArgs)
  assert.match(out, /알아볼 수 없는 인자/)
  assert.ok(!/대상 확인/.test(out))
})

// ════════════════════════════════════════════════════════════════════
// R029-02a — 설정 공급 경로 (§92)
// ════════════════════════════════════════════════════════════════════

/** 합성 파일 시스템. 실제 디스크를 건드리지 않는다 */
function synFs(files: Record<string, string>, dirs: string[] = []) {
  const seen: string[] = []
  return {
    seen,
    info: {
      isDir: (p: string) => { seen.push('isDir:' + p); return dirs.includes(p) },
      isFile: (p: string) => { seen.push('isFile:' + p); return p in files },
      read: (p: string) => { seen.push('read:' + p); return files[p] ?? '' },
    },
  }
}

test('환경파일 경로는 메인 루트 한 곳으로 정해진다 — 작업트리에서도 (§64)', () => {
  // 메인 루트: `.git` 이 디렉터리
  const a = synFs({}, ['/repo/.git'])
  assert.equal(resolveEnvFilePath('/repo', a.info), '/repo/.env.local')

  // 작업트리: `.git` 이 파일이고 gitdir 이 `<메인>/.git/worktrees/<이름>`
  const b = synFs({ '/repo/.claude/worktrees/wt/.git': 'gitdir: /repo/.git/worktrees/wt' })
  assert.equal(resolveEnvFilePath('/repo/.claude/worktrees/wt', b.info), '/repo/.env.local')

  // Windows 경로도 같은 결과
  const c = synFs({ 'C:/r/.claude/worktrees/wt/.git': 'gitdir: C:/r/.git/worktrees/wt' })
  assert.equal(resolveEnvFilePath('C:\\r\\.claude\\worktrees\\wt', c.info), 'C:/r/.env.local')

  // 알 수 없으면 null — 다른 폴더를 뒤지지 않는다
  assert.equal(resolveEnvFilePath('/nowhere', synFs({}).info), null)
  assert.equal(resolveEnvFilePath('/x', synFs({ '/x/.git': '쓰레기' }).info), null)
})

test('여기에 git 메타데이터가 있으면 메인 루트의 .env.local 로 정해진다', () => {
  const info = {
    isDir: (q: string) => { try { return statSync(q).isDirectory() } catch { return false } },
    isFile: (q: string) => { try { return statSync(q).isFile() } catch { return false } },
    read: (q: string) => readFileSync(q, 'utf8'),
  }
  const hasGit = info.isDir(join(ROOT, '.git')) || info.isFile(join(ROOT, '.git'))
  // **조용히 건너뛰지 않는다** — 어느 쪽을 봤는지 로그에 남긴다
  console.log(`#   git 메타데이터 ${hasGit ? '있음' : '없음'} (${ROOT})`)
  if (!hasGit) {
    // 최종 묶음 해제본에는 `.git` 이 없다. 그래서 null 이 **정답**이다 —
    // 다른 폴더를 뒤지지 않는다는 뜻이기도 하다
    assert.equal(resolveEnvFilePath(ROOT, info), null,
      'git 메타데이터가 없는데 경로를 만들어냈습니다')
    return
  }
  const got = resolveEnvFilePath(ROOT, info)
  assert.ok(got !== null, '경로를 정하지 못했습니다')
  assert.match(got as string, /\/\.env\.local$/)
  // 작업트리에서 돌리면 메인 루트를 가리켜야 한다 (작업트리 자신이 아니다)
  if (ROOT.split('\\').join('/').includes('/worktrees/')) {
    assert.ok(!(got as string).includes('/worktrees/'), '작업트리 안을 가리킵니다')
  }
})

/** 설정 로더까지 합성으로 끼운 의존성 */
function loaderDeps(opts: {
  envFileExists: boolean
  fileValues?: Record<string, string>
  gitdirOk?: boolean
  loadThrows?: boolean
}, log: string[]): Deps & { calls: { client: number; pick: number; sample: number; load: number } } {
  const calls = { client: 0, pick: 0, sample: 0, load: 0 }
  const main = '/repo'
  const envPath = main + '/.env.local'
  const files: Record<string, string> = {}
  if (opts.gitdirOk !== false) files['/repo/.claude/worktrees/wt/.git'] = 'gitdir: /repo/.git/worktrees/wt'
  if (opts.envFileExists) files[envPath] = '(내용은 로더가 읽는다)'
  const fs = synFs(files)
  return {
    calls,
    cwd: () => '/repo/.claude/worktrees/wt',
    pathInfo: fs.info,
    loadEnvFile: () => {
      calls.load++
      if (opts.loadThrows) throw new Error('syn load fail')
      // Node 로더처럼 `process.env` 에 올린다 (셸 값은 덮지 않는다)
      for (const [k, v] of Object.entries(opts.fileValues ?? {})) {
        if ((process.env[k] ?? '') === '') process.env[k] = v
      }
    },
    makeClient: () => { calls.client++; return { syn: true } },
    pickSources: async () => {
      calls.pick++
      return [{ id: 7, type_code: PILOT_TYPE_CODE, grade: PILOT_GRADE, image_path: PATH }] as PickedSource[]
    },
    checkSample: async () => {
      calls.sample++
      return {
        ok: true, code: null, detail: null, bucket: 'problem-images',
        path: { dirDepth: 2, ext: 'png', nameHash8: 'deadbeef' },
        calls: { list: 1, download: 1 },
        meta: {
          singleObservation: true, listedEntries: 1,
          updatedAtPresent: true, updatedAtParsesAsDate: true,
          etagKey: 'eTag', etagLength: 32, metadataKeys: ['eTag'],
          acceptedByProductionPath: true,
        },
        image: { mime: 'image/png', read: true, bytes: 1234 },
      }
    },
    log: l => log.push(l),
  }
}

/** `process.env` 를 더럽히지 않게 되돌려 준다 */
function withCleanEnv<T>(fn: () => T): T {
  const a = process.env.NEXT_PUBLIC_SUPABASE_URL
  const b = process.env.SUPABASE_SERVICE_ROLE_KEY
  delete process.env.NEXT_PUBLIC_SUPABASE_URL
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
  try { return fn() } finally {
    if (a === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL
    else process.env.NEXT_PUBLIC_SUPABASE_URL = a
    if (b === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY
    else process.env.SUPABASE_SERVICE_ROLE_KEY = b
  }
}

test('셸에 두 변수가 없고 합성 환경파일만 있으면 로더가 공급한다 (§92)', async () => {
  const log: string[] = []
  const d = loaderDeps({
    envFileExists: true,
    fileValues: { NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  }, log)
  const code = await withCleanEnv(() => run([EXECUTE_FLAG], {}, d))
  assert.equal(code, EXIT.ok, log.join(NL))
  assert.equal(d.calls.load, 1, '설정파일을 한 번 읽어야 합니다')
  assert.deepEqual({ c: d.calls.client, p: d.calls.pick, s: d.calls.sample }, { c: 1, p: 1, s: 1 })
  const text = log.join(NL)
  assert.match(text, /메인 루트의 \.env\.local 에서 채웠습니다/)
  assert.match(text, /값은 출력하지 않습니다/)
  // 누락으로 잘못 중단하지 않았다
  assert.ok(!/없습니다/.test(text.split('대상 확인')[0] ?? ''), '잘못 중단했습니다')
})

test('셸에 값이 있으면 파일을 읽지 않는다 — 셸 우선 (§65)', async () => {
  const log: string[] = []
  const d = loaderDeps({ envFileExists: true }, log)
  const code = await run([EXECUTE_FLAG], {
    NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_shell_aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }, d)
  assert.equal(code, EXIT.ok, log.join(NL))
  assert.equal(d.calls.load, 0, '셸 값이 있는데 파일을 읽었습니다')
  assert.match(log.join(NL), /셸 환경변수를 씁니다/)
})

test('정해진 설정파일이 없으면 다른 위치로 넓히지 않고 중단한다', async () => {
  const log: string[] = []
  const d = loaderDeps({ envFileExists: false }, log)
  const code = await withCleanEnv(() => run([EXECUTE_FLAG], {}, d))
  assert.equal(code, EXIT.configMissing)
  assert.equal(d.calls.load, 0)
  assert.equal(d.calls.client, 0, '클라이언트를 만들었습니다')
  assert.match(log.join(NL), /다른 위치로 넓히지 않습니다/)
})

test('메인 루트를 정하지 못하면 접속 전에 중단한다', async () => {
  const log: string[] = []
  const d = loaderDeps({ envFileExists: false, gitdirOk: false }, log)
  const code = await withCleanEnv(() => run([EXECUTE_FLAG], {}, d))
  assert.equal(code, EXIT.configMissing)
  assert.equal(d.calls.client, 0)
  assert.match(log.join(NL), /다른 폴더를 뒤지지 않습니다/)
})

test('설정파일 읽기가 실패하면 원문 오류 없이 중단한다', async () => {
  const log: string[] = []
  const d = loaderDeps({ envFileExists: true, loadThrows: true }, log)
  const code = await withCleanEnv(() => run([EXECUTE_FLAG], {}, d))
  assert.equal(code, EXIT.configMissing)
  assert.equal(d.calls.client, 0)
  const text = log.join(NL)
  assert.match(text, /원문 오류는 출력하지 않습니다/)
  assert.ok(!text.includes('syn load fail'))
})

test('파일에서 채웠어도 대상이 다르면 접속 전에 중단한다', async () => {
  const log: string[] = []
  const d = loaderDeps({
    envFileExists: true,
    fileValues: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://otherproject.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_file_aaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    },
  }, log)
  const code = await withCleanEnv(() => run([EXECUTE_FLAG], {}, d))
  assert.equal(code, EXIT.configMissing)
  assert.equal(d.calls.client, 0, '클라이언트를 만들었습니다')
  const text = log.join(NL)
  assert.match(text, /승인된 대상/)
  assert.ok(!text.includes('otherproject'), '실제 주소가 출력됐습니다')
})

// ════════════════════════════════════════════════════════════════════
// R029-02c — 대상 확인 기준 (§66)
// ════════════════════════════════════════════════════════════════════

test('프로젝트 ref 는 저장소에 이미 적힌 비밀 아닌 식별자다', () => {
  // AGENTS.md 와 어긋나면 실패한다 — 내가 만든 값이 아니어야 한다
  const agents = read('AGENTS.md')
  assert.ok(agents.includes(EXPECTED_PROJECT_REF),
    'AGENTS.md 에 없는 ref 를 쓰고 있습니다')
  assert.match(agents, new RegExp('Supabase 프로젝트.*' + EXPECTED_PROJECT_REF))
  assert.equal(EXPECTED_ORIGIN, `https://${EXPECTED_PROJECT_REF}.supabase.co`)
  // 비밀이 아니다 — 키 모양이 아니라 프로젝트 ref 다
  assert.match(EXPECTED_PROJECT_REF, /^[a-z]{20}$/)
})

test('형식만 맞는 다른 프로젝트는 통과하지 못한다 (R029-02c)', async () => {
  for (const url of ['https://synproject.supabase.co', 'https://anotherone.supabase.co',
                     'https://cggskjxsyrvuhsldgkoj.supabase.in']) {
    const log: string[] = []
    const d = loaderDeps({ envFileExists: false }, log)
    const code = await run([EXECUTE_FLAG], {
      NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }, d)
    assert.equal(code, EXIT.configMissing, url)
    assert.equal(d.calls.client, 0, `${url} 로 클라이언트를 만들었습니다`)
    assert.equal(d.calls.pick, 0, `${url} 로 선정 함수를 불렀습니다`)
  }
})

test('끝의 슬래시만 다른 주소는 같은 대상으로 본다', async () => {
  const log: string[] = []
  const d = loaderDeps({ envFileExists: false }, log)
  const code = await run([EXECUTE_FLAG], {
    NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN + '/', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }, d)
  assert.equal(code, EXIT.ok, log.join(NL))
})

// ════════════════════════════════════════════════════════════════════
// R029-02b — 작업 위치를 근거로 고정 (§52)
// ════════════════════════════════════════════════════════════════════

test('런북이 가리키는 폴더에 최종 코드가 실제로 있다', () => {
  const r = read('STORAGE_SAMPLE_RUNBOOK_030.md')
  // 런북이 적은 폴더 경로를 뽑아 그 안에 실제 파일이 있는지 본다
  const m = /작업 폴더[\s\S]{0,400}?```text\s*([^\n`]+)/.exec(r)
  assert.ok(m !== null, '런북에서 작업 폴더를 찾지 못했습니다')
  const folder = m[1].trim().split('\\').join('/')
  const here = ROOT.split('\\').join('/')

  // 029 는 메인 루트를 적었는데 거기엔 최종 코드가 없었다 (R029-02b).
  // 이 두 가지는 **어디서 돌려도** 성립해야 한다
  assert.notEqual(folder, 'C:/Users/USER/studycheck')
  assert.match(folder, /worktrees/, '최종 코드가 있는 작업트리를 적어야 합니다')
  assert.ok(r.includes('git rev-parse --show-toplevel'), '경로 근거를 적어야 합니다')

  // 파일 실재 확인은 **그 폴더에서 돌릴 때만** 할 수 있다.
  // 묶음 해제본은 다른 경로이므로, 거기서는 해제본에 파일이 들어왔는지만 본다.
  // 안내 폴더에서의 실제 확인은 LOCAL_LAUNCH_TEST_LOG_030.txt 에 따로 있다 (§107).
  // **조용히 건너뛰지 않는다** — 어디서 돌고 있는지 남긴다
  console.log(`#   실행 위치 ${here === folder ? '= 런북 폴더' : '≠ 런북 폴더 (묶음 해제본)'}`)
  const base = here === folder ? folder : here
  for (const f of [LAUNCHER, ENTRY, 'lib/twin/storageSample.ts', 'package.json']) {
    assert.ok(existsSync(join(base, f)), `${base} 에 ${f} 가 없습니다`)
  }
  if (here === folder) {
    assert.ok(existsSync(join(folder, 'node_modules', 'tsx', 'dist', 'cli.mjs')),
      '그 폴더에 로컬 tsx 가 없습니다')
  }
})

test('029 안내는 이력으로 남아도 되지만 현재 런북은 새 명령을 쓴다 (§102)', () => {
  const r = read('STORAGE_SAMPLE_RUNBOOK_030.md')
  assert.ok(r.includes('run-storage-sample.cjs'))
  assert.match(r, /STORAGE_SAMPLE_RUNBOOK_029\.md/, '무엇을 대체하는지 적어야 합니다')
  // 029 런북 자체는 지우지 않는다
  assert.ok(read('STORAGE_SAMPLE_RUNBOOK_029.md').length > 0)
})

test('진입점·실행기·표본 모듈의 해시를 기록할 수 있다 (§54)', () => {
  const sha = (p: string) => createHash('sha256')
    .update(readFileSync(join(ROOT, p))).digest('hex')
  for (const f of [LAUNCHER, ENTRY, 'lib/twin/storageSample.ts']) {
    assert.match(sha(f), /^[0-9a-f]{64}$/)
  }
  // 표본 모듈은 029 검수본 그대로다 (§109 바이트 보존)
  assert.equal(sha('lib/twin/storageSample.ts'),
    '06687bcaa0f96f9d30ca35bceec3753bf6703d7752dddc7803300fa2632fe233')
})

// ════════════════════════════════════════════════════════════════════
// 읽기 범위 보존 (§70)
// ════════════════════════════════════════════════════════════════════

test('읽기 범위가 그대로다 — 1행 · list 1회 · download 1회', async () => {
  const log: string[] = []
  const d = loaderDeps({ envFileExists: false }, log)
  const code = await run([EXECUTE_FLAG], {
    NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }, d)
  assert.equal(code, EXIT.ok, log.join(NL))
  assert.equal(d.calls.pick, 1)
  assert.equal(d.calls.sample, 1)
  const text = log.join(NL)
  assert.match(text, /list=1 download=1/)
  // 민감한 값이 없다
  assert.ok(!text.includes('sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'))
  assert.ok(!text.includes(PATH))
  assert.match(text, /유료 스모크 승인은 아닙니다/)
})

test('실행 모드 외에는 어떤 모드도 선정·Storage 를 부르지 않는다', async () => {
  for (const argv of [[], ['--help'], ['--plan'], ['--plan', EXECUTE_FLAG], ['--zzz']]) {
    const log: string[] = []
    const d = loaderDeps({ envFileExists: true }, log)
    await run(argv, {}, d)
    assert.equal(d.calls.pick, 0, JSON.stringify(argv))
    assert.equal(d.calls.sample, 0, JSON.stringify(argv))
    assert.equal(d.calls.client, 0, JSON.stringify(argv))
    assert.equal(d.calls.load, 0, JSON.stringify(argv))
  }
})

test('도움말 플래그 목록이 실제로 쓰인다', () => {
  assert.ok((HELP_FLAGS as readonly string[]).includes('--help'))
  assert.ok((HELP_FLAGS as readonly string[]).includes('--plan'))
  assert.ok(read(ENTRY).includes('HELP_FLAGS'))
})
