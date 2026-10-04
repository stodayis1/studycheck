'use client'
// 타이핑한 기출문항을 「학습지에 찍힐 모양 그대로」 그려 주는 상자.
//
// 문제은행의 문항은 전부 200dpi 그림이고, 인쇄 화면은 「원본 px ÷ 200 × 25.4mm」로 찍는다.
// 그래서 타이핑한 문항도 학습지 한 단 폭(87mm)으로 그린 뒤 200dpi 그림으로 구워 넣으면
// 인쇄·QR채점·재출제 화면을 하나도 고치지 않고 교재 문항과 똑같이 쓸 수 있다.
//
// 수식은 $ … $ 사이에 LaTeX 로 적는다. 예) 이차방정식 $x^{2}-3x+2=0$ 의 두 근
import { forwardRef, useEffect, useState } from 'react'
import 'mathlive/static.css'
import { CIRCLES } from '@/lib/examAnalysis'

export const COL_MM = 87          // 인쇄 화면(app/teacher/gradings/print)의 한 단 폭과 같아야 한다
export const BANK_DPI = 200       // 문제은행 그림 해상도
const PX_PER_MM = 96 / 25.4

let mathlive: Promise<any> | null = null
function loadMath() {
  if (!mathlive) mathlive = import('mathlive')
  return mathlive
}

// 글 속의 $…$ 를 수식으로 바꿔 그린다. 줄바꿈은 그대로 살린다
export function MathText({ text }: { text: string | null | undefined }) {
  const [ml, setMl] = useState<any>(null)
  useEffect(() => { loadMath().then(setMl) }, [])
  const parts = String(text ?? '').split(/(\$[^$]+\$)/g)
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((s, i) => {
        if (s.length > 2 && s.startsWith('$') && s.endsWith('$')) {
          const latex = s.slice(1, -1)
          if (!ml) return <span key={i}>{latex}</span>
          let html = ''
          try { html = ml.convertLatexToMarkup(latex) } catch { return <span key={i} style={{ color: '#dc2626' }}>{s}</span> }
          return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />
        }
        return <span key={i}>{s}</span>
      })}
    </span>
  )
}

export type RenderQuestion = {
  q_type: string
  body: string | null
  choices: string[]
  figure_url?: string | null
  figure_is_whole?: boolean
}

// 문제 한 개. ref 를 걸어 captureNode() 로 그림을 뜬다
export const QuestionRender = forwardRef<HTMLDivElement, { q: RenderQuestion }>(function QuestionRender({ q }, ref) {
  const whole = !!q.figure_is_whole && !!q.figure_url
  return (
    <div ref={ref} style={BOX}>
      {!whole && <div><MathText text={q.body} /></div>}
      {q.figure_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={q.figure_url} alt="" crossOrigin="anonymous"
          style={{ display: 'block', maxWidth: '100%', margin: whole ? 0 : '2mm auto 0' }} />
      )}
      {!whole && q.q_type === '객관식' && (q.choices ?? []).some(Boolean) && (
        <div style={{ marginTop: '2mm' }}>
          {CIRCLES.map((c, i) => (
            <div key={c} style={{ display: 'flex', gap: '1.5mm', marginTop: '0.8mm' }}>
              <span>{c}</span>
              <span style={{ flex: 1 }}><MathText text={q.choices?.[i] ?? ''} /></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
})

// 해설 (답지·해설지에 찍힌다)
export const SolutionRender = forwardRef<HTMLDivElement, { text: string | null }>(function SolutionRender({ text }, ref) {
  return <div ref={ref} style={BOX}><MathText text={text} /></div>
})

const BOX: React.CSSProperties = {
  // 바깥 화면의 글꼴·자간을 물려받지 않게 끊는다. 물려받으면 화면과 구운 그림의 줄바꿈이 달라진다
  all: 'initial',
  display: 'block',
  width: `${COL_MM}mm`,
  boxSizing: 'border-box',
  padding: '0.5mm 0',
  background: '#fff',
  color: '#111',
  fontSize: '10pt',
  lineHeight: 1.65,
  wordBreak: 'keep-all',
  // 컴퓨터에 깔린 글꼴만 쓴다. 웹글꼴은 그림으로 구울 때 따라오지 않아 줄바꿈이 달라진다
  fontFamily: '"Malgun Gothic", "Apple SD Gothic Neo", sans-serif',
}

const toDataUrl = (blob: Blob) =>
  new Promise<string>((ok, no) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = no
    r.readAsDataURL(blob)
  })

// 수식 모양(CSS)과 수식 글꼴을 그림 안에 같이 넣어야 한다 — 그림 속에서는 바깥 CSS·글꼴이 보이지 않는다.
// 글꼴 20여 개를 읽어 오므로 한 번만 만들어 둔다
let mathCss: Promise<string> | null = null
function loadMathCss() {
  if (mathCss) return mathCss
  mathCss = (async () => {
    const out: string[] = []
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[] = []
      try { rules = Array.from(sheet.cssRules) } catch { continue }   // 다른 사이트의 CSS 는 못 읽는다 (아이콘 등 — 필요 없다)
      for (const r of rules) {
        const t = r.cssText
        if (!t.includes('ML__') && !t.includes('KaTeX')) continue
        if (!t.startsWith('@font-face')) { out.push(t); continue }
        const m = t.match(/url\(["']?([^"')]+)["']?\)/)
        if (!m) continue
        try {
          const abs = new URL(m[1], sheet.href ?? location.href).href
          const data = await toDataUrl(await (await fetch(abs)).blob())
          out.push(t.replace(m[0], `url("${data}")`))
        } catch { /* 이 글꼴은 건너뛴다 */ }
      }
    }
    return out.join('\n')
  })()
  return mathCss
}

// 그려 둔 상자를 200dpi PNG 로 굽는다. 가로는 언제나 87mm = 685px 이 된다.
// (html2canvas 는 분수선·루트를 엉뚱한 자리에 그려서 쓰지 않는다. 상자를 SVG 안에 넣어
//  브라우저가 화면과 똑같이 그리게 한 뒤 그 결과를 뜬다)
export async function captureNode(el: HTMLElement): Promise<{ dataUrl: string; width: number; height: number; clipped: boolean }> {
  await (document as any).fonts?.ready
  const css = await loadMathCss()

  const clone = el.cloneNode(true) as HTMLElement
  // 그림 속에서는 바깥 주소의 그림도 못 불러온다 → 미리 읽어 넣는다
  for (const img of Array.from(clone.querySelectorAll('img'))) {
    const blob = await (await fetch(img.src)).blob()
    img.removeAttribute('crossorigin')
    img.src = await toDataUrl(blob)
  }

  const scale = BANK_DPI / 96
  const w = COL_MM * PX_PER_MM
  // 높이는 넉넉히 잡아 굽고, 구운 뒤 아래 흰 여백을 잘라 낸다 (줄바꿈이 한 줄 달라져도 잘리지 않는다)
  const h = Math.ceil(el.getBoundingClientRect().height * 1.3) + 60
  const W = expectedWidthPx()
  const H = Math.round(h * scale)
  const xhtml = new XMLSerializer().serializeToString(clone)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${w} ${h}">` +
    `<foreignObject x="0" y="0" width="${w}" height="${h}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="margin:0"><style><![CDATA[${css}]]></style>${xhtml}</div>` +
    '</foreignObject></svg>'

  const img = new Image()
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  await img.decode()
  // 글꼴이 그림 안에서 자리 잡을 틈을 한 번 준다 (바로 뜨면 첫 번째는 기본 글꼴로 찍히는 일이 있다)
  await new Promise((r) => setTimeout(r, 80))

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)
  ctx.drawImage(img, 0, 0, W, H)

  // 아래에서부터 훑어 글자가 있는 마지막 줄을 찾는다
  const px = ctx.getImageData(0, 0, W, H).data
  let last = 0
  for (let y = H - 1; y >= 0 && !last; y--)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      if (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245) { last = y; break }
    }
  const outH = Math.min(H, last + 1 + Math.round(scale * PX_PER_MM))   // 글자 아래 1mm
  const out = document.createElement('canvas')
  out.width = W
  out.height = outH
  out.getContext('2d')!.drawImage(canvas, 0, 0)
  // clipped: 넉넉히 잡은 높이를 끝까지 썼다 = 아래가 잘렸을 수 있다
  return { dataUrl: out.toDataURL('image/png'), width: W, height: outH, clipped: last >= H - 2 }
}

// 구운 그림이 학습지 단 폭과 맞는지 숫자로 확인한다 (눈으로 보지 않는다)
export function expectedWidthPx() {
  return Math.round(COL_MM * PX_PER_MM * (BANK_DPI / 96))
}
