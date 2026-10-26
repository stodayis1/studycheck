'use client'

// 학부모 설문 — 로그인 없이 링크로 들어와 적는 화면. /survey
//
// 원장님 2026-10-24 「설문조사로 앱으로 만들어서 학부모님한테 보내서 링크 통해 후기 받는게」
//
// ★ 종이 의견 카드(설명회 자리에 두는 A4)와 **같은 항목**이다. 둘 중 편한 쪽으로 내시면 된다.
// ★ 카카오톡 인앱 브라우저에서 열린다. 그래서
//     · useSearchParams 를 쓰지 않는다 (Suspense 경계가 필요하고, 인앱에서 말썽이 잦다)
//     · 보내기는 fetch 한 번뿐이고, 실패하면 적은 내용을 그대로 두고 다시 누르게 한다
//       — 긴 글을 적었는데 날아가면 다시 안 써 주신다.

import { useState } from 'react'

const GREEN = '#085041'
const MINT = '#F0FBF7'
const PEACH = '#F5C4B3'
const BROWN = '#712B13'
const LINE = '#C7DED6'

const RATINGS = ['아주 좋았어요', '좋았어요', '보통이에요', '아쉬웠어요']
const TIMES = ['평일 오전', '평일 오후', '평일 저녁', '토요일']
const HOWS = ['방문 상담', '전화 상담']
const COURSE_GROUPS: [string, string[]][] = [
  ['초등', ['초등 연산 집중', '초등 사고력·심화', '초등 단원평가 대비']],
  ['중등', ['중등 내신 집중', '중등 심화·경시', '중등 고등 과정 선행']],
  ['고등', ['고등 공통수학1', '고등 공통수학2', '고등 대수', '고등 미적분Ⅰ',
    '고등 확률과 통계', '고등 기하', '고등 내신 집중', '고등 수능·모의고사', '고3 파이널']],
  ['공통', ['서술형 대비', '1:1 클리닉', '주말반', '방학 특강', '학부모 공부방']],
]
/** 보기 글에서 앞의 학교급을 떼고 보여 준다 — 묶음 딱지가 이미 말해 준다 */
const shortName = (c: string) => c.replace(/^(초등|중등|고등) /, '')

export default function SurveyPage() {
  const [f, setF] = useState({
    student_name: '', grade: '', school: '', guardian_name: '', phone: '', study_now: '',
    rating: '', helpful: '', want_more: '', wish: '', courses_etc: '',
  })
  const [consult, setConsult] = useState<boolean | null>(null)
  const [times, setTimes] = useState<string[]>([])
  const [hows, setHows] = useState<string[]>([])
  const [courses, setCourses] = useState<string[]>([])
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }))
  const toggle = (arr: string[], setArr: (v: string[]) => void) => (v: string) =>
    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  async function submit() {
    if (!f.student_name.trim()) { setErr('학생 이름을 적어 주세요.'); return }
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/survey', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, consult: consult === true, consult_times: times, consult_how: hows, courses, agree_public: agree }),
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
      <Shell>
        <div className="rounded-2xl px-6 py-12 text-center" style={{ background: MINT, border: `1px solid ${LINE}` }}>
          <p className="text-5xl mb-3">🌿</p>
          <p className="text-lg font-bold" style={{ color: GREEN }}>보내 주셔서 고맙습니다</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            적어 주신 한 줄이 다음 수업을 바꿉니다.<br />
            상담을 신청하신 분께는 <b style={{ color: BROWN }}>이번 주 안에</b> 연락드리겠습니다.
          </p>
          <p className="mt-5 text-base font-bold" style={{ color: GREEN }}>수학의지혜 수학학원</p>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="space-y-5">
        <Q n={1} title="누구 학부모님이신가요" hint="상담을 신청하시면 이 번호로 연락드립니다">
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="학생 이름" required value={f.student_name} onChange={set('student_name')} />
            <Field label="학년" value={f.grade} onChange={set('grade')} placeholder="예: 중2" />
            <Field label="학교" value={f.school} onChange={set('school')} />
            <Field label="보호자 성함" value={f.guardian_name} onChange={set('guardian_name')} />
            <Field label="연락처" value={f.phone} onChange={set('phone')} type="tel" placeholder="010-0000-0000" />
            <Field label="현재 수학 공부" value={f.study_now} onChange={set('study_now')} placeholder="예: 학교 진도만" />
          </div>
        </Q>

        <Q n={2} title="오늘 설명회는 어떠셨나요">
          <Chips options={RATINGS} picked={f.rating ? [f.rating] : []}
            onPick={(v) => setF((p) => ({ ...p, rating: p.rating === v ? '' : v }))} />
          <Area label="가장 도움이 된 내용" value={f.helpful} onChange={set('helpful')} rows={2} />
          <Area label="더 듣고 싶었던 내용" value={f.want_more} onChange={set('want_more')} rows={2} />
        </Q>

        <Q n={3} title="개별 상담을 신청하시겠어요?" hint="아이 성적표와 학습 기록을 함께 보며 30분쯤 이야기합니다">
          <div className="flex gap-2">
            <Big on={consult === true} onClick={() => setConsult(true)}>네, 신청합니다</Big>
            <Big on={consult === false} onClick={() => setConsult(false)}>다음에 할게요</Big>
          </div>
          {consult === true && (
            <div className="mt-3 space-y-3">
              <Sub label="시간대"><Chips options={TIMES} picked={times} onPick={toggle(times, setTimes)} /></Sub>
              <Sub label="방식"><Chips options={HOWS} picked={hows} onPick={toggle(hows, setHows)} /></Sub>
            </div>
          )}
        </Q>

        <Q n={4} title="수학의지혜에 바라는 점" hint="수업·과제·소통 무엇이든 — 불편했던 것도 그대로 적어 주세요">
          <Area value={f.wish} onChange={set('wish')} rows={4} />
        </Q>

        <Q n={5} title="이런 강좌가 열리면 보내고 싶어요" hint="여러 개 고르셔도 됩니다">
          <div className="space-y-2.5">
            {COURSE_GROUPS.map(([g, list]) => (
              <div key={g} className="flex gap-2.5">
                <span className="shrink-0 w-10 h-6 rounded-md text-[11px] font-bold grid place-items-center"
                  style={{ background: MINT, color: GREEN }}>{g}</span>
                <div className="flex-1 min-w-0">
                  <Chips options={list} picked={courses} onPick={toggle(courses, setCourses)} label={shortName} />
                </div>
              </div>
            ))}
          </div>
          <Area label="그 밖에" value={f.courses_etc} onChange={set('courses_etc')} rows={2} />
        </Q>

        <Q n={6} title="후기를 함께 써도 될까요">
          <label className="flex items-start gap-2.5 cursor-pointer rounded-xl px-3.5 py-3"
            style={{ background: MINT, border: `1px solid ${LINE}` }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)}
              className="mt-0.5 w-4 h-4 shrink-0" />
            <span className="text-[13px] leading-relaxed">
              적어 주신 후기를 학원 안내물·블로그에 <b>이름 없이</b> 실어도 좋습니다
              <span className="block mt-1 text-[11.5px] text-gray-500">
                학생·보호자 성함과 연락처는 싣지 않습니다. 동의하지 않으셔도 상담 신청에는 아무 영향이 없습니다.
              </span>
            </span>
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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen" style={{ background: '#fff' }}>
      <div className="px-5 pt-7 pb-5" style={{ background: GREEN, color: '#fff' }}>
        <p className="text-[11px] font-bold tracking-widest opacity-80">수학의지혜 학부모 설문</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-tight">오늘 들으신 이야기,<br />어떠셨어요?</h1>
        <p className="mt-2 text-[12.5px] opacity-90">적어 주신 한 줄이 다음 수업을 바꿉니다</p>
      </div>
      <div className="mx-auto max-w-lg px-4 pt-5">{children}</div>
    </div>
  )
}

function Q({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2.5 flex-wrap">
        <span className="shrink-0 w-5 h-5 rounded-full grid place-items-center text-[11px] font-bold text-white"
          style={{ background: GREEN }}>{n}</span>
        <h2 className="text-[15px] font-bold">{title}</h2>
        {hint && <span className="text-[11.5px] text-gray-400">{hint}</span>}
      </div>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function Field({ label, value, onChange, required, type = 'text', placeholder }: {
  label: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  required?: boolean; type?: string; placeholder?: string
}) {
  return (
    <label className="block min-w-0">
      <span className="block text-[11.5px] font-semibold text-gray-500 mb-1">
        {label}{required && <b style={{ color: BROWN }}> *</b>}
      </span>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full rounded-xl border px-3 py-2.5 text-[14px]"
        style={{ borderColor: LINE }} />
    </label>
  )
}

function Area({ label, value, onChange, rows = 3 }: {
  label?: string; value: string; onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; rows?: number
}) {
  return (
    <label className="block">
      {label && <span className="block text-[11.5px] font-semibold text-gray-500 mb-1">{label}</span>}
      <textarea value={value} onChange={onChange} rows={rows}
        className="w-full rounded-xl border px-3 py-2.5 text-[14px] leading-relaxed"
        style={{ borderColor: LINE }} />
    </label>
  )
}

function Chips({ options, picked, onPick, label }: {
  options: string[]; picked: string[]; onPick: (v: string) => void; label?: (v: string) => string
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = picked.includes(o)
        return (
          <button key={o} type="button" onClick={() => onPick(o)}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold border transition-colors"
            style={on
              ? { background: GREEN, color: '#fff', borderColor: GREEN }
              : { background: '#fff', color: '#4b5563', borderColor: LINE }}>
            {label ? label(o) : o}
          </button>
        )
      })}
    </div>
  )
}

function Big({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="flex-1 rounded-xl py-3 text-[14px] font-bold border transition-colors"
      style={on
        ? { background: PEACH, color: BROWN, borderColor: PEACH }
        : { background: '#fff', color: '#6b7280', borderColor: LINE }}>
      {children}
    </button>
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
