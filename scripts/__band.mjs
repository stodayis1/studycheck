// 「선택형N문항」 같은 머리띠 글자가 쪽마다 어디에 있나 — 되풀이 거르기에 걸리는지 본다 (읽기만).
import fs from 'node:fs'
import path from 'node:path'
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

const FILE = process.argv[2]
const WORD = process.argv[3] ?? '선택형'
const data = new Uint8Array(fs.readFileSync(FILE))
const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
const sig = (x, base, str) => `${Math.round(x)}|${Math.round(base)}|${str}`
const seen = new Map()
const found = []
for (let pi = 0; pi < doc.numPages; pi++) {
  const pg = await doc.getPage(pi + 1)
  const vp = pg.getViewport({ scale: 1 })
  for (const it of (await pg.getTextContent()).items) {
    const str = String(it.str ?? '').trim()
    if (!str) continue
    const t = pdfjs.Util.transform(vp.transform, it.transform)
    const k = sig(t[4], t[5], str)
    seen.set(k, (seen.get(k) ?? 0) + 1)
    if (str.includes(WORD) || str.includes('학년') || str.includes('기말고사') || str.includes('공통')) {
      found.push({ pi: pi + 1, str, x: t[4], base: t[5], h: vp.height, k })
    }
  }
}
const REPEAT = doc.numPages >= 3 ? Math.max(3, Math.ceil(doc.numPages * 0.6)) : doc.numPages + 1
console.log(`${path.basename(FILE)} — 쪽 ${doc.numPages} · 되풀이 기준 ${REPEAT}번`)
for (const f of found) {
  const n = seen.get(f.k) ?? 0
  console.log(`  ${String(f.pi).padStart(2)}쪽 y=${f.base.toFixed(0).padStart(4)}/${f.h.toFixed(0)} x=${f.x.toFixed(0).padStart(4)} ` +
    `${n}번 나옴 ${n >= REPEAT ? '→ 머리말로 걸림' : '→ ★ 안 걸림'}  ${JSON.stringify(f.str).slice(0, 30)}`)
}
