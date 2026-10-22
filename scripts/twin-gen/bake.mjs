/**
 * 쌍둥이를 문제은행 그림으로 굽고, 원장님이 볼 미리보기를 만든다.
 *
 *   node scripts/twin-gen/bake.mjs           out/twins.json → out/bake/*.png + out/preview.html
 *
 * 양식은 시험지 분석의 학교기출 굽기(components/exam-analysis/QuestionRender.tsx)와 같다:
 *   학습지 한 단 폭 87mm · 200dpi (가로 685px) · 맑은 고딕 10pt · 수식은 mathlive.
 * 인쇄 화면은 「원본 px ÷ 200 × 25.4mm」로 찍으므로 가로가 685px 이 아니면 굽기를 멈춘다(숫자로 확인).
 * 끝나면 그 문항들의 요청을 「확인대기」로 바꾼다. 문제은행에 넣는 건 확인 뒤 queue.mjs put.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { convertLatexToMarkup } from 'mathlive/ssr'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(HERE, '..', '..')
const OUT = path.join(HERE, 'out')
const BAKE = path.join(OUT, 'bake')
const WORK = path.join(HERE, 'work')
const COL_MM = 87                      // QuestionRender.tsx 의 COL_MM 과 같아야 한다
const DPI = 200
const CSS_W = COL_MM * 96 / 25.4       // 328.8 CSS px
const WANT_W = Math.round(CSS_W * DPI / 96)   // 685
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))
if (!EDGE) { console.error('Edge 또는 Chrome 을 찾지 못했습니다.'); process.exit(1) }
// 따로 쓰는 프로필 — 켜져 있는 Edge 에 일을 넘기고 그냥 끝나 버리는 것을 막는다
const PROFILE = `--user-data-dir=${path.join(os.tmpdir(), 'twin-gen-edge')}`
const CIRCLES = '①②③④⑤'
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// 글 속 $$…$$ (가운데 줄) · $…$ (글 속 수식) 을 mathlive 로 그린다
function rich(text) {
  return String(text).split(/(\$\$[^$]+\$\$|\$[^$]+\$)/g).map((s) => {
    if (s.startsWith('$$') && s.endsWith('$$') && s.length > 4)
      return `<div class="disp">${convertLatexToMarkup('\\displaystyle ' + s.slice(2, -2))}</div>`
    if (s.startsWith('$') && s.endsWith('$') && s.length > 2) return convertLatexToMarkup(s.slice(1, -1))
    return esc(s)
  }).join('')
}

function page(inner) {
  const css = pathToFileURL(path.join(ROOT, 'node_modules', 'mathlive', 'mathlive-static.css')).href
  return `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${css}"><style>
html,body{margin:0;background:#fff}
.box{width:${COL_MM}mm;box-sizing:border-box;padding:0.5mm 0;color:#111;font-size:10pt;line-height:1.65;word-break:keep-all;
  font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif}
.disp{text-align:center;margin:0.6mm 0}
.ch{display:flex;gap:1.5mm;margin-top:0.8mm}
.sl{margin-top:0.6mm}
</style></head><body><div class="box">${inner}</div></body></html>`
}

const questionHtml = (t) => page(
  `<div>${rich(t.text)}</div>` +
  (t.choices ? `<div style="margin-top:2mm">${t.choices.map((c, i) =>
    `<div class="ch"><span>${CIRCLES[i]}</span><span>${convertLatexToMarkup(c)}</span></div>`).join('')}</div>` : ''))
const solutionHtml = (t) => page(t.solution.map((s) => `<div class="sl">${rich(s)}</div>`).join(''))

const tmp = path.join(OUT, '_html')
fs.mkdirSync(tmp, { recursive: true })
fs.mkdirSync(BAKE, { recursive: true })

// 넉넉한 높이로 찍고 글자 아래 1mm 만 남기고 자른다. 가로·잘림은 숫자로 확인한다
async function shoot(html, out) {
  const file = path.join(tmp, path.basename(out, '.png') + '.html')
  fs.writeFileSync(file, html)
  const H = 1400
  fs.rmSync(out, { force: true })
  execFileSync(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--disable-lcd-text', PROFILE, `--force-device-scale-factor=${DPI / 96}`,
    '--virtual-time-budget=4000', `--window-size=${Math.round(CSS_W)},${H}`, `--screenshot=${out}`, pathToFileURL(file).href], { stdio: 'ignore' })
  // Edge 는 그림을 다 쓰기 전에 먼저 끝나는 일이 있다 → 파일이 생기고 크기가 멈출 때까지 기다린다
  for (let i = 0, last = -1; i < 150; i++) {
    const size = fs.existsSync(out) ? fs.statSync(out).size : -1
    if (size > 0 && size === last) break
    last = size
    await new Promise((r) => setTimeout(r, 200))
  }
  if (!fs.existsSync(out)) throw new Error(`${path.basename(out)} 을 찍지 못함 (Edge)`)
  const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
  let last = 0
  for (let y = info.height - 1; y >= 0 && !last; y--)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * info.channels
      if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) { last = y; break }
    }
  if (info.width !== WANT_W) throw new Error(`${path.basename(out)} 가로 ${info.width}px (${WANT_W}px 이어야 함)`)
  if (!last) throw new Error(`${path.basename(out)} 이 비어 있음`)
  if (last >= info.height - 3) throw new Error(`${path.basename(out)} 아래가 잘렸을 수 있음`)
  const h = Math.min(info.height, last + 1 + Math.round(DPI / 25.4))
  const buf = await sharp(out).extract({ left: 0, top: 0, width: info.width, height: h }).png().toBuffer()
  fs.writeFileSync(out, buf)
  return { w: info.width, h }
}

const b64 = (f) => {
  if (!f || !fs.existsSync(f)) return ''
  const ext = path.extname(f).slice(1).replace('jpg', 'jpeg')
  return `data:image/${ext};base64,${fs.readFileSync(f).toString('base64')}`
}
const workFile = (id, k) => {
  const meta = path.join(WORK, String(id), 'meta.json')
  if (!fs.existsSync(meta)) return null
  const f = JSON.parse(fs.readFileSync(meta, 'utf8')).files?.[k]
  return f ? path.join(WORK, String(id), f) : null
}
const metaOf = (id) => {
  const meta = path.join(WORK, String(id), 'meta.json')
  return fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, 'utf8')) : null
}

const reports = JSON.parse(fs.readFileSync(path.join(OUT, 'twins.json'), 'utf8'))
const sections = []
let made = 0
for (const r of reports) {
  const m = metaOf(r.origin)
  const head = `<div class="orig"><div class="no">${esc(m?.label ?? `문항 ${r.origin}`)}</div>
    ${b64(workFile(r.origin, 'q')) ? `<img src="${b64(workFile(r.origin, 'q'))}" alt="">` : '<div class="miss">원래 문제 그림 없음 (queue.mjs pull 을 먼저)</div>'}
    <div class="bk">책 정답 <b>${esc(r.expect)}</b></div></div>`
  if (r.error) { sections.push(`<section>${head}<div class="twins"><div class="err">틀 오류 — ${esc(r.error)}</div></div></section>`); continue }
  const cards = []
  for (const [i, t] of r.twins.entries()) {
    const q = path.join(BAKE, `${r.origin}_${i + 1}.png`)
    const s = path.join(BAKE, `${r.origin}_${i + 1}_s.png`)
    const sq = await shoot(questionHtml(t), q)
    await shoot(solutionHtml(t), s)
    made++
    cards.push(`<div class="card"><div class="lab">쌍둥이 ${i + 1}<span class="ok">검산 통과 · ${sq.w}×${sq.h}px</span></div>
      <div class="cap">학습지에 찍힐 그림</div><img class="paper" src="${b64(q)}" alt="">
      <div class="ans">정답 <b>${esc(t.bank.text)}</b> <span class="kind">${{ choice: '객관식', number: '숫자 채점', image: '자기채점' }[t.bank.kind]}</span></div>
      <details open><summary>풀이 그림</summary><img class="paper" src="${b64(s)}" alt=""></details></div>`)
    process.stdout.write('.')
  }
  sections.push(`<section>${head}<div class="twins">${cards.join('')}</div></section>`)
}
console.log()

const total = reports.reduce((n, r) => n + (r.twins?.length ?? 0), 0)
fs.writeFileSync(path.join(OUT, 'preview.html'), `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>쌍둥이 확인</title><style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#1d2330;--sub:#6b7280;--line:#e3e6eb;--ok:#0f8a5f;--okbg:#e6f6ef;--accent:#0f3460}
body{margin:0;background:var(--bg);color:var(--ink);font-family:"Malgun Gothic",sans-serif;line-height:1.6}
header{padding:24px 16px 8px;max-width:1240px;margin:auto} h1{font-size:22px;margin:0 0 4px} header p{margin:0;color:var(--sub);font-size:14px}
section{max-width:1240px;margin:16px auto;padding:16px 16px 0;display:grid;grid-template-columns:330px 1fr;gap:16px;border-top:1px solid var(--line)}
.orig img{width:100%;border:1px solid var(--line);border-radius:8px;background:#fff}
.no{font-weight:700;margin-bottom:6px} .bk{font-size:14px;color:var(--sub);margin-top:6px} .miss{color:var(--sub);font-size:13px}
.twins{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 14px;font-size:14px}
.lab{font-size:13px;color:var(--accent);font-weight:700;display:flex;justify-content:space-between;gap:8px}
.ok{color:var(--ok);background:var(--okbg);border-radius:99px;padding:0 8px;font-weight:600;font-size:12px}
.cap{font-size:12px;color:var(--sub);margin:6px 0 2px}
img.paper{width:100%;max-width:330px;display:block;border:1px dashed var(--line)}
.ans{border-top:1px dashed var(--line);margin-top:8px;padding-top:6px} .kind{font-size:12px;color:var(--sub)}
summary{cursor:pointer;color:var(--sub);font-size:13px;margin-top:4px} .err{color:#b42318;font-weight:600}
@media(max-width:760px){section{grid-template-columns:1fr}}
</style></head><body>
<header><h1>쌍둥이 확인 — ${reports.length}문항 · 쌍둥이 ${total}개</h1>
<p>아래 그림이 학습지에 그대로 찍힙니다 (87mm · 200dpi · 맑은 고딕). 모두 컴퓨터로 다시 풀어 답이 맞은 것만 실었습니다. 아직 문제은행에 넣지 않았습니다.</p></header>
${sections.join('\n')}</body></html>`)

// 요청 줄: 만든 문항은 「확인대기」
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const ok = reports.filter((r) => !r.error && r.twins.length).map((r) => r.origin)
if (ok.length) {
  const { error } = await supabase.from('twin_requests').update({ status: '확인대기' }).in('problem_id', ok).eq('status', '대기')
  if (error) console.error('요청 상태를 못 바꿈:', error.message)
}
console.log(`  그림 ${made * 2}장 구움 (가로 ${WANT_W}px 확인) → ${path.relative(process.cwd(), path.join(OUT, 'preview.html'))}`)
