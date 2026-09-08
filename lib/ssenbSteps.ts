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

// 교과과정 개념(concepts 테이블의 chapter/sub_chapter, 표준 교과서 단원 기준)과
// 쎈B 소단원(ssenb_problem_map.sub_chapter_no, 상업용 문제집 자체 단원 구성) 사이의 매핑.
// 두 체계의 단원 쪼개는 방식이 서로 달라서(예: 교과서는 "도형의 닮음"을 2개 중단원으로,
// 쎈B는 4개 소단원으로 쪼갬) 텍스트 단순 일치로는 매칭이 안 되어 직접 대조해서 만들었다.
// 지금은 중2-2(쎈B 중등 수학 2-2)만 추출되어 있어 이 학년/학기만 채워둠 - 다른 학년/학기는 매핑이 없으면
// 빈 배열을 돌려줘서 조용히 아무 표시도 안 하도록(=아직 지원 안 함) 처리한다.
const SSENB_SUBCHAPTER_MAP: Record<string, Record<string, number[]>> = {
  '중2__2': {
    'V. 도형의 성질__1. 삼각형의 성질': [1, 2],
    'V. 도형의 성질__2. 사각형의 성질': [3, 4],
    'VI. 도형의 닮음__1. 도형의 닮음': [5],
    'VI. 도형의 닮음__2. 닮음의 활용': [6, 7, 8],
    'VII. 피타고라스 정리__1. 피타고라스 정리와 활용': [9],
    'VIII. 확률__1. 경우의 수': [10],
    'VIII. 확률__2. 확률과 그 계산': [11],
  },
}

// 교과과정 개념의 (학년, 학기, 대단원, 중단원)을 받아 해당하는 쎈B sub_chapter_no 목록을 돌려준다.
// 매핑이 없으면(아직 지원 안 하는 학년/학기, 또는 매칭 안 되는 단원) 빈 배열.
export function getSsenbSubChaptersForConceptGroup(
  grade: string,
  semester: number,
  chapter: string,
  subChapter: string
): number[] {
  const gradeKey = `${grade}__${semester}`
  const map = SSENB_SUBCHAPTER_MAP[gradeKey]
  if (!map) return []
  return map[`${chapter}__${subChapter}`] ?? []
}
