// twin 시험 실행기 — **전송 차단을 먼저 적재한 뒤** 시험을 돌린다 (GPT-EXEC-034 §1·§29)
//
// 왜 필요한가
//   `tsx --test ...` 를 그냥 돌리면 차단 장치가 애플리케이션·SDK 보다 늦게 적재될 수 있다.
//   034 §27 은 "애플리케이션 및 SDK import **이전**, 시험 프로세스 시작 시" 차단하라고 했다.
//   그래서 `node --require test/netguard.cjs <tsx cli> --test <파일들>` 로 띄운다.
//   Windows 에서 `VAR=x cmd` 가 동작하지 않으므로 환경변수 대신 이 실행기를 쓴다.
//
//   §29: SDK 탐침·최상위 실행기·전체 회귀를 **같은 차단 경계 안에서** 돌린다.
//   별도 tmp 탐침을 차단 없이 돌리지 않는다.
//
// 하지 않는 것: 패키지 설치, 전역 도구 사용, 다른 폴더로의 대체.

/* eslint-disable @typescript-eslint/no-require-imports --
 * 변환기 없이 `node` 가 바로 실행해야 하는 파일이라 **일부러 CommonJS** 다.
 */
'use strict'

const { existsSync, statSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

const REPO = resolve(__dirname, '..')
const TSX_CLI = join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const GUARD = join(REPO, 'test', 'netguard.cjs')
/**
 * 037 §44~§46 — 이제 netguard 를 **직접** 올리지 않고 bootstrap 을 거친다.
 *
 * bootstrap 은 netguard 를 적재한 뒤 **실제로 교체됐는지 확인**하고, 안 됐으면
 * 앱·SDK import 보다 **앞에서** 종료코드 97 로 끝낸다. 036 의 사고(P036-01)는
 * "가드를 올렸다고 믿은" 자리에서 났다. netguard 자체는 고치지 않았다 (§43).
 */
const BOOTSTRAP = join(REPO, 'test', 'bootstrap.cjs')

const EXIT = { launcherBlocked: 7 }

function isFile(p) {
  try { return existsSync(p) && statSync(p).isFile() } catch { return false }
}

function fail(lines) {
  for (const l of lines) console.log(l)
  process.exitCode = EXIT.launcherBlocked
}

/** `package.json` 의 `test:twin:files` 에 적힌 시험 파일 목록 */
function testFiles() {
  const pkg = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8'))
  const line = pkg.scripts['test:twin:files']
  if (typeof line !== 'string' || line.trim() === '') return null
  return line.trim().split(/\s+/)
}

function main(argv) {
  if (!isFile(TSX_CLI)) {
    fail([
      '[034] 중단: 저장소에 설치된 tsx 를 찾지 못했습니다.',
      '[034] 자동으로 내려받지 않습니다. 네트워크를 건드리지 않았습니다.',
    ])
    return
  }
  if (!isFile(GUARD) || !isFile(BOOTSTRAP)) {
    // 차단 장치가 없으면 **시험을 돌리지 않는다.** 차단 없이 도는 것이 더 위험하다
    fail([
      '[037] 중단: 전송 차단 장치(test/netguard.cjs 또는 test/bootstrap.cjs)를 찾지 못했습니다.',
      '[037] 차단 없이 시험을 돌리지 않습니다.',
    ])
    return
  }
  const files = testFiles()
  if (files === null) {
    fail(['[034] 중단: package.json 의 test:twin:files 를 읽지 못했습니다.'])
    return
  }
  for (const f of files) {
    if (!isFile(join(REPO, f))) {
      fail([`[034] 중단: 시험 파일이 없습니다: ${f}`])
      return
    }
  }

  // `--require` 를 node 인자로만 주면 **tsx 가 띄우는 자식 프로세스에는 전파되지 않는다.**
  // 실제로 그렇게 만들었다가 시험 P1 이 "차단 장치가 없다"로 잡아냈다.
  // `NODE_OPTIONS` 는 자손 프로세스까지 물려받으므로 그쪽에 둔다.
  // 경로에 공백이 없어야 한다 — 따옴표를 넣으면 Node 가 모듈을 못 찾는다 (겪었다).
  // 037: netguard 가 아니라 **bootstrap** 을 올린다 (확인이 거기 들어 있다)
  const guardOption = `--require ${BOOTSTRAP.split('\\').join('/')}`
  const env = {
    ...process.env,
    NODE_OPTIONS: process.env.NODE_OPTIONS === undefined || process.env.NODE_OPTIONS === ''
      ? guardOption
      : `${process.env.NODE_OPTIONS} ${guardOption}`,
  }
  if (GUARD.includes(' ') || BOOTSTRAP.includes(' ')) {
    fail([
      '[034] 중단: 저장소 경로에 공백이 있어 전송 차단 장치를 적재할 수 없습니다.',
      '[034] 차단 없이 시험을 돌리지 않습니다.',
    ])
    return
  }

  const r = spawnSync(
    process.execPath,
    [TSX_CLI, '--test', ...files, ...argv],
    { cwd: REPO, stdio: 'inherit', env },
  )
  if (r.error) {
    fail(['[034] 중단: 시험 프로세스를 띄우지 못했습니다 (원문 오류는 출력하지 않습니다).'])
    return
  }
  process.exitCode = typeof r.status === 'number' ? r.status : EXIT.launcherBlocked
}

module.exports = { REPO, TSX_CLI, GUARD, BOOTSTRAP, EXIT, isFile, testFiles, main }

if (require.main === module) main(process.argv.slice(2))
