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
        </div>
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
