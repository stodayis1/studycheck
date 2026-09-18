// 과정(학년·학기) 표기를 한 곳에서 다룬다.
// 중등은 '중1-1'처럼 학기까지 쓰고, 고등은 과목명 자체가 과정이라 학기를 쓰지 않는다.
// (DB에는 고등도 semester=1로 자리만 채워 넣는다)

export type Course = { grade: string; semester: number; label: string; level: '중등' | '고등'; types?: number; problems?: number }

export function isHighSchool(grade: string) {
  return !grade.startsWith('중') && !grade.startsWith('초')
}

export function courseKey(grade: string, semester: number | string) {
  return `${grade}-${semester}`
}

export function courseLabel(grade: string, semester: number | string) {
  return isHighSchool(grade) ? grade : `${grade}-${semester}`
}

export function courseGroup(grade: string): '중등' | '고등' {
  return isHighSchool(grade) ? '고등' : '중등'
}
