'use client'

// 내 활동 적기 — 문자로 받은 개인 링크. /a/<token>  (로그인 없이 연다)
//
// 원장님 2026-11-10 「학생이 직접 적는 것 만들어줘 … 학생들은 스터디체크에 보통 로그인 잘 안 하거든」
//
// ★ 주소가 짧아야 문자가 짧다 — /a/ 한 글자 (설문은 /c/, 소식은 /r/).
// ★ 카톡·문자 인앱 브라우저에서 열린다 — useSearchParams 를 쓰지 않는다.
// ★ 묻는 말을 **다섯 칸**으로 나눈다. 한 칸짜리 「내용」이면 한 줄로 끝난다.

import { use, useEffect, useState } from 'react'
import { PART_LABELS, composeDetail, parseDetail, EMPTY_PARTS, type ActivityParts } from '@/lib/activityParts'

const GREEN = '#085041'
const MINT = '#F0FBF7'
const LINE = '#C7DED6'

type Act = {
  id: string; kind: string; title: string; detail: string | null
  subject: string | null; grade_at: string | null; source: string
}
type State = { student: { name: string; grade: string | null }; kinds: string[]; acts: Act[] }

export default function MyActivityPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [st, setSt] = useState<State | null>(null)
  const [err, setErr] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [parts, setParts] = useState<ActivityParts>({ ...EMPTY_PARTS })
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState('탐구보고서')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')

  useEffect(() => {
    fetch(`/api/career/acts/${encodeURIComponent(token)}`).then(async (r) => {
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErr(j.error ?? '열지 못했어요. 잠시 뒤 다시 눌러 주세요.')
      else setSt(j)
    }).catch(() => setErr('인터넷 연결을 확인하고 다시 눌러 주세요.'))
  }, [token])

  function openAct(a: Act) {
    setOpenId(a.id); setTitle(a.title); setKind(a.kind)
    setParts(parseDetail(a.detail)); setSaved('')
  }
  function openNew() {
    setOpenId('new'); setTitle(''); setKind(st?.kinds[0] ?? '탐구보고서')
    setParts({ ...EMPTY_PARTS }); setSaved('')
  }

  async function save() {
    if (!title.trim()) { setErr('무엇을 한 것인지 제목을 적어 주세요.'); return }
    setBusy(true); setErr('')
    const body = { action: 'save', id: openId === 'new' ? undefined : openId, kind, title, detail: composeDetail(parts) }
    const r = await fetch(`/api/career/acts/${encodeURIComponent(token)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? '저장하지 못했어요.'); return }
    setSt((p) => p ? { ...p, acts: [j.act, ...p.acts.filter((x) => x.id !== j.act.id)] } : p)
    setOpenId(null); setSaved('저장했어요. 선생님께 바로 보여요.')
  }

  const missingOf = (a: Act) => {
    const p = parseDetail(a.detail)
    return PART_LABELS.filter((x) => (p[x.key] ?? '').trim().length < 5).map((x) => x.label)
  }

  if (err && !st) return <Shell><p className="text-sm text-red-600">{err}</p></Shell>
  if (!st) return <Shell><p className="text-sm text-gray-500">불러오는 중…</p></Shell>

  return (
    <Shell>
      <h1 className="text-lg font-bold" style={{ color: GREEN }}>{st.student.name} 학생의 활동 적기</h1>
      <p className="mt-1.5 text-[13px] text-gray-600 leading-relaxed">
        학교에서 한 탐구·수행평가·동아리를 적어 두는 곳이에요. 적어 두면 선생님이 보고,
        다음에 무엇을 하면 좋을지 같이 찾아 드려요. 한 번에 다 안 써도 돼요 — 생각나는 칸부터 채우면 돼요.
      </p>
      {saved && <p className="mt-2 text-[13px] font-semibold" style={{ color: GREEN }}>{saved}</p>}

      {openId === null ? (
        <>
          <button onClick={openNew} className="mt-4 w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: GREEN }}>
            + 활동 적기
          </button>

          <div className="mt-3 space-y-2">
            {!st.acts.length && <p className="text-[13px] text-gray-400">아직 적은 것이 없어요.</p>}
            {st.acts.map((a) => {
              const missing = missingOf(a)
              const locked = a.kind === '세특'
              return (
                <button key={a.id} onClick={() => !locked && openAct(a)} disabled={locked}
                  className="w-full text-left rounded-xl p-3 bg-white border disabled:opacity-60" style={{ borderColor: LINE }}>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: MINT, color: GREEN }}>{a.kind}</span>
                    {a.source === 'student' && <span className="text-[10px] text-gray-400">내가 적음</span>}
                  </div>
                  <div className="mt-1 text-sm font-semibold text-gray-800">{a.title}</div>
                  {locked ? (
                    <div className="mt-1 text-[11px] text-gray-400">선생님이 적는 칸이에요</div>
                  ) : missing.length ? (
                    <div className="mt-1 text-[11px]" style={{ color: '#9A3412' }}>아직 안 적은 것 — {missing.join(' · ')}</div>
                  ) : (
                    <div className="mt-1 text-[11px] text-gray-400">다 적었어요</div>
                  )}
                </button>
              )
            })}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-xl p-3" style={{ background: MINT }}>
          {openId === 'new' && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {st.kinds.map((k) => (
                <button key={k} onClick={() => setKind(k)} className="px-2.5 py-1 rounded-full text-xs border"
                  style={kind === k ? { background: GREEN, color: '#fff', borderColor: GREEN } : { background: '#fff', borderColor: LINE }}>{k}</button>
              ))}
            </div>
          )}
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200}
            placeholder="무엇을 했나요? (예: 사회 수행평가 — 쓰레기 소각장 주민 갈등)"
            className="w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }} />

          <div className="mt-2 space-y-2">
            {PART_LABELS.map((pl) => (
              <div key={pl.key}>
                <label className="text-[12px] font-bold" style={{ color: GREEN }}>{pl.label}</label>
                <div className="text-[11px] text-gray-500">{pl.hint}</div>
                <textarea value={parts[pl.key]} onChange={(e) => setParts({ ...parts, [pl.key]: e.target.value })}
                  rows={3} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white" style={{ borderColor: LINE }} />
              </div>
            ))}
          </div>

          {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setOpenId(null); setErr('') }} className="flex-1 py-2.5 rounded-xl text-sm border bg-white" style={{ borderColor: LINE }}>그만두기</button>
            <button onClick={save} disabled={busy} className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{ background: GREEN }}>
              {busy ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}

      <p className="mt-6 text-[11px] text-gray-400 leading-relaxed">
        여기 적은 것은 학원 선생님만 봅니다. 학교 학생부에는 <b>학교에서 한 것만</b> 선생님(학교)이 적습니다 —
        여기 적었다고 학생부에 들어가지는 않아요.
      </p>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen px-4 py-6" style={{ background: '#F7FAF9' }}>
      <div className="mx-auto w-full max-w-lg">{children}</div>
    </main>
  )
}
