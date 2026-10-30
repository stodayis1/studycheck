/**
 * 반배정 시간표가 학생을 **세로 칸에 채워 넣는** 규칙.
 *
 * 왜 따로 두나
 *   원장님 엑셀은 한 요일 안에서 학생마다 세로 칸(1, 2, 3 …)을 하나씩 쓰고, 2교시 수업은
 *   두 칸을 묶어 한 덩어리로 보였다. 그 모양을 그대로 내려면 「누구를 몇 번 칸에 둘지」를
 *   정해야 한다. 화면에서 바로 계산하면 맞는지 확인할 길이 없어, 규칙만 여기 한 벌 둔다
 *   (scripts/check-class-map.mjs 가 운영 데이터로 찍어 본다).
 *
 * 규칙 — 먼저 시작하는 학생부터, **비어 있는 첫 칸**에 넣는다.
 *   그러면 16시·18시·20시 학생이 1번 칸에 차례로 쌓인다. 원장님 엑셀의 월요일 1번 칸이
 *   「에스더 → 양진혁 → 임동규」였던 것과 같은 모양이다.
 *   칸 수는 그 요일에 **가장 많이 겹친 사람 수**와 같아진다(그보다 적을 수 없고, 이 방법은
 *   그보다 많이 쓰지 않는다 — 새 칸은 모든 칸이 차 있을 때만 만들기 때문이다).
 */

export type Span = { start: number; end: number }

/** '17:30:00' → 17.5 */
export function toHours(t: string): number {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}

export type Division = '초등부' | '중등부' | '고등부' | '그 외'

export function divisionOf(grade?: string | null): Division {
  const g = String(grade ?? '')
  if (g.startsWith('초')) return '초등부'
  if (g.startsWith('중')) return '중등부'
  if (g.startsWith('고')) return '고등부'
  return '그 외'
}

/**
 * 한 선생님·한 요일의 수업들을 세로 칸에 채운다.
 * `tieBreak` 는 시작·끝이 같을 때 줄을 세우는 기준(이름). 넣지 않으면 들어온 차례를 지킨다.
 */
export function packLanes<T extends Span>(
  items: T[],
  tieBreak?: (x: T) => string,
): { slots: (T & { lane: number })[]; lanes: number } {
  const sorted = [...items].sort((a, b) =>
    a.start - b.start || a.end - b.end ||
    (tieBreak ? tieBreak(a).localeCompare(tieBreak(b), 'ko') : 0))
  const laneEnd: number[] = []   // 칸마다 「지금까지 찬 끝 시각」
  const slots: (T & { lane: number })[] = []
  for (const it of sorted) {
    let lane = laneEnd.findIndex((e) => e <= it.start)
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(it.end) }
    else laneEnd[lane] = it.end
    slots.push({ ...it, lane })
  }
  return { slots, lanes: Math.max(1, laneEnd.length) }
}
