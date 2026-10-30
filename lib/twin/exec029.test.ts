// GPT-EXEC-029 — 표본 판정 보완(R028-01·02)과 1건 실행 진입점 (§147)
//
// 실행: npm run test:twin
//
// 무엇을 시험하는가
//   028 판은 **필수 조건을 성공 판정에 연결하지 않았고**(R028-01),
//   **보고용 응답과 검증용 응답이 서로 달랐다**(R028-02).
//   여기서는 GPT 가 재현한 F1~F4·O1 을 그대로 넣어 **판정과 호출 횟수**를 확인한다.
//   성공 시험 개수를 늘리는 대신 **실제 반환값과 호출 횟수**로 본다 (§47).
//
// ⚠ 합성 응답·로컬 대역만 쓴다. 운영 Storage 응답 형태를 확인하지 않았으므로
//   이 통과를 **실제 표본 성공이라고 쓰지 않는다.**

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { checkStorageSample, formatSampleReport } from './storageSample'
import {
  run, EXIT, EXECUTE_FLAG, PILOT_TYPE_CODE, PILOT_GRADE, EXPECTED_ORIGIN,
  type Deps, type PickedSource,
} from '../../scripts/check-storage-sample-029'

const ROOT = join(__dirname, '..', '..')
const NL = String.fromCharCode(10)
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const PATH = 'syn/공수1/0001.png'
const NAME = '0001.png'
type Row = Record<string, unknown>

function fileRow(over: Row = {}): Row {
  return {
    name: NAME,
    id: 'syn-object-id',
    updated_at: '2026-10-02T01:02:03.000Z',
    created_at: '2026-09-01T00:00:00.000Z',
    metadata: { eTag: '"abc123def456"', size: 4, mimetype: 'image/png' },
    ...over,
  }
}

type Resp = { data: unknown; error: unknown }
const okResp = (rows: unknown[]): Resp => ({ data: rows, error: null })

/**
 * `list` 를 **호출 순서대로 다른 응답**으로 돌려주는 대역.
 *
 * 028 의 결함은 두 응답을 섞은 것이었다. 그래서 대역이 두 번째 응답을 준비해 두고,
 * 시험은 **두 번째가 쓰이지 않는 것**(`list === 1`)을 확인한다.
 */
function seqDb(responses: Resp[], opts: { downloadBytes?: number; downloadError?: boolean; downloadThrows?: boolean } = {}) {
  const calls = { list: 0, download: 0 }
  const n = opts.downloadBytes ?? 4
  const blob = new Blob([Buffer.alloc(n, 1)], { type: 'image/png' })
  const db = {
    storage: {
      from: () => ({
        list: async () => responses[Math.min(calls.list++, responses.length - 1)],
        download: async () => {
          calls.download++
          if (opts.downloadThrows) throw new Error('syn download throw')
          if (opts.downloadError) return { data: null, error: { message: 'syn' } } as Resp
          return { data: blob, error: null } as Resp
        },
      }),
    },
  } as never
  return { calls, db }
}

// ════════════════════════════════════════════════════════════════════
// 정상 — 같은 응답에서 보고·검증, list 1회 · download 1회 (§153)
// ════════════════════════════════════════════════════════════════════

for (const [key, raw, len] of [['eTag', '"abc123def456"', 12], ['etag', 'zz99', 4]] as const) {
  test(`정상 ${key} 키 — 통과하고 list 1회 · download 1회`, async () => {
    const { calls, db } = seqDb([okResp([fileRow({ metadata: { [key]: raw, size: 4 } })])])
    const r = await checkStorageSample(db, PATH)
    assert.equal(r.ok, true, formatSampleReport(r))
    assert.equal(r.code, null)
    assert.equal(r.meta.etagKey, key)
    assert.equal(r.meta.etagLength, len)
    assert.equal(r.meta.singleObservation, true)
    assert.equal(r.meta.updatedAtParsesAsDate, true)
    assert.equal(calls.list, 1, 'list 를 한 번만 불러야 합니다')
    assert.equal(calls.download, 1)
    assert.deepEqual(r.calls, { list: 1, download: 1 })
  })
}

test('목록에 다른 객체가 섞여 와도 이름 정확일치 한 개만 채택한다 (§64)', async () => {
  const { calls, db } = seqDb([okResp([
    fileRow({ name: '0002.png' }), fileRow(), fileRow({ name: '0001.png.bak' }),
  ])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, true, formatSampleReport(r))
  assert.equal(r.meta.listedEntries, 3, '서버가 메타 1개만 돌려줬다고 쓰지 않습니다')
  assert.equal(r.meta.singleObservation, true)
  assert.equal(calls.list, 1)
})

// ════════════════════════════════════════════════════════════════════
// R028-01 — 필수 조건은 성공의 논리곱이다. 실패면 download 0회 (§154)
// ════════════════════════════════════════════════════════════════════

test('F1 updated_at 이 날짜로 해석되지 않으면 실패하고 다운로드하지 않는다', async () => {
  const bad = okResp([fileRow({ updated_at: 'NOT_A_DATE' })])
  // 028 은 두 응답을 섞었다. 두 번째를 정상으로 둬도 쓰이지 않아야 한다
  const { calls, db } = seqDb([bad, okResp([fileRow()])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false, formatSampleReport(r))
  assert.equal(r.code, 'updated_at_invalid')
  assert.equal(r.meta.updatedAtPresent, true)
  assert.equal(r.meta.updatedAtParsesAsDate, false)
  assert.equal(calls.download, 0, '필수 메타가 어긋났으면 이미지를 읽지 않아야 합니다')
  assert.equal(calls.list, 1)
})

test('F2 updated_at 이 없으면(created_at 만 있어도) 실패하고 다운로드하지 않는다 (D-083)', async () => {
  const { calls, db } = seqDb([okResp([fileRow({ updated_at: null })]), okResp([fileRow()])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'updated_at_missing')
  assert.equal(calls.download, 0)
  assert.equal(calls.list, 1)
})

test('F4 ETag 가 따옴표뿐이면 실패하고 다운로드하지 않는다', async () => {
  const { calls, db } = seqDb([okResp([fileRow({ metadata: { eTag: '""' } })]), okResp([fileRow()])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false)
  assert.ok(r.code === 'etag_missing' || r.code === 'etag_empty', `실제: ${r.code}`)
  assert.equal(r.meta.etagLength, 0)
  assert.equal(calls.download, 0)
  assert.equal(calls.list, 1)
})

test('ETag 가 두 키 어디에도 없으면 실패하고 다운로드하지 않는다', async () => {
  const { calls, db } = seqDb([okResp([fileRow({ metadata: { size: 4 } })])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'etag_missing')
  assert.equal(calls.download, 0)
})

const PARTIAL_CASES: [string, Row, string][] = [
  ['metadata 없음', { metadata: null }, 'metadata_missing'],
  ['이름 불일치', { name: '0001.png.bak' }, 'not_found'],
  ['폴더형(id 없음)', { id: null }, 'not_a_file'],
]
for (const [label, over, code] of PARTIAL_CASES) {
  test(`${label} → 실패 · download 0회`, async () => {
    const { calls, db } = seqDb([okResp([fileRow(over)]), okResp([fileRow()])])
    const r = await checkStorageSample(db, PATH)
    assert.equal(r.ok, false)
    assert.equal(r.code, code)
    assert.equal(calls.download, 0)
    assert.equal(calls.list, 1)
  })
}

test('같은 이름이 둘 이상이면 실패 · download 0회', async () => {
  const { calls, db } = seqDb([okResp([fileRow(), fileRow()])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'ambiguous')
  assert.equal(calls.download, 0)
})

// ════════════════════════════════════════════════════════════════════
// R028-02 — 두 응답이 합쳐질 수 없다 (§157)
// ════════════════════════════════════════════════════════════════════

test('F3 첫 응답과 둘째 응답의 ETag 가 달라도 섞이지 않는다 — 첫 응답만 쓴다', async () => {
  const { calls, db } = seqDb([
    okResp([fileRow({ metadata: { eTag: 'AAAA' } })]),
    okResp([fileRow({ metadata: { etag: 'BBBBBBBB' } })]),
  ])
  const r = await checkStorageSample(db, PATH)
  assert.equal(calls.list, 1, '두 번째 응답을 가져오면 안 됩니다')
  // 쓰인 응답은 첫 번째다. 보고의 키·길이가 그 응답과 맞는다
  assert.equal(r.meta.etagKey, 'eTag')
  assert.equal(r.meta.etagLength, 4)
  assert.equal(r.ok, true, formatSampleReport(r))
  // 둘째 응답의 값(8자)이 섞여 들어오지 않았다
  assert.notEqual(r.meta.etagLength, 8)
})

test('O1 목록 조회가 실패하면 이미지를 읽지 않고 끝낸다', async () => {
  const { calls, db } = seqDb([{ data: null, error: { message: 'syn raw sdk error' } }, okResp([fileRow()])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'list_error')
  assert.equal(calls.download, 0, '028 은 여기서 download 를 한 번 했습니다')
  assert.equal(calls.list, 1)
  // SDK 원문 오류가 보고서로 새지 않는다
  const text = JSON.stringify(r) + formatSampleReport(r)
  assert.ok(!text.includes('syn raw sdk error'))
})

test('보고 항목은 검증에 쓰인 그 응답에서 나온다 — 단일관측 표시', async () => {
  const { db } = seqDb([okResp([fileRow()])])
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.meta.singleObservation, true)
  assert.match(formatSampleReport(r), /단일관측=true/)
})

// ════════════════════════════════════════════════════════════════════
// 다운로드 쪽 기존 실패 분류 유지 (§158)
// ════════════════════════════════════════════════════════════════════

test('0바이트 이미지는 실패한다', async () => {
  const { calls, db } = seqDb([okResp([fileRow()])], { downloadBytes: 0 })
  const r = await checkStorageSample(db, PATH)
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_empty')
  assert.equal(r.image.bytes, 0)
  assert.equal(calls.download, 1)
})

test('다운로드 오류·예외는 실패로 분류한다', async () => {
  for (const opts of [{ downloadError: true }, { downloadThrows: true }]) {
    const { db } = seqDb([okResp([fileRow()])], opts)
    const r = await checkStorageSample(db, PATH)
    assert.equal(r.ok, false)
    assert.equal(r.code, 'image_download_failed')
  }
})

test('허용 밖 확장자는 실패한다', async () => {
  const { calls, db } = seqDb([okResp([fileRow({ name: '0001.gif' })])])
  const r = await checkStorageSample(db, 'syn/공수1/0001.gif')
  assert.equal(r.ok, false)
  assert.equal(r.code, 'image_unsupported_type')
  assert.equal(calls.download, 0)
})

// ════════════════════════════════════════════════════════════════════
// 민감한 값 비노출 유지 (§159)
// ════════════════════════════════════════════════════════════════════

test('성공·실패 보고 모두 경로·ETag 값·이미지 본문을 내보내지 않는다', async () => {
  const cases = [
    seqDb([okResp([fileRow()])]),
    seqDb([okResp([fileRow({ updated_at: 'NOT_A_DATE' })])]),
  ]
  for (const { db } of cases) {
    const r = await checkStorageSample(db, PATH)
    const text = JSON.stringify(r) + ' ' + formatSampleReport(r)
    assert.ok(!text.includes(PATH), '전체 경로가 있습니다')
    assert.ok(!text.includes('공수1'), '디렉터리 이름이 있습니다')
    assert.ok(!text.includes(NAME), '파일명이 있습니다')
    assert.ok(!text.includes('abc123def456'), 'ETag 값이 있습니다')
    assert.ok(!text.includes('data:image'), 'data URL 이 있습니다')
    assert.ok(!/base64,/.test(text), '이미지 본문이 있습니다')
  }
})

// ════════════════════════════════════════════════════════════════════
// R028-03 — 제어문자 정규식 정정 (§90)
// ════════════════════════════════════════════════════════════════════

test('R028-03 db.from( 검사가 제어문자 대신 단어 경계를 쓴다', () => {
  const t = read('lib/twin/exec028.test.ts')
  // 028 판에는 `\b` 가 아니라 U+0008(backspace) 이 들어가 평범한 db.from( 을 못 잡았다
  assert.ok(!t.includes(String.fromCharCode(8)), 'U+0008 제어문자가 남아 있습니다')
  // 고친 패턴이 짧은 합성 코드를 실제로 잡는다
  const re = /\bdb\.from\(/
  assert.ok(re.test("const r = await db.from('problems').select('id')"),
    '의도한 단어 경계 패턴이 합성 코드를 잡지 못합니다')
  assert.ok(!re.test('createHash("sha256").update(x)'))
  // 표본 모듈에는 DB 직접 조회가 없다 (금지 동작을 발견한 것이 아니다)
  assert.ok(!re.test(read('lib/twin/storageSample.ts')))
})

// ════════════════════════════════════════════════════════════════════
// R028-04 — 42501 이력 위치 정정 (§96)
// ════════════════════════════════════════════════════════════════════

test('R028-04 014 검증의 42501 위치를 [4-6] 으로 적는다', () => {
  const d = read('docs/twin/DB_CHECKPOINT_028.md')
  const line = d.split('\n').find(l => l.includes('42501')) ?? ''
  assert.match(line, /\[4-6\]/, '실제 실패 위치는 [4-6] 입니다')
  assert.ok(!line.includes('[5-나]'), '[5-나] 는 의도적 42501 거부 검사입니다')
  // 결정 로그 D-120 과 같은 구간을 가리킨다
  assert.match(read('docs/AI_QUESTION_APP_DECISION_LOG.md'), /\[4-6\][^\n]*ai_question_private/)
  // 과거 SQL·보고 원본은 바꾸지 않았다
  assert.match(read('POSTINSTALL_TO_RUN_014.sql'), /\[5-나\][^\n]*42501/)
})

// ════════════════════════════════════════════════════════════════════
// 실행 진입점 — 잠금과 판정 (§160·§161)
// ════════════════════════════════════════════════════════════════════

/**
 * 진입점이 운영 자원에 손대면 즉시 터지는 의존성.
 *
 * 030 부터 설정 로더도 여기에 들어간다 — 도움말·계획 모드에서 **환경파일조차 보지
 * 않는다**는 것을 확인하려면 그 함수들도 터져야 한다.
 */
function forbidDeps(log: string[]): Deps {
  return {
    makeClient: () => { throw new Error('클라이언트를 만들면 안 됩니다') },
    pickSources: async () => { throw new Error('조회하면 안 됩니다') },
    checkSample: async () => { throw new Error('Storage 를 읽으면 안 됩니다') },
    log: l => log.push(l),
    cwd: () => { throw new Error('cwd 를 보면 안 됩니다') },
    pathInfo: {
      isDir: () => { throw new Error('경로를 보면 안 됩니다') },
      isFile: () => { throw new Error('경로를 보면 안 됩니다') },
      read: () => { throw new Error('파일을 읽으면 안 됩니다') },
    },
    loadEnvFile: () => { throw new Error('설정파일을 읽으면 안 됩니다') },
  }
}

function fakeDeps(opts: {
  rows?: PickedSource[]
  ok?: boolean
  code?: string
  clientThrows?: boolean
  pickThrows?: boolean
  sampleThrows?: boolean
}, log: string[]): Deps & { calls: { client: number; pick: number; sample: number } } {
  const calls = { client: 0, pick: 0, sample: 0 }
  return {
    calls,
    // 셸에 두 변수가 있는 경우를 흉내 내므로 로더는 쓰이지 않는다.
    // 그래도 쓰이면 바로 알 수 있게 터뜨린다
    cwd: () => { throw new Error('셸 설정이 있으면 cwd 를 볼 필요가 없습니다') },
    pathInfo: {
      isDir: () => { throw new Error('경로를 볼 필요가 없습니다') },
      isFile: () => { throw new Error('경로를 볼 필요가 없습니다') },
      read: () => { throw new Error('파일을 읽을 필요가 없습니다') },
    },
    loadEnvFile: () => { throw new Error('설정파일을 읽을 필요가 없습니다') },
    makeClient: () => {
      calls.client++
      if (opts.clientThrows) throw new Error('syn client fail')
      return { syn: true }
    },
    pickSources: async () => {
      calls.pick++
      if (opts.pickThrows) throw new Error('syn pick fail with secret key sk_live_xyz')
      return opts.rows ?? [{
        id: 1234, type_code: PILOT_TYPE_CODE, grade: PILOT_GRADE, image_path: PATH,
      }]
    },
    checkSample: async () => {
      calls.sample++
      if (opts.sampleThrows) throw new Error('syn sample fail with path ' + PATH)
      const { db } = seqDb([okResp([fileRow(opts.ok === false ? { updated_at: null } : {})])])
      return checkStorageSample(db, PATH)
    },
    log: l => log.push(l),
  }
}

test('진입점: 인자 없음 / --help / --plan 은 네트워크 0건이고 종료코드 0 이며 미실행을 밝힌다', async () => {
  for (const argv of [[], ['--help'], ['--plan']]) {
    const log: string[] = []
    const code = await run(argv, {}, forbidDeps(log))
    assert.equal(code, EXIT.planned)
    const text = log.join('\n')
    assert.match(text, /미실행/, `${JSON.stringify(argv)} 에서 미실행 표시가 없습니다`)
    assert.match(text, /표본 성공이 아닙/, '종료코드 0 이 표본 성공이 아니라고 적어야 합니다')
    assert.match(text, /미승인/)
  }
})

test('진입점: 실행 플래그 없이 운영 환경변수가 있어도 아무것도 읽지 않는다', async () => {
  const log: string[] = []
  const code = await run([], {
    NEXT_PUBLIC_SUPABASE_URL: 'https://syn.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }, forbidDeps(log))
  assert.equal(code, EXIT.planned)
})

test('진입점: 설정이 없으면 접속 전에 중단한다', async () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_SUPABASE_URL: 'https://syn.supabase.co' },
    { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:1234', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    // 형식은 맞지만 **승인 대상이 아닌** 프로젝트 (R029-02c)
    { NEXT_PUBLIC_SUPABASE_URL: 'https://otherproject.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_key_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
  ]) {
    const log: string[] = []
    const code = await run([EXECUTE_FLAG], env, forbidDeps(log))
    assert.equal(code, EXIT.configMissing, JSON.stringify(env))
    assert.match(log.join('\n'), /접속하지 않았습니다|중단/)
  }
})

test('진입점: 설정 값을 출력하지 않는다', async () => {
  const log: string[] = []
  await run([EXECUTE_FLAG], {
    NEXT_PUBLIC_SUPABASE_URL: 'http://wrong',
    SUPABASE_SERVICE_ROLE_KEY: 'sk_live_super_secret_aaaaaaaaaaaaaaaaaaaaaaaaaaa',
  }, forbidDeps(log))
  const text = log.join('\n')
  assert.ok(!text.includes('sk_live_super_secret_aaaaaaaaaaaaaaaaaaaaaaaaaaa'), '키가 출력됐습니다')
  assert.ok(!text.includes('http://wrong'), 'URL 이 출력됐습니다')
})

// 030: 형식만 맞는 주소는 더 이상 통과하지 않는다. 승인된 origin 을 쓴다
const GOOD_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_syn_service_aaaaaaaaaaaaaaaaaaaaaaaaaa',
}

test('진입점: 정상 경로는 1행만 쓰고 종료코드 0', async () => {
  const log: string[] = []
  const d = fakeDeps({}, log)
  const code = await run([EXECUTE_FLAG], GOOD_ENV, d)
  assert.equal(code, EXIT.ok, log.join('\n'))
  assert.deepEqual(d.calls, { client: 1, pick: 1, sample: 1 })
  const text = log.join('\n')
  assert.match(text, /표본 점검 통과/)
  assert.match(text, /유료 스모크 승인은 아닙니다/, '연쇄 실행을 막는 문구가 필요합니다')
  assert.ok(!text.includes(PATH), '전체 경로가 출력됐습니다')
})

test('진입점: 0행이면 중단하고 다른 유형으로 넓히지 않는다', async () => {
  const log: string[] = []
  const d = fakeDeps({ rows: [] }, log)
  const code = await run([EXECUTE_FLAG], GOOD_ENV, d)
  assert.equal(code, EXIT.noSource)
  assert.equal(d.calls.pick, 1, '선정 조회는 1회여야 합니다')
  assert.equal(d.calls.sample, 0, '표본을 만들지 않아야 합니다')
  assert.match(log.join('\n'), /0건|자동 확대하지 않습니다/)
})

test('진입점: 유형·과정이 파일럿과 다르면 중단한다', async () => {
  for (const row of [
    { id: 1, type_code: '공수1-99-99', grade: PILOT_GRADE, image_path: PATH },
    { id: 2, type_code: PILOT_TYPE_CODE, grade: '중3-2', image_path: PATH },
  ]) {
    const log: string[] = []
    const d = fakeDeps({ rows: [row] }, log)
    const code = await run([EXECUTE_FLAG], GOOD_ENV, d)
    assert.equal(code, EXIT.noSource)
    assert.equal(d.calls.sample, 0)
  }
})

test('진입점: 1행보다 많이 오면 중단한다', async () => {
  const log: string[] = []
  const row = { id: 1, type_code: PILOT_TYPE_CODE, grade: PILOT_GRADE, image_path: PATH }
  const d = fakeDeps({ rows: [row, { ...row, id: 2 }] }, log)
  assert.equal(await run([EXECUTE_FLAG], GOOD_ENV, d), EXIT.noSource)
  assert.equal(d.calls.sample, 0)
})

test('진입점: image_path 가 없으면 중단한다', async () => {
  const log: string[] = []
  const d = fakeDeps({ rows: [{ id: 1, type_code: PILOT_TYPE_CODE, grade: PILOT_GRADE, image_path: '  ' }] }, log)
  assert.equal(await run([EXECUTE_FLAG], GOOD_ENV, d), EXIT.noSource)
  assert.equal(d.calls.sample, 0)
})

test('진입점: 표본 점검 실패면 0 이 아닌 종료코드와 금지 문구', async () => {
  const log: string[] = []
  const d = fakeDeps({ ok: false }, log)
  const code = await run([EXECUTE_FLAG], GOOD_ENV, d)
  assert.equal(code, EXIT.sampleFailed)
  assert.match(log.join('\n'), /계속 금지/)
})

test('진입점: 원문 오류·stack 을 출력하지 않는다', async () => {
  for (const [opts, expected] of [
    [{ clientThrows: true }, EXIT.configMissing],
    [{ pickThrows: true }, EXIT.noSource],
    [{ sampleThrows: true }, EXIT.unexpected],
  ] as const) {
    const log: string[] = []
    const code = await run([EXECUTE_FLAG], GOOD_ENV, fakeDeps(opts, log))
    assert.equal(code, expected, JSON.stringify(opts))
    const text = log.join('\n')
    assert.ok(!text.includes('sk_live_xyz'), '원문 오류의 키가 샜습니다')
    assert.ok(!text.includes(PATH), '원문 오류의 경로가 샜습니다')
    assert.ok(!text.includes('syn '), 'SDK 원문 메시지가 샜습니다')
    assert.ok(!/at .*\.ts:\d+/.test(text), 'stack 이 샜습니다')
  }
})

// ════════════════════════════════════════════════════════════════════
// 진입점의 범위 — 소스 자체를 본다
// ════════════════════════════════════════════════════════════════════

test('진입점은 SDK·선정 함수를 실행 모드에서만 동적으로 가져온다', () => {
  const s = read('scripts/check-storage-sample-029.ts')
  // 정적 import 는 표본 모듈뿐이다 (그 모듈도 런타임 SDK 를 끌어오지 않는다).
  //
  // 여러 줄 import 라서 `^import .*from '...'` 로는 안 잡힌다 — 실제로 빈 배열이 나와
  // 이 검사가 통과해 버렸다. 줄 시작의 `from '...'` 를 본다
  // 여러 줄 import 라 닫는 중괄호 뒤에 `from` 이 온다 (`} from '...'`)
  const statics = [...s.matchAll(/^\}?\s*from '([^']+)'/gm)].map(m => m[1])
  assert.deepEqual(statics, ['../lib/twin/storageSample'])
  const lines = s.split(NL)
  const staticImportLines = lines.filter(l => /^import\b/.test(l))
  for (const l of staticImportLines) {
    assert.ok(!l.includes('@supabase'), 'SDK 를 정적으로 import 하고 있습니다')
    assert.ok(!l.includes('twin/targets'), '선정 함수를 정적으로 import 하고 있습니다')
  }
  // 동적 import 로만 가져온다. `Promise.all([...])` 로 묶여 있으므로 `await import(` 형태를
  // 그대로 찾으면 안 맞는다 — 실제로 안 맞아서 이 검사가 실패했다
  assert.match(s, /\bimport\('@supabase\/supabase-js'\)/)
  assert.match(s, /\bimport\('\.\.\/lib\/twin\/targets'\)/)
  // 그 둘이 defaultDeps 안에서만 불린다 (import 시점이 아니다)
  const dyn = s.indexOf("import('@supabase/supabase-js')")
  assert.ok(dyn > s.indexOf('async function defaultDeps'),
    'SDK 를 defaultDeps 밖에서 가져오고 있습니다')
  // 도움말·계획 분기가 설정 읽기보다 **앞**에 있다.
  // 030 에서 호출이 `readConfig(effective)` 로 바뀌어 옛 검사가 못 찾았다
  assert.ok(s.includes('readConfig(effective)'), '설정 읽기 호출을 찾지 못했습니다')
  assert.ok(s.indexOf('return EXIT.planned') < s.indexOf('readConfig(effective)'),
    '계획·도움말 분기가 설정 읽기보다 뒤에 있습니다')
  assert.ok(s.indexOf('const wantsExecute') < s.indexOf('readConfig(effective)'))
  assert.match(s, /persistSession: false/)
  assert.match(s, /autoRefreshToken: false/)
})

test('진입점은 쓰기·모델·공개·파이프라인을 건드리지 않는다', () => {
  const s = read('scripts/check-storage-sample-029.ts')
  for (const bad of ['.upload(', '.remove(', '.insert(', '.delete(', 'createSignedUrl',
                     'getPublicUrl', 'openai', 'anthropic', 'runPipeline',
                     'server_create_twin_candidate', 'admin_set_practice_publication']) {
    assert.ok(!s.toLowerCase().includes(bad.toLowerCase()), `${bad} 를 참조합니다`)
  }
  // 키를 명령행 인자로 받지 않는다
  assert.ok(!/argv.*KEY|KEY.*argv/i.test(s))
  // 읽는 범위를 주석에 적었다
  assert.match(s, /answer_text/)
  assert.match(s, /download 1회/)
})

test('실행 안내 초안이 운영 미승인과 읽는 범위를 적는다', () => {
  const r = read('STORAGE_SAMPLE_RUNBOOK_029.md')
  for (const w of ['미승인', EXECUTE_FLAG, 'answer_text', '12개',
                   '공수1-01-07', '중단', 'service']) {
    assert.ok(r.includes(w), `안내에 "${w}" 가 없습니다`)
  }
  // 읽기 횟수는 백틱 표기가 섞이므로 느슨하게 본다
  assert.match(r, /`?list`? 1회/)
  assert.match(r, /`?download`? 1회/)
  // 키를 채팅에 붙이라고 **요청하지 않고**, 오히려 붙이지 말라고 적는다.
  //
  // 처음엔 `/키를 (채팅|대화)에/` 가 나오면 실패시켰는데, 그러면 「키를 채팅에 붙이지
  // 마십시오」 라는 **올바른 경고문**이 걸렸다. 금지 문구를 찾는 쪽으로 바꾼다
  assert.match(r, /키를 채팅에 붙이지 마십/, '키를 붙이지 말라는 경고가 있어야 합니다')
  assert.ok(!/키를 (채팅|대화|여기)에 (붙여|적어|보내)\s*주/.test(r),
    '키를 보내 달라고 요청하고 있습니다')
  // 환경변수에서만 읽는다는 점
  assert.match(r, /환경변수에서만/)
})
