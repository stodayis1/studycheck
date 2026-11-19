'use client'

// 모의고사 기출 한 회차 — 한 장 요약 · 문항별 해설 · 인쇄 (선생님 전용)
//   /teacher/mock-exams/view?slug=2027-suneung
//
// 원장님 2026-11-19: 「학원에서 아이들 그때그때 풀이랑 프린트해 주는 용도」. 학생·학부모 화면에는 없다.
// 수능처럼 선택과목이 있으면, 한 학생이 보는 30문항(공통 22 + 선택 8) 기준으로 센다.
// 수식은 해설 JSON 안의 $…$ / $$…$$ 를 KaTeX 로 그린다.

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { apiFetch } from '@/lib/apiFetch'
import { DIFFS, fmtTime, questionsFor, type MockExam, type MockQuestion, type Track } from '@/lib/mockExams'

const NAVY = '#0f3460'
const DIFF_COLOR: Record<string, string> = { 상: '#dc2626', 중상: '#f97316', 중: '#eab308', 중하: '#22c55e', 하: '#3b82f6' }
const MM_PER_PX = 25.4 / 200   // 문항 그림은 200dpi 로 잘랐다 → 원본 시험지와 같은 크기로 찍는다

export default function MockExamViewPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}

// $$…$$ 는 따로 줄, $…$ 는 글 속 수식. 그 밖의 글자는 그대로 둔다
function Tex({ text, className }: { text: string; className?: string }) {
  const html = useMemo(() => {
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return (text ?? '').split(/(\$\$[\s\S]+?\$\$|\$[^$]+?\$)/g).map((part) => {
      const block = part.startsWith('$$') && part.endsWith('$$') && part.length > 4
      const inline = !block && part.startsWith('$') && part.endsWith('$') && part.length > 2
      if (!block && !inline) return esc(part)
      try {
        return katex.renderToString(block ? part.slice(2, -2) : part.slice(1, -1), { displayMode: block, throwOnError: false, strict: false })
      } catch {
        return esc(part)
      }
    }).join('')
  }, [text])
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

type Tab = 'summary' | 'solve' | 'print'
type PrintMode = 'problems' | 'solutions' | 'both'

function Inner() {
  const slug = useSearchParams().get('slug') ?? ''
  const [exam, setExam] = useState<MockExam | null>(null)
  const [all, setAll] = useState<MockQuestion[]>([])
  const [err, setErr] = useState('')
  const [track, setTrack] = useState<Track | null>(null)
  const [tab, setTab] = useState<Tab>('summary')
  const [cur, setCur] = useState(1)
  const [mode, setMode] = useState<PrintMode>('solutions')
  const [picked, setPicked] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!slug) return
    apiFetch(`/api/mock-exams?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setExam(j.exam)
        setAll(j.questions)
        setTrack(j.exam.tracks[0] ?? null)
      })
      .catch((e) => setErr(e.message))
  }, [slug])

  const qs = useMemo(() => questionsFor(all, track), [all, track])
  useEffect(() => setPicked(new Set(qs.map((q) => q.no))), [qs])

  // ← → 로 문항 넘기기
  useEffect(() => {
    if (tab !== 'solve') return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setCur((c) => Math.min(c + 1, qs.length))
      if (e.key === 'ArrowLeft') setCur((c) => Math.max(c - 1, 1))
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [tab, qs.length])

  if (err) return <p className="p-10 text-center text-gray-500">{err}</p>
  if (!exam) return <p className="p-10 text-center text-gray-400">불러오는 중…</p>

  const q = qs[cur - 1]
  const printList = qs.filter((x) => picked.has(x.no))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="no-print sticky top-0 z-40 border-b bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href="/teacher/mock-exams" className="text-xs text-gray-500 hover:underline">← 회차 목록</Link>
          <span className="text-base font-bold" style={{ color: NAVY }}>{exam.title}</span>
          <span className="text-xs text-gray-400">{exam.grade} · 선생님용</span>
          {exam.tracks.length > 0 && (
            <div className="flex overflow-hidden rounded-lg border">
              {exam.tracks.map((t) => (
                <button key={t} onClick={() => { setTrack(t); setCur(1) }} className="px-3 py-1.5"
                  style={track === t ? { background: NAVY, color: '#fff' } : { color: '#555' }}>{t}</button>
              ))}
            </div>
          )}
          <div className="ml-auto flex overflow-hidden rounded-lg border">
            {([['summary', '한 장 요약'], ['solve', '문항별 해설'], ['print', '인쇄']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5"
                style={tab === k ? { background: '#c8992e', color: '#fff' } : { color: '#555' }}>{label}</button>
            ))}
          </div>
        </div>
        {exam.note && <div className="mt-1 text-[11px] text-gray-400">{exam.note}</div>}
      </div>

      {tab === 'summary' && <Summary exam={exam} qs={qs} track={track} onOpen={(n) => { setCur(n); setTab('solve') }} />}

      {tab === 'solve' && q && (
        <div className="no-print mx-auto max-w-[1100px] px-4 py-5">
          <div className="mb-4 flex flex-wrap gap-1">
            {qs.map((x, i) => (
              <button key={x.sec + x.no} onClick={() => setCur(i + 1)}
                className="h-8 w-8 rounded-md border text-sm font-semibold"
                style={cur === i + 1 ? { background: NAVY, color: '#fff' } : { background: '#fff', color: DIFF_COLOR[x.difficulty] }}>
                {x.no}
              </button>
            ))}
            <span className="ml-2 self-center text-xs text-gray-400">번호를 누르거나 키보드 ← → 를 쓰세요</span>
          </div>
          <Solution q={q} wide />
          <div className="mt-4 flex justify-between text-sm">
            <button disabled={cur <= 1} onClick={() => setCur(cur - 1)} className="rounded border bg-white px-3 py-1.5 disabled:opacity-40">← 이전 문항</button>
            <span className="self-center text-gray-400">{cur} / {qs.length}</span>
            <button disabled={cur >= qs.length} onClick={() => setCur(cur + 1)} className="rounded border bg-white px-3 py-1.5 disabled:opacity-40">다음 문항 →</button>
          </div>
        </div>
      )}

      {tab === 'print' && (
        <>
          <div className="no-print mx-auto max-w-[1100px] px-4 pt-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 text-sm">
              <div className="flex overflow-hidden rounded-lg border">
                {([['problems', '문제지'], ['solutions', '해설지'], ['both', '문제 + 해설']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setMode(k)} className="px-3 py-1.5"
                    style={mode === k ? { background: NAVY, color: '#fff' } : { color: '#555' }}>{label}</button>
                ))}
              </div>
              <button className="text-xs text-blue-600 underline" onClick={() => setPicked(new Set(qs.map((x) => x.no)))}>전체</button>
              <button className="text-xs text-blue-600 underline" onClick={() => setPicked(new Set())}>모두 끄기</button>
              <button className="text-xs text-blue-600 underline"
                onClick={() => setPicked(new Set(qs.filter((x) => x.difficulty === '상' || x.difficulty === '중상').map((x) => x.no)))}>고난도만</button>
              <span className="text-xs text-gray-400">{printList.length}문항 고름</span>
              <button onClick={() => window.print()} disabled={!printList.length}
                className="ml-auto rounded-lg px-4 py-2 font-medium text-white disabled:opacity-40" style={{ background: NAVY }}>
                인쇄 / PDF 저장
              </button>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {qs.map((x) => {
                const on = picked.has(x.no)
                return (
                  <button key={x.sec + x.no} className="h-8 w-8 rounded-md border text-sm font-semibold"
                    style={on ? { background: NAVY, color: '#fff' } : { background: '#fff', color: '#94a3b8' }}
                    onClick={() => { const s = new Set(picked); if (on) s.delete(x.no); else s.add(x.no); setPicked(s) }}>
                    {x.no}
                  </button>
                )
              })}
            </div>
          </div>
          <PrintSheet exam={exam} track={track} list={printList} mode={mode} />
        </>
      )}

      <style jsx global>{`
        @page { size: A4; margin: 12mm 11mm; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        .mx-sec h4 { font-size: 12px; font-weight: 700; color: ${NAVY}; margin: 14px 0 4px; }
        .mx-sec p, .mx-sec li { font-size: 14px; line-height: 1.75; color: #1f2937; }
        .mx-print { max-width: 188mm; margin: 0 auto; background: #fff; color: #111; padding: 6mm 0 10mm; }
        .mx-print .mx-sec p, .mx-print .mx-sec li { font-size: 10pt; line-height: 1.6; }
        .mx-print .mx-sec h4 { font-size: 9pt; margin: 8px 0 2px; }
        .mx-q { break-inside: avoid; page-break-inside: avoid; margin-bottom: 7mm; }
        .mx-sol { break-inside: avoid-page; border-top: 1.5px solid ${NAVY}; padding-top: 3mm; margin-bottom: 8mm; }
        .mx-break { break-before: page; }
        .katex { font-size: 1.05em; }
      `}</style>
    </div>
  )
}

function Summary({ exam, qs, track, onOpen }: { exam: MockExam; qs: MockQuestion[]; track: Track | null; onOpen: (n: number) => void }) {
  const total = qs.reduce((s, q) => s + q.seconds, 0)
  const hard = qs.filter((q) => q.difficulty === '상' || q.difficulty === '중상')
  const top = [...qs.filter((q) => q.difficulty === '상')].sort((a, b) => b.seconds - a.seconds)
  const counts = DIFFS.map((d) => [d, qs.filter((q) => q.difficulty === d)] as const)
  const most = [...counts].sort((a, b) => b[1].length - a[1].length)[0]?.[0]
  const box = 'rounded-xl border bg-white p-4'
  return (
    <div className="no-print mx-auto max-w-[1100px] px-4 py-5">
      <p className="mb-3 text-sm text-gray-500">{exam.grade} · {track ? `공통 + ${track}` : '전 범위'} · {qs.length}문항 기준</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className={box}><div className="text-xs text-gray-400">가장 많은 난이도</div><div className="mt-1 text-2xl font-bold" style={{ color: NAVY }}>{most}</div></div>
        <div className={box}><div className="text-xs text-gray-400">고난도 (상·중상)</div><div className="mt-1 text-2xl font-bold" style={{ color: NAVY }}>{hard.length}문항</div><div className="text-xs text-gray-400">{Math.round((hard.length / Math.max(qs.length, 1)) * 100)}%</div></div>
        <div className={box}><div className="text-xs text-gray-400">예상 풀이 시간</div><div className="mt-1 text-2xl font-bold" style={{ color: NAVY }}>{fmtTime(total)}</div><div className="text-xs text-gray-400">실제 시험 {exam.minutes}분</div></div>
        <div className={box}><div className="text-xs text-gray-400">배점</div><div className="mt-1 text-2xl font-bold" style={{ color: NAVY }}>{qs.reduce((s, q) => s + q.pts, 0)}점</div><div className="text-xs text-gray-400">4점 {qs.filter((q) => q.pts === 4).length}문항</div></div>
      </div>

      <div className={`${box} mt-3`}>
        <div className="mb-2 text-sm font-bold" style={{ color: NAVY }}>난이도 분포</div>
        {counts.map(([d, list]) => (
          <div key={d} className="flex items-center gap-3 py-1 text-sm">
            <span className="w-10 font-semibold" style={{ color: DIFF_COLOR[d] }}>{d}</span>
            <div className="h-3 rounded" style={{ width: `${(list.length / Math.max(qs.length, 1)) * 60}%`, background: DIFF_COLOR[d], minWidth: list.length ? 6 : 0 }} />
            <span className="text-xs text-gray-500">{list.length}문항</span>
            <span className="text-xs text-gray-400">{list.map((x) => x.no).join(' · ')}</span>
          </div>
        ))}
      </div>

      {top.length > 0 && (
        <div className={`${box} mt-3`}>
          <div className="mb-2 text-sm font-bold" style={{ color: NAVY }}>가장 어려운 문항 — 오래 걸리는 순</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-gray-400"><th className="py-1">번호</th><th>유형</th><th className="text-right">권장 시간</th></tr></thead>
            <tbody>
              {top.map((x) => (
                <tr key={x.sec + x.no} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => onOpen(qs.indexOf(x) + 1)}>
                  <td className="py-1.5 font-semibold" style={{ color: NAVY }}>{x.no}</td><td>{x.type}</td><td className="text-right">{fmtTime(x.seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={`${box} mt-3`}>
        <div className="mb-2 text-sm font-bold" style={{ color: NAVY }}>전 문항</div>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-gray-400"><th className="py-1">번호</th><th>단원 · 유형</th><th>난이도</th><th>배점</th><th className="text-right">정답</th></tr></thead>
          <tbody>
            {qs.map((x, i) => (
              <tr key={x.sec + x.no} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => onOpen(i + 1)}>
                <td className="py-1.5 font-semibold" style={{ color: NAVY }}>{x.no}</td>
                <td><span className="text-gray-400">{x.unit} · </span>{x.type}</td>
                <td style={{ color: DIFF_COLOR[x.difficulty] }}>{x.difficulty}</td>
                <td>{x.pts}</td>
                <td className="text-right font-semibold text-blue-700">{x.answer}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function QImg({ q, print }: { q: MockQuestion; print?: boolean }) {
  const [wmm, setWmm] = useState(0)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={q.image} alt={`${q.no}번`} className={print ? '' : 'w-full'}
      onLoad={(e) => setWmm(e.currentTarget.naturalWidth * MM_PER_PX)}
      style={print && wmm ? { width: `${Math.min(wmm, 120).toFixed(1)}mm`, maxWidth: '100%' } : undefined} />
  )
}

function Solution({ q, wide }: { q: MockQuestion; wide?: boolean }) {
  return (
    <div className={wide ? 'grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]' : ''}>
      {wide && (
        <div className="self-start rounded-xl border bg-white p-4 lg:sticky lg:top-28">
          <QImg q={q} />
        </div>
      )}
      <div className={wide ? 'rounded-xl border bg-white p-5' : ''}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-lg font-bold" style={{ color: NAVY }}>{q.no}번</span>
          <span className="text-xs text-gray-400">{q.sec}</span>
          <span className="rounded px-2 py-0.5 text-xs font-bold text-white" style={{ background: DIFF_COLOR[q.difficulty] }}>{q.difficulty}</span>
          <span className="text-xs text-gray-500">{q.pts}점 · 권장 {fmtTime(q.seconds)}</span>
          <span className="ml-auto font-bold text-blue-700">정답 {q.answer}</span>
        </div>
        <div className="mt-1 text-xs text-gray-500">{q.unit} · {q.type}</div>
        <div className="mx-sec">
          <h4>문제 해석</h4><p><Tex text={q.read} /></p>
          <h4>접근 방법</h4><p><Tex text={q.approach} /></p>
          <h4>단계별 풀이</h4>
          <ol className="list-decimal pl-5">{q.steps.map((s, i) => <li key={i}><Tex text={s} /></li>)}</ol>
          <h4>정답이 되는 이유</h4><p><Tex text={q.why} /></p>
          {q.choices.length > 0 && (
            <>
              <h4>선지 하나하나</h4>
              <ul>
                {q.choices.map((c) => (
                  <li key={c.n}><b style={{ color: c.ok ? '#1d4ed8' : '#9ca3af' }}>{c.n} {c.ok ? '정답' : '오답'}</b> <Tex text={c.note} /></li>
                ))}
              </ul>
            </>
          )}
          <h4>알아 둘 것</h4><p><Tex text={q.know} /></p>
          <h4>자주 하는 실수</h4><p><Tex text={q.mistakes} /></p>
          <h4>복습 방법</h4><p><Tex text={q.review} /></p>
        </div>
      </div>
    </div>
  )
}

function PrintSheet({ exam, track, list, mode }: { exam: MockExam; track: Track | null; list: MockQuestion[]; mode: PrintMode }) {
  const head = (what: string) => (
    <div className="mb-4 flex items-end gap-3 border-b-2 pb-2" style={{ borderColor: NAVY }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="수학의지혜" style={{ height: 30 }} />
      <div>
        <div className="text-lg font-bold" style={{ color: NAVY }}>{exam.title} — {what}</div>
        <div className="text-xs text-gray-500">{track ? `공통 + ${track}` : exam.grade} · {list.length}문항</div>
      </div>
    </div>
  )
  return (
    <div className="mx-print mt-4">
      {mode !== 'solutions' && (
        <section>
          {head('문제지')}
          <div style={{ columns: 2, columnGap: '8mm' }}>
            {list.map((q) => (
              <div key={q.sec + q.no} className="mx-q">
                {mode === 'both' ? (
                  <><QImg q={q} print /><div className="mt-2"><Solution q={q} /></div></>
                ) : <QImg q={q} print />}
              </div>
            ))}
          </div>
        </section>
      )}
      {mode === 'solutions' && (
        <section>
          {head('해설지')}
          {list.map((q) => (
            <div key={q.sec + q.no} className="mx-sol">
              <Solution q={q} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
