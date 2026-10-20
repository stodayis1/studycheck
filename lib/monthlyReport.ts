// 월간 학습 리포트 — 한 학생의 한 달을 모아 **한 덩어리**로 만든다.
//
// 원장님 2026-10-20
//   리딩온어학원 리포트 양식을 보시고 「이런식으로 나도 학생들 한달에 한번 리포트를 만들건데」
//   「초등은 레벨학습지, 각 단원별 평가 기록 / 중등은 시험대비, 영상시청률, 오답 재도전 기록 /
//     고등도 시험대비, 영상시청 및 증명, 오답 재도전기록」
//
// ★ 만든 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
//   나중에 교재가 바뀌거나 학습지가 지워져도, 그때 보내 드린 리포트는 그대로 남아야 한다.
//   매일 브리핑의 버튼 뒤 화면도 같은 방식이다.
import { textbookLabel } from './utils'

export type Tier = '초등' | '중등' | '고등'

export interface MonthlyReport {
  student: { name: string; grade: string; school: string | null; teacher: string | null }
  tier: Tier
  period: { year: number; month: number; label: string; dateLabel: string }
  /** 수업·출결 */
  lessons: { total: number; onTime: number; late: number; absent: number; rate: number }
  /** 과제 */
  homework: { achievement: number | null; score: number | null }
  /** 진도 */
  textbooks: string[]
  progress: string[]
  /** 데일리테스트 */
  daily: { date: string; score: number }[]
  /** 초등 — 레벨학습지·단원별 평가 */
  worksheets: { unit: string; level: string; score: number | null; passed: boolean }[]
  worksheetSummary: { total: number; passed: number }
  /** 중·고 — 시험대비(이너프원) */
  examPrep: { unit: string; done: number; total: number; pct: number }[]
  /** 영상 */
  videos: { total: number; completed: number; avgPct: number | null }
  /** 고등 — 증명 제출 */
  proofs: number
  /** 오답 재도전 */
  retries: { kind: string; unit: string; score: number | null; passed: boolean }[]
  retrySummary: { total: number; passed: number }
  /** 영역별 성취도 */
  areas: { label: string; value: number }[]
  /** 선생님이 남긴 말 (알림장) */
  teacherNote: string | null
  /** 원장님이 직접 쓰시는 칸 — 비어 있으면 화면에서 기본 문장을 쓴다 */
  principalTalk: string | null
}

const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)

/** 학년 글자로 초·중·고를 가린다. 보여 줄 칸이 달라진다. */
export function tierOf(grade: string): Tier {
  if ((grade ?? '').startsWith('초')) return '초등'
  if ((grade ?? '').startsWith('중')) return '중등'
  return '고등'
}

const pad = (n: number) => String(n).padStart(2, '0')

export async function buildMonthlyReport(
  db: { from: (t: string) => any },
  studentId: string,
  year: number,
  month: number,
): Promise<MonthlyReport | null> {
  const from = `${year}-${pad(month)}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const to = `${year}-${pad(month)}-${pad(lastDay)}`

  const { data: st } = await db.from('students')
    .select('id, name, grade, school, teacher_name').eq('id', studentId).maybeSingle()
  if (!st) return null

  const { data: ses } = await db.from('class_sessions').select('*')
    .eq('student_id', studentId).gte('session_date', from).lte('session_date', to).order('session_date')
  const ids = (ses ?? []).map((x: any) => x.id)
  const noKey = '00000000-0000-0000-0000-000000000000'
  const [{ data: notes }, { data: ws }, { data: tb }, { data: ep }, { data: vw }, { data: pf }, { data: fb }] =
    await Promise.all([
      db.from('learning_notes').select('*').in('session_id', ids.length ? ids : [noKey]),
      db.from('student_worksheets').select('*').eq('student_id', studentId).order('assigned_at', { ascending: false }).limit(60),
      db.from('student_textbooks').select('*').eq('student_id', studentId).eq('status', 'assigned'),
      db.from('student_exam_prep').select('*, inner_enough(*)').eq('student_id', studentId).gte('exam_date', from),
      db.from('video_watch_logs').select('*').eq('student_id', studentId).in('session_id', ids.length ? ids : [noKey]),
      db.from('proof_submissions').select('id').eq('student_id', studentId).in('session_id', ids.length ? ids : [noKey]),
      db.from('feedbacks').select('content, created_at').eq('student_id', studentId)
        .gte('created_at', from).lte('created_at', `${to}T23:59:59+09:00`)
        .order('created_at', { ascending: false }).limit(1),
    ])

  const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
  let onTime = 0, late = 0, absent = 0
  const ach: number[] = [], sco: number[] = [], daily: MonthlyReport['daily'] = []
  for (const x of (ses ?? []) as any[]) {
    const n: any = noteBy.get(x.id)
    if (n) {
      if (n.attendance === '정시') onTime++
      else if (n.attendance === '지각') late++
      else if (String(n.attendance ?? '').includes('결석')) absent++
      if (n.achievement_pct != null) ach.push(n.achievement_pct)
      if (n.worksheet_score != null) sco.push(n.worksheet_score)
    }
    if (x.daily_test_score != null) daily.push({ date: String(x.session_date).slice(5), score: x.daily_test_score })
  }
  const total = (ses ?? []).length
  const rate = total ? Math.round(((onTime + late) / total) * 100) : 0

  // 이번 달에 손댄 학습지만 센다 (낸 날 기준, 없으면 받은 날)
  const 이번달ws = (ws ?? []).filter((w: any) => String(w.submitted_at ?? w.assigned_at ?? '') >= from)
  const main = 이번달ws.filter((w: any) => (w.worksheet_type ?? 'main') === 'main')
  const retriesRaw = 이번달ws.filter((w: any) => (w.worksheet_type ?? 'main') !== 'main')

  // 시험대비 — 단원별로 「끝낸 회차 / 배부된 회차」
  const byUnit = new Map<string, any[]>()
  for (const r of (ep ?? []) as any[]) {
    const u = r.inner_enough?.unit_name ?? '-'
    if (!byUnit.has(u)) byUnit.set(u, [])
    byUnit.get(u)!.push(r)
  }
  const examPrep = [...byUnit.entries()].map(([unit, rows]) => {
    const done = rows.filter((r) => (r.progress_step ?? 0) >= (r.total_steps ?? 1)).length
    return { unit, done, total: rows.length, pct: Math.round((done / rows.length) * 100) }
  })

  const watched = (vw ?? []).filter((v: any) => Number(v.coverage_pct ?? 0) > 0)
  const avgPct = avg(watched.map((v: any) => Math.round(Number(v.coverage_pct))))

  const areas: MonthlyReport['areas'] = [
    { label: '출결 성실도', value: rate },
    { label: '과제 달성률', value: avg(ach) ?? 0 },
    { label: '과제 성취도', value: avg(sco) ?? 0 },
  ]
  if (daily.length) areas.push({ label: '데일리테스트', value: avg(daily.map((d) => d.score))! })

  return {
    student: { name: st.name, grade: st.grade, school: st.school ?? null, teacher: (st.teacher_name ?? '').split(/[,/\s]+/)[0] || null },
    tier: tierOf(st.grade),
    period: { year, month, label: `${year}년 ${month}월`, dateLabel: `${year}. ${month}. ${lastDay}.` },
    lessons: { total, onTime, late, absent, rate },
    homework: { achievement: avg(ach), score: avg(sco) },
    textbooks: (tb ?? []).map((t: any) => textbookLabel(t, { withType: true })).filter(Boolean),
    progress: (ses ?? []).map((x: any) => x.progress_content).filter(Boolean).slice(0, 3),
    daily,
    worksheets: main.slice(0, 8).map((w: any) => ({
      unit: w.unit ?? '', level: String(w.current_level ?? ''), score: w.score ?? null, passed: w.status === 'passed',
    })),
    worksheetSummary: { total: main.length, passed: main.filter((w: any) => w.status === 'passed').length },
    examPrep: examPrep.slice(0, 6),
    videos: { total: (vw ?? []).length, completed: (vw ?? []).filter((v: any) => v.completed_at).length, avgPct },
    proofs: (pf ?? []).length,
    retries: retriesRaw.slice(0, 8).map((w: any) => ({
      kind: w.worksheet_type === 'twin' ? '쌍둥이' : '유사', unit: w.unit ?? '',
      score: w.score ?? null, passed: w.status === 'passed',
    })),
    retrySummary: { total: retriesRaw.length, passed: retriesRaw.filter((w: any) => w.status === 'passed').length },
    areas,
    teacherNote: (fb ?? [])[0]?.content ?? null,
    principalTalk: null,
  }
}
