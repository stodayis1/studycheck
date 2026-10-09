// 시험분석 블로그 카드 (수학의지혜 카드뉴스 양식: 검정 · 주황 · 미색 · 도현체)
//
// analysis(JSON) 하나로 카드의 HTML 을 만든다. 그리는 곳이 둘이라 여기 한 군데에 둔다:
//   · 스터디체크 화면  components/exam-analysis/BlogCards.tsx  (SVG foreignObject 로 PNG 를 굽는다)
//   · 내 컴퓨터 스크립트 scripts/exam-blog/build.mjs            (Edge headless 로 찍는다)
// 글과 숫자는 전부 analysis 에서 온다 — 여기서 지어내지 않는다.
//
//   buildCards(A, { asset, img }) → [{ name, w, h, css, body }]
//     asset(파일명) = 로고·수지 그림 주소,  img(키) = 문제·손풀이 그림 주소

export const CARD_W = 1080
export const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Do+Hyeon&display=block'
const W = CARD_W
const NAVY = '#141414', GOLD = '#ff5722', BLUE = '#ff5722', INK = '#1a1a1a', MUTE = '#6b6f76', CREAM = '#f4f0e8'
const DIFF_NAME = ['', '하', '중하', '중', '중상', '상']
const DIFF_COLOR = ['', '#d8d3c8', '#b9b3a6', '#ffb499', '#ff8a5c', '#ff5722']
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const css = (h) => `
*{box-sizing:border-box;margin:0;padding:0}
.xb{width:${W}px;height:${h}px;overflow:hidden;font-family:'Pretendard','Malgun Gothic','Apple SD Gothic Neo',sans-serif;color:${INK};background:${NAVY};word-break:keep-all;-webkit-font-smoothing:antialiased;text-align:left;font-size:16px;line-height:normal}
.page{width:${W}px;height:${h}px;padding:40px 44px 30px;display:flex;flex-direction:column;background:${NAVY}}
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
small{font-size:22px;font-weight:700}
`

export function buildCards(A, { asset, img }) {
  const Q = A.questions ?? []
  const K = A.killers ?? []
  const nEssay = Q.filter((q) => q.essay).length
  const avgDiff = Q.length ? (Q.reduce((a, q) => a + (q.diff || 0), 0) / Q.length).toFixed(1) : '-'
  const totalPts = Q.reduce((a, q) => a + (Number(q.pts) || 0), 0)
  // 배점을 모르는 문항이 있으면 합계 · 배점을 카드에 쓰지 않는다 (틀린 숫자를 내보내지 않는다)
  const ptsKnown = Q.length > 0 && Q.every((q) => Number(q.pts) > 0)
  const title = `${A.year}학년도 ${A.school} ${A.grade} 수학`

  const shell = (n, total, body) => `<div class="xb"><div class="page">
<div class="top"><div class="brand"><img src="${asset('logo_cream_square.png')}"/><span>수학의지혜 기출분석</span></div>
<div class="pg">${esc(A.school)} ${esc(A.grade)} · ${esc(A.exam)}<br/><b>${n}</b> / ${total}</div></div>
${body}
<div class="foot"><span>${esc(title)} · ${esc(A.exam)}</span><b>수학의지혜 문의상담 <em>${esc(A.phone ?? '')}</em></b></div></div></div>`

  // ── 01 요약
  function summary() {
    const groups = A.unit_groups ?? []
    const maxU = Math.max(1, ...groups.map((u) => u.count))
    const byDiff = [1, 2, 3, 4, 5].map((d) => Q.filter((q) => q.diff === d).length)
    const maxD = Math.max(1, ...byDiff)
    const tiles = [
      ['총 문항', `${Q.length}`, `객관식 ${Q.length - nEssay} · 서술형 ${nEssay}${ptsKnown ? ` · ${totalPts}점` : ''}`, CREAM, NAVY],
      ['평균 난이도', `${avgDiff} <small>/ 5</small>`, `전체 난이도 「${esc(A.overall_difficulty)}」`, CREAM, NAVY],
      ['변별문항', `${K.length}`, K.map((k) => `${k.no}번`).join(' · '), CREAM, NAVY],
      ['이너프원 적중률', `${A.hit?.rate ?? '-'}<small>%</small>`, `${A.hit?.total ?? '-'}문항 중 ${A.hit?.hit ?? '-'}문항`, GOLD, '#fff'],
    ]
    return `<div class="sub">시험지 분석</div><h1>${esc(A.school)} ${esc(A.grade)} <em>시험분석</em></h1>
<div class="lead">${esc(A.exam)} · 범위 ${esc(A.scope)}</div>
<div class="grid" style="grid-template-columns:repeat(4,1fr);margin-top:22px">
${tiles.map(([k, v, s, bg, c]) => `<div style="background:${bg};border-radius:18px;padding:16px 18px"><div style="font-size:17px;color:${c === '#fff' ? '#ffe1d6' : MUTE};font-weight:700">${k}</div>
<div style="font-family:'Do Hyeon',sans-serif;font-size:54px;color:${c};line-height:1.1;margin-top:2px">${v}</div><div style="font-size:15px;color:${c === '#fff' ? '#ffe1d6' : MUTE};margin-top:2px;line-height:1.3">${s}</div></div>`).join('')}
</div>
<div class="card" style="margin-top:16px"><h3>전체 경향</h3><div style="font-size:23px;line-height:1.5;font-weight:600">${esc(A.one_line)}</div></div>
<div class="grid" style="grid-template-columns:1.25fr 1fr;margin-top:16px">
<div class="card"><h3>단원별 출제 비중</h3>
${groups.map((u) => `<div style="display:flex;align-items:center;gap:10px;margin-top:11px"><span style="width:168px;font-size:19px;font-weight:700">${esc(u.name)}</span>
<span style="flex:1;height:18px;background:#e2ddd2;border-radius:9px;overflow:hidden"><span style="display:block;height:100%;width:${(u.count / maxU) * 100}%;background:${u.color};border-radius:9px"></span></span>
<span style="width:66px;text-align:right;font-size:18px;color:${MUTE}">${u.count}문항</span></div>`).join('')}</div>
<div class="card"><h3>난이도 분포</h3><div style="display:flex;align-items:flex-end;gap:10px;height:132px;margin-top:4px">
${byDiff.map((n, i) => `<div style="flex:1;text-align:center"><div style="font-size:17px;font-weight:800;color:${NAVY}">${n}</div>
<div style="height:${Math.max(6, (n / maxD) * 86)}px;background:${DIFF_COLOR[i + 1]};border-radius:8px 8px 0 0;margin-top:3px"></div>
<div style="font-size:16px;color:${MUTE};margin-top:5px">${DIFF_NAME[i + 1]}</div></div>`).join('')}</div></div></div>
<div class="grid" style="grid-template-columns:1fr 1fr;margin-top:16px;flex:1">
<div class="card"><h3>출제 경향</h3><ul class="bul">${(A.trends ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>
<div class="card"><h3>다음 시험 전략</h3><ul class="bul">${(A.strategy ?? []).map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div></div>`
  }

  // ── 02 변별력 문항
  function killers() {
    return `<h1 style="margin-top:30px">변별력 <em>문항</em></h1>
<div class="lead">${esc(A.tagline)}</div>
<div class="grid" style="grid-template-columns:repeat(${Math.max(1, K.length)},1fr);margin-top:24px;flex:1;min-height:0">
${K.map((k) => `<div class="card" style="display:flex;flex-direction:column;min-height:0;padding:20px">
<div style="display:flex;align-items:center;gap:12px"><span style="background:${GOLD};color:#fff;font-family:'Do Hyeon',sans-serif;font-size:31px;border-radius:12px;padding:4px 14px;white-space:nowrap">${k.no}번</span>
<span style="font-size:18px;color:${MUTE};font-weight:700;line-height:1.3">${esc(k.tag)}${k.pts ? `<br/><b style="color:${GOLD}">배점 ${k.pts}점</b>` : ''}</span></div>
<div style="font-size:20px;line-height:1.5;margin-top:12px;font-weight:600">${esc(k.summary)}</div>
<div style="flex:1;min-height:0;margin-top:12px;border-radius:14px;padding:12px;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;background:#fff">
<img src="${img(k.image)}" style="max-width:100%;max-height:100%;object-fit:contain"/></div></div>`).join('')}
</div>
<div style="text-align:center;color:${CREAM};font-family:'Do Hyeon',sans-serif;font-size:31px;margin-top:20px;line-height:1.4">${esc(A.message)}</div>`
  }

  // ── 03 심층분석
  function deep(k) {
    return `<div class="sub" style="margin-top:14px">${esc(title)}</div>
<div style="display:flex;align-items:flex-end;justify-content:space-between;gap:20px"><div><h1><em>${k.no}번</em> 심층분석</h1><div class="lead">${esc(k.title)}${k.pts ? ` · 배점 ${k.pts}점` : ''}</div></div>
<div class="card" style="padding:12px 18px;min-width:340px">${(k.checks ?? []).map((c) => `<div style="font-size:18px;font-weight:700;margin:4px 0;display:flex;gap:8px"><span style="color:${GOLD}">✔</span>${esc(c)}</div>`).join('')}</div></div>
<div class="grid" style="grid-template-columns:0.82fr 1fr 1fr;grid-template-rows:1fr 1fr;margin-top:16px;height:470px">
<div class="card" style="grid-row:1 / span 2;display:flex;flex-direction:column;min-height:0;padding:16px"><h3><i>01</i>문제</h3>
<div style="flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;background:#fff;border-radius:10px;padding:8px"><img src="${img(k.image)}" style="max-width:100%;max-height:100%;object-fit:contain"/></div></div>
${(k.steps ?? []).slice(0, 4).map((s, i) => `<div class="card" style="padding:15px 17px;min-height:0;overflow:hidden"><h3 style="margin-bottom:7px"><i>0${i + 2}</i>Step ${i + 1}. ${esc(s.t)}</h3>
<div style="font-size:19.5px;line-height:1.45">${esc(s.d)}</div><div class="point"><b>POINT</b> ${esc(s.point)}</div></div>`).join('')}
</div>
<div class="grid" style="grid-template-columns:${k.solution ? '1fr 1fr' : '1fr'};margin-top:16px;flex:1;min-height:0">
${k.solution ? `<div class="card" style="display:flex;flex-direction:column;min-height:0;padding:16px"><h3><i>06</i>선생님 손풀이</h3>
<div style="flex:1;min-height:0;display:flex;align-items:flex-start;justify-content:center;overflow:hidden;border-radius:10px"><img src="${img(k.solution)}" style="max-width:100%;max-height:100%;object-fit:contain"/></div></div>` : ''}
<div style="display:flex;flex-direction:column;gap:16px;min-height:0">
<div class="card" style="padding:18px;flex:1"><h3><i>${k.solution ? '07' : '06'}</i>이 문항이 어려웠던 이유</h3><div style="font-size:20.5px;line-height:1.5">${esc(k.why)}</div></div>
<div class="card" style="padding:18px;background:#ffe6dc"><h3><i>${k.solution ? '08' : '07'}</i>선생님 한마디</h3>
<div style="font-size:20.5px;line-height:1.5;font-weight:600">${esc(k.comment)}</div><div style="text-align:right;font-size:17px;color:${MUTE};margin-top:6px">— 수학의지혜 ${esc(A.teacher)}</div></div></div></div>`
  }

  // ── 04 총평
  function review() {
    const n = Math.max(1, Q.length), obj = Q.length - nEssay
    const r = 62, c = 2 * Math.PI * r, a = (obj / n) * c
    const xs = (i) => 34 + (i * (430 - 34 - 14)) / Math.max(1, n - 1), ys = (d) => 150 - ((d || 1) - 1) * 30
    const pts = Q.map((q, i) => `${xs(i).toFixed(1)},${ys(q.diff)}`).join(' ')
    const kill = new Set(K.map((k) => Number(k.no)))
    const ticks = Array.from(new Set([1, 5, 10, 15, 20, 25, 30].filter((v) => v < n).concat(n)))
    const row = (f, i, bg, fs = 18, mt = 9, lh = 1.4) => `<div style="display:flex;gap:10px;margin-top:${mt}px"><span style="flex:0 0 28px;height:28px;border-radius:50%;background:${bg};color:#fff;font-weight:800;font-size:16px;display:flex;align-items:center;justify-content:center">${i + 1}</span>
<div style="font-size:${fs}px;line-height:${lh}"><b>${esc(f.t)}</b> — ${esc(f.d)}</div></div>`
    return `<div class="sub">${esc(title)}</div><h1>이번 시험 <em>총평</em></h1>
<div class="lead">“ ${esc(A.tagline)} ”</div>
<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:20px">
<div class="card" style="padding:18px"><h3><i>01</i>난이도와 문항 구성</h3>
<div style="display:flex;align-items:center;gap:14px"><svg xmlns="http://www.w3.org/2000/svg" width="150" height="150" viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="#c9c5bc" stroke-width="20"/>
<circle cx="75" cy="75" r="${r}" fill="none" stroke="${GOLD}" stroke-width="20" stroke-dasharray="${a} ${c}" transform="rotate(-90 75 75)"/>
<text x="75" y="70" text-anchor="middle" font-size="15" fill="${MUTE}" font-weight="700">전체 난이도</text><text x="75" y="98" text-anchor="middle" font-size="27" font-weight="900" fill="${NAVY}">${esc(A.overall_difficulty)}</text></svg>
<div style="font-size:18px;line-height:1.7"><span style="color:${GOLD}">●</span> 객관식 ${obj}문항<br/><span style="color:#a8a39a">●</span> 서술형 ${nEssay}문항${ptsKnown ? `<br/><b>${totalPts}점 만점</b>` : ''}</div></div></div>
<div class="card" style="padding:18px"><h3><i>02</i>이번 시험의 특징</h3>${(A.features ?? []).map((f, i) => row(f, i, NAVY)).join('')}</div>
<div class="card" style="padding:18px"><h3><i>03</i>대표 변별문항</h3>${K.map((k) => `<div style="display:flex;gap:10px;margin-top:10px;align-items:flex-start"><span style="background:${GOLD};color:#fff;font-family:'Do Hyeon',sans-serif;font-size:21px;border-radius:8px;padding:2px 9px;white-space:nowrap">${k.no}번</span>
<div style="font-size:18px;line-height:1.4"><b>${esc(k.title)}</b><br/><span style="color:${MUTE}">${esc(k.tag)}</span></div></div>`).join('')}</div></div>
<div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:16px;flex:1;min-height:0">
<div class="card" style="padding:18px"><h3><i>04</i>문항별 난이도 흐름</h3>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 430 190">${[1, 2, 3, 4, 5].map((d) => `<line x1="30" x2="420" y1="${ys(d)}" y2="${ys(d)}" stroke="#d8d3c8"/><text x="4" y="${ys(d) + 5}" font-size="13" fill="${MUTE}">${DIFF_NAME[d]}</text>`).join('')}
<polyline points="${pts}" fill="none" stroke="#1a1a1a" stroke-width="2.5"/>
${Q.map((q, i) => `<circle cx="${xs(i).toFixed(1)}" cy="${ys(q.diff)}" r="${kill.has(Number(q.no)) ? 7 : 4.5}" fill="${kill.has(Number(q.no)) ? GOLD : '#1a1a1a'}"/>`).join('')}
${ticks.map((v) => `<text x="${xs(v - 1).toFixed(1)}" y="180" font-size="13" fill="${MUTE}" text-anchor="middle">${v}</text>`).join('')}</svg>
<div style="font-size:16px;color:${MUTE}"><span style="color:${GOLD}">●</span> 변별문항 · 평균 난이도 ${avgDiff} / 5</div></div>
<div class="card" style="padding:18px"><h3><i>05</i>어려웠던 이유</h3>${(A.hard_reasons ?? []).map((f, i) => row(f, i, GOLD)).join('')}</div>
<div class="card" style="padding:18px"><h3><i>06</i>학습 방향</h3>${(A.study_steps ?? []).map((f, i) => row(f, i, NAVY, 17.5, 7, 1.35)).join('')}</div></div>
<div style="margin-top:16px;border:2px solid ${GOLD};border-radius:20px;padding:18px 24px;display:flex;align-items:center;gap:18px">
<img src="${asset('suji_100points_balloons.png')}" style="height:150px;margin:-30px 0 -26px"/><div><div style="color:${GOLD};font-size:19px;font-weight:800">07 · 이 시험이 주는 메시지</div>
<div style="color:${CREAM};font-family:'Do Hyeon',sans-serif;font-size:33px;line-height:1.35;margin-top:4px">${esc(A.message)}</div></div></div>`
  }

  // ── 00 대표 썸네일 (원장님 견본 2026-10-07: 검정 바탕 · 주황 머리글 · 큰 미색 제목 · 주황 막대 · 회색 부제 · 수지 · 문의상담)
  function thumb() {
    const T = A.thumb
    const size = T.headline.some((l) => l.length > 9) ? 104 : 124
    return {
      css: `*{box-sizing:border-box;margin:0;padding:0}
.xb{width:1080px;height:1080px;overflow:hidden;background:#141414;font-family:'Do Hyeon','Malgun Gothic',sans-serif;word-break:keep-all;position:relative;text-align:left}
.k{position:absolute;left:60px;top:90px;font-size:33px;color:#ff5722}
.logo{position:absolute;right:70px;top:50px;width:110px;height:110px;object-fit:cover}
h1{position:absolute;left:60px;top:196px;font-weight:400;font-size:${size}px;line-height:1.26;color:#f4f0e8}
.bar{position:absolute;left:60px;top:646px;width:140px;height:8px;background:#ff5722}
.s{position:absolute;left:60px;top:716px;font-size:36px;color:#9a9fa8}
.ch{position:absolute;right:60px;bottom:50px;width:360px;height:380px;object-fit:cover}
.f{position:absolute;left:60px;bottom:44px;font-size:29px;color:#f4f0e8}.f em{font-style:normal;color:#ff5722}`,
      body: `<div class="xb"><div class="k">${esc(T.kicker)}</div><img class="logo" src="${asset('logo_cream_square.png')}"/>
<h1>${T.headline.map(esc).join('<br/>')}</h1><div class="bar"></div><div class="s">${esc(T.sub)}</div>
<img class="ch" src="${asset('suji_uniform_fighting.jpg')}"/><div class="f">수학의지혜 문의상담 <em>${esc(A.phone ?? '')}</em></div></div>`,
    }
  }

  const pages = [['01_summary', summary(), 1420], ['02_killers', killers(), 1080],
    ...K.map((k) => [`03_deep_${String(k.no).padStart(2, '0')}`, deep(k), 1350]), ['04_review', review(), 1310]]
  const out = []
  if (A.thumb?.headline?.length) out.push({ name: '00_thumb', w: 1080, h: 1080, ...thumb() })
  pages.forEach(([name, body, h], i) => out.push({ name, w: W, h, css: css(h), body: shell(i + 1, pages.length, body) }))
  return out
}

// 혼자 열 수 있는 HTML 문서 (Edge headless 로 찍을 때)
export const cardDocument = (card) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${FONT_CSS_URL}" rel="stylesheet">
<style>html,body{margin:0;width:${card.w}px;height:${card.h}px;overflow:hidden}${card.css}</style></head><body>${card.body}</body></html>`
