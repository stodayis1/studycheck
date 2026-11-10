'use client'

// 「2028 권장 이수과목」 카드 — 학생별 기록 안에서, 그 학생이 고른 계열·학과에 맞는
// 대학별 권장과목을 보여 준다 (원장님 2026-11-10).
//
// ★ 조건이 아니라 **평가에 반영되는 권장**이다. 화면에도 그렇게 적는다 —
//   서울대 2028 안내: 「지원자격과는 무관하나 … 수시 서류평가 및 정시 교과역량평가에 반영」.
// ★ 자료가 1,300줄이라 서버(/api/career/subjects)에서 골라 받는다.

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/apiFetch'
import { GREEN, MINT, LINE, Card } from './shared'

interface Guide {
  region: string; area: string; univ: string; group: string; major: string
  core: string; more: string; note: string
}
interface Found { rows: Guide[]; total: number; math: { name: string; count: number }[]; why: string }

export default function SubjectGuideCard({ fields, major }: { fields: string[]; major: string }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [data, setData] = useState<Found | null>(null)
  const [busy, setBusy] = useState(false)

  async function load(search: string) {
    setBusy(true)
    try {
      const p = new URLSearchParams()
      if (search.trim()) p.set('q', search.trim())
      else {
        if (fields.length) p.set('fields', fields.join(','))
        if (major) p.set('major', major)
      }
      p.set('limit', '60')
      const res = await apiFetch(`/api/career/subjects?${p.toString()}`)
      setData(res.ok ? await res.json() : null)
    } finally { setBusy(false) }
  }

  useEffect(() => { if (open && !data) load('') }, [open])   // eslint-disable-line react-hooks/exhaustive-deps

  const nothing = !fields.length && !major

  return (
    <Card>
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-gray-700">2028 권장 이수과목</h3>
        <span className="text-[11px] text-gray-400">고1·고2 과목 선택을 학과와 잇는 자료</span>
        <button onClick={() => setOpen((v) => !v)} className="ml-auto px-3 py-1.5 rounded-xl text-sm border bg-white" style={{ borderColor: LINE }}>
          {open ? '접기' : '펼치기'}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <p className="text-[11px] text-gray-500">
            대학이 모집단위별로 공개한 권장과목이에요. <b>지원 자격이 아니라</b> 수시 서류평가·정시 교과역량평가에 <b>반영되는 권장</b>이라고 안내해 주세요.
          </p>

          <div className="mt-2 flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(q) }}
              placeholder="대학·학과로 직접 찾기 (예: 컴퓨터공학, 서울대)"
              className="flex-1 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: LINE }} />
            <button onClick={() => load(q)} disabled={busy}
              className="px-3 py-2 rounded-lg text-sm text-white disabled:opacity-50" style={{ background: GREEN }}>
              {busy ? '찾는 중…' : '찾기'}
            </button>
            {q && <button onClick={() => { setQ(''); load('') }} className="px-3 py-2 rounded-lg text-sm border bg-white" style={{ borderColor: LINE }}>학생 기준으로</button>}
          </div>

          {nothing && !q && <p className="mt-2 text-xs text-amber-700">이 학생은 질문지에 계열·학과를 안 적었어요. 위에서 직접 찾아보세요.</p>}

          {data && (
            <>
              <p className="mt-2 text-xs text-gray-500">{data.why} · 모두 {data.total}곳{data.total > data.rows.length ? ` (아래는 ${data.rows.length}곳)` : ''}</p>

              {data.math.length > 0 && (
                <div className="mt-2 rounded-xl p-3" style={{ background: MINT }}>
                  <div className="text-xs font-bold" style={{ color: GREEN }}>이 계열이 많이 보는 수학 과목</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {data.math.map((m) => (
                      <span key={m.name} className="px-2 py-0.5 rounded-full text-[11px] bg-white border" style={{ borderColor: LINE }}>
                        {m.name} <b style={{ color: GREEN }}>{m.count}</b>곳
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-2 max-h-96 overflow-y-auto rounded-xl border" style={{ borderColor: LINE }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: MINT }}>
                    <tr className="text-left" style={{ color: GREEN }}>
                      <th className="px-2 py-1.5">대학</th>
                      <th className="px-2 py-1.5">모집단위</th>
                      <th className="px-2 py-1.5">핵심과목 (꼭 듣기를 권장)</th>
                      <th className="px-2 py-1.5">권장과목</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r, i) => (
                      <tr key={i} className="border-t align-top" style={{ borderColor: LINE }}>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.univ}</td>
                        <td className="px-2 py-1.5">{[r.group, r.major].filter(Boolean).join(' · ')}</td>
                        <td className="px-2 py-1.5">{r.core || '—'}</td>
                        <td className="px-2 py-1.5">{r.more || '—'}{r.note && <div className="text-[10px] text-gray-400 mt-0.5">{r.note}</div>}</td>
                      </tr>
                    ))}
                    {!data.rows.length && (
                      <tr><td colSpan={4} className="px-2 py-3 text-center text-gray-400">맞는 곳이 없어요. 학과 이름으로 다시 찾아보세요.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-1.5 text-[10px] text-gray-400">자료: 2028학년도 권역별 대학별 권장과목(반영과목) · 47개 대학 1,357개 모집단위</p>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
