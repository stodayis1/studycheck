'use client'

// 문제은행에서 조건을 골라 학습지를 자동으로 만드는 화면 (관리자 전용)

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/common/Header'
import { useAuth } from '@/hooks/useAuth'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'
const GOLD = '#c8992e'

type TypeRow = {
  code: string
  no: number
  title: string
  isFocus: boolean
  count: number
  byLevel: Record<string, number>
  byBook: Record<string, number>
  choice: number
  essay: number
}
type Sub = { no: number; title: string; types: TypeRow[]; total: number }
type Chapter = { no: number; title: string; subs: Sub[]; total: number }

const COURSES = [
  { grade: '중1', semester: 1 }, { grade: '중1', semester: 2 },
  { grade: '중2', semester: 1 }, { grade: '중2', semester: 2 },
  { grade: '중3', semester: 1 }, { grade: '중3', semester: 2 },
]
// 학원 공통 난이도. 1=쎈A / 2=개념서 대표·확인 / 3=쎈B / 4=쎈B상·쎈C / 5=올림포스 고난도 / 6=고쟁이 최심화
const LEVELS = [1, 2, 3, 4, 5, 6]
const LEVEL_HINT: Record<number, string> = {
  1: '기본 (쎈 A)', 2: '개념 확인', 3: '유형 (쎈 B)', 4: '심화 (쎈 B상·C)', 5: '고난도', 6: '최심화',
}
const BOOKS = ['쎈', '쎈B', '베이직쎈']
const COUNT_PRESETS = [10, 20, 25, 30, 50]

export default function ProblemBankPage() {
  const { isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const [byType, setByType] = useState(true)   // 유형별 / 단원별 보기

  const [course, setCourse] = useState(COURSES[0])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [picked, setPicked] = useState<Set<string>>(new Set())

  // 출제 조건
  const [count, setCount] = useState(20)
  const [levels, setLevels] = useState<number[]>([])
  const [books, setBooks] = useState<string[]>([])
  const [answerType, setAnswerType] = useState<'all' | 'choice' | 'written'>('all')
  const [noRepeat, setNoRepeat] = useState(true)
  const [perTypeMax, setPerTypeMax] = useState(0)
  const [mode, setMode] = useState<'random' | 'even' | 'focus' | 'hard'>('even')
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // 학습지 출제 메뉴에서 넘어온 조건 받기
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('pb_preset')
      if (!raw) return
      sessionStorage.removeItem('pb_preset')
      const v = JSON.parse(raw)
      if (v.byType === false) setByType(false)
      if (v.grade && v.semester) {
        const c = COURSES.find((x) => x.grade === v.grade && x.semester === Number(v.semester))
        if (c) setCourse(c)
      }
      if (v.books) setBooks(v.books)
      if (v.levels) setLevels(v.levels)
      if (v.answerType) setAnswerType(v.answerType)
      if (v.mode) setMode(v.mode)
      if (v.title) setTitle(v.title)
    } catch { /* 무시 */ }
  }, [])

  useEffect(() => {
    let dead = false
    setLoading(true); setPicked(new Set()); setChapters([])
    apiFetch(`/api/problem-bank?grade=${encodeURIComponent(course.grade)}&semester=${course.semester}`)
      .then((r) => r.json())
      .then((d) => { if (!dead) { setChapters(d.chapters ?? []); setOpen({}) } })
      .finally(() => { if (!dead) setLoading(false) })
    return () => { dead = true }
  }, [course.grade, course.semester])

  const allTypes = useMemo(
    () => chapters.flatMap((c) => c.subs.flatMap((s) => s.types.map((t) => ({ ...t, ch: c, sub: s })))),
    [chapters]
  )
  const pickedTypes = useMemo(() => allTypes.filter((t) => picked.has(t.code)), [allTypes, picked])
  const pool = pickedTypes.reduce((a, t) => a + t.count, 0)
  // 고른 유형들의 레벨별 문항 수 (칩에 숫자로 띄운다)
  const levelPool = useMemo(() => {
    const m: Record<number, number> = {}
    for (const t of pickedTypes)
      for (const [k, n] of Object.entries(t.byLevel ?? {})) m[Number(k)] = (m[Number(k)] ?? 0) + (n as number)
    return m
  }, [pickedTypes])

  const toggle = (codes: string[]) => {
    setPicked((prev) => {
      const n = new Set(prev)
      const allOn = codes.every((c) => n.has(c))
      codes.forEach((c) => (allOn ? n.delete(c) : n.add(c)))
      return n
    })
  }
  const toggleArr = (v: string, arr: string[], set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])

  const submit = async () => {
    setErr(''); setBusy(true)
    try {
      const r = await apiFetch('/api/problem-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: course.grade, semester: course.semester,
          typeCodes: [...picked], count, levels, books, answerType,
          noRepeat, perTypeMax, mode, title,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setErr(d.error ?? '출제에 실패했습니다.'); return }
      router.push(`/teacher/gradings/print?code=${d.code}`)
    } catch {
      setErr('출제에 실패했습니다.')
    } finally { setBusy(false) }
  }

  if (authLoading) return <Shell><div className="p-10 text-center text-gray-400">불러오는 중…</div></Shell>
  if (!isAdmin()) return <Shell><div className="p-10 text-center text-gray-500">관리자만 접근할 수 있습니다.</div></Shell>

  return (
    <Shell title={byType ? '유형별 문제은행' : '단원별 문제은행'}>
      <div className="px-5 pt-4 pb-2 flex items-center gap-3">
        <div className="flex rounded-lg overflow-hidden border text-xs">
          <button onClick={() => setByType(true)}
            className={`px-3 py-1 ${byType ? 'text-white' : 'bg-white text-gray-600'}`}
            style={byType ? { background: NAVY } : {}}>유형별</button>
          <button onClick={() => setByType(false)}
            className={`px-3 py-1 ${!byType ? 'text-white' : 'bg-white text-gray-600'}`}
            style={!byType ? { background: NAVY } : {}}>단원별</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[180px_320px_1fr_340px] gap-0 border-t bg-white min-h-[70vh]">
        {/* ① 과정 선택 */}
        <Col title="과정 선택">
          <div className="p-3 space-y-1">
            {COURSES.map((c) => {
              const on = c.grade === course.grade && c.semester === course.semester
              return (
                <button key={`${c.grade}${c.semester}`} onClick={() => setCourse(c)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${on ? 'text-white font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
                  style={on ? { background: NAVY } : {}}>
                  {c.grade}-{c.semester}
                </button>
              )
            })}
          </div>
        </Col>

        {/* ② 단원 트리 */}
        <Col title="단원 및 유형군 선택">
          <div className="p-3 text-sm">
            {loading && <div className="text-gray-400 py-6 text-center">불러오는 중…</div>}
            {chapters.map((c) => {
              const codes = c.subs.flatMap((s) => s.types.map((t) => t.code))
              const key = `c${c.no}`
              return (
                <div key={c.no} className="mb-1">
                  <div className="flex items-center gap-2 py-1">
                    <button onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                      className="w-4 h-4 text-gray-400 shrink-0">{open[key] === false ? '+' : '−'}</button>
                    <Check on={codes.every((x) => picked.has(x))} onClick={() => toggle(codes)} />
                    <span className="font-semibold" style={{ color: NAVY }}>{c.no} {c.title}</span>
                    <span className="text-[11px] text-gray-400">{c.total}</span>
                  </div>
                  {open[key] !== false && c.subs.map((s) => {
                    const sc = s.types.map((t) => t.code)
                    return (
                      <div key={s.no} className="flex items-center gap-2 py-1 pl-6">
                        <Check on={sc.every((x) => picked.has(x))} onClick={() => toggle(sc)} />
                        <span className="text-gray-700">{c.no}.{s.no} {s.title}</span>
                        <span className="text-[11px] text-gray-400">{s.total}</span>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Col>

        {/* ③ 유형 목록 */}
        <Col title={byType ? '유형 상세 편집' : '선택한 단원의 유형'}>
          <div className="divide-y text-sm max-h-[70vh] overflow-auto">
            {allTypes.length === 0 && !loading &&
              <div className="p-6 text-gray-400 text-center">왼쪽에서 과정을 골라 주세요.</div>}
            {allTypes.map((t) => (
              <label key={t.code} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 cursor-pointer">
                <Check on={picked.has(t.code)} onClick={() => toggle([t.code])} />
                <span className="text-gray-400 text-xs w-14 shrink-0">{t.ch.no}.{t.sub.no}.{t.no}</span>
                <span className="flex-1 text-gray-800">{t.title}</span>
                {t.isFocus && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: GOLD, color: '#fff' }}>중요</span>}
                <span className="text-xs text-gray-400 w-12 text-right">{t.count}문항</span>
              </label>
            ))}
          </div>
        </Col>

        {/* ④ 출제문제 구성 */}
        <Col title="출제문제 구성">
          <div className="p-4 space-y-5 text-sm">
            <div>
              <div className="text-xs text-gray-500 mb-1">시험지 이름</div>
              <input value={title} onChange={(e) => setTitle(e.target.value)}
                placeholder={`${course.grade}-${course.semester} 문제은행`}
                className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>

            <div>
              <div className="text-xs text-gray-500 mb-1">최대 문제 수</div>
              <div className="flex gap-1">
                {COUNT_PRESETS.map((n) => (
                  <button key={n} onClick={() => setCount(n)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs ${count === n ? 'text-white' : 'bg-white text-gray-600'}`}
                    style={count === n ? { background: NAVY, borderColor: NAVY } : {}}>{n}</button>
                ))}
                <input type="number" value={count} min={1} max={150}
                  onChange={(e) => setCount(Math.max(1, Math.min(150, Number(e.target.value) || 1)))}
                  className="w-16 border rounded-lg px-2 text-xs text-center" />
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                고른 유형 {pickedTypes.length}개 · 후보 {pool}문항
              </div>
            </div>

            <Field label="레벨">
              <div className="flex flex-wrap gap-1">
                <button onClick={() => setLevels([])}
                  className={`px-2.5 py-1 rounded-full border text-xs ${levels.length === 0 ? 'text-white' : 'bg-white text-gray-600'}`}
                  style={levels.length === 0 ? { background: NAVY, borderColor: NAVY } : {}}>전체</button>
                {LEVELS.map((n) => {
                  const on = levels.includes(n)
                  const cnt = levelPool[n] ?? 0
                  return (
                    <button key={n} title={LEVEL_HINT[n]} disabled={pickedTypes.length > 0 && cnt === 0}
                      onClick={() => setLevels(on ? levels.filter((x) => x !== n) : [...levels, n])}
                      className={`px-2.5 py-1 rounded-full border text-xs ${on ? 'text-white' : 'bg-white text-gray-600'} ${pickedTypes.length > 0 && cnt === 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
                      style={on ? { background: NAVY, borderColor: NAVY } : {}}>
                      Lv{n}{pickedTypes.length > 0 ? ` (${cnt})` : ''}
                    </button>
                  )
                })}
              </div>
              <div className="text-[11px] text-gray-400 mt-1">
                1 기본(쎈A) · 2 개념확인 · 3 유형(쎈B) · 4 심화(쎈B상·쎈C) · 5 고난도 · 6 최심화
              </div>
            </Field>

            <Field label="교재">
              <Chips all="전체" values={BOOKS} on={books} set={(v) => toggleArr(v, books, setBooks)} clear={() => setBooks([])} />
            </Field>

            <Field label="답안 형태">
              <div className="flex gap-1">
                {([['all', '전체'], ['choice', '객관식'], ['written', '주관식']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setAnswerType(v)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs ${answerType === v ? 'text-white' : 'bg-white text-gray-600'}`}
                    style={answerType === v ? { background: NAVY, borderColor: NAVY } : {}}>{l}</button>
                ))}
              </div>
            </Field>

            <Field label="중복출제 방지">
              <button onClick={() => setNoRepeat(!noRepeat)}
                className={`w-12 h-6 rounded-full transition ${noRepeat ? '' : 'bg-gray-300'}`}
                style={noRepeat ? { background: NAVY } : {}}>
                <span className={`block w-5 h-5 bg-white rounded-full transition ${noRepeat ? 'ml-6' : 'ml-0.5'}`} />
              </button>
              <div className="text-[11px] text-gray-400 mt-1">예전에 출제한 문항은 빼고 뽑습니다.</div>
            </Field>

            <Field label="유형당 최대 문제 수">
              <div className="flex gap-1">
                {([[0, '제한없음'], [1, '1문제'], [2, '2문제'], [3, '3문제']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setPerTypeMax(v)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs ${perTypeMax === v ? 'text-white' : 'bg-white text-gray-600'}`}
                    style={perTypeMax === v ? { background: NAVY, borderColor: NAVY } : {}}>{l}</button>
                ))}
              </div>
            </Field>

            <Field label="출제 방식">
              <div className="grid grid-cols-2 gap-1">
                {([['even', '유형별 고르게'], ['random', '무작위'], ['focus', '쉬운 것부터'], ['hard', '어려운 것부터']] as const).map(([v, l]) => (
                  <button key={v} onClick={() => setMode(v)}
                    className={`py-1.5 rounded-lg border text-xs ${mode === v ? 'text-white' : 'bg-white text-gray-600'}`}
                    style={mode === v ? { background: NAVY, borderColor: NAVY } : {}}>{l}</button>
                ))}
              </div>
            </Field>

            {err && <div className="text-xs text-red-600">{err}</div>}

            <button onClick={submit} disabled={busy || picked.size === 0}
              className="w-full py-3 rounded-xl text-white font-semibold disabled:opacity-40"
              style={{ background: GOLD }}>
              {busy ? '출제하는 중…' : '학습지 출제하기'}
            </button>
          </div>
        </Col>
      </div>
    </Shell>
  )
}

function Shell({ children, title = '문제은행' }: { children: React.ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Header title={title} subtitle="조건을 골라 학습지를 자동으로 만듭니다" showBack />
      <div className="max-w-[1600px] mx-auto">{children}</div>
    </div>
  )
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-r last:border-r-0 bg-white">
      <div className="px-4 py-3 border-b text-sm font-semibold text-gray-700">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function Check({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <span onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      className="w-4 h-4 rounded border flex items-center justify-center shrink-0 cursor-pointer"
      style={on ? { background: NAVY, borderColor: NAVY } : { borderColor: '#cbd5e1' }}>
      {on && <span className="text-white text-[10px] leading-none">✓</span>}
    </span>
  )
}

function Chips({ all, values, on, set, clear }:
  { all: string; values: string[]; on: string[]; set: (v: string) => void; clear: () => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button onClick={clear}
        className={`px-2.5 py-1 rounded-full border text-xs ${on.length === 0 ? 'text-white' : 'bg-white text-gray-600'}`}
        style={on.length === 0 ? { background: NAVY, borderColor: NAVY } : {}}>{all}</button>
      {values.map((v) => (
        <button key={v} onClick={() => set(v)}
          className={`px-2.5 py-1 rounded-full border text-xs ${on.includes(v) ? 'text-white' : 'bg-white text-gray-600'}`}
          style={on.includes(v) ? { background: NAVY, borderColor: NAVY } : {}}>{v}</button>
      ))}
    </div>
  )
}
