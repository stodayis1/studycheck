// 카톡 브리핑 버튼 뒤 세 화면에 넣을 값을 **그때 값으로 떠 둔다**(report_links.data).
// 페이지가 DB 를 더 읽지 않으니, 링크를 주워도 살아 있는 자료나 남의 자녀로 넘어갈 수 없다.
//
// ★ 발송 라우트와 미리보기 스크립트가 **이 함수 하나**를 같이 쓴다.
//   따로 두면 "미리보기에선 멀쩡했는데 실제로 간 건 달랐다" 가 된다.
import { SupabaseClient } from '@supabase/supabase-js'
import { fbImages, hwLines } from './briefing.ts'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 버튼 뒤에서 보여 줄 세 가지를 그때 값으로 떠 둔다. */
export async function snapshots(db: SupabaseClient, student: any, date: string, ses: any, note: any, fbs: any[]) {
  const sixMonthsAgo = new Date(Date.parse(date) - 183 * 86400_000).toISOString().slice(0, 10)
  const threeMonthsAgo = new Date(Date.parse(date) - 92 * 86400_000).toISOString().slice(0, 10)

  const [{ data: ws }, { data: pastSessions }] = await Promise.all([
    db.from('student_worksheets')
      .select('unit, unit_name, current_level, score, status, worksheet_type, assigned_at, submitted_at, semester, grade_level')
      .eq('student_id', student.id).gte('assigned_at', sixMonthsAgo)
      .order('assigned_at', { ascending: false }).limit(200),
    db.from('class_sessions')
      .select('id, session_date, progress_content')
      .eq('student_id', student.id).gte('session_date', threeMonthsAgo).lte('session_date', date)
      .order('session_date', { ascending: false }).limit(200),
  ])

  const sessionIds = (pastSessions ?? []).map((s: any) => s.id)
  const { data: pastNotes } = sessionIds.length
    ? await db.from('learning_notes')
        .select('session_id, attendance, achievement_pct, worksheet_score, worksheet_submitted, workbook_done')
        .in('session_id', sessionIds)
    : { data: [] as any[] }
  const noteBy = new Map((pastNotes ?? []).map((n: any) => [n.session_id, n]))

  // ── 레벨학습지 점수 현황 ────────────────────────────────────────────────
  // ★ status='passed' 는 「합격」이 아니라 「처리 완료」다. 전체 3,466건 중 513건이
  //   70점 미만인데도 passed 였다. 이걸 통과로 세면 평균 60점인 학생에게
  //   「통과율 97%」가 찍힌다(미리보기에서 실제로 그랬다).
  //   진짜 통과 규칙은 docs/초등레벨학습지.md:
  //     통과 = 그 단원(학년·학기·단원)에서 **가장 최근에 채점한 본 학습지(main)가 70점 이상**
  const wsRows = (ws ?? []).map((w: any) => ({
    date: (w.submitted_at ?? w.assigned_at ?? '').slice(0, 10),
    unit: w.unit_name || w.unit || '-',
    level: w.current_level ?? null,
    score: w.score ?? null,
    scoredYet: w.score != null,
    isRetry: w.worksheet_type === 'similar' || w.worksheet_type === 'twin',
    unitKey: [w.grade_level ?? '', w.semester ?? '', w.unit ?? w.unit_name ?? ''].join('|'),
    isMain: w.worksheet_type === 'main',
    at: w.submitted_at ?? w.assigned_at ?? '',
  }))

  // 단원마다 가장 최근에 채점한 본 학습지 하나만 남겨 70점으로 가른다.
  const latestMain = new Map<string, { score: number; at: string }>()
  for (const r of wsRows) {
    if (!r.isMain || r.score == null) continue
    const prev = latestMain.get(r.unitKey)
    if (!prev || r.at > prev.at) latestMain.set(r.unitKey, { score: r.score, at: r.at })
  }
  const unitsJudged = [...latestMain.values()]
  const unitsPassed = unitsJudged.filter((u) => u.score >= 70).length

  const scored = wsRows.filter((r) => r.score != null)
  const worksheetSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    periodLabel: `${sixMonthsAgo} ~ ${date}`,
    rows: wsRows,
    count: wsRows.length,
    scoredCount: scored.length,
    avgScore: scored.length ? Math.round(scored.reduce((a, r) => a + (r.score as number), 0) / scored.length) : null,
    unitsJudged: unitsJudged.length,
    unitsPassed,
  }

  // ── 출결현황 및 과제달성률 현황 ─────────────────────────────────────────
  const attRows = (pastSessions ?? []).map((s: any) => {
    const n: any = noteBy.get(s.id)
    const pct = n?.achievement_pct ?? (n?.workbook_done ? 100 : n?.worksheet_submitted ? 70 : null)
    return {
      date: s.session_date,
      dow: DOW[new Date(s.session_date + 'T00:00:00').getDay()],
      attendance: n?.attendance ?? null,
      pct,
      worksheetScore: n?.worksheet_score ?? null,
    }
  })
  const counted = attRows.filter((r) => r.attendance)
  const tally = (k: string) => counted.filter((r) => r.attendance === k).length
  const pcts = attRows.map((r) => r.pct).filter((p): p is number => p != null)
  const attendanceSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    periodLabel: `${threeMonthsAgo} ~ ${date}`,
    rows: attRows,
    total: counted.length,
    onTime: tally('정시'),
    late: tally('지각'),
    absent: tally('결석'),
    onTimeRate: counted.length ? Math.round((tally('정시') / counted.length) * 100) : null,
    avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
  }

  // ── 그날의 알림장·사진 ──────────────────────────────────────────────────
  const noticeSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    sessionDate: date,
    progress: [ses.progress_content, ses.today_textbook_name, ses.today_chapter]
      .map((t: any) => (t ?? '').trim())
      .filter((t: string, i: number, arr: string[]) => t && arr.indexOf(t) === i),
    homework: hwLines(ses),
    attendance: note?.attendance ?? null,
    achievementPct: note?.achievement_pct ?? null,
    memo: note?.memo ?? null,
    makeupNote: note?.makeup_note ?? null,
    notices: fbs.map((f: any) => ({
      teacherName: f.teacher_name ?? null,
      content: f.content ?? '',
      images: fbImages(f.ai_message),
    })),
  }

  return { worksheetSnapshot, attendanceSnapshot, noticeSnapshot }
}
