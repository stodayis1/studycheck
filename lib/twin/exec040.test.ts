/**
 * GPT-EXEC-040 §4 유한 대조 — **로컬 합성 미리보기**의 연결 의미만 본다.
 *
 * 하지 않는 것
 *   - 네트워크·DB·모델·Storage **0건.** 전부 합성 입력이다.
 *   - 추천 정확도·성적 향상을 재지 않는다. **연결의 의미**를 본다.
 *   - 실제 학생·문제·영상 행을 읽지 않는다. 46284 의 본문을 재현하지 않는다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import {
  previewNextAction, compareEvents, dedupKey, validateRequired, separateClaims,
  SERVER_ENVELOPE_FIELDS, segmentKeyOf,
  type ApprovedRelation, type PreviewInput, type EventEnvelope,
  type ExposureReview, type ConfirmActionItem,
} from './learningPreview'

// ── 합성 fixture — 전부 syn 으로 표시한다 ────────────────────────────
const SYN_STUDENT = 'syn-scope-student-A'
const TYPE = '공수2-01-01'
const SYN_PROBLEM = 'syn-problem-1'

/** 확인 행동으로 실제 낼 수 있는 합성 항목 (R040-D) */
const SYN_ITEM: ConfirmActionItem = {
  itemRef: 'syn-confirm-1',
  prompt: '[시연] 조건이 바뀐 문항에서 먼저 세울 식을 고르세요',
  choices: ['syn-보기1', 'syn-보기2', 'syn-보기3'],
  origin: 'demo',
}

/**
 * **승인된** 노출 검수 기록 하나. 지금 원문·목적·자산 판·구간에 맞춰 만든다 (R040-C).
 * 범위를 일부러 어긋나게 하려면 `scopeOver` 로 덮는다.
 */
function review(
  r: Pick<ApprovedRelation, 'assetVersion' | 'segment'>,
  verdict: ExposureReview['verdict'] = 'safe',
  taskGoal: ExposureReview['scope']['taskGoal'] = 'solve',
  scopeOver: Partial<ExposureReview['scope']> = {},
): ExposureReview {
  return {
    verdict,
    scope: {
      problemRefId: SYN_PROBLEM,
      taskGoal,
      assetVersion: r.assetVersion,
      segmentKey: segmentKeyOf(r.segment),
      ...scopeOver,
    },
    reviewedBy: 'syn-reviewer',
    reviewedAt: '2026-10-24T00:00:00Z',
  }
}

function rel(over: Partial<ApprovedRelation> = {}): ApprovedRelation {
  const base: ApprovedRelation = {
    relationId: 'syn-rel-1',
    relationKind: 'type_demonstration',
    videoKind: 'worked_example',
    typeCode: TYPE,
    supportedAxes: ['goal', 'condition', 'formulate'],
    relationReviewed: true,
    assetReviewed: true,
    assetVersion: 1,
    reachableByStudent: true, wholeDeliverySafe: true,
    confirmItems: [SYN_ITEM],
    contentRef: { kind: 'video_asset', id: 'syn-video-1', version: 1 },
    ...over,
  }
  // 검수 기록을 직접 주지 않았으면 **지금 범위에 맞는 safe 검수**를 붙인다.
  // 'exposureReview' in over 로 보는 것은 undefined 를 일부러 넣는 경우를 지키려고.
  if (!('exposureReview' in over)) base.exposureReview = review(base)
  return base
}

function input(over: Partial<PreviewInput> = {}): PreviewInput {
  return {
    resolvedStudentScope: SYN_STUDENT,
    attemptRef: 'syn-att-1',
    problemRef: { kind: 'problem', id: SYN_PROBLEM, version: 1 },
    typeCode: TYPE,
    taskGoal: 'solve',
    stuck: { axis: 'formulate', evidenceEventIds: ['syn-evt-1'], helpObserved: 'unmeasured', repeatedMisconceptions: null },
    relations: [rel()],
    ...over,
  }
}

// ════════════════════════════════════════════════════════════════════
// P. 040 §4 의 수용 대조 6개
// ════════════════════════════════════════════════════════════════════

test('P1 같은 유형에서도 **막힌 축에 따라 다른 종류**가 뽑힌다 (배타 1:1 아님)', () => {
  const three: ApprovedRelation[] = [
    rel({ relationId: 'r-concept', relationKind: 'concept_explanation', videoKind: 'concept',
          supportedAxes: ['recall', 'formulate'] }),
    rel({ relationId: 'r-worked', relationKind: 'type_demonstration', videoKind: 'worked_example',
          supportedAxes: ['goal', 'condition', 'formulate'] }),
    rel({ relationId: 'r-proof', relationKind: 'theorem_proof', videoKind: 'proof',
          supportedAxes: ['recall'], segment: { startSeconds: 30, endSeconds: 90, sceneNo: 2 } }),
  ]
  const recall = previewNextAction(input({ relations: three, stuck: { ...input().stuck, axis: 'recall' } }))
  const goal = previewNextAction(input({ relations: three, stuck: { ...input().stuck, axis: 'goal' } }))

  assert.notEqual(recall.recommendedAction.relationId, goal.recommendedAction.relationId,
    '막힌 축이 달라도 같은 것을 골랐습니다')
  assert.equal(goal.recommendedAction.relationId, 'r-worked')
  // recall 은 개념·증명 둘 다 지원 — **하나로 고정되지 않는다**
  assert.ok(['r-concept', 'r-proof'].includes(String(recall.recommendedAction.relationId)))

  // 같은 종류가 여러 축을 지원한다 (배타적 1:1 이 아니다)
  assert.ok(three[0].supportedAxes.length > 1)
  assert.ok(three[1].supportedAxes.includes('formulate') && three[0].supportedAxes.includes('formulate'))
})

test('P1-b 표현변환·계산도 **영상 금지 축이 아니다**', () => {
  for (const axis of ['represent', 'compute'] as const) {
    const o = previewNextAction(input({ stuck: { ...input().stuck, axis } }))
    assert.notEqual(o.recommendedAction.kind, 'teacher_async',
      `${axis} 에서 영상을 막아 버렸습니다`)
    assert.equal(o.recommendedAction.relationId, 'syn-rel-1')
  }
})

test('P2 원문 답이 드러나거나 열 수 없으면 **대체**하고 학습을 멈추지 않는다', () => {
  const o = previewNextAction(input({
    relations: [
      rel({ relationId: 'r-reveals', exposureReview: review({ assetVersion: 1 }, 'reveals') }),
      rel({ relationId: 'r-unknown', exposureReview: review({ assetVersion: 1 }, 'unknown') }),
      rel({ relationId: 'r-unreachable', reachableByStudent: false }),
      rel({ relationId: 'r-unreviewed', relationReviewed: false }),
      rel({ relationId: 'r-ok', relationKind: 'reviewed_problem', videoKind: null,
            contentRef: { kind: 'problem', id: 'syn-reviewed-9' } }),
    ],
  }))
  assert.equal(o.recommendedAction.relationId, 'r-ok')
  assert.equal(o.recommendedAction.kind, 'reviewed_asset')
  assert.equal(o.returnPath, 'back_to_source')
  const why = Object.fromEntries(o.recommendedAction.rejected.map((r) => [r.relationId, r.why]))
  assert.match(why['r-reveals'], /답이 드러남/)
  assert.match(why['r-unknown'], /미확인 — 보류/)
  assert.match(why['r-unreachable'], /열 수 없음/)
  assert.match(why['r-unreviewed'], /관계 적합성 검수 전/)
})

test('P2-b 쓸 수 있는 것이 **하나도 없어도** 흐름을 끊지 않는다', () => {
  const blocked = [rel({ exposureReview: review({ assetVersion: 1 }, 'reveals') })]

  // (1) 실제로 열려 있는 다른 과제가 있으면 **그 과제를 가리킨다** (R040-D)
  const withAlt = previewNextAction(input({
    relations: blocked,
    availableFallbackTasks: [
      { taskRef: 'syn-task-9', label: '[시연] 이미 배정된 다른 과제', reachableByStudent: true,
        href: '/learning?task=syn-task-9' },
    ],
  }))
  assert.equal(withAlt.recommendedAction.kind, 'teacher_async')
  assert.equal(withAlt.returnPath, 'async_teacher')
  assert.equal(withAlt.recommendedAction.fallbackTasks.length, 1)
  assert.ok(withAlt.planDraft.items.some((i) => /다른 과제 계속: .*syn-task-9/.test(i)),
    '실제 과제를 가리키지 않았습니다')

  // (2) 없으면 **없다고 정확히 적는다.** 빈 문장을 만들지 않는다
  const noAlt = previewNextAction(input({ relations: blocked }))
  assert.equal(noAlt.recommendedAction.fallbackTasks.length, 0)
  assert.ok(noAlt.planDraft.items.some((i) => /대체 자산 없음/.test(i)),
    '없는 과제를 있는 것처럼 적었습니다')
  assert.ok(!noAlt.planDraft.items.some((i) => /지금 가능한 다른 과제 계속/.test(i)))
  assert.match(noAlt.recommendedAction.reason, /대체 자산 없음/)
})

test('P2-c 증명 노출은 **승인된 검수**로 정한다 — 구간 유무 휴리스틱이 아니다 (R040-C)', () => {
  const base = { relationKind: 'theorem_proof' as const, videoKind: 'proof' as const,
                 supportedAxes: ['recall' as const] }

  // 완성 증명 통째 — **검수가 reveals 라고 했기 때문에** 빠진다
  const whole = rel({ relationId: 'r-whole', ...base,
    exposureReview: review({ assetVersion: 1 }, 'reveals', 'prove') })
  // 구간 발췌 — 그 구간에 대해 safe 검수를 받았다
  const seg = rel({ relationId: 'r-seg', ...base, segment: { startSeconds: 10, endSeconds: 40 },
    exposureReview: review({ assetVersion: 1, segment: { startSeconds: 10, endSeconds: 40 } }, 'safe', 'prove') })

  const o = previewNextAction(input({
    taskGoal: 'prove', relations: [whole, seg], stuck: { ...input().stuck, axis: 'recall' },
  }))
  assert.equal(o.recommendedAction.relationId, 'r-seg')
  assert.match(
    o.recommendedAction.rejected.find((r) => r.relationId === 'r-whole')!.why,
    /승인된 검수에서 이 원문의 답이 드러남/,
  )

  // 같은 자산이 **통째라도** safe 검수를 받으면 쓰인다 — 「증명 통째면 전부 금지」가 아니다
  const approvedWhole = rel({ relationId: 'r-whole-ok', ...base,
    exposureReview: review({ assetVersion: 1 }, 'safe', 'prove') })
  const ok = previewNextAction(input({
    taskGoal: 'prove', relations: [approvedWhole], stuck: { ...input().stuck, axis: 'recall' },
  }))
  assert.equal(ok.recommendedAction.relationId, 'r-whole-ok',
    '구간이 없다는 이유만으로 막았습니다')

  // 거꾸로 — 구간을 **새로 붙이기만** 하면 통과하지 않는다. 검수 범위가 어긋난다
  const smuggled = rel({ relationId: 'r-smuggled', ...base,
    segment: { startSeconds: 10, endSeconds: 40 },
    exposureReview: review({ assetVersion: 1 }, 'reveals', 'prove') })   // 검수는 통째(full)에 대한 것
  const blocked = previewNextAction(input({
    taskGoal: 'prove', relations: [smuggled], stuck: { ...input().stuck, axis: 'recall' },
  }))
  assert.equal(blocked.recommendedAction.kind, 'teacher_async', '구간만 붙여 통과했습니다')
  assert.match(
    blocked.recommendedAction.rejected.find((r) => r.relationId === 'r-smuggled')!.why,
    /노출 검수 범위가 지금과 다름 \(구간\)/,
  )
})

test('P3 시청완료·정답1회·미측정 도움으로 **숙달을 확정하지 않는다**', () => {
  const o = previewNextAction(input({
    videoObservation: { method: 'player_coverage', coveragePct: 97, completed: true },
    delayedRecheck: { passed: true, delayDays: 3, differentItem: true },
  }))
  for (const k of ['독립 해결', '유형 숙달', '이해 완료', '학습 성향']) {
    assert.ok(o.evidence.notClaimed.includes(k), `${k} 를 확정하지 않는다고 적지 않았습니다`)
  }
  // 도움이 미측정이면 "도움 뒤 성공" 도 판정하지 않는다.
  // 042 §3-B 로 한 칸이 넷으로 갈렸다 — 넷 다 확정되지 않아야 한다
  assert.equal(o.evidence.outcomes.confirmPassed, null)
  assert.equal(o.evidence.outcomes.sourceSolvedAfterHelp, null)
  assert.equal(o.evidence.outcomes.delayedRecheckPassed, true, '지연 재확인 결과는 그대로 적는다')
  assert.equal(o.evidence.outcomes.mastery, null, '숙달을 판정했습니다')
  assert.ok(o.evidence.outcomes.notes.some((n) => /도움 때문에 늘었다/.test(n)),
    '인과를 주장하지 않는다는 말이 없습니다')
  assert.ok(o.evidence.unknownScope.some((u) => /도움 유무 미측정/.test(u)))
  assert.ok(o.evidence.observed.some((x) => /이해 완료 아님/.test(x)))
})

test('P4 창열림·재생·구간·미측정을 **한 점수로 합치지 않는다**', () => {
  const win = previewNextAction(input({
    videoObservation: { method: 'window_elapsed', windowElapsedMs: 262000 },
  }))
  assert.ok(win.evidence.observed.some((x) => /창 열림/.test(x) && /재생·집중 아님/.test(x)))
  assert.ok(win.evidence.unknownScope.some((u) => /실제 재생·구간/.test(u)))

  const play = previewNextAction(input({
    videoObservation: { method: 'player_coverage', coveragePct: 80, coveredSeconds: 240,
                        focusLostSeconds: 35, sceneSeconds: { '3': 41 } },
  }))
  // 각각 **따로** 적힌다
  assert.ok(play.evidence.observed.some((x) => /재생 구간 80%/.test(x)))
  assert.ok(play.evidence.observed.some((x) => /서로 다른 재생 240초/.test(x)))
  assert.ok(play.evidence.observed.some((x) => /장면별 재생/.test(x)))
  assert.ok(play.evidence.observed.some((x) => /탭 전환/.test(x) && /집중도 아님/.test(x)))
  // 합친 점수가 **없다**
  const joined = play.evidence.observed.join(' ')
  assert.ok(!/집중\s*점수|focus_score|engagement/i.test(joined), '집중 점수를 만들었습니다')
})

test('P5 계획·질문·관측방법은 **충돌**, 수신시각만 바뀌면 **중복**', () => {
  const base = (over: Record<string, unknown> = {}): EventEnvelope => ({
    resolvedStudentScope: SYN_STUDENT,
    validatedProducer: 'studycheck-web',
    eventId: 'syn-evt-A',
    clientEvent: {
      schema_version: '0.1-draft.3', event_type: 'problem_graded',
      occurred_at: '2026-10-20T10:03:11Z', attempt_ref: 'syn-att-1',
      plan_ref: 'syn-plan-7', question_ref: null,
      observation_method: 'self_grading', unmeasured: ['help_used'],
      observed: { is_correct: false }, ...over,
    },
  })
  const prev = base()
  assert.equal(compareEvents(prev, base({ received_at: '11:40' })).verdict, 'duplicate')
  for (const [field, val] of [
    ['plan_ref', 'syn-plan-8'], ['question_ref', 'syn-q-1'],
    ['observation_method', 'player_coverage'], ['unmeasured', []],
    ['corrects_event_id', 'syn-evt-Z'],
  ] as const) {
    const v = compareEvents(prev, base({ [field]: val }))
    assert.equal(v.verdict, 'conflict', `${field} 변화를 중복으로 봤습니다`)
    assert.ok((v as { changedFields: string[] }).changedFields.includes(field))
  }
  // 서버 부가값은 목록에 들어 있다
  assert.ok((SERVER_ENVELOPE_FIELDS as readonly string[]).includes('received_at'))
})

test('P5-b **다른 학생은 섞지 않는다** — 정정 요청은 거부한다', () => {
  const mk = (scope: string, over: Record<string, unknown> = {}): EventEnvelope => ({
    resolvedStudentScope: scope, validatedProducer: 'studycheck-web', eventId: 'syn-evt-SAME',
    clientEvent: { observed: { is_correct: true }, ...over },
  })
  const a = mk('syn-scope-student-A')
  const b = mk('syn-scope-student-B')
  const v = compareEvents(a, b)
  assert.equal(v.verdict, 'distinct', '다른 학생의 같은 event_id 를 합쳤습니다')
  assert.match(v.reason, /학생 범위가 다릅니다/)

  const correcting = mk('syn-scope-student-B', { corrects_event_id: 'syn-evt-SAME' })
  const v2 = compareEvents(a, correcting)
  assert.equal(v2.verdict, 'rejected', '다른 학생의 기록 정정을 허용했습니다')
  // 거부 사유에 **원기록의 내용을 담지 않는다**
  assert.ok(!/is_correct|true|false/.test(v2.reason), '거부 사유에 원기록 내용이 들어갔습니다')

  // 중복 키에 학생 범위와 **검증된** producer 가 들어간다
  assert.notEqual(dedupKey(a), dedupKey(b))
  assert.ok(dedupKey(a).includes('syn-scope-student-A'))
  assert.ok(dedupKey(a).includes('studycheck-web'))
})

test('P6 강사에게 **새 수작업을 만들지 않는다** — 계획 단위 승인만', () => {
  const o = previewNextAction(input())
  assert.equal(o.planDraft.approvalState, 'draft')
  assert.equal(o.planDraft.overwritesApprovedPlan, false)
  assert.ok(o.confirmAction !== null, '확인 행동을 시스템이 고르지 않았습니다')
  // 교사 요약은 **읽을 한 줄**이지 입력 요구가 아니다
  assert.ok(!/입력해|골라 주|선택해 주/.test(o.teacherSummary), '강사에게 입력을 요구합니다')
  assert.match(o.teacherSummary, /draft/)
})

// ════════════════════════════════════════════════════════════════════
// Q. 040 §3-B·§3-C — 누락·null·자기보고
// ════════════════════════════════════════════════════════════════════

test('Q1 필수 필드 **누락은 오류**이고 "해당 없음" 으로 바뀌지 않는다', () => {
  const r = validateRequired({ event_type: 'x' }, ['event_type', 'occurred_at', 'attempt_ref'])
  assert.equal(r.ok, false)
  assert.deepEqual(r.missing, ['occurred_at', 'attempt_ref'])
  // null 은 **제공된 값**이다 — 누락과 다르다
  const withNull = validateRequired({ event_type: 'x', occurred_at: null, attempt_ref: null },
    ['event_type', 'occurred_at', 'attempt_ref'])
  assert.equal(withNull.ok, true, 'null 을 누락으로 셌습니다')
})

test('Q2 학생 자기보고를 **서버 판단으로 승격하지 않는다**', () => {
  const s = separateClaims({ interpretation: { claims: ['나는 이 유형을 마스터했다'] } })
  assert.deepEqual(s.studentReported, ['나는 이 유형을 마스터했다'])
  assert.equal(s.serverDerived, null)
  assert.match(s.note, /서버의 숙달·계획 판단으로 쓰지 않습니다/)
})

test('Q3 미리보기는 **환경·콘텐츠를 따로** 표시하고 서버 확정 범위를 그대로 전달한다', () => {
  const o = previewNextAction(input())
  assert.equal(o.resolvedStudentScope, SYN_STUDENT)
  assert.equal(o.schemaVersion, '0.1-draft.3-preview')

  // 042 §1 결정 4 — 안 주면 가장 보수적인 값으로 본다
  assert.deepEqual(o.provenance, { environment: 'test', content: 'demo' })
  assert.equal(o.synthetic, true)
  assert.match(o.teacherSummary, /^\[시험환경·시연콘텐츠\]/)

  // 저장소의 실제 유형 자료를 쓴 경우에도 **환경은 여전히 시험**이다
  const real = previewNextAction(input({ provenance: { environment: 'test', content: 'local_real' } }))
  assert.equal(real.synthetic, true, '콘텐츠가 실제라고 운영으로 올렸습니다')
  assert.match(real.teacherSummary, /^\[시험환경·로컬실제자료\]/)

  // 둘 다 운영일 때만 synthetic 이 내려간다
  const ops = previewNextAction(input({ provenance: { environment: 'operational', content: 'operational' } }))
  assert.equal(ops.synthetic, false)
  assert.match(ops.teacherSummary, /^\[운영환경·운영콘텐츠\]/)
})

test('Q4 preview 는 **운영 route 를 import 하지 않는다**', () => {
  const root = resolve(__dirname, '..', '..')
  const src = readFileSync(join(root, 'lib/twin/learningPreview.ts'), 'utf8')
  for (const bad of ['@/app/', '../../app/', '@supabase/supabase-js', 'next/server', 'openai']) {
    assert.ok(!src.includes(bad), `preview 가 ${bad} 를 적재합니다`)
  }
  // 네트워크·DB 호출이 없다
  assert.ok(!/\bfetch\s*\(|createClient|from\s*\(/.test(src.replace(/^\s*\*.*$/gm, '')),
    'preview 에 네트워크·DB 호출이 있습니다')
})
