/**
 * 설문 행사 목록 — 「언제 무엇을 묻는 설문인지」를 여기 한 곳에만 적는다.
 *
 * 원장님 2026-11-06 「스터디체크에 학부모 설문 만들어 달라니까」
 *   (11/21 초5·초6 부모학교. 쓰시던 네이버 폼과 같은 11문항 꼴로)
 *
 * ★ 왜 행사마다 키를 따로 두나
 *   survey_responses.survey_key 가 답을 가르는 유일한 칸이다. 키를 안 나누면
 *   10/24 설명회 답 6건과 11/21 부모학교 답이 **한 바구니에 섞여** 평균도 집계도 못 쓴다.
 *   그래서 행사를 하나 더 열 때는 이 파일에 한 줄 더하는 것으로 끝낸다 (DB·화면 손대지 않는다).
 *
 * ★ slug 와 key 를 따로 두는 이유
 *   slug 는 **문자로 보내는 주소**(…/survey/1121)라 한글이면 %EB%B6%80… 로 늘어나 문자가 길어진다.
 *   key 는 **DB 에 쌓이는 이름**이라 나중에 봐도 무엇인지 알아야 한다(「부모학교1121」).
 *
 * ★ 기존 /survey (설명회) 화면은 건드리지 않는다.
 *   이미 학부모님께 나간 주소이고 답이 들어 있다. 새 행사는 /survey/<slug> 로만 받는다.
 */

export type SurveyEvent = {
  /** 주소에 쓰는 짧은 이름 — /survey/<slug> */
  slug: string
  /** DB survey_responses.survey_key 에 쌓이는 이름 */
  key: string
  /** 화면·문자에 쓰는 이름 */
  name: string
  /** 선생님 화면 고르기 단추에 쓰는 이름 */
  tab: string
  when: string
  place: string
  target: string
  /** 머리글 */
  heading: string
  lead: string
  /**
   * 카톡·문자로 주소를 보낼 때 뜨는 대표 그림 (원장님 2026-11-07 「다른 그림이 나가게 해줘」).
   * `scripts/make-survey-og.py` 로 만들어 `public/og/` 에 둔다. 안 적으면 `/og/survey.png`.
   */
  og?: string
  /** 학년 고르기 보기 (빈 배열이면 묻지 않는다) */
  grades: string[]
  /**
   * 알게 된 경로 — 어느 홍보가 실제로 닿았는지 (원장님 2026-11-07 「설명회를 알게된 경로」)
   * ★ 보기를 눌러 고르게 하고 **빈 칸도 함께** 둔다. 글로만 받으면 「지인추천」·「지인 추천」·
   *   「아는 엄마 소개」가 따로 세어져 어느 홍보가 통했는지 끝까지 알 수 없다.
   */
  found: { ask: string; hint: string; options: string[] }
  /** 별점으로 묻는 꼭지 — 그날 말씀하시는 **차례 그대로** 적는다 */
  topics: { title: string; sub: string }[]
  /** 추천 별점 질문글 */
  recommend: string
  /** 장문 질문글 */
  free: string
  /** 비재원생 상담 보기 */
  newFamily: string[]
  /** 재원생 추가 상담 보기 */
  current: string[]
  /** 자료 유포 금지 동의 */
  notice: { ask: string; answer: string }
  /** 개인정보 수집·이용 동의 */
  privacy: { items: string; purpose: string; keep: string }
}

export const SURVEY_EVENTS: SurveyEvent[] = [
  {
    slug: '1121',
    key: '부모학교1121',
    name: '부모학교',
    tab: '부모학교 (11/21)',
    when: '2026년 11월 21일(토) 오후 3시',
    place: '수학의지혜 코어관 대강의실',
    target: '초5 · 초6 학부모님',
    heading: '오늘 부모학교,\n어떠셨어요?',
    lead: '적어 주신 한 줄이 다음 시간을 바꿉니다',
    og: '/og/survey-1121.png',
    grades: ['초5', '초6', '그 밖에'],
    found: {
      ask: '이번 부모학교를 어떻게 알게 되셨어요?',
      hint: '여러 개 고르셔도 되고, 아래 칸에 자유롭게 적어 주셔도 됩니다',
      options: [
        '지인 추천', '학원 앞 배너', '학원 입구 현수막', '당산역 현수막',
        '네이버 블로그', '온라인 검색', '당근', '인스타', '네이버 광고',
      ],
    },
    topics: [
      { title: '신원동 6개 중학교 분석', sub: '신원중 · 고양중 · 원흥중 · 고양제일중 · 목암중 · 지축중' },
      { title: '겨울방학 골든타임', sub: '전환기 · 공부 습관 · 학습 순서' },
      { title: '수행평가 실전 전략', sub: '중학교 성적에 함께 들어가는 평가' },
      { title: '수학의지혜 중등 수학 관리법', sub: '진도보다 확인 · 레벨학습지' },
    ],
    recommend: '오늘 못 오신 다른 학부모님께 이 부모학교를 추천하시겠어요?',
    free: '오늘 부모학교 어떠셨는지, 좋았던 점 아쉬웠던 점 편하게 적어 주세요 ^^',
    newFamily: ['시간표 및 커리큘럼', '겨울방학 특강', '중·고등 형제 자매 학습 문의', '기타'],
    current: ['겨울방학 특강', '예비중1 중등 선행', '1:1 클리닉', '서술형 대비', '추가 희망 없음'],
    notice: {
      ask: '이후 보내 드리는 자료는 모두 수학의지혜가 직접 만든 자료입니다. 밖으로 돌리지 않겠다고 약속해 주실까요?',
      answer: '네, 동의합니다. 유포하지 않겠습니다.',
    },
    privacy: {
      items: '자녀 이름 · 학부모님 연락처',
      purpose: '상담 안내 및 학습정보 안내',
      keep: '작성일로부터 6개월',
    },
  },
]

export const findEventBySlug = (slug: string) =>
  SURVEY_EVENTS.find((e) => e.slug === String(slug ?? '')) ?? null
export const findEventByKey = (key: string) =>
  SURVEY_EVENTS.find((e) => e.key === String(key ?? '')) ?? null

/** 10/24 설명회 — 화면이 /survey 로 따로 있어 이 목록에 넣지 않는다. 선생님 화면 고르기에만 쓴다. */
export const LEGACY_EVENT = { slug: '', key: '설명회', name: '설명회', tab: '설명회 (10/24)' }
