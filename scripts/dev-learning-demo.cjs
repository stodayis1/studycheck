// 학습 시험(demo) 모드로 개발 서버를 띄운다 — GPT-EXEC-042 §3-D
//
// 왜 스크립트인가
//   시험 입장 코드·시험 강사 쿠키·파일 저장소는 **명시적으로 켠 로컬 demo 모드**
//   에서만 동작한다 (`lib/learning/mode.ts`). 그냥 `next dev` 로는 꺼져 있다.
//   Windows 에서 `VAR=x cmd` 가 동작하지 않으므로 여기서 넣고 띄운다.
//
// 쓰는 법
//   npm run dev:learning-demo            (기본 포트)
//   npm run dev:learning-demo -- -p 3200 (포트 지정)
//
// 하지 않는 것
//   운영 설정·키를 읽지 않는다. 운영 빌드에서는 아예 멈춘다.

/* eslint-disable @typescript-eslint/no-require-imports --
 * 변환기 없이 `node` 가 바로 실행해야 하는 파일이라 **일부러 CommonJS** 다.
 */
'use strict'

const { spawn } = require('node:child_process')
const { join } = require('node:path')

const env = Object.assign({}, process.env)

if (env.NODE_ENV === 'production') {
  console.error('[학습 demo] 운영 빌드에서는 켜지지 않습니다. 로컬에서만 쓰세요.')
  process.exit(1)
}

const nextBin = join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next')
env.LEARNING_DEMO_MODE = '1'

// ── R042-04 — 주소를 **고정한다** ───────────────────────────────────
//
// 전에는 `next dev -p 3200` 만 넘겨서 hostname 을 정하지 않았다.
// Next 의 기본 hostname 은 `0.0.0.0` 이라, 「127.0.0.1 에만 열린다」는 안내가
// 이 스크립트만으로는 **보장되지 않았다**. (바깥에서 실제로 붙는 것을 본 것은 아니다.)
// 이제 loopback 을 박아 넣고, 주소를 바꾸려는 인자는 받지 않는다.
const HOST = '127.0.0.1'
const BLOCKED = ['-H', '--hostname', '--host', '--experimental-https', '--turbo-host']

const passed = process.argv.slice(2)
for (const a of passed) {
  const name = a.split('=')[0]
  if (BLOCKED.includes(name)) {
    console.error(`[학습 demo] \`${name}\` 은 받지 않습니다. 이 화면은 ${HOST} 에만 엽니다.`)
    process.exit(1)
  }
}

const args = [nextBin, 'dev', '--hostname', HOST].concat(passed)

console.log('[학습 demo] 시험 모드로 띄웁니다.')
console.log(`[학습 demo] 주소는 ${HOST} 로 고정합니다 (바깥에서 붙지 않습니다).`)
console.log('[학습 demo] 학생 입장 코드 A-2026 · B-2026 / 강사 입장 코드 T-2026')
console.log('[학습 demo] 저장 위치 .learning-test-store/store.json — 운영 DB 가 아닙니다.')

const child = spawn(process.execPath, args, { stdio: 'inherit', env })
child.on('exit', (code) => process.exit(code === null ? 0 : code))
