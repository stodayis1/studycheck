'use client'

// 선생님이 가진 PDF 한 개 → 문항별 그림 → 문제은행 → 수학의지혜 양식 인쇄 (원장님 2026-11-17)
//
// 네 걸음으로 간다.
//   ① PDF 고르기        — 쪽을 그려 놓고 **자동 자르기**를 한 번 해 본다
//   ② 자리 손보기        — 자동이 틀렸거나 못 읽었으면 쪽 그림 위에 네모를 그려 문항을 만든다
//   ③ 확인              — 제목 세 칸(과정 · 단원명 · 난이도) · 문항 수 · 번호 연속 · 배점
//   ④ 넣기              — 문항마다 한 번씩 보낸다 → 바로 인쇄 · 배정
//
// ★ 학교 기출 시험지는 여기 올리지 않는다 — 「시험지 분석」 현황판의 「기출 파일 올리기」(기출모음)로 간다
//   (원장님 2026-11-17 「기출은 기출모음에 넣기로 했잖아」). 적중률 · 블로그 · 연도별 찾기가 거기 달려 있다.
//
// ★ 자동 자르기는 **한글에서 변환한 2단 작업본**만 읽는다(lib/examPdfCrop.ts — 「시험지 분석」과 같은 코드).
//   여기 올라오는 PDF 는 모의고사 · 오답 모음 · 이전 학원 자료라 그 꼴이 아닌 것이 보통이다.
//   그래서 **못 읽어도 막다른 길이 아니다** — 왜 못 읽었는지 적어 주고 손으로 자르기로 보낸다.
//
// ★ 쪽 그림을 전부 200dpi 로 들고 있으면 13쪽에서 200MB 가 넘는다. 그래서
//   보여 주는 것은 낮은 해상도로 그리고, **자를 때만** 그 쪽을 200dpi 로 다시 그린다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cropExamPdf, toPngBase64 } from '@/lib/examPdfCrop'
import { apiFetch } from '@/lib/apiFetch'
import {
  TUTOR_COURSES, TUTOR_LEVELS, tutorCheck, tutorKeyError, tutorTitle, type TutorKey,
} from '@/lib/tutorWorksheet'

const GREEN = '#0f7b6c'
const DPI = 200
const VIEW_SCALE = 1.4            // 보여 주기용 (약 100dpi) — 손으로 네모를 그릴 만큼은 크다

type Rect = { page: number; x0: number; y0: number; x1: number; y1: number }   // 쪽 안에서의 비율 0~1
type Row = {
  no: number
  canvas: HTMLCanvasElement
  url: string
  pointsText: string
  answerText: string
  essay: boolean
  answerCanvas: HTMLCanvasElement | null
  answerUrl: string | null
}

type Stage = 'pick' | 'reading' | 'mark' | 'review' | 'saving' | 'done'

/** pdf.js 를 lib/examPdfCrop.ts 와 같은 방식으로 띄운다 (일꾼 주소까지 같게) */
async function openPdf(data: ArrayBuffer) {
  const pdfjs: any = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  return { pdfjs, doc: await pdfjs.getDocument({ data: data.slice(0) }).promise }
}

async function renderPage(doc: any, pageNo: number, scale: number): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(pageNo)
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(vp.width)
  canvas.height = Math.ceil(vp.height)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  // intent 'print' — 화면용은 requestAnimationFrame 으로 나눠 그려서 다른 탭을 보고 있으면 멈춘다
  await page.render({ canvasContext: ctx, viewport: vp, canvas, intent: 'print' } as any).promise
  return canvas
}

function clipTo(src: HTMLCanvasElement, r: Rect): HTMLCanvasElement | null {
  const x = Math.round(r.x0 * src.width)
  const y = Math.round(r.y0 * src.height)
  const w = Math.round((r.x1 - r.x0) * src.width)
  const h = Math.round((r.y1 - r.y0) * src.height)
  if (w < 8 || h < 8) return null
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const g = out.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, w, h)
  g.drawImage(src, x, y, w, h, 0, 0, w, h)
  return out
}

const mkRow = (no: number, canvas: HTMLCanvasElement, extra?: Partial<Row>): Row => ({
  no,
  canvas,
  url: canvas.toDataURL('image/png'),
  pointsText: '',
  answerText: '',
  essay: false,
  answerCanvas: null,
  answerUrl: null,
  ...extra,
})

export default function PdfWorksheetBuilder({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const [stage, setStage] = useState<Stage>('pick')
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [pdfName, setPdfName] = useState('')
  const [pageViews, setPageViews] = useState<HTMLCanvasElement[]>([])
  const [autoNote, setAutoNote] = useState<string[]>([])
  const [rects, setRects] = useState<Rect[]>([])
  const [byDrawOrder, setByDrawOrder] = useState(false)
  const [rows, setRows] = useState<Row[]>([])
  const [key, setKey] = useState<TutorKey>({ course: '공통수학1', unit: '', level: '중' })
  const [code, setCode] = useState('')
  const dataRef = useRef<ArrayBuffer | null>(null)
  const docRef = useRef<any>(null)

  // 쪽 그림은 커서, 창을 닫을 때 비워 준다
  useEffect(() => () => {
    for (const c of pageViews) { c.width = 0; c.height = 0 }
  }, [pageViews])

  // ── ① PDF 고르기 ───────────────────────────────────────────────────────────
  const pick = async (file: File) => {
    setErr('')
    setPdfName(file.name)
    setStage('reading')
    try {
      const data = await file.arrayBuffer()
      dataRef.current = data
      setMsg('PDF 를 여는 중…')
      const { doc } = await openPdf(data)
      docRef.current = doc
      const views: HTMLCanvasElement[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        setMsg(`쪽을 그리는 중… ${i} / ${doc.numPages}쪽`)
        views.push(await renderPage(doc, i, VIEW_SCALE))
      }
      setPageViews(views)

      // 자동 자르기를 한 번 해 본다 — 되면 바로 확인으로, 안 되면 왜 안 됐는지 적고 손으로
      setMsg('문항 번호를 찾는 중…')
      try {
        const r = await cropExamPdf(data, (p, n) => setMsg(`문항을 자르는 중… ${p} / ${n}쪽`))
        if (r.problems.length) {
          setRows(r.problems.map((p) => mkRow(p.no, p.image, {
            pointsText: p.points ? String(p.points) : '',
            answerText: p.answer ?? '',
            essay: p.essay,
            answerCanvas: p.answerImage ?? null,
            answerUrl: p.answerImage ? p.answerImage.toDataURL('image/png') : null,
          })))
          setAutoNote([`자동으로 ${r.problems.length}문항을 찾았습니다 (${r.pages}쪽).`, ...r.warnings])
          setStage('review')
          return
        }
        setAutoNote([
          '자동으로는 문항을 찾지 못했습니다 — 아래에서 손으로 네모를 그려 주세요.',
          ...r.warnings,
          '자동 자르기는 한글에서 2단으로 짠 작업본(문항 앞에 「1)」 또는 「1.」)만 읽습니다.',
        ])
      } catch (e: any) {
        setAutoNote([`자동 자르기를 하지 못했습니다: ${e?.message ?? e}`, '아래에서 손으로 네모를 그려 주세요.'])
      }
      setStage('mark')
    } catch (e: any) {
      setErr(`PDF 를 읽지 못했습니다: ${e?.message ?? e}`)
      setStage('pick')
    }
  }

  // ── ② 손으로 자르기 → 문항 만들기 ──────────────────────────────────────────
  const sorted = useMemo(() => {
    if (byDrawOrder) return rects
    // 쪽 → 단(왼/오른쪽) → 위에서 아래. 2단 작업본의 읽는 순서다
    return [...rects].sort((a, b) => {
      if (a.page !== b.page) return a.page - b.page
      const ca = (a.x0 + a.x1) / 2 > 0.5 ? 1 : 0
      const cb = (b.x0 + b.x1) / 2 > 0.5 ? 1 : 0
      if (ca !== cb) return ca - cb
      return a.y0 - b.y0
    })
  }, [rects, byDrawOrder])

  const buildFromRects = async () => {
    if (!sorted.length) { setErr('네모를 하나도 그리지 않았습니다.'); return }
    setErr('')
    setStage('reading')
    try {
      const doc = docRef.current ?? (await openPdf(dataRef.current!)).doc
      docRef.current = doc
      const out: Row[] = []
      // 쪽마다 한 번만 200dpi 로 그린다 (네모마다 그리면 13쪽이 수십 번 다시 그려진다)
      const pages = [...new Set(sorted.map((r) => r.page))].sort((a, b) => a - b)
      const made = new Map<Rect, HTMLCanvasElement>()
      for (const pg of pages) {
        setMsg(`문항 그림을 만드는 중… ${pages.indexOf(pg) + 1} / ${pages.length}쪽`)
        const big = await renderPage(doc, pg + 1, DPI / 72)
        for (const r of sorted.filter((x) => x.page === pg)) {
          const c = clipTo(big, r)
          if (c) made.set(r, c)
        }
        big.width = 0; big.height = 0          // 쪽 그림은 바로 버린다
      }
      let n = 0
      for (const r of sorted) {
        const c = made.get(r)
        if (c) out.push(mkRow(++n, c))
      }
      if (!out.length) { setErr('네모가 너무 작습니다. 조금 더 크게 그려 주세요.'); setStage('mark'); return }
      setRows(out)
      setStage('review')
    } catch (e: any) {
      setErr(`문항 그림을 만들지 못했습니다: ${e?.message ?? e}`)
      setStage('mark')
    }
  }

  // ── ④ 넣기 ────────────────────────────────────────────────────────────────
  const check = useMemo(() => tutorCheck(rows.map((r) => ({ no: r.no, points: Number(r.pointsText) || null, w: r.canvas.width, h: r.canvas.height }))), [rows])
  const keyErr = tutorKeyError(key)

  const save = async () => {
    if (keyErr) { setErr(keyErr); return }
    if (check.errors.length) { setErr(check.errors[0]); return }
    setErr('')
    setStage('saving')
    try {
      setMsg('학습지를 만드는 중…')
      const r0 = await apiFetch('/api/pdf-worksheets', {
        method: 'POST',
        body: JSON.stringify({ action: 'start', ...key, pdfName }),
      })
      const j0 = await r0.json()
      if (!r0.ok) throw new Error(j0?.error ?? '학습지를 만들지 못했습니다.')
      const sheetCode: string = j0.code

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i]
        setMsg(`문제은행에 넣는 중… ${i + 1} / ${rows.length}`)
        const res = await apiFetch('/api/pdf-worksheets', {
          method: 'POST',
          body: JSON.stringify({
            action: 'question', code: sheetCode, no: r.no,
            points: Number(r.pointsText) || null, essay: r.essay,
            answer: r.answerText.trim() || null,
            image: toPngBase64(r.canvas, true),
            answerImage: r.answerCanvas ? toPngBase64(r.answerCanvas) : null,
          }),
        })
        const j = await res.json()
        if (!res.ok) throw new Error(`${r.no}번에서 멈췄습니다: ${j?.error ?? '알 수 없는 오류'}`)
      }

      setMsg('마무리하는 중…')
      const rf = await apiFetch('/api/pdf-worksheets', { method: 'POST', body: JSON.stringify({ action: 'finish', code: sheetCode }) })
      const jf = await rf.json()
      if (!rf.ok) throw new Error(jf?.error ?? '마무리하지 못했습니다.')
      setCode(sheetCode)
      setStage('done')
      onDone(sheetCode)
    } catch (e: any) {
      setErr(String(e?.message ?? e))
      setStage('review')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <div>
            <div className="text-base font-bold" style={{ color: GREEN }}>PDF 로 학습지 만들기</div>
            <div className="text-xs text-gray-500">{pdfName || 'PDF 를 고르면 문항별로 잘라 문제은행에 넣습니다'}</div>
          </div>
          {stage !== 'saving' && stage !== 'reading' && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="닫기"><i className="ti ti-x text-xl" /></button>
          )}
        </div>

        {err && <div className="whitespace-pre-line border-b bg-red-50 px-5 py-2 text-sm text-red-700"><i className="ti ti-alert-triangle mr-1" />{err}</div>}

        {/* ① 고르기 */}
        {stage === 'pick' && (
          <div className="px-6 py-10">
            <label className="block cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center hover:bg-gray-50">
              <input type="file" accept="application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f) }} />
              <i className="ti ti-file-type-pdf text-4xl text-gray-400" />
              <div className="mt-3 text-sm font-semibold">PDF 파일을 고르세요</div>
              <div className="mt-1 text-xs text-gray-500">모의고사 · 오답 모음 · 이전 학원에서 만든 자료</div>
              <div className="mt-1 text-xs font-semibold text-amber-700">학교 기출 시험지는 「시험지 분석」의 「기출 파일 올리기」로 올려 주세요</div>
            </label>
            <div className="mt-5 rounded-xl bg-gray-50 p-4 text-xs leading-relaxed text-gray-600">
              <b className="text-gray-800">어떻게 진행되는지</b>
              <ol className="mt-1.5 list-decimal space-y-0.5 pl-4">
                <li>PDF 를 열어 쪽을 보여 주고, 한글 2단 작업본이면 <b>문항을 자동으로</b> 찾습니다.</li>
                <li>자동이 못 읽거나 자리가 틀렸으면 쪽 그림 위에 <b>네모를 그려</b> 문항을 만듭니다.</li>
                <li>제목(<b>과정 - 단원명 - 난이도</b>)을 적고 문항 수 · 번호를 확인합니다.</li>
                <li><b>문제은행에 넣기</b> → 바로 <b>수학의지혜 양식 인쇄</b>와 <b>학생 배정</b>을 할 수 있습니다.</li>
                <li>배정하면 그 학생의 <b>학습지 기록</b>(학생 앱 「선생님이 보낸 학습지」)에 남습니다.</li>
              </ol>
              <p className="mt-2 text-gray-500">넣은 문항은 <b>자동 출제에 섞이지 않습니다</b> — 유형 · 레벨을 붙이지 않기 때문입니다.</p>
            </div>
          </div>
        )}

        {(stage === 'reading' || stage === 'saving') && (
          <div className="px-5 py-20 text-center text-sm text-gray-600">
            <i className="ti ti-loader-2 mr-2 animate-spin" />{msg}
            <div className="mt-2 text-xs text-gray-400">이 창을 닫지 말고 잠시 기다려 주세요.</div>
          </div>
        )}

        {/* ② 손으로 자르기 */}
        {stage === 'mark' && (
          <>
            <div className="border-b px-5 py-3 text-sm">
              {autoNote.map((n) => <div key={n} className="text-xs text-amber-700"><i className="ti ti-info-circle mr-1" />{n}</div>)}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span><b>{rects.length}</b>개 그렸습니다</span>
                <label className="flex items-center gap-1 text-xs text-gray-600">
                  <input type="checkbox" checked={byDrawOrder} onChange={(e) => setByDrawOrder(e.target.checked)} />
                  그린 차례대로 번호 매기기 (끄면 쪽 → 왼쪽 단 → 오른쪽 단 순서)
                </label>
                {rects.length > 0 && <button onClick={() => setRects([])} className="text-xs text-red-600 underline">모두 지우기</button>}
              </div>
              <div className="mt-1 text-xs text-gray-500">문항 하나를 드래그로 감싸 주세요. 네모를 누르면 지워집니다.</div>
            </div>
            <div className="flex-1 overflow-auto bg-gray-100 px-5 py-4">
              {pageViews.map((c, pi) => (
                <PageMarker key={pi} canvas={c} page={pi} rects={sorted}
                  onAdd={(r) => setRects((xs) => [...xs, r])}
                  onRemove={(r) => setRects((xs) => xs.filter((x) => x !== r))} />
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 border-t px-5 py-3">
              <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">취소</button>
              <button onClick={buildFromRects} disabled={!rects.length}
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
                <i className="ti ti-scissors mr-1.5" />{rects.length}문항 만들기
              </button>
            </div>
          </>
        )}

        {/* ③ 확인 */}
        {stage === 'review' && (
          <>
            <div className="border-b px-5 py-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <label className="text-xs text-gray-600">과정
                  <select value={key.course} onChange={(e) => setKey({ ...key, course: e.target.value })}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm">
                    {TUTOR_COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-600">단원명
                  <input value={key.unit} onChange={(e) => setKey({ ...key, unit: e.target.value })} placeholder="삼각함수"
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm" />
                </label>
                <label className="text-xs text-gray-600">난이도
                  <select value={key.level} onChange={(e) => setKey({ ...key, level: e.target.value })}
                    className="mt-0.5 w-full rounded border px-2 py-1.5 text-sm">
                    {TUTOR_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="mt-2 text-sm">
                제목 <b style={{ color: GREEN }}>{tutorTitle(key) || '(과정 - 단원명 - 난이도)'}</b>
                {keyErr && <span className="ml-2 text-xs text-red-600">{keyErr}</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span><b>{rows.length}</b>문항</span>
                <span>번호 <b>{rows.length ? `${rows[0].no} ~ ${rows[rows.length - 1].no}` : '-'}</b></span>
                <span>배점 적은 문항 <b>{check.priced}</b>개{check.priced ? <> · 합 <b className={check.points === 100 ? '' : 'text-amber-700'}>{check.points}</b>점</> : null}</span>
                <span>서술형 <b>{rows.filter((r) => r.essay).length}</b>개</span>
              </div>
              {autoNote.map((n) => <div key={n} className="mt-1 text-xs text-gray-500">{n}</div>)}
              {check.errors.map((n) => <div key={n} className="mt-1 text-xs font-semibold text-red-600"><i className="ti ti-alert-triangle mr-1" />{n}</div>)}
              {check.warns.map((n) => <div key={n} className="mt-1 text-xs text-amber-700"><i className="ti ti-alert-triangle mr-1" />{n}</div>)}
              <div className="mt-1 text-xs text-gray-500">배점 · 정답은 <b>비워 두어도 됩니다</b> (강사 자료에는 없는 것이 보통입니다). 정답이 없으면 학생이 QR 채점에서 스스로 O/X 를 고릅니다.</div>
            </div>
            <div className="flex-1 overflow-auto px-5 py-3">
              <div className="grid gap-3 md:grid-cols-2">
                {rows.map((r) => (
                  <div key={r.no} className="rounded-xl border p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                      <b className="w-9" style={{ color: GREEN }}>{r.no}번</b>
                      <label className="flex items-center gap-1 text-xs text-gray-600">배점
                        <input value={r.pointsText} onChange={(e) => setRows((xs) => xs.map((x) => x.no === r.no ? { ...x, pointsText: e.target.value.replace(/[^\d.]/g, '') } : x))}
                          className="w-12 rounded border px-1.5 py-1 text-center text-sm" />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600">정답
                        <input value={r.answerText} onChange={(e) => setRows((xs) => xs.map((x) => x.no === r.no ? { ...x, answerText: e.target.value } : x))}
                          className="w-24 rounded border px-1.5 py-1 text-sm" />
                      </label>
                      <label className="flex items-center gap-1 text-xs text-gray-600">
                        <input type="checkbox" checked={r.essay} onChange={(e) => setRows((xs) => xs.map((x) => x.no === r.no ? { ...x, essay: e.target.checked } : x))} />서술형
                      </label>
                      <button onClick={() => setRows((xs) => xs.filter((x) => x.no !== r.no).map((x, i) => ({ ...x, no: i + 1 })))}
                        className="ml-auto text-xs text-red-600 underline">빼기</button>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.url} alt={`${r.no}번`} className="max-h-72 w-full rounded border object-contain object-top" />
                    {r.answerUrl && (
                      <div className="mt-2 rounded bg-gray-50 p-1.5">
                        <div className="text-[11px] text-gray-500">정답 그림</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={r.answerUrl} alt={`${r.no}번 정답`} className="mt-1 w-full" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 border-t px-5 py-3">
              {pageViews.length > 0
                ? <button onClick={() => setStage('mark')} className="rounded-lg border px-4 py-2 text-sm"><i className="ti ti-crop mr-1" />자리 손보기</button>
                : <span />}
              <div className="flex gap-2">
                <button onClick={onClose} className="rounded-lg border px-4 py-2 text-sm">취소</button>
                <button onClick={save} disabled={!!keyErr || !!check.errors.length}
                  className="rounded-lg px-5 py-2 text-sm font-semibold text-white disabled:opacity-40" style={{ background: GREEN }}>
                  <i className="ti ti-database-import mr-1.5" />{rows.length}문항 문제은행에 넣기
                </button>
              </div>
            </div>
          </>
        )}

        {/* 끝 */}
        {stage === 'done' && (
          <div className="px-5 py-14 text-center">
            <div className="text-sm font-semibold" style={{ color: GREEN }}>
              <i className="ti ti-circle-check mr-1" />{tutorTitle(key)} — {rows.length}문항을 넣었습니다.
            </div>
            <div className="mt-1 text-xs text-gray-500">학습지 코드 <b>{code}</b></div>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <a href={`/teacher/pdf-worksheets/print?code=${code}`} target="_blank" rel="noreferrer"
                className="rounded-lg px-5 py-2 text-sm font-semibold text-white" style={{ background: GREEN }}>
                <i className="ti ti-printer mr-1.5" />수학의지혜 양식 인쇄
              </a>
              <button onClick={onClose} className="rounded-lg border px-5 py-2 text-sm">목록으로</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 쪽 하나 + 그 쪽에 그린 네모들 ───────────────────────────────────────────
// 그림은 그릴 때마다 다시 그리지 않는다 (쪽 그림이 커서 느려진다) — 한 번 붙여 놓고 네모만 겹친다.
function PageMarker({ canvas, page, rects, onAdd, onRemove }: {
  canvas: HTMLCanvasElement
  page: number
  rects: Rect[]
  onAdd: (r: Rect) => void
  onRemove: (r: Rect) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const mine = rects.filter((r) => r.page === page)
  const url = useMemo(() => canvas.toDataURL('image/png'), [canvas])

  const at = useCallback((e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)),
      y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)),
    }
  }, [])

  return (
    <div className="mx-auto mb-4 w-full max-w-3xl">
      <div className="mb-1 text-xs text-gray-500">{page + 1}쪽</div>
      <div ref={box} className="relative select-none bg-white shadow"
        style={{ aspectRatio: `${canvas.width} / ${canvas.height}`, touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); const p = at(e); setDrag({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }) }}
        onPointerMove={(e) => { if (!drag) return; const p = at(e); setDrag({ ...drag, x1: p.x, y1: p.y }) }}
        onPointerUp={(e) => {
          if (!drag) return
          const p = at(e)
          const r: Rect = {
            page,
            x0: Math.min(drag.x0, p.x), y0: Math.min(drag.y0, p.y),
            x1: Math.max(drag.x0, p.x), y1: Math.max(drag.y0, p.y),
          }
          setDrag(null)
          // 손가락이 떨린 정도(폭·높이 1% 미만)는 네모로 보지 않는다
          if (r.x1 - r.x0 > 0.01 && r.y1 - r.y0 > 0.01) onAdd(r)
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={`${page + 1}쪽`} className="pointer-events-none block w-full" draggable={false} />
        {mine.map((r) => (
          <button key={`${r.x0},${r.y0},${r.x1},${r.y1}`} onClick={() => onRemove(r)} title="누르면 지워집니다"
            className="absolute border-2 bg-emerald-400/15 hover:bg-red-400/25"
            style={{ borderColor: GREEN, left: `${r.x0 * 100}%`, top: `${r.y0 * 100}%`, width: `${(r.x1 - r.x0) * 100}%`, height: `${(r.y1 - r.y0) * 100}%` }}>
            <span className="absolute left-0 top-0 bg-white/90 px-1 text-[11px] font-bold" style={{ color: GREEN }}>
              {rects.indexOf(r) + 1}
            </span>
          </button>
        ))}
        {drag && (
          <div className="pointer-events-none absolute border-2 border-dashed bg-emerald-400/10" style={{
            borderColor: GREEN,
            left: `${Math.min(drag.x0, drag.x1) * 100}%`, top: `${Math.min(drag.y0, drag.y1) * 100}%`,
            width: `${Math.abs(drag.x1 - drag.x0) * 100}%`, height: `${Math.abs(drag.y1 - drag.y0) * 100}%`,
          }} />
        )}
      </div>
    </div>
  )
}
