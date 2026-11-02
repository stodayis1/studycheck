/**
 * 매쓰홀릭 붙여넣기를 **실제로 제대로 읽는지** 가짜·진짜 글자로 시험한다.
 *
 * 왜 필요한가
 *   읽는 규칙이 틀려도 화면에는 그럴듯한 표가 그려진다. 60점이 통째로 빠지거나
 *   12/20 을 12월 20일로 읽어도 **에러가 안 난다.** 그래서 값을 하나하나 대조한다.
 *   (처음 만들 때 실제로 12/20 을 날짜로 읽어 그 건을 통째로 버렸다.)
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/matholic-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/matholic-check.ts <다른 matholic.ts 경로>
 *     ↑ 일부러 틀리게 고친 사본을 넣으면 **실패해야** 한다. 실패하지 않으면 시험이 없는 것이다.
 *
 * 마지막 줄 「통과 N / 전체 N」, 종료코드 0 이 통과.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { unitNameBeside, unitLabel, unitParen, levelText } from '../lib/worksheetTitle.ts'
import { formatWorksheetScope } from '../lib/utils.ts'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/matholic.ts')
const { parseMatholic, findStudents, rankWorksheets, isClearWinner, alreadyIn, isDailyTest, coreTestRound, isEnoughOne, needsLevel, worksheetTypeOf, parseWorksheetTitle, pickByRule, pickSessionForDaily, resolveUnit, gradeFromCourse, isWrongNote, wrongNoteFix, prevLevelOf, matchTextbook, isTextbookLinked, normBook, nameDiffers, levelForInsert, DEFAULT_LEVEL } =
  await import(pathToFileURL(target).href)

/** 오늘을 고정한다 — 연도를 메우는 규칙이 날짜에 따라 달라지면 안 된다. */
const TODAY = new Date('2026-10-29T12:00:00+09:00')

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) }
  else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

// ── 2026-10-29 에 매쓰홀릭에서 실제로 복사한 글자. **생김새는 그대로, 학생 이름만 가상**이다.
//    (실명·점수를 저장소에 넣지 않는다. 날짜·점수·맞은 개수는 읽는 규칙을 시험해야 하므로 그대로 둔다.)
//    화면이 바뀌면 여기부터 바꾸고 시험을 다시 돌린다.
const REAL = `강보라
(2/2)

09/03 20:44
학습지
공통수학2 (2022 개정)
고1A Daily Test 0903 (lv2.5)
12/20
60점

08/22 11:40
학습지
공통수학2 (2022 개정)
공통수학2 주말복습 TEST 0822
21/30
70점

문시후
(2/2)

09/03 21:46
학습지
공통수학2 (2022 개정)
고1A Daily Test 0903 (lv2.5)
17/20
85점

08/22 12:38
학습지
공통수학2 (2022 개정)
공통수학2 주말복습 TEST 0822
24/30
80점

서다인
(1/1)

09/05 12:10
학습지
공통수학2 (2022 개정)
고1 주말복습 TEST (lv3)
14/25
56점

오하윤
(0/0)
해당 기간 학습 이력이 없습니다.

임채아
(2/2)

09/05 10:53
학습지
공통수학2 (2022 개정)
고1 주말복습 TEST (lv3.5)
19/25
76점

08/22 12:22
학습지
공통수학2 (2022 개정)
공통수학2 주말복습 TEST
25/30
83점

정우찬2
(2/2)

09/05 10:46
학습지
공통수학2 (2022 개정)
고1 주말복습 TEST (lv2.5)_원의방정식까지
20/24
83점

09/01 19:01
학습지
공통수학2 (2022 개정)
두 점 사이의 거리 외 4단원 공통수학2 Lv.2
23/30
76점

표나래
(0/0)
해당 기간 학습 이력이 없습니다.

최나현
(2/2)

09/05 11:06
학습지
공통수학2 (2022 개정)
고1 주말복습 TEST (lv4)
25/29
86점

08/22 10:45
학습지
공통수학2 (2022 개정)
공통수학2 주말복습 TEST
28/30
93점

한지후
(2/2)

09/05 10:49
학습지
공통수학2 (2022 개정)
고1 주말복습 TEST (lv4)
25/29
86점

08/22 10:19
학습지
공통수학2 (2022 개정)
공통수학2 주말복습 TEST
29/30
96점

08/18 18:27
학습지
공통수학2 (2022 개정)
공통수학2 Daily Test (lv4)
15/15
100점

08/15 11:04
학습지
공통수학2 (2022 개정)
공통수학2 주말복습 TEST (lv3.5)
30/30
100점

홍예람
(1/1)

09/03 22:06
학습지
공통수학2 (2022 개정)
고1A Daily Test 0903 (lv2.5)
18/20
90점`

/** 사람이 눈으로 세어 적은 정답. 「학생|날짜|점수|맞은/전체|레벨」 */
const EXPECT = [
  '강보라|2026-09-03|60|12/20|2.5',
  '강보라|2026-08-22|70|21/30|',
  '문시후|2026-09-03|85|17/20|2.5',
  '문시후|2026-08-22|80|24/30|',
  '서다인|2026-09-05|56|14/25|3',
  '임채아|2026-09-05|76|19/25|3.5',
  '임채아|2026-08-22|83|25/30|',
  '정우찬2|2026-09-05|83|20/24|2.5',
  '정우찬2|2026-09-01|76|23/30|2',
  '최나현|2026-09-05|86|25/29|4',
  '최나현|2026-08-22|93|28/30|',
  '한지후|2026-09-05|86|25/29|4',
  '한지후|2026-08-22|96|29/30|',
  '한지후|2026-08-18|100|15/15|4',
  '한지후|2026-08-15|100|30/30|3.5',
  '홍예람|2026-09-03|90|18/20|2.5',
]
const key = (r: any) =>
  `${r.student}|${r.date}|${r.score}|${r.right ?? ''}/${r.total ?? ''}|${r.level ?? ''}`

const real = parseMatholic(REAL, TODAY)

T('실제 붙여넣기에서 16건을 전부 읽는다', () => real.rows.length === 16)

T('16건의 학생·날짜·점수·맞은개수·레벨이 하나도 안 틀린다', () => {
  const got = real.rows.map(key)
  for (let i = 0; i < EXPECT.length; i++) {
    if (got[i] !== EXPECT[i]) throw new Error(`${i + 1}번째: ${got[i]} ≠ ${EXPECT[i]}`)
  }
  return true
})

T('「12/20」을 12월 20일로 읽지 않는다 (맞은 개수다)', () => {
  const r = real.rows.find((x: any) => x.student === '강보라' && x.score === 60)
  return !!r && r.date === '2026-09-03' && r.right === 12 && r.total === 20
})

T('푼 것이 없는 학생은 「이력 없음」으로 따로 둔다 (빠뜨린 것과 구분)', () =>
  real.empty.length === 2 && real.empty.includes('오하윤') && real.empty.includes('표나래'))

T('못 읽은 칸이 하나도 없다', () => real.skipped.length === 0)

T('과정과 종류를 제목에서 덜어낸다', () => {
  const r = real.rows[0]
  return r.kind === '학습지' && r.course === '공통수학2 (2022 개정)'
    && r.title === '고1A Daily Test 0903 (lv2.5)'
})

// ★ 원장님이 2026-10-30 에 실제로 쓰신 머리표가 「[주간테스트]」였다. 아는 말이 아니어서
//    머리표가 제목에 그대로 남았는데 **에러는 안 났다.** 그래서 여기서 잡는다.
T('「평가」를 「테스트」로 쓰셔도 머리표로 알아본다', () => {
  const r = parseMatholic('홍길동\n(1/1)\n10/30 20:00\n[주간테스트] 중1-1 전범위_Lv4\n28/30\n93점', TODAY)
  const row = r.rows[0]
  return row.kind === '주간평가' && row.title === '중1-1 전범위_Lv4' && row.level === 4 && row.score === 93
})

T('아는 머리표는 그대로 읽는다 ([주간평가]·[월간평가])', () => {
  const a = parseMatholic('홍길동\n(1/1)\n10/30 20:00\n[주간평가] 중1-1 전범위_Lv4\n28/30\n93점', TODAY)
  const b = parseMatholic('홍길동\n(1/1)\n10/30 20:00\n[월간평가] 중1-1 전범위_Lv4\n28/30\n93점', TODAY)
  return a.rows[0].kind === '주간평가' && b.rows[0].kind === '월간평가'
})

T('모르는 머리표는 지어내지 않는다 — 제목에 그대로 남긴다', () => {
  const r = parseMatholic('홍길동\n(1/1)\n10/30 20:00\n[가나다] 중1-1 전범위_Lv4\n28/30\n93점', TODAY)
  return r.rows[0].kind === '' && r.rows[0].title === '[가나다] 중1-1 전범위_Lv4'
})

T('연도는 앞으로 가지 않게 메운다 (10월에 본 12월은 작년)', () => {
  const r = parseMatholic('홍길동\n(1/1)\n12/28 10:00\n학습지\n단원평가\n5/10\n50점', TODAY)
  return r.rows[0].date === '2025-12-28'
})

T('탭으로 붙어 나와도 똑같이 읽는다 (복사 방식은 화면마다 다르다)', () => {
  const tabbed = '남도윤 (12/12)\n09/09 16:42\t학습지\t초등 6-2 (2022 개정)\t[s코어반] 6학년 2학기 1단원 분수의 나눗셈_Lv5\t28/30\t93점'
  const r = parseMatholic(tabbed, TODAY)
  return r.rows.length === 1 && key(r.rows[0]) === '남도윤|2026-09-09|93|28/30|5'
})

T('채점 전(점수 없는) 건은 넣지 않고 사유를 남긴다', () => {
  const r = parseMatholic('홍길동\n(1/1)\n09/20 10:00\n학습지\n미채점 과제\n\n이몽룡\n(1/1)\n09/21 10:00\n학습지\n단원평가\n5/10\n50점', TODAY)
  return r.rows.length === 1 && r.rows[0].student === '이몽룡' && r.skipped.length === 1
})

T('점수가 0~100 밖이면 넣지 않는다', () => {
  const r = parseMatholic('홍길동\n(1/1)\n09/20 10:00\n학습지\n이상한 것\n5/10\n140점', TODAY)
  return r.rows.length === 0 && r.skipped.length === 1
})

T('데일리테스트는 학습지가 아니라 학습일지로 간다', () => {
  const daily = real.rows.filter((r: any) => isDailyTest(r))
  const names = [...new Set(daily.map((r: any) => r.student))].sort()
  // 붙여넣은 16건 중 「Daily Test」가 제목에 든 것은 4건이다(강보라·문시후·홍예람 9/3, 한지후 8/18).
  return daily.length === 4 && names.join(',') === '강보라,문시후,한지후,홍예람'
})

T('새 제목 규칙 — 머리표로 어디로 갈지 바로 정해진다', () => {
  // 2026-10-29 선생님들과 통일한 제목 규칙: [종류] 학년-학기 단원명_Lv레벨
  const t = `남도윤
(2/2)
09/09 16:42
학습지
초등 6-2 (2022 개정)
[데일리] 초6-2 1단원 분수의 나눗셈_Lv5
28/30
93점`
  const r = parseMatholic(t, TODAY)
  return r.rows.length === 1 && isDailyTest(r.rows[0])
    && r.rows[0].title === '초6-2 1단원 분수의 나눗셈_Lv5' && r.rows[0].level === 5
})

T('TOMA 수학경시대회는 코어테스트 본고사로 간다', () => {
  const t = `남도윤
(1/1)
08/31 18:22
월간평가
초등 6-1 (2022 개정)
제6회 TOMA 수학경시대회 - 초6(2026.08)
24/25
96점`
  const r = parseMatholic(t, TODAY)
  return r.rows.length === 1 && coreTestRound(r.rows[0]) === '본고사'
    && !isDailyTest(r.rows[0]) && r.rows[0].score === 96
})

T('코어테스트 회차는 제목에서 읽는다 (없으면 본고사)', () =>
  coreTestRound({ title: '[코어테스트] 예비 1회 초6-2', kind: '학습지' }) === '예비 1회'
  && coreTestRound({ title: '[코어테스트] 예비2회 초6-2', kind: '학습지' }) === '예비 2회'
  && coreTestRound({ title: '[코어테스트] 초6-2 전범위', kind: '학습지' }) === '본고사'
  && coreTestRound({ title: '공통수학2 주말복습 TEST', kind: '학습지' }) === null)

T('이너프원은 학습지로 넣지 않는다 (내신대비교재다)', () =>
  isEnoughOne({ title: '[이너프원] 중3-2 이차함수', kind: '학습지' })
  && isEnoughOne({ title: '이너프원 중2 내신대비 3단원', kind: '학습지' })
  && !isEnoughOne({ title: '[학습지] 중3-2 이차함수_Lv3', kind: '학습지' }))

T('제목에서 학년·학기·단원·레벨·차수를 칸별로 떼어낸다 (초등)', () => {
  const t = parseWorksheetTitle('초6-2 1단원 분수의 나눗셈_Lv5')
  return t.gradeLevel === '초6' && t.semester === 2 && t.unit === '1단원'
    && t.unitName === '분수의 나눗셈' && t.level === 5 && t.round === null
})

T('제목에서 칸별로 떼어낸다 (중등 · 재도전)', () => {
  const t = parseWorksheetTitle('중1-1 Ⅱ 문자와 식_Lv3.5-2차')
  // 중·고는 학기를 비워 둔다 (지금까지 그렇게 쌓여 있다)
  return t.gradeLevel === '중1' && t.semester === null && t.unit === 'Ⅱ 문자와 식'
    && t.level === 3.5 && t.round === 2
})

T('교재연계로 낸 것은 레벨이 없어도 된다 (쪽 범위로 낸다)', () =>
  !needsLevel({ title: '[쎈] 중등 1-1 (2022개정) P.18 ~ P.80[01-04]', kind: '학습지' })
  && !needsLevel({ title: '[교재] 중1-1 쎈 P.18~P.80', kind: '학습지' }))

T('교재연계로 낸 것은 쌍둥이 학습지로 들어간다', () =>
  worksheetTypeOf({ title: '[교재] 중1-1 쎈 P.18~P.80', kind: '학습지' }) === 'twin'
  && worksheetTypeOf({ title: '[쎈] 중등 1-1 (2022개정) P.18 ~ P.80[01-04]', kind: '학습지' }) === 'twin'
  && worksheetTypeOf({ title: '[오답유사] 중1-1 Ⅱ 문자와 식_Lv3.5', kind: '학습지' }) === 'similar'
  && worksheetTypeOf({ title: '[학습지] 초6-2 1단원 분수의 나눗셈_Lv5', kind: '학습지' }) === 'main')

// ★ 2026-11-02 에 **바뀌었다**: 오답은 레벨을 적어 오지 않고 직전 레벨학습지에서
//   물려받는다. 그래서 오답유사는 더 이상 「레벨이 있어야 한다」가 아니다.
T('레벨학습지는 레벨이 반드시 있어야 한다 (오답은 물려받으므로 뺀다)', () =>
  needsLevel({ title: '[학습지] 중1-1 Ⅱ 문자와 식', kind: '학습지' })
  && !needsLevel({ title: '[오답유사] 중1-1 Ⅱ 문자와 식', kind: '학습지' })
  && !needsLevel({ title: '[주말복습] 고1 공통수학2 도형의 방정식', kind: '학습지' })
  && !needsLevel({ title: '[단원평가] 초6-2 1단원', kind: '단원평가' }))

T('레벨이 제목에 있으면 읽어서 레벨 칸으로 간다', () => {
  const r = parseMatholic(`남도윤
(1/1)
09/09 16:42
학습지
초등 6-2 (2022 개정)
[학습지] 초6-2 1단원 분수의 나눗셈_Lv5
28/30
93점`, TODAY)
  const t = parseWorksheetTitle(r.rows[0].title)
  return r.rows[0].level === 5 && t.unit === '1단원' && t.unitName === '분수의 나눗셈'
})

const SES = (d: string, score: number | null = null) => ({ id: d, student_id: 's', session_date: d, daily_test_score: score })

T('데일리테스트는 그날 수업에 적는다', () => {
  const hit = pickSessionForDaily('2026-09-03', [SES('2026-09-01'), SES('2026-09-03'), SES('2026-09-05')])
  return hit?.session.session_date === '2026-09-03' && hit?.gapDays === 0
})

T('그날 수업이 없으면 **그 뒤** 가장 가까운 수업에 붙인다 (집에서 푼 경우)', () => {
  const hit = pickSessionForDaily('2026-09-02', [SES('2026-09-01'), SES('2026-09-05'), SES('2026-09-08')])
  return hit?.session.session_date === '2026-09-05' && hit?.gapDays === 3
})

T('앞의 수업에는 절대 붙이지 않는다 (아직 풀지도 않은 날이다)', () =>
  pickSessionForDaily('2026-09-10', [SES('2026-09-01'), SES('2026-09-08')]) === null)

T('그 뒤 수업이 너무 멀면 적지 않는다', () =>
  pickSessionForDaily('2026-09-02', [SES('2026-10-01')]) === null)

T('수업이 아예 없으면 적지 않는다', () =>
  pickSessionForDaily('2026-09-02', []) === null)

// 개념 사전 한 토막 (스터디체크 concepts 와 같은 꼴: 대단원 / 중단원 / 소개념)
const CONCEPTS = [
  { grade: '중1', semester: 1, chapter: 'Ⅰ 수와 연산', sub_chapter: '1. 소인수 분해', concept_name: '소인수분해' },
  { grade: '중1', semester: 1, chapter: 'Ⅰ 수와 연산', sub_chapter: '2. 정수와  유리수', concept_name: '절댓값' },
  { grade: '중1', semester: 1, chapter: 'Ⅱ 문자와 식', sub_chapter: '1. 문자의 사용과 식의 계산', concept_name: '일차식의 계산' },
  { grade: '중1', semester: 1, chapter: 'Ⅱ 문자와 식', sub_chapter: '2. 일차방정식', concept_name: '일차방정식의 활용' },
  { grade: '고1', semester: 1, chapter: 'Ⅱ 도형의 방정식', sub_chapter: '2. 원의 방정식', concept_name: '원과 직선의 위치 관계' },
  { grade: '초6', semester: 2, chapter: '1단원', sub_chapter: '분수의 나눗셈', concept_name: '분수의 나눗셈의 활용' },
]

T('소개념 이름으로 써도 대단원까지 찾아 올린다', () => {
  const r = resolveUnit('원과 직선의 위치 관계', '고1', CONCEPTS as any)
  return r?.level === '소개념' && r?.chapter === 'Ⅱ 도형의 방정식' && r?.subChapter === '2. 원의 방정식'
})

T('중단원 이름으로 써도 찾는다 (번호가 있든 없든)', () => {
  const a = resolveUnit('원의 방정식', '고1', CONCEPTS as any)
  const b = resolveUnit('2. 원의 방정식', '고1', CONCEPTS as any)
  return a?.chapter === 'Ⅱ 도형의 방정식' && b?.chapter === 'Ⅱ 도형의 방정식'
})

T('대단원 이름으로 써도 찾는다 (로마숫자·띄어쓰기 달라도)', () => {
  const a = resolveUnit('문자와 식', '중1', CONCEPTS as any)
  const b = resolveUnit('Ⅱ문자와식', '중1', CONCEPTS as any)
  return a?.chapter === 'Ⅱ 문자와 식' && b?.chapter === 'Ⅱ 문자와 식'
})

T('초등 단원 이름도 같은 규칙으로 찾는다', () => {
  const r = resolveUnit('분수의 나눗셈', '초6', CONCEPTS as any)
  return r?.chapter === '1단원' && r?.subChapter === '분수의 나눗셈'
})

T('상관없는 말은 억지로 집지 않는다 (엉뚱한 단원에 점수가 들어가면 안 된다)', () =>
  resolveUnit('주말복습 TEST', '중1', CONCEPTS as any) === null
  && resolveUnit('가나다라마바사', '중1', CONCEPTS as any) === null)

T('학년이 다르면 그 학년 것에서 찾는다', () => {
  const r = resolveUnit('일차방정식', '중1', CONCEPTS as any)
  return r?.chapter === 'Ⅱ 문자와 식'
})

T('과정 칸에서 진짜 학년을 읽는다 (선행하는 학생은 학년과 과정이 다르다)', () => {
  const a = gradeFromCourse('중등 1-1 (2022 개정)')
  const b = gradeFromCourse('초등 6-2 (2022 개정)')
  return a?.grade === '중1' && a?.semester === null && b?.grade === '초6' && b?.semester === 2
    && gradeFromCourse('공통수학2 (2022 개정)') === null
})

T('초6 학생이 푼 중1 단원도 찾아낸다 (학생 학년으로 뒤지면 못 찾는다)', () => {
  const g = gradeFromCourse('중등 1-1 (2022 개정)')?.grade ?? '초6'
  const r = resolveUnit('문자와 식', g, CONCEPTS as any)
  return r?.chapter === 'Ⅱ 문자와 식'
})

T('주말복습 TEST 는 데일리테스트가 아니다 (학습지로 간다)', () =>
  !isDailyTest({ title: '공통수학2 주말복습 TEST 0822', kind: '학습지' })
  && isDailyTest({ title: '고1A Daily Test 0903 (lv2.5)', kind: '학습지' })
  && isDailyTest({ title: '데일리 테스트 3회', kind: '학습지' }))

// ── 학생 찾기 — 동명이인
const ALL = [
  { id: 'a', name: '한지후', grade: '고1', teacher_name: '주한' },
  { id: 'b', name: '한지후', grade: '중1', teacher_name: '신애진' },
  { id: 'c', name: '정우찬', grade: '고1', teacher_name: '주한' },
  { id: 'd', name: '정우찬', grade: '중1', teacher_name: '신애진' },
  { id: 'e', name: '문시후', grade: '고1', teacher_name: '주한' },
]

T('동명이인은 자동으로 정하지 않고 후보를 모두 돌려준다', () =>
  findStudents('한지후', ALL).length === 2)

T('「정우찬2」 같은 꼬리 숫자도 혼자 정하지 않는다', () => {
  const got = findStudents('정우찬2', ALL)
  return got.length === 2
})

T('꼬리 붙은 이름이 스터디체크에 따로 저장돼 있으면 둘 다 후보다', () => {
  const two = [
    { id: 'p1', name: '한지후', grade: '중2', teacher_name: '신애진' },
    { id: 'p2', name: '한지후2', grade: '중2', teacher_name: '박경미' },
  ]
  return findStudents('한지후2', two as any).length === 2
})

// ★ 매쓰홀릭과 스터디체크에 **다른 이름**으로 등록된 학생 (원장님 2026-11-02
//   「스터디체크에는 스미스마이클로 등록은 되어 있는데 매쓰홀릭에는 마이클로」).
//   실명은 쓰지 않는다 — 꼴만 같은 가짜 이름으로 시험한다.
const 다른이름 = [
  { id: 'n1', name: '스미스마이클', grade: '중2', teacher_name: '김은수' },  // 성 + 이름 붙여 등록
  { id: 'n2', name: '홍길동j', grade: '중2', teacher_name: '김은수' },        // 스터디체크에만 꼬리
  { id: 'n3', name: '김서연', grade: '중1', teacher_name: '박경미' },
  { id: 'n4', name: '최서연', grade: '중1', teacher_name: '박경미' },
]

T('성을 빼고 부르는 이름도 찾는다 (마이클 → 스미스마이클)', () => {
  const got = findStudents('마이클', 다른이름 as any)
  return got.length === 1 && got[0].id === 'n1'
})

T('스터디체크에만 꼬리가 붙어 있어도 찾는다 (홍길동 → 홍길동j)', () => {
  const got = findStudents('홍길동', 다른이름 as any)
  return got.length === 1 && got[0].id === 'n2'
})

T('이름 일부가 여럿에 걸리면 고르지 않고 사람에게 묻는다', () =>
  findStudents('서연', 다른이름 as any).length === 2)

T('한 글자로는 찾지 않는다 — 아무 이름에나 들어간다', () =>
  findStudents('연', 다른이름 as any).length === 0
  // 거꾸로도 마찬가지 — 스터디체크 이름이 한 글자면 긴 이름 속에 그냥 들어간다
  && findStudents('홍길동동', [{ id: 'y1', name: '홍' }] as any).length === 0)

T('딱 맞는 이름이 있으면 일부로는 더 찾지 않는다', () => {
  const two = [
    { id: 'x1', name: '홍길동', grade: '중2', teacher_name: '김은수' },
    { id: 'x2', name: '홍길동이', grade: '중3', teacher_name: '박경미' },
  ]
  const got = findStudents('홍길동', two as any)
  return got.length === 1 && got[0].id === 'x1'
})

T('이름이 다르면 화면에 적을 수 있게 알려 준다', () =>
  nameDiffers('마이클', 다른이름[0] as any) === true
  && nameDiffers('홍길동', { id: 'z', name: '홍길동' } as any) === false
  && nameDiffers('홍 길동', { id: 'z', name: '홍길동' } as any) === false
  && nameDiffers('마이클', null) === false)

// 규칙은 설정(app_settings)에서 오므로 시험에서는 그냥 넘겨준다 — 실명을 쓸 일이 없다.
const RULE_CASE = [
  { id: 'hi', name: '정우찬', grade: '고1', teacher_name: '주한' },
  { id: 'mi', name: '정우찬', grade: '중1', teacher_name: '신애진' },
]
const RULES = { '정우찬2': '주한' }

T('규칙이 있으면 그걸로 고른다 (꼬리2 → 그 담당 강사)', () =>
  pickByRule('정우찬2', RULE_CASE as any, RULES)?.id === 'hi')

T('규칙에 없는 이름은 아무도 고르지 않는다 (사람이 골라야)', () =>
  pickByRule('아무개2', RULE_CASE as any, RULES) === null
  && pickByRule('정우찬2', RULE_CASE as any, {}) === null)

T('같은 이름이 하나뿐이면 바로 찾는다', () => {
  const got = findStudents('문시후', ALL)
  return got.length === 1 && got[0].id === 'e'
})

// ── 어느 학습지에 붙일지
const WS = (o: any) => ({
  id: o.id, student_id: 's', grade_level: o.grade_level ?? '초6',
  unit: o.unit ?? '1단원', unit_name: o.unit_name ?? '분수의 나눗셈',
  current_level: o.current_level ?? null, worksheet_type: o.worksheet_type ?? 'main',
  status: o.status ?? 'assigned', score: o.score ?? null,
  assigned_at: o.assigned_at ?? '2026-09-04T00:00:00Z', submitted_at: o.submitted_at ?? null,
})
const ROW = (o: any) => ({
  line: 1, student: '남도윤', date: o.date ?? '2026-09-09', kind: '학습지', course: '',
  title: o.title ?? '[s코어반] 6학년 2학기 1단원 분수의 나눗셈_Lv5',
  level: o.level === undefined ? 5 : o.level,
  right: 28, total: 30, score: o.score ?? 93, raw: '',
})

T('단원과 레벨이 맞으면 1등으로 올라온다', () => {
  const ranked = rankWorksheets(ROW({}), [
    WS({ id: 'x', current_level: 4 }),
    WS({ id: 'y', current_level: 5 }),
  ])
  return ranked[0].ws.id === 'y' && isClearWinner(ranked)
})

T('레벨만 다른 같은 단원이 둘이면 사람이 고르게 둔다', () => {
  const ranked = rankWorksheets(ROW({ level: null }), [
    WS({ id: 'x', current_level: 4 }),
    WS({ id: 'y', current_level: 5 }),
  ])
  return ranked.length === 2 && !isClearWinner(ranked)
})

T('붙일 데가 아예 없으면 빈 목록 (새로 만들어야 한다 — 주한 선생님 고1이 이 경우다)', () => {
  const ranked = rankWorksheets(
    ROW({ title: '고1A Daily Test 0903 (lv2.5)', level: 2.5 }),
    [WS({ id: 'x', current_level: 5, unit: 'Ⅱ 문자와 식', unit_name: '일차방정식' })])
  return !isClearWinner(ranked)
})

T('레벨만 같고 단원이 다르면 「확실함」이 아니다 (엉뚱한 학습지에 붙으면 안 된다)', () => {
  // 2026-10-29 실제로 있었던 일: 강보라 「고1A Daily Test (lv2.5)」가
  // 「명제~무리함수 Lv2.5」에 붙었다. 레벨 말고는 아무 상관이 없는 학습지였다.
  const ranked = rankWorksheets(
    ROW({ title: '고1A Daily Test 0903 (lv2.5)', level: 2.5 }),
    [WS({ id: 'x', current_level: 2.5, grade_level: '고1', unit: 'Ⅰ 명제', unit_name: '명제~무리함수' })])
  return ranked.length === 1 && ranked[0].points >= 6 && !isClearWinner(ranked)
})

T('새 제목 규칙 — 머리표가 오답유사면 오답유사 학습지에 그대로 붙는다', () => {
  const t = `남도윤
(1/1)
09/09 16:42
학습지
초등 6-2 (2022 개정)
[오답유사] 초6-2 1단원 분수의 나눗셈_Lv4
9/10
90점`
  const r = parseMatholic(t, TODAY)
  const ranked = rankWorksheets(r.rows[0], [
    WS({ id: 'm', current_level: 4, unit: '1단원', unit_name: '분수의 나눗셈', worksheet_type: 'main' }),
    WS({ id: 's', current_level: 4, unit: '1단원', unit_name: '분수의 나눗셈', worksheet_type: 'similar' }),
  ])
  return !isDailyTest(r.rows[0]) && ranked[0].ws.id === 's' && isClearWinner(ranked)
})

T('쌍둥이는 쌍둥이 학습지에 붙는다 (레벨학습지에 붙으면 안 된다)', () => {
  const ranked = rankWorksheets(
    { ...ROW({}), title: '[교재] 초6-2 쎈 P.18~P.40', level: null },
    [WS({ id: 'main' }), WS({ id: 'twin', worksheet_type: 'twin' })])
  return ranked[0].ws.id === 'twin'
})

T('오답유사는 오답유사 학습지에 붙는다', () => {
  const ranked = rankWorksheets(
    { ...ROW({}), title: '(2026.08.26) 오답유사 과제', level: null },
    [WS({ id: 'main' }), WS({ id: 'sim', worksheet_type: 'similar' })])
  return ranked[0].ws.id === 'sim'
})

T('같은 걸 또 붙여넣어도 두 번 안 들어간다', () => {
  const row = ROW({})
  const same = WS({ id: 'z', score: 93, submitted_at: '2026-09-09T05:00:00Z' })
  const other = WS({ id: 'w', score: 93, submitted_at: '2026-09-11T05:00:00Z' })
  return alreadyIn(row, same) === true && alreadyIn(row, other) === false
})

// ── 화면에 찍는 단원 글자 (원장님 2026-10-31 「전범위 전범위 Lv4로 나온다」) ─────────
//    student_worksheets 는 단원을 두 칸으로 들고 있다. 쪼갤 것이 없는 제목은 두 칸이
//    같은 값이 되고, 그걸 이어 붙이면 같은 말이 두 번 나간다.

T('전범위처럼 두 칸이 같으면 한 번만 찍는다', () =>
  unitLabel('전범위', '전범위') === '전범위'
  && unitParen('전범위', '전범위') === '전범위'
  && unitNameBeside('전범위', '전범위') === '')

T('두 칸이 다르면 둘 다 살린다', () =>
  unitLabel('2단원', '소수의 나눗셈') === '2단원 소수의 나눗셈'
  && unitParen('2단원', '소수의 나눗셈') === '2단원 (소수의 나눗셈)')

T('소단원이 대단원을 품고 있으면 긴 쪽만 찍는다', () =>
  unitLabel('2단원', '2단원 소수의 나눗셈') === '2단원 소수의 나눗셈'
  && unitParen('2단원', '2단원 소수의 나눗셈') === '2단원 소수의 나눗셈')

T('빈칸·공백 차이는 같은 말로 본다', () =>
  unitLabel('전범위', ' 전 범 위 ') === '전범위'
  && unitLabel('', '복합') === '복합'
  && unitLabel('복합', null) === '복합'
  && unitLabel(null, null) === '')

// ★ 일곱째 자리 — 학부모 **과제 칸**. 여기가 가장 아팠다.
//   과제 배부 글(class_sessions.hw_worksheet_range)은 formatWorksheetScope 가 만든다.
//   개념 사전에 안 걸리면 단원 이름을 그대로 돌려주는데, 단원 칸과 같은 말이면
//   「3단원 (3단원)」이 되고 그 줄이 **학부모께 그대로 나간다** — 2026-10-30 에 13명.
T('과제 칸 — 범위가 단원과 같은 말이면 괄호를 안 만든다', () =>
  formatWorksheetScope([], '* 레벨학습지 (5-2) 3단원 *', '* 레벨학습지 (5-2) 3단원 *') === ''
  && formatWorksheetScope([], '전범위', '전범위') === '')

T('과제 칸 — 범위가 다르면 그대로 쓴다', () =>
  formatWorksheetScope([], '2단원', '소수의 나눗셈') === '소수의 나눗셈')

T('과제 칸 — 단원 이름이 없으면 빈 글자', () =>
  formatWorksheetScope([], '3단원', null) === '' && formatWorksheetScope([], '3단원', '') === '')

T('레벨 4.0 은 4 로, 3.5 는 3.5 로 찍는다', () =>
  levelText('4.0') === '4' && levelText(4) === '4' && levelText('3.5') === '3.5'
  && levelText(null) === '')

// ── 원장님 2026-11-02 매쓰홀릭 규칙 셋 ──────────────────────────────────────

T('월간평가는 코어테스트로 올린다', () =>
  coreTestRound({ title: '초6 월간평가 3회', kind: '월간평가' }) === '월간평가')

// ★ 매쓰홀릭은 TOMA 건에도 종류를 「월간평가」로 붙인다. 월간평가를 먼저 보면
//   TOMA 본고사가 「월간평가」로 밀린다 — 실제로 이 검사가 그 실수를 잡았다.
T('TOMA 가 월간평가보다 먼저다 (매쓰홀릭이 TOMA 에도 월간평가를 붙인다)', () =>
  coreTestRound({ title: '제6회 TOMA 수학경시대회 - 초6', kind: '월간평가' }) === '본고사'
  && coreTestRound({ title: 'TOMA 예비 2회', kind: '월간평가' }) === '예비 2회')

T('월간평가도 TOMA 도 아니면 코어테스트가 아니다', () =>
  coreTestRound({ title: '초6-2 3단원 소수의 나눗셈', kind: '학습지' }) === null)

// ★ 레벨이 없고 「N회차」면 이너프원 — 안 넣는다.
T('레벨 없이 「3회차」면 이너프원이다 (안 넣는다)', () =>
  isEnoughOne({ title: '중3 3회차', kind: '', level: null }) === true)

T('레벨이 있으면 회차가 적혀 있어도 이너프원이 아니다', () =>
  isEnoughOne({ title: '중3 3회차', kind: '', level: 3 }) === false)

T('이름이 적힌 이너프원은 레벨이 있어도 이너프원이다', () =>
  isEnoughOne({ title: '이너프원 삼각비 (2)', kind: '', level: 3 }) === true)

// ★ 이 판정이 화면에서 맨 먼저 돈다 — 여기서 걸리면 그 줄은 통째로 사라진다.
//   다른 칸으로 갈 줄(오답·데일리·코어테스트)을 가로채면 안 된다.
T('오답·데일리·코어테스트는 회차가 적혀 있어도 이너프원으로 보내지 않는다', () =>
  isEnoughOne({ title: '오답문제 2회차', kind: '', level: null }) === false
  && isEnoughOne({ title: 'Daily Test 3회차', kind: '데일리', level: null }) === false
  && isEnoughOne({ title: '[코어테스트] 예비 1회 2회차', kind: '학습지', level: null }) === false)

// ★ 오답 — 「오답유사」만 보던 것을 「오답」으로 넓혔다.
T('오답유사·오답문제·오답모음이 모두 오답 학습지다', () =>
  isWrongNote({ title: '오답유사 3단원' }) && isWrongNote({ title: '오답문제 2회차' })
  && isWrongNote({ title: '기본도형 오답 모음' }) && !isWrongNote({ title: '3단원 소수의 나눗셈' }))

T('오답은 similar 로 들어간다', () =>
  worksheetTypeOf({ title: '오답문제 2회차', kind: '학습지' }) === 'similar')

T('오답은 레벨이 없어도 막지 않는다 (물려받으니까)', () =>
  needsLevel({ title: '오답문제 2회차', kind: '학습지' }) === false
  && needsLevel({ title: '초6-2 3단원 소수의 나눗셈', kind: '학습지' }) === true)

T('오답 제목에 「오답학습지」를 넣고, 레벨은 직전 레벨학습지와 같게', () => {
  const a = wrongNoteFix('3단원 소수의 나눗셈', null, 3.5)
  const b = wrongNoteFix('오답학습지 3단원', 2, 4)
  const c = wrongNoteFix('3단원', 2.5, null)
  return a.unitName === '오답학습지 3단원 소수의 나눗셈' && a.level === 3.5
    && b.unitName === '오답학습지 3단원' && b.level === 4          // 이미 있으면 안 겹쳐 쓴다
    && c.unitName === '오답학습지 3단원' && c.level === 2.5        // 직전이 없으면 적힌 대로
})

T('직전 레벨은 그 날짜까지의 마지막 레벨학습지에서 가져온다', () => {
  const ws = (assigned: string, type: string, level: number | null) =>
    ({ id: assigned + type, student_id: 'S', grade_level: null, unit: null, unit_name: null,
      current_level: level, worksheet_type: type, status: 'scored', score: 80,
      assigned_at: assigned + 'T12:00:00+09:00', submitted_at: null })
  const list = [ws('2026-10-01', 'main', 3), ws('2026-10-20', 'main', 3.5),
    ws('2026-10-25', 'similar', 9), ws('2026-11-05', 'main', 4)]
  return prevLevelOf(list, '2026-10-30') === 3.5      // 11/05 것을 거꾸로 물려받지 않는다
    && prevLevelOf(list, '2026-10-10') === 3
    && prevLevelOf(list, '2026-09-01') === null
    && prevLevelOf([], '2026-10-30') === null
})

// ── 교재 이름이 적혀 있으면 쌍둥이 (원장님 2026-11-02) ──────────────────────
//   「레벨이 없어도 시중교재나 교과서가 붙어있으면 쌍둥이 학습지로 넣어달라」.
//   교재 이름은 코드에 박지 않고 textbook_catalog 를 읽는다 — 아래는 실제 목록에서
//   **까다로운 것만** 골라 온 것이다(한 글자 · 전각 · 괄호 · 긴 이름이 짧은 이름을 품는 것).
//   ★ 괄호 안 학생 이름은 여기 적지 않는다 — 가짜 이름(홍길동)으로 시험한다.
const BOOKS = ['쎈', '쎈B', '베이직쎈', '라이트쎈', '쎈연산', '개념원리', '일품', '최상위',
  '개념+유형', '개념＋유형(유형편)', '블랙라벨', '마플교과서', '교과서 개념잡기',
  '모의고사 1부', '디딤돌 연산', 'RPM', '쎈 (홍길동)']

T('교재 이름이 적혀 있으면 쌍둥이다 (레벨이 없어도)', () =>
  worksheetTypeOf({ title: '중1-1 개념원리 3단원', kind: '학습지' }, BOOKS) === 'twin'
  && worksheetTypeOf({ title: '[쎈] 중등 1-1 (2022개정) P.18 ~ P.80', kind: '학습지' }, BOOKS) === 'twin'
  && worksheetTypeOf({ title: '중3 블랙라벨 이차함수', kind: '학습지' }, BOOKS) === 'twin')

T('교과서가 붙어 있으면 쌍둥이다', () =>
  worksheetTypeOf({ title: '초6-2 교과서 2단원', kind: '학습지' }, BOOKS) === 'twin'
  && worksheetTypeOf({ title: '고1 마플교과서 도형의 방정식', kind: '학습지' }, BOOKS) === 'twin')

// ★ 출판사 이름이 앞에 붙어도 「교과서」만 들어 있으면 걸려야 한다
//   (원장님 2026-11-02 「비상교과서 이렇게 교과서가 들어갔는데도 쌍둥이로 안걸리는것도 문제야」).
//   목록(textbook_catalog)에 없는 출판사라도 「교과서」 글자로 걸린다 — 목록을 안 넘겨도 된다.
T('「비상교과서」처럼 출판사가 붙어도 쌍둥이다', () =>
  worksheetTypeOf({ title: '중1-1 비상교과서 3단원', kind: '학습지' }, BOOKS) === 'twin'
  && worksheetTypeOf({ title: '중1-1 비상교과서 3단원', kind: '학습지' }) === 'twin'
  && worksheetTypeOf({ title: '중2-2 천재교과서 피타고라스', kind: '학습지' }) === 'twin'
  && needsLevel({ title: '중1-1 비상교과서 3단원', kind: '학습지' }) === false
  && isEnoughOne({ title: '중1-1 비상교과서 3회차', kind: '학습지', level: null }) === false)

T('교재 이름이 없으면 레벨학습지 그대로다', () =>
  worksheetTypeOf({ title: '초6-2 2단원 분수의 나눗셈_Lv5', kind: '학습지' }, BOOKS) === 'main'
  && worksheetTypeOf({ title: '중3-2 이차함수_Lv3', kind: '학습지' }, BOOKS) === 'main')

T('목록을 안 넘기면 교재 이름으로는 안 걸린다 (옛 동작 그대로)', () =>
  worksheetTypeOf({ title: '중1-1 개념원리 3단원', kind: '학습지' }) === 'main'
  && worksheetTypeOf({ title: '[교재] 중1-1 P.18~P.80', kind: '학습지' }) === 'twin')

// ★ 「쎈」은 한 글자다. 그냥 찾으면 단원 이름 속 한 글자에 걸린다.
T('한 글자 교재 이름은 낱말로 떨어져 있을 때만 걸린다', () =>
  matchTextbook('쎈3-2 1단원', ['쎈']) === '쎈'
  && matchTextbook('중1-1 쎈 P.18~P.80', ['쎈']) === '쎈'
  && matchTextbook('초6-2 분수의 나눗셈', ['수']) === null      // 「분수의」의 「수」에 안 걸린다
  && matchTextbook('초6-2 분수의 나눗셈', ['쎈']) === null)

T('긴 이름부터 맞춘다 — 쎈이 베이직쎈·쎈B 안에 들어 있다', () =>
  matchTextbook('중1-1 베이직쎈 P.10~P.30', BOOKS) === '베이직쎈'
  && matchTextbook('중1-1 쎈B 3단원', BOOKS) === '쎈B'
  && matchTextbook('중1-1 라이트쎈 3단원', BOOKS) === '라이트쎈')

T('전각·띄어쓰기 차이를 같은 교재로 본다', () =>
  matchTextbook('중2 개념＋유형(유형편) p.12~p.40', BOOKS) === '개념＋유형(유형편)'
  && matchTextbook('중2 개념+유형 3단원', BOOKS) === '개념+유형'
  && matchTextbook('초5 디딤돌연산 2단원', BOOKS) === '디딤돌 연산'
  && matchTextbook('중3 rpm 유형편', BOOKS) === 'RPM'
  && normBook(' 개념＋유형  ') === '개념+유형')

// ★ 교재 목록에 교재명 뒤 괄호로 **학생 이름**이 붙은 것이 넷 있다(2026-10-31 확인).
//   괄호를 떼면 교재명만 남으므로 학생 이름은 대조에 들어가지 않는다.
T('교재 목록의 괄호 안 이름은 교재명으로 세지 않는다', () =>
  matchTextbook('중1-1 쎈 P.18~P.80', ['쎈 (홍길동)']) === '쎈'
  && matchTextbook('홍길동 숙제 3단원', ['쎈 (홍길동)']) === null)

T('교재 이름만 적힌 줄은 레벨이 없어도 막지 않는다', () =>
  needsLevel({ title: '중1-1 개념원리 3단원', kind: '학습지' }, BOOKS) === false
  && needsLevel({ title: '초6-2 교과서 2단원', kind: '학습지' }, BOOKS) === false
  && needsLevel({ title: '초6-2 2단원 분수의 나눗셈', kind: '학습지' }, BOOKS) === true)

T('교재 줄에 회차가 적혀 있어도 이너프원으로 보내지 않는다', () =>
  isEnoughOne({ title: '중1-1 개념원리 3회차', kind: '학습지', level: null }, BOOKS) === false
  && isEnoughOne({ title: '중1-1 3회차', kind: '학습지', level: null }, BOOKS) === true)

T('오답이 교재보다 먼저다 — 「쎈 오답문제」는 오답 학습지다', () =>
  worksheetTypeOf({ title: '중1-1 쎈 오답문제', kind: '학습지' }, BOOKS) === 'similar'
  && isTextbookLinked({ title: '중1-1 쎈 오답문제', kind: '학습지' }, BOOKS) === true)

// ── 레벨 칸은 비울 수 없다 (2026-11-02) ─────────────────────────────────────
//   student_worksheets.current_level 은 NOT NULL 이다. 레벨 없이 들어가게 막이를 푼 날
//   19건이 「violates not-null constraint」로 통째로 실패했다 — 에러는 저장 뒤에야 보인다.
T('레벨이 없으면 Lv1 로 넣는다 (비워 보내면 DB 가 거절한다)', () =>
  levelForInsert(null) === DEFAULT_LEVEL && levelForInsert(undefined) === DEFAULT_LEVEL
  && levelForInsert(3.5) === 3.5 && levelForInsert(0) === 0 && DEFAULT_LEVEL === 1)

// ★ 화면이 그 함수를 **실제로 쓰는지**까지 본다 — 함수만 고치고 넣는 자리를 안 고치면
//   그 줄만 조용히 안 들어간다(그게 이번에 일어난 일이다).
T('매쓰홀릭 화면이 레벨 칸을 비우지 않고 넣는다', () => {
  const src = fs.readFileSync(path.resolve('app/teacher/assignments/matholic/page.tsx'), 'utf8')
  const 넣는줄 = src.match(/current_level:[^,\n]+/g) ?? []
  return 넣는줄.length > 0 && 넣는줄.every((l) => /levelForInsert|레벨/.test(l)) && src.includes('levelForInsert(')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
