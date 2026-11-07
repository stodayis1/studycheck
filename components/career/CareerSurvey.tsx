'use client'

// 진로 설문 화면 — 학생(/student/career)·학부모(/parent/career) 공용.
//   1) 개인정보 수집·이용 동의 (입학 동의와 별도, 필수에 동의해야 다음으로)
//   2) 설문 (예비고1 = 현 중3 · 예비고2 = 현 고1)
//   3) 낸 뒤에도 다시 열어 고칠 수 있다. 동의 철회도 여기서.
//
// ★ 본인 확인은 서버(/api/career)가 로그인 토큰으로 한다. 이 화면은 학생 id 를 보내지 않는다.
// ★ 카카오톡 인앱 브라우저에서도 열린다 — useSearchParams 를 쓰지 않는다.
//   보내기가 실패하면 적은 내용을 그대로 두고 다시 누르게 한다.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { apiFetch } from '@/lib/apiFetch'
import { CONSENT_TEXT, FORMS, questionsOf, type FormId } from '@/lib/careerSurvey'

const GREEN = '#085041'
const MINT = '#F0FBF7'
const LINE = '#C7DED6'

type Consent = { signer_name: string; optional_agreed: boolean; agreed_at: string }
type State = {
  role: 'student' | 'parent'
  student: { name: string; grade: string | null }
  form: FormId | null
  consent: Consent | null
  answers: Record<string, string | string[]> | null
  answeredAt: string | null
}

export default function CareerSurvey() {
  const router = useRouter()
  const [st, setSt] = useState<State | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [editing, setEditing] = useState(false)
  const [ans, setAns] = useState<Record<string, string | string[]>>({})
  const [signer, setSigner] = useState('')
  const [reqOk, setReqOk] = useState(false)
  const [optOk, setOptOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')

  async function load() {
    try {
      if (!sessionStorage.getItem('studycheck_student')) { router.push('/auth/login'); return }
    } catch { /* 저장소를 못 쓰는 브라우저 — 서버 답으로 판단 */ }
    const r = await apiFetch('/api/career')
    if (r.status === 401) { setLoadErr('로그인이 풀렸어요. 다시 로그인해 주세요.'); return }
    const j = await r.json().catch((): any => null)
    if (!r.ok || !j) { setLoadErr(j?.error ?? '불러오지 못했어요. 잠시 뒤 다시 열어 주세요.'); return }
    setSt(j)
    setAns(j.answers ?? {})
    setEditing(!j.answers)
  }
  useEffect(() => { load() }, [])

  async function post(body: object) {
    setBusy(true); setErr('')
    try {
      const r = await apiFetch('/api/career', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error ?? '저장하지 못했어요. 다시 눌러 주세요.'); return null }
      return j
    } catch {
      setErr('인터넷 연결을 확인하고 다시 눌러 주세요.'); return null
    } finally { setBusy(false) }
  }

  async function agree() {
    if (!reqOk) { setErr('필수 항목에 동의해 주셔야 설문을 할 수 있어요.'); return }
    const j = await post({ action: 'consent', signer_name: signer, required: true, optional: optOk })
    if (j) setSt((p) => p && { ...p, consent: j.consent })
  }
  async function revoke() {
    if (!confirm('동의를 철회할까요? 철회하면 진로 맞춤 안내를 받으실 수 없어요.')) return
    const j = await post({ action: 'revoke' })
    if (j) { setSt((p) => p && { ...p, consent: null }); setMsg('동의를 철회했어요.') }
  }
  async function submit() {
    const j = await post({ action: 'answer', answers: ans })
    if (j) {
      setSt((p) => p && { ...p, answers: ans, answeredAt: new Date().toISOString() })
      setEditing(false); setMsg('설문을 보냈어요. 고맙습니다!')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const title = '진로 설문'
  if (loadErr) return (
    <div><Header title={title} />
      <div className="p-6 text-center text-sm text-gray-600">
        <p>{loadErr}</p>
        <button onClick={() => router.push('/auth/login')} className="mt-4 px-4 py-2 rounded-xl text-white" style={{ background: GREEN }}>로그인</button>
      </div>
    </div>
  )
  if (!st) return <div><Header title={title} /><div className="p-10 text-center text-gray-400 text-sm">불러오는 중…</div></div>

  const who = st.role === 'parent' ? `${st.student.name} 학생 학부모님` : `${st.student.name} 학생`
  const form = st.form

  return (
    <div>
      <Header title={title} subtitle={form ? `${FORMS[form].label} · ${who}` : who} showBack />
      <div className="p-4 space-y-4">
        {msg && <div className="rounded-xl p-3 text-sm" style={{ background: MINT, color: GREEN }}>{msg}</div>}

        {!form && (
          <div className="rounded-2xl bg-white p-5 text-sm text-gray-600">
            지금 학년({st.student.grade ?? '-'})에는 진로 설문이 없어요.
          </div>
        )}

        {/* 1) 동의 */}
        {form && !st.consent && (
          <section className="rounded-2xl bg-white p-5 space-y-3" style={{ border: `1px solid ${LINE}` }}>
            <h2 className="font-bold" style={{ color: GREEN }}>{CONSENT_TEXT.title}</h2>
            <p className="text-sm text-gray-600">{CONSENT_TEXT.intro}</p>
            <table className="w-full text-xs border-collapse">
              <tbody>
                {CONSENT_TEXT.rows.map(([k, v]) => (
                  <tr key={k} className="border-t" style={{ borderColor: LINE }}>
                    <th className="text-left align-top py-2 pr-2 w-24 font-semibold text-gray-700">{k}</th>
                    <td className="py-2 text-gray-600">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-gray-500">{CONSENT_TEXT.refuse}</p>
            <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={reqOk} onChange={(e) => setReqOk(e.target.checked)} />{CONSENT_TEXT.required}</label>
            <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={optOk} onChange={(e) => setOptOk(e.target.checked)} />{CONSENT_TEXT.optional}</label>
            <input value={signer} onChange={(e) => setSigner(e.target.value)} maxLength={20}
              placeholder={st.role === 'parent' ? '동의하시는 보호자 성함' : '내 이름'}
              className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button disabled={busy} onClick={agree} className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: GREEN }}>
              {busy ? '저장 중…' : '동의하고 설문 시작'}
            </button>
          </section>
        )}

        {/* 2) 설문 */}
        {form && st.consent && (
          <>
            <div className="rounded-2xl p-4 text-sm" style={{ background: MINT, color: GREEN }}>
              {FORMS[form].desc}
              {st.answeredAt && !editing && <div className="mt-1 text-xs opacity-80">보낸 날: {new Date(st.answeredAt).toLocaleDateString('ko-KR')}</div>}
            </div>

            <section className="rounded-2xl bg-white p-5 space-y-5" style={{ border: `1px solid ${LINE}` }}>
              {questionsOf(form).map((q) => {
                const v = ans[q.id]
                const arr = Array.isArray(v) ? v : []
                return (
                  <div key={q.id}>
                    <div className="text-sm font-semibold text-gray-800">{q.label}</div>
                    {q.help && <div className="text-xs text-gray-400 mt-0.5">{q.help}</div>}
                    <div className="mt-2">
                      {(q.type === 'single' || q.type === 'multi') && (
                        <div className="flex flex-wrap gap-2">
                          {q.options!.map((o) => {
                            const on = q.type === 'single' ? v === o : arr.includes(o)
                            return (
                              <button key={o} type="button" disabled={!editing}
                                onClick={() => {
                                  setAns((p) => {
                                    if (q.type === 'single') return { ...p, [q.id]: on ? '' : o }
                                    if (on) return { ...p, [q.id]: arr.filter((x) => x !== o) }
                                    if (q.max && arr.length >= q.max) return p
                                    return { ...p, [q.id]: [...arr, o] }
                                  })
                                }}
                                className="px-3 py-1.5 rounded-full text-sm border transition-colors"
                                style={on ? { background: GREEN, color: '#fff', borderColor: GREEN } : { borderColor: LINE, color: '#374151' }}>
                                {o}
                              </button>
                            )
                          })}
                        </div>
                      )}
                      {q.type === 'text' && (
                        <input value={(v as string) ?? ''} readOnly={!editing} maxLength={q.max}
                          onChange={(e) => setAns((p) => ({ ...p, [q.id]: e.target.value }))}
                          className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
                      )}
                      {q.type === 'textarea' && (
                        <textarea value={(v as string) ?? ''} readOnly={!editing} maxLength={q.max} rows={3}
                          onChange={(e) => setAns((p) => ({ ...p, [q.id]: e.target.value }))}
                          className="w-full rounded-xl border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
                      )}
                    </div>
                  </div>
                )
              })}
              {err && <p className="text-sm text-red-600">{err}</p>}
              {editing ? (
                <button disabled={busy} onClick={submit} className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50" style={{ background: GREEN }}>
                  {busy ? '보내는 중…' : st.answers ? '고친 내용 보내기' : '설문 보내기'}
                </button>
              ) : (
                <button onClick={() => { setEditing(true); setMsg('') }} className="w-full py-3 rounded-xl font-semibold border" style={{ borderColor: GREEN, color: GREEN }}>
                  답 고치기
                </button>
              )}
            </section>

            <div className="text-xs text-gray-400 text-center space-y-1 pb-4">
              <div>{st.consent.signer_name}님이 {new Date(st.consent.agreed_at).toLocaleDateString('ko-KR')}에 동의함
                {st.consent.optional_agreed ? ' (학생부 내용 포함)' : ''}</div>
              <button onClick={revoke} disabled={busy} className="underline">동의 철회</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
