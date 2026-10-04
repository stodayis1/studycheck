'use client'

// 대표개념 연결 — 유형마다 '이건 무슨 개념인지'와 개념 동영상을 걸어 둔다 (원장 전용)
//
// 왜 유형에 거나
//   문항 27,359개(99.9%)가 유형코드를 갖고 있다. 유형에 한 번 걸면 그 유형의 문항이
//   전부 따라온다. 문항마다 거는 건 사람이 할 수 있는 양이 아니다.
//   특정 문항만 다르게 하고 싶으면 나중에 그 문항만 따로 덮어쓰면 된다.

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
}
type Concept = { id: string; chapter: string | null; subChapter: string | null; name: string }

const COURSES: [string, number][] = [
  ['중1', 1], ['중1', 2], ['중2', 1], ['중2', 2], ['중3', 1], ['중3', 2],
  ['공통수학1', 1], ['공통수학2', 1],
]

export default function TypeConceptsPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const [course, setCourse] = useState<[string, number]>(['중1', 1])
  const [rows, setRows] = useState<Row[]>([])
  const [concepts, setConcepts] = useState<Concept[]>([])
  const [summary, setSummary] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [onlyEmpty, setOnlyEmpty] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  const load = async () => {
    setLoading(true); setErr('')
    try {
      const r = await apiFetch(`/api/type-concepts?grade=${encodeURIComponent(course[0])}&semester=${course[1]}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
      setRows(j.types ?? []); setConcepts(j.concepts ?? []); setSummary(j.summary ?? null)
    } catch (e: any) { setErr(e.message) }
    setLoading(false)
  }
  useEffect(() => { load() }, [course[0], course[1]])

  const save = async (code: string, patch: Partial<Row>) => {
    const cur = rows.find((r) => r.code === code)
    if (!cur) return
    const next = { ...cur, ...patch }
    setRows((rs) => rs.map((r) => (r.code === code ? next : r)))
    setSaving(code)
    try {
      const r = await apiFetch('/api/type-concepts', {
        method: 'POST',
        body: JSON.stringify({
          typeCode: code, conceptId: next.conceptId, videoUrl: next.videoUrl,
          startSeconds: next.startSeconds, endSeconds: next.endSeconds, problemId: next.problemId,
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '저장하지 못했습니다.')
      setSummary((s: any) => {
        if (!s) return s
        const was = !!(cur.conceptId || cur.videoUrl)
        const now = !!(next.conceptId || next.videoUrl)
        if (was === now) return s
        const d = now ? 1 : -1
        return { ...s, linkedTypes: s.linkedTypes + d, linkedProblems: s.linkedProblems + d * next.problems }
      })
    } catch (e: any) {
      setErr(e.message)
      setRows((rs) => rs.map((r) => (r.code === code ? cur : r)))
    }
    setSaving(null)
  }

  const shown = useMemo(() => {
    const k = q.trim()
    return rows.filter((r) =>
      (!onlyEmpty || !(r.conceptId || r.videoUrl)) &&
      (!k || r.typeTitle.includes(k) || r.subTitle.includes(k) || r.code.includes(k)))
  }, [rows, q, onlyEmpty])

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
              <span className="text-xs text-gray-400">
                유형 하나를 걸면 그 유형의 문항이 전부 따라옵니다
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
            아직 안 건 것만
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
                        {saving === r.code && <span className="text-xs text-gray-400">저장 중…</span>}
                        {(r.conceptId || r.videoUrl) && saving !== r.code && (
                          <span className="text-xs" style={{ color: GREEN }}>연결됨</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={r.conceptId ?? ''}
                          onChange={(e) => save(r.code, { conceptId: e.target.value || null })}
                          className="min-w-[16rem] flex-1 rounded-lg border px-2 py-1.5 text-sm">
                          <option value="">— 대표개념 고르기 —</option>
                          {concepts.map((c) => (
                            <option key={c.id} value={c.id}>
                              {[c.chapter, c.subChapter].filter(Boolean).join(' · ')} — {c.name}
                            </option>
                          ))}
                        </select>
                        <input
                          defaultValue={r.videoUrl ?? ''}
                          onBlur={(e) => {
                            if ((e.target.value || '') !== (r.videoUrl ?? ''))
                              save(r.code, { videoUrl: e.target.value || null })
                          }}
                          placeholder="개념 동영상 주소 (나중에 넣어도 됩니다)"
                          className="min-w-[14rem] flex-1 rounded-lg border px-2 py-1.5 text-sm" />
                      </div>
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
      <Header title="대표개념 연결" subtitle="유형마다 개념과 개념 동영상을 걸어 둡니다" showBack />
      <div className="mx-auto max-w-[1100px]">{children}</div>
    </div>
  )
}
