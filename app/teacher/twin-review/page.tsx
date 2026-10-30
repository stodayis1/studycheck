// 쌍둥이 후보 검수 화면 (GPT-EXEC-001 REV.2 작업 F · GPT-EXEC-006 작업 E·F) — 원장 전용
//
// 원문과 후보를 나란히 보고 승인·거부·게시한다.
// 화면이 지켜야 하는 것
//   - 검산 결과를 **플래그별로** 보여준다. AI 합의가 승인 근거가 아님이 눈에 보여야 한다
//   - 확인되지 않은 값은 '미확인'이라고 쓴다. '낮음'·'없음'처럼 보이면 안 된다 (D-066)
//   - 거부 사유를 반드시 받는다
//   - 승인과 게시는 별개 동작이다 (D-041)
//   - 학생 게시 안전검수는 따로 한다 (D-040 · D-064).
//     이 검수는 **최종답 공개를 허용하는 것이 아니다** — 그런 동작은 아예 없다 (D-063)
//   - 교사가 고쳐서 승인할 수 있다. 고치면 자동검증 표시는 무효가 된다 (D-055)
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Header } from '@/components/common/Header'
import { apiFetch } from '@/lib/apiFetch'
import type { ApprovalEdits, CandidateRecord, SourceRecord } from '@/lib/twin/repository'

type Pair = { source: SourceRecord & { image_url: string | null }; candidates: CandidateRecord[] }

type ActIds = { candidateId?: string; practiceProblemId?: string | null }
type ActFn = (action: string, ids: ActIds, extra?: { reason?: string; edits?: ApprovalEdits }) => void

/** 확인되지 않은 값의 표시. 빈칸이나 '-' 로 두면 '해당 없음'처럼 읽힌다 */
const UNKNOWN = '미확인'

export default function TwinReviewPage() {
  const [pairs, setPairs] = useState<Pair[]>([])
  const [reasons, setReasons] = useState<string[]>([])
  const [dataSource, setDataSource] = useState<string>('')
  const [idx, setIdx] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await apiFetch('/api/twin/review')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '불러오지 못했어요.')
      setPairs(json.pairs ?? [])
      setReasons(json.rejectReasons ?? [])
      setDataSource(json.dataSource ?? '')
      setIdx(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setLoading(false)
  }, [])

  // 첫 진입 때 한 번 불러온다. load 안에서 setState 를 하므로 react-hooks/set-state-in-effect
  // 가 걸리지만, 여기서는 "외부(서버)에서 상태를 받아오는" 정상적인 쓰임이다.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const act: ActFn = async (action, ids, extra) => {
    setBusy(ids.candidateId ?? ids.practiceProblemId ?? '')
    setError('')
    try {
      // 서버가 계약 밖 키를 거부하므로(.strict) 보낼 것만 골라 담는다
      const payload: Record<string, unknown> = { action }
      if (ids.candidateId) payload.candidateId = ids.candidateId
      if (ids.practiceProblemId) payload.practiceProblemId = ids.practiceProblemId
      if (extra?.reason) payload.reason = extra.reason
      if (extra?.edits && Object.keys(extra.edits).length > 0) payload.edits = extra.edits

      const res = await apiFetch('/api/twin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) {
        const msg = [json.error, json.detail].filter(Boolean).join(' — ')
        throw new Error(msg || '처리하지 못했어요.')
      }
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setBusy(null)
  }

  const pair = pairs[idx]

  return (
    <div className="min-h-screen" style={{ background: '#f9fafb' }}>
      <Header title="쌍둥이 문항 검수" />

      <div className="p-4 max-w-[1400px] mx-auto">
        {dataSource === 'fixture' && (
          <div className="mb-3 px-4 py-3 rounded-2xl text-sm"
            style={{ background: '#FFF7ED', border: '1px solid #FDBA74', color: '#9A3412' }}>
            <i className="ti ti-alert-triangle mr-1.5" />
            지금 보시는 것은 <b>연습용 예시 데이터</b>입니다. 실제 후보가 아닙니다.
            운영 테이블 연결은 아직 준비 중입니다.
          </div>
        )}

        {error && (
          <div className="mb-3 px-4 py-3 rounded-2xl text-sm"
            style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', color: '#991B1B' }}>
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 p-8 text-center">불러오는 중…</p>
        ) : !pair ? (
          <div className="p-12 text-center rounded-3xl bg-white border border-gray-200">
            <i className="ti ti-checks" style={{ fontSize: 40, color: '#9FE1CB' }} />
            <p className="mt-3 text-sm text-gray-500">검수를 기다리는 후보가 없습니다.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: '#085041' }}>
                원문 {idx + 1} / {pairs.length}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-40"
                  style={{ borderColor: '#e5e7eb', background: 'white' }}>
                  <i className="ti ti-chevron-left" /> 이전
                </button>
                <button onClick={() => setIdx(i => Math.min(pairs.length - 1, i + 1))}
                  disabled={idx >= pairs.length - 1}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-40"
                  style={{ borderColor: '#e5e7eb', background: 'white' }}>
                  다음 <i className="ti ti-chevron-right" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
              {/* ── 원문 ── */}
              <div className="rounded-3xl bg-white border border-gray-200 p-4 h-fit lg:sticky lg:top-4">
                <p className="text-xs font-bold mb-2" style={{ color: '#6b7280' }}>원문 (읽기 전용)</p>
                {pair.source.image_url ? (
                  <img src={pair.source.image_url} alt="원문 문제"
                    className="w-full rounded-xl border border-gray-100" />
                ) : (
                  <div className="p-6 rounded-xl text-center text-xs text-gray-400"
                    style={{ background: '#f9fafb' }}>
                    이미지를 불러오지 못했습니다<br />
                    <span className="text-[10px]">{pair.source.image_path}</span>
                  </div>
                )}
                <dl className="mt-3 text-xs space-y-1.5">
                  <Row k="교재" v={pair.source.book ?? '-'} />
                  <Row k="유형" v={`${pair.source.type_title ?? '-'} (${pair.source.type_code ?? '-'})`} />
                  <Row k="난이도 · 단계" v={`${pair.source.difficulty ?? '-'} · ${pair.source.step ?? '-'}`} />
                  <Row k="정답" v={pair.source.answer_text} strong />
                </dl>
              </div>

              {/* ── 후보 ── */}
              <div className="space-y-4">
                {pair.candidates.map(c => (
                  <CandidateCard key={c.id} c={c} reasons={reasons} busy={busy === c.id} onAct={act} />
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-gray-400">{k}</dt>
      <dd className={strong ? 'font-bold' : ''} style={strong ? { color: '#085041' } : undefined}>{v}</dd>
    </div>
  )
}

/** 줄 단위 입력 → 배열. 공백 행은 버린다 (§307) */
function toLines(text: string): string[] {
  return text.split('\n').map(s => s.trim()).filter(s => s !== '')
}

/** 배열 두 개가 같은지. 순서까지 같아야 '안 바뀐 것'이다 */
function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

function CandidateCard({
  c, reasons, busy, onAct,
}: {
  c: CandidateRecord
  reasons: string[]
  busy: boolean
  onAct: ActFn
}) {
  const [reason, setReason] = useState('')
  const [editing, setEditing] = useState(false)   // 기본은 읽기 모드 (§305)

  // 편집 상태. 원본과 비교해 **달라진 것만** 보낸다 (§308)
  const [text, setText] = useState(c.problem_text_latex)
  const [kind, setKind] = useState<'number' | 'choice'>(c.answer_kind)
  const [answer, setAnswer] = useState(c.answer_text)
  const [outline, setOutline] = useState(c.solution_outline.join('\n'))
  const [concepts, setConcepts] = useState(c.concepts.join('\n'))
  const [mistakes, setMistakes] = useState(c.common_mistakes.join('\n'))

  function resetEdits() {
    setText(c.problem_text_latex); setKind(c.answer_kind); setAnswer(c.answer_text)
    setOutline(c.solution_outline.join('\n'))
    setConcepts(c.concepts.join('\n'))
    setMistakes(c.common_mistakes.join('\n'))
  }

  function buildEdits(): ApprovalEdits {
    const e: ApprovalEdits = {}
    if (text !== c.problem_text_latex) e.problem_text_latex = text
    if (kind !== c.answer_kind) e.answer_kind = kind
    if (answer !== c.answer_text) e.answer_text = answer
    const o = toLines(outline); if (!sameList(o, c.solution_outline)) e.solution_outline = o
    const cc = toLines(concepts); if (!sameList(cc, c.concepts)) e.concepts = cc
    const m = toLines(mistakes); if (!sameList(m, c.common_mistakes)) e.common_mistakes = m
    return e
  }

  const edits = editing ? buildEdits() : {}
  const changedCount = Object.keys(edits).length
  // 클라이언트에서도 막는다. 다만 **최종 판정은 DB/RPC** 다 (§310)
  const blocked = editing && (text.trim() === '' || answer.trim() === '')

  function approve() {
    if (editing && changedCount > 0) {
      const ok = window.confirm(
        '수정한 내용으로 승인합니다.\n\n' +
        '기존 자동검증 표시는 무효화되고 사람 수정본으로 기록됩니다.\n' +
        '(형식검증·결정론적 검산·AI 검토 표시가 모두 꺼지고, 검증 상태는 「교사 수정」이 됩니다.)\n\n' +
        '계속할까요?',
      )
      if (!ok) return
    }
    onAct('approve', { candidateId: c.id }, { edits })
  }

  // §259: 안전검수·게시 여부는 **서버가 준 practice 요약**이 진실값이다.
  // 로컬 체크 상태를 믿지 않는다. 새로고침해도 상태가 유지된다.
  const safeOn = c.student_publish_approved
  const isPublished = c.is_published
  const isRetired = c.practice_status === 'retired'

  return (
    <div className="rounded-3xl bg-white border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold" style={{ color: '#085041' }}>후보 {c.candidate_no}</p>
        <StatusChip status={c.status} />
      </div>

      {!editing ? (
        <>
          <div className="p-4 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
            style={{ background: '#F8FAFC', border: '1px solid #e5e7eb' }}>
            {c.problem_text_latex}
          </div>

          <dl className="mt-3 text-xs space-y-1.5">
            <Row k="정답" v={`${c.answer_text} (${c.answer_kind === 'number' ? '단답' : '선택'})`} strong />
            <Row k="바꾼 것" v={c.transformations.join(' · ') || '-'} />
          </dl>

          {c.solution_outline.length > 0 && (
            <ol className="mt-3 text-xs text-gray-600 list-decimal pl-5 space-y-0.5">
              {c.solution_outline.map((s, i) => <li key={i}>{s}</li>)}
            </ol>
          )}

          {c.concepts.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="text-gray-400">개념 </span>{c.concepts.join(' · ')}
            </p>
          )}

          {c.common_mistakes.length > 0 && (
            <p className="mt-2 text-xs text-gray-500">
              <span className="text-gray-400">대표 오개념 </span>{c.common_mistakes.join(' · ')}
            </p>
          )}
        </>
      ) : (
        <div className="space-y-3">
          <Field label="문제 본문" required>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5}
              className="w-full p-3 rounded-xl text-sm border" style={{ borderColor: '#e5e7eb' }} />
            {text.trim() === '' && <Warn>문제 본문이 비어 있으면 승인할 수 없습니다.</Warn>}
          </Field>

          <div className="grid grid-cols-[150px_1fr] gap-3">
            <Field label="정답 종류">
              <select value={kind} onChange={e => setKind(e.target.value as 'number' | 'choice')}
                className="w-full p-2.5 rounded-xl text-sm border" style={{ borderColor: '#e5e7eb' }}>
                <option value="number">단답 (number)</option>
                <option value="choice">선택 (choice)</option>
              </select>
            </Field>
            <Field label="정답" required>
              <input value={answer} onChange={e => setAnswer(e.target.value)}
                className="w-full p-2.5 rounded-xl text-sm border" style={{ borderColor: '#e5e7eb' }} />
              {answer.trim() === '' && <Warn>정답이 비어 있으면 승인할 수 없습니다.</Warn>}
            </Field>
          </div>

          <Field label="풀이 개요" hint="한 줄에 한 단계. 빈 줄은 버립니다">
            <textarea value={outline} onChange={e => setOutline(e.target.value)} rows={4}
              className="w-full p-3 rounded-xl text-sm border" style={{ borderColor: '#e5e7eb' }} />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="개념" hint="한 줄에 하나">
              <textarea value={concepts} onChange={e => setConcepts(e.target.value)} rows={3}
                className="w-full p-3 rounded-xl text-sm border" style={{ borderColor: '#e5e7eb' }} />
            </Field>
            <Field label="대표 오개념" hint="한 줄에 하나">
              <textarea value={mistakes} onChange={e => setMistakes(e.target.value)} rows={3}
                className="w-full p-3 rounded-xl text-sm border" style={{ borderColor: '#e5e7eb' }} />
            </Field>
          </div>

          <p className="text-[11px]" style={{ color: '#9A3412' }}>
            <i className="ti ti-alert-triangle mr-1" />
            수정해서 승인하면 <b>기존 자동검증 표시는 무효화되고 사람 수정본으로 기록됩니다.</b>
            {changedCount > 0 && <> 지금 바뀐 항목 {changedCount}개.</>}
          </p>
        </div>
      )}

      {/* ── 검산 결과 — 플래그별로 보여준다 ── */}
      <div className="mt-4 p-3 rounded-2xl space-y-1.5" style={{ background: '#F9FAFB' }}>
        <Flag ok={c.flags.format_validation_passed} label="형식·정책 검증" />
        <Flag ok={c.flags.deterministic_check_passed} label="결정론적 검산 (규칙·CAS)" />
        <Flag ok={c.flags.ai_consensus_passed} label="AI 검토 일치" note="승인 근거가 아닙니다" />
        {/* D-066: null 을 '낮음'·'없음'으로 바꾸지 않는다. 승인 버튼 바로 위에 보인다 */}
        <div className="pt-1.5 mt-1.5 border-t border-gray-200 text-[11px] text-gray-500 space-y-0.5">
          <div>
            원문 복제도 <Unknown v={c.similarity_to_source == null ? null : String(c.similarity_to_source)} />
            {' · '}검산 방법 <Unknown v={c.flags.check_method} />
          </div>
          <div>
            역산 위험 <Unknown v={c.reverse_derivation_risk} />
            {' · '}모델 자기보고 단일정답{' '}
            <Unknown v={c.single_answer_claim == null ? null : (c.single_answer_claim ? 'O' : 'X')} />
            <span className="text-gray-400"> (자기보고는 판단 근거가 아닙니다)</span>
          </div>
          <div>
            변형 종류 <Unknown v={c.variant_kind} />
            {' · '}난이도 변화 <Unknown v={c.difficulty_delta == null ? null : String(c.difficulty_delta)} />
          </div>
        </div>
        {c.format_issues.length > 0 && (
          <ul className="text-[11px] pt-1" style={{ color: '#991B1B' }}>
            {c.format_issues.map((i, n) => <li key={n}>· {i.detail}</li>)}
          </ul>
        )}
        {c.ai_issues.length > 0 && (
          <ul className="text-[11px] pt-1" style={{ color: '#9A3412' }}>
            {c.ai_issues.map((i, n) => <li key={n}>· {i}</li>)}
          </ul>
        )}
      </div>

      {/* ── 동작 ── */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {c.status === 'pending_review' && (
          <>
            <button onClick={approve} disabled={busy || blocked}
              className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
              style={{ background: '#9FE1CB', color: '#085041' }}>
              <i className="ti ti-check mr-1" />
              {editing && changedCount > 0 ? `수정한 내용으로 승인 (${changedCount}개 변경)` : '승인'}
            </button>

            <button onClick={() => { if (editing) resetEdits(); setEditing(v => !v) }} disabled={busy}
              className="px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-40"
              style={{ borderColor: '#e5e7eb', background: 'white', color: '#374151' }}>
              <i className={`ti ${editing ? 'ti-x' : 'ti-pencil'} mr-1`} />
              {editing ? '수정 취소' : '수정 후 승인'}
            </button>

            <select value={reason} onChange={e => setReason(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs border" style={{ borderColor: '#e5e7eb' }}>
              <option value="">거부 사유 선택…</option>
              {reasons.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <button onClick={() => onAct('reject', { candidateId: c.id }, { reason })}
              disabled={busy || !reason}
              className="px-4 py-2 rounded-xl text-xs font-bold border disabled:opacity-40"
              style={{ borderColor: '#FCA5A5', color: '#991B1B', background: 'white' }}>
              거부
            </button>
          </>
        )}

        {c.status === 'approved' && c.practice_problem_id && !isRetired && (
          <>
            {!isPublished ? (
              <button onClick={() => onAct('publish', { practiceProblemId: c.practice_problem_id })}
                disabled={busy || !safeOn}
                title={safeOn ? '' : '학생 게시 안전검수를 먼저 마쳐야 게시할 수 있습니다'}
                className="px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40"
                style={{ background: '#085041', color: 'white' }}>
                <i className="ti ti-send mr-1" />학생에게 게시
              </button>
            ) : (
              <button onClick={() => onAct('unpublish', { practiceProblemId: c.practice_problem_id })}
                disabled={busy}
                className="px-4 py-2 rounded-xl text-xs font-bold border"
                style={{ borderColor: '#e5e7eb', background: 'white' }}>
                게시 취소
              </button>
            )}
            <span className="text-[11px] text-gray-500">
              {isPublished
                ? '지금 학생에게 보이고 있습니다'
                : safeOn
                  ? '승인만으로는 학생에게 보이지 않습니다. 게시해야 보입니다'
                  : '아래 「학생 게시 안전검수 완료」를 먼저 켜야 게시할 수 있습니다'}
            </span>
          </>
        )}

        {isRetired && (
          <span className="text-xs" style={{ color: '#991B1B' }}>
            <i className="ti ti-archive mr-1" />폐기됨 — 다시 게시할 수 없습니다
          </span>
        )}

        {c.status === 'rejected' && (
          <span className="text-xs" style={{ color: '#991B1B' }}>
            거부됨 — {c.reject_reason}
          </span>
        )}
      </div>

      {/* ── 학생 게시 안전검수는 따로 (D-040 · D-048 · D-064) ── */}
      {c.status === 'approved' && c.practice_problem_id && !isRetired && (
        <label className="mt-3 flex items-start gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={safeOn} disabled={busy}
            onChange={e =>
              onAct(e.target.checked ? 'approve_student_publish' : 'revoke_student_publish',
                    { practiceProblemId: c.practice_problem_id })
            }
            className="mt-0.5" />
          <span>
            <b>학생 게시 안전검수 완료</b>
            <span className="block text-[11px] text-gray-500">
              문제 본문에 정답·풀이·힌트가 없고 원문 답을 역산하기 어려운지 확인합니다.
              <b> 이 승인은 최종답 공개를 허용하지 않습니다.</b> 나중에 끌 수 있고,
              게시 중에 끄면 바로 게시가 내려갑니다. 다만
              <b> 학생에게 공개된 내용은 이미 본 학생에게서 회수할 수 없습니다.</b>
            </span>
          </span>
        </label>
      )}
    </div>
  )
}

function Field({
  label, hint, required, children,
}: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold mb-1" style={{ color: '#6b7280' }}>
        {label}{required && <span style={{ color: '#991B1B' }}> *</span>}
        {hint && <span className="font-normal text-gray-400"> — {hint}</span>}
      </p>
      {children}
    </div>
  )
}

function Warn({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-[11px]" style={{ color: '#991B1B' }}>{children}</p>
}

/** null 이면 '미확인'을 눈에 띄게 쓴다. 기본값으로 덮지 않는다 (D-066) */
function Unknown({ v }: { v: string | null }) {
  if (v == null) return <b style={{ color: '#9A3412' }}>{UNKNOWN}</b>
  return <span>{v}</span>
}

function Flag({ ok, label, note }: { ok: boolean; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <i className={`ti ${ok ? 'ti-circle-check' : 'ti-circle-x'}`}
        style={{ color: ok ? '#059669' : '#9ca3af', fontSize: 14 }} />
      <span style={{ color: ok ? '#374151' : '#9ca3af' }}>{label}</span>
      {note && <span className="text-[11px] text-gray-400">— {note}</span>}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending_review: { bg: '#FEF3C7', fg: '#92400E', label: '검수 대기' },
    approved: { bg: '#DBEAFE', fg: '#1E40AF', label: '승인됨' },
    rejected: { bg: '#FEE2E2', fg: '#991B1B', label: '거부됨' },
  }
  const s = map[status] ?? { bg: '#F3F4F6', fg: '#6B7280', label: status }
  return (
    <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold"
      style={{ background: s.bg, color: s.fg }}>{s.label}</span>
  )
}
