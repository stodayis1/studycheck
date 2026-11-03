// 시험 진입 공통 bootstrap — **차단이 실제로 걸렸는지 확인한 뒤** 통과시킨다 (GPT-EXEC-037 §43~§46)
//
// 왜 이 파일이 생겼나
//   036 에서 저는 옛 035 판 CLI 를 임시 폴더에서 **가드 없이** 돌렸고,
//   운영 Supabase 호스트로 요청 1건이 나갔습니다 (P036-01).
//   그때 제 판단은 "합성 폴더 + 가짜 키 = 격리" 였습니다. 둘 다 전송 차단기의 대체물이 아닙니다.
//
//   035·036 의 실행기는 `--require test/netguard.cjs` 로 가드를 먼저 올렸지만,
//   **올라갔는지 확인하는 자리가 없었습니다.** 탐침 안의 `__NETGUARD__` 확인은
//   `openaiSend`·SDK 가 이미 적재된 **뒤**에 돌았고, 손으로 띄운 CLI 에는 아무것도 없었습니다.
//
// 이 파일이 하는 일
//   1) netguard 를 적재한다 (그 파일은 **고치지 않는다** — 037 §43)
//   2) 적재 **전후의 함수 신원을 비교**해 실제로 교체됐는지 본다
//   3) 하나라도 교체되지 않았으면 **여기서 비정상 종료**한다.
//      이 파일은 `--require` 로 돌기 때문에 그 시점은 **앱·SDK import 보다 앞**이고
//      설정 읽기·클라이언트 준비보다도 앞이다 (§45).
//   4) 자식 프로세스가 물려받았는지 확인할 수 있게 표식을 남긴다
//
// 하지 않는 일
//   - **실제 연결을 보내지 않는다.** 가드가 걸렸는지는 함수 신원으로만 본다 (§48).
//   - 새 분류기·방화벽을 만들지 않는다. netguard 를 그대로 쓴다 (§43).
//   - 운영 실행기를 영구히 막지 않는다. 이 파일은 **시험 진입**에만 쓰인다 (§61).

/* eslint-disable @typescript-eslint/no-require-imports --
 * `--require` 로 node 가 바로 적재하는 파일이라 **일부러 CommonJS** 다.
 */
'use strict'

const net = require('node:net')
const tls = require('node:tls')
const http = require('node:http')
const https = require('node:https')

/** 가드가 걸리지 않았을 때의 종료코드. 시험 쪽 코드와 겹치지 않는 값 */
const EXIT_GUARD_MISSING = 97

/** 자식 프로세스가 bootstrap 을 거쳤는지 보는 표식 */
const BOOTSTRAP_ENV = '__TWIN_BOOTSTRAP__'

/** 교체됐는지 확인할 자리. netguard 가 감싸는 것과 **같은 목록**이어야 한다 */
function wrapTargets() {
  return [
    ['net.Socket.prototype.connect', () => net.Socket.prototype.connect],
    ['net.connect', () => net.connect],
    ['net.createConnection', () => net.createConnection],
    ['tls.connect', () => tls.connect],
    ['http.request', () => http.request],
    ['http.get', () => http.get],
    ['https.request', () => https.request],
    ['https.get', () => https.get],
    ['fetch', () => globalThis.fetch],
  ]
}

/**
 * 적재 전후를 비교해 **교체되지 않은 자리**의 이름을 돌려준다.
 *
 * 이 모듈이 두 번 적재되면 두 번째에는 이미 감싸진 것이 '적재 전' 이 되므로
 * 전후가 같다. 그래서 **첫 적재인지**를 `__NETGUARD__` 유무로 먼저 가른다.
 */
function installAndVerify() {
  const alreadyInstalled = globalThis.__NETGUARD__ !== undefined
  const before = new Map()
  for (const [name, read] of wrapTargets()) before.set(name, read())

  // netguard 를 적재한다. 두 번 적재돼도 그 파일이 같은 창구를 돌려준다
  require('./netguard.cjs')

  const guard = globalThis.__NETGUARD__
  if (guard === undefined || typeof guard.snapshot !== 'function') {
    return { ok: false, reason: 'guard_not_registered', notWrapped: [] }
  }
  const snap = guard.snapshot()
  if (snap.active !== true) {
    return { ok: false, reason: 'guard_inactive', notWrapped: [] }
  }

  if (alreadyInstalled) {
    // 이미 감싸진 상태였다. 신원 비교로는 더 알 수 없으므로 창구 확인으로 끝낸다
    return { ok: true, reason: 'already_installed', notWrapped: [] }
  }

  const notWrapped = []
  for (const [name, read] of wrapTargets()) {
    const now = read()
    if (typeof now !== 'function') { notWrapped.push(`${name}(없음)`); continue }
    if (now === before.get(name)) notWrapped.push(name)
  }
  if (notWrapped.length > 0) {
    return { ok: false, reason: 'not_wrapped', notWrapped }
  }
  return { ok: true, reason: 'wrapped', notWrapped: [] }
}

function refuse(result) {
  const lines = [
    '[037] 중단: 외부 전송 차단이 걸리지 않았습니다. 시험을 시작하지 않습니다.',
    `[037] 사유 = ${result.reason}`,
  ]
  if (result.notWrapped.length > 0) {
    lines.push(`[037] 감싸지지 않은 자리 = ${result.notWrapped.join(' ')}`)
  }
  lines.push('[037] 앱·SDK 를 적재하지 않았고 설정·클라이언트를 준비하지 않았습니다.')
  lines.push('[037] 가짜 키·합성 주소는 차단기의 대체물이 아닙니다 (P036-01).')
  lines.push('[037] scripts/run-guarded.cjs 로 띄우십시오.')
  for (const l of lines) console.log(l)
  // `process.exitCode` 가 아니라 **즉시 종료**다. 뒤의 import 가 돌면 안 된다
  process.exit(EXIT_GUARD_MISSING)
}

const result = installAndVerify()
if (!result.ok) refuse(result)

// 자식까지 왔는지 확인할 수 있게 표식을 남긴다.
// `NODE_OPTIONS` 로 전파되므로 자식도 이 파일을 거치고 같은 표식을 갖는다
process.env[BOOTSTRAP_ENV] = '1'

/**
 * `__TWIN_GUARD_REPORT__=1` 이면 **프로세스가 끝날 때** 가드 수치를 한 줄 찍는다.
 *
 * 왜 필요한가: 옛 판 CLI 처럼 **가드 수치를 스스로 찍지 않는 프로그램**을 보호된 경로로
 * 돌렸을 때, 요청이 나갔는지 막혔는지 밖에서 알 수 없었다. 그것을 보려고 넣는다.
 *
 * 이 수치는 **가드가 가로챈 호출** 범위다. 네트워크 인터페이스의 패킷 실측이 아니다.
 */
if (process.env.__TWIN_GUARD_REPORT__ === '1') {
  process.on('exit', () => {
    const s = globalThis.__NETGUARD__.snapshot()
    console.log(
      `[037] 가드 수치 — 시도=${s.attempts} 차단=${s.blocked} 로컬허용=${s.localAllowed}`
      + (s.targets.length === 0 ? '' : ` 대상=${s.targets.join(',')}`),
    )
    console.log(`[037] 측정 경계 — ${s.measurementScope}`)
  })
}

module.exports = {
  EXIT_GUARD_MISSING,
  BOOTSTRAP_ENV,
  wrapTargets,
  installAndVerify,
  verified: result,
}
