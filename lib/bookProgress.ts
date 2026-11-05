// 교재 진도율 — 월간보고서의 「진도」 칸에 쓴다.
//
// 왜 (원장님 2026-11-05)
//   「어차피 지금과 같이 진도를 저렇게 제목으로 나열해도 학부모님들은 모르시거든.
//    현재 진행하고 있는 교재의 진도율과 지금까지 완료한 교재정도만 01번 진도칸에
//    넣어주는게 더 좋을거 같아」
//
// ★ 셈법은 **선생님 보고서(app/teacher/reports)와 같아야 한다.** 두 곳이 다른 숫자를
//   내면 「선생님 화면은 75% 인데 집에 간 보고서는 60%」가 된다. 그래서 여기 한 곳에
//   적어 두고 양쪽이 같이 쓴다.
//     · 연산서  — 선생님이 적어 둔 달성률(progress_percent)
//     · 그 밖    — 그 학년·학기 **개념 개수 중 체크된 개수**
//
// ★ 모르면 **0% 가 아니라 「모름」(null)** 이다. 0% 는 「하나도 안 했다」는 말이라,
//   선생님이 아직 안 적었을 뿐인데 학부모님께 그렇게 나가면 안 된다.
//   (실측 2026-11-05: 진행 중 연산서 99권 중 13권은 달성률이 비어 있고,
//    진행 중 개념·유형·심화서 357권 중 7권은 그 학년 개념이 아직 안 들어와 있다.)

export type BookRow = {
  id?: string | null
  textbook_name?: string | null
  textbook_type?: string | null
  grade?: string | null
  semester?: number | null
  progress_percent?: number | null
  status?: string | null
  assigned_at?: string | null
}
export type ConceptRow = { id?: string | null; grade?: string | null; semester?: number | null }
export type CheckRow = { concept_id?: string | null; student_textbook_id?: string | null; check_count?: number | null }

/** 종류별 색·짧은 이름 — 선생님 보고서와 같은 색 */
export const BOOK_STYLE: Record<string, { short: string; color: string; fill: string }> = {
  개념서: { short: '개념', color: '#EF9F27', fill: '#FAEEDA' },
  유형서: { short: '유형', color: '#639922', fill: '#EAF3DE' },
  심화서: { short: '심화', color: '#dc2626', fill: '#fee2e2' },
  연산서: { short: '연산', color: '#7c3aed', fill: '#ede9fe' },
}
export const bookStyle = (type: any) => BOOK_STYLE[String(type ?? '')] ?? BOOK_STYLE['개념서']

const TYPE_ORDER: Record<string, number> = { 개념서: 0, 유형서: 1, 심화서: 2, 연산서: 3 }
export const bookOrder = (type: any) => TYPE_ORDER[String(type ?? '')] ?? 9

/**
 * 한 권의 진도율.
 *
 * @returns pct 0~100, **모르면 null**. by 는 어떻게 센 것인지(화면 안내 문구에 쓴다).
 */
export function bookRate(
  tb: BookRow,
  concepts: ConceptRow[],
  checks: CheckRow[],
): { pct: number | null; done: number | null; total: number | null; by: '달성률' | '개념' } {
  const type = String(tb?.textbook_type ?? '')

  // 연산서는 개념 체크를 안 한다 — 선생님이 적어 둔 달성률이 전부다.
  if (type === '연산서') {
    const p = tb?.progress_percent
    return { pct: p == null ? null : clamp(p), done: null, total: null, by: '달성률' }
  }

  // ★ 끝낸 교재는 100%. 마지막 개념까지 일일이 체크하지 않고 「교재 완료」를 누르는 일이 많다
  //   (선생님 화면도 같은 규칙).
  const 끝냄 = String(tb?.status ?? '') === 'completed'

  const grade = (tb?.grade ?? '').trim()
  if (!grade) return { pct: 끝냄 ? 100 : null, done: null, total: null, by: '개념' }
  // 학기가 적힌 교재는 그 학기 것만, 안 적힌 교재는 그 학년 전부를 센다.
  const mine = (concepts ?? []).filter((c) =>
    (c?.grade ?? '').trim() === grade && (tb?.semester == null || c?.semester === tb.semester))
  if (!mine.length) return { pct: 끝냄 ? 100 : null, done: null, total: null, by: '개념' }

  // 이 교재에서 체크한 것 + (개념서에 한해) 교재 구분이 없던 **예전 기록**도 센다.
  //   — 선생님 보고서와 같은 규칙. 빼면 예전 학생의 진도가 통째로 0% 가 된다.
  const ids = new Set(mine.map((c) => String(c?.id ?? '')))
  const done = new Set(
    (checks ?? [])
      .filter((p) => (p?.check_count ?? 0) >= 1 && ids.has(String(p?.concept_id ?? '')))
      .filter((p) => (tb?.id && p?.student_textbook_id === tb.id) || (!p?.student_textbook_id && type === '개념서'))
      .map((p) => String(p?.concept_id ?? '')),
  ).size

  return {
    pct: 끝냄 ? 100 : Math.round((done / mine.length) * 100),
    done: 끝냄 ? mine.length : done,
    total: mine.length,
    by: '개념',
  }
}

const clamp = (n: any) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)))
