// GPT-EXEC-033 §7 수용 시험 — 운영이 아니라 **실제 SDK + 전송 대역**
//
// 여기서만 다루는 것 (032 시험과 겹치지 않게)
//   G) 진입점의 결과 분류 — 부분 저장 비0 종료, 원문 오류·합성 비밀표식 비노출 (§6-A)
//   H) 승인 기록과 실행 잠금 — 동시/재실행, 비정상 종료 뒤 자동 재호출 금지 (§6-B)
//   I) 외부 차단 — 모양이 정상인 가짜 키 + 실제 origin 에서 **실제 전송 0건** (§165)
//   J) metadata-only 모드 — 정확히 두 GET, Responses·DB·Storage 0, 실패를 권한 확인으로 오표시 금지
//
// ⚠ 실제 키·운영 DB·유료 호출 0건. 모델 요청은 주입 fetch 로만 간다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, statSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import {
  run, EXIT, EXECUTE_FLAG, LIVE_ENV_NAME, LIVE_ENV_VALUE,
  SMOKE_SOURCE_ID, SMOKE_TYPE_CODE, SMOKE_GRADE,
  classifyResult, exitCodeFor, approvalKey, approvalFields, smokeBatchId,
  runRecordPath, RUN_STATE_DIR, PROMPT_FILES,
  type SmokeDeps, type SmokeFs, type RunRecord, type RunClassification,
} from '../../scripts/run-twin-smoke-032'
import { EXPECTED_ORIGIN } from '../../scripts/check-storage-sample-029'
import { CODE_NOT_ISOLATED } from './openaiConfig'
import { ROLE_MODEL, ROLE_MAX_OUTPUT_TOKENS, IMAGE_DETAIL, OFFICIAL_BASE_URL } from './openaiSend'
import type { PipelineResult } from './pipeline'

import {
  run as runAccess, EXIT as ACCESS_EXIT, MODEL_IDS, METADATA_BASE,
  EXECUTE_FLAG as ACCESS_FLAG, LIVE_ENV_NAME as ACCESS_ENV, LIVE_ENV_VALUE as ACCESS_VALUE,
  probeModel, formatReport, type AccessDeps,
} from '../../scripts/check-model-access-033'

const ROOT = resolve(__dirname, '..', '..')
const NL = String.fromCharCode(10)
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** 합성 비밀표식 — 출력에 **절대** 나타나서는 안 되는 값 */
const SECRET = 'SYNTH_SECRET_NOT_REAL_033'
const GOOD_KEY = 'sb_secret_' + 'A1b2C3d4E5f6G7h8I9j0kLmN'
/** 합성 OpenAI 키. 모양만 맞춘 값이고 실제 키가 아니다 */
const SYN_OPENAI_KEY = 'sk-syn-not-real-0000000000000000'

// ════════════════════════════════════════════════════════════════════
// 실제 저장소를 쓰는 임시 작업 폴더 — `.git` 과 프롬프트를 갖춘다
// ════════════════════════════════════════════════════════════════════

function makeWorkdir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'exec033-'))
  mkdirSync(join(dir, '.git'))
  writeFileSync(join(dir, '.git', 'HEAD'), 'ref: refs/heads/x')
  mkdirSync(join(dir, 'prompts'))
  for (const spec of Object.values(PROMPT_FILES)) {
    // 실제 저장소의 프롬프트를 그대로 복사한다. 해시가 맞아야 봉인 검사를 지난다
    writeFileSync(join(dir, spec.path), readFileSync(join(ROOT, spec.path)))
  }
  writeFileSync(join(dir, '.env.local'), 'SYNTHETIC=1')
  return dir
}

function realFs(): SmokeFs {
  return {
    isDir: (p) => { try { return statSync(p).isDirectory() } catch { return false } },
    isFile: (p) => { try { return statSync(p).isFile() } catch { return false } },
    read: (p) => readFileSync(p, 'utf8'),
    readBytes: (p) => readFileSync(p),
    writeNew: (p, d) => writeFileSync(p, d, { flag: 'wx' }),
    // 036 R035-02 — ENOENT 만 `missing`. 그 밖의 오류는 `unknown` 이다
    statDir: (p) => {
      try { return statSync(p).isDirectory() ? 'dir' : 'not_dir' } catch (e) {
        return (e as { code?: string } | null)?.code === 'ENOENT' ? 'missing' : 'unknown'
      }
    },
    // 036 R035-02 — 오류를 `[]` 로 덮지 않는다. 던진다
    listDir: (p) => readdirSync(p),
    write: (p, d) => writeFileSync(p, d),
    mkdirp: (p) => mkdirSync(p, { recursive: true }),
  }
}

/** 실행 모드 deps. `runPipeline` 으로 파이프라인 결과를 직접 넣는다 */
function execDeps(dir: string, result: PipelineResult, over: Partial<SmokeDeps> = {}) {
  const lines: string[] = []
  const touched: string[] = []
  const d: SmokeDeps = {
    argv: ['node', 'x', EXECUTE_FLAG],
    env: {
      [LIVE_ENV_NAME]: LIVE_ENV_VALUE,
      NEXT_PUBLIC_SUPABASE_URL: EXPECTED_ORIGIN,
      SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY,
      // 035 §102: OpenAI 설정은 셸 값으로 공급한다 — 환경파일 읽기 0회 경로
      OPENAI_API_KEY: SYN_OPENAI_KEY,
    } as unknown as NodeJS.ProcessEnv,
    log: (l) => { lines.push(l) },
    fs: realFs(),
    cwd: dir,
    loadEnvFile: () => { touched.push('loadEnvFile') },
    makeClient: async () => {
      touched.push('makeClient')
      return {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: SMOKE_SOURCE_ID, book: '쎈', grade: SMOKE_GRADE, semester: 1,
                  type_code: SMOKE_TYPE_CODE, step: 'B', difficulty: '대표',
                  answer_kind: 'number', answer_text: 'ANSWER-987654321',
                  image_path: 'hc1-1/ssen/01/0001.png', twin_id: null as number | null, is_essay: false,
                },
                error: null as unknown,
              }),
            }),
          }),
        }),
      }
    },
    runPipeline: async () => result,
    now: () => '2026-10-05T00:00:00.000Z',
    ...over,
  }
  return { deps: d, lines, touched }
}

function candidate(over: Record<string, unknown> = {}) {
  return {
    candidate_no: 1, candidate_id: 'c1', status: 'pending_review' as const,
    format_ok: true, ai_consensus: true, issues: [] as string[],
    // 034 §83: 검토가 정상 스키마로 완료됐다는 뜻. 합의 여부와 다르다
    review_status: 'ok' as const, ...over,
  }
}

// ════════════════════════════════════════════════════════════════════
// G) 결과 분류 — §6-A
// ════════════════════════════════════════════════════════════════════

test('G1 분류 함수: 부분 저장·품질 거부·완료를 구분한다', () => {
  const ok = (cands: unknown[]): PipelineResult =>
    ({ kind: 'ok', batch_id: 'b', fingerprint: 'f', candidates: cands as never })

  // 둘 다 정상 저장 → 완료
  assert.equal(classifyResult(ok([candidate(), candidate({ candidate_no: 2, candidate_id: 'c2' })])).code, 'complete')

  // 하나가 저장 실패 (error 있음) → **부분 저장**
  const partial = classifyResult(ok([
    candidate(),
    candidate({ candidate_no: 2, candidate_id: null, error: SECRET }),
  ]))
  assert.equal(partial.code, 'partial_save')
  assert.equal(partial.errorCount, 1)
  assert.equal(partial.savedCount, 1)

  // 후보가 하나뿐 → 부분 저장
  assert.equal(classifyResult(ok([candidate()])).code, 'partial_save')

  // 둘 다 형식·검산에서 거부 → **품질 거부** (저장 오류와 다르다)
  const rejected = classifyResult(ok([
    candidate({ status: 'rejected', format_ok: false }),
    candidate({ candidate_no: 2, candidate_id: 'c2', status: 'rejected', format_ok: false }),
  ]))
  assert.equal(rejected.code, 'all_rejected')
  assert.equal(rejected.rejectedCount, 2)
  assert.equal(rejected.errorCount, 0, '형식 거부를 저장 오류로 셌습니다')
})

test('G2 분류 함수: 거절·지원불가·잘림·중단을 섞지 않는다', () => {
  const failed = (code: string): PipelineResult =>
    ({ kind: 'failed', stage: 'generation', code, detail: SECRET })
  assert.equal(classifyResult(failed('refusal')).code, 'generation_refused')
  assert.equal(classifyResult(failed('incomplete')).code, 'incomplete_output')
  assert.equal(classifyResult(failed('transport_error')).code, 'pipeline_failed')
  assert.equal(classifyResult({ kind: 'unsupported', batch_id: 'b', fingerprint: 'f', reason: null }).code, 'unsupported')
  assert.equal(classifyResult({ kind: 'skipped', reason: 'not_eligible' }).code, 'skipped')
  assert.equal(classifyResult({ kind: 'cached', batch_id: 'b', fingerprint: 'f', candidates: [] as never }).code, 'cached')
})

test('G3 분류는 detail 을 읽지 않는다 — 거기에 모델 자유서술이 들어 있다', () => {
  const c = classifyResult({ kind: 'failed', stage: 'generation', code: 'refusal', detail: SECRET })
  assert.equal(JSON.stringify(c).includes(SECRET), false, '분류 결과에 detail 이 실렸습니다')
  assert.equal(c.failCode, 'refusal')
  assert.equal(c.stage, 'generation')
})

test('G4 종료코드: 완료·캐시만 0 이고 나머지는 전부 비0', () => {
  const base: Omit<RunClassification, 'code'> = {
    savedCount: 0, rejectedCount: 0, errorCount: 0,
    reviewFailedCount: 0, consensusMismatchCount: 0,
    stage: null, failCode: null, stopReason: null,
    inferenceCount: 0, lastRequestUnsent: false,
  }
  assert.equal(exitCodeFor({ ...base, code: 'complete', savedCount: 2 }), 0)
  assert.equal(exitCodeFor({ ...base, code: 'cached', savedCount: 2 }), 0)
  // 034 에서 늘어난 분류까지 전부 비0 이어야 한다
  // 035 에서 늘어난 분류까지 전부 비0 이어야 한다
  for (const code of ['partial_save', 'all_rejected', 'generation_refused',
                      'unsupported', 'incomplete_output', 'pipeline_failed', 'skipped',
                      'review_failed', 'usage_unknown', 'input_rejected',
                      'reservation_exceeded', 'budget_exceeded', 'record_failed',
                      'aborted'] as const) {
    assert.notEqual(exitCodeFor({ ...base, code }), 0, `${code} 가 0 입니다`)
  }
})

test('G5 진입점: 부분 저장은 종료코드 0 이 아니다 (R032-04)', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines } = execDeps(dir, {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [
        candidate(),
        candidate({ candidate_no: 2, candidate_id: null, error: SECRET }),
      ] as never,
    })
    const code = await run(deps)
    assert.equal(code, EXIT.partialSave, `종료코드 ${code} — 부분 저장이 성공으로 끝났습니다`)
    const out = lines.join(NL)
    assert.match(out, /부분 저장/)
    assert.match(out, /전체 성공이 아닙니다/)
    assert.equal(out.includes(SECRET), false, '원문 오류가 출력됐습니다')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('G6 진입점: failed.detail 의 합성 비밀표식이 출력되지 않는다 (R032-04)', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines } = execDeps(dir, {
      kind: 'failed', stage: 'generation', code: 'refusal', detail: SECRET,
    })
    const code = await run(deps)
    assert.equal(code, EXIT.generationRefused)
    const out = lines.join(NL)
    assert.equal(out.includes(SECRET), false, 'detail 이 그대로 출력됐습니다')
    assert.match(out, /모델 거절/)
    assert.match(out, /사유=refusal/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('G7 진입점: 원문 정답·이미지 경로가 출력되지 않는다', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines } = execDeps(dir, {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [candidate(), candidate({ candidate_no: 2, candidate_id: 'c2' })] as never,
    })
    await run(deps)
    const out = lines.join(NL)
    for (const secret of ['ANSWER-987654321', 'hc1-1/ssen/01/0001.png', 'data:image', GOOD_KEY]) {
      assert.equal(out.includes(secret), false, `출력에 ${secret} 가 들어갔습니다`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('G8 진입점: 품질 거부를 「모든 목표 완료」로 포장하지 않는다 (§141)', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines } = execDeps(dir, {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [
        candidate({ status: 'rejected', format_ok: false }),
        candidate({ candidate_no: 2, candidate_id: 'c2', status: 'rejected', format_ok: false }),
      ] as never,
    })
    const code = await run(deps)
    assert.equal(code, EXIT.qualityRejected)
    assert.match(lines.join(NL), /품질 거부/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('G9 진입점: 네 가지 상태를 서로 다르다고 적는다 (§110)', async () => {
  const dir = makeWorkdir()
  try {
    const { deps, lines } = execDeps(dir, {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [candidate(), candidate({ candidate_no: 2, candidate_id: 'c2' })] as never,
    })
    await run(deps)
    const out = lines.join(NL)
    assert.match(out, /기술 실행 성공 \/ 검산 통과 \/ 사람 검수 완료 \/ 학생 게시 가능/)
    assert.match(out, /학생에게 보이지 않습니다/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ════════════════════════════════════════════════════════════════════
// H) 승인 기록과 실행 잠금 — §6-B
// ════════════════════════════════════════════════════════════════════

test('H1 승인에 원문·양쪽 프롬프트 해시·두 모델·detail·제한이 묶인다 (§148)', () => {
  const f = approvalFields()
  assert.equal(f.sourceId, SMOKE_SOURCE_ID)
  assert.equal(f.typeCode, SMOKE_TYPE_CODE)
  assert.equal(f.grade, SMOKE_GRADE)
  assert.equal(f.genPromptSha256, PROMPT_FILES.generation.sha256)
  assert.equal(f.reviewPromptSha256, PROMPT_FILES.review.sha256, '검토 프롬프트 해시가 빠졌습니다')
  assert.equal(f.generationModel, ROLE_MODEL.generation)
  assert.equal(f.reviewModel, ROLE_MODEL.review)
  assert.equal(f.imageDetail, IMAGE_DETAIL)
  assert.equal(f.maxOutputGeneration, ROLE_MAX_OUTPUT_TOKENS.generation)
  assert.equal(f.maxOutputReview, ROLE_MAX_OUTPUT_TOKENS.review)
  assert.equal(f.baseUrl, OFFICIAL_BASE_URL)
  assert.equal(f.maxRetries, 0)
  // 승인키는 이 값들에서만 정해진다
  assert.match(approvalKey(), /^[0-9a-f]{16}$/)
  assert.equal(approvalKey(), approvalKey())
})

test('H2 실행 기록이 남고, 예약 금액과 호출 수가 함께 적힌다', async () => {
  const dir = makeWorkdir()
  try {
    const { deps } = execDeps(dir, {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [candidate(), candidate({ candidate_no: 2, candidate_id: 'c2' })] as never,
    })
    const code = await run(deps)
    assert.equal(code, EXIT.ok)
    const p = runRecordPath(dir, approvalKey())
    assert.ok(existsSync(p), '실행 기록이 없습니다')
    const rec = JSON.parse(readFileSync(p, 'utf8')) as RunRecord
    assert.equal(rec.status, 'finished')
    assert.equal(rec.approvalKey, approvalKey())
    assert.equal(rec.batchId, smokeBatchId(approvalKey()))
    assert.equal(rec.exitCode, 0)
    assert.equal(typeof rec.reservedUsd, 'number')
    assert.equal(typeof rec.paidCalls, 'number')
    // 키·정답·이미지를 기록하지 않는다 (§149)
    const raw = readFileSync(p, 'utf8')
    for (const secret of [GOOD_KEY, 'ANSWER-987654321', 'hc1-1/ssen', 'data:image']) {
      assert.equal(raw.includes(secret), false, `기록에 ${secret} 가 들어갔습니다`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('H3 기록이 남아 있으면 다시 보내지 않는다 — 자동으로 지우지 않는다 (§149)', async () => {
  const dir = makeWorkdir()
  try {
    const result: PipelineResult = {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [candidate(), candidate({ candidate_no: 2, candidate_id: 'c2' })] as never,
    }
    assert.equal(await run(execDeps(dir, result).deps), EXIT.ok)

    // 두 번째 실행 — 멈춰야 한다
    const second = execDeps(dir, result)
    const code = await run(second.deps)
    assert.equal(code, EXIT.lockHeld)
    assert.ok(!second.touched.includes('makeClient'), '잠금이 있는데 클라이언트를 만들었습니다')
    const out = second.lines.join(NL)
    assert.match(out, /앞선 실행 기록이 1건 있습니다/)
    assert.match(out, /GPT 승인을 받아/)
    assert.match(out, /승인키를 바꿔도 이 실험의 잠금을 피할 수 없습니다/)
    // 기록 파일이 그대로 남아 있다 (자동 삭제하지 않았다)
    assert.ok(existsSync(runRecordPath(dir, approvalKey())))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('H4 비정상 종료로 in_progress 가 남아도 자동 재호출하지 않는다', async () => {
  const dir = makeWorkdir()
  try {
    // 앞선 실행이 죽어 in_progress 로 남은 상황을 만든다
    mkdirSync(join(dir, RUN_STATE_DIR), { recursive: true })
    writeFileSync(runRecordPath(dir, approvalKey()), JSON.stringify({
      approvalKey: approvalKey(), batchId: 'x', status: 'in_progress',
      startedAt: '2026-10-05T00:00:00.000Z', approval: approvalFields(),
    }))
    const { deps, touched, lines } = execDeps(dir, { kind: 'skipped', reason: 'not_eligible' })
    assert.equal(await run(deps), EXIT.lockHeld)
    assert.ok(!touched.includes('makeClient'))
    assert.match(lines.join(NL), /상태=in_progress/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('H5 기록이 깨져 있어도 멈춘다 — 읽을 수 없는 것을 없는 것으로 보지 않는다', async () => {
  const dir = makeWorkdir()
  try {
    mkdirSync(join(dir, RUN_STATE_DIR), { recursive: true })
    writeFileSync(runRecordPath(dir, approvalKey()), '{ 깨진 JSON')
    const { deps, touched } = execDeps(dir, { kind: 'skipped', reason: 'not_eligible' })
    assert.equal(await run(deps), EXIT.lockHeld)
    assert.ok(!touched.includes('makeClient'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('H6 대상이 달라 멈춘 경우에도 기록을 닫는다', async () => {
  const dir = makeWorkdir()
  try {
    const { deps } = execDeps(dir, { kind: 'skipped', reason: 'not_eligible' }, {
      makeClient: async () => ({
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null as unknown, error: null as unknown }) }) }) }),
      }),
    })
    assert.equal(await run(deps), EXIT.targetMismatch)
    const rec = JSON.parse(readFileSync(runRecordPath(dir, approvalKey()), 'utf8')) as RunRecord
    assert.equal(rec.status, 'finished', '기록이 in_progress 로 남았습니다')
    assert.equal(rec.classification, 'target_mismatch')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ════════════════════════════════════════════════════════════════════
// I) 외부 차단 — §165
// ════════════════════════════════════════════════════════════════════

test('I1 모양이 정상인 가짜 키 + 실제 origin 에서도 실제 전송이 0건이다', async () => {
  const dir = makeWorkdir()
  const realFetch = globalThis.fetch
  let outbound = 0
  // 전역 fetch 를 덫으로 바꾼다. 하나라도 나가면 시험이 실패한다
  ;(globalThis as { fetch: unknown }).fetch = (...a: unknown[]) => {
    outbound++
    throw new Error(`실제 전송이 나갔습니다: ${String(a[0])}`)
  }
  try {
    const { deps } = execDeps(dir, {
      kind: 'ok', batch_id: 'b', fingerprint: 'f',
      candidates: [candidate(), candidate({ candidate_no: 2, candidate_id: 'c2' })] as never,
    })
    // 키는 **형식이 맞지만 가짜**이고 origin 은 **승인된 실제 주소**다 — 앞선 사고의 조합이다
    assert.equal(deps.env.NEXT_PUBLIC_SUPABASE_URL, EXPECTED_ORIGIN)
    assert.equal(await run(deps), EXIT.ok)
    assert.equal(outbound, 0, `실제 전송이 ${outbound}건 나갔습니다`)
  } finally {
    ;(globalThis as { fetch: unknown }).fetch = realFetch
    rmSync(dir, { recursive: true, force: true })
  }
})

test('I2 이 시험 파일과 032 시험은 실제 의존성을 만들지 않는다', () => {
  for (const p of ['lib/twin/exec032.test.ts', 'lib/twin/exec033.test.ts']) {
    const src = read(p)
    // 실제 Supabase 클라이언트를 만들지 않는다
    assert.ok(!/createClient\(/.test(src), `${p} 가 Supabase 클라이언트를 만듭니다`)
    // 실행 모드 deps 는 전부 주입한다 — `defaultDeps` 를 쓰지 않는다
    assert.ok(!/defaultDeps\(/.test(src), `${p} 가 기본 deps 를 씁니다`)
  }
})

// ════════════════════════════════════════════════════════════════════
// J) metadata-only 모드 — §5
// ════════════════════════════════════════════════════════════════════

function accessDeps(over: Partial<AccessDeps> = {}) {
  const lines: string[] = []
  const urls: string[] = []
  const touched: string[] = []
  const d: AccessDeps = {
    argv: ['node', 'x', ACCESS_FLAG],
    env: { [ACCESS_ENV]: ACCESS_VALUE, OPENAI_API_KEY: 'sk-syn-not-real-0000000000000000' } as unknown as NodeJS.ProcessEnv,
    log: (l) => { lines.push(l) },
    fs: {
      isDir: (p) => p.endsWith('/.git'),
      isFile: () => false,
      read: () => '',
    },
    cwd: '/syn/repo',
    loadEnvFile: () => { touched.push('loadEnvFile') },
    fetchImpl: async (url) => { urls.push(url); return { status: 200 } },
    ...over,
  }
  return { deps: d, lines, urls, touched }
}

test('J1 정확히 두 개의 GET 만 보낸다 — 계정 전체 목록을 받지 않는다', async () => {
  const { deps, urls, lines } = accessDeps()
  const code = await runAccess(deps)
  assert.equal(code, ACCESS_EXIT.ok)
  assert.deepEqual(urls, [`${METADATA_BASE}/${MODEL_IDS[0]}`, `${METADATA_BASE}/${MODEL_IDS[1]}`])
  assert.equal(urls.length, 2)
  // 전체 목록 주소를 부르지 않는다
  assert.ok(!urls.some((u) => u === METADATA_BASE))
  const out = lines.join(NL)
  assert.match(out, /modelsReadable    = true/)
  assert.match(out, /inferenceVerified = false/)
})

test('J2 200 을 생성 권한 확인으로 쓰지 않는다 (§126)', async () => {
  const { lines } = accessDeps()
  const out = formatReport({
    probes: MODEL_IDS.map((m) => ({ modelId: m, status: 200, classification: 'readable' as const })),
    modelsReadable: true, inferenceVerified: false,
  }).join(NL)
  assert.match(out, /inferenceVerified = false/)
  assert.match(out, /생성 실행 권한·프로젝트 모델 설정·결제·한도는 여전히 미확인/)
  assert.ok(!lines.join(NL).includes('추론 확인'))
})

test('J3 401·403·404·timeout 을 구분하고 권한 오류를 부재로 단정하지 않는다', async () => {
  for (const [status, want] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'],
                                [429, 'rate_limited'], [500, 'server_error'], [418, 'other']] as const) {
    const p = await probeModel('gpt-6-astra', 'k', async () => ({ status }), 1000)
    assert.equal(p.classification, want, `HTTP ${status}`)
  }
  const out = formatReport({
    probes: [{ modelId: 'gpt-6-astra', status: 403, classification: 'forbidden' }],
    modelsReadable: false, inferenceVerified: false,
  }).join(NL)
  assert.match(out, /모델이 없다고 단정하지 않는다/)
  assert.match(out, /권한 오류\(401\/403\)와 부재\(404\)는 다르고/)
})

test('J4 읽기 실패는 비0 종료코드이고, 권한 완전 확인으로 표시하지 않는다', async () => {
  const { deps, lines } = accessDeps({ fetchImpl: async () => ({ status: 403 }) })
  assert.equal(await runAccess(deps), ACCESS_EXIT.notReadable)
  assert.match(lines.join(NL), /modelsReadable    = false/)
})

test('J5 두 스위치가 없으면 조회하지 않는다', async () => {
  // 깃발만
  {
    const { deps, urls, touched } = accessDeps({ env: {} as unknown as NodeJS.ProcessEnv })
    assert.equal(await runAccess(deps), ACCESS_EXIT.notApproved)
    assert.equal(urls.length, 0)
    assert.deepEqual(touched, [])
  }
  // 인자 없음 → 계획만
  {
    const { deps, urls, touched, lines } = accessDeps({ argv: ['node', 'x'] })
    assert.equal(await runAccess(deps), ACCESS_EXIT.planned)
    assert.equal(urls.length, 0)
    assert.deepEqual(touched, [])
    assert.match(lines.join(NL), /조회 0회 · 유료 요청 0회/)
  }
})

test('J6 OpenAI 전용 출처가 없으면 조회하지 않는다 (034 §96)', async () => {
  // 034 로 바뀐 계약: 셸에 키가 없고 **전용 파일도 없으면** 공유 `.env.local` 로
  // 되돌아가지 않고 `configNotIsolated` 로 멈춘다. 033 은 공유 파일을 적재했다.
  const { deps, urls, touched, lines } = accessDeps({
    env: { [ACCESS_ENV]: ACCESS_VALUE } as unknown as NodeJS.ProcessEnv,
  })
  assert.equal(await runAccess(deps), ACCESS_EXIT.configNotIsolated)
  assert.equal(urls.length, 0)
  assert.deepEqual(touched, [], '전용 출처가 없는데 환경파일을 읽었습니다')
  assert.match(lines.join(NL), new RegExp(CODE_NOT_ISOLATED))
})

test('J7 키·헤더·원문 오류를 출력하지 않는다', async () => {
  const KEY = 'sk-syn-SECRET-MARKER-0000000000'
  const { deps, lines } = accessDeps({
    env: { [ACCESS_ENV]: ACCESS_VALUE, OPENAI_API_KEY: KEY } as unknown as NodeJS.ProcessEnv,
    fetchImpl: async () => { throw Object.assign(new Error(SECRET), { name: 'TypeError' }) },
  })
  await runAccess(deps)
  const out = lines.join(NL)
  assert.equal(out.includes(KEY), false, '키가 출력됐습니다')
  assert.equal(out.includes(SECRET), false, '원문 오류가 출력됐습니다')
  assert.match(out, /network_error/)
})

test('J8 Supabase·DB·Storage·유료 추론을 건드리지 않는다', () => {
  const src = read('scripts/check-model-access-033.ts')
  const exec = src.split(NL)
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join(NL)
  // Supabase 클라이언트·키를 만들거나 읽지 않는다
  assert.ok(!exec.includes('createClient'), 'Supabase 클라이언트를 만듭니다')
  assert.ok(!exec.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Supabase 키를 읽습니다')
  // 유료 추론 **호출**을 하지 않는다. SDK 도 가져오지 않는다
  for (const bad of ['responses.create', 'responses.parse', 'openai/helpers', "from 'openai'"]) {
    assert.ok(!exec.includes(bad), `유료 추론 경로(${bad})가 있습니다`)
  }
  // 낱말을 아무 데서나 찾지 않는다 — 도움말이 "`/v1/responses` 실행 권한은 증명되지 않는다"
  // 라고 **설명하느라** 그 경로를 쓴다. 그래서 **실제로 만드는 주소**만 본다.
  const hosts = [...exec.matchAll(/https:\/\/api\.openai\.com[^'"`\s]*/g)].map((m) => m[0])
  assert.deepEqual([...new Set(hosts)], ['https://api.openai.com/v1/models'],
    `만드는 주소가 모델 메타데이터 하나가 아닙니다: ${hosts.join(' ')}`)
  // 도움말에는 그 한계가 적혀 있어야 한다
  assert.match(src, /\/v1\/responses 실행 권한/)
})
