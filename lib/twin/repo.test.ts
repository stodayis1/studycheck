// 저장소 계약·모드·엄격 파싱 테스트 (GPT-EXEC-005 §196)
//
// 확인하는 것은 "잘 되는가"가 아니라 **안전장치가 뚫리지 않는가**다.
//   - 교사 수정 승인이 D-055 상태가 되는가
//   - 승인 후 거부하면 teacher_approved 가 내려가는가
//   - 자동 거부가 생성 그룹 안에서만 일어나는가
//   - RPC 응답을 보정 없이 거부하는가
//   - 관리자·서버 저장소의 권한 표면이 분리돼 있는가
//   - 학생 payload 에 정답·풀이가 없는가

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  FixtureAdminRepository, FixtureServerRepository,
  SupabaseAdminRepository, SupabaseServerRepository,
  TwinRepositoryError, parseListEnvelope, toRecords,
} from './repository'
import { fixturePairs } from './fixtures'
import { resolveMode, createAdminRepository, createServerRepository } from './mode'
import { studentSafeExample, type ExampleRow } from './publish'

function freshRepo() {
  const pairs = structuredClone(fixturePairs)
  return { repo: new FixtureAdminRepository(pairs), pairs }
}
const findC = (pairs: ReturnType<typeof freshRepo>['pairs'], id: string) => {
  for (const p of pairs) { const c = p.candidates.find(x => x.id === id); if (c) return c }
  throw new Error(`후보 없음: ${id}`)
}

// ════════════════════════════════════════════════════════════════════
// 1) 교사 수정 승인 — D-055
// ════════════════════════════════════════════════════════════════════

test('교사 수정 승인 상태가 D-055와 일치한다', async () => {
  const { repo, pairs } = freshRepo()
  const practiceId = await repo.approve('cand-0001', { answer_text: '265' })

  const c = findC(pairs, 'cand-0001')
  assert.equal(c.status, 'approved')
  assert.equal(c.flags.teacher_approved, true)
  assert.equal(c.teacher_edited, true)
  assert.ok(c.practice_problem_id, 'practice 가 만들어져야 한다')
  assert.equal(c.practice_problem_id, practiceId)

  // D-055 의 나머지 값이 전부 맞아야 한다
  assert.equal(c.flags.format_validation_passed, false)
  assert.equal(c.flags.deterministic_check_passed, false)
  assert.equal(c.flags.independent_check_passed, false)
  assert.equal(c.flags.ai_consensus_passed, false)
  assert.equal(c.verification_status, 'unverified')
  assert.equal(c.unverified_reason, 'teacher_edited')
  assert.equal(c.flags.check_method, 'none')
})

test('concepts 만 고쳐도 교사 수정으로 본다', async () => {
  const { repo, pairs } = freshRepo()
  await repo.approve('cand-0001', { concepts: ['다른개념'] })
  const c = findC(pairs, 'cand-0001')
  assert.equal(c.teacher_edited, true)
  assert.equal(c.flags.format_validation_passed, false)
})

test('common_mistakes 만 고쳐도 교사 수정으로 본다', async () => {
  const { repo, pairs } = freshRepo()
  await repo.approve('cand-0001', { common_mistakes: ['새 오개념'] })
  assert.equal(findC(pairs, 'cand-0001').teacher_edited, true)
})

test('고치지 않고 승인하면 자동검증 플래그가 유지된다', async () => {
  const { repo, pairs } = freshRepo()
  await repo.approve('cand-0001')
  const c = findC(pairs, 'cand-0001')
  assert.equal(c.teacher_edited, false)
  assert.equal(c.flags.format_validation_passed, true)
})

// ════════════════════════════════════════════════════════════════════
// 2) 승인 후 거부 — teacher_approved 가 내려간다
// ════════════════════════════════════════════════════════════════════

test('승인 후 거부하면 teacher_approved=false 가 된다', async () => {
  const { repo, pairs } = freshRepo()
  const id = await repo.approve('cand-0001')
  await repo.setStudentPublishApproval(id, true)
  await repo.setPublication(id, true)

  await repo.reject('cand-0001', '계산 오류')

  const c = findC(pairs, 'cand-0001')
  assert.equal(c.status, 'rejected')
  assert.equal(c.flags.teacher_approved, false, '거부됐는데 승인 상태로 남으면 안 된다')

  const p = repo.practices.find(x => x.id === id)!
  assert.equal(p.status, 'retired')
  assert.equal(p.student_publish_approved, false)
  assert.equal(p.is_asset_active, false, '학생에게서 즉시 내려가야 한다')
  assert.ok(p.retired_at)
})

test('자동 거부된 후보도 teacher_approved=false 다', async () => {
  const { repo, pairs } = freshRepo()
  await repo.approve('cand-0001')
  const other = findC(pairs, 'cand-0002')
  assert.equal(other.status, 'rejected')
  assert.equal(other.flags.teacher_approved, false)
})

// ════════════════════════════════════════════════════════════════════
// 3) 자동 거부 범위 — D-058
// ════════════════════════════════════════════════════════════════════

test('생성 그룹이 다른 후보는 자동 거부되지 않는다', async () => {
  const { repo, pairs } = freshRepo()
  await repo.approve('cand-0001')

  // 같은 batch·fingerprint·prompt_version → 거부됨
  assert.equal(findC(pairs, 'cand-0002').status, 'rejected')

  // 같은 원문이지만 다른 batch·prompt_version → 살아 있어야 한다
  const otherBatch = findC(pairs, 'cand-0001-b2')
  assert.equal(otherBatch.status, 'pending_review',
    '새 배치로 만든 정상 후보가 과거 승인 때문에 거부되면 안 된다')
})

test('다른 원문의 후보는 영향을 받지 않는다', async () => {
  const { repo, pairs } = freshRepo()
  await repo.approve('cand-0001')
  assert.equal(findC(pairs, 'cand-0003').status, 'pending_review')
})

// ════════════════════════════════════════════════════════════════════
// 4) 상태 전이 — D-050 · D-051
// ════════════════════════════════════════════════════════════════════

test('안전 승인 없이는 게시할 수 없다', async () => {
  const { repo } = freshRepo()
  const id = await repo.approve('cand-0001')
  await assert.rejects(() => repo.setPublication(id, true), /student_publish_approval_required/)
})

test('승인 → 안전승인 → 게시 순서로만 학생에게 나간다', async () => {
  const { repo } = freshRepo()
  const id = await repo.approve('cand-0001')
  const p0 = repo.practices.find(p => p.id === id)!
  assert.equal(p0.is_asset_active, false)

  await repo.setStudentPublishApproval(id, true)
  await repo.setPublication(id, true)
  const p1 = repo.practices.find(p => p.id === id)!
  assert.equal(p1.status, 'published')
  assert.equal(p1.is_asset_active, true)
})

test('게시 중 안전 승인을 끄면 게시가 함께 내려간다', async () => {
  const { repo, pairs } = freshRepo()
  const id = await repo.approve('cand-0001')
  await repo.setStudentPublishApproval(id, true)
  await repo.setPublication(id, true)

  await repo.setStudentPublishApproval(id, false)

  const p = repo.practices.find(x => x.id === id)!
  assert.equal(p.status, 'approved')
  assert.equal(p.is_asset_active, false)
  assert.ok(p.first_published_at, '최초 게시 이력은 남는다')
  assert.equal(findC(pairs, 'cand-0001').is_published, false)
})

test('폐기된 예제는 재게시·재안전승인할 수 없다', async () => {
  const { repo } = freshRepo()
  const id = await repo.approve('cand-0001')
  await repo.setStudentPublishApproval(id, true)
  await repo.setPublication(id, true)
  await repo.reject('cand-0001', '계산 오류')

  await assert.rejects(() => repo.setPublication(id, true), /invalid_state/)
  await assert.rejects(() => repo.setStudentPublishApproval(id, true), /invalid_state/)
})

test('안전 승인 최초 이력은 끄더라도 남는다', async () => {
  const { repo } = freshRepo()
  const id = await repo.approve('cand-0001')
  await repo.setStudentPublishApproval(id, true)
  const first = repo.practices.find(p => p.id === id)!.publish_first_approved_at
  assert.ok(first)
  await repo.setStudentPublishApproval(id, false)
  assert.equal(repo.practices.find(p => p.id === id)!.publish_first_approved_at, first)
})

test('거부 사유 없이는 거부할 수 없다', async () => {
  const { repo } = freshRepo()
  await assert.rejects(() => repo.reject('cand-0001', '' as never), /reason_required/)
})

test('허용되지 않은 편집 키는 전체 요청이 거부된다', async () => {
  const { repo } = freshRepo()
  await assert.rejects(
    () => repo.approve('cand-0001', { type_code: 'X' } as never), /unknown_edit_key/)
})

test('검수 대기 후보만 목록에 올린다', async () => {
  const { repo } = freshRepo()
  await repo.approve('cand-0001')
  const ids = (await repo.listPendingReview()).flatMap(p => p.candidates.map(c => c.id))
  assert.equal(ids.includes('cand-0001'), false)
  assert.equal(ids.includes('cand-0002'), false)
  assert.ok(ids.includes('cand-0001-b2'), '다른 배치 후보는 남아 있다')
})

// ════════════════════════════════════════════════════════════════════
// 5) 엄격 파싱 — D-059 (묵시적 보정 금지)
// ════════════════════════════════════════════════════════════════════

function validRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    batch_id: '44444444-4444-4444-8444-444444444444',
    source_problem_id: 47314, candidate_no: 1,
    source_fingerprint: 'fp', type_code: '공수1-09-08', status: 'pending_review',
    problem_text_latex: '문제', answer_kind: 'number', answer_text: '44',
    solution_outline: ['a', 'b'], concepts: [], common_mistakes: [],
    transformations: [], self_check_notes: [],
    variant_kind: 'mixed', difficulty_delta: 0,
    reverse_derivation_risk: 'low', single_answer_claim: true,
    format_validation_passed: true, deterministic_check_passed: false,
    independent_check_passed: false, ai_consensus_passed: true, teacher_approved: false,
    verification_status: 'unverified', unverified_reason: 'no_cas', check_method: 'second_model',
    format_issues: [], ai_issues: [], ai_answer_text: null, similarity_to_source: 0.1,
    teacher_edited: false, reject_reason: null,
    practice_problem_id: null, practice_status: null,
    student_publish_approved: null, is_published: null,
    generation_model: 'gpt-6-astra', prompt_version: 'twin-gen-v1.1',
    created_at: '2026-09-23T10:00:00Z',
    source_book: '쎈', source_difficulty: '대표', source_step: 'B',
    source_answer_kind: 'choice', source_answer_text: '①',
    source_image_path: 'p.png', source_type_title: '유형명',
    ...over,
  }
}
const envelope = (items: unknown[], over: Record<string, unknown> = {}): Record<string, unknown> =>
  ({ items, total: items.length, limit: 50, offset: 0, ...over })

test('정상 응답은 파싱된다', () => {
  const rows = parseListEnvelope(envelope([validRow()]))
  assert.equal(rows.length, 1)
  const rec = toRecords(rows)[0]
  assert.equal(rec.candidate.answer_text, '44')
  assert.equal(rec.source.id, 47314)
  assert.equal(rec.candidate.flags.independent_check_passed, false)
})

test('envelope 의 total·limit·offset 이 없으면 거부한다', () => {
  assert.throws(() => parseListEnvelope({ items: [] }), /bad_response/)
  assert.throws(() => parseListEnvelope({ items: [], total: 0 }), /bad_response/)
  assert.throws(() => parseListEnvelope({ items: [], total: 0, limit: 50 }), /bad_response/)
})

test('envelope 값이 문자열·음수·소수면 거부한다', () => {
  assert.throws(() => parseListEnvelope(envelope([], { total: '0' })), /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([], { offset: -1 })), /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([], { limit: 1.5 })), /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([], { limit: 0 })), /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([], { limit: 101 })), /bad_response/)
})

test('옛 응답 모양(candidates)은 거부한다', () => {
  assert.throws(() => parseListEnvelope({ candidates: [] }), /bad_response/)
  assert.throws(() => parseListEnvelope(null), /bad_response/)
  assert.throws(() => parseListEnvelope({}), /bad_response/)
})

test('잘못된 enum 값을 전부 거부한다', () => {
  for (const bad of [
    { status: 'auto_validated' },          // DB 에 없는 상태
    { status: 'published' },               // 후보 상태가 아니다
    { verification_status: 'ok' },
    { check_method: 'guess' },
    { practice_status: 'draft' },
    { reverse_derivation_risk: 'extreme' },
    { answer_kind: 'image' },
  ]) {
    assert.throws(() => parseListEnvelope(envelope([validRow(bad)])), /bad_response/,
      `거부해야 함: ${JSON.stringify(bad)}`)
  }
})

test("문자열 'false' 가 true 로 바뀌지 않는다", () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ teacher_edited: 'false' })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ format_validation_passed: 'true' })])),
    /bad_response/)
})

test('숫자 문자열이 숫자로 바뀌지 않는다', () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ source_problem_id: '47314' })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ candidate_no: '1' })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ similarity_to_source: '0.1' })])),
    /bad_response/)
})

test('무한대·NaN 을 거부한다', () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ similarity_to_source: Infinity })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ similarity_to_source: NaN })])),
    /bad_response/)
})

test('문자열 배열이 아닌 배열을 거부한다', () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ solution_outline: [1, 2] })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ concepts: [{ a: 1 }] })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ ai_issues: 'not-array' })])),
    /bad_response/)
})

test('잘못된 format_issues 모양을 거부한다', () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ format_issues: ['문자열'] })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ format_issues: [{ code: 'x' }] })])),
    /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({
    format_issues: [{ code: 'x', detail: 'y', extra: 1 }] })])), /bad_response/)
})

test('uuid 가 아닌 id 를 거부한다', () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ id: 'not-a-uuid' })])), /bad_response/)
})

test('nullable 필드에 잘못된 타입이 오면 거부한다', () => {
  assert.throws(() => parseListEnvelope(envelope([validRow({ ai_answer_text: 42 })])), /bad_response/)
  assert.throws(() => parseListEnvelope(envelope([validRow({ reject_reason: false })])), /bad_response/)
})

test('RPC 오류 메시지는 내부 내용을 흘리지 않는다', () => {
  const e = new TwinRepositoryError('rpc_failed', 'list')
  assert.equal(e.message.includes('select'), false)
  assert.equal(e.message.includes('answer'), false)
  assert.match(e.message, /twin_repository_error/)
})

// ════════════════════════════════════════════════════════════════════
// 6) 관리자·서버 저장소 분리 — D-060
// ════════════════════════════════════════════════════════════════════

const ENV_PROD = {
  NODE_ENV: 'production', TWIN_REPOSITORY_MODE: 'supabase',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
} as NodeJS.ProcessEnv

test('관리자 저장소에는 생성·검증 메서드가 없다', () => {
  const { repo } = createAdminRepository('fake-jwt', ENV_PROD)
  const r = repo as unknown as Record<string, unknown>
  assert.equal(typeof r.createCandidate, 'undefined', 'createCandidate 가 있으면 안 된다')
  assert.equal(typeof r.updateValidation, 'undefined', 'updateValidation 이 있으면 안 된다')
  assert.equal(typeof r.approve, 'function')
})

test('서버 저장소에는 승인·게시 메서드가 없다', () => {
  const { repo } = createServerRepository(ENV_PROD)
  const r = repo as unknown as Record<string, unknown>
  assert.equal(typeof r.approve, 'undefined', 'approve 가 있으면 안 된다')
  assert.equal(typeof r.reject, 'undefined')
  assert.equal(typeof r.setPublication, 'undefined')
  assert.equal(typeof r.setStudentPublishApproval, 'undefined')
  assert.equal(typeof r.listPendingReview, 'undefined')
  assert.equal(typeof r.createCandidate, 'function')
})

test('supabase 모드는 fixture 구현을 돌려주지 않는다', () => {
  const admin = createAdminRepository('fake-jwt', ENV_PROD)
  assert.ok(admin.repo instanceof SupabaseAdminRepository)
  assert.equal(admin.repo instanceof FixtureAdminRepository, false)

  const server = createServerRepository(ENV_PROD)
  assert.ok(server.repo instanceof SupabaseServerRepository)
  assert.equal(server.repo instanceof FixtureServerRepository, false)
})

test('fixture 서버 저장소는 생성을 지원하지 않는다', async () => {
  const repo = new FixtureServerRepository()
  await assert.rejects(() => repo.createCandidate({} as never), /not_supported/)
  await assert.rejects(() => repo.updateValidation('x', {} as never), /not_supported/)
})

// ════════════════════════════════════════════════════════════════════
// 7) 저장소 모드 — production fail closed
// ════════════════════════════════════════════════════════════════════

test('production 에서 모드를 지정하지 않으면 멈춘다', () => {
  assert.throws(() => resolveMode({ NODE_ENV: 'production' } as NodeJS.ProcessEnv),
    /mode_required_in_production|반드시 지정/)
})

test('production 에서 fixture 를 쓰려 하면 멈춘다', () => {
  assert.throws(() => resolveMode(
    { NODE_ENV: 'production', TWIN_REPOSITORY_MODE: 'fixture' } as NodeJS.ProcessEnv), /fixture/)
})

test('VERCEL_ENV=production 도 production 으로 본다', () => {
  assert.throws(() => resolveMode(
    { NODE_ENV: 'development', VERCEL_ENV: 'production' } as NodeJS.ProcessEnv),
    /mode_required_in_production|반드시 지정/)
})

test('개발 환경의 기본값은 fixture 다', () => {
  assert.equal(resolveMode({ NODE_ENV: 'development' } as NodeJS.ProcessEnv), 'fixture')
})

test('알 수 없는 모드 값은 거부한다', () => {
  assert.throws(() => resolveMode(
    { NODE_ENV: 'development', TWIN_REPOSITORY_MODE: 'mock' } as NodeJS.ProcessEnv),
    /올바르지 않습니다/)
})

test('supabase 모드인데 토큰이 없으면 멈춘다', () => {
  assert.throws(() => createAdminRepository('', ENV_PROD), /access_token_required|로그인 토큰/)
})

// ════════════════════════════════════════════════════════════════════
// 8) 학생 직렬화 — D-061
// ════════════════════════════════════════════════════════════════════

const row = (over: Partial<ExampleRow> = {}): ExampleRow => ({
  id: 'p1', type_code: 'T', problem_text_latex: '문제 본문',
  answer_text: '42', solution_outline: ['1단계', '2단계'],
  status: 'published', student_publish_approved: true, retired_at: null,
  ...over,
})

test('학생 payload 에 정답·풀이가 없다', () => {
  const out = studentSafeExample(row())
  assert.ok(out)
  const keys = Object.keys(out as object)
  assert.equal(keys.includes('answer_text'), false)
  assert.equal(keys.includes('solution_outline'), false)
  const json = JSON.stringify(out)
  assert.equal(json.includes('42'), false, '정답 값이 직렬화에 섞이면 안 된다')
  assert.equal(json.includes('1단계'), false, '풀이가 섞이면 안 된다')
})

test('published 가 아니면 학생에게 나가지 않는다', () => {
  assert.equal(studentSafeExample(row({ status: 'approved' })), null)
  assert.equal(studentSafeExample(row({ status: 'retired', student_publish_approved: false })), null)
})

test('retired 는 게시 상태여도 나가지 않는다', () => {
  assert.equal(studentSafeExample(row({ retired_at: '2026-09-23T00:00:00Z' })), null)
})

test('safe=false 는 게시돼 있어도 나가지 않는다', () => {
  assert.equal(studentSafeExample(row({ student_publish_approved: false })), null)
})

// ════════════════════════════════════════════════════════════════════
// 9) SQL 파일 정적 회귀검사 — §209~212
// ════════════════════════════════════════════════════════════════════

const readSql = (name: string) => readFileSync(`docs/sql/${name}`, 'utf8')
/** 주석(`--`)을 뺀 실행 구문만 남긴다. */
const codeOnly = (sql: string) =>
  sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

test('롤백 SQL 에 실행 가능한 DROP ... CASCADE 가 없다', () => {
  const code = codeOnly(readSql('쌍둥이_롤백.sql'))
  assert.equal(/\bcascade\b/i.test(code), false, 'D-057: cascade 를 쓰지 않는다')
  // 대신 제약을 명시적으로 끊어야 한다
  assert.match(code, /drop constraint if exists twin_cand_practice_fk/)
})

test('설치 후 검증 SQL 에 psql 변수 문법이 없다', () => {
  const sql = readSql('쌍둥이_설치후_검증.sql')
  assert.equal(sql.includes(":'"), false, 'Supabase SQL Editor 는 이 문법을 지원하지 않는다')
})

test('설치 후 검증 SQL 이 실패를 exception 으로 끝낸다', () => {
  const code = codeOnly(readSql('쌍둥이_설치후_검증.sql'))
  assert.equal(/raise\s+warning/i.test(code), false, 'D-056: warning 으로 삼키면 안 된다')
  assert.ok((code.match(/raise exception/gi) ?? []).length >= 10)
  assert.match(code, /^rollback;/m)
})

test('설치 후 검증 4-4 가 별도 generated 후보로 불변식을 확인한다', () => {
  const sql = readSql('쌍둥이_설치후_검증.sql')
  assert.match(sql, /v_c3/, '새 후보를 만들어야 한다')
  assert.match(sql, /validation_invariant_violation/, '정확한 오류를 확인해야 한다')
})

test('설치 SQL 이 한 트랜잭션이고 사전검사가 있다', () => {
  const sql = readSql('쌍둥이_설치.sql')
  assert.match(sql, /^begin;/m)
  assert.match(sql, /^commit;/m)
  assert.match(sql, /do \$pre\$/)
  assert.match(sql, /pronargs = 0/, 'is_admin/is_staff 를 정확한 시그니처로 확인해야 한다')
})

test('설치 SQL 의 불변식이 교사 수정 승인을 허용한다', () => {
  const sql = readSql('쌍둥이_설치.sql')
  assert.match(sql, /when 'approved' then/, '상태별 분기가 있어야 한다')
  assert.match(sql, /unverified_reason = 'teacher_edited'/, 'D-055 분기가 있어야 한다')
})

test('설치 전 점검 SQL 이 읽기 전용이다', () => {
  const code = codeOnly(readSql('쌍둥이_설치전_점검.sql'))
  for (const kw of ['insert into', 'update ', 'delete from', 'create table', 'alter table', 'drop table']) {
    assert.equal(code.toLowerCase().includes(kw), false, `읽기 전용이어야 한다: ${kw}`)
  }
})
