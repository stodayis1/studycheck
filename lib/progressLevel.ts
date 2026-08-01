// 진도 회독수(몇 회독째인지) 계산 공통 로직
// - 과정관리(curriculum) 진도표와 진도 일괄입력(bulk-progress) 양쪽에서 똑같이 사용해야
//   두 화면에 서로 다른 회독수가 표시되는 불일치가 생기지 않는다.
//
// 규칙:
// - 회독수는 "학생 + 학년(grade) + 학기(semester)" 하나의 묶음 안에서, 그 묶음에 배정된
//   교재(연산서 제외)를 스터디체크에 기록된 순서(assigned_at) 그대로 늘어놓고 1, 2, 3... 순번을 매긴다.
//   교재 종류는 상관없이 그냥 기록된 순서대로만 매긴다 (개념서를 두 권 배정했으면 1회독, 2회독,
//   유형서만 단독으로 배정했어도 그게 1회독). 3회독이 상한이 아니라 계속 늘어날 수 있다.

export interface TextbookForLevel {
  id: string
  textbook_type: string
  assigned_at?: string | null
  created_at?: string | null
}

function sortByAssignedOrder(list: TextbookForLevel[]): TextbookForLevel[] {
  return [...list].sort((a, b) => {
    const at = a.assigned_at ? new Date(a.assigned_at).getTime() : (a.created_at ? new Date(a.created_at).getTime() : 0)
    const bt = b.assigned_at ? new Date(b.assigned_at).getTime() : (b.created_at ? new Date(b.created_at).getTime() : 0)
    if (at !== bt) return at - bt
    return a.id.localeCompare(b.id) // 배정 시각이 완전히 같을 때를 대비한 안정적인 동점 처리
  })
}

// textbooksInGroup: 반드시 "학생 1명 + 학년 1개 + 학기 1개" 안의 교재만, 연산서는 제외하고 넘겨야 함
// (호출하는 쪽에서 필터링해서 넘긴다)
export function computeTextbookLevels(textbooksInGroup: TextbookForLevel[]): Map<string, number> {
  const sorted = sortByAssignedOrder(textbooksInGroup)
  const levels = new Map<string, number>()
  sorted.forEach((tb, i) => levels.set(tb.id, i + 1))
  return levels
}
