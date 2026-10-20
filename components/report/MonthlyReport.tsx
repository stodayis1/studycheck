// 월간 학습 리포트 **화면** — 선생님 미리보기와 학부모님이 보시는 화면이 **같은 것**을 쓴다.
//
// ★ 클라이언트 JS 를 쓰지 않는다. 카카오톡 인앱 브라우저에서 JS 가 막히는 일이 있어서
//   공개 리포트는 서버에서 그려 보낸다(app/report/[token] 과 같은 규칙).
// ★ 색은 수학의지혜 — 브라운 머리, 민트 강조, 크림 바탕 (원장님 2026-10-20).
import type { MonthlyReport as Data } from '@/lib/monthlyReport'

const INK = '#712B13'
const MINT = '#9FE1CB'
const DEEP = '#4A1C0C'
const CREAM = '#FFFBF7'
const LINE = '#EADFD6'
const GRAY = '#8C7B72'
const SOFT = '#F7EFE9'

const col = (v: number) => (v >= 85 ? INK : v >= 70 ? '#C08B6B' : '#D9CFC7')

function Bar({ label, value, unit = '점' }: { label: string; value: number; unit?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 9 }}>
      <span style={{ width: 104, fontSize: 11, color: '#5B4639', flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 11, background: SOFT, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, Math.max(0, value))}%`, background: col(value) }} />
      </div>
      <b style={{ width: 44, textAlign: 'right', fontSize: 11.5, color: INK }}>{value}{unit}</b>
    </div>
  )
}

const Chip = ({ children, on }: { children: React.ReactNode; on?: boolean }) => (
  <span style={{
    border: `1px solid ${on ? MINT : LINE}`, borderRadius: 6, padding: '7px 11px', fontSize: 11,
    color: on ? INK : '#5B4639', background: on ? `${MINT}33` : '#fff', fontWeight: on ? 700 : 400,
  }}>{children}</span>
)

const Chips = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 11 }}>{children}</div>
)

const None = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontSize: 11, color: '#B3A49B', margin: '11px 0 0' }}>{children}</p>
)

function Sec({ no, title, note, children }: { no: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <h2 style={{
        fontSize: 13.5, margin: '0 0 3px', display: 'flex', alignItems: 'baseline', gap: 9,
        borderBottom: `2px solid ${INK}`, paddingBottom: 7,
      }}>
        <i style={{ fontStyle: 'normal', fontSize: 10.5, color: '#fff', background: INK, borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>{no}</i>
        {title}
        {note && <em style={{ fontStyle: 'normal', fontSize: 10, color: GRAY, fontWeight: 400, marginLeft: 'auto' }}>{note}</em>}
      </h2>
      {children}
    </div>
  )
}

export function MonthlyReportView({ d }: { d: Data }) {
  const { student: s, lessons: L, homework: H } = d
  const 중고 = d.tier !== '초등'
  const 고등 = d.tier === '고등'

  const page: React.CSSProperties = {
    width: 794, minHeight: 1123, margin: '18px auto', background: '#fff',
    boxShadow: '0 2px 14px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column',
  }
  const body: React.CSSProperties = { padding: '22px 34px 0', flex: 1 }
  const ft: React.CSSProperties = {
    background: DEEP, color: '#fff', fontSize: 9.5, padding: '11px 34px',
    display: 'flex', justifyContent: 'space-between',
  }
  const card: React.CSSProperties = { border: `1px solid ${LINE}`, borderRadius: 10, padding: '13px 14px', background: CREAM }
  const box: React.CSSProperties = { ...card }

  let no = 1
  const nx = () => String(no++).padStart(2, '0')

  return (
    <div style={{ background: '#EDE6E0', fontFamily: "'Malgun Gothic','맑은 고딕',sans-serif", color: '#3A2A20', paddingBottom: 18 }}>
      {/* ── 1장 ───────────────────────────────────────────── */}
      <div style={page}>
        <div style={{ background: INK, color: '#fff', padding: '26px 34px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: 2.4, color: MINT, marginBottom: 7 }}>LEARNING REPORT · {d.period.dateLabel}</div>
            <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.5 }}>{s.name} 학생 학습 리포트</div>
            <div style={{ fontSize: 11.5, opacity: 0.78, marginTop: 5 }}>{d.period.label} 한 달 수업 태도 및 진도 안내</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9.5, letterSpacing: 1.6, color: MINT }}>{d.tier} 과정</div>
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>수학의지혜</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderBottom: `1px solid ${LINE}`, background: CREAM }}>
          {[['학생', s.name], ['학교 · 학년', `${s.school ?? '-'} ${s.grade}`], ['기간', d.period.label], ['담당 선생님', s.teacher ?? '-']]
            .map(([k, v], i) => (
              <div key={k} style={{ padding: '13px 16px', borderRight: i < 3 ? `1px solid ${LINE}` : undefined }}>
                <div style={{ fontSize: 9.5, color: GRAY, marginBottom: 5 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div>
              </div>
            ))}
        </div>

        <div style={body}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 11, marginBottom: 24 }}>
            {[
              ['이번 달 수업', `${L.total}회`, `정시 ${L.onTime} · 지각 ${L.late} · 결석 ${L.absent}`],
              ['출석률', `${L.rate}%`, L.absent ? `결석 ${L.absent}회` : '빠짐없이 등원'],
              ['과제 달성률', `${H.achievement ?? '-'}%`, '내준 과제를 해온 비율'],
              ['과제 성취도', `${H.score ?? '-'}%`, '해온 과제의 정확도'],
            ].map(([k, v, s2]) => (
              <div key={k} style={card}>
                <div style={{ fontSize: 9.5, color: GRAY }}>{k}</div>
                <div style={{ fontSize: 18, fontWeight: 800, margin: '6px 0 3px', color: INK }}>{v}</div>
                <div style={{ fontSize: 10, color: GRAY }}>{s2}</div>
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
                      <Chip key={i} on={w.passed}>
                        {w.unit} · {w.level}레벨 {w.score != null ? `${w.score}점` : '채점 전'}{w.passed ? ' ✓' : ''}
                      </Chip>))
                    : <None>이번 달 평가 기록이 없습니다.</None>}
                </Chips>
              </Sec>
            </>
          ) : (
            <>
              <Sec no={nx()} title="시험대비 · 이너프원" note={`${d.examPrep.reduce((s2, x) => s2 + x.total, 0)}회차 배부`}>
                {d.examPrep.length
                  ? <>
                    {d.examPrep.map((x) => <Bar key={x.unit} label={x.unit} value={x.pct} unit="%" />)}
                    <p style={{ fontSize: 10, color: GRAY, margin: '9px 0 0' }}>진행률 = 끝낸 회차 ÷ 배부된 회차</p>
                  </>
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
                      <Chip key={i} on={r.passed}>{r.kind} · {r.unit}{r.score != null ? ` ${r.score}점` : ''}</Chip>))}
                    </Chips>
                  </>
                ) : <None>이번 달 재도전 기록이 없습니다. (틀린 문제가 적었다는 뜻이기도 합니다)</None>}
              </Sec>
            </>
          )}

          <Sec no={nx()} title="영역별 성취도" note="담당 선생님 기록 · 100점 기준">
            {d.areas.map((a) => <Bar key={a.label} label={a.label} value={a.value} />)}
          </Sec>
        </div>
        <div style={ft}><span>수학의지혜 수학학원</span><span>{d.period.dateLabel} · 1 / 2</span></div>
      </div>

      {/* ── 2장 ───────────────────────────────────────────── */}
      <div style={page}>
        <div style={{ background: INK, color: '#fff', padding: '18px 34px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 10.5, letterSpacing: 2.4, color: MINT, marginBottom: 7 }}>LEARNING REPORT</div>
            <div style={{ fontSize: 19, fontWeight: 800 }}>{s.name} 학생 학습 리포트</div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800 }}>수학의지혜</div>
        </div>
        <div style={body}>
          <Sec no={nx()} title="담당 선생님 코멘트">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 13, marginTop: 11 }}>
              <div style={box}>
                <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 7, display: 'flex', justifyContent: 'space-between', color: INK }}>
                  수업 태도<span style={{ fontSize: 9.5, background: `${MINT}44`, borderRadius: 4, padding: '2px 7px' }}>{L.absent ? '보강 필요' : '성실'}</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.72, color: '#5B4639' }}>
                  {d.teacherNote?.slice(0, 165) || '이번 달 알림장에 남긴 말씀이 없습니다.'}
                </p>
              </div>
              <div style={box}>
                <div style={{ fontSize: 11.5, fontWeight: 800, marginBottom: 7, display: 'flex', justifyContent: 'space-between', color: INK }}>
                  과제 수행<span style={{ fontSize: 9.5, background: `${MINT}44`, borderRadius: 4, padding: '2px 7px' }}>달성률 {H.achievement ?? '-'}%</span>
                </div>
                <p style={{ margin: 0, fontSize: 11, lineHeight: 1.72, color: '#5B4639' }}>
                  내준 과제를 {H.achievement ?? '-'}% 해왔고, 해온 과제의 정확도는 {H.score ?? '-'}% 입니다.{' '}
                  {(H.score ?? 0) >= 85 ? '정확도가 높아 다음 단계로 넘어가도 좋습니다.' : '틀린 문제를 다시 풀어 보는 시간을 함께 가지겠습니다.'}
                </p>
              </div>
            </div>
          </Sec>

          <Sec no={nx()} title="앞으로의 학습 방향">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 11, marginTop: 11 }}>
              {[
                ['STEP 1', '지금 교재 마무리', `${d.textbooks[0]?.replace(/^(개념서|유형서|심화서|연산서)\s/, '') ?? '진행 교재'}를 끝까지 마칩니다.`],
                ['STEP 2', 중고 ? '오답 다시 풀기' : '단원 다시 채우기',
                  중고 ? '틀린 문제의 쌍둥이·유사 문제로 다시 확인합니다.' : '70점을 못 넘은 단원을 다시 풀어 통과시킵니다.'],
                ['STEP 3', 중고 ? '시험 범위 마무리' : '다음 단원 예습',
                  중고 ? '남은 이너프원 회차를 시험 전까지 끝냅니다.' : '다음 달 진도를 미리 한 번 훑습니다.'],
              ].map(([n, t, p]) => (
                <div key={n} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '13px 14px' }}>
                  <div style={{ fontSize: 9.5, color: GRAY, fontWeight: 800, letterSpacing: 1 }}>{n}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, margin: '5px 0 6px', color: INK }}>{t}</div>
                  <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: '#6B5649' }}>{p}</p>
                </div>
              ))}
            </div>
          </Sec>

          <Sec no={nx()} title="원장 Talk">
            <div style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: '19px 21px', marginTop: 11, background: CREAM }}>
              <h3 style={{ margin: '0 0 11px', fontSize: 12.5, color: INK }}>어머님께</h3>
              {(d.principalTalk
                ? d.principalTalk.split('\n').filter(Boolean)
                : [`${s.name} 학생의 ${d.period.label} 한 달을 정리해 보내 드립니다. 이번 달은 ${L.total}번 수업했고 ${L.absent ? `${L.absent}번 결석이 있었습니다` : '한 번도 빠지지 않았습니다'}. 과제는 ${H.achievement ?? '-'}% 해왔습니다.`]
              ).map((p, i) => (
                <p key={i} style={{ margin: '0 0 11px', fontSize: 11.5, lineHeight: 1.85, color: '#4B3A2F' }}>{p}</p>
              ))}
              <div style={{ textAlign: 'right', fontSize: 11, color: GRAY, marginTop: 16 }}>
                {d.period.dateLabel} · 수학의지혜 원장 드림
              </div>
            </div>
          </Sec>
        </div>
        <div style={ft}><span>고양시 덕양구 · 수학의지혜 수학학원</span><span>2 / 2</span></div>
      </div>
    </div>
  )
}
