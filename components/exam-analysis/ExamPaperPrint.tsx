'use client'
// 「수학의지혜 시험지 양식」으로 기출 한 벌을 통째 인쇄한다.
//
// 양식 (2026 1학기 기말 도래울중 작업본과 같은 모양)
//   맨 위: 「2026학년도 2학기 중간고사」 + 오른쪽 쪽 번호
//   머리 : [수학의 지혜]   3학년   수학   [도래울중]      ← 쪽마다 반복
//   본문 : 2단, 가운데 세로줄, 문항 앞에 「1.」
//   맨 아래: 줄 + 「1/6」
//
// 쪽 짜기는 화면에서 재지 않고 **숫자로 계산한다.** 문항 그림은 200dpi 라 「px ÷ 200 × 25.4」가
// 곧 mm 다. 단 높이(BODY_MM)에 몇 문항이 들어가는지 더해 보고, 남는 자리는 그 단의 문항들이
// 풀이 여백으로 고르게 나눠 갖는다. 그래서 한 단의 높이 합은 언제나 BODY_MM 과 같다 (넘치지 않는다).
import { useEffect, useMemo, useState } from 'react'
import {
  PAGE_W, PAGE_H, PAD_X, PAD_TOP, PAD_BOTTOM, HEAD_MM, FOOT_MM, BODY_MM, GAP_MM, COL_MM, NUM_MM,
  AK_COLS, AK_ROW_MM, AK_IMG_MM, akWeight, answerPages, layout, sizeOf,
} from '@/lib/examPrintLayout'

export type PaperInfo = { exam_year: number; term: number; exam_type: string; school_name: string; grade: string; exam_name?: string | null }
export type PrintProblem = {
  no: string
  url: string
  // 아래는 「빠른 정답」에만 쓴다 (시험지 인쇄는 그림만 쓴다)
  answer?: string | null
  answerUrl?: string | null     // 글자로 못 옮긴 정답(서술형)은 그림으로 온다 — 있으면 **그림이 먼저**다
  qType?: string | null
  points?: number | null
}

export function examTitle(p: PaperInfo) {
  return `${p.exam_year}학년도 ${p.term}학기 ${p.exam_type}`
}
// 저장할 때의 파일 이름: 26년 도래울중 2학기 중간고사
export function docTitle(p: PaperInfo) {
  return `${String(p.exam_year).slice(2)}년 ${p.school_name} ${p.term}학기 ${p.exam_type}`
}

export function ExamPaperPrint({ paper, problems, initial = 'paper' }: {
  paper: PaperInfo
  problems: PrintProblem[]
  initial?: 'paper' | 'answers'
}) {
  const [what, setWhat] = useState<'paper' | 'answers' | 'both'>(initial)
  const [sizes, setSizes] = useState<Record<string, { w: number; h: number }> | null>(null)
  const [perCol, setPerCol] = useState(3)
  const [zoom, setZoom] = useState(1)

  // 그림을 미리 다 받아 크기를 안다 (크기를 알아야 쪽을 짤 수 있다)
  useEffect(() => {
    let dead = false
    Promise.all(
      problems.map((p) => new Promise<[string, { w: number; h: number }]>((ok) => {
        const img = new Image()
        img.onload = () => ok([p.no, { w: img.naturalWidth, h: img.naturalHeight }])
        img.onerror = () => ok([p.no, { w: 0, h: 0 }])
        img.src = p.url
      }))
    ).then((list) => { if (!dead) setSizes(Object.fromEntries(list)) })
    return () => { dead = true }
  }, [problems])

  useEffect(() => { setWhat(initial) }, [initial])
  // PDF 로 저장할 때의 파일 이름 — 빠른 정답만 뽑으면 이름도 그렇게
  useEffect(() => { document.title = docTitle(paper) + (what === 'answers' ? ' 빠른 정답' : '') }, [paper, what])

  const broken = sizes ? problems.filter((p) => !sizes[p.no]?.w).map((p) => p.no) : []
  const pages = useMemo(() => {
    if (!sizes) return null
    const items = problems.filter((p) => sizes[p.no]?.w).map((p) => ({ ...p, ...sizeOf(sizes[p.no].w, sizes[p.no].h, zoom) }))
    return layout(items, perCol)
  }, [sizes, problems, perCol, zoom])

  const gradeNo = paper.grade.replace(/[^0-9]/g, '')

  return (
    <>
      <div className="no-print sticky top-0 z-50 flex flex-wrap items-center gap-4 border-b border-gray-200 bg-white px-4 py-3 text-sm">
        <span className="font-semibold">{docTitle(paper)}</span>
        <div className="flex overflow-hidden rounded-lg border">
          {([['paper', '시험지'], ['answers', '빠른 정답'], ['both', '둘 다']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setWhat(k)} className="px-3 py-1.5"
              style={what === k ? { background: '#111', color: '#fff' } : { color: '#555' }}>{label}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5">한 단에
          <select value={perCol} onChange={(e) => setPerCol(Number(e.target.value))} className="rounded border px-1.5 py-0.5">
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}문항</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5">글씨 크기
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="rounded border px-1.5 py-0.5">
            <option value={1}>원본</option><option value={0.9}>90%</option><option value={0.8}>80%</option>
          </select>
        </label>
        <span className="text-gray-400">
          {pages ? `${problems.length}문항 · 시험지 ${pages.length}쪽 · 빠른 정답 ${answerPages(problems, akWeight).length}쪽` : '문항을 불러오는 중…'}
        </span>
        {!!broken.length && <span className="text-red-600">그림을 못 불러온 문항: {broken.join(', ')}번</span>}
        <button onClick={() => window.print()} disabled={!pages} className="ml-auto rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-40">
          인쇄 / PDF 저장
        </button>
      </div>

      <div className="ep-wrap">
        {(what === 'answers' ? [] : pages ?? []).map((page, pi) => (
          <div className="ep-page" key={pi}>
            <div className="ep-top">
              <span>{examTitle(paper)}</span>
              <span className="ep-pno">{pi + 1}</span>
            </div>
            <div className="ep-head">
              <span className="ep-box ep-round">수학의 지혜</span>
              <span className="ep-grade">{gradeNo}학년</span>
              <span className="ep-subj">수학</span>
              <span className="ep-box">{paper.school_name}</span>
            </div>
            <div className="ep-body">
              {[0, 1].map((ci) => (
                <div className="ep-col" key={ci}>
                  {(page[ci] ?? []).map((p) => (
                    <div className="ep-q" key={p.no} style={{ height: `${p.slotMm.toFixed(3)}mm` }}>
                      <span className="ep-no">{p.no}.</span>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={`${p.no}번`} style={{ width: `${p.wmm.toFixed(3)}mm`, height: `${p.hmm.toFixed(3)}mm` }} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="ep-foot">{pi + 1}/{pages!.length}</div>
          </div>
        ))}

        {/* 빠른 정답 — 번호와 정답만. 글자로 못 옮긴 서술형 정답은 그림 그대로 싣는다 */}
        {what !== 'paper' && answerPages(problems, akWeight).map((cells, pi, arr) => (
          <div className="ep-page" key={`ak${pi}`}>
            <div className="ep-top">
              <span>{examTitle(paper)} 빠른 정답</span>
              <span className="ep-pno">{pi + 1}</span>
            </div>
            <div className="ep-head">
              <span className="ep-box ep-round">수학의 지혜</span>
              <span className="ep-grade">{gradeNo}학년</span>
              <span className="ep-subj">빠른 정답</span>
              <span className="ep-box">{paper.school_name}</span>
            </div>
            <div className="ep-body ak-body">
              {cells.map((p) => (
                <div className={`ak-cell${p.answerUrl ? ' ak-wide' : ''}`} key={p.no}>
                  <span className="ak-no">{p.no}{p.points ? <em>{p.points}점</em> : null}</span>
                  <span className="ak-a">
                    {p.answerUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={p.answerUrl} alt={`${p.no}번 정답`} />
                      : p.answer ? p.answer : <b className="ak-none">정답 없음</b>}
                  </span>
                </div>
              ))}
            </div>
            <div className="ep-foot">{pi + 1}/{arr.length}</div>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @page { size: A4; margin: 0; }
        @media print {
          .no-print { display: none !important; }
          html, body { background: #fff !important; }
          .ep-wrap { padding: 0 !important; background: #fff !important; }
          .ep-page { margin: 0 !important; box-shadow: none !important; }
        }
        .ep-wrap { background: #e5e7eb; padding: 16px 0; }
        .ep-page {
          width: ${PAGE_W}mm;
          height: ${PAGE_H}mm;
          margin: 0 auto 16px;
          padding: ${PAD_TOP}mm ${PAD_X}mm ${PAD_BOTTOM}mm;
          box-sizing: border-box;
          background: #fff;
          color: #000;
          overflow: hidden;
          break-after: page;
          break-inside: avoid;
          box-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);
          font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif;
        }
        .ep-page:last-child { break-after: auto; }
        .ep-top {
          height: 8mm;
          position: relative;
          text-align: center;
          font-size: 12.5pt;
          line-height: 8mm;
          border-bottom: 0.5mm solid #000;
          box-sizing: border-box;
        }
        .ep-pno { position: absolute; right: 1mm; top: 0; font-size: 15pt; font-family: 'Times New Roman', serif; }
        .ep-head {
          height: 16mm;
          display: grid;
          grid-template-columns: 1fr auto 1fr 1fr;
          align-items: center;
          box-sizing: border-box;
        }
        .ep-box {
          justify-self: start;
          border: 0.5mm solid #000;
          border-radius: 1.5mm;
          padding: 0.6mm 3.5mm;
          font-size: 12pt;
          font-weight: 800;
          letter-spacing: 0.5px;
        }
        .ep-box.ep-round { border-radius: 5mm; }
        .ep-head .ep-box:last-child { justify-self: end; }
        .ep-grade { font-size: 25pt; font-weight: 900; line-height: 1; }
        .ep-subj { justify-self: center; font-size: 15pt; font-weight: 700; }
        .ep-body {
          height: ${BODY_MM}mm;
          margin-top: ${HEAD_MM - 8 - 16}mm;
          display: grid;
          grid-template-columns: ${COL_MM}mm ${COL_MM}mm;
          column-gap: ${GAP_MM}mm;
          position: relative;
          border-top: 0.25mm solid #000;
          box-sizing: border-box;
          overflow: hidden;
        }
        .ep-body::before { content: ''; position: absolute; left: 0; right: 0; top: -1.2mm; border-top: 0.6mm solid #000; }
        .ep-body::after { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; border-left: 0.4mm solid #000; }
        .ep-col { height: ${BODY_MM}mm; overflow: hidden; }
        .ep-q { display: flex; align-items: flex-start; overflow: hidden; box-sizing: border-box; padding-top: 3mm; }
        .ep-no { flex: 0 0 ${NUM_MM}mm; font-size: 10pt; font-weight: 700; line-height: 1.5; }
        .ep-q img { display: block; flex: 0 0 auto; }
        /* 빠른 정답 — 네 단, 줄 높이는 못으로 박혀 있다(AK_ROW_MM) */
        .ak-body { grid-template-columns: repeat(${AK_COLS}, 1fr); column-gap: 4mm; grid-auto-rows: ${AK_ROW_MM}mm; align-content: start; }
        .ak-body::after { content: none; }
        .ak-cell {
          display: flex;
          align-items: center;
          gap: 2mm;
          padding: 1mm 1.5mm;
          border-bottom: 0.2mm dotted #999;
          overflow: hidden;
          box-sizing: border-box;
        }
        .ak-wide { grid-column: span 2; }       /* 그림 정답은 두 칸 — 한 칸이면 글씨가 너무 작다 */
        .ak-no { flex: 0 0 auto; min-width: 8mm; font-size: 11pt; font-weight: 800; }
        .ak-no em { display: block; font-size: 6.5pt; font-weight: 500; font-style: normal; color: #555; }
        .ak-a { flex: 1 1 auto; font-size: 12.5pt; font-weight: 700; text-align: center; line-height: 1.25; overflow: hidden; }
        .ak-a img { display: block; margin: 0 auto; max-width: 100%; max-height: ${AK_IMG_MM}mm; }
        .ak-none { font-size: 9pt; font-weight: 500; color: #999; }
        .ep-foot {
          height: ${FOOT_MM}mm;
          border-top: 0.5mm solid #000;
          box-sizing: border-box;
          text-align: center;
          font-size: 9pt;
          line-height: ${FOOT_MM}mm;
          font-family: 'Times New Roman', serif;
        }
      `}</style>
    </>
  )
}
