// 진도 회독수(몇 회독째인지) 계산 공통 로직
// - 과정관리(curriculum) 진도표와 진도 일괄입력(bulk-progress) 양쪽에서 똑같이 사용해야
//   두 화면에 서로 다른 회독수가 표시되는 불일치가 생기지 않는다.
//
// 규칙:
// - 회독수는 "학생 + 학년(grade) + 학기(semester)" 하나의 묶음 안에서, 그 묶음에 배정된
//   교재(연산서 제외)를 배정일(assigned_at) 순서대로 늘어놓고 그 순번으로 정한다.
//   즉 같은 학기에 개념서를 두 권(재도전 등) 배정했으면 첫 권=1회독, 둘째 권=2회독, 그 다음
//   유형서=3회독, 심화서=4회독 처럼 계속 올라간다 (3회독이 최종 상한이 아니라 계속 늘어날 수 있음).
// - 다만 그 묶음의 "가장 먼저 배정된 교재"가 개념서가 아니면(예: 유형서부터 시작 = 타 학원에서
//   개념서를 이미 마치고 온 경우) 그 앞 회차들은 우리 시스템엔 기록이 없을 뿐 실제로는 있었다고 보고,
//   시작 회차를 그 교재 종류의 기본 회차(개념서=1, 유형서=2, 심화서=3)로 밀어서 계산한다.

export interface TextbookForLevel {
  id: string
  textbook_type: string
  assigned_at?: string | null
  created_at?: string | null
}

// 교재 종류별 "이게 가장 먼저(단독으로) 배정됐을 때"의 기본 회차
// (개념서 끝내고 유형서 들어가고 심화서까지 가는 순서를 그대로 회차로 매핑)
export const TEXTBOOK_TYPE_BASE_LEVEL: Record<string, number> = { '개념서': 1, '유형서': 2, '심화서': 3 }

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
  if (sorted.length === 0) return levels
  const baseLevel = TEXTBOOK_TYPE_BASE_LEVEL[sorted[0].textbook_type] ?? 1
  sorted.forEach((tb, i) => levels.set(tb.id, baseLevel + i))
  return levels
}

// 이 묶음에서 가장 먼저 배정된 교재의 시작 회차가 1보다 크면, 그만큼 "타학원완료"로 간주된 회차 수
// (예: 유형서부터 시작 = 1회차는 타학원완료, 2회차부터 우리 기록 시작)
export function getExternalCompletedRounds(textbooksInGroup: TextbookForLevel[]): number {
  const sorted = sortByAssignedOrder(textbooksInGroup)
  if (sorted.length === 0) return 0
  const baseLevel = TEXTBOOK_TYPE_BASE_LEVEL[sorted[0].textbook_type] ?? 1
  return baseLevel - 1
}
