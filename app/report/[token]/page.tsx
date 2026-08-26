import { createClient } from '@supabase/supabase-js'

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
