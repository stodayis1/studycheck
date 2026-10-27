'use client'

// 학교 자료집 목록.
// 우리 학생이 많은 학교가 위로 온다 — 상담 중에 찾는 학교는 대개 그쪽이다.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/common/Header'
import { apiFetch } from '@/lib/apiFetch'

type Row = {
  school_name: string
  school_level: string
  official_name: string | null
  source_year: number
  region: string | null
  foundation: string | null
  school_type: string | null
  stats: any
  updated_at: string
}

const LEVELS = ['고', '중', '초'] as const

export default function SchoolsPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [level, setLevel] = useState<string>('전체')
  const [q, setQ] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const res = await apiFetch('/api/school-profiles')
    const json = await res.json().catch(() => ({}))
    setRows(json.profiles ?? [])
    setCounts(json.counts ?? {})
    setLoading(false)
  }

  const visible = rows
    .filter(r => level === '전체' || r.school_level === level)
    .filter(r => !q || r.school_name.includes(q) || (r.official_name ?? '').includes(q))
    .sort((a, b) => (counts[b.school_name] ?? 0) - (counts[a.school_name] ?? 0)
      || a.school_name.localeCompare(b.school_name, 'ko'))

  return (
    <div className="min-h-screen" style={{ background: '#F0FBF7' }}>
      <Header title="학교 자료집" subtitle="학교알리미 공시자료를 학교별로 한 장에" />

      <div className="p-4 max-w-5xl mx-auto">

        <div className="flex gap-2 flex-wrap items-center mb-4">
          {['전체', ...LEVELS].map(l => (
            <button key={l} onClick={() => setLevel(l)}
              className="px-3 py-1.5 rounded-xl text-sm font-bold transition-all"
              style={{
                background: level === l ? '#0F6E56' : '#fff',
                color: level === l ? '#fff' : '#0F6E56',
                border: '1px solid #9FE1CB',
              }}>
              {l === '전체' ? '전체' : `${l}등학교`}
            </button>
          ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="학교 이름"
            className="px-3 py-1.5 rounded-xl text-sm flex-1 min-w-[140px]"
            style={{ border: '1px solid #9FE1CB', background: '#fff', color: '#085041' }} />
        </div>

        {loading && <p className="text-sm" style={{ color: '#0F6E56' }}>불러오는 중…</p>}

        {!loading && visible.length === 0 && (
          <div className="rounded-2xl p-6 text-center text-sm"
            style={{ background: '#fff', border: '1px solid #9FE1CB', color: '#0F6E56' }}>
            아직 정리된 학교가 없어요.
          </div>
        )}

        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
          {visible.map(r => {
            const mine = counts[r.school_name] ?? 0
            return (
              <Link key={r.school_name} href={`/teacher/schools/${encodeURIComponent(r.school_name)}`}
                className="rounded-2xl p-4 block transition-all hover:shadow-md"
                style={{ background: '#fff', border: '1px solid #9FE1CB' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold truncate" style={{ color: '#085041' }}>{r.school_name}</div>
                    <div className="text-xs mt-0.5 truncate" style={{ color: '#5A8E7E' }}>
                      {[r.foundation, r.school_type].filter(Boolean).join(' · ') || r.region}
                    </div>
                  </div>
                  {mine > 0 && (
                    <span className="text-xs font-bold px-2 py-1 rounded-lg shrink-0"
                      style={{ background: '#E6F7F0', color: '#0F6E56' }}>
                      우리 {mine}명
                    </span>
                  )}
                </div>
                <div className="flex gap-3 mt-3 text-xs" style={{ color: '#5A8E7E' }}>
                  {r.stats?.total != null && <span>전교생 {r.stats.total}명</span>}
                  {r.stats?.classes != null && <span>{r.stats.classes}학급</span>}
                  <span className="ml-auto">{r.source_year} 공시</span>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
