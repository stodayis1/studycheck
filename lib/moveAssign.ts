/**
 * 진급 배정판의 **규칙과 첫 제안**. 화면(app/teacher/move-assign)과 검사
 * (scripts/move-assign-check.ts)가 같은 함수를 쓰기 위해 여기 한 벌만 둔다.
 *
 * 세 판이 있다 (원장님 2026-11-17 「같은 메뉴안에」 · 「초등버전 하나더 만들어줘」)
 *   · 고등 — 중3이 고등부로. **선생님 + 평일 타임 + 토·일 타임**을 새로 정한다.
 *            고등부는 반이 정해진 타임으로 돌아가므로 시각까지 고른다.
 *   · 중등 — 초6이 중등부로. **선생님만** 정한다. 학생은 지금 쓰는 시간표를 그대로 가져온다.
 *            그래서 「그 시각에 그 선생님 반이 몇 명이 되나」만 보면 된다.
 *   · 초등 — 초1~초5 가 **한 학년 올라가며** 윤주희·조윤희·이규숙 선생님께 다시 나뉜다.
 *            중등 판과 같은 꼴이다(선생님만). 다른 점은 **부(部)를 옮기는 것이 아니라서
 *            첫 제안이 「지금 담당 그대로」**라는 것뿐이다 — 바꿀 학생만 고치면 된다.
 *
 * ★ 학생·시간표는 **DB 에서 읽는다**(students · schedules). 아티팩트 판에는 2026-11-12 의
 *   명단이 글자로 박혀 있어서 원생이 들어오고 나가면 손으로 고쳐야 했다. 여기 박아 두는 것은
 *   「처음 제안」(DRAFT_*) 뿐이고, 그것도 저장된 것이 있으면 저장된 쪽이 이긴다.
 */

export type Track = '고등' | '중등' | '초등'

/** 'HH:MM' → 분 */
export function toMin(t: string): number {
  const [h, m] = String(t).split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
/** 분 → 'HH:MM' */
export function toHHMM(min: number): string {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0')
}

export const DAYS_WD = ['월', '화', '수', '목', '금'] as const
export const DAYS_WE = ['토', '일'] as const
/** 고등부 평일은 4시 전에 수업이 없고 30분 단위가 섞여 있어 30분 칸으로 그린다. */
export const ROWS_WD = ['16:00', '16:30', '17:00', '17:30', '18:00', '18:30',
  '19:00', '19:30', '20:00', '20:30', '21:00', '21:30']
/** 토·일은 정각뿐이라 한 시간 칸. */
export const ROWS_WE = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00']
/**
 * 초등부 격자 — 오후 2시부터 7시까지 **30분 칸**.
 *
 * ★ 2026-11-18 에 한 시간 칸에서 30분 칸으로 바꿨다. 시간을 바꾸는 칸이 생기면서
 *   16:30 같은 자리를 고를 수 있게 됐는데, 한 시간 칸이면 그 학생이 **17:00 줄에만**
 *   그려져 「그 칸에 몇 명」이 틀어진다. 지금도 16:30 시작이 6명 있다.
 */
export const ROWS_ELEM = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30',
  '17:00', '17:30', '18:00', '18:30', '19:00']

/** 중등부는 3시부터 10시까지 한 시간 칸 (초6 판은 학생이 지금 쓰는 시간표를 그대로 쓴다). */
export const ROWS_MID = ['15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
  '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00']

/** 한 조각 = [담당 선생님, 요일, 시작, 끝] (시각은 분) */
export type Piece = [string, string, number, number]
export interface Slot {
  /** 그 타임을 맡는 키움쌤 ('*' = 어느 반 학생이든 고를 수 있다) */
  t: string
  label: string
  det: string
  /** 그 학생 혼자 쓰는 자리 — 고르는 목록에 내보이지 않는다 */
  solo?: boolean
  /** 이미 다른 학생으로 찬 자리라는 표시 */
  locked?: string
  pieces: Piece[]
}

/** 키움쌤 수업 + 채움쌤(이규숙) 클리닉이 한 타임이다. 그려야 하는 차례. */
export const HIGH_TEACHERS: { name: string; role: string }[] = [
  { name: '최대호', role: '키움쌤 · 월 · 수 · 금 정규' },
  { name: '주한', role: '키움쌤 · 화 · 목 정규' },
  { name: '이규숙', role: '채움쌤 · 평일 클리닉' },
]
/** 고등 판에서 고를 수 있는 선생님 (김은수 = 중등에 그대로 남는 자리) */
export const HIGH_PICKS = ['최대호', '주한', '김은수']
const CLINIC = '이규숙'

/**
 * 월·수·금 (키움쌤 최대호)
 *   4~7시  : 수업 16:00~18:00 → 클리닉 18:00~19:00
 *   5~8시  : 클리닉 17:00~18:00 → 수업 18:00~20:00
 *   7~10시 : 클리닉 19:00~20:00 → 수업 20:00~22:00
 */
const MWF: { k: string; label: string; det: string; parts: (d: string) => Piece[] }[] = [
  { k: 't1', label: '4~7시 타임', det: '수업 16:00~18:00 + 클리닉 18:00~19:00',
    parts: (d) => [['최대호', d, toMin('16:00'), toMin('18:00')], [CLINIC, d, toMin('18:00'), toMin('19:00')]] },
  { k: 't2', label: '5~8시 타임', det: '클리닉 17:00~18:00 + 수업 18:00~20:00',
    parts: (d) => [[CLINIC, d, toMin('17:00'), toMin('18:00')], ['최대호', d, toMin('18:00'), toMin('20:00')]] },
  { k: 't3', label: '7~10시 타임', det: '클리닉 19:00~20:00 + 수업 20:00~22:00',
    parts: (d) => [[CLINIC, d, toMin('19:00'), toMin('20:00')], ['최대호', d, toMin('20:00'), toMin('22:00')]] },
]
/**
 * 화·목 (키움쌤 주한) — 원장님 2026-11-12 정정, 정규는 월·수·금과 같이 두 시간이다.
 *   5:30~8:30 : 수업 17:30~19:30 → 클리닉 19:30~20:30
 *   6:30~9:30 : 클리닉 18:30~19:30 → 수업 19:30~21:30
 */
const TT: { k: string; label: string; det: string; parts: (d: string) => Piece[] }[] = [
  { k: 'ja', label: '5:30~8:30 타임', det: '수업 17:30~19:30 + 클리닉 19:30~20:30',
    parts: (d) => [['주한', d, toMin('17:30'), toMin('19:30')], [CLINIC, d, toMin('19:30'), toMin('20:30')]] },
  { k: 'jb', label: '6:30~9:30 타임', det: '클리닉 18:30~19:30 + 수업 19:30~21:30',
    parts: (d) => [[CLINIC, d, toMin('18:30'), toMin('19:30')], ['주한', d, toMin('19:30'), toMin('21:30')]] },
]

/** 고등부 평일 타임 */
export const WD: Record<string, Slot> = {}
for (const t of MWF) {
  WD['a' + t.k] = { t: '최대호', label: '월·금 ' + t.label, det: t.det, pieces: [...t.parts('월'), ...t.parts('금')] }
  WD['b' + t.k] = { t: '최대호', label: '수 ' + t.label, det: t.det, pieces: t.parts('수') }
}
WD['at3'].locked = '최다윤 · 하지원 · 이지훈 자리'
for (const j of TT) {
  WD[j.k] = { t: '주한', label: '화·목 ' + j.label, det: j.det, pieces: [...j.parts('화'), ...j.parts('목')] }
}
// 혼자 쓰는 자리(solo)는 고르는 목록에 내보이지 않는다 — 지금 그 학생의 시간표 그대로다.
WD['jb0'] = { t: '주한', label: '화·목 정규만 (7:30~9:30)', det: '정규 19:30~21:30 · 클리닉 없음', solo: true,
  pieces: [['주한', '화', toMin('19:30'), toMin('21:30')], ['주한', '목', toMin('19:30'), toMin('21:30')]] }

/**
 * 고등부 토·일.
 * 최대호 선생님 토요일은 **정규 10~12 한 타임**에 수 반이 모두 모이고, 그 뒤 클리닉을
 * 두 타임(12~14 · 14~16)으로 나눈다 (원장님 2026-11-12). 수 반은 정규 + 클리닉 한 타임,
 * 월·금 반은 클리닉 한 타임만 온다.
 */
export const WE: Record<string, Slot> = {
  'sat-r1': { t: '최대호', label: '토 정규 + 클리닉 1타임', det: '정규 10:00~12:00 · 클리닉 12:00~14:00 · 수 반',
    pieces: [['최대호', '토', toMin('10:00'), toMin('12:00')], ['최대호', '토', toMin('12:00'), toMin('14:00')]] },
  'sat-r2': { t: '최대호', label: '토 정규 + 클리닉 2타임', det: '정규 10:00~12:00 · 클리닉 14:00~16:00 · 수 반',
    pieces: [['최대호', '토', toMin('10:00'), toMin('12:00')], ['최대호', '토', toMin('14:00'), toMin('16:00')]] },
  'sat-c1': { t: '최대호', label: '토 클리닉 1타임만', det: '클리닉 12:00~14:00 · 월·금 반',
    pieces: [['최대호', '토', toMin('12:00'), toMin('14:00')]] },
  'sat-c2': { t: '최대호', label: '토 클리닉 2타임만', det: '클리닉 14:00~16:00 · 월·금 반',
    pieces: [['최대호', '토', toMin('14:00'), toMin('16:00')]] },
  // 최대호 선생님 반 학생도 이쪽으로 올 수 있어 '*' 로 연다.
  'j-sat1': { t: '*', label: '주한 토 클리닉 1반', det: '09:00~12:00',
    pieces: [['주한', '토', toMin('09:00'), toMin('12:00')]] },
  'j-sat2': { t: '*', label: '주한 토 클리닉 2반', det: '12:00~14:00',
    pieces: [['주한', '토', toMin('12:00'), toMin('14:00')]] },
  'j-sun': { t: '주한', label: '일 09:00~12:00', det: '3교시',
    pieces: [['주한', '일', toMin('09:00'), toMin('12:00')]] },
  // 주말만 다니는 두 학생의 지금 시간표 그대로 (원장님 2026-11-12)
  'j-w1': { t: '주한', label: '토 10~13 + 일 09~12:30', det: '주말 수업 · 박영재', solo: true,
    pieces: [['주한', '토', toMin('10:00'), toMin('13:00')], ['주한', '일', toMin('09:00'), toMin('12:30')]] },
  'j-w2': { t: '주한', label: '토 09~13 + 일 09~13', det: '주말 수업 · 이기범', solo: true,
    pieces: [['주한', '토', toMin('09:00'), toMin('13:00')], ['주한', '일', toMin('09:00'), toMin('13:00')]] },
}

/**
 * **따로 부르는 추가 클리닉** (원장님 2026-11-17 「월수금 클리닉 시간(이규숙쌤)을 8-9시 타임에도
 * 넣어줘. 근무시간을 9시까지로 잡았거든. 그때 더 남는 애들이나 추가로 부를애들 부르는 것으로 하게」).
 *
 * 평일 타임(WD)은 「키움쌤 수업 + 채움쌤 클리닉」이 한 묶음이라, 거기 안 들어가는 이 자리를
 * 적을 데가 없었다 → **칸을 따로 둔다**(class_move_assign.extra_slot). 비워 두면 안 부르는 것이다.
 * 반은 그대로 두고 **여기만 더 고르면 된다** — 그래서 고르는 목록이 반과 겹쳐도 괜찮다.
 */
export const EXTRA: Record<string, Slot> = {
  'c-mwf': { t: CLINIC, label: '월·수·금 8~9시 클리닉', det: '채움쌤 20:00~21:00 · 세 날 다',
    pieces: ['월', '수', '금'].map((d) => [CLINIC, d, toMin('20:00'), toMin('21:00')] as Piece) },
  'c-mf': { t: CLINIC, label: '월·금 8~9시 클리닉', det: '채움쌤 20:00~21:00',
    pieces: ['월', '금'].map((d) => [CLINIC, d, toMin('20:00'), toMin('21:00')] as Piece) },
  'c-w': { t: CLINIC, label: '수 8~9시 클리닉', det: '채움쌤 20:00~21:00',
    pieces: [[CLINIC, '수', toMin('20:00'), toMin('21:00')] as Piece] },
}

/** 그 토·일 묶음을 이 선생님 반 학생이 고를 수 있는가 */
export function weekendPickable(key: string, teacher: string): boolean {
  const g = WE[key]
  return !!g && !g.solo && (g.t === teacher || g.t === '*')
}
/** 그 토·일 묶음을 어느 선생님 시간표에 그릴 것인가 */
export function weekendOwner(key: string): string {
  const g = WE[key]
  if (!g) return ''
  return g.t === '*' ? g.pieces[0][0] : g.t
}

/** 한 사람의 모든 조각 (평일 + 토·일 + 추가 클리닉) */
export function piecesOf(weekday?: string | null, weekend?: string | null, extra?: string | null): Piece[] {
  const out: Piece[] = []
  for (const key of [weekday, weekend, extra]) {
    const g = (key && (WD[key] || WE[key] || EXTRA[key])) || null
    if (g) out.push(...g.pieces)
  }
  return out
}
/** 칸(요일 · row 부터 span 분)에 그 사람이 있는가 — 칸과 조각이 겹치면 있는 것이다 */
export function isAt(who: string, day: string, row: string, span: number,
  weekday?: string | null, weekend?: string | null, extra?: string | null): boolean {
  const s = toMin(row), e = s + span
  return piecesOf(weekday, weekend, extra).some(([w, d, a, b]) => w === who && d === day && a < e && b > s)
}
/** 그 선생님이 그 요일에 일하는가 */
export function worksOn(who: string, day: string): boolean {
  for (const g of [...Object.values(WD), ...Object.values(WE), ...Object.values(EXTRA)]) {
    if (g.pieces.some(([w, d]) => w === who && d === day)) return true
  }
  return false
}

/**
 * 살펴볼 줄 — 수 반(b*)은 토 정규(10~12)까지 오고, 월·금 반(a*)은 클리닉만 오는 것이 기본이다.
 * 어긴 줄을 **막지는 않는다**(원장님이 일부러 그러실 수 있다). 눈에만 띄게 한다.
 */
export function oddSaturday(teacher?: string | null, weekday?: string | null, weekend?: string | null): string | null {
  if (teacher !== '최대호' || !weekday || !weekend) return null
  const 수반 = weekday.startsWith('b')
  const 토정규 = weekend.startsWith('sat-r')
  if (수반 === 토정규) return null
  return 수반 ? '수 반인데 토 정규를 안 옴' : '월·금 반인데 토 정규까지 옴'
}

/** '이름|학년' */
export function keyOf(name: string, grade: string | null | undefined): string {
  return String(name).trim() + '|' + String(grade ?? '').trim()
}

/**
 * 고등 판 첫 제안 — **원장님이 아티팩트에서 2026-11-13 까지 맞춰 두신 그대로**를 옮겼다.
 * (처음엔 선생님 묶음을 통째로 옮기는 자동 배치였는데, 원장님이 그 뒤 김은수 선생님 중3
 *  8명을 최대호 선생님께, 반대로 5명을 주한 선생님 화·목 6:30 타임으로 보내셨다)
 * 저장된 것이 있으면 저장된 쪽이 이긴다.
 */
export const DRAFT_HIGH: Record<string, [string, string, string]> = {
  // 주한 선생님 9명 — 모두 화·목 6:30~9:30 + 토 클리닉 2반
  '김규민|중3': ['주한', 'jb', 'j-sat2'],
  '이병목|중3': ['주한', 'jb', 'j-sat2'],
  '장태균|중3': ['주한', 'jb', 'j-sat2'],
  '김하음|중3': ['주한', 'jb', 'j-sat2'],
  '오윤서|중3': ['주한', 'jb', 'j-sat2'],
  '이준민|중3': ['주한', 'jb', 'j-sat2'],
  '정지후|중3': ['주한', 'jb', 'j-sat2'],
  '김민정|중3': ['주한', 'jb', 'j-sat2'],
  '강보민|중3': ['주한', 'jb', 'j-sat2'],
  // 양다경 — 중등 과정부터 해야 해서 김은수 선생님과 그대로 간다 (원장님 2026-11-12)
  '양다경|중3': ['김은수', '', ''],
  // 최대호 선생님 28명 — 월·금 4~7(at1)
  '김도윤|중3': ['최대호', 'at1', 'sat-c2'],
  '배수빈|중3': ['최대호', 'at1', 'sat-c2'],
  '장주호|중3': ['최대호', 'at1', 'sat-c2'],
  '이주현|중3': ['최대호', 'at1', 'sat-c2'],
  '김윤아|중3': ['최대호', 'at1', 'sat-c1'],
  '이은서|중3': ['최대호', 'at1', 'sat-c1'],
  '노우석|중3': ['최대호', 'at1', 'sat-c1'],
  '이현준|중3': ['최대호', 'at1', 'sat-c1'],
  '김민희|중3': ['최대호', 'at1', 'sat-c1'],
  //   월·금 5~8(at2)
  '박신영|중3': ['최대호', 'at2', 'sat-c2'],
  '허예은|중3': ['최대호', 'at2', 'sat-c2'],
  '임동규|중3': ['최대호', 'at2', 'sat-c2'],
  '강하라|중3': ['최대호', 'at2', 'sat-c2'],
  '김준희|중3': ['최대호', 'at2', 'sat-c2'],
  '서혜원|중3': ['최대호', 'at2', 'sat-c2'],
  '이하나|중3': ['최대호', 'at2', 'sat-c1'],
  '백하연|중3': ['최대호', 'at2', 'sat-r2'],
  //   수 4~7(bt1)
  '박서준|중3': ['최대호', 'bt1', 'sat-r2'],
  '서우현|중3': ['최대호', 'bt1', 'sat-r2'],
  '김서율|중3': ['최대호', 'bt1', 'sat-r2'],
  '임재욱|중3': ['최대호', 'bt1', 'sat-r1'],
  '최윤우|중3': ['최대호', 'bt1', 'sat-r1'],
  '류연서|중3': ['최대호', 'bt1', 'sat-c1'],
  //   수 5~8(bt2)
  '류휘석|중3': ['최대호', 'bt2', 'sat-r2'],
  '윤서진|중3': ['최대호', 'bt2', 'sat-r2'],
  //   수 7~10(bt3)
  '강채린|중3': ['최대호', 'bt3', 'sat-r2'],
  '신소민|중3': ['최대호', 'bt3', 'sat-r2'],
  '박유준|중3': ['최대호', 'bt3', 'sat-r1'],

  // ── 지금 고등부에 다니는 학생들이 새 타임에서 어디 앉나 (2026-11-12 기준)
  //    고2가 되는 세 명은 최대호 선생님께 간다. 고3 이윤경 학생은 그때 졸업하므로 넣지 않는다.
  '이지훈|고1': ['최대호', 'at3', 'sat-c2'],
  '최다윤|고1': ['최대호', 'at3', 'sat-c2'],
  '하지원|고1': ['최대호', 'at3', 'sat-c2'],
  //    중2인데 이미 고등부 화·목반에 다닌다 (원장님 2026-11-12)
  '김주아|중2': ['주한', 'ja', 'j-sat1'],
  '유솔민|고1': ['주한', 'ja', 'j-sat1'],
  '이수아|고1': ['주한', 'ja', 'j-sat1'],
  '이수연|고1': ['주한', 'ja', 'j-sat1'],
  '박지은|고1': ['주한', 'ja', 'j-sat1'],
  '유연우|고1': ['주한', 'ja', 'j-sat1'],
  '윤민아|고1': ['주한', 'ja', 'j-sun'],
  '김규리|고1': ['주한', 'jb', 'j-sat2'],
  '백소은|고1': ['주한', 'jb', 'j-sat2'],
  '노혁진|고2': ['주한', 'jb', 'j-sat2'],
  //    이 네 명은 지금 쓰는 시간표가 따로다 (원장님 2026-11-12)
  '이진우|고1': ['주한', 'jb0', 'j-sun'],
  '허주원|고1': ['주한', 'jb0', 'j-sun'],
  '박영재|고1': ['주한', '', 'j-w1'],
  '이기범|고2': ['주한', '', 'j-w2'],
}

/** 중등 판에서 고를 수 있는 선생님 */
export const MID_PICKS = ['김은수', '박경미', '신애진', '윤지혜']

/**
 * 중등 판 첫 제안 — **원장님이 아티팩트에서 2026-11-11~12 에 손으로 맞춰 두신 그대로**다
 * (아티팩트 `assign` 컬렉션에 저장돼 있던 20줄 + 저장 안 된 이서우는 원장님이 못박으신 김은수).
 *
 * ★ 2026-11-17 바로잡음. 처음에 옮길 때 **저장된 값이 아니라 그 판의 「자동 배치 제안」**을
 *   베껴 와서 **11명이 어긋나 있었다** — 사람 수(6·8·7·6)는 우연히 같아서 숫자만 봐서는
 *   안 드러났다. 원장님 「지난번에 초6 배정 다 끝냈는데 ... 그때 배정해둔거랑 다 달라졌어」.
 *   **지금은 DB(class_move_assign)에 그 값이 들어 있고 그쪽이 늘 이긴다.** 여기 표는
 *   그 줄이 없을 때만 쓰인다.
 *
 * 원장님이 그때 고르신 기준
 *
 * 어떻게 골랐나
 *   · **원장님 반 여섯 명은 중등으로 안 넘긴다** — 원장님 2026-11-12
 *     「나한테 들어오는 6명 제외하고 반영하면됨」. 윤지혜로 둬서 시간표에는 보이게 한다.
 *   · 신애진 선생님은 **목요일에 출근하지 않으신다** — 목요일 수업이 있는 학생은 안 보낸다.
 *   · 같은 시간표를 쓰는 학생은 한 반이므로 통째로 한 분께.
 *   · 중3이 빠진 뒤에도 15~18시는 중1·중2로 차 있어 **겹치지 않는 조합이 없다.** 그래서
 *     「그 칸 합산 인원이 가장 적게 몰리는 쪽」으로 고르고, 맡은 인원도 6·8·7 로 맞췄다.
 *   · 이서우는 원장님이 **김은수 선생님으로 못박으셨다** (2026-11-12).
 */
export const DRAFT_MID: Record<string, string> = {
  '강다현|초6': '박경미', '강시온|초6': '신애진', '김환희|초6': '신애진',
  '노하은|초6': '박경미', '박도현|초6': '김은수', '박소연|초6': '박경미',
  '박지환|초6': '신애진', '배준형|초6': '김은수', '손예원|초6': '신애진',
  '시지우|초6': '신애진', '오지승|초6': '박경미', '윤도연|초6': '박경미',
  '이도윤|초6': '신애진', '이서우|초6': '김은수', '이세아|초6': '박경미',
  '이송연|초6': '김은수', '이하정|초6': '박경미', '전다민|초6': '김은수',
  '정지윤|초6': '김은수', '조신우|초6': '박경미', '홍성준|초6': '신애진',
  // 원장님 반 — 그대로 둔다
  '안준혁|초6': '윤지혜', '오현승|초6': '윤지혜', '유정환|초6': '윤지혜',
  '임지원|초6': '윤지혜', '최다빈|초6': '윤지혜', '홍채은|초6': '윤지혜',
}

/** 신애진 선생님이 출근하지 않는 요일 (원장님 2026-11-12) */
export const NO_SHOW = { 신애진: ['목'] } as Record<string, string[]>

/** 그 학생을 그 선생님께 보내면 선생님이 못 오는 요일에 수업이 걸리는가 */
export function clashesWithOff(teacher: string | null | undefined, days: string[]): string[] {
  const off = NO_SHOW[String(teacher ?? '')] ?? []
  return off.filter((d) => days.includes(d))
}

/* ──────────────────────────── 초등 판 (초1~초5 → 한 학년 위) ────────────────────────────
 * 원장님 2026-11-17
 *   「초등학생들도 한학년 올라가면서 윤주희, 조윤희 강사 담당 학생들을 다시 배정할거거든.
 *     현재 담당 학생들 학년 올라가면서 배정할수 있도록 진급배정판에 초등버전 하나더 만들어줘」
 *
 * 중등 판과 같은 꼴이다 — **선생님만** 고른다. 시간표는 지금 쓰는 것을 그대로 가져온다.
 * 다른 점 하나: 부(部)를 옮기는 것이 아니라 **같은 초등부 안에서 다시 나누는** 것이라,
 * 첫 제안이 「지금 담당 그대로」다. 그래서 바꿀 학생만 고치면 된다.
 */

/** 이 판에 오르는 학년 — 초6 은 중등 판으로 가므로 여기 없다. */
export const GRADES_ELEM = ['초1', '초2', '초3', '초4', '초5'] as const

/** 초등 판에서 고를 수 있는 선생님 (원장님 2026-11-17) */
export const ELEM_PICKS = ['윤주희', '조윤희', '이규숙']

/** '초3' → '초4' · '초5' → '초6'. 초등이 아니거나 모르면 null. */
export function nextGrade(grade: string | null | undefined): string | null {
  const m = /^초([1-5])$/.exec(String(grade ?? '').trim())
  return m ? '초' + (Number(m[1]) + 1) : null
}

/**
 * 초등 판 첫 제안 — **지금 담당 그대로**.
 *
 * ★ 담당 칸에 「조윤희, 이규숙」처럼 **두 분이 같이** 적힌 학생이 있다(2026-11-17 기준 초6 1명).
 *   그런 줄은 어느 쪽인지 기계가 고를 수 없으므로 **비워 두고** 원장님이 고르시게 한다.
 *   화면에는 「지금 조윤희, 이규숙 선생님」이 그대로 보인다.
 */
export function elemDraft(teacherName: string | null | undefined): string {
  const t = String(teacherName ?? '').trim()
  return ELEM_PICKS.includes(t) ? t : ''
}

/* ─────────────────── 초등 진급 — 바뀔 시간 (원장님 2026-11-18) ───────────────────
 * 「시간이 바껴서 진급하는 학생들도 있거든. 담당도 바뀌고. … 시간도 변경하는 기능이
 *   지금은 없어. 같이 추가해줘」
 *
 * 고등 판은 **정해진 타임**(ja·at1 …)을 고르지만 초등은 그런 반이 없다. 그래서
 * **요일 + 시작 시각 + 교시** 를 그대로 고른다 — 지금 시간표가 적히는 꼴과 같다.
 *
 * ★ 비워 두면(null) **지금 시간표 그대로**다. 바꿀 학생만 고르면 된다.
 * ★ 이 값은 선생님별 격자를 **새 자리로** 다시 그리는 데 쓰인다. 안 그러면 시간을
 *   옮겨 놓고도 「그 칸에 몇 명」이 옛 자리로 세어져 **숫자가 거짓이 된다**.
 */

/** 고를 수 있는 시작 시각 — 격자(ROWS_ELEM) 안에서 수업이 끝나게 18:00 까지. */
export const ELEM_STARTS = ['14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00']
/** 고를 수 있는 교시 — 지금 초등 시간표에 있는 값(1·2·2.5·3)에 1.5 를 더했다. */
export const ELEM_PERIODS = [1, 1.5, 2, 2.5, 3]
/** 한 교시는 60분. */
export const PERIOD_MIN = 60

export interface NewTime {
  /** 월~금 중 하나 이상 */
  days: string[]
  /** 'HH:MM' */
  start: string
  /** 교시 (1 교시 = 60분) */
  periods: number
}

/**
 * 저장된 값을 믿지 않고 푼다 — 화면·서버·검사가 **이 함수 하나**를 같이 쓴다.
 * 하나라도 어긋나면 null 이다(= 지금 시간표 그대로). 반쯤 맞는 값을 통과시키면
 * 격자에 안 그려지는 학생이 조용히 생긴다.
 */
export function parseNewTime(v: any): NewTime | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const days = [...new Set((Array.isArray(v.days) ? v.days : [])
    .map((d: any) => String(d ?? '').trim())
    .filter((d: string) => (DAYS_WD as readonly string[]).includes(d)))] as string[]
  const start = String(v.start ?? '').trim()
  const periods = Number(v.periods)
  if (!days.length || !ELEM_STARTS.includes(start) || !ELEM_PERIODS.includes(periods)) return null
  // 요일은 늘 월→금 차례로 — 적는 사람에 따라 뒤집히면 「바뀜」 판정이 흔들린다.
  days.sort((a, b) => (DAYS_WD as readonly string[]).indexOf(a) - (DAYS_WD as readonly string[]).indexOf(b))
  return { days, start, periods }
}

/** '월·수 16:00(2교시)' 꼴로. */
export function newTimeText(t: NewTime | null | undefined): string {
  if (!t) return ''
  return `${t.days.join('·')} ${t.start}(${t.periods}교시)`
}

/** 그 칸(요일 · row 부터 30분)에 이 시간이 걸리나. */
export function newTimeAt(t: NewTime | null | undefined, day: string, row: string): boolean {
  if (!t || !t.days.includes(day)) return false
  const s = toMin(t.start), e = s + Math.round(t.periods * PERIOD_MIN)
  const a = toMin(row), b = a + 30
  return s < b && e > a
}

/** 두 시간이 같은가 — 「바뀜」을 알리는 데 쓴다. */
export function sameTime(a: NewTime | null | undefined, b: NewTime | null | undefined): boolean {
  if (!a || !b) return !a && !b
  return a.start === b.start && a.periods === b.periods && a.days.join() === b.days.join()
}
