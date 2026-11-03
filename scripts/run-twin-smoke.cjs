// 첫 소량 생성(스모크) 실행기 — **로컬에 설치된 tsx 만** 쓴다 (GPT-EXEC-032)
//
// 030 의 `run-storage-sample.cjs` 와 같은 이유로 있다 (R029-01):
//   `npx tsx ...` 로 안내하면 로컬에 tsx 가 없을 때 **스크립트가 시작되기 전에** npx 가
//   레지스트리를 조회한다. 그러면 「계획 모드는 네트워크 0건」이 스크립트 안에서만 성립한다.
//   이 실행기는 저장소에 **이미 설치된** tsx 를 직접 부르고, 없으면
//   **네트워크·설정파일·키·유료 API 를 건드리기 전에** 멈춘다.
//
// 하지 않는 것: 패키지 설치, `npx`/`npm exec`/`npm install` 호출,
//   전역 tsx 로의 대체, 다른 진입점으로의 대체.
//
// Node 기본 기능만 쓴다. 의존성이 없다.

/* eslint-disable @typescript-eslint/no-require-imports --
 * 이 파일은 **일부러 CommonJS** 다. 변환기 없이 `node` 가 바로 실행해야 한다 —
 * tsx 가 아직 있는지도 모르는 단계에서 도는 파일이라, ESM/TypeScript 로 두면
 * 실행기 자체가 변환기를 필요로 한다. 그래서 `require` 로 Node 기본 모듈만 가져온다.
 */
'use strict'

const { existsSync, statSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { spawnSync } = require('node:child_process')

/** 이 파일 기준의 저장소 루트. 다른 폴더를 찾아 헤매지 않는다 */
const REPO = resolve(__dirname, '..')

/** 저장소에 설치된 tsx 의 CLI. 이것 하나만 본다 */
const TSX_CLI = join(REPO, 'node_modules', 'tsx', 'dist', 'cli.mjs')
/** 스모크 진입점 */
const ENTRY = join(REPO, 'scripts', 'run-twin-smoke-032.ts')

const EXIT = {
  /** 실행기 단계에서 막은 경우 — 네트워크·설정·키·유료 API 를 건드리기 전이다 */
  launcherBlocked: 7,
}

function isFile(p) {
  try { return existsSync(p) && statSync(p).isFile() } catch { return false }
}

function fail(lines) {
  for (const l of lines) console.log(l)
  process.exitCode = EXIT.launcherBlocked
}

function main(argv) {
  if (!isFile(TSX_CLI)) {
    // **여기서 끝낸다.** 설치하지 않고, 네트워크도 설정도 유료 API 도 건드리지 않는다
    fail([
      '[032] 중단: 저장소에 설치된 tsx 를 찾지 못했습니다.',
      '[032] 찾은 위치: node_modules/tsx/dist/cli.mjs',
      '[032] 자동으로 내려받지 않습니다. 이 저장소에서 의존성을 먼저 설치해 주십시오.',
      '[032] 네트워크·설정파일·키·유료 API 를 건드리지 않았습니다.',
    ])
    return
  }
  if (!isFile(ENTRY)) {
    fail([
      '[032] 중단: 스모크 진입점을 찾지 못했습니다.',
      '[032] 찾은 위치: scripts/run-twin-smoke-032.ts',
      '[032] 다른 파일로 대체하지 않습니다.',
    ])
    return
  }

  // 로컬 tsx 를 **현재 node 로** 직접 실행한다. 패키지 실행 도구를 거치지 않는다
  const r = spawnSync(process.execPath, [TSX_CLI, ENTRY, ...argv], {
    cwd: REPO,
    stdio: 'inherit',
    // 환경을 그대로 물려준다. 여기서 설정파일을 읽거나 값을 만들지 않는다
    env: process.env,
  })
  if (r.error) {
    fail(['[032] 중단: 실행기를 띄우지 못했습니다 (원문 오류는 출력하지 않습니다).'])
    return
  }
  process.exitCode = typeof r.status === 'number' ? r.status : EXIT.launcherBlocked
}

module.exports = { REPO, TSX_CLI, ENTRY, EXIT, isFile, main }

if (require.main === module) main(process.argv.slice(2))
