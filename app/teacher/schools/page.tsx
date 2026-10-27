'use client'

// 학교 자료집 목록.
// 우리 학생이 많은 학교가 위로 온다 — 상담 중에 찾는 학교는 대개 그쪽이다.
// 「학교 추가」 — 전국 어느 학교든 학교알리미에서 찾아 바로 한 장을 만든다(미리 정리해 두지 않아도 된다).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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
  const [adding, setAdding] = useState(false)

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
          <button onClick={() => setAdding(a => !a)}
            className="px-3 py-1.5 rounded-xl text-sm font-bold inline-flex items-center gap-1"
            style={{ background: adding ? '#fff' : '#0F6E56', color: adding ? '#0F6E56' : '#fff', border: '1px solid #0F6E56' }}>
            <i className={`ti ${adding ? 'ti-x' : 'ti-plus'}`} /> {adding ? '닫기' : '학교 추가'}
          </button>
        </div>

        {adding && <AddSchool />}

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

// ── 학교 추가 ─────────────────────────────────────────────────────────────
// 학교급 → 시도 → 시군구를 고르면 학교알리미 학교 목록이 뜨고, 누르면 한 장이 만들어진다.

type Opt = { code: string; name: string }
type Found = { shl: string; name: string; school_name: string; exists: boolean }

function AddSchool() {
  const router = useRouter()
  const [level, setLevel] = useState<'고' | '중' | '초'>('고')
  const [sidos, setSidos] = useState<Opt[]>([])
  const [sido, setSido] = useState('')
  const [sigungus, setSigungus] = useState<Opt[]>([])
  const [sigungu, setSigungu] = useState('')
  const [schools, setSchools] = useState<Found[]>([])
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')

  async function get(qs: string) {
    const res = await apiFetch(`/api/school-profiles/lookup?${qs}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) { setMsg(json.error ?? '불러오지 못했어요.'); return [] }
    setMsg('')
    return json.items ?? []
  }

  useEffect(() => { get('step=sido').then(setSidos) }, [])
  useEffect(() => {
    setSigungus([]); setSigungu(''); setSchools([])
    if (sido) get(`step=sigungu&sido=${sido}`).then(setSigungus)
  }, [sido])
  useEffect(() => {
    setSchools([])
    if (sido && sigungu) get(`step=school&level=${level}&sido=${sido}&sigungu=${sigungu}`).then(setSchools)
  }, [sigungu, level])

  async function add(s: Found) {
    if (s.exists) { router.push(`/teacher/schools/${encodeURIComponent(s.school_name)}`); return }
    setBusy(s.shl); setMsg('')
    const res = await apiFetch('/api/school-profiles/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shl: s.shl, level, sigungu }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy('')
    if (!res.ok) { setMsg(json.error ?? '만들지 못했어요.'); return }
    router.push(`/teacher/schools/${encodeURIComponent(json.school_name)}`)
  }

  const shown = schools.filter(s => !filter || s.name.includes(filter))
  const sel = 'px-3 py-1.5 rounded-xl text-sm'
  const selStyle = { border: '1px solid #9FE1CB', background: '#fff', color: '#085041' }

  return (
    <div className="rounded-2xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #9FE1CB' }}>
      <p className="text-sm mb-3" style={{ color: '#0F6E56' }}>
        학교알리미에서 찾아 바로 한 장을 만들어요. 학생수·교원·신입생·바로가기가 채워지고,
        수학 편제·시험 날짜·성취도는 나중에 채워요.
      </p>
      <div className="flex gap-2 flex-wrap items-center">
        {(['고', '중', '초'] as const).map(l => (
          <button key={l} onClick={() => setLevel(l)} className="px-3 py-1.5 rounded-xl text-sm font-bold"
            style={{ background: level === l ? '#0F6E56' : '#fff', color: level === l ? '#fff' : '#0F6E56', border: '1px solid #9FE1CB' }}>
            {l}등학교
          </button>
        ))}
        <select aria-label="시도" value={sido} onChange={e => setSido(e.target.value)} className={sel} style={selStyle}>
          <option value="">시도</option>
          {sidos.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
        </select>
        <select aria-label="시군구" value={sigungu} onChange={e => setSigungu(e.target.value)} className={sel} style={selStyle}
          disabled={!sigungus.length}>
          <option value="">시군구</option>
          {sigungus.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
        </select>
        {schools.length > 0 && (
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="학교 이름으로 좁히기"
            className={`${sel} flex-1 min-w-[140px]`} style={selStyle} />
        )}
      </div>

      {msg && <p className="text-sm mt-3" style={{ color: '#B42318' }}>{msg}</p>}

      {shown.length > 0 && (
        <div className="grid gap-2 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {shown.map(s => (
            <button key={s.shl} onClick={() => add(s)} disabled={!!busy}
              className="rounded-xl px-3 py-2 text-left text-sm flex items-center justify-between gap-2"
              style={{ background: s.exists ? '#F0FBF7' : '#fff', border: '1px solid #D6F0E6', color: '#085041', opacity: busy && busy !== s.shl ? 0.5 : 1 }}>
              <span className="truncate">{s.name}</span>
              <span className="text-xs shrink-0" style={{ color: '#5A8E7E' }}>
                {busy === s.shl ? '만드는 중…' : s.exists ? '열기' : '추가'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
