// 수학OPS 의 보강 기록을 읽어 온다.
//
// 왜 필요한가
//   보강은 OPS 에서 관리한다(결석 → 슬롯 예약 → 보강출석). 그런데 StudyCheck 는 그걸 안 읽고
//   learning_notes.makeup_note **글 한 줄**만 보고 있었다. 그 결과 학부모 화면에
//   「보강 기록 없음」이 떴다 — 보강을 안 한 게 아니라 StudyCheck 가 몰랐던 것이다.
//   2026-10-08 확인: OPS 에 보강 완료(attended)가 136건 있는데 StudyCheck 의 makeup_note 는 58건뿐.
//   실제로 이로운 학생 8/3 결석은 8/29 에 보강을 받았는데 화면엔 「보강 기록 없음」으로 떴다.
//
// 두 DB 는 완전히 분리돼 있다. studycheck.students.ops_student_id → sumath-admin.students.id
// 로만 이어진다(재원생 185명 중 184명 연결됨). 연결이 없는 학생은 조용히 건너뛴다.
import { createClient } from '@supabase/supabase-js'

/** 학부모 화면에 보여 줄 보강 한 건. */
export interface OpsMakeup {
  /** 결석한 날 (이것으로 StudyCheck 의 결석 줄과 짝짓는다) */
  absentDate: string | null
  /** 보강 날짜·시각 */
  makeupDate: string | null
  makeupTime: string | null
  /** done 보강 완료 · planned 앞으로 예정 · noshow 보강에도 결석 · waiting 날짜 미정 · cancelled 취소 */
  state: 'done' | 'planned' | 'noshow' | 'waiting' | 'cancelled'
  teacherName: string | null
  /** 그날 보강에서 한 것 (OPS 「보강완료」 입력창에서 적는다) */
  lessonTextbook: string | null
  lessonWorksheet: string | null
  lessonScore: number | null
  lessonNote: string | null
}

const STATE: Record<string, OpsMakeup['state']> = {
  attended: 'done',
  booked: 'planned',
  absent: 'noshow',
  pending: 'waiting',
  cancelled: 'cancelled',
}

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * OPS 학생 id 들의 보강 기록을 가져온다.
 *
 * ★ OPS 를 못 읽어도 **던지지 않는다.** 보강은 곁들이는 정보인데 그것 때문에
 *   브리핑 전체가 못 나가면 안 된다. 못 읽으면 빈 결과를 돌려준다.
 */
export async function fetchOpsMakeups(opsStudentIds: string[], fromDate: string) {
  const out = new Map<string, OpsMakeup[]>()
  const ids = [...new Set(opsStudentIds.filter(Boolean))]
  if (!ids.length) return out
  const db = opsClient()
  if (!db) return out

  try {
    const { data, error } = await db
      .from('makeups')
      .select('student_id, booking_status, custom_date, custom_time, teacher_id, ' +
              'lesson_textbook, lesson_worksheet, lesson_score, lesson_note, ' +
              'attendance:attendances(absent_date), slot:makeup_slots(slot_date, slot_time, teacher_id)')
      .in('student_id', ids)
    if (error || !data) return out

    // 선생님 이름은 따로 한 번에 읽는다(보강 건마다 조인하면 느리다).
    const teacherIds = [...new Set(data.flatMap((m: any) =>
      [m.teacher_id, m.slot?.teacher_id].filter(Boolean)))]
    const nameBy = new Map<string, string>()
    if (teacherIds.length) {
      const { data: profs } = await db.from('profiles').select('id, name').in('id', teacherIds)
      for (const p of profs ?? []) nameBy.set((p as any).id, (p as any).name)
    }

    const today = new Date().toISOString().slice(0, 10)
    for (const m of data as any[]) {
      const makeupDate: string | null = m.slot?.slot_date ?? m.custom_date ?? null
      const absentDate: string | null = m.attendance?.absent_date ?? null
      let state = STATE[m.booking_status] ?? 'waiting'

      // ★ 원장님 지시(2026-10-08): "날짜 지난 것 중에 완료/결석 처리 안 된 건 그냥 보이지 않게."
      //   지난 예약인데 아직 booked 인 건이 10건 있었다(가장 오래된 것이 6/27).
      //   그대로 두면 학부모 화면에 영원히 「예정」으로 남는다.
      if (state === 'planned' && makeupDate && makeupDate < today) continue
      // 취소된 건은 학부모에게 보여 줄 것이 없다.
      if (state === 'cancelled') continue
      // 결석일을 모르면 어느 날 결석의 보강인지 짝지을 수가 없다.
      if (!absentDate || absentDate < fromDate) continue

      const teacherName = nameBy.get(m.teacher_id) ?? nameBy.get(m.slot?.teacher_id) ?? null
      const row: OpsMakeup = {
        absentDate,
        makeupDate,
        makeupTime: (m.slot?.slot_time ?? m.custom_time ?? null)?.toString().slice(0, 5) ?? null,
        state,
        teacherName,
        lessonTextbook: m.lesson_textbook ?? null,
        lessonWorksheet: m.lesson_worksheet ?? null,
        lessonScore: m.lesson_score ?? null,
        lessonNote: m.lesson_note ?? null,
      }
      const list = out.get(m.student_id) ?? []
      list.push(row)
      out.set(m.student_id, list)
    }
    // 같은 날 결석에 보강이 여러 번 잡힌 경우, 완료된 것을 앞에 둔다.
    const rank = { done: 0, planned: 1, noshow: 2, waiting: 3, cancelled: 4 }
    for (const list of out.values()) {
      list.sort((a, b) => rank[a.state] - rank[b.state] || (a.makeupDate ?? '').localeCompare(b.makeupDate ?? ''))
    }
  } catch {
    // 연동이 끊겨도 브리핑은 나가야 한다.
  }
  return out
}
