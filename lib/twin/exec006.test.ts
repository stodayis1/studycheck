// GPT-EXEC-006 회귀 테스트
//
// 실행: npm run test:twin
//
// 여기서 확인하는 것은 "잘 되는가"가 아니라 **막아 둔 문이 다시 열렸는가**다.
//   A) 학생 payload 에 최종답 공개 경로가 없는가 (D-063)
//   B) 생성 키에 batch_id 가 들어갔는가 (D-065)
//   C) fingerprint 가 fail closed 인가 (D-067)
//   D) 죽은 RPC 이름을 부르지 않는가 (§274)
//   E) 요청 본문이 조용히 캐스팅되지 않는가 (§316)
//   F) null 이 정상값으로 둔갑하지 않는가 (D-066)
//   G) 설치 전 점검이 실패를 예외로 끝내는가 (§286)
//
// SQL 은 여기서 실행하지 않는다. 운영 DB 를 건드리지 않고 **파일 내용**만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { studentSafeExample, studentSafeExamples, type ExampleRow } from './publish'
import { computeSourceFingerprint, canonicalFingerprintInput, FingerprintError, NO_IMAGE_MARKER,
         type FingerprintSource, type StorageMeta } from './fingerprint'
import { ReviewRequestZ, ApprovalEditsZ } from './reviewApi'
import { toRecords, type CreateCandidatePayload } from './repository'

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const SQL_INSTALL = 'docs/sql/쌍둥이_설치.sql'
const SQL_PRECHECK = 'docs/sql/쌍둥이_설치전_점검.sql'
const SQL_VERIFY = 'docs/sql/쌍둥이_설치후_검증.sql'
const SQL_ROLLBACK = 'docs/sql/쌍둥이_롤백.sql'

// ════════════════════════════════════════════════════════════════════
// A) 학생 payload — 최종답 공개 경로가 없다 (D-063)
// ════════════════════════════════════════════════════════════════════

const publishedRow: ExampleRow = {
  id: '11111111-1111-4111-8111-111111111111',
  type_code: '공수1-09-09',
  problem_text_latex: '서로 다른 5개에서 2개를 뽑아 나열하는 경우의 수를 구하시오.',
  answer_text: '20',
  solution_outline: ['공식을 떠올린다', '대입한다'],
  status: 'published',
  student_publish_approved: true,
  retired_at: null,
}

test('학생 payload 는 정확히 세 필드다', () => {
  const safe = studentSafeExample(publishedRow)
  assert.ok(safe)
  assert.deepEqual(Object.keys(safe!).sort(), ['id', 'problem_text_latex', 'type_code'])
})

test('직렬화 결과에 정답·풀이·공개 플래그가 없다', () => {
  const json = JSON.stringify(studentSafeExamples([publishedRow]))
  for (const banned of ['answer_text', 'solution_outline', 'can_show_final_value',
                        'student_publish_approved', 'status', 'retired_at', '20']) {
    assert.ok(!json.includes(banned), `학생 응답에 ${banned} 가 들어갔습니다: ${json}`)
  }
})

test('원본 행에 새 필드가 생겨도 학생 응답에 새지 않는다', () => {
  // 스프레드를 쓰면 여기서 샌다. 명시적 복사라 새지 않아야 한다
  const withExtra = { ...publishedRow, secret_hint: '답은 20', can_show_final_value: true } as ExampleRow
  const safe = studentSafeExample(withExtra)
  assert.deepEqual(Object.keys(safe!).sort(), ['id', 'problem_text_latex', 'type_code'])
})

/** 주석을 뺀 본문. "없앴다"고 설명하는 주석까지 금지하면 이유를 적을 수 없다 */
function codeOnly(path: string): string {
  const NL = String.fromCharCode(10)
  return read(path)
    .split(NL)
    .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('--') && !l.trim().startsWith('*'))
    .join(NL)
}

test('학생 모듈과 학생용 SQL 의 실행 코드에 can_show_final_value 가 없다', () => {
  for (const f of ['lib/twin/publish.ts', 'lib/twin/repository.ts', 'lib/twin/pipeline.ts',
                   'app/api/twin/review/route.ts', 'app/teacher/twin-review/page.tsx',
                   SQL_INSTALL, SQL_ROLLBACK, SQL_PRECHECK]) {
    assert.ok(!codeOnly(f).includes('can_show_final_value'),
      `${f} 의 실행 코드에 can_show_final_value 가 남아 있습니다`)
  }
  // 설치 후 검증 SQL 은 "옛 이름이 **없는지**" 확인하느라 이름을 일부러 담고 있다.
  // 그래서 제외하되, 그 검사가 실제로 있는지는 여기서 확인한다.
  const verify = read(SQL_VERIFY)
  assert.ok(verify.includes("'safe_worked_example','can_show_final_value'"),
    '검증 SQL 에 옛 명칭 잔존 검사가 없습니다')
})

test('옛 명칭 safe_worked_example 계열이 코드·SQL 어디에도 없다', () => {
  for (const f of ['lib/twin/publish.ts', 'lib/twin/repository.ts', 'lib/twin/mode.ts',
                   'app/api/twin/review/route.ts', 'app/teacher/twin-review/page.tsx',
                   SQL_INSTALL, SQL_VERIFY, SQL_ROLLBACK, SQL_PRECHECK]) {
    const s = read(f)
    for (const banned of ['safe_worked_example', 'setSafeWorkedExample', "'approve_safe'", "'revoke_safe'"]) {
      // 검증 SQL 은 "옛 이름이 없는지" 확인하느라 문자열을 일부러 담고 있다
      if (f === SQL_VERIFY && banned === 'safe_worked_example') continue
      assert.ok(!s.includes(banned), `${f} 에 ${banned} 가 남아 있습니다`)
    }
  }
})

test('UI 문구에 「마지막 값 공개」가 없다', () => {
  const ui = read('app/teacher/twin-review/page.tsx')
  assert.ok(!ui.includes('마지막 값'), 'UI 에 마지막 값 공개 문구가 남아 있습니다')
  assert.ok(ui.includes('학생 게시 안전검수 완료'), '새 문구가 없습니다')
  assert.ok(ui.includes('이 승인은 최종답 공개를 허용하지 않습니다'), '취지 설명이 없습니다')
})

// ════════════════════════════════════════════════════════════════════
// B) 생성 키 — batch_id (D-065)
// ════════════════════════════════════════════════════════════════════

test('UNIQUE 와 ON CONFLICT 에 batch_id 가 들어 있다', () => {
  const sql = read(SQL_INSTALL)
  assert.match(sql,
    /unique \(source_problem_id, source_fingerprint, prompt_version, batch_id, candidate_no\)/)
  assert.match(sql,
    /on conflict \(source_problem_id, source_fingerprint, prompt_version, batch_id, candidate_no\)/)
  // batch_id 가 빠진 옛 키가 남아 있으면 안 된다
  assert.ok(!/unique \(source_problem_id, source_fingerprint, prompt_version, candidate_no\)/.test(sql))
})

test('batch_id 가 없거나 uuid 가 아니면 RPC 가 invalid_payload 로 거부한다', () => {
  const sql = read(SQL_INSTALL)
  assert.match(sql, /v_batch := \(p_payload->>'batch_id'\)::uuid;/)
  assert.match(sql, /if v_batch is null then\s*\n\s*raise exception 'invalid_payload'/)
})

test('CreateCandidatePayload 의 batch_id 는 선택 항목이 아니다', () => {
  const src = read('lib/twin/repository.ts')
  assert.ok(!src.includes('batch_id?:'), 'batch_id 가 선택 항목으로 남아 있습니다')
  // 타입 수준에서도 확인한다 — batch_id 를 빼면 컴파일되지 않아야 한다
  const payload: CreateCandidatePayload = {
    source_problem_id: 1, source_fingerprint: 'fp', prompt_version: 'v1',
    batch_id: '22222222-2222-4222-8222-222222222222', candidate_no: 1,
    problem_text_latex: 'x', answer_kind: 'number', answer_text: '1',
    solution_outline: [], concepts: [], common_mistakes: [], transformations: [],
    type_code: 'T', difficulty_delta: 0, variant_kind: 'mixed',
    reverse_derivation_risk: 'low', single_answer_claim: true,
    needs_new_image: false, self_check_notes: [],
    generation_status: 'generated', unsupported_reason: null, generation_model: 'm',
  }
  assert.equal(typeof payload.batch_id, 'string')
})

test('설치 후 검증은 prompt 를 같게 두고 batch 만 다르게 만든다', () => {
  const sql = read(SQL_VERIFY)
  // v_c4 는 v_c1 과 prompt_version·candidate_no 가 같고 batch 만 달라야 한다
  const block = sql.slice(sql.indexOf('4-5)'), sql.indexOf('4-6)'))
  assert.ok(block.includes("'prompt_version', 'verify-v1'"),
    'batch 와 prompt 를 동시에 바꾸면 무엇 때문에 살아남았는지 알 수 없습니다')
  assert.ok(block.includes('v_batch2'))
  assert.ok(block.includes('if v_c4 = v_c1'))
})

// ════════════════════════════════════════════════════════════════════
// C) fingerprint — fail closed (D-067)
// ════════════════════════════════════════════════════════════════════

const fpSource: FingerprintSource = {
  id: 5479, grade: '공통수학1', semester: 1, type_code: '공수1-09-09',
  step: 'B', difficulty: '대표', answer_kind: 'number', answer_text: '12',
  image_path: 'hc1-1/ssen/09/0001.png',
}
const meta: StorageMeta = { updated_at: '2026-01-01T00:00:00Z', etag: 'abc' }

test('같은 원문은 항상 같은 해시다', () => {
  assert.equal(computeSourceFingerprint(fpSource, meta), computeSourceFingerprint(fpSource, meta))
})

test('정답·유형·난이도·단계가 바뀌면 해시가 달라진다', () => {
  const base = computeSourceFingerprint(fpSource, meta)
  for (const over of [{ answer_text: '13' }, { type_code: 'X' },
                      { difficulty: '상' }, { step: 'A' }, { answer_kind: 'choice' }]) {
    assert.notEqual(computeSourceFingerprint({ ...fpSource, ...over }, meta), base)
  }
})

test('이미지가 교체되면 경로가 같아도 해시가 달라진다', () => {
  const a = computeSourceFingerprint(fpSource, meta)
  const b = computeSourceFingerprint(fpSource, { ...meta, etag: 'def' })
  const c = computeSourceFingerprint(fpSource, { ...meta, updated_at: '2026-02-02T00:00:00Z' })
  assert.notEqual(a, b)
  assert.notEqual(a, c)
})

test('Storage 메타를 못 받으면 임의 해시 대신 실패한다', () => {
  assert.throws(() => computeSourceFingerprint(fpSource, null), (e: unknown) => {
    assert.ok(e instanceof FingerprintError)
    assert.equal((e as FingerprintError).code, 'storage_meta_unavailable')
    return true
  })
  assert.throws(() => computeSourceFingerprint(fpSource, { updated_at: '', etag: '' }), FingerprintError)
})

test('이미지가 없는 원문은 메타 없이도 계산된다', () => {
  const noImg: FingerprintSource = { ...fpSource, image_path: null }
  const h = computeSourceFingerprint(noImg, null)
  assert.equal(typeof h, 'string')
  assert.ok(canonicalFingerprintInput(noImg, null).includes(`image_path=${NO_IMAGE_MARKER}`))
})

test('difficulty 가 null 이어도 표현이 고정된다', () => {
  const a = computeSourceFingerprint({ ...fpSource, difficulty: null }, meta)
  const b = computeSourceFingerprint({ ...fpSource, difficulty: null }, meta)
  assert.equal(a, b)
  assert.notEqual(a, computeSourceFingerprint(fpSource, meta))
})

test('오류 메시지에 정답 원문이 들어가지 않는다', () => {
  try {
    computeSourceFingerprint(fpSource, null)
    assert.fail('예외가 나야 합니다')
  } catch (e) {
    assert.ok(!String((e as Error).message).includes('12'))
  }
})

// 파이프라인 테스트는 `exec007.test.ts` 로 옮겼다.
// GPT-EXEC-007 에서 파이프라인 계약(batchId 필수·batch 캐시·이미지 fail closed)이 바뀌어,
// 준비 코드를 한곳에 모으는 편이 읽기 쉽다.

// ════════════════════════════════════════════════════════════════════
// D) 죽은 RPC 이름을 부르지 않는다 (§274)
// ════════════════════════════════════════════════════════════════════

test('코드가 부르는 RPC 는 모두 설치 SQL 에 있다', () => {
  const sql = read(SQL_INSTALL)
  const files = ['lib/twin/repository.ts', 'lib/twin/targets.ts']
  const called = new Set<string>()
  for (const f of files) {
    for (const m of read(f).matchAll(/\.rpc\(\s*'([a-z0-9_]+)'/g)) called.add(m[1])
  }
  assert.ok(called.size > 0, 'RPC 호출을 하나도 찾지 못했습니다')
  for (const name of called) {
    assert.ok(sql.includes(`create function public.${name}(`),
      `설치 SQL 에 없는 RPC 를 부릅니다: ${name}`)
  }
})

test('존재하지 않던 twin_eligible_types 를 더는 부르지 않는다', () => {
  const src = read('lib/twin/targets.ts')
  assert.ok(!/\.rpc\(\s*'twin_eligible_types'/.test(src))
  assert.ok(src.includes("'server_list_eligible_twin_types'"))
  // "SQL 직접 조회로 대신하세요" 같은 런타임 포기 문구도 없어야 한다
  assert.ok(!src.includes('SQL 직접 조회'))
})

test('새 RPC 가 설치·권한·검증·롤백에 모두 들어갔다', () => {
  const name = 'server_list_eligible_twin_types'
  const install = read(SQL_INSTALL)
  assert.ok(install.includes(`create function public.${name}(`))
  assert.ok(install.includes(`revoke all on function public.${name}(integer, text)`))
  assert.ok(install.includes(`grant execute on function public.${name}(integer, text) to service_role`))
  assert.ok(read(SQL_PRECHECK).includes(name))
  assert.ok(read(SQL_VERIFY).includes(name))
  assert.ok(read(SQL_ROLLBACK).includes(`drop function if exists public.${name}(integer, text)`))
})

// ════════════════════════════════════════════════════════════════════
// E) 요청 본문 검증 (§316)
// ════════════════════════════════════════════════════════════════════

const CAND = '44444444-4444-4444-8444-444444444444'

test('배열 자리에 문자열이 오면 거부한다', () => {
  const r = ReviewRequestZ.safeParse({
    action: 'approve', candidateId: CAND,
    edits: { solution_outline: '한 줄짜리 문자열' },
  })
  assert.equal(r.success, false)
})

test('허용되지 않은 편집 키는 거부한다', () => {
  const r = ReviewRequestZ.safeParse({
    action: 'approve', candidateId: CAND,
    edits: { teacher_approved: true },
  })
  assert.equal(r.success, false)
})

test('편집 가능한 키는 설치 SQL 의 허용 목록과 같다', () => {
  const keys = Object.keys(ApprovalEditsZ.shape).sort()
  assert.deepEqual(keys, ['answer_kind', 'answer_text', 'common_mistakes',
                          'concepts', 'problem_text_latex', 'solution_outline'])
  const sql = read(SQL_INSTALL)
  for (const k of keys) assert.ok(sql.includes(`'${k}'`), `설치 SQL 허용 목록에 ${k} 가 없습니다`)
})

test('빈 문제·빈 정답·잘못된 answer_kind 를 막는다', () => {
  for (const edits of [{ problem_text_latex: '   ' }, { answer_text: '' }, { answer_kind: 'essay' }]) {
    assert.equal(ReviewRequestZ.safeParse({ action: 'approve', candidateId: CAND, edits }).success, false)
  }
})

test('동작별로 필요한 값이 없으면 거부한다', () => {
  assert.equal(ReviewRequestZ.safeParse({ action: 'approve' }).success, false)
  assert.equal(ReviewRequestZ.safeParse({ action: 'reject', candidateId: CAND }).success, false)
  assert.equal(ReviewRequestZ.safeParse({ action: 'publish' }).success, false)
  assert.equal(ReviewRequestZ.safeParse({ action: '학생에게전송', candidateId: CAND }).success, false)
  // 계약 밖 필드가 섞여도 거부한다
  assert.equal(ReviewRequestZ.safeParse({ action: 'publish', practiceProblemId: CAND, force: true }).success, false)
})

test('정상 요청은 통과한다', () => {
  assert.equal(ReviewRequestZ.safeParse({ action: 'approve', candidateId: CAND }).success, true)
  assert.equal(ReviewRequestZ.safeParse({
    action: 'approve', candidateId: CAND,
    edits: { answer_text: '21', solution_outline: ['가', '나'] },
  }).success, true)
  assert.equal(ReviewRequestZ.safeParse({
    action: 'approve_student_publish', practiceProblemId: CAND,
  }).success, true)
})

// ════════════════════════════════════════════════════════════════════
// F) null 이 정상값으로 둔갑하지 않는다 (D-066)
// ════════════════════════════════════════════════════════════════════

function rpcRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAND,
    batch_id: '55555555-5555-4555-8555-555555555555',
    source_problem_id: 5479,
    candidate_no: 1,
    source_fingerprint: 'fp',
    prompt_version: 'v1',
    variant_kind: null,
    problem_text_latex: '문항',
    answer_kind: 'number',
    answer_text: '20',
    solution_outline: [],
    concepts: [],
    common_mistakes: [],
    transformations: [],
    self_check_notes: [],
    type_code: 'T',
    difficulty_delta: null,
    reverse_derivation_risk: null,
    single_answer_claim: null,
    needs_new_image: false,
    generation_status: 'generated',
    unsupported_reason: null,
    generation_model: 'm',
    status: 'pending_review',
    reject_reason: null,
    format_validation_passed: true,
    deterministic_check_passed: false,
    independent_check_passed: false,
    ai_consensus_passed: false,
    teacher_approved: false,
    teacher_edited: false,
    verification_status: 'unverified',
    unverified_reason: 'no_cas',
    check_method: null,
    check_detail: {},
    format_issues: [],
    ai_issues: [],
    ai_answer_text: null,
    similarity_to_source: null,
    practice_problem_id: null,
    practice_status: null,
    student_publish_approved: null,
    is_published: null,
    created_at: '2026-09-23T00:00:00Z',
    ...over,
  }
}

test('확인되지 않은 값은 null 로 남는다', () => {
  const [{ candidate: rec }] = toRecords([rpcRow()] as never)
  assert.equal(rec.reverse_derivation_risk, null)
  assert.equal(rec.difficulty_delta, null)
  assert.equal(rec.single_answer_claim, null)
  assert.equal(rec.variant_kind, null)
  assert.equal(rec.flags.check_method, null)
  assert.equal(rec.similarity_to_source, null)
})

test('practice 가 없는 후보의 게시 상태만 보수적으로 false 가 된다', () => {
  const [{ candidate: rec }] = toRecords([rpcRow()] as never)
  // 이 방향(null → 승인 안 됨/게시 안 됨)만 허용한다. 반대는 절대 안 된다
  assert.equal(rec.student_publish_approved, false)
  assert.equal(rec.is_published, false)
})

test('toRecords 에 기본값 치환이 남아 있지 않다', () => {
  const src = read('lib/twin/repository.ts')
  for (const banned of ["reverse_derivation_risk ?? 'low'", 'difficulty_delta ?? 0',
                        'single_answer_claim ?? false', "check_method ?? 'none'",
                        "variant_kind ?? ''"]) {
    assert.ok(!src.includes(banned), `기본값 치환이 남아 있습니다: ${banned}`)
  }
})

test('검수 화면이 null 을 미확인으로 보여준다', () => {
  const ui = read('app/teacher/twin-review/page.tsx')
  assert.ok(ui.includes("const UNKNOWN = '미확인'"))
  assert.ok(ui.includes('역산 위험 <Unknown'), '위험도가 승인 버튼 근처에 미확인으로 보여야 합니다')
  assert.ok(ui.includes('검산 방법 <Unknown'))
})

// ════════════════════════════════════════════════════════════════════
// G) 설치 전 점검은 실패를 예외로 끝낸다 (§286)
// ════════════════════════════════════════════════════════════════════

test('설치 전 점검이 v_fail > 0 에서 예외로 끝난다', () => {
  const sql = read(SQL_PRECHECK)
  const tail = sql.slice(sql.indexOf('판정: 전부 OK'))
  assert.ok(tail.includes('raise exception'), '중단인데 notice 로만 끝납니다')
  assert.ok(!/else\s*\n\s*raise notice '판정: 중단/.test(sql))
})

test('설치 전 점검과 설치 SQL 이 같은 함수 목록을 본다', () => {
  const pre = read(SQL_PRECHECK)
  const install = read(SQL_INSTALL)
  const names = ['admin_list_twin_candidates', 'admin_get_twin_candidate',
                 'admin_approve_twin_candidate', 'admin_reject_twin_candidate',
                 'admin_set_student_publish_approval', 'admin_set_practice_publication',
                 'server_create_twin_candidate', 'server_update_twin_validation',
                 'server_list_eligible_twin_types']
  for (const n of names) {
    assert.ok(pre.includes(`'${n}'`), `점검 목록에 ${n} 가 없습니다`)
    assert.ok(install.includes(`'${n}'`), `설치 사전검사 목록에 ${n} 가 없습니다`)
  }
  // 둘 다 '이름' 기준이어야 한다 (§288)
  assert.ok(pre.includes('p.proname = any(v_names)'))
  assert.ok(install.includes('p.proname in ('))
})

// 함수 개수 검사는 `exec007.test.ts` 로 옮겼다.
// GPT-EXEC-007 에서 batch 상태 조회 RPC 가 늘어 9 → 10 이 됐고,
// 개수를 두 파일에 적어 두면 다음에 또 늘 때 한쪽만 고치게 된다.

test('옛 함수 개수 기준이 검증 SQL 에 남아 있지 않다', () => {
  const sql = read(SQL_VERIFY)
  assert.ok(!sql.includes('if v_bad <> 8 then'))
  assert.ok(!sql.includes('if v_bad <> 9 then'))
})

test('롤백 SQL 에 실행되는 CASCADE 가 없다', () => {
  const lines = read(SQL_ROLLBACK).split('\n')
    .filter(l => !l.trim().startsWith('--'))
    .filter(l => /cascade/i.test(l))
  assert.equal(lines.length, 0, `실행되는 CASCADE 가 있습니다: ${lines.join(' | ')}`)
})
