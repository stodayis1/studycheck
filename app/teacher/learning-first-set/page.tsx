'use client'

/**
 * 첫 세트 확인 — 원문 · 영상 · 확인 문제를 **한 화면에서 같이** 본다 (원장 전용)
 *
 * 왜 있나
 *   질문 웹앱의 첫 시범은 유형 2개 · 문항 최대 10개 · 영상 최대 3편으로 좁혀 둔 범위다.
 *   그 영상이 학생에게 나가려면 「이 영상을 이 원문에 보여도 답이 드러나지 않는가」를
 *   사람이 판단해야 한다. 그 판단을 **여기서 눌러서** 하고, 화면이 승인 명세를 만든다.
 *   **원장님이 JSON 을 손으로 쓰지 않는다.**
 *
 * 무엇을 누르면 되나
 *   ① 왼쪽에서 원문을 고른다 (그림이 그대로 보인다)
 *   ② 가운데에서 영상을 고른다 (유튜브 재생기로 바로 본다. 장면 초가 쓸 수 있으면 구간으로)
 *   ③ 「이 원문에 보여도 답이 안 드러난다」를 고르고
 *   ④ 오른쪽에서 **확인 문제**를 고른다 (같은 세트의 **다른** 문항만 고를 수 있다)
 *   ⑤ 「승인 명세 만들기」를 누른다
 *
 * 안 하는 것
 *   이 화면은 **운영 DB 에 쓰지 않는다.** 승인 명세 파일만 만든다.
 *   영상이 실제로 학생에게 붙는 것은 그 파일에 줄이 생긴 뒤다.
 */
import { useCallback, useEffect, useState } from 'react'

import { Header } from '@/components/common/Header'
import { MathText } from '@/components/MathText'
import { useAuth } from '@/hooks/useAuth'
import { learningFetch } from '@/lib/learning/clientFetch'

const NAVY = '#0f3460'

type ProblemForReview = {
  problemId: string
  typeCode: string
  localNo: string | null
  book: string | null
  stem: string
  choices: string[] | null
  answerKind: string
  answer: string
  imageUrl: string | null
  hasAnswerImage: boolean
  autoGradable: boolean
}

type SceneForReview = {
  sceneNo: number
  label: string | null
  rawStart: unknown
  rawEnd: unknown
  usable: { startSeconds: number; endSeconds: number } | null
}

type Readiness = {
  assetExists: string
  playbackVerified: string
  studentAccess: string
  exposureReviewed: string
  confirmItemsReady: string
}

type VideoForReview = {
  assetId: string
  title: string
  videoKind: string | null
  durationSeconds: number | null
  youtubeId: string | null
  typeCodes: string[]
  scenes: SceneForReview[]
  readiness: Readiness | null
}

type RelationSpec = {
  relationId: string
  problemId: string
  assetId: string
  assetVersion: number
  relationKind: string
  videoKind: string | null
  supportedAxes: string[]
  segment?: { startSeconds: number; endSeconds: number; sceneNo?: number }
  wholeFileSafe: boolean
  confirmProblemIds: string[]
  exposure: { verdict: string; reviewedBy: string; reviewedAt: string }
  evidence: string
}

type Payload = {
  ok: boolean
  mode?: string
  contentSource?: string
  note?: string
  error?: string
  why?: string
  scope?: { typeCodes: readonly string[]; maxProblems: number; maxVideos: number }
  types?: Array<{ typeCode: string; title: string; chapter?: string }>
  problems?: ProblemForReview[]
  videos?: VideoForReview[]
  spec?: { specVersion: string; specNote: string; relations: RelationSpec[]; problemRoles: unknown[] }
  specPath?: string
}

const KIND_OF: Record<string, string> = {
  concept: 'concept_explanation',
  worked_example: 'type_demonstration',
  proof: 'theorem_proof',
}

const STATE_LABEL: Record<string, string> = { yes: '그렇다', no: '아니다', unknown: '모름' }

export default function LearningFirstSetPage() {
  const { isAdmin, loading: authLoading, currentUser } = useAuth()
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  const [problemId, setProblemId] = useState<string | null>(null)
  const [assetId, setAssetId] = useState<string | null>(null)
  const [sceneNo, setSceneNo] = useState<number | null>(null)
  const [wholeFileSafe, setWholeFileSafe] = useState(false)
  const [verdict, setVerdict] = useState<'safe' | 'reveals' | 'unknown'>('unknown')
  const [confirmIds, setConfirmIds] = useState<string[]>([])
  const [evidence, setEvidence] = useState('')
  const [draft, setDraft] = useState<RelationSpec[]>([])
  const [result, setResult] = useState<{ ok: boolean; msg: string; text?: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await learningFetch('/api/learning/first-set', { cache: 'no-store' })
      const j = (await r.json()) as Payload
      setData(j)
      if (j.spec?.relations) setDraft(j.spec.relations)
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  if (authLoading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!isAdmin()) {
    return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>
  }
  if (loading) return <Shell><div className="p-10 text-center text-gray-400">첫 세트를 읽는 중…</div></Shell>
  if (data === null || data.ok !== true) {
    return (
      <Shell>
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-5">
          <p className="font-bold text-red-900">{data?.error ?? '첫 세트를 읽지 못했습니다'}</p>
          {data?.why && <p className="mt-1 text-sm text-red-800">{data.why}</p>}
          <button onClick={() => void load()}
            className="mt-3 rounded-lg border px-3 py-1.5 text-sm">다시 시도</button>
        </div>
      </Shell>
    )
  }

  const problems = data.problems ?? []
  const videos = data.videos ?? []
  const problem = problems.find((p) => p.problemId === problemId) ?? null
  const video = videos.find((v) => v.assetId === assetId) ?? null
  const scene = video?.scenes.find((s) => s.sceneNo === sceneNo) ?? null
  // 확인 문제는 **같은 세트의 다른 문항**만. 원문 자신은 못 고른다 (독립 확인이 아니다)
  const confirmable = problems.filter((p) => p.problemId !== problemId)

  const canAdd = problem !== null && video !== null && evidence.trim() !== ''
    && (scene?.usable != null || wholeFileSafe)

  function addRelation() {
    if (problem === null || video === null) return
    const seg = scene?.usable ?? null
    const spec: RelationSpec = {
      relationId: `ops-${video.assetId}-${problem.problemId}`,
      problemId: problem.problemId,
      assetId: video.assetId,
      assetVersion: 1,
      relationKind: KIND_OF[video.videoKind ?? 'concept'] ?? 'concept_explanation',
      videoKind: video.videoKind,
      supportedAxes: ['recall', 'formulate'],
      wholeFileSafe,
      confirmProblemIds: confirmIds,
      exposure: {
        verdict,
        reviewedBy: currentUser?.name ? `${currentUser.name} (원장 전용 검수 화면)` : '원장 전용 검수 화면',
        reviewedAt: new Date().toISOString(),
      },
      evidence: evidence.trim(),
    }
    if (seg !== null) {
      spec.segment = { startSeconds: seg.startSeconds, endSeconds: seg.endSeconds, sceneNo: scene.sceneNo }
    }
    setDraft([...draft.filter((d) => d.relationId !== spec.relationId), spec])
    setResult(null)
  }

  async function save() {
    const r = await learningFetch('/api/learning/first-set', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        spec: {
          specVersion: `045.${new Date().toISOString().slice(0, 10)}`,
          specNote: '원장 전용 검수 화면에서 만든 승인 명세. 이 파일에 적힌 것만 학생에게 나간다.',
          problemRoles: problems.map((p) => ({
            problemId: p.problemId,
            role: draft.some((d) => d.confirmProblemIds.includes(p.problemId)) ? 'confirm' : 'source',
          })),
          relations: draft,
        },
      }),
    })
    const j = await r.json() as { ok?: boolean; written?: boolean; note?: string; text?: string; why?: string; error?: string }
    if (j.ok !== true) { setResult({ ok: false, msg: `${j.error ?? '실패'} — ${j.why ?? ''}` }); return }
    setResult({ ok: true, msg: String(j.note ?? ''), text: j.written === true ? undefined : j.text })
    if (j.written === true) await load()
  }

  return (
    <Shell>
      <div className="p-4 space-y-4">
        {/* 범위·출처 */}
        <div className="rounded-xl border bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
              style={{ background: data.contentSource === 'supabase' ? NAVY : '#9ca3af' }}>
              {data.contentSource === 'supabase' ? '운영 조회' : '시연 자료'}
            </span>
            <span className="text-gray-600">
              유형 {data.scope?.typeCodes.join(' · ')} · 문항 {problems.length}/{data.scope?.maxProblems}
              {' · '}영상 {videos.length}/{data.scope?.maxVideos}
            </span>
          </div>
          <p className="mt-2 text-gray-700">{data.note}</p>
          <p className="mt-1 text-xs text-gray-500">
            승인 명세: <code>{data.specPath}</code> · 지금 들어 있는 관계 {data.spec?.relations.length ?? 0}건
            {(data.spec?.relations.length ?? 0) === 0
              && ' — 비어 있습니다. 그래서 지금은 영상이 학생에게 나가지 않습니다.'}
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* ① 원문 */}
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-bold" style={{ color: NAVY }}>① 원문</h2>

            {/*
              고른 문항을 **목록보다 위에** 둔다. 전에는 목록 10개 아래에 있어서
              무엇을 골랐는지 보려면 끝까지 내려가야 했다 — 원문·영상·확인문제를
              「같이 본다」는 이 화면의 뜻이 반감된다 (원장님 2026-10-30).
            */}
            {problem === null && (
              <p className="mb-2 rounded-lg border border-dashed bg-gray-50 p-3 text-xs text-gray-500">
                아래에서 문항을 고르면 여기에 문제 그림과 정답이 보입니다.
              </p>
            )}
            {problem !== null && (
              <div className="mb-3 rounded-lg border-2 bg-gray-50 p-3" style={{ borderColor: NAVY }}>
                <div className="mb-1 text-xs font-bold" style={{ color: NAVY }}>
                  고른 원문 · {problem.typeCode} · {problem.book ?? ''} {problem.localNo ?? problem.problemId}번
                </div>
                {problem.stem !== '' && <p className="text-sm"><MathText text={problem.stem} /></p>}
                {problem.imageUrl !== null && (
                  <img src={problem.imageUrl} alt={`문항 ${problem.problemId}`}
                    className="mt-2 w-full rounded border" />
                )}
                {problem.stem === '' && problem.imageUrl === null && (
                  <p className="text-xs text-amber-700">
                    그림을 불러오지 못했습니다. 빈 화면을 「문항 없음」으로 넘기지 않습니다.
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-700">
                  <b>정답</b> <code>{problem.answer}</code>
                  <span className="ml-1 text-gray-500">
                    — 노출 검수 판단용입니다. 학생 경로로는 나가지 않습니다.
                  </span>
                </p>
              </div>
            )}

            {/* 목록은 접어 둔다 — 길어서 아래 칸을 밀어내지 않게 */}
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {problems.map((p) => (
                <button key={p.problemId} onClick={() => { setProblemId(p.problemId); setConfirmIds([]) }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    problemId === p.problemId ? 'border-blue-400 bg-blue-50' : 'bg-gray-50'}`}>
                  <div className="font-semibold">
                    {p.typeCode} · {p.book ?? ''} {p.localNo ?? p.problemId}번
                  </div>
                  <div className="text-xs text-gray-500">
                    {p.answerKind}
                    {p.hasAnswerImage && ' · 해설 그림 있음(주소는 만들지 않음)'}
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* ② 영상 */}
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-bold" style={{ color: NAVY }}>② 영상</h2>
            <div className="space-y-2">
              {videos.map((v) => (
                <button key={v.assetId} onClick={() => { setAssetId(v.assetId); setSceneNo(null) }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                    assetId === v.assetId ? 'border-blue-400 bg-blue-50' : 'bg-gray-50'}`}>
                  <div className="font-semibold">{v.title}</div>
                  <div className="text-xs text-gray-500">
                    {v.videoKind ?? '종류 없음'} · {v.durationSeconds ?? '?'}초 · 유형 {v.typeCodes.join(',')}
                  </div>
                </button>
              ))}
            </div>

            {video !== null && (
              <div className="mt-3">
                {video.youtubeId !== null ? (
                  <iframe
                    className="w-full rounded border" height={180}
                    src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}`
                      + (scene?.usable != null
                        ? `?start=${Math.floor(scene.usable.startSeconds)}&end=${Math.ceil(scene.usable.endSeconds)}`
                        : '')}
                    title={video.title}
                    allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin" />
                ) : (
                  <p className="text-xs text-amber-700">
                    이 영상에는 유튜브 식별값이 없습니다. 재생해 볼 수 없습니다.
                  </p>
                )}

                {video.readiness !== null && (
                  <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                    {([
                      ['자료 존재', video.readiness.assetExists],
                      ['재생 성공', video.readiness.playbackVerified],
                      ['과제 접근', video.readiness.studentAccess],
                      ['노출 검수', video.readiness.exposureReviewed],
                      ['확인문제', video.readiness.confirmItemsReady],
                    ] as const).map(([k, v]) => (
                      <span key={k} className="rounded border px-1.5 py-0.5"
                        style={{ background: v === 'yes' ? '#dcfce7' : v === 'no' ? '#fee2e2' : '#f3f4f6' }}>
                        {k} {STATE_LABEL[v] ?? v}
                      </span>
                    ))}
                  </div>
                )}

                <p className="mt-3 text-xs font-semibold text-gray-700">구간 (장면)</p>
                <div className="mt-1 space-y-1">
                  {video.scenes.length === 0 && (
                    <p className="text-xs text-gray-500">장면 기록이 없습니다.</p>
                  )}
                  {video.scenes.map((sc) => (
                    <button key={sc.sceneNo} disabled={sc.usable === null}
                      onClick={() => setSceneNo(sc.sceneNo)}
                      className={`w-full rounded border px-2 py-1 text-left text-xs ${
                        sceneNo === sc.sceneNo ? 'border-blue-400 bg-blue-50' : 'bg-gray-50'} ${
                        sc.usable === null ? 'opacity-50' : ''}`}>
                      {sc.sceneNo}. {sc.label ?? '(이름 없음)'}{' '}
                      {sc.usable !== null
                        ? `${sc.usable.startSeconds}–${sc.usable.endSeconds}초`
                        : `초를 쓸 수 없음 (받은 값 ${JSON.stringify(sc.rawStart)}–${JSON.stringify(sc.rawEnd)})`}
                    </button>
                  ))}
                </div>
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                  <input type="checkbox" checked={wholeFileSafe}
                    onChange={(e) => setWholeFileSafe(e.target.checked)} />
                  구간을 못 쓰더라도 <b>영상 전체</b>를 이 원문에 보여도 안전하다
                </label>
              </div>
            )}
          </section>

          {/* ③ 확인 문제 + 판정 */}
          <section className="rounded-xl border bg-white p-4">
            <h2 className="mb-2 font-bold" style={{ color: NAVY }}>③ 확인 문제 · 판정</h2>
            <p className="text-xs text-gray-600">
              같은 세트의 <b>다른</b> 문항만 고를 수 있습니다. 영상에서 답을 본 그 문항을
              다시 쓰면 독립 확인이 아닙니다.
            </p>
            <div className="mt-2 space-y-1">
              {confirmable.map((p) => (
                <label key={p.problemId}
                  className="flex items-start gap-2 rounded border bg-gray-50 px-2 py-1 text-xs">
                  <input type="checkbox" checked={confirmIds.includes(p.problemId)}
                    onChange={(e) => setConfirmIds(e.target.checked
                      ? [...confirmIds, p.problemId]
                      : confirmIds.filter((x) => x !== p.problemId))} />
                  <span>
                    {p.typeCode} · {p.book ?? ''} {p.localNo ?? p.problemId}번
                    {p.imageUrl !== null && (
                      <img src={p.imageUrl} alt="" className="mt-1 w-full rounded border" />
                    )}
                  </span>
                </label>
              ))}
              {confirmable.length === 0 && <p className="text-xs text-gray-500">고를 문항이 없습니다.</p>}
            </div>

            <p className="mt-3 text-xs font-semibold text-gray-700">
              이 영상을 이 원문에 보여도 <b>답이 드러나지 않는가</b>
            </p>
            <div className="mt-1 flex gap-1">
              {(['safe', 'reveals', 'unknown'] as const).map((v) => (
                <button key={v} onClick={() => setVerdict(v)}
                  className={`rounded border px-2 py-1 text-xs ${
                    verdict === v ? 'border-blue-400 bg-blue-50 font-bold' : 'bg-gray-50'}`}>
                  {v === 'safe' ? '안 드러난다' : v === 'reveals' ? '드러난다' : '모르겠다'}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-500">
              「드러난다」·「모르겠다」로 두면 그 관계는 질문 도움으로 쓰이지 않습니다.
            </p>

            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3}
              placeholder="무엇을 보고 그렇게 판단했는지 한 줄 (예: 구간 12–48초는 공식 유도만 나오고 답을 말하지 않는다)"
              className="mt-2 w-full rounded border p-2 text-xs" />

            <button onClick={addRelation} disabled={!canAdd}
              className="mt-2 w-full rounded-lg px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              style={{ background: NAVY }}>
              이 조합을 명세에 담기
            </button>
            {!canAdd && (
              <p className="mt-1 text-[11px] text-amber-700">
                원문·영상·근거를 채우고, 구간을 고르거나 「영상 전체 안전」을 켜야 담을 수 있습니다.
              </p>
            )}
          </section>
        </div>

        {/* 담은 것 + 저장 */}
        <section className="rounded-xl border bg-white p-4">
          <h2 className="mb-2 font-bold" style={{ color: NAVY }}>담은 관계 {draft.length}건</h2>
          {draft.length === 0 && (
            <p className="text-sm text-gray-500">아직 없습니다. 위에서 조합을 담아 주세요.</p>
          )}
          <div className="space-y-2">
            {draft.map((d) => (
              <div key={d.relationId} className="rounded-lg border bg-gray-50 p-2 text-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold">{d.relationId}</div>
                    <div className="text-gray-600">
                      원문 {d.problemId} · 영상 {d.assetId} ·{' '}
                      {d.segment
                        ? `구간 ${d.segment.startSeconds}–${d.segment.endSeconds}초`
                        : '구간 없음(전체 안전)'} · 판정 {d.exposure.verdict} ·
                      확인문제 {d.confirmProblemIds.length}개
                    </div>
                    <div className="text-gray-500">{d.evidence}</div>
                  </div>
                  <button onClick={() => setDraft(draft.filter((x) => x.relationId !== d.relationId))}
                    className="rounded border px-2 py-0.5">빼기</button>
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => void save()} disabled={draft.length === 0}
            className="mt-3 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            style={{ background: '#0F6E56' }}>
            승인 명세 만들기
          </button>
          <p className="mt-1 text-[11px] text-gray-500">
            이 버튼은 <b>운영 DB 에 쓰지 않습니다.</b> 승인 명세 파일만 만듭니다.
          </p>
          {result !== null && (
            <div className={`mt-3 rounded-lg border p-3 text-xs ${
              result.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
              <p className="font-semibold">{result.msg}</p>
              {result.text !== undefined && (
                <>
                  <p className="mt-2 text-gray-700">
                    아래 글자를 내려받아 저장소에 넣어야 반영됩니다 (원장님이 직접 쓰실 필요는 없습니다 —
                    내려받아 전달만 해 주세요).
                  </p>
                  <textarea readOnly value={result.text} rows={10}
                    className="mt-1 w-full rounded border p-2 font-mono text-[10px]" />
                  <button
                    onClick={() => {
                      const blob = new Blob([result.text ?? ''], { type: 'application/json' })
                      const a = document.createElement('a')
                      a.href = URL.createObjectURL(blob)
                      a.download = 'first-set.approval.json'
                      a.click()
                      URL.revokeObjectURL(a.href)
                    }}
                    className="mt-2 rounded border px-3 py-1">내려받기</button>
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="첫 세트 확인" subtitle="원문 · 영상 · 확인 문제를 같이 보고 승인합니다" showBack />
      <div className="max-w-[1400px] mx-auto">{children}</div>
    </div>
  )
}
