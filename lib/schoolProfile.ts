// 학교 자료집에 들어가는 값의 모양.
//
// 왜 jsonb 인가 — 학교마다 편제가 다르다. 어떤 학교는 2학년에 「대수·미적분Ⅰ」이 공통이고,
// 어떤 학교는 전부 선택이다. 칸을 미리 못 정하므로 모양만 여기서 맞춰 둔다.
// 표(school_profiles)에 넣는 쪽(scripts/)과 그리는 쪽(app/teacher/schools)이 이 파일을 함께 본다.

/** 한 학기에 듣는 과목 한 개 */
export type MathTerm = {
  term: string          // '1학기' | '2학기' | '연간'
  subject: string       // '공통수학1'
  units?: number        // 4 (단위/학점). 없으면 안 적는다.
}

/** 고르는 과목 묶음 — 「독서·확률과 통계·미적분·영어 독해와 작문 중 택3」 */
export type MathPick = {
  label: string         // '택3' | '탐구 선택(택4)'
  term?: string         // '1학기' — 학기가 갈리면 적는다
  options: string[]     // ['확률과 통계(3)', '미적분(3)', …]
  note?: string
}

export type MathYear = {
  grade: string         // '1학년'
  revision?: string     // '2022 개정' — 학년마다 다를 수 있어 학년에 붙인다
  terms: MathTerm[]     // 전원 같이 듣는 과목
  picks?: MathPick[]    // 고르는 과목
  note?: string         // 한 줄 설명
}

export type ExamRound = {
  label: string         // '1학기 1차'
  dates: string         // '4월 28일 ~ 5월 1일'
  note?: string         // '3학년 미실시'
}

export type ExamCalendar = {
  rounds?: ExamRound[]
  mock?: string[]       // ['1·2학년 3/24, 6/4, 9/2', '3학년 …']
  terms?: string[]      // ['여름방학 7/20~8/13', '2학기 개학 8/14']
  note?: string         // 수행평가 운영 방식 등
}

export type GradeStat = {
  grade: string         // '1학년'
  students: number
  classes: number
  perClass?: number
}

export type SchoolStats = {
  total?: number            // 전교생(특수학급 포함)
  classes?: number
  perClass?: number
  byGrade?: GradeStat[]
  special?: { students: number; classes: number; perClass?: number }
  teachers?: number         // 교원 총계(직위별 교원 현황)
  studentsPerTeacher?: number
  achievement?: Achievement // 교과별 학업성취사항(성취도)
}

/** 교과별 학업성취사항 한 줄 — 학교알리미 공시(보통 4월에 지난해 것이 올라온다) */
export type AchievementRow = {
  grade: string         // '1학년'
  term: string          // '1학기'
  subject: string       // '공통수학1'
  avg?: number          // 원점수 평균
  sd?: number           // 표준편차
  students?: number     // 수강자 수
  dist?: number[]       // 성취도 비율(%) — A~E 5칸. 3단계 과목은 A~C 3칸
}

export type Achievement = {
  year: number          // 어느 해 성적인가(공시 연도가 아니라 성적 연도)
  rows: AchievementRow[]
  note?: string
}

/** 「Wee클래스 설치」처럼 한 줄로 붙는 것 */
export type Highlight = { label: string; value: string }

export type Source = {
  name: string
  detail?: string
  url?: string          // 그 학교 학교알리미 화면 — Pneiss_b01_s0.do?HG_CD=<학교알리미 학교코드>
}

export type SchoolProfile = {
  id?: string
  school_name: string       // ★ normalizeSchool() 거친 짧은 이름
  school_level: '초' | '중' | '고'
  official_name?: string | null
  source_year: number
  region?: string | null
  office?: string | null
  foundation?: string | null
  school_type?: string | null
  coed?: string | null
  stats: SchoolStats
  math_curriculum: MathYear[]
  exam_calendar: ExamCalendar
  highlights: Highlight[]
  notes?: string | null
  sources: Source[]
  updated_at?: string
}

/** 「공통수학1」 + 4 → 「공통수학1 (4)」. 단위가 없으면 과목만. */
export function subjectLabel(t: MathTerm): string {
  return t.units ? `${t.subject} (${t.units})` : t.subject
}

export const SCHOOLINFO_HOME = 'https://www.schoolinfo.go.kr/'

/** 이 학교 학교알리미 화면. 주소를 아직 안 넣은 학교는 첫 화면으로 보낸다(거기서 학교 이름으로 검색). */
export function schoolinfoLink(p: SchoolProfile): { url: string; direct: boolean } {
  const url = p.sources?.find(s => s.url)?.url
  return url ? { url, direct: true } : { url: SCHOOLINFO_HOME, direct: false }
}
