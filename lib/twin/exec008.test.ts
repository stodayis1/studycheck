// GPT-EXEC-008 회귀 테스트 — 007 최종 보정
//
// 실행: npm run test:twin
//
//   A) is_essay = null 을 전 구간에서 차단한다        (D-082)
//   B) Storage 메타의 updated_at 은 대체 불가다        (D-083)
//   C) 사전점검 SQL 은 읽기 전용이다                   (D-085)
//
// 운영 DB 에 접속하지 않는다. 파일 내용과 순수 함수만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isEligible, pickSourceProblems, type SourceProblem } from './targets'
import { loadStorageMeta, loadSourceImageDataUrl, StorageError } from './storage'
import { runTwinPipelineForSource, type PipelineDeps } from './pipeline'
import type { BatchCandidateState, ServerTwinRepository } from './repository'
import type { Transport } from './generate'
import type { StorageMeta } from './fingerprint'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const SQL_INSTALL = 'docs/sql/쌍둥이_설치.sql'
const SQL_PRECHECK = 'docs/sql/쌍둥이_설치전_점검.sql'
const SQL_VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'

const BATCH = '88888888-8888-4888-8888-888888888888'

/** 주석과 문자열 리터럴을 지운 SQL 본문. notice 문구 안의 단어가 걸리지 않게 한다 */
function sqlCode(path: string): string {
  let body = read(path).replace(/\/\*[\s\S]*?\*\//g, ' ')
  body = body.split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
  return body.replace(/'(?:[^']|'')*'/g, " '' ")
}

// ════════════════════════════════════════════════════════════════════
// A) is_essay = null 차단 (D-082)
// ════════════════════════════════════════════════════════════════════

test('is_essay 가 null 이면 대상이 아니다', () => {
  // D-088 로 image_path 가 조건에 들어왔다. 이 테스트의 관심사는 is_essay 이므로
  // 나머지는 전부 통과하는 값으로 고정한다.
  const base: {
    twin_id: number | null; answer_text: string; answer_kind: string; image_path: string
  } = { twin_id: null, answer_text: '12', answer_kind: 'number', image_path: 'a/b.png' }
  assert.equal(isEligible({ ...base, is_essay: false }), true)
  assert.equal(isEligible({ ...base, is_essay: true }), false)
  // null 은 "서술형이 아님"이 아니라 미확인이다
  assert.equal(isEligible({ ...base, is_essay: null }), false)
  assert.equal(isEligible({ ...base, is_essay: undefined }), false)
  assert.equal(isEligible(base), false)
})

test('조회 결과의 is_essay 가 null 이면 조회를 실패시킨다', async () => {
  // Supabase 클라이언트 모양만 흉내 낸다. 네트워크를 쓰지 않는다
  const rows: Record<string, unknown>[] = [{
    id: 1, book: '쎈', grade: '공통수학1', semester: 1, type_code: 'T',
    step: 'B', difficulty: '대표', answer_kind: 'number', answer_text: '12',
    image_path: 'a/b.png', is_essay: null, twin_id: null,
  }]
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'not', 'in', 'neq', 'order']) {
    chain[m] = () => chain
  }
  chain.limit = async (): Promise<{ data: Record<string, unknown>[]; error: unknown }> =>
    ({ data: rows, error: null })
  const db = { from: () => chain } as never

  await assert.rejects(
    () => pickSourceProblems(db, 'T', 5),
    (e: unknown) => {
      const msg = String((e as Error).message)
      // isEligible 이 먼저 걸러도, strictBool 이 걸러도 둘 다 '대상 문항 조회 실패' 다
      assert.ok(msg.includes('대상 문항 조회 실패'), msg)
      assert.ok(msg.includes('is_essay=null'), msg)
      // 정답 값이 메시지에 실리면 안 된다
      assert.ok(!msg.includes('12'), msg)
      return true
    },
  )
})

test('is_essay 가 boolean 이면 통과한다', async () => {
  const rows: Record<string, unknown>[] = [{
    id: 1, book: '쎈', grade: '공통수학1', semester: 1, type_code: 'T',
    step: 'B', difficulty: '대표', answer_kind: 'number', answer_text: '12',
    image_path: 'a/b.png', is_essay: false, twin_id: null,
  }]
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'not', 'in', 'neq', 'order']) chain[m] = () => chain
  chain.limit = async (): Promise<{ data: Record<string, unknown>[]; error: unknown }> =>
    ({ data: rows, error: null })
  const db = { from: () => chain } as never

  const out = await pickSourceProblems(db, 'T', 5)
  assert.equal(out.length, 1)
  assert.equal(out[0].is_essay, false)
  assert.equal(out[0].twin_id, null)
})

test('SQL 에 coalesce(is_essay, false) 가 남아 있지 않다', () => {
  for (const f of [SQL_INSTALL, SQL_VERIFY, SQL_PRECHECK]) {
    const code = sqlCode(f)
    assert.ok(!/coalesce\s*\(\s*\w*\.?is_essay\s*,\s*false\s*\)/i.test(code),
      `${f} 에 coalesce(is_essay, false) 가 남아 있습니다`)
  }
})

test('생성 RPC 가 is_essay 의 null 과 true 를 각각 거부한다 (D-090)', () => {
  const code = sqlCode(SQL_INSTALL)
  // null 이 먼저 걸러져야 한다. 순서가 바뀌면 null 이 true 분기로 새지는 않지만,
  // `if v_src.is_essay then` 은 null 에서 거짓이라 **그냥 통과**한다
  const nullIdx = code.indexOf('v_src.is_essay is null')
  const trueIdx = code.indexOf('if v_src.is_essay then')
  assert.ok(nullIdx > 0, '생성 RPC 가 is_essay null 을 보지 않습니다')
  assert.ok(trueIdx > 0, '생성 RPC 가 is_essay true 를 보지 않습니다')
  assert.ok(nullIdx < trueIdx, 'null 검사가 true 검사보다 뒤에 있으면 null 이 통과합니다')
  // sqlCode 는 문자열 리터럴을 지우므로 오류 코드 이름은 원본에서 본다
  assert.ok(read(SQL_INSTALL).includes("'source_is_essay_unknown'"))
})

test('유형 집계 RPC 가 is_essay = false 만 센다', () => {
  const code = sqlCode(SQL_INSTALL)
  const start = code.indexOf('create function public.server_list_eligible_twin_types')
  assert.ok(start > 0)
  const body = code.slice(start, code.indexOf('$fn$;', start))
  assert.ok(/p\.is_essay = false/.test(body))
  assert.ok(!/coalesce/i.test(body.match(/is_essay[^\n]*/g)?.join(NL) ?? ''))
})

// ── null·true 원문은 외부 호출 0회 ──────────────────────────────────

class NullRepo implements ServerTwinRepository {
  calls = 0
  async getBatchState(): Promise<BatchCandidateState[]> { this.calls++; return [] }
  async createCandidate(): Promise<string> { this.calls++; return 'x' }
  async updateValidation(): Promise<void> { this.calls++ }
}

test('is_essay 가 null 이거나 true 인 원문은 생성·Storage·모델 호출 0회', async () => {
  for (const isEssay of [null, true] as const) {
    let external = 0
    const bump: Transport = async () => { external++; return { output_parsed: {} } }
    const repo = new NullRepo()
    const deps: PipelineDeps = {
      loadStorageMeta: async () => { external++; return { updated_at: 'x', etag: 'y' } },
      loadImageDataUrl: async () => { external++; return null },
      generationTransport: bump,
      reviewTransport: bump,
      repo,
      generationInstructions: '', reviewInstructions: '',
    }
    const source = {
      id: 1, book: null, grade: null, semester: null, type_code: 'T', step: null,
      difficulty: null, answer_kind: 'number', answer_text: '12', image_path: 'a/b.png',
      twin_id: null, is_essay: isEssay,
    } as unknown as SourceProblem

    const r = await runTwinPipelineForSource({ source, batchId: BATCH, deps })
    assert.equal(r.kind, 'skipped', `is_essay=${isEssay}`)
    assert.equal(external, 0, `is_essay=${isEssay}`)
    assert.equal(repo.calls, 0, `is_essay=${isEssay}`)
  }
})

// ════════════════════════════════════════════════════════════════════
// B) Storage 메타 (D-083)
// ════════════════════════════════════════════════════════════════════

/** list()/download() 만 흉내 낸 최소 클라이언트. 네트워크를 쓰지 않는다 */
function fakeDb(opts: {
  list?: unknown[]
  listError?: unknown
  download?: { data: unknown; error: unknown }
}) {
  return {
    storage: {
      from: () => ({
        list: async () => ({ data: opts.list ?? [], error: opts.listError ?? null }),
        download: async () => opts.download ?? { data: null, error: 'no' },
      }),
    },
  } as never
}

const fileRow = (over: Record<string, unknown> = {}) => ({
  id: 'obj-1',
  name: '0001.png',
  updated_at: '2026-01-01T00:00:00Z',
  created_at: '2025-01-01T00:00:00Z',
  metadata: { eTag: '"abc123"', size: 100 },
  ...over,
})

const PATH = 'hc1-1/ssen/09/0001.png'

test('정상 파일만 updated_at 과 etag 를 준다', async () => {
  const meta: StorageMeta = await loadStorageMeta(fakeDb({ list: [fileRow()] }), PATH)
  assert.equal(meta.updated_at, '2026-01-01T00:00:00Z')
  // 따옴표를 벗겨 표현을 고정한다
  assert.equal(meta.etag, 'abc123')
})

test('updated_at 이 없으면 created_at 이 있어도 실패한다 (D-083)', async () => {
  await assert.rejects(
    () => loadStorageMeta(fakeDb({ list: [fileRow({ updated_at: null })] }), PATH),
    (e: unknown) => {
      assert.ok(e instanceof StorageError)
      assert.equal((e as StorageError).code, 'storage_meta_unavailable')
      assert.ok((e as Error).message.includes('updated_at_missing'))
      return true
    },
  )
})

test('storage.ts 에 created_at fallback 이 없다', () => {
  const code = read('lib/twin/storage.ts')
    .split(NL).filter(l => !l.trim().startsWith('//')).join(NL)
  assert.ok(!code.includes('created_at'), 'created_at fallback 이 남아 있습니다')
})

test('ETag 가 없으면 실패한다', async () => {
  for (const md of [{ size: 1 }, { eTag: '' }, { etag: '  ' }, { eTag: '""' }]) {
    await assert.rejects(
      () => loadStorageMeta(fakeDb({ list: [fileRow({ metadata: md })] }), PATH),
      (e: unknown) => {
        assert.ok((e as Error).message.includes('etag_missing'), JSON.stringify(md))
        return true
      },
    )
  }
})

test('폴더형 응답(id=null, metadata=null)은 실패한다', async () => {
  await assert.rejects(
    () => loadStorageMeta(fakeDb({ list: [fileRow({ id: null, metadata: null })] }), PATH),
    (e: unknown) => {
      assert.ok((e as Error).message.includes('not_a_file'))
      return true
    },
  )
  await assert.rejects(
    () => loadStorageMeta(fakeDb({ list: [fileRow({ metadata: null })] }), PATH),
    (e: unknown) => {
      assert.ok((e as Error).message.includes('metadata_missing'))
      return true
    },
  )
})

test('객체 없음·이름 불일치·중복은 모두 실패한다', async () => {
  await assert.rejects(() => loadStorageMeta(fakeDb({ list: [] }), PATH),
    (e: unknown) => { assert.ok((e as Error).message.includes('not_found')); return true })
  // search 는 부분일치다 — 이름이 정확히 같지 않으면 못 쓴다
  await assert.rejects(() => loadStorageMeta(fakeDb({ list: [fileRow({ name: '0001.png.bak' })] }), PATH),
    (e: unknown) => { assert.ok((e as Error).message.includes('not_found')); return true })
  await assert.rejects(() => loadStorageMeta(fakeDb({ list: [fileRow(), fileRow()] }), PATH),
    (e: unknown) => { assert.ok((e as Error).message.includes('ambiguous')); return true })
  await assert.rejects(() => loadStorageMeta(fakeDb({ listError: { message: 'x' } }), PATH),
    (e: unknown) => { assert.ok((e as Error).message.includes('list_error')); return true })
})

test('arrayBuffer() 예외가 안정된 image_load_failed 가 된다', async () => {
  const blob = { arrayBuffer: async () => { throw new Error('깨진 스트림') } }
  await assert.rejects(
    () => loadSourceImageDataUrl(fakeDb({ download: { data: blob, error: null } }), PATH),
    (e: unknown) => {
      assert.ok(e instanceof StorageError)
      assert.equal((e as StorageError).code, 'image_load_failed')
      assert.ok((e as Error).message.includes('array_buffer_failed'))
      return true
    },
  )
})

test('0바이트 파일은 image_load_failed 다', async () => {
  const blob = { arrayBuffer: async () => new ArrayBuffer(0) }
  await assert.rejects(
    () => loadSourceImageDataUrl(fakeDb({ download: { data: blob, error: null } }), PATH),
    (e: unknown) => { assert.ok((e as Error).message.includes('empty_file')); return true },
  )
})

test('정상 파일은 data URL 을 준다', async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const blob = { arrayBuffer: async () => bytes.buffer }
  const url = await loadSourceImageDataUrl(fakeDb({ download: { data: blob, error: null } }), PATH)
  assert.ok(url!.startsWith('data:image/png;base64,'))
})

test('ETag 키 후보를 추측으로 늘리지 않았다', () => {
  const code = read('lib/twin/storage.ts')
    .split(NL).filter(l => !l.trim().startsWith('//')).join(NL)
  // md 는 metadata 를 좁힌 지역 변수다. 접근 표기가 바뀌어도 키 이름은 그대로여야 한다
  const keys = code.match(/\b(?:metadata|md)\.(\w+)/g) ?? []
  const etagKeys = keys.map(k => k.split('.')[1]).filter(k => /etag/i.test(k))
  assert.deepEqual([...new Set(etagKeys)].sort(), ['eTag', 'etag'],
    '표본 확인 전에 ETag fallback 을 늘렸습니다 (D-086)')
})

// ════════════════════════════════════════════════════════════════════
// C) 사전점검 SQL 은 읽기 전용이다 (D-085 · §162)
// ════════════════════════════════════════════════════════════════════

test('사전점검 SQL 에 변경문이 0건이다', () => {
  const code = sqlCode(SQL_PRECHECK)
  const found: string[] = []
  for (const w of ['insert', 'update', 'delete', 'create', 'alter',
                   'drop', 'grant', 'revoke', 'truncate']) {
    const hits = code.match(new RegExp(`\\b${w}\\b`, 'gi'))
    if (hits) found.push(`${w}:${hits.length}`)
  }
  assert.deepEqual(found, [], `변경문이 있습니다: ${found.join(' ')}`)
})

test('사전점검 SQL 이 임시 테이블도 만들지 않는다', () => {
  const code = sqlCode(SQL_PRECHECK)
  assert.ok(!/\btemp\b|\btemporary\b/i.test(code))
})

test('사전점검이 is_essay 통계와 엄격 조건을 본다', () => {
  const code = sqlCode(SQL_PRECHECK)
  assert.ok(/is_essay is null/.test(code), 'is_essay null 통계가 없습니다')
  assert.ok(/is_essay = false/.test(code), '엄격 조건이 없습니다')
  // 유형 집계 두 가지
  assert.ok(/count\(p\.twin_id\) = 0/.test(code))
  assert.ok(/>= 5/.test(code))
})

test('사전점검이 Storage 구조와 참조 무결성을 본다', () => {
  const pre = read(SQL_PRECHECK)
  for (const needle of ['storage.objects', 'bucket_id', 'updated_at', 'metadata',
                        'problem-images', 'eTag', 'etag']) {
    assert.ok(pre.includes(needle), `점검에 ${needle} 이 없습니다`)
  }
  // 생성 가능 원문 판정과 전체 고아 참조를 섞지 않는다 (§160)
  assert.ok(pre.includes('(판정 아님)'))
})

test('사전점검이 실패를 예외로 끝낸다', () => {
  const pre = read(SQL_PRECHECK)
  const tail = pre.slice(pre.indexOf('판정: 전부 OK'))
  assert.ok(tail.includes('raise exception'))
})

// ════════════════════════════════════════════════════════════════════
// E) 문서·주석 정합
// ════════════════════════════════════════════════════════════════════

test('옛 safe_worked_example 주석이 코드에 남아 있지 않다', () => {
  for (const f of ['lib/twin/flags.ts', 'lib/twin/publish.ts', 'lib/twin/repository.ts',
                   'lib/twin/pipeline.ts', 'lib/twin/storage.ts', 'lib/twin/targets.ts',
                   'app/api/twin/review/route.ts', 'app/teacher/twin-review/page.tsx']) {
    assert.ok(!read(f).includes('safe_worked_example'), `${f} 에 옛 명칭이 남아 있습니다`)
  }
  // 설치후 검증 SQL 은 "옛 이름이 없는지" 확인하느라 문자열을 일부러 담고 있다 (§211)
  assert.ok(read(SQL_VERIFY).includes('safe_worked_example'))
})
