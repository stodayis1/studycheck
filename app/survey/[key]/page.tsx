'use client'

// 행사 학부모 설문 — 로그인 없이 링크로 들어와 적는 화면. /survey/<slug>
//
// 원장님 2026-11-06 「스터디체크에 학부모 설문 만들어 달라니까」
//   (11/21 초5·초6 부모학교. 쓰시던 네이버 폼과 같은 11문항 차례)
//
// ★ 묻는 내용은 lib/surveyEvents.ts 에만 적는다. 다음 행사는 그 파일에 한 줄 더하면 열린다.
// ★ /survey (10/24 설명회) 화면은 건드리지 않는다 — 이미 나간 주소이고 답이 들어 있다.
// ★ 카카오톡 인앱 브라우저에서 열린다. 그래서
//     · useSearchParams 를 쓰지 않는다 (Suspense 경계가 필요하고, 인앱에서 말썽이 잦다)
//     · 보내기는 fetch 한 번뿐이고, 실패하면 적은 내용을 그대로 두고 다시 누르게 한다
//       — 긴 글을 적었는데 날아가면 다시 안 써 주신다.

import { use, useState } from 'react'
import { findEventBySlug } from '@/lib/surveyEvents'

const GREEN = '#085041'
const MINT = '#F0FBF7'
const PEACH = '#F5C4B3'
const BROWN = '#712B13'
const LINE = '#C7DED6'
const GOLD = '#F2A33C'

export default function EventSurveyPage({ params }: { params: Promise<{ key: string }> }) {
  // Next.js 16 — 클라이언트 page 의 params 는 Promise 다
  const { key } = use(params)
  const ev = findEventBySlug(decodeURIComponent(key))

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [grade, setGrade] = useState('')
  const [found, setFound] = useState<string[]>([])
  const [foundEtc, setFoundEtc] = useState('')
  const [stars, setStars] = useState<Record<number, number>>({})
  const [recommend, setRecommend] = useState(0)
  const [free, setFree] = useState('')
  const [newF, setNewF] = useState<string[]>([])
  const [cur, setCur] = useState<string[]>([])
  const [agreeNotice, setAgreeNotice] = useState(false)
  const [agreePrivacy, setAgreePrivacy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  if (!ev) {
    return (
      <div className="min-h-screen grid place-items-center bg-white px-6">
        <p className="text-center text-sm leading-relaxed text-gray-500">
          없는 설문 주소예요.<br />받으신 문자의 주소를 다시 눌러 주세요.
        </p>
      </div>
    )
  }

  const toggle = (arr: string[], set: (v: string[]) => void) => (v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function submit() {
    if (!name.trim()) { setErr('자녀 이름을 적어 주세요.'); return }
    if (!phone.trim()) { setErr('연락처를 적어 주세요.'); return }
    if (!found.length && !foundEtc.trim()) { setErr(`${ev!.found.ask} 하나라도 골라 주세요.`); return }
    for (let i = 0; i < ev!.topics.length; i++) {
      if (!stars[i]) { setErr(`「${ev!.topics[i].title}」 만족도를 별로 골라 주세요.`); return }
    }
    if (!recommend) { setErr('추천 여부를 별로 골라 주세요.'); return }
    if (!free.trim()) { setErr('한 줄이라도 좋으니 적어 주세요.'); return }
    if (!agreeNotice) { setErr('자료를 유포하지 않겠다는 동의에 체크해 주세요.'); return }
    if (!agreePrivacy) { setErr('개인정보 수집·이용 동의에 체크해 주세요.'); return }

    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/survey', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          survey_key: ev!.key,
          student_name: name, phone, grade,
          found, found_etc: foundEtc,
          wish: free,
          stars, recommend,
          consult_new: newF, consult_now: cur,
          agree_notice: true, agree_privacy: true,
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error ?? '보내지 못했어요. 잠시 후 다시 눌러 주세요.'); return }
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch {
      setErr('연결이 끊겼어요. 적으신 내용은 그대로 있으니 다시 눌러 주세요.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <Shell ev={ev}>
        <div className="rounded-2xl px-6 py-12 text-center" style={{ background: MINT, border: `1px solid ${LINE}` }}>
          <p className="text-5xl mb-3">🌿</p>
          <p className="text-lg font-bold" style={{ color: GREEN }}>보내 주셔서 고맙습니다</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            적어 주신 한 줄이 다음 시간을 바꿉니다.<br />
            상담을 신청하신 분께는 <b style={{ color: BROWN }}>이번 주 안에</b> 연락드리겠습니다.
          </p>
          <p className="mt-5 text-base font-bold" style={{ color: GREEN }}>수학의지혜 수학학원</p>
        </div>
      </Shell>
    )
  }

  let n = 0
  return (
    <Shell ev={ev}>
      <div className="space-y-5">
        <Q n={++n} title="누구 학부모님이신가요" hint="자료 발송과 상담 연락에 쓰입니다" required>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="자녀 이름" required value={name} onChange={setName} />
            <Field label="학부모님 연락처" required value={phone} onChange={setPhone}
              type="tel" placeholder="010-0000-0000" />
          </div>
          {ev.grades.length > 0 && (
            <Sub label="자녀 학년 (선택)">
              <Chips options={ev.grades} picked={grade ? [grade] : []}
                onPick={(v) => setGrade((p) => (p === v ? '' : v))} />
            </Sub>
          )}
        </Q>

        {/* 알게 된 경로 — 어느 홍보가 닿았는지 (원장님 2026-11-07).
            고르기 + 빈 칸을 함께 둔다. 글로만 받으면 같은 뜻이 따로 세어져 집계가 안 된다. */}
        <Q n={++n} title={ev.found.ask} hint={ev.found.hint} required>
          <Chips options={ev.found.options} picked={found} onPick={toggle(found, setFound)} />
          <input value={foundEtc} onChange={(e) => setFoundEtc(e.target.value)}
            placeholder="그 밖에 — 자유롭게 적어 주세요"
            className="w-full rounded-xl border px-3 py-2.5 text-[14px]" style={{ borderColor: LINE }} />
        </Q>

        {ev.topics.map((t, i) => (
          <Q key={t.title} n={++n} title={`「${t.title}」 어떠셨어요?`} hint={t.sub} required>
            <Stars value={stars[i] ?? 0} onPick={(v) => setStars((p) => ({ ...p, [i]: v }))} />
          </Q>
        ))}

        <Q n={++n} title={ev.recommend} required>
          <Stars value={recommend} onPick={setRecommend} />
        </Q>

        <Q n={++n} title={ev.free} required>
          <textarea value={free} onChange={(e) => setFree(e.target.value)} rows={5}
            className="w-full rounded-xl border px-3 py-2.5 text-[14px] leading-relaxed"
            style={{ borderColor: LINE }} />
        </Q>

        <Q n={++n} title="[처음 오신 학부모님] 상담을 원하시면 골라 주세요"
          hint="편하게 상담만 받아 보셔도 됩니다 ^^">
          <Chips options={ev.newFamily} picked={newF} onPick={toggle(newF, setNewF)} />
        </Q>

        <Q n={++n} title="[재원생 학부모님] 더 이야기 나누고 싶은 것을 골라 주세요"
          hint="여러 개 고르셔도 됩니다">
          <Chips options={ev.current} picked={cur} onPick={toggle(cur, setCur)} />
        </Q>

        <Q n={++n} title="보내 드리는 자료에 대한 약속" required>
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl px-3.5 py-3"
            style={{ background: MINT, border: `1px solid ${LINE}` }}>
            <input type="checkbox" checked={agreeNotice} onChange={(e) => setAgreeNotice(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0" />
            <span className="text-[13px] leading-relaxed">
              {ev.notice.ask}
              <span className="mt-1 block font-bold" style={{ color: GREEN }}>{ev.notice.answer}</span>
            </span>
          </label>
        </Q>

        <Q n={++n} title="개인정보 수집·이용 동의" required>
          <div className="rounded-xl border px-3.5 py-3 text-[12.5px] leading-relaxed"
            style={{ borderColor: LINE }}>
            <L k="수집 항목">{ev.privacy.items}</L>
            <L k="이용 목적">{ev.privacy.purpose}</L>
            <L k="보유 기간">{ev.privacy.keep}</L>
            <p className="mt-2 text-[11.5px] text-gray-500">
              동의하지 않으실 수 있으나, 그 경우 설문을 받지 못합니다.
            </p>
          </div>
          <label className="flex items-center gap-2.5 cursor-pointer rounded-xl px-3.5 py-3"
            style={{ background: MINT, border: `1px solid ${LINE}` }}>
            <input type="checkbox" checked={agreePrivacy} onChange={(e) => setAgreePrivacy(e.target.checked)}
              className="w-4 h-4 shrink-0" />
            <span className="text-[13px] font-bold" style={{ color: GREEN }}>네, 동의합니다</span>
          </label>
        </Q>

        {err && (
          <p className="rounded-xl px-4 py-3 text-sm font-semibold"
            style={{ background: '#FEE2E2', color: '#991B1B' }}>{err}</p>
        )}

        <button onClick={submit} disabled={busy}
          className="w-full rounded-2xl py-4 text-base font-bold text-white disabled:opacity-60"
          style={{ background: GREEN }}>
          {busy ? '보내는 중…' : '보내기'}
        </button>
        <p className="pb-8 text-center text-[11.5px] text-gray-400">
          수학의지혜 수학학원 · 적어 주신 내용은 원장님과 담당 선생님만 봅니다
        </p>
      </div>
    </Shell>
  )
}

/* ── 조각들 ─────────────────────────────────────────────── */

function Shell({ ev, children }: { ev: { name: string; when: string; place: string; target: string; heading: string; lead: string }; children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#fff' }}>
      <div className="px-5 pt-7 pb-5" style={{ background: GREEN, color: '#fff' }}>
        <p className="text-[11px] font-bold tracking-widest opacity-80">수학의지혜 {ev.name} 설문</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight whitespace-pre-line">{ev.heading}</h1>
        <p className="mt-2 text-[12.5px] opacity-90">{ev.lead}</p>
        <p className="mt-3 text-[11.5px] leading-relaxed opacity-75">
          {ev.when} · {ev.place}<br />{ev.target}
        </p>
      </div>
      <div className="mx-auto max-w-lg px-4 pt-5">{children}</div>
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
        <h2 className="text-[15px] font-bold">
          {title}{required && <b style={{ color: BROWN }}> *</b>}
        </h2>
        {hint && <span className="text-[11.5px] text-gray-400">{hint}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

/** 별점 — 0.5 칸. 별 한 개를 왼쪽·오른쪽 반으로 나눠 누른다 (칸 20px) */
function Stars({ value, onPick }: { value: number; onPick: (v: number) => void }) {
  const S = 40
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = value >= i ? 1 : value >= i - 0.5 ? 0.5 : 0
          return (
            <span key={i} className="relative inline-block" style={{ width: S, height: S }}>
              <Glyph size={S} color="#E8EDEB" />
              {fill > 0 && (
                <span className="absolute left-0 top-0 overflow-hidden"
                  style={{ width: S * fill, height: S }}>
                  <Glyph size={S} color={GOLD} />
                </span>
              )}
              <button type="button" aria-label={`${i - 0.5}점`} onClick={() => onPick(i - 0.5)}
                className="absolute top-0" style={{ left: 0, width: S / 2, height: S }} />
              <button type="button" aria-label={`${i}점`} onClick={() => onPick(i)}
                className="absolute top-0" style={{ left: S / 2, width: S / 2, height: S }} />
            </span>
          )
        })}
      </div>
      <span className="text-[13px] font-bold tabular-nums" style={{ color: value ? BROWN : '#9ca3af' }}>
        {value ? `${value}점` : '눌러 주세요'}
      </span>
    </div>
  )
}

function Glyph({ size, color }: { size: number; color: string }) {
  return (
    <span className="absolute left-0 top-0 grid place-items-center"
      style={{ width: size, height: size, fontSize: size * 0.82, lineHeight: 1, color }}>★</span>
  )
}

function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void
  required?: boolean; type?: string; placeholder?: string
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11.5px] font-semibold text-gray-500 mb-1">
        {label}{required && <b style={{ color: BROWN }}> *</b>}
      </span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-xl border px-3 py-2.5 text-[14px]" style={{ borderColor: LINE }} />
    </label>
  )
}

function Chips({ options, picked, onPick }: {
  options: string[]; picked: string[]; onPick: (v: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = picked.includes(o)
        return (
          <button key={o} type="button" onClick={() => onPick(o)}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition-colors"
            style={on
              ? { background: PEACH, color: BROWN, borderColor: PEACH }
              : { background: '#fff', color: '#4b5563', borderColor: LINE }}>
            {o}
          </button>
        )
      })}
    </div>
  )
}

function Sub({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold text-gray-500 mb-1.5">{label}</p>
      {children}
    </div>
  )
}

function L({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5 py-0.5">
      <span className="w-16 shrink-0 font-semibold text-gray-500">{k}</span>
      <span className="flex-1 min-w-0">{children}</span>
    </div>
  )
}
