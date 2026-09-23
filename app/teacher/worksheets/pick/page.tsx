'use client'

// 시중교재에서 **쪽(또는 단원) → 문항**을 직접 골라 학습지를 만드는 화면 (관리자 전용)
//
// 흐름 : 시중교재 고르기 → [이 화면] 문제 선택 → 학습지 설정 → 인쇄
// 왼쪽 : 쪽 목록(쪽 번호가 있는 교재) 또는 단원 안의 번호 구간
// 가운데: 그 묶음의 문항을 그림으로 보여 주고 체크
// 오른쪽: 고른 문항에 쌍둥이·유사 문제를 몇 개씩 붙일지

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'
import { courseLabel } from '@/lib/course'

const NAVY = '#0f3460'

type Group = { key: string; label: string; section: string; count: number }
type Problem = {
  id: number; localNo: string; pageNo: number | null; typeCode: string | null
  level: number | null; step: string | null; answerKind: string | null
  isEssay: boolean; hasTwin: boolean; image: string | null; source: string | null
}
type Target = { book: string; grade: string; semester: number }

const STEPS = ['교재 선택', '문제 선택', '학습지 설정']

export default function PickPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()

  const [target, setTarget] = useState<Target | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [hasPage, setHasPage] = useState(false)
  const [cur, setCur] = useState<string | null>(null)
  const [problems, setProblems] = useState<Problem[]>([])
  const [picked, setPicked] = useState<number[]>([])          // 고른 순서를 지킨다
  const [loading, setLoading] = useState(true)
  const [listLoading, setListLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 출제문항 구성
  const [twin, setTwin] = useState(0)
  const [similar, setSimilar] = useState(0)
  const [similarLevel, setSimilarLevel] = useState<'easier' | 'same' | 'harder'>('same')
  const [answerType, setAnswerType] = useState<'all' | 'choice' | 'written'>('all')
  const [keepOriginal, setKeepOriginal] = useState(true)

  useEffect(() => {
    let t: Target | null = null
    try { t = JSON.parse(sessionStorage.getItem('bp_pick') || 'null') } catch { /* 무시 */ }
    if (!t?.book) { router.replace('/teacher/worksheets/books'); return }
    setTarget(t)
    apiFetch(`/api/book-pick?book=${encodeURIComponent(t.book)}&grade=${encodeURIComponent(t.grade)}&semester=${t.semester}`)
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups ?? [])
        setHasPage(!!d.hasPage)
        if (d.groups?.length) setCur(d.groups[0].key)
      })
      .finally(() => setLoading(false))
  }, [router])

  useEffect(() => {
    if (!target || !cur) return
    setListLoading(true)
    apiFetch(`/api/book-pick?book=${encodeURIComponent(target.book)}&grade=${encodeURIComponent(target.grade)}&semester=${target.semester}&group=${cur}`)
      .then((r) => r.json())
      .then((d) => setProblems(d.problems ?? []))
      .finally(() => setListLoading(false))
  }, [target, cur])

  const toggle = (id: number) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const allOnPage = problems.length > 0 && problems.every((p) => picked.includes(p.id))
  const toggleAll = () =>
    setPicked((p) =>
      allOnPage ? p.filter((x) => !problems.some((q) => q.id === x))
        : [...p, ...problems.filter((q) => !p.includes(q.id)).map((q) => q.id)]
    )

  // 실제로 몇 문항이 나올지 미리 센다
  const willBe = useMemo(() => {
    const perOne = (keepOriginal ? 1 : 0) + twin + similar
    return picked.length * perOne
  }, [picked.length, keepOriginal, twin, similar])

  const make = async () => {
    if (!picked.length) { setErr('문항을 하나 이상 골라 주세요.'); return }
    setBusy(true); setErr('')
    try {
      const r = await apiFetch('/api/book-pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ picked, twin, similar, similarLevel, answerType, keepOriginal }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? '만들지 못했습니다.'); return }
      router.push(`/teacher/gradings/print?code=${d.code}`)
    } finally { setBusy(false) }
  }

  if (authLoading || loading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!isAdmin()) return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>
  if (!target) return null

  // 왼쪽 목록을 단원 소제목으로 묶어 보여 준다
  const sections: { name: string; items: Group[] }[] = []
  for (const g of groups) {
    const last = sections[sections.length - 1]
    if (last && last.name === g.section) last.items.push(g)
    else sections.push({ name: g.section, items: [g] })
  }

  return (
    <Shell>
      <div className="flex items-center justify-between px-5 pt-4">
        <div className="text-sm font-bold" style={{ color: NAVY }}>
          [{target.book}] {courseLabel(target.grade, String(target.semester))}
        </div>
        <Steps now={1} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr_290px] gap-3 px-5 py-4">
        {/* 왼쪽 — 쪽 / 단원 */}
        <aside className="border rounded-xl bg-white overflow-hidden self-start max-h-[72vh] overflow-y-auto">
          <div className="px-3 py-2 text-xs text-gray-500 border-b bg-gray-50 sticky top-0">
            {hasPage ? '교재 쪽' : '단원 · 문항번호'}
          </div>
          {sections.map((s) => (
            <div key={s.name}>
              <div className="px-3 py-1.5 text-[11px] text-gray-400 bg-gray-50">{s.name}</div>
              {s.items.map((g) => (
                <button key={g.key} onClick={() => setCur(g.key)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between border-b ${
                    cur === g.key ? 'bg-blue-50 font-bold' : 'hover:bg-gray-50'
                  }`}>
                  <span>{g.label}</span>
                  <span className="text-[11px] text-gray-400">{g.count}</span>
                </button>
              ))}
            </div>
          ))}
          {!groups.length && <div className="p-4 text-sm text-gray-400">문항이 없습니다.</div>}
        </aside>

        {/* 가운데 — 문항 고르기 */}
        <main className="border rounded-xl bg-white p-3 max-h-[72vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={allOnPage} onChange={toggleAll} />
              <span className="font-bold" style={{ color: NAVY }}>
                {groups.find((g) => g.key === cur)?.label ?? ''}
              </span>
              <span className="text-xs text-gray-400">전체 고르기</span>
            </label>
            <span className="text-xs text-gray-400">{problems.length}문항</span>
          </div>

          {listLoading && <div className="py-10 text-center text-gray-400">불러오는 중…</div>}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {problems.map((p) => {
              const on = picked.includes(p.id)
              return (
                <button key={p.id} onClick={() => toggle(p.id)}
                  className={`text-left border rounded-lg p-2 ${on ? 'border-blue-500 bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <input type="checkbox" readOnly checked={on} />
                    <span className="text-sm font-bold" style={{ color: NAVY }}>{p.localNo}</span>
                    {p.level != null && <Chip>레벨{p.level}</Chip>}
                    {p.step && <Chip>{p.step}</Chip>}
                    {p.hasTwin && <Chip tone="pink">쌍둥이 있음</Chip>}
                    {p.answerKind !== 'choice' && <Chip tone="green">주관식</Chip>}
                  </div>
                  {p.image
                    ? <img src={p.image} alt="" className="w-full rounded border bg-white" loading="lazy" />
                    : <div className="text-xs text-gray-400 py-6 text-center">그림 없음</div>}
                </button>
              )
            })}
          </div>
          {!listLoading && !problems.length && (
            <div className="py-10 text-center text-gray-400">이 묶음에는 문항이 없습니다.</div>
          )}
        </main>

        {/* 오른쪽 — 출제문항 구성 */}
        <aside className="border rounded-xl bg-white p-4 self-start">
          <h3 className="font-bold mb-3" style={{ color: NAVY }}>출제문항 구성</h3>

          <Row label="고른 문항도 넣기">
            <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} />
          </Row>
          <Row label="쌍둥이 문제 추가">
            <Pills value={twin} onChange={setTwin} />
          </Row>
          <Row label="유사 문제 추가">
            <Pills value={similar} onChange={setSimilar} />
          </Row>
          <Row label="유사 문제 난이도" dim={similar === 0}>
            <div className="flex gap-1">
              {([['easier', '쉽게'], ['same', '기본'], ['harder', '어렵게']] as const).map(([v, t]) => (
                <button key={v} disabled={similar === 0} onClick={() => setSimilarLevel(v)}
                  className={`px-2 py-1 rounded text-xs border ${similarLevel === v ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600'} ${similar === 0 ? 'opacity-40' : ''}`}>
                  {t}
                </button>
              ))}
            </div>
          </Row>
          <Row label="문제 유형">
            <div className="flex gap-1">
              {([['all', '모두'], ['choice', '객관식'], ['written', '주관식']] as const).map(([v, t]) => (
                <button key={v} onClick={() => setAnswerType(v)}
                  className={`px-2 py-1 rounded text-xs border ${answerType === v ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600'}`}>
                  {t}
                </button>
              ))}
            </div>
          </Row>

          <div className="mt-4 pt-3 border-t text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500">고른 문항</span><b>{picked.length}</b>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-gray-500">출제 예정</span>
              <b style={{ color: NAVY }}>{willBe}문항</b>
            </div>
            {twin > 1 && (
              <p className="text-[11px] text-gray-400 mt-1">
                쌍둥이는 문항당 1개만 있습니다. 2개 이상 골라도 1개만 붙습니다.
              </p>
            )}
          </div>

          {err && <p className="text-xs text-red-600 mt-2">{err}</p>}

          <div className="mt-3 flex gap-2">
            <button onClick={() => router.push('/teacher/worksheets/books')}
              className="flex-1 py-2 rounded-lg border text-sm text-gray-600">← 교재 선택</button>
            <button onClick={make} disabled={busy || !picked.length}
              className="flex-1 py-2 rounded-lg text-white text-sm font-bold disabled:opacity-40"
              style={{ background: NAVY }}>
              {busy ? '만드는 중…' : '학습지 만들기'}
            </button>
          </div>
          {picked.length > 0 && (
            <button onClick={() => setPicked([])} className="w-full mt-2 text-xs text-gray-400 hover:underline">
              고른 문항 모두 지우기
            </button>
          )}
        </aside>
      </div>
    </Shell>
  )
}

function Steps({ now }: { now: number }) {
  return (
    <div className="hidden sm:flex items-center gap-2 text-xs">
      {STEPS.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          <span className={`w-5 h-5 rounded-full grid place-items-center text-[11px] ${
            i === now ? 'text-white' : 'bg-gray-200 text-gray-500'}`}
            style={i === now ? { background: NAVY } : undefined}>{i + 1}</span>
          <span className={i === now ? 'font-bold' : 'text-gray-400'} style={i === now ? { color: NAVY } : undefined}>{s}</span>
          {i < STEPS.length - 1 && <span className="text-gray-300">–</span>}
        </span>
      ))}
    </div>
  )
}

function Row({ label, children, dim }: { label: string; children: React.ReactNode; dim?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${dim ? 'opacity-50' : ''}`}>
      <span className="text-sm text-gray-600">{label}</span>
      {children}
    </div>
  )
}

function Pills({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[0, 1, 2, 3].map((n) => (
        <button key={n} onClick={() => onChange(n)}
          className={`px-2 py-1 rounded text-xs border ${value === n ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600'}`}>
          {n === 0 ? '없음' : `${n}개`}
        </button>
      ))}
    </div>
  )
}

function Chip({ children, tone }: { children: React.ReactNode; tone?: 'pink' | 'green' }) {
  const c = tone === 'pink' ? 'bg-pink-50 text-pink-600'
    : tone === 'green' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
  return <span className={`text-[10px] px-1.5 py-0.5 rounded ${c}`}>{children}</span>
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="시중교재 — 문제 고르기" subtitle="교재 쪽에서 문항을 직접 골라 학습지를 만듭니다" showBack />
      <div className="max-w-[1500px] mx-auto">{children}</div>
    </div>
  )
}
