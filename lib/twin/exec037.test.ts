/**
 * GPT-EXEC-037 유한 대조 — **시험 수행 절차**만 본다 (P036-01).
 *
 * 036 에서 저는 옛 035 판 CLI 를 임시 폴더에서 **가드 없이** 돌렸고 운영 Supabase
 * 호스트로 요청 1건이 나갔습니다. 설정·이력 로직은 통과했지만 **절차**가 뚫려 있었습니다.
 *
 * 이 파일이 확인하는 것 (037 §53~§59 의 완료 기준)
 *   - 가드가 걸리지 않으면 **앱·SDK import 전에** 비정상 종료하는가
 *   - 보호된 정상 경로가 그대로 도는가
 *   - **실제 자식 프로세스**에서 가드가 살아 있는가 (임시 경로 포함)
 *   - 의도적 주입 누락이 **전송 전에** 막히는가 (정상 경로와 따로 집계)
 *
 * 하지 않는 것
 *   - 실제 외부 연결을 보내지 않습니다. `.invalid` 호스트와 가드만 씁니다 (§48).
 *   - `test/netguard.cjs` 를 고치지 않습니다 (§43). 새 방화벽을 만들지 않습니다.
 *   - 운영 실행기를 영구히 막지 않습니다 (§61).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const ROOT = resolve(__dirname, '..', '..')
const NL = String.fromCharCode(10)

/* eslint-disable @typescript-eslint/no-require-imports --
 * bootstrap 과 wrapper 는 **일부러 CommonJS** 다. 그 모양 그대로 불러 본다.
 */
const bootstrap = require(join(ROOT, 'test', 'bootstrap.cjs')) as {
  EXIT_GUARD_MISSING: number
  BOOTSTRAP_ENV: string
  wrapTargets(): Array<[string, () => unknown]>
  installAndVerify(): { ok: boolean; reason: string; notWrapped: string[] }
  verified: { ok: boolean; reason: string; notWrapped: string[] }
}
const wrapper = require(join(ROOT, 'scripts', 'run-guarded.cjs')) as {
  BOOTSTRAP: string
  GUARD: string
  EXIT: { launcherBlocked: number; badArgs: number }
  USAGE: string[]
  guardedEnv(env: Record<string, string | undefined>): Record<string, string | undefined>
  parseArgs(argv: string[]): {
    cwd: string | null; target: string | null; rest: string[]; help: boolean; error?: string
  }
}
/* eslint-enable @typescript-eslint/no-require-imports */

type Guard = {
  snapshot(): {
    active: boolean; attempts: number; blocked: number
    localAllowed: number; measurementScope: string; targets: string[]
  }
  reset(): void
}
const guard = (globalThis as unknown as { __NETGUARD__?: Guard }).__NETGUARD__

function sha(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex')
}

/** 임시 폴더에 작은 자식 스크립트를 두고 돌린다 */
function runChild(args: {
  body: string
  guarded: boolean
  /** 임시 폴더에서 돌릴지 */
  inTemp: boolean
}): { status: number | null; out: string } {
  const dir = mkdtempSync(join(tmpdir(), 'exec037-'))
  try {
    const file = join(dir, 'child.cjs')
    writeFileSync(file, args.body)
    const env: Record<string, string | undefined> = { ...process.env }
    // 부모가 물려준 가드 설정을 일단 지운다. 이 시험이 직접 정한다
    delete env.NODE_OPTIONS
    delete env[bootstrap.BOOTSTRAP_ENV]
    const finalEnv = args.guarded ? wrapper.guardedEnv(env) : env
    const r = spawnSync(process.execPath, [file], {
      cwd: args.inTemp ? dir : ROOT, env: finalEnv as NodeJS.ProcessEnv, encoding: 'utf8',
    })
    return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ════════════════════════════════════════════════════════════════════
// Z. 시험 수행 절차 (P036-01)
// ════════════════════════════════════════════════════════════════════

test('Z1 이 시험 프로세스는 bootstrap 을 거쳐 왔다', () => {
  assert.notEqual(guard, undefined, '가드가 없습니다 — bootstrap 을 거치지 않았습니다')
  assert.equal(guard!.snapshot().active, true)
  assert.equal(process.env[bootstrap.BOOTSTRAP_ENV], '1', 'bootstrap 표식이 없습니다')
  assert.equal(bootstrap.verified.ok, true, bootstrap.verified.reason)
})

test('Z2 bootstrap 은 **감싸지지 않은 자리**를 찾아낸다', () => {
  // 이미 적재된 상태에서 다시 부르면 `already_installed` 로 통과한다
  const again = bootstrap.installAndVerify()
  assert.equal(again.ok, true)
  assert.equal(again.reason, 'already_installed')

  // 확인 대상 목록이 netguard 가 감싸는 자리와 같은지 — 이름으로 대조한다
  const names = bootstrap.wrapTargets().map(([n]) => n)
  const guardSrc = readFileSync(join(ROOT, 'test', 'netguard.cjs'), 'utf8')
  for (const n of names) {
    const needle = n.replace('net.Socket.prototype.connect', 'net.Socket.prototype.connect')
    assert.ok(guardSrc.includes(needle.split('.').slice(-2).join('.')) || guardSrc.includes(needle),
      `netguard 가 감싸지 않는 자리를 확인 목록에 넣었습니다: ${n}`)
  }
  assert.equal(names.length, 9)
  assert.ok(names.includes('fetch'))
  assert.ok(names.includes('https.request'))
})

test('Z3 wrapper 는 차단 장치가 없으면 **아무것도 띄우지 않는다**', () => {
  assert.ok(existsSync(wrapper.BOOTSTRAP))
  assert.ok(existsSync(wrapper.GUARD))
  const src = readFileSync(join(ROOT, 'scripts', 'run-guarded.cjs'), 'utf8')
  assert.match(src, /!isFile\(BOOTSTRAP\) \|\| !isFile\(GUARD\)/)
  assert.match(src, /차단 없이 아무것도 띄우지 않습니다/)
  // 공백 경로 거부도 그대로 있다 (034 에서 겪은 것)
  assert.match(src, /BOOTSTRAP\.includes\(' '\)/)
})

test('Z4 wrapper 의 인자 해석 — --cwd · --help · 대상 뒤 인자', () => {
  assert.deepEqual(wrapper.parseArgs(['--help']).help, true)
  const a = wrapper.parseArgs(['--cwd', '/syn/dir', 'x.ts', '--flag', 'v'])
  assert.equal(a.cwd, '/syn/dir')
  assert.equal(a.target, 'x.ts')
  assert.deepEqual(a.rest, ['--flag', 'v'])
  const b = wrapper.parseArgs(['--cwd'])
  assert.ok(String(b.error).length > 0, '--cwd 뒤가 비어도 통과했습니다')
  const c = wrapper.parseArgs([])
  assert.equal(c.target, null)
})

test('Z5 wrapper 는 기존 NODE_OPTIONS 를 지우지 않고 bootstrap 을 **더한다**', () => {
  const none = wrapper.guardedEnv({ NODE_OPTIONS: undefined })
  assert.match(String(none.NODE_OPTIONS), /--require .*bootstrap\.cjs$/)
  const some = wrapper.guardedEnv({ NODE_OPTIONS: '--max-old-space-size=512' })
  assert.match(String(some.NODE_OPTIONS), /^--max-old-space-size=512 --require /)
  // 따옴표를 넣지 않는다 — 넣으면 Node 가 모듈을 못 찾는다 (034 에서 겪었다)
  assert.ok(!String(none.NODE_OPTIONS).includes('"'))
  // 역슬래시를 슬래시로 바꾼다
  assert.ok(!String(none.NODE_OPTIONS).includes('\\'))
})

test('Z6 **실제 자식 프로세스**에서 가드가 살아 있다', () => {
  const body = [
    "'use strict'",
    "const g = globalThis.__NETGUARD__",
    "console.log('guard=' + (g === undefined ? 'none' : String(g.snapshot().active)))",
    `console.log('mark=' + String(process.env['${bootstrap.BOOTSTRAP_ENV}']))`,
  ].join(NL)
  const r = runChild({ body, guarded: true, inTemp: false })
  assert.equal(r.status, 0, r.out)
  assert.match(r.out, /guard=true/)
  assert.match(r.out, /mark=1/)
})

test('Z7 가드가 없으면 **앱·SDK import 전에** 종료코드 97 로 끝낸다', () => {
  // 자식이 가드 없이 돌면 guardRequired 가 import 단계에서 끝낸다.
  // 그 자리에서 openaiSend·SDK 는 적재되지 않는다
  const r = spawnSync(
    process.execPath,
    [join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs'), join(ROOT, 'test', 'probes', 'negative034.ts')],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '' } },
  )
  assert.equal(r.status, bootstrap.EXIT_GUARD_MISSING, `${r.status}: ${r.stdout}${r.stderr}`)
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  assert.match(out, /외부 전송 차단이 걸리지 않았습니다/)
  assert.match(out, /guard_not_registered/)
  assert.match(out, /앱·SDK 를 적재하기 전에 멈췄습니다/)
  // 말이 아니라 **수**로 확인한다 — 멈춘 시점에 앱·SDK 가 0개여야 한다
  assert.match(out, /적재된 앱·SDK 모듈 = 0개/,
    '멈추기 전에 앱이나 SDK 가 이미 적재됐습니다 (첫 import 가 아닙니다)')
  // 탐침 본문은 한 줄도 돌지 않았다
  assert.ok(!out.includes('차단 장치 = 적재됨'), '탐침 본문이 돌았습니다')
  assert.ok(!out.includes('음성(주입누락)'), '탐침이 전송 단계까지 갔습니다')
})

test('Z8 탐침의 **첫 import** 가 guardRequired 다', () => {
  for (const f of ['test/probes/negative034.ts', 'test/probes/sdkContract034.ts']) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    const imports = [...src.matchAll(/^import\s.*$/gm)].map((m) => m[0])
    assert.ok(imports.length > 1, `${f}: import 가 하나뿐입니다`)
    assert.match(imports[0], /guardRequired/, `${f}: 첫 import 가 guardRequired 가 아닙니다`)
  }
  // guardRequired 자체는 SDK·앱을 적재하지 않는다
  const gr = readFileSync(join(ROOT, 'test', 'guardRequired.ts'), 'utf8')
  assert.ok(!/from '.*openaiSend'/.test(gr), 'guardRequired 가 앱을 적재합니다')
  assert.ok(!/from 'openai/.test(gr), 'guardRequired 가 SDK 를 적재합니다')
  assert.match(gr, /process\.exit\(EXIT_GUARD_MISSING\)/)
})

test('Z9 `test:twin` 과 wrapper 가 **같은 bootstrap** 을 올린다', () => {
  const runner = readFileSync(join(ROOT, 'scripts', 'run-twin-tests.cjs'), 'utf8')
  assert.match(runner, /test', 'bootstrap\.cjs'/)
  assert.match(runner, /--require \$\{BOOTSTRAP/)
  // netguard 를 직접 올리던 자리는 남아 있지 않다
  assert.ok(!/--require \$\{GUARD/.test(runner), 'netguard 를 직접 올리는 자리가 남아 있습니다')
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>
  }
  assert.match(pkg.scripts['test:twin'], /run-twin-tests\.cjs/)
})

test('Z10 **실제 Supabase 클라이언트**의 요청이 가드에 막힌다 (전송 0건)', async () => {
  // 036 의 사고 경로와 같은 모양이다. 다만 호스트는 **절대 존재할 수 없는** `.invalid` 다.
  // 운영 주소로 다시 보내지 않는다 (037 §49)
  const { createClient } = await import('@supabase/supabase-js')
  guard!.reset()
  const db = createClient('https://syn-not-real.invalid', 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN', {
    auth: { persistSession: false },
  })
  let threw = false
  try {
    await db.from('problems').select('id').eq('id', 1).maybeSingle()
  } catch {
    threw = true
  }
  const s = guard!.snapshot()
  // supabase-js 는 스스로 재시도하므로 시도 수가 1보다 클 수 있다. **중요한 것은 통과 0** 이다
  assert.ok(s.attempts >= 1, `시도가 0입니다 — 가드를 지나지 않았습니다 (threw=${threw})`)
  assert.equal(s.blocked, s.attempts, '막히지 않은 시도가 있습니다')
  assert.ok(s.targets.every((t) => t.includes('.invalid')), s.targets.join(','))
  guard!.reset()
})

test('Z11 **임시 폴더**의 자식도 보호된 경로로 시작한다', () => {
  const body = [
    "'use strict'",
    "const g = globalThis.__NETGUARD__",
    "if (g === undefined) { console.log('guard=none'); process.exit(3) }",
    "console.log('guard=' + String(g.snapshot().active))",
    "const https = require('node:https')",
    "try { https.request('https://syn-not-real.invalid/x'); console.log('통과=나갔다') }",
    "catch (e) { console.log('차단=' + String(e && e.code)) }",
    "const s = g.snapshot()",
    "console.log('시도=' + s.attempts + ' 차단=' + s.blocked)",
  ].join(NL)
  const r = runChild({ body, guarded: true, inTemp: true })
  assert.equal(r.status, 0, r.out)
  assert.match(r.out, /guard=true/)
  assert.match(r.out, /차단=OUTBOUND_BLOCKED/)
  assert.match(r.out, /시도=1 차단=1/)
  assert.ok(!r.out.includes('통과=나갔다'), '임시 폴더에서 요청이 나갔습니다')
})

test('Z12 가드 수치 보고는 **선택**이고 측정 경계를 함께 적는다', () => {
  const body = [
    "'use strict'",
    "console.log('done')",
  ].join(NL)
  const off = runChild({ body, guarded: true, inTemp: false })
  assert.ok(!off.out.includes('가드 수치'), '요청하지 않았는데 수치를 찍었습니다')

  const dir = mkdtempSync(join(tmpdir(), 'exec037r-'))
  try {
    const file = join(dir, 'child.cjs')
    writeFileSync(file, body)
    const env: Record<string, string | undefined> = { ...process.env }
    delete env.NODE_OPTIONS
    const r = spawnSync(process.execPath, [file], {
      cwd: ROOT, encoding: 'utf8',
      env: { ...wrapper.guardedEnv(env), __TWIN_GUARD_REPORT__: '1' } as unknown as NodeJS.ProcessEnv,
    })
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
    assert.match(out, /가드 수치 — 시도=0 차단=0/)
    assert.match(out, /패킷 실측이 아니다/, '측정 경계를 적지 않았습니다')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('Z13 `test/netguard.cjs` 는 **바뀌지 않았다** (037 §43·§145)', () => {
  assert.equal(
    sha(join(ROOT, 'test', 'netguard.cjs')),
    'b4b1d991f14eadb239e383abb861e6a29107befa3ab3da8f4d0782709845f1ef',
    'netguard 가 바뀌었습니다 — 037 은 그대로 쓰라고 했습니다',
  )
})

test('Z14 운영 실행기를 **영구히 막지 않았다** (037 §61)', () => {
  // 스모크·조회 CLI 는 guardRequired 를 import 하지 않는다.
  // 승인된 실제 실행은 이 wrapper 없이 돌아야 한다
  for (const f of ['scripts/run-twin-smoke-032.ts', 'scripts/check-model-access-033.ts']) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    assert.ok(!/guardRequired/.test(src), `${f}: 운영 실행기가 시험 가드를 요구합니다`)
    assert.ok(!/__NETGUARD__/.test(src), `${f}: 운영 실행기가 시험 가드를 봅니다`)
  }
  // 반대로 wrapper 는 그 둘을 **띄울 수 있어야** 한다 (보호된 재현용)
  const w = readFileSync(join(ROOT, 'scripts', 'run-guarded.cjs'), 'utf8')
  assert.match(w, /needsTsx \? \[TSX_CLI, target/)
})
