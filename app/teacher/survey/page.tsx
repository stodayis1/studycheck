'use client'

// 설문 답 보기 — /teacher/survey (원장 전용)
//
// 원장님 2026-10-24 「설문조사로 앱으로 만들어서 … 링크 통해 후기 받는게」
// 링크로 들어온 답이 여기 쌓인다. 상담 신청자와 개설 희망 강좌 집계를 한 화면에서 본다.

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const GREEN = '#085041'
const MINT = '#F0FBF7'
const PEACH = '#F5C4B3'
const BROWN = '#712B13'

type Row = {
  id: string; created_at: string
  student_name: string | null; grade: string | null; school: string | null
  guardian_name: string | null; phone: string | null; study_now: string | null
  rating: string | null; helpful: string | null; want_more: string | null
  consult: boolean; consult_times: string[]; consult_how: string[]
  wish: string | null; courses: string[]; courses_etc: string | null
  agree_public: boolean; source: string
}

const when = (iso: string) => {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function SurveyPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [rows, setRows] = useState<Row[]>([])
  const [courses, setCourses] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [tab, setTab] = useState<'all' | 'consult' | 'wish'>('all')
  const [open, setOpen] = useState<string | null>(null)

  // ── 문자로 보내기 ────────────────────────────────────────────────
  const [smsOpen, setSmsOpen] = useState(false)
  const [scope, setScope] = useState<'all' | 'elementary' | 'middle' | 'high'>('all')
  const [useStudents, setUseStudents] = useState(true)
  const [extra, setExtra] = useState('')
  const [smsText, setSmsText] = useState(
    '[수학의지혜]\n오늘 설명회에 와 주셔서 고맙습니다.\n'
    + '짧은 설문 하나 부탁드립니다. 적어 주신 한 줄이 다음 수업을 바꿉니다.\n'
    + '상담 신청도 여기서 받습니다.\n'
    + 'https://studycheck-five.vercel.app/survey')
  const [pre, setPre] = useState<any>(null)
  const [smsBusy, setSmsBusy] = useState(false)
  const [smsErr, setSmsErr] = useState('')
  const [smsDone, setSmsDone] = useState<any>(null)
  // 받는 사람이나 글이 바뀌면 미리 센 값은 버린다 — 옛 숫자를 보고 보내면 안 된다.
  const resetPre = () => { setPre(null); setSmsDone(null) }

  async function ask(send: boolean) {
    setSmsBusy(true); setSmsErr('')
    try {
      const r = await apiFetch('/api/survey/sms', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: smsText, scope, useStudents, extraPhones: extra, send }),
      })
      const j = await r.json()
      if (!r.ok) { setSmsErr(j.error ?? '실패했어요.'); return null }
      return j
    } catch {
      setSmsErr('연결에 실패했어요.'); return null
    } finally { setSmsBusy(false) }
  }
  async function preview() { setSmsDone(null); const j = await ask(false); if (j) setPre(j) }
  async function reallySend() {
    if (!pre) return
    if (!confirm(pre.총번호 + '개 번호로 문자를 보냅니다.\n한 번 나가면 되돌릴 수 없어요.\n\n보낼까요?')) return
    const j = await ask(true)
    if (j) { setSmsDone(j); setPre(null) }
  }

  useEffect(() => {
    apiFetch('/api/survey?key=설명회')
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setErr(j.error); return }
        setRows(j.rows ?? []); setCourses(j.courses ?? [])
      })
      .catch(() => setErr('불러오지 못했어요.'))
      .finally(() => setLoading(false))
  }, [])

  // 개설 희망 강좌 집계 — 많이 고른 것부터
  const tally = useMemo(() => {
    const n = new Map<string, number>()
    for (const r of rows) for (const c of r.courses ?? []) n.set(c, (n.get(c) ?? 0) + 1)
    return [...n.entries()].sort((a, b) => b[1] - a[1])
  }, [rows])

  const 상담 = rows.filter((r) => r.consult)
  const shown = tab === 'consult' ? 상담
    : tab === 'wish' ? rows.filter((r) => (r.wish ?? '').trim() || (r.helpful ?? '').trim() || (r.want_more ?? '').trim())
      : rows

  if (authLoading) return <Wrap><P>불러오는 중…</P></Wrap>
  if (!isAdmin()) return <Wrap><P>원장님만 볼 수 있는 화면입니다.</P></Wrap>

  const LINK = 'https://studycheck-five.vercel.app/survey'

  return (
    <Wrap>
      {/* 보낼 링크 */}
      <div className="rounded-2xl px-4 py-3.5 mb-4" style={{ background: MINT, border: '1px solid #C7DED6' }}>
        <p className="text-xs font-bold mb-1.5" style={{ color: GREEN }}>학부모님께 보낼 링크</p>
        <div className="flex items-center gap-2 flex-wrap">
          <code className="flex-1 min-w-[220px] rounded-lg bg-white px-3 py-2 text-[12.5px] border">{LINK}</code>
          <button onClick={() => navigator.clipboard?.writeText(LINK).catch(() => {})}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: GREEN }}>
            주소 복사
          </button>
          <a href={LINK} target="_blank" rel="noreferrer"
            className="rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: GREEN, color: GREEN }}>
            직접 열어 보기
          </a>
          <button onClick={() => setSmsOpen((v) => !v)}
            className="rounded-lg px-3 py-2 text-xs font-bold text-white" style={{ background: BROWN }}>
            문자로 보내기
          </button>
        </div>

        {smsOpen && (
          <div className="mt-3 rounded-xl border bg-white p-3.5 space-y-3">
            <div>
              <p className="mb-1.5 text-[11.5px] font-bold text-gray-500">누구에게</p>
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {([['all', '전체'], ['elementary', '초등'], ['middle', '중등'], ['high', '고등']] as const)
                  .map(([k, l]) => (
                    <button key={k} onClick={() => { setScope(k); resetPre() }} disabled={!useStudents}
                      className="rounded-full border px-3 py-1.5 text-xs font-bold disabled:opacity-40"
                      style={scope === k ? { background: GREEN, color: '#fff', borderColor: GREEN }
                        : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}>
                      {l}
                    </button>
                  ))}
                <label className="ml-1 flex items-center gap-1.5 text-xs font-semibold text-gray-600">
                  <input type="checkbox" checked={useStudents}
                    onChange={(e) => { setUseStudents(e.target.checked); resetPre() }} />
                  재원생 보호자에게
                </label>
              </div>
              {/* ★ 설명회에는 재원생이 아닌 분도 오신다 (원장님 2026-10-24 「외부 학부모님도 … 17명 정도」) */}
              <p className="mb-1 text-[11.5px] font-bold text-gray-500">
                외부 학부모님 번호
                <span className="font-normal text-gray-400"> — 쉼표·줄바꿈 아무렇게나 붙여넣으세요</span>
              </p>
              <textarea value={extra} onChange={(e) => { setExtra(e.target.value); resetPre() }} rows={3}
                placeholder="010-1234-5678, 010-2345-6789 …"
                className="w-full rounded-lg border px-3 py-2 text-[13px]" />
            </div>

            <div>
              <p className="mb-1 text-[11.5px] font-bold text-gray-500">보낼 글</p>
              <textarea value={smsText} onChange={(e) => { setSmsText(e.target.value); resetPre() }} rows={6}
                className="w-full rounded-lg border px-3 py-2 text-[13px] leading-relaxed" />
              <p className="mt-1 text-[11px] text-gray-400">
                {smsText.length}자 · 주소만 41바이트라 어떻게 써도 장문(LMS)으로 나갑니다
              </p>
            </div>

            {smsErr && (
              <p className="rounded-lg px-3 py-2 text-xs font-semibold"
                style={{ background: '#FEE2E2', color: '#991B1B' }}>{smsErr}</p>
            )}

            {pre && (
              <div className="rounded-lg px-3 py-2.5 text-[12.5px]" style={{ background: MINT }}>
                <p className="font-bold" style={{ color: GREEN }}>
                  {pre.총번호}개 번호로 나갑니다
                  <span className="font-normal text-gray-500">
                    {' '}(재원생 {pre.학생수}명 · 외부 {pre.외부}명
                    {pre.한번호에여럿 ? ' · 같은 번호 쓰는 ' + pre.한번호에여럿 + '집은 한 통만' : ''})
                  </span>
                </p>
                {!!pre.미리보기?.length && (
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-gray-600">
                    {pre.미리보기.map((x: string, i: number) => <li key={i}>· {x}</li>)}
                    {pre.총번호 > pre.미리보기.length && (
                      <li className="text-gray-400">… 외 {pre.총번호 - pre.미리보기.length}개</li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {smsDone && (
              <div className="rounded-lg px-3 py-2.5 text-[12.5px]"
                style={{ background: smsDone.테스트모드 ? '#FEF3C7' : MINT }}>
                <p className="font-bold" style={{ color: smsDone.테스트모드 ? BROWN : GREEN }}>
                  {smsDone.테스트모드
                    ? '테스트 모드라 실제로는 안 나갔습니다 (' + smsDone.보냄 + '건 처리). 수학OPS 에서 테스트 모드를 꺼야 진짜로 나갑니다.'
                    : smsDone.보냄 + '개 번호로 보냈습니다.'}
                </p>
                {smsDone.실패?.length > 0 && (
                  <p className="mt-1 text-[11.5px]" style={{ color: '#991B1B' }}>
                    실패 {smsDone.실패.length}건 — {smsDone.실패.slice(0, 3).map((x: any) => x.phone + '(' + x.error + ')').join(', ')}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={preview} disabled={smsBusy}
                className="flex-1 rounded-lg border py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ borderColor: GREEN, color: GREEN }}>
                {smsBusy && !pre ? '세는 중…' : '몇 명에게 가는지 보기'}
              </button>
              <button onClick={reallySend} disabled={smsBusy || !pre}
                className="flex-1 rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-40"
                style={{ background: BROWN }}>
                {smsBusy && pre ? '보내는 중…' : '진짜로 보내기'}
              </button>
            </div>
            <p className="text-[11px] text-gray-400">
              먼저 「몇 명에게 가는지 보기」를 눌러야 보내기 단추가 열립니다. 한 번 나가면 되돌릴 수 없어요.
            </p>
          </div>
        )}
      </div>

      {err && <P>{err}</P>}
      {loading && <P>불러오는 중…</P>}

      {!loading && !err && (
        <>
          {/* 한눈에 */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat n={rows.length} label="받은 답" />
            <Stat n={상담.length} label="상담 신청" warm />
            <Stat n={rows.filter((r) => r.agree_public).length} label="후기 공개 동의" />
          </div>

          {/* 개설 희망 강좌 */}
          {tally.length > 0 && (
            <div className="rounded-2xl border p-4 mb-4">
              <p className="text-sm font-bold mb-2.5" style={{ color: GREEN }}>개설 희망 강좌</p>
              <div className="space-y-1.5">
                {tally.map(([c, n]) => (
                  <div key={c} className="flex items-center gap-2.5">
                    <span className="w-36 shrink-0 text-[12.5px] truncate">{c}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-gray-100 min-w-0">
                      <div className="h-full rounded-full"
                        style={{ background: GREEN, width: `${Math.round((n / (tally[0][1] || 1)) * 100)}%` }} />
                    </div>
                    <span className="w-7 shrink-0 text-right text-[12.5px] font-bold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 답 목록 */}
          <div className="flex gap-1.5 mb-2.5">
            {([['all', `전체 ${rows.length}`], ['consult', `상담 신청 ${상담.length}`], ['wish', '글 남기신 분']] as const)
              .map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-bold border"
                  style={tab === k ? { background: GREEN, color: '#fff', borderColor: GREEN }
                    : { background: '#fff', color: '#6b7280', borderColor: '#e5e7eb' }}>
                  {l}
                </button>
              ))}
          </div>

          {!shown.length && <P>{rows.length ? '해당하는 답이 없어요.' : '아직 받은 답이 없습니다.'}</P>}

          <div className="space-y-2">
            {shown.map((r) => (
              <div key={r.id} className="rounded-xl border bg-white">
                <button onClick={() => setOpen(open === r.id ? null : r.id)}
                  className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left flex-wrap">
                  <span className="font-bold text-[13.5px]">{r.student_name ?? '(이름 없음)'}</span>
                  {r.grade && <span className="text-[11.5px] text-gray-400">{r.grade}</span>}
                  {r.rating && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: MINT, color: GREEN }}>{r.rating}</span>
                  )}
                  {r.consult && (
                    <span className="rounded-md px-1.5 py-0.5 text-[11px] font-bold"
                      style={{ background: PEACH, color: BROWN }}>상담 신청</span>
                  )}
                  <span className="ml-auto text-[11.5px] text-gray-400 tabular-nums">{when(r.created_at)}</span>
                </button>
                {open === r.id && (
                  <div className="border-t bg-gray-50/70 px-3.5 py-3 text-[12.5px] space-y-2">
                    <L k="보호자">{[r.guardian_name, r.phone].filter(Boolean).join(' · ') || '-'}</L>
                    <L k="학교 · 지금 공부">{[r.school, r.study_now].filter(Boolean).join(' · ') || '-'}</L>
                    {r.consult && (
                      <L k="상담 희망">{[...(r.consult_times ?? []), ...(r.consult_how ?? [])].join(' · ') || '-'}</L>
                    )}
                    {r.helpful && <L k="도움이 된 내용">{r.helpful}</L>}
                    {r.want_more && <L k="더 듣고 싶은 것">{r.want_more}</L>}
                    {r.wish && <L k="바라는 점">{r.wish}</L>}
                    {(r.courses?.length || r.courses_etc) && (
                      <L k="희망 강좌">{[...(r.courses ?? []), r.courses_etc].filter(Boolean).join(' · ')}</L>
                    )}
                    <L k="후기 공개">{r.agree_public ? '동의하셨습니다' : '동의 안 하심'}</L>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Wrap>
  )
}

function L({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="w-24 shrink-0 font-semibold text-gray-500">{k}</span>
      <span className="flex-1 min-w-0 whitespace-pre-wrap">{children}</span>
    </div>
  )
}

function Stat({ n, label, warm }: { n: number; label: string; warm?: boolean }) {
  return (
    <div className="rounded-xl border px-3 py-3 text-center"
      style={warm ? { background: PEACH, borderColor: PEACH } : { background: '#fff' }}>
      <p className="text-2xl font-bold tabular-nums" style={{ color: warm ? BROWN : GREEN }}>{n}</p>
      <p className="mt-0.5 text-[11.5px]" style={{ color: warm ? BROWN : '#6b7280' }}>{label}</p>
    </div>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="py-10 text-center text-sm text-gray-400">{children}</p>
)

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="학부모 설문" subtitle="설명회 후기 · 상담 신청 · 개설 희망 강좌" />
      <div className="mx-auto max-w-3xl px-4 py-5">{children}</div>
    </div>
  )
}
