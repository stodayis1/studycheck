// 쎈B(상업용 문제집) 오토스텝 공용 로직.
// 진도탭에서 개념(소단원)을 체크하면, 배정된 쎈B 교재의 스텝(1~4) 설정에 맞춰
// 자동으로 숙제 알림을 만들 때 학습일지(app/teacher/learning-notes)와
// 과제배부(app/teacher/assignments) 양쪽에서 같이 쓰는 계산 로직.

export interface SsenbProblem {
  id: string
  book_name: string
  chapter_no: number
  chapter_title: string
  sub_chapter_no: number
  sub_chapter_title: string
  type_no: number
  type_title: string
  local_no: number
  global_code: string
  difficulty: '대표' | '하' | '중' | '상'
  is_essay: boolean
  page: number
}

// 스텝별 문제 필터링: 1스텝=대표문제만, 2스텝=유형별 처음 두 문제, 3스텝=상 제외 전체, 4스텝=전체
export function getSsenbStepProblems(
  allProblemsInSubChapter: SsenbProblem[],
  step: 1 | 2 | 3 | 4
): SsenbProblem[] {
  const all = [...allProblemsInSubChapter].sort((a, b) => a.local_no - b.local_no)
  if (step === 4) return all
  if (step === 3) return all.filter((p) => p.difficulty !== '상')
  if (step === 1) return all.filter((p) => p.difficulty === '대표')
  // 2스텝: 유형별 처음 두 문제 (대표문제 + 바로 다음 문제)
  const byType = new Map<number, SsenbProblem[]>()
  for (const p of all) {
    const arr = byType.get(p.type_no) ?? []
    arr.push(p)
    byType.set(p.type_no, arr)
  }
  const result: SsenbProblem[] = []
  for (const arr of byType.values()) result.push(...arr.slice(0, 2))
  return result.sort((a, b) => a.local_no - b.local_no)
}

export function formatSsenbNoRanges(nums: number[]): string {
  if (nums.length === 0) return ''
  const sorted = [...nums].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const n = sorted[i]
    if (n === prev + 1) { prev = n; continue }
    ranges.push(start === prev ? `${start}` : `${start}~${prev}`)
    if (i < sorted.length) { start = n; prev = n }
  }
  return ranges.join(', ')
}

export function formatSsenbPageRange(problems: SsenbProblem[]): string {
  const pages = problems.map((p) => p.page)
  if (pages.length === 0) return ''
  const min = Math.min(...pages)
  const max = Math.max(...pages)
  return min === max ? `P.${min}` : `P.${min}~${max}`
}

// 스텝 선택 문제들을 "N스텝 · N문항 (1~5, 8) · P.61~70" 형식의 알림 텍스트로 요약
export function formatSsenbStepSummary(step: 1 | 2 | 3 | 4, problems: SsenbProblem[]): string {
  const noText = formatSsenbNoRanges(problems.map((p) => p.local_no))
  const pageText = formatSsenbPageRange(problems)
  return `${step}스텝 · ${problems.length}문항 (${noText}) · ${pageText}`
}
