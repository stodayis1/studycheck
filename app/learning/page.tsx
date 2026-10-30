'use client'

/**
 * 학생 학습 화면 — GPT-EXEC-041 의 첫 브라우저 사용판
 *
 *   진입 → 배정 문항 → 답 제출 → 막힌 지점 → 승인된 도움(영상 구간·카드·문항)
 *     → 확인 행동 제출 → 원문 복귀 → 재시도 → 저장 → 새로고침 뒤 다시 읽기
 *
 * 재사용
 *   시청 판정은 `lib/lessonVideos.ts` 의 `mergeRanges` · `coveredSeconds` ·
 *   `COMPLETE_PCT` 를 쓴다. main 의 플레이어가 쓰는 **그 함수 그대로**다.
 *
 * 경계
 *   - 정답은 서버에서 내려오지 않는다. 채점만 서버가 한다.
 *   - 열람 가능 여부·노출 판단을 이 화면이 정하지 않는다. 서버가 고른 하나만 연다.
 *   - 기록은 서버(시험 저장소 파일)에 남는다. localStorage 를 쓰지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { COMPLETE_PCT, coveredSeconds, mergeRanges } from '@/lib/lessonVideos'
import { AXIS_LABEL, type AxisCode } from '@/lib/learning/contract'
import { MathText } from '@/components/MathText'
import { learningFetch } from '@/lib/learning/clientFetch'

type ProblemView = {
  problemId: string
  typeCode: string
  taskGoal: 'solve' | 'prove' | 'explain'
  stem: string
  choices: string[] | null
  provenance: string
}

type Attempt = {
  attemptId: string
  answers: Array<{ actionId: string; answer: string; graded: string | null; afterHelp: boolean }>
  stuckReports: Array<{ actionId: string; axis: AxisCode | null }>
  helpOpened: Array<{ actionId: string; relationId: string; segmentKey: string; observation: Record<string, unknown> }>
  confirmSubmissions: Array<{ actionId: string; itemRef: string; answer: string; graded: string | null; origin: string }>
}

/** 서버가 **목록에서 계산해** 준다. 화면이 다시 세지 않는다 */
type Summary = {
  firstResult: string | null
  lastResult: string | null
  resultAfterHelp: string | null
  answerCount: number
  repeatedWrong: boolean
  stuckAxis: AxisCode | null
  helpOpenCount: number
  anyConfirmCorrect: boolean
}

type TaskView = {
  taskId: string
  label: string
  typeCode: string
  typeTitle: string
  chapter: string
  typeProvenance: string
  problems: Array<{
    problem: ProblemView
    /** 원문 그림의 서명된 임시 주소. 저장소 경로는 받지 않는다 (045 §3) */
    imageUrl: string | null
    attempt: Attempt | null
    summary: Summary | null
  }>
}

type State = {
  signedIn: boolean
  deny?: string
  staff?: boolean
  student?: { studentId: string; displayName: string }
  storage?: { backend: string; location: string }
  catalogNote?: string
  tasks?: TaskView[]
  loginCodes?: Array<{ code: string; name: string }>
  /** 지금 어느 모드인가. 화면에 그대로 적는다 — 섞어 보여 주지 않는다 */
  mode?: string
  how?: string
  why?: string
  /** 운영이면 「기존 로그인으로 들어오세요」 안내가 온다 */
  howToSignIn?: string
  authSource?: string
  matchedBy?: string
  contentSource?: string
  /** 계획 초안을 **실제로 저장하는가** (운영에는 표가 없다) */
  planDraftPersisted?: boolean
  error?: string
}

type Help = {
  preview: {
    recommendedAction: {
      kind: string
      relationId: string | null
      contentRef: { kind: string; id: string } | null
      segment?: { startSeconds: number; endSeconds: number; sceneNo?: number }
      reason: string
      fallbackTasks: Array<{ taskRef: string; label: string; href: string }>
    }
    confirmAction: {
      label: string
      kind: string
      items: Array<{
        itemRef: string; prompt: string; choices: string[] | null; origin: string
        /** 확인 문항이 그림일 때 서버가 서명한 임시 주소. 없으면 null·생략 */
        imageUrl?: string | null
      }>
    } | null
    returnPath: string
    evidence: {
      observed: string[]
      unknownScope: string[]
      notClaimed: string[]
      outcomes: {
      confirmPassed: boolean | null
      sourceSolvedAfterHelp: boolean | null
      delayedRecheckPassed: boolean | null
      mastery: null
      notes: string[]
    }
    }
    planDraft: { approvalState: string; items: string[]; recheckMethod: string }
    teacherSummary: string
  }
  asset: {
    assetId: string; kind: string; videoKind: string | null; title: string
    /** 어느 재생기를 쓰는가 — **서버가 정한다** (045 §3) */
    media: 'youtube' | 'file' | 'text' | 'none'
    youtubeId: string | null
    src: string | null; body: string | null; durationSeconds: number | null; provenance: string
  } | null
  blocked: Array<{ relationId: string; title: string; why: string }>
  resumeRanges: Array<[number, number]>
}

/** 셋으로 갈라 적는다. `null` 을 「아니오」로 바꾸지 않는다 */
function label3(v: boolean | null, yes: string, no: string, none: string): string {
  return v === null ? none : (v ? yes : no)
}

const BOX: React.CSSProperties = {
  border: '1px solid #d7dbe0', borderRadius: 10, padding: 14, marginBottom: 14, background: '#fff',
}

/** `/api/learning/act` 가 돌려주는 모양 */
type ActResponse = {
  ok: boolean
  verdict: 'applied' | 'duplicate' | 'conflict' | 'rejected'
  reason: string
  error?: string
  attempt: Attempt | null
  summary: Summary | null
  graded: string | null
  gradedNote: string | null
  help: Help | null
}

/** 보냈지만 서버 확인을 못 받은 관측 1건 (R042-01) */
export type PendingObservation = {
  actionId: string
  occurredAt: string
  observation: Record<string, unknown>
}

/** 행동마다 **새로** 만든다. 같은 행동을 다시 보낼 때는 바꾸지 않는다 */
function newActionId(): string {
  const c = globalThis.crypto
  if (c !== undefined && typeof c.randomUUID === 'function') return c.randomUUID()
  return `a-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * 행동 하나를 보낸다 (042 §3-A-1).
 *
 * 핵심은 `actionId` 와 `occurredAt` 을 **고리 밖에서 한 번** 만든다는 것이다.
 * 망이 끊겨 다시 보낼 때도 **같은 값**이 가므로 서버가 「같은 행동」임을 안다 —
 * 041 처럼 발생시각이 매번 새로 생겨 충돌로 쌓이지 않는다.
 *
 * 되돌려 주는 것
 *   - 반영됐거나 중복이면 서버 응답
 *   - 충돌(409)·거부(403)면 `null` 과 함께 사유를 화면에 띄운다
 */
async function sendAction(
  payload: Record<string, unknown>,
  setMsg: (s: string) => void,
  /** 다시 보내는 것이면 **처음 쓴 봉투**를 그대로 넘긴다 (R042-01) */
  reuse?: { actionId: string; occurredAt: string },
): Promise<ActResponse | null> {
  const envelope = reuse ?? { actionId: newActionId(), occurredAt: new Date().toISOString() }
  const body = JSON.stringify({ ...payload, ...envelope })

  let lastErr = ''
  for (let tryNo = 0; tryNo < 2; tryNo++) {
    try {
      // AGENTS.md 「서버 API 규칙」 — 브라우저에서는 `fetch` 대신 토큰을 붙이는 것으로.
      // 기존 로그인(익명 Auth + `student_login`)의 Bearer 토큰을 붙여 준다.
      // 로컬 체험판에는 Supabase 세션이 없어 머리글이 안 붙고 쿠키 경로로 간다 —
      // **한 함수로 두 모드가 다 돈다.**
      const r = await learningFetch('/api/learning/act', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body,
      })
      const j = (await r.json()) as ActResponse
      if (j.ok === true) { setMsg(''); return j }
      // 충돌·거부는 다시 보내도 같은 답이다. 바로 알린다
      setMsg(String(j.error ?? j.reason ?? '실패'))
      return null
    } catch (e) {
      // 망이 끊긴 경우만 한 번 더. **같은 body 를 그대로** 보낸다
      lastErr = e instanceof Error ? e.message : String(e)
    }
  }
  // 같은 봉투를 다시 넘기지 않는 한 **다시 누르면 새 행동**이다. 없는 보장을 적지 않는다
  setMsg(reuse === undefined
    ? `보내지 못했습니다 (${lastErr}). 다시 눌러 주세요 — 저장된 것은 없습니다`
    : `보내지 못했습니다 (${lastErr}). 같은 기록으로 다시 보냅니다 — 두 번 반영되지 않습니다`)
  return null
}

export default function LearningPage() {
  const [state, setState] = useState<State | null>(null)
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState('')
  const [cur, setCur] = useState<{ taskId: string; problemId: string } | null>(null)
  const [help, setHelp] = useState<Help | null>(null)
  const [phase, setPhase] = useState<'source' | 'axis' | 'help'>('source')
  const [answer, setAnswer] = useState('')
  const [graded, setGraded] = useState<{ graded: string | null; note: string | null } | null>(null)

  const load = useCallback(async () => {
    const r = await learningFetch('/api/learning/session', { cache: 'no-store' })
    setState(await r.json())
  }, [])

  useEffect(() => { void load() }, [load])

  async function act(payload: Record<string, unknown>) {
    return sendAction({ ...payload, ...(cur ?? {}) }, setMsg)
  }

  async function login(c: string) {
    const r = await learningFetch('/api/learning/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: c }),
    })
    const j = await r.json()
    if (!j.ok) { setMsg(String(j.error ?? '입장 실패')); return }
    setMsg(''); setCur(null); setHelp(null); setPhase('source')
    await load()
  }

  async function logout() {
    await learningFetch('/api/learning/session', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'logout' }),
    })
    setCur(null); setHelp(null); setPhase('source'); setState(null)
    await load()
  }

  // ── 입장 전 ─────────────────────────────────────────────────────
  if (state === null) return <main style={{ padding: 24 }}>불러오는 중…</main>

  // 045 — **운영 모드를 모드만 보고 막지 않는다.** 전에는 여기서 전면 차단해서
  // 운영에서는 이 화면이 아예 열리지 않았다. 지금은 인증·설정으로만 막는다.
  // 운영 설정이 없으면 서버가 503 과 사유를 준다 — **시연으로 바꾸지 않는다**
  if (state.signedIn !== true && state.mode === 'operational' && state.error !== undefined) {
    return (
      <main style={{ maxWidth: 680, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ ...BOX, borderColor: '#e0b4b4', background: '#fff6f6' }}>
          <h1 style={{ fontSize: 18, marginTop: 0 }}>{state.error}</h1>
          <p style={{ marginBottom: 0 }}>{state.why}</p>
        </div>
      </main>
    )
  }

  if (!state.signedIn) {
    const operational = state.mode === 'operational'
    return (
      <main style={{ maxWidth: 680, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <Banner storage={state.storage} note={null} />
        <h1 style={{ fontSize: 20 }}>{operational ? '학습 들어가기' : '학습 들어가기 (시험 계정)'}</h1>
        <div style={BOX}>
          {operational ? (
            // 운영에서는 **기존 로그인을 그대로 쓴다.** 새 로그인을 만들지 않는다.
            // 이 화면은 `learningFetch` 로 토큰을 붙여 보내므로, 이미 로그인했다면 그냥 열린다
            <>
              <p style={{ marginTop: 0, color: '#555' }}>
                {state.howToSignIn
                  ?? '기존 로그인(이름 + 보호자 전화 뒷4자리)으로 들어온 뒤 이 화면을 여세요.'}
              </p>
              <a href="/auth/login" style={{ ...btn, display: 'inline-block', textDecoration: 'none' }}>
                로그인 화면으로
              </a>
              <button onClick={() => void load()} style={{ ...btn, marginLeft: 8 }}>다시 확인</button>
              {state.deny !== undefined && (
                <p style={{ color: '#666', fontSize: 12, marginTop: 10, marginBottom: 0 }}>
                  서버가 돌려준 사유: <code>{state.deny}</code>
                  {state.deny === 'unknown_student'
                    && ' — 학생 본인 로그인이어야 합니다 (학부모 로그인으로는 열리지 않습니다).'}
                  {state.deny === 'lookup_failed'
                    && ' — 조회가 실패했습니다. 「학생 없음」이 아닙니다. 선생님께 알려 주세요.'}
                  {state.deny === 'inactive_student' && ' — 재원 중인 학생만 열 수 있습니다.'}
                  {state.deny === 'not_configured' && ' — 운영 설정이 없습니다.'}
                </p>
              )}
            </>
          ) : (
            <>
              <p style={{ marginTop: 0, color: '#555' }}>
                운영 학생 로그인(이름 + 보호자 전화 뒷4자리)이 아닙니다. 아래 시험 입장 코드를 씁니다.
              </p>
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="입장 코드"
                style={{ padding: 8, border: '1px solid #ccc', borderRadius: 6, marginRight: 8 }} />
              <button onClick={() => void login(code)} style={btn}>들어가기</button>
              <div style={{ marginTop: 12 }}>
                {(state.loginCodes ?? []).map((c) => (
                  <button key={c.code} onClick={() => void login(c.code)} style={{ ...btn, marginRight: 8 }}>
                    {c.name} ({c.code})
                  </button>
                ))}
              </div>
            </>
          )}
          {msg && <p style={{ color: '#c00' }}>{msg}</p>}
        </div>
      </main>
    )
  }

  const tasks = state.tasks ?? []
  const curTask = cur === null ? null : tasks.find((t) => t.taskId === cur.taskId) ?? null
  const curEntry = curTask === null || cur === null
    ? null : curTask.problems.find((p) => p.problem.problemId === cur.problemId) ?? null

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <Banner storage={state.storage} note={state.catalogNote ?? null} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h1 style={{ fontSize: 20 }}>{state.student?.displayName} 학습</h1>
        <div>
          <a href="/learning/teacher" style={{ marginRight: 12, fontSize: 13 }}>강사 요약</a>
          <button onClick={() => void logout()} style={btn}>나가기</button>
        </div>
      </div>
      {msg && <p style={{ color: '#c00' }}>{msg}</p>}

      {/* ── 배정된 과제 ─────────────────────────────────────── */}
      <div style={BOX}>
        <h2 style={h2}>배정된 과제 {tasks.length}개</h2>
        {tasks.length === 0 && <p>배정된 과제가 없습니다.</p>}
        {tasks.map((t) => (
          <div key={t.taskId} style={{ marginBottom: 10 }}>
            <div style={{ fontWeight: 600 }}>{t.label}</div>
            <div style={{ fontSize: 12, color: '#666' }}>
              {t.chapter} · {t.typeCode} {t.typeTitle} · 유형 출처: {t.typeProvenance}
            </div>
            {t.problems.map((p) => (
              <button key={p.problem.problemId}
                onClick={() => {
                  setCur({ taskId: t.taskId, problemId: p.problem.problemId })
                  setPhase('source'); setHelp(null); setAnswer(''); setGraded(null)
                  void sendAction(
                    { action: 'open', taskId: t.taskId, problemId: p.problem.problemId }, setMsg,
                  ).then(() => load())
                }}
                style={{ ...btn, marginRight: 6, marginTop: 6,
                         background: cur?.problemId === p.problem.problemId ? '#e8f0ff' : '#f6f7f9' }}>
                {p.problem.problemId}
                {p.summary !== null && (
                  <span style={{ fontSize: 11, color: '#555' }}>
                    {' '}· 제출 {p.summary.answerCount}회 (첫 {p.summary.firstResult ?? '—'} → 마지막 {p.summary.lastResult ?? '—'})
                    {' '}· 도움 {p.summary.helpOpenCount} · 확인 {p.attempt === null ? 0 : p.attempt.confirmSubmissions.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      {curEntry !== null && cur !== null && (
        <>
          {/* ── 원문 ─────────────────────────────────────────── */}
          <div style={BOX}>
            <h2 style={h2}>
              원문 · {curEntry.problem.typeCode}
              <Tag text={curEntry.problem.provenance === 'demo' ? '시연 문항' : '실제 문항'} />
            </h2>
            {/*
              045 §3 — **운영 문항은 본문이 그림이다** (`stem` 이 빈 글자).
              전에는 지문과 보기만 그려서 운영 문항이 화면에 **아무것도 안 나왔다**.
              주소는 서버가 서명해 준 것만 쓴다 (`problem-images` 버킷, 2시간).
            */}
            {curEntry.problem.stem !== '' && (
              <p style={{ fontSize: 16, lineHeight: 1.7 }}><MathText text={curEntry.problem.stem} /></p>
            )}
            {curEntry.imageUrl !== null && (
              <img src={curEntry.imageUrl} alt={`문항 ${curEntry.problem.problemId}`}
                style={{ maxWidth: '100%', border: '1px solid #e5e7eb', borderRadius: 6 }} />
            )}
            {curEntry.problem.stem === '' && curEntry.imageUrl === null && (
              <p style={{ fontSize: 14, color: '#b45309' }}>
                문항 그림을 불러오지 못했습니다. 선생님께 알려 주세요
                — 빈 화면을 「문항 없음」으로 넘기지 않습니다.
              </p>
            )}
            {curEntry.problem.choices === null ? (
              <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3}
                placeholder="풀이를 적으세요"
                style={{ width: '100%', padding: 8, border: '1px solid #ccc', borderRadius: 6 }} />
            ) : (
              <div>
                {curEntry.problem.choices.map((c) => (
                  <button key={c} onClick={() => setAnswer(c)}
                    style={{ ...btn, marginRight: 6, background: answer === c ? '#e8f0ff' : '#f6f7f9' }}>
                    <MathText text={c} />
                  </button>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <button style={btnPrimary}
                onClick={async () => {
                  const j = await act({ action: 'answer', answer })
                  if (j !== null) { setGraded({ graded: j.graded, note: j.gradedNote }); await load() }
                }}>
                답 제출
              </button>
              <button style={{ ...btn, marginLeft: 8 }} onClick={() => setPhase('axis')}>
                막혔어요
              </button>
            </div>
            {graded !== null && (
              <p style={{ marginBottom: 0 }}>
                채점: <b>{graded.graded ?? '판정 없음'}</b>
                {graded.note !== null && <span style={{ color: '#666' }}> — {graded.note}</span>}
              </p>
            )}
          </div>

          {/* ── 막힌 지점 ────────────────────────────────────── */}
          {phase === 'axis' && (
            <div style={BOX}>
              <h2 style={h2}>어디서 막혔나요?</h2>
              {(Object.keys(AXIS_LABEL) as AxisCode[]).map((a) => (
                <button key={a} style={{ ...btn, display: 'block', marginBottom: 6, width: '100%', textAlign: 'left' }}
                  onClick={async () => {
                    const j = await act({ action: 'stuck', axis: a })
                    if (j !== null) { setHelp(j.help); setPhase('help'); await load() }
                  }}>
                  {AXIS_LABEL[a]}
                </button>
              ))}
              <button style={{ ...btn, display: 'block', width: '100%', textAlign: 'left' }}
                onClick={async () => {
                  const j = await act({ action: 'stuck', axis: null })
                  if (j !== null) { setHelp(j.help); setPhase('help'); await load() }
                }}>
                어디서 막혔는지 모르겠어요
              </button>
            </div>
          )}

          {/* ── 도움 ─────────────────────────────────────────── */}
          {phase === 'help' && help !== null && (
            <HelpPanel help={help} cur={cur} onDone={load}
              onBack={() => { setPhase('source'); setAnswer(''); setGraded(null) }} />
          )}

          {/* ── 저장된 기록 ──────────────────────────────────── */}
          <div style={BOX}>
            <h2 style={h2}>서버에 저장된 이 시도</h2>
            <p style={{ fontSize: 12, color: '#666', marginTop: 0 }}>
              새로고침하거나 나갔다 다시 들어와도 아래 값은 서버에서 다시 읽힙니다.
            </p>
            <pre style={pre}>{JSON.stringify(curEntry.attempt, null, 2)}</pre>
          </div>
        </>
      )}
    </main>
  )
}

// ════════════════════════════════════════════════════════════════════

function HelpPanel({ help, cur, onDone, onBack }: {
  help: Help
  cur: { taskId: string; problemId: string }
  onDone: () => Promise<void>
  onBack: () => void
}) {
  const a = help.preview.recommendedAction
  const [note, setNote] = useState('')
  const [confirmAnswer, setConfirmAnswer] = useState<Record<string, string>>({})
  const [confirmResult, setConfirmResult] = useState<Record<string, string>>({})

  async function send(payload: Record<string, unknown>) {
    return sendAction({ ...payload, ...cur }, setNote)
  }

  return (
    <div style={{ ...BOX, borderColor: '#8fb3ff' }}>
      <h2 style={h2}>도움</h2>
      <p style={{ fontSize: 13, color: '#444', marginTop: 0 }}>{a.reason}</p>

      {a.kind === 'teacher_async' && (
        <div>
          <p style={{ color: '#a33' }}>
            지금 이 문항에 쓸 수 있는 승인된 도움이 없습니다.
          </p>
          {a.fallbackTasks.length === 0 ? (
            <p style={{ fontWeight: 600 }}>대체 자산 없음 — 지금 열 수 있는 다른 과제가 없습니다.</p>
          ) : (
            <div>
              <div style={{ fontSize: 13, marginBottom: 6 }}>이미 배정돼 열려 있는 과제로 갑니다:</div>
              {a.fallbackTasks.map((t) => (
                <a key={t.taskRef} href={t.href} style={{ ...btn, marginRight: 6, textDecoration: 'none' }}>
                  {t.label}
                </a>
              ))}
            </div>
          )}
        </div>
      )}

      {help.asset !== null && (
        <div>
          <div style={{ fontWeight: 600 }}>
            <MathText text={help.asset.title} />
            <Tag text={help.asset.provenance === 'demo' ? '시연 자산' : '운영 자산'} />
            {help.asset.videoKind !== null && <Tag text={`영상 종류 ${help.asset.videoKind}`} />}
          </div>

          {/*
            045 §3 — **유튜브 주소를 HTML `<video src>` 에 넣지 않는다.**
            운영 영상은 유튜브다. 그 주소를 `<video>` 에 꽂으면 재생되지 않는데
            「실영상 재생 지원」처럼 보인다. 그래서 서버가 `media` 를 정해 보내고
            화면은 그것만 본다 — 재생기를 화면이 추측하지 않는다.
            유튜브 재생기는 **구간 관측을 아직 못 한다** (iframe 안의 재생을 셀 수 없다).
            그 사실을 숨기지 않고 화면에 적는다.
          */}
          {help.asset.media === 'youtube' && help.asset.youtubeId !== null && (
            <YouTubeHelp
              youtubeId={help.asset.youtubeId}
              title={help.asset.title}
              segment={a.segment ?? null}
              onOpened={async (po) => {
                // R042-01 — **같은 봉투**로 보낸다. 성공해야 true
                const r = await sendAction(
                  { action: 'help', relationId: a.relationId, observation: po.observation, ...cur },
                  setNote,
                  { actionId: po.actionId, occurredAt: po.occurredAt },
                )
                await onDone()
                return r !== null
              }} />
          )}

          {help.asset.media === 'file' && help.asset.src !== null && (
            <SegmentPlayer src={help.asset.src} segment={a.segment ?? null}
              resumeRanges={help.resumeRanges ?? []}
              onObserved={async (po) => {
                // R042-01 — **같은 봉투**로 보낸다. 성공해야 true
                const r = await sendAction(
                  { action: 'help', relationId: a.relationId, observation: po.observation, ...cur },
                  setNote,
                  { actionId: po.actionId, occurredAt: po.occurredAt },
                )
                await onDone()
                return r !== null
              }} />
          )}

          {help.asset.media === 'text' && (
            <div>
              <div style={{ ...pre, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.8 }}>
                <MathText text={help.asset.body} />
              </div>
              <button style={btn}
                onClick={async () => {
                  await send({
                    action: 'help', relationId: a.relationId,
                    // 042 §3-B — 재지 않은 `0초` 를 만들지 않는다.
                    // 카드는 재생이 없으므로 **학생이 읽었다고 말한 것**으로만 남긴다
                    observation: { method: 'self_report' },
                  })
                  await onDone()
                }}>
                읽었습니다 (시간은 재지 않습니다 — 본인이 말한 것으로만 남습니다)
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 확인 행동 ─────────────────────────────────────── */}
      {help.preview.confirmAction !== null && (
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid #e3e6ea' }}>
          <div style={{ fontWeight: 600 }}>확인 행동 — {help.preview.confirmAction.label}</div>
          {help.preview.confirmAction.items.map((it) => (
            <div key={it.itemRef} style={{ marginTop: 10 }}>
              <div style={{ fontSize: 14 }}>
                <MathText text={it.prompt} /><Tag text={it.origin === 'demo' ? '시연 항목' : '운영 항목'} />
              </div>
              {/*
                045 이어서 — **운영 확인 문항은 본문이 그림이다.**
                그림을 안 그리면 「문항 102」라는 글자만 뜨고 문제를 볼 수 없다.
                주소는 서버가 서명해 준 것만 쓴다 (경로는 학생에게 오지 않는다).
              */}
              {it.imageUrl != null && (
                <img src={it.imageUrl} alt={`확인 문항 ${it.itemRef}`}
                  style={{ maxWidth: '100%', marginTop: 6, border: '1px solid #e5e7eb', borderRadius: 6 }} />
              )}
              {it.imageUrl == null && it.prompt.startsWith('문항 ') && (
                <p style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
                  이 확인 문항의 그림을 불러오지 못했습니다. 선생님께 알려 주세요
                  — 빈 화면을 「문항 없음」으로 넘기지 않습니다.
                </p>
              )}
              {it.choices === null ? (
                <input value={confirmAnswer[it.itemRef] ?? ''}
                  onChange={(e) => setConfirmAnswer({ ...confirmAnswer, [it.itemRef]: e.target.value })}
                  style={{ padding: 6, border: '1px solid #ccc', borderRadius: 6, marginRight: 6 }} />
              ) : (
                it.choices.map((c) => (
                  <button key={c} onClick={() => setConfirmAnswer({ ...confirmAnswer, [it.itemRef]: c })}
                    style={{ ...btn, marginRight: 6, marginTop: 4,
                             background: confirmAnswer[it.itemRef] === c ? '#e8f0ff' : '#f6f7f9' }}>
                    <MathText text={c} />
                  </button>
                ))
              )}
              <button style={{ ...btnPrimary, marginLeft: 6, marginTop: 4 }}
                onClick={async () => {
                  const j = await send({
                    action: 'confirm', itemRef: it.itemRef, answer: confirmAnswer[it.itemRef] ?? '',
                  })
                  if (j !== null) {
                    setConfirmResult({
                      ...confirmResult,
                      [it.itemRef]: j.graded === null ? String(j.gradedNote) : String(j.graded),
                    })
                    await onDone()
                  }
                }}>
                제출
              </button>
              {confirmResult[it.itemRef] !== undefined && (
                <span style={{ marginLeft: 8, fontWeight: 600 }}>{confirmResult[it.itemRef]}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── 막아 둔 것 ────────────────────────────────────── */}
      {help.blocked.length > 0 && (
        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>
            보이지 않는 자료 {help.blocked.length}개와 그 이유
          </summary>
          <ul style={{ fontSize: 13, color: '#555' }}>
            {help.blocked.map((b) => (
              <li key={b.relationId}><b><MathText text={b.title} /></b> — {b.why}</li>
            ))}
          </ul>
        </details>
      )}

      {/* ── 근거 ──────────────────────────────────────────── */}
      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13 }}>지금까지 관측된 것 / 확정하지 않은 것</summary>
        <div style={{ fontSize: 13 }}>
          <p><b>관측됨</b></p>
          <ul>{help.preview.evidence.observed.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><b>미측정·미확인</b></p>
          <ul>{help.preview.evidence.unknownScope.map((x) => <li key={x}>{x}</li>)}</ul>
          <p><b>확정하지 않음</b> — {help.preview.evidence.notClaimed.join(' · ')}</p>
          <p><b>도움 뒤에 무엇이 됐나</b> — 합치지 않고 따로 봅니다</p>
          <ul>
            <li>확인 행동: {label3(help.preview.evidence.outcomes.confirmPassed, '맞음', '아직 못 맞힘', '아직 안 냄')}</li>
            <li>도움 뒤 원문: {label3(help.preview.evidence.outcomes.sourceSolvedAfterHelp, '정답', '오답', '해당 제출 없음')}</li>
            <li>시간차 재확인: {label3(help.preview.evidence.outcomes.delayedRecheckPassed, '통과', '실패', '아직 안 함')}</li>
            <li>숙달: 판정하지 않음</li>
          </ul>
          <ul style={{ color: '#666' }}>
            {help.preview.evidence.outcomes.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </div>
      </details>

      {note && <p style={{ color: '#c00' }}>{note}</p>}

      <div style={{ marginTop: 14 }}>
        <button style={btnPrimary} onClick={onBack}>원문으로 돌아가기</button>
        <span style={{ marginLeft: 10, fontSize: 12, color: '#666' }}>
          복귀 경로: {help.preview.returnPath}
        </span>
      </div>
    </div>
  )
}

/**
 * 구간 플레이어 — 042 §3-C
 *
 * 세 가지를 지킨다
 *   ① **구간 밖으로 못 간다.** 시작 전·끝 뒤로 옮기면 되돌리고, 끝에 닿으면 멈춘다.
 *      승인 구간과 실제 재생의 **교집합만** 센다. (서버도 한 번 더 자른다 — 화면만 믿지 않는다)
 *   ② **버튼을 누르지 않아도 남는다.** 멈출 때·탭을 떠날 때·10초마다 저장한다.
 *      학생에게 「기록하기」를 시키지 않는다.
 *   ③ **이어서 센다.** 나갔다 다시 들어오면 전에 본 구간(`resumeRanges`)부터 쌓는다.
 *
 * 시청 판정은 main 의 플레이어가 쓰는 `mergeRanges` · `coveredSeconds` · `COMPLETE_PCT` 를
 * **그대로** 쓴다. 건너뛴 구간은 세지 않는다 (2.5초 넘게 뛰면 버린다).
 */
/**
 * 유튜브 도움 — **열었다는 사실과 창이 열려 있던 시간만** 기록한다 (045 이어서)
 *
 * 왜 따로 있나
 *   운영 영상은 유튜브다. iframe 안의 재생은 이 화면이 **셀 수 없다** — 몇 초를 봤는지,
 *   건너뛰었는지, 끝까지 봤는지 알 길이 없다. 그런데 「도움을 열었다」는 사실 자체는
 *   학습 기록에 필요하다 (도움 뒤 재풀이를 가려내는 근거다).
 *
 * 그래서 **재지 못하는 것을 만들지 않고** 재는 것만 보낸다.
 *   보내는 것   `method: 'window_elapsed'` + `windowElapsedMs` (창이 열려 있던 시간)
 *   보내지 않는 것  `coveragePct` · `coveredSeconds` · `completed` · `watchedRanges`
 *
 * 서버의 `unmeasuredOf()` 가 `coverage_pct` · `covered_seconds` 를 **미측정**으로 적고,
 * `outcomesAfterHelp` 가 `helpUnmeasured: true` 로 남긴다. 「0초 봤다」가 만들어지지 않는다.
 *
 * 구간은 유튜브의 `start`·`end` 매개변수로 **보여 주기만** 한다. 그것이 지켜졌다는
 * 보장이 아니므로 관측으로 쓰지 않는다 — 학생이 재생기 안에서 구간 밖으로 갈 수 있다.
 */
function YouTubeHelp({ youtubeId, title, segment, onOpened }: {
  youtubeId: string
  title: string
  segment: { startSeconds: number; endSeconds: number; sceneNo?: number } | null
  /** 서버가 받았으면 true. **false 면 저장된 것이 아니다** (R042-01) */
  onOpened: (p: PendingObservation) => Promise<boolean>
}) {
  const openedAt = useRef<number>(Date.now())
  const [openMs, setOpenMs] = useState(0)
  const [saved, setSaved] = useState<string | null>(null)
  /** 같은 봉투로만 다시 보낸다 (R042-01) */
  const pending = useRef<PendingObservation | null>(null)

  useEffect(() => {
    openedAt.current = Date.now()
    const t = setInterval(() => setOpenMs(Date.now() - openedAt.current), 1000)
    return () => clearInterval(t)
  }, [youtubeId])

  async function record() {
    if (pending.current === null) {
      pending.current = {
        actionId: newActionId(),
        occurredAt: new Date().toISOString(),
        // **창이 열려 있던 시간만.** 재생 시간이 아니다
        observation: { method: 'window_elapsed', windowElapsedMs: Date.now() - openedAt.current },
      }
    }
    const ok = await onOpened(pending.current)
    // 성공해야 내린다. 실패하면 **같은 봉투를 들고 있는다**
    if (ok) { pending.current = null; setSaved(new Date().toLocaleTimeString('ko-KR')) }
    else setSaved(null)
  }

  const src = `https://www.youtube-nocookie.com/embed/${youtubeId}`
    + (segment !== null
      ? `?start=${Math.floor(segment.startSeconds)}&end=${Math.ceil(segment.endSeconds)}`
      : '')

  return (
    <div>
      <iframe
        width={320} height={180} src={src} title={title}
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ border: '1px solid #e5e7eb', borderRadius: 6 }}
      />
      <div style={{ marginTop: 6 }}>
        <button style={btn} onClick={() => void record()}>
          봤습니다 — 열려 있던 시간만 기록합니다 ({Math.round(openMs / 1000)}초)
        </button>
        {saved !== null && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#166534' }}>
            {saved} 에 서버가 받았습니다
          </span>
        )}
        {pending.current !== null && saved === null && (
          <span style={{ marginLeft: 8, fontSize: 12, color: '#c00' }}>
            저장 안 됨 — 다시 누르면 **같은 기록으로** 보냅니다 (두 번 반영되지 않습니다)
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: '#b45309', marginTop: 4 }}>
        이 재생기는 <b>몇 초를 봤는지 재지 못합니다</b> (유튜브 안의 재생은 셀 수 없습니다).
        그래서 재생 비율·본 초를 <b>만들지 않고</b>, 창이 열려 있던 시간만 남깁니다.
        선생님 요약에도 「도움 관측 없음」으로 표시됩니다.
        {segment !== null && ' 구간은 보여 주기만 하며, 지켜졌다는 보장으로 쓰지 않습니다.'}
      </div>
    </div>
  )
}

function SegmentPlayer({ src, segment, resumeRanges, onObserved }: {
  src: string
  segment: { startSeconds: number; endSeconds: number; sceneNo?: number } | null
  resumeRanges: Array<[number, number]>
  /** 서버가 받았으면 true. **false 면 저장된 것이 아니다** (R042-01) */
  onObserved: (p: PendingObservation) => Promise<boolean>
}) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const ranges = useRef<[number, number][]>([])
  const lastT = useRef<number | null>(null)
  const focusLost = useRef(0)
  const dirty = useRef(false)
  const saving = useRef(false)
  /** 보냈지만 **서버가 확인하지 않은** 관측 1건. 다시 보낼 때 이것을 그대로 쓴다 */
  const pending = useRef<PendingObservation | null>(null)
  /** 반복 재생까지 합친 총 재생 초 (unique coverage 와 다른 척도) */
  const played = useRef(0)
  const [pct, setPct] = useState(0)
  const [covered, setCovered] = useState(0)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState(false)

  const start = segment === null ? 0 : segment.startSeconds
  const end = segment === null ? null : segment.endSeconds
  const span = end === null ? 0 : end - start

  // 영상·구간이 바뀌면 **처음부터.** 다른 영상의 관측이 섞이면 안 된다
  const key = `${src}|${start}|${String(end)}`
  const loadedKey = useRef<string | null>(null)
  if (loadedKey.current !== key) {
    loadedKey.current = key
    ranges.current = mergeRanges(resumeRanges.map(([a, b]) => [a, b] as [number, number]))
    lastT.current = null
    focusLost.current = 0
    played.current = 0
    pending.current = null        // 다른 영상의 미확정을 끌고 가지 않는다
  }

  const recompute = useCallback(() => {
    const cov = coveredSeconds(ranges.current)
    setCovered(cov)
    const v = ref.current
    const total = span > 0 ? span : (v?.duration ?? 0)
    setPct(total > 0 ? Math.min(100, Math.round((cov / total) * 1000) / 10) : 0)
  }, [span])

  /**
   * 042 §2-A (R042-01) — **서버가 받았다고 해야** 「저장됨」이다.
   *
   * 전에는 보내기 전에 `dirty=false` 로 두고, 서버가 거절해도 `savedAt` 을 찍었다.
   * 그래서 400·403·409·500·망 끊김이 전부 **저장 완료처럼** 보였다.
   *
   * 지금은
   *   · 확인 전에는 `dirty` 를 내리지 않는다
   *   · 실패하면 **미확정 관측**(`pending`)을 그대로 들고 있다가
   *     다음 저장 때 **같은 actionId·occurredAt·내용**으로 다시 보낸다
   *   · 화면에 「저장 안 됨」을 분명히 적는다
   *
   * 새 큐 제품을 만들지 않는다 — 이 화면의 **미확정 1건**만 들고 있는다.
   */
  const save = useCallback(async () => {
    if (saving.current) return
    if (!dirty.current && pending.current === null) return
    saving.current = true
    try {
      // 미확정이 있으면 **그것을 그대로** 다시 보낸다. 새로 만들지 않는다
      let body = pending.current
      if (body === null) {
        const cov = coveredSeconds(ranges.current)
        const total = span > 0 ? span : (ref.current?.duration ?? 0)
        const p = total > 0 ? Math.min(100, Math.round((cov / total) * 1000) / 10) : 0
        body = {
          actionId: newActionId(),
          occurredAt: new Date().toISOString(),
          observation: {
            method: 'player_coverage',
            coveragePct: p,
            coveredSeconds: cov,
            // 반복 재생까지 합친 총 재생 초. unique coverage 와 **다른 척도**다 (R042-03)
            playedSeconds: Math.round(played.current),
            focusLostSeconds: Math.round(focusLost.current),
            sceneSeconds: segment?.sceneNo === undefined ? undefined : { [String(segment.sceneNo)]: cov },
            watchedRanges: ranges.current.map(([a, b]) => [Math.round(a * 10) / 10, Math.round(b * 10) / 10]),
          },
        }
        pending.current = body
        dirty.current = false        // 이 내용은 봉투에 담겼다. 그 뒤 재생분만 다시 dirty 가 된다
      }
      const ok = await onObserved(body)
      if (ok) {
        pending.current = null
        setSavedAt(new Date().toLocaleTimeString())
        setSaveError(null)
      } else {
        // 확정되지 않았다. 봉투를 들고 있다가 다음 기회에 **같은 것**을 보낸다
        setSaveError('저장되지 않았습니다 — 들고 있다가 다시 보냅니다')
      }
    } catch {
      setSaveError('보내지 못했습니다 — 들고 있다가 다시 보냅니다')
    } finally {
      saving.current = false
    }
  }, [onObserved, segment, span])

  // ① 구간 밖으로 나가면 되돌린다
  useEffect(() => {
    const v = ref.current
    if (v === null) return
    const clamp = (): void => {
      const t = v.currentTime
      if (t < start - 0.25) { v.currentTime = start; setBlocked(true); return }
      if (end !== null && t > end + 0.25) { v.currentTime = end; v.pause(); setBlocked(true); return }
      setBlocked(false)
    }
    v.addEventListener('seeked', clamp)
    return () => v.removeEventListener('seeked', clamp)
  }, [start, end])

  // ② 0.5초마다 센다 · 10초마다 저장한다
  useEffect(() => {
    let tick = 0
    const t = setInterval(() => {
      const v = ref.current
      if (v === null || v.paused || v.ended) { lastT.current = null; return }
      const now = v.currentTime
      if (end !== null && now >= end) { v.pause(); lastT.current = null; void save(); return }
      const prev = lastT.current
      lastT.current = now
      if (prev === null) return
      const dt = now - prev
      if (dt <= 0 || dt > 2.5) return                       // 건너뛴 것은 안 셈
      // 승인 구간과의 **교집합만** 센다
      const a = Math.max(prev, start)
      const b = end === null ? now : Math.min(now, end)
      if (b <= a) return
      ranges.current = mergeRanges([...ranges.current, [a, b]])
      played.current += b - a                       // 겹쳐 봐도 더한다
      if (document.hidden) focusLost.current += b - a
      dirty.current = true
      recompute()
      tick += 1
      if (tick % 20 === 0) void save()                      // 0.5초 × 20 = 10초
    }, 500)
    return () => clearInterval(t)
  }, [start, end, save, recompute])

  // 멈출 때·탭을 떠날 때·화면을 벗어날 때 저장한다
  useEffect(() => {
    const v = ref.current
    const onPause = (): void => { void save() }
    const onHide = (): void => { if (document.hidden) void save() }
    v?.addEventListener('pause', onPause)
    v?.addEventListener('ended', onPause)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      v?.removeEventListener('pause', onPause)
      v?.removeEventListener('ended', onPause)
      document.removeEventListener('visibilitychange', onHide)
      void save()
    }
  }, [save])

  useEffect(() => { recompute() }, [recompute])

  const done = pct >= COMPLETE_PCT

  return (
    <div>
      <video ref={ref} src={src} controls width={320} height={180} preload="metadata"
        onLoadedMetadata={() => {
          const v = ref.current
          if (v === null) return
          // 이어보기: 전에 본 데가 있으면 그 끝에서, 없으면 구간 시작에서
          const last = ranges.current.length > 0 ? ranges.current[ranges.current.length - 1][1] : start
          v.currentTime = end === null ? last : Math.min(Math.max(last, start), end)
        }}
        style={{ display: 'block', background: '#000', marginTop: 8 }} />
      <div style={{ fontSize: 13, marginTop: 6 }}>
        {segment === null
          ? '영상 통째'
          : `구간 ${start}–${end}초${segment.sceneNo !== undefined ? ` (장면 ${segment.sceneNo})` : ''}`}
        {' · '}재생 {pct}% · 서로 다른 재생 {covered}초 · 탭 전환 중 {Math.round(focusLost.current)}초
        {' · '}{done ? `${COMPLETE_PCT}% 넘김` : `${COMPLETE_PCT}% 넘기면 시청 완료`}
      </div>
      <div style={{ fontSize: 12, color: '#666' }}>
        {saveError !== null
          ? <span style={{ color: '#c00', fontWeight: 600 }}>{saveError}</span>
          : (savedAt === null ? '아직 저장 전 — 보기 시작하면 자동으로 남습니다' : `자동 저장됨 ${savedAt}`)}
        {blocked && <span style={{ color: '#a33' }}> · 승인된 구간 밖으로는 갈 수 없습니다</span>}
      </div>
    </div>
  )
}
function Banner({ storage, note }: { storage?: { backend: string; location: string }; note: string | null }) {
  return (
    <div style={{ background: '#fff8e1', border: '1px solid #e8d9a0', borderRadius: 8,
                  padding: '10px 12px', marginBottom: 16, fontSize: 12, lineHeight: 1.6 }}>
      <b>시험 저장소입니다 — 운영 DB 가 아닙니다.</b><br />
      저장 위치: {storage?.backend ?? '?'} · {storage?.location ?? '?'}
      {note !== null && <><br />{note}</>}
    </div>
  )
}

function Tag({ text }: { text: string }) {
  return (
    <span style={{ marginLeft: 6, fontSize: 11, background: '#eef1f4', color: '#444',
                   border: '1px solid #dadde1', borderRadius: 4, padding: '1px 5px' }}>
      {text}
    </span>
  )
}

const h2: React.CSSProperties = { fontSize: 15, margin: '0 0 10px' }
const btn: React.CSSProperties = {
  padding: '6px 10px', border: '1px solid #c8ccd2', borderRadius: 6,
  background: '#f6f7f9', cursor: 'pointer', fontSize: 13, color: '#222',
}
const btnPrimary: React.CSSProperties = { ...btn, background: '#2b6cb0', color: '#fff', borderColor: '#2b6cb0' }
const pre: React.CSSProperties = {
  background: '#f6f7f9', border: '1px solid #e3e6ea', borderRadius: 6, padding: 10,
  fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: '8px 0',
}
