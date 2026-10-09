// 학교 기출 PDF(한글에서 변환한 것)를 브라우저에서 문항별 그림으로 자른다 (200dpi).
// scripts/exam-paper/crop.py 를 그대로 옮긴 것 — 규칙을 바꾸면 두 곳을 같이 고칠 것.
//
// 한글 작업 파일은 2단 편집이고, 문항마다 맨 앞 줄에 작은 미주 번호 「3)」가 따로 찍혀 있다. 그 번호가 문항의 시작.
// 한 문항이 다음 단·다음 쪽으로 넘어가면 조각을 이어 붙인다.
// 마지막 쪽의 「1) ③ … 21) 논술1. …」 목록은 정답표 — 문항이 아니라 정답으로 읽는다.
// ①~⑤ 가 아닌 정답(논술형·수식)은 글자로 옮기면 수식이 빠지므로 그 칸을 그림으로도 잘라 둔다.

const DPI = 200
const Z = DPI / 72
const INK = 200                       // 이보다 어두우면 글자·그림
const MARK = /^(\d+)\)$/

export type CroppedProblem = {
  no: number
  page: number
  w: number
  h: number
  parts: number
  points: number | null               // [3점] — 수식으로 찍혀 안 읽히면 null (화면에서 적는다)
  essay: boolean
  choices: number
  answer: string | null
  image: HTMLCanvasElement
  answerImage: HTMLCanvasElement | null
}
export type CropResult = { pages: number; problems: CroppedProblem[]; answersFound: number; warnings: string[] }

type Item = { str: string; x: number; x1: number; base: number; top: number; bottom: number; size: number }

function inkRows(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number] | null {
  if (w < 1 || h < 1) return null
  const d = ctx.getImageData(0, 0, w, h).data
  let first = -1, last = -1
  for (let y = 0; y < h; y++) {
    let ink = false
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < INK) { ink = true; break }
    }
    if (ink) { if (first < 0) first = y; last = y }
  }
  return first < 0 ? null : [first, last]
}

function sub(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(src, Math.round(x), Math.round(y), c.width, c.height, 0, 0, c.width, c.height)
  return c
}

// pt 단위 사각형을 쪽 그림에서 잘라, 글자가 있는 줄만 남긴다 (위 6px · 아래 8px 여유)
function clip(pageCanvas: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): HTMLCanvasElement | null {
  const c = sub(pageCanvas, x0 * Z, y0 * Z, (x1 - x0) * Z, (y1 - y0) * Z)
  const rows = inkRows(c.getContext('2d', { willReadFrequently: true })!, c.width, c.height)
  if (!rows) return null
  const top = Math.max(0, rows[0] - 6), bot = Math.min(c.height, rows[1] + 8)
  return sub(c, 0, top, c.width, bot - top)
}

function textIn(items: Item[], x0: number, y0: number, x1: number, y1: number): string {
  return items
    .filter((t) => (t.x + t.x1) / 2 >= x0 && (t.x + t.x1) / 2 <= x1 && t.base >= y0 && t.base <= y1 + 2)
    .sort((a, b) => (Math.abs(a.base - b.base) < 3 ? a.x - b.x : a.base - b.base))
    .map((t) => t.str).join(' ')
}

export async function cropExamPdf(data: ArrayBuffer, onProgress?: (page: number, pages: number) => void): Promise<CropResult> {
  const pdfjs: any = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data }).promise
  const warnings: string[] = []
  const problems: { no: number; page: number; parts: HTMLCanvasElement[]; text: string }[] = []
  let cur: (typeof problems)[number] | null = null
  const answers: Record<number, string> = {}
  const answerImages: Record<number, HTMLCanvasElement> = {}

  for (let pi = 0; pi < doc.numPages; pi++) {
    onProgress?.(pi + 1, doc.numPages)
    const page = await doc.getPage(pi + 1)
    const vp1 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: Z })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    // intent 'print': 화면용은 requestAnimationFrame 으로 나눠 그려서, 다른 탭을 보고 있으면 멈춘다
    await page.render({ canvasContext: ctx, viewport: vp, canvas, intent: 'print' } as any).promise

    const tc = await page.getTextContent()
    const items: Item[] = []
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue
      const t = pdfjs.Util.transform(vp1.transform, it.transform)
      const size = Math.hypot(t[2], t[3])
      items.push({ str: it.str.trim(), x: t[4], x1: t[4] + it.width, base: t[5], top: t[5] - size * 0.8, bottom: t[5] + size * 0.2, size })
    }

    // 두 단의 가로 범위 — 가운데 세로선이 있으면 그 자리, 없으면 쪽 한가운데
    let mid = vp1.width / 2
    {
      const x0 = Math.round((mid - 40) * Z), x1 = Math.round((mid + 40) * Z)
      const img = ctx.getImageData(x0, 0, x1 - x0, canvas.height).data
      const w = x1 - x0
      let best = 0, bestX = -1
      for (let x = 0; x < w; x++) {
        let n = 0
        for (let y = 0; y < canvas.height; y += 4) if (img[(y * w + x) * 4] < INK) n++
        if (n > best) { best = n; bestX = x }
      }
      if (best > (canvas.height / 4) * 0.25) mid = (x0 + bestX) / Z
    }
    const lefts = items.filter((t) => t.x < mid).map((t) => t.x)
    const rights = items.filter((t) => t.x > mid).map((t) => t.x1)
    const left = (lefts.length ? Math.min(...lefts) : 40) - 3
    const right = (rights.length ? Math.max(...rights) : vp1.width - 40) + 3
    const cols: [number, number][] = [[left, mid - 4], [mid + 5, Math.max(right, mid + 5 + (mid - 4 - left))]]
    const colOf = (x: number) => (x < cols[1][0] - 5 ? 0 : 1)

    // 작은 미주 번호 = 문항 시작
    const ms = items
      .filter((t) => MARK.test(t.str) && t.size < 8.5 && Math.abs(t.x - cols[colOf(t.x)][0]) < 12)
      .map((t) => ({ no: Number(t.str.match(MARK)![1]), col: colOf(t.x), y0: t.top, y1: t.bottom }))

    // 정답표 쪽: 번호만 줄줄이 있거나, 작은 미주 번호 없이 「1) ③」 줄이 5개 넘게 있는 쪽
    const lineStarts = items.filter((t) => /^\d+\)/.test(t.str) && Math.abs(t.x - cols[colOf(t.x)][0]) < 14)
    const nMark = items.filter((t) => MARK.test(t.str)).length
    if ((nMark >= 5 && nMark >= 0.4 * items.length) || (!ms.length && lineStarts.length >= 5)) {
      const marks: { no: number; c: number; y0: number; xr: number }[] = []
      let want = Object.keys(answers).length + 1
      for (const c of [0, 1]) {
        const ws = lineStarts.filter((t) => colOf(t.x) === c).sort((a, b) => a.base - b.base)
        for (const t of ws) {
          if (t.str.startsWith(`${want})`)) {
            const head = `${want})`
            marks.push({ no: want, c, y0: t.top, xr: t.str === head ? t.x1 : Math.min(t.x1, t.x + t.size * 0.56 * head.length) })
            want++
          }
        }
      }
      const rows = inkRows(ctx, canvas.width, canvas.height)
      const bottom = Math.min(vp1.height, (rows ? rows[1] / Z : vp1.height) + 6)
      marks.forEach((m, i) => {
        const nxt = marks[i + 1] && marks[i + 1].c === m.c ? marks[i + 1] : null
        const y1 = nxt ? nxt.y0 - 1 : bottom
        const x1 = cols[m.c][1]
        // 번호 글자와 정답이 한 덩어리(「10) ⑤」)로 올 수 있어 단 왼쪽부터 읽고 번호를 떼어 낸다.
        // 수식 글꼴의 사용자 영역 글자(분수선 등)는 글자로 옮길 수 없어 버린다
        let text = textIn(items, cols[m.c][0] - 1, m.y0 - 1, x1, y1).replace(/[-]/g, '').replace(/\s+/g, ' ').trim()
        text = text.replace(new RegExp(`(^|\\s)${m.no}\\)\\s*`), ' ').trim().replace(/^(논술|서술)형?\s*\d+\s*[.)]\s*/, '')
        if (/^[①②③④⑤,\s]+$/.test(text.replace(/[^\p{L}\p{N}①②③④⑤,]/gu, '') || ' ')) text = text.replace(/[^①②③④⑤,]/g, '')   // 빈 수식 틀 같은 찌꺼기는 버린다
        if (!text) return
        answers[m.no] = text
        if (/^([①②③④⑤,\s]+|-?\d+(\.\d+)?)$/.test(text)) return
        // 분수는 번호 줄보다 위로 올라온다 → 위로 9pt 더. 대신 윗 정답의 꼬리가 딸려 오면 지운다
        const c = sub(canvas, (m.xr + 1) * Z, (m.y0 - 9) * Z, (x1 - m.xr - 1) * Z, (y1 - 2 - (m.y0 - 9)) * Z)
        const g = c.getContext('2d', { willReadFrequently: true })!
        const im = g.getImageData(0, 0, c.width, c.height)
        const gray = (x: number, y: number) => { const i = (y * c.width + x) * 4; return im.data[i] * 0.299 + im.data[i + 1] * 0.587 + im.data[i + 2] * 0.114 }
        const todo: [number, number][] = []
        const seen = new Uint8Array(c.width * Math.min(c.height, 30))
        for (let x = 0; x < c.width; x++) if (gray(x, 0) < INK) { todo.push([x, 0]); seen[x] = 1 }
        while (todo.length) {
          const [x, y] = todo.pop()!
          const i = (y * c.width + x) * 4
          im.data[i] = im.data[i + 1] = im.data[i + 2] = 255
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x + 1, y + 1], [x - 1, y + 1]]) {
            if (nx < 0 || nx >= c.width || ny >= Math.min(c.height, 30) || seen[ny * c.width + nx] || gray(nx, ny) >= 235) continue
            seen[ny * c.width + nx] = 1; todo.push([nx, ny])
          }
        }
        g.putImageData(im, 0, 0)
        const r2 = inkRows(g, c.width, c.height)
        if (r2) answerImages[m.no] = sub(c, 0, Math.max(0, r2[0] - 6), c.width, Math.min(c.height, r2[1] + 8) - Math.max(0, r2[0] - 6))
      })
      continue
    }

    // 쪽·단 순서대로 「번호 자리」와 「단 끝」을 한 줄로 늘어놓는다
    const pageRows = inkRows(ctx, canvas.width, canvas.height)
    const bottom = Math.min(vp1.height, (pageRows ? pageRows[1] / Z : vp1.height) + 4)
    const stream: { c: number; y0: number; y1: number | null; no: number | null }[] = []
    for (const c of [0, 1]) {
      const cm = ms.filter((m) => m.col === c).sort((a, b) => a.y0 - b.y0)
      let y = 0
      const startLen = stream.length
      for (const m of cm) {
        if (m.y0 > y + 2) stream.push({ c, y0: y, y1: m.y0 - 1, no: null })          // 앞 문항의 이어지는 부분
        stream.push({ c, y0: m.y1 + 1, y1: null, no: m.no })
        y = m.y1 + 1
      }
      if (stream.length > startLen && stream[stream.length - 1].y1 === null) stream[stream.length - 1].y1 = bottom
      else if (!cm.length) stream.push({ c, y0: 0, y1: bottom, no: null })
    }
    stream.forEach((s, i) => { if (s.y1 === null) { const n = stream[i + 1]; s.y1 = n.no === null ? n.y0 : n.y0 - 8 } })

    for (const s of stream) {
      if (s.no !== null) { cur = { no: s.no, page: pi + 1, parts: [], text: '' }; problems.push(cur) }
      if (!cur || s.y1! - s.y0 < 3) continue
      const [x0, x1] = cols[s.c]
      const y0 = Math.max(s.y0, 30)
      cur.text += ' ' + textIn(items, x0, y0, x1, s.y1!)
      const part = clip(canvas, x0, y0, x1, s.y1!)
      if (part) cur.parts.push(part)
    }
    canvas.width = canvas.height = 0          // 쪽 그림은 바로 버린다 (13쪽이면 200MB 가 넘는다)
  }

  const out: CroppedProblem[] = []
  for (const p of problems) {
    if (!p.parts.length) { warnings.push(`${p.no}번: 내용이 없습니다`); continue }
    const w = Math.max(...p.parts.map((c) => c.width))
    const h = p.parts.reduce((a, c) => a + c.height, 0) + 10 * (p.parts.length - 1)
    const sheet = document.createElement('canvas')
    sheet.width = w; sheet.height = h
    const g = sheet.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h)
    let y = 0
    for (const c of p.parts) { g.drawImage(c, 0, y); y += c.height + 10 }
    const text = p.text.replace(/\s+/g, ' ').trim()
    const pts = text.match(/\[\s*(\d+(?:\.\d+)?)\s*점\s*\]/)
    out.push({
      no: p.no, page: p.page, w, h, parts: p.parts.length,
      points: pts ? Number(pts[1]) : null,
      essay: /서술|논술|풀이 과정|물음에 답하시오|\[\s*총/.test(text),
      choices: Array.from('①②③④⑤').filter((c) => text.includes(c)).length,
      answer: answers[p.no] ?? null,
      image: sheet,
      answerImage: answerImages[p.no] ?? null,
    })
  }
  const nos = out.map((p) => p.no)
  if (!out.length) warnings.push('문항 번호(작은 미주 번호 「1)」)를 찾지 못했습니다. 한글에서 변환한 PDF 인지 확인해 주세요.')
  else if (nos.some((n, i) => n !== i + 1)) warnings.push(`문항 번호가 1부터 이어지지 않습니다: ${nos.join(', ')}`)
  return { pages: doc.numPages, problems: out, answersFound: Object.keys(answers).length, warnings }
}

// 인쇄 1쪽에 들어가는 문항 그림의 최대 세로(175mm). 넘으면 줄여서 올린다 — 인쇄 화면은 「px ÷ 200dpi」 크기 그대로 찍는다
const MAX_PX = Math.floor((175 / 25.4) * DPI)
export function toPngBase64(c: HTMLCanvasElement, fit = false): string {
  let src = c
  if (fit && c.height > MAX_PX) {
    src = document.createElement('canvas')
    src.height = MAX_PX; src.width = Math.round((c.width * MAX_PX) / c.height)
    const g = src.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(c, 0, 0, src.width, src.height)
  }
  return src.toDataURL('image/png').split(',')[1]
}
