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
