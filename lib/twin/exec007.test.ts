// GPT-EXEC-007 회귀 테스트 — 006 검수 결함 8개
//
// 실행: npm run test:twin
//
// 006 이 반려된 이유를 하나씩 못으로 박는다.
//   1) 대상 재확인이 상수를 봤다            → A) 실제 twin_id·is_essay
//   2) 이미지 실패해도 null 로 진행했다     → B) fail closed
//   3) 유사도가 정답과 본문을 비교했다      → C) null
//   4) 같은 batch 재시도가 멱등적이지 않았다 → D) 캐시
//   5) 후보 번호·batch·개수를 안 막았다     → E) 입력 계약
//   6) verified 역방향 불일치를 허용했다    → F) 양방향 불변식
//   7) 유형 목록이 타입 단언으로 통과했다   → F) Zod 엄격 파싱
//   8) tar.gz 가 기본 옵션에서 깨졌다       → G) 묶음
//
// **외부 호출 0회**를 세는 것이 이 파일의 핵심이다. mock 이 몇 번 불렸는지 직접 센다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  runTwinPipelineForSource, summarize, isUuid,
  REQUIRED_CANDIDATE_COUNT, REQUIRED_CANDIDATE_NOS,
  type PipelineDeps,
} from './pipeline'
import type {
  BatchCandidateState, CreateCandidatePayload, ServerTwinRepository, ValidationUpdate,
} from './repository'
import type { Transport } from './generate'
import type { SourceProblem } from './targets'
import type { StorageMeta } from './fingerprint'
import { mimeOf, StorageError } from './storage'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const SQL_INSTALL = 'docs/sql/쌍둥이_설치.sql'
const SQL_PRECHECK = 'docs/sql/쌍둥이_설치전_점검.sql'
const SQL_VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const SQL_ROLLBACK = 'docs/sql/쌍둥이_롤백.sql'

const BATCH = '77777777-7777-4777-8777-777777777777'
const META: StorageMeta = { updated_at: '2026-01-01T00:00:00Z', etag: 'abc' }

// ════════════════════════════════════════════════════════════════════
// 준비 — 호출 횟수를 세는 mock
// ════════════════════════════════════════════════════════════════════

const source: SourceProblem = {
  id: 5479, book: '쎈', grade: '공통수학1', semester: 1,
  type_code: '공수1-09-09', step: 'B', difficulty: '대표',
  answer_kind: 'number', answer_text: '12', image_path: 'hc1-1/ssen/09/0001.png',
  twin_id: null, is_essay: false,
}

function fakeCandidate(no: number, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    candidate_no: no,
    variant_kind: 'mixed',
    problem_text_latex: '서로 다른 5개의 문자 중 2개를 뽑아 일렬로 나열하는 경우의 수를 구하시오.',
    answer_kind: 'number',
    answer_text: '20',
    solution_outline: ['공식을 떠올린다', '대입한다', '계산한다'],
    concepts: ['순열'],
    type_code: '공수1-09-09',
    difficulty_delta: 0,
    common_mistakes: ['조합과 혼동'],
    transformations: ['계수·수치', '문장 맥락'],
    reverse_derivation_risk: 'low',
    single_answer_claim: true,
    needs_new_image: false,
    self_check_notes: ['검산 완료'],
    ...over,
  }
}

function genPayload(nos: number[]): Record<string, unknown> {
  return {
    schema_version: '1.0',
    generation_status: 'generated',
    unsupported_reason: null,
    source_summary: {
      core_concepts: ['순열'], solution_structure: ['공식', '대입'], estimated_difficulty: 'medium',
    },
    candidates: nos.map((n, i) => fakeCandidate(n, {
      answer_text: String(20 + i * 10),
      problem_text_latex: `서로 다른 ${5 + i}개의 문자 중 2개를 뽑아 일렬로 나열하는 경우의 수를 구하시오.`,
    })),
  }
}

class Counter {
  storageMeta = 0
  image = 0
  generation = 0
  review = 0
  batchState = 0
  create = 0
  update = 0

  /** 모델·Storage·DB 쓰기를 한 번도 하지 않았는가 */
  get externalCalls(): number {
    return this.storageMeta + this.image + this.generation + this.review + this.create + this.update
  }
  /** batch 조회는 읽기 전용이라 따로 센다 */
  get writeCalls(): number {
    return this.image + this.generation + this.review + this.create + this.update
  }
}

class Repo implements ServerTwinRepository {
  created: CreateCandidatePayload[] = []
  updated: Array<{ id: string; v: ValidationUpdate }> = []
  batchRows: BatchCandidateState[] = []
  failCreate = false
  failBatchState = false

  constructor(private c: Counter) {}

  async getBatchState(): Promise<BatchCandidateState[]> {
    this.c.batchState++
    if (this.failBatchState) throw new Error('batch 조회 실패')
    return this.batchRows
  }
  async createCandidate(p: CreateCandidatePayload): Promise<string> {
    this.c.create++
    if (this.failCreate) throw new Error('저장 실패')
    this.created.push(p)
    return `cand-${this.created.length}`
  }
  async updateValidation(id: string, v: ValidationUpdate): Promise<void> {
    this.c.update++
    this.updated.push({ id, v })
  }
}

type Harness = { deps: PipelineDeps; counter: Counter; repo: Repo }

function harness(over: Partial<PipelineDeps> = {}, genNos: number[] = [1, 2]): Harness {
  const counter = new Counter()
  const repo = new Repo(counter)

  const generationTransport: Transport = async () => {
    counter.generation++
    return { output_parsed: genPayload(genNos) }
  }
  /**
   * **정상** 검토 대역 — 034 §109 로 고쳤다.
   *
   * 예전 모양 `{ai_answer_text, ai_flags, ai_issues}` 는 `TwinReviewResult`
   * (`schema.ts:57-67`) 에 **없는 모양**이라 `safeParse` 를 한 번도 통과하지 못했다.
   * 그래서 "정상 검토" 를 시험한다고 적어 둔 자리가 실제로는 parse_error 분기를 돌고 있었다.
   * (파이프라인이 `kind='ok'`·합의 false 로 끝나 시험은 통과해 왔다.)
   *
   * 이제 실제 스키마로 돌려주므로 **합의 분기가 실제로 실행된다.**
   * 답은 후보 1(`answer_text: '20'`)과 같아 합의가 true 가 된다.
   * **의도적 음성 대역은 그대로 둔다** — 아래 `ai_review_*` 를 보는 시험이 그것이다.
   */
  const reviewTransport: Transport = async () => {
    counter.review++
    return {
      output_parsed: {
        valid: true,
        answer_kind: 'number',
        answer_text: '20',
        single_answer: true,
        missing_condition: false,
        ambiguous: false,
        curriculum_mismatch: false,
        solution_outline: ['공식을 떠올린다', '대입한다'],
        issues: [],
      },
    }
  }

  const deps: PipelineDeps = {
    loadStorageMeta: async () => { counter.storageMeta++; return META },
    loadImageDataUrl: async (p) => {
      counter.image++
      return p ? 'data:image/png;base64,AAAA' : null
    },
    generationTransport,
    reviewTransport,
    repo,
    generationInstructions: '생성 지침',
    reviewInstructions: '검토 지침',
    ...over,
  }
  return { deps, counter, repo }
}

const run = (h: Harness, over: Partial<{ source: SourceProblem; batchId: string; candidateCount: number }> = {}) =>
  runTwinPipelineForSource({
    source: over.source ?? source,
    batchId: over.batchId ?? BATCH,
    candidateCount: over.candidateCount,
    deps: h.deps,
  })

// ════════════════════════════════════════════════════════════════════
// 결함 1 · 작업 A — 대상 재확인이 실제 원문 상태를 본다 (D-077)
// ════════════════════════════════════════════════════════════════════

test('SourceProblem 에 twin_id 와 is_essay 가 실려 있다', () => {
  assert.equal(source.twin_id, null)
  assert.equal(source.is_essay, false)
  const src = read('lib/twin/targets.ts')
  assert.ok(src.includes('twin_id: number | null'))
  assert.ok(src.includes('is_essay: boolean'))
})

test('twin_id 가 있는 원문은 생성 모델을 부르지 않는다', async () => {
  const h = harness()
  const r = await run(h, { source: { ...source, twin_id: 999 } })
  assert.equal(r.kind, 'skipped')
  assert.equal(h.counter.externalCalls, 0)
  assert.equal(h.counter.batchState, 0)
})

test('서술형 원문은 생성 모델을 부르지 않는다', async () => {
  const h = harness()
  const r = await run(h, { source: { ...source, is_essay: true } })
  assert.equal(r.kind, 'skipped')
  assert.equal(h.counter.externalCalls, 0)
})

test('빈 정답·지원 밖 answer_kind·빈 type_code 도 모두 0회로 끝난다', async () => {
  for (const over of [
    { answer_text: '   ' },
    { answer_kind: 'essay' as unknown as 'number' },
    { type_code: '  ' },
  ]) {
    const h = harness()
    const r = await run(h, { source: { ...source, ...over } })
    assert.equal(r.kind, 'skipped', JSON.stringify(over))
    assert.equal(h.counter.externalCalls, 0, JSON.stringify(over))
  }
})

test('파이프라인이 twin_id·is_essay 에 상수를 넣지 않는다', () => {
  const src = read('lib/twin/pipeline.ts')
  assert.ok(!/twin_id:\s*null\s*,\s*answer_text/.test(src), '상수 대입이 남아 있습니다')
  assert.ok(src.includes('twin_id: source.twin_id'))
  assert.ok(src.includes('is_essay: source.is_essay'))
})

// ════════════════════════════════════════════════════════════════════
// 결함 2 · 작업 B — 이미지와 Storage 메타 fail closed (D-075)
// ════════════════════════════════════════════════════════════════════

test('이미지 경로가 있는데 로더가 null 을 주면 모델을 부르지 않는다', async () => {
  const h = harness({ loadImageDataUrl: async () => null })
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') {
    assert.equal(r.stage, 'storage')
    assert.equal(r.code, 'image_load_failed')
  }
  assert.equal(h.counter.generation, 0)
  assert.equal(h.counter.review, 0)
  assert.equal(h.counter.create, 0)
  assert.equal(h.counter.update, 0)
})

test('이미지 로더가 예외를 던져도 모델을 부르지 않는다', async () => {
  const h = harness({
    loadImageDataUrl: async () => { throw new StorageError('image_load_failed', 'a/b.png', 'empty_file') },
  })
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  assert.equal(h.counter.generation + h.counter.review + h.counter.create + h.counter.update, 0)
})

test('Storage 메타 실패는 batch 조회 전에 끝난다', async () => {
  const h = harness({ loadStorageMeta: async () => { throw new StorageError('storage_meta_unavailable', 'a/b.png') } })
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') assert.equal(r.stage, 'fingerprint')
  assert.equal(h.counter.batchState, 0)
  assert.equal(h.counter.writeCalls, 0)
})

// D-088 (GPT-EXEC-009) 로 전제가 바뀌었다.
// 예전에는 "이미지가 없는 원문은 null 입력으로 생성까지 간다" 가 정상이었다.
// 지금은 그 경로 자체가 **대상 조건 위반**이다 — problem_ocr 이 늘 null 이라
// 이미지가 없으면 모델이 원문을 전혀 보지 못한 채 쌍둥이를 만들기 때문이다.
test('이미지가 없는 원문은 생성까지 가지 않는다 (D-088)', async () => {
  const h = harness()
  const r = await run(h, { source: { ...source, image_path: null } })
  assert.equal(r.kind, 'skipped')
  assert.equal(h.counter.externalCalls, 0)
  assert.equal(h.counter.batchState, 0)
})

test('허용 밖 확장자는 MIME 을 주지 않는다', () => {
  assert.equal(mimeOf('a/b.png'), 'image/png')
  assert.equal(mimeOf('a/b.JPG'), 'image/jpeg')
  assert.equal(mimeOf('a/b.webp'), 'image/webp')
  assert.equal(mimeOf('a/b.gif'), null)
  assert.equal(mimeOf('a/b.svg'), null)
  assert.equal(mimeOf('a/b'), null)
})

test('storage 모듈이 실패를 null 로 돌려주지 않는다', () => {
  const src = read('lib/twin/storage.ts')
  // 이미지 로더에서 null 을 주는 곳은 "경로가 없을 때" 하나뿐이어야 한다
  const loader = src.slice(src.indexOf('export async function loadSourceImageDataUrl'))
  const returnsNull = loader.match(/return null/g) ?? []
  assert.equal(returnsNull.length, 1, '실패 경로에서 null 을 돌려주고 있습니다')
  assert.ok(loader.includes("if (!imagePath || imagePath.trim() === '') return null"))
})

test('옛 loadSourceImageAsDataUrl 을 호환용으로 남기지 않았다', () => {
  for (const f of ['lib/twin/source.ts', 'lib/twin/storage.ts', 'lib/twin/pipeline.ts']) {
    assert.ok(!/export .*loadSourceImageAsDataUrl/.test(read(f)), `${f} 에 옛 이름이 남아 있습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 결함 3 · 작업 C — 가짜 유사도 제거 (D-074)
// ════════════════════════════════════════════════════════════════════

test('원문 정답이 무엇이든 저장되는 유사도는 null 이다', async () => {
  for (const answer of ['12', '0', '①②③', '서로 다른 4개의 문자']) {
    const h = harness()
    await run(h, { source: { ...source, answer_text: answer } })
    assert.ok(h.repo.updated.length > 0)
    for (const u of h.repo.updated) {
      assert.equal(u.v.similarity_to_source, null, `answer=${answer}`)
    }
  }
})

test('source.answer_text 를 유사도 함수의 인자로 넘기는 코드가 없다', () => {
  for (const f of ['lib/twin/pipeline.ts', 'lib/twin/verify.ts', 'lib/twin/repository.ts']) {
    const code = read(f)
      .split(String.fromCharCode(10))
      .filter(l => !l.trim().startsWith('//'))
      .join(String.fromCharCode(10))
    assert.ok(!/similarityToSource\s*\(/.test(code), `${f} 에서 아직 유사도 함수를 부릅니다`)
  }
})

test('verify 모듈이 similarityToSource 를 더는 내보내지 않는다', async () => {
  const mod = await import('./verify') as Record<string, unknown>
  assert.equal(mod.similarityToSource, undefined)
})

// ════════════════════════════════════════════════════════════════════
// 결함 4 · 작업 D — 같은 batch 재시도가 멱등적이다 (D-076)
// ════════════════════════════════════════════════════════════════════

const completeBatch: BatchCandidateState[] = [
  { batch_id: BATCH, candidate_no: 1, candidate_id: '11111111-1111-4111-8111-111111111111', status: 'pending_review' },
  { batch_id: BATCH, candidate_no: 2, candidate_id: '22222222-2222-4222-8222-222222222222', status: 'rejected' },
]

test('완결된 같은 batch 재시도는 이미지·모델·DB 쓰기를 0회 한다', async () => {
  const h = harness()
  h.repo.batchRows = completeBatch
  const r = await run(h)
  assert.equal(r.kind, 'cached')
  if (r.kind === 'cached') {
    assert.equal(r.batch_id, BATCH)
    assert.equal(r.candidates.length, 2)
  }
  assert.equal(h.counter.batchState, 1)
  assert.equal(h.counter.writeCalls, 0)
})

test('후보가 하나만 있는 batch 는 자동 보충하지 않고 중단한다', async () => {
  const h = harness()
  h.repo.batchRows = [completeBatch[0]]
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') {
    assert.equal(r.stage, 'cache')
    assert.equal(r.code, 'incomplete_batch')
  }
  assert.equal(h.counter.writeCalls, 0)
})

test('아직 검증 갱신 전인 batch 도 완결이 아니다', async () => {
  const h = harness()
  h.repo.batchRows = [
    { ...completeBatch[0], status: 'generated' },
    completeBatch[1],
  ]
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') assert.equal(r.code, 'incomplete_batch')
  assert.equal(h.counter.writeCalls, 0)
})

test('후보 번호가 어긋난 batch 도 중단한다', async () => {
  const h = harness()
  h.repo.batchRows = [completeBatch[0], { ...completeBatch[1], candidate_no: 3 }]
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') assert.equal(r.code, 'incomplete_batch')
})

test('batch 가 비어 있으면 평소대로 생성한다', async () => {
  const h = harness()
  h.repo.batchRows = []
  const r = await run(h)
  assert.equal(r.kind, 'ok')
  assert.equal(h.counter.generation, 1)
  assert.equal(h.counter.create, 2)
})

test('batch 조회에 쓰는 키에 fingerprint 와 prompt version 이 들어간다', () => {
  const src = read('lib/twin/pipeline.ts')
  const block = src.slice(src.indexOf('deps.repo.getBatchState'), src.indexOf('deps.repo.getBatchState') + 400)
  for (const k of ['source_problem_id', 'source_fingerprint', 'prompt_version', 'batch_id']) {
    assert.ok(block.includes(k), `batch 조회 키에 ${k} 가 없습니다`)
  }
  // fingerprint 는 원문 정답·유형·이미지가 바뀌면 달라지므로,
  // 원문이 바뀐 뒤의 재시도가 옛 batch 를 재사용하지 않는다
  assert.ok(block.includes('source_fingerprint: fingerprint'))
})

test('batch 조회 실패를 빈 목록으로 보지 않는다', async () => {
  const h = harness()
  h.repo.failBatchState = true
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') {
    assert.equal(r.stage, 'cache')
    assert.equal(r.code, 'batch_state_unavailable')
  }
  assert.equal(h.counter.writeCalls, 0)
})

// ════════════════════════════════════════════════════════════════════
// 결함 5 · 작업 E — 입력·응답 계약을 모델 호출 전에 닫는다
// ════════════════════════════════════════════════════════════════════

test('candidateCount 는 정확히 2만 허용한다', async () => {
  assert.equal(REQUIRED_CANDIDATE_COUNT, 2)
  for (const n of [0, 1, 3, 10]) {
    const h = harness()
    const r = await run(h, { candidateCount: n })
    assert.equal(r.kind, 'failed', `count=${n}`)
    if (r.kind === 'failed') {
      assert.equal(r.stage, 'input')
      assert.equal(r.code, 'invalid_candidate_count')
    }
    assert.equal(h.counter.externalCalls, 0, `count=${n}`)
    assert.equal(h.counter.batchState, 0, `count=${n}`)
  }
})

test('batchId 가 UUID 가 아니면 아무것도 부르지 않는다', async () => {
  for (const bad of ['', 'batch-1', '1234', 'zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz']) {
    const h = harness()
    const r = await run(h, { batchId: bad })
    assert.equal(r.kind, 'failed', `batch=${bad}`)
    if (r.kind === 'failed') {
      assert.equal(r.stage, 'input')
      assert.equal(r.code, 'invalid_batch_id')
    }
    assert.equal(h.counter.externalCalls, 0, `batch=${bad}`)
    assert.equal(h.counter.batchState, 0, `batch=${bad}`)
  }
})

test('isUuid 가 형식을 정확히 본다', () => {
  assert.equal(isUuid(BATCH), true)
  assert.equal(isUuid('77777777-7777-4777-8777-77777777777'), false)   // 한 자 모자람
  assert.equal(isUuid(null), false)
  assert.equal(isUuid(12345), false)
})

test('파이프라인이 batchId 를 스스로 만들지 않는다', () => {
  const src = read('lib/twin/pipeline.ts')
  assert.ok(!src.includes('randomUUID'), '내부에서 batch UUID 를 만들고 있습니다')
  assert.ok(!/batchId\s*=\s*args\.batchId\s*\?\?/.test(src))
})

test('후보 번호 집합이 {1,2} 가 아니면 저장 0건이다', async () => {
  assert.deepEqual([...REQUIRED_CANDIDATE_NOS], [1, 2])
  for (const nos of [[1, 1], [1, 3], [2], [1, 2, 3], [0, 1]]) {
    const h = harness({}, nos)
    const r = await run(h)
    assert.equal(r.kind, 'failed', JSON.stringify(nos))
    if (r.kind === 'failed') {
      assert.equal(r.stage, 'generation')
      assert.equal(r.code, 'invalid_candidate_numbers')
    }
    assert.equal(h.counter.create, 0, JSON.stringify(nos))
    assert.equal(h.counter.update, 0, JSON.stringify(nos))
    assert.equal(h.counter.review, 0, JSON.stringify(nos))
  }
})

test('정상 [1,2] 만 후보별 검증으로 진행한다', async () => {
  const h = harness({}, [1, 2])
  const r = await run(h)
  assert.equal(r.kind, 'ok')
  assert.equal(h.counter.create, 2)
  assert.equal(h.counter.update, 2)
  if (r.kind === 'ok') {
    assert.deepEqual(r.candidates.map(c => c.candidate_no).sort(), [1, 2])
  }
})

test('GenerationOutcome 에 raw 가 없다 (D-079)', async () => {
  const src = read('lib/twin/generate.ts')
  assert.ok(!/raw:\s*unknown/.test(src), '타입에 raw 가 남아 있습니다')
  assert.ok(!src.includes('raw: raw.output_parsed'), '반환값에 raw 가 남아 있습니다')

  const { generateCandidates } = await import('./generate')
  const { buildGenerationInput } = await import('./source')
  const out = await generateCandidates({
    instructions: '',
    input: buildGenerationInput(source, 2),
    imageDataUrl: null,
    transport: async () => ({ output_parsed: genPayload([1, 2]) }),
  })
  assert.equal(out.kind, 'ok')
  assert.ok(!('raw' in (out as Record<string, unknown>)))
})

test('후보 번호 실패에서 모델 원응답이 결과에 담기지 않는다', async () => {
  const h = harness({}, [1, 1])
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  if (r.kind === 'failed') {
    // 후보 본문·정답이 detail 에 들어가면 안 된다
    assert.ok(!r.detail.includes('나열하는 경우의 수'))
    assert.ok(!r.detail.includes('20'))
  }
})

// ════════════════════════════════════════════════════════════════════
// 파이프라인 — 006 에서 유지해야 하는 성질
// ════════════════════════════════════════════════════════════════════

test('AI 가 동의해도 결정론적 검산 없이는 unverified 로 사람 검수에 간다', async () => {
  const h = harness()
  const r = await run(h)
  assert.equal(r.kind, 'ok')
  for (const u of h.repo.updated) {
    assert.equal(u.v.deterministic_check_passed, false)
    assert.equal(u.v.verification_status, 'unverified')
    assert.equal(u.v.unverified_reason, 'no_cas')
  }
  if (r.kind === 'ok') assert.ok(r.candidates.every(c => c.status === 'pending_review'))
})

test('저장한 후보에 batch_id 가 그대로 실린다', async () => {
  const h = harness()
  await run(h)
  assert.equal(h.repo.created.length, 2)
  for (const p of h.repo.created) assert.equal(p.batch_id, BATCH)
})

test('저장 실패를 성공처럼 보고하지 않는다', async () => {
  const h = harness()
  h.repo.failCreate = true
  const r = await run(h)
  assert.equal(r.kind, 'ok')
  if (r.kind === 'ok') {
    assert.ok(r.candidates.every(c => c.status === 'rejected' && c.error))
    const s = summarize([r])
    assert.equal(s.pendingReview, 0)
    assert.equal(s.errors.length, 2)
  }
})

test('생성 transport 오류는 후보를 남기지 않는다', async () => {
  const h = harness({ generationTransport: async () => { throw new Error('네트워크') } })
  const r = await run(h)
  assert.equal(r.kind, 'failed')
  assert.equal(h.counter.create, 0)
})

test('AI 검토가 실패해도 독립 검산이 켜지지 않는다', async () => {
  const h = harness({ reviewTransport: async () => { throw new Error('검토 실패') } })
  await run(h)
  for (const u of h.repo.updated) {
    assert.equal(u.v.ai_consensus_passed, false)
    assert.equal(u.v.deterministic_check_passed, false)
    assert.ok(u.v.ai_issues.some(i => i.startsWith('ai_review_')))
  }
})

test('summarize 가 cached 를 성공 생성으로 세지 않는다', async () => {
  const h = harness()
  h.repo.batchRows = completeBatch
  const r = await run(h)
  const s = summarize([r])
  assert.equal(s.cached, 1)
  assert.equal(s.sources_ok, 0)
  assert.equal(s.pendingReview, 0)
})

// ════════════════════════════════════════════════════════════════════
// 결함 6·7 · 작업 F — SQL 불변식과 엄격 파싱
// ════════════════════════════════════════════════════════════════════

test('verified 역방향 불변식이 테이블 CHECK 에 있다 (D-078)', () => {
  const sql = read(SQL_INSTALL)
  assert.ok(sql.includes("verification_status <> 'verified'"),
    '역방향 불변식이 CHECK 에 없습니다')
  assert.match(sql, /verification_status <> 'verified'[\s\S]{0,200}check_method in \('rule','cas'\)/)
})

test('verified 역방향 불변식이 RPC 에도 있다', () => {
  const sql = read(SQL_INSTALL)
  assert.match(sql, /if v_vs = 'verified' and not \(v_det and coalesce\(v_cm,''\) in \('rule','cas'\)\) then/)
})

test('값 제한 CHECK 가 null 을 허용한다', () => {
  const sql = read(SQL_INSTALL)
  for (const col of ['variant_kind', 'difficulty_delta', 'reverse_derivation_risk']) {
    assert.ok(sql.includes(`${col} is null or`), `${col} CHECK 가 null 을 막고 있습니다`)
  }
})

test('SQL 의 허용값이 schema.ts 의 계약과 같다', async () => {
  // 여기서 값을 임의로 좁히면 **모델이 낸 정상 후보가 DB 에서 거부된다.**
  // 실제로 007 작업 중 한 번 어긋났다 (structure / -2..2 로 잘못 적었다).
  const { VariantKind } = await import('./schema') as { VariantKind: { options: string[] } }
  const sql = read(SQL_INSTALL)
  const list = VariantKind.options.map(v => `'${v}'`).join(',')
  assert.ok(sql.includes(list), `SQL 의 variant_kind 목록이 schema.ts 와 다릅니다: ${list}`)
  // difficulty_delta 는 프롬프트 규칙 3 · schema.ts 와 같이 -1 | 0 | +1 이다
  assert.ok(sql.includes('difficulty_delta between -1 and 1'))
  assert.ok(sql.includes('v_delta < -1 or v_delta > 1'))
  assert.ok(read('prompts/twin-gen-v1.1.md').includes('difficulty_delta -1, 0, +1'))
})

test('create RPC 에 허용 키 화이트리스트가 있다', () => {
  const sql = read(SQL_INSTALL)
  assert.ok(sql.includes('unknown_payload_key'))
  // 필수 키가 화이트리스트에 있는지 (줄바꿈이 CRLF 일 수 있어 정규식으로 찾는다)
  const m = /v_allowed text\[\] := array\[\s*'source_problem_id'[\s\S]{0,900}?\];/.exec(sql)
  assert.ok(m, '화이트리스트를 찾지 못했습니다')
  const block = m![0]
  for (const k of ['source_problem_id', 'batch_id', 'candidate_no', 'problem_text_latex',
                   'answer_kind', 'answer_text', 'type_code', 'generation_model']) {
    assert.ok(block.includes(`'${k}'`), `화이트리스트에 ${k} 가 없습니다`)
  }
})

test('JSON 타입과 enum·range 를 RPC 가 직접 확인한다', () => {
  const sql = read(SQL_INSTALL)
  assert.ok(sql.includes("jsonb_typeof(p_validation->'check_detail') <> 'object'"))
  assert.ok(sql.includes("jsonb_typeof(p_validation->'format_issues') <> 'array'"))
  assert.ok(sql.includes('invalid_enum_value'))
  assert.ok(sql.includes('invalid_number_range'))
})

test('cast 오류를 안정 코드로 바꾼다', () => {
  const sql = read(SQL_INSTALL)
  // exception 블록으로 감싼 cast 가 create·validation 양쪽에 있어야 한다
  const guards = sql.match(/exception when others then\s*\n\s*raise exception 'invalid_payload'/g) ?? []
  assert.ok(guards.length >= 2, `cast 보호가 ${guards.length}곳뿐입니다`)
})

test('listEligibleTypes 가 타입 단언 대신 Zod 로 파싱한다', () => {
  const src = read('lib/twin/targets.ts')
  assert.ok(!src.includes('return items as TypeCandidate[]'), '타입 단언이 남아 있습니다')
  assert.ok(src.includes('EligibleTypesEnvelopeZ.safeParse'))
  assert.ok(src.includes('.strict()'))
})

test('batch 상태 응답도 Zod strict 로 파싱한다', () => {
  const src = read('lib/twin/repository.ts')
  assert.ok(src.includes('BatchStateEnvelopeZ'))
  assert.ok(src.includes('BatchStateEnvelopeZ.safeParse'))
  const block = src.slice(src.indexOf('const BatchStateRowZ'), src.indexOf('export class SupabaseServerRepository'))
  assert.ok(block.includes('.strict()'))
  // 정답·풀이가 계약에 들어 있으면 안 된다
  for (const banned of ['answer_text', 'solution_outline', 'problem_text_latex', 'check_detail']) {
    assert.ok(!block.includes(banned), `batch 상태 계약에 ${banned} 가 있습니다`)
  }
})

test('batch 상태 RPC 가 최소 필드만 돌려준다', () => {
  const sql = read(SQL_INSTALL)
  const start = sql.indexOf('create function public.server_get_twin_batch_state')
  assert.ok(start > 0)
  const body = sql.slice(start, sql.indexOf('$fn$;', start))
  for (const banned of ['answer_text', 'solution_outline', 'problem_text_latex', 'check_detail', 'ai_answer_text']) {
    assert.ok(!body.includes(banned), `batch 상태 RPC 가 ${banned} 를 돌려줍니다`)
  }
  for (const need of ['batch_id', 'candidate_no', 'candidate_id', 'status']) {
    assert.ok(body.includes(`'${need}'`), `batch 상태 RPC 에 ${need} 가 없습니다`)
  }
  assert.ok(body.includes("set search_path = ''"))
})

test('설치 전 점검이 참조 칼럼을 확인한다', () => {
  const pre = read(SQL_PRECHECK)
  for (const col of ['problems.twin_id', 'problems.answer_text', 'problems.answer_kind',
                     'problems.is_essay', 'problems.type_code', 'problems.image_path',
                     'problems.step', 'problems.difficulty',
                     'standard_types.code', 'standard_types.grade',
                     'standard_types.chapter_title', 'standard_types.type_title']) {
    assert.ok(pre.includes(`'${col}'`), `점검에 ${col} 이 없습니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// 작업 D-3 · G — RPC 10개가 모든 SQL 파일에 반영됐다
// ════════════════════════════════════════════════════════════════════

const RPC_NAMES = [
  'admin_list_twin_candidates', 'admin_get_twin_candidate',
  'admin_approve_twin_candidate', 'admin_reject_twin_candidate',
  'admin_set_student_publish_approval', 'admin_set_practice_publication',
  'server_create_twin_candidate', 'server_update_twin_validation',
  'server_list_eligible_twin_types', 'server_get_twin_batch_state',
]

test('RPC 가 10개이고 설치·점검·검증·롤백에 모두 있다', () => {
  assert.equal(RPC_NAMES.length, 10)
  const install = read(SQL_INSTALL)
  const pre = read(SQL_PRECHECK)
  const verify = read(SQL_VERIFY)
  const rollback = read(SQL_ROLLBACK)
  for (const n of RPC_NAMES) {
    assert.ok(install.includes(`create function public.${n}(`), `설치에 ${n} 가 없습니다`)
    assert.ok(install.includes(`revoke all on function public.${n}(`), `revoke 에 ${n} 가 없습니다`)
    assert.ok(pre.includes(`'${n}'`), `점검에 ${n} 가 없습니다`)
    assert.ok(verify.includes(`'${n}'`), `검증에 ${n} 가 없습니다`)
    assert.ok(rollback.includes(`drop function if exists public.${n}(`), `롤백에 ${n} 가 없습니다`)
  }
})

test('검증 SQL 이 함수 10개를 기준으로 센다', () => {
  const sql = read(SQL_VERIFY)
  assert.ok(sql.includes('if v_bad <> 10 then'))
  assert.ok(!sql.includes('if v_bad <> 9 then'))
})

test('코드가 부르는 RPC 는 모두 설치 SQL 에 있다', () => {
  const sql = read(SQL_INSTALL)
  const called = new Set<string>()
  for (const f of ['lib/twin/repository.ts', 'lib/twin/targets.ts']) {
    for (const m of read(f).matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) called.add(m[1])
  }
  assert.ok(called.size > 0)
  for (const name of called) {
    assert.ok(sql.includes(`create function public.${name}(`),
      `설치 SQL 에 없는 RPC 를 부릅니다: ${name}`)
    assert.ok(RPC_NAMES.includes(name), `목록에 없는 RPC 를 부릅니다: ${name}`)
  }
})

test('service_role 전용 RPC 가 authenticated 에 열려 있지 않다', () => {
  const sql = read(SQL_INSTALL)
  for (const n of ['server_create_twin_candidate', 'server_update_twin_validation',
                   'server_list_eligible_twin_types', 'server_get_twin_batch_state']) {
    const grants = sql.split(String.fromCharCode(10))
      .filter(l => l.startsWith('grant execute') && l.includes(`public.${n}(`))
    assert.equal(grants.length, 1, `${n} 의 grant 가 ${grants.length}줄입니다`)
    assert.ok(grants[0].includes('to service_role;'), `${n} 이 service_role 전용이 아닙니다`)
  }
})
