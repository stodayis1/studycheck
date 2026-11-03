// 보호된 실행 wrapper — **무엇을 돌리든 같은 차단 경계를 거친다** (GPT-EXEC-037 §44·§46)
//
// 왜 이 파일이 생겼나
//   036 에서 저는 옛 035 판 CLI 를 `npx tsx <파일>` 로 **직접** 띄웠습니다.
//   `npm run test:twin` 에는 차단이 걸려 있었지만 그 손 명령에는 없었고,
//   운영 Supabase 호스트로 요청 1건이 나갔습니다 (P036-01).
//
//   그래서 "설명서에 --require 를 잊지 말라고 적어 두는" 것으로 끝내지 않고 (§45),
//   **임시 폴더·옛 판·손 탐침도 이 한 곳을 거치게** 합니다.
//
// 쓰는 법
//   node scripts/run-guarded.cjs <대상.ts|.cjs|.mjs> [인자...]
//   node scripts/run-guarded.cjs --cwd <폴더> <대상> [인자...]
//
// 하는 일
//   1) `test/bootstrap.cjs` 를 `NODE_OPTIONS` 로 올린다 (자손까지 물려받는다)
//   2) bootstrap 이 차단을 확인하고, 안 걸렸으면 **앱 적재 전에** 종료코드 97 로 끝낸다
//   3) `.ts` 면 저장소에 설치된 tsx 로, 아니면 node 로 띄운다
//
// 하지 않는 일
//   - 패키지 설치·네트워크 접근 없음. 전역 도구를 쓰지 않는다.
//   - netguard 를 고치지 않는다. 새 방화벽을 만들지 않는다 (§43).
//   - 운영 실행기를 영구히 막지 않는다. 승인된 실제 실행은 이 wrapper 없이 돈다 (§61).

/* eslint-disable @typescript-eslint/no-require-imports --
 * `node` 가 바로 실행하는 파일이라 **일부러 CommonJS** 다.
 */
'use strict'

const { existsSync, statSync } = require('node:fs')
const { join, resolve, isAbsolute, extname } = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO = resolve(__dirname, '..')
const TSX_CLI = join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const BOOTSTRAP = join(REPO, 'test', 'bootstrap.cjs')
const GUARD = join(REPO, 'test', 'netguard.cjs')

const EXIT = {
  /** wrapper 자체가 띄우지 못했다 */
  launcherBlocked: 7,
  /** 인자가 잘못됐다 */
  badArgs: 2,
}

const USAGE = [
  '보호된 실행 wrapper — GPT-EXEC-037 §44',
  '',
  '  node scripts/run-guarded.cjs <대상.ts|.cjs|.mjs> [인자...]',
  '  node scripts/run-guarded.cjs --cwd <폴더> <대상> [인자...]',
  '',
  '대상을 띄우기 전에 test/bootstrap.cjs 가 외부 전송 차단을 확인합니다.',
  '차단이 걸리지 않으면 앱·SDK 를 적재하기 전에 종료코드 97 로 멈춥니다.',
  '',
  '임시 폴더의 옛 판·손 탐침도 이 명령으로 띄우십시오.',
  '가짜 키·합성 주소는 차단기의 대체물이 아닙니다 (P036-01).',
]

function isFile(p) {
  try { return existsSync(p) && statSync(p).isFile() } catch { return false }
}
function isDir(p) {
  try { return existsSync(p) && statSync(p).isDirectory() } catch { return false }
}

function fail(lines, code) {
  for (const l of lines) console.log(l)
  process.exitCode = code
}

/** `NODE_OPTIONS` 에 bootstrap 을 더한다. 자손 프로세스까지 물려받는다 */
function guardedEnv(baseEnv) {
  // 034 에서 겪은 것: `--require` 를 node 인자로만 주면 **tsx 의 자식에 전파되지 않는다.**
  // 그리고 따옴표를 넣으면 Node 가 모듈을 못 찾는다. 그래서 따옴표 없이 슬래시 경로다
  const option = `--require ${BOOTSTRAP.split('\\').join('/')}`
  const prev = baseEnv.NODE_OPTIONS
  return {
    ...baseEnv,
    NODE_OPTIONS: prev === undefined || prev === '' ? option : `${prev} ${option}`,
  }
}

function parseArgs(argv) {
  const out = { cwd: null, target: null, rest: [], help: false }
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    if (a === '--help' || a === '-h') { out.help = true; i++; continue }
    if (a === '--cwd') {
      if (i + 1 >= argv.length) return { ...out, error: '--cwd 뒤에 폴더가 없습니다' }
      out.cwd = argv[i + 1]; i += 2; continue
    }
    out.target = a
    out.rest = argv.slice(i + 1)
    break
  }
  return out
}

function main(argv) {
  const args = parseArgs(argv)
  if (args.help || (args.target === null && args.error === undefined)) {
    USAGE.forEach((l) => console.log(l))
    process.exitCode = args.help ? 0 : EXIT.badArgs
    return
  }
  if (args.error !== undefined) {
    fail([`[037] ${args.error}`, ...USAGE], EXIT.badArgs)
    return
  }
  if (!isFile(BOOTSTRAP) || !isFile(GUARD)) {
    // 차단 장치가 없으면 **돌리지 않는다.** 없이 도는 것이 더 위험하다
    fail([
      '[037] 중단: 전송 차단 bootstrap 또는 netguard 를 찾지 못했습니다.',
      '[037] 차단 없이 아무것도 띄우지 않습니다.',
    ], EXIT.launcherBlocked)
    return
  }
  if (BOOTSTRAP.includes(' ')) {
    fail([
      '[037] 중단: 저장소 경로에 공백이 있어 차단 장치를 적재할 수 없습니다.',
      '[037] 차단 없이 아무것도 띄우지 않습니다.',
    ], EXIT.launcherBlocked)
    return
  }

  const cwd = args.cwd === null ? REPO : resolve(args.cwd)
  if (!isDir(cwd)) {
    fail([`[037] 중단: --cwd 폴더가 없습니다: ${args.cwd}`], EXIT.badArgs)
    return
  }
  const target = isAbsolute(args.target) ? args.target : join(cwd, args.target)
  if (!isFile(target)) {
    fail([`[037] 중단: 대상 파일이 없습니다: ${args.target}`], EXIT.badArgs)
    return
  }

  const ext = extname(target).toLowerCase()
  const needsTsx = ext === '.ts' || ext === '.tsx' || ext === '.mts'
  if (needsTsx && !isFile(TSX_CLI)) {
    fail([
      '[037] 중단: 저장소에 설치된 tsx 를 찾지 못했습니다.',
      '[037] 자동으로 내려받지 않습니다. 네트워크를 건드리지 않았습니다.',
    ], EXIT.launcherBlocked)
    return
  }

  const nodeArgs = needsTsx ? [TSX_CLI, target, ...args.rest] : [target, ...args.rest]
  console.log(`[037] 보호된 실행 — bootstrap 적재 후 ${needsTsx ? 'tsx' : 'node'} 로 띄웁니다`)
  console.log(`[037] 대상 = ${target.split('\\').join('/')}`)
  console.log(`[037] 작업 폴더 = ${cwd.split('\\').join('/')}`)

  const r = spawnSync(process.execPath, nodeArgs, {
    cwd, stdio: 'inherit', env: guardedEnv(process.env),
  })
  if (r.error) {
    fail(['[037] 중단: 대상을 띄우지 못했습니다 (원문 오류는 출력하지 않습니다).'], EXIT.launcherBlocked)
    return
  }
  process.exitCode = typeof r.status === 'number' ? r.status : EXIT.launcherBlocked
}

module.exports = { REPO, TSX_CLI, BOOTSTRAP, GUARD, EXIT, USAGE, isFile, guardedEnv, parseArgs, main }

if (require.main === module) main(process.argv.slice(2))
