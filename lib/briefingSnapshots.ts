// 카톡 브리핑 버튼 뒤 세 화면에 넣을 값을 **그때 값으로 떠 둔다**(report_links.data).
// 페이지가 DB 를 더 읽지 않으니, 링크를 주워도 살아 있는 자료나 남의 자녀로 넘어갈 수 없다.
//
// ★ 발송 라우트와 미리보기 스크립트가 **이 함수 하나**를 같이 쓴다.
//   따로 두면 "미리보기에선 멀쩡했는데 실제로 간 건 달랐다" 가 된다.
import { SupabaseClient } from '@supabase/supabase-js'
import { fbImages, hwLines } from './briefing.ts'
import { fetchOpsMakeups, type OpsMakeup } from './opsMakeups.ts'
import { fetchOpsExtraClasses } from './opsExtraClasses.ts'
import { isExamAbsence } from './attendance.ts'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

/** 버튼 뒤에서 보여 줄 세 가지를 그때 값으로 떠 둔다. */
/** 이 날짜 앞의 기록은 학부모 화면에 내보내지 않는다 (원장님 지시 2026-10-08). */
export const DATA_FROM = '2026-08-01'

export async function snapshots(db: SupabaseClient, student: any, date: string, ses: any, note: any, fbs: any[]) {
  const sixMonthsAgo = new Date(Date.parse(date) - 183 * 86400_000).toISOString().slice(0, 10)
  // 월별 탭으로 넘겨 보므로 출결도 학습지와 같은 6개월치를 담는다.
  // ★ 다만 2026-08-01 보다 앞은 보여 주지 않는다(원장님 지시 2026-10-08).
  //   그 전 보강 기록은 정리가 안 돼 있어서 학부모가 보면 오해한다.
  const attendFrom = sixMonthsAgo > DATA_FROM ? sixMonthsAgo : DATA_FROM

  const [{ data: ws }, { data: pastSessions }] = await Promise.all([
    db.from('student_worksheets')
      .select('unit, unit_name, current_level, score, status, worksheet_type, assigned_at, submitted_at, semester, grade_level')
      .eq('student_id', student.id).gte('assigned_at', sixMonthsAgo)
      .order('assigned_at', { ascending: false }).limit(200),
    db.from('class_sessions')
      .select('id, session_date, progress_content')
      .eq('student_id', student.id).gte('session_date', attendFrom).lte('session_date', date)
      .order('session_date', { ascending: false }).limit(200),
  ])

  // 보강은 OPS 가 들고 있다. 결석일로 짝지어 붙인다.
  const opsMakeups = student.ops_student_id
    ? (await fetchOpsMakeups([student.ops_student_id], attendFrom)).get(student.ops_student_id) ?? []
    : []
  const makeupBy = new Map<string, OpsMakeup>()
  for (const mk of opsMakeups) if (mk.absentDate && !makeupBy.has(mk.absentDate)) makeupBy.set(mk.absentDate, mk)

  // 추가수업도 OPS 가 들고 있다. 그 달 약정 수업 횟수를 채우려고 한 **의무수업**이라
  // 학부모님이 아셔야 한다(원장님 2026-10-10). 결석과 짝이 없는 날도 있어서 따로 모은다.
  const extraClasses = student.ops_student_id
    ? (await fetchOpsExtraClasses([student.ops_student_id], attendFrom)).get(student.ops_student_id) ?? []
    : []

  const sessionIds = (pastSessions ?? []).map((s: any) => s.id)
  const { data: pastNotes } = sessionIds.length
    ? await db.from('learning_notes')
        .select('session_id, attendance, achievement_pct, worksheet_score, worksheet_submitted, workbook_done, makeup_note')
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
      // 보강은 OPS 가 들고 있다(makeups). 예전처럼 learning_notes.makeup_note 글만 보면
      // 실제로 받은 보강이 「기록 없음」으로 나간다 — 2026-10-08 에 실제로 그랬다.
      makeupNote: (n?.makeup_note ?? '').trim() || null,
      makeup: makeupBy.get(s.session_date) ?? null,
    }
  })
  // ★ 시험기간 결석은 「안 와도 봐주는 날」이라 출석률 계산에서 빼야 한다.
  //   결석으로 세면 성실한 학생의 정시 출석률이 시험 때마다 떨어진다.
  const counted = attRows.filter((r) => r.attendance && !isExamAbsence(r.attendance))
  const tally = (k: string) => counted.filter((r) => r.attendance === k).length
  // ★ 시험기간 결석은 「안 와도 봐주는 날」이다. 분모에 남겨 두면 그날 과제를 안 낸 것이
  //   숙제를 빼먹은 것으로 잡혀서, 학교 시험 때마다 과제달성률이 멀쩡한 학생도 떨어진다.
  const pcts = counted.map((r) => r.pct).filter((p): p is number => p != null)

  // ★ "언제 결석했고 그 보강은 어떻게 됐나" 를 따로 뽑는다 —
  //   결석이 잦은 것을 학부모가 스스로 알아보실 수 있어야 한다는 것이 원장님 요구.
  //   전체 529건 결석 중 보강 기록이 있는 것은 57건뿐이라, 없는 것은 **없다고** 적는다.
  // ★ 보강 상태는 **OPS 기록을 먼저** 믿는다. OPS 에 없을 때만 예전 글(makeup_note)로 보조한다.
  //   OPS 에는 결석일 → 보강일 → 완료 여부 → (이제는) 누가 봤고 무엇을 했는지까지 있다.
  // 보강 안내도 진짜 결석만. 시험기간은 보강 대상이 아니다.
  const absences = attRows
    .filter((r) => r.attendance === '결석')
    .map((r) => {
      const mk = r.makeup
      if (mk) {
        return {
          date: r.date, dow: r.dow, state: mk.state,
          makeupDate: mk.makeupDate, makeupTime: mk.makeupTime,
          teacherName: mk.teacherName,
          lesson: [
            mk.lessonTextbook,
            [mk.lessonWorksheet, mk.lessonScore != null ? `${mk.lessonScore}점` : null].filter(Boolean).join(' '),
            mk.lessonNote,
          ].map((t) => (t ?? '').trim()).filter(Boolean),
          note: null as string | null,
        }
      }
      // OPS 에 아무것도 없을 때만 예전 글을 본다.
      const m = r.makeupNote ?? ''
      const state: 'done' | 'planned' | 'waiting' | 'none' =
        !m ? 'none'
          : /안 ?함|안함/.test(m) ? 'none'
            : /완료|했음|함$/.test(m) ? 'done'
              : /예정/.test(m) ? 'planned'
                : /안내|대기|선택/.test(m) ? 'waiting'
                  : 'waiting'
      return {
        date: r.date, dow: r.dow, state,
        makeupDate: null as string | null, makeupTime: null as string | null,
        teacherName: null as string | null,
        lesson: [] as string[], note: r.makeupNote,
      }
    })

  const attendanceSnapshot = {
    studentName: student.name,
    studentGrade: student.grade,
    periodLabel: `${attendFrom} ~ ${date}`,
    rows: attRows,
    total: counted.length,
    examDays: attRows.filter((r) => isExamAbsence(r.attendance)).length,
    onTime: tally('정시'),
    late: tally('지각'),
    absent: tally('결석'),
    onTimeRate: counted.length ? Math.round((tally('정시') / counted.length) * 100) : null,
    avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
    absences,
    makeupPlanned: absences.filter((a) => a.state === 'planned').length,
    makeupDone: absences.filter((a) => a.state === 'done').length,
    makeupNone: absences.filter((a) => a.state === 'none').length,
    makeupNoshow: absences.filter((a) => a.state === 'noshow').length,
    makeupWaiting: absences.filter((a) => a.state === 'waiting').length,
    extraClasses,
    extraDone: extraClasses.filter((e) => e.state === 'done').length,
    extraPlanned: extraClasses.filter((e) => e.state === 'planned').length,
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
