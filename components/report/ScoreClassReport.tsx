/**
 * S코어반 학습 기록 보고서 — 학부모께 링크로 보내는 화면 (원장님 2026-11-19).
 *
 * ★ **판정(유지/보완)을 담지 않는다.** 기록만 보여 드린다.
 * ★ 카카오톡 인앱 브라우저에서 클라이언트 JS 가 먹통이 되는 일이 있어서
 *   **서버에서 그린 HTML 그대로** 보이게 한다 — 상태도, 효과도 쓰지 않는다
 *   (월간 보고서와 같은 규칙. app/report/[token]/page.tsx 머리말 참고).
 * ★ 다른 학생과의 비교·순위·반 평균은 **넣지 않는다.**
 */
import type { ScoreClassReport } from '@/lib/scoreClassReport'

const NAVY = '#0f3460'
const ORANGE = '#D85A30'
const RED = '#dc2626'
const BORDER = '#e5e7eb'
const BODY = '#374151'
const MUTED = '#9ca3af'
const BOX = '#f7f8fa'

function tone(v: number | null, good = 85, mid = 70) {
  if (v == null) return MUTED
  if (v >= good) return NAVY
  if (v >= mid) return ORANGE
  return RED
}
const n1 = (v: number | null) => (v == null ? '—' : String(v))

function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ border: `1px solid ${BORDER}`, borderRadius: 14, padding: '16px 16px 14px', marginBottom: 14, background: '#fff' }}>
      <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: NAVY }}>{title}</h2>
      {note ? <p style={{ margin: '4px 0 10px', fontSize: 12, color: MUTED, lineHeight: 1.5 }}>{note}</p> : <div style={{ height: 10 }} />}
      {children}
    </section>
  )
}

function Big({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ flex: '1 1 90px', minWidth: 90, background: BOX, borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: color ?? NAVY, lineHeight: 1.1 }}>{value}</div>
    </div>
  )
}

export function ScoreClassReportView({ d }: { d: ScoreClassReport }) {
  const 선행 = d.aheadCourse ?? '선행'
  const 최대 = Math.max(1, ...d.monthly.map((m) => m.count))

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: '18px 14px 40px', fontFamily: 'system-ui, -apple-system, "Apple SD Gothic Neo", sans-serif', color: BODY, background: '#fff' }}>

      <header style={{ background: NAVY, color: '#fff', borderRadius: 14, padding: '18px 16px', marginBottom: 14 }}>
        <div style={{ fontSize: 11, opacity: 0.8, letterSpacing: 1 }}>S CORE · 수학의지혜</div>
        <h1 style={{ margin: '6px 0 2px', fontSize: 20, fontWeight: 800 }}>{d.student.name} 학습 기록</h1>
        <div style={{ fontSize: 12, opacity: 0.9 }}>
          {[d.student.school, d.student.grade].filter(Boolean).join(' ')}
          {d.student.teacher ? ` · 담당 ${d.student.teacher} 선생님` : ''}
        </div>
        <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>{d.period.label}</div>
      </header>

      <Card title="한눈에" note={`${선행} 과정 학습지는 선행 범위, 현 학년 범위와 따로 셉니다.`}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Big label={`${선행} 범위 평균`} value={n1(d.ahead.avg)} color={tone(d.ahead.avg, 80, 70)} />
          <Big label="현 학년 범위" value={n1(d.own.avg)} color={tone(d.own.avg)} />
          {/* ★ 점수다. 「다시 푼 학습지 64」만 적으면 **64건**으로 읽힌다 (2026-11-20) */}
          <Big label={`다시 푼 학습지 ${d.retry.count}건 평균`} value={n1(d.retry.avg)} color={tone(d.retry.avg, 80, 70)} />
          <Big label="숙제 완료율" value={d.homework.pct == null ? '—' : d.homework.pct + '%'} color={tone(d.homework.pct, 90, 80)} />
        </div>
      </Card>

      <Card title="달마다 학습지 성적" note="푼 건수와 평균 점수입니다. 괄호 안은 70점을 넘지 못해 다시 푼 건수입니다.">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ color: MUTED, fontSize: 11 }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>달</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>건수</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>평균</th>
              <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 600 }}>{선행} 범위</th>
              <th style={{ padding: '4px 6px' }} />
            </tr>
          </thead>
          <tbody>
            {d.monthly.map((m) => (
              <tr key={m.month} style={{ borderTop: `1px solid ${BORDER}` }}>
                <td style={{ padding: '7px 6px', whiteSpace: 'nowrap' }}>{m.month.slice(5)}월</td>
                <td style={{ padding: '7px 6px', textAlign: 'right', color: MUTED }}>
                  {m.count}{m.under70 > 0 ? ` (${m.under70})` : ''}
                </td>
                <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: tone(m.avg) }}>{n1(m.avg)}</td>
                <td style={{ padding: '7px 6px', textAlign: 'right', color: tone(m.aheadAvg, 80, 70) }}>
                  {m.aheadCount ? n1(m.aheadAvg) : '—'}
                </td>
                <td style={{ padding: '7px 6px', width: 70 }}>
                  <div style={{ height: 6, borderRadius: 3, background: BORDER }}>
                    <div style={{ height: 6, borderRadius: 3, width: `${Math.round((m.count / 최대) * 100)}%`, background: NAVY }} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`${선행} 과정 학습지`} note="지금 나가고 있는 과정입니다. 현 학년 과정보다 점수가 낮게 나오는 것은 자연스럽습니다.">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Big label="푼 건수" value={String(d.ahead.count)} />
          <Big label="전체 평균" value={n1(d.ahead.avg)} color={tone(d.ahead.avg, 80, 70)} />
          <Big label="70점 이상" value={d.ahead.count ? `${d.ahead.passed}건` : '—'} />
          <Big label="최근 8주 평균" value={n1(d.ahead.recent8w.avg)} color={tone(d.ahead.recent8w.avg, 80, 70)} />
        </div>
        {d.ahead.recent8w.count > 0 && d.ahead.recent8w.count < 4 && (
          <p style={{ margin: '10px 0 0', fontSize: 12, color: ORANGE, lineHeight: 1.6 }}>
            최근 8주에 푼 {선행} 범위 학습지가 {d.ahead.recent8w.count}건으로, 성취도를 보기에는 아직 자료가 적습니다.
          </p>
        )}
      </Card>

      {d.weak.length > 0 && (
        <Card title="더 봐야 할 단원" note="최근 8주에 70점을 넘지 못해 다시 학습한 단원입니다.">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 13 }}>
            {d.weak.map((w, i) => (
              <li key={i} style={{ display: 'flex', gap: 8, padding: '7px 0', borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                <span style={{ color: MUTED, fontSize: 12, width: 48, flexShrink: 0 }}>{w.date.slice(5)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{w.unit}</span>
                <span style={{ fontWeight: 700, color: RED }}>{w.score}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="수업과 숙제">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Big label="수업" value={`${d.lessons.total}회`} />
          <Big label="정시" value={`${d.lessons.onTime}회`} />
          <Big label="지각" value={`${d.lessons.late}회`} color={d.lessons.late > 0 ? ORANGE : NAVY} />
          <Big label="결석" value={`${d.lessons.absent}회`} color={d.lessons.absent > 0 ? RED : NAVY} />
        </div>
        <div style={{ background: BOX, borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span>숙제를 해 온 수업</span>
            <b style={{ color: tone(d.homework.pct, 90, 80) }}>
              {d.homework.total}회 중 {d.homework.done}회{d.homework.pct == null ? '' : ` (${d.homework.pct}%)`}
            </b>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: BORDER }}>
            <div style={{ height: 8, borderRadius: 4, width: `${Math.round(d.homework.pct ?? 0)}%`, background: tone(d.homework.pct, 90, 80) }} />
          </div>
        </div>
      </Card>

      <Card title="교재 진도">
        {d.books.current && (
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>
            지금 나가는 교재 <b style={{ color: NAVY }}>{d.books.current}</b>
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {d.books.done.map((b, i) => (
            <span key={i} style={{ fontSize: 12, border: `1px solid ${BORDER}`, borderRadius: 999, padding: '4px 10px', background: BOX }}>
              {b.course} {b.name}
            </span>
          ))}
        </div>
        {d.books.done.length === 0 && <p style={{ margin: 0, fontSize: 13, color: MUTED }}>마친 교재 기록이 아직 없습니다.</p>}
      </Card>

      {d.exams.length > 0 && (
        <Card title="평가 기록">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {d.exams.map((e, i) => (
                <tr key={i} style={{ borderTop: i ? `1px solid ${BORDER}` : 'none' }}>
                  <td style={{ padding: '7px 6px', color: MUTED, fontSize: 12, whiteSpace: 'nowrap' }}>{e.date.slice(5)}</td>
                  <td style={{ padding: '7px 6px', whiteSpace: 'nowrap' }}>{e.kind}</td>
                  <td style={{ padding: '7px 6px', color: MUTED, fontSize: 12 }}>{e.title}</td>
                  <td style={{ padding: '7px 6px', textAlign: 'right', fontWeight: 700, color: tone(e.score) }}>
                    {e.score}<span style={{ color: MUTED, fontWeight: 400, fontSize: 11 }}>/{e.total}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <p style={{ fontSize: 11, color: MUTED, textAlign: 'center', lineHeight: 1.7, marginTop: 18 }}>
        {d.madeAt} 기준 · 수학의지혜 수학학원<br />
        이 기록은 수업 중 남긴 학습일지와 학습지 채점 결과를 그대로 모은 것입니다.
      </p>
    </main>
  )
}
