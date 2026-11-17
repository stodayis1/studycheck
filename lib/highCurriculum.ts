// 고등 커리큘럼 화면(app/teacher/high-curriculum)의 처음 구성.
// 화면에서 고친 내용은 DB(curriculum_plan_docs)에 저장되고, 저장된 것이 없을 때만 아래 구성을 보여 준다.
// 반 이름·교재·단원을 바꾸려면 화면에서 고치면 된다. 여기는 「처음 구성으로 되돌리기」의 기준이다.

export type ClassKey = 'W' | 'I' | 'S' | 'E'
export type GradeKey = 'g1' | 'g2'

// style: book = 교재 이름(굵게, 반 색) · gate = 반편성 같은 구분 줄 · plain = 운영 규칙(적는 칸)
export interface PlanRow {
  id: string
  label: string
  sub?: string
  merged: boolean          // true = 네 반이 한 칸을 같이 씀
  lessons?: boolean        // true = 단원별 차시표에 이 단계의 차시 칸이 생긴다
  style: 'book' | 'gate' | 'plain'
  ph?: string
  all?: string
  W?: string; I?: string; S?: string; E?: string
}

export interface Course { key: string; name: string; units: [string, string[]][] }

export const CLASSES: { k: ClassKey; name: string; sub: string; color: string; bg: string }[] = [
  { k: 'W', name: 'W반', sub: '1반 (최상위)', color: '#2f4bb5', bg: '#e8edfb' },
  { k: 'I', name: 'I반', sub: '2반', color: '#0f8a7a', bg: '#e2f4f1' },
  { k: 'S', name: 'S반', sub: '3반', color: '#b4730c', bg: '#fbf1df' },
  { k: 'E', name: 'E반', sub: '4반 (기초 다지기)', color: '#c0436a', bg: '#fbe7ee' },
]

const GATE: PlanRow = { id: 'gate', label: '반편성', sub: '개념서 완강 후', merged: true, lessons: false, style: 'gate', all: '▼ 반편성 테스트 → W · I · S · E 4개 반으로 나눔 ▼' }

// 교재 흐름 아래에 붙는 운영 규칙 (이것도 화면에서 고치고 지울 수 있다)
const OPS_ROWS: PlanRow[] = [
  { id: 'daily', label: '데일리테스트', sub: '매 수업', merged: false, lessons: false, style: 'plain', ph: '예: 10문항' },
  { id: 'hw', label: '숙제 양', sub: '수업 1회당', merged: false, lessons: false, style: 'plain', ph: '예: 30문항' },
  { id: 'sat', label: '토요 테스트', sub: '매주 토요일', merged: true, lessons: false, style: 'plain', ph: '범위·문항 수·시간 (예: 그 주 진도 범위, 반별 교재 수준 20문항, 50분)' },
  // 수업 한 번 = 키움 2시간 + 채움 1시간. 채움을 먼저 듣고 들어오는 학생도 있어서
  // 채움은 그날 키움이 아니라 **지난 차시 복습**으로 짠다 (원장님 2026-11-17).
  { id: 'kium', label: '키움 2시간 구성', sub: '새 진도', merged: false, lessons: false, style: 'plain', ph: '예: 개념 40분 · 유형 60분 · 정리 20분' },
  { id: 'chaeum', label: '채움 1시간 구성', sub: '지난 차시 복습 · 순서 바뀌어도 됨', merged: false, lessons: false, style: 'plain', ph: '예: 지난 차시 대표문제 다시 풀기 20분 · 데일리테스트 15분 · 오답·숙제 점검 25분' },
]

export const EXAM_ROWS: PlanRow[] = [
  { id: 'x-start', label: '대비 시작', sub: '시험 몇 주 전', merged: true, style: 'plain', ph: '예: 시험 4주 전부터 정규 진도 멈춤' },
  { id: 'x-book', label: '교재 · 자료', merged: false, style: 'plain', ph: '예: 학교 부교재 + 기출' },
  { id: 'x-class', label: '수업 내용', merged: false, style: 'plain', ph: '예: 시험 범위 유형 총정리' },
  { id: 'x-test', label: '테스트', merged: false, style: 'plain', ph: '예: 매 수업 실전 20문항' },
  { id: 'x-school', label: '학교별 대비', sub: '기출 · 출제 경향', merged: true, style: 'plain', ph: '예: 학교별 기출 3개년, 서술형 따로 연습' },
  { id: 'x-final', label: '직전 대비', sub: '시험 직전 주', merged: true, style: 'plain', ph: '예: 직전 보강, 오답 재시험' },
]

export const GRADES: Record<GradeKey, { label: string; subjects: string; courses: Course[]; books: PlanRow[] }> = {
  g1: {
    label: '고1', subjects: '공통수학1 · 공통수학2',
    courses: [
      { key: 'c1', name: '공통수학1', units: [
        ['1 다항식', ['1.1 다항식의 연산', '1.2 항등식과 나머지정리', '1.3 인수분해']],
        ['2 방정식과 부등식', ['2.1 복소수', '2.2 이차방정식', '2.3 이차방정식과 이차함수', '2.4 고차방정식', '2.5 연립방정식과 부정방정식', '2.6 일차부등식', '2.7 이차부등식']],
        ['3 경우의 수', ['3.1 경우의 수']],
        ['4 행렬', ['4.1 행렬과 그 연산']],
      ] },
      { key: 'c2', name: '공통수학2', units: [
        ['1 도형의 방정식', ['1.1 평면좌표', '1.2 직선의 방정식', '1.3 원의 방정식', '1.4 도형의 이동']],
        ['2 집합과 명제', ['2.1 집합의 뜻과 표현', '2.2 집합의 연산', '2.3 명제', '2.4 명제의 증명']],
        ['3 함수', ['3.1 함수', '3.2 유리함수', '3.3 무리함수']],
      ] },
    ],
    books: [
      { id: 's1', label: '1단계 · 개념서', sub: '전원 같은 교재', merged: true, lessons: true, style: 'book', all: '개념+유형 (개념 + 유형 함께 진도)' },
      GATE,
      { id: 's2', label: '2단계 · 유형교재', sub: '반편성 직후', merged: false, lessons: true, style: 'book', W: '쎈', I: '유형만렙', S: '개념+유형 유형편 복습', E: '개념+유형 개념편+유형편 복습' },
      { id: 's3', label: '3단계 · 다음 교재', sub: '2단계 완강 후', merged: false, lessons: true, style: 'book', W: '자이스토리', I: 'RPM', S: '유형만렙 라이트', E: '유형편 + 교과서 복습 + 수력충전' },
      ...OPS_ROWS,
    ],
  },
  g2: {
    label: '고2', subjects: '대수 · 미적분1',
    courses: [
      { key: 'c1', name: '대수', units: [
        ['1 지수함수와 로그함수', ['1.1 지수', '1.2 로그', '1.3 지수함수와 로그함수', '1.4 지수함수와 로그함수의 활용']],
        ['2 삼각함수', ['2.1 삼각함수의 정의', '2.2 삼각함수의 그래프', '2.3 삼각함수의 활용']],
        ['3 수열', ['3.1 등차수열', '3.2 등비수열', '3.3 수열의 합', '3.4 수학적 귀납법']],
      ] },
      { key: 'c2', name: '미적분1', units: [
        ['1 함수의 극한', ['1.1 함수의 극한', '1.2 함수의 연속']],
        ['2 미분', ['2.1 미분계수와 도함수', '2.2 도함수의 활용 (1)', '2.3 도함수의 활용 (2)', '2.4 도함수의 활용 (3)']],
        ['3 적분', ['3.1 부정적분', '3.2 정적분', '3.3 정적분의 활용']],
      ] },
    ],
    books: [
      { id: 's1', label: '1단계 · 개념서', sub: '전원 같은 교재', merged: true, lessons: true, style: 'book' },
      GATE,
      { id: 's2', label: '2단계 · 유형교재', sub: '반편성 직후', merged: false, lessons: true, style: 'book' },
      { id: 's3', label: '3단계 · 다음 교재', sub: '2단계 완강 후', merged: false, lessons: true, style: 'book' },
      ...OPS_ROWS,
    ],
  },
}

// 단원 한 줄에 늘 붙는 칸 (차시 칸은 교재 단계마다 따로 생긴다)
export const UNIT_COLS: [string, string, string][] = [
  ['kium', '키움 내용 (2시간)', '예: 2.1 개념 + 유형 1~4'],
  ['chaeum', '채움 내용 (1시간 · 지난 차시 복습)', '예: 지난 차시 대표문제 3개 · 데일리 10문항'],
  ['daily', '데일리테스트', '예: 10문항'],
  ['homework', '숙제', '예: 30문항'],
  ['week', '토요 테스트 주차', '예: 2주차'],
  ['memo', '메모', ''],
]

export const unitDocId = (tab: string, course: string, num: string) => `unit-${tab}-${course}-${num}`
