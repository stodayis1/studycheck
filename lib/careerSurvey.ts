// 진로 설문 · 개인정보 동의 — 문항과 동의서 문구를 한 곳에 둔다.
//
// 원장님 2026-11-07 「예비고1(현 중3)이랑 예비고2(현 고1)」 「스터디체크 안에서 설문조사처럼 받아서 반영」
//                   「그전에 개인정보제공 동의 꼭 넣어줘 … 이것도 별도로 가지고 있어야지」 「보유기간 3년」
//
// 화면(학생·학부모 /student/career · /parent/career)과 서버(/api/career)가 **같은 정의**를 쓴다.
// 서버는 여기 없는 보기를 버린다 — 보기를 바꾸면 이 파일 하나만 고치면 된다.
//
// ★ 동의서 문구를 바꾸면 CONSENT_VERSION 을 올린다. 예전 판에 동의한 사람은 다시 동의를 받는다
//   (어느 문구에 동의했는지가 증빙이다).

export const CONSENT_VERSION = '2026-11-v1'

export const CONSENT_TEXT = {
  title: '진로·활동 기록을 위한 개인정보 수집·이용 동의',
  intro:
    '수학의지혜는 학생의 진로에 맞는 학습·선택과목·탐구 안내를 위해 아래 정보를 모읍니다. ' +
    '입학할 때 받은 동의와는 별도로 받는 동의입니다.',
  rows: [
    ['수집·이용 목적', '진로 상담, 진로에 맞는 수학 선택과목·탐구 주제·학습 안내, 학원 내 활동 기록 관리'],
    ['수집 항목 [필수]', '희망 진로·계열·학과, 진학 희망 고등학교, 선택과목, 동아리·탐구보고서·수행평가 등 학교 활동 내용, 설문 답변'],
    ['수집 항목 [선택]', '학교생활기록부 기재 내용(과목별 세부능력 및 특기사항 등) — 학생·학부모가 직접 알려 주거나 보여 준 것만'],
    ['보유 기간', '동의한 날부터 3년. 기간이 지나거나 동의를 철회하면 지체 없이 파기합니다.'],
    ['제3자 제공', '하지 않습니다. 안내는 학생·학부모 본인에게만 보냅니다.'],
  ] as [string, string][],
  refuse:
    '동의하지 않으셔도 됩니다. 동의하지 않아도 수업에는 아무 불이익이 없고, 진로 맞춤 안내만 받으실 수 없습니다. ' +
    '동의는 이 화면에서 언제든 철회할 수 있습니다.',
  required: '[필수] 진로·학교 활동 정보 수집·이용에 동의합니다.',
  optional: '[선택] 학교생활기록부 기재 내용(세특 등) 수집·이용에 동의합니다.',
}

/** 이번 설문 차수 — 다음 차수를 열 때 이 값만 바꾼다 (지난 답은 그대로 남는다) */
export const SURVEY_ROUND = '2026-겨울'

export type FormId = 'pre1' | 'pre2'
export const FORMS: Record<FormId, { label: string; fromGrade: string; desc: string; heading: string; lead: string }> = {
  pre1: {
    label: '예비고1', fromGrade: '중3', desc: '고등학교 입학을 앞두고 진로와 공부 방향을 함께 잡아요.',
    heading: '고등학교 가기 전에,\n진로부터 같이 그려 봐요',
    lead: '고1 첫 학기부터 학생부가 쌓입니다. 미리 방향을 잡아 두면 안내가 달라져요',
  },
  pre2: {
    label: '예비고2', fromGrade: '고1', desc: '2학년 선택과목과 탐구 활동을 진로에 맞춰 준비해요.',
    heading: '2학년 선택과목,\n진로에 맞춰 골라 봐요',
    lead: '선택과목과 탐구 주제가 진로와 이어지도록 학원이 함께 챙깁니다',
  },
}

/** 설문 진행 순서 — 학생·학부모 화면 머리와 선생님 「진행 안내」에 같이 쓴다 */
export const SECTIONS = [
  { id: 'consent', title: '개인정보 수집·이용 동의', note: '입학 때 받은 동의와 별도. 처음 한 번만' },
  { id: 'career', title: '나의 진로', note: '관심 계열 · 희망 직업 · 학과' },
  { id: 'study', title: '지금 공부', note: '예비고1: 진학 고교·과목·선행 / 예비고2: 2학년 선택과목' },
  { id: 'school', title: '학교 활동', note: '동아리 · 탐구보고서 · 수행평가' },
  { id: 'want', title: '받고 싶은 안내', note: '학원에 바라는 것 · 하고 싶은 말' },
] as const
export type SectionId = typeof SECTIONS[number]['id']

/** 지금 학년 → 설문 종류. 설문이 없는 학년은 null */
export function formForGrade(grade: string | null | undefined): FormId | null {
  const g = String(grade ?? '').trim()
  if (g === '중3') return 'pre1'
  if (g === '고1') return 'pre2'
  return null
}
export const surveyKeyOf = (form: FormId) => `${SURVEY_ROUND}-${FORMS[form].label}`

export type Question = {
  id: string
  label: string
  type: 'single' | 'multi' | 'text' | 'textarea'
  options?: string[]
  max?: number            // multi 최대 개수 · text 최대 글자
  help?: string
  forms: FormId[]
  section: SectionId
  required?: boolean
}

const BOTH: FormId[] = ['pre1', 'pre2']

export const CAREER_FIELDS = [
  '인문', '사회·법·행정', '경영·경제', '교육', '자연과학', '공학',
  'IT·소프트웨어·AI', '의약·보건', '생명·농림·환경', '예술·체육', '아직 모름',
]

export const QUESTIONS: Question[] = [
  { id: 'field', label: '관심 있는 계열 (2개까지)', type: 'multi', options: CAREER_FIELDS, max: 2, forms: BOTH, section: 'career', required: true },
  { id: 'job1', label: '희망 직업·분야 1지망', type: 'text', max: 60, forms: BOTH, help: '예: 소프트웨어 개발자, 간호사, 아직 모름', section: 'career' },
  { id: 'job2', label: '희망 직업·분야 2지망', type: 'text', max: 60, forms: BOTH, section: 'career' },
  { id: 'major', label: '가고 싶은 학과 (있으면)', type: 'text', max: 60, forms: BOTH, section: 'career' },
  { id: 'certainty', label: '진로를 얼마나 정했나요?', type: 'single', options: ['거의 정했어요', '대략 방향만 있어요', '아직 모르겠어요'], forms: BOTH, section: 'career' },

  // 예비고1
  { id: 'high_school', label: '진학할(희망) 고등학교', type: 'text', max: 40, forms: ['pre1'], help: '아직 배정 전이면 「배정 대기」', section: 'study' },
  { id: 'hs_type', label: '고등학교 유형', type: 'single', options: ['일반고', '과학고·영재학교', '자사고', '외고·국제고', '특성화고·마이스터고', '기타·모름'], forms: ['pre1'], section: 'study' },
  { id: 'fav_subjects', label: '좋아하는 과목', type: 'multi', options: ['국어', '수학', '영어', '사회', '과학', '정보', '예체능', '기타'], max: 8, forms: ['pre1'], section: 'study' },
  { id: 'strong_subjects', label: '자신 있는 과목', type: 'multi', options: ['국어', '수학', '영어', '사회', '과학', '정보', '예체능', '기타'], max: 8, forms: ['pre1'], section: 'study' },
  { id: 'math_progress', label: '지금 수학 선행은 어디까지?', type: 'single', options: ['중3 과정', '공통수학1 진행 중', '공통수학1 끝', '공통수학2 진행 중', '공통수학2 끝 이상'], forms: ['pre1'], section: 'study' },
  { id: 'mid_activities', label: '중학교 때 한 진로 활동·동아리', type: 'textarea', max: 1000, forms: ['pre1'], help: '진로연계학기 활동, 동아리, 직업 체험 등', section: 'school' },

  // 예비고2
  { id: 'math_electives', label: '2학년 수학 선택과목 (신청했거나 할 것)', type: 'multi',
    options: ['대수', '미적분Ⅰ', '확률과 통계', '기하', '미적분Ⅱ', '경제 수학', '인공지능 수학', '직무 수학', '수학과 문화', '실용 통계', '수학과제 탐구', '아직 모름'],
    max: 12, forms: ['pre2'], section: 'study' },
  { id: 'elective_status', label: '선택과목 신청 상태', type: 'single', options: ['확정됐어요', '신청했지만 바꿀 수 있어요', '아직 신청 전이에요', '모르겠어요'], forms: ['pre2'], section: 'study' },
  { id: 'club', label: '동아리 이름과 하는 활동', type: 'textarea', max: 1000, forms: ['pre2'], section: 'school' },
  { id: 'inquiry', label: '1학년 때 쓴 탐구보고서·수행평가 주제', type: 'textarea', max: 2000, forms: ['pre2'], help: '과목과 주제를 한 줄씩. 예: 사회 - 쓰레기 소각장 주민 갈등 (수행평가 발표)', section: 'school' },
  { id: 'admission', label: '생각하는 대입 전형', type: 'single', options: ['학생부종합', '학생부교과', '정시(수능)', '논술', '아직 모름'], forms: ['pre2'], section: 'school' },

  // 공통 마무리
  { id: 'want', label: '받고 싶은 안내', type: 'multi',
    options: ['진로 상담', '선택과목 안내', '수학 탐구 주제 추천', '대학 권장과목', '학생부 관리 방법', '고교 생활 안내', '공부 방법'],
    max: 7, forms: BOTH, section: 'want' },
  { id: 'note', label: '하고 싶은 말 (학부모님 의견도 좋아요)', type: 'textarea', max: 1000, forms: BOTH, section: 'want' },
]

export const questionsOf = (form: FormId) => QUESTIONS.filter((q) => q.forms.includes(form))

/** 보낸 답을 정의에 맞게 거른다 — 없는 문항·보기는 버리고 길이를 자른다 */
export function cleanAnswers(form: FormId, raw: any): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const q of questionsOf(form)) {
    const v = raw[q.id]
    if (q.type === 'multi') {
      if (!Array.isArray(v)) continue
      const picked = [...new Set(v.map(String))].filter((x) => q.options!.includes(x)).slice(0, q.max ?? 30)
      if (picked.length) out[q.id] = picked
    } else if (q.type === 'single') {
      if (q.options!.includes(String(v))) out[q.id] = String(v)
    } else {
      const s = String(v ?? '').trim().slice(0, q.max ?? 1000)
      if (s) out[q.id] = s
    }
  }
  return out
}

// 활동 기록 종류 · 상태 (선생님 화면)
export const ACTIVITY_KINDS = ['탐구보고서', '세특', '수행평가', '동아리', '진로활동', '독서', '대회·행사', '기타']
export const ACTIVITY_STATUS = ['계획', '작성 중', '완성', '제출']
