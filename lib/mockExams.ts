// 모의고사 기출 — 회차 목록과 문항 해설의 모양.
//
// 선생님 전용(원장님 2026-11-19: 수업 때 그때그때 풀이를 보고 프린트해 주는 용도, 학생·학부모는 안 본다).
// 문항 그림과 해설(data.json)은 보관함 exam-analysis 의 `mock/<slug>/` 아래에 있고,
// /api/mock-exams 가 직원 확인을 거쳐서만 내준다. 넣는 법: scripts/mock-exam/README.md

export type MockExam = {
  slug: string          // 보관함 폴더 이름 (영문)
  year: number          // 학년도 (수능은 시행 다음 해 학년도)
  title: string         // 화면 제목
  short: string         // 목록 칸에 쓰는 짧은 이름
  grade: string         // 고1 · 고2 · 고3
  kind: '수능' | '평가원' | '학력평가' | '사설'
  date: string          // 시행일 (YYYY-MM-DD)
  minutes: number       // 시험 시간
  tracks: Track[]       // 선택과목 (없으면 [])
  note?: string
}

export type Track = '확률과 통계' | '미적분' | '기하'
export const TRACK_KEY: Record<Track, string> = { '확률과 통계': '확통', '미적분': '미적', '기하': '기하' }

// 회차 목록은 보관함 mock/index.json 에 있다 (scripts/mock-exam/upload.mjs 가 회차 폴더의 meta.json 으로 고쳐 쓴다).
// 그래서 회차를 더할 때 앱을 다시 배포하지 않아도 된다. 아래는 index.json 이 없을 때만 쓰는 첫 회차.
export const MOCK_EXAMS: MockExam[] = [
  {
    slug: '2027-suneung', year: 2027, title: '2027학년도 대학수학능력시험 수학', short: '2027 수능',
    grade: '고3', kind: '수능', date: '2026-11-19', minutes: 100,
    tracks: ['확률과 통계', '미적분', '기하'],
    note: '정답은 평가원 가답안(홀수형) 기준 — 정답 확정 2026-12-01',
  },
]

// 목록 정렬: 학년도 최신 → 고3·고2·고1 → 시행일 최신
export function sortExams<T extends MockExam>(list: T[]): T[] {
  return [...list].sort((a, b) => b.year - a.year || b.grade.localeCompare(a.grade) || b.date.localeCompare(a.date))
}

export const DIFFS = ['상', '중상', '중', '중하', '하'] as const
export type Diff = (typeof DIFFS)[number]

export type MockQuestion = {
  sec: string            // 공통 · 확통 · 미적 · 기하
  no: number
  pts: number
  answer: string         // ② 또는 단답 숫자
  unit: string
  type: string
  difficulty: Diff
  seconds: number        // 권장 풀이 시간
  read: string           // 문제 해석
  approach: string       // 접근 방법
  steps: string[]        // 단계별 풀이
  why: string            // 정답이 되는 이유
  choices: { n: string; ok: boolean; note: string }[]
  know: string           // 알아 둘 것
  tags: string[]
  mistakes: string       // 자주 하는 실수
  review: string         // 복습 방법
  image: string          // 문항 그림 (API 가 서명 주소로 바꿔 준다)
  w?: number             // 그림 픽셀 크기 (200dpi) — 인쇄 크기를 원본과 같게
  h?: number
}

export type MockData = { slug: string; questions: MockQuestion[] }

// 한 학생이 보는 30문항 = 공통 22 + 고른 선택과목 8
export function questionsFor(all: MockQuestion[], track: Track | null): MockQuestion[] {
  const key = track ? TRACK_KEY[track] : null
  return all.filter((q) => q.sec === '공통' || q.sec === key).sort((a, b) => a.no - b.no)
}

export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  if (m >= 60) return `${Math.floor(m / 60)}시간 ${m % 60}분`
  if (!m) return `${s}초`
  return s ? `${m}분 ${s}초` : `${m}분`
}
