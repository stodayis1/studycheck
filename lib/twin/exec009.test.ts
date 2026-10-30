// GPT-EXEC-009 회귀 테스트
//
// 실행: npm run test:twin
//
//   A) 이미지 없는 원문은 생성 대상이 아니다        (D-088)
//   B) Storage 파일 판별을 완전히 닫는다             (작업 B)
//   C) 사전점검 판정: 구조 중단 / 데이터 경고 / 준비도 중단  (D-089)
//   D) is_essay 의 true 와 null 을 다른 코드로 거부  (D-090)
//
// 운영 DB·Storage 에 접속하지 않는다. 파일 내용과 순수 함수만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { isEligible, type SourceProblem } from './targets'
import { loadStorageMeta, StorageError } from './storage'
import { buildGenerationInput } from './source'
import { runTwinPipelineForSource, type PipelineDeps } from './pipeline'
import { KNOWN_CODES, type BatchCandidateState, type ServerTwinRepository } from './repository'
import type { Transport } from './generate'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const NL = String.fromCharCode(10)

const SQL_INSTALL = 'docs/sql/쌍둥이_설치.sql'
const SQL_PRECHECK = 'docs/sql/쌍둥이_설치전_점검.sql'
const SQL_VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'

const BATCH = '99999999-9999-4999-8999-999999999999'
const PATH = 'hc1-1/ssen/09/0001.png'

/** 주석과 문자열 리터럴을 지운 SQL 본문 */
function sqlCode(path: string): string {
  let body = read(path).replace(/\/\*[\s\S]*?\*\//g, ' ')
  body = body.split(NL).map(l => l.replace(/--.*$/, '')).join(NL)
  return body.replace(/'(?:[^']|'')*'/g, " '' ")
}

// ════════════════════════════════════════════════════════════════════
// A) 이미지 없는 원문 차단 (D-088)
// ════════════════════════════════════════════════════════════════════

const OK_SOURCE: {
  twin_id: number | null; answer_text: string; answer_kind: string
  is_essay: boolean | null; image_path: string | null
} = {
  twin_id: null, answer_text: '12', answer_kind: 'number',
  is_essay: false, image_path: PATH,
}

test('image_path 가 없으면 대상이 아니다', () => {
  assert.equal(isEligible(OK_SOURCE), true)
  for (const bad of [null, undefined, '', '   ', '\t']) {
    assert.equal(isEligible({ ...OK_SOURCE, image_path: bad }), false, JSON.stringify(bad))
  }
})

// ── 파이프라인: 외부 호출 0회 ───────────────────────────────────────

class CountingRepo implements ServerTwinRepository {
  calls = 0
  async getBatchState(): Promise<BatchCandidateState[]> { this.calls++; return [] }
  async createCandidate(): Promise<string> { this.calls++; return 'x' }
  async updateValidation(): Promise<void> { this.calls++ }
}

function probe() {
  let external = 0
  const repo = new CountingRepo()
  const bump: Transport = async () => { external++; return { output_parsed: {} } }
  const deps: PipelineDeps = {
    loadStorageMeta: async () => { external++; return { updated_at: 'x', etag: 'y' } },
    loadImageDataUrl: async () => { external++; return 'data:image/png;base64,AAAA' },
    generationTransport: bump,
    reviewTransport: bump,
    repo,
    generationInstructions: '', reviewInstructions: '',
  }
  return { deps, repo, count: () => external }
}

const source = (over: Partial<SourceProblem> = {}): SourceProblem => ({
  id: 5479, book: '쎈', grade: '공통수학1', semester: 1,
  type_code: '공수1-09-09', step: 'B', difficulty: '대표',
  answer_kind: 'number', answer_text: '12', image_path: PATH,
  twin_id: null, is_essay: false,
  ...over,
} as SourceProblem)

test('이미지 경로가 없는 원문은 Storage·모델·DB 호출 0회', async () => {
  for (const bad of [null, '', '   ']) {
    const p = probe()
    const r = await runTwinPipelineForSource({
      source: source({ image_path: bad }), batchId: BATCH, deps: p.deps,
    })
    assert.equal(r.kind, 'skipped', JSON.stringify(bad))
    assert.equal(p.count(), 0, JSON.stringify(bad))
    assert.equal(p.repo.calls, 0, JSON.stringify(bad))
  }
})

test('이미지가 있는 원문은 생성까지 간다', async () => {
  const p = probe()
  const r = await runTwinPipelineForSource({ source: source(), batchId: BATCH, deps: p.deps })
  // 생성 응답이 빈 객체라 parse_error 로 끝나지만, **생성 단계까지는 갔다**는 뜻이다
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') assert.equal(r.stage, 'generation')
  assert.ok(p.count() > 0)
})

test('모델 입력에 원문 본문이 없다 — 이미지가 유일한 통로다', () => {
  // 이 테스트가 D-088 의 근거다. problem_ocr 이 null 인 한 이미지 없이는 원문을 못 본다.
  const input = buildGenerationInput(source(), 2)
  assert.equal(input.source.problem_ocr, null)
  const json = JSON.stringify(input)
  assert.ok(!json.includes('problem_text'), '입력에 원문 본문 필드가 생겼다면 D-088 을 다시 본다')
})

test('파이프라인이 이미지 없이 buildGenerationInput 을 부를 수 없다', () => {
  const src = read('lib/twin/pipeline.ts')
  // 1단계의 isEligible 에 image_path 가 실려 있어야 한다
  assert.ok(src.includes('image_path: source.image_path'),
    '대상 확인에 image_path 가 빠졌습니다')
  // 5단계의 방어가 `source.image_path && ...` 같은 조건부가 아니라 무조건이어야 한다
  assert.ok(src.includes('if (!imageDataUrl) {'),
    '이미지 없음을 무조건 막지 않습니다')
  // isEligible 호출이 buildGenerationInput 보다 앞에 있어야 한다
  assert.ok(src.indexOf('isEligible(') < src.indexOf('buildGenerationInput('))
})

// ── 앱 조회·RPC·검증에 조건이 모두 있는가 ───────────────────────────

test('앱 조회가 image_path null 을 걸러낸다', () => {
  const src = read('lib/twin/targets.ts')
  assert.ok(src.includes(".not('image_path', 'is', null)"))
  assert.ok(src.includes("p.image_path.trim() === ''"), '빈 문자열 방어가 없습니다')
})

test('유형 집계 RPC 의 세 count 가 같은 생성 가능 조건을 쓴다', () => {
  const code = sqlCode(SQL_INSTALL)
  const start = code.indexOf('create function public.server_list_eligible_twin_types')
  assert.ok(start > 0)
  const body = code.slice(start, code.indexOf('$fn$;', start))

  // eligible · number_count · choice_count · HAVING 네 곳 모두에 조건이 있어야 한다
  const imageGuards = body.match(/p\.image_path is not null and btrim\(p\.image_path\) <> /g) ?? []
  assert.equal(imageGuards.length, 4, `image_path 조건이 ${imageGuards.length}곳뿐입니다`)
  const essayGuards = body.match(/p\.is_essay = false/g) ?? []
  assert.equal(essayGuards.length, 4, `is_essay 조건이 ${essayGuards.length}곳뿐입니다`)
  // 느슨한 옛 count 가 남아 있으면 안 된다
  assert.ok(!/p\.answer_kind = 'number' and p\.answer_text is not null\)/.test(read(SQL_INSTALL)))
})

test('생성 RPC 가 image_path 를 읽어 다시 검사한다', () => {
  const code = sqlCode(SQL_INSTALL)
  assert.ok(/into v_src from public\.problems/.test(code))
  assert.ok(/is_essay, type_code, image_path/.test(code), 'RPC 가 image_path 를 읽지 않습니다')
  assert.ok(/v_src\.image_path is null or btrim\(v_src\.image_path\) = /.test(code))
  assert.ok(read(SQL_INSTALL).includes("'source_image_missing'"))
})

test('설치후 검증의 정상 원문 선정이 image_path 를 요구한다', () => {
  const code = sqlCode(SQL_VERIFY)
  assert.ok(/image_path is not null and btrim\(image_path\) <> /.test(code))
})

test('설치후 검증에 이미지 없는 원문 음성 테스트가 있다', () => {
  const v = read(SQL_VERIFY)
  assert.ok(v.includes('source_image_missing'))
  // 그런 원문이 없을 때 조용히 통과시키지 않고 건너뜀을 남긴다 (§108)
  assert.ok(v.includes('이미지 없는 대상 원문이 없어 건너뜁니다'))
})

test('source_image_missing 이 안정 코드 목록에 있다', () => {
  assert.ok(KNOWN_CODES.has('source_image_missing'))
})

// ════════════════════════════════════════════════════════════════════
// B) Storage 파일 판별 (작업 B)
// ════════════════════════════════════════════════════════════════════

function fakeDb(list: unknown[]) {
  return {
    storage: {
      from: () => ({
        list: async (): Promise<{ data: unknown[]; error: unknown }> => ({ data: list, error: null }),
        download: async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: 'no' }),
      }),
    },
  } as never
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'obj-1',
  name: '0001.png',
  updated_at: '2026-01-01T00:00:00Z',
  metadata: { eTag: '"abc123"' },
  ...over,
})

async function reason(over: Record<string, unknown>): Promise<string> {
  try {
    await loadStorageMeta(fakeDb([row(over)]), PATH)
    return 'PASSED'
  } catch (e) {
    assert.ok(e instanceof StorageError, String(e))
    return (e as Error).message.split(':').pop() ?? ''
  }
}

test('id 가 비어 있지 않은 문자열일 때만 파일로 인정한다', async () => {
  const bads: unknown[] = [null, undefined, '', '   ', 0, 123, {}, []]
  for (const bad of bads) {
    assert.equal(await reason({ id: bad }), 'not_a_file', JSON.stringify(bad))
  }
  assert.notEqual(await reason({ id: 'obj-2' }), 'not_a_file')
})

test('updated_at 은 비어 있지 않은 문자열이어야 한다', async () => {
  const bads: unknown[] = [null, undefined, '', '   ', 0, 1700000000, {}, []]
  for (const bad of bads) {
    assert.equal(await reason({ updated_at: bad }), 'updated_at_missing', JSON.stringify(bad))
  }
})

test('metadata 는 null 이 아닌 객체여야 한다', async () => {
  const bads: unknown[] = [null, undefined, 'eTag=abc', 123, []]
  for (const bad of bads) {
    assert.equal(await reason({ metadata: bad }), 'metadata_missing', JSON.stringify(bad))
  }
})

test('ETag 는 문자열일 때만 인정한다', async () => {
  assert.equal(await reason({ metadata: { eTag: 123 } }), 'etag_missing')
  assert.equal(await reason({ metadata: { etag: null } }), 'etag_missing')
  assert.equal(await reason({ metadata: { eTag: '""' } }), 'etag_missing')
  assert.equal(await reason({ metadata: { size: 100 } }), 'etag_missing')
})

test('정상 항목만 통과한다', async () => {
  const a = await loadStorageMeta(fakeDb([row()]), PATH)
  assert.equal(a.updated_at, '2026-01-01T00:00:00Z')
  assert.equal(a.etag, 'abc123')
  // 소문자 키도 받는다
  const b = await loadStorageMeta(fakeDb([row({ metadata: { etag: 'zz' } })]), PATH)
  assert.equal(b.etag, 'zz')
})

test('모양 검사가 예외로 터지지 않고 안정 사유로 끝난다', async () => {
  // .trim() 을 숫자에 걸면 TypeError 가 난다. 그런 게 새어 나오면 안 된다
  for (const over of [{ id: 1 }, { updated_at: 1 }, { metadata: 1 }]) {
    const r = await reason(over)
    assert.ok(['not_a_file', 'updated_at_missing', 'metadata_missing'].includes(r), r)
  }
})

// ════════════════════════════════════════════════════════════════════
// C) 사전점검 판정 재설계 (D-089)
// ════════════════════════════════════════════════════════════════════

test('Storage 필수 칼럼 5개를 본다', () => {
  const pre = read(SQL_PRECHECK)
  const m = /array\['id','bucket_id','name','updated_at','metadata'\]/.exec(pre)
  assert.ok(m, 'Storage 필수 칼럼 목록이 5개가 아닙니다')
})

test('구조가 불완전하면 데이터 점검을 실행하지 않는다', () => {
  const pre = read(SQL_PRECHECK)
  // 없는 칼럼을 참조하면 중간 SQL 오류로 최종 판정까지 못 간다 (§152)
  // GPT-EXEC-010 D-094 로 문제 구조 가드가 함께 붙었다
  assert.ok(pre.includes('if not v_storage_ok or not v_problem_ok then'))
  assert.ok(pre.includes('건너뜀 (구조가 불완전)'))
  // storage.objects 참조가 전부 가드 뒤에 있어야 한다
  const guard = pre.indexOf('v_storage_ok := true')
  const refs = [...pre.matchAll(/from storage\.objects|join storage\.objects/g)].map(m => m.index ?? 0)
  assert.ok(refs.length > 0)
  for (const i of refs) assert.ok(i > guard, `가드 앞에서 storage.objects 를 참조합니다 (pos=${i})`)
})

test('Storage 데이터 불량은 경고이고 전체 중단이 아니다 (D-089)', () => {
  const pre = read(SQL_PRECHECK)
  for (const n of ['[20]', '[21]', '[22]']) {
    const line = pre.split(NL).find(l => l.includes(n) && l.includes('raise notice'))
    assert.ok(line, `${n} 줄이 없습니다`)
    assert.ok(line!.includes('경고·제외'), `${n} 이 경고가 아닙니다`)
    assert.ok(!line!.includes('중단'), `${n} 이 아직 중단입니다`)
  }
  // 그 줄들 뒤에 v_fail 증가가 붙어 있지 않아야 한다
  const block = pre.slice(pre.indexOf("'[20]"), pre.indexOf("'[23]"))
  assert.ok(!block.includes('v_fail := v_fail + 1'), '경고 항목이 아직 중단 수를 올립니다')
})

test('사용 가능 원문·유형이 0이면 중단한다 (D-089)', () => {
  const pre = read(SQL_PRECHECK)
  const usable = pre.slice(pre.indexOf("'[23]"), pre.indexOf("'[참고]"))
  assert.ok(usable.includes('v_fail := v_fail + 1'), '준비도 중단이 없습니다')
  assert.ok(pre.includes('if v_usable > 0 then'))
  assert.ok(pre.includes('if v_usable_types > 0 then'))
})

test('집계가 조인 때문에 부풀지 않는다', () => {
  const pre = read(SQL_PRECHECK)
  const block = pre.slice(pre.indexOf('into v_with_image') - 2000, pre.indexOf('into v_with_image'))
  assert.ok(block.includes('count(distinct p.id)'), 'count(distinct p.id) 를 쓰지 않습니다')
  assert.ok(!/count\(\*\) filter \(where o\.id is null\)/.test(pre))
})

test('사용 가능 판정에 세 조건이 모두 들어 있다 (§178)', () => {
  const pre = read(SQL_PRECHECK)
  const block = pre.slice(pre.indexOf('into v_with_image') - 1200, pre.indexOf('into v_with_image'))
  assert.ok(block.includes('o.id is not null'))
  assert.ok(block.includes('o.updated_at is not null'))
  assert.ok(block.includes("o.metadata->>'eTag'") && block.includes("o.metadata->>'etag'"))
})

test('ETag 후보 키를 SQL 에서도 늘리지 않았다', () => {
  const pre = read(SQL_PRECHECK)
  const keys = [...pre.matchAll(/metadata->>'(\w+)'/g)].map(m => m[1])
  assert.deepEqual([...new Set(keys)].sort(), ['eTag', 'etag'])
})

test('사전점검이 사용 가능 원문·유형 수를 출력한다 (§168)', () => {
  const pre = read(SQL_PRECHECK)
  assert.ok(pre.includes('사용 가능 원문'))
  assert.ok(pre.includes('사용 가능 파일럿 유형'))
  assert.ok(pre.includes('기본조건 중 이미지 없음'), 'D-088 제외 수가 없습니다')
})

test('사전점검이 여전히 읽기 전용이다', () => {
  const code = sqlCode(SQL_PRECHECK)
  const found: string[] = []
  for (const w of ['insert', 'update', 'delete', 'create', 'alter',
                   'drop', 'grant', 'revoke', 'truncate']) {
    const hits = code.match(new RegExp(`\\b${w}\\b`, 'gi'))
    if (hits) found.push(`${w}:${hits.length}`)
  }
  assert.deepEqual(found, [], `변경문이 있습니다: ${found.join(' ')}`)
  assert.ok(!/\btemp\b|\btemporary\b/i.test(code))
})

test('사전점검이 최종 판정까지 도달하고 실패는 예외로 끝난다', () => {
  const pre = read(SQL_PRECHECK)
  const tail = pre.slice(pre.indexOf('판정: 전부 OK'))
  assert.ok(tail.includes('raise exception'))
})

// ════════════════════════════════════════════════════════════════════
// D) is_essay 코드 분리 (D-090)
// ════════════════════════════════════════════════════════════════════

test('두 코드가 안정 코드 목록에 있다', () => {
  assert.ok(KNOWN_CODES.has('source_is_essay'))
  assert.ok(KNOWN_CODES.has('source_is_essay_unknown'))
})

test('부분문자열 때문에 _unknown 이 짧은 코드로 잘못 보고되지 않는다', async () => {
  // toError 는 export 되지 않으므로 저장소를 통해 확인한다
  const { SupabaseServerRepository } = await import('./repository')
  const db = {
    rpc: async (): Promise<{ data: unknown; error: { message: string } }> =>
      ({ data: null, error: { message: 'source_is_essay_unknown' } }),
  } as never
  const repo = new SupabaseServerRepository(db)
  await assert.rejects(
    () => repo.createCandidate({} as never),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, 'source_is_essay_unknown')
      return true
    },
  )
})

test('짧은 코드는 그대로 보고된다', async () => {
  const { SupabaseServerRepository } = await import('./repository')
  const db = {
    rpc: async (): Promise<{ data: unknown; error: { message: string } }> =>
      ({ data: null, error: { message: 'source_is_essay' } }),
  } as never
  const repo = new SupabaseServerRepository(db)
  await assert.rejects(
    () => repo.createCandidate({} as never),
    (e: unknown) => {
      assert.equal((e as { code: string }).code, 'source_is_essay')
      return true
    },
  )
})

test('앱의 1·2차 필터는 true 와 null 을 모두 제외한다', () => {
  assert.equal(isEligible({ ...OK_SOURCE, is_essay: true }), false)
  assert.equal(isEligible({ ...OK_SOURCE, is_essay: null }), false)
})

test('설치후 검증이 두 경로를 각각 본다', () => {
  const v = read(SQL_VERIFY)
  assert.ok(v.includes('source_is_essay_unknown'))
  assert.ok(v.includes('D-090 분기 오류'), 'true 가 _unknown 으로 새는 경우를 보지 않습니다')
  assert.ok(v.includes('is_essay=null 인 대상 원문이 없어 건너뜁니다'))
  assert.ok(v.includes('서술형 대상 원문이 없어 건너뜁니다'))
})
