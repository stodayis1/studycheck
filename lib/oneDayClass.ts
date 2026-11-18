/**
 * 「오늘 하루만 온 수업」 — 정규 시간표를 건드리지 않고 **그 날짜에만** 수업 한 칸을 더한다.
 *
 * 왜 필요한가 (원장님 2026-11-18)
 *   12월 진급 이동을 11/18 부터 조금씩 시작하면서, **시간표를 확정하기 전에** 학생이
 *   새 반에 와서 앉는 날이 생겼다. 서우현·강하라(중3)가 최대호 선생님 수요일 반에
 *   왔는데 두 학생의 시간표는 화·목·금뿐이라 **「오늘 수업」 목록에 안 떴다.**
 *   그렇다고 수요일을 시간표에 넣으면 매주 수요일마다 떠서, 확정 전에 또 고쳐야 한다.
 *   원장님: 「오늘 하루만」.
 *
 * 왜 `schedules` 에 날짜 칸을 더하지 않았나
 *   그 표를 읽는 화면이 여덟 곳이다(수업지도·반별·근무현황·학부모 화면 등). 날짜 칸을
 *   모르는 화면이 한 곳이라도 남으면 **하루치가 매주 뜬다** — 조용히 틀리는 쪽이다.
 *   표를 따로 두면 모르는 화면은 그냥 안 보여 준다(지금과 똑같다) — 안전한 쪽으로 틀린다.
 *
 * 쓰는 곳은 두 군데뿐이고, 둘 다 이 파일을 거친다 (베껴 쓰면 한쪽만 고쳐진다):
 *   · `lib/expectedToday.ts`              — 그날 일지를 써야 하는 학생 (미작성 알림 문자)
 *   · `app/teacher/learning-notes/page.tsx` — 오늘 수업 목록·시간표 그림
 * 학부모 브리핑은 **쓴 일지**(class_sessions)를 기준으로 나가므로 따로 손댈 것이 없다.
 */

export const ONE_DAY_TABLE = 'one_day_classes'

export interface OneDayClass {
  id: string
  student_id: string
  /** 'YYYY-MM-DD' — 이 날짜에만 유효하다 */
  class_date: string
  /** 'HH:MM:SS' */
  start_time: string
  /** 교시 (1 교시 = 60분) */
  periods: number
  created_by: string | null
  memo: string | null
}

/** 하루 수업 한 칸을 시간표 칸처럼 다룰 수 있게 만든 모양. */
export interface TodaySlot {
  start_time: string
  periods: number
  /** 하루 수업이면 그 줄의 id — 「오늘만 취소」에 쓴다. 정규 시간표면 없다. */
  oneDayId?: string
}

/**
 * 그날 한 학생의 수업 칸을 고른다. **정규 시간표가 먼저**다.
 *
 * ★ 둘 다 있으면 정규 시간표를 쓴다. 선생님이 실수로 하루 수업을 더해도 원래 시각이
 *   밀리지 않는다(시간표 그림이 엉뚱한 자리로 튀면 다른 반까지 못 읽게 된다).
 */
export function slotFor(
  studentId: string,
  todaySchedules: { student_id: string; start_time: string; periods: number }[],
  oneDay: OneDayClass[],
): TodaySlot | null {
  const sc = todaySchedules.find((x) => x.student_id === studentId)
  if (sc) return { start_time: sc.start_time, periods: Number(sc.periods) }
  // 같은 날 두 칸을 더했으면 **이른 시각**을 쓴다 — 일지는 한 장이다.
  const od = oneDay
    .filter((x) => x.student_id === studentId)
    .sort((a, b) => (a.start_time > b.start_time ? 1 : -1))[0]
  if (od) return { start_time: od.start_time, periods: Number(od.periods), oneDayId: od.id }
  return null
}

/**
 * 그 날짜의 하루 수업을 읽는다.
 *
 * ★ 못 읽으면 **null** 이다 — 빈 배열(「없다」)과 구분한다. 표를 만드는 SQL 을 아직 안 돌린
 *   사이에 앱이 먼저 배포될 수 있는데, 그때 화면이 「오늘 왔어요」 단추를 띄워 두면 선생님이
 *   눌러도 조용히 안 된다. null 이면 단추를 아예 안 보이게 한다.
 */
export async function fetchOneDayClasses(
  db: { from: (t: string) => any },
  date: string,
): Promise<OneDayClass[] | null> {
  try {
    const { data, error } = await db.from(ONE_DAY_TABLE).select('*').eq('class_date', date)
    if (error) return null
    return ((data ?? []) as any[]).map((r) => ({ ...r, periods: Number(r.periods) })) as OneDayClass[]
  } catch {
    return null
  }
}
