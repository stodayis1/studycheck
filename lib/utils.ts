export function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)
  if (diffMin < 1) return "방금 전"
  if (diffMin < 60) return `${diffMin}분 전`
  if (diffHour < 24) return `${diffHour}시간 전`
  if (diffDay === 1) return "어제"
  if (diffDay < 7) return `${diffDay}일 전`
  return formatDate(isoString)
}
export function formatDate(isoString: string): string {
  const date = new Date(isoString)
  const days = ["일","월","화","수","목","금","토"]
  return `${date.getMonth()+1}월 ${date.getDate()}일 (${days[date.getDay()]})`
}
export function formatDateTime(isoString: string): string {
  const date = new Date(isoString)
  const pad = (n: number) => String(n).padStart(2,"0")
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
export function formatDueDate(isoString: string): { text: string; isOverdue: boolean; isUrgent: boolean } {
  const due = new Date(isoString)
  const now = new Date()
  const diffMs = due.getTime() - now.getTime()
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffHour / 24)
  const isOverdue = diffMs < 0
  const isUrgent = !isOverdue && diffHour < 24
  if (isOverdue) return { text: "마감 완료", isOverdue: true, isUrgent: false }
  if (diffHour < 1) return { text: "1시간 이내 마감", isOverdue: false, isUrgent: true }
  if (diffHour < 24) return { text: `${diffHour}시간 후 마감`, isOverdue: false, isUrgent: true }
  if (diffDay === 1) return { text: "내일 마감", isOverdue: false, isUrgent: false }
  return { text: `${diffDay}일 후 마감`, isOverdue: false, isUrgent: false }
}
export function cx(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ")
}

// 여러 개의 구간(대단원/중단원 등) 라벨을 "선택한 순서"가 아니라 "교육과정 순서" 기준으로
// 정렬한 뒤, 1개면 그대로, 여러 개면 "첫구간~마지막구간"으로 압축한다.
// (그래야 클릭한 순서와 무관하게 "1단원~3단원"처럼 자연스러운 범위로 나온다)
export function compressRangeLabels(orderedAllLabels: string[], selectedLabels: string[]): string {
  const selected = orderedAllLabels.filter((l) => selectedLabels.includes(l))
  if (selected.length === 0) return ''
  if (selected.length === 1) return selected[0]
  return `${selected[0]}~${selected[selected.length - 1]}`
}

// 소개념 단위로 고른 학습지/평가 범위를 사람이 읽기 좋은 형태로 압축한다.
// - 중단원 하나를 통째로 골랐으면: "1. 정수와 유리수"
// - 중단원 하나에서 소개념 일부만 골랐으면: "1. 정수와 유리수(소인수분해~최대공약수)"
// - 여러 중단원에 걸쳐 골랐으면: "1. 정수와 유리수~3. 정수의 곱셈과 나눗셈" (소개념 나열 없이 범위만)
export function formatConceptRangeLabel(
  scopeConcepts: { id: string; sub_chapter?: string | null; concept_name: string }[],
  selectedConceptIds: string[]
): string {
  const subOrder = [...new Set(scopeConcepts.map((c) => c.sub_chapter).filter((s): s is string => !!s))]
  const subsWithSelection = subOrder.filter((sub) =>
    scopeConcepts.some((c) => c.sub_chapter === sub && selectedConceptIds.includes(c.id))
  )
  if (subsWithSelection.length === 0) return ''
  if (subsWithSelection.length > 1) {
    return `${subsWithSelection[0]}~${subsWithSelection[subsWithSelection.length - 1]}`
  }
  const sub = subsWithSelection[0]
  const allInSub = scopeConcepts.filter((c) => c.sub_chapter === sub)
  const selectedInSub = allInSub.filter((c) => selectedConceptIds.includes(c.id))
  if (selectedInSub.length === allInSub.length) return sub
  if (selectedInSub.length === 1) return `${sub}(${selectedInSub[0].concept_name})`
  return `${sub}(${selectedInSub[0].concept_name}~${selectedInSub[selectedInSub.length - 1].concept_name})`
}

// 데일리테스트 범위 라벨 - 중단원 여러 개를 고르면 소개념까지 나열하지 않고
// 교육과정 순서 기준 "처음중단원 ~ 마지막중단원"으로, 중단원 하나만 고르면
// "{대단원 순번}-{중단원 순번}. {중단원명}" (예: 2-2. 직선의 방정식) 형태로 압축한다.
// 고등 과목은 대단원 텍스트에 번호가 없는 경우(도형의 방정식, 함수 등)가 많아서
// 텍스트에서 숫자를 뽑는 대신 커리큘럼 상 등장 순서로 번호를 매긴다.
export function formatDailyTestUnitLabel(
  gradeConcepts: { chapter: string; sub_chapter: string }[],
  chapter: string,
  subChapters: string[]
): string {
  if (!chapter) return ''
  const chapterOrder = [...new Set(gradeConcepts.map((c) => c.chapter))]
  const chapterIdx = chapterOrder.indexOf(chapter) + 1
  const subOrderAll = [...new Set(gradeConcepts.filter((c) => c.chapter === chapter).map((c) => c.sub_chapter))]
  if (subChapters.length === 0) return chapter
  const selectedOrdered = subOrderAll.filter((s) => subChapters.includes(s))
  if (selectedOrdered.length === 0) return chapter
  if (selectedOrdered.length === 1) {
    const subIdx = subOrderAll.indexOf(selectedOrdered[0]) + 1
    return `${chapterIdx}-${subIdx}. ${selectedOrdered[0]}`
  }
  return `${selectedOrdered[0]} ~ ${selectedOrdered[selectedOrdered.length - 1]}`
}

// Supabase는 기본적으로 한 번에 최대 1000행까지만 돌려준다.
// .limit()으로 숫자를 늘려도 데이터가 그 이상 쌓이면 다시 누락되므로,
// 테이블이 아무리 커져도 절대 누락 없이 전부 가져오도록 페이지 단위로 끝까지 순회한다.
export async function fetchAllRows<T = any>(
  buildQuery: () => any,
  pageSize = 1000
): Promise<T[]> {
  let from = 0
  let all: T[] = []
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) {
      console.error('fetchAllRows 오류:', error)
      break
    }
    if (!data || data.length === 0) break
    all = all.concat(data as T[])
    if (data.length < pageSize) break
    from += pageSize
  }
  return all
}
