'use client'

// 월간 학습 리포트 — 달과 학생을 고르고, 보고, 링크를 찍는다 (원장 전용)
//
// 원장님 2026-10-20
//   리딩온어학원 양식을 보시고 「이런식으로 나도 학생들 한달에 한번 리포트를 만들건데」
//
// ★ 미리보기와 학부모님이 보시는 화면이 **같은 것**이다(components/report/MonthlyReport).
//   따로 그리면 보이는 것과 나가는 것이 어긋나고, 그 어긋남은 아무도 못 잡는다.
// ★ 「링크 만들기」는 주소만 찍는다. **보내지 않는다** — 보내는 것은 원장님이 보고 결정하신다.
import { useEffect, useMemo, useState } from 'react'
import { Header } from '@/components/common/Header'
import { supabase } from '@/lib/supabase'
import { apiFetch } from '@/lib/apiFetch'
import { useAuth } from '@/hooks/useAuth'
import { cx } from '@/lib/utils'
import { MonthlyReportView } from '@/components/report/MonthlyReport'
import { tierOf } from '@/lib/monthlyReport'

const INK = '#712B13'
const MINT = '#9FE1CB'

type Student = { id: string; name: string; grade: string; school: string | null; teacher_name: string | null }

export default function MonthlyReportPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const kst = new Date(Date.now() + 9 * 3600_000)
  const [year, setYear] = useState(kst.getUTCFullYear())
  const [month, setMonth] = useState(kst.getUTCMonth() + 1)   // 이번 달이 기본
  const [students, setStudents] = useState<Student[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [preview, setPreview] = useState<any>(null)
  const [previewOf, setPreviewOf] = useState<string | null>(null)
  const [talk, setTalk] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [links, setLinks] = useState<{ name: string; url: string | null; error?: string }[] | null>(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    supabase.from('students').select('id, name, grade, school, teacher_name')
      .eq('is_active', true).order('grade').order('name')
      .then(({ data }) => setStudents((data ?? []) as Student[]))
  }, [])

  const shown = useMemo(() => {
    const k = q.trim()
    return students.filter((s) => !k || s.name.includes(k) || (s.school ?? '').includes(k) || s.grade.includes(k))
  }, [students, q])

  // 학년(초·중·고)으로 묶어 보여 준다 — 리포트 칸이 급마다 다르다
  const groups = useMemo(() => {
    const m = new Map<string, Student[]>()
    for (const s of shown) {
      const t = tierOf(s.grade)
      if (!m.has(t)) m.set(t, [])
      m.get(t)!.push(s)
    }
    return [...m.entries()].sort((a, b) => ['초등', '중등', '고등'].indexOf(a[0]) - ['초등', '중등', '고등'].indexOf(b[0]))
  }, [shown])

  async function showPreview(s: Student) {
    setErr(''); setPreviewOf(s.id); setPreview(null)
    try {
      const r = await apiFetch(`/api/monthly-report?studentId=${s.id}&year=${year}&month=${month}`)
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '불러오지 못했어요.')
      setPreview({ ...j.data, principalTalk: talk[s.id] || null })
    } catch (e: any) { setErr(e.message); setPreviewOf(null) }
  }

  async function makeLinks() {
    if (!picked.size) { alert('학생을 고르세요.'); return }
    if (!confirm(`${picked.size}명의 ${year}년 ${month}월 리포트 링크를 만들까요?\n만들기만 하고 보내지는 않습니다.`)) return
    setBusy(true); setErr(''); setLinks(null)
    try {
      const r = await apiFetch('/api/monthly-report', {
        method: 'POST',
        body: JSON.stringify({ studentIds: [...picked], year, month, talk }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? '만들지 못했어요.')
      setLinks(j.links)
    } catch (e: any) { setErr(e.message) }
    setBusy(false)
  }

  if (authLoading) return <Shell><P>불러오는 중…</P></Shell>
  if (!isAdmin()) return <Shell><P>원장님만 볼 수 있어요.</P></Shell>

  return (
    <Shell>
      <div className="px-5 py-5">
        {/* 달 고르기 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPreview(null) }}
            className="rounded-lg border px-3 py-2 text-sm">
            {[kst.getUTCFullYear(), kst.getUTCFullYear() - 1].map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <button key={m} onClick={() => { setMonth(m); setPreview(null) }}
                className="rounded-lg border px-2.5 py-1.5 text-sm"
                style={month === m ? { background: INK, color: '#fff', borderColor: INK } : undefined}>{m}월</button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[22rem_1fr] items-start">
          {/* 왼쪽 — 학생 고르기 */}
          <div className="rounded-xl border bg-white">
            <div className="border-b px-4 py-2.5 flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: INK }}>학생 {picked.size}명 선택</span>
              <button onClick={() => setPicked(new Set())} className="text-xs text-gray-400">지우기</button>
            </div>
            <div className="p-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 학교 · 학년"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none mb-2" />
              <div className="max-h-[52vh] overflow-y-auto space-y-3">
                {groups.map(([tier, list]) => (
                  <div key={tier}>
                    <div className="flex items-center justify-between px-1 mb-1">
                      <span className="text-xs font-bold text-gray-500">{tier} {list.length}명</span>
                      <button className="text-[11px]" style={{ color: INK }}
                        onClick={() => setPicked((p) => { const n = new Set(p); list.forEach((s) => n.add(s.id)); return n })}>
                        모두 고르기
                      </button>
                    </div>
                    {list.map((s) => (
                      <div key={s.id} className={cx('flex items-center gap-2 rounded-lg px-2 py-1.5',
                        previewOf === s.id && 'bg-gray-50')}>
                        <input type="checkbox" checked={picked.has(s.id)}
                          onChange={(e) => setPicked((p) => {
                            const n = new Set(p); e.target.checked ? n.add(s.id) : n.delete(s.id); return n
                          })} />
                        <button onClick={() => showPreview(s)} className="flex-1 text-left min-w-0">
                          <span className="text-sm font-semibold">{s.name}</span>
                          <span className="ml-1.5 text-[11px] text-gray-400">{s.grade}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t p-3">
              <button onClick={makeLinks} disabled={busy || !picked.size}
                className="w-full rounded-lg py-2.5 text-sm font-bold disabled:opacity-50"
                style={{ background: MINT, color: INK }}>
                {busy ? '만드는 중…' : `${picked.size}명 링크 만들기`}
              </button>
              <p className="mt-1.5 text-[11px] text-gray-400">만들기만 합니다. 보내지는 않아요.</p>
            </div>
          </div>

          {/* 오른쪽 — 미리보기 */}
          <div>
            {err && <p className="mb-2 text-sm text-red-600">{err}</p>}
            {links && (
              <div className="mb-3 rounded-xl border bg-white p-4">
                <p className="mb-2 text-sm font-bold" style={{ color: INK }}>링크 {links.length}개를 만들었습니다</p>
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {links.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-16 shrink-0 font-semibold">{l.name}</span>
                      {l.url
                        ? <a href={l.url} target="_blank" rel="noreferrer" className="truncate" style={{ color: INK }}>{l.url}</a>
                        : <span className="text-red-500">{l.error}</span>}
                    </div>
                  ))}
                </div>
                <button onClick={() => navigator.clipboard.writeText(links.filter((l) => l.url).map((l) => `${l.name} ${l.url}`).join('\n'))}
                  className="mt-2 rounded-lg border px-3 py-1.5 text-xs font-semibold">전체 복사</button>
              </div>
            )}

            {previewOf && (
              <div className="mb-3 rounded-xl border bg-white p-4">
                <label className="mb-1.5 block text-xs font-bold" style={{ color: INK }}>
                  원장 Talk <span className="font-normal text-gray-400">· 비우면 기본 문장이 들어갑니다</span>
                </label>
                <textarea rows={3} value={talk[previewOf] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setTalk((t) => ({ ...t, [previewOf]: v }))
                    setPreview((p: any) => p && { ...p, principalTalk: v || null })
                  }}
                  placeholder="어머님께 드릴 말씀을 적으시면 리포트 마지막 칸에 그대로 들어갑니다."
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none" />
              </div>
            )}

            {preview
              ? <div className="overflow-x-auto rounded-xl border bg-white"><MonthlyReportView d={preview} /></div>
              : <div className="rounded-xl border bg-white py-20 text-center text-sm text-gray-400">
                  왼쪽에서 학생 이름을 누르면 리포트가 보입니다.
                </div>}
          </div>
        </div>
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
      <Header title="월간 학습 리포트" subtitle="한 달에 한 번, 학부모님께 보내 드리는 리포트" showBack />
      <div className="mx-auto max-w-[1400px]">{children}</div>
    </div>
  )
}
