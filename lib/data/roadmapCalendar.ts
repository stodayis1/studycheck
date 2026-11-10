/**
 * 학년별·월별 **로드맵 정기 소식** — 중3·고1·고2 가 그 달에 챙겨야 할 것.
 *
 * 어디서 왔나: 「학원_연간이슈캘린더_2026최신판」 엑셀 (2026-11-10 원장님이 주신 꾸러미) 중
 * 우리 로드맵 대상 학년(중3·고1·고2) 줄만 추렸다. 날짜가 붙은 **행사**가 아니라 **그 달의 할 일**이다.
 *
 * 어떻게 쓰나: `scripts/career-news-seed.ts` 가 이 표를 보고 `career_events` 에 「검토대기」로 올린다
 * (fields = 공통 · kind = 정기 소식 · 그 달 1일~말일). 원장님이 ④ 행사 소식 탭에서 승인해야 나간다.
 *
 * ★ 해마다 바뀌는 자료다. 새 캘린더가 오면 통째로 다시 만든다.
 */
export interface RoadmapItem {
  /** 중3 · 고1 · 고2 */
  grade: string
  /** 1~12월 */
  month: number
  /** 「월중」·「월말」처럼 그 달 안에서의 때 */
  when: string
  /** 이슈 갈래 — 학생부 · 평가 · 고입 · 대입 · 모의고사 · 과목선택 … */
  type: string
  /** 그 달에 일어나는 일 */
  event: string
  /** 학부모·학생이 궁금해하는 점 */
  point: string
  /** 설명회·상담으로 풀 때의 제목 */
  plan: string
  /** 공식 확인처 */
  source: string
  /** 블로그 글감 (카드뉴스·블로그 스킬이 쓴다) */
  blog: string
}

export const ROADMAP_CALENDAR: RoadmapItem[] = [
  { grade: "고1", month: 1, when: "월중", type: "방학/학습", event: "겨울방학·다음 학년 과목 선행·복습", point: "내신·모의고사 취약영역", plan: "고1 예비학년 학습전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 고등 겨울방학, 선행보다 먼저 해야 할 성적 분석" },
  { grade: "고1", month: 1, when: "월중", type: "입학", event: "예비고1 고교학점제·내신·모의고사 구조 이해", point: "중학교와 완전히 달라지는 평가", plan: "예비고1 고교학점제·내신 설명회", source: "https://www.schoolinfo.go.kr/", blog: "예비고1, 고등학교 성적은 왜 3월부터 달라질까" },
  { grade: "고1", month: 1, when: "월중", type: "학생부", event: "학년말 학생부·출결·세부 활동 정리", point: "학생부 기록 이해와 다음 학년 활동", plan: "고1 학생부 기반 학업·진로 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 학생부를 읽으면 다음 학년 전략이 보인다" },
  { grade: "고2", month: 1, when: "월중", type: "대입", event: "2028학년도 대입 개편 첫 적용 세대의 겨울방학", point: "통합형 수능·내신·선택과목 전략", plan: "2028 대입 개편 설명회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "예비고2, 2028 대입 세대가 겨울에 꼭 정리할 것" },
  { grade: "고2", month: 1, when: "월중", type: "방학/학습", event: "겨울방학·다음 학년 과목 선행·복습", point: "내신·모의고사 취약영역", plan: "고2 예비학년 학습전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 고등 겨울방학, 선행보다 먼저 해야 할 성적 분석" },
  { grade: "고2", month: 1, when: "월중", type: "학생부", event: "학년말 학생부·출결·세부 활동 정리", point: "학생부 기록 이해와 다음 학년 활동", plan: "고2 학생부 기반 학업·진로 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 학생부를 읽으면 다음 학년 전략이 보인다" },
  { grade: "중3", month: 1, when: "월중", type: "고입", event: "고교 배정·합격 발표·등록·예비고1 준비", point: "배정학교·교육과정·통학", plan: "예비고1 학교별 분석 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고교 배정 뒤 반드시 확인할 교육과정 5가지" },
  { grade: "중3", month: 1, when: "월중", type: "방학/학습", event: "겨울방학·다음 학년 내신 기초 정비", point: "수학·영어 누적 결손과 독서", plan: "중3 예비학년 내신전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 겨울방학, 중학생이 반드시 정리해야 할 과목별 구멍" },
  { grade: "중3", month: 1, when: "월중", type: "학사", event: "학년말 성적·학교생활 기록 정리", point: "성적표 해석과 다음 학년 계획", plan: "중3 학년말 성적분석 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "중3 중학생 성적표, 등수보다 먼저 볼 것" },
  { grade: "중3", month: 1, when: "월중", type: "진급/준비", event: "예비고1: 고1 내신 5등급제·고교학점제 2년차 진입", point: "1등급 상위 10%, 과목 선택, 3월 첫 학평 대비", plan: "예비고1 고교학점제·내신 설명회", source: "https://www.moe.go.kr", blog: "예비고1 겨울방학 필수: 내신 5등급제에서 1등급 받는 법" },
  { grade: "고1", month: 2, when: "월중", type: "진급", event: "신학기 과목·시간표·평가계획 대비", point: "선택과목과 내신 구조", plan: "고1 신학기 내신·과목선택 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 개학 전 반드시 확인할 고교 과목·평가 포인트" },
  { grade: "고1", month: 2, when: "월중", type: "학생부", event: "1년 활동계획·동아리·탐구 주제 구상", point: "활동을 억지 스펙이 아닌 수업과 연결", plan: "고1 탐구·세특 설계 설명회", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 새 학기 학생부 활동, 2월에 정하면 좋은 것과 나쁜 것" },
  { grade: "고2", month: 2, when: "월중", type: "진급", event: "신학기 과목·시간표·평가계획 대비", point: "선택과목과 내신 구조", plan: "고2 신학기 내신·과목선택 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 개학 전 반드시 확인할 고교 과목·평가 포인트" },
  { grade: "고2", month: 2, when: "월중", type: "학생부", event: "1년 활동계획·동아리·탐구 주제 구상", point: "활동을 억지 스펙이 아닌 수업과 연결", plan: "고2 탐구·세특 설계 설명회", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 새 학기 학생부 활동, 2월에 정하면 좋은 것과 나쁜 것" },
  { grade: "중3", month: 2, when: "월중", type: "진급", event: "새 학년 교과서·시간표·평가방식 미리보기", point: "내신 대비 시점", plan: "중3 신학기 내신 로드맵 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 3월 전에 끝내야 할 중학생 신학기 준비" },
  { grade: "중3", month: 2, when: "월중", type: "생활", event: "학급 배정·동아리·학생회 등 학교생활 준비", point: "친구관계와 비교과 참여", plan: "중3 학교생활·학습 균형 상담", source: "https://www.schoolinfo.go.kr/", blog: "중3 새 반 배정 뒤 중학생이 먼저 해야 할 일" },
  { grade: "고1", month: 3, when: "월중", type: "교육과정", event: "2022 개정 교육과정·고교학점제 기반 학교생활 시작", point: "공통과목·선택과목·학점 이수", plan: "고1 교육과정·과목선택 설명회", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1이 처음부터 알아야 할 학점과 과목 선택" },
  { grade: "고1", month: 3, when: "3월 24일", type: "모의고사", event: "3월 24일 고1 전국연합학력평가", point: "고등 첫 전국단위 위치 확인 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "3월 학평 분석 설명회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고1 첫 3월 학평, 점수보다 무엇을 봐야 하나" },
  { grade: "고1", month: 3, when: "월중", type: "학사", event: "입학·진급·1학기 평가계획·동아리 편성", point: "첫 내신과 학교별 평가 방식", plan: "고1 1학기 내신전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 고등학교 3월, 평가계획표를 먼저 봐야 하는 이유" },
  { grade: "고1", month: 3, when: "월중", type: "학생부", event: "교과 세특·수행평가·탐구 활동 시작", point: "수업 참여와 탐구의 연결", plan: "고1 세특·탐구 설계 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 세특은 12월이 아니라 3월부터 시작된다" },
  { grade: "고2", month: 3, when: "월중", type: "교육과정", event: "2022 개정 교육과정이 2026년 고2까지 확대 적용", point: "진로선택·학점·대입 연결", plan: "고2 교육과정·대입 설명회", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "2026 고2, 교육과정 변화가 대입에 미치는 영향" },
  { grade: "고2", month: 3, when: "3월 24일", type: "모의고사", event: "3월 24일 고2 전국연합학력평가", point: "고2 첫 모의고사 기준점 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "3월 학평 분석회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고2 3월 학평, 고1 성적과 다르게 봐야 하는 이유" },
  { grade: "고2", month: 3, when: "월중", type: "학사", event: "입학·진급·1학기 평가계획·동아리 편성", point: "첫 내신과 학교별 평가 방식", plan: "고2 1학기 내신전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 고등학교 3월, 평가계획표를 먼저 봐야 하는 이유" },
  { grade: "고2", month: 3, when: "월중", type: "학생부", event: "교과 세특·수행평가·탐구 활동 시작", point: "수업 참여와 탐구의 연결", plan: "고2 세특·탐구 설계 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 세특은 12월이 아니라 3월부터 시작된다" },
  { grade: "중3", month: 3, when: "월중", type: "고입", event: "중3 내신·고입 준비 본격화", point: "고입 반영 성적과 진학 목표", plan: "중3 연간 고입 로드맵", source: "https://www.schoolinfo.go.kr/", blog: "중3 3월부터 고입 전략을 세워야 하는 이유" },
  { grade: "중3", month: 3, when: "월중", type: "상담", event: "학부모총회·진로상담·상담주간", point: "학교별 내신·생활지도 특징", plan: "중3 학교별 내신 특성 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 학부모총회에서 꼭 물어볼 중등 질문" },
  { grade: "중3", month: 3, when: "월중", type: "학사", event: "입학·진급·교육과정 및 평가계획 공개", point: "시험 일정·수행평가 비중 파악", plan: "중3 학기초 내신·수행평가 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학교 3월, 평가계획표부터 봐야 하는 이유" },
  { grade: "중3", month: 3, when: "월중", type: "평가", event: "기초학력·교과 진단 및 첫 수행평가 시작", point: "과목별 약점과 수행 일정", plan: "중3 수행평가 캘린더 설계 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "중3 중학생 수행평가, 3월부터 달력에 적어야 한다" },
  { grade: "중3", month: 3, when: "월말", type: "고입", event: "시도별 2027학년도 고입전형 기본계획 공고", point: "우리 지역 원서 일정, 내신 산출 방식", plan: "중3 고입 설명회", source: "https://www.hischool.go.kr", blog: "2027 고입 일정 총정리: 과고·외고·자사고 원서는 언제?" },
  { grade: "고1", month: 4, when: "월중", type: "평가", event: "1학기 중간고사·1차 지필평가", point: "내신 등급과 과목별 전략", plan: "고1 중간고사 대비 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 고등 중간고사 4주 전 과목별 공부 순서" },
  { grade: "고1", month: 4, when: "월중", type: "학생부", event: "수행평가·발표·보고서 집중", point: "수업활동과 학생부 기록", plan: "고1 수행평가·탐구보고서 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 수행평가를 점수와 세특 두 마리 토끼로 만드는 법" },
  { grade: "고2", month: 4, when: "월중", type: "평가", event: "1학기 중간고사·1차 지필평가", point: "내신 등급과 과목별 전략", plan: "고2 중간고사 대비 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 고등 중간고사 4주 전 과목별 공부 순서" },
  { grade: "고2", month: 4, when: "월중", type: "학생부", event: "수행평가·발표·보고서 집중", point: "수업활동과 학생부 기록", plan: "고2 수행평가·탐구보고서 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 수행평가를 점수와 세특 두 마리 토끼로 만드는 법" },
  { grade: "고2", month: 4, when: "4월 30일", type: "대입", event: "2028학년도 대학입학전형 시행계획 발표(194개교): 수시 증가·정시 감소", point: "대학별 정시 학생부 반영, 통합형 수능 반영 방식", plan: "2028 대입 시행계획 분석 설명회", source: "https://www.adiga.kr", blog: "2028 대입 시행계획 발표: 고2가 지금 확인할 5가지" },
  { grade: "중3", month: 4, when: "월중", type: "평가", event: "1학기 1차 지필평가·중간고사 시즌", point: "첫 시험 범위·서술형·시험전략", plan: "중3 중간고사 대비 전략 특강", source: "https://www.schoolinfo.go.kr/", blog: "중3 중간고사 3주 전, 과목별 공부 순서" },
  { grade: "중3", month: 4, when: "월중", type: "탐구", event: "과학의 달·교내대회·탐구활동", point: "교과 심화·동아리 소재", plan: "중3 탐구·동아리 활동 설계 특강", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학생 과학의 달, 대회보다 탐구 질문이 중요한 이유" },
  { grade: "고1", month: 5, when: "월중", type: "진로", event: "대학·학과·진로 탐색, 대학별 시행계획 관심 증가", point: "진로와 선택과목 연결", plan: "고1 진로·학과 탐색 설명회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "고1 대학 학과를 찾을 때 취업률만 보면 안 되는 이유" },
  { grade: "고1", month: 5, when: "월중", type: "평가", event: "중간고사 결과 분석·기말 전략 전환", point: "등급 회복 가능성과 과목 우선순위", plan: "고1 내신 분석·기말 역전 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 중간고사 이후 등급을 바꾸는 6주 전략" },
  { grade: "고2", month: 5, when: "월중", type: "진로", event: "대학·학과·진로 탐색, 대학별 시행계획 관심 증가", point: "진로와 선택과목 연결", plan: "고2 진로·학과 탐색 설명회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "고2 대학 학과를 찾을 때 취업률만 보면 안 되는 이유" },
  { grade: "고2", month: 5, when: "월중", type: "평가", event: "중간고사 결과 분석·기말 전략 전환", point: "등급 회복 가능성과 과목 우선순위", plan: "고2 내신 분석·기말 역전 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 중간고사 이후 등급을 바꾸는 6주 전략" },
  { grade: "중3", month: 5, when: "월중", type: "고입", event: "특목·자사·특성화고 학교 설명회·입학전형 공지 확인", point: "학교유형별 전형 차이", plan: "고교유형 비교 설명회", source: "https://www.schoolinfo.go.kr/", blog: "특목고·자사고 설명회 시즌, 무엇을 비교할까" },
  { grade: "중3", month: 5, when: "월중", type: "평가", event: "중간고사 결과 분석·수행평가 집중", point: "오답 원인과 1학기 회복 가능성", plan: "중3 시험결과 분석·기말 역전 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 중간고사 망쳤다면 5월에 해야 할 것" },
  { grade: "중3", month: 5, when: "월중", type: "진로", event: "진로체험·직업체험·동아리 활동 증가", point: "진로 관심과 과목 선택 연결", plan: "중3 진로탐색 학부모 특강", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학생 진로체험을 스펙이 아닌 탐색으로 쓰는 법" },
  { grade: "중3", month: 5, when: "5월 6~26일", type: "고입", event: "영재학교 8개교 원서(한과영 5.6~13, 대구·대전·세종·인천 5.18~20, 경기·광주 5.20~22, 서울 5.20~26), 789명 선발", point: "1개교만 지원 가능, 지역 선발", plan: "영재학교 지원 전략 설명회", source: "https://www.hischool.go.kr", blog: "2027 영재학교 원서 일정과 학교별 선발 인원" },
  { grade: "고1", month: 6, when: "6월 4일", type: "모의고사", event: "6월 4일 고1 전국연합학력평가", point: "1학기 학습성과·수능형 문항 적응 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "6월 학평 분석·여름전략 설명회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고1 6월 학평으로 여름방학 계획 짜는 법" },
  { grade: "고1", month: 6, when: "월중", type: "평가", event: "기말고사 준비·수행평가 마감", point: "1학기 내신 총점", plan: "고1 1학기 마무리 내신전략", source: "https://www.schoolinfo.go.kr/", blog: "고1 고등 기말고사와 수행평가를 동시에 관리하는 법" },
  { grade: "고1", month: 6, when: "월중", type: "학생부", event: "1학기 세특·탐구활동 정리 시작", point: "수업에서 무엇을 남겼는지", plan: "고1 1학기 학생부 점검 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 세특을 부탁하기 전에 학생이 해야 할 일" },
  { grade: "고2", month: 6, when: "6월 4일", type: "모의고사", event: "6월 4일 고2 전국연합학력평가", point: "여름방학 전 수능형 학습점검 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "고2 여름방학 수능·내신 설명회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고2 6월 학평 이후 여름방학 과목 우선순위" },
  { grade: "고2", month: 6, when: "월중", type: "평가", event: "기말고사 준비·수행평가 마감", point: "1학기 내신 총점", plan: "고2 1학기 마무리 내신전략", source: "https://www.schoolinfo.go.kr/", blog: "고2 고등 기말고사와 수행평가를 동시에 관리하는 법" },
  { grade: "고2", month: 6, when: "월중", type: "학생부", event: "1학기 세특·탐구활동 정리 시작", point: "수업에서 무엇을 남겼는지", plan: "고2 1학기 학생부 점검 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 세특을 부탁하기 전에 학생이 해야 할 일" },
  { grade: "중3", month: 6, when: "월중", type: "평가", event: "1학기 기말고사 준비·수행평가 마감", point: "내신 총점 관리", plan: "중3 1학기 마무리 내신 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 기말고사와 수행평가를 동시에 잡는 일정 관리" },
  { grade: "중3", month: 6, when: "월중", type: "학습", event: "여름방학 취약과목 선정", point: "1학기 성적 기반 방학 계획", plan: "중3 여름방학 학습진단 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "중3 여름방학에 무엇을 보완할지 결정하는 법" },
  { grade: "중3", month: 6, when: "월말", type: "고입", event: "영재학교 1단계 결과 발표(학교별), 영재성검사(7.4~12)", point: "2단계 대비", plan: "영재고 2단계 대비 상담", source: "https://www.hischool.go.kr", blog: "영재고 1단계 합격 후 2주 준비법" },
  { grade: "고1", month: 7, when: "월중", type: "방학/탐구", event: "여름방학 심화학습·탐구·독서·대학탐방", point: "학업과 진로활동의 균형", plan: "고1 여름 탐구·독서 프로그램 설명회", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 여름방학 탐구활동, 무엇을 해야 세특과 연결되나" },
  { grade: "고1", month: 7, when: "월중", type: "학사", event: "기말고사·성적확인·여름방학", point: "내신 결과와 방학 우선순위", plan: "고1 여름방학 학습전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 고등 1학기 성적표를 보고 방학 계획 짜는 법" },
  { grade: "고2", month: 7, when: "월중", type: "대입", event: "고3 진입 전 학생부·교과성적 1차 점검", point: "수시·정시 가능성 진단", plan: "고2 대입 중간점검 설명회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "고2 1학기 성적이 끝났다면 대입 전략을 숫자로 점검할 때" },
  { grade: "고2", month: 7, when: "월중", type: "방학/탐구", event: "여름방학 심화학습·탐구·독서·대학탐방", point: "학업과 진로활동의 균형", plan: "고2 여름 탐구·독서 프로그램 설명회", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 여름방학 탐구활동, 무엇을 해야 세특과 연결되나" },
  { grade: "고2", month: 7, when: "월중", type: "학사", event: "기말고사·성적확인·여름방학", point: "내신 결과와 방학 우선순위", plan: "고2 여름방학 학습전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 고등 1학기 성적표를 보고 방학 계획 짜는 법" },
  { grade: "중3", month: 7, when: "월중", type: "고입", event: "1학기 내신 마감 후 지원전략 1차 점검", point: "지원 가능 학교군 재설정", plan: "중3 여름 고입 상담회", source: "https://www.schoolinfo.go.kr/", blog: "중3 여름방학, 고입 지원전략을 다시 짜야 하는 이유" },
  { grade: "중3", month: 7, when: "월중", type: "방학", event: "여름방학 특강·독서·탐구·캠프", point: "짧은 방학의 우선순위", plan: "중3 여름방학 과목별 로드맵", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학생 여름방학, 선행과 복습 비율은" },
  { grade: "중3", month: 7, when: "월중", type: "학사", event: "1학기 기말·성적확인·여름방학", point: "내신 성적과 다음 학기 전략", plan: "중3 여름방학 내신 재설계 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학생 1학기 성적표를 읽는 5단계" },
  { grade: "고1", month: 8, when: "월중", type: "과목선택", event: "다음 학년도 선택과목 조사·신청 시즌", point: "진로와 과목 선택의 연결", plan: "선택과목 설계 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 선택과목, 대학 전공만 보고 고르면 안 되는 이유" },
  { grade: "고1", month: 8, when: "월중", type: "학사", event: "2학기 개학·평가계획·과목선택 일정 확인", point: "내신과 다음 학년 과목 선택", plan: "고1 2학기 내신·과목선택 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 2학기 시작 전 선택과목을 다시 점검해야 하는 이유" },
  { grade: "고1", month: 8, when: "월중", type: "학생부", event: "2학기 탐구·세특 활동 재설계", point: "1학기와 연결되는 탐구 흐름", plan: "고1 2학기 세특·탐구 전략 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 학생부 활동은 '새 주제'보다 '연결'이 중요하다" },
  { grade: "고2", month: 8, when: "월중", type: "과목선택", event: "고3 선택과목·수능 학습체계 설계", point: "학교 과목과 수능 대비 균형", plan: "예비고3 과목·수능 전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 8월, 고3 시간표를 미리 설계해야 하는 이유" },
  { grade: "고2", month: 8, when: "월중", type: "학사", event: "2학기 개학·평가계획·과목선택 일정 확인", point: "내신과 다음 학년 과목 선택", plan: "고2 2학기 내신·과목선택 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 2학기 시작 전 선택과목을 다시 점검해야 하는 이유" },
  { grade: "고2", month: 8, when: "월중", type: "학생부", event: "2학기 탐구·세특 활동 재설계", point: "1학기와 연결되는 탐구 흐름", plan: "고2 2학기 세특·탐구 전략 상담", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 학생부 활동은 '새 주제'보다 '연결'이 중요하다" },
  { grade: "중3", month: 8, when: "월중", type: "학사", event: "2학기 개학·평가계획·수행 일정 확인", point: "2학기 중간·기말 일정 역산", plan: "중3 2학기 내신전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 2학기 평가계획표로 공부 달력 만드는 법" },
  { grade: "중3", month: 8, when: "월중", type: "학습", event: "개학 후 학습리듬 회복", point: "방학 선행을 학교 진도에 연결", plan: "중3 개학 후 학습리셋 상담", source: "https://www.schoolinfo.go.kr/", blog: "중3 방학에 배운 걸 2학기 성적으로 바꾸는 방법" },
  { grade: "중3", month: 8, when: "8월 8~25일", type: "고입", event: "영재학교 캠프(8.8, 한과영 8.15), 최종 발표(8.21, 한과영 8.25)", point: "합격 후 과고 지원 제한, 플랜B", plan: "영재고 불합격 후 진로 상담", source: "https://www.hischool.go.kr", blog: "영재고 최종 발표 후, 과고·자사고 플랜B" },
  { grade: "중3", month: 8, when: "8월 18일~9월 4일", type: "고입", event: "과학고 원서(지역별 상이, 예: 대전동신 8.18~25, 전남 8.31~9.3, 부산 9.1~3)", point: "지역 단위 모집, 자기주도학습전형 면접", plan: "과고 면접 대비 상담", source: "https://www.hischool.go.kr", blog: "2027 과학고 원서 일정과 면접 준비" },
  { grade: "고1", month: 9, when: "월중", type: "진로", event: "대학·전공 탐색과 다음 학년 선택과목 재점검", point: "진로 변화와 과목 선택", plan: "고1 진로-과목선택 상담회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "고1 진로가 바뀌었을 때 선택과목은 어떻게 해야 하나" },
  { grade: "고1", month: 9, when: "월중", type: "평가", event: "2학기 중간고사·수행평가 준비", point: "추석과 시험 일정 관리", plan: "고1 가을 내신 집중 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 9월부터 2학기 내신이 갈리는 이유" },
  { grade: "고1", month: 9, when: "9월 2일", type: "모의고사", event: "9월 2일 고1 전국연합학력평가", point: "2학기 학습방향 재설정 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "9월 학평 성적분석회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고1 9월 학평, 3월·6월과 비교해야 할 지표" },
  { grade: "고2", month: 9, when: "9월 2일", type: "모의고사", event: "9월 2일 고2 전국연합학력평가", point: "고3 전환 전 위치 확인 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "9월 학평·예비고3 설명회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고2 9월 학평, 이제는 고3처럼 분석해야 한다" },
  { grade: "고2", month: 9, when: "월중", type: "진로", event: "대학·전공 탐색과 다음 학년 선택과목 재점검", point: "진로 변화와 과목 선택", plan: "고2 진로-과목선택 상담회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "고2 진로가 바뀌었을 때 선택과목은 어떻게 해야 하나" },
  { grade: "고2", month: 9, when: "월중", type: "평가", event: "2학기 중간고사·수행평가 준비", point: "추석과 시험 일정 관리", plan: "고2 가을 내신 집중 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 9월부터 2학기 내신이 갈리는 이유" },
  { grade: "중3", month: 9, when: "월중", type: "고입", event: "고입전형 기본계획·학교별 요강 최종 확인", point: "원서 일정·면접·자기주도학습전형", plan: "고입 원서·면접 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 9월, 고입 일정표를 한 장으로 정리하기" },
  { grade: "중3", month: 9, when: "월중", type: "평가", event: "2학기 중간고사·수행평가 준비", point: "추석과 시험기간 일정 충돌", plan: "중3 가을 내신 집중 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 추석이 낀 중간고사, 공부계획을 어떻게 짤까" },
  { grade: "중3", month: 9, when: "월중", type: "학교행사", event: "축제·체험학습·동아리 발표", point: "행사와 시험 일정 병행", plan: "중3 학생 일정관리 상담", source: "https://www.schoolinfo.go.kr/", blog: "중3 학교축제 시즌, 공부와 활동을 같이 잡는 법" },
  { grade: "고1", month: 10, when: "10월 20일", type: "모의고사", event: "10월 20일 고1 전국연합학력평가", point: "연간 수능형 학습 성과 점검 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "10월 학평·겨울방학 전략 설명회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고1 마지막 학평으로 겨울방학 계획 세우기" },
  { grade: "고1", month: 10, when: "월중", type: "평가", event: "2학기 중간고사 결과·기말고사 전략", point: "학년말 등급 관리", plan: "고1 기말 역전·학년말 전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 2학기 중간 이후 내신을 회복할 수 있는 마지막 구간" },
  { grade: "고1", month: 10, when: "월중", type: "탐구", event: "교내 발표·축제·탐구대회·동아리 결과물", point: "활동 마무리와 수업 연결", plan: "고1 탐구 결과물 정리 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 교내대회 수상보다 중요한 탐구 결과 정리" },
  { grade: "고2", month: 10, when: "10월 20일", type: "모의고사", event: "10월 20일 고2 전국연합학력평가", point: "겨울방학 수능 대비 기준점 / 고1·2는 2028 수능 체제(통합사회·통합과학) 반영", plan: "10월 학평·예비고3 전략회", source: "https://www.sen.go.kr/user/bbs/BD_selectBbs.do?q_bbsDocNo=20251204140127350&q_bbsSn=1036", blog: "고2 마지막 학평, 예비고3 겨울계획으로 연결하기" },
  { grade: "고2", month: 10, when: "월중", type: "평가", event: "2학기 중간고사 결과·기말고사 전략", point: "학년말 등급 관리", plan: "고2 기말 역전·학년말 전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 2학기 중간 이후 내신을 회복할 수 있는 마지막 구간" },
  { grade: "고2", month: 10, when: "월중", type: "탐구", event: "교내 발표·축제·탐구대회·동아리 결과물", point: "활동 마무리와 수업 연결", plan: "고2 탐구 결과물 정리 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 교내대회 수상보다 중요한 탐구 결과 정리" },
  { grade: "중3", month: 10, when: "월중", type: "고입", event: "과학고 면접·합격 발표, 마이스터고 원서 시즌(과학고 원서는 8월 말~9월 초)", point: "학교유형별 원서·면접 일정", plan: "학교유형별 지원전략 상담", source: "https://www.schoolinfo.go.kr/", blog: "10월 고입, 학교유형별 일정이 다른 이유" },
  { grade: "중3", month: 10, when: "월중", type: "평가", event: "2학기 중간고사 결과·기말 전략 전환", point: "점수 회복과 과목 우선순위", plan: "중3 기말 역전 전략 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 중간고사 이후 기말까지 가장 중요한 6주" },
  { grade: "중3", month: 10, when: "월중", type: "문해/논술", event: "한글날·독서토론·글쓰기 활동", point: "서술형과 교과문해력", plan: "중3 교과문해력·서술형 특강", source: "https://www.moe.go.kr/", blog: "중3 중학생 문해력이 수학·과학 점수까지 바꾸는 이유" },
  { grade: "고1", month: 11, when: "월중", type: "진급", event: "다음 학년·겨울방학 과목별 계획", point: "모의고사·내신 동시 대비", plan: "고1 예비학년 수능·내신 로드맵", source: "https://www.schoolinfo.go.kr/", blog: "고1 겨울방학에 내신과 수능 공부를 어떻게 나눌까" },
  { grade: "고1", month: 11, when: "월중", type: "평가", event: "2학기 기말고사·학년말 평가", point: "최종 내신과 진급", plan: "고1 학년말 내신·예비학년 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 11월, 고등 내신의 마지막 승부처" },
  { grade: "고2", month: 11, when: "월중", type: "대입", event: "예비고3 수시·정시 비중과 학생부 경쟁력 점검", point: "고3 시작 전 전형구조 이해", plan: "예비고3 대입전략 설명회", source: "https://www.adiga.kr/uct/cas/scheduleView.do", blog: "예비고3, 수시냐 정시냐보다 먼저 해야 할 진단" },
  { grade: "고2", month: 11, when: "월중", type: "진급", event: "다음 학년·겨울방학 과목별 계획", point: "모의고사·내신 동시 대비", plan: "고2 예비학년 수능·내신 로드맵", source: "https://www.schoolinfo.go.kr/", blog: "고2 겨울방학에 내신과 수능 공부를 어떻게 나눌까" },
  { grade: "고2", month: 11, when: "월중", type: "평가", event: "2학기 기말고사·학년말 평가", point: "최종 내신과 진급", plan: "고2 학년말 내신·예비학년 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 11월, 고등 내신의 마지막 승부처" },
  { grade: "고2", month: 11, when: "11월 20일~", type: "대입", event: "수능 직후 예비고3 체제 전환: 2028 통합형 수능 첫 응시 학년", point: "겨울방학이 수능 1년을 좌우", plan: "예비고3 윈터스쿨 설명회", source: "https://www.suneung.re.kr", blog: "수능 끝나면 고2가 진짜 고3: 2028 수능 겨울방학 플랜" },
  { grade: "중3", month: 11, when: "월중", type: "고입", event: "외고·국제고·자사고·일반고 등 원서 시즌 접근(원서는 12월 3~14일, 시도별 상이)", point: "내신 마감·지원 조합", plan: "고입 최종지원 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 11월, 원서 직전 마지막 체크리스트" },
  { grade: "중3", month: 11, when: "월중", type: "진급", event: "예비학년·겨울방학 선행 계획", point: "다음 학년 난이도와 과목별 선행선", plan: "중3 예비학년 커리큘럼 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학생 겨울 선행, 어디까지 해야 하나" },
  { grade: "중3", month: 11, when: "월중", type: "평가", event: "2학기 기말고사·학년말 성적 관리", point: "내신 마무리와 진급", plan: "중3 학년말 성적·예비학년 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 기말고사 이후에도 놓치면 안 되는 학년말 일정" },
  { grade: "중3", month: 11, when: "월말", type: "진급/준비", event: "중3 기말 이후 고교 선행 시즌", point: "고1 공통수학·통합과학 선행 범위", plan: "예비고1 설명회", source: "https://www.hischool.go.kr", blog: "중3 겨울방학, 고1 수학 어디까지 해야 할까?" },
  { grade: "고1", month: 12, when: "월중", type: "학사", event: "기말·학년 마감·겨울방학", point: "성적·학생부·과목선택 최종 정리", plan: "고1 겨울방학·다음 학년 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고1 고등학생 1년 결산 체크리스트" },
  { grade: "고1", month: 12, when: "월중", type: "학생부", event: "학생부 기록·세특·출결·창체 최종 확인", point: "기록 누락·오해 방지", plan: "고1 학생부 이해 학부모 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고1 학생부를 확인할 때 학생이 볼 수 있는 것과 볼 수 없는 것" },
  { grade: "고2", month: 12, when: "월중", type: "학사", event: "기말·학년 마감·겨울방학", point: "성적·학생부·과목선택 최종 정리", plan: "고2 겨울방학·다음 학년 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고2 고등학생 1년 결산 체크리스트" },
  { grade: "고2", month: 12, when: "월중", type: "학생부", event: "학생부 기록·세특·출결·창체 최종 확인", point: "기록 누락·오해 방지", plan: "고2 학생부 이해 학부모 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "고2 학생부를 확인할 때 학생이 볼 수 있는 것과 볼 수 없는 것" },
  { grade: "중3", month: 12, when: "월중", type: "고입", event: "일반고 배정·합격 발표 및 예비고1 전환", point: "고교학점제·과목선택·내신 구조", plan: "예비고1 고교학점제·내신 설명회", source: "https://www.schoolinfo.go.kr/", blog: "고등학교 입학 전에 반드시 알아야 할 과목 선택" },
  { grade: "중3", month: 12, when: "월중", type: "학사", event: "기말·학년마감·겨울방학·졸업 준비", point: "성적표와 학교생활 정리", plan: "중3 겨울방학·진급 설명회", source: "https://www.schoolinfo.go.kr/", blog: "중3 중학생 1년을 정리하는 체크리스트" },
  { grade: "중3", month: 12, when: "월중", type: "생활기록", event: "학교생활기록부·출결·창체 등 연간 기록 정리", point: "진학 전 기록 확인", plan: "중3 학생부 기초 이해 학부모 특강", source: "https://star.moe.go.kr/web/contents/m21100.do", blog: "중3 중학생도 학교생활기록을 알아야 하는 이유" },
  { grade: "중3", month: 12, when: "12월 3~14일", type: "고입", event: "외고·국제고·자사고 원서(서울 외고·서울국제고 12.3~7, 경기 외고·고양·동탄·청심국제 12.4~10, 부산·인천국제 12.7~9, 세종국제 12.8~10, 대구국제 12.10~14)", point: "경쟁률(2026학년도 외고 1.47, 국제고 1.87, 자사고 1.22대 1), 면접", plan: "특목·자사고 면접 대비 상담", source: "https://www.hischool.go.kr", blog: "2027 외고·국제고·자사고 원서 일정과 경쟁률 전망" },
]
