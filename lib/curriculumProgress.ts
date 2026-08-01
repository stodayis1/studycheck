// 월간/분기 보고서에 넣을 "교재 진도" 요약 계산.
// 학생 개인 화면(과정관리 진도표)과 다르게, 보고서는 학년+학기 단위로 묶어서
// 기록이 있는 과정만, 회차 하나로 압축해서 간결하게 보여준다.
// generate-report API(서버)와 teacher/reports 미리보기(클라이언트) 양쪽에서 이 함수를 그대로 써야
// 미리보기에서 본 내용과 실제 발송되는 보고서 내용이 서로 달라지는 불일치가 안 생긴다.

export interface ConceptLite {
  id: string
  grade: string
  semester: number
}

export interface ProgressCheckLite {
  concept_id: string
  check_count: number
}

export interface CurriculumProgressGroup {
  grade: string
  semester: number
  rate: number // 그 학기 개념 중 1회 이상 체크된 비율 (0~100)
  round: number // 그 학기 안에서 가장 높이 나간 회차
}

const GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중2모의고사', '중3', '공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하']

export function computeCurriculumProgressGroups(
  concepts: ConceptLite[],
  progressChecks: ProgressCheckLite[]
): CurriculumProgressGroup[] {
  // 같은 개념이 교재별로 여러 행에 나뉘어 체크됐을 수 있어서, 개념별로 가장 높은 회차만 남긴다
  const maxByConcept = new Map<string, number>()
  for (const p of progressChecks) {
    const cur = maxByConcept.get(p.concept_id) ?? 0
    if (p.check_count > cur) maxByConcept.set(p.concept_id, p.check_count)
  }
  const checkedConceptIds = new Set(
    [...maxByConcept.entries()].filter(([, count]) => count >= 1).map(([conceptId]) => conceptId)
  )
  if (checkedConceptIds.size === 0) return []

  const relevantConcepts = concepts.filter((c) => checkedConceptIds.has(c.id))
  const groupKeys = Array.from(new Set(relevantConcepts.map((c) => `${c.grade}__${c.semester}`)))

  return groupKeys
    .map((key) => {
      const [grade, semesterStr] = key.split('__')
      const semester = Number(semesterStr)
      const groupConcepts = concepts.filter((c) => c.grade === grade && c.semester === semester)
      const checkedInGroup = groupConcepts.filter((c) => checkedConceptIds.has(c.id))
      const rate = groupConcepts.length > 0 ? Math.round((checkedInGroup.length / groupConcepts.length) * 100) : 0
      const round = checkedInGroup.reduce((max, c) => Math.max(max, maxByConcept.get(c.id) ?? 0), 0)
      return { grade, semester, rate, round }
    })
    .sort((a, b) => {
      const gradeDiff = GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade)
      if (gradeDiff !== 0) return gradeDiff
      return a.semester - b.semester
    })
}
