/**
 * 자른 폴더들을 **올리기 전에** 기계로 점검한다 (읽기만 — 아무것도 안 바꾼다).
 *
 *   node scripts/exam-paper/crop-check.mjs "C:/Users/USER/문제은행/기출/자른것"
 *
 * 보는 것 — 번호가 1부터 빠짐없나 · 그림 파일이 다 있고 PNG 가 멀쩡한가 ·
 *   적힌 크기와 파일 크기가 같은가 · 너무 짧은 그림이 없나 · 정답 없는 문항이 없나 ·
 *   한 시험지 안에서 그림 폭이 들쭉날쭉하지 않은가(단을 잘못 잡은 것이다).
 *
 * 2026-11-17 고양시 고1 25개교를 넣으면서 만들었다. 「올렸다」 전에 여기서 걸러야
 * 문제은행에 흠 있는 그림이 안 들어간다.
 */
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.argv[2]
const dirs = fs.readdirSync(ROOT).filter((d) => fs.existsSync(path.join(ROOT, d, 'manifest.json'))).sort()
let bad = 0
const say = (학교, 말) => { console.log(`  ✗ ${학교} — ${말}`); bad++ }

// PNG 머리에서 폭·높이를 읽는다 (그림 파일이 멀쩡한지까지 본다)
function png(p) {
  const b = fs.readFileSync(p)
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), bytes: b.length }
}

console.log('학교        문항 정답 쪽수 그림   가장높은  글자정답없음  판정')
for (const d of dirs) {
  const 학교 = d.replace(/^2025_2학기기말_/, '').replace(/_고1$/, '')
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, d, 'manifest.json'), 'utf8'))
  const ps = m.problems ?? []
  const 전 = bad
  // ① 번호가 1부터 빠짐없이
  const nos = ps.map((p) => p.no)
  if (!nos.length) say(학교, '문항이 없다')
  else if (nos.some((n, i) => n !== i + 1)) say(학교, `번호가 1부터 안 이어진다: ${nos.join(',')}`)
  // ② 그림 파일이 다 있고 멀쩡한가 · manifest 의 w·h 와 같은가
  let 최고 = 0, 글자없음 = 0
  for (const p of ps) {
    const f = path.join(ROOT, d, p.file)
    if (!fs.existsSync(f)) { say(학교, `${p.no}번 그림이 없다 (${p.file})`); continue }
    const im = png(f)
    if (!im) { say(학교, `${p.no}번 그림이 PNG 가 아니다`); continue }
    if (im.w !== p.w || im.h !== p.h) say(학교, `${p.no}번 그림 크기가 적힌 것과 다르다 (파일 ${im.w}x${im.h} · 적힌 것 ${p.w}x${p.h})`)
    if (im.bytes < 1000) say(학교, `${p.no}번 그림이 비었다 (${im.bytes}바이트)`)
    if (im.h < 60) say(학교, `${p.no}번 그림이 너무 짧다 (${im.h}px)`)
    최고 = Math.max(최고, im.h)
    if (!p.answer && !p.answerFile) 글자없음++
  }
  // ③ 정답 — 글자든 그림이든 다 있어야 QR 채점이 된다
  if (글자없음) say(학교, `정답이 없는 문항 ${글자없음}개`)
  // ④ 폭 — 한 시험지 안에서 들쭉날쭉하면 단을 잘못 잡은 것이다
  // 폭은 쪽마다 글자가 어디까지 가느냐에 따라 조금씩 다르다(실측 850~874). 흠은 **많이 벌어질 때**다 —
  // 단을 잘못 잡으면 한 단 폭(≈850)과 두 단 폭(≈1700)이 섞인다.
  const ws = [...new Set(ps.map((p) => p.w))]
  const 벌어짐 = ws.length ? Math.max(...ws) - Math.min(...ws) : 0
  if (벌어짐 > 100) say(학교, `그림 폭이 ${벌어짐}px 나 벌어졌다: ${ws.join(',')}`)
  console.log(`${학교.padEnd(10)} ${String(ps.length).padStart(3)} ${String(ps.filter((p) => p.answer || p.answerFile).length).padStart(4)} ` +
    `${String(new Set(ps.map((p) => p.page)).size).padStart(4)} ${String(ws.join('/')).padStart(6)} ${String(최고).padStart(7)}px ` +
    `${String(글자없음).padStart(11)}  ${bad === 전 ? '✓' : '✗'}`)
}
console.log(bad ? `\n흠 ${bad}건` : '\n자른 것 점검 ✓')
process.exitCode = bad ? 1 : 0
