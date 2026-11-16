// 기출(기출유사) 결과를 **그 시험 뒤 첫 수업 브리핑**의 「▶ 학습 결과」 칸에 한 줄로 싣는다.
//
// 왜 「뒤 첫 수업」이냐 (원장님 2026-11-16)
//   「11월 14일은 수업이 없으니까 바로 다음 제일 가까운 수업 학습브리핑에 넣어줘야지」.
//   토요 내신대비는 시간표에 없는 날이라 그날 수업일지가 아예 안 생긴다. 시험일로 보내려
//   하면 보낼 자리가 없다. 그래서 **그 뒤 첫 수업**에 실어 보낸다.
//
// 왜 「▶ 학습 결과」 칸이냐 (원장님 2026-11-16 「학습결과칸에」)
//   예전에는 이 결과를 그날 일지의 memo 에 적어 **알림장 칸**으로 보냈다
//   (「24문항 중 3개 틀렸습니다.」). 점수는 점수 자리에 읽혀야 한다.
//
// ★ 이 파일은 **DB 를 바꾸지 않는다.** 예전(lib/pastExamMemo.ts)은 memo 를 고쳤기 때문에
//   미리보기(dryRun)에서는 아예 돌리지 못했고, 그래서 **미리보기에 점수 줄이 안 보였다.**
//   읽기만 하면 미리보기와 실제가 같은 글을 만든다.
// ★ 「한 번만 간다」는 기록이 아니라 **날짜로** 정해진다 — 시험 뒤 첫 수업 하루만
//   조건이 참이다. 그다음 수업에는 사이에 수업이 있으므로 저절로 빠진다.
import type { SupabaseClient } from '@supabase/supabase-js'

/** 며칠 지난 것까지 싣나 — 그보다 오래된 것은 이제 와서 알려도 늦다. */
export const EXAM_PREP_MAX_DAYS = 21

/** 평가관리 진단평가 중 **기출**로 보는 제목. 「2025 저동중 기출유사」·「2025 고양중 기출」 */
export const EXAM_PREP_TITLE = /기출/

/** 「▶ 학습 결과」 한 줄이 될 값. */
export interface ExamPrepResult {
  제목: string
  /** 맞은 개수(또는 점수) */
  맞은: number
  /** 총 문항 — 100 이면 환산 없이 점수를 그대로 적는다 */
  총: number
  /** 시험일이 토요일인가 — 「[토요내신수업]」 앞말을 붙일지 가른다 */
  토요: boolean
}

export interface ExamPrepExam {
  title?: string | null
  score?: number | string | null
  total_score?: number | string | null
  exam_date?: string | null
}

/** 날짜 문자열에 날수를 더한다(시각 없이 날짜만 센다). */
function shift(date: string, days: number) {
  return new Date(Date.parse(date + 'T00:00:00Z') + days * 86400_000).toISOString().slice(0, 10)
}

/** 토요일인가 (date 는 'YYYY-MM-DD'). */
export function isSaturday(date: string) {
  return new Date(Date.parse(date + 'T00:00:00Z')).getUTCDay() === 6
}

/**
 * **한 학생**의 기출 결과 중 `date` 브리핑에 실을 것을 고른다.
 *
 * 발송(app/api/kakao-briefing)과 미리보기(app/teacher/learning-notes)가 **이 함수 하나**를
 * 써야 보이는 것과 나가는 것이 어긋나지 않는다.
 *
 * @param sessionDates 그 학생의 수업일. 시험일과 `date` **사이**에 하루라도 있으면
 *   그 수업 브리핑에 이미 실렸으므로 싣지 않는다.
 */
export function pickExamPrep(a: {
  date: string
  exams: ExamPrepExam[]
  sessionDates: string[]
}): ExamPrepResult[] {
  const from = shift(a.date, -EXAM_PREP_MAX_DAYS)
  const out: ExamPrepResult[] = []
  for (const e of a.exams) {
    const d = (e.exam_date ?? '').slice(0, 10)
    if (!d || d > a.date || d < from) continue
    if (!EXAM_PREP_TITLE.test(e.title ?? '')) continue
    const 맞은 = Number(e.score)
    const 총 = Number(e.total_score)
    if (!Number.isFinite(맞은) || !Number.isFinite(총) || 총 <= 0) continue
    // 시험 뒤 `date` 전에 수업이 있었으면 그때 실렸다.
    if (a.sessionDates.some((x) => x > d && x < a.date)) continue
    out.push({ 제목: String(e.title).trim(), 맞은, 총, 토요: isSaturday(d) })
  }
  return out
}

/**
 * `date` 에 발송할 학생들의 기출 결과를 학생별로 읽어 온다. 읽기만 한다.
 * in() 은 100개씩 끊는다 (학생이 100명 넘는 날이 있다).
 */
export async function loadExamPrepResults(
  db: SupabaseClient, date: string, studentIds: string[],
): Promise<Map<string, ExamPrepResult[]>> {
  const out = new Map<string, ExamPrepResult[]>()
  if (!studentIds.length) return out
  const from = shift(date, -EXAM_PREP_MAX_DAYS)

  const exams: any[] = []
  const sess: any[] = []
  for (let i = 0; i < studentIds.length; i += 100) {
    const chunk = studentIds.slice(i, i + 100)
    const [{ data: ex }, { data: cs }] = await Promise.all([
      db.from('exams')
        .select('student_id, title, score, total_score, exam_date')
        .in('student_id', chunk)
        .eq('exam_type', '진단평가').like('title', '%기출%')
        .gte('exam_date', from).lte('exam_date', date)
        .order('exam_date', { ascending: true }),
      // 시험일과 date 사이에 수업이 있었는지만 보면 되므로 그 창만 읽는다.
      db.from('class_sessions')
        .select('student_id, session_date')
        .in('student_id', chunk)
        .gt('session_date', from).lt('session_date', date)
        .order('session_date', { ascending: true }),
    ])
    exams.push(...(ex ?? []))
    sess.push(...(cs ?? []))
  }
  if (!exams.length) return out

  const datesBy = new Map<string, string[]>()
  for (const s of sess) {
    const list = datesBy.get(s.student_id) ?? []
    list.push(String(s.session_date).slice(0, 10))
    datesBy.set(s.student_id, list)
  }
  const examsBy = new Map<string, any[]>()
  for (const e of exams) {
    const list = examsBy.get(e.student_id) ?? []
    list.push(e)
    examsBy.set(e.student_id, list)
  }
  for (const [sid, list] of examsBy) {
    const picked = pickExamPrep({ date, exams: list, sessionDates: datesBy.get(sid) ?? [] })
    if (picked.length) out.set(sid, picked)
  }
  return out
}
