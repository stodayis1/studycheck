// 「그날 수업이 있어서 **일지를 써야 하는** 학생」을 고른다.
//
// 왜 필요한가 (원장님 2026-10-16)
//   미작성 판정이 수업 기록(class_sessions)을 훑고 있었다. 그런데 선생님이 아무것도
//   안 쓰면 그 행 자체가 안 생긴다. 그래서 **아무것도 안 쓴 사람이 목록에서 통째로
//   빠졌다.** 10/16 금요일 — 시간표상 수업이 있는 학생 135명 중 기록이 생긴 사람은
//   91명, 나머지 44명은 「모두 작성됐어요」 뒤에 숨어 있었다. 강사 알림 문자도 같은
//   함수를 쓰므로 그분들껜 알림이 안 갔다.
//
// 그래서 **시간표**를 기준으로 삼는다. 다만 시간표에 있다고 다 수업하는 것은 아니다:
//   · 공휴일·학원 휴원일 — 그날은 아무도 수업하지 않는다
//   · 대체수업으로 **다른 날로 옮긴** 학생 — 그날은 오지 않는다
//   · 휴원·퇴원 학생 — is_active 로 이미 걸러진다
import { fetchMovedAway } from './opsMovedAway'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export interface ExpectedResult {
  /** 그날 일지를 써야 하는 학생 id */
  ids: string[]
  /** 쉬는 날이면 그 이름 (공휴일·휴원일) */
  closed: string | null
  /** 대체수업으로 그날 빠진 학생 수 */
  movedAway: number
}

/**
 * @param db  스터디체크 클라이언트 (서비스롤이든 로그인 세션이든)
 */
export async function expectedStudentsOn(
  db: { from: (t: string) => any },
  date: string,
): Promise<ExpectedResult> {
  const dow = DOW[new Date(date + 'T00:00:00').getDay()]

  // 쉬는 날인가 — 공휴일(holidays)과 학원 휴원일(academy_closures) 둘 다 본다.
  const [{ data: hs }, { data: cs }] = await Promise.all([
    db.from('holidays').select('date, name').eq('date', date),
    db.from('academy_closures').select('date, memo').eq('date', date),
  ])
  const closed = (hs ?? [])[0]?.name ?? (cs ?? [])[0]?.memo ?? ((cs ?? []).length ? '학원 휴원일' : null)
  if (closed) return { ids: [], closed, movedAway: 0 }

  const [{ data: sch }, { data: students }] = await Promise.all([
    db.from('schedules').select('student_id, is_active').eq('day_of_week', dow),
    db.from('students').select('id').eq('is_active', true),
  ])
  const live = new Set((students ?? []).map((s: any) => s.id))
  let ids = [...new Set((sch ?? [])
    .filter((x: any) => x.is_active !== false)
    .map((x: any) => x.student_id)
    .filter((id: string) => live.has(id)))] as string[]

  // 대체수업으로 그날 수업을 다른 날로 옮긴 학생은 뺀다.
  const moved = await fetchMovedAway(db, date)
  const movedIds = new Set(moved.map((m) => m.studentId))
  const before = ids.length
  ids = ids.filter((id) => !movedIds.has(id))

  return { ids, closed: null, movedAway: before - ids.length }
}
