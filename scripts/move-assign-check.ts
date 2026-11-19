/**
 * 진급 배정판(lib/moveAssign.ts) 자가확인.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/move-assign-check.ts
 *
 * 앞쪽은 DB 없이 돈다. `.env.local` 이 있으면 **운영 데이터로도** 재 본다
 * (읽기만 한다 — 아무것도 고치지 않는다).
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  WD, WE, DAYS_WD, DAYS_WE, ROWS_WD, ROWS_WE, ROWS_MID, ROWS_ELEM,
  EXTRA, HIGH_TEACHERS, HIGH_PICKS, MID_PICKS, DRAFT_HIGH, DRAFT_MID, NO_SHOW,
  GRADES_ELEM, ELEM_PICKS, ELEM_STARTS, ELEM_PERIODS, nextGrade, elemDraft,
  parseNewTime, newTimeText, newTimeAt, newTimeDays, sameTime, withDay,
  keyOf, isAt, worksOn, weekendPickable, weekendOwner, oddSaturday, clashesWithOff, toMin,
  planLines, wantLines, linesKey, confirmStateOf, pickRequests,
} from '../lib/moveAssign.ts'

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
}

// ① 타임표가 성립하나
const ALL_DAYS = [...DAYS_WD, ...DAYS_WE] as string[]
for (const [key, g] of [...Object.entries(WD), ...Object.entries(WE)]) {
  ok(!!g.label && !!g.det, `${key} 에 이름·설명이 있어야 한다`)
  ok(g.pieces.length > 0, `${key} 에 조각이 있어야 한다`)
  for (const [who, day, a, b] of g.pieces) {
    ok(!!who, `${key} 조각에 담당이 있어야 한다`)
    ok(ALL_DAYS.includes(day), `${key} 조각의 요일(${day})이 이상하다`)
    ok(a < b, `${key} 조각의 시각이 거꾸로다`)
  }
}
ok(Object.keys(WD).filter((k) => WD[k].t === '최대호').length === 6, '최대호 선생님 평일 타임은 6개(월·금 3 · 수 3)')
ok(WD['at3'].locked === '최다윤 · 하지원 · 이지훈 자리', '월·금 7~10 은 이미 찬 자리로 표시한다')
ok(WD['jb0'].solo === true, '혼자 쓰는 자리는 solo 로 둬서 고르는 목록에서 뺀다')

// ② 토·일 고르기 규칙
ok(weekendPickable('sat-c1', '최대호'), '최대호 반 학생은 토 클리닉 1타임을 고를 수 있다')
ok(!weekendPickable('sat-c1', '주한'), '주한 반 학생에게 최대호 선생님 토요일이 떠선 안 된다')
ok(weekendPickable('j-sat2', '최대호') && weekendPickable('j-sat2', '주한'), '주한 선생님 토 클리닉은 양쪽 다 고를 수 있다')
ok(!weekendPickable('j-w1', '주한'), '주말 수업만 다니는 자리(solo)는 고르는 목록에 없다')
ok(weekendOwner('j-sat2') === '주한', '주한 토 클리닉은 주한 선생님 시간표에 그린다')
ok(weekendOwner('sat-r1') === '최대호', '토 정규는 최대호 선생님 시간표에 그린다')

// ③ 칸에 누가 있나 (수업과 클리닉이 갈려야 한다)
ok(isAt('최대호', '월', '16:00', 30, 'at1'), '월·금 4~7 타임의 16시는 최대호 수업')
ok(isAt('최대호', '금', '17:30', 30, 'at1'), '같은 타임이 금요일에도 있다')
ok(!isAt('최대호', '수', '16:00', 30, 'at1'), '월·금 타임은 수요일에 없다')
ok(isAt('이규숙', '월', '18:00', 30, 'at1'), '18시는 채움쌤 클리닉')
ok(!isAt('최대호', '월', '18:00', 30, 'at1'), '그 시각에 키움쌤은 없다')
ok(isAt('주한', '화', '17:30', 30, 'ja'), '화·목 5:30 타임은 주한 수업')
ok(isAt('최대호', '토', '10:00', 60, 'bt1', 'sat-r1'), '토 정규는 10시부터')
ok(!isAt('최대호', '토', '14:00', 60, 'bt1', 'sat-r1'), '1타임은 14시에 끝나 있다')
ok(worksOn('이규숙', '월') && !worksOn('이규숙', '토'), '채움쌤은 평일 클리닉만')
ok(worksOn('주한', '일'), '주한 선생님은 일요일 수업이 있다')

// ④ 살펴볼 줄
ok(oddSaturday('최대호', 'bt1', 'sat-c1') === '수 반인데 토 정규를 안 옴', '수 반 + 클리닉만 → 살펴볼 줄')
ok(oddSaturday('최대호', 'at2', 'sat-r2') === '월·금 반인데 토 정규까지 옴', '월·금 반 + 토 정규 → 살펴볼 줄')
ok(oddSaturday('최대호', 'bt1', 'sat-r1') === null, '수 반 + 토 정규는 기본이다')
ok(oddSaturday('최대호', 'at1', 'sat-c2') === null, '월·금 반 + 클리닉만도 기본이다')
ok(oddSaturday('주한', 'jb', 'j-sat2') === null, '주한 선생님 반은 이 규칙을 보지 않는다')
ok(oddSaturday('최대호', 'bt1', '') === null, '아직 안 고른 줄은 흠이 아니다')

// ⑤ 못 오시는 요일
ok(clashesWithOff('신애진', ['월', '목']).join() === '목', '신애진 선생님 목요일은 걸려야 한다')
ok(clashesWithOff('신애진', ['월', '수', '금']).length === 0, '목요일이 없으면 안 걸린다')
ok(clashesWithOff('박경미', ['목']).length === 0, '다른 선생님은 목요일도 괜찮다')
ok(Object.keys(NO_SHOW).length > 0, '못 오시는 요일 표가 비어 있다')

// ⑥ 첫 제안이 성립하나
const m3Keys = Object.keys(DRAFT_HIGH).filter((k) => k.endsWith('|중3'))
ok(m3Keys.length === 38, `고등 판 초안의 중3 은 38명이어야 한다 (지금 ${m3Keys.length})`)
ok(Object.keys(DRAFT_HIGH).length === 55, `고등 판 초안은 중3 38 + 지금 고등부 17 = 55줄 (지금 ${Object.keys(DRAFT_HIGH).length})`)
for (const [k, [t, wd, we]] of Object.entries(DRAFT_HIGH)) {
  ok(HIGH_PICKS.includes(t) || t === '', `${k} 의 선생님(${t})이 고를 수 없는 이름이다`)
  ok(wd === '' || !!WD[wd], `${k} 의 평일 타임(${wd})이 없는 타임이다`)
  ok(we === '' || !!WE[we], `${k} 의 토·일 타임(${we})이 없는 타임이다`)
  if (t === '김은수') ok(wd === '' && we === '', `${k} 는 중등에 남으므로 고등 타임이 없어야 한다`)
  if (t && t !== '김은수' && wd) ok(WD[wd].t === t, `${k} 의 평일 타임이 다른 선생님 것이다`)
  if (t && t !== '김은수' && we) ok(weekendPickable(we, t) || WE[we].solo, `${k} 의 토·일 타임을 그 선생님 반이 고를 수 없다`)
}
ok(Object.keys(DRAFT_MID).length === 27, `중등 판 초안은 27명 (지금 ${Object.keys(DRAFT_MID).length})`)
for (const [k, t] of Object.entries(DRAFT_MID)) {
  ok(MID_PICKS.includes(t), `${k} 의 선생님(${t})이 고를 수 없는 이름이다`)
  ok(k.endsWith('|초6'), `${k} 는 초6 이어야 한다`)
}
ok(keyOf(' 홍채은 ', '초6') === '홍채은|초6', '이름·학년 열쇠는 앞뒤 공백을 떼고 만든다')

// ⑥-2 따로 부르는 추가 클리닉 (원장님 2026-11-17 — 채움쌤 근무가 9시까지)
ok(Object.keys(EXTRA).length >= 1, '추가 클리닉 자리가 있어야 한다')
for (const [k, g] of Object.entries(EXTRA)) {
  ok(g.pieces.every(([who]) => who === '이규숙'), `${k} 는 채움쌤(이규숙) 자리여야 한다`)
  ok(g.pieces.every(([, , a, b]) => a === toMin('20:00') && b === toMin('21:00')), `${k} 는 20:00~21:00 이어야 한다`)
  ok(g.pieces.every(([, d]) => ['월', '수', '금'].includes(d)), `${k} 는 월·수·금 안에 있어야 한다`)
  ok(!WD[k] && !WE[k], `${k} 가 평일·주말 열쇠와 겹친다`)
}
ok(isAt('이규숙', '월', '20:00', 30, '', '', 'c-mwf'), '추가 클리닉을 고르면 월요일 8시 칸에 선다')
ok(isAt('이규숙', '수', '20:30', 30, '', '', 'c-mwf'), '8시 반 칸도 같은 타임이다')
ok(!isAt('이규숙', '화', '20:00', 30, '', '', 'c-mwf'), '화요일에는 없다')
ok(!isAt('이규숙', '월', '21:00', 30, '', '', 'c-mwf'), '9시에는 끝나 있다')
ok(!isAt('이규숙', '수', '20:00', 30, '', '', 'c-mf'), '월·금만 고른 학생은 수요일에 없다')
ok(isAt('이규숙', '수', '20:00', 30, '', '', 'c-w'), '수만 고른 학생은 수요일에 있다')
// 반(평일 타임)과 **같이** 설 수 있어야 한다 — 추가로 부르는 자리이기 때문
ok(isAt('이규숙', '월', '18:00', 30, 'at1', '', 'c-mwf') && isAt('이규숙', '월', '20:00', 30, 'at1', '', 'c-mwf'),
  '반 클리닉과 추가 클리닉이 같이 선다')
ok(ROWS_WD.includes('20:00') && ROWS_WD.includes('20:30'), '평일 격자에 8시·8시 반 칸이 있다')

// ⑦ 격자
ok(ROWS_WD[0] === '16:00' && ROWS_WD[ROWS_WD.length - 1] === '21:30', '고등 평일 격자는 16:00~21:30')
ok(ROWS_WE[0] === '09:00', '토·일 격자는 9시부터')
ok(ROWS_MID[0] === '15:00', '중등 격자는 3시부터')
ok(ROWS_WD.every((r, i) => i === 0 || toMin(r) - toMin(ROWS_WD[i - 1]) === 30), '평일 격자는 30분 간격')
ok(HIGH_TEACHERS.map((x) => x.name).join() === '최대호,주한,이규숙', '시간표를 그리는 차례')

// ⑧ 초등 판 (원장님 2026-11-17 「초등버전 하나더 만들어줘」)
ok(GRADES_ELEM.join() === '초1,초2,초3,초4,초5', '초등 판에 오르는 학년은 초1~초5')
ok(!(GRADES_ELEM as readonly string[]).includes('초6'), '초6 은 중등 판으로 가므로 초등 판에 없어야 한다')
ok(ELEM_PICKS.join() === '윤주희,조윤희,이규숙', '초등 판에서 고를 수 있는 선생님')
ok(nextGrade('초3') === '초4' && nextGrade('초5') === '초6', '한 학년 올린다')
ok(nextGrade('초6') === null && nextGrade('중1') === null && nextGrade(null) === null,
  '초6·중등·빈 칸은 올리지 않는다 (초6 은 중등 판이 맡는다)')
// 첫 제안은 **지금 담당 그대로**. 두 분이 같이 적힌 줄은 기계가 고를 수 없으니 비워 둔다.
ok(elemDraft('윤주희') === '윤주희' && elemDraft('이규숙') === '이규숙', '지금 담당을 그대로 제안한다')
ok(elemDraft('조윤희, 이규숙') === '', '두 분이 같이 적힌 줄은 비워 둔다 — 원장님이 고르신다')
ok(elemDraft(null) === '' && elemDraft('김은수') === '', '초등 선생님이 아니면 비워 둔다')
ok(ROWS_ELEM[0] === '14:00' && ROWS_ELEM[ROWS_ELEM.length - 1] === '19:00', '초등 격자는 14:00~19:00')
// ★ 30분 칸이어야 한다 — 16:30 을 고를 수 있는데 한 시간 칸이면 그 학생이 17:00 줄에만
//   그려져 「그 칸에 몇 명」이 틀어진다(지금도 16:30 시작이 6명 있다).
ok(ROWS_ELEM.every((r, i) => i === 0 || toMin(r) - toMin(ROWS_ELEM[i - 1]) === 30), '초등 격자는 30분 간격')

// ⑨ 바뀔 시간 — **요일마다** 따로 (원장님 2026-11-18)
//   「시간표가 화2 목2 금5 이렇게 시간이 다르거든. 그런데 지금 요일별 시간 설정은 못하네」
//   초1~초5 50명 중 **23명**이 요일마다 시각이 다르다 — 한 벌로는 절반을 못 적는다.
const 요일별 = [
  { day: '화', start: '14:00', periods: 2 },
  { day: '목', start: '14:00', periods: 2 },
  { day: '금', start: '17:00', periods: 2 },
]
// ★ 여기서 `!` 로 단정하면 **망가진 사본에서 터져** 버려서 ✗ 한 줄 없이 끝난다 —
//   「아무것도 안 잡힘」이 「통과」처럼 보인다. 그래서 전부 물음표로 받는다
//   (2026-11-18 에 실제로 이렇게 두 군데를 놓칠 뻔했다).
const t3 = parseNewTime(요일별)
ok(t3?.length === 3, '요일 셋을 그대로 읽는다')
ok(t3?.[0]?.day === '화' && t3?.[2]?.day === '금', '늘 월→금 차례로 돌려준다')
ok(parseNewTime([...요일별].reverse())?.map((d) => d.day).join() === '화,목,금', '적는 차례가 뒤집혀도 같다')
ok(parseNewTime([요일별[0], { ...요일별[0], start: '17:00' }])?.length === 1, '같은 요일이 두 번이면 한 번만')

// ★ 예전 꼴({days,start,periods})도 읽어야 한다 — 2026-11-18 에 이미 저장된 줄이 있다.
//   안 읽으면 그 학생 배정이 **조용히 사라진다**.
const 예전 = parseNewTime({ days: ['화', '목', '금'], start: '14:00', periods: 2 })
ok(예전?.length === 3 && 예전.every((d) => d.start === '14:00' && d.periods === 2),
  '예전 꼴(요일 묶음 하나)은 요일마다 한 줄로 펴서 읽는다')

// ★ 반쯤 맞는 값을 통과시키면 격자에 **안 그려지는 학생**이 조용히 생긴다.
ok(parseNewTime(null) === null && parseNewTime('월 4시') === null && parseNewTime([]) === null,
  '값이 아니면 null (= 지금 시간표 그대로)')
ok(parseNewTime([{ day: '토', start: '14:00', periods: 2 }]) === null, '초등은 평일만 — 토·일은 안 받는다')
ok(parseNewTime([{ day: '월', start: '13:00', periods: 2 }]) === null
  && parseNewTime([{ day: '월', start: '16:20', periods: 2 }]) === null, '고를 수 없는 시작 시각은 안 받는다')
ok(parseNewTime([{ day: '월', start: '14:00', periods: 4 }]) === null
  && parseNewTime([{ day: '월', start: '14:00', periods: 0 }]) === null, '고를 수 없는 교시는 안 받는다')
// 어긋난 줄만 버리고 나머지는 산다 — 한 줄 때문에 그 학생 배정이 통째로 사라지면 안 된다
ok(parseNewTime([요일별[0], { day: '토', start: '14:00', periods: 2 }])?.length === 1,
  '어긋난 줄만 버리고 쓸 줄은 남긴다')
ok(ELEM_STARTS.every((t) => ROWS_ELEM.includes(t)), '고를 수 있는 시작 시각은 모두 격자에 줄이 있다')
ok(ELEM_PERIODS.includes(2) && ELEM_PERIODS.includes(2.5), '지금 쓰는 교시(2·2.5)가 들어 있다')

// 글로 적을 때는 같은 시각끼리 묶는다 — 요일마다 줄을 세우면 길어서 못 읽는다
ok(newTimeText(t3) === '화·목 14:00(2교시) · 금 17:00(2교시)', '같은 시각끼리 묶어 적는다')
ok(newTimeText(null) === '' && newTimeText([]) === '', '안 바꿨으면 빈 글')

// 격자 판정 — 요일마다 따로
ok(newTimeAt(t3, '화', '14:00') && newTimeAt(t3, '화', '15:30'), '화요일 14:00~16:00 칸에 선다')
ok(!newTimeAt(t3, '화', '16:00'), '끝나는 시각 칸에는 없다')
ok(!newTimeAt(t3, '화', '17:00') && newTimeAt(t3, '금', '17:00'), '금요일만 17:00 에 선다')
ok(!newTimeAt(t3, '월', '14:00'), '안 고른 요일에는 없다')
ok(!newTimeAt(null, '화', '14:00'), '안 바꿨으면 이 함수로는 아무 데도 안 선다')
ok(newTimeAt(parseNewTime([{ day: '월', start: '16:00', periods: 2.5 }]), '월', '18:00'),
  '2.5교시는 18:30 까지라 18:00 칸에 선다')
ok(newTimeDays(t3).join() === '화,목,금', '걸리는 요일을 돌려준다')
ok(newTimeText(t3) !== '' && newTimeText(parseNewTime('x')) === '', '못 읽은 값은 빈 글')

// 요일 한 줄씩 고치기 — 화면이 쓰는 길
ok(withDay(t3, '금', null)?.length === 2, '요일을 빼면 그 줄만 빠진다')
ok(withDay(t3, '금', { start: '18:00', periods: 1 })?.find((d) => d.day === '금')?.start === '18:00',
  '요일 하나의 시각만 고친다')
ok(withDay(t3, '월', { start: '15:00', periods: 2 })?.map((d) => d.day).join() === '월,화,목,금',
  '요일을 더하면 차례대로 들어간다')
ok(withDay(parseNewTime([요일별[0]]), '화', null) === null, '마지막 요일을 빼면 null (= 지금 그대로)')

ok(sameTime(t3, parseNewTime([...요일별].reverse())), '적는 차례가 달라도 같은 시간이다')
ok(!sameTime(t3, withDay(t3, '금', { start: '18:00', periods: 2 })), '한 요일만 달라도 다른 시간')
ok(sameTime(null, null) && sameTime(null, []) && !sameTime(t3, null), '빈 것끼리만 같다')

/* ─────────── 확정 — 계획이 실제 시간표로 옮겨졌는가 (원장님 2026-11-19) ───────────
 * 반영된 시간표 변경요청이 **계획과 같을 때만** 확정이다. 진급과 상관없는 보통의
 * 시간표 변경까지 확정으로 세면 판이 조용히 거짓이 된다 — 그래서 하나하나 재 본다.
 */

// ⓖ-1 고등 판 — 타임 조각(수업 + 클리닉)을 요일별로 이어 붙여야 한다.
//      운영 고1 시간표가 그 꼴로 적혀 있다: 「화17:30·3교시」 = ja (수업 17:30~19:30 + 클리닉 19:30~20:30)
{
  const ja = planLines('고등', { weekday: 'ja' })
  ok(!!ja && ja.length === 2, '화·목 타임은 두 줄이어야 한다')
  ok(linesKey(ja) === linesKey([{ day: '화', start: '17:30', minutes: 180 }, { day: '목', start: '17:30', minutes: 180 }]),
    'ja 타임은 화·목 17:30 부터 180분(수업 2시간 + 클리닉 1시간)으로 이어 붙어야 한다')
  const at1 = planLines('고등', { weekday: 'at1' })
  ok(linesKey(at1) === linesKey([{ day: '월', start: '16:00', minutes: 180 }, { day: '금', start: '16:00', minutes: 180 }]),
    'at1 타임은 월·금 16:00 부터 180분')
  // 붙지 않은 조각은 **따로** 남아야 한다 — 추가 클리닉(20~21시)은 4~7시 타임과 떨어져 있다
  const 떨어진것 = planLines('고등', { weekday: 'at1', extra: 'c-mf' })
  ok((떨어진것 ?? []).length === 4, '떨어진 조각은 한 줄로 이어 붙이면 안 된다')
  ok(planLines('고등', {}) === null, '아무 타임도 안 고르면 견줄 계획이 없다(null)')
  ok(planLines('중등', { weekday: 'ja' }) === null, '중등 판은 선생님만 정한다 — 시간 계획이 없다')
}

// ⓖ-2 초등 판 — 바뀔 시간이 그대로 쓰인다. 비워 두면 견줄 것이 없다.
{
  const nt = [{ day: '화', start: '14:00', periods: 2 }, { day: '금', start: '17:00', periods: 2 }]
  ok(linesKey(planLines('초등', { newTime: nt })) ===
     linesKey([{ day: '화', start: '14:00', minutes: 120 }, { day: '금', start: '17:00', minutes: 120 }]),
    '초등 바뀔 시간은 교시 × 60분으로 센다')
  ok(planLines('초등', { newTime: null }) === null, '비워 두면(지금 시간표 그대로) 견줄 계획이 없다')
  // 예전 꼴도 읽는다 (parseNewTime 과 같은 길)
  ok(planLines('초등', { newTime: { days: ['화', '목'], start: '14:00', periods: 2 } })?.length === 2,
    '예전 꼴(요일 묶음 하나)도 읽어야 한다')
}

// ⓖ-3 요청의 want — 적는 꼴이 다르다({day,time,periods}). 어긋난 줄은 버린다.
ok(linesKey(wantLines([{ day: '화', time: '14:00:00', periods: 2 }])) ===
   linesKey([{ day: '화', start: '14:00', minutes: 120 }]), "요청의 time 은 'HH:MM' 로 잘라 읽는다")
ok(wantLines([{ day: '해', time: '14:00', periods: 2 }]) === null, '없는 요일은 버린다')
ok(wantLines([{ day: '화', time: '14:00', periods: 0 }]) === null, '0교시는 버린다')
ok(wantLines(null) === null && wantLines([]) === null, '요청이 없으면 null')
ok(linesKey([{ day: '금', start: '17:00', minutes: 120 }, { day: '화', start: '14:00', minutes: 120 }]) ===
   linesKey([{ day: '화', start: '14:00', minutes: 120 }, { day: '금', start: '17:00', minutes: 120 }]),
  '적힌 차례가 뒤집혀도 같은 시간표로 봐야 한다')

// ⓖ-4 줄의 상태 — 이 다섯 가지가 화면·서버·검사에서 같아야 한다
{
  const 초등계획 = { new_time: [{ day: '화', start: '14:00', periods: 2 }] }
  const 같은요청 = { status: 'applied', want: [{ day: '화', time: '14:00', periods: 2 }], decided_at: '2026-11-19' }
  const 다른요청 = { status: 'applied', want: [{ day: '목', time: '16:00', periods: 2 }], decided_at: '2026-11-19' }

  ok(confirmStateOf('초등', 초등계획, null).state === 'plan', '아무 일 없으면 계획')
  ok(confirmStateOf('초등', 초등계획, { status: 'open', want: [] } as any).state === 'open',
    '올라온 요청이 있으면 「요청 올라옴」')
  const 저절로 = confirmStateOf('초등', 초등계획, 같은요청 as any)
  ok(저절로.state === 'auto' && 저절로.confirmed, '반영된 요청이 계획과 같으면 저절로 확정')
  const 다름 = confirmStateOf('초등', 초등계획, 다른요청 as any)
  ok(다름.state === 'applied' && !다름.confirmed,
    '★ 반영됐어도 계획과 시간이 다르면 확정이 아니다 — 보통의 시간표 변경을 확정으로 세면 판이 거짓이 된다')
  // ★ 견줄 계획이 없는 줄은 'noPlan' — **빨간 「계획과 다름」으로 띄우지 않는다.**
  //   중등 판은 선생님만 정하므로 어떤 요청이든 견줄 수 없다. 한데 묶으면 보통의 시간표
  //   변경이 있었던 초6 학생이 다 문제처럼 빨갛게 뜬다(2026-11-19 운영 데이터에서 3명).
  ok(confirmStateOf('중등', { teacher_name: '김은수' }, 같은요청 as any).state === 'noPlan',
    '중등 판은 견줄 시간 계획이 없다 — 「계획과 다름」이 아니라 「시간표 바뀜」이다')
  ok(confirmStateOf('초등', { new_time: null }, 같은요청 as any).state === 'noPlan',
    '초등 판에서 시간을 안 고른 줄도 견줄 것이 없다')
  ok(confirmStateOf('고등', { teacher_name: '최대호' }, 같은요청 as any).state === 'noPlan',
    '고등 판에서 타임을 안 고른 줄도 견줄 것이 없다')
  ok(!confirmStateOf('중등', { teacher_name: '김은수' }, 같은요청 as any).confirmed,
    '견줄 계획이 없으면 저절로 확정되지도 않는다')
  // 손으로 누른 확정은 요청보다 앞선다
  const 손으로 = confirmStateOf('초등', { ...초등계획, confirmed_at: '2026-11-19T00:00:00Z', confirmed_by_name: '윤지혜' }, 다른요청 as any)
  ok(손으로.state === 'hand' && 손으로.confirmed, '손으로 누른 확정이 있으면 그것이 이긴다')
  ok(confirmStateOf('초등', 초등계획, { status: 'open', want: [] } as any).confirmed === false,
    '기다리는 요청은 아직 확정이 아니다')
}

// ⓖ-5 한 학생에 요청이 여러 건이면 어느 것을 보나
{
  const 줄 = [
    { student_id: 'a', status: 'applied', requested_at: '2026-03-01' },
    { student_id: 'a', status: 'applied', requested_at: '2026-11-10' },
    { student_id: 'b', status: 'applied', requested_at: '2026-11-10' },
    { student_id: 'b', status: 'open', requested_at: '2026-03-01' },
  ]
  const got = new Map(pickRequests(줄).map((r) => [r.student_id, r]))
  ok(got.get('a')?.requested_at === '2026-11-10', '반영된 것이 여럿이면 늦게 올라온 것을 본다')
  ok(got.get('b')?.status === 'open',
    '★ 기다리는 요청이 반영된 것보다 먼저다 — 지금 할 일이 그것이다(올라온 차례와 상관없이)')
  ok(pickRequests([]).length === 0 && pickRequests([{ student_id: '' } as any]).length === 0,
    '빈 줄·학생 없는 줄은 버린다')
}

// ⓖ-6 확정 칸이 아직 없을 때(SQL 전)도 판이 떠야 한다
{
  const api = fs.readFileSync('app/api/move-assign/route.ts', 'utf8')
  ok(/confirmReady = false/.test(api) && api.includes("db.from('class_move_assign').select(기본칸)"),
    '★ 확정 칸이 없으면 빼고 읽어야 한다 — 그냥 읽으면 판이 통째로 안 뜬다(SQL 보다 코드가 먼저 올라갈 수 있다)')
  ok(api.includes('confirmReady }'), '칸이 있는지를 화면에 알려 줘야 한다')
  ok(api.includes('pickRequests(reqRows)'), '요청 고르기는 lib 함수로 — 서버가 베껴 쓰면 검사와 갈라진다')
  const page = fs.readFileSync('app/teacher/move-assign/page.tsx', 'utf8')
  ok(/currentUser\?\.role === 'admin' && confirmReady/.test(page),
    '칸이 없으면 확정 단추를 숨겨야 한다 — 눌러도 조용히 실패할 자리는 안 보이는 편이 낫다')
}

// ⓖ-5 서버가 확정을 **원장님만** 하게 막나 · 계획을 바꾸면 확정을 푸나
{
  const api = fs.readFileSync('app/api/move-assign/route.ts', 'utf8')
  ok(/action === 'confirm' \|\| action === 'unconfirm'/.test(api), '확정·확정해제 길이 서버에 있어야 한다')
  ok(/if \(!isAdmin\) return NextResponse\.json\(\{ error: '확정은 원장님만/.test(api),
    '확정은 서버에서도 원장님만 — 화면만 가리면 주소로 부를 수 있다')
  ok(api.includes("from('class_move_assign').update("),
    '확정은 update 로 — upsert 를 쓰면 안 고른 칸이 빈칸으로 덮인다')
  ok(/확정풀림/.test(api), '계획을 바꾸면 확정을 풀어야 한다')
  const page = fs.readFileSync('app/teacher/move-assign/page.tsx', 'utf8')
  // 저장된 줄이 없는 학생(첫 제안 그대로)도 확정할 수 있어야 한다 — 운영 요청 17건 중 12건이 그랬다
  ok(/if \(on && !rows\.some\(/.test(page),
    '★ 저장된 줄이 없으면 첫 제안을 계획으로 먼저 적어야 한다 — 안 그러면 확정이 404 로 막힌다')
  ok(/currentUser\?\.role === 'admin'/.test(page),
    "확정 단추는 isAdmin() 이 아니라 role 로 — isAdmin() 은 관리자모드 토글까지 봐서 강사모드의 원장님께 사라진다")
  ok(page.includes('confirmStateOf('), '화면이 상태를 lib 함수로 가려야 한다(베껴 쓰면 서버와 갈라진다)')
}

// ── 여기부터는 운영 데이터 (.env.local 이 있을 때만)
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.log('(운영 데이터 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  const all = async (make: () => any) => {
    const out: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await make().range(from, from + 999)
      if (error) throw new Error(error.message)
      out.push(...(data ?? []))
      if ((data ?? []).length < 1000) return out
    }
  }
  const students = await all(() => db.from('students')
    .select('id, name, grade, teacher_name, is_test')
    .or('is_active.eq.true,on_leave.eq.true')
    .in('grade', [...GRADES_ELEM, '초6', '중1', '중2', '중3', '고1', '고2']).order('id'))
  const real = students.filter((s) => !s.is_test)
  const byKey = new Map<string, any[]>()
  for (const s of real) {
    const k = keyOf(s.name, s.grade)
    byKey.set(k, [...(byKey.get(k) ?? []), s])
  }

  const 중3 = real.filter((s) => s.grade === '중3')
  const 초6 = real.filter((s) => s.grade === '초6')
  ok(중3.length === m3Keys.length, `운영 중3 ${중3.length}명과 초안 ${m3Keys.length}줄이 같아야 한다`)
  ok(초6.length === 27, `운영 초6 ${초6.length}명과 초안 27줄이 같아야 한다`)
  for (const s of 중3) ok(!!DRAFT_HIGH[keyOf(s.name, s.grade)], `중3 ${s.name} 의 초안이 없다`)
  for (const s of 초6) ok(!!DRAFT_MID[keyOf(s.name, s.grade)], `초6 ${s.name} 의 초안이 없다`)
  // ★ 동명이인은 자동으로 정하지 않는다 — 이름+학년이 둘 이상이면 초안을 붙이면 안 된다
  for (const k of [...Object.keys(DRAFT_HIGH), ...Object.keys(DRAFT_MID)]) {
    const hit = byKey.get(k) ?? []
    ok(hit.length <= 1, `초안 ${k} 에 학생이 ${hit.length}명 걸린다 — 이름만으로 붙이면 안 된다`)
  }

  // 신애진 선생님 목요일 — 초안이 목요일 수업 있는 학생을 보내지 않았나
  const ids = 초6.map((s) => s.id)
  const sc: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    sc.push(...await all(() => db.from('schedules').select('student_id, day_of_week')
      .in('student_id', ids.slice(i, i + 100)).order('id')))
  }
  const daysOf = new Map<string, string[]>()
  for (const r of sc) daysOf.set(r.student_id, [...(daysOf.get(r.student_id) ?? []), r.day_of_week])
  for (const s of 초6) {
    const t = DRAFT_MID[keyOf(s.name, s.grade)]
    const bad2 = clashesWithOff(t, daysOf.get(s.id) ?? [])
    ok(bad2.length === 0, `초6 ${s.name} → ${t} 선생님: 못 오시는 ${bad2.join('·')}요일에 수업이 있다`)
  }

  // ⑧ 서버 API 가 토큰 없이 열려 있지 않나 — **route.ts 를 그대로 불러** 돌린다
  //    (베껴 쓴 사본으로 재면 진짜 가드를 재는 것이 아니다)
  const route: any = await import('../app/api/move-assign/route.ts')
  for (const [name, call] of [
    ['GET', () => route.GET(new Request('http://localhost/api/move-assign'))],
    ['POST', () => route.POST(new Request('http://localhost/api/move-assign',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))],
  ] as [string, () => Promise<Response>][]) {
    const res = await call()
    ok(res.status === 401, `토큰 없는 ${name} 은 401 이어야 한다 (지금 ${res.status})`)
  }
  // 엉뚱한 토큰도 막혀야 한다
  const res3 = await route.GET(new Request('http://localhost/api/move-assign',
    { headers: { Authorization: 'Bearer not-a-real-token' } }))
  ok(res3.status === 401, `가짜 토큰은 401 이어야 한다 (지금 ${res3.status})`)

  // ⑨ 권한 확인이 코드에 **남아 있나**. 토큰을 만들어 볼 수 없으니 글자로 재지만,
  //    지우면 걸리게 해 둔다 — 지우면 직원 누구에게나 초6·고등부 명단이 열린다.
  const src = fs.readFileSync('app/api/move-assign/route.ts', 'utf8')
  ok(/rpc\(\s*'can_see_move_assign'\s*\)/.test(src), '서버 API 가 can_see_move_assign 을 묻지 않는다')
  ok(/rpc\(\s*'can_see_high_curriculum'\s*\)/.test(src), '서버 API 가 can_see_high_curriculum(전체 권한)을 묻지 않는다')
  ok(/status:\s*403/.test(src), '권한 없는 사람을 403 으로 막는 줄이 없다')
  for (const h of ['GET', 'POST']) {
    const at = src.indexOf(`export async function ${h}(req: Request) {`)
    const head = at < 0 ? '' : src.slice(at, at + 220)
    ok(head.includes('await allow(req)') && head.includes('if (deny) return deny'),
      `${h} 핸들러 첫 줄에서 권한을 확인해야 한다`)
  }
  // 「초6 → 중등」만 보는 사람에게 고등부를 내려 주면 안 된다
  ok(src.includes("const GRADES = full ? GRADES_ALL : GRADES_BASE"),
    '전체 권한이 아닌 사람에게 고등부 학년을 빼고 내려 줘야 한다')
  ok(!/GRADES_BASE\s*=\s*\[[^\]]*'고/.test(src), '고등 빼고 보는 목록에 고등 학년이 들어 있다')
  ok(src.includes("if (!full) rows = rows.filter((r: any) => r.track === '중등' || r.track === '초등')"),
    '전체 권한이 아닌 사람에게 고등 판 줄을 빼야 한다')
  // 중등·초등 판은 선생님만 고른다 — 타임이 섞여 들어오면 그 학생이 고등 판 칸에 그려진다
  ok(/track !== '고등' && \(weekday \|\| weekend \|\| extra\)/.test(src),
    '중등·초등 판에 타임이 섞여 들어오는 것을 막아야 한다')
  ok(/track !== '고등' && track !== '중등' && track !== '초등'/.test(src),
    '판 이름 셋만 받아야 한다')
  // 바뀔 시간은 **초등 판에서만**. 다른 판에 들어오면 아무 데도 안 쓰이고 조용히 쌓인다.
  ok(src.includes('parseNewTime(body?.newTime)'), '서버가 바뀔 시간을 lib 함수로 풀어야 한다')
  ok(/track !== '초등' && body\?\.newTime/.test(src), '초등 판이 아닌데 시간이 들어오면 막아야 한다')
  ok(/new_time: track === '초등' \? newTime : null/.test(src), '초등 판이 아니면 시간을 비워 저장해야 한다')
  ok(/track === '고등' && !full/.test(src), '전체 권한이 아닌 사람이 고등 판을 고치는 것을 막아야 한다')

  // 화면·메뉴도 같은 함수를 봐야 한다 (한쪽만 열리면 메뉴는 보이는데 화면이 빈다)
  const pageSrc = fs.readFileSync('app/teacher/move-assign/page.tsx', 'utf8')
  ok(/rpc\('can_see_move_assign'\)/.test(pageSrc), '화면이 can_see_move_assign 으로 막아야 한다')
  ok(/rpc\('can_see_high_curriculum'\)/.test(pageSrc), '화면이 전체 권한도 물어 탭을 가려야 한다')
  const sideSrc = fs.readFileSync('components/teacher/Sidebar.tsx', 'utf8')
  ok(/rpc\('can_see_move_assign'\)/.test(sideSrc), '사이드바 메뉴가 can_see_move_assign 으로 떠야 한다')

  // 표가 살아 있나 (읽기만)
  const { error } = await db.from('class_move_assign').select('student_id').limit(1)
  ok(!error, '표 class_move_assign 을 읽지 못했다 — docs/sql/진급배정판.sql 을 적용했나')

  // 칸이 하나하나 다 있나 (읽기만) — 화면이 고르는 칸을 DB 가 모르면
  // **저장만 조용히 실패한다**(화면은 그대로 보인다). 칸을 더할 때마다 여기에 이름을 넣는다.
  for (const col of ['track', 'teacher_name', 'weekday_slot', 'weekend_slot', 'extra_slot', 'new_time',
    'confirmed_at', 'confirmed_by_name', 'confirmed_note']) {
    const { error: colErr } = await db.from('class_move_assign').select(col).limit(1)
    ok(!colErr, '칸 class_move_assign.' + col + ' 이 없다 — docs/sql/ 의 알맞은 .sql 을 적용했나')
  }

  // 초등 판을 DB 가 받아 주나 — track CHECK 에 '초등' 이 들어 있어야 한다.
  //   ★ 없는 학생 id 로 **일부러 실패하는** 넣기를 해 본다. 아무것도 안 써진다(FK 가 막는다).
  //     CHECK 가 FK 보다 **먼저** 터지므로, 돌아온 코드로 둘을 가를 수 있다.
  //       23514 class_move_assign_track_check → docs/sql/진급배정판_초등판.sql 을 아직 안 넣은 것
  //       23503 foreign key                    → CHECK 는 통과했다(='초등' 을 받는다)
  //     안 그러면 화면은 멀쩡히 뜨는데 **고르는 순간 저장만** 빨간 글로 막힌다.
  const probe = await db.from('class_move_assign')
    .insert({ student_id: '00000000-0000-4000-8000-000000000000', track: '초등' })
  ok(probe.error?.code !== '23514',
    "DB 가 track='초등' 을 안 받는다 — docs/sql/진급배정판_초등판.sql 을 적용했나")
  ok(probe.error?.code === '23503',
    `없는 학생으로 넣기를 해 봤는데 FK 가 아니라 ${probe.error?.code ?? '성공'} 이 났다 (아무것도 안 써졌는지 확인할 것)`)

  // 운영 초1~초5 — 초등 판에 오를 학생과 첫 제안
  const 초등 = real.filter((s) => (GRADES_ELEM as readonly string[]).includes(s.grade ?? ''))
  ok(초등.length > 0, '운영 초1~초5 가 한 명도 안 읽혔다 — 서버 API 의 학년 목록을 확인할 것')
  ok(초등.every((s) => nextGrade(s.grade)), '초등 판 학생 중 한 학년 올릴 수 없는 학년이 있다')
  const 제안없음 = 초등.filter((s) => !elemDraft(s.teacher_name))
  ok(제안없음.length <= 3,
    `첫 제안이 비는 초등 학생이 ${제안없음.length}명이다 — ${제안없음.map((s) => `${s.name}(${s.teacher_name ?? '담당 없음'})`).join(' · ')}`)

  // ★ 운영 초등 시간표가 **요일별 꼴로 다 읽히나** (원장님 2026-11-18)
  //   처음엔 「요일 묶음 하나 + 시각 하나」로 만들었다가, 요일마다 시각이 다른 학생을
  //   아예 못 적는 것을 원장님이 잡으셨다. 그런 학생이 **절반**이다 — 그래서 센다.
  const elemIds = 초등.map((s) => s.id)
  const esc: any[] = []
  for (let i = 0; i < elemIds.length; i += 100) {
    esc.push(...await all(() => db.from('schedules').select('student_id, day_of_week, start_time, periods')
      .in('student_id', elemIds.slice(i, i + 100)).order('id')))
  }
  const byStu = new Map<string, any[]>()
  for (const r of esc) {
    byStu.set(r.student_id, [...(byStu.get(r.student_id) ?? []),
      { day: r.day_of_week, start: String(r.start_time).slice(0, 5), periods: Number(r.periods) }])
  }
  let 못읽음: string[] = []
  let 요일마다다름 = 0
  for (const st of 초등) {
    const rows = byStu.get(st.id) ?? []
    if (!rows.length) continue                       // 시간표가 아직 없는 학생은 넘어간다
    const parsed = parseNewTime(rows)
    const 평일 = rows.filter((r: any) => (['월', '화', '수', '목', '금'] as string[]).includes(r.day))
    if (!parsed || parsed.length !== new Set(평일.map((r: any) => r.day)).size) { 못읽음.push(st.name); continue }
    if (new Set(parsed.map((d) => d.start + '|' + d.periods)).size > 1) 요일마다다름++
  }
  ok(못읽음.length === 0,
    `운영 초등 시간표를 못 읽는 학생 ${못읽음.length}명 — ${못읽음.slice(0, 8).join(' · ')}`)
  ok(요일마다다름 > 0,
    `요일마다 시각이 다른 학생이 ${요일마다다름}명 — 요일별로 적을 수 있어야 한다`)

  // ⑩ 권한 함수가 DB 에 살아 있나 — 화면·API 가 이 이름을 부르는데 함수가 없으면
  //    rpc 가 조용히 false 를 주고 **아무도 못 들어온다.**
  //    (정책이 이 함수를 보는지는 docs/sql/진급배정판_권한분리.sql 끝의 확인 쿼리로 센다 —
  //     pg_policies 는 PostgREST 로 읽히지 않는다)
  for (const fn of ['can_see_move_assign', 'can_see_high_curriculum']) {
    const { error: fnErr } = await db.rpc(fn as any)
    ok(!fnErr, `DB 함수 ${fn}() 를 부르지 못했다 — docs/sql/진급배정판_권한분리.sql 을 적용했나`)
  }
  console.log(`(운영 데이터 — 중3 ${중3.length}명 · 초6 ${초6.length}명 · 중1·중2 ${real.filter((s) => s.grade === '중1' || s.grade === '중2').length}명 · 초1~초5 ${초등.length}명, 그중 요일마다 시각 다른 학생 ${요일마다다름}명)`)
}

if (bad) { console.error(`\n진급 배정판 자가확인 실패 ${bad}건`); process.exit(1) }
console.log('진급 배정판 자가확인 ✓')
