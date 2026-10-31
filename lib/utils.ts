import { unitNameBeside } from './worksheetTitle'
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

/**
 * 학습지 과제 범위를 **한 줄로** 줄인다 (원장님 2026-10-19).
 *
 *   「쌍둥이 학습지 과제를 내줬는데 소개념이 쫘르르르르륵 나열되고 있어.
 *     소개념이 있으면 중단원, 중단원이 쫘르르 나가면 대단원 단위로 제목을 바꿔써줘야 하는데」
 *
 * student_worksheets.unit_name 에는 소개념 이름이 통째로 들어 있는 경우가 있다.
 * 10/19 최다빈 학생은 **539자**였다 — 학부모 브리핑 한 통이 1,000자 한도인데 그 절반을
 * 학습지 한 줄이 먹었다. 읽히지도 않는다.
 *
 * 규칙 — 소개념이 둘 이상이면 올려 적는다.
 *   · 소개념이 한 중단원에 모여 있으면 → 그 **중단원** 이름
 *   · 한 대단원 안에서 중단원 두셋에 걸치면 → 「첫 중단원 ~ 끝 중단원」
 *   · 그보다 넓으면 → 괄호를 **통째로 버린다**(대단원 이름만 남는다)
 *
 * 왜 콤마로 안 자르나 — 「덧셈, 뺄셈, 곱셈, 나눗셈의 혼합 계산」처럼 **이름 안에 콤마가 있다.**
 * 그래서 교육과정(concepts)의 소개념 이름을 글 안에서 찾는 방식으로 센다.
 * 못 찾으면(이미 중단원 범위로 적혀 있는 경우 등) 적힌 글을 그대로 둔다.
 *
 * @param unit      대단원 (student_worksheets.unit)
 * @param unitName  괄호 안에 적혀 있던 글 (student_worksheets.unit_name)
 * @returns 괄호 안에 넣을 글. 빈 문자열이면 괄호를 아예 붙이지 않는다.
 */
export function formatWorksheetScope(
  concepts: { chapter: string; sub_chapter: string; concept_name: string; concept_order: number }[],
  unit: string,
  unitName: string | null | undefined,
): string {
  const raw = (unitName ?? '').trim()
  if (!raw) return ''
  // ★ 단원 칸과 **같은 말**이면 범위로 쓸 것이 없다 — 괄호에 같은 말을 또 넣으면
  //   「* 레벨학습지 (5-2) 3단원 * (* 레벨학습지 (5-2) 3단원 *)」가 되고, 그 줄이
  //   학부모 과제 칸으로 **그대로 나간다**(2026-10-30 에 13명이 그렇게 나갔다).
  //   전범위·복합처럼 쪼갤 것이 없는 제목은 두 칸에 같은 값이 들어온다.
  if (!unitNameBeside(unit, raw)) return ''
  // 대단원 이름이 여러 개 이어 붙은 경우(「Ⅰ 기본도형 + Ⅱ 평면도형」)도 각각 찾아 본다.
  const chapters = (unit ?? '').split('+').map((c) => c.trim()).filter(Boolean)
  const pool = concepts.filter((c) => chapters.some((ch) => ch === c.chapter))
  if (pool.length === 0) return raw

  const hit = pool.filter((c) => c.concept_name && raw.includes(c.concept_name))
  if (hit.length < 2) return raw          // 하나뿐이면 그대로 보여 주는 편이 친절하다

  const ordered = [...hit].sort((a, b) => a.concept_order - b.concept_order)
  const subs = [...new Set(ordered.map((c) => c.sub_chapter).filter(Boolean))]
  if (subs.length === 1) return subs[0]
  const chaps = [...new Set(ordered.map((c) => c.chapter))]
  if (chaps.length === 1 && subs.length <= 3) return `${subs[0]} ~ ${subs[subs.length - 1]}`
  return ''                                // 대단원 이름만 남긴다
}

/**
 * 교재 이름에 **학년·학기**를 붙인다 (원장님 2026-10-20).
 *
 *   「유형서, 개념서, 심화서 몇학년 몇학기인지 정보가 없어.
 *     학습브리핑에도 그렇고 보고서에도 그렇고 다 그렇더라고. 이거 학년학기 다 표기해줘」
 *
 * 같은 「쎈B」라도 중1-2 를 푸는 아이와 중2-2 를 푸는 아이가 다르다. 학부모님은 그걸
 * 모르신 채 「쎈B 45~50쪽」만 받으셨다. 한 학년 아래 교재를 푸는 아이도 있어서
 * **그 정보가 빠지면 오히려 오해를 산다.**
 *
 *   textbookLabel({textbook_name:'쎈B', grade:'중2', semester:2})          → '쎈B 중2-2'
 *   textbookLabel({...}, { withType: true })                               → '유형서 쎈B 중2-2'
 *
 * 학년이 비어 있으면 이름만 돌려준다 — 없는 것을 지어내지 않는다.
 */
export function textbookLabel(
  tb: { textbook_name?: string | null; textbook_type?: string | null; grade?: string | null; semester?: number | null } | null | undefined,
  opt?: { withType?: boolean },
): string {
  if (!tb) return ''
  const name = (tb.textbook_name ?? '').trim()
  if (!name) return ''
  const g = (tb.grade ?? '').trim()
  // ★ 학기를 붙이는 것은 **초·중등**뿐이다. 고등은 과정 이름 자체가 한 학기다
  //   (공통수학2 는 「공통수학2-1」이 아니다).
  const course = g ? (tb.semester && /^[초중]\d/.test(g) ? `${g}-${tb.semester}` : g) : ''
  return [opt?.withType ? (tb.textbook_type ?? '').trim() : '', name, course].filter(Boolean).join(' ')
}
