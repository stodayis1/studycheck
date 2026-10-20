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
.mr .none{font-size:11px;color:#B3A49B;margin:11px 0 0}
.mr .cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:11px}
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
const Chip = ({ children, on }: { children: React.ReactNode; on?: boolean }) => (
  <span className={on ? 'chip on' : 'chip'}>{children}</span>
)
const Chips = ({ children }: { children: React.ReactNode }) => <div className="chips">{children}</div>
const None = ({ children }: { children: React.ReactNode }) => <p className="none">{children}</p>

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
            <div className="sub">{d.period.label} 한 달 수업 태도 및 진도 안내</div>
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
              ['이번 달 수업', `${L.total}회`, `정시 ${L.onTime} · 지각 ${L.late} · 결석 ${L.absent}`],
              ['출석률', `${L.rate}%`, L.absent ? `결석 ${L.absent}회` : '빠짐없이 등원'],
              ['과제 달성률', `${H.achievement ?? '-'}%`, '내준 과제를 해온 비율'],
              ['과제 성취도', `${H.score ?? '-'}%`, '해온 과제의 정확도'],
            ].map(([k, v, s2]) => (
              <div className="card" key={k}>
                <div className="k">{k}</div><div className="v">{v}</div><div className="s">{s2}</div>
              </div>
            ))}
          </div>

          <Sec no={nx()} title="진도" note={`${d.textbooks.length}권 진행 중`}>
            <Chips>{d.textbooks.length ? d.textbooks.map((t) => <Chip key={t} on>{t}</Chip>) : <None>배정된 교재가 없습니다.</None>}</Chips>
            {d.progress.length > 0 && <Chips>{d.progress.map((p, i) => <Chip key={i}>{p.slice(0, 44)}</Chip>)}</Chips>}
          </Sec>

          {d.tier === '초등' ? (
            <>
              <Sec no={nx()} title="레벨학습지" note={`이번 달 ${d.worksheetSummary.total}장 · 통과 ${d.worksheetSummary.passed}장`}>
                {d.worksheets.filter((w) => w.score != null).length
                  ? d.worksheets.filter((w) => w.score != null).map((w, i) => <Bar key={i} label={`${w.level}레벨`} value={w.score!} />)
                  : <None>이번 달 학습지 기록이 없습니다.</None>}
              </Sec>
              <Sec no={nx()} title="단원별 평가" note="70점을 넘어야 단원 통과">
                <Chips>
                  {d.worksheets.length
                    ? d.worksheets.map((w, i) => (
                      <Chip key={i} on={w.passed}>{w.unit} · {w.level}레벨 {w.score != null ? `${w.score}점` : '채점 전'}{w.passed ? ' ✓' : ''}</Chip>))
                    : <None>이번 달 평가 기록이 없습니다.</None>}
                </Chips>
              </Sec>
            </>
          ) : (
            <>
              <Sec no={nx()} title="시험대비 · 이너프원" note={`${d.examPrep.reduce((a, x) => a + x.total, 0)}회차 배부`}>
                {d.examPrep.length
                  ? <>{d.examPrep.map((x) => <Bar key={x.unit} label={x.unit} value={x.pct} unit="%" />)}
                    <p className="note">진행률 = 끝낸 회차 ÷ 배부된 회차</p></>
                  : <None>이번 달 시험대비 배부가 없습니다.</None>}
              </Sec>
              <Sec no={nx()} title={고등 ? '강의영상 · 증명 제출' : '강의영상'} note={`${d.videos.total}편 배부`}>
                {d.videos.total ? (
                  <>
                    <Bar label="평균 시청률" value={d.videos.avgPct ?? 0} unit="%" />
                    <Chips>
                      <Chip on>완료 {d.videos.completed} / {d.videos.total}편</Chip>
                      <Chip>90% 넘게 봐야 완료</Chip>
                      {고등 && <Chip on={d.proofs > 0}>증명 제출 {d.proofs}건</Chip>}
                    </Chips>
                  </>
                ) : <None>이번 달 영상 과제가 없습니다.{고등 ? ' (증명 제출도 없음)' : ''}</None>}
              </Sec>
              <Sec no={nx()} title="오답 재도전" note={`쌍둥이·유사 문제 ${d.retrySummary.total}장`}>
                {d.retrySummary.total ? (
                  <>
                    <Bar label="재도전 통과율" value={Math.round((d.retrySummary.passed / d.retrySummary.total) * 100)} unit="%" />
                    <Chips>{d.retries.map((r, i) => (
                      <Chip key={i} on={r.passed}>{r.kind} · {r.unit}{r.score != null ? ` ${r.score}점` : ''}</Chip>))}</Chips>
                  </>
                ) : <None>이번 달 재도전 기록이 없습니다. (틀린 문제가 적었다는 뜻이기도 합니다)</None>}
              </Sec>
            </>
          )}

          <Sec no={nx()} title="영역별 성취도" note="담당 선생님 기록 · 100점 기준">
            {d.areas.map((a) => <Bar key={a.label} label={a.label} value={a.value} />)}
          </Sec>

          <Sec no={nx()} title="담당 선생님 코멘트">
            <div className="cols">
              <div className="box">
                <div className="t">수업 태도<span>{L.absent ? '보강 필요' : '성실'}</span></div>
                {/* 선생님이 직접 쓴 한 줄 평이 먼저. 없으면 이번 달 알림장에서 가져온다. */}
                <p>{d.comment?.trim() || d.teacherNote?.slice(0, 220) || '이번 달 알림장에 남긴 말씀이 없습니다.'}</p>
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
                  중고 ? '남은 이너프원 회차를 시험 전까지 끝냅니다.' : '다음 달 진도를 미리 한 번 훑습니다.'],
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
