/**
 * GPT-EXEC-041 유한 대조 — **첫 브라우저 사용판**의 서버 쪽 경계
 *
 * 무엇을 보는가
 *   R040-A~D 의 네 고침과, 그것을 쓰는 저장·격리·노출 경계.
 *
 * 하지 않는 것
 *   운영 DB·Storage·모델·네트워크 **0건.** 저장은 임시폴더의 시험 파일이다.
 *   브라우저 동작은 이 시험이 아니라 `evidence-041/` 의 화면 기록으로 본다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  previewNextAction, compareEvents, segmentKeyOf, ORDERED_ARRAY_KEYS,
  type ApprovedRelation, type PreviewInput, type EventEnvelope,
  type ExposureReview, type ConfirmActionItem,
} from './learningPreview'

import {
  PROBLEMS, PILOT_TYPES, problemById, relationsFor, forStudent,
  gradeConfirmItem, gradeProblem, assetById,
} from '../learning/catalog'
import { FileLearningStore } from '../learning/store'
import { makeCookieValue, studentIdFromCookieValue, readCookie } from '../learning/session'
import { emptyAttempt, summarize, type AttemptRow, type StudentRow, type TaskRow } from '../learning/contract'

// ── 합성 fixture ────────────────────────────────────────────────────
const SCOPE = 'syn-041-A'
const PROBLEM = 'syn-041-problem'
const TYPE = '공수1-01-02'

const ITEM: ConfirmActionItem = {
  itemRef: 'syn-041-item', prompt: '[시연] 확인 항목', choices: ['가', '나'], origin: 'demo',
}

function review(
  over: Partial<ExposureReview> = {}, scopeOver: Partial<ExposureReview['scope']> = {},
): ExposureReview {
  return {
    verdict: 'safe',
    scope: { problemRefId: PROBLEM, taskGoal: 'solve', assetVersion: 1, segmentKey: 'full', ...scopeOver },
    reviewedBy: 'syn', reviewedAt: '2026-10-24T00:00:00Z',
    ...over,
  }
}

function rel(over: Partial<ApprovedRelation> = {}): ApprovedRelation {
  return {
    relationId: 'syn-041-rel', relationKind: 'concept_explanation', videoKind: 'concept',
    typeCode: TYPE, supportedAxes: ['recall'], relationReviewed: true, assetReviewed: true,
    assetVersion: 1, reachableByStudent: true, wholeDeliverySafe: true, confirmItems: [ITEM],
    exposureReview: review(),
    contentRef: { kind: 'video', id: 'syn-041-asset', version: 1 },
    ...over,
  }
}

function input(over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    resolvedStudentScope: SCOPE, attemptRef: 'syn-041-att',
    problemRef: { kind: 'problem', id: PROBLEM, version: 1 },
    typeCode: TYPE, taskGoal: 'solve',
    stuck: { axis: 'recall', evidenceEventIds: ['e1'], helpObserved: 'unmeasured', repeatedMisconceptions: null },
    relations: [rel()],
    ...over,
  }
}

// ════════════════════════════════════════════════════════════════════
// A. R040-A — 미측정을 0 으로 바꾸지 않는다
// ════════════════════════════════════════════════════════════════════

test('A1 값 없는 창열림을 **0ms 관측**으로 적지 않는다', () => {
  const o = previewNextAction(input({ videoObservation: { method: 'window_elapsed' } }))
  assert.ok(!o.evidence.observed.some((x) => /창 열림 0ms/.test(x)), '0 으로 치환했습니다')
  assert.ok(!o.evidence.observed.some((x) => /창 열림 \d/.test(x)), '없는 값을 관측에 넣었습니다')
  assert.ok(o.evidence.unknownScope.some((u) => /창 열림 시간 \(값 없음/.test(u)))
})

test('A2 **실제 0 은 0 으로** 적는다 — 미측정과 구별된다', () => {
  const o = previewNextAction(input({
    videoObservation: { method: 'window_elapsed', windowElapsedMs: 0 },
  }))
  assert.ok(o.evidence.observed.some((x) => /창 열림 0ms/.test(x)), '진짜 0 을 지웠습니다')
  assert.ok(!o.evidence.unknownScope.some((u) => /창 열림 시간 \(값 없음/.test(u)))
})

test('A3 재생 관측도 빠진 칸만 미측정으로 간다', () => {
  const o = previewNextAction(input({
    videoObservation: { method: 'player_coverage', coveragePct: 0, coveredSeconds: 0 },
  }))
  // 0% · 0초는 **관측된 0** 이다
  assert.ok(o.evidence.observed.some((x) => /재생 구간 0%/.test(x)))
  assert.ok(o.evidence.observed.some((x) => /서로 다른 재생 0초/.test(x)))
  // 주지 않은 칸만 미측정
  for (const miss of ['장면별 재생 초', '탭 전환 중 재생 초', '시청 완료 여부']) {
    assert.ok(o.evidence.unknownScope.includes(miss), `${miss} 가 미측정에 없습니다`)
  }
  // 합친 점수를 만들지 않는다
  assert.ok(!/집중\s*점수|focus_score/i.test(o.evidence.observed.join(' ')))
})

test('A4 NaN·null 은 측정이 아니다', () => {
  const o = previewNextAction(input({
    videoObservation: { method: 'player_coverage', coveragePct: NaN, coveredSeconds: null as never },
  }))
  assert.ok(!o.evidence.observed.some((x) => /NaN|null/.test(x)))
  assert.ok(o.evidence.unknownScope.includes('재생 구간 비율'))
  assert.ok(o.evidence.unknownScope.includes('서로 다른 재생 초'))
})

// ════════════════════════════════════════════════════════════════════
// B. R040-B — 의미가 같은 이벤트를 충돌로 보지 않는다
// ════════════════════════════════════════════════════════════════════

function env(client: Record<string, unknown>): EventEnvelope {
  return { resolvedStudentScope: SCOPE, validatedProducer: 'studycheck-041', eventId: 'E1', clientEvent: client }
}

test('B1 중첩 객체의 **키 순서**만 다르면 중복이다', () => {
  const a = env({ observed: { is_correct: false, axis: 'recall' }, unmeasured: ['help_used'] })
  const b = env({ unmeasured: ['help_used'], observed: { axis: 'recall', is_correct: false } })
  const v = compareEvents(a, b)
  assert.equal(v.verdict, 'duplicate', `키 순서를 충돌로 봤습니다: ${JSON.stringify(v)}`)
})

test('B2 `unmeasured[]` 는 **집합**이다 — 순서·중복이 달라도 중복', () => {
  const a = env({ unmeasured: ['help_used', 'solve_time'] })
  const b = env({ unmeasured: ['solve_time', 'help_used'] })
  assert.equal(compareEvents(a, b).verdict, 'duplicate', 'unmeasured 순서를 충돌로 봤습니다')
  const c = env({ unmeasured: ['solve_time', 'help_used', 'help_used'] })
  assert.equal(compareEvents(a, c).verdict, 'duplicate', 'unmeasured 중복을 충돌로 봤습니다')
})

test('B3 `unmeasured` 의 **내용**이 달라지면 여전히 충돌이다', () => {
  const a = env({ unmeasured: ['help_used'] })
  const b = env({ unmeasured: ['help_used', 'solve_time'] })
  const v = compareEvents(a, b)
  assert.equal(v.verdict, 'conflict')
  assert.deepEqual((v as { changedFields: string[] }).changedFields, ['unmeasured'])
})

test('B4 `content_refs[]` 는 **순서가 의미**다 — 정렬하지 않는다', () => {
  const a = env({ content_refs: ['v-1', 'v-2'] })
  const b = env({ content_refs: ['v-2', 'v-1'] })
  const v = compareEvents(a, b)
  assert.equal(v.verdict, 'conflict', 'content_refs 순서를 무시했습니다')
  assert.ok((v as { changedFields: string[] }).changedFields.includes('content_refs'))
  assert.ok(ORDERED_ARRAY_KEYS.includes('content_refs'))
})

test('B5 서버 부가값만 바뀌면 중복이고, 다른 학생은 섞지 않는다', () => {
  const a = env({ observed: { is_correct: true } })
  const b: EventEnvelope = { ...env({ observed: { is_correct: true }, received_at: '10:00' }) }
  assert.equal(compareEvents(a, b).verdict, 'duplicate')
  const other: EventEnvelope = { ...a, resolvedStudentScope: 'syn-041-B' }
  assert.equal(compareEvents(a, other).verdict, 'distinct')
})

// ════════════════════════════════════════════════════════════════════
// C. R040-C — 노출은 승인된 검수 범위로만
// ════════════════════════════════════════════════════════════════════

test('C1 검수 기록이 **없으면** 보류한다', () => {
  const o = previewNextAction(input({ relations: [rel({ exposureReview: undefined })] }))
  assert.equal(o.recommendedAction.kind, 'teacher_async')
  assert.match(o.recommendedAction.rejected[0].why, /노출 검수 기록 없음/)
})

test('C2 범위가 어긋나면 보류한다 — 네 가지 각각', () => {
  const cases: Array<[string, ApprovedRelation, RegExp]> = [
    ['원문', rel({ exposureReview: review({}, { problemRefId: 'other' }) }), /\(원문\)/],
    ['과제 목적', rel({ exposureReview: review({}, { taskGoal: 'prove' }) }), /\(과제 목적\)/],
    ['자산 판', rel({ assetVersion: 2, exposureReview: review({}, { assetVersion: 1 }) }), /\(자산 판\)/],
    ['구간', rel({ segment: { startSeconds: 1, endSeconds: 2 },
                   exposureReview: review({}, { segmentKey: 'full' }) }), /\(구간\)/],
  ]
  for (const [name, r, re] of cases) {
    const o = previewNextAction(input({ relations: [r] }))
    assert.equal(o.recommendedAction.kind, 'teacher_async', `${name} 어긋남을 통과시켰습니다`)
    assert.match(o.recommendedAction.rejected[0].why, re)
  }
})

test('C3 **구간만 붙여서** 통과시킬 수 없다', () => {
  const full = rel({ segment: undefined, exposureReview: review({}, { segmentKey: 'full' }) })
  assert.equal(previewNextAction(input({ relations: [full] })).recommendedAction.relationId,
    'syn-041-rel', '통째 safe 검수가 막혔습니다')
  // 같은 검수에 구간만 추가 → 범위가 달라져 보류
  const smuggled = { ...full, segment: { startSeconds: 5, endSeconds: 9 } }
  const o = previewNextAction(input({ relations: [smuggled] }))
  assert.equal(o.recommendedAction.kind, 'teacher_async')
})

test('C4 **검수 전 자산**은 구간을 붙여도 통과하지 않는다', () => {
  const seg = { startSeconds: 5, endSeconds: 9 }
  const r = rel({ assetReviewed: false, segment: seg,
                  exposureReview: review({}, { segmentKey: segmentKeyOf(seg) }) })
  const o = previewNextAction(input({ relations: [r] }))
  assert.equal(o.recommendedAction.kind, 'teacher_async')
  assert.match(o.recommendedAction.rejected[0].why, /자산 품질 검수 전/)
})

test('C5 **증명 통째라서** 막는 규칙은 없다 — 승인되면 쓴다', () => {
  const r = rel({
    relationKind: 'theorem_proof', videoKind: 'proof', segment: undefined,
    exposureReview: review({}, { taskGoal: 'prove', segmentKey: 'full' }),
  })
  const o = previewNextAction(input({ taskGoal: 'prove', relations: [r] }))
  assert.equal(o.recommendedAction.relationId, 'syn-041-rel')
})

test('C6 열람 가능 여부를 **client 가 정하지 않는다** — 관계가 들고 온다', () => {
  const o = previewNextAction(input({ relations: [rel({ reachableByStudent: false })] }))
  assert.match(o.recommendedAction.rejected[0].why, /열 수 없음/)
})

// ════════════════════════════════════════════════════════════════════
// D. R040-D — 빈 문장을 만들지 않는다
// ════════════════════════════════════════════════════════════════════

test('D1 확인 항목이 없으면 **도움 자체를 내지 않는다**', () => {
  const empties: Array<ConfirmActionItem[] | undefined> = [undefined, []]
  for (const items of empties) {
    const o = previewNextAction(input({ relations: [rel({ confirmItems: items })] }))
    assert.equal(o.recommendedAction.kind, 'teacher_async')
    assert.match(o.recommendedAction.rejected[0].why, /확인 행동으로 낼 검수된 항목이 없음/)
  }
})

test('D2 확인 행동이 나오면 **제출 가능한 항목**이 1개 이상 붙는다', () => {
  const o = previewNextAction(input())
  assert.ok(o.confirmAction !== null)
  assert.ok(o.confirmAction.items.length >= 1)
  assert.equal(o.confirmAction.items[0].itemRef, 'syn-041-item')
  assert.equal(o.confirmAction.items[0].origin, 'demo', '시연 항목을 운영으로 표시했습니다')
})

test('D3 열 수 없는 대체 과제는 **대체로 세지 않는다**', () => {
  const o = previewNextAction(input({
    relations: [rel({ reachableByStudent: false })],
    availableFallbackTasks: [
      { taskRef: 't1', label: '열림', reachableByStudent: true, href: '/learning?task=t1' },
      { taskRef: 't2', label: '안 열림', reachableByStudent: false, href: '/learning?task=t2' },
    ],
  }))
  assert.deepEqual(o.recommendedAction.fallbackTasks.map((t) => t.taskRef), ['t1'])
  assert.ok(o.planDraft.items.some((i) => /t1/.test(i)))
  assert.ok(!o.planDraft.items.some((i) => /t2/.test(i)))
})

// ════════════════════════════════════════════════════════════════════
// E. 카탈로그 — 정답을 내보내지 않는다
// ════════════════════════════════════════════════════════════════════

test('E1 학생용 문항에는 **정답 칸이 없다**', () => {
  for (const p of PROBLEMS) {
    const s = forStudent(p) as Record<string, unknown>
    assert.ok(!('answer' in s), `${p.problemId} 에 정답이 남았습니다`)

    if (p.choices !== null) {
      // 객관식이면 정답은 **보기 중 하나와 글자까지 같아야** 한다.
      // 보기에 없는 답을 두면 학생이 고를 수 없는 문항이 된다
      assert.ok(p.choices.includes(p.answer),
        `${p.problemId} 정답이 보기에 없습니다: ${p.answer}`)
      // 그래서 정답 문자열이 응답에 보이는 것은 **보기이기 때문**이다.
      // 보기를 빼고 나면 어디에도 없어야 한다
      const withoutChoices: Record<string, unknown> = { ...s, choices: null }
      assert.ok(!JSON.stringify(withoutChoices).includes(p.answer),
        `${p.problemId} 정답이 보기 밖에서 새어나갔습니다`)
    } else {
      assert.ok(!JSON.stringify(s).includes(p.answer),
        `${p.problemId} 서술형 모범답안이 새어나갔습니다`)
    }
  }
})

test('E2 서술형 모범답안은 **어떤 보기에도 들어 있지 않다**', () => {
  const prove = PROBLEMS.find((p) => p.taskGoal === 'prove')
  assert.ok(prove !== undefined)
  const s = JSON.stringify(forStudent(prove))
  assert.ok(!s.includes(prove.answer))
  // 확인 항목의 보기에도 모범답안 문장이 없어야 한다
  for (const r of relationsFor(prove.problemId)) {
    for (const it of r.confirmItems ?? []) {
      assert.ok(!(it.choices ?? []).some((c) => c === prove.answer))
    }
  }
})

test('E3 채점 기준이 없으면 **null** 이다 — 맞음/틀림으로 바꾸지 않는다', () => {
  assert.equal(gradeConfirmItem('없는-항목', '아무거나'), null)
  const prove = PROBLEMS.find((p) => p.taskGoal === 'prove')
  assert.equal(gradeProblem(prove.problemId, prove.answer), null, '서술형을 자동 채점했습니다')
  assert.equal(gradeProblem('없는-문항', 'x'), null)
})

test('E4 채점은 공백·음수기호 표기만 맞춘다', () => {
  const p = problemById('demo-p-0102-1')
  assert.equal(gradeProblem(p.problemId, '−1'), 'correct')   // U+2212
  assert.equal(gradeProblem(p.problemId, ' -1 '), 'correct')
  assert.equal(gradeProblem(p.problemId, '1'), 'wrong')
})

test('E5 유형 코드·이름은 **로컬 실제 자료**로 표시된다', () => {
  for (const t of PILOT_TYPES) {
    assert.equal(t.provenance, 'local_real')
    assert.match(t.typeCode, /^공수1-\d\d-\d\d$/)
  }
  // 문제·영상은 시연으로 표시한다 — 섞지 않는다
  for (const p of PROBLEMS) assert.equal(p.provenance, 'demo')
})

test('E6 카탈로그가 만드는 관계의 검수 범위는 **지금 원문·목적**과 맞는다', () => {
  for (const p of PROBLEMS) {
    for (const r of relationsFor(p.problemId)) {
      assert.equal(r.exposureReview.scope.problemRefId, p.problemId)
      assert.equal(r.exposureReview.scope.taskGoal, p.taskGoal)
      assert.ok(assetById(r.contentRef.id) !== null, `${r.relationId} 의 자산이 없습니다`)
    }
  }
})

test('E7 이 원문의 전체 풀이와 배정 안 된 영상은 **실제로 막힌다**', () => {
  const rels = relationsFor('demo-p-0102-1')
  const out = previewNextAction({
    resolvedStudentScope: SCOPE, attemptRef: 'a',
    problemRef: { kind: 'problem', id: 'demo-p-0102-1', version: 1 },
    typeCode: '공수1-01-02', taskGoal: 'solve',
    stuck: { axis: 'recall', evidenceEventIds: [], helpObserved: 'unmeasured', repeatedMisconceptions: null },
    relations: rels,
  })
  const why = Object.fromEntries(out.recommendedAction.rejected.map((r) => [r.relationId, r.why]))
  assert.match(why['rel-0102-worked'], /답이 드러남/)
  assert.match(why['rel-0102-unassigned'], /열 수 없음/)
  // 원장님 방침(2026-10-27): **대표예제 풀이가 1순위**다
  assert.equal(out.recommendedAction.relationId, 'rel-0102-worked-type')
})

// ════════════════════════════════════════════════════════════════════
// F. 저장소 — 격리와 되읽기
// ════════════════════════════════════════════════════════════════════

function tmpStore(): { store: FileLearningStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'sc041-'))
  return { store: new FileLearningStore(join(dir, 'store.json')), dir }
}

const S_A: StudentRow = { studentId: 'sA', loginCode: 'A', displayName: 'A', provenance: 'demo' }
const S_B: StudentRow = { studentId: 'sB', loginCode: 'B', displayName: 'B', provenance: 'demo' }
const T_A: TaskRow = { taskId: 'tA', studentId: 'sA', label: 'A 과제', typeCode: TYPE,
  problemIds: ['p1'], assigned: true, provenance: 'demo' }
const T_A_OFF: TaskRow = { ...T_A, taskId: 'tA-off', label: '배정 안 함', assigned: false }
const T_B: TaskRow = { ...T_A, taskId: 'tB', studentId: 'sB', label: 'B 과제' }

function attempt(studentId: string, taskId: string): AttemptRow {
  return emptyAttempt(`att-${studentId}`, studentId, taskId, 'p1', '2026-10-24T00:00:00Z')
}

/** 042 §3-A-4 — 쓰기는 전부 `transact` 안에서 한다 */
async function put(store: FileLearningStore, row: AttemptRow): Promise<void> {
  await store.transact((tx) => tx.putAttempt(row))
}

test('F1 **배정된 것만** 돌려주고, 남의 과제는 보이지 않는다', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A, S_B], [T_A, T_A_OFF, T_B])
    assert.deepEqual((await store.listAssignedTasks('sA')).map((t) => t.taskId), ['tA'])
    assert.deepEqual((await store.listAssignedTasks('sB')).map((t) => t.taskId), ['tB'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F2 다른 학생의 시도는 **없는 것으로** 보이고, 덮어쓸 수 없다', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A, S_B], [T_A, T_B])
    await put(store, attempt('sA', 'tA'))
    assert.notEqual(await store.getAttempt('sA', 'att-sA'), null)
    assert.equal(await store.getAttempt('sB', 'att-sA'), null, 'B 가 A 의 시도를 읽었습니다')
    await assert.rejects(
      () => put(store, { ...attempt('sA', 'tA'), studentId: 'sB' }),
      /다른 학생의 시도/,
    )
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F3 **서버에서 다시 읽힌다** — 새 저장소 객체로도 같은 값', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A], [T_A])
    const row = attempt('sA', 'tA')
    row.answers.push({ actionId: 'a1', occurredAt: '2026-10-24T00:01:00Z', answer: 'x', graded: 'wrong' })
    // 042 §2-B — 「도움 뒤」는 저장된 칸이 아니라 **시각 순서**로 센다
    row.helpOpened.push({
      actionId: 'h1', occurredAt: '2026-10-24T00:03:00Z',
      relationId: 'r1', contentRefId: 'c1', segmentKey: 'full',
      observation: { method: 'player_coverage', coveragePct: 50, coveredSeconds: 5 },
    })
    row.answers.push({ actionId: 'a2', occurredAt: '2026-10-24T00:05:00Z', answer: 'y', graded: 'correct' })
    await put(store, row)
    const again = new FileLearningStore(store.location)        // 새로고침·재접속에 해당
    const got = await again.getAttempt('sA', 'att-sA')
    const s = summarize(got)
    assert.equal(s.firstResult, 'wrong')
    assert.equal(s.lastResult, 'correct')
    assert.equal(s.resultAfterHelp, 'correct')
    assert.equal(s.answerCount, 2, '앞 제출이 사라졌습니다')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F4 씨앗은 **기존 기록을 덮지 않는다**', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A], [T_A])
    const row = attempt('sA', 'tA')
    row.answers.push({ actionId: 'a1', occurredAt: '2026-10-24T00:01:00Z', answer: 'x', graded: 'correct' })
    await put(store, row)
    await store.seedIfEmpty([S_A], [T_A])                      // 다시 띄운 상황
    assert.equal(summarize(await store.getAttempt('sA', 'att-sA')).firstResult, 'correct')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F5 이벤트는 **덧붙이기만** 하고 학생별로 갈린다', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A, S_B], [T_A, T_B])
    await store.transact((tx) => {
      for (const [s, id] of [['sA', 'e1'], ['sA', 'e2'], ['sB', 'e3']] as const) {
        tx.appendEvent({
          resolvedStudentScope: s, validatedProducer: 'p', eventId: id,
          clientEvent: {}, received_at: '2026-10-24T00:00:00Z', verdict: 'applied',
        })
      }
    })
    assert.equal((await store.listEvents('sA')).length, 2)
    assert.equal((await store.listEvents('sB')).length, 1)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F6 깨진 저장소를 **빈 것으로 덮지 않는다**', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A], [T_A])
    writeFileSync(store.location, '{깨진 json', 'utf8')
    await assert.rejects(() => store.getStudent('sA'), /읽을 수 없습니다/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F7 **중간에 던지면 아무것도 저장되지 않는다** (042 §3-A-4)', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A], [T_A])
    await assert.rejects(() => store.transact((tx) => {
      tx.putAttempt(attempt('sA', 'tA'))                        // 시도는 넣고
      tx.appendEvent({
        resolvedStudentScope: 'sA', validatedProducer: 'p', eventId: 'e1',
        clientEvent: {}, received_at: '2026-10-24T00:00:00Z', verdict: 'applied',
      })
      throw new Error('저장 도중 실패')                          // 그 뒤 실패
    }), /저장 도중 실패/)
    // 반쪽으로 남으면 안 된다 — 둘 다 없어야 한다
    assert.equal(await store.getAttempt('sA', 'att-sA'), null, '시도가 반쪽으로 남았습니다')
    assert.equal((await store.listEvents('sA')).length, 0, '이벤트가 반쪽으로 남았습니다')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('F8 요청이 겹쳐도 **덮어쓰지 않는다** — 차례로 돈다', async () => {
  const { store, dir } = tmpStore()
  try {
    await store.seedIfEmpty([S_A], [T_A])
    await put(store, attempt('sA', 'tA'))
    // 다섯 개를 동시에 던진다. 각자 읽고 쓰면 마지막 하나만 남는다
    await Promise.all([1, 2, 3, 4, 5].map((n) => store.transact((tx) => {
      const row = tx.findAttempt('sA', 'tA', 'p1')
      row.answers.push({
        actionId: `a${n}`, occurredAt: `2026-10-24T00:0${n}:00Z`,
        answer: String(n), graded: 'wrong',
      })
      tx.putAttempt(row)
    })))
    const got = await store.getAttempt('sA', 'att-sA')
    assert.equal(got.answers.length, 5, `제출이 겹쳐 사라졌습니다 (${got.answers.length}/5)`)
    assert.deepEqual([...got.answers.map((x) => x.actionId)].sort(), ['a1', 'a2', 'a3', 'a4', 'a5'])
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

// ════════════════════════════════════════════════════════════════════
// G. 세션 — 쿠키를 손으로 고쳐 남의 범위로 넘어갈 수 없다
// ════════════════════════════════════════════════════════════════════

test('G1 서명이 맞아야 학생 식별이 나온다', () => {
  const v = makeCookieValue('sA')
  assert.equal(studentIdFromCookieValue(v), 'sA')
  assert.equal(studentIdFromCookieValue('sB.' + v.split('.')[1]), null, '남의 id 로 넘어갔습니다')
  assert.equal(studentIdFromCookieValue('sA.AAAA'), null)
  assert.equal(studentIdFromCookieValue('sA'), null)
  assert.equal(studentIdFromCookieValue(null), null)
})

test('G2 쿠키 머리글에서 우리 쿠키만 꺼낸다', () => {
  const req = new Request('http://x/', {
    headers: { cookie: 'other=1; sc_learning_test=abc.def; more=2' },
  })
  assert.equal(readCookie(req), 'abc.def')
  assert.equal(readCookie(new Request('http://x/')), null)
})
