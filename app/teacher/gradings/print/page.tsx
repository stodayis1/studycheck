// 재출제 시험지 인쇄 화면. /teacher/gradings/print?code=XXXXXX
// 브라우저 인쇄(Ctrl+P)로 종이 또는 PDF로 뽑는다.
'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { apiFetch } from '@/lib/apiFetch'

const NAVY = '#0f3460'
const GOLD = '#c8992e'
const HEADER_CROP_PX = 37 // 교재 이미지 맨 위의 문제번호 띠를 잘라낸다

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

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
  const [solveMm, setSolveMm] = useState(20)
  const [perCol, setPerCol] = useState(3) // 한 단에 넣을 문항 수 (2 또는 3)

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

        {/* 한 쪽 = (한 단에 2~3문항) × 2단.
            왼쪽 단을 위에서부터 채우고 오른쪽 단으로 넘어가며, 좌우 줄 높이가 맞는다.
            (예전에는 홀수는 왼쪽·짝수는 오른쪽으로 갈라 넣어 지그재그였고, 쪽마다 문항 수가 들쭉날쭉했다) */}
        {chunk(data.problems, perCol * 2).map((group, gi) => (
          <div className="pagegrid" key={gi}>
            {group.map((p) => (
              <Q key={p.no} p={p} showSource={showSource} showBadge={showBadge} solveMm={solveMm} />
            ))}
          </div>
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
        .pagegrid {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          grid-template-rows: repeat(${perCol}, 1fr);
          grid-auto-flow: column;
          column-gap: 16mm;
          row-gap: 7mm;
          height: 237mm;
          break-after: page;
          break-inside: avoid;
        }
        /* 1쪽에는 머리말과 인적사항 칸이 있어 그만큼 낮다 */
        .pagegrid:first-of-type {
          height: 203mm;
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
        /* 칸 높이가 정해져 있으므로 그림은 칸에 맞춰 줄인다 (가로가 남아도 세로로 안 넘치게) */
        .qimg {
          overflow: hidden;
          display: flex;
          min-height: 0;
        }
        .qimg img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
          object-position: left top;
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
}: {
  p: P
  showSource: boolean
  showBadge: boolean
  solveMm: number
}) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [crop, setCrop] = useState(0) // % of width

  const onLoad = () => {
    const el = imgRef.current
    if (p.crop && el?.naturalWidth) setCrop((HEADER_CROP_PX / el.naturalWidth) * 100)
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
            style={{ marginTop: `-${crop}%` }}
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
