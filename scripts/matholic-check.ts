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
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/matholic.ts')
const { parseMatholic, findStudents, rankWorksheets, isClearWinner, alreadyIn, isDailyTest, pickByRule } =
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

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
