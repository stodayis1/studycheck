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

// ── 공지 대상 ────────────────────────────────────────────────────────────────
// 공지 하나를 선생님·학생·학부모가 모두 보던 것을 2026-11-13 에 갈랐다 (원장님).
// 「성적이 미진한 학생은 보강 잡아 알려 주세요」 같은 내부 지시가 학부모께 읽히면 안 된다.
//
// ★ 화면에서 거르는 것만으로는 막히지 않는다. 진짜 차단은 RLS 가 한다
//   (docs/sql/공지_대상구분과_확인버튼.sql — 학생·학부모는 teacher 공지를 아예 못 읽는다).
//   아래 거르개는 「직원 화면에서 가족용만 골라 보기」 같은 데 쓰는 보조다.
export type Audience = 'all' | 'teacher' | 'family'

export const AUDIENCE_LABEL: Record<Audience, string> = {
  all: '모두',
  teacher: '선생님만',
  family: '학생·학부모',
}

export const AUDIENCE_PICKS: { key: Audience; label: string; hint: string }[] = [
  { key: 'all', label: '모두', hint: '선생님·학생·학부모 모두에게 보여요' },
  { key: 'teacher', label: '선생님만', hint: '학생·학부모 화면에는 아예 안 보여요' },
  { key: 'family', label: '학생·학부모', hint: '선생님 화면에도 보이지만 가족용 글이에요' },
]

/** 학생·학부모 화면에 보여도 되는 공지인가. 칸이 없던 때의 글(undefined)은 모두에게 보이던 것이다. */
export function visibleToFamily(a: { audience?: string | null }): boolean {
  const v = a.audience ?? 'all'
  return v === 'all' || v === 'family'
}
