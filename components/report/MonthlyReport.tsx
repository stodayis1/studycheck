// 월간 학습 리포트 **화면** — 선생님 미리보기와 학부모님이 보시는 화면이 **같은 것**을 쓴다.
//
// ★ 한 장으로 쭉 내려간다 (원장님 2026-10-20
//   「어차피 링크로 나갈거라며 굳이 2장으로 나누지 않아도 될거 같은데. 그냥 스크롤로」).
//   A4 두 장으로 자르면 폰에서 가운데가 끊기고, 종이 크기(794px)에 묶여 글씨가 작아진다.
// ★ 클라이언트 JS 를 쓰지 않는다. 카카오톡 인앱 브라우저에서 JS 가 막히는 일이 있어서
//   공개 리포트는 서버에서 그려 보낸다(app/report/[token] 과 같은 규칙).
//   그래서 폭에 따라 달라지는 것은 **CSS 미디어쿼리**로만 한다.
// ★ 색은 수학의지혜 — 브라운 머리, 민트 강조, 크림 바탕.
import type { MonthlyReport as Data } from '@/lib/monthlyReport'

const INK = '#712B13'
const MINT = '#9FE1CB'
const GRAY = '#8C7B72'

const col = (v: number) => (v >= 85 ? INK : v >= 70 ? '#C08B6B' : '#D9CFC7')

const CSS = `
.mr{background:#EDE6E0;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#3A2A20;padding:0 0 28px}
.mr .sheet{max-width:794px;margin:0 auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.08)}
.mr .hd{background:#712B13;color:#fff;padding:26px 24px;display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap}
.mr .hd .kick{font-size:10.5px;letter-spacing:2.4px;color:#9FE1CB;margin-bottom:7px}
.mr .hd .ttl{font-size:23px;font-weight:800;letter-spacing:-.5px;line-height:1.25}
.mr .hd .sub{font-size:11.5px;opacity:.78;margin-top:6px}
.mr .hd .br{text-align:right}
.mr .hd .br .k{font-size:9.5px;letter-spacing:1.6px;color:#9FE1CB}
.mr .hd .br .n{font-size:15px;font-weight:800;margin-top:4px}
.mr .meta{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid #EADFD6;background:#FFFBF7}
.mr .meta>div{padding:12px 14px;border-right:1px solid #EADFD6}
.mr .meta>div:last-child{border-right:0}
.mr .meta .k{font-size:9.5px;color:#8C7B72;margin-bottom:5px}
.mr .meta .v{font-size:12.5px;font-weight:700}
.mr .body{padding:22px 24px 26px}
.mr .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
.mr .card{border:1px solid #EADFD6;border-radius:10px;padding:12px 13px;background:#FFFBF7}
.mr .card .k{font-size:9.5px;color:#8C7B72}
.mr .card .v{font-size:18px;font-weight:800;margin:6px 0 3px;color:#712B13}
.mr .card .s{font-size:10px;color:#8C7B72}
.mr h2{font-size:13.5px;margin:0 0 3px;display:flex;align-items:baseline;gap:9px;border-bottom:2px solid #712B13;padding-bottom:7px;flex-wrap:wrap}
.mr h2 i{font-style:normal;font-size:10.5px;color:#fff;background:#712B13;border-radius:4px;padding:2px 6px;font-weight:700}
.mr h2 em{font-style:normal;font-size:10px;color:#8C7B72;font-weight:400;margin-left:auto}
.mr .sec{margin-bottom:22px}
.mr .chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}
.mr .chip{border:1px solid #EADFD6;border-radius:6px;padding:7px 10px;font-size:11px;color:#5B4639;background:#fff}
.mr .chip.on{background:#9FE1CB33;border-color:#9FE1CB;color:#712B13;font-weight:700}
.mr .barrow{display:flex;align-items:center;gap:10px;margin-top:9px}
.mr .bl{width:104px;flex:0 0 auto;font-size:11px;color:#5B4639}
.mr .bt{flex:1;height:11px;background:#F7EFE9;border-radius:3px;overflow:hidden}
.mr .bf{height:100%;border-radius:3px}
.mr .barrow b{width:44px;flex:0 0 auto;text-align:right;font-size:11.5px;color:#712B13}
.mr .note{font-size:10px;color:#8C7B72;margin:9px 0 0}
.mr .lvrow{display:flex;align-items:center;gap:10px;margin-top:10px}
.mr .lvname{width:188px;flex:0 0 auto;min-width:0}
.mr .lvname b{display:block;font-size:11.5px;color:#3A2A20}
.mr .lvname span{display:block;font-size:10px;color:#8C7B72;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr .lvval{width:72px;flex:0 0 auto;text-align:right}
.mr .lvval b{font-size:11.5px;color:#712B13}
.mr .lvval em{font-style:normal;display:inline-block;margin-left:4px;font-size:9.5px;font-weight:800;color:#0F6E56}
.mr .none{font-size:11px;color:#B3A49B;margin:11px 0 0}
.mr .bkrow{margin-top:12px}
.mr .bkhd{display:flex;align-items:center;gap:6px;margin-bottom:5px}
.mr .bkt{flex:0 0 auto;font-size:9px;font-weight:800;color:#fff;border-radius:4px;padding:2px 6px;line-height:1}
.mr .bkn{font-size:12px;font-weight:800;color:#3A2A20;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mr .bkc{flex:0 0 auto;font-size:10px;color:#9C8A7F}
.mr .bkp{margin-left:auto;flex:0 0 auto;font-size:12px;font-weight:800;white-space:nowrap}
.mr .bkbar{height:7px;border-radius:999px;background:#F0E9E3;overflow:hidden}
.mr .bkbar i{display:block;height:7px;border-radius:999px;min-width:3px}
.mr .bksub{font-size:9.5px;color:#9C8A7F;margin-top:3px}
.mr .bkdone{margin-top:15px;padding-top:11px;border-top:1px solid #EADFD6}
.mr .bkdone>.t{font-size:10.5px;font-weight:800;color:#5B4639;margin:0 0 7px}
.mr .bkd{display:inline-flex;align-items:center;gap:5px;border:1px solid #EADFD6;border-radius:999px;padding:3.5px 9px;font-size:10.5px;color:#5B4639;background:#FFFBF7}
.mr .bkd i{width:7px;height:7px;border-radius:50%;display:inline-block;flex:0 0 auto}
.mr .cg{margin-top:11px;border:1px solid #EADFD6;border-radius:10px;background:#FFFBF7;padding:12px 13px 10px}
.mr .cglg{display:flex;align-items:center;gap:11px;font-size:10px;color:#5B4639;margin-bottom:7px;flex-wrap:wrap}
.mr .cglg span{display:inline-flex;align-items:center;gap:4px}
.mr .cglg i{width:9px;height:9px;border-radius:2px;display:inline-block}
.mr .cglg em{font-style:normal;margin-left:auto;font-size:9.5px;color:#8C7B72}
.mr .cpre{background:#BCE7D7;border:1px solid #86CFB6}
.mr .cmain{background:#F6E2CD;border:2px solid #712B13}
.mr .cetc{background:#E8E0D9;border:1px solid #D2C5BB}
.mr .cgwrap{display:flex;align-items:flex-start;gap:4px}
.mr .cgax{position:relative;flex:0 0 auto;width:21px;height:152px;padding-top:20px;box-sizing:border-box}
.mr .cgax div{position:relative;height:100%}
.mr .cgax i{position:absolute;right:0;font-style:normal;font-size:8.5px;color:#B3A49B;line-height:1;transform:translateY(50%)}
.mr .cgrg{margin-top:11px;padding-top:9px;border-top:1px dashed #E3D6CB}
.mr .cgrg .t{font-size:10px;font-weight:800;color:#5B4639;margin:0 0 5px}
.mr .cgrg li{display:flex;gap:8px;font-size:10.5px;color:#5B4639;line-height:1.55;margin-top:3px}
.mr .cgrg b{flex:0 0 48px;font-weight:800;color:#712B13}
.mr .cgrg span{min-width:0;white-space:pre-line}
.mr .cgrg ul{list-style:none;margin:0;padding:0}
.mr .cgscroll{flex:1 1 0;min-width:0;overflow-x:auto;overflow-y:hidden;-webkit-overflow-scrolling:touch;padding-bottom:2px}
.mr .cgplot{position:relative;display:flex;align-items:stretch;gap:0;height:152px;padding-top:20px;box-sizing:border-box;border-bottom:1px solid #D9C9BD}
.mr .cggrid{position:absolute;left:0;right:0;top:20px;bottom:0;background:repeating-linear-gradient(to top,#EFE4DC 0,#EFE4DC 1px,transparent 1px,transparent 50%)}
.mr .cgover{position:absolute;left:0;right:0;top:20px;bottom:0}
.mr .cgavg{position:absolute;left:0;right:0;border-top:1px dashed #C9B6A8}
.mr .cgavg b{position:absolute;right:0;bottom:2px;font-size:8.5px;font-weight:700;color:#9C8A7F;background:#FFFBF7;padding:0 3px;white-space:nowrap}
.mr .cgline{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible}
.mr .cgcol{position:relative;flex:1 1 0;min-width:0}
.mr .cgbar{position:absolute;left:3px;right:3px;bottom:0;margin:0 auto;max-width:40px;min-height:2px;border-radius:5px 5px 2px 2px;box-sizing:border-box}
.mr .cgdot{position:absolute;left:0;right:0;margin:0 auto;width:5px;height:5px;border-radius:50%;background:#A9512C;transform:translateY(50%)}
.mr .cgv{position:absolute;left:0;right:0;text-align:center;font-size:9.5px;font-weight:800;color:#712B13;line-height:13px}
.mr .cgx{display:flex;gap:0;margin-top:5px}
.mr .cgx>div{flex:1 1 0;min-width:0;text-align:center;overflow:hidden;padding:0 1px;box-sizing:border-box}
.mr .cgx b{display:block;font-size:9px;font-weight:700;color:#5B4639;white-space:nowrap}
.mr .cgx span{display:block;font-size:8.5px;color:#9C8A7F;white-space:nowrap;margin-top:1px}
.mr .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:11px}
.mr .cols.wide{grid-template-columns:1fr}
.mr .nt{margin:0 0 9px;padding:0 0 9px;border-bottom:1px dashed #EADFD6}
.mr .nt:last-child{margin-bottom:0;padding-bottom:0;border-bottom:0}
.mr .nt b{display:block;font-size:10px;font-weight:800;color:#8C7B72;margin-bottom:3px}
.mr .nt span{display:block;font-size:11px;line-height:1.75;color:#5B4639;white-space:pre-wrap}
.mr .box{border:1px solid #EADFD6;border-radius:10px;padding:13px 14px;background:#FFFBF7}
.mr .box .t{font-size:11.5px;font-weight:800;margin-bottom:7px;display:flex;justify-content:space-between;gap:8px;color:#712B13}
.mr .box .t span{font-size:9.5px;background:#9FE1CB44;border-radius:4px;padding:2px 7px;white-space:nowrap}
.mr .box p{margin:0;font-size:11px;line-height:1.75;color:#5B4639;white-space:pre-wrap}
.mr .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:11px}
.mr .step{border:1px solid #EADFD6;border-radius:10px;padding:12px 13px}
.mr .step .n{font-size:9.5px;color:#8C7B72;font-weight:800;letter-spacing:1px}
.mr .step .t{font-size:12px;font-weight:800;margin:5px 0 6px;color:#712B13}
.mr .step p{margin:0;font-size:10.5px;line-height:1.6;color:#6B5649}
.mr .ft{background:#4A1C0C;color:#fff;font-size:9.5px;padding:12px 24px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap}
@media (max-width:560px){
  .mr .hd{padding:20px 16px}
  .mr .hd .ttl{font-size:19px}
  .mr .meta{grid-template-columns:repeat(2,1fr)}
  .mr .meta>div:nth-child(2n){border-right:0}
  .mr .meta>div:nth-child(-n+2){border-bottom:1px solid #EADFD6}
  .mr .body{padding:18px 16px 22px}
  .mr .cards{grid-template-columns:repeat(2,1fr)}
  .mr .cols{grid-template-columns:1fr}
  .mr .steps{grid-template-columns:1fr}
  .mr .bl{width:78px;font-size:10.5px}
  .mr .lvrow{flex-wrap:wrap;gap:4px 8px}
  .mr .lvname{width:calc(100% - 80px)}
  .mr .bt{order:3;flex-basis:100%}
  .mr .bkn{font-size:11.5px}
  .mr .bkc{font-size:9.5px}
  .mr .cgax{height:130px;padding-top:18px}
  .mr .cgplot{height:130px;padding-top:18px}
  .mr .cggrid{top:18px}
  .mr .cgover{top:18px}
  .mr .cgv{font-size:9px;line-height:12px}
  .mr .cgx b{font-size:8px}
  .mr .cgx span{font-size:7.5px}
  .mr .ft{padding:12px 16px}
}
`

function Bar({ label, value, unit = '점' }: { label: string; value: number; unit?: string }) {
  return (
    <div className="barrow">
      <span className="bl">{label}</span>
      <div className="bt"><div className="bf" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: col(value) }} /></div>
      <b>{value}{unit}</b>
    </div>
  )
}
/** 단원 한 줄 — 「5-2 1단원 수의 범위와 어림하기」와 도달 레벨 막대. 레벨은 6을 꽉 찬 것으로 본다. */
function UnitLevel({ course, unit, name, level, gained }: { course: string; unit: string; name: string; level: number; gained: number }) {
  return (
    <div className="lvrow">
      <div className="lvname">
        <b>{[course, unit].filter(Boolean).join(' ')}</b>
        {name && <span>{name}</span>}
      </div>
      <div className="bt"><div className="bf" style={{ width: `${Math.min(100, (level / 6) * 100)}%`, background: col(Math.min(100, (level / 6) * 100)) }} /></div>
      <div className="lvval">
        <b>{level}레벨</b>
        {gained > 0 && <em>▲{gained}</em>}
      </div>
    </div>
  )
}

const Chip = ({ children, on }: { children: React.ReactNode; on?: boolean }) => (
  <span className={on ? 'chip on' : 'chip'}>{children}</span>
)
const Chips = ({ children }: { children: React.ReactNode }) => <div className="chips">{children}</div>
const None = ({ children }: { children: React.ReactNode }) => <p className="none">{children}</p>

/**
 * 교재 한 권의 진도 막대 (원장님 2026-11-05
 * 「현재 진행하고 있는 교재의 진도율과 지금까지 완료한 교재정도만 01번 진도칸에」).
 *
 * ★ 진도율을 **모를 때는 0% 막대를 그리지 않는다.** 0% 는 「하나도 안 했다」는 말이라
 *   선생님이 아직 안 적었을 뿐인 교재가 그렇게 나가면 안 된다.
 */
function BookBar({ b }: { b: any }) {
  const 모름 = typeof b?.pct !== 'number'
  const pct = 모름 ? 0 : Math.min(100, Math.max(0, b.pct))
  return (
    <div className="bkrow">
      <div className="bkhd">
        <span className="bkt" style={{ background: b.color }}>{b.short}</span>
        <span className="bkn">{b.name}</span>
        {b.course && <span className="bkc">{b.course}</span>}
        <span className="bkp" style={{ color: 모름 ? '#B3A49B' : b.color }}>{모름 ? '집계 전' : `${pct}%`}</span>
      </div>
      {/* ★ 0%% 는 막대를 아예 안 그린다 — 조금이라도 보이게 하려고 둔 최소 너비 때문에
          "아주 조금은 했다"로 보이면 안 된다. */}
      <div className="bkbar">{!모름 && pct > 0 && <i style={{ width: `${pct}%`, background: b.color }} />}</div>
      {!모름 && b.by === '개념' && b.total ? (
        <p className="bksub">개념 {b.total}개 중 {b.done}개 끝냈어요</p>
      ) : null}
      {모름 && <p className="bksub">아직 진도율이 적히지 않았어요</p>}
    </div>
  )
}

function Sec({ no, title, note, children }: { no: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="sec">
      <h2><i>{no}</i>{title}{note && <em>{note}</em>}</h2>
      {children}
    </div>
  )
}

export function MonthlyReportView({ d }: { d: Data }) {
  const { student: s, lessons: L, homework: H } = d
  const 중고 = d.tier !== '초등'
  const 고등 = d.tier === '고등'
  // ★ 이미 보내 드린 리포트는 그때 모양 그대로 저장돼 있다(report_links.data 스냅샷).
  //   옛 스냅샷에는 coreTests 가 아예 없거나 옛 모양(pct 없음)이라 그대로 그리면 **그 링크가 깨진다.**
  //   그래서 새 모양인 것만 골라 쓰고, 아니면 칸을 띄우지 않는다.
  // ★ 옛 스냅샷에는 books 가 없다 — 그때는 예전 모양(교재 이름 칩)으로 그린다.
  const books: any[] | null = Array.isArray((d as any).books) ? (d as any).books : null
  const booksDone: any[] = Array.isArray((d as any).booksDone) ? (d as any).booksDone : []
  // 한 달치인지 두 달치인지 — 옛 스냅샷에는 months 가 없다(그때는 다 한 달이었다).
  const 두달 = (d.period as any)?.months === 2
  const 기간말 = 두달 ? '두 달' : '한 달'
  // 선생님 한 줄 평 — 있으면 **자르지 않고** 그대로. 없으면 안내 한 줄.
  //   알림장은 요약의 **재료**일 뿐 화면에 싣지 않는다 (원장님 2026-11-05).
  const 한줄평 = (d.comment ?? '').trim()
  //   글이 길면 두 칸으로 나누지 않고 **한 칸을 넓게** 쓴다 — 두 달치는 길다
  const 긴코멘트 = 한줄평.length > 160
  const core = (d.coreTests ?? []).filter((c: any) => typeof c?.pct === 'number')
  // 그래프에 뜬 달의 시험 범위 (원장님 2026-11-05). 옛 스냅샷에는 없다 — 그러면 안 띄운다.
  const ranges: any[] = Array.isArray((d as any).coreRanges)
    ? (d as any).coreRanges.filter((r: any) => typeof r?.month === 'number' && String(r?.scope ?? '').trim())
    : []
  const CS = d.coreSummary
  // ★ 막대 굵기는 flex 가 알아서 나눠 가지되, **칸이 30px 보다 좁아지지는 않게** 한다.
  //   폰(375px)에서 16회가 되면 칸이 17px 이 되어 「예비1」·「5/11」·「100」이 잘렸다(실측 2026-11-04).
  //   좁으면 옆으로 밀어서 본다 — 눈금선과 밑줄까지 같이 밀려야 해서 폭을 숫자로 준다.
  //   칸 사이 틈은 칸 **안쪽**에 있다(gap:0) — 그래야 칸 가운데가 정확히 (i+0.5)/n 이 되고,
  //   추이 선을 서버에서 그 자리에 그려 둘 수 있다.
  const CGMIN = core.length * 30
  const 높이 = (pct: number) => Math.min(100, Math.max(0, pct))
  // 점을 잇는 추이 선 — SVG 는 글자가 아니라 선이라 가로로 늘려도 괜찮다(JS 없이 그려진다).
  const CGLINE = core.map((c: any, i: number) => `${i + 0.5},${100 - 높이(c.pct)}`).join(' ')
  let no = 1
  const nx = () => String(no++).padStart(2, '0')

  return (
    <div className="mr">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sheet">
        <div className="hd">
          <div>
            <div className="kick">LEARNING REPORT · {d.period.dateLabel}</div>
            <div className="ttl">{s.name} 학생 학습 리포트</div>
            <div className="sub">{d.period.label} {기간말} 수업 태도 및 진도 안내</div>
          </div>
          <div className="br">
            <div className="k">{d.tier} 과정</div>
            <div className="n">수학의지혜</div>
          </div>
        </div>

        <div className="meta">
          {[['학생', s.name], ['학교 · 학년', `${s.school ?? '-'} ${s.grade}`], ['기간', d.period.label], ['담당 선생님', s.teacher ?? '-']]
            .map(([k, v]) => (
              <div key={k}><div className="k">{k}</div><div className="v">{v}</div></div>
            ))}
        </div>

        <div className="body">
          <div className="cards">
            {[
              [`${두달 ? '두 달간' : '이번 달'} 수업`, `${L.total}회`, `정시 ${L.onTime} · 지각 ${L.late} · 결석 ${L.absent}`],
              ['출석률', `${L.rate}%`, L.absent ? `결석 ${L.absent}회` : '빠짐없이 등원'],
              ['과제 달성률', `${H.achievement ?? '-'}%`, '내준 과제를 해온 비율'],
              ['과제 성취도', `${H.score ?? '-'}%`, '해온 과제의 정확도'],
            ].map(([k, v, s2]) => (
              <div className="card" key={k}>
                <div className="k">{k}</div><div className="v">{v}</div><div className="s">{s2}</div>
              </div>
            ))}
          </div>

          {/* 진도 — **지금 푸는 교재의 진도율**과 **끝낸 교재**만 (원장님 2026-11-05
              「진도를 저렇게 제목으로 나열해도 학부모님들은 모르시거든」).
              ★ 이미 보내 드린 리포트는 그때 모양 그대로 저장돼 있다(report_links.data).
                옛 스냅샷에는 books 가 없다 — 그때는 **예전 모양 그대로** 그린다.
                안 그러면 보내 드린 링크의 진도 칸이 통째로 빈다. */}
          <Sec no={nx()} title="진도"
               note={books
                 ? [books.length ? `${books.length}권 진행 중` : '', booksDone.length ? `${booksDone.length}권 끝냄` : '']
                     .filter(Boolean).join(' · ')
                 : `${d.textbooks.length}권 진행 중`}>
            {books ? (
              <>
                {books.length ? books.map((b: any, i: number) => <BookBar key={i} b={b} />)
                  : <None>지금 푸는 교재가 없습니다.</None>}
                {booksDone.length > 0 && (
                  <div className="bkdone">
                    <p className="t">지금까지 끝낸 교재</p>
                    <div className="chips">
                      {booksDone.map((b: any, i: number) => (
                        <span className="bkd" key={i}>
                          <i style={{ background: b.color }} />{b.name}{b.course ? ` ${b.course}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <Chips>{d.textbooks.length ? d.textbooks.map((t) => <Chip key={t} on>{t}</Chip>) : <None>배정된 교재가 없습니다.</None>}</Chips>
                {((d as any).progress ?? []).length > 0 && (
                  <Chips>{((d as any).progress as string[]).map((p, i) => <Chip key={i}>{p.slice(0, 44)}</Chip>)}</Chips>
                )}
              </>
            )}
          </Sec>

          {/* ★ 핵심 — 단원별로 몇 레벨까지 올라갔는지. 초·중·고 모두 (원장님 2026-10-20) */}
          {d.unitLevels.length > 0 && (
            <Sec no={nx()} title="단원별 도달 레벨" note={`${d.unitLevels.length}단원 · 레벨 6이 끝`}>
              {d.unitLevels.map((u, i) => <UnitLevel key={i} {...u} />)}
              <p className="note">▲ 는 {두달 ? '두 달 사이에' : '이번 달에'} 오른 칸입니다. 한 단원은 70점을 넘겨야 다음 레벨로 갑니다.</p>
            </Sec>
          )}

          {/* 이번 달에 푼 학습지가 있을 때만 */}
          {d.worksheetSummary.total > 0 && (
            <Sec no={nx()} title={두달 ? '그동안 푼 학습지' : '이번 달 학습지'} note={`${d.worksheetSummary.total}장 · 통과 ${d.worksheetSummary.passed}장`}>
              <Chips>
                {d.worksheets.map((w, i) => (
                  <Chip key={i} on={w.passed}>{w.unit} · {w.level}레벨 {w.score != null ? `${w.score}점` : '채점 전'}{w.passed ? ' ✓' : ''}</Chip>))}
              </Chips>
            </Sec>
          )}

          {/* ★ 없는 칸은 **아예 안 보여 준다** (원장님 2026-10-20
              「중1, 중2는 아직 시험대비 이너프원 교재 배부 안됐거든. 강의영상도 마찬가지」).
              「없습니다」가 줄줄이 적힌 리포트는 안 한 것처럼 읽힌다. */}
          {d.examPrep.length > 0 && (
            <Sec no={nx()} title="시험대비 · 이너프원" note={`${d.examPrep.reduce((a, x) => a + x.total, 0)}회차 배부`}>
              {d.examPrep.map((x) => <Bar key={x.unit} label={x.unit} value={x.pct} unit="%" />)}
              <p className="note">진행률 = 끝낸 회차 ÷ 배부된 회차</p>
            </Sec>
          )}

          {d.videos.total > 0 && (
            <Sec no={nx()} title={고등 ? '강의영상 · 증명 제출' : '강의영상'} note={`${d.videos.total}편 배부`}>
              <Bar label="평균 시청률" value={d.videos.avgPct ?? 0} unit="%" />
              <Chips>
                <Chip on>완료 {d.videos.completed} / {d.videos.total}편</Chip>
                <Chip>90% 넘게 봐야 완료</Chip>
                {고등 && <Chip on={d.proofs > 0}>증명 제출 {d.proofs}건</Chip>}
              </Chips>
            </Sec>
          )}

          {d.retrySummary.total > 0 && (
            <Sec no={nx()} title="오답 재도전" note={`쌍둥이·유사 문제 ${d.retrySummary.total}장`}>
              <Bar label="재도전 통과율" value={Math.round((d.retrySummary.passed / d.retrySummary.total) * 100)} unit="%" />
              <Chips>{d.retries.map((r, i) => (
                <Chip key={i} on={r.passed}>{r.kind} · {r.unit}{r.score != null ? ` ${r.score}점` : ''}</Chip>))}</Chips>
            </Sec>
          )}

          {/* 학원 코어테스트 — 그 해에 본 것을 **쌓아서** 막대로 보여 준다 (원장님 2026-11-04
              「해당년도는 누적으로 막대그래프로 보여줘. 예비랑, 본고사 구별해서. 누적이 될수록
               막대그래프 두께는 얇아지겠지만 그래도 변화추이를 볼수 있어야돼」).
              ★ 막대 굵기는 정하지 않는다 — flex 로 남은 폭을 나눠 가지므로 회가 쌓이면
                저절로 얇아지고, 적으면 굵어진다(최대 40px 까지만).
              ★ JS 를 쓰지 않는다. 카톡 인앱 브라우저에서 막히는 일이 있어 서버에서 그려 보낸다.
              ★ 그 해 기록이 없으면 칸 자체를 띄우지 않는다. */}
          {core.length > 0 && CS && (
            <Sec
              no={nx()}
              title="학원 코어테스트"
              note={`${d.period.year}년 ${CS.count}회 · 평균 ${CS.avg}점 · 최고 ${CS.best}점`}
            >
              <div className="cg">
                <div className="cglg">
                  <span><i className="cpre" />예비</span>
                  <span><i className="cmain" />본고사</span>
                  {core.some((c) => c.kind === '기타') && <span><i className="cetc" />회차 미기재</span>}
                  <em>100점 만점</em>
                </div>
                <div className="cgwrap">
                <div className="cgax" aria-hidden="true">
                  <div>
                    <i style={{ bottom: '100%' }}>100</i>
                    <i style={{ bottom: '50%' }}>50</i>
                    <i style={{ bottom: '0%' }}>0</i>
                  </div>
                </div>
                <div className="cgscroll">
                <div className="cgplot" style={{ minWidth: CGMIN }}>
                  <div className="cggrid" />
                  <div className="cgover">
                    {CS.avg != null && (
                      <div className="cgavg" style={{ bottom: `${높이(CS.avg)}%` }}>
                        <b>평균 {CS.avg}점</b>
                      </div>
                    )}
                    {core.length > 1 && (
                      <svg
                        className="cgline"
                        viewBox={`0 0 ${core.length} 100`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <polyline
                          points={CGLINE}
                          fill="none"
                          stroke="#C08A6E"
                          strokeWidth="1.4"
                          strokeDasharray="3 3"
                          strokeLinecap="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    )}
                  </div>
                  {core.map((c, i) => (
                    <div className="cgcol" key={`${c.date}-${c.round}-${i}`}>
                      <span className="cgv" style={{ bottom: `calc(${높이(c.pct)}% + 6px)` }}>{c.pct}</span>
                      <div
                        className={`cgbar ${c.kind === '본고사' ? 'cmain' : c.kind === '예비' ? 'cpre' : 'cetc'}`}
                        style={{ height: `${높이(c.pct)}%` }}
                      />
                      <i className="cgdot" style={{ bottom: `${높이(c.pct)}%` }} />
                    </div>
                  ))}
                </div>
                <div className="cgx" style={{ minWidth: CGMIN }}>
                  {core.map((c, i) => (
                    <div key={`${c.date}-${c.round}-${i}`}>
                      <b>{c.short}</b>
                      <span>{c.dateLabel}</span>
                    </div>
                  ))}
                </div>
                </div>
                </div>
                <p className="note">
                  {CS.count > 1 && (
                    <>
                      처음 {CS.first}점 → 마지막 {CS.last}점
                      {CS.last! !== CS.first! && ` (${CS.last! > CS.first! ? '▲' : '▼'}${Math.abs(CS.last! - CS.first!)})`}
                      {' · '}
                    </>
                  )}
                  {CS.preAvg != null && `예비 평균 ${CS.preAvg}점`}
                  {CS.preAvg != null && CS.mainAvg != null && ' · '}
                  {CS.mainAvg != null && `본고사 평균 ${CS.mainAvg}점`}
                  {core.length >= 8 && <><br />회차가 많아 좁은 화면에서는 그래프를 옆으로 밀어서 보실 수 있어요.</>}
                </p>
                {ranges.length > 0 && (
                  <div className="cgrg">
                    <p className="t">그 달 코어테스트 범위</p>
                    <ul>
                      {ranges.map((r: any) => (
                        <li key={r.month}>
                          <b>{r.month}월</b><span>{r.scope}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Sec>
          )}

          {/* 담당 선생님 코멘트
              ★ **자르지 않는다** (원장님 2026-11-05 「지금 이미지에서와 같이 잘리면 안돼」).
                예전에는 220자에서 잘라 문장 한가운데가 끊겼다.
              ★ **알림장을 그대로 늘어놓지도 않는다** (원장님 2026-11-05
                「왜 수업태도는 모두다 나열되어 있는거지?」). 두 달치면 열 건이 넘는다 —
                학부모님은 그 벽을 안 읽으신다. 요약한 **한 줄 평**만 싣는다
                (원장님 2026-10-24 「한달동안 써준 알림장 내용을 너가 요약정리해서」).
                한 줄 평은 링크를 찍을 때 채워 넣는다(app/api/monthly-report). */}
          <Sec no={nx()} title="담당 선생님 코멘트">
            <div className={`cols${긴코멘트 ? ' wide' : ''}`}>
              <div className="box">
                <div className="t">수업 태도<span>{L.absent ? '보강 필요' : '성실'}</span></div>
                {한줄평
                  ? <p>{한줄평}</p>
                  : <p>{두달 ? '그동안' : '이번 달'} 선생님이 남긴 한 줄 평이 없습니다.</p>}
              </div>
              <div className="box">
                <div className="t">과제 수행<span>달성률 {H.achievement ?? '-'}%</span></div>
                <p>{`내준 과제를 ${H.achievement ?? '-'}% 해왔고, 해온 과제의 정확도는 ${H.score ?? '-'}% 입니다. ${(H.score ?? 0) >= 85 ? '정확도가 높아 다음 단계로 넘어가도 좋습니다.' : '틀린 문제를 다시 풀어 보는 시간을 함께 가지겠습니다.'}`}</p>
              </div>
            </div>
          </Sec>

          <Sec no={nx()} title="앞으로의 학습 방향">
            <div className="steps">
              {[
                ['STEP 1', '지금 교재 마무리', `${d.textbooks[0]?.replace(/^(개념서|유형서|심화서|연산서)\s/, '') ?? '진행 교재'}를 끝까지 마칩니다.`],
                ['STEP 2', 중고 ? '오답 다시 풀기' : '단원 다시 채우기',
                  중고 ? '틀린 문제의 쌍둥이·유사 문제로 다시 확인합니다.' : '70점을 못 넘은 단원을 다시 풀어 통과시킵니다.'],
                ['STEP 3', 중고 ? '시험 범위 마무리' : '다음 단원 예습',
                  중고 ? '남은 이너프원 회차를 시험 전까지 끝냅니다.' : `다음 ${기간말} 진도를 미리 한 번 훑습니다.`],
              ].map(([n, t, p]) => (
                <div className="step" key={n}>
                  <div className="n">{n}</div><div className="t">{t}</div><p>{p}</p>
                </div>
              ))}
            </div>
          </Sec>
        </div>

        <div className="ft">
          <span>고양시 덕양구 · 수학의지혜 수학학원</span>
          <span>{d.period.dateLabel}</span>
        </div>
      </div>
    </div>
  )
}
