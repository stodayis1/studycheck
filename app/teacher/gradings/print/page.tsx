// 재출제 시험지 인쇄 화면. /teacher/gradings/print?code=XXXXXX
// 브라우저 인쇄(Ctrl+P)로 종이 또는 PDF로 뽑는다.
'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'
const GOLD = '#c8992e'
const HEADER_CROP_PX = 37 // 교재 이미지 맨 위의 문제번호 띠를 잘라낸다

// 문제 그림은 모두 200dpi 로 잘라 두었다. 그래서 「원본 px ÷ 200 × 25.4」mm 로 찍으면
// 어느 교재·어느 문항이든 글씨 크기가 똑같아진다.  (칸에 맞춰 줄이면 긴 문항만 작아져 들쭉날쭉해진다)
const DPI = 200
const MM_PER_PX = 25.4 / DPI
const CROP_MM = HEADER_CROP_PX * MM_PER_PX

const PX_PER_MM = 96 / 25.4   // CSS 에서 1mm 는 96/25.4 px 로 정해져 있다
const COL_MM = 87             // (190mm − 단 사이 16mm) ÷ 2
const ROWGAP_MM = 7
const PAGE1_MM = 203          // 1쪽은 머리말·인적사항 칸이 있어 낮다
const PAGEN_MM = 237

type P = {
  no: number
  image: string | null
  difficulty: string | null
  isChoice: boolean
  crop: boolean
  typeTitle: string | null
  source: string | null
}

type Data = {
  sheet: { code: string; title: string; grade: string | null; semester: number | null }
  qr: string
  problems: P[]
}

export default function PrintPage() {
  return (
    <Suspense fallback={null}>
      <PrintInner />
    </Suspense>
  )
}

function PrintInner() {
  const sp = useSearchParams()
  const code = sp.get('code')
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [showBadge, setShowBadge] = useState(true)
  const [solveMm, setSolveMm] = useState(10)
  const [scale, setScale] = useState(1) // 그림 배율 — 전 문항에 똑같이 먹는다
  const [perCol, setPerCol] = useState(3) // 한 단에 넣을 문항 수 (2 또는 3)

  // 문항마다 실제로 몇 mm 를 먹는지 미리 재 둔다 (안 보이는 곳에 한 번 그려서 잰다)
  const measRef = useRef<HTMLDivElement | null>(null)
  const [heights, setHeights] = useState<number[] | null>(null)

  useEffect(() => {
    if (!code) return
    apiFetch(`/api/reprint?code=${code}`)
      .then(async (r) => {
        const j = await r.json()
        if (!r.ok) throw new Error(j.error ?? '불러오지 못했습니다.')
        setData(j)
      })
      .catch((e) => setErr(e.message))
  }, [code])

  // 그림이 다 뜬 뒤에 높이를 잰다
  useEffect(() => {
    if (!data) return
    setHeights(null)
    let dead = false
    const tick: () => void = () => {
      if (dead) return
      const el = measRef.current
      if (!el) {
        setTimeout(tick, 60)
        return
      }
      const imgs = Array.from(el.querySelectorAll('img'))
      if (imgs.some((i) => !i.complete)) {
        setTimeout(tick, 80)
        return
      }
      // requestAnimationFrame 은 탭이 뒤에 있으면 안 불린다 → setTimeout 을 쓴다
      setTimeout(() => {
        if (dead || !measRef.current) return
        setHeights(Array.from(measRef.current.children).map((c) => (c as HTMLElement).offsetHeight))
      }, 50)
    }
    tick()
    return () => {
      dead = true
    }
  }, [data, solveMm, showSource, showBadge, scale])

  // 잰 높이로 쪽을 짠다.
  //  · 왼쪽 단을 위에서부터 채우고, 꽉 차면 오른쪽 단으로 (세로 순서)
  //  · 한 단에 최대 perCol 문항. 그림은 절대 줄이지 않고, 대신 「몇 개가 들어가는지」를 높이로 정한다
  //  · 남는 자리는 그 단의 문항들이 풀이 여백으로 나눠 갖는다 → 아래가 휑하지 않다
  const pages = useMemo(() => {
    if (!data || !heights) return null
    const n = data.problems.length
    const gap = ROWGAP_MM * PX_PER_MM
    const out: P[][][] = []
    let i = 0
    while (i < n) {
      const limit = (out.length === 0 ? PAGE1_MM : PAGEN_MM) * PX_PER_MM
      const page: P[][] = []
      for (let c = 0; c < 2 && i < n; c++) {
        const col: P[] = []
        let used = 0
        while (i < n && col.length < perCol) {
          const need = (col.length ? gap : 0) + (heights[i] ?? 0)
          if (col.length && used + need > limit) break
          used += need
          col.push(data.problems[i])
          i++
        }
        if (!col.length) {
          // 한 문항이 한 쪽보다 큰 경우 — 그래도 한 개는 넣는다 (넘치면 잘린다)
          col.push(data.problems[i])
          i++
        }
        page.push(col)
      }
      out.push(page)
    }
    return out
  }, [data, heights, perCol])

  if (err) return <p className="p-10 text-center text-gray-500">{err}</p>
  if (!data) return <p className="p-10 text-center text-gray-400">불러오는 중…</p>

  return (
    <>
      {/* 인쇄에는 안 나오는 조작 막대 */}
      <div className="no-print sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="font-semibold" style={{ color: NAVY }}>
          {data.sheet.title}
        </span>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showBadge} onChange={(e) => setShowBadge(e.target.checked)} />
          난이도
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={showSource} onChange={(e) => setShowSource(e.target.checked)} />
          출처·유형
        </label>
        <label className="flex items-center gap-1.5">
          한 단에
          <select
            value={perCol}
            onChange={(e) => setPerCol(Number(e.target.value))}
            className="rounded border px-1.5 py-0.5"
          >
            <option value={2}>2문항</option>
            <option value={3}>3문항</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          그림 크기
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className="rounded border px-1.5 py-0.5"
          >
            <option value={1}>원본</option>
            <option value={0.9}>90%</option>
            <option value={0.8}>80%</option>
            <option value={0.7}>70%</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          풀이 여백
          <input
            type="range"
            min={0}
            max={45}
            value={solveMm}
            onChange={(e) => setSolveMm(Number(e.target.value))}
          />
          <span className="w-10 text-gray-400">{solveMm}mm</span>
        </label>
        <span className="text-gray-400">{pages ? `${pages.length}쪽` : '…'}</span>
        <button
          onClick={() => window.print()}
          className="ml-auto rounded-lg px-4 py-2 font-medium text-white"
          style={{ background: NAVY }}
        >
          인쇄 / PDF 저장
        </button>
      </div>

      {/* 표의 tfoot은 인쇄할 때 매 쪽마다 반복된다 → 쪽마다 하단 띠(.foot) 높이만큼 자리를 비워
          문제가 띠 밑으로 들어가 가려지지 않게 한다 */}
      <table className="pagewrap">
        <tfoot>
          <tr>
            <td>
              <div className="foot-space" />
            </td>
          </tr>
        </tfoot>
        <tbody>
          <tr>
            <td>
      <div className="sheet">
        <div className="hdr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="logo" src="/logo.png" alt="수학의지혜" />
          <div className="title">
            <h1>{data.sheet.title}</h1>
            <div className="sub">
              {[data.sheet.grade, `${data.problems.length}문항`].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="meta">
            수학
            <b>{data.sheet.code}</b>
          </div>
          <div className="qr">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.qr} alt="채점 QR" />
            <div>채점</div>
          </div>
        </div>

        <div className="info">
          <div>학년·반</div>
          <div />
          <div>이름</div>
          <div />
          <div>점수</div>
          <div />
        </div>

        {/* 한 쪽 = (한 단에 2~3문항) × 2단. 왼쪽 단을 위에서부터 채우고 오른쪽 단으로 넘어간다.
            그림은 모두 원본 크기(200dpi)로 찍고, 대신 「몇 문항이 들어가는지」를 높이를 재서 정한다.
            그래서 문항마다 글씨 크기가 똑같다. */}
        {(pages ?? []).map((page, gi) => (
          <div className="pagegrid" key={gi}>
            {page.map((col, ci) => (
              <div className="pagecol" key={ci}>
                {col.map((p) => (
                  <Q key={p.no} p={p} showSource={showSource} showBadge={showBadge} solveMm={solveMm} scale={scale} />
                ))}
              </div>
            ))}
          </div>
        ))}
        {!pages && <p style={{ color: '#bbb', fontSize: '9pt' }}>쪽을 짜는 중…</p>}
      </div>

      {/* 높이를 재려고 안 보이는 곳에 한 벌 그려 둔다 (인쇄·화면 모두에 안 나온다) */}
      <div className="measure" ref={measRef} aria-hidden>
        {data.problems.map((p) => (
          <Q key={p.no} p={p} showSource={showSource} showBadge={showBadge} solveMm={solveMm} scale={scale} />
        ))}
      </div>
            </td>
          </tr>
        </tbody>
      </table>

        <div className="foot">
          <span className="msg">To look to the stars is the path itself.</span>
          <span className="right">
            <span className="sid">{data.sheet.code}</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/character.png" alt="" />
          </span>
        </div>

      <style jsx global>{`
        .pagewrap {
          width: 100%;
          border-collapse: collapse;
        }
        .pagewrap td {
          padding: 0;
        }
        .foot-space {
          height: 16mm;
        }
        @page {
          size: A4;
          margin: 12mm 11mm 16mm 11mm;
        }
        @media print {
          .no-print {
            display: none !important;
          }
        }
        .sheet {
          max-width: 190mm;
          margin: 0 auto;
          padding: 8mm 0 20mm;
          color: #111;
          font-size: 10.5pt;
        }
        .hdr {
          display: flex;
          align-items: center;
          gap: 12px;
          border-bottom: 2.5px solid ${NAVY};
          padding-bottom: 7px;
        }
        .hdr .logo {
          height: 44px;
        }
        .title {
          flex: 1;
          min-width: 0;
        }
        .title h1 {
          margin: 0;
          font-size: 15pt;
          color: ${NAVY};
          font-weight: 700;
        }
        .title .sub {
          font-size: 8.8pt;
          color: #666;
          margin-top: 3px;
        }
        .meta {
          text-align: right;
          font-size: 8.5pt;
          color: #555;
        }
        .meta b {
          display: block;
          font-size: 12.5pt;
          color: ${GOLD};
          letter-spacing: 1px;
        }
        .qr img {
          width: 58px;
          height: 58px;
          display: block;
        }
        .qr div {
          font-size: 6pt;
          text-align: center;
          color: #888;
        }
        .info {
          display: grid;
          grid-template-columns: 60px 1fr 44px 1fr 44px 1fr;
          border: 1px solid ${NAVY};
          margin: 7px 0 9px;
          font-size: 9.5pt;
        }
        .info div {
          padding: 5px 6px;
          border-right: 1px solid #b9c2d2;
          min-height: 25px;
        }
        .info div:nth-child(odd) {
          background: #eef2f8;
          font-weight: 700;
          text-align: center;
          color: ${NAVY};
        }
        .info div:last-child {
          border-right: 0;
        }
        /* 한 쪽 = 2~3줄 × 2단. 왼쪽 단을 위에서부터 채우고 오른쪽 단으로 넘어간다.
           줄 높이를 1fr 로 고르게 나눠 좌우 문항이 같은 높이에서 시작한다 */
        .measure {
          position: absolute;
          left: -9999px;
          top: 0;
          width: ${COL_MM}mm;
          visibility: hidden;
          pointer-events: none;
        }
        @media print {
          .measure {
            display: none !important;
          }
        }
        .pagegrid {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 16mm;
          height: ${PAGEN_MM}mm;
          overflow: hidden;
          break-after: page;
        }
        /* 한 단. 문항이 남는 자리를 고르게 나눠 가져 쪽 아래가 휑하지 않다 */
        .pagecol {
          display: flex;
          flex-direction: column;
          gap: ${ROWGAP_MM}mm;
          height: 100%;
          min-height: 0;
        }
        .pagecol > .q {
          flex: 1 1 auto;
        }
        /* 1쪽에는 머리말과 인적사항 칸이 있어 그만큼 낮다 */
        .pagegrid:first-of-type {
          height: ${PAGE1_MM}mm;
        }
        .pagegrid:last-of-type {
          break-after: auto;
        }
        /* 두 단 사이 세로줄 */
        .pagegrid::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          border-left: 1px solid #d5d5d5;
        }
        .q {
          break-inside: avoid;
          display: flex;
          flex-direction: column;
          min-height: 0;
          padding-bottom: 6px;
          border-bottom: 1px dashed #dcdcdc;
        }
        .qhead {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
        }
        .num {
          font-weight: 800;
          font-size: 12pt;
          color: ${NAVY};
        }
        .src {
          font-size: 7.2pt;
          color: #999;
        }
        .badge {
          font-size: 7pt;
          font-weight: 700;
          padding: 1px 6px;
          border-radius: 8px;
          color: #fff;
        }
        .b-대표 {
          background: ${GOLD};
        }
        .b-하 {
          background: #4c6ef5;
        }
        .b-중 {
          background: #2f9e44;
        }
        .b-상 {
          background: #c2255c;
        }
        /* 그림은 원본 크기(200dpi) 그대로 → 문항마다 글씨 크기가 같다.
           칸에 맞춰 줄이면 긴 문항만 작아져서 들쭉날쭉해진다 */
        .qimg {
          overflow: hidden;
          display: block;
        }
        .qimg img {
          max-width: 100%;
          height: auto;
          display: block;
        }
        /* 남는 자리는 풀이 여백이 먹는다 → 답란이 칸 맨 아래에서 좌우로 나란히 맞는다 */
        .solve {
          flex: 1;
          border-left: 2px solid #eceff5;
          margin: 5px 0 6px 3px;
        }
        .ans {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #f5f7fb;
          border: 1px solid #ccd5e6;
          border-radius: 6px;
          padding: 4px 8px;
        }
        .ans .lbl {
          font-size: 8.5pt;
          font-weight: 700;
          color: ${NAVY};
        }
        .bub {
          display: inline-flex;
          width: 19px;
          height: 19px;
          border: 1.3px solid #666;
          border-radius: 50%;
          align-items: center;
          justify-content: center;
          font-size: 9pt;
          background: #fff;
        }
        .abox {
          flex: 1;
          height: 22px;
          border: 1.3px solid #666;
          border-radius: 4px;
          background: #fff;
        }
        .foot {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: 13mm;
          border-top: 1.5px solid ${GOLD};
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          padding: 0 11mm 1mm;
          background: #fff;
        }
        .foot .msg {
          font-family: Georgia, serif;
          font-size: 9.5pt;
          color: ${NAVY};
          font-style: italic;
        }
        .foot .right {
          display: flex;
          align-items: flex-end;
          gap: 6px;
        }
        .foot .sid {
          font-size: 7pt;
          color: #aaa;
          padding-bottom: 1mm;
        }
        .foot img {
          height: 12mm;
        }
      `}</style>
    </>
  )
}

function Q({
  p,
  showSource,
  showBadge,
  solveMm,
  scale,
}: {
  p: P
  showSource: boolean
  showBadge: boolean
  solveMm: number
  scale: number
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [wmm, setWmm] = useState(0) // 원본 크기(200dpi)로 찍었을 때의 가로 mm

  const onLoad = () => {
    const el = imgRef.current
    if (el?.naturalWidth) setWmm(el.naturalWidth * MM_PER_PX)
  }

  return (
    <div className="q">
      <div className="qhead">
        <span className="num">{String(p.no).padStart(2, '0')}</span>
        {showBadge && p.difficulty && <span className={`badge b-${p.difficulty}`}>{p.difficulty}</span>}
        {showSource && (
          <span className="src">{[p.source, p.typeTitle].filter(Boolean).join(' · ')}</span>
        )}
      </div>
      <div className="qimg">
        {p.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={p.image}
            alt={`${p.no}번`}
            onLoad={onLoad}
            style={{
              // 원본 크기 그대로 (단보다 넓은 그림만 max-width 로 줄어든다)
              width: wmm ? `${(wmm * scale).toFixed(2)}mm` : undefined,
              // 교재 맨 위 문제번호 띠를 잘라낸다 — 200dpi 기준이라 항상 같은 mm 다
              marginTop: p.crop ? `-${(CROP_MM * scale).toFixed(2)}mm` : undefined,
            }}
          />
        ) : (
          <p style={{ color: '#bbb', fontSize: '9pt' }}>이미지를 불러오지 못했습니다</p>
        )}
      </div>
      {solveMm > 0 && <div className="solve" style={{ minHeight: `${solveMm}mm` }} />}
      <div className="ans">
        <span className="lbl">답</span>
        {p.isChoice ? (
          ['①', '②', '③', '④', '⑤'].map((c) => (
            <span key={c} className="bub">
              {c}
            </span>
          ))
        ) : (
          <span className="abox" />
        )}
      </div>
    </div>
  )
}
