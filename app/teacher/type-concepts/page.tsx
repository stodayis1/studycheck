'use client'

// 대표개념 연결 — 유형마다 걸린 강의영상을 **개념 → 증명 → 대표예제** 순서로 본다 (원장 전용)
//
// ★ 고르는 화면이 아니라 **보는 화면**이다 (원장님 2026-10-21
//   「여기서 내가 대표개념을 고를 필요가 있나? 정해져있는건데?
//     그냥 대표개념-증명(있을경우)-관련 필수예제 이렇게 목록이 띄워져 있는게 낫지」).
//   유형마다 어떤 개념·증명·대표예제인지는 강의영상(lesson_videos.type_codes)이 이미 들고 있다.
//   같은 것을 손으로 또 고르면 두 벌이 되고, 두 벌은 반드시 어긋난다.
//
// 왜 유형에 거나
//   문항 27,359개(99.9%)가 유형코드를 갖고 있다. 유형에 한 번 걸면 그 유형의 문항이
//   전부 따라온다. 문항마다 거는 건 사람이 할 수 있는 양이 아니다.

import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { courseLabel } from '@/lib/course'

const NAVY = '#0f3460'
const GREEN = '#0F6E56'

type Row = {
  code: string
  chapterNo: number; chapterTitle: string
  subNo: number; subTitle: string
  typeNo: number; typeTitle: string
  problems: number
  conceptId: string | null
  videoUrl: string | null
  startSeconds: number | null
  endSeconds: number | null
  problemId: number | null
  /** 이 유형을 덮는 수지쌤 강의영상들 (lesson_videos.type_codes 에서 온다) */
  videos: { kind: string; label: string; title: string; youtubeId: string | null; seconds: number | null }[]
}

const COURSES: [string, number][] = [
  ['중1', 1], ['중1', 2], ['중2', 1], ['중2', 2], ['중3', 1], ['중3', 2],
  ['공통수학1', 1], ['공통수학2', 1],
]

export default function TypeConceptsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [course, setCourse] = useState<[string, number]>(['중1', 1])
  const [rows, setRows] = useState<Row[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [onlyNoExample, setOnlyNoExample] = useState(false)

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const r = await apiFetch(`/api/type-concepts?grade=${encodeURIComponent(course[0])}&semester=${course[1]}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
      setRows(j.types ?? []); setSummary(j.summary ?? null)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [course[0], course[1]])

  const shown = useMemo(() => {
    const k = q.trim()
    return rows.filter((r) =>
      (!onlyEmpty || (r.videos ?? []).length === 0) &&
      (!onlyNoExample || !(r.videos ?? []).some((v) => v.kind === '대표예제')) &&
      (!k || r.typeTitle.includes(k) || r.subTitle.includes(k) || r.code.includes(k)))
  }, [rows, q, onlyEmpty, onlyNoExample])

  // 소단원으로 묶어 보여 준다
  const groups = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const r of shown) {
      const k = `${r.chapterNo}-${r.subNo}`
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(r)
    }
    return [...m.values()]
  }, [shown])

  if (authLoading) return <Shell><P>불러오는 중…</P></Shell>
  if (!isAdmin()) return <Shell><P>관리자만 접근할 수 있습니다.</P></Shell>

  return (
    <Shell>
      <div className="px-5 py-5">
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          {COURSES.map(([g, s]) => {
            const on = course[0] === g && course[1] === s
            return (
              <button key={`${g}-${s}`} onClick={() => setCourse([g, s])}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={on ? { background: NAVY, color: '#fff', borderColor: NAVY } : undefined}>
                {courseLabel(g, String(s))}
              </button>
            )
          })}
        </div>

        {summary && (
          <div className="mb-4 rounded-xl border bg-white px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
              <span>
                유형 <b style={{ color: NAVY }}>{summary.linkedTypes}</b>
                <span className="text-gray-400"> / {summary.types} 연결</span>
              </span>
              <span>
                문항 <b style={{ color: GREEN }}>{summary.linkedProblems.toLocaleString()}</b>
                <span className="text-gray-400"> / {summary.problems.toLocaleString()} 덮임</span>
              </span>
              {/* 강의영상이 유형을 얼마나 덮었나 — 대표예제를 어디까지 만들었는지 (원장님 2026-10-20) */}
              <span>
                개념영상 <b style={{ color: NAVY }}>{summary.conceptVideoTypes ?? 0}</b>
                <span className="text-gray-400"> / {summary.types} 유형</span>
              </span>
              <span>
                대표예제 영상 <b style={{ color: '#B45309' }}>{summary.exampleVideoTypes ?? 0}</b>
                <span className="text-gray-400"> / {summary.types} 유형</span>
              </span>
              <span className="text-xs text-gray-400">
                유형 하나에 영상이 걸리면 그 유형의 문항이 전부 따라옵니다
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded bg-gray-100">
              <div className="h-full rounded" style={{
                background: GREEN,
                width: `${summary.problems ? (summary.linkedProblems / summary.problems) * 100 : 0}%`,
              }} />
            </div>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="유형 이름 · 소단원 · 코드"
            className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none" />
          <label className="flex items-center gap-1.5 text-sm text-gray-600">
            <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
            강의영상 없는 것만
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
            <input type="checkbox" checked={onlyNoExample} onChange={(e) => setOnlyNoExample(e.target.checked)} />
            대표예제 영상 없는 것만
          </label>
        </div>

        {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
        {loading ? <P>불러오는 중…</P> : groups.length === 0 ? <P>해당하는 유형이 없습니다.</P> : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g[0].code} className="rounded-xl border bg-white">
                <div className="border-b px-4 py-2 text-sm font-bold" style={{ color: NAVY }}>
                  {String(g[0].subNo).padStart(2, '0')} {g[0].subTitle}
                  <span className="ml-2 text-xs font-normal text-gray-400">{g[0].chapterTitle}</span>
                </div>
                <div className="divide-y">
                  {g.map((r) => (
                    <div key={r.code} className="px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-baseline gap-2">
                        <span className="text-sm font-semibold">유형 {r.typeNo}</span>
                        <span className="text-sm">{r.typeTitle}</span>
                        <span className="text-xs text-gray-400">{r.problems}문항</span>
                        {(r.videos ?? []).length > 0 && (
                          <span className="text-xs" style={{ color: GREEN }}>영상 {(r.videos ?? []).length}편</span>
                        )}
                      </div>

                      {/* ★ 유형마다 걸린 강의영상을 **개념 → 증명 → 대표예제** 순서로 늘어놓는다.
                          고르는 칸은 없앴다 — 어느 개념인지는 영상이 이미 알고 있다
                          (원장님 2026-10-21 「정해져있는건데?」). */}
                      {(() => {
                        const ORDER = ['개념', '증명', '대표예제'] as const
                        const COLOR: Record<string, { bg: string; fg: string }> = {
                          개념: { bg: '#DBEAFE', fg: '#1D4ED8' },
                          증명: { bg: '#EDE9FE', fg: '#6D28D9' },
                          대표예제: { bg: '#FEF3C7', fg: '#B45309' },
                        }
                        const vids = [...(r.videos ?? [])].sort((a, b) =>
                          (ORDER.indexOf(a.kind as any) - ORDER.indexOf(b.kind as any))
                          || a.label.localeCompare(b.label, 'ko', { numeric: true }))
                        if (!vids.length) {
                          return <p className="mt-1 text-xs text-gray-300">강의영상이 아직 없습니다.</p>
                        }
                        return (
                          <div className="mt-1.5 divide-y rounded-lg border">
                            {vids.map((v, i) => {
                              const c = COLOR[v.kind] ?? COLOR.개념
                              const inner = (
                                <div className="flex items-center gap-2 px-3 py-2">
                                  <span className="w-[4.5rem] shrink-0 rounded-full px-2 py-0.5 text-center text-[11px] font-bold"
                                    style={{ background: c.bg, color: c.fg }}>{v.kind}</span>
                                  <span className="w-12 shrink-0 text-xs font-bold text-gray-500">{v.label}</span>
                                  <span className="flex-1 truncate text-sm">{v.title}</span>
                                  {v.youtubeId
                                    ? <span className="shrink-0 text-xs" style={{ color: GREEN }}>▶ 보기</span>
                                    : <span className="shrink-0 text-xs text-gray-300">안 올림</span>}
                                </div>
                              )
                              return v.youtubeId
                                ? <a key={i} href={`https://youtu.be/${v.youtubeId}`} target="_blank" rel="noreferrer"
                                    className="block hover:bg-gray-50">{inner}</a>
                                : <div key={i}>{inner}</div>
                            })}
                            {!vids.some((v) => v.kind === '대표예제') && (
                              <p className="px-3 py-1.5 text-[11px]" style={{ color: '#B45309' }}>
                                대표예제 영상은 아직 없습니다.
                              </p>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}

const P = ({ children }: { children: React.ReactNode }) => (
  <p className="py-10 text-center text-sm text-gray-400">{children}</p>
)

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="대표개념 연결" subtitle="유형마다 개념을 걸고, 걸린 강의영상(개념·증명·대표예제)을 함께 봅니다" showBack />
      <div className="mx-auto max-w-[1100px]">{children}</div>
    </div>
  )
}
