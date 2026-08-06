// 대시보드(강사/학부모/학생)에 공지사항을 몇 개까지 보여줄지 정하는 공통 규칙.
// 요구사항: 기본은 최신 2개, 다만 "중요" 표시된 공지가 있으면 그걸 우선으로 보여주되 전체 최대 3개까지만.
// 나머지는 공지사항 전체 목록 화면에 들어가서 봄 (여기서는 "이번에 화면에 띄울 것"만 골라줌).
export interface AnnouncementForDisplay {
  id: string
  created_at: string
  is_important?: boolean
}

export function pickDisplayAnnouncements<T extends AnnouncementForDisplay>(all: T[]): T[] {
  const sorted = [...all].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const important = sorted.filter((a) => a.is_important)

  if (important.length === 0) {
    return sorted.slice(0, 2)
  }

  // 중요 공지를 최대 2개까지 우선 포함하고, 남는 자리를 최신 공지로 채워 전체 최대 3개
  const picked: T[] = []
  const pickedIds = new Set<string>()
  for (const a of important) {
    if (picked.length >= 2) break
    picked.push(a)
    pickedIds.add(a.id)
  }
  for (const a of sorted) {
    if (picked.length >= 3) break
    if (pickedIds.has(a.id)) continue
    picked.push(a)
    pickedIds.add(a.id)
  }
  return picked.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3)
}
