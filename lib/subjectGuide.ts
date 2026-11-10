/**
 * 2028 권장 이수과목 찾기 — 「이 학생이 고른 계열·학과」에 맞는 대학별 권장과목을 골라 준다.
 *
 * 왜 (원장님 2026-11-10 「학생부 로드맵에 참고할 만한 내용」)
 *   2028 대입부터 대학이 **모집단위별 권장과목**을 미리 공개한다. 고1·고2 과목 선택이
 *   지원 계열과 바로 이어지므로, 질문지에서 받은 계열·학과를 과목 선택 안내로 잇는다.
 *   서울대는 「지원자격과는 무관하나 수시 서류평가·정시 교과역량평가에 반영」이라고 못박았다 —
 *   **조건이 아니라 평가 재료**다. 학생에게 「필수」라고 말하지 않는다.
 *
 * 자료는 `lib/data/subjectGuide2028.ts` 한 곳 (해마다 통째로 새로 만든다).
 */
import { SUBJECT_GUIDE_2028, type GuideRow } from './data/subjectGuide2028'

export interface Guide {
  region: string; area: string; univ: string
  /** 계열·단과대 (엑셀의 「모집단위(계열, 단과대, 학과)」 앞칸) */
  group: string
  /** 학과 — 빈 칸이면 계열·단과대 단위로만 공개한 대학이다 */
  major: string
  /** 필수적 이수를 권장 */
  core: string
  /** 가급적 이수를 권장 */
  more: string
  note: string
}

const toGuide = (r: GuideRow): Guide => ({
  region: r[0], area: r[1], univ: r[2], group: r[3], major: r[4], core: r[5], more: r[6], note: r[7],
})

/**
 * 계열(`lib/careerSurvey.ts` CAREER_FIELDS) → 모집단위 이름에서 찾을 낱말.
 *
 * ★ 앞에 둔 계열이 이긴다 — 「생명과학과」는 자연과학에도 걸리지만 **생명·농림·환경**이 먼저다.
 *   한 줄이 여러 계열에 걸리는 것은 그대로 둔다(학생이 계열을 둘까지 고른다).
 */
export const FIELD_WORDS: Record<string, string[]> = {
  '의약·보건': ['의예', '의학', '치의', '한의', '약학', '약과학', '간호', '보건', '의료', '물리치료', '작업치료',
    '임상병리', '방사선', '치위생', '응급구조', '재활', '수의', '제약',
    // 활동 글에서 진로와 이어지는지 볼 때도 쓰는 낱말이라 일상말을 같이 둔다 (2026-11-10)
    '약물', '질병', '환자', '병원', '건강', '백신', '진단'],
  '교육': ['교육', '사범'],
  'IT·소프트웨어·AI': ['컴퓨터', '소프트웨어', 'SW', '정보통신', '정보보호', '인공지능', 'AI', '데이터', '빅데이터',
    '사이버', '보안', '게임', '미디어테크', '스마트', 'ICT', '전산'],
  '생명·농림·환경': ['생명', '생물', '바이오', '농업', '농생명', '식품', '산림', '조경', '원예', '축산', '동물',
    '수산', '해양', '환경', '유전'],
  '공학': ['공학', '공과', '기계', '전자', '전기', '건축', '토목', '건설', '화공', '신소재', '재료', '산업',
    '항공', '우주', '조선', '에너지', '로봇', '반도체', '자동차', '섬유', '원자력', '나노'],
  '자연과학': ['수학', '물리', '화학', '통계', '지구', '천문', '대기', '자연과학', '이학', '과학'],
  '경영·경제': ['경영', '경제', '회계', '무역', '통상', '금융', '세무', '부동산', '물류', '광고', '관광', '호텔', '상경'],
  '사회·법·행정': ['행정', '정치', '법', '사회학', '사회복지', '사회과학', '언론', '미디어', '신문방송', '공공',
    '경찰', '국제', '지리', '심리', '문헌정보'],
  '인문': ['국어국문', '영어영문', '중어', '일어', '일본', '불어', '독어', '노어', '서어', '아랍', '베트남',
    '사학', '국사', '철학', '종교', '고고', '미학', '인문', '어문', '언어', '문예창작'],
  '예술·체육': ['미술', '음악', '디자인', '체육', '스포츠', '무용', '연극', '영화', '공예', '패션', '조형',
    '작곡', '성악', '기악', '예술', '실용음악', '뷰티'],
}

/** 수학 학원이 특히 볼 과목 — 고른 계열에서 **몇 개 모집단위가 권장하는지** 센다 */
export const MATH_SUBJECTS = ['대수', '미적분Ⅰ', '미적분Ⅱ', '확률과 통계', '기하', '인공지능 수학',
  '직무 수학', '경제 수학', '수학과제 탐구', '심화 수학'] as const

const norm = (s: string) => String(s ?? '').replace(/\s+/g, '').toLowerCase()

/**
 * 「컴퓨터공학과」 → 「컴퓨터공학」 · 「경영학부」 → 「경영학」 — 뒤에 붙는 말만 떼고 견준다.
 *
 * ★ 「학과」를 통째로 떼면 안 된다 — 「컴퓨터공학과」가 「컴퓨터공」이 돼서 아무것도 안 걸린다.
 *   떼는 것은 **과 · 부 · 전공 · 계열** 뿐이다(「학부」는 「부」가 떨어져 「…학」이 남는다).
 */
export function majorKey(s: string): string {
  return norm(s).replace(/(전공|계열|과|부)$/u, '')
}

/** 그 줄이 이 계열에 드는가 */
export function inField(row: Guide, field: string): boolean {
  const words = FIELD_WORDS[field]
  if (!words) return false
  const hay = norm(row.group + row.major)
  return words.some((w) => hay.includes(norm(w)))
}

export interface FindOpts {
  /** 질문지에서 고른 계열 (최대 2개). 「아직 모름」은 셈에서 뺀다 */
  fields?: string[]
  /** 가고 싶은 학과 — 적혀 있으면 **이쪽이 먼저**다 */
  major?: string
  /** 직접 친 검색어 */
  q?: string
  limit?: number
}

export interface FindResult {
  rows: Guide[]
  /** 걸린 줄 수 (limit 으로 자르기 전) */
  total: number
  /** 수학 과목별로 몇 개 모집단위가 권장하는가 */
  math: { name: string; count: number }[]
  /** 무엇으로 찾았는지 — 화면에 그대로 적는다 */
  why: string
}

/**
 * 찾는 순서
 *   ① 검색어(q)가 있으면 그것만 본다 (대학·계열·학과 어디든 들어 있으면)
 *   ② 가고 싶은 학과가 적혀 있으면 그 말로 먼저 찾는다
 *   ③ 그래도 없으면(또는 학과를 안 적었으면) 고른 계열로 찾는다
 */
export function findGuides(opts: FindOpts): FindResult {
  const all = SUBJECT_GUIDE_2028.map(toGuide)
  const limit = opts.limit ?? 80
  const fields = (opts.fields ?? []).filter((f) => f && f !== '아직 모름')
  const q = norm(opts.q ?? '')
  let rows: Guide[] = []
  let why = ''

  if (q) {
    rows = all.filter((r) => norm(r.univ + r.group + r.major).includes(q))
    why = `「${opts.q}」으로 찾았어요`
  } else {
    const key = majorKey(opts.major ?? '')
    if (key.length >= 2) {
      rows = all.filter((r) => majorKey(r.major).includes(key) || majorKey(r.group).includes(key))
      if (rows.length) why = `가고 싶은 학과 「${opts.major}」으로 찾았어요`
    }
    if (!rows.length && fields.length) {
      rows = all.filter((r) => fields.some((f) => inField(r, f)))
      why = `관심 계열 「${fields.join(' · ')}」으로 찾았어요`
    }
  }

  const math = MATH_SUBJECTS
    .map((name) => ({ name, count: rows.filter((r) => (r.core + ' ' + r.more).includes(name)).length }))
    .filter((m) => m.count > 0)
    .sort((a, b) => b.count - a.count)

  return { rows: rows.slice(0, limit), total: rows.length, math, why: why || '맞는 자료를 못 찾았어요' }
}
