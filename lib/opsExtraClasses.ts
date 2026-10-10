// 수학OPS 의 추가수업·대체수업 기록을 읽어 온다. (보강은 lib/opsMakeups.ts)
//
// 왜 필요한가
//   추가수업은 **그 달 약정 수업 횟수를 채우기 위한 의무수업**이다. 횟수가 모자라서 토요일에
//   한 번 더 나온 것이니 학부모님이 아셔야 한다는 원장님 말씀(2026-10-10).
//   그런데 StudyCheck 는 OPS 의 makeups(보강)만 읽고 extra_classes 는 아예 안 읽었다.
//   OPS 에서 학습일지를 적어도 학부모 화면에는 아무것도 안 떴다.
//
// 두 DB 는 완전히 분리돼 있다. studycheck.students.ops_student_id → sumath-admin.students.id
// 로만 이어진다. 연결이 없는 학생은 조용히 건너뛴다.
import { createClient } from '@supabase/supabase-js'

/** 학부모 화면에 보여 줄 추가수업 한 건. */
export interface OpsExtraClass {
  /** 수업한 날 */
  date: string
  time: string | null
  /** done 진행 완료 · planned 앞으로 예정 */
  state: 'done' | 'planned'
  /** extra 추가수업(횟수 채우기) · substitute 대체수업(그날 수업을 다른 날로 옮긴 것) */
  classType: 'extra' | 'substitute'
  /** 대체수업일 때, 원래 수업이던 날 */
  originalDate: string | null
  /** 결석분 보강 성격으로 잡힌 경우의 그 결석일 */
  absentDate: string | null
  hours: number | null
  teacherName: string | null
  /** 그날 한 것 (OPS 「완료」 입력창에서 적는다) */
  lessonTextbook: string | null
  lessonWorksheet: string | null
  lessonScore: number | null
  lessonNote: string | null
}

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * OPS 학생 id 들의 추가수업 기록을 가져온다.
 *
 * ★ OPS 를 못 읽어도 **던지지 않는다.** 곁들이는 정보 때문에 브리핑 전체가 못 나가면 안 된다.
 *   못 읽으면 빈 결과를 돌려준다 (opsMakeups 와 같은 규칙).
 */
export async function fetchOpsExtraClasses(opsStudentIds: string[], fromDate: string) {
  const out = new Map<string, OpsExtraClass[]>()
  const ids = [...new Set(opsStudentIds.filter(Boolean))]
  if (!ids.length) return out
  const db = opsClient()
  if (!db) return out

  try {
    const { data, error } = await db
      .from('extra_classes')
      .select('student_id, scheduled_date, scheduled_time, status, class_type, original_date, ' +
              'duration_hours, teacher_id, lesson_textbook, lesson_worksheet, lesson_score, lesson_note, ' +
              'absence:attendances!extra_classes_absence_id_fkey(absent_date)')
      .in('student_id', ids)
      .gte('scheduled_date', fromDate)
    if (error || !data) return out

    // 선생님 이름은 한 번에 읽는다(건마다 조인하면 느리다).
    const teacherIds = [...new Set(data.map((e: any) => e.teacher_id).filter(Boolean))]
    const nameBy = new Map<string, string>()
    if (teacherIds.length) {
      const { data: profs } = await db.from('profiles').select('id, name').in('id', teacherIds)
      for (const p of profs ?? []) nameBy.set((p as any).id, (p as any).name)
    }

    const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
    for (const e of data as any[]) {
      // 취소된 수업은 학부모에게 보여 줄 것이 없다.
      if (e.status === 'cancelled') continue
      const done = e.status === 'completed'
      // ★ 보강과 같은 규칙(원장님 2026-10-08): 날짜가 지났는데 완료 처리가 안 된 건은 숨긴다.
      //   그대로 두면 학부모 화면에 영원히 「예정」으로 남는다.
      if (!done && e.scheduled_date < today) continue

      const row: OpsExtraClass = {
        date: e.scheduled_date,
        time: (e.scheduled_time ?? null)?.toString().slice(0, 5) ?? null,
        state: done ? 'done' : 'planned',
        classType: e.class_type === 'substitute' ? 'substitute' : 'extra',
        originalDate: e.original_date ?? null,
        absentDate: e.absence?.absent_date ?? null,
        hours: e.duration_hours != null ? Number(e.duration_hours) : null,
        teacherName: nameBy.get(e.teacher_id) ?? null,
        lessonTextbook: e.lesson_textbook ?? null,
        lessonWorksheet: e.lesson_worksheet ?? null,
        lessonScore: e.lesson_score ?? null,
        lessonNote: e.lesson_note ?? null,
      }
      const list = out.get(e.student_id) ?? []
      list.push(row)
      out.set(e.student_id, list)
    }
    for (const list of out.values()) list.sort((a, b) => b.date.localeCompare(a.date))
  } catch {
    // 연동이 끊겨도 브리핑은 나가야 한다.
  }
  return out
}
