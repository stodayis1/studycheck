// 월간 학습 리포트 **견본** — 초·중·고 세 장. 실데이터로 그린다. 읽기만 한다.
//
//   node --import ./scripts/ts-resolve.mjs scripts/report-sample.mjs
//
// 원장님 2026-10-20 — 리딩온어학원 리포트 양식을 보시고 「이런식으로 한달에 한번」.
// 학년마다 보여 줄 것이 다르다:
//   초등 — 레벨학습지 · 단원별 평가
//   중등 — 시험대비(이너프원) · 영상 시청률 · 오답 재도전
//   고등 — 시험대비 · 영상 시청과 증명 제출 · 오답 재도전
//
// ★ 아직 **견본**이다. 화면에 붙이기 전에 칸 구성을 눈으로 맞추려고 만든 것이라
//   실제 발송 경로(report_links · /report/[token])와는 이어져 있지 않다.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { textbookLabel } from '../lib/utils.ts'

for (const l of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = l.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const FROM = '2026-10-01', TO = '2026-10-31', 월 = '2026년 10월', 날짜 = '2026. 10. 31.'

// 수학의지혜 색
const C = { ink: '#712B13', mint: '#9FE1CB', deep: '#4A1C0C', cream: '#FFFBF7', line: '#EADFD6', gray: '#8C7B72', soft: '#F7EFE9' }
const e = o => String(o ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null
const col = v => v >= 85 ? C.ink : v >= 70 ? '#C08B6B' : '#D9CFC7'
const bar = (label, v, sub) =>
  `<div class="barrow"><span class="bl">${e(label)}</span><div class="bt"><div class="bf" style="width:${Math.min(100, v)}%;background:${col(v)}"></div></div><b>${v}${sub ?? '점'}</b></div>`
const 없음 = t => `<p class="none">${e(t)}</p>`

async function 모으기(name) {
  const { data: ss } = await db.from('students').select('*').eq('name', name).eq('is_active', true).limit(1)
  const s = ss[0]
  const { data: ses } = await db.from('class_sessions').select('*').eq('student_id', s.id)
    .gte('session_date', FROM).lte('session_date', TO).order('session_date')
  const ids = (ses ?? []).map(x => x.id)
  const { data: notes } = await db.from('learning_notes').select('*').in('session_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  const { data: ws } = await db.from('student_worksheets').select('*').eq('student_id', s.id).order('assigned_at', { ascending: false }).limit(40)
  const { data: tb } = await db.from('student_textbooks').select('*').eq('student_id', s.id).eq('status', 'assigned')
  const { data: ep } = await db.from('student_exam_prep').select('*, inner_enough(*)').eq('student_id', s.id).gte('exam_date', FROM)
  const { data: vw } = await db.from('video_watch_logs').select('*').eq('student_id', s.id)
  const { data: pf } = await db.from('proof_submissions').select('*').eq('student_id', s.id)
  const { data: fb } = await db.from('feedbacks').select('content,created_at').eq('student_id', s.id).gte('created_at', FROM).order('created_at', { ascending: false }).limit(2)
  const n = new Map((notes ?? []).map(x => [x.session_id, x]))
  const att = { 정시: 0, 지각: 0, 결석: 0 }; const ach = [], sco = [], daily = []
  for (const x of ses ?? []) {
    const nn = n.get(x.id); if (!nn) continue
    if (nn.attendance === '정시') att.정시++
    else if (nn.attendance === '지각') att.지각++
    else if ((nn.attendance || '').includes('결석')) att.결석++
    if (nn.achievement_pct != null) ach.push(nn.achievement_pct)
    if (nn.worksheet_score != null) sco.push(nn.worksheet_score)
    if (x.daily_test_score != null) daily.push({ d: x.session_date.slice(5), v: x.daily_test_score })
  }
  const 수업 = (ses ?? []).length
  return { s, ses: ses ?? [], att, ach, sco, daily, ws: ws ?? [], tb: tb ?? [], ep: ep ?? [], vw: vw ?? [], pf: pf ?? [], fb: fb ?? [],
    수업, 출석률: 수업 ? Math.round((att.정시 + att.지각) / 수업 * 100) : 0,
    진도: (ses ?? []).map(x => x.progress_content).filter(Boolean) }
}

// ── 학년별 칸 ──────────────────────────────────────────────────────────
function 초등칸(d) {
  const 이번달 = d.ws.filter(w => (w.submitted_at ?? w.assigned_at ?? '') >= FROM)
  const 통과 = 이번달.filter(w => w.status === 'passed')
  const 단원 = [...new Map(이번달.filter(w => w.score != null).map(w => [`${w.unit}|${w.current_level}`, w])).values()].slice(0, 7)
  return `
  <div class="sec"><h2><i>02</i> 레벨학습지 <em>이번 달 ${이번달.length}장 · 통과 ${통과.length}장</em></h2>
    ${단원.map(w => bar(`${w.current_level}레벨`, w.score ?? 0)).join('') || 없음('이번 달 학습지 기록이 없습니다.')}</div>
  <div class="sec"><h2><i>03</i> 단원별 평가 <em>70점을 넘어야 단원 통과</em></h2>
    <div class="chips">${이번달.slice(0, 10).map(w => {
      const ok = w.status === 'passed'
      return `<span class="chip ${ok ? 'on' : ''}">${e(w.unit ?? '')} · ${w.current_level}레벨 ${w.score != null ? `${w.score}점` : '채점 전'}${ok ? ' ✓' : ''}</span>`
    }).join('') || 없음('이번 달 평가 기록이 없습니다.')}</div></div>`
}
function 시험대비칸(d) {
  const 묶음 = [...new Map(d.ep.map(x => [x.inner_enough?.unit_name ?? '-', x])).keys()]
  const 한단원 = u => d.ep.filter(x => (x.inner_enough?.unit_name ?? '-') === u)
  return `
  <div class="sec"><h2><i>02</i> 시험대비 · 이너프원 <em>${d.ep.length}회차 배부</em></h2>
    ${묶음.length ? 묶음.slice(0, 6).map(u => {
      const rows = 한단원(u)
      const 한 = rows.filter(r => (r.progress_step ?? 0) >= (r.total_steps ?? 1)).length
      return bar(u, Math.round(한 / rows.length * 100), '%')
    }).join('') : 없음('이번 달 시험대비 배부가 없습니다.')}
    <p class="note">진행률 = 끝낸 회차 ÷ 배부된 회차</p></div>`
}
function 영상칸(d, 증명 = false) {
  const 본것 = d.vw.filter(v => Number(v.coverage_pct ?? 0) > 0)
  const 평균 = avg(본것.map(v => Math.round(Number(v.coverage_pct))))
  const 완료 = d.vw.filter(v => v.completed_at).length
  return `
  <div class="sec"><h2><i>03</i> 강의영상${증명 ? ' · 증명 제출' : ''} <em>${d.vw.length}편 배부</em></h2>
    ${d.vw.length ? `
      ${bar('평균 시청률', 평균 ?? 0, '%')}
      <div class="chips">
        <span class="chip on">완료 ${완료} / ${d.vw.length}편</span>
        <span class="chip">90% 넘게 봐야 완료</span>
        ${증명 ? `<span class="chip ${d.pf.length ? 'on' : ''}">증명 제출 ${d.pf.length}건</span>` : ''}
      </div>` : 없음(`이번 달 영상 과제가 없습니다.${증명 ? ' (증명 제출도 없음)' : ''}`)}</div>`
}
function 재도전칸(d) {
  const 재 = d.ws.filter(w => w.worksheet_type !== 'main')
  const 통과 = 재.filter(w => w.status === 'passed').length
  return `
  <div class="sec"><h2><i>04</i> 오답 재도전 <em>쌍둥이·유사 문제 ${재.length}장</em></h2>
    ${재.length ? `${bar('재도전 통과율', Math.round(통과 / 재.length * 100), '%')}
      <div class="chips">${재.slice(0, 8).map(w =>
        `<span class="chip ${w.status === 'passed' ? 'on' : ''}">${w.worksheet_type === 'twin' ? '쌍둥이' : '유사'} · ${e(w.unit ?? '')}${w.score != null ? ` ${w.score}점` : ''}</span>`).join('')}</div>`
      : 없음('이번 달 재도전 기록이 없습니다. (틀린 문제가 적었다는 뜻이기도 합니다)')}</div>`
}

function 장만들기(d, 급) {
  const { s } = d
  const 담당 = (s.teacher_name || '').split(/[,/\s]+/)[0]
  const 영역 = [['출결 성실도', d.출석률], ['과제 달성률', avg(d.ach) ?? 0], ['과제 성취도', avg(d.sco) ?? 0]]
  if (d.daily.length) 영역.push(['데일리테스트', avg(d.daily.map(x => x.v))])
  const 가운데 = 급 === '초등' ? 초등칸(d)
    : 급 === '중등' ? 시험대비칸(d) + 영상칸(d) + 재도전칸(d)
    : 시험대비칸(d) + 영상칸(d, true) + 재도전칸(d)
  const 번호 = 급 === '초등' ? '04' : '05'
  return `
<div class="page">
 <div class="hd"><div><div class="kick">LEARNING REPORT · ${날짜}</div><div class="ttl">${e(s.name)} 학생 학습 리포트</div>
   <div class="sub">${월} 한 달 수업 태도 및 진도 안내</div></div>
  <div class="br"><div class="k">${급} 과정</div><div class="n">수학의지혜</div></div></div>
 <div class="meta">
  <div><div class="k">학생</div><div class="v">${e(s.name)}</div></div>
  <div><div class="k">학교 · 학년</div><div class="v">${e(s.school ?? '-')} ${e(s.grade)}</div></div>
  <div><div class="k">기간</div><div class="v">${월}</div></div>
  <div><div class="k">담당 선생님</div><div class="v">${e(담당 || '-')}</div></div>
 </div>
 <div class="body">
  <div class="cards">
   <div class="card"><div class="k">이번 달 수업</div><div class="v">${d.수업}회</div><div class="s">정시 ${d.att.정시} · 지각 ${d.att.지각} · 결석 ${d.att.결석}</div></div>
   <div class="card"><div class="k">출석률</div><div class="v">${d.출석률}%</div><div class="s">${d.att.결석 ? `결석 ${d.att.결석}회` : '빠짐없이 등원'}</div></div>
   <div class="card"><div class="k">과제 달성률</div><div class="v">${avg(d.ach) ?? '-'}%</div><div class="s">내준 과제를 해온 비율</div></div>
   <div class="card"><div class="k">과제 성취도</div><div class="v">${avg(d.sco) ?? '-'}%</div><div class="s">해온 과제의 정확도</div></div>
  </div>
  <div class="sec"><h2><i>01</i> 진도 <em>${d.tb.length}권 진행 중</em></h2>
   <div class="chips">${d.tb.map(t => `<span class="chip on">${e(textbookLabel(t, { withType: true }))}</span>`).join('') || 없음('배정된 교재가 없습니다.')}</div>
   <div class="chips">${d.진도.slice(0, 3).map(p => `<span class="chip">${e(String(p).slice(0, 44))}</span>`).join('')}</div></div>
  ${가운데}
  <div class="sec"><h2><i>${번호}</i> 영역별 성취도 <em>담당 선생님 기록 · 100점 기준</em></h2>
   ${영역.map(([k, v]) => bar(k, v)).join('')}</div>
 </div>
 <div class="ft"><span>수학의지혜 수학학원</span><span>${날짜} · 1 / 2</span></div>
</div>

<div class="page">
 <div class="hd slim"><div><div class="kick">LEARNING REPORT</div><div class="ttl sm">${e(s.name)} 학생 학습 리포트</div></div>
   <div class="br"><div class="n sm">수학의지혜</div></div></div>
 <div class="body">
  <div class="sec"><h2><i>06</i> 담당 선생님 코멘트</h2>
   <div class="cols">
    <div class="box"><div class="t">수업 태도<span>${d.att.결석 ? '보강 필요' : '성실'}</span></div>
      <p>${e((d.fb?.[0]?.content ?? '').slice(0, 165) || '이번 달 알림장에서 가져옵니다. 없으면 선생님이 직접 쓰십니다.')}</p></div>
    <div class="box"><div class="t">과제 수행<span>달성률 ${avg(d.ach) ?? '-'}%</span></div>
      <p>내준 과제를 ${avg(d.ach) ?? '-'}% 해왔고, 해온 과제의 정확도는 ${avg(d.sco) ?? '-'}% 입니다. ${(avg(d.sco) ?? 0) >= 85 ? '정확도가 높아 다음 단계로 넘어가도 좋습니다.' : '틀린 문제를 다시 풀어 보는 시간을 함께 가지겠습니다.'}</p></div>
   </div></div>
  <div class="sec"><h2><i>07</i> 앞으로의 학습 방향</h2>
   <div class="steps">
    <div class="step"><div class="n">STEP 1</div><div class="t">지금 교재 마무리</div><p>${e(textbookLabel(d.tb[0]) || '진행 교재')}를 끝까지 마칩니다.</p></div>
    <div class="step"><div class="n">STEP 2</div><div class="t">${급 === '초등' ? '단원 다시 채우기' : '오답 다시 풀기'}</div><p>${급 === '초등' ? '70점을 못 넘은 단원을 다시 풀어 통과시킵니다.' : '틀린 문제의 쌍둥이·유사 문제로 다시 확인합니다.'}</p></div>
    <div class="step"><div class="n">STEP 3</div><div class="t">${급 === '초등' ? '다음 단원 예습' : '시험 범위 마무리'}</div><p>${급 === '초등' ? '다음 달 진도를 미리 한 번 훑습니다.' : '남은 이너프원 회차를 시험 전까지 끝냅니다.'}</p></div>
   </div></div>
  <div class="sec"><h2><i>08</i> 원장 Talk</h2>
   <div class="talk"><h3>어머님께</h3>
    <p>${e(s.name)} 학생의 ${월} 한 달을 정리해 보내 드립니다. 이번 달은 ${d.수업}번 수업했고 ${d.att.결석 ? `${d.att.결석}번 결석이 있었습니다` : '한 번도 빠지지 않았습니다'}. 과제는 ${avg(d.ach) ?? '-'}% 해왔습니다.</p>
    <p>이 자리는 원장님이 직접 쓰시는 칸입니다. 아이마다 다른 말씀을 담으시면 됩니다.</p>
    <div class="sign">${날짜} · 수학의지혜 원장 드림</div></div></div>
 </div>
 <div class="ft"><span>고양시 덕양구 · 수학의지혜 수학학원</span><span>2 / 2</span></div>
</div>`
}

const CSS = `
*{box-sizing:border-box}body{margin:0;background:#EDE6E0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#3A2A20}
.page{width:794px;min-height:1123px;margin:18px auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.1);display:flex;flex-direction:column}
.hd{background:${C.ink};color:#fff;padding:26px 34px;display:flex;justify-content:space-between;align-items:flex-end}
.hd.slim{padding:18px 34px}
.hd .ttl{font-size:25px;font-weight:800;letter-spacing:-.5px}.hd .ttl.sm{font-size:19px}
.hd .kick{font-size:10.5px;letter-spacing:2.4px;color:${C.mint};margin-bottom:7px}
.hd .sub{font-size:11.5px;opacity:.78;margin-top:5px}
.hd .br{text-align:right}.hd .br .k{font-size:9.5px;letter-spacing:1.6px;color:${C.mint}}
.hd .br .n{font-size:15px;font-weight:800;margin-top:4px}.hd .br .n.sm{font-size:13px}
.meta{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid ${C.line};background:${C.cream}}
.meta div{padding:13px 16px;border-right:1px solid ${C.line}}.meta div:last-child{border-right:0}
.meta .k{font-size:9.5px;color:${C.gray};margin-bottom:5px}.meta .v{font-size:13px;font-weight:700}
.body{padding:22px 34px 0;flex:1}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:24px}
.card{border:1px solid ${C.line};border-radius:10px;padding:13px 14px;background:${C.cream}}
.card .k{font-size:9.5px;color:${C.gray}}.card .v{font-size:18px;font-weight:800;margin:6px 0 3px;color:${C.ink}}
.card .s{font-size:10px;color:${C.gray}}
h2{font-size:13.5px;margin:0 0 3px;display:flex;align-items:baseline;gap:9px;border-bottom:2px solid ${C.ink};padding-bottom:7px}
h2 i{font-style:normal;font-size:10.5px;color:#fff;background:${C.ink};border-radius:4px;padding:2px 6px;font-weight:700}
h2 em{font-style:normal;font-size:10px;color:${C.gray};font-weight:400;margin-left:auto}
.sec{margin-bottom:22px}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.chip{border:1px solid ${C.line};border-radius:6px;padding:7px 11px;font-size:11px;color:#5B4639;background:#fff}
.chip.on{background:${C.mint}33;border-color:${C.mint};color:${C.ink};font-weight:700}
.barrow{display:flex;align-items:center;gap:11px;margin-top:9px}
.bl{width:96px;font-size:11px;color:#5B4639}.bt{flex:1;height:11px;background:${C.soft};border-radius:3px;overflow:hidden}
.bf{height:100%;border-radius:3px}.barrow b{width:42px;text-align:right;font-size:11.5px;color:${C.ink}}
.note{font-size:10px;color:${C.gray};margin:9px 0 0}
.none{font-size:11px;color:#B3A49B;margin:11px 0 0}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:11px}
.box{border:1px solid ${C.line};border-radius:10px;padding:13px 15px;background:${C.cream}}
.box .t{font-size:11.5px;font-weight:800;margin-bottom:7px;display:flex;justify-content:space-between;color:${C.ink}}
.box .t span{font-size:9.5px;background:${C.mint}44;color:${C.ink};border-radius:4px;padding:2px 7px}
.box p{margin:0;font-size:11px;line-height:1.72;color:#5B4639}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:11px;margin-top:11px}
.step{border:1px solid ${C.line};border-radius:10px;padding:13px 14px}
.step .n{font-size:9.5px;color:${C.gray};font-weight:800;letter-spacing:1px}
.step .t{font-size:12px;font-weight:800;margin:5px 0 6px;color:${C.ink}}
.step p{margin:0;font-size:10.5px;line-height:1.6;color:#6B5649}
.talk{border:1px solid ${C.line};border-radius:10px;padding:19px 21px;margin-top:11px;background:${C.cream}}
.talk h3{margin:0 0 11px;font-size:12.5px;color:${C.ink}}
.talk p{margin:0 0 11px;font-size:11.5px;line-height:1.85;color:#4B3A2F}
.sign{text-align:right;font-size:11px;color:${C.gray};margin-top:16px}
.ft{background:${C.deep};color:#fff;font-size:9.5px;padding:11px 34px;display:flex;justify-content:space-between}
`

const 대상 = [['박지호', '초등'], ['차해인', '중등'], ['이수아', '고등']]
const 장들 = []
for (const [name, 급] of 대상) {
  const d = await 모으기(name)
  장들.push(장만들기(d, 급))
  console.log(`${급} ${name}(${d.s.grade}) — 수업 ${d.수업} · 학습지 ${d.ws.length} · 시험대비 ${d.ep.length} · 영상 ${d.vw.length} · 증명 ${d.pf.length} · 재도전 ${d.ws.filter(w => w.worksheet_type !== 'main').length}`)
}
writeFileSync('C:/Users/USER/AppData/Local/Temp/claude/report-3.html',
  `<!doctype html><meta charset="utf-8"><title>월간 학습 리포트 견본</title><style>${CSS}</style>${장들.join('')}`)
console.log('그렸습니다 — report-3.html')
