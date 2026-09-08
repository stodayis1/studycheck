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

// 각 스텝이 실제로 어떤 문제를 고르는지 말로 풀어 쓴 것 - 학생/학부모도 바로 이해할 수 있게
// "1~7, 9~12번 문제" 식으로 흩어진 문제번호를 나열하는 대신 이 규칙 문구 + 유형 번호로 대신한다.
export const SSENB_STEP_RULE_LABEL: Record<1 | 2 | 3 | 4, string> = {
  1: '유형별 대표문제만',
  2: '유형별 대표문제+다음문제',
  3: "'상' 난이도 제외 전체",
  4: '전체',
}

// 스텝 선택 문제들을 학생/학부모가 봐도 바로 알아볼 수 있게 요약한다.
// 문제 번호를 낱개로 나열하면(예: "1~20, 22~26, 28~34...") 무슨 뜻인지 알 수 없어서,
// 대신 "몇 번 유형까지" + 스텝 규칙 설명 + 페이지로 표현한다 - 쎈B 책 안에서 유형 번호는
// 문제들을 묶어서 보여주는 소제목이라 "유형 1~13"이라고 하면 책만 펴도 바로 찾을 수 있다.
export function formatSsenbStepSummary(step: 1 | 2 | 3 | 4, problems: SsenbProblem[]): string {
  const typeText = formatSsenbNoRanges(Array.from(new Set(problems.map((p) => p.type_no))))
  const pageText = formatSsenbPageRange(problems)
  return `${step}스텝(${SSENB_STEP_RULE_LABEL[step]}) · 유형 ${typeText} · ${problems.length}문항 · ${pageText}`
}

// 교과과정 개념(concepts 테이블)과 쎈B 소단원(ssenb_problem_map.sub_chapter_no) 사이의 매핑.
// 두 체계가 단원을 쪼개는 방식과 순서가 서로 달라서(예: 교과서 중단원 "닮음의 활용" 8개 개념이
// 쎈B에서는 소단원 6·7·8 세 곳에 흩어져 들어가고, 반대로 "도형의 닮음" 중단원 안의 넓이/부피비
// 개념 하나(24번)는 쎈B 소단원8(닮음의 활용)로 감) 중단원 단위 매칭으로는 부정확해서, 개념
// 하나하나(concept_order)를 쎈B 유형 제목과 대조해서 소단원 단위로 만든 매핑이다.
// 지금은 중2-2(쎈B 중등 수학 2-2)만 추출되어 있어 이 학년/학기만 채워둠 - 다른 학년/학기는 매핑이
// 없으면 빈 결과를 돌려줘서 조용히 아무 표시도 안 하도록(=아직 지원 안 함) 처리한다.
const SSENB_SUBCHAPTER_CONCEPT_ORDERS: Record<string, Record<number, number[]>> = {
  '중2__2': {
    1: [1, 2, 3, 4, 5],           // 삼각형의 성질(1) - 이등변삼각형 성질/조건, 직각삼각형 합동조건
    2: [6, 7, 8, 9, 10, 11],      // 삼각형의 성질(2) - 외심/내심
    3: [12, 13, 14],              // 평행사변형
    4: [15, 16, 17, 18, 19, 20],  // 여러 가지 사각형
    5: [21, 22, 23, 25, 26, 27],  // 도형의 닮음 - 닮은도형, 닮음의 성질, 삼각형 닮음조건
    6: [28, 29, 32],              // 평행선 사이의 선분의 길이의 비
    7: [30, 31, 33, 34, 35],      // 삼각형의 무게중심
    8: [24],                      // 닮음의 활용 - 닮은 도형의 넓이의 비와 부피의 비
    9: [36, 37, 38, 39, 40, 41],  // 피타고라스 정리
    10: [42, 43, 44, 45, 46, 47], // 경우의 수
    11: [48, 49, 50, 51, 52],     // 확률과 그 계산
  },
  // 중1-2(쎈B 중등 수학 1-2). 교과서 중단원 "Ⅰ.기본도형/1.기본도형"(개념 1~13)이 쎈B에서는
  // 소단원 01 기본 도형·02 위치 관계·03 평행선 세 곳으로 쪼개져 있어, 유형 제목과 대조해
  // 나눴다(1~6=점/선/각/맞꼭지각/수선 등 평면 기본 도형, 7~10=위치 관계, 11~13=평행선).
  // "Ⅳ.통계/1.대푯값"(개념45 대푯값)은 이 책에 대응하는 쎈B 유형이 없어(쎈B 1-2는 대푯값을
  // 다루지 않음) 자료의 정리(소단원10) 쪽에 임시로 묶어 뒀다 - 실제 문제 매칭은 없다.
  '중1__2': {
    1: [1, 2, 3, 4, 5, 6],                    // 기본 도형 - 점/선/면, 각, 맞꼭지각, 수선
    2: [7, 8, 9, 10],                         // 위치 관계
    3: [11, 12, 13],                          // 평행선 - 동위각/엇각, 평행선의 성질과 활용
    4: [14, 15, 16, 17, 18, 19, 20, 21, 22],  // 작도와 합동
    5: [23, 24, 25, 26, 27],                  // 다각형
    6: [28, 29, 30, 31, 32, 33],              // 원과 부채꼴
    7: [34, 35],                              // 다면체 - 다면체, 정다면체
    8: [36, 37, 38],                          // 회전체 - 회전체, 회전체의 성질, 전개도
    9: [39, 40, 41, 42, 43, 44],              // 입체도형의 겉넓이와 부피 - 기둥/뿔/구
    10: [45, 46, 47],                         // 자료의 정리 - (45 대푯값은 매칭되는 쎈B 유형 없음) 줄기와 잎 그림, 도수분포표/히스토그램/도수분포다각형
    11: [48],                                 // 자료의 해석 - 상대도수
  },
}

function gradeKeyOf(grade: string, semester: number) {
  return `${grade}__${semester}`
}

// 이 학년/학기에 쎈B 매핑이 있는지 여부
export function hasSsenbConceptMap(grade: string, semester: number): boolean {
  return !!SSENB_SUBCHAPTER_CONCEPT_ORDERS[gradeKeyOf(grade, semester)]
}

// 특정 개념(concept_order 하나)이 속하는 쎈B 소단원 번호. 매핑 없으면 null.
export function getSsenbSubChapterForConceptOrder(
  grade: string,
  semester: number,
  conceptOrder: number
): number | null {
  const map = SSENB_SUBCHAPTER_CONCEPT_ORDERS[gradeKeyOf(grade, semester)]
  if (!map) return null
  for (const [subNo, orders] of Object.entries(map)) {
    if (orders.includes(conceptOrder)) return Number(subNo)
  }
  return null
}

// 쎈B 소단원 번호 하나에 해당하는 이 학년/학기의 전체 concept_order 목록. 매핑 없으면 빈 배열.
export function getConceptOrdersForSsenbSubChapter(
  grade: string,
  semester: number,
  ssenbSubNo: number
): number[] {
  const map = SSENB_SUBCHAPTER_CONCEPT_ORDERS[gradeKeyOf(grade, semester)]
  return map?.[ssenbSubNo] ?? []
}

// 개념 목록(concept_order를 가진 것들)을 쎈B 소단원별로 묶어서, 각 소단원에 해당하는
// concept_order를 "1~5, 8" 식으로 압축한 결과를 돌려준다. 진도탭 미리보기에서 사용.
export function groupConceptOrdersBySsenbSubChapter(
  grade: string,
  semester: number,
  conceptOrders: number[]
): { ssenbSubNo: number; orderRangeText: string }[] {
  const bySub = new Map<number, number[]>()
  for (const co of conceptOrders) {
    const subNo = getSsenbSubChapterForConceptOrder(grade, semester, co)
    if (subNo == null) continue
    const arr = bySub.get(subNo) ?? []
    arr.push(co)
    bySub.set(subNo, arr)
  }
  return Array.from(bySub.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ssenbSubNo, orders]) => ({ ssenbSubNo, orderRangeText: formatSsenbNoRanges(orders) }))
}
