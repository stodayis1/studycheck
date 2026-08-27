// 자동 생성됨 - 문제은행용 교재 목록(학년별) 스크립트에서 추출
// 학년+학기별 교재 에디션 목록 (298건). QR/빠른정답 파이프라인에서 사용.
// usage: 실제 학생 배정 이력 기준 사용빈도(명) - 목록 정렬(많이 쓰는 교재 먼저)에 사용

export interface QuickAnswerCatalogItem {
  grade: string
  semester: number
  type: string
  name: string
  note: string
  usage: number
}

export const QUICK_ANSWER_CATALOG: QuickAnswerCatalogItem[] = [
  {
    "grade": "초1",
    "semester": 1,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 1,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 1,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 1,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 1,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 1,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초1",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "연산서",
    "name": "완자계산력",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "유형서",
    "name": "수학리더(기본+응용)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "유형서",
    "name": "디딤돌 응용",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초2",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "기탄수학",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "디딤돌 연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "완자계산력",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "개념서",
    "name": "EBS만점왕",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 3
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "유형서",
    "name": "라이트쎈",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "유형서",
    "name": "완자 공부력",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "연산서",
    "name": "디딤돌 연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 7
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초3",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 5
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 3
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "연산서",
    "name": "큐브연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 4
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형파워",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "유형서",
    "name": "디딤돌 문제유형",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "유형서",
    "name": "디딤돌 응용",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "유형서",
    "name": "완자 공부력",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 1,
    "type": "심화서",
    "name": "최상위S",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 3
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 7
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 12
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형파워",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초4",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 11
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 4
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "유형서",
    "name": "디딤돌 문제유형",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "유형서",
    "name": "디딤돌 응용",
    "note": "",
    "usage": 8
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "유형서",
    "name": "수학리더(기본+응용)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 5
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "유형서",
    "name": "완자 공부력",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "심화서",
    "name": "왕수학최상위",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 1,
    "type": "심화서",
    "name": "최상위S",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 3
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 11
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 15
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "유형서",
    "name": "디딤돌 응용",
    "note": "",
    "usage": 3
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 4
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "심화서",
    "name": "최상위S",
    "note": "",
    "usage": 3
  },
  {
    "grade": "초5",
    "semester": 2,
    "type": "심화서",
    "name": "최상위S(복습책)",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 9
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 4
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 6
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "개념서",
    "name": "개념잡기",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "EBS만점왕",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "디딤돌 문제유형",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "디딤돌 응용",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "수학리더(기본+응용)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "유형서",
    "name": "완자 공부력",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "심화서",
    "name": "왕수학최상위",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 1,
    "type": "심화서",
    "name": "최상위S",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "연산서",
    "name": "빅데이터 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "연산서",
    "name": "수력충전 연산연습+문장제",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "연산서",
    "name": "쎈연산",
    "note": "",
    "usage": 5
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "연산서",
    "name": "원리셈",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "연산서",
    "name": "초능력연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "연산서",
    "name": "최상위 연산",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 18
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형파워",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "개념서",
    "name": "개념잡기",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "개념서",
    "name": "리피트",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "개념서",
    "name": "수력충전",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "유형서",
    "name": "개념유형 라이트 6-2 (손예원)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "유형서",
    "name": "디딤돌 응용",
    "note": "",
    "usage": 2
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 5
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "심화서",
    "name": "왕수학최상위",
    "note": "",
    "usage": 4
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "심화서",
    "name": "최고수준",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "초6",
    "semester": 2,
    "type": "심화서",
    "name": "최상위S",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "연산서",
    "name": "기탄수학",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "연산서",
    "name": "디딤돌 연산",
    "note": "",
    "usage": 16
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 18
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "개념서",
    "name": "교과서 개념잡기",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "개념서",
    "name": "디딤돌 개념기본",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "개념서",
    "name": "중학수학 개념기본서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "유형서",
    "name": "RPM",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "유형서",
    "name": "개념＋유형(유형편)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "유형서",
    "name": "라이트쎈",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "유형서",
    "name": "블랙라벨",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 14
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 7
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "심화서",
    "name": "RPMpro",
    "note": "",
    "usage": 4
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "심화서",
    "name": "고쟁이",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "심화서",
    "name": "쎈(C단계)",
    "note": "",
    "usage": 6
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "심화서",
    "name": "일품",
    "note": "",
    "usage": 7
  },
  {
    "grade": "중1",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "연산서",
    "name": "디딤돌 연산",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 6
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "개념서",
    "name": "개념리피트",
    "note": "",
    "usage": 12
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "개념서",
    "name": "베이직쎈(양진혁)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "개념서",
    "name": "중학수학 개념기본서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "개념서",
    "name": "체크체크(진도)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "RPM",
    "note": "",
    "usage": 3
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "개념＋유형(유형편)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "라이트쎈",
    "note": "",
    "usage": 4
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "베이직 N제",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "베이직쎈",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "블랙라벨",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 3
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 8
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "심화서",
    "name": "고쟁이",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "심화서",
    "name": "일품",
    "note": "",
    "usage": 5
  },
  {
    "grade": "중1",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 13
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "개념서",
    "name": "개념리피트",
    "note": "",
    "usage": 4
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "개념서",
    "name": "중학수학 개념기본서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "RPM",
    "note": "",
    "usage": 4
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "개념＋유형(유형편)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "라이트쎈",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "베이직쎈",
    "note": "",
    "usage": 4
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "블랙라벨",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 9
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 13
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "심화서",
    "name": "RPMpro",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "심화서",
    "name": "고쟁이",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "심화서",
    "name": "블랙라벨",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "심화서",
    "name": "일품",
    "note": "",
    "usage": 4
  },
  {
    "grade": "중2",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "연산서",
    "name": "디딤돌 연산",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 9
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "개념서",
    "name": "개념리피트",
    "note": "",
    "usage": 27
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "개념서",
    "name": "우공비 개념",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "개념서",
    "name": "중학수학 개념기본서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "유형서",
    "name": "RPM",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "유형서",
    "name": "개념＋유형(유형편)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "유형서",
    "name": "베이직쎈",
    "note": "",
    "usage": 9
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "유형서",
    "name": "블랙라벨",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 6
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 19
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "심화서",
    "name": "일품",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중2",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "연산서",
    "name": "쎈 개념연산",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 7
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형파워",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "개념리피트",
    "note": "",
    "usage": 10
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "쎈 (박소율)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "우공비 개념",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "중학수학 개념기본서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "개념서",
    "name": "체크체크(진도)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "개념＋유형(유형편)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "라이트쎈",
    "note": "",
    "usage": 3
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "베이직 N제",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "베이직쎈",
    "note": "",
    "usage": 7
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "블랙라벨",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 8
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 11
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "심화서",
    "name": "일품",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 1,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "연산서",
    "name": "쎈 개념연산",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형라이트",
    "note": "",
    "usage": 32
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "개념서",
    "name": "쎈3-2 (박유준)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "개념서",
    "name": "중학수학 개념기본서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "개념유형 라이트(유형편)",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "개념＋유형(유형편)",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "베이직 N제",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "블랙라벨",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "쎈",
    "note": "",
    "usage": 11
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 6
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "유형서",
    "name": "체크체크 유형N제",
    "note": "",
    "usage": 14
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "심화서",
    "name": "일품",
    "note": "",
    "usage": 1
  },
  {
    "grade": "중3",
    "semester": 2,
    "type": "심화서",
    "name": "최상위",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "중2모의고사",
    "semester": 1,
    "type": "유형서",
    "name": "모의고사 1부",
    "note": "",
    "usage": 2
  },
  {
    "grade": "중2모의고사",
    "semester": 2,
    "type": "유형서",
    "name": "모의고사 2부",
    "note": "",
    "usage": 1
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "연산서",
    "name": "풍산자 반복수학",
    "note": "",
    "usage": 1
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형",
    "note": "",
    "usage": 7
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "개념서",
    "name": "개념원리",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "개념서",
    "name": "라이트수학",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "개념서",
    "name": "짤강",
    "note": "",
    "usage": 2
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "유형서",
    "name": "마플교과서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "유형서",
    "name": "만렙유형",
    "note": "",
    "usage": 1
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "유형서",
    "name": "수능특강",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "유형서",
    "name": "자이스토리",
    "note": "",
    "usage": 1
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "유형서",
    "name": "풍산자 라이트유형",
    "note": "",
    "usage": 3
  },
  {
    "grade": "공통수학1",
    "semester": 1,
    "type": "심화서",
    "name": "킬러문항",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학1",
    "semester": 2,
    "type": "개념서",
    "name": "개념+유형",
    "note": "",
    "usage": 1
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "연산서",
    "name": "풍산자 반복수학",
    "note": "",
    "usage": 1
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형",
    "note": "",
    "usage": 17
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "개념서",
    "name": "개념원리",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "개념서",
    "name": "라이트수학",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "유형서",
    "name": "RPM",
    "note": "",
    "usage": 5
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "유형서",
    "name": "마플교과서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "유형서",
    "name": "만렙유형",
    "note": "",
    "usage": 16
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "유형서",
    "name": "수능특강",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "공통수학2",
    "semester": 1,
    "type": "심화서",
    "name": "킬러문항",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "대수",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형",
    "note": "",
    "usage": 1
  },
  {
    "grade": "대수",
    "semester": 1,
    "type": "개념서",
    "name": "개념원리",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "대수",
    "semester": 1,
    "type": "개념서",
    "name": "라이트수학",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "대수",
    "semester": 1,
    "type": "유형서",
    "name": "마플교과서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "대수",
    "semester": 1,
    "type": "유형서",
    "name": "수능특강",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "대수",
    "semester": 1,
    "type": "심화서",
    "name": "킬러문항",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "개념서",
    "name": "개념+유형",
    "note": "",
    "usage": 2
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "개념서",
    "name": "개념원리",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "개념서",
    "name": "라이트수학",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "유형서",
    "name": "마플교과서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "유형서",
    "name": "수능특강",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "유형서",
    "name": "쎈B",
    "note": "",
    "usage": 1
  },
  {
    "grade": "미적분1",
    "semester": 1,
    "type": "심화서",
    "name": "킬러문항",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "확률과통계",
    "semester": 1,
    "type": "개념서",
    "name": "개념원리",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "확률과통계",
    "semester": 1,
    "type": "개념서",
    "name": "라이트수학",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "확률과통계",
    "semester": 1,
    "type": "유형서",
    "name": "마플교과서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "확률과통계",
    "semester": 1,
    "type": "유형서",
    "name": "수능특강",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "확률과통계",
    "semester": 1,
    "type": "유형서",
    "name": "자이스토리",
    "note": "",
    "usage": 1
  },
  {
    "grade": "확률과통계",
    "semester": 1,
    "type": "심화서",
    "name": "킬러문항",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "기하",
    "semester": 1,
    "type": "개념서",
    "name": "개념원리",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "기하",
    "semester": 1,
    "type": "개념서",
    "name": "라이트수학",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "기하",
    "semester": 1,
    "type": "유형서",
    "name": "마플교과서",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "기하",
    "semester": 1,
    "type": "유형서",
    "name": "수능특강",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
  {
    "grade": "기하",
    "semester": 1,
    "type": "심화서",
    "name": "킬러문항",
    "note": "실사용 이력 없음 · 학년 확인 필요",
    "usage": 0
  },
]
