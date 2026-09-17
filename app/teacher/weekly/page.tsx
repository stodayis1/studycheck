'use client'

// 주간 학습현황 — 담당 학생 × 요일 표.
// 색배지를 누르면 그날 기록이 뜨고, QR로 채점한 시험지면 거기서 바로 오답·유사 문제를 출제한다.

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'
const GOLD = '#c8992e'

type Badge = {
  kind: 'book' | 'sheet' | 'test' | 'exam' | 'attend'
  label: string
  value: number | null
  unit?: string
  title?: string
  score?: number
  total?: number
  gradingId?: string
  code?: string
}
type Student = {
  id: string; name: string; grade: string | null; school: string | null
  teacher_name: string | null; class_time: string | null; on_leave: boolean | null
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const mondayOf = (d: Date) => { const x = new Date(d); const g = (x.getDay() + 6) % 7; x.setDate(x.getDate() - g); return x }

// 점수대별 색 — 한눈에 잘한 날/못한 날이 보이게
function tone(kind: Badge['kind'], v: number | null) {
  if (kind === 'attend') return { bg: '#f1f5f9', fg: '#64748b', bd: '#cbd5e1' }
  if (v == null) return { bg: '#f8fafc', fg: '#475569', bd: '#e2e8f0' }
  if (v >= 90) return { bg: '#dcfce7', fg: '#15803d', bd: '#86efac' }
  if (v >= 70) return { bg: '#e0f2fe', fg: '#0369a1', bd: '#7dd3fc' }
  if (v >= 50) return { bg: '#fef3c7', fg: '#b45309', bd: '#fcd34d' }
  return { bg: '#fee2e2', fg: '#b91c1c', bd: '#fca5a5' }
}
const KIND_LABEL: Record<Badge['kind'], string> = {
  book: '교재', sheet: '학습지', test: '테스트', exam: '시험지', attend: '출결',
}

export default function WeeklyPage() {
  const {
    currentUser, isAdmin, canManageAllStudents, canViewStudent,
    isSupervisorAccount, isSupervisorModeActive, supervisorLabel,
    loading: authLoading,
  } = useAuth()
  const router = useRouter()

  const [monday, setMonday] = useState(() => mondayOf(new Date()))
  const [students, setStudents] = useState<Student[]>([])
  const [cells, setCells] = useState<Record<string, Record<string, Badge[]>>>({})
  const [loading, setLoading] = useState(true)
  const [grade, setGrade] = useState('')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<{ student: Student; date: string; badges: Badge[] } | null>(null)
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d }),
    [monday]
  )

  useEffect(() => {
    let dead = false
    setLoading(true)
    const from = ymd(dates[0]), to = ymd(dates[6])
    apiFetch(`/api/weekly?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((d) => { if (!dead) { setStudents(d.students ?? []); setCells(d.cells ?? {}) } })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [monday])

  // 볼 수 있는 범위는 계정이 정한다 (useAuth.canViewStudent 한 곳에서 판단)
  //  · 원장·직원      → 전체
  //  · 주임(주임모드) → 담당 학년 전체 (예: 중등주임 → 중1~중3)
  //  · 일반 강사      → 본인 담당 학생만
  const rows = useMemo(() => {
    let list = students.filter((s) => canViewStudent(s))
    if (grade) list = list.filter((s) => s.grade === grade)
    if (q.trim()) list = list.filter((s) => s.name.includes(q.trim()))
    return list
  }, [students, grade, q, currentUser, isSupervisorModeActive()])

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade).filter(Boolean))].sort() as string[],
    [students]
  )

  // 그 주에 재출제할 수 있는(=QR로 채점한) 기록만 모은다
  const examsOf = (sid: string) =>
    dates.flatMap((d) => (cells[sid]?.[ymd(d)] ?? []).filter((b) => b.kind === 'exam' && b.gradingId))

  const reprint = async (gradingId: string, mode: 'wrong' | 'twin' | 'similar') => {
    setBusy(gradingId + mode); setMsg('')
    try {
      const r = await apiFetch('/api/reprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingId, mode }),
      })
      const d = await r.json()
      if (!r.ok) { setMsg(d.error ?? '출제에 실패했습니다.'); return }
      router.push(`/teacher/gradings/print?code=${d.code}`)
    } finally { setBusy('') }
  }

  // 고른 학생들에 대해 한 번에 유사문제 만들기
  const bulk = async (mode: 'wrong' | 'similar') => {
    const targets = [...picked].flatMap((sid) => {
      const last = examsOf(sid).at(-1)
      return last?.gradingId ? [{ sid, gradingId: last.gradingId }] : []
    })
    if (!targets.length) { setMsg('고른 학생 중 이번 주 QR 채점 기록이 있는 학생이 없습니다.'); return }
    setBusy('bulk'); setMsg('')
    const made: string[] = []
    for (const t of targets) {
      const r = await apiFetch('/api/reprint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradingId: t.gradingId, mode }),
      })
      const d = await r.json()
      if (r.ok) made.push(d.code)
    }
    setBusy('')
    setMsg(made.length
      ? `${made.length}명 출제 완료 — 아래 코드를 눌러 인쇄하세요: ${made.join(', ')}`
      : '출제에 실패했습니다.')
    setBulkCodes(made)
  }
  const [bulkCodes, setBulkCodes] = useState<string[]>([])

  if (authLoading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>

  return (
    <Shell>
      {/* 도구 모음 */}
      <div className="px-5 py-3 flex flex-wrap items-center gap-2 border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-1">
          <button onClick={() => { const d = new Date(monday); d.setDate(d.getDate() - 7); setMonday(d) }}
            className="w-8 h-8 rounded-lg border hover:bg-gray-50">‹</button>
          <button onClick={() => setMonday(mondayOf(new Date()))}
            className="px-3 h-8 rounded-lg border text-xs hover:bg-gray-50">이번 주</button>
          <button onClick={() => { const d = new Date(monday); d.setDate(d.getDate() + 7); setMonday(d) }}
            className="w-8 h-8 rounded-lg border hover:bg-gray-50">›</button>
        </div>
        <span className="text-sm font-semibold" style={{ color: NAVY }}>
          {ymd(dates[0]).slice(5)} ~ {ymd(dates[6]).slice(5)}
        </span>

        <span className="px-2.5 h-8 inline-flex items-center rounded-lg text-xs border"
          style={{ background: '#eef2f8', color: NAVY, borderColor: '#c7d2e4' }}>
          {canManageAllStudents()
            ? '전체 학생'
            : isSupervisorModeActive()
              ? `${supervisorLabel() ?? '주임'} · 담당 학년 전체`
              : '내 담당 학생'}
        </span>

        <select value={grade} onChange={(e) => setGrade(e.target.value)}
          className="h-8 rounded-lg border text-xs px-2">
          <option value="">학년 전체</option>
          {grades.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>

        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="학생 이름"
          className="h-8 rounded-lg border text-xs px-2 w-28" />

        <div className="flex-1" />

        <span className="text-xs text-gray-400">{rows.length}명</span>
        <button onClick={() => bulk('similar')} disabled={picked.size === 0 || busy === 'bulk'}
          className="px-3 h-8 rounded-lg text-white text-xs font-semibold disabled:opacity-40"
          style={{ background: GOLD }}>
          {busy === 'bulk' ? '출제 중…' : `오답유사 출제${picked.size ? ` (${picked.size})` : ''}`}
        </button>
      </div>

      {msg && (
        <div className="px-5 py-2 text-xs bg-amber-50 border-b text-amber-800">
          {msg}
          {bulkCodes.length > 0 && (
            <span className="ml-2 flex flex-wrap gap-1 mt-1">
              {bulkCodes.map((c) => (
                <button key={c} onClick={() => router.push(`/teacher/gradings/print?code=${c}`)}
                  className="px-2 py-0.5 rounded border bg-white hover:bg-gray-50">{c} 인쇄</button>
              ))}
            </span>
          )}
        </div>
      )}

      {/* 표 */}
      <div className="overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-50">
            <tr>
              <th className="w-8 border-b p-2"></th>
              <th className="border-b p-2 text-left min-w-[130px]">학생</th>
              {dates.map((d) => (
                <th key={ymd(d)} className="border-b p-2 text-center min-w-[120px] font-medium">
                  <div className="text-xs text-gray-500">{d.getMonth() + 1}/{d.getDate()}</div>
                  <div className={`text-[11px] ${d.getDay() === 0 ? 'text-red-500' : d.getDay() === 6 ? 'text-blue-500' : 'text-gray-400'}`}>
                    {DAYS[d.getDay()]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="p-10 text-center text-gray-400">불러오는 중…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="p-10 text-center text-gray-400">
                해당하는 학생이 없습니다.
                {isSupervisorAccount() && !isSupervisorModeActive() && (
                  <div className="text-xs mt-2">
                    왼쪽 메뉴 아래에서 <b>주임모드</b>를 켜면 담당 학년 전체가 보입니다.
                  </div>
                )}
              </td></tr>
            )}
            {rows.map((s) => {
              const week = dates.flatMap((d) => cells[s.id]?.[ymd(d)] ?? [])
              const scored = week.filter((b) => b.value != null)
              const avg = scored.length ? Math.round(scored.reduce((a, b) => a + (b.value ?? 0), 0) / scored.length) : null
              return (
                <tr key={s.id} className="hover:bg-gray-50/60">
                  <td className="border-b p-2 align-top">
                    <input type="checkbox" checked={picked.has(s.id)}
                      onChange={() => setPicked((p) => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n })} />
                  </td>
                  <td className="border-b p-2 align-top">
                    <div className="font-medium text-gray-900">{s.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {s.grade}{s.class_time ? ` · ${s.class_time}` : ''}
                    </div>
                    <div className="text-[11px] mt-0.5" style={{ color: avg == null ? '#cbd5e1' : NAVY }}>
                      {avg == null ? '기록 없음' : `주 평균 ${avg}점 · ${scored.length}건`}
                    </div>
                  </td>
                  {dates.map((d) => {
                    const key = ymd(d)
                    const badges = cells[s.id]?.[key] ?? []
                    return (
                      <td key={key} className="border-b p-1.5 align-top">
                        <div className="flex flex-col gap-1">
                          {badges.map((b, i) => {
                            const t = tone(b.kind, b.value)
                            return (
                              <button key={i} title={b.title ?? b.label}
                                onClick={() => setDetail({ student: s, date: key, badges })}
                                className="text-left rounded-md px-1.5 py-1 border text-[11px] leading-tight hover:brightness-95"
                                style={{ background: t.bg, color: t.fg, borderColor: t.bd }}>
                                <span className="block truncate max-w-[104px]">{b.label}</span>
                                {b.value != null && <b className="block">{b.value}{b.unit ?? ''}</b>}
                              </button>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 배지를 누르면 뜨는 상세 */}
      {detail && (
        <div className="fixed inset-0 bg-black/30 flex items-end sm:items-center justify-center z-50"
          onClick={() => setDetail(null)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="font-bold text-lg" style={{ color: NAVY }}>{detail.student.name}</div>
                <div className="text-xs text-gray-400">{detail.date}</div>
              </div>
              <button onClick={() => setDetail(null)} className="text-gray-400 text-xl leading-none">×</button>
            </div>

            <div className="space-y-3">
              {detail.badges.map((b, i) => (
                <div key={i} className="border rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs px-2 py-0.5 rounded-full border"
                      style={{ ...(() => { const t = tone(b.kind, b.value); return { background: t.bg, color: t.fg, borderColor: t.bd } })() }}>
                      {KIND_LABEL[b.kind]}
                    </span>
                    {b.value != null && (
                      <span className="font-bold text-lg" style={{ color: NAVY }}>
                        {b.kind === 'exam' && b.total ? `${b.score} / ${b.total}` : `${b.value}${b.unit ?? ''}`}
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 mt-1">{b.title ?? b.label}</div>

                  {b.kind === 'exam' && b.gradingId ? (
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                      {([['wrong', '틀린 문제'], ['twin', '쌍둥이'], ['similar', '유사 문제']] as const).map(([m, l]) => (
                        <button key={m} onClick={() => reprint(b.gradingId!, m)}
                          disabled={busy === b.gradingId! + m}
                          className="py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                          style={{ background: m === 'wrong' ? '#dc2626' : m === 'twin' ? NAVY : GOLD }}>
                          {busy === b.gradingId! + m ? '…' : l}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-400 mt-2">
                      QR로 채점한 시험지만 오답·유사 문제를 만들 수 있습니다.
                    </div>
                  )}
                </div>
              ))}
              {detail.badges.length === 0 && (
                <div className="text-sm text-gray-400 text-center py-6">그날 기록이 없습니다.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="학습현황" subtitle="요일별 학습 기록 · 배지를 누르면 점수와 재출제" />
      <div className="max-w-[1600px] mx-auto">{children}</div>
    </div>
  )
}
