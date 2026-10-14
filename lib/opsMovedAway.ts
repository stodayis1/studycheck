// 「그날 수업을 다른 날로 옮긴 학생」을 수학OPS 에서 읽어 온다.
//
// 왜 필요한가 (원장님 2026-10-14)
//   대체수업을 등록하면 **원래 날짜는 수업이 없는 날**이 된다. 그런데 StudyCheck 는
//   시간표(요일)만 보고 그날 수업 목록을 만들기 때문에, 옮긴 학생이 그대로 떠 있었다.
//   선생님이 그걸 보고 결석을 누르면 오지도 않은 날에 결석이 찍힌다.
//
//   실제로 류연서 학생이 10/14 수업을 10/13 으로 옮겼는데, 10/14(수) 시간표가 살아 있어
//   화면에는 「오늘 수업」으로 남아 있었다. 9월 이후 등록된 대체수업 16건 중 13건이
//   원래 날짜에 빈 수업 행을 달고 있었다.
//
// 두 DB 는 분리돼 있다. studycheck.students.ops_student_id → sumath-admin.students.id.
// ★ OPS 를 못 읽어도 **던지지 않는다.** 못 읽으면 빈 결과다 — 곁들이는 정보 때문에
//   학습일지 화면이 통째로 죽으면 안 된다.
import { createClient } from '@supabase/supabase-js'

export interface MovedAway {
  /** StudyCheck 학생 id */
  studentId: string
  name: string
  /** 옮겨 간 날 */
  movedTo: string
  status: string | null
}

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * `date` 가 **원래 수업일**인 대체수업을 찾아, 그 학생들을 돌려준다.
 * 취소된 건은 뺀다 — 취소했으면 원래 날짜에 수업이 그대로 있는 것이다.
 */
export async function fetchMovedAway(
  db: { from: (t: string) => any },
  date: string,
): Promise<MovedAway[]> {
  const ops = opsClient()
  if (!ops) return []
  try {
    const { data: subs, error } = await ops.from('extra_classes')
      .select('student_id, scheduled_date, status')
      .eq('class_type', 'substitute').eq('original_date', date)
    if (error || !subs?.length) return []

    const live = subs.filter((s: any) => s.status !== 'cancelled' && s.status !== 'canceled')
    if (!live.length) return []

    const { data: stu } = await db.from('students')
      .select('id, name, ops_student_id')
      .in('ops_student_id', live.map((s: any) => s.student_id))
    const byOps = new Map((stu ?? []).map((s: any) => [s.ops_student_id, s]))

    const out: MovedAway[] = []
    for (const s of live) {
      const st: any = byOps.get(s.student_id)
      if (!st) continue          // 연결이 없는 학생은 조용히 건너뛴다
      out.push({ studentId: st.id, name: st.name, movedTo: s.scheduled_date, status: s.status ?? null })
    }
    return out
  } catch {
    return []
  }
}
