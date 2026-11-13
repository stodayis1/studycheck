// 카톡 수업 브리핑 — 알림톡 본문을 만드는 자리.
//
// 왜 길이를 코드가 지키는가
//   알림톡 본문은 **변수를 끼운 뒤** 1,000자를 넘으면 카카오가 발송을 거부한다
//   (강조표기·아이템리스트·부가정보까지 모두 합산).
//   실데이터 최악값을 재 보면 진도 365 + 과제쪽 276 + 학습지범위 274 + 알림장 893 + 메모 418
//   = 2,226자다. 평소엔 250자쯤이라 눈으로 보면 멀쩡해 보이지만, 긴 알림장을 쓴 날
//   그 학생만 조용히 발송 실패한다. 그래서 **칸마다 상한을 두고 전체를 한 번 더 조인다.**
//   scripts/briefing-check.mjs 가 실데이터 전량으로 1,000자 초과가 0건인지 확인한다.
//
// 사진은 왜 본문에 없는가
//   알림톡은 **템플릿당 고정 이미지 1장**만 되고 그 이미지엔 링크도 못 건다.
//   학생마다 다른 사진은 애초에 실을 수 없어서, 사진은 「알림장·사진」 버튼 뒤 페이지로 보낸다.

// 학습지 제목을 다루는 규칙은 한 곳에 둔다(lib/worksheetTitle.ts — 순수 함수).
import { dropEchoParen } from './worksheetTitle'

export const BODY_LIMIT = 1000
// 1,000자에 딱 붙이면 카카오 쪽 계산이 우리와 1~2자 달라도 터진다. 950자에서 멈춘다.
export const BODY_BUDGET = 950

// 원장님이 Solapi 콘솔에 등록하실 **본문 원문**. 여기 글자 하나라도 다르면 심사받은 것과
// 달라져 발송이 거부되므로, docs/카톡브리핑.md 와 길이 검사 모두 이 상수를 쓴다.
export const BRIEFING_TEMPLATE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 지난 학습지  #{학습지결과}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

▶ 선생님 알림장
#{알림장}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/**
 * 알림장이 **없는 날**에 쓰는 판.
 *
 * 왜 따로 두나 — 「▶ 선생님 알림장」 머리글이 승인된 골격에 박혀 있어서, 알림장이 없으면
 * 「오늘은 따로 남긴 말씀이 없어요」 같은 빈말을 채워 넣을 수밖에 없었다.
 * 원장님 말씀 — "성의 없어 보인다. 알림장을 남겼을 때만 생기면 된다."
 *
 * 승인된 템플릿의 글자는 못 바꾸므로(바꾸면 재심사) **알림장 칸이 아예 없는 판을 하나 더**
 * 등록해서, 그날 알림장이 있으면 원래 판, 없으면 이 판으로 보낸다.
 * 기존 템플릿은 건드리지 않으니 지금 나가는 것에는 영향이 없다.
 */
export const BRIEFING_TEMPLATE_NONOTE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 지난 학습지  #{학습지결과}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`


/**
 * ★ 새 판(V2) — 「▶ 지난 학습지」를 **「▶ 과제 성취도」** 로 바로잡았다 (원장님 2026-10-16).
 *
 * 왜 바꾸나
 *   그 칸에 들어가던 값(learning_notes.worksheet_score)은 학습지 점수가 아니라
 *   학습일지 화면의 **「과제 성취도」** 다. 학습지를 낸 적 없는 날에도 「지난 학습지 90점」이
 *   나가고 있었다. 화면은 %로 보여 주는데 브리핑은 「점」으로 내보내 단위도 어긋나 있었다.
 *
 * 쓰는 때
 *   알리고에 이 원문으로 새 템플릿을 등록해 심사를 통과하면, 그 코드를
 *   **ALIGO_BRIEFING_TPL_CODE_V2** 에 넣는다. 그 값이 있으면 이 판으로 나간다.
 *   값을 지우면 예전 판으로 바로 돌아간다 — 배포를 되돌릴 필요가 없다.
 */
export const BRIEFING_TEMPLATE_V2 = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 과제 성취도  #{과제성취도}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

▶ 선생님 알림장
#{알림장}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/** 새 판 중 알림장 칸이 없는 것. */
export const BRIEFING_TEMPLATE_V2_NONOTE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 과제 성취도  #{과제성취도}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/**
 * ★ V3 — V2 에 **「▶ 데일리테스트」 한 줄**을 더한 판 (원장님 2026-10-17).
 *
 * 왜
 *   「고등부는 학습지도 학습지지만 데일리테스트를 더 많이 활용하거든.
 *     데일리테스트가 학습브리핑에 올라와야 할듯해」
 *   지금은 데일리테스트가 **예전 판의 「지난 학습지」 칸이 비었을 때만** 대신 들어갔다.
 *   그 칸은 worksheet_score 를 쓰는데 0점도 「있는 값」이라, 10/15 고1 두 학생은
 *   데일리테스트 95점·100점을 받고도 「지난 학습지 0점」이 나갔다 — 점수가 묻혔다.
 *
 * 왜 줄을 늘린 판을 따로 두나
 *   데일리테스트를 **본 날만** 그 줄이 있는 판으로 보낸다. 안 본 날까지 줄을 띄우면
 *   초·중등 브리핑마다 「데일리테스트 해당 없음」이 붙는다 — 알림장 빈말을 뺀 것과 같은 이유다.
 *   그래서 판이 네 개가 된다: (알림장 O/X) × (데일리테스트 O/X).
 *
 * 쓰는 때
 *   알리고에 이 원문으로 등록해 심사를 통과하면 코드를 **ALIGO_BRIEFING_TPL_CODE_V3**
 *   (알림장 없는 판은 **_V3_NONOTE**) 에 넣는다. 값이 없으면 V2·예전 판으로 그대로 나간다.
 */
export const BRIEFING_TEMPLATE_V3 = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 과제 성취도  #{과제성취도}
▶ 데일리테스트  #{데일리테스트}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

▶ 선생님 알림장
#{알림장}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/** V3 중 알림장 칸이 없는 것. */
export const BRIEFING_TEMPLATE_V3_NONOTE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}
▶ 과제 성취도  #{과제성취도}
▶ 데일리테스트  #{데일리테스트}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/**
 * ★ V4 — 점수를 **「▶ 학습 결과」 한 칸에 모았다** (원장님 2026-11-12).
 *
 * 왜
 *   「정작 학습지가 여러개 있는 경우는 '~외 3건' 이런식으로 표기되더라고.
 *     학습지 제목 레벨 점수가 표기되도록 하면 어떨까 싶어」
 *   어느 판에도 「▶ 학습지」 줄이 없어서, 학습지 점수를 과제 성취도 칸 뒤에 **60자**로
 *   밀어 넣고 있었다(`worksheetTail`). 60자에 안 들어가면 단원 이름을 깎고, 그래도 안 되면
 *   한 장만 쓰고 「외 N장」을 붙인다. 11/07 박태하는 여덟 장을 풀었는데 두 장만 나갔다.
 *
 * 왜 「▶ 학습지」 줄만 더하지 않고 한 칸에 모으나
 *   알림톡 본문은 승인된 템플릿과 **글자 단위로** 같아야 하고, 줄이 있는 판과 없는 판을
 *   따로 등록해야 한다. 「학습지」 줄을 따로 더하면 알림장 × 데일리테스트 × 학습지 =
 *   **판 8개**가 되고 심사도 여덟 번이다. 세 값을 한 칸에 모으면 **변수 칸 안의 글자는
 *   심사와 무관**하므로 판이 **2개**(알림장 있음·없음)로 줄고, 「본문과 코드가 어긋나
 *   조용히 안 나가는」 사고(2026-10-30, 1,074건)가 걸릴 자리도 그만큼 줄어든다.
 *
 * ★ 데일리테스트도 이 칸에 한 줄로 들어간다 — 그래서 V3 의 「▶ 데일리테스트」 줄이 없다.
 */
export const BRIEFING_TEMPLATE_V4 = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}

▶ 학습 결과
#{학습결과}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

▶ 선생님 알림장
#{알림장}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

/** V4 중 알림장 칸이 없는 것. */
export const BRIEFING_TEMPLATE_V4_NONOTE = `[수학의지혜 수업 브리핑]
#{학생명} 학생 · #{날짜}

▶ 출결  #{출결}
▶ 과제 달성률  #{과제달성률}

▶ 학습 결과
#{학습결과}

▶ 오늘 나간 진도
#{진도}

▶ 다음 시간까지 과제
#{과제배부}

아래 버튼에서 아이의 누적 현황을 보실 수 있어요.`

// 칸마다의 상한. 합이 넉넉히 950 안에 들어오게 잡았다(골격 약 150자 + 아래 합 774자).
const CAP = {
  학생명: 20,
  날짜: 14,
  출결: 12,
  과제달성률: 14,
  // ★ 데일리테스트를 뒤에 붙일 수 있어서 넓혔다(아래 「데일리테스트를 붙인다」 참고).
  학습지결과: 72,
  과제성취도: 72,
  데일리테스트: 34,
  // ★ V4 의 「▶ 학습 결과」 칸. 성취도·데일리테스트·학습지가 **줄 단위로** 들어간다.
  //   학습지 한 줄이 35자쯤이라 240 이면 대여섯 장이 그대로 들어간다 (그게 이 판의 목적이다).
  //   넘치면 뒤쪽 학습지 줄을 덜어 「· 학습지 외 N장」으로 바꾼다 — 말줄임표로 끊지 않는다.
  학습결과: 240,
  진도: 350,
  과제배부: 250,
  알림장: 300,
} as const
type VarName = keyof typeof CAP

/** 띄어쓰기 차이를 무시하고 "같은 글인가" 를 본다. */
const norm = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim()

/**
 * 선생님이 **같은 글을 진도 칸과 알림장에 둘 다** 쓰시는 일이 흔하다(실데이터로 확인).
 * 그대로 두면 학부모가 같은 문단을 한 메시지에서 두 번 읽는다.
 * 앞 30자가 겹치면 같은 글로 보고 알림장 쪽에서 뺀다 — 진도 칸이 그 글의 제자리다.
 */
function sameText(a: string, b: string) {
  const [x, y] = [norm(a), norm(b)]
  if (!x || !y) return false
  return x === y || x.startsWith(y.slice(0, 30)) || y.startsWith(x.slice(0, 30))
}

/** 상한을 넘으면 말줄임표로 끊는다. 끊긴 뒷부분은 버튼 뒤 페이지에서 다 보인다. */
function clip(s: string, cap: number) {
  const t = (s ?? '').replace(/\s+\n/g, '\n').trim()
  return t.length <= cap ? t : t.slice(0, cap - 1).trimEnd() + '…'
}

export interface BriefingSession {
  session_date: string
  progress_content?: string | null
  today_textbook_name?: string | null
  today_chapter?: string | null
  daily_test_unit?: string | null
  daily_test_score?: number | null
  hw_textbook_name?: string | null
  hw_textbook_page?: string | null
  hw_worksheet_range?: string | null
  /** 그날 내준 영상 과제 (줄바꿈으로 이어 붙인 유튜브 주소) */
  video_url?: string | null
}

/**
 * 영상 과제 안내. 몇 편인지와 **증명 강의가 섞였는지**를 부르는 쪽이 알려 준다
 * (이 함수는 DB 를 못 본다 — 어떤 영상이 증명인지는 lesson_videos 가 안다).
 */
export interface BriefingVideos {
  total: number
  /** 그중 증명 강의 편수 — 하나라도 있으면 「증명 올리기」까지 안내한다 */
  proof: number
  /**
   * 그중 **사진을 내야 하는** 편수 — 증명·컨씨영상과, 선생님이 배부하면서 켜 둔 것
   * (원장님 2026-11-04 「직접 풀이한것도 찍어 올리라고」). 안 넣으면 proof 로 센다(옛 호출).
   */
  photo?: number
  /** 사진 안내에 쓸 말 — 「증명」 / 「풀이 사진」 / 「사진」 */
  photoWord?: string
}

export interface BriefingNote {
  attendance?: string | null
  worksheet_submitted?: boolean | null
  worksheet_score?: number | null
  worksheet_unit?: string | null
  worksheet_level?: string | null
  textbook_submitted?: boolean | null
  workbook_done?: boolean | null
  achievement_pct?: number | null
  memo?: string | null
  makeup_note?: string | null
}

/**
 * 그날 점수가 매겨진 학습지 한 장. 매쓰홀릭 붙여넣기로 들어온 것도, QR 채점으로 들어온 것도
 * 다 여기로 온다 (student_worksheets 에서 submitted_at 이 그날인 것).
 */
export interface BriefingWorksheet {
  unit?: string | null
  unit_name?: string | null
  current_level?: string | number | null
  score?: number | null
}

/** 레벨 글자. 「4.0」 → 「4」, 「3.5」 → 「3.5」. */
function lvText(v?: string | number | null) {
  const t = String(v ?? '').trim()
  return t.endsWith('.0') ? t.slice(0, -2) : t
}

/**
 * 단원 이름을 **브리핑에 쓸 길이로** 줄인다.
 *
 * 왜 (2026-10-30 실데이터)
 *   매쓰홀릭 학습지 제목이 그대로 들어와 있어서 중등은 단원 한 줄이 40자를 넘는다 —
 *   「2. 식의 계산(단항식의곱셈과나눗셈~다항식과단항식의혼합계산의도형에의활용)」.
 *   그대로 내보내면 학부모 문자가 낱말 한가운데서 「…」로 끊긴다. 8명 중 2명이 그랬다.
 *   괄호 안은 설명이라 떼고, 매쓰홀릭이 붙인 별표·「레벨학습지」 군더더기도 뗀다.
 */
function unitText(raw: string, cap: number) {
  // 괄호 안 설명은 뗀다. ★ 빈칸이 아니라 **없애야** 한다 —
  //   「이차함수(일반형)의 그래프」를 빈칸으로 바꾸면 「이차함수 의 그래프」가 된다.
  let t = raw.replace(/[(（\[][^)）\]]*[)）\]]/g, '')
  t = t.replace(/[*＊]/g, ' ').replace(/레벨학습지/g, ' ')
  // ★ 오답 재출제 제목은 머리말이 두 겹이다 —
  //   「오답학습지 오답유사학습 [오답 유사] 4학년 2학기 4단원」. 한 겹으로 줄인다.
  //   (2026-11-12 박태하 11/07 여덟 장이 전부 이 꼴이었다)
  t = t.replace(/오답학습지/g, ' ').replace(/오답유사학습/g, '오답유사')
  t = t.replace(/\s+/g, ' ').trim().replace(/^[-·,.]+|[-·,~]+$/g, '').trim()
  if (t.length <= cap) return t
  // ★ 낱말 한가운데가 아니라 **마디에서** 끊는다. 단원 이름은 「가~나」·「가, 나, 다」 꼴이 많다.
  const cut = Math.max(t.lastIndexOf('~', cap), t.lastIndexOf(',', cap), t.lastIndexOf(' ', cap))
  return (cut >= 4 ? t.slice(0, cut) : t.slice(0, cap)).trimEnd().replace(/[,·~]$/, '') + '…'
}

/**
 * 그날 학습지 점수를 **한 조각**으로 만든다 — 「학습지 전범위 Lv4 90점」.
 *
 * 왜 줄을 안 늘리나 (원장님 2026-10-30 「붙여서 점수를 넣었는데 알림장에는 안뜨는데?」)
 *   어떤 판에도 「▶ 학습지」 줄이 없다. 줄을 새로 쓰려면 알리고에 템플릿을 등록해
 *   심사를 또 받아야 한다. 변수 칸 **안의 글자는 심사와 무관**하므로, 데일리테스트와
 *   똑같이 점수 칸 뒤에 붙인다 — 그래야 오늘부터 나간다.
 *
 * ★ budget 안에 들어오는 가장 자세한 꼴을 고른다. 두 장 → 단원을 더 줄여 두 장 →
 *   한 장 + 「외 N장」 순이다. **말줄임표로 끊긴 글을 내보내지 않으려는 것**이다.
 *   점수 큰 것부터가 아니라 들어온 차례대로 적는다 (골라 보이면 안 된다).
 */
export function worksheetTail(rows: BriefingWorksheet[], budget = 60): string {
  const scored = (rows ?? []).filter((w) => w && w.score != null)
  if (scored.length === 0) return ''
  const make = (take: number, unitCap: number) => {
    const head = scored.slice(0, take).map((w) => {
      const 단원 = unitText(((w.unit_name || w.unit) ?? '').trim(), unitCap)
      const lv = lvText(w.current_level)
      return [단원, lv ? `Lv${lv}` : '', `${w.score}점`].filter(Boolean).join(' ')
    }).join(' · ')
    const rest = scored.length - take
    return `학습지 ${head}${rest > 0 ? ` 외 ${rest}장` : ''}`
  }
  for (const [take, cap] of [[2, 22], [2, 13], [1, 26], [1, 15]] as const) {
    const t = make(Math.min(take, scored.length), cap)
    if (t.length <= budget) return t
  }
  // 그래도 안 들어가면 단원을 한 글자씩 더 줄여 본다 (데일리테스트 단원이 아주 긴 날).
  for (let cap = 14; cap >= 4; cap--) {
    const t = make(1, cap)
    if (t.length <= budget) return t
  }
  // ★ 여기까지 와서 안 들어가면 **쓰지 않는다.** 낱말이 반 토막 난 글을 학부모께 보내지 않는다.
  return ''
}

/**
 * V4 의 「▶ 학습 결과」 칸을 **줄 단위로** 만든다 (원장님 2026-11-12).
 *
 *   · 과제 성취도 90%
 *   · 코어테스트 예비 1회 72점
 *   · 진단평가 기본도형 1단계 85점
 *   · 데일리테스트 95점 · 쎈 P.18~P.40
 *   · 학습지 4학년 2학기 4단원 Lv3.5 83점
 *   · 학습지 오답유사 4학년 2학기 4단원 Lv3 100점
 *
 * ★ 학습지는 **들어온 차례대로 한 장에 한 줄.** 점수 큰 것부터 고르지 않는다
 *   (골라 보이면 안 된다 — `worksheetTail` 과 같은 규칙이다).
 * ★ 칸(budget)이 모자라면 **뒤쪽 학습지 줄을 덜어** 「· 학습지 외 N장」으로 바꾼다.
 *   말줄임표로 낱말을 끊지 않는다.
 * ★ 결석한 날은 점수를 볼 수 없으니 그 한 줄만 쓴다.
 */
export function learningResult(a: {
  결석?: boolean
  /** 학습일지의 과제 성취도 (%) */
  성취도?: number | null
  /** 성취도 뒤에 붙일 단원·레벨 — 그날 학습지가 있으면 학습지 줄이 들고 가므로 비운다 */
  성취도꼬리?: (string | null | undefined)[]
  데일리점수?: number | null
  데일리범위?: string | null
  /**
   * 그날 친 코어테스트 — 회차(「예비 1회」·「본고사」)와 점수.
   *
   * 왜 여기냐 (원장님 2026-11-13 「코어테스트 점수는 학습지 자리에 올라가야지」)
   *   코어테스트는 매달 예비 1·2회를 거쳐 본고사로 가는 학원의 큰 시험인데,
   *   **매일 브리핑에 한 번도 안 나가고 있었다.** 학부모님은 월간 리포트에서
   *   한 달에 한 번 몰아서 보셨다. 예비 1회를 낮게 받은 날 바로 알 길이 없었다.
   *
   * ★ 「▶ 학습 결과」는 **변수 칸**이라 안에 줄을 더해도 템플릿 재심사가 없다.
   *   그래서 판을 새로 등록하지 않고 이 칸 안에서 푼다.
   * ★ 그날 안 친 학생에게는 줄이 아예 안 생긴다 — 데일리테스트와 같은 규칙이다.
   */
  코어테스트?: { 회차?: string | null; 점수: number }[]
  /**
   * 그날 친 진단평가 — 주간평가·주말평가·주말복습 TEST 가 여기로 들어온다.
   *
   * 왜 (원장님 2026-11-13 「매쓰홀릭에서 긁어오는 점수는 모두 … 학습결과로」)
   *   매쓰홀릭에서 긁어온 점수는 스터디체크 안에서 종류별로 **나뉘어** 저장된다 —
   *   레벨·오답·쌍둥이는 student_worksheets, 주간·주말평가는 exams(진단평가),
   *   데일리테스트는 class_sessions, 코어테스트는 exams(코어테스트).
   *   학부모님께는 그 갈래가 의미 없으므로 **「▶ 학습 결과」 한 칸에 모아** 보낸다.
   *   진단평가는 그중 유일하게 **아무 데도 안 나가고 있었다.**
   */
  진단평가?: { 단원?: string | null; 단계?: number | null; 점수: number }[]
  worksheets?: BriefingWorksheet[]
}, budget: number = CAP.학습결과): string {
  if (a.결석) return '· 결석으로 수업에 참여하지 못했습니다'

  const head: string[] = []
  if (a.성취도 != null) {
    head.push([`· 과제 성취도 ${a.성취도}%`,
      ...(a.성취도꼬리 ?? []).map((x) => String(x ?? '').trim()).filter(Boolean)].join(' · '))
  }
  // ★ 코어테스트는 성취도 다음, 데일리테스트 앞 — 「과제 → 시험 → 학습지」 차례로 읽히게.
  //   같은 날 두 번 친 기록이 있으면(재시험) 두 줄 다 적는다. 고르면 안 된다.
  for (const c of a.코어테스트 ?? []) {
    const 회차 = (c.회차 ?? '').trim()
    head.push(['· 코어테스트', 회차, `${c.점수}점`].filter(Boolean).join(' '))
  }
  // 진단평가 — 단원·단계를 적어 어느 범위를 봤는지 알 수 있게.
  for (const d of a.진단평가 ?? []) {
    const 단원 = unitText(((d.단원) ?? '').trim(), 26)
    const 단계 = d.단계 != null ? `${lvText(d.단계)}단계` : ''
    head.push(['· 진단평가', 단원, 단계, `${d.점수}점`].filter(Boolean).join(' '))
  }
  if (a.데일리점수 != null) {
    head.push([`· 데일리테스트 ${a.데일리점수}점`,
      (a.데일리범위 ?? '').trim() || null].filter(Boolean).join(' · '))
  }

  const ws = (a.worksheets ?? []).filter((w) => w && w.score != null)
  const wsLine = (w: BriefingWorksheet) => {
    const 단원 = unitText(((w.unit_name || w.unit) ?? '').trim(), 26)
    const lv = lvText(w.current_level)
    return ['· 학습지', 단원, lv ? `Lv${lv}` : '', `${w.score}점`].filter(Boolean).join(' ')
  }

  for (let take = ws.length; take >= 0; take--) {
    const lines = [...head, ...ws.slice(0, take).map(wsLine)]
    const rest = ws.length - take
    // 한 장도 못 적을 때는 「외」가 아니다 — 앞에 적은 것이 없으니까.
    if (rest > 0) lines.push(take > 0 ? `· 학습지 외 ${rest}장` : `· 학습지 ${rest}장`)
    const t = lines.join('\n')
    if (t.length <= budget) return t || '· 오늘은 채점된 과제·학습지가 없어요'
  }
  // 성취도·데일리만으로도 칸을 넘기는 날 — 그건 clip 이 맡는다.
  return head.join('\n') || '· 오늘은 채점된 과제·학습지가 없어요'
}

export interface BriefingFeedback {
  content?: string | null
  ai_message?: string | null   // 글이 아니라 {"images":[...]} 다
  teacher_name?: string | null
}

/** 알림장의 ai_message 칸은 글이 아니라 사진 URL을 담은 JSON이다. */
export function fbImages(aiMessage?: string | null): string[] {
  if (!aiMessage) return []
  try {
    const parsed = JSON.parse(aiMessage)
    if (parsed && Array.isArray(parsed.images)) return parsed.images.filter((u: any) => typeof u === 'string')
  } catch {}
  return []
}

/** 과제 배부 — 「교재 · 페이지」 조각을 교재 이름과 짝지어 읽는다. app/parent/dashboard 와 같은 규칙. */
export function hwLines(ses: BriefingSession, videos?: BriefingVideos): string[] {
  const pageParts = (ses.hw_textbook_page ?? '').split(' / ')
  const out: string[] = []
  for (const raw of (ses.hw_textbook_name ?? '').split(',')) {
    const name = raw.trim()
    if (!name) continue
    const entry = pageParts.find((p) => p.includes(name))
    // ★ 같은 페이지가 두 번 적힌 자리가 있다("디딤돌 연산 · 94-97 · 94-97") — 마지막 칸만 쓴다.
    const page = entry ? entry.split('·').slice(-1)[0]?.trim() : null
    out.push(page && page !== name ? `· ${name} ${page}` : `· ${name}`)
  }
  // ★ 학습지 과제 줄은 저장된 글을 그대로 쓴다. 그런데 그 글에 **같은 말이 괄호로 또**
  //   들어 있는 것이 있다(원장님 2026-11-12 「정리해줘」) —
  //     「… 중등 1-1 (2026.11.02) 오답과제 (오답학습지 중등 1-1 (2026.11.02) 오답과제) · 3.5레벨」
  //   만드는 쪽(학습일지)도 고쳤지만, **이미 저장된 글**이 날마다 그대로 나가므로 여기서도 뗀다.
  //   학습지 여럿은 ' / ' 로, 한 건 안은 ' · ' 로 이어져 있다 — 가운데 단원 칸만 손본다.
  const ws = (ses.hw_worksheet_range ?? '').trim()
  if (ws) {
  //   매쓰홀릭 제목에 붙어 오는 **별표**(「* 레벨학습지 (6-2) 4단원 *」)도 뗀다 — 학부모님께
  //   보이는 글에 쓸 데가 없다. 괄호 안 「(6-2)」는 학년·학기라 **남긴다**.
    const 정리 = ws.split(' / ').map((part) =>
      part.split(' · ')
        .map((seg) => dropEchoParen(seg).replace(/^[*＊\s]+|[*＊\s]+$/g, '').replace(/\s+/g, ' '))
        .filter(Boolean).join(' · ')).join(' / ')
    out.push(`· 학습지 ${정리}`)
  }
  // 교재를 안 고르고 메모만 남긴 과제는 "📝 ..." 조각으로 들어 있다.
  const memo = pageParts.find((p) => p.trim().startsWith('📝 '))
  if (memo) out.push(`· ${memo.slice(2).trim()}`)

  // ★ 영상 과제도 **과제다** (원장님 2026-10-21
  //   「영상과제가 나가면 과제부분에 영상과제가 추가되어야 하거든… 영상과제 x개 시청 후
  //     증명 올리기 뭐 이런식으로」).
  //   예전에는 링크만 학생 앱으로 나가고 브리핑의 「다음 시간까지 과제」에는 안 적혔다 —
  //   학부모님은 영상 과제가 있는 줄도 모르셨다.
  const n = videos?.total ?? 0
  if (n > 0) {
    // 사진을 내는 영상이 섞였으면 **무엇을 몇 개** 올리는지까지 적는다.
    // ★ 편수를 빼면 여덟 개 중 한 개를 내나 일곱 개를 내나 **글이 똑같다** —
    //   선생님이 「직접 푼 풀이도 받기」를 더 켜도 브리핑이 안 바뀐다(원장님 2026-11-04에 잡으셨다).
    //   다만 **영상 전부**를 내는 날은 편수가 군더더기라 빼고 적는다.
    // photo 를 안 주는 옛 호출은 지금까지대로 증명 편수로 센다.
    const 낼것 = videos!.photo ?? videos!.proof
    const 몇개 = 낼것 > 0 && 낼것 < n ? ` ${낼것}개` : ''
    out.push(낼것 > 0
      ? `· 영상과제 ${n}개 시청 후 ${videos!.photoWord ?? '증명'}${몇개} 올리기`
      : `· 영상과제 ${n}개 시청`)
  }
  return out
}

/** 그 결석에 대한 보강. OPS(makeups)에서 온다 — lib/opsMakeups.ts */
export interface BriefingMakeup {
  state: 'done' | 'planned' | 'noshow' | 'waiting' | 'cancelled'
  makeupDate: string | null
  makeupTime: string | null
  teacherName: string | null
}

/** 「10월 17일 12:00」 꼴로. */
function whenText(d?: string | null, t?: string | null) {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  return `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일${t ? ` ${t}` : ''}`
}

/**
 * 보강 한 줄. 결석한 날 학부모가 가장 알고 싶은 것이 이것이다.
 * OPS 기록이 있으면 그걸 쓰고, 없으면 예전 글(makeup_note)로 보조한다.
 */
export function makeupLine(mk?: BriefingMakeup | null, fallback?: string | null) {
  if (mk) {
    const when = whenText(mk.makeupDate, mk.makeupTime)
    const who = mk.teacherName ? ` (${mk.teacherName} 선생님)` : ''
    switch (mk.state) {
      case 'done': return `보강 · ${when ?? ''} 완료${who}`.replace('  ', ' ').trim()
      case 'planned': return `보강 · ${when ?? ''} 예정${who}`.replace('  ', ' ').trim()
      case 'noshow': return `보강 · ${when ?? ''} 보강에 오지 못했습니다`.replace('  ', ' ').trim()
      case 'waiting': return '보강 · 날짜를 잡는 중입니다'
      default: return null
    }
  }
  const t = (fallback ?? '').trim()
  return t ? `보강 · ${t}` : null
}

export interface BriefingResult {
  vars: Record<string, string>
  body: string
  /** 알림장이 있으면 'full', 없으면 'nonote' — 보낼 때 템플릿 코드를 가른다 */
  template: 'full' | 'nonote'
  /** 「데일리테스트」 줄이 있는 판(V3)으로 만들었는가 — 보낼 때 코드를 가른다 */
  dailyShown: boolean
  /**
   * 어느 판으로 만들었는가. 보낼 때 **이 값으로 코드를 고른다** —
   * 본문과 코드가 어긋나면 카카오가 조용히 거절한다(2026-10-30, 1,074건).
   * `dailyShown` 은 옛 이름이라 그대로 둔다(V3 일 때만 true).
   */
  version: 'v1' | 'v2' | 'v3' | 'v4'
  hasNotice: boolean
  bodyLen: number
  overLimit: boolean
  photoCount: number
}

export function buildBriefing(args: {
  studentName: string
  /**
   * 학년('고1' 꼴). 있으면 **「이수아 학생(고1)」** 로 나간다.
   *
   * 왜 (원장님 2026-10-17)
   *   한 집에 자녀가 여럿인 가정이 많다. 이미진 어머님 번호 하나로 이수아(고1)·
   *   이수연(중1)·이수애(초5) 세 자매 브리핑이 간다. 게다가 고1 반에는 **이수아와
   *   이수연이 같이** 있어 진도도 알림장도 글자까지 같다. 그래서 「고등부 이수연 브리핑이
   *   중등부 이수연 어머님께 갔다」는 오해가 생겼다(발송은 정확했다).
   *   이름 옆에 학년 두 글자가 있으면 그 오해가 생기지 않는다.
   *
   * ★ 학생명은 **승인된 템플릿의 변수 칸**이다. 안에 무엇을 넣든 서식은 그대로여서
   *   재심사가 필요 없다.
   */
  studentGrade?: string | null
  session: BriefingSession
  note?: BriefingNote | null
  feedbacks?: BriefingFeedback[]
  /** 그날이 결석이면 그 보강. OPS 에서 온다. */
  makeup?: BriefingMakeup | null
  /**
   * 「알림장 없는 판」 템플릿이 **심사를 통과해 쓸 수 있는가**.
   * ★ 이걸 모르고 없는 판으로 본문을 만들면, 승인된 템플릿과 안 맞아 **전송이 거부된다.**
   *   쓸 수 없으면 원래 판으로 만들고 알림장 자리에 한 줄을 채운다.
   */
  noNoteTemplate?: boolean
  /** 새 판(과제 성취도)으로 만들까. 알리고 심사를 통과한 뒤에만 켠다. */
  useV2?: boolean
  /**
   * 「데일리테스트」 줄이 있는 판(V3)을 쓸 수 있는가. 심사 통과 뒤에만 켠다.
   * 켜 두어도 그날 데일리테스트 점수가 **있을 때만** 그 판으로 만든다.
   */
  useV3?: boolean
  /** V3 중 알림장 없는 판까지 심사를 통과했는가 (V3 로 갈 때의 noNoteTemplate). */
  noNoteTemplateV3?: boolean
  /**
   * 「▶ 학습 결과」 한 칸 판(V4)을 쓸 수 있는가. 심사 통과 뒤에만 켠다.
   * ★ V3 와 달리 **조건이 없다** — 성취도·데일리테스트·학습지가 다 그 칸으로 들어가므로
   *   켜져 있으면 늘 이 판으로 나간다. 그래서 판이 두 개뿐이다.
   */
  useV4?: boolean
  /** V4 중 알림장 없는 판까지 심사를 통과했는가. */
  noNoteTemplateV4?: boolean
  /** 그날 영상 과제 (편수·증명 편수). 부르는 쪽이 lesson_videos 를 보고 넣는다. */
  videos?: BriefingVideos
  /**
   * 그날 친 코어테스트. 부르는 쪽이 exams(exam_type='코어테스트')에서 그날치를 넣는다.
   * 「▶ 학습 결과」 칸에 한 줄로 들어간다 (원장님 2026-11-13).
   */
  coreTests?: { 회차?: string | null; 점수: number }[]
  /**
   * 그날 친 진단평가(주간·주말평가). 부르는 쪽이 exams(exam_type='진단평가')에서 넣는다.
   * 코어테스트와 같이 「▶ 학습 결과」 칸으로 들어간다 (원장님 2026-11-13).
   */
  diagnostics?: { 단원?: string | null; 단계?: number | null; 점수: number }[]
  /**
   * 그날 점수가 들어온 학습지. 부르는 쪽이 student_worksheets 에서
   * submitted_at 이 그날(한국시간)인 것을 넣는다. 없으면 아무것도 안 붙는다.
   */
  worksheets?: BriefingWorksheet[]
}): BriefingResult {
  const { studentName, session: ses, note } = args
  // ★ 결석한 날은 진도도 과제도 **안 적는 것이 정상**이다(10/7 결석 17명 전원 비어 있었다).
  //   그런데 「기록 없음」·「따로 낸 과제가 없어요」로 나가면 선생님이 안 적은 것처럼,
  //   학원이 과제를 안 낸 것처럼 읽힌다. 결석이면 결석이라고 말해 준다.
  const 결석 = note?.attendance === '결석'
  const feedbacks = args.feedbacks ?? []

  const d = ses.session_date
  const 날짜 = `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`

  const 출결 = note?.attendance ?? '기록 없음'

  // ★ 그날 학습지 점수가 있는가. 결석한 날은 볼 수 없으니 없는 것으로 둔다.
  //   글자는 **맨 아래에서** 만든다 — 남은 칸이 얼마인지 그때라야 알 수 있다.
  const 학습지있음 = !결석 && (args.worksheets ?? []).some((w) => w && w.score != null)

  // ★ 꼬리가 붙는 날은 단원·레벨을 **꼬리가 들고 간다.** 학습일지의 그 두 칸은 선생님이
  //   칩을 눌러 채우시는 값인데, 꼬리에는 같은 단원·레벨이 **점수까지** 들어 있다.
  //   둘 다 쓰면 「70% · 전범위 · Lv4.0 · 학습지 전범위 Lv4 90점」처럼 두 번 읽힌다.
  const 성취도단원 = 학습지있음 ? [] : [note?.worksheet_unit, note?.worksheet_level]

  // 「이수아(고1)」 — 학년을 모르면 이름만. 템플릿 골격은 그대로다(변수 칸이다).
  const 학년 = (args.studentGrade ?? '').trim()
  const 학생명 = 학년 ? `${studentName}(${학년})` : studentName

  // 결석이면 비율이 의미가 없다. 그 외엔 선생님이 적은 %를 쓰고, 옛 기록은 한 단어로 근사한다.
  const 과제달성률 =
    note?.attendance === '결석' ? '결석'
      : note?.achievement_pct != null ? `${note.achievement_pct}%`
        : note?.workbook_done ? '완료'
          : note?.worksheet_submitted ? '제출 완료'
            : note ? '미제출' : '기록 없음'

  // 고등부는 학습지보다 데일리테스트 위주라 학습지 점수가 없으면 그걸로 대신한다.
  // ★ 꼬리가 붙는 날은 단원·레벨을 **꼬리가 들고 간다** (아래 과제성취도와 같은 까닭).
  const 학습지결과 =
    note?.worksheet_score != null
      ? [`${note.worksheet_score}점`, ...성취도단원].filter(Boolean).join(' · ')
      : ses.daily_test_score != null
        ? `${ses.daily_test_score}점 (데일리테스트)`
        : '해당 없음'

  // 진도 — progress_content 와 today_textbook_name 이 거의 늘 같은 글이라 겹치면 한 번만.
  const 진도 = 결석
    ? '결석으로 수업에 참여하지 못했습니다.'
    : ([ses.progress_content, ses.today_textbook_name, ses.today_chapter]
        .map((t) => (t ?? '').trim())
        .filter((t, i, arr) => t && arr.indexOf(t) === i)
        .join(' / ') || '기록 없음')

  const hw = hwLines(ses, args.videos)
  const 과제배부 = 결석
    ? '보강 때 함께 안내드립니다.'
    : (hw.length > 0 ? hw.join('\n') : '오늘은 따로 낸 과제가 없어요.')

  // 알림장 — 없으면 머리글만 덩그러니 남지 않게 한 줄을 채운다(심사에도 골격이 또렷한 편이 낫다).
  const photos = feedbacks.flatMap((f) => fbImages(f.ai_message))
  const noticeParts: string[] = []
  // ★ **줄 단위로** 거른다 (2026-11-02).
  //   예전에는 알림장 글을 통째로 진도와 견줬다. 앞 30자만 겹쳐도 같은 글로 보기 때문에,
  //   「진도와 같은 줄 + 그 뒤에 덧붙인 줄」인 알림장이 **통째로** 사라졌다.
  //   그날 기출유사 결과를 메모 끝에 붙여 보냈는데, 진도를 그대로 적어 두신 학생들은
  //   알림장 칸이 비어 「알림장 없는 판」으로 나갔다 — 점수 줄이 통째로 날아갔다.
  //   이제 진도와 겹치는 **그 줄만** 빼고 나머지는 남긴다.
  const 진도줄 = 진도.split(/\r?\n|\s\/\s/).map((x) => x.trim()).filter(Boolean)
  const 진도와같나 = (l: string) => sameText(l, 진도) || 진도줄.some((x) => sameText(l, x))
  for (const raw of [...feedbacks.map((f) => f.content), note?.memo]) {
    for (const line of (raw ?? '').split(/\r?\n/)) {
      const t = line.trim()
      // 진도 칸과 같은 줄이거나 이미 넣은 줄과 같으면 건너뛴다.
      if (!t || 진도와같나(t) || noticeParts.some((p) => sameText(p, t))) continue
      noticeParts.push(t)
    }
  }
  // 보강은 OPS 기록을 먼저 쓰고, 없으면 예전 글로 보조한다.
  const mkLine = makeupLine(args.makeup, note?.makeup_note)
  if (mkLine) noticeParts.push(mkLine)
  // ★ 보강 배정은 매주 금요일에 일괄로 하고, 그날 예약 안내문자가 나간다(원장님 2026-10-14).
  //   그래서 결석 당일에는 보강 날짜를 알 수 없다. 「잡는 대로」라고만 하면 학부모님이
  //   언제까지 기다려야 하는지 모른다. 언제 안내가 가는지를 적어 준다.
  else if (결석) noticeParts.push('보강 · 보강 예약 안내는 매주 금요일에 문자로 보내 드립니다')
  // 알림장이 없으면 빈 채로 둔다 — 그 칸이 없는 판으로 나가므로 쓰이지 않는다.
  const 알림장 = noticeParts.join('\n')

  // ★ 같은 값인데 판에 따라 이름과 단위가 다르다.
  //   예전 판 「지난 학습지 90점」 · 새 판 「과제 성취도 90%」(학습일지 화면과 같은 꼴).
  const 과제성취도 =
    note?.worksheet_score != null
      ? [`${note.worksheet_score}%`, ...성취도단원].filter(Boolean).join(' · ')
      : '해당 없음'

  // ★ 데일리테스트 — 점수가 **있을 때만** 쓴다. 범위를 적어 두셨으면 뒤에 붙인다.
  //   결석한 날은 볼 수 없으니 없는 것으로 둔다.
  const 데일리점수 = 결석 ? null : (ses.daily_test_score ?? null)
  const hasDaily = 데일리점수 != null
  const 데일리테스트 = hasDaily
    ? [`${데일리점수}점`, (ses.daily_test_unit ?? '').trim() || null].filter(Boolean).join(' · ')
    : '해당 없음'

  // ★ V4 의 「▶ 학습 결과」 — 성취도·데일리테스트·학습지를 **줄 단위로** 모은다.
  //   학습지가 여러 장이면 장마다 한 줄이 그대로 들어간다(원장님 2026-11-12).
  const 학습결과 = learningResult({
    결석,
    성취도: note?.worksheet_score ?? null,
    // 그날 학습지가 있으면 단원·레벨은 학습지 줄이 들고 간다 — 두 번 읽히지 않게.
    성취도꼬리: 성취도단원,
    데일리점수: 데일리점수,
    데일리범위: ses.daily_test_unit ?? null,
    // ★ 결석한 날은 시험을 볼 수 없다 — 위에서 '결석' 한 줄만 쓰므로 어차피 안 쓰이지만,
    //   혹시 기록이 섞여 들어와도 결석 줄을 덮지 않게 여기서도 비운다.
    코어테스트: 결석 ? [] : (args.coreTests ?? []),
    진단평가: 결석 ? [] : (args.diagnostics ?? []),
    worksheets: args.worksheets ?? [],
  })

  const vars: Record<VarName, string> = {
    학생명: clip(학생명, CAP.학생명),
    날짜: clip(날짜, CAP.날짜),
    출결: clip(출결, CAP.출결),
    과제달성률: clip(과제달성률, CAP.과제달성률),
    학습결과: clip(학습결과, CAP.학습결과),
    학습지결과: clip(학습지결과, CAP.학습지결과),
    과제성취도: clip(과제성취도, CAP.과제성취도),
    데일리테스트: clip(데일리테스트, CAP.데일리테스트),
    진도: clip(진도, CAP.진도),
    과제배부: clip(과제배부, CAP.과제배부),
    알림장: clip(알림장, CAP.알림장),
  }

  // 사진은 본문에 실을 수 없으니(알림톡 제약) 몇 장 있는지만 알리고 버튼으로 보낸다.
  if (photos.length > 0) {
    const tail = `\n📷 사진 ${photos.length}장은 아래 「알림장·사진」 버튼에서 보실 수 있어요.`
    vars.알림장 = clip(vars.알림장, CAP.알림장 - tail.length) + tail
  }

  // ★ \w 는 한글을 못 잡는다. #{학생명} 같은 한글 변수가 그대로 남아 본문이 통째로
  //   골격 그대로 나가 버린다(실제로 그랬다 — scripts/briefing-check.ts 가 잡아냈다).
  // ★ 알림장이 하나도 없으면 그 칸이 **아예 없는 판**으로 보낸다.
  //   빈말("오늘은 따로 남긴 말씀이 없어요")을 채워 넣으면 성의 없어 보인다.
  const hasNotice = noticeParts.length > 0
  // ★ V4 가 켜져 있으면 그 판이 먼저다 — 점수가 다 「▶ 학습 결과」 칸으로 들어가므로
  //   V2·V3 의 점수 칸을 쓸 일이 없다.
  const v4 = !!args.useV4
  // ★ 데일리테스트를 본 날만 그 줄이 있는 판으로 간다. 코드가 없으면(심사 전) 예전대로.
  const v3 = !v4 && !!args.useV3 && hasDaily
  const v2 = !v4 && !!args.useV2

  // ── 데일리테스트를 붙인다 (원장님 2026-10-17) ───────────────────────────
  // 「▶ 데일리테스트」 **한 줄**을 쓰려면 알리고에 템플릿을 새로 등록해 심사를 받아야 한다.
  // 그걸 기다리는 동안에도 점수가 묻히면 안 되니, 줄을 늘리지 않고 **점수 칸 뒤에** 붙인다
  //   「▶ 과제 성취도  100% · 데일리테스트 95점」
  // 변수 칸 안의 글자는 심사와 무관하다 — 그래서 **지금 쓰는 판 그대로 오늘부터** 나간다.
  // 새 판(V3)으로 가면 그 줄이 따로 생기므로 붙이지 않는다(두 번 나가면 안 된다).
  // ★ V4 는 「▶ 학습 결과」 칸이 데일리테스트를 이미 한 줄로 들고 있다 — 붙이지 않는다.
  if (!v4 && !v3 && hasDaily) {
    const 꼬리 = ` · 데일리테스트 ${vars.데일리테스트}`
    // 예전 판의 「지난 학습지」 칸은 성취도가 **비었을 때** 이미 데일리테스트를 쓰고 있다.
    // 그 경우엔 같은 말이 두 번 되니 붙이지 않는다.
    const 이미들어있음 = note?.worksheet_score == null
    const slot: VarName = v2 ? '과제성취도' : '학습지결과'
    if (!(slot === '학습지결과' && 이미들어있음)) {
      const base = vars[slot] === '해당 없음' ? '' : vars[slot]
      vars[slot] = clip(base ? base + 꼬리 : 꼬리.replace(/^ · /, ''), CAP[slot])
    }
  }
  // ── 그날 학습지 점수를 붙인다 (원장님 2026-10-30) ───────────────────────
  // 데일리테스트를 먼저 붙이고 이걸 붙인다 — 칸이 모자라면 **학습지 쪽이 잘리게** 하려는 것이다.
  // 고등부는 데일리테스트가 더 중요하다(원장님 2026-10-17).
  // ★ V4 는 학습지를 **장마다 한 줄**로 이미 적었다 — 꼬리로 또 붙이지 않는다.
  //   이 판을 만든 까닭이 바로 「외 N장」을 없애는 것이다.
  if (!v4 && 학습지있음) {
    const slot: VarName = v2 ? '과제성취도' : '학습지결과'
    const base = vars[slot] === '해당 없음' ? '' : vars[slot]
    // 남은 칸만큼만 쓴다. ★ 18자도 안 남으면 **아예 안 붙인다** — 낱말 한가운데서
    //   「…」로 끊긴 글을 학부모께 보내느니 안 쓰는 편이 낫다 (데일리테스트가 먼저다).
    const budget = CAP[slot] - (base ? base.length + 3 : 0)
    const 꼬리 = budget >= 18 ? worksheetTail(args.worksheets ?? [], budget) : ''
    if (꼬리) vars[slot] = clip(base ? `${base} · ${꼬리}` : 꼬리, CAP[slot])
  }

  // 「알림장 없는 판」을 쓸 수 있는지는 **지금 쓰는 판**에 달렸다 — V4 로 가면 V4 의 것을 본다.
  const useNoNote = !hasNotice && (
    v4 ? !!args.noNoteTemplateV4 : v3 ? !!args.noNoteTemplateV3 : !!args.noNoteTemplate)
  const tpl = v4
    ? (useNoNote ? BRIEFING_TEMPLATE_V4_NONOTE : BRIEFING_TEMPLATE_V4)
    : v3
      ? (useNoNote ? BRIEFING_TEMPLATE_V3_NONOTE : BRIEFING_TEMPLATE_V3)
      : v2
        ? (useNoNote ? BRIEFING_TEMPLATE_V2_NONOTE : BRIEFING_TEMPLATE_V2)
        : (useNoNote ? BRIEFING_TEMPLATE_NONOTE : BRIEFING_TEMPLATE)
  // ★ \w 는 한글을 못 잡는다. #{학생명} 같은 한글 변수가 그대로 남아 본문이 통째로
  //   골격 그대로 나가 버린다(실제로 그랬다 — scripts/briefing-check.ts 가 잡아냈다).
  const render = (v: Record<string, string>) =>
    tpl.replace(/#\{([^}]+)\}/g, (_, k) => v[k] ?? '')

  // 알림장 없는 판이 아직 심사 전이라 원래 템플릿으로 나갈 수도 있다.
  // 그때는 머리글만 덩그러니 남으면 안 되니 한 줄을 채운다(버리는 값이 아니다).
  if (!useNoNote && !hasNotice) vars.알림장 = '오늘은 따로 남긴 말씀이 없어요.'

  let body = render(vars)
  // ★ 마지막 조임 — 칸별 상한을 다 지켰어도 골격이 바뀌면 합이 넘을 수 있다.
  //   긴 쪽(알림장 → 과제배부 → 진도) 순서로 줄여 950자 안으로 들인다.
  for (const k of ['알림장', '과제배부', '진도'] as VarName[]) {
    if (body.length <= BODY_BUDGET) break
    const over = body.length - BODY_BUDGET
    vars[k] = clip(vars[k], Math.max(20, vars[k].length - over))
    body = render(vars)
  }

  return {
    vars: Object.fromEntries(Object.entries(vars).map(([k, v]) => [`#{${k}}`, v])),
    body,
    bodyLen: body.length,
    overLimit: body.length > BODY_LIMIT,
    photoCount: photos.length,
    template: useNoNote ? 'nonote' : 'full',
    dailyShown: v3,
    version: v4 ? 'v4' : v3 ? 'v3' : v2 ? 'v2' : 'v1',
    hasNotice,
  }
}
