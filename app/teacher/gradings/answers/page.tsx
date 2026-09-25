'use client'

// 선생님용 답지·해설지 인쇄 화면 — /teacher/gradings/answers?code=XXXXXX
//
// 학생에게 주는 시험지(=/teacher/gradings/print)와 달리 이건 선생님만 본다.
//   · 답지  : 번호별 정답을 한 장에 (채점할 때 옆에 두고 쓴다)
//   · 해설지: 해설집에서 잘라 둔 풀이. 증명 서술형은 이게 있어야 매길 수 있다
// 위쪽 단추로 「답지만 / 해설지만 / 둘 다」를 고른 뒤 Ctrl+P.

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'
const GOLD = '#c8992e'

type P = {
  no: number
  source: string | null
  difficulty: string | null
  typeTitle: string | null
  isEssay: boolean
  answerText: string | null
  choices: string[]
  answerImage: string | null
  solution: string | null
  solutionFrom: string | null
}
type Data = {
  sheet: { code: string; title: string; grade: string | null; semester: number | null }
  problems: P[]
}

export default function AnswerKeyPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  )
}

function Inner() {
  const sp = useSearchParams()
  const code = sp.get('code')
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [show, setShow] = useState<'both' | 'answers' | 'solutions'>('both')
  const [cols, setCols] = useState(4) // 답지 한 줄에 몇 칸

  useEffect(() => {
    if (!code) return
    apiFetch(`/api/answer-key?code=${code}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setData(j)
      })
      .catch((e) => setErr(e.message))
  }, [code])

  if (err) return <p className="p-10 text-center text-gray-500">{err}</p>
  if (!data) return <p className="p-10 text-center text-gray-400">불러오는 중…</p>

  const withSol = data.problems.filter((p) => p.solution)
  const sub = [data.sheet.grade, `${data.problems.length}문항`].filter(Boolean).join(' · ')

  return (
    <>
      {/* 인쇄에는 안 나오는 조작 막대 */}
      <div className="no-print sticky top-0 z-50 flex flex-wrap items-center gap-3 border-b bg-white px-4 py-3 text-sm">
        <span className="font-semibold" style={{ color: NAVY }}>{data.sheet.title}</span>
        <span className="text-gray-400">선생님용</span>
        <div className="flex rounded-lg border overflow-hidden">
          {([['both', '둘 다'], ['answers', '답지만'], ['solutions', '해설지만']] as const).map(
            ([k, label]) => (
              <button
                key={k}
                onClick={() => setShow(k)}
                className="px-3 py-1.5"
                style={show === k ? { background: NAVY, color: '#fff' } : { color: '#555' }}
              >
                {label}
              </button>
            )
          )}
        </div>
        <label className="flex items-center gap-1.5">
          답지 칸 수
          <select value={cols} onChange={(e) => setCols(Number(e.target.value))} className="rounded border px-1.5 py-0.5">
            {[3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="text-gray-400">
          해설 {withSol.length}/{data.problems.length}문항
        </span>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg px-4 py-2 font-medium text-white"
          style={{ background: NAVY }}
        >
          인쇄 / PDF 저장
        </button>
      </div>

      <div className="sheet">
        {/* ── 답지 ── */}
        {show !== 'solutions' && (
          <section className="block-a">
            <Head title={`${data.sheet.title} — 답지`} sub={sub} code={data.sheet.code} />
            <div className="akey" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {data.problems.map((p) => (
                <div className="acell" key={p.no}>
                  <span className="ano">{String(p.no).padStart(2, '0')}</span>
                  <span className="aval">
                    {p.choices.length ? (
                      <b className="circ">{p.choices.join(', ')}</b>
                    ) : p.answerText ? (
                      <b>{p.answerText}</b>
                    ) : p.answerImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.answerImage} alt="" />
                    ) : (
                      <span className="none">—</span>
                    )}
                  </span>
                  {p.isEssay && <span className="tag">서술</span>}
                </div>
              ))}
            </div>
            <div className="src">
              <div className="srchead">문항 출처</div>
              <div className="srcgrid" style={{ gridTemplateColumns: `repeat(${Math.min(cols, 3)}, 1fr)` }}>
                {data.problems.map((p) => (
                  <div key={p.no}>
                    <b>{String(p.no).padStart(2, '0')}</b> {p.source ?? '-'}
                    {p.difficulty ? ` · ${p.difficulty}` : ''}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── 해설지 ── */}
        {show !== 'answers' && (
          <section className={show === 'both' ? 'pagebreak' : ''}>
            <Head title={`${data.sheet.title} — 해설지`} sub={sub} code={data.sheet.code} />
            {!withSol.length && (
              <p className="empty">아직 이 시험지의 해설이 준비되지 않았습니다.</p>
            )}
            <div className="sols">
              {data.problems.map((p) => (
                <div className="sol" key={p.no}>
                  <div className="solhead">
                    <span className="num">{String(p.no).padStart(2, '0')}</span>
                    {p.difficulty && <span className={`badge b-${p.difficulty}`}>{p.difficulty}</span>}
                    <span className="ans">
                      정답 <b>{p.answerText ?? (p.isEssay ? '서술형' : '—')}</b>
                    </span>
                    <span className="right">{p.source}</span>
                  </div>
                  {p.solution ? (
                    <>
                      {p.solutionFrom && (
                        <div className="borrow">
                          ※ 쌍둥이 문항 <b>{p.solutionFrom}</b>의 풀이입니다 — 푸는 방법은 같고 숫자만 다릅니다.
                        </div>
                      )}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="solimg" src={p.solution} alt={`${p.no}번 풀이`} />
                    </>
                  ) : (
                    <p className="nosol">해설이 아직 없습니다.</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <style jsx global>{`
        @page { size: A4; margin: 12mm 11mm; }
        @media print { .no-print { display: none !important; } }
        body { background: #f3f4f6; }
        .sheet {
          max-width: 190mm; margin: 0 auto; padding: 8mm 0 12mm;
          background: #fff; color: #111; font-size: 10.5pt;
        }
        .hd { display: flex; align-items: center; gap: 10px;
              border-bottom: 2.5px solid ${NAVY}; padding-bottom: 6px; margin-bottom: 8px; }
        .hd .logo { height: 34px; }
        .hd h1 { margin: 0; font-size: 14pt; color: ${NAVY}; font-weight: 700; }
        .hd .sub { font-size: 8.5pt; color: #666; margin-top: 2px; }
        .hd .code { margin-left: auto; text-align: right; font-size: 8pt; color: #555; }
        .hd .code b { display: block; font-size: 12pt; color: ${GOLD}; letter-spacing: 1px; }
        /* 답지 — 번호와 답을 한 칸에 */
        .akey { display: grid; gap: 0; border: 1px solid ${NAVY}; border-bottom: 0; }
        .acell { display: flex; align-items: center; gap: 6px; padding: 5px 8px;
                 border-bottom: 1px solid #cbd5e1; border-right: 1px solid #cbd5e1; min-height: 30px; }
        .acell:nth-child(${cols}n) { border-right: 0; }
        .ano { font-weight: 800; color: ${NAVY}; font-size: 9.5pt; min-width: 22px; }
        .aval { flex: 1; min-width: 0; }
        .aval b { color: #1d4ed8; }
        .aval .circ { font-size: 13pt; }
        .aval img { max-height: 22px; max-width: 100%; vertical-align: middle; }
        .aval .none { color: #cbd5e1; }
        .tag { font-size: 6.5pt; color: #b45309; background: #fef3c7; border-radius: 6px; padding: 1px 4px; }
        /* 출처 표 */
        .src { margin-top: 8mm; }
        .srchead { font-size: 9pt; font-weight: 700; color: ${NAVY}; margin-bottom: 4px; }
        .srcgrid { display: grid; gap: 2px 10px; font-size: 8pt; color: #555; }
        .srcgrid b { color: ${NAVY}; }
        /* 해설지 */
        .pagebreak { break-before: page; }
        .sols { display: flex; flex-direction: column; gap: 6mm; }
        .sol { break-inside: avoid; border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
        .solhead { display: flex; align-items: center; gap: 6px; padding: 4px 8px;
                   background: #eef2f8; border-bottom: 1px solid #e5e7eb; font-size: 9pt; }
        .solhead .num { font-weight: 800; color: ${NAVY}; font-size: 11pt; }
        .solhead .ans b { color: #1d4ed8; }
        .solhead .right { margin-left: auto; font-size: 7.5pt; color: #94a3b8; }
        .badge { font-size: 7pt; font-weight: 700; padding: 1px 6px; border-radius: 8px; color: #fff; }
        .b-대표 { background: ${GOLD}; } .b-하 { background: #4c6ef5; }
        .b-중 { background: #2f9e44; } .b-상 { background: #c2255c; }
        .borrow { font-size: 8pt; color: #b45309; background: #fffbeb; padding: 3px 8px; }
        .solimg { width: 100%; display: block; }
        .nosol, .empty { font-size: 9pt; color: #9ca3af; padding: 8px; }
      `}</style>
    </>
  )
}

function Head({ title, sub, code }: { title: string; sub: string; code: string }) {
  return (
    <div className="hd">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/logo.png" alt="수학의지혜" />
      <div>
        <h1>{title}</h1>
        <div className="sub">{sub}</div>
      </div>
      <div className="code">
        시험지
        <b>{code}</b>
      </div>
    </div>
  )
}
