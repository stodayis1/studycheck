import { createClient } from '@supabase/supabase-js'

// 카카오톡 인앱 브라우저에서 클라이언트 fetch가 먹통이 되는 경우가 있어서
// (링크는 오는데 눌러보면 빈 화면) 서버에서 미리 데이터를 읽어 HTML에 담아 보내도록 변경.
// 이러면 인앱 브라우저의 JS 제약과 상관없이 화면이 바로 보인다.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

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
  }
  ai_comment: string | null
  created_at: string
}

export default async function PublicReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data, error } = await supabase.from('report_links').select('*').eq('token', token).single()
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
    const scoreColor = dd.worksheetScore == null ? '#9FE1CB' : dd.worksheetScore >= 85 ? '#9FE1CB' : dd.worksheetScore >= 70 ? '#FAEEDA' : '#F5C4B3'
    const dateLabel = `${Number(dd.sessionDate.slice(5, 7))}월 ${Number(dd.sessionDate.slice(8, 10))}일`
    const hwParts = [dd.hwTextbookName, dd.hwTextbookPage, dd.hwWorksheetRange].filter(Boolean)
    return (
      <div className="min-h-screen py-8 px-4" style={{ background: '#f5f5f5', fontFamily: 'Pretendard, sans-serif' }}>
        <div className="max-w-md mx-auto">
          <div style={{ background: '#0f3460', borderRadius: 20, padding: 28, color: 'white' }}>
            <div style={{ fontSize: 10, color: '#9FE1CB', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
              수학의지혜 · STUDY CHECK
            </div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{dd.studentName}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2, marginBottom: 20 }}>
              {dd.studentGrade} · {dateLabel} 학습 안내
            </div>
            <div style={{ height: 1, background: '#9FE1CB', marginBottom: 20, opacity: 0.4 }} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)' }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>출결</div>
                <div style={{ fontSize: 16, fontWeight: 900 }}>{dd.attendance}</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)' }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>지난 학습지</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: scoreColor }}>{dd.worksheetScore != null ? `${dd.worksheetScore}점` : '-'}</div>
                {(dd.worksheetUnit || dd.worksheetLevel) && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
                    {[dd.worksheetUnit, dd.worksheetLevel].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
            </div>

            {dd.achievementText && (
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>과제 달성률</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.9)' }}>{dd.achievementText}</div>
              </div>
            )}

            {dd.progressContent && (
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>오늘 진도</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>{dd.progressContent}</div>
              </div>
            )}

            {dd.dailyTestScore != null && (
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>데일리테스트</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
                  {dd.dailyTestUnit ? `${dd.dailyTestUnit} · ` : ''}{dd.dailyTestScore}점
                </div>
              </div>
            )}

            {hwParts.length > 0 && (
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>오늘의 과제 (다음 시간까지)</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{hwParts.join('\n')}</div>
              </div>
            )}

            {dd.memo && (
              <div style={{ background: 'rgba(159,225,203,0.1)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.3)' }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>메모</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7 }}>{dd.memo}</div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>수학의지혜 학원</div>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{dd.sessionDate}</div>
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
        <div style={{ background: '#0f3460', borderRadius: 20, padding: 28, color: 'white' }}>
          {/* 헤더 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontSize: 10, color: '#9FE1CB', fontWeight: 700, letterSpacing: 2, marginBottom: 4 }}>
                수학의지혜 · {isQuarterly ? 'QUARTERLY REPORT' : 'MONTHLY REPORT'}
              </div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>{d.studentName}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{d.studentGrade}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{link.period_label}</div>
            </div>
          </div>
          <div style={{ height: 1, background: '#9FE1CB', marginBottom: 20 }} />

          {/* 출결 + 과제 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)' }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>출결 현황</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 4 }}>{d.totalSessions}<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 2 }}>회</span></div>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#9FE1CB' }}>정시 {d.attendance.정시}</span>
                <span style={{ fontSize: 10, color: '#FAEEDA' }}>지각 {d.attendance.지각}</span>
                <span style={{ fontSize: 10, color: '#F5C4B3' }}>결석 {d.attendance.결석}</span>
              </div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)' }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>과제 달성률</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>{d.hwRate}<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginLeft: 1 }}>%</span></div>
              <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                <div style={{ height: 4, borderRadius: 4, width: `${d.hwRate}%`, background: d.hwRate >= 80 ? '#9FE1CB' : d.hwRate >= 60 ? '#FAEEDA' : '#F5C4B3' }} />
              </div>
            </div>
          </div>

          {/* 출결 상세 (결석일 표시) */}
          {d.attendanceDetail && d.attendanceDetail.length > 0 && (() => {
            const absentDates = d.attendanceDetail.filter(a => a.status === '결석')
            return (
              <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
                <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>수업 일정</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {d.attendanceDetail.map((a, i) => {
                    const isAbsent = a.status === '결석'
                    const isLate = a.status === '지각'
                    const noEntry = a.status === '미입력'
                    return (
                      <div key={i} title={`${a.date} (${a.dow}) · ${a.status}`}
                        style={{
                          minWidth: 34, textAlign: 'center', borderRadius: 8, padding: '4px 5px',
                          background: isAbsent ? 'rgba(245,196,179,0.25)' : noEntry ? 'rgba(255,255,255,0.04)' : 'rgba(159,225,203,0.12)',
                          border: isAbsent ? '1px solid #F5C4B3' : '1px solid rgba(255,255,255,0.08)',
                        }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: isAbsent ? '#F5C4B3' : isLate ? '#FAEEDA' : noEntry ? 'rgba(255,255,255,0.3)' : '#9FE1CB' }}>
                          {Number(a.date.slice(5,7))}/{Number(a.date.slice(8,10))}
                        </div>
                        <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{a.dow}</div>
                      </div>
                    )
                  })}
                </div>
                {absentDates.length > 0 && (
                  <div style={{ marginTop: 10, fontSize: 10, color: '#F5C4B3', lineHeight: 1.6 }}>
                    결석 {absentDates.length}회 · {absentDates.map(a => `${Number(a.date.slice(5,7))}/${Number(a.date.slice(8,10))}(${a.dow})`).join(', ')}
                  </div>
                )}
              </div>
            )
          })()}

          {/* 데일리테스트 - 고등부는 학습지보다 매 수업 데일리테스트가 핵심이라 별도 섹션으로 표시 */}
          {d.dailyTests && d.dailyTests.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>데일리테스트</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, textAlign: 'center', marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900 }}>{d.dailyTests.length}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>응시 횟수</div>
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: d.avgDailyTest != null ? (d.avgDailyTest >= 85 ? '#9FE1CB' : d.avgDailyTest >= 70 ? '#FAEEDA' : '#F5C4B3') : 'rgba(255,255,255,0.4)' }}>
                    {d.avgDailyTest ?? '-'}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>평균점수</div>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {d.dailyTests.map((t, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {Number(t.date.slice(5,7))}/{Number(t.date.slice(8,10))}{t.unit ? ` · ${t.unit}` : ''}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, flexShrink: 0, color: t.score >= 85 ? '#9FE1CB' : t.score >= 70 ? '#FAEEDA' : '#F5C4B3' }}>
                      {t.score}점
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 학습지 */}
          {d.periodCount > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>학습지 현황</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                <div><div style={{ fontSize: 18, fontWeight: 900 }}>{d.periodCount}</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>총 학습지</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 900, color: d.avgScore != null ? (d.avgScore >= 85 ? '#9FE1CB' : d.avgScore >= 70 ? '#FAEEDA' : '#F5C4B3') : 'rgba(255,255,255,0.4)' }}>{d.avgScore ?? '-'}</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>평균점수</div></div>
                <div><div style={{ fontSize: 18, fontWeight: 900, color: d.passRate >= 80 ? '#9FE1CB' : '#FAEEDA' }}>{d.passRate}%</div><div style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>통과율</div></div>
              </div>
              {d.worksheetDetail?.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {d.worksheetDetail.map((w: any, i: number) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.75)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {w.unit} · {w.level}레벨{w.isSimilar ? ' (오답유사)' : ''}
                      </span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: w.score != null ? (w.score >= 85 ? '#9FE1CB' : w.score >= 70 ? '#FAEEDA' : '#F5C4B3') : 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
                        {w.score != null ? `${w.score}점` : w.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 교재 진도 - 기록이 있는 학년/학기만, 회차 + 진행률로 압축해서 보여줌 */}
          {((d.curriculumProgress?.length ?? 0) > 0 || d.calcProgress.length > 0) && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>교재 진도</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(d.curriculumProgress ?? []).map((g, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{g.grade} {g.semester}학기</span>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#085041', background: '#9FE1CB', borderRadius: 8, padding: '1px 6px' }}>{g.round}회독</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: g.rate >= 80 ? '#9FE1CB' : '#FAEEDA', marginLeft: 'auto' }}>{g.rate}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                      <div style={{ height: 4, borderRadius: 4, width: `${g.rate}%`, background: g.rate >= 80 ? '#9FE1CB' : '#FAEEDA' }} />
                    </div>
                  </div>
                ))}
                {d.calcProgress.map((tb, i) => (
                  <div key={`c${i}`} style={{ borderTop: i === 0 && (d.curriculumProgress?.length ?? 0) > 0 ? '1px solid rgba(255,255,255,0.1)' : undefined, paddingTop: i === 0 && (d.curriculumProgress?.length ?? 0) > 0 ? 8 : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: '#5b21b6', background: '#ede9fe', borderRadius: 8, padding: '1px 6px' }}>연산서</span>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{tb.name}{tb.grade ? ` · ${tb.grade}${tb.semester ? ` ${tb.semester}학기` : ''}` : ''}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#c4b5fd', marginLeft: 'auto' }}>{tb.percent}%</span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                      <div style={{ height: 4, borderRadius: 4, width: `${tb.percent}%`, background: '#c4b5fd' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 평가 */}
          {d.exams.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>평가 성적</div>
              {d.exams.map((e: any) => {
                const pct = e.total_score > 0 ? Math.round(e.score / e.total_score * 100) : null
                return (
                  <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>
                      {[e.exam_type, e.title, e.unit, e.unit_name].filter(Boolean).join(' · ')}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: pct != null ? (pct >= 85 ? '#9FE1CB' : pct >= 70 ? '#FAEEDA' : '#F5C4B3') : 'rgba(255,255,255,0.4)' }}>
                      {e.score != null ? `${e.score}/${e.total_score} (${pct}%)` : '미채점'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* 한 줄 평 */}
          {link.ai_comment && (
            <div style={{ background: 'rgba(159,225,203,0.1)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.3)', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>선생님 코멘트</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', lineHeight: 1.7 }}>{link.ai_comment}</div>
            </div>
          )}

          {/* 푸터 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>수학의지혜 학원</div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{link.period_start} ~ {link.period_end}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
