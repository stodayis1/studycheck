/**
 * 학습 한 바퀴의 **행동**을 받는다 — GPT-EXEC-041 · 042 §3-A · **045 §3 으로 운영 경로 연결**
 *
 *   open    문항 열기 (시도 만들기 또는 이어받기)
 *   answer  원문 답 제출
 *   stuck   막힌 지점 고르기
 *   help    도움을 열었다 · 재생 관측 저장
 *   confirm 확인 행동 제출
 *
 * 이 파일이 하는 일은 **네 가지뿐**이다.
 *   ① 지금 모드에 맞는 **인증**으로 학생을 확정한다 (본문의 학생 id 는 쓰지 않는다)
 *   ② 요청 본문을 자료형·범위까지 검사한다
 *   ③ 모드에 맞는 의존성을 받아
 *   ④ `applyAction` 에 넘긴다 — 범위 확인·중복·충돌 판정과 상태 변경은 **거기서 한 덩어리로**
 *
 * 045 에서 달라진 것 — **운영 모드가 무조건 403 이 아니다**
 *   042·043·044 는 `if (!demoEnabled()) return 403` 으로 시작했다. 그래서 운영 provider 를
 *   만들어 두고도 이 경로로는 **한 번도 닿지 않았다** (GPT 직접 호출: 403 · SDK 생성 0건).
 *   이제 모드별로 의존성을 갈라 끼운다. demo 보호를 **없앤 것이 아니라** 운영 쪽 길을 낸 것이다 —
 *   시험 입장 코드·시험 강사 쿠키·파일 저장소는 운영에서 여전히 통하지 않는다 (`mode.ts`).
 *
 *
 * ⚠️ 이 경로에 **직원 인가가 없는 이유** (safe-change 점검표 §4)
 *   ※ 가드 훑기는 파일에서 그 함수 **이름**을 찾는다. 그래서 이 주석에는
 *     그 이름을 적지 않는다 — 적으면 훑기가 이 파일을 더 이상 집어내지 못한다.
 *   학생·학부모가 부르는 API 라서 직원 인가를 쓸 수 없다. 대신 그 항목이 요구하는 대로
 *   **토큰으로 본인을 확인하고, 본문의 학생 id 를 믿지 않는다** —
 *   `resolveLearningAuth()` → 운영 학생 인증이 Bearer 토큰의 auth uid 로
 *   `students.session_uid` 를 찾아 학생을 확정한다 (`app/api/push/subscribe` 와 같은 방식).
 *   본문에 학생 id 를 넣어 보내도 **쓰지 않는다.**
 *   학부모 세션(`parent_session_uid`)으로는 열리지 않는다 — 학습 행동의 주체는 학생이다.
 *   가드 없는 라우트를 훑을 때 이 두 경로가 나오면 **의도된 것**이다.
 *
 * 운영 설정이 없으면
 *   **시연 자료로 바꾸지 않는다.** `NotConfiguredError` 를 503 으로 그대로 알린다 (043 §3-A).
 */
import { NextResponse } from 'next/server'

import { applyAction, chooseHelp, type Action, type ApplyResult } from '@/lib/learning/engine'
import {
  NotConfiguredError, resolveLearningAuth, resolveLearningDeps,
} from '@/lib/learning/deps'
import { AXES, type AxisCode, type VideoObservationRecord } from '@/lib/learning/contract'

/** 상태코드는 판정에 따라 나눈다 — 충돌을 200 으로 내보내지 않는다 */
const STATUS: Record<ApplyResult['verdict'], number> = {
  applied: 200, duplicate: 200, conflict: 409, rejected: 403,
}

export async function POST(req: Request) {
  try {
    return await handle(req)
  } catch (e) {
    // 운영 설정이 없는 것과 저장 실패를 **가른다.** 설정 누락을 500 으로 숨기지 않는다
    if (e instanceof NotConfiguredError || (e as { notConfigured?: boolean })?.notConfigured) {
      return NextResponse.json({
        ok: false,
        verdict: 'rejected',
        mode: 'operational',
        error: '운영 학습 설정이 없습니다',
        why: '시험 자료로 대신하지 않습니다 (EXEC-043 §3-A).',
      }, { status: 503 })
    }
    // 저장·읽기가 실패했다. **성공처럼 돌려주지 않는다** (042 §3-A-4).
    // 원본 오류 문구는 내보내지 않는다 — 경로·내부 상태가 새지 않게.
    return NextResponse.json({
      ok: false,
      verdict: 'failed',
      error: '기록을 저장하지 못했습니다. 같은 버튼을 다시 눌러 주세요 — 두 번 반영되지 않습니다',
    }, { status: 500 })
  }
}

async function handle(req: Request) {
  // ① 학생을 먼저 확정한다 — **콘텐츠를 읽기 전에** (045 §3)
  const auth = await resolveLearningAuth()
  const r = await auth.resolve(req)
  if (r.deny !== null || r.student === null) {
    return NextResponse.json(
      { ok: false, error: '입장하지 않았습니다', deny: r.deny, authSource: r.source },
      { status: 401 },
    )
  }

  // ② 본문을 검사한다
  const raw: unknown = await req.json().catch((): unknown => undefined)
  const body = (raw === null || typeof raw !== 'object') ? null : raw as Record<string, unknown>
  if (body === null) return NextResponse.json({ ok: false, error: '본문을 읽을 수 없습니다' }, { status: 400 })

  const kind = String(body.action ?? '')
  const action = parseAction(kind, body)
  if (action === null) {
    return NextResponse.json({ ok: false, error: `받을 수 없는 행동입니다: ${kind}` }, { status: 400 })
  }

  // ③ 모드에 맞는 의존성. 운영 설정이 없으면 여기서 던진다
  const deps = await resolveLearningDeps()

  // ④ 범위 확인·중복 판정·상태 변경을 한 덩어리로
  const out = await applyAction({
    student: r.student,
    taskId: String(body.taskId ?? ''),
    problemId: String(body.problemId ?? ''),
    actionId: String(body.actionId ?? ''),
    occurredAt: String(body.occurredAt ?? ''),
    action,
  }, deps)

  // 상태가 바뀐 **뒤**의 근거·계획을 함께 돌려준다.
  // `answer` 에도 붙인다 — 재풀이 결과가 그 자리에서 요약에 반영돼야 한다 (042 §3-B).
  let help = null
  if (out.attempt !== null && kind !== 'open') {
    help = await chooseHelp(r.student, out.attempt, deps)
  }

  return NextResponse.json({
    ok: out.verdict === 'applied' || out.verdict === 'duplicate',
    verdict: out.verdict,
    reason: out.reason,
    changedFields: out.changedFields,
    error: out.verdict === 'rejected' || out.verdict === 'conflict' ? out.reason : undefined,
    attempt: out.attempt,
    summary: out.summary,
    graded: out.graded,
    gradedNote: out.gradedNote,
    planDraft: out.planDraft,
    // 계획 초안을 **실제로 저장했는가.** 운영에는 표가 없다 — 숨기지 않는다
    planDraftPersisted: deps.store.planDraftPersisted,
    mode: deps.mode,
    contentSource: deps.content.source,
    storage: { backend: deps.store.backend, location: deps.store.location },
    help,
  }, { status: STATUS[out.verdict] })
}

function parseAction(kind: string, body: Record<string, unknown>): Action | null {
  if (kind === 'open') return { kind: 'open' }
  if (kind === 'answer') return { kind: 'answer', answer: String(body.answer ?? '') }
  if (kind === 'stuck') {
    const raw = body.axis === null || body.axis === undefined ? null : String(body.axis)
    const axis: AxisCode | null = raw !== null && AXES.includes(raw as AxisCode) ? (raw as AxisCode) : null
    return { kind: 'stuck', axis }
  }
  if (kind === 'help') {
    const obs = parseObservation(body.observation)
    if (obs === null) return null
    return { kind: 'help', relationId: String(body.relationId ?? ''), observation: obs }
  }
  if (kind === 'confirm') {
    return { kind: 'confirm', itemRef: String(body.itemRef ?? ''), answer: String(body.answer ?? '') }
  }
  return null
}

/**
 * 재생 관측을 **범위까지** 검사한다 (042 §3-C).
 *
 * 041 은 숫자이기만 하면 받아서 `coveragePct: 999`, `coveredSeconds: -2`,
 * 문자열 `sceneSeconds` 가 그대로 저장됐다. 이제 말이 되는 값만 받고,
 * **말이 안 되는 값은 0 으로 고치지 않고 통째로 거절한다.**
 * (숫자 검사를 했다는 것이 실제 시청·집중의 증거는 아니다.)
 */
function parseObservation(v: unknown): VideoObservationRecord | null {
  if (v === null || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const method = o.method
  if (method !== 'player_coverage' && method !== 'window_elapsed' && method !== 'self_report') return null

  const out: VideoObservationRecord = { method }
  function num(x: unknown, lo: number, hi: number): number | null | undefined {
    if (x === undefined) return undefined              // 안 보냈다 = 미측정
    if (typeof x !== 'number' || !Number.isFinite(x)) return null
    if (x < lo || x > hi) return null
    return x
  }
  const put = (key: keyof VideoObservationRecord, x: unknown, lo: number, hi: number): boolean => {
    const n = num(x, lo, hi)
    if (n === null) return false
    if (n !== undefined) (out as Record<string, unknown>)[key] = n
    return true
  }

  if (method === 'player_coverage') {
    // 하루(86400초)를 넘는 재생은 받지 않는다
    if (!put('coveragePct', o.coveragePct, 0, 100)) return null
    if (!put('coveredSeconds', o.coveredSeconds, 0, 86400)) return null
    if (!put('focusLostSeconds', o.focusLostSeconds, 0, 86400)) return null
    if (o.sceneSeconds !== undefined) {
      if (o.sceneSeconds === null || typeof o.sceneSeconds !== 'object' || Array.isArray(o.sceneSeconds)) return null
      const scenes: Record<string, number> = {}
      for (const [k, sv] of Object.entries(o.sceneSeconds as Record<string, unknown>)) {
        if (typeof sv !== 'number' || !Number.isFinite(sv) || sv < 0 || sv > 86400) return null
        scenes[k] = sv
      }
      out.sceneSeconds = scenes
    }
    if (o.completed !== undefined) {
      if (typeof o.completed !== 'boolean') return null
      out.completed = o.completed
    }
    // 042 §2-C (R042-03) — **척도가 다른 둘을 견주지 않는다.**
    //
    //   `focusLostSeconds` : 반복 재생을 포함한 **숨긴 탭에서의 재생 시간**
    //   `coveredSeconds`   : **서로 다른 구간**의 길이 (겹쳐 봐도 한 번)
    //
    // 같은 10초를 숨긴 채 두 번 보면 숨김 20초 · unique 10초 가 **정상**이다.
    // 전에는 이것을 400 으로 거절했다. 이제 거절하지 않는다.
    // 비교는 **같은 척도**인 총 재생(`playedSeconds`)과만 한다
    if (!put('playedSeconds', o.playedSeconds, 0, 86400)) return null
    if (out.focusLostSeconds !== undefined && out.playedSeconds !== undefined
        && out.focusLostSeconds > out.playedSeconds) return null
    if (out.coveredSeconds !== undefined && out.playedSeconds !== undefined
        && out.coveredSeconds > out.playedSeconds) return null

    // 본 구간 목록 (042 §3-C) — 모양·순서·길이를 본다. 구간 **밖**인지는
    // 서버가 승인 구간을 아는 `applyAction` 에서 한 번 더 자른다
    if (o.watchedRanges !== undefined) {
      if (!Array.isArray(o.watchedRanges) || o.watchedRanges.length > 500) return null
      const rs: Array<[number, number]> = []
      let total = 0
      for (const r of o.watchedRanges) {
        if (!Array.isArray(r) || r.length !== 2) return null
        const [a, b] = r
        if (typeof a !== 'number' || typeof b !== 'number') return null
        if (!Number.isFinite(a) || !Number.isFinite(b)) return null
        if (a < 0 || b <= a || b > 86400) return null
        total += b - a
        rs.push([a, b])
      }
      // 합계가 보고한 본 초와 크게 어긋나면 받지 않는다 (반올림 여유 2초)
      if (out.coveredSeconds !== undefined && Math.abs(total - out.coveredSeconds) > 2) return null
      out.watchedRanges = rs
    }
  } else if (method === 'window_elapsed') {
    if (!put('windowElapsedMs', o.windowElapsedMs, 0, 86400_000)) return null
  }
  // self_report 는 숫자를 받지 않는다 — 「읽었다」는 자기보고일 뿐이다
  return out
}
