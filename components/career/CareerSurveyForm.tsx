'use client'

// 진로 설문 — 설문지 한 장 (학부모 설문 app/survey/[key] 와 같은 꼴)
//
// 원장님 2026-11-07 「학부모 설문조사처럼 설문조사 형태로 만들어 달라니까?
//                    게시는 각 학생·학부모 화면에 한다 생각하더라도」
//
// 이 조각은 **그리기만** 한다. 저장은 부르는 쪽이 onSubmit 으로 정한다.
//   · live    — 학생·학부모 앱 (/student/career · /parent/career) → /api/career
//   · test    — 선생님 화면 「테스트 학생으로 해 보기」 → /api/career/test (윤수지·테스트에만 저장)
//   · preview — 선생님 화면 「미리보기」 → 저장하지 않는다
//
// ★ 카카오톡 인앱 브라우저에서도 열린다 — useSearchParams 를 쓰지 않는다.
//   보내기가 실패하면 적은 내용을 그대로 두고 다시 누르게 한다.

import { useEffect, useRef, useState } from 'react'
import { roadmapSerif, RoadmapSerifLink } from '@/lib/roadmapFont'
import { CONSENT_TEXT, FORMS, SECTIONS, questionsOf, type FormId, type Question } from '@/lib/careerSurvey'

// ★ 색은 질문지마다 다르다 — 대표 썸네일과 같은 파스텔 (원장님 2026-11-07 「짙은 초록색 말고 파스텔 핑크·오렌지로
//   세련되게」 「학생부 로드맵 설문지 디자인 안 바뀐 채로 그냥 오는데?」). 맨 바깥 div 에 CSS 변수로 깔고,
//   아래 조각들은 변수만 쓴다. 썸네일 색은 scripts/make-career-og.py THEMES 와 맞춘다.
const GREEN = 'var(--rm-ink)'    // 글씨·단추 (먹색 / 고동)
const MINT = 'var(--rm-soft)'    // 옅은 바탕 칸
const PEACH = 'var(--rm-head)'   // 머리 바탕 · 고른 보기
const BROWN = 'var(--rm-sub)'    // 강조 글씨 · 필수 *
const LINE = 'var(--rm-line)'    // 테두리
const THEMES: Record<FormId, Record<string, string>> = {
  pre1: { '--rm-head': '#FACDA8', '--rm-ink': '#3A1E12', '--rm-sub': '#9A4A1E', '--rm-soft': '#FDF1E7', '--rm-line': '#F0CDB2' },  // 예비고1 파스텔 오렌지
  pre2: { '--rm-head': '#F7C6D0', '--rm-ink': '#26161C', '--rm-sub': '#8A3F55', '--rm-soft': '#FBEFF2', '--rm-line': '#EBC9D2' },  // 예비고2 파스텔 핑크
}
const SERIF = roadmapSerif.style.fontFamily

export type Answers = Record<string, string | string[]>
export type ConsentInfo = { signer_name: string | null; optional_agreed: boolean; agreed_at: string } | null
export type SubmitPayload = {
  form: FormId
  consent: { signer_name: string; required: boolean; optional: boolean } | null
  answers: Answers
}

export default function CareerSurveyForm({
  form, role, studentName, consent, initial, answeredAt, mode, onSubmit, onRevoke, top, onBack,
}: {
  form: FormId
  role: 'student' | 'parent'
  studentName: string
  consent: ConsentInfo
  initial: Answers | null
  answeredAt: string | null
  mode: 'live' | 'test' | 'preview'
  onSubmit: (p: SubmitPayload) => Promise<string | null>
  onRevoke?: () => Promise<void>
  /** 머리 아래에 끼울 것 — 미리보기 띠, 설문 고르기 단추 등 */
  top?: React.ReactNode
  onBack?: () => void
}) {
  const F = FORMS[form]
  const [ans, setAns] = useState<Answers>(initial ?? {})
  const [reqOk, setReqOk] = useState(false)
  const [optOk, setOptOk] = useState(false)
  const [signer, setSigner] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  // 설문 종류가 바뀌거나 낸 답이 새로 오면 그것으로 다시 연다
  //   (보낸 직후 새 답이 와도 「고맙습니다」 화면은 그대로 둔다 — done 은 설문 종류가 바뀔 때만 푼다)
  useEffect(() => { setAns(initial ?? {}); setErr('') }, [form, initial])
  useEffect(() => { setDone(false) }, [form])

  const parent = role === 'parent'
  const qs = questionsOf(form)

  async function submit() {
    if (!consent) {
      if (!reqOk) { setErr('개인정보 수집·이용 [필수] 항목에 동의해 주세요.'); return }
      if (!signer.trim()) { setErr(parent ? '동의하시는 보호자 성함을 적어 주세요.' : '동의하는 사람 이름(내 이름)을 적어 주세요.'); return }
    }
    for (const q of qs) {
      const v = ans[q.id]
      if (q.required && (!v || (Array.isArray(v) && !v.length))) { setErr(`「${q.label}」을 골라 주세요.`); return }
    }
    setBusy(true); setErr('')
    try {
      const e = await onSubmit({
        form, answers: ans,
        consent: consent ? null : { signer_name: signer.trim(), required: true, optional: optOk },
      })
      if (e) { setErr(e); return }
      setDone(true)
      root.current?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    } catch {
      setErr('연결이 끊겼어요. 적으신 내용은 그대로 있으니 다시 눌러 주세요.')
    } finally { setBusy(false) }
  }

  const shell = (children: React.ReactNode) => (
    <div ref={root} className="min-h-screen" style={{ background: '#fff', ...(THEMES[form] as React.CSSProperties) }}>
      <RoadmapSerifLink />
      <div className="px-5 pt-6 pb-6" style={{ background: PEACH, color: GREEN }}>
        {onBack && (
          <button onClick={onBack} className="mb-2 text-[12px] opacity-80">← 돌아가기</button>
        )}
        <p className="text-[11px] font-bold tracking-widest opacity-80">수학의지혜 {F.label} 학생부 로드맵 질문지</p>
        <h1 className="mt-2 text-[27px] leading-[1.25] whitespace-pre-line" style={{ fontFamily: SERIF, fontWeight: 300 }}>{F.heading}</h1>
        <p className="mt-2 text-[12.5px] opacity-90">{F.lead}</p>
        <p className="mt-3 text-[11.5px] leading-relaxed opacity-75">
          {studentName} 학생{parent ? ' 학부모님' : ''} · 현 {F.fromGrade} · 약 3분
        </p>
      </div>
      {top}
      <div className="mx-auto max-w-lg px-4 pt-5">{children}</div>
    </div>
  )

  if (done) {
    return shell(
      <div className="rounded-2xl px-6 py-12 text-center" style={{ background: MINT, border: `1px solid ${LINE}` }}>
        <p className="text-5xl mb-3">🧭</p>
        <p className="text-lg font-bold" style={{ color: GREEN }}>
          {mode === 'preview' ? '미리보기 — 여기까지가 설문 끝 화면입니다' : '보내 주셔서 고맙습니다'}
        </p>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {mode === 'preview'
            ? '미리보기라서 아무것도 저장하지 않았어요.'
            : <>적어 주신 진로에 맞춰 <b style={{ color: BROWN }}>선택과목 · 탐구 주제 · 공부 방향</b>을<br />담당 선생님이 챙겨 안내드리겠습니다.</>}
        </p>
        <button onClick={() => setDone(false)}
          className="mt-6 rounded-xl px-5 py-2.5 text-sm font-bold border" style={{ borderColor: GREEN, color: GREEN }}>
          보낸 답 보기 · 고치기
        </button>
        <p className="mt-5 text-base font-bold" style={{ color: GREEN }}>수학의지혜 수학학원</p>
      </div>,
    )
  }

  let n = 0
  return shell(
    <div className="space-y-6">
      {/* 진행 순서 — 무엇을 몇 단계로 묻는지 먼저 보여 준다 */}
      <div className="rounded-2xl px-4 py-3.5" style={{ background: MINT, border: `1px solid ${LINE}` }}>
        <p className="text-[12px] font-bold mb-2" style={{ color: GREEN }}>이렇게 진행돼요</p>
        <ol className="space-y-1">
          {SECTIONS.map((s, i) => (
            <li key={s.id} className="flex gap-2 text-[12.5px]">
              <span className="shrink-0 w-4 h-4 mt-0.5 rounded-full grid place-items-center text-[10px] font-bold text-white"
                style={{ background: s.id === 'consent' && consent ? '#9CA3AF' : GREEN }}>{i + 1}</span>
              <span><b>{s.title}</b> <span className="text-gray-500">— {s.id === 'consent' && consent ? '이미 동의하셨어요' : s.note}</span></span>
            </li>
          ))}
        </ol>
        {/* 원장님 2026-11-11 「탐구보고서나 수행평가 쓸 게 너무 많아서 못 썼단 친구도 있었거든. 그거 다 써야 하는 건가?」 */}
        <p className="mt-2.5 text-[11.5px] font-semibold" style={{ color: GREEN }}>
          꼭 써야 하는 건 <b style={{ color: BROWN }}>*</b> 표시(관심 계열) 하나예요. 나머지는 아는 만큼만, 없으면 비워 두세요.
        </p>
        {parent && (
          <p className="mt-2.5 text-[11.5px] text-gray-500">학부모님은 자녀에 대해 아시는 만큼 적어 주세요. 모르는 칸은 비워 두셔도 됩니다.</p>
        )}
        {answeredAt && (
          <p className="mt-2.5 text-[11.5px] font-semibold" style={{ color: BROWN }}>
            {new Date(answeredAt).toLocaleDateString('ko-KR')}에 보낸 답이 들어 있어요. 고쳐서 다시 보내셔도 됩니다.
          </p>
        )}
      </div>

      {/* 1. 개인정보 동의 */}
      <Part no={1} title="개인정보 수집·이용 동의">
        {consent ? (
          <div className="rounded-xl px-3.5 py-3 text-[12.5px]" style={{ background: MINT, border: `1px solid ${LINE}` }}>
            <b style={{ color: GREEN }}>✓ 동의 완료</b> — {consent.signer_name} · {new Date(consent.agreed_at).toLocaleDateString('ko-KR')}
            {' '}· 학생부(세특) 내용 {consent.optional_agreed ? '동의' : '미동의'}
            {onRevoke && (
              <button onClick={() => { if (confirm('동의를 철회할까요? 철회하면 진로 맞춤 안내를 받을 수 없어요.')) onRevoke() }}
                className="ml-2 underline text-gray-400">동의 철회</button>
            )}
          </div>
        ) : (
          <Q n={++n} title={CONSENT_TEXT.title} required>
            <p className="text-[12.5px] leading-relaxed text-gray-600">{CONSENT_TEXT.intro}</p>
            <div className="rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed" style={{ borderColor: LINE }}>
              {CONSENT_TEXT.rows.map(([k, v]) => <L key={k} k={k}>{v}</L>)}
              <p className="mt-2 text-[11.5px] text-gray-500">{CONSENT_TEXT.refuse}</p>
            </div>
            <Check on={reqOk} set={setReqOk} strong>{CONSENT_TEXT.required}</Check>
            <Check on={optOk} set={setOptOk}>{CONSENT_TEXT.optional}</Check>
            <Field label={parent ? '동의하시는 보호자 성함' : '동의하는 사람 (내 이름)'} required value={signer} onChange={setSigner} />
          </Q>
        )}
      </Part>

      {SECTIONS.filter((s) => s.id !== 'consent').map((s, i) => {
        const list = qs.filter((q) => q.section === s.id)
        if (!list.length) return null
        return (
          <Part key={s.id} no={i + 2} title={s.title}>
            {list.map((q) => <Item key={q.id} n={++n} q={q} ans={ans} setAns={setAns} />)}
          </Part>
        )
      })}

      {err && (
        <p className="rounded-xl px-4 py-3 text-sm font-semibold" style={{ background: '#FEE2E2', color: '#991B1B' }}>{err}</p>
      )}

      <button onClick={submit} disabled={busy}
        className="w-full rounded-2xl py-4 text-base font-bold text-white disabled:opacity-60" style={{ background: GREEN }}>
        {busy ? '보내는 중…' : answeredAt ? '고친 답 보내기' : '보내기'}
      </button>
      <p className="pb-10 text-center text-[11.5px] text-gray-400">
        수학의지혜 수학학원 · 적어 주신 내용은 원장님과 담당 선생님만 봅니다
      </p>
    </div>,
  )
}

/* ── 조각들 (app/survey/[key] 와 같은 모양) ─────────────────── */

function Part({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-bold tracking-widest mb-3 pb-1.5 border-b" style={{ color: GREEN, borderColor: LINE }}>
        {no}단계 · {title}
      </p>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Q({ n, title, hint, required, children }: {
  n: number; title: string; hint?: string; required?: boolean; children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
        <span className="shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold text-white"
          style={{ background: GREEN }}>{n}</span>
        <h2 className="text-[15px] font-bold">{title}{required && <b style={{ color: BROWN }}> *</b>}</h2>
        {hint && <span className="text-[11.5px] text-gray-400">{hint}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Item({ n, q, ans, setAns }: {
  n: number; q: Question; ans: Answers; setAns: React.Dispatch<React.SetStateAction<Answers>>
}) {
  const v = ans[q.id]
  const arr = Array.isArray(v) ? v : []
  const hint = [q.help, q.type === 'multi' && q.max && q.max < (q.options?.length ?? 0) ? `${q.max}개까지` : q.type === 'multi' ? '여러 개 골라도 돼요' : '']
    .filter(Boolean).join(' · ')
  return (
    <Q n={n} title={q.label} hint={hint || undefined} required={q.required}>
      {(q.type === 'single' || q.type === 'multi') && (
        <div className="flex flex-wrap gap-1.5">
          {q.options!.map((o) => {
            const on = q.type === 'single' ? v === o : arr.includes(o)
            return (
              <button key={o} type="button"
                onClick={() => setAns((p) => {
                  if (q.type === 'single') return { ...p, [q.id]: on ? '' : o }
                  if (on) return { ...p, [q.id]: arr.filter((x) => x !== o) }
                  if (q.max && arr.length >= q.max) return p
                  return { ...p, [q.id]: [...arr, o] }
                })}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition-colors"
                style={on ? { background: GREEN, color: '#fff', borderColor: GREEN } : { background: '#fff', color: '#4b5563', borderColor: LINE }}>
                {o}
              </button>
            )
          })}
        </div>
      )}
      {q.type === 'text' && (
        <input value={(v as string) ?? ''} maxLength={q.max} onChange={(e) => setAns((p) => ({ ...p, [q.id]: e.target.value }))}
          className="w-full rounded-xl border px-3 py-2.5 text-[14px]" style={{ borderColor: LINE }} />
      )}
      {q.type === 'textarea' && (
        <textarea value={(v as string) ?? ''} maxLength={q.max} rows={4} onChange={(e) => setAns((p) => ({ ...p, [q.id]: e.target.value }))}
          className="w-full rounded-xl border px-3 py-2.5 text-[14px] leading-relaxed" style={{ borderColor: LINE }} />
      )}
    </Q>
  )
}

function Check({ on, set, strong, children }: { on: boolean; set: (v: boolean) => void; strong?: boolean; children: React.ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer rounded-xl px-3.5 py-3" style={{ background: MINT, border: `1px solid ${LINE}` }}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0" />
      <span className="text-[13px] leading-relaxed" style={strong ? { color: GREEN, fontWeight: 700 } : undefined}>{children}</span>
    </label>
  )
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11.5px] font-semibold text-gray-500 mb-1">{label}{required && <b style={{ color: BROWN }}> *</b>}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={20}
        className="w-full rounded-xl border px-3 py-2.5 text-[14px]" style={{ borderColor: LINE }} />
    </label>
  )
}

function L({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-0.5">
      <span className="w-20 shrink-0 font-semibold text-gray-500">{k}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  )
}
