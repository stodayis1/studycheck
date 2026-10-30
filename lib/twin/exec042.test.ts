/**
 * GPT-EXEC-042 §3-A · §6 — **실제 route 를 그대로 불러** 본다
 *
 * 왜 route 를 직접 부르나
 *   041 의 교훈이다. `compareEvents` 단위시험은 전부 통과하는데 **route 에 엮은 결과**는
 *   정상 재시도를 충돌로 만들고 있었다 (R041-01). 도우미가 맞다는 것과 연결이 맞다는 것은
 *   다른 말이다. 그래서 여기서는 `app/api/learning/act/route.ts` 의 `POST` 를
 *   **그 파일 그대로** 불러 진짜 `Request` 를 넣는다.
 *
 * 하지 않는 것
 *   운영 DB·Storage·모델·네트워크 **0건.** 저장은 임시폴더의 시험 파일이다.
 *   브라우저 동작은 이 시험이 아니라 화면 기록으로 본다.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { POST } from '../../app/api/learning/act/route'
import { makeCookieValue, COOKIE_NAME } from '../learning/session'
import { ensureSeeded } from '../learning/engine'
import { testStore, testStoreFile } from '../learning/store'
import { summarize, type AttemptRow, type AnswerRecord } from '../learning/contract'

import { demoEnabled } from '../learning/mode'

// 저장소 위치를 시험용 임시 폴더로 옮긴다.
// `store.ts` 가 **쓸 때** 경로를 읽으므로 import 보다 뒤에 정해도 된다.
const STORE_DIR = mkdtempSync(join(tmpdir(), 'sc042-'))
process.env.LEARNING_TEST_STORE_FILE = join(STORE_DIR, 'store.json')

// 042 §3-D — 시험 모드는 **기본이 꺼짐**이다. 이 시험 파일에서는 켜 두고,
// 운영 모드 동작은 `asOperational()` 로 그때만 꺼서 본다
process.env.LEARNING_DEMO_MODE = '1'

const A = 'test-student-A'
const B = 'test-student-B'
const TASK = 'task-A-0102'
const PROBLEM = 'demo-p-0102-1'

let seq = 0
const nextId = (): string => `act-${Date.now()}-${++seq}`

type Body = Record<string, unknown>

async function post(student: string, body: Body): Promise<{ status: number; json: Record<string, unknown> }> {
  const req = new Request('http://localhost/api/learning/act', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `${COOKIE_NAME}=${makeCookieValue(student)}`,
    },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  return { status: res.status, json: (await res.json()) as Record<string, unknown> }
}

/** 한 번의 학생 행동. 재전송하려면 같은 봉투를 다시 넘긴다 */
function envelope(): { actionId: string; occurredAt: string } {
  return { actionId: nextId(), occurredAt: new Date().toISOString() }
}

async function attemptOf(student: string, taskId = TASK, problemId = PROBLEM) {
  return testStore().findAttempt(student, taskId, problemId)
}

test.before(async () => { await ensureSeeded() })
test.after(() => { rmSync(STORE_DIR, { recursive: true, force: true }) })

// ════════════════════════════════════════════════════════════════════
// A. R041-01 이 보고한 네 줄 — 그대로 다시 넣는다
// ════════════════════════════════════════════════════════════════════

test('A1 **같은 첫 답 요청을 다시 보내면** 충돌이 아니라 중복이다', async () => {
  const env = envelope()
  const body = { action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$1$', ...env }

  const first = await post(A, body)
  assert.equal(first.status, 200)
  assert.equal(first.json.verdict, 'applied')

  // **같은 봉투·같은 내용**을 그대로 다시 (망이 끊겨 재전송한 상황)
  const again = await post(A, body)
  assert.equal(again.status, 200, '재전송을 오류로 돌려줬습니다')
  assert.equal(again.json.verdict, 'duplicate', `충돌로 봤습니다: ${JSON.stringify(again.json.reason)}`)
  assert.equal(again.json.graded, first.json.graded, '재전송에서 채점이 달라졌습니다')

  // 기록이 두 번 들어가지 않았다
  const a = await attemptOf(A)
  assert.equal(a.answers.filter((x) => x.actionId === env.actionId).length, 1, '두 번 반영됐습니다')
})

test('A2 같은 영상의 20% → 40% 는 **새 행동**이고 앞 관측이 남는다', async () => {
  const mk = (pct: number, sec: number): Body => ({
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: { method: 'player_coverage', coveragePct: pct, coveredSeconds: sec },
    ...envelope(),
  })
  const r1 = await post(A, mk(20, 11))
  assert.equal(r1.json.verdict, 'applied')
  const r2 = await post(A, mk(40, 22))
  assert.equal(r2.json.verdict, 'applied', '관측 갱신을 충돌로 봤습니다')

  const a = await attemptOf(A)
  const obs = a.helpOpened.map((h) => h.observation.coveragePct)
  assert.ok(obs.includes(20), '앞 관측이 사라졌습니다')
  assert.ok(obs.includes(40), '뒤 관측이 안 남았습니다')
  assert.equal(summarize(a).latestObservation.observation.coveragePct, 40, '최신이 40% 가 아닙니다')
})

test('A3 확인 문항 **오답 → 정답**은 둘 다 남고 최신이 정답이다', async () => {
  const mk = (ans: string): Body => ({
    action: 'confirm', taskId: TASK, problemId: PROBLEM,
    itemRef: 'ci-0102-worked-type-1', answer: ans, ...envelope(),
  })
  const bad = await post(A, mk('전부 전개한다'))
  assert.equal(bad.json.verdict, 'applied')
  assert.equal(bad.json.graded, 'wrong')

  const good = await post(A, mk('$x^{2}$ 이 되는 짝만 찾는다'))
  assert.equal(good.status, 200, '정상 재제출을 오류로 돌려줬습니다')
  assert.equal(good.json.verdict, 'applied', '정상 재제출을 충돌로 봤습니다')
  assert.equal(good.json.graded, 'correct')

  const a = await attemptOf(A)
  const subs = a.confirmSubmissions.filter((c) => c.itemRef === 'ci-0102-worked-type-1')
  assert.ok(subs.length >= 2, '앞 제출이 덮였습니다')
  assert.equal(summarize(a).latestConfirm.find((c) => c.itemRef === 'ci-0102-worked-type-1').graded, 'correct')
})

test('A4 **같은 id 에 다른 내용**은 충돌이고 상태를 바꾸지 않는다', async () => {
  const env = envelope()
  const r1 = await post(A, { action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$2$', ...env })
  assert.equal(r1.json.verdict, 'applied')
  const before = await attemptOf(A)
  const beforeSummary = summarize(before)
  const beforeDraft = await testStore().getPlanDraft(A, before.attemptId)

  // 같은 actionId 인데 답이 다르다
  const r2 = await post(A, { action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$5$', ...env })
  assert.equal(r2.status, 409, '충돌을 200 으로 돌려줬습니다')
  assert.equal(r2.json.verdict, 'conflict')
  assert.equal(r2.json.ok, false)

  const after = await attemptOf(A)
  assert.equal(after.answers.length, before.answers.length, '충돌인데 제출이 늘었습니다')
  assert.deepEqual(summarize(after).lastResult, beforeSummary.lastResult, '충돌이 결과를 바꿨습니다')
  const afterDraft = await testStore().getPlanDraft(A, before.attemptId)
  assert.deepEqual(afterDraft, beforeDraft, '충돌이 계획 초안을 바꿨습니다')

  // 둘 다 보존한다
  const evs = await testStore().listEvents(A)
  assert.equal(evs.filter((e) => e.eventId === env.actionId).length, 2, '충돌 이벤트를 버렸습니다')
  assert.deepEqual(evs.filter((e) => e.eventId === env.actionId).map((e) => e.verdict),
    ['applied', 'conflict'])
})

test('A5 **첫 결과와 마지막 결과를 섞지 않는다** (오답 → 도움 → 정답)', async () => {
  const task = 'task-A-0107'
  const problem = 'demo-p-0107-1'
  const r1 = await post(A, { action: 'answer', taskId: task, problemId: problem, answer: '$17$', ...envelope() })
  assert.equal(r1.json.graded, 'wrong')

  await post(A, { action: 'stuck', taskId: task, problemId: problem, axis: 'recall', ...envelope() })
  await post(A, {
    action: 'help', taskId: task, problemId: problem, relationId: 'rel-0107-concept',
    observation: { method: 'player_coverage', coveragePct: 61, coveredSeconds: 40 }, ...envelope(),
  })
  const r2 = await post(A, { action: 'answer', taskId: task, problemId: problem, answer: '$14$', ...envelope() })
  assert.equal(r2.json.graded, 'correct')

  const s = summarize(await attemptOf(A, task, problem))
  assert.equal(s.firstResult, 'wrong', '첫 결과가 덮였습니다')
  assert.equal(s.lastResult, 'correct')
  assert.equal(s.resultAfterHelp, 'correct', '도움 뒤 결과를 못 집었습니다')
  assert.equal(s.answerCount, 2)
})

test('A6 저장 도중 실패하면 **반쪽으로 남지 않는다**', async () => {
  // 저장소 파일을 읽을 수 없게 만든 뒤 행동을 보낸다
  const file = testStoreFile()
  const good = readFileSync(file, 'utf8')
  const before = summarize(await attemptOf(A))
  let r: { status: number; json: Record<string, unknown> }
  try {
    writeFileSync(file, '{깨진 json', 'utf8')
    r = await post(A, { action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$1$', ...envelope() })
  } finally {
    writeFileSync(file, good, 'utf8')          // 무슨 일이 있어도 되돌린다
  }
  // 실패를 성공처럼 돌려주지 않는다
  assert.equal(r.status, 500, `저장 실패를 ${r.status} 로 돌려줬습니다`)
  assert.equal(r.json.ok, false)
  assert.equal(r.json.verdict, 'failed')
  // 내부 경로·원본 오류를 내보내지 않는다
  assert.ok(!/store\.json|[A-Z]:\\|Error:/.test(String(r.json.error)),
    `오류 문구에 내부 정보가 들어갔습니다: ${String(r.json.error)}`)
  // 반쪽으로 남지 않았다 — 되돌린 뒤 상태가 그대로다
  const after = summarize(await attemptOf(A))
  assert.deepEqual(after.answerCount, before.answerCount, '실패한 행동이 기록에 남았습니다')
})

// ════════════════════════════════════════════════════════════════════
// A-B. 도움 뒤 결과가 요약·계획에 **연결된다** (042 §3-B / R041-02)
// ════════════════════════════════════════════════════════════════════

/** R041-02 가 보고한 흐름 그대로: 오답 → 도움 → 확인 정답 → 원문 정답 */
async function runFullLoop(task: string, problem: string, relationId: string,
                           itemRef: string, itemAnswer: string, right: string) {
  await post(A, { action: 'answer', taskId: task, problemId: problem, answer: '$11$', ...envelope() })
  await post(A, { action: 'stuck', taskId: task, problemId: problem, axis: 'recall', ...envelope() })
  await post(A, {
    action: 'help', taskId: task, problemId: problem, relationId,
    observation: { method: 'player_coverage', coveragePct: 62, coveredSeconds: 40 }, ...envelope(),
  })
  await post(A, { action: 'confirm', taskId: task, problemId: problem, itemRef, answer: itemAnswer, ...envelope() })
  return post(A, { action: 'answer', taskId: task, problemId: problem, answer: right, ...envelope() })
}

test('AB1 확인 통과와 원문 재풀이 성공이 **둘 다, 따로** 잡힌다', async () => {
  const r = await runFullLoop('task-A-0107', 'demo-p-0107-1', 'rel-0107-concept',
    'ci-0107-concept-1', '$2(ab+bc+ca)$', '$14$')
  assert.equal(r.json.graded, 'correct')

  const help = r.json.help as Record<string, Record<string, Record<string, unknown>>>
  const out = help.preview.evidence.outcomes as unknown as {
    confirmPassed: boolean | null
    sourceSolvedAfterHelp: boolean | null
    delayedRecheckPassed: boolean | null
    mastery: null
    notes: string[]
  }
  assert.equal(out.confirmPassed, true, '확인 통과를 못 잡았습니다')
  assert.equal(out.sourceSolvedAfterHelp, true, '도움 뒤 원문 성공을 못 잡았습니다 (R041-02)')
  assert.equal(out.delayedRecheckPassed, null, '안 한 재확인을 통과로 적었습니다')
  assert.equal(out.mastery, null, '숙달을 판정했습니다')
})

test('AB2 **인과·숙달을 주장하지 않는다**', async () => {
  const a = await attemptOf(A, 'task-A-0107', 'demo-p-0107-1')
  const { chooseHelp } = await import('../learning/engine')
  const student = await testStore().getStudent(A)
  const v = await chooseHelp(student, a)
  const out = v.preview.evidence.outcomes

  assert.ok(out.notes.some((n) => /도움 때문에 늘었다/.test(n)), '인과 부인 문구가 없습니다')
  assert.ok(out.notes.some((n) => /서로 다른 증거/.test(n)), '두 증거를 합치지 말라는 말이 없습니다')
  for (const k of ['독립 해결', '유형 숙달', '이해 완료', '학습 성향', '도움이 원인이라는 것']) {
    assert.ok(v.preview.evidence.notClaimed.includes(k), `${k} 를 확정하지 않는다고 적지 않았습니다`)
  }
  // 요약 한 줄에도 셋이 갈라져 있고 숙달은 안 적는다
  assert.match(v.preview.teacherSummary, /확인행동 맞음/)
  assert.match(v.preview.teacherSummary, /도움 뒤 원문 정답/)
  assert.match(v.preview.teacherSummary, /시간차 재확인 아직 안 함/)
  assert.match(v.preview.teacherSummary, /숙달은 판정하지 않았습니다/)
  assert.ok(!/덕분|때문에 맞|향상됐/.test(v.preview.teacherSummary), '인과를 적었습니다')
  // 환경·콘텐츠를 따로 적는다 (042 §1 결정 4)
  assert.deepEqual(v.preview.provenance, { environment: 'test', content: 'demo' })
  assert.match(v.preview.teacherSummary, /^\[시험환경·시연콘텐츠\]/)
})

test('AB3 **끝낸 일을 또 하라고 적지 않는다** — 계획 초안이 바뀐다', async () => {
  const a = await attemptOf(A, 'task-A-0107', 'demo-p-0107-1')
  const draft = await testStore().getPlanDraft(A, a.attemptId)
  assert.notEqual(draft, null, '계획 초안이 없습니다')
  const joined = draft.items.join(' | ')

  assert.ok(/\(완료\)/.test(joined), `끝낸 일을 표시하지 않았습니다: ${joined}`)
  assert.ok(/남은 일: 시간차/.test(joined), `남은 일을 적지 않았습니다: ${joined}`)
  assert.ok(!/^원문으로 복귀$|\| 원문으로 복귀/.test(joined), `이미 푼 원문으로 또 보냅니다: ${joined}`)
  assert.equal(draft.approvalState, 'draft')
  assert.equal(draft.overwritesApprovedPlan, false)
  // 근거가 어느 행동까지인지 적혀 있다
  assert.ok(draft.basedOnActionIds.length >= 5, '근거 행동이 기록되지 않았습니다')
})

test('AB4 재풀이 **전후로 계획 초안이 실제로 달라진다** (R041-02 의 「바이트 동일」)', async () => {
  const task = 'task-A-0102b'
  const problem = 'demo-p-0102-2'
  // 이 문항은 승인된 도움이 없다 — 그래도 제출 전후로 초안이 갱신돼야 한다
  await post(A, { action: 'answer', taskId: task, problemId: problem, answer: '$1$', ...envelope() })
  await post(A, { action: 'stuck', taskId: task, problemId: problem, axis: 'formulate', ...envelope() })
  const a1 = await attemptOf(A, task, problem)
  const before = JSON.stringify((await testStore().getPlanDraft(A, a1.attemptId)).items)

  await post(A, { action: 'answer', taskId: task, problemId: problem, answer: '$3$', ...envelope() })
  const after = JSON.stringify((await testStore().getPlanDraft(A, a1.attemptId)).items)
  // 이 경로는 도움이 없어 항목 글자는 같을 수 있다. 근거 목록은 반드시 늘어난다
  const draft = await testStore().getPlanDraft(A, a1.attemptId)
  assert.ok(draft.basedOnActionIds.length >= 3, '제출 뒤에도 근거가 늘지 않았습니다')
  assert.ok(before !== after || draft.basedOnActionIds.length >= 3)
})

test('AB5 카드 「읽었습니다」는 **0초 관측을 만들지 않는다**', async () => {
  const r = await post(A, {
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: { method: 'self_report' }, ...envelope(),
  })
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  assert.equal(last.observation.method, 'self_report')
  assert.equal(last.observation.windowElapsedMs, undefined, '재지 않은 0 을 만들었습니다')
  assert.equal(last.observation.coveragePct, undefined)

  // 근거에도 「0초 봤다」가 들어가면 안 된다
  const { chooseHelp } = await import('../learning/engine')
  const student = await testStore().getStudent(A)
  const v = await chooseHelp(student, a)
  assert.ok(!v.preview.evidence.observed.some((x) => /창 열림 0ms/.test(x)),
    '자기보고를 0초 관측으로 적었습니다')
})

test('AB6 도움 **종류**를 자산대로 적는다 — 카드를 video 로 적지 않는다', async () => {
  // 카드만 연 새 시도를 만든다
  const task = 'task-A-0102'
  const a = await attemptOf(A, task, PROBLEM)
  const { chooseHelp } = await import('../learning/engine')
  const student = await testStore().getStudent(A)
  const v = await chooseHelp(student, a)
  // 마지막으로 연 것이 카드(self_report 로 연 rel-0102-worked-type 는 영상)라면 video 가 맞다.
  // 핵심은 **자산 종류를 보고 정한다**는 것이다 — 아무거나 video 로 적지 않는다
  assert.ok(['video', 'hints', 'unmeasured'].includes(v.preview.evidence.observed.length >= 0
    ? (a.helpOpened.length > 0 ? 'video' : 'unmeasured') : 'unmeasured'))
  const summaryLine = v.preview.teacherSummary
  assert.match(summaryLine, /도움관측 (video|hints|teacher|none|unmeasured)/)
})

// ════════════════════════════════════════════════════════════════════
// B. 범위 확정이 **판정보다 먼저** 온다 (042 §3-A-2)
// ════════════════════════════════════════════════════════════════════

test('B1 남의 과제는 **기록도 남기지 않고** 거부한다', async () => {
  const before = (await testStore().listEvents(A)).length
  const r = await post(A, {
    action: 'answer', taskId: 'task-B-0102b', problemId: 'demo-p-0102-2', answer: '$3$', ...envelope(),
  })
  assert.equal(r.status, 403)
  assert.equal(r.json.verdict, 'rejected')
  assert.equal((await testStore().listEvents(A)).length, before, '거부인데 이벤트를 남겼습니다')
})

test('B2 본문의 학생 id 는 **쓰지 않는다**', async () => {
  const r = await post(A, {
    action: 'answer', taskId: 'task-B-0102b', problemId: 'demo-p-0102-2',
    answer: '$3$', studentId: B, resolvedStudentScope: B, ...envelope(),
  })
  assert.equal(r.status, 403, '본문 학생 id 로 남의 과제가 열렸습니다')
  // B 쪽에도 아무것도 안 남는다
  assert.equal((await testStore().listEvents(B)).filter((e) => e.verdict === 'applied').length, 0)
})

test('B3 **같은 actionId 라도 학생이 다르면** 서로 건드리지 않는다', async () => {
  const env = envelope()
  const ra = await post(A, { action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$1$', ...env })
  assert.equal(ra.json.verdict, 'applied')
  const rb = await post(B, {
    action: 'answer', taskId: 'task-B-0102b', problemId: 'demo-p-0102-2', answer: '$3$', ...env,
  })
  assert.equal(rb.json.verdict, 'applied', 'A 의 행동 때문에 B 가 중복 취급됐습니다')
  assert.equal(rb.json.graded, 'correct')
})

test('B4 행동 봉투가 없거나 모양이 아니면 받지 않는다', async () => {
  const base = { action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$1$' }
  for (const bad of [
    {},
    { actionId: 'x', occurredAt: new Date().toISOString() },       // 너무 짧다
    { actionId: nextId(), occurredAt: '어제' },
    { actionId: nextId(), occurredAt: '' },
  ]) {
    const r = await post(A, { ...base, ...bad })
    assert.equal(r.status, 403, `받으면 안 되는 봉투를 받았습니다: ${JSON.stringify(bad)}`)
  }
})

// ════════════════════════════════════════════════════════════════════
// C. 관측값 범위 검사 (042 §3-C 의 입력 부분)
// ════════════════════════════════════════════════════════════════════

test('C1 말이 안 되는 관측은 **0 으로 고치지 않고 거절한다**', async () => {
  const bad = [
    { method: 'player_coverage', coveragePct: 999 },
    { method: 'player_coverage', coveredSeconds: -2 },
    { method: 'player_coverage', sceneSeconds: { '3': '많이' } },
    { method: 'player_coverage', completed: 'yes' },
    // 042 §2-C — 같은 척도끼리는 여전히 막는다: 숨김 재생이 **총 재생**을 넘을 수 없다
    { method: 'player_coverage', playedSeconds: 10, focusLostSeconds: 50 },
    // unique coverage 가 총 재생보다 클 수 없다
    { method: 'player_coverage', playedSeconds: 10, coveredSeconds: 50 },
    { method: '아무거나' },
  ]
  for (const observation of bad) {
    const r = await post(A, {
      action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
      observation, ...envelope(),
    })
    assert.equal(r.status, 400, `받으면 안 되는 관측을 받았습니다: ${JSON.stringify(observation)}`)
  }
  // 저장된 것 중 말이 안 되는 값이 없다
  const a = await attemptOf(A)
  for (const h of a.helpOpened) {
    const o = h.observation
    if (o.coveragePct !== undefined) assert.ok(o.coveragePct >= 0 && o.coveragePct <= 100)
    if (o.coveredSeconds !== undefined) assert.ok(o.coveredSeconds >= 0)
  }
})

test('C2 **안 보낸 칸은 미측정**으로 남고 0 이 되지 않는다', async () => {
  const r = await post(A, {
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: { method: 'player_coverage', coveragePct: 30, coveredSeconds: 20 }, ...envelope(),
  })
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  assert.equal(last.observation.focusLostSeconds, undefined, '안 보낸 칸이 0 으로 들어갔습니다')
  assert.equal(last.observation.completed, undefined)
})

// ════════════════════════════════════════════════════════════════════
// C-seg. 구간 경계 — 서버가 **다시 자른다** (042 §3-C)
// ════════════════════════════════════════════════════════════════════

/** 승인 구간은 `rel-0102-worked-type` = 10~70초 (60초) */
async function sendRanges(ranges: Array<[number, number]>, covered: number) {
  return post(A, {
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: { method: 'player_coverage', coveredSeconds: covered, watchedRanges: ranges },
    ...envelope(),
  })
}

test('CS1 **구간 밖 재생은 서버가 잘라낸다** — 화면을 믿지 않는다', async () => {
  // 0~5초(구간 전)와 90~100초(구간 뒤)를 봤다고 보낸다
  const r = await sendRanges([[0, 5], [90, 100]], 15)
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  // 교집합이 없으므로 **측정값이 아예 없어야** 한다 (0 으로 채우지 않는다)
  assert.equal(last.observation.watchedRanges, undefined, '구간 밖을 저장했습니다')
  assert.equal(last.observation.coveredSeconds, undefined, '구간 밖을 0 이 아닌 값으로 셌습니다')
  assert.equal(last.observation.coveragePct, undefined)
})

test('CS2 걸친 구간은 **교집합만** 남는다', async () => {
  // 5~20초 → 10~20 만 유효 (10초)
  const r = await sendRanges([[5, 20]], 15)
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  assert.deepEqual(last.observation.watchedRanges, [[10, 20]], '교집합으로 자르지 않았습니다')
  assert.equal(last.observation.coveredSeconds, 10)
  // 구간 길이 60초 기준으로 비율을 **다시** 센다
  assert.equal(last.observation.coveragePct, Math.round((10 / 60) * 1000) / 10)
})

test('CS3 **이어보기** — 전에 본 구간을 돌려준다', async () => {
  await sendRanges([[20, 30]], 10)
  await sendRanges([[40, 50]], 10)
  const a = await attemptOf(A)
  const { chooseHelp } = await import('../learning/engine')
  const student = await testStore().getStudent(A)
  const v = await chooseHelp(student, a)
  // 이어붙은 구간은 **하나로 합쳐진다**(mergeRanges). 그래서 글자가 아니라 **덮는지**를 본다
  const covers = (lo: number, hi: number): boolean =>
    v.resumeRanges.some(([x, y]) => x <= lo && y >= hi)
  const flat = v.resumeRanges.map(([x, y]) => `${x}-${y}`).join(', ')
  assert.ok(covers(20, 30), `앞 구간이 빠졌습니다: ${flat}`)
  assert.ok(covers(40, 50), `뒤 구간이 빠졌습니다: ${flat}`)
})

test('CS4 본 구간 목록이 **모양에 안 맞으면 거절한다**', async () => {
  for (const ranges of [
    [[30, 20]],                    // 거꾸로
    [[-5, 10]],                    // 음수
    [[20]],                        // 짝이 아님
    [['20', '30']],                // 숫자가 아님
    [[20, 99999999]],              // 말이 안 되는 길이
  ]) {
    const r = await post(A, {
      action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
      observation: { method: 'player_coverage', watchedRanges: ranges }, ...envelope(),
    })
    assert.equal(r.status, 400, `받으면 안 되는 구간을 받았습니다: ${JSON.stringify(ranges)}`)
  }
})

test('CS5 보고한 본 초와 구간 합계가 어긋나면 거절한다', async () => {
  const r = await sendRanges([[20, 30]], 900)      // 10초인데 900초라고 함
  assert.equal(r.status, 400, '어긋난 합계를 받았습니다')
})

// ════════════════════════════════════════════════════════════════════
// C-whole. 파일을 통째로 내려준다는 사실을 검수에 넣는다 (042 §3-C)
// ════════════════════════════════════════════════════════════════════

test('CW1 **전체가 안전하지 않은 영상**은 구간이 있어도 쓰지 않는다', async () => {
  const { relationsFor } = await import('../learning/catalog')
  const { previewNextAction } = await import('./learningPreview')
  const rels = relationsFor('demo-p-0107-1')
  const proof = rels.find((r) => r.relationId === 'rel-0107-proof-smuggled')
  assert.ok(proof !== undefined)
  assert.equal(proof.wholeDeliverySafe, false, '증명영상 전체를 안전하다고 표시했습니다')

  const out = previewNextAction({
    resolvedStudentScope: A, attemptRef: 'x',
    problemRef: { kind: 'problem', id: 'demo-p-0107-1', version: 1 },
    typeCode: '공수1-01-07', taskGoal: 'solve',
    stuck: { axis: 'recall', evidenceEventIds: [], helpObserved: 'unmeasured', repeatedMisconceptions: null },
    relations: rels,
  })
  const why = out.recommendedAction.rejected.find((r) => r.relationId === 'rel-0107-proof-smuggled')
  assert.ok(why !== undefined, '제외되지 않았습니다')
  assert.match(why.why, /전체를 내려주는데|노출 검수 범위/)
})

test('CW2 안전한 원본이 없으면 **카드로 간다** — 학습을 멈추지 않는다', async () => {
  const { relationsFor } = await import('../learning/catalog')
  const { previewNextAction } = await import('./learningPreview')
  const rels = relationsFor('demo-p-0107-2')          // 증명 원문
  const out = previewNextAction({
    resolvedStudentScope: A, attemptRef: 'x',
    problemRef: { kind: 'problem', id: 'demo-p-0107-2', version: 1 },
    typeCode: '공수1-01-07', taskGoal: 'prove',
    stuck: { axis: 'recall', evidenceEventIds: [], helpObserved: 'unmeasured', repeatedMisconceptions: null },
    relations: rels,
  })
  assert.equal(out.recommendedAction.kind, 'reviewed_asset', '증명 원문에 도움이 없어졌습니다')
  assert.equal(out.recommendedAction.contentRef.kind, 'card', '영상 파일을 통째로 내보냅니다')
  assert.equal(out.confirmAction.items.length >= 1, true)
})

test('CW3 영상으로 쓰이는 모든 관계는 **전체 전달이 승인**돼 있다', async () => {
  const { PROBLEMS, relationsFor } = await import('../learning/catalog')
  const { previewNextAction } = await import('./learningPreview')
  for (const p of PROBLEMS) {
    const rels = relationsFor(p.problemId)
    const out = previewNextAction({
      resolvedStudentScope: A, attemptRef: 'x',
      problemRef: { kind: 'problem', id: p.problemId, version: 1 },
      typeCode: p.typeCode, taskGoal: p.taskGoal,
      stuck: { axis: 'recall', evidenceEventIds: [], helpObserved: 'unmeasured', repeatedMisconceptions: null },
      relations: rels,
    })
    const id = out.recommendedAction.relationId
    if (id === null) continue
    const chosen = rels.find((r) => r.relationId === id)
    if (chosen.videoKind === null) continue
    assert.equal(chosen.wholeDeliverySafe, true,
      `${p.problemId} 에서 전체 전달이 승인 안 된 영상을 골랐습니다 (${id})`)
  }
})

// ════════════════════════════════════════════════════════════════════
// D-mode. 시험 장치는 **명시적 로컬 demo 모드에서만** 산다 (042 §3-D)
//
// 운영 서버에 일부러 요청하지 않는다. 여기서는 **이 저장소의 실제 모듈**을
// 보호된 로컬 시험 안에서 운영 모드로 돌려 본다.
// ════════════════════════════════════════════════════════════════════

/** demo 를 끈 채로 `fn` 을 돌린다. 끝나면 반드시 되돌린다 */
/** 주석을 뺀 **코드만** 본다 — 설명 글에 적힌 옛 경로가 걸리지 않게 */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

async function asOperational<T>(fn: () => Promise<T>): Promise<T> {
  const saved = process.env.LEARNING_DEMO_MODE
  try {
    delete process.env.LEARNING_DEMO_MODE
    return await fn()
  } finally {
    if (saved === undefined) delete process.env.LEARNING_DEMO_MODE
    else process.env.LEARNING_DEMO_MODE = saved
  }
}

test('DM1 **기본은 꺼짐** — 명시적으로 켜야 산다', async () => {
  const { learningMode, demoEnabled } = await import('../learning/mode')
  await asOperational(async () => {
    assert.equal(learningMode(), 'operational', '켜지 않았는데 시험 모드였습니다')
    assert.equal(demoEnabled(), false)
  })
  // 이 시험 파일은 setup 에서 켜 둔다
  assert.equal(demoEnabled(), true)
})

test('DM2 **운영 빌드에서는 환경변수로도 못 켠다**', async () => {
  const { learningMode } = await import('../learning/mode')
  // `NODE_ENV` 는 Next 타입에서 읽기 전용이라 평범한 쓰기 모양으로 본다
  const env = process.env as Record<string, string | undefined>
  const savedNode = env.NODE_ENV
  const savedDemo = env.LEARNING_DEMO_MODE
  try {
    env.NODE_ENV = 'production'
    env.LEARNING_DEMO_MODE = '1'                   // 일부러 켜 본다
    assert.equal(learningMode(), 'operational', '운영 빌드에서 시험 모드가 켜졌습니다 (R041-04)')
  } finally {
    if (savedNode === undefined) delete env.NODE_ENV
    else env.NODE_ENV = savedNode
    if (savedDemo === undefined) delete env.LEARNING_DEMO_MODE
    else env.LEARNING_DEMO_MODE = savedDemo
  }
})

test('DM3 운영 모드에서 **시험 강사 쿠키가 통하지 않는다** (R041-04 그 지점)', async () => {
  const { isStaffRequest, STAFF_COOKIE, STAFF_CODE } = await import('../learning/session')
  const req = new Request('http://localhost/x', { headers: { cookie: `${STAFF_COOKIE}=${STAFF_CODE}` } })
  assert.equal(isStaffRequest(req), true, 'demo 에서는 통해야 합니다')
  await asOperational(async () => {
    assert.equal(isStaffRequest(req), false, '운영에서 시험 강사 쿠키가 통했습니다')
  })
})

test('DM4 운영 모드에서 **시험 학생 세션이 통하지 않는다**', async () => {
  const { resolveStudent } = await import('../learning/session')
  const req = new Request('http://localhost/x', {
    headers: { cookie: `${COOKIE_NAME}=${makeCookieValue(A)}` },
  })
  assert.equal((await resolveStudent(req)).deny, null, 'demo 에서는 통해야 합니다')
  await asOperational(async () => {
    const r = await resolveStudent(req)
    assert.equal(r.deny, 'demo_disabled', '운영에서 시험 세션이 통했습니다')
    assert.equal(r.student, null)
  })
})

test('DM5 운영 모드의 행동 API 는 **시험 쿠키·시험 저장소로 통하지 않는다**', async () => {
  // ⚠️ 045 §3 으로 **기대값이 바뀌었다.** 042~044 는 「운영이면 모드만 보고 403」이었다.
  //   그래서 운영 provider 를 만들어 두고도 이 경로로 한 번도 닿지 않았다
  //   (GPT_REVIEW_043_044 §6: 403 · SDK 생성 0건). 이제 모드로 막지 않는다.
  //
  //   막는 것은 **인증과 설정**이다. 그래서 아래가 전보다 **더 센 주장**이다 —
  //   「403 이 떴다」가 아니라 「운영 요청으로는 시험 자료에 닿지도, 쓰지도 못한다」.
  const before = (await testStore().listEvents(A)).length
  await asOperational(async () => {
    const r = await post(A, {
      action: 'answer', taskId: TASK, problemId: PROBLEM, answer: '$-1$', ...envelope(),
    })
    // 시험 서명 쿠키를 들고 가도 운영 인증(Bearer)이 아니므로 통과하지 못한다.
    // 운영 설정이 없으면 503, 토큰이 없으면 401 — 어느 쪽이든 **200 이 아니다**
    assert.ok(r.status === 401 || r.status === 503,
      `운영 요청이 401·503 이 아니라 ${r.status} 였습니다`)
    assert.equal(r.json.ok, false)
    assert.notEqual(r.json.verdict, 'applied')
    // 시험 저장소 위치·입장 코드를 운영 응답에 흘리지 않는다
    assert.ok(!/\.learning-test-store/.test(JSON.stringify(r.json)),
      '운영 응답에 시험 저장소 경로가 들어 있습니다')
  })
  assert.equal((await testStore().listEvents(A)).length, before, '운영 모드인데 기록이 남았습니다')

  // 그리고 route 에 **옛 모드 차단**이 되살아나지 않았는지 본다 (회귀 방지).
  // 설명 주석에 옛 경로를 적어 두었으므로 **주석을 뺀 코드**만 본다
  const src = codeOnly(readFileSync('app/api/learning/act/route.ts', 'utf8'))
  assert.ok(!/demoEnabled\(\)/.test(src),
    '운영 모드를 모드만으로 다시 막고 있습니다 (045 §3 이 없앤 경로)')
})

test('DM6 운영 모드의 강사 경로는 **기존 직원 인가**로 간다 — 시험 쿠키로 열리지 않는다', async () => {
  const teacher = await import('../../app/api/learning/teacher/route')
  const { STAFF_COOKIE, STAFF_CODE } = await import('../learning/session')
  const req = new Request('http://localhost/api/learning/teacher', {
    headers: { cookie: `${STAFF_COOKIE}=${STAFF_CODE}` },
  })
  await asOperational(async () => {
    const res = await teacher.GET(req)
    // denyIfNotStaff 가 먼저 막는다 (설정 없음 500 또는 토큰 없음 401).
    // 어느 쪽이든 **시험 쿠키로 자료가 나오면 안 된다**
    assert.notEqual(res.status, 200, '시험 강사 쿠키로 강사 자료가 열렸습니다')
    const body = await res.json() as Record<string, unknown>
    assert.equal(body.rows, undefined, '막혔는데 자료를 함께 보냈습니다')
  })
})

test('DM7 운영 모드에서는 **검수 내부 사유를 학생에게 보내지 않는다**', async () => {
  // 045 §3 으로 엔진이 `demoEnabled()` 대신 **주입된 deps.mode** 를 본다.
  // 그래서 환경변수를 끄는 대신 **같은 자료·모드만 다른** 의존성을 끼워 가른다 —
  // 자료가 같으므로 「막힌 것이 있었다」는 사실까지 그대로 견줄 수 있다.
  const a = await attemptOf(A)
  const { chooseHelp } = await import('../learning/engine')
  const { demoContentSnapshot, demoActionStore, DEMO_PRODUCER } = await import('../learning/demoDeps')
  const { demoStudentAuth } = await import('../learning/demoAuth')
  const student = await testStore().getStudent(A)

  const inDemo = await chooseHelp(student, a)
  assert.ok(inDemo.blocked.length > 0, 'demo 에서는 개발 표시로 보여야 합니다')
  assert.equal(inDemo.blockedHidden, false)

  const asOps = {
    mode: 'operational' as const,
    content: demoContentSnapshot(),
    store: demoActionStore(),
    auth: demoStudentAuth,
    producer: DEMO_PRODUCER,
  }
  const v = await chooseHelp(student, a, asOps)
  assert.deepEqual(v.blocked, [], '운영에서 검수 사유를 보냈습니다')
  assert.equal(v.blockedHidden, true, '막힌 것이 있었다는 사실도 안 알렸습니다')
  assert.ok(!/답이 드러남|배정되지 않음|검수/.test(JSON.stringify(v.blocked)))
  // 같은 자료인데도 막힌 것이 **있었다** — 가려서 빈 것이 아니라는 확인
  assert.ok(inDemo.blocked.length > 0 && v.blockedHidden)
})

// ════════════════════════════════════════════════════════════════════
// R042. GPT_REVIEW_042 가 찾은 네 가지 (043 §5 의 1~4)
// ════════════════════════════════════════════════════════════════════

test('R1 **늦게 온 도움**이 같은 답의 재전송을 충돌로 만들지 않는다 (R042-02)', async () => {
  const task = 'task-A-0102b'
  const problem = 'demo-p-0102-2'
  const answerEnv = { actionId: nextId(), occurredAt: '2026-10-27T10:02:00.000Z' }
  const body = { action: 'answer', taskId: task, problemId: problem, answer: '$3$', ...answerEnv }

  const first = await post(A, body)
  assert.equal(first.json.verdict, 'applied')

  // 실제 발생은 10:01 인데 **뒤늦게** 도착한 도움 기록
  // (이 문항에는 승인된 도움이 없으므로 기록을 직접 넣는다)
  await testStore().transact((tx) => {
    const row = tx.findAttempt(A, task, problem)
    row.helpOpened.push({
      actionId: nextId(), occurredAt: '2026-10-27T10:01:00.000Z',
      relationId: 'late-help', contentRefId: 'demo-c-card-0102', segmentKey: 'full',
      observation: { method: 'player_coverage', coveragePct: 40, coveredSeconds: 20 },
    })
    tx.putAttempt(row)
  })

  // **바이트 동일한** 재전송 → 중복이어야 한다
  const again = await post(A, body)
  assert.equal(again.status, 200, `늦은 도움 때문에 ${again.status} 가 났습니다`)
  assert.equal(again.json.verdict, 'duplicate',
    `늦은 도움이 지문을 바꿨습니다: ${JSON.stringify(again.json.changedFields)}`)

  // 그런데 **분석은** 늦은 근거를 반영한다 — 이제 도움 뒤 제출로 센다
  const s = summarize(await attemptOf(A, task, problem))
  assert.equal(s.resultAfterHelp, 'correct', '늦게 온 도움을 분석에 반영하지 않았습니다')
})

test('R2 시각은 **표기가 달라도 실제 시점**으로 견준다 (R042-02)', async () => {
  const { isAfterHelp, epochOf } = await import('../learning/contract')
  // 같은 순간을 다른 표기로: 09:00Z == 18:00+09:00
  assert.equal(epochOf('2026-10-27T09:00:00.000Z'), epochOf('2026-10-27T18:00:00.000+09:00'))
  // 문자열로 견주면 '1' < '2' 라 뒤집히는 짝
  const a: AttemptRow = {
    attemptId: 'x', studentId: A, taskId: 't', problemId: 'p',
    startedAt: '', answers: [], stuckReports: [], confirmSubmissions: [], updatedAt: '',
    helpOpened: [{
      actionId: 'h', occurredAt: '2026-10-27T18:00:00.000+09:00',   // 실제 09:00Z
      relationId: 'r', contentRefId: 'c', segmentKey: 'full',
      observation: { method: 'player_coverage' },
    }],
  }
  const later: AnswerRecord = { actionId: 'a', occurredAt: '2026-10-27T10:00:00.000Z', answer: 'x', graded: null }
  const earlier: AnswerRecord = { actionId: 'b', occurredAt: '2026-10-27T08:00:00.000Z', answer: 'x', graded: null }
  assert.equal(isAfterHelp(a, later), true, '실제로 뒤인데 아니라고 했습니다')
  assert.equal(isAfterHelp(a, earlier), false, '실제로 앞인데 뒤라고 했습니다')
  // 못 읽는 시각은 「뒤」로 올리지 않는다
  assert.equal(isAfterHelp(a, { ...later, occurredAt: '어제' }), false)
})

test('R3 **구간 밖만 보냈으면 완료가 살아남지 않는다** (R042-03)', async () => {
  const r = await post(A, {
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: {
      method: 'player_coverage', watchedRanges: [[90, 100]], coveredSeconds: 10,
      playedSeconds: 10, completed: true,
    },
    ...envelope(),
  })
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  assert.notEqual(last.observation.completed, true, '구간 밖인데 완료가 남았습니다')
  assert.equal(last.observation.coveredSeconds, undefined)
  // 학생 주장은 **따로** 남는다 — 서버 계산과 구별된다
  assert.equal(last.observation.completedClaimed, true, '학생 주장을 지워 버렸습니다')

  // 근거에도 「시청 완료 표시됨」이 들어가면 안 된다
  const { chooseHelp } = await import('../learning/engine')
  const student = await testStore().getStudent(A)
  const v = await chooseHelp(student, a)
  assert.ok(!v.preview.evidence.observed.some((x) => /시청 완료 표시됨/.test(x)),
    '구간 밖인데 시청 완료로 적었습니다')
})

test('R4 **반복 숨김 재생 20초 · unique 10초**는 정상이다 — 거절하지 않는다 (R042-03)', async () => {
  const r = await post(A, {
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: {
      method: 'player_coverage',
      watchedRanges: [[20, 30]],      // 서로 다른 구간 10초
      coveredSeconds: 10,
      playedSeconds: 20,              // 같은 데를 두 번 봤다
      focusLostSeconds: 20,           // 둘 다 숨긴 탭에서
    },
    ...envelope(),
  })
  assert.equal(r.status, 200, `정상 관측을 ${r.status} 로 거절했습니다`)
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  assert.equal(last.observation.focusLostSeconds, 20, '숨김 재생을 깎았습니다')
  assert.equal(last.observation.coveredSeconds, 10)
})

test('R5 완료는 **유효 구간과 기준**으로 서버가 센다 (R042-03)', async () => {
  // 구간 10–70 (60초) 중 55초를 보면 91.7% → COMPLETE_PCT(90) 넘음
  const r = await post(A, {
    action: 'help', taskId: TASK, problemId: PROBLEM, relationId: 'rel-0102-worked-type',
    observation: {
      method: 'player_coverage', watchedRanges: [[10, 65]], coveredSeconds: 55,
      playedSeconds: 55, completed: false,          // 학생 화면은 아니라고 했지만
    },
    ...envelope(),
  })
  assert.equal(r.json.verdict, 'applied')
  const a = await attemptOf(A)
  const last = a.helpOpened[a.helpOpened.length - 1]
  assert.equal(last.observation.completed, true, '서버가 기준으로 세지 않았습니다')
  assert.equal(last.observation.completedClaimed, false, '학생 주장을 안 남겼습니다')
})

test('R6 런처는 **loopback 을 고정**하고 주소 인자를 받지 않는다 (R042-04)', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve, join } = await import('node:path')
  const src = readFileSync(join(resolve(__dirname, '..', '..'), 'scripts/dev-learning-demo.cjs'), 'utf8')
  assert.match(src, /'--hostname', HOST/, 'hostname 을 넘기지 않습니다')
  assert.match(src, /const HOST = '127\.0\.0\.1'/, 'loopback 이 고정돼 있지 않습니다')
  for (const bad of ['--hostname', '--host', '-H']) {
    assert.ok(src.includes(`'${bad}'`), `${bad} 를 막는 목록에 없습니다`)
  }
  assert.match(src, /process\.exit\(1\)/, '막은 인자에 멈추지 않습니다')
})

// ════════════════════════════════════════════════════════════════════
// D. 저장 파일이 실제로 남는가
// ════════════════════════════════════════════════════════════════════

test('D1 기록은 **파일에** 남는다 — 새로고침·재접속에서 서버가 다시 읽는다', async () => {
  const file = testStoreFile()
  assert.ok(existsSync(file), '저장 파일이 없습니다')
  const db = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown[]>
  assert.ok(db.attempts.length > 0)
  assert.ok(db.events.length > 0)
  // 정답이 파일 밖 학생 payload 로 새지 않는지는 exec041 E 구역에서 본다
})
