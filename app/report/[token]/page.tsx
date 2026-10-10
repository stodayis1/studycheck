import { createClient } from '@supabase/supabase-js'
import { ATT_EXAM, isExamAbsence } from '@/lib/attendance'

// 카카오톡 인앱 브라우저에서 클라이언트 fetch가 먹통이 되는 경우가 있어서
// (링크는 오는데 눌러보면 빈 화면) 서버에서 미리 데이터를 읽어 HTML에 담아 보내도록 변경.
// 이러면 인앱 브라우저의 JS 제약과 상관없이 화면이 바로 보인다.
//
// 토큰마다 매번 새로운 리포트라서 캐시되면 안 되는 페이지. force-dynamic이 없으면 Next.js가
// 처음 접속했을 때 응답(예: 링크 생성 직후 아주 짧은 순간에 방문해서 "찾을 수 없어요"가 뜬 경우)을
// 그대로 캐시해버려서, 데이터가 실제로 존재해도 계속 "리포트를 찾을 수 없어요"만 보이는 문제가 있었다.
export const dynamic = 'force-dynamic'
export const revalidate = 0

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 흰 배경 + 네이비/오렌지 배색 (2026-08 원장님 확정) - 점수/출결 등 상태 표시는 네이비(양호)/
// 오렌지(주의)/빨강(결석·저점수, 경고 신호라서 유지)의 3단계 톤을 그대로 씀
const NAVY = '#0f3460'
const NAVY_DIM = 'rgba(15,52,96,0.15)'
const ORANGE = '#D85A30'
const ORANGE_DEEP = '#712B13'
const ORANGE_MID = '#993C1D'
const ORANGE_BG = '#FAECE7'
const RED = '#dc2626'
const BOX_BG = '#f7f8fa'
const BORDER = '#e5e7eb'
const TEXT_BODY = '#374151'
const TEXT_MUTED = '#9ca3af'

function tierColor(pct: number | null, good = 85, mid = 70) {
  if (pct == null) return TEXT_MUTED
  if (pct >= good) return NAVY
  if (pct >= mid) return ORANGE
  return RED
}

// 학습분석리포트용 레이더차트 - 클라이언트 JS 없이(카톡 인앱 브라우저 대응) 서버에서 SVG로 직접 그린다.
function polarPoint(cx: number, cy: number, angleDeg: number, r: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}
function ringPoints(n: number, cx: number, cy: number, maxR: number, frac: number) {
  return Array.from({ length: n })
    .map((_, i) => polarPoint(cx, cy, i * (360 / n), maxR * frac))
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

interface DailyReportData {
  studentName: string
  studentGrade: string
  sessionDate: string
  attendance: string
  progressContent: string | null
  hwTextbookName: string | null
  hwTextbookPage: string | null
  hwWorksheetRange: string | null
  videoUrl: string | null
  dailyTestUnit: string | null
  dailyTestScore: number | null
  worksheetScore: number | null
  worksheetUnit: string | null
  worksheetLevel: string | null
  achievementText: string | null
  memo: string | null
}

interface ReportLink {
  id: string
  student_id: string
  report_type: 'daily' | 'monthly' | 'quarterly'
    // 카톡 브리핑 버튼 뒤 화면들
    | 'worksheet_scores' | 'attendance_rate' | 'daily_notice'
  period_label: string
  period_start: string
  period_end: string
  data: DailyReportData | {
    totalSessions: number
    attendance: { 정시: number; 지각: number; 결석: number }
    hwRate: number
    avgScore: number | null
    passRate: number
    periodCount: number
    worksheetDetail?: { unit: string; level: number; score: number | null; status: string; isSimilar: boolean; assignedAt: string }[]
    curriculumProgress?: { grade: string; semester: number; rate: number; round: number }[]
    calcProgress: { name: string; percent: number; grade?: string | null; semester?: number | null }[]
    exams: any[]
    studentName: string
    studentGrade: string
    attendanceDetail?: { date: string; dow: string; status: string }[]
    dailyTests?: { date: string; unit: string | null; score: number }[]
    avgDailyTest?: number | null
    learningAnalysis?: {
      overallScore: number | null
      unitAverages: { label: string; avg: number; count: number }[]
      recentAvg: number
      weakestLabel: string | null
      weakestAvg: number | null
      recentDrop: { label: string; from: number; to: number } | null
      solutions: string[]
    } | null
  }
  ai_comment: string | null
  created_at: string
}

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // report_links는 RLS로 보호되어 있어서 직접 select는 안 되고, 정확한 토큰 하나만 조회하는
  // 전용 함수(get_report_by_token)로 읽는다 - 로그인 없이도 이 함수만으로 안전하게 조회 가능.
  const { data: rows, error } = await supabase.rpc('get_report_by_token', { p_token: token })
  const data = rows && rows.length > 0 ? rows[0] : null
  const link = (!error && data) ? (data as ReportLink) : null

  if (!link) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ background: '#f5f5f5' }}>
        <p className="text-lg font-bold text-gray-700">리포트를 찾을 수 없어요</p>
        <p className="text-sm text-gray-400">링크가 만료되었거나 잘못된 주소예요.</p>
      </div>
    )
  }

  // 카톡 알림톡 "자세히 보기" 링크용 - 그날 하루치 요약만 보여주는 간단한 화면
  if (link.report_type === 'daily') {
    const dd = link.data as DailyReportData
    // '결과' 칸은 지난 시간 과제였던 학습지를 오늘 채점한 점수만 보여준다 (데일리테스트는 아래 별도 칸에 이미 나오므로 여기서 섞지 않음)
    const scoreColor = tierColor(dd.worksheetScore)
    const dateLabel = `${Number(dd.sessionDate.slice(5, 7))}월 ${Number(dd.sessionDate.slice(8, 10))}일`
    const hwParts = [dd.hwTextbookName, dd.hwTextbookPage, dd.hwWorksheetRange].filter(Boolean)
    return (
      <div className="min-h-screen py-8 px-4" style={{ background: '#f5f5f5', fontFamily: 'Pretendard, sans-serif' }}>
        <div className="max-w-md mx-auto">
          <div style={{ background: 'white', borderRadius: 20, padding: 28, border: `1px solid ${BORDER}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <img src="/icon-192.png" alt="" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: ORANGE, fontWeight: 500, letterSpacing: 2, marginBottom: 4 }}>
                  수학의지혜 · STUDY CHECK
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: NAVY }}>{dd.studentName}</div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
                  {dd.studentGrade} · {dateLabel} 학습 안내
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: NAVY_DIM, marginBottom: 20 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}` }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>출결</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: NAVY }}>{dd.attendance}</div>
              </div>
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}` }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>지난 학습지</div>
                <div style={{ fontSize: 16, fontWeight: 500, color: scoreColor }}>{dd.worksheetScore != null ? `${dd.worksheetScore}점` : '-'}</div>
                {(dd.worksheetUnit || dd.worksheetLevel) && (
                  <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 3 }}>
                    {[dd.worksheetUnit, dd.worksheetLevel].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {dd.achievementText && (
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>과제 달성률</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: TEXT_BODY }}>{dd.achievementText}</div>
              </div>
            )}

            {dd.progressContent && (
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>오늘 진도</div>
                <div style={{ fontSize: 12, color: TEXT_BODY, lineHeight: 1.6 }}>{dd.progressContent}</div>
              </div>
            )}

            {dd.dailyTestScore != null && (
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>데일리테스트</div>
                <div style={{ fontSize: 12, color: TEXT_BODY, lineHeight: 1.6 }}>
                  {dd.dailyTestUnit ? `${dd.dailyTestUnit} · ` : ''}{dd.dailyTestScore}점
                </div>
              </div>
            )}

            {hwParts.length > 0 && (
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>오늘의 과제 (다음 시간까지)</div>
                <div style={{ fontSize: 12, color: TEXT_BODY, lineHeight: 1.6, whiteSpace: 'pre-line' }}>{hwParts.join('\n')}</div>
              </div>
            )}

            {dd.memo && (
              <div style={{ background: ORANGE_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${ORANGE}` }}>
                <div style={{ fontSize: 9, color: ORANGE_MID, fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>메모</div>
                <div style={{ fontSize: 11, color: ORANGE_DEEP, lineHeight: 1.7 }}>{dd.memo}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <div style={{ fontSize: 9, color: TEXT_MUTED }}>수학의지혜 학원</div>
              <div style={{ fontSize: 9, color: TEXT_MUTED }}>{dd.sessionDate}</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── 카톡 브리핑 버튼 뒤 세 화면 ──────────────────────────────────────────
  //   알림톡은 본문에 가변 이미지를 못 싣고(템플릿당 고정 1장) 글자도 1,000자까지라,
  //   누적 현황과 사진은 이렇게 버튼 뒤로 보낸다.
  //   data 는 **발송 시점에 떠 둔 사진**이라 여기서 DB 를 더 읽지 않는다 —
  //   링크를 주워도 살아 있는 자료나 남의 자녀로 넘어갈 수 없다.
  if (link.report_type === 'worksheet_scores') return <WorksheetScores d={link.data as any} link={link} />
  if (link.report_type === 'attendance_rate') return <AttendanceRate d={link.data as any} link={link} />
  if (link.report_type === 'daily_notice') return <DailyNotice d={link.data as any} link={link} />

  const d = link.data as Exclude<ReportLink['data'], DailyReportData>
  const isQuarterly = link.report_type === 'quarterly'

  return (
    <div className="min-h-screen py-8 px-4" style={{ background: '#f5f5f5', fontFamily: 'Pretendard, sans-serif' }}>
      <div className="max-w-md mx-auto">
        <div style={{ background: 'white', borderRadius: 20, padding: 28, border: `1px solid ${BORDER}` }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <img src="/icon-192.png" alt="" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 10, color: ORANGE, fontWeight: 500, letterSpacing: 2, marginBottom: 4 }}>
                  수학의지혜 · {isQuarterly ? 'QUARTERLY REPORT' : 'MONTHLY REPORT'}
                </div>
                <div style={{ fontSize: 22, fontWeight: 500, color: NAVY }}>{d.studentName}</div>
                <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>{d.studentGrade}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: TEXT_MUTED }}>{link.period_label}</div>
            </div>
          </div>
          <div style={{ height: 1, background: NAVY_DIM, marginBottom: 20 }} />

          {/* 출결 + 과제 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
            <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}` }}>
              <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>출결 현황</div>
              <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 4, color: NAVY }}>{d.totalSessions}<span style={{ fontSize: 11, color: TEXT_MUTED, marginLeft: 2 }}>회</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: NAVY }}>정시 {d.attendance.정시}</span>
                <span style={{ fontSize: 10, color: ORANGE }}>지각 {d.attendance.지각}</span>
                <span style={{ fontSize: 10, color: RED }}>결석 {d.attendance.결석}</span>
              </div>
            </div>
            <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}` }}>
              <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>과제 달성률</div>
              <div style={{ fontSize: 20, fontWeight: 500, marginBottom: 6, color: NAVY }}>{d.hwRate}<span style={{ fontSize: 11, color: TEXT_MUTED, marginLeft: 1 }}>%</span></div>
              <div style={{ height: 4, background: '#e9edf3', borderRadius: 4 }}>
                <div style={{ height: 4, borderRadius: 4, width: `${d.hwRate}%`, background: d.hwRate >= 80 ? NAVY : d.hwRate >= 60 ? ORANGE : RED }} />
              </div>
            </div>
          </div>

          {/* 출결 상세 (결석일 표시) */}
          {d.attendanceDetail && d.attendanceDetail.length > 0 && (() => {
            const absentDates = d.attendanceDetail.filter(a => a.status === '결석')
            return (
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>수업 일정</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {d.attendanceDetail.map((a, i) => {
                    const isAbsent = a.status === '결석'
                    const isLate = a.status === '지각'
                    const noEntry = a.status === '미입력'
                    return (
                      <div key={i} title={`${a.date} (${a.dow}) · ${a.status}`}
                        style={{
                          minWidth: 34, textAlign: 'center', borderRadius: 8, padding: '4px 5px',
                          background: isAbsent ? '#fee2e2' : noEntry ? '#f1f2f4' : 'white',
                          border: isAbsent ? `1px solid ${RED}` : '1px solid #e9edf3',
                        }}>
                        <div style={{ fontSize: 9, fontWeight: 500, color: isAbsent ? RED : isLate ? ORANGE : noEntry ? TEXT_MUTED : NAVY }}>
                          {Number(a.date.slice(5,7))}/{Number(a.date.slice(8,10))}
                        </div>
                        <div style={{ fontSize: 8, color: TEXT_MUTED, marginTop: 1 }}>{a.dow}</div>
                      </div>
                    )
                  })}
                </div>
                {absentDates.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 10, color: RED, lineHeight: 1.6 }}>
                    결석 {absentDates.length}회 · {absentDates.map(a => `${Number(a.date.slice(5,7))}/${Number(a.date.slice(8,10))}(${a.dow})`).join(', ')}
                  </div>
                )}
              </div>
            )
          })()}

          {/* 데일리테스트 - 고등부는 학습지보다 매 수업 데일리테스트가 핵심이라 별도 섹션으로 표시 */}
          {d.dailyTests && d.dailyTests.length > 0 && (
            <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>데일리테스트</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>{d.dailyTests.length}</div>
                  <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2 }}>응시 횟수</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: tierColor(d.avgDailyTest ?? null) }}>
                    {d.avgDailyTest ?? '-'}
                  </div>
                  <div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2 }}>평균점수</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid #e9edf3' }}>
                {d.dailyTests.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: TEXT_BODY, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {Number(t.date.slice(5,7))}/{Number(t.date.slice(8,10))}{t.unit ? ` · ${t.unit}` : ''}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 500, flexShrink: 0, color: tierColor(t.score) }}>
                      {t.score}점
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 학습지 */}
          {d.periodCount > 0 && (
            <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>학습지 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                <div><div style={{ fontSize: 18, fontWeight: 500, color: NAVY }}>{d.periodCount}</div><div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2 }}>총 학습지</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 500, color: tierColor(d.avgScore) }}>{d.avgScore ?? '-'}</div><div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2 }}>평균점수</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 500, color: d.passRate >= 80 ? NAVY : ORANGE }}>{d.passRate}%</div><div style={{ fontSize: 9, color: TEXT_MUTED, marginTop: 2 }}>통과율</div></div>
              </div>
              {d.worksheetDetail?.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #e9edf3', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {d.worksheetDetail.map((w: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: TEXT_BODY, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.unit} · {w.level}레벨{w.isSimilar ? ' (오답유사)' : ''}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: w.score != null ? tierColor(w.score) : TEXT_MUTED, flexShrink: 0 }}>
                        {w.score != null ? `${w.score}점` : w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 학습분석리포트 - 단원별 평균을 레이더로, 취약 단원과 솔루션을 함께 보여줌 (2026-08 확정 디자인) */}
          {d.learningAnalysis && (() => {
            const la = d.learningAnalysis!
            const showRadar = la.unitAverages.length >= 3
            const n = la.unitAverages.length
            const cx = 80, cy = 80, maxR = 56
            const dataPts = la.unitAverages
              .map((u, i) => polarPoint(cx, cy, i * (360 / n), maxR * (u.avg / 100)))
              .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(' ')
            return (
              <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>수학의지혜 학습분석리포트</div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ flexShrink: 0 }}>
                    <div style={{ fontSize: 9, color: TEXT_MUTED, marginBottom: 2 }}>종합 점수</div>
                    <div style={{ fontSize: 26, fontWeight: 500, color: tierColor(la.overallScore) }}>
                      {la.overallScore ?? '-'}<span style={{ fontSize: 12, color: TEXT_MUTED, marginLeft: 2 }}>/100</span>
                    </div>
                  </div>
                  {showRadar && (
                    <svg viewBox="0 0 160 160" width={120} height={120} style={{ flexShrink: 0 }}>
                      {[0.25, 0.5, 0.75, 1].map((frac) => (
                        <polygon key={frac} points={ringPoints(n, cx, cy, maxR, frac)} fill="none" stroke="#e5e7eb" strokeWidth={1} />
                      ))}
                      {la.unitAverages.map((_, i) => {
                        const p = polarPoint(cx, cy, i * (360 / n), maxR)
                        return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#e5e7eb" strokeWidth={1} />
                      })}
                      <polygon points={dataPts} fill={NAVY_DIM} stroke={NAVY} strokeWidth={1.5} />
                      {la.unitAverages.map((u, i) => {
                        const label = polarPoint(cx, cy, i * (360 / n), maxR + 16)
                        const anchor = label.x < cx - 5 ? 'end' : label.x > cx + 5 ? 'start' : 'middle'
                        return (
                          <text key={i} x={label.x} y={label.y} textAnchor={anchor} dominantBaseline="middle" fontSize={9} fill={TEXT_BODY}>
                            {u.label.length > 6 ? u.label.slice(0, 6) : u.label}
                          </text>
                        )
                      })}
                    </svg>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid #e9edf3', marginBottom: 10 }}>
                  {la.unitAverages.map((u, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: TEXT_BODY, width: 64, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.label}</span>
                      <div style={{ flex: 1, height: 6, background: '#e9edf3', borderRadius: 4 }}>
                        <div style={{ height: 6, borderRadius: 4, width: `${u.avg}%`, background: tierColor(u.avg) }} />
                      </div>
                      <span style={{ fontSize: 10, color: TEXT_BODY, width: 28, textAlign: 'right', flexShrink: 0 }}>{u.avg}점</span>
                    </div>
                  ))}
                </div>

                {la.weakestLabel && (
                  <div style={{ marginBottom: 10 }}>
                    <span style={{ fontSize: 10, fontWeight: 500, color: ORANGE_MID, background: ORANGE_BG, borderRadius: 8, padding: '3px 9px' }}>
                      취약 단원 · {la.weakestLabel} ({la.weakestAvg}점)
                    </span>
                  </div>
                )}

                <div style={{ paddingTop: 10, borderTop: '1px solid #e9edf3' }}>
                  <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>솔루션</div>
                  {la.solutions.map((s, i) => (
                    <div key={i} style={{ fontSize: 11, color: TEXT_BODY, lineHeight: 1.7 }}>{i + 1}. {s}</div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* 교재 진도 - 기록이 있는 학년/학기만, 회차 + 진행률로 압축해서 보여줌 */}
          {((d.curriculumProgress?.length ?? 0) > 0 || d.calcProgress.length > 0) && (
            <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>교재 진도</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(d.curriculumProgress ?? []).map((g, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: TEXT_BODY }}>{g.grade} {g.semester}학기</span>
                      <span style={{ fontSize: 9, fontWeight: 500, color: NAVY, background: '#e6ecf5', borderRadius: 8, padding: '1px 6px' }}>{g.round}회독</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: g.rate >= 80 ? NAVY : ORANGE, marginLeft: 'auto' }}>{g.rate}%</span>
                    </div>
                    <div style={{ height: 4, background: '#e9edf3', borderRadius: 4 }}>
                      <div style={{ height: 4, borderRadius: 4, width: `${g.rate}%`, background: g.rate >= 80 ? NAVY : ORANGE }} />
                    </div>
                  </div>
                ))}
                {d.calcProgress.map((tb, i) => (
                  <div key={`c${i}`} style={{ borderTop: i === 0 && (d.curriculumProgress?.length ?? 0) > 0 ? '1px solid #e9edf3' : undefined, paddingTop: i === 0 && (d.curriculumProgress?.length ?? 0) > 0 ? 8 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 500, color: ORANGE_MID, background: ORANGE_BG, borderRadius: 8, padding: '1px 6px' }}>연산서</span>
                      <span style={{ fontSize: 10, color: TEXT_BODY }}>{tb.name}{tb.grade ? ` · ${tb.grade}${tb.semester ? ` ${tb.semester}학기` : ''}` : ''}</span>
                      <span style={{ fontSize: 10, fontWeight: 500, color: ORANGE, marginLeft: 'auto' }}>{tb.percent}%</span>
                    </div>
                    <div style={{ height: 4, background: '#e9edf3', borderRadius: 4 }}>
                      <div style={{ height: 4, borderRadius: 4, width: `${tb.percent}%`, background: ORANGE }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 평가 */}
          {d.exams.length > 0 && (
            <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 10 }}>평가 성적</div>
              {d.exams.map((e: any) => {
                const pct = e.total_score > 0 ? Math.round(e.score / e.total_score * 100) : null
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: TEXT_BODY }}>
                      {[e.exam_type, e.title, e.unit, e.unit_name].filter(Boolean).join(' · ')}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 500, color: e.score != null ? tierColor(pct) : TEXT_MUTED }}>
                      {e.score != null ? `${e.score}/${e.total_score} (${pct}%)` : '미채점'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 한 줄 평 */}
          {link.ai_comment && (
            <div style={{ background: ORANGE_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${ORANGE}`, marginBottom: 8 }}>
              <div style={{ fontSize: 9, color: ORANGE_MID, fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>선생님 코멘트</div>
              <div style={{ fontSize: 11, color: ORANGE_DEEP, lineHeight: 1.7 }}>{link.ai_comment}</div>
            </div>
          )}

          {/* 푸터 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div style={{ fontSize: 9, color: TEXT_MUTED }}>수학의지혜 학원</div>
            <div style={{ fontSize: 9, color: TEXT_MUTED }}>{link.period_start} ~ {link.period_end}</div>
          </div>
        </div>
      </div>
    </div>
  )
}


// ════════════════════════════════════════════════════════════════════════════
// 카톡 브리핑 버튼 뒤 화면들
// 카카오톡 인앱 브라우저에서는 클라이언트 JS 가 막히는 일이 있어서, 그래프도 CSS 로만 그린다.
// ════════════════════════════════════════════════════════════════════════════

function Shell({ title, name, grade, period, children }: {
  title: string; name: string; grade?: string | null; period?: string | null; children: React.ReactNode
}) {
  return (
    <div className="min-h-screen py-8 px-4" style={{ background: '#f5f5f5', fontFamily: 'Pretendard, sans-serif' }}>
      <div className="max-w-md mx-auto">
        <div style={{ background: 'white', borderRadius: 20, padding: 24, border: `1px solid ${BORDER}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <img src="/icon-192.png" alt="" style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, color: ORANGE, fontWeight: 500, letterSpacing: 2, marginBottom: 4 }}>
                수학의지혜 · STUDY CHECK
              </div>
              <div style={{ fontSize: 20, fontWeight: 500, color: NAVY }}>{name}</div>
              <div style={{ fontSize: 12, color: TEXT_MUTED, marginTop: 2 }}>
                {[grade, title].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ height: 1, background: NAVY_DIM, marginBottom: 18 }} />
          {children}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
            <div style={{ fontSize: 9, color: TEXT_MUTED }}>수학의지혜 학원</div>
            <div style={{ fontSize: 9, color: TEXT_MUTED }}>{period ?? ''}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}` }}>
      <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, color: color ?? NAVY }}>{value}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div style={{ background: BOX_BG, borderRadius: 12, padding: '20px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 12, color: TEXT_MUTED }}>{text}</div>
    </div>
  )
}

/** 'YYYY-MM-DD' → 'YYYY-MM'. 날짜가 비면 null. */
function monthOf(d?: string | null) {
  return d && /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : null
}

function monthLabel(key: string) {
  return `${Number(key.slice(0, 4))}년 ${Number(key.slice(5, 7))}월`
}

/**
 * 월별 좌우 탭. **클라이언트 JS 없이** 라디오 + :checked 로만 넘긴다 —
 * 카카오톡 인앱 브라우저에서 JS 가 막히는 일이 있어서 이 화면은 서버에서 다 그린다.
 * 들어올 때는 가장 최근 달이 펼쳐져 있다.
 */
function MonthTabs({ uid, months, panels }: {
  uid: string
  months: string[]              // 오래된 → 최신 순
  panels: React.ReactNode[]     // months 와 같은 순서
}) {
  const last = months.length - 1
  const css = [
    `.${uid}-r{position:absolute;opacity:0;width:0;height:0;pointer-events:none}`,
    `.${uid}-p{display:none}`,
    ...months.map((_, i) => `#${uid}-${i}:checked~.${uid}-w>.${uid}-p[data-i="${i}"]{display:block}`),
  ].join('')
  const arrow = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 30, borderRadius: 9, fontSize: 17, lineHeight: 1,
    border: `1px solid ${BORDER}`, background: 'white', color: NAVY,
    cursor: 'pointer', userSelect: 'none' as const, flexShrink: 0,
  }
  const arrowOff = { ...arrow, color: '#d1d5db', background: '#fafafa', cursor: 'default' }
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {months.map((_, i) => (
        <input key={i} type="radio" name={uid} id={`${uid}-${i}`}
          className={`${uid}-r`} defaultChecked={i === last} />
      ))}
      <div className={`${uid}-w`}>
        {months.map((m, i) => (
          <div key={m} className={`${uid}-p`} data-i={i}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 8, marginBottom: 10,
            }}>
              {i > 0
                ? <label htmlFor={`${uid}-${i - 1}`} style={arrow} aria-label="이전 달">‹</label>
                : <span style={arrowOff}>‹</span>}
              <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>
                {monthLabel(m)}
                <span style={{ fontSize: 10, color: TEXT_MUTED, fontWeight: 400 }}>
                  {'  '}{i + 1}/{months.length}
                </span>
              </span>
              {i < last
                ? <label htmlFor={`${uid}-${i + 1}`} style={arrow} aria-label="다음 달">›</label>
                : <span style={arrowOff}>›</span>}
            </div>
            {panels[i]}
          </div>
        ))}
      </div>
    </>
  )
}

/** 레벨학습지 점수 현황 */
function WorksheetScores({ d, link }: { d: any; link: ReportLink }) {
  const rows: any[] = d.rows ?? []
  // ★ 쭉 늘어놓으면 6개월치가 한 화면에 쏟아져 읽을 수가 없다. 달로 끊어 좌우로 넘긴다.
  const months = [...new Set(rows.map((r) => monthOf(r.date)).filter(Boolean) as string[])].sort()

  const panel = (m: string) => {
    const mine = rows.filter((r) => monthOf(r.date) === m)
    const scored = mine.filter((r) => r.score != null)
    const avg = scored.length
      ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : null
    return (
      <>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 8 }}>
          이 달 {mine.length}장
          {avg != null && <> · 평균 <b style={{ color: tierColor(avg) }}>{avg}점</b></>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mine.map((r, i) => (
            <div key={i} style={{ background: BOX_BG, borderRadius: 12, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: TEXT_MUTED, flexShrink: 0 }}>{(r.date ?? '').slice(5)}</span>
                <span style={{ fontSize: 12, color: TEXT_BODY, flex: 1, lineHeight: 1.4 }}>{r.unit}</span>
                {r.level != null && (
                  <span style={{ fontSize: 10, color: NAVY, flexShrink: 0 }}>{r.level}레벨</span>
                )}
                <span style={{ fontSize: 14, fontWeight: 600, color: tierColor(r.score, 85, 70), flexShrink: 0, minWidth: 38, textAlign: 'right' }}>
                  {r.score != null ? `${r.score}점` : '-'}
                </span>
              </div>
              {r.score != null && (
                <div style={{ height: 5, background: '#e9ecf1', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.max(0, Math.min(100, r.score))}%`, height: '100%', background: tierColor(r.score, 85, 70) }} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                {!r.scoredYet && <span style={{ fontSize: 9, color: TEXT_MUTED }}>채점 전</span>}
                {r.scoredYet && r.score < 70 && <span style={{ fontSize: 9, color: RED }}>70점 미만 · 다시 풀어요</span>}
                {r.isRetry && <span style={{ fontSize: 9, color: ORANGE_MID }}>재도전(쌍둥이)</span>}
              </div>
            </div>
          ))}
        </div>
      </>
    )
  }

  return (
    <Shell title="레벨학습지 점수 현황" name={d.studentName} grade={d.studentGrade} period={d.periodLabel}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        <Stat label="평균 점수" value={d.avgScore != null ? `${d.avgScore}점` : '-'} color={tierColor(d.avgScore)} />
        {/* 통과 = 그 단원에서 가장 최근 채점한 본 학습지가 70점 이상 (docs/초등레벨학습지.md).
            예전에 쓰던 status='passed' 는 「처리 완료」일 뿐이라 70점 미만도 들어간다. */}
        <Stat label="단원 통과" value={d.unitsJudged ? `${d.unitsPassed}/${d.unitsJudged}` : '-'}
          color={d.unitsJudged && d.unitsPassed === d.unitsJudged ? NAVY : ORANGE} />
        <Stat label="받은 학습지" value={`${d.count ?? 0}장`} />
      </div>
      <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 12 }}>위 숫자는 최근 6개월 전체입니다.</div>

      {months.length === 0 ? (
        <Empty text="최근 6개월 동안 받은 레벨학습지가 없어요." />
      ) : (
        <MonthTabs uid="ws" months={months} panels={months.map(panel)} />
      )}
      <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 12, lineHeight: 1.6 }}>
        레벨학습지는 70점 미만이면 같은 단원을 다시 풀어 단원을 확실히 넘기고 갑니다.
      </div>
    </Shell>
  )
}

/** 출결현황 및 과제달성률 현황 */
function AttendanceRate({ d, link }: { d: any; link: ReportLink }) {
  const rows: any[] = d.rows ?? []
  const absences: any[] = d.absences ?? []
  const extras: any[] = d.extraClasses ?? []
  const months = [...new Set(rows.map((r) => monthOf(r.date)).filter(Boolean) as string[])].sort()

  // 보강 상태 한 줄. 날짜·시각은 OPS 보강 기록(makeups)에서 온다.
  // 기록이 없으면 **없다고** 적는다 — 있는 척하면 안 된다.
  const day = (d?: string | null, t?: string | null) =>
    d ? `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일${t ? ` ${t}` : ''}` : null
  const makeup = (a: any): { text: string; color: string } => {
    const when = day(a.makeupDate, a.makeupTime)
    switch (a.state) {
      case 'done': return { text: when ? `${when} 보강 완료` : (a.note ?? '보강 완료'), color: NAVY }
      case 'planned': return { text: when ? `${when} 보강 예정` : (a.note ?? '보강 예정'), color: ORANGE }
      case 'noshow': return { text: when ? `${when} 보강에 오지 못함` : '보강에 오지 못함', color: RED }
      case 'waiting': return { text: a.note ?? '보강 날짜를 잡는 중', color: ORANGE_MID }
      case 'none': return { text: a.note ?? '보강 기록 없음', color: RED }
      default: return { text: a.note ?? '-', color: TEXT_BODY }
    }
  }

  const panel = (m: string) => {
    const mine = rows.filter((r) => monthOf(r.date) === m)
    const counted = mine.filter((r) => r.attendance)
    const n = (k: string) => counted.filter((r) => r.attendance === k).length
    const pcts = mine.map((r) => r.pct).filter((p: any) => p != null) as number[]
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null
    return (
      <>
        <div style={{ fontSize: 11, color: TEXT_MUTED, marginBottom: 8 }}>
          이 달 {counted.length}회 · 정시 {n('정시')} · 지각 <b style={{ color: n('지각') ? ORANGE : TEXT_MUTED }}>{n('지각')}</b>
          {' · '}결석 <b style={{ color: n('결석') ? RED : TEXT_MUTED }}>{n('결석')}</b>
          {mine.some((r) => isExamAbsence(r.attendance)) &&
            <> · {ATT_EXAM} <b style={{ color: '#7C3AED' }}>{mine.filter((r) => isExamAbsence(r.attendance)).length}</b></>}
          {avg != null && <> · 평균 달성률 <b style={{ color: tierColor(avg, 90, 70) }}>{avg}%</b></>}
        </div>
        <div style={{ border: `1px solid ${BORDER}`, borderRadius: 12, overflow: 'hidden' }}>
          {mine.map((r, i) => {
            // 시험기간은 빨갛게 하지 않는다 — 봐주는 날이지 결석이 아니다
            const attColor = r.attendance === '정시' ? NAVY : r.attendance === '지각' ? ORANGE
              : r.attendance === '결석' ? RED : isExamAbsence(r.attendance) ? '#7C3AED' : TEXT_MUTED
            return (
              <div key={i} style={{
                borderTop: i === 0 ? 'none' : `1px solid ${BORDER}`,
                background: r.attendance === '결석' ? '#fff7f7'
                  : isExamAbsence(r.attendance) ? '#FAF5FF' : i % 2 === 0 ? 'white' : '#fcfcfd',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                  <span style={{ fontSize: 11, color: TEXT_BODY, width: 58, flexShrink: 0 }}>
                    {(r.date ?? '').slice(5)} <span style={{ color: TEXT_MUTED }}>{r.dow}</span>
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 500, color: attColor, width: 46, flexShrink: 0 }}>
                    {r.attendance ?? '미기록'}
                  </span>
                  <div style={{ flex: 1, height: 5, background: '#e9ecf1', borderRadius: 3, overflow: 'hidden' }}>
                    {r.pct != null && (
                      <div style={{ width: `${Math.max(0, Math.min(100, r.pct))}%`, height: '100%', background: tierColor(r.pct, 90, 70) }} />
                    )}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: tierColor(r.pct, 90, 70), width: 34, textAlign: 'right', flexShrink: 0 }}>
                    {r.pct != null ? `${r.pct}%` : '-'}
                  </span>
                </div>
                {/* 결석한 날은 그 자리에서 보강이 어떻게 됐는지 바로 보이게 */}
                {r.attendance === '결석' && (() => {
                  const mk = r.makeup
                  const when = mk ? day(mk.makeupDate, mk.makeupTime) : null
                  const txt = mk
                    ? (mk.state === 'done' ? `${when ?? ''} 보강 완료`
                      : mk.state === 'planned' ? `${when ?? ''} 보강 예정`
                        : mk.state === 'noshow' ? '보강에 오지 못함' : '보강 날짜를 잡는 중')
                      + (mk.teacherName ? ` · ${mk.teacherName} 선생님` : '')
                    : (r.makeupNote ?? '기록 없음')
                  return (
                    <div style={{ padding: '0 12px 9px 70px', fontSize: 10, color: mk?.state === 'done' ? NAVY : (mk || r.makeupNote) ? ORANGE_MID : RED }}>
                      보강 · {txt.trim()}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  return (
    <Shell title="출결 · 과제 달성률 현황" name={d.studentName} grade={d.studentGrade} period={d.periodLabel}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
        <Stat label="정시 출석률" value={d.onTimeRate != null ? `${d.onTimeRate}%` : '-'} color={tierColor(d.onTimeRate, 90, 75)} />
        <Stat label="평균 과제 달성률" value={d.avgPct != null ? `${d.avgPct}%` : '-'} color={tierColor(d.avgPct, 90, 70)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 6 }}>
        <Stat label="정시" value={`${d.onTime ?? 0}회`} />
        <Stat label="지각" value={`${d.late ?? 0}회`} color={(d.late ?? 0) > 0 ? ORANGE : NAVY} />
        <Stat label="결석" value={`${d.absent ?? 0}회`} color={(d.absent ?? 0) > 0 ? RED : NAVY} />
      </div>
      <div style={{ fontSize: 10, color: TEXT_MUTED, marginBottom: 14 }}>위 숫자는 최근 6개월 전체입니다.</div>

      {/* ── 결석·보강 내역 ──────────────────────────────────────────────────
          "언제 결석했고 그 보강은 어떻게 됐는지" 를 **달과 상관없이 한자리에** 모은다.
          달별 탭 안에 흩어 두면 결석이 잦아지는 흐름이 눈에 안 들어온다. */}
      {absences.length > 0 && (
        <div style={{ borderRadius: 12, border: `1px solid #f5d6cc`, overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ background: '#FFF5F2', padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: ORANGE_DEEP }}>
              결석 {absences.length}회 · 보강 내역
            </div>
            <div style={{ fontSize: 10, color: ORANGE_MID, marginTop: 3 }}>
              {[
                d.makeupDone > 0 && `완료 ${d.makeupDone}회`,
                d.makeupPlanned > 0 && `예정 ${d.makeupPlanned}회`,
                d.makeupWaiting > 0 && `날짜 잡는 중 ${d.makeupWaiting}회`,
                d.makeupNoshow > 0 && `보강 결석 ${d.makeupNoshow}회`,
                d.makeupNone > 0 && `기록 없음 ${d.makeupNone}회`,
              ].filter(Boolean).join(' · ') || '최근 6개월 기준'}
            </div>
          </div>
          {absences.map((a, i) => {
            const m = makeup(a)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 14px',
                borderTop: `1px solid #f7e6e0`, background: 'white',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: RED, width: 62, flexShrink: 0 }}>
                  {(a.date ?? '').slice(5)} <span style={{ fontWeight: 400, color: TEXT_MUTED }}>{a.dow}</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: m.color, lineHeight: 1.5 }}>
                    {m.text}
                    {a.teacherName && <span style={{ color: TEXT_MUTED }}> · {a.teacherName} 선생님</span>}
                  </div>
                  {/* ★ 보강에서 무엇을 했는지는 **보여 주지 않는다**(원장님 2026-10-10).
                      보강은 학생이 빠진 정규수업에 대한 서비스라, 내용은 담당 강사가 본다.
                      여기엔 상태(「10/10 보강 완료」)만 남긴다.
                      예전 스냅샷에는 내용이 남아 있을 수 있어 화면에서도 막는다. */}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── 추가수업·대체수업 ───────────────────────────────────────────────
          추가수업은 **그 달 약정 수업 횟수를 채우기 위한 의무수업**이다. 횟수가 모자라
          토요일에 한 번 더 나온 것이니 학부모님이 아셔야 한다(원장님 2026-10-10).
          결석과 짝이 없는 날도 있어서 결석·보강 칸에 끼우지 않고 따로 둔다. */}
      {extras.length > 0 && (
        <div style={{ borderRadius: 12, border: '1px solid #cfe3f5', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ background: '#F2F8FD', padding: '10px 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: NAVY }}>
              추가수업 {extras.length}회
            </div>
            <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 3, lineHeight: 1.6 }}>
              그 달 수업 횟수가 모자라 한 번 더 진행한 수업입니다. 「○월분」은 그 수업이 채우는 달이에요
              (지난달 횟수를 이번 달에 채우기도 합니다).
              {d.extraPlanned > 0 && ` (진행 ${d.extraDone}회 · 예정 ${d.extraPlanned}회)`}
            </div>
          </div>
          {extras.map((e: any, i: number) => {
            const label = e.classType === 'substitute' ? '대체수업' : '추가수업'
            const when = (e.date ?? '').slice(5)
            const dow = e.date
              ? ['일', '월', '화', '수', '목', '금', '토'][new Date(e.date + 'T00:00:00').getDay()]
              : ''
            const lesson = [
              e.lessonTextbook,
              e.lessonWorksheet
                ? `${e.lessonWorksheet}${e.lessonScore != null ? ` ${e.lessonScore}점` : ''}`
                : (e.lessonScore != null ? `${e.lessonScore}점` : null),
              e.lessonNote,
            ].filter(Boolean)
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 14px',
                borderTop: '1px solid #e4eef8', background: 'white',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: NAVY, width: 62, flexShrink: 0 }}>
                  {when} <span style={{ fontWeight: 400, color: TEXT_MUTED }}>{dow}</span>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: e.state === 'done' ? TEXT_BODY : ORANGE, lineHeight: 1.5 }}>
                    {label}
                    {/* 어느 달 횟수인지 — 수업한 달과 다를 수 있다.
                        대체수업은 옮겨 온 원래 수업일의 달로 센다(9/25 수업을 10/10에 하면 9월분). */}
                    {(() => {
                      const ym = e.classType === 'substitute'
                        ? String(e.originalDate ?? '').slice(0, 7)
                        : String(e.targetMonth ?? '').slice(0, 7)
                      const mm = Number(ym.slice(5, 7))
                      return mm ? <span style={{ color: NAVY, fontWeight: 600 }}>{' '}{mm}월분</span> : null
                    })()}
                    {e.time && ` ${e.time}`}
                    {e.hours ? ` · ${e.hours}시간` : ''}
                    {e.state === 'planned' && ' · 예정'}
                    {e.teacherName && <span style={{ color: TEXT_MUTED }}> · {e.teacherName} 선생님</span>}
                  </div>
                  {e.classType === 'substitute' && e.originalDate && (
                    <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 2 }}>
                      {e.originalDate.slice(5)} 수업을 이 날로 옮겼어요
                    </div>
                  )}
                  {lesson.length > 0 && (
                    <div style={{ fontSize: 10, color: TEXT_BODY, lineHeight: 1.6, marginTop: 3 }}>
                      {lesson.join(' · ')}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {months.length === 0 ? (
        <Empty text="최근 6개월 동안의 수업 기록이 없어요." />
      ) : (
        <MonthTabs uid="at" months={months} panels={months.map(panel)} />
      )}
      <div style={{ fontSize: 10, color: TEXT_MUTED, marginTop: 12, lineHeight: 1.6 }}>
        과제 달성률은 그날 수업에서 선생님이 확인한 과제 수행 정도입니다.
        보강 일정은 미리 말씀해 주시면 언제든 바꿔 드려요.
      </div>
    </Shell>
  )
}

/** 그날의 알림장 · 사진 */
function DailyNotice({ d, link }: { d: any; link: ReportLink }) {
  const notices: any[] = d.notices ?? []
  const dateLabel = d.sessionDate
    ? `${Number(String(d.sessionDate).slice(5, 7))}월 ${Number(String(d.sessionDate).slice(8, 10))}일 알림장`
    : '알림장'
  const progress: string[] = d.progress ?? []
  const homework: string[] = d.homework ?? []
  return (
    <Shell title={dateLabel} name={d.studentName} grade={d.studentGrade} period={d.sessionDate}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
        <Stat label="출결" value={d.attendance ?? '미기록'}
          color={d.attendance === '정시' ? NAVY : d.attendance === '지각' ? ORANGE
            : d.attendance === '결석' ? RED : isExamAbsence(d.attendance) ? '#7C3AED' : TEXT_MUTED} />
        <Stat label="과제 달성률" value={d.achievementPct != null ? `${d.achievementPct}%` : '-'}
          color={tierColor(d.achievementPct, 90, 70)} />
      </div>

      {progress.length > 0 && (
        <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>오늘 나간 진도</div>
          <div style={{ fontSize: 12, color: TEXT_BODY, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{progress.join('\n')}</div>
        </div>
      )}

      {homework.length > 0 && (
        <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 8 }}>다음 시간까지 과제</div>
          <div style={{ fontSize: 12, color: TEXT_BODY, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{homework.join('\n')}</div>
        </div>
      )}

      {notices.length === 0 && !d.memo ? (
        <Empty text="이 날은 따로 남긴 알림장이 없어요." />
      ) : (
        notices.map((n, i) => (
          <div key={i} style={{ background: ORANGE_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${ORANGE}`, marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: ORANGE_MID, fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>
              {n.teacherName ? `${n.teacherName} 선생님` : '선생님 알림장'}
            </div>
            <div style={{ fontSize: 12, color: ORANGE_DEEP, lineHeight: 1.8, whiteSpace: 'pre-line' }}>{n.content}</div>
            {/* 사진 — 알림톡 본문에는 실을 수 없어서 여기서 보여 준다 */}
            {(n.images ?? []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {n.images.map((u: string, j: number) => (
                  <a key={j} href={u} target="_blank" rel="noreferrer">
                    <img src={u} alt="" style={{ width: '100%', borderRadius: 10, border: `1px solid ${BORDER}`, display: 'block' }} />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {d.memo && (
        <div style={{ background: BOX_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${NAVY}`, marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: NAVY, fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>선생님 메모</div>
          <div style={{ fontSize: 12, color: TEXT_BODY, lineHeight: 1.7, whiteSpace: 'pre-line' }}>{d.memo}</div>
        </div>
      )}

      {d.makeupNote && (
        <div style={{ background: ORANGE_BG, borderRadius: 12, padding: '12px 14px', borderLeft: `3px solid ${ORANGE}` }}>
          <div style={{ fontSize: 9, color: ORANGE_MID, fontWeight: 500, letterSpacing: 1, marginBottom: 6 }}>보강</div>
          <div style={{ fontSize: 12, color: ORANGE_DEEP, lineHeight: 1.7 }}>{d.makeupNote}</div>
        </div>
      )}
    </Shell>
  )
}
