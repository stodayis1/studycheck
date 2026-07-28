'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface ReportLink {
  id: string
  student_id: string
  report_type: 'monthly' | 'quarterly'
  period_label: string
  period_start: string
  period_end: string
  data: {
    totalSessions: number
    attendance: { 정시: number; 지각: number; 결석: number }
    hwRate: number
    avgScore: number | null
    passRate: number
    periodCount: number
    worksheetDetail?: { unit: string; level: number; score: number | null; status: string; isSimilar: boolean; assignedAt: string }[]
    tbProgress: { name: string; type: string; rate: number; completed?: boolean }[]
    calcProgress: { name: string; percent: number }[]
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

export default function PublicReportPage() {
  const params = useParams()
  const token = params?.token as string
  const [link, setLink] = useState<ReportLink | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) return
    supabase.from('report_links').select('*').eq('token', token).single().then(({ data, error }) => {
      if (error || !data) { setNotFound(true); setLoading(false); return }
      setLink(data as ReportLink)
      setLoading(false)
    })
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f5f5f5' }}>
        <span className="w-8 h-8 border-2 border-[#9FE1CB]/40 border-t-[#9FE1CB] rounded-full animate-spin" />
      </div>
    )
  }

  if (notFound || !link) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2 px-6 text-center" style={{ background: '#f5f5f5' }}>
        <p className="text-lg font-bold text-gray-700">리포트를 찾을 수 없어요</p>
        <p className="text-sm text-gray-400">링크가 만료되었거나 잘못된 주소예요.</p>
      </div>
    )
  }

  const d = link.data
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

          {/* 교재 진도 */}
          {(d.tbProgress.length > 0 || d.calcProgress.length > 0) && (
            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '12px 14px', border: '1px solid rgba(159,225,203,0.2)', marginBottom: 12 }}>
              <div style={{ fontSize: 9, color: '#9FE1CB', fontWeight: 700, letterSpacing: 1, marginBottom: 10 }}>교재 진도</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {d.tbProgress.map((tb, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{tb.name}</span>
                      {tb.completed ? (
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#0f3460', background: '#9FE1CB', borderRadius: 8, padding: '1px 6px' }}>완료</span>
                      ) : (
                        <span style={{ fontSize: 10, fontWeight: 700, color: tb.rate >= 80 ? '#9FE1CB' : '#FAEEDA' }}>{tb.rate}%</span>
                      )}
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
                      <div style={{ height: 4, borderRadius: 4, width: `${tb.rate}%`, background: tb.completed ? '#9FE1CB' : tb.rate >= 80 ? '#9FE1CB' : '#FAEEDA' }} />
                    </div>
                  </div>
                ))}
                {d.calcProgress.map((tb, i) => (
                  <div key={`c${i}`}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)' }}>{tb.name} <span style={{ color: '#c4b5fd', fontSize: 9 }}>연산</span></span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#c4b5fd' }}>{tb.percent}%</span>
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
