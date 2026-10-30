/**
 * 학습일지 화면이 쓰는 **찾기 색인**.
 *
 * 왜 따로 두나 (원장님 2026-10-28 「현저히 느려지고, 버벅댄다는 이야기가 많네」)
 *   수업기록(class_sessions)과 알림장(learning_notes)은 7,900행이 넘고 계속 늘어난다.
 *   예전에는 찾을 때마다 배열을 처음부터 훑었다 — 칸반 세 칸이 같은 걸 또 걸러내고,
 *   카드 한 장마다 또 훑고, 「오늘 수업 없는 학생」 180장이 또 훑었다. 학습일지 칸에
 *   글자 하나 칠 때마다 그게 전부 다시 돌아서 **한 번 그리는 데 23ms**가 걸렸다.
 *   한 번 색인해 두면 0.03ms다.
 *
 * ★ 찾는 규칙을 예전과 **똑같이** 맞춰야 한다. 그래서 여기 한 벌만 두고 검사한다
 *   (scripts/check-note-index.mjs 가 운영 데이터로 예전 방식과 한 명씩 대조한다).
 *   - `.find()` 는 배열에서 **처음 만난 것**을 준다 → 색인도 먼저 들어온 것을 남긴다.
 *   - 날짜 비교는 `>` 만 쓴다 → 같은 날짜가 둘이면 먼저 들어온 쪽이 이긴다
 *     (예전 `filter().sort(desc)[0]` 과 같은 결과다. 자바스크립트 sort 는 순서를 지킨다).
 */

type SessionRow = { id: string; student_id: string; session_date: string }
type NoteRow = { session_id: string }

export type SessionIndex<S extends SessionRow> = {
  /** 학생 → 오늘 수업 */
  today: Map<string, S>
  /** 「학생id|날짜」 → 그 날 수업 */
  byStudentDate: Map<string, S>
  /** 학생 → 오늘보다 앞선 마지막 수업 */
  prev: Map<string, S>
  /** 학생 → 가장 최근 수업 (앞으로 잡힌 날짜도 포함 — 예전 방식과 같다) */
  latest: Map<string, S>
  /** 학생 → 수업기록 수 */
  count: Map<string, number>
}

export function buildSessionIndex<S extends SessionRow>(sessions: S[], todayStr: string): SessionIndex<S> {
  const today = new Map<string, S>()
  const byStudentDate = new Map<string, S>()
  const prev = new Map<string, S>()
  const latest = new Map<string, S>()
  const count = new Map<string, number>()
  for (const s of sessions) {
    const key = s.student_id + '|' + s.session_date
    if (!byStudentDate.has(key)) byStudentDate.set(key, s)
    count.set(s.student_id, (count.get(s.student_id) ?? 0) + 1)
    if (s.session_date === todayStr) {
      if (!today.has(s.student_id)) today.set(s.student_id, s)
    } else if (s.session_date < todayStr) {
      const p = prev.get(s.student_id)
      if (!p || s.session_date > p.session_date) prev.set(s.student_id, s)
    }
    const l = latest.get(s.student_id)
    if (!l || s.session_date > l.session_date) latest.set(s.student_id, s)
  }
  return { today, byStudentDate, prev, latest, count }
}

/** 알림장을 세션 id 로 찾는 색인. notes.find() 와 같은 규칙(처음 만난 것). */
export function buildNoteIndex<N extends NoteRow>(notes: N[]): Map<string, N> {
  const m = new Map<string, N>()
  for (const n of notes) if (!m.has(n.session_id)) m.set(n.session_id, n)
  return m
}
