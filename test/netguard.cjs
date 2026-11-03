// 시험 프로세스의 **외부 전송 차단** — GPT-EXEC-034 §1 (R033-04)
//
// 왜 이 파일이 생겼나
//   033 에서 저는 receiver 결함을 확인하려고 주입 fetch 없이 **실제 OpenAI 로 POST 1건**을
//   보냈습니다. 승인 범위 밖 실행이었습니다. 가짜 키를 썼다는 것이 외부 접속 허가가 되지 않습니다.
//   그리고 `exec033.test.ts` 의 `I1` 은 전역 fetch 만 덫으로 바꾸고 가짜 `runPipeline` 을 써서
//   **실제 공통 sender 를 거치지 않았습니다.** 그 한 시험으로 SDK 무전송 전체를 증명할 수 없습니다.
//
// 그래서 이 파일은 **애플리케이션·SDK 가 적재되기 전에** `--require` 로 먼저 돌아,
// 실행 경로에서 쓸 수 있는 실제 HTTP 연결을 전부 막습니다.
//
// 막는 것
//   net.Socket.prototype.connect · net.connect · net.createConnection
//   tls.connect · tls.createConnection
//   http.request/get · https.request/get
//   globalThis.fetch
//
// 막지 않는 것
//   주입된 **합성 fetch** 는 이 경로를 지나지 않습니다. 그것이 요청 본문 검증의 통로입니다.
//   요청 본문에 실제 endpoint 이름이 **등장하는 것**과 실제 전송은 다릅니다 (§28).
//
// 세는 것 — `시도`·`차단`·`통과` 를 **따로** 셉니다 (§31).
//   「시도 1 / 차단 1 / 통과 0」 인 음성 시험과 「시도 0」 인 정상 대조군은 다른 것입니다.
//   실제 전송이 있었는데 401 이라는 이유로 0건에 넣지 않습니다.
//
// 범용 보안 제품이 아닙니다. 이 시험 묶음을 닫는 최소 수단입니다.

/* eslint-disable @typescript-eslint/no-require-imports --
 * `--require` 로 먼저 적재돼야 하므로 **반드시 CommonJS** 입니다.
 * 변환기보다 먼저 돌아야 해서 ESM/TypeScript 로 둘 수 없습니다.
 */
'use strict'

const net = require('node:net')
const tls = require('node:tls')
const http = require('node:http')
const https = require('node:https')

/**
 * 호출 인자에서 **대상 호스트**를 뽑습니다. 경로·헤더·본문은 남기지 않습니다.
 *
 * `kind`
 *   `'host'` — 외부일 수 있는 호스트. 차단 대상입니다.
 *   `'local'` — 로컬 IPC 경로(`\\.\pipe\…`, 유닉스 소켓)나 loopback 주소.
 *               **외부 전송이 아니므로 통과시킵니다.**
 *   `'unknown'` — 판단할 수 없음. 안전한 쪽으로 **차단**합니다.
 */
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'])

/** 호스트 이름 하나를 판정한다 */
function byHost(h) {
  return { kind: LOOPBACK.has(h) ? 'local' : 'host', target: h }
}

/**
 * **IPC 경로**인가. 소켓 계열 호출의 인자에만 적용한다.
 *
 * ⚠ HTTP 의 `options.path`(`/v1/responses` 같은 요청 경로)에 이것을 쓰면 안 된다.
 *   034 판이 그렇게 해서 외부 호스트를 IPC 로 분류했다 (R034-03).
 */
function isIpcPath(s) {
  return s.startsWith('\\\\.\\pipe\\') || s.startsWith('\\\\?\\pipe\\')
    || s.startsWith('/') || s.startsWith('.')
}

/**
 * 호출 **종류에 맞게** 인자를 해석한다 — GPT-EXEC-035 §90 (R034-03).
 *
 * 034 판은 종류를 가리지 않고 `options.path` 가 `/` 로 시작하면 IPC 로 봤다.
 * 그래서 `https.request({hostname:'external.invalid', path:'/v1/responses'})` 가
 * **로컬로 분류돼 통과**했다. GPT 가 무전송 sentinel 대조로 그것을 확인했다
 * (실제 외부 전송이나 하위 소켓 방어 우회를 재현한 것은 아니다).
 *
 * @param family `'http'` — http/https 모듈. `path` 는 **요청 경로**이고 IPC 가 아니다.
 *                          IPC 는 `socketPath` 뿐이다.
 *               `'socket'` — net/tls. 문자열 인자와 `path` 가 **IPC 경로**다.
 *               `'fetch'`  — URL 만 본다. IPC 가 없다.
 */
function classifyTarget(family, rawArgs) {
  // Node 내부는 `socket.connect([options, cb])` 처럼 **정규화한 배열**을 그대로 넘기기도 한다.
  // 한 단계 펼쳐야 options 가 보인다 (tsx 로더의 IPC 가 이 모양으로 들어왔다).
  const args = []
  for (const a of rawArgs) {
    if (Array.isArray(a)) args.push(...a)
    else args.push(a)
  }

  for (const a of args) {
    if (a === null || a === undefined) continue

    if (typeof a === 'string') {
      let host = null
      try { host = new URL(a).hostname } catch { /* URL 이 아니다 */ }
      if (host !== null && host !== '') return byHost(host)
      if (family === 'socket') {
        // 소켓 계열에서만 문자열을 IPC 경로로 본다
        if (isIpcPath(a)) return { kind: 'local', target: '(ipc)' }
        // `net.connect(port, host)` 의 맨 호스트 문자열이다.
        // **호스트로 판정한다** — `unknown` 으로 두면 loopback 도 막혀 tsx 가 죽는다.
        // 외부 이름이면 여기서 `host` 가 되어 그대로 차단된다.
        return byHost(a)
      }
      return { kind: 'unknown', target: '(string)' }
    }

    if (typeof a === 'object') {
      const o = a

      // (1) IPC — 호출 종류에 맞는 자리만 본다
      if (family === 'http') {
        // http(s).request 의 IPC 는 `socketPath` 뿐이다. `path` 는 요청 경로다
        if (typeof o.socketPath === 'string' && o.socketPath !== '' && isIpcPath(o.socketPath)) {
          return { kind: 'local', target: '(ipc)' }
        }
      } else if (family === 'socket') {
        if (typeof o.path === 'string' && o.path !== '' && isIpcPath(o.path)) {
          return { kind: 'local', target: '(ipc)' }
        }
      }

      // (2) 명시된 host/hostname 은 **`path` 유무와 상관없이** 판정한다 (§90)
      const h = typeof o.host === 'string' && o.host !== '' ? o.host
        : typeof o.hostname === 'string' && o.hostname !== '' ? o.hostname : null
      if (h !== null) return byHost(h)

      if (typeof o.href === 'string') {
        try {
          const hn = new URL(o.href).hostname
          if (hn !== '') return byHost(hn)
        } catch { return { kind: 'unknown', target: '(url)' } }
      }
      // `url` 속성을 쓰는 형태 (Request 객체 등)
      if (typeof o.url === 'string') {
        try {
          const hn = new URL(o.url).hostname
          if (hn !== '') return byHost(hn)
        } catch { return { kind: 'unknown', target: '(url)' } }
      }
    }
  }
  return { kind: 'unknown', target: '(unknown)' }
}

const state = {
  active: true,
  /** **외부** 대상으로 나가려고 시도한 횟수 (이 가드가 가로챈 호출) */
  attempts: 0,
  /** 막은 횟수. `attempts` 와 같아야 합니다 */
  blocked: 0,
  /** 통과시킨 로컬 IPC·loopback 횟수. tsx 로더가 씁니다 — 외부 전송이 아닙니다 */
  localAllowed: 0,
  /** 막은 대상 (호스트만) */
  targets: [],
}

/**
 * ⚠ **측정 경계** — GPT-EXEC-035 §92 (R034-03)
 *
 * 034 판에는 `escaped` 필드가 있었고 늘 0 이었습니다. 그런데 그 값을 **갱신하는 코드가
 * 없었습니다.** 0 으로 초기화·리셋만 했을 뿐입니다. 그것을 "외부 패킷 전송 실측 0건"
 * 처럼 보고한 것은 과한 표현이었습니다. 그래서 그 필드를 **없앴습니다.**
 *
 * 이 가드가 실제로 세는 것:
 *   `attempts` / `blocked`  — 이 가드가 **가로챈** 외부 대상 호출의 수
 *   `localAllowed`          — 원본으로 넘긴 로컬 IPC·loopback 호출의 수
 *
 * 이 가드가 세지 **못하는** 것:
 *   - 가드를 거치지 않는 경로(네이티브 애드온, 자식 프로세스의 독립 소켓 등)
 *   - 실제 네트워크 인터페이스를 지난 패킷
 *
 * 그래서 "외부 전송 0건" 은 **이 가드가 가로챈 범위 안에서 0건**이라는 뜻입니다.
 * 독립적인 패킷 실측이 아닙니다.
 */
const MEASUREMENT_SCOPE =
  '이 가드가 가로챈 호출 범위 안의 수치. 네트워크 인터페이스의 패킷 실측이 아니다'

class OutboundBlocked extends Error {
  constructor(api, target) {
    super(`외부 전송이 차단됐습니다: ${api} → ${target} (시험 프로세스는 외부 네트워크를 쓰지 않습니다)`)
    this.name = 'OutboundBlocked'
    this.code = 'OUTBOUND_BLOCKED'
    this.api = api
    this.target = target
  }
}

/**
 * 원본을 그대로 들고 있습니다. **로컬 IPC·loopback 만** 여기로 넘깁니다.
 * 밖으로 내보내지 않습니다 — 내보내면 우회 통로가 됩니다.
 */
const real = {
  socketConnect: net.Socket.prototype.connect,
  netConnect: net.connect,
  netCreateConnection: net.createConnection,
  tlsConnect: tls.connect,
  tlsCreateConnection: tls.createConnection,
  httpRequest: http.request,
  httpGet: http.get,
  httpsRequest: https.request,
  httpsGet: https.get,
  fetch: globalThis.fetch,
}

/** 외부면 막고, 로컬이면 원본으로 넘깁니다 */
function gate(family, api, args, passthrough, thisArg) {
  const { kind, target } = classifyTarget(family, args)
  if (kind === 'local') {
    state.localAllowed++
    return passthrough.apply(thisArg, args)
  }
  // `host` 와 `unknown` 은 둘 다 막습니다 — 판단할 수 없으면 안전한 쪽입니다
  state.attempts++
  state.blocked++
  if (state.targets.length < 50) state.targets.push(`${api}:${target}`)
  throw new OutboundBlocked(api, target)
}

// ── net ─────────────────────────────────────────────────────────────
net.Socket.prototype.connect = function (...args) {
  return gate('socket', 'net.Socket.connect', args, real.socketConnect, this)
}
net.connect = (...args) => gate('socket', 'net.connect', args, real.netConnect, net)
net.createConnection = (...args) => gate('socket', 'net.createConnection', args, real.netCreateConnection, net)

// ── tls ─────────────────────────────────────────────────────────────
tls.connect = (...args) => gate('socket', 'tls.connect', args, real.tlsConnect, tls)
if (typeof real.tlsCreateConnection === 'function') {
  tls.createConnection = (...args) => gate('socket', 'tls.createConnection', args, real.tlsCreateConnection, tls)
}

// ── http / https ────────────────────────────────────────────────────
// `path` 는 **요청 경로**다. IPC 로 보지 않는다 (R034-03)
http.request = (...args) => gate('http', 'http.request', args, real.httpRequest, http)
http.get = (...args) => gate('http', 'http.get', args, real.httpGet, http)
https.request = (...args) => gate('http', 'https.request', args, real.httpsRequest, https)
https.get = (...args) => gate('http', 'https.get', args, real.httpsGet, https)

// ── fetch ───────────────────────────────────────────────────────────
// SDK 가 전역 fetch 를 쓰므로 여기도 막습니다. 주입 fetch 는 이 자리를 지나지 않습니다
globalThis.fetch = (...args) => gate('fetch', 'fetch', args, real.fetch, globalThis)

/**
 * 시험이 읽는 창구.
 *
 * `realSocketConnect` 를 밖으로 내보내지 않습니다 — 내보내면 우회 통로가 됩니다.
 * (참조만 남겨 두는 이유는 이 모듈이 두 번 적재돼도 원본을 다시 감싸지 않게 하기 위함입니다.)
 */
function snapshot() {
  return {
    active: state.active,
    attempts: state.attempts,
    blocked: state.blocked,
    localAllowed: state.localAllowed,
    // 수치의 뜻을 값과 함께 내보낸다 — 밖에서 과하게 읽히지 않게
    measurementScope: MEASUREMENT_SCOPE,
    targets: [...state.targets],
  }
}

function reset() {
  state.attempts = 0
  state.blocked = 0
  state.localAllowed = 0
  state.targets.length = 0
}

const api = { snapshot, reset, OutboundBlocked }

// 두 번 적재돼도 같은 창구를 쓰게 둡니다
if (globalThis.__NETGUARD__ === undefined) {
  Object.defineProperty(globalThis, '__NETGUARD__', {
    value: api, writable: false, enumerable: false, configurable: false,
  })
}

module.exports = globalThis.__NETGUARD__
