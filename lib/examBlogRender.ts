// 시험분석 블로그 카드를 브라우저에서 PNG 로 굽는다.
// 카드 HTML(lib/examBlogCards.mjs)을 SVG foreignObject 에 넣어 브라우저가 그대로 그리게 한다 (html2canvas 는 쓰지 않는다).
// foreignObject 안에서는 바깥 주소를 못 읽으므로 그림과 글꼴(도현체)을 전부 data: 주소로 바꿔 넣는다.
import { buildCards, FONT_CSS_URL } from '@/lib/examBlogCards.mjs'

export type RenderedCard = { name: string; w: number; h: number; blob: Blob; url: string }

const dataUrlCache = new Map<string, Promise<string>>()
function toDataUrl(src: string): Promise<string> {
  if (src.startsWith('data:')) return Promise.resolve(src)
  let p = dataUrlCache.get(src)
  if (!p) {
    p = (async () => {
      const blob = await (await fetch(src)).blob()
      return await new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(blob) })
    })()
    dataUrlCache.set(src, p)
  }
  return p
}

// 구글 글꼴은 한글을 100여 조각으로 나눠 준다 → 카드에 실제로 나오는 글자가 든 조각만 받아 넣는다
let fontCssText: Promise<string> | null = null
async function fontFaces(text: string): Promise<string> {
  fontCssText ??= fetch(FONT_CSS_URL).then((r) => r.text())
  const cssText = await fontCssText
  const used = new Set(Array.from(text).map((c) => c.codePointAt(0)!))
  const out: string[] = []
  for (const block of cssText.match(/@font-face\s*{[^}]*}/g) ?? []) {
    const range = block.match(/unicode-range:\s*([^;]+);/)?.[1]
    const hit = !range || range.split(',').some((part) => {
      const m = part.trim().match(/^U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f]+))?$/)
      if (!m) return false
      const lo = parseInt(m[1].replace(/\?/g, '0'), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16)
      for (const cp of used) if (cp >= lo && cp <= hi) return true
      return false
    })
    if (!hit) continue
    const url = block.match(/url\(([^)]+)\)/)?.[1].replace(/["']/g, '')
    if (!url) continue
    out.push(block.replace(/url\([^)]+\)/, `url(${await toDataUrl(url)})`))
  }
  return out.join('\n')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error('카드를 그리지 못했습니다.')); i.src = src })
}

/** analysis → 카드 PNG 들. images: analysis 안의 그림 열쇠(q:6, s:6 …) → 주소 */
export async function renderBlogCards(A: any, images: Record<string, string>, onProgress?: (i: number, n: number) => void): Promise<RenderedCard[]> {
  // 그림 주소를 전부 data: 로
  const assetNames = ['logo_cream_square.png', 'suji_100points_balloons.png', 'suji_uniform_fighting.jpg']
  const assets: Record<string, string> = {}
  await Promise.all(assetNames.map(async (n) => { assets[n] = await toDataUrl(`/exam-blog/${n}`) }))
  const imgs: Record<string, string> = {}
  await Promise.all(Object.entries(images).map(async ([k, u]) => { if (u) imgs[k] = await toDataUrl(u) }))
  const blank = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=='
  const cards = buildCards(A, { asset: (n: string) => assets[n] ?? blank, img: (k: string) => imgs[k] ?? blank })

  const out: RenderedCard[] = []
  for (let i = 0; i < cards.length; i++) {
    onProgress?.(i + 1, cards.length)
    const c = cards[i]
    const fonts = await fontFaces(c.body.replace(/<[^>]+>/g, ''))
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${c.w}" height="${c.h}"><foreignObject x="0" y="0" width="${c.w}" height="${c.h}">` +
      `<div xmlns="http://www.w3.org/1999/xhtml"><style>${fonts}\n${c.css}</style>${c.body}</div></foreignObject></svg>`
    if (new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')) throw new Error(`${c.name} 카드의 글에 그릴 수 없는 문자가 있습니다.`)
    const image = await loadImage('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
    const canvas = document.createElement('canvas')
    canvas.width = c.w; canvas.height = c.h
    const g = canvas.getContext('2d')!
    g.drawImage(image, 0, 0)
    // 넣어 둔 글꼴이 첫 그리기에 늦는 브라우저가 있다 → 잠깐 뒤 한 번 더 그린다
    await new Promise((r) => setTimeout(r, 120))
    g.clearRect(0, 0, c.w, c.h); g.drawImage(image, 0, 0)
    const blob = await new Promise<Blob>((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('PNG 로 바꾸지 못했습니다.'))), 'image/png'))
    out.push({ name: c.name, w: c.w, h: c.h, blob, url: URL.createObjectURL(blob) })
  }
  return out
}
