'use client'

// 출제한 학습지 목록 — /teacher/worksheets/list
//
// 한 번 출제한 학습지를 다시 찾아
//   · 그대로 다시 인쇄하고 (출력하기)
//   · 누가 풀었고 몇 점인지 보고 (줄을 누르면 펼쳐진다)
//   · 채점결과 화면으로 건너간다.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'
const GOLD = '#c8992e'
const GREEN = '#0F6E56'

type Sheet = {
  id: string
  code: string
  title: string
  grade: string | null
  semester: number | null
  note: string | null
  created_at: string
  problemCount: number
  takenCount: number
  avgScore: number | null
  students: string[]
}
type Grading = {
  id: string
  student_id: string | null
  student_name: string | null
  score: number | null
  total: number | null
  submitted_at: string | null
}

const fmt = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

function scoreColor(p: number) {
  if (p >= 80) return NAVY
  if (p >= 60) return '#D85A30'
  return '#dc2626'
}

export default function WorksheetListPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [gradeF, setGradeF] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, Grading[]>>({})
  const [busy, setBusy] = useState<string | null>(null)

  // 그 학생이 틀린 문제로 새 학습지를 만들어 인쇄 화면을 새 탭으로 연다
  const reprint = async (g: Grading, mode: 'wrong' | 'similar' | 'wrong+similar') => {
    setBusy(`${g.id}:${mode}`)
    try {
      const r = await apiFetch('/api/reprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingId: g.id, mode }),
      })
      const j = await r.json()
      if (!r.ok) {
        alert(j.error ?? '만들지 못했습니다.')
        return
      }
      window.open(`/teacher/gradings/print?code=${j.code}`, '_blank')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    apiFetch('/api/worksheets?limit=300')
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setSheets(j.sheets ?? [])
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  const grades = useMemo(
    () => Array.from(new Set(sheets.map((s) => s.grade).filter(Boolean))) as string[],
    [sheets]
  )

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase()
    return sheets.filter(
      (s) =>
        (!gradeF || s.grade === gradeF) &&
        (!k || s.title.toLowerCase().includes(k) || s.code.toLowerCase().includes(k))
    )
  }, [sheets, q, gradeF])

  const toggle = async (s: Sheet) => {
    if (open === s.id) {
      setOpen(null)
      return
    }
    setOpen(s.id)
    if (detail[s.id]) return
    const r = await apiFetch(`/api/worksheets?sheet=${s.id}`)
    const j = await r.json()
    setDetail((d) => ({ ...d, [s.id]: j.gradings ?? [] }))
  }

  if (authLoading) return <Wrap><P>불러오는 중…</P></Wrap>
  if (!isAdmin()) return <Wrap><P>원장님만 볼 수 있는 화면입니다.</P></Wrap>

  return (
    <Wrap>
      {/* 찾기 줄 */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <i className="ti ti-search absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="학습지 이름 또는 코드로 찾기"
            className="w-full border rounded-xl pl-9 pr-3 py-2.5 text-sm"
          />
        </div>
        <select
          value={gradeF}
          onChange={(e) => setGradeF(e.target.value)}
          className="border rounded-xl px-3 py-2.5 text-sm"
        >
          <option value="">과정 전체</option>
          {grades.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <Link
          href="/teacher/worksheets"
          className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
          style={{ background: NAVY }}
        >
          <i className="ti ti-file-plus mr-1" />새 학습지 출제
        </Link>
      </div>

      {err && <P>{err}</P>}
      {loading && <P>불러오는 중…</P>}
      {!loading && !err && !shown.length && <P>출제한 학습지가 없습니다.</P>}

      <div className="space-y-2">
        {shown.map((s) => (
          <div key={s.id} className="border rounded-2xl bg-white overflow-hidden">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
              <button onClick={() => toggle(s)} className="flex-1 min-w-[180px] text-left">
                <div className="flex items-center gap-2">
                  <i className={`ti ti-chevron-${open === s.id ? 'down' : 'right'} text-gray-300`} />
                  <span className="font-semibold" style={{ color: NAVY }}>{s.title}</span>
                </div>
                <div className="mt-1 ml-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-gray-400">
                  <span>{fmt(s.created_at)}</span>
                  {s.grade && (
                    <>
                      <Dot />
                      <span>{s.grade}{s.semester ? `-${s.semester}` : ''}</span>
                    </>
                  )}
                  <Dot />
                  <span>{s.problemCount}문항</span>
                  <Dot />
                  <span className="tracking-wider" style={{ color: GOLD }}>{s.code}</span>
                </div>
              </button>

              {/* 응시 현황 */}
              <div className="flex items-center gap-2 min-w-[150px]">
                {s.takenCount ? (
                  <>
                    <span className="text-sm text-gray-500">{s.takenCount}명 제출</span>
                    <span
                      className="text-lg font-extrabold"
                      style={{ color: scoreColor(s.avgScore ?? 0) }}
                    >
                      평균 {s.avgScore}점
                    </span>
                  </>
                ) : (
                  <span className="text-sm text-gray-300">아직 제출 없음</span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <a
                  href={`/teacher/gradings/print?code=${s.code}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: GREEN }}
                >
                  <i className="ti ti-printer mr-1" />출력하기
                </a>
                <Link
                  href="/teacher/gradings"
                  className="px-3 py-2 rounded-lg border text-sm text-gray-600"
                >
                  채점결과
                </Link>
              </div>
            </div>

            {/* 학생별 점수 */}
            {open === s.id && (
              <div className="border-t bg-gray-50/70 px-4 py-3">
                {!detail[s.id] ? (
                  <p className="text-sm text-gray-400">불러오는 중…</p>
                ) : !detail[s.id].length ? (
                  <p className="text-sm text-gray-400">
                    아직 아무도 제출하지 않았습니다. 시험지의 QR을 찍으면 채점됩니다.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {detail[s.id].map((g) => {
                      const pct = g.total ? Math.round(((g.score ?? 0) / g.total) * 100) : 0
                      const wrong = (g.total ?? 0) - (g.score ?? 0)
                      return (
                        <div
                          key={g.id}
                          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 bg-white border rounded-xl px-3 py-2"
                        >
                          <span className="w-20 truncate text-sm font-medium">
                            {g.student_name ?? '이름 없음'}
                          </span>
                          <span className="font-bold w-12" style={{ color: scoreColor(pct) }}>
                            {pct}점
                          </span>
                          <span className="text-[11px] text-gray-400 w-24">
                            {g.total}문항 중 {wrong}개 틀림
                          </span>
                          {/* 이 학생 오답으로 바로 다시 뽑기 */}
                          <div className="ml-auto flex items-center gap-1">
                            {wrong > 0 ? (
                              ([
                                ['wrong', '오답'],
                                ['similar', '유사문항'],
                                ['wrong+similar', '오답＋유사'],
                              ] as const).map(([m, label]) => (
                                <button
                                  key={m}
                                  onClick={() => reprint(g, m)}
                                  disabled={busy === `${g.id}:${m}`}
                                  className="px-2.5 py-1.5 rounded-lg border text-[12px] text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                >
                                  {busy === `${g.id}:${m}` ? '만드는 중…' : label}
                                </button>
                              ))
                            ) : (
                              <span className="text-[11px] text-gray-300">다 맞았습니다</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </Wrap>
  )
}

const Dot = () => <span className="text-gray-200">·</span>
const P = ({ children }: { children: React.ReactNode }) => (
  <p className="py-10 text-center text-gray-400 text-sm">{children}</p>
)

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="출제한 학습지" subtitle="다시 인쇄하고, 누가 몇 점인지 봅니다" />
      <div className="max-w-[1100px] mx-auto px-4 py-5">{children}</div>
    </div>
  )
}
