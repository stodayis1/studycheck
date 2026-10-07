/**
 * 시험분석 블로그용 카드 그림 만들기 (수학의지혜 양식)
 *
 *   node scripts/exam-blog/build.mjs "<시험 폴더>/blog/analysis.json"
 *
 * analysis.json 하나로 카드 그림을 만든다 (1080×1350, 네이버 블로그 본문용):
 *   00_thumb.png          대표 썸네일 (1080×1080) — 크림 바탕 · 주황 포인트 · 큰 제목 두 줄 · 수지. 기존 대표썸네일과 같은 모양
 *   01_summary.png        시험분석 요약 — 문항 수 · 난이도 · 변별문항 · 적중률 / 단원 비중 / 출제 경향 / 다음 시험 전략
 *   02_killers.png        변별력 문항 카드
 *   03_deep_<번호>.png    변별문항 심층분석 (문제 · 풀이 4단계 · 왜 어려웠나 · 선생님 한마디)
 *   04_review.png         이번 시험 총평
 * 그림은 HTML 로 짜서 Edge(headless)로 찍는다. 글과 숫자는 전부 analysis.json 에서 온다 — 여기서 지어내지 않는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const file = process.argv[2]
if (!file) { console.error('쓰는 법: node scripts/exam-blog/build.mjs <analysis.json>'); process.exit(1) }
const dir = path.dirname(path.resolve(file))
const A = JSON.parse(fs.readFileSync(file, 'utf8'))
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', '..')
const asset = (p) => pathToFileURL(path.join(ROOT, 'scripts', 'exam-blog', 'assets', p)).href
const img = (p) => pathToFileURL(path.resolve(dir, p)).href
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p))
if (!EDGE) { console.error('Edge 또는 Chrome 을 찾지 못했습니다.'); process.exit(1) }

const W = 1080, H = 1350
const NAVY = '#141414', GOLD = '#ff5722', BLUE = '#ff5722', INK = '#1a1a1a', MUTE = '#6b6f76'   // 수학의지혜 카드뉴스: 검정 · 주황
const CREAM = '#f4f0e8'
const FONT_LINK = '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Do+Hyeon&display=block" rel="stylesheet">'
const SHOT = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=9000']
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const Q = A.questions
const nEssay = Q.filter((q) => q.essay).length
const avgDiff = (Q.reduce((a, q) => a + q.diff, 0) / Q.length).toFixed(1)
const totalPts = Q.reduce((a, q) => a + q.pts, 0)
const DIFF_NAME = ['', '하', '중하', '중', '중상', '상']
const DIFF_COLOR = ['', '#d8d3c8', '#b9b3a6', '#ffb499', '#ff8a5c', '#ff5722']
const title = `${A.year}학년도 ${A.school} ${A.grade} 수학`

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
body{font-family:'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:${INK};background:${NAVY};word-break:keep-all;-webkit-font-smoothing:antialiased}
.page{width:${W}px;height:${H}px;padding:40px 44px 30px;display:flex;flex-direction:column;background:${NAVY}}
.top{display:flex;align-items:center;justify-content:space-between;color:#fff}
.brand{display:flex;align-items:center;gap:14px}
.brand img{height:84px;width:84px;object-fit:cover;border-radius:3px}
.brand span{font-family:'Do Hyeon',sans-serif;color:${GOLD};font-size:27px;margin-left:16px}
.pg{font-size:19px;color:#9a9fa8;border-left:2px solid ${GOLD};padding-left:14px;text-align:right;line-height:1.4}
.pg b{color:${CREAM};font-size:24px}
.sub{color:#9a9fa8;font-size:23px;margin-top:26px;font-weight:600}
h1{color:${CREAM};font-family:'Do Hyeon',sans-serif;font-weight:400;font-size:82px;line-height:1.1;margin-top:6px}
h1 em{font-style:normal;color:${GOLD}}
.lead{color:#c9c5bc;font-size:24px;margin-top:12px;line-height:1.45}
.card{background:${CREAM};border-radius:20px;padding:24px 26px}
.card h3{font-family:'Do Hyeon',sans-serif;font-weight:400;font-size:27px;display:flex;align-items:center;gap:10px;margin-bottom:10px;color:${NAVY}}
.card h3 i{font-style:normal;background:${GOLD};color:#fff;border-radius:8px;font-size:18px;padding:3px 9px}
.grid{display:grid;gap:16px}
.foot{margin-top:auto;padding-top:16px;display:flex;justify-content:space-between;align-items:flex-end;color:#9a9fa8;font-size:18px}
.foot b{font-family:'Do Hyeon',sans-serif;font-weight:400;color:${CREAM};font-size:23px}.foot b em{font-style:normal;color:${GOLD}}
li{list-style:none}
.bul li{position:relative;padding-left:20px;font-size:21px;line-height:1.5;margin-top:8px;color:#1e293b}
.bul li::before{content:'';position:absolute;left:2px;top:13px;width:9px;height:9px;border-radius:50%;background:${BLUE}}

.point{background:#ffe6dc;border-left:5px solid ${GOLD};border-radius:6px;padding:7px 12px;font-size:18px;margin-top:9px;color:#5a2412;line-height:1.4}
.point b{color:${GOLD}}
`
const shell = (n, total, body, h) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONT_LINK}<style>${CSS}html,body,.page{height:${h}px}</style></head><body><div class="page">
<div class="top"><div class="brand"><img src="${asset('logo_cream_square.png')}"><span>수학의지혜 기출분석</span></div>
<div class="pg">${esc(A.school)} ${esc(A.grade)} · ${esc(A.exam)}<br><b>${n}</b> / ${total}</div></div>
${body}
<div class="foot"><span>${esc(title)} · ${esc(A.exam)}</span><b>수학의지혜 문의상담 <em>${esc(A.phone ?? '')}</em></b></div></div></body></html>`

// ── 01 요약
function summary() {
  const maxU = Math.max(...A.unit_groups.map((u) => u.count))
  const byDiff = [1, 2, 3, 4, 5].map((d) => Q.filter((q) => q.diff === d).length)
  const tiles = [
    ['총 문항', `${Q.length}`, `객관식 ${Q.length - nEssay} · 서술형 ${nEssay} · ${totalPts}점`, CREAM, NAVY],
    ['평균 난이도', `${avgDiff} <small>/ 5</small>`, `전체 난이도 「${esc(A.overall_difficulty)}」`, CREAM, NAVY],
    ['변별문항', `${A.killers.length}`, A.killers.map((k) => `${k.no}번`).join(' · '), CREAM, NAVY],
    ['이너프원 적중률', `${A.hit.rate}<small>%</small>`, `${A.hit.total}문항 중 ${A.hit.hit}문항`, GOLD, '#fff'],
  ]
  return `<div class="sub">시험지 분석</div><h1>${esc(A.school)} ${esc(A.grade)} <em>시험분석</em></h1>
<div class="lead">${esc(A.exam)} · 범위 ${esc(A.scope)}</div>
<div class="grid" style="grid-template-columns:repeat(4,1fr);margin-top:22px">
${tiles.map(([k, v, s, bg, c]) => `<div style="background:${bg};border-radius:18px;padding:16px 18px"><div style="font-size:17px;color:${c === '#fff' ? '#ffe1d6' : MUTE};font-weight:700">${k}</div>
<div style="font-family:'Do Hyeon',sans-serif;font-size:54px;color:${c};line-height:1.1;margin-top:2px">${v}</div><div style="font-size:15px;color:${c === '#fff' ? '#ffe1d6' : MUTE};margin-top:2px;line-height:1.3">${s}</div></div>`).join('')}
</div><style>small{font-size:22px;font-weight:700}</style>
<div class="card" style="margin-top:16px"><h3>전체 경향</h3><div style="font-size:23px;line-height:1.5;font-weight:600">${esc(A.one_line)}</div></div>
<div class="grid" style="grid-template-columns:1.25fr 1fr;margin-top:16px">
<div class="card"><h3>단원별 출제 비중</h3>
${A.unit_groups.map((u) => `<div style="display:flex;align-items:center;gap:10px;margin-top:11px"><span style="width:168px;font-size:19px;font-weight:700">${esc(u.name)}</span>
<span style="flex:1;height:18px;background:#e2ddd2;border-radius:9px;overflow:hidden"><span style="display:block;height:100%;width:${(u.count / maxU) * 100}%;background:${u.color};border-radius:9px"></span></span>
<span style="width:66px;text-align:right;font-size:18px;color:${MUTE}">${u.count}문항</span></div>`).join('')}</div>
<div class="card"><h3>난이도 분포</h3><div style="display:flex;align-items:flex-end;gap:10px;height:132px;margin-top:4px">
${byDiff.map((n, i) => `<div style="flex:1;text-align:center"><div style="font-size:17px;font-weight:800;color:${NAVY}">${n}</div>
<div style="height:${Math.max(6, (n / Math.max(...byDiff)) * 86)}px;background:${DIFF_COLOR[i + 1]};border-radius:8px 8px 0 0;margin-top:3px"></div>
<div style="font-size:16px;color:${MUTE};margin-top:5px">${DIFF_NAME[i + 1]}</div></div>`).join('')}</div></div></div>
<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:16px;flex:1">
<div class="card"><h3>출제 경향</h3><ul class="bul">${A.trends.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
<div class="card"><h3>다음 시험 전략</h3><ul class="bul">${A.strategy.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`
}

// ── 02 변별력 문항
function killers() {
  return `<h1 style="margin-top:30px">변별력 <em>문항</em></h1>
<div class="lead">${esc(A.tagline)}</div>
<div class="grid" style="grid-template-columns:repeat(${A.killers.length},1fr);margin-top:24px;flex:1;min-height:0">
${A.killers.map((k) => `<div class="card" style="display:flex;flex-direction:column;min-height:0;padding:20px">
<div style="display:flex;align-items:center;gap:12px"><span style="background:${GOLD};color:#fff;font-family:'Do Hyeon',sans-serif;font-size:31px;border-radius:12px;padding:4px 14px">${k.no}번</span>
<span style="font-size:18px;color:${MUTE};font-weight:700;line-height:1.3">${esc(k.tag)}<br><b style="color:${GOLD}">배점 ${k.pts}점</b></span></div>
<div style="font-size:20px;line-height:1.5;margin-top:12px;font-weight:600">${esc(k.summary)}</div>
<div style="flex:1;min-height:0;margin-top:12px;border-radius:14px;padding:12px;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;background:#fff">
<img src="${img(k.image)}" style="max-width:100%;max-height:100%;object-fit:contain"></div></div>`).join('')}
</div>
<div style="text-align:center;color:${CREAM};font-family:'Do Hyeon',sans-serif;font-size:31px;margin-top:20px;line-height:1.4">${esc(A.message)}</div>`
}

// ── 03 심층분석
function deep(k) {
  return `<div class="sub" style="margin-top:14px">${esc(title)}</div>
<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px"><div><h1><em>${k.no}번</em> 심층분석</h1><div class="lead">${esc(k.title)} · 배점 ${k.pts}점</div></div>
<div class="card" style="padding:12px 18px;min-width:340px">${k.checks.map((c) => `<div style="font-size:18px;font-weight:700;margin:4px 0;display:flex;gap:8px"><span style="color:${GOLD}">✔</span>${esc(c)}</div>`).join('')}</div></div>
<div class="grid" style="grid-template-columns:0.82fr 1fr 1fr;grid-template-rows:1fr 1fr;margin-top:16px;height:470px">
<div class="card" style="grid-row:1 / span 2;display:flex;flex-direction:column;min-height:0;padding:16px"><h3><i>01</i>문제</h3>
<div style="flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;background:#fff;border-radius:10px;padding:8px"><img src="${img(k.image)}" style="max-width:100%;max-height:100%;object-fit:contain"></div></div>
${k.steps.map((s, i) => `<div class="card" style="padding:15px 17px;min-height:0;overflow:hidden"><h3 style="margin-bottom:7px"><i>0${i + 2}</i>Step ${i + 1}. ${esc(s.t)}</h3>
<div style="font-size:19.5px;line-height:1.45">${esc(s.d)}</div><div class="point"><b>POINT</b> ${esc(s.point)}</div></div>`).join('')}
</div>
<div class="grid" style="grid-template-columns:${k.solution ? '1fr 1fr' : '1fr'};margin-top:16px;flex:1;min-height:0">
${k.solution ? `<div class="card" style="display:flex;flex-direction:column;min-height:0;padding:16px"><h3><i>06</i>선생님 손풀이</h3>
<div style="flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;border-radius:10px"><img src="${img(k.solution)}" style="max-width:100%;max-height:100%;object-fit:contain"></div></div>` : ''}
<div style="display:flex;flex-direction:column;gap:16px;min-height:0">
<div class="card" style="padding:18px;flex:1"><h3><i>${k.solution ? '07' : '06'}</i>이 문항이 어려웠던 이유</h3><div style="font-size:20.5px;line-height:1.5">${esc(k.why)}</div></div>
<div class="card" style="padding:18px;background:#ffe6dc"><h3><i>${k.solution ? '08' : '07'}</i>선생님 한마디</h3>
<div style="font-size:20.5px;line-height:1.5;font-weight:600">${esc(k.comment)}</div><div style="text-align:right;font-size:17px;color:${MUTE};margin-top:6px">— 수학의지혜 ${esc(A.teacher)}</div></div></div></div>`
}

// ── 04 총평
function review() {
  const n = Q.length, obj = n - nEssay
  const r = 62, c = 2 * Math.PI * r, a = (obj / n) * c
  const xs = (i) => 34 + (i * (430 - 34 - 14)) / (n - 1), ys = (d) => 150 - (d - 1) * 30
  const pts = Q.map((q, i) => `${xs(i).toFixed(1)},${ys(q.diff)}`).join(' ')
  const kill = new Set(A.killers.map((k) => k.no))
  return `<div class="sub">${esc(title)}</div><h1>이번 시험 <em>총평</em></h1>
<div class="lead">“ ${esc(A.tagline)} ”</div>
<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:20px">
<div class="card" style="padding:18px"><h3><i>01</i>난이도와 문항 구성</h3>
<div style="display:flex;align-items:center;gap:14px"><svg width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="#c9c5bc" stroke-width="20"/>
<circle cx="75" cy="75" r="${r}" fill="none" stroke="${GOLD}" stroke-width="20" stroke-dasharray="${a} ${c}" transform="rotate(-90 75 75)"/>
<text x="75" y="70" text-anchor="middle" font-size="15" fill="${MUTE}" font-weight="700">전체 난이도</text><text x="75" y="98" text-anchor="middle" font-size="27" font-weight="900" fill="${NAVY}">${esc(A.overall_difficulty)}</text></svg>
<div style="font-size:18px;line-height:1.7"><span style="color:${GOLD}">●</span> 객관식 ${obj}문항<br><span style="color:#a8a39a">●</span> 서술형 ${nEssay}문항<br><b>${totalPts}점 만점</b></div></div></div>
<div class="card" style="padding:18px"><h3><i>02</i>이번 시험의 특징</h3>${A.features.map((f, i) => `<div style="display:flex;gap:10px;margin-top:9px"><span style="flex:0 0 28px;height:28px;border-radius:50%;background:${NAVY};color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center">${i + 1}</span>
<div style="font-size:18px;line-height:1.4"><b>${esc(f.t)}</b> — ${esc(f.d)}</div></div>`).join('')}</div>
<div class="card" style="padding:18px"><h3><i>03</i>대표 변별문항</h3>${A.killers.map((k) => `<div style="display:flex;gap:10px;margin-top:10px;align-items:flex-start"><span style="background:${GOLD};color:#fff;font-family:'Do Hyeon',sans-serif;font-size:21px;border-radius:8px;padding:2px 9px;white-space:nowrap">${k.no}번</span>
<div style="font-size:18px;line-height:1.4"><b>${esc(k.title)}</b><br><span style="color:${MUTE}">${esc(k.tag)}</span></div></div>`).join('')}</div></div>
<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:16px;flex:1;min-height:0">
<div class="card" style="padding:18px"><h3><i>04</i>문항별 난이도 흐름</h3>
<svg width="100%" viewBox="0 0 430 190">${[1, 2, 3, 4, 5].map((d) => `<line x1="30" x2="420" y1="${ys(d)}" y2="${ys(d)}" stroke="#d8d3c8"/><text x="4" y="${ys(d) + 5}" font-size="13" fill="${MUTE}">${DIFF_NAME[d]}</text>`).join('')}
<polyline points="${pts}" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>
${Q.map((q, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(q.diff)}" r="${kill.has(q.no) ? 7 : 4.5}" fill="${kill.has(q.no) ? GOLD : '#1a1a1a'}"/>`).join('')}
${[1, 5, 10, 15, 20, n].map((v) => `<text x="${xs(v - 1).toFixed(1)}" y="180" font-size="13" fill="${MUTE}" text-anchor="middle">${v}</text>`).join('')}</svg>
<div style="font-size:16px;color:${MUTE}"><span style="color:${GOLD}">●</span> 변별문항 · 평균 난이도 ${avgDiff} / 5</div></div>
<div class="card" style="padding:18px"><h3><i>05</i>어려웠던 이유</h3>${A.hard_reasons.map((f, i) => `<div style="display:flex;gap:10px;margin-top:9px"><span style="flex:0 0 28px;height:28px;border-radius:50%;background:${GOLD};color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center">${i + 1}</span>
<div style="font-size:18px;line-height:1.4"><b>${esc(f.t)}</b> — ${esc(f.d)}</div></div>`).join('')}</div>
<div class="card" style="padding:18px"><h3><i>06</i>학습 방향</h3>${A.study_steps.map((f, i) => `<div style="display:flex;gap:10px;margin-top:7px"><span style="flex:0 0 28px;height:28px;border-radius:50%;background:${NAVY};color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center">${i + 1}</span>
<div style="font-size:17.5px;line-height:1.35"><b>${esc(f.t)}</b> — ${esc(f.d)}</div></div>`).join('')}</div></div>
<div style="margin-top:16px;border:2px solid ${GOLD};border-radius:20px;padding:18px 24px;display:flex;align-items:center;gap:18px">
<img src="${asset('suji_100points_balloons.png')}" style="height:150px;margin:-30px 0 -26px"><div><div style="color:${GOLD};font-size:19px;font-weight:800">07 · 이 시험이 주는 메시지</div>
<div style="color:${CREAM};font-family:'Do Hyeon',sans-serif;font-size:33px;line-height:1.35;margin-top:4px">${esc(A.message)}</div></div></div>`
}

// ── 00 대표 썸네일 (원장님 견본 2026-10-07: 검정 바탕 · 주황 머리글 · 큰 미색 제목 · 주황 막대 · 회색 부제 · 수지 · 문의상담)
function thumb() {
  const T = A.thumb
  const size = T.headline.some((l) => l.length > 9) ? 104 : 124
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONT_LINK}<style>
*{box-sizing:border-box;margin:0;padding:0}html,body{width:1080px;height:1080px;overflow:hidden}
body{background:#141414;font-family:'Do Hyeon','Malgun Gothic',sans-serif;word-break:keep-all;position:relative}
.k{position:absolute;left:60px;top:90px;font-size:33px;color:#ff5722}
.logo{position:absolute;right:70px;top:50px;width:110px;height:110px;object-fit:cover}
h1{position:absolute;left:60px;top:196px;font-weight:400;font-size:${size}px;line-height:1.26;color:#f4f0e8}
.bar{position:absolute;left:60px;top:646px;width:140px;height:8px;background:#ff5722}
.s{position:absolute;left:60px;top:716px;font-size:36px;color:#9a9fa8}
.ch{position:absolute;right:60px;bottom:50px;width:360px;height:380px;object-fit:cover}
.f{position:absolute;left:60px;bottom:44px;font-size:29px;color:#f4f0e8}.f em{font-style:normal;color:#ff5722}
</style></head><body><div class="k">${esc(T.kicker)}</div><img class="logo" src="${asset('logo_cream_square.png')}">
<h1>${T.headline.map(esc).join('<br>')}</h1><div class="bar"></div><div class="s">${esc(T.sub)}</div>
<img class="ch" src="${asset('suji_uniform_fighting.jpg')}"><div class="f">수학의지혜 문의상담 <em>${esc(A.phone ?? '')}</em></div></body></html>`
}

const cards = [['01_summary', summary(), 1420], ['02_killers', killers(), 1080], ...A.killers.map((k) => [`03_deep_${String(k.no).padStart(2, '0')}`, deep(k), 1350]), ['04_review', review(), 1310]]
const tmp = path.join(dir, '_html')
fs.mkdirSync(tmp, { recursive: true })
if (A.thumb) {
  const html = path.join(tmp, '00_thumb.html')
  fs.writeFileSync(html, thumb())
  const out = path.join(dir, '00_thumb.png')
  execFileSync(EDGE, [...SHOT, '--window-size=1080,1080', `--screenshot=${out}`, pathToFileURL(html).href], { stdio: 'ignore' })
  console.log('만듦:', out)
}
cards.forEach(([name, body, h], i) => {
  const html = path.join(tmp, `${name}.html`)
  fs.writeFileSync(html, shell(i + 1, cards.length, body, h))
  const out = path.join(dir, `${name}.png`)
  execFileSync(EDGE, [...SHOT, `--window-size=${W},${h}`, `--screenshot=${out}`, pathToFileURL(html).href], { stdio: 'ignore' })
  console.log('만듦:', out)
})
