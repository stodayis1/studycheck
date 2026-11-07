/**
 * 매쓰홀릭 학습 이력 화면에서 **드래그해서 복사한 글자**를 읽어 들인다.
 *
 * 왜 이게 필요한가 (원장님 2026-10-29)
 *   「이걸 지금 손으로 일일이 입력하고 있는데」. 학습지 점수는 한 달에 1,300건쯤 된다.
 *   매쓰홀릭에는 외부 연동용 API 안내가 없고(공식 문서·FAQ 어디에도 없다), 대신
 *   **목록을 드래그해서 복사하면 글자가 그대로 나온다**는 것을 원장님이 확인하셨다.
 *
 * 왜 사진이 아니라 글자인가
 *   사진은 숫자를 잘못 읽을 수 있다. 93 을 98 로 읽으면 점수가 조용히 틀어지고,
 *   그걸 알아챌 방법이 없다. 복사한 글자는 그대로다.
 *
 * ★ 순수 함수다(DB·시계를 직접 안 만진다). 그래야 가짜 글자로 시험할 수 있다
 *   (scripts/matholic-check.ts). 읽는 규칙을 고치면 거기 시험도 같이 고친다.
 *
 * 복사하면 이렇게 나온다 (원장님이 2026-10-29 에 실제로 붙여넣어 주신 글자)
 *
 *     강보라
 *     (2/2)
 *
 *     09/03 20:44
 *     학습지
 *     공통수학2 (2022 개정)
 *     고1A Daily Test 0903 (lv2.5)
 *     12/20
 *     60점
 *
 *     오하윤
 *     (0/0)
 *     해당 기간 학습 이력이 없습니다.
 *
 * ★ **칸마다 줄이 바뀐다.** 처음에 한 줄에 한 건인 줄 알고 만들었다가 전부 틀렸다.
 *   표를 복사하는 방식은 브라우저·화면마다 다르므로 **줄바꿈과 탭을 똑같이 칸 구분으로**
 *   보고, 칸 순서가 아니라 **생김새**로 찾는다 — 날짜는 「09/03 20:44」, 점수는 「60점」,
 *   맞은 개수는 「12/20」, 레벨은 「(lv2.5)」.
 */

/** 한 건(학습지 하나)에서 읽어낸 것. */
export interface MatholicRow {
  /** 붙여넣은 글자에서 몇 번째 줄에서 시작했나 (화면에서 짚어 주려고 들고 다닌다) */
  line: number
  /** 매쓰홀릭에 적힌 이름 그대로. 「정우찬2」처럼 동명이인 꼬리가 붙어 있을 수 있다 */
  student: string
  /** 'YYYY-MM-DD' — 매쓰홀릭에 찍힌 날짜 그대로 쓴다(원장님 2026-10-29) */
  date: string
  /** 학습지 · 진단평가 · 월간평가 … 못 찾으면 빈 글자 */
  kind: string
  /** '공통수학2 (2022 개정)' 같은 과정. 못 찾으면 빈 글자 */
  course: string
  title: string
  /** '(lv2.5)' · '_Lv5' · 'Lv.2' → 2.5 / 5 / 2 */
  level: number | null
  /** 12/20 의 12 */
  right: number | null
  /** 12/20 의 20 */
  total: number | null
  /** 「60점」의 60 */
  score: number
  /** 읽어 들인 칸들을 그대로 — 화면에 보여 주고 사람이 대조한다 */
  raw: string
}

export interface ParseResult {
  rows: MatholicRow[]
  /** 그 기간에 푼 것이 없는 학생. 「빠뜨린 것」과 구분해서 화면에 보여 준다 */
  empty: string[]
  /** 읽지 못한 칸. **조용히 버리지 않는다** — 화면에 그대로 띄워 사람이 본다 */
  skipped: { line: number; text: string; why: string }[]
}

/** 「(2/2)」 — 학생 이름 뒤에 붙는 푼 개수. 이름이 앞에 붙어 있을 수도 있다. */
const COUNT_TAIL = /^(.*?)\(\s*\d+\s*\/\s*\d+\s*\)$/
/**
 * 날짜 칸. 「09/03 20:44」·「2026-09-03」. 날짜**만** 있는 칸이어야 한다.
 *
 * ★ 「12/20」(맞은 개수)도 이 모양에 걸린다. 그래서 아래 isDateCell() 로 한 겹 더 가른다 —
 *   처음에 안 가르고 만들었더니 12/20 을 12월 20일로 읽고 그 건을 통째로 버렸다.
 */
const DATE_CELL = /^(?:(\d{4})[-./])?(\d{1,2})[-./](\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/
/** 시각이나 연도가 같이 적힌 날짜 — 이건 맞은 개수와 헷갈릴 일이 없다 */
const STRONG_DATE = /^(?:\d{4}[-./]\d{1,2}[-./]\d{1,2}(?:\s|$)|\d{1,2}[-./]\d{1,2}\s+\d{1,2}:\d{2})/
/** 점수 칸. 「60점」 */
const SCORE_CELL = /^(\d{1,3})\s*점$/
/** 맞은 개수 칸. 「12/20」 */
const FRACTION_CELL = /^(\d{1,3})\s*\/\s*(\d{1,3})$/
/**
 * 레벨. 「(lv2.5)」·「_Lv5」·「Lv.2」 어느 꼴이든 받는다.
 *
 * ★ `\bLv` 로 쓰면 안 된다. 밑줄도 낱말 글자라 「_Lv5」 앞에는 **낱말 경계가 없어서**
 *   안 걸린다. 실제로 쎈 학습지 제목(…나눗셈_Lv5)이 통째로 레벨 없음으로 읽혔다.
 */
/**
 * 제목에 적힌 레벨. 두 가지 꼴을 다 받는다.
 *   ① 「Lv.3」·「_Lv3.5」·「Lv 2」
 *   ② 「2.5레벨」·「3.5 레벨」 ← 원장님 2026-11-06 「숫자+레벨도 레벨이야 규칙에 추가해」
 *
 * ★ ②에 `(?!\s*학습지)` 를 붙인 까닭 — 「초6-2 레벨학습지」의 「2 레벨」이 레벨 2 로
 *   걸려 버린다. 「레벨학습지」라는 낱말 자체는 레벨이 아니다.
 * ★ 두 꼴 중 어느 쪽이 걸렸는지 모르므로 숫자는 **`levelOf` 로만** 꺼낸다.
 *   `Number(m[1])` 로 쓰면 ②가 걸렸을 때 NaN 이 되고, 레벨이 조용히 사라진다.
 */
const LEVEL = /(?:^|[^A-Za-z])Lv\.?\s*([0-9]+(?:\.[0-9]+)?)|([0-9]+(?:\.[0-9]+)?)\s*레벨(?!\s*학습지)/i
const levelOf = (m: RegExpExecArray | null): number | null => {
  if (!m) return null
  const n = Number(m[1] ?? m[2])
  return Number.isFinite(n) ? n : null
}
/**
 * 「고1 A 주말복습 TEST 1107(lv2.5)」 — **주중에 한 범위를 토요일에 보는 시험.**
 * 원장님 2026-11-07 「주말복습 테스트는 평가관리.진단평가로 가야해」.
 * ★ 「TEST·테스트·시험·평가」가 같이 적힌 것만 본다 — 「주말복습 학습지」는 학습지 그대로다.
 */
const WEEKEND_REVIEW = /주말\s*복습\s*(?:TEST|테스트|시험|평가)/i
/**
 * ★★ 학습지 제목에서 **종류를 가르는 규칙** — 원장님이 2026-10-31 에 정하셨다.
 *     아직 **코드로 안 옮겼다**(종류를 담을 `kind` 칸이 없다). 다음 주 템플릿 작업에서 한다.
 *
 * ★ 만드는 쪽에서 범주를 **지어내지 않는다.** 원장님 2026-10-31 「규칙을 너무 많이 만들면
 *   되려 헷갈려. 현재 쓰고 있는 규칙에서 우리가 범주를 만들어가는게 맞아」.
 *   그래서 선생님들이 **이미 손으로 적고 있는 말**을 세어 범주를 뽑았다
 *   (`learning_notes.worksheet_unit` 154건): 과제 44 · 오답 20 · 레벨/Lv 22 · 이너프원 2 ·
 *   아무 낱말 없이 단원명만 65. 반대로 내가 표에 넣었던 수행평가·교과서·교재·주간/월간/
 *   진단평가는 **0건**이었다 — 쓰지도 않는 말로 규칙을 만들고 있었다.
 *
 * ── 담기는 칸 (분류) ────────────────────────────────────────────────────────
 *   TOMA · 코어테스트 · **월간평가**            → 평가관리 (회차: 예비 1회·예비 2회·본고사·월간평가)
 *   진단평가 · 주간평가 · 주말평가              → 평가관리의 **진단평가** (`isDiagnostic`)
 *                                              ★ 레벨이 적혀 있으면 레벨학습지다
 *                                              ★ **단원평가는 여기 아니다** — 초등 학교시험 칸이라
 *                                                보내면 학교 점수에 학원 점수가 섞인다
 *   교재 · 교과서 · **교재 이름 자체**          → 쌍둥이 학습지
 *   데일리 · Daily Test                       → 학습일지의 데일리테스트 칸 (학습지가 아니다)
 *   **그 밖에 전부**                          → **레벨학습지**
 *
 *   ★ 과제 · 오답 · 이너프원은 **따로 칸을 만들지 않는다. 다 레벨학습지다.**
 *     원장님 「과제가 학습지야」·「오답도 마찬가지로 레벨학습지」·「이너프원은 지금은 그냥
 *     학습지로 넣어줘 … 분류는 여전히 레벨학습지야」.
 *   ★ 「학습지 제목에 레벨이 쓰여있으면 무조건 레벨학습지」(원장님). 평가·TOMA·교재는
 *     그와 별개로 위 줄에서 먼저 갈린다 — 레벨은 어느 종류에나 붙기 때문이다
 *     (실측: 매쓰홀릭 65건 전부 레벨이 있었다. 오답유사에도 (lv2.0), 평가에도 Lv4).
 *   ★ **이너프원은 지금 아예 안 넣고 있다**(isEnoughOne → 제외). 이것을 레벨학습지로
 *     넣는 것으로 바꿔야 한다 — 다음 주 작업에 들어 있다.
 *   ★ **교재 이름이 제목에 적혀 있으면 쌍둥이다** (원장님 2026-10-31 「교재명이 학습지
 *     이름에 쓰여있는 경우도 있어 이건 쌍둥이 학습지야」). 이름 목록을 **코드에 박지 않는다** —
 *     `textbook_catalog` 를 읽는다(2026-10-31 기준 98권 중 쓰는 것 92권). 선생님이 교재를
 *     새로 등록하면 그 이름도 저절로 걸려야 한다.
 *     · **긴 이름부터** 맞춘다 — 「쎈」이 「쎈B」·「베이직쎈」·「라이트쎈」·「쎈연산」 안에 들어 있다
 *       (다 쌍둥이라 결과는 같지만, 어느 교재인지 적을 때 긴 쪽이 맞다).
 *     · 전각·반각을 같은 것으로 본다 — 목록에 「개념＋유형(유형편)」과 「개념+유형」이 섞여 있다.
 *     · **이너프원은 목록에 없다**(0건). 그래서 「이너프원 → 레벨학습지」와 부딪히지 않는다.
 *     · 목록에 「모의고사 1부/2부」·「중3 모의고사 1부/2부」가 유형서로 들어 있다 — 제목에
 *       「모의고사」가 있으면 쌍둥이로 간다. 평가로 보내야 한다면 원장님께 먼저 여쭐 것.
 *     · ★ 목록에 **학생 이름이 섞여 있다** — 네 건이 교재명 뒤 괄호에 학생 이름을 달고 있다
 *       (`select textbook_name from textbook_catalog where textbook_name ~ '\('` 로 확인).
 *       교재명 대조에 그대로 쓰면 학생 이름까지 교재명으로 세고, 그 목록은 다른 선생님
 *       화면에도 보인다. 원장님께 알려 드렸다(2026-10-31).
 *       ★ 여기에 **이름을 적지 않는다** — 학생 실명은 저장소에 넣지 않는다.
 *
 * ── 알림장에 그대로 나가야 하는 말 (분류와 별개) ──────────────────────────────
 *   오답이 들어 있으면        → 「오답」
 *   이너프원이 들어 있으면    → 「이너프원」   (선생님들이 제목을 정비한 뒤부터)
 *   수행평가가 들어 있으면    → 「수행평가」
 *   그 밖에                   → 「레벨학습지」
 *
 *   원장님 「알림장에 수행평가, 오답, 레벨학습지 제목은 꼭 써야해」.
 *   꼬리의 「학습지」 자리에 **종류를 넣는다**(둘 다 쓰면 「학습지 레벨학습지」가 된다) —
 *     「▶ 과제 성취도  90% · 레벨학습지 전범위 Lv4 93점」
 *     「▶ 과제 성취도  85% · 오답 2단원 소수의 나눗셈 Lv3 85점」
 *
 * ★ 오답이 레벨학습지 칸에 들어가면 **레벨 현황판과 초등 70점 재도전 규칙이 오답 점수를
 *   같이 센다**(그 전까지는 worksheet_type='similar' 로 갈라 두었다). 그 부작용을 원장님께
 *   알려 드렸고, 그렇게 하기로 정하셨다. 현황판에서 이상한 것이 보이면 이 결정을 먼저
 *   떠올릴 것.
 *
 * ── 2026-11-02 에 바뀐 것 (원장님) ────────────────────────────────────────────
 *   ① **월간평가는 코어테스트로 올린다** 「월간평가는 코어테스트로 올리면됨」.
 *      회차 이름은 「월간평가」 그대로 둔다 — 예비 1회·예비 2회·본고사와 섞이면
 *      어느 시험 점수인지 평가관리에서 다시 알 수 없다.
 *      ★ TOMA 를 **먼저** 본다. 매쓰홀릭은 TOMA 건에도 종류를 「월간평가」로 붙여 주므로,
 *        월간평가를 먼저 보면 TOMA 본고사가 「월간평가」로 밀린다(검사가 잡았다).
 *   ② **레벨이 없고 「N회차」면 이너프원** 「학습지 이름에 레벨이 없고 00회차 이렇게
 *      쓰여 잇는건 이너프원이야 안넣어도됨」. 레벨이 있으면 레벨학습지다 —
 *      **레벨이 없는 것**이 열쇠다.
 *   ③ **오답유사·오답문제는 오답학습지** 「기존 규칙대로 제목에 오답학습지라고 넣어주고
 *      이전 레벨 학습지의 레벨과 동일하게 해줘」.
 *      · 제목(unit_name)에 「오답학습지」를 넣는다 — 이미 있으면 겹쳐 쓰지 않는다.
 *      · 레벨은 **그 학생의 직전 레벨학습지와 같게** 한다(`prevLevelOf`). 오답은 그
 *        레벨에서 틀린 것을 다시 푸는 것이라 자기 레벨이 없다.
 *      · 그래서 오답은 레벨이 없어도 **「레벨이 없어요」로 막지 않는다**(needsLevel).
 *      · 「오답유사」만 보던 것을 「오답」으로 넓혔다 — 선생님마다 「오답문제」·「오답 모음」
 *        으로도 적으시고, 그러면 조용히 레벨학습지로 들어갔다.
 *   ④ **레벨이 없어도 시중교재·교과서 이름이 붙어 있으면 쌍둥이 학습지** 「레벨이 없어도
 *      시중교재나 교과서가 붙어있으면 쌍둥이 학습지로 넣어달라고 했는데 그건 반영이
 *      안되어 있어」.
 *      ★ 위 「교재 이름이 적혀 있으면 쌍둥이」는 2026-10-31 에 **적어만 두고 코드가
 *        없었다.** 「교재」라는 낱말과 쪽 범위(P.18~P.80)만 보고 있었고, 「중1-1 개념원리
 *        3단원」처럼 이름만 적힌 줄은 레벨학습지로 들어가거나 「레벨이 없어요」로 막혔다.
 *        2026-11-02 에 `matchTextbook` 으로 실제로 대조하게 했다.
 *      · `isTextbookLinked(row, books)` — **목록을 안 넘기면 이름으로는 안 걸린다.**
 *        부르는 쪽에서 `textbook_catalog` 를 읽어 넘겨야 한다(화면이 그렇게 한다).
 *      · 「교과서」라는 낱말도 쌍둥이로 본다.
 *      · 넘어온 교재 이름은 화면의 「왜 이렇게 골랐는지」에 「‘개념원리’ 교재라 쌍둥이
 *        학습지로 넣습니다」로 적어 보여 준다 — 레벨 없이 들어가는 이유가 보여야 한다.
 *      · 들어간 뒤 레벨 칸은 비어 있다(쌍둥이는 레벨 개념이 없다).
 *
 *   ★ 2026-11-02 확인: 지금 들어 있는 학습지 4,754건 중 단원 칸에 교재 이름이 적힌 것은
 *     **0건**이다. 지난 기록을 고칠 일은 없고, 이제부터 들어오는 것만 달라진다.
 *
 * ── 2026-11-06 에 바뀐 것 (원장님) ────────────────────────────────────────────
 *   ⑤ **숫자+레벨도 레벨이다** 「숫자+레벨도 레벨이야 규칙에 추가해」.
 *      「6학년 2학기 4단원 **2.5레벨**」·「5학년 2학기 4단원 **3.5 레벨**」이 그 전에는
 *      레벨 없음으로 읽혀 통째로 막혔다(2026-11-06 하루분 91건 중 3건).
 *      → `LEVEL` 에 `([0-9.]+)\s*레벨` 를 더했다. 숫자는 **`levelOf`** 로 꺼낸다.
 *      ★ 「레벨학습지」라는 낱말은 레벨이 아니다 — `(?!\s*학습지)` 로 막아 두었다.
 *   ⑥ **주간·주말평가는 평가관리의 진단평가로** 「주간평가는 평가로 들어가야해.
 *      진단평가에 넣으면 됨. 제목에 맞춰 단원에 맞게 넣어주고」.
 *      → `isDiagnostic` · `parseDiagnosticTitle`. `unit_name` 에 단원, `level` 에 단계.
 *      ★ **레벨이 있으면 레벨학습지**다 — 「[주간평가] 중1-2 … _Lv3.5」는 학습지 메뉴에서
 *        낸 레벨학습지다. 레벨로 가르지 않으면 그쪽이 통째로 평가로 새어 나간다.
 *      ★ **단원평가는 보내지 않는다** (초등 학교시험 칸). 위 분류 표에 적어 두었다.
 *
 * ★ 선생님께 **새로 가르칠 말은 없다.** 고쳐야 할 것은 표기뿐이다 — 별표로 감싸기
 *   (`* 레벨학습지 (3-2) 3단원 *`), 꺾쇠(`< 중 ( 1-1 ) 1단원 >`), 들쭉날쭉한 띄어쓰기
 *   (같은 단원이 네 꼴로 갈려 레벨 현황판이 쪼개졌다), 「1차시~9차시」처럼 단원명이 아닌 것.
 *   강사용 안내문: https://claude.ai/artifact/WJih4vXJoUSRCoPrt6XHgY
 */
const KINDS = ['학습지', '진단평가', '월간평가', '주간평가', '단원평가', '오답유사', '데일리', '주말복습', '코어테스트', '이너프원', '교재']
/**
 * 제목 맨 앞 대괄호 머리표 — 「[데일리] 고1 공통수학2 원의 방정식_Lv2.5」.
 *
 * ★ 2026-10-29 부터 선생님들과 **제목 규칙을 통일**하기로 했다(원장님 「스터디체크에 맞춰서
 *   학습지 제목 규칙을 통일하자」). 머리표가 있으면 어디로 갈지 **짐작할 필요가 없다** —
 *   데일리는 학습일지, 나머지는 학습지. 옛 제목도 그대로 읽히게 둔다(한꺼번에 안 바뀐다).
 */
const TITLE_KIND = /^\[\s*([^\]]{1,12}?)\s*\]\s*/
/**
 * 머리표에 쓰시는 말이 갈린다 — 「평가」와 「테스트」를 섞어 쓰신다.
 *
 * ★ 원장님이 2026-10-30 에 실제로 쓰신 머리표는 「[주간테스트]」였다. KINDS 에는
 *   「주간평가」만 있어서 **머리표를 못 알아보고 제목에 그대로 남았다.** 에러는 안 난다 —
 *   그래서 아무도 모른다. 아는 말을 넓혀 둔다(제목 규칙은 선생님마다 조금씩 다르다).
 */
const KIND_ALIAS: Record<string, string> = {
  '주간테스트': '주간평가',
  '월간테스트': '월간평가',
  '단원테스트': '단원평가',
  '진단테스트': '진단평가',
  '주말테스트': '주말복습',
  '주말과제': '주말복습',
}
/** 「공통수학2 (2022 개정)」·「초등 6-2 (2022 개정)」 — 과정 칸은 개정 연도가 붙어 온다 */
const COURSE_CELL = /\(\s*\d{4}\s*개정\s*\)/
const NO_HISTORY = /해당 기간 학습 이력이 없습니다/

const pad = (n: number) => String(n).padStart(2, '0')

/** 「12/20」처럼 앞이 뒤보다 작거나 같으면 맞은 개수로 읽을 수 있다는 뜻 */
const looksLikeFraction = (s: string) => {
  const f = FRACTION_CELL.exec(s)
  return !!f && Number(f[1]) <= Number(f[2])
}

/**
 * 한 건이 **여기서 시작하나**. 시각·연도가 붙어 있으면 확실하고,
 * 「09/03」처럼 맨몸이면 맞은 개수로 읽히지 않을 때만 날짜로 본다.
 */
const startsRecord = (s: string) =>
  STRONG_DATE.test(s) || (DATE_CELL.test(s) && !looksLikeFraction(s))

/**
 * 연도가 안 적혀 있을 때 **앞으로 가지 않게** 고른다.
 * 10월에 「12/28」이 보이면 작년 12월이다 — 올해 12월은 아직 안 왔다.
 */
function inferYear(month: number, day: number, today: Date): number {
  const y = today.getFullYear()
  const made = new Date(y, month - 1, day)
  // 하루쯤은 시계 차이로 앞설 수 있으니 봐준다.
  return made.getTime() - today.getTime() > 86400_000 ? y - 1 : y
}

/**
 * 붙여넣은 글자를 읽는다.
 *
 * @param text  매쓰홀릭 목록을 복사한 글자
 * @param today 오늘 (연도가 안 적힌 날짜를 메울 때 쓴다. 시험할 때는 가짜 날짜)
 */
export function parseMatholic(text: string, today: Date = new Date()): ParseResult {
  const rows: MatholicRow[] = []
  const empty: string[] = []
  const skipped: ParseResult['skipped'] = []

  // 줄바꿈과 탭을 똑같이 칸 구분으로 본다 — 복사 방식에 따라 둘 다 나온다.
  const cells: { text: string; line: number }[] = []
  String(text ?? '').replace(/\r\n?/g, '\n').split('\n').forEach((raw, i) => {
    raw.replace(/ /g, ' ').split('\t').forEach((c) => {
      const t = c.trim()
      if (t) cells.push({ text: t, line: i + 1 })
    })
  })

  let student = ''
  let i = 0
  while (i < cells.length) {
    const cell = cells[i]
    const s = cell.text

    // ① 「(2/2)」 — 바로 앞이 학생 이름이다. 「남도윤 (12/12)」처럼 한 칸에 붙어 올 수도 있다.
    const tail = COUNT_TAIL.exec(s)
    if (tail) {
      const inline = tail[1].trim()
      if (inline) student = inline
      else if (i > 0 && !startsRecord(cells[i - 1].text)) student = cells[i - 1].text
      i++
      continue
    }
    if (NO_HISTORY.test(s)) { if (student) empty.push(student); i++; continue }

    // ② 날짜 칸이면 여기서 한 건이 시작된다.
    if (!startsRecord(s)) { i++; continue }   // 이름 칸·머리글 등은 ①에서 쓰이거나 그냥 지나간다
    const d = DATE_CELL.exec(s)
    if (!d) { i++; continue }

    const year = d[1] ? Number(d[1]) : inferYear(Number(d[2]), Number(d[3]), today)
    const date = `${year}-${pad(Number(d[2]))}-${pad(Number(d[3]))}`

    // ③ 「○○점」이 나올 때까지 칸을 모은다. 중간에 다음 날짜가 나오면 그 건은 점수가 없는 것이다.
    const body: string[] = []
    let j = i + 1
    let score: number | null = null
    while (j < cells.length) {
      const t = cells[j].text
      // 점수 없이 다음 건·다음 학생으로 넘어갔다. 「12/20」은 날짜가 아니라 맞은 개수다.
      if (startsRecord(t) || COUNT_TAIL.test(t) || NO_HISTORY.test(t)) break
      const sc = SCORE_CELL.exec(t)
      j++
      if (sc) { score = Number(sc[1]); break }
      body.push(t)
    }

    if (score == null) {
      skipped.push({ line: cell.line, text: [s, ...body].join(' · '), why: '점수(○○점)가 없어요 — 아직 채점 전인 것 같아요' })
      i = j; continue
    }
    if (score < 0 || score > 100) {
      skipped.push({ line: cell.line, text: [s, ...body].join(' · '), why: `점수가 ${score} 예요 — 0~100 이 아니라 안 넣었어요` })
      i = j; continue
    }
    if (!student) {
      skipped.push({ line: cell.line, text: [s, ...body].join(' · '), why: '어느 학생 것인지 모르겠어요 — 위에 학생 이름 칸이 없어요' })
      i = j; continue
    }

    // ④ 모은 칸들을 생김새로 가른다. 순서를 믿지 않는다.
    let right: number | null = null, total: number | null = null
    let kind = '', course = ''
    const rest: string[] = []
    for (const t of body) {
      const fr = FRACTION_CELL.exec(t)
      if (fr && Number(fr[1]) <= Number(fr[2])) { right = Number(fr[1]); total = Number(fr[2]); continue }
      if (!kind && KINDS.includes(t)) { kind = t; continue }
      if (!course && COURSE_CELL.test(t)) { course = t; continue }
      rest.push(t)
    }
    let title = rest.join(' ').replace(/\s+/g, ' ').trim()
    // 제목 맨 앞 「[데일리]」 같은 머리표는 종류로 쓰고 제목에서 덜어낸다.
    const th = TITLE_KIND.exec(title)
    if (th) {
      const inner = th[1].trim()
      // 똑같이 적힌 별명을 먼저 보고, 없으면 아는 말이 들어 있는지 본다.
      const k = KIND_ALIAS[inner] ?? KINDS.find((x) => inner.includes(x))
      if (k) { kind = k; title = title.slice(th[0].length).trim() }
    }
    const lv = LEVEL.exec(title)

    rows.push({
      line: cell.line, student, date, kind, course, title,
      level: levelOf(lv),
      right, total, score,
      raw: [s, ...body, `${score}점`].join(' · '),
    })
    i = j
  }

  return { rows, empty, skipped }
}

/**
 * 데일리테스트인가.
 *
 * ★ 데일리테스트는 **학습지가 아니다.** 스터디체크에서는 학습일지의 「데일리 테스트」 칸
 *   (class_sessions.daily_test_score)에 적는다 — 원장님 2026-10-29 「데일리테스트 학습일지에
 *   따로 있잖아」. 실제로 9/3 데일리테스트가 학습일지에 이미 들어가 있었고 매쓰홀릭 값과
 *   한 자리도 안 틀렸다 — 선생님들이 그걸 손으로 치고 계셨던 것이다.
 *
 *   학습지로 넣으면 **같은 점수가 두 군데에 생기고** 성취도·브리핑이 이중으로 센다.
 */
export function isDailyTest(row: { title?: string | null; kind?: string | null }): boolean {
  return /daily\s*test|데일리/i.test(`${row.title ?? ''} ${row.kind ?? ''}`)
}

/**
 * 교재연계로 낸 것인가 — 스터디체크에서는 **쌍둥이 학습지(twin)** 다.
 *
 * ★ 매쓰홀릭의 「교재 연계」(시중교재·교과서·매쓰홀릭 교재)는 카드 설명 그대로
 *   **쌍둥이·유사 문제 출제**다. 그래서 레벨이 없고 쪽 범위로 낸다
 *   (「[쎈] 중등 1-1 (2022개정) P.18 ~ P.80」).
 *   원장님 2026-10-30 「[교재]는 쌍둥이 학습지로 들어가야돼」.
 *   실제로 그 교재 과제가 스터디체크에 worksheet_type='twin' 으로 들어가 있었다.
 */
/**
 * 교재 이름을 견줄 수 있게 꼴을 맞춘다.
 *   · 전각 → 반각 — 교재 목록에 「개념＋유형(유형편)」과 「개념+유형」이 섞여 있다.
 *   · 대소문자 — 「RPM」·「rpm」.
 * 띄어쓰기는 **지우지 않는다** — 「쎈」 한 글자를 낱말로 가려내는 데 띄어쓰기가 필요하다.
 */
export function normBook(s: string): string {
  return String(s ?? '')
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** 한 글자 이름은 **낱말로 떨어져 있을 때만** 본다 (아래 설명) */
function 이름이있나(띈것: string, 붙인것: string, 이름: string): boolean {
  const n = 이름.replace(/\s+/g, '')
  if (!n) return false
  if (n.length >= 2) return 붙인것.includes(n)
  // ★ 「쎈」은 **한 글자**다. 그냥 찾으면 「분수의 나눗셈」의 「수」처럼 단원 이름 속
  //   한 글자에 걸린다. 그래서 앞뒤가 한글이 아닐 때만 — 「쎈 중등 1-1」·「쎈3-2」는
  //   걸리고 「분수의」는 안 걸린다. 「베이직쎈」은 그 이름이 목록에 따로 있어 길게 걸린다.
  for (let i = 띈것.indexOf(n); i >= 0; i = 띈것.indexOf(n, i + 1)) {
    const 앞 = i > 0 ? 띈것[i - 1] : ''
    const 뒤 = i + n.length < 띈것.length ? 띈것[i + n.length] : ''
    if (!/[가-힣]/.test(앞) && !/[가-힣]/.test(뒤)) return true
  }
  return false
}

/**
 * 제목에 **시중교재·교과서 이름**이 들어 있나. 있으면 그 교재 이름을 돌려준다.
 *
 * ★ 원장님 2026-10-31 「교재명이 학습지 이름에 쓰여있는 경우도 있어 이건 쌍둥이 학습지야」,
 *   2026-11-02 「레벨이 없어도 시중교재나 교과서가 붙어있으면 쌍둥이 학습지로」.
 *   이름 목록을 **코드에 박지 않는다** — `textbook_catalog` 를 읽는다. 선생님이 교재를
 *   새로 등록하면 그 이름도 저절로 걸려야 한다.
 *
 * ★ **긴 이름부터** 맞춘다 — 「쎈」이 「쎈B」·「베이직쎈」·「라이트쎈」·「쎈연산」 안에 들어 있다.
 *   다 쌍둥이라 결과는 같지만, 어느 교재인지 적을 때는 긴 쪽이 맞다.
 * ★ 괄호 안은 이름으로 쓰지 않는다 — 목록에 교재명 뒤 괄호로 **학생 이름**이 붙은 것이
 *   넷 있다. 괄호를 떼면 교재명만 남고(「쎈」·「베이직쎈」·「개념유형 라이트」), 그 이름은
 *   목록에 이미 따로 있다. 그래서 학생 이름은 대조에 **들어가지 않는다.**
 */
export function matchTextbook(title: string, books: string[] | null | undefined): string | null {
  const 띈것 = normBook(title)
  if (!띈것) return null
  const 붙인것 = 띈것.replace(/\s+/g, '')
  let best: string | null = null
  for (const raw of books ?? []) {
    const 적힌이름 = String(raw ?? '').trim()
    if (!적힌이름) continue
    // 괄호를 뗀 꼴도 같이 본다 — 「쎈3-2 (박유준)」 → 「쎈3-2」
    for (const cand of [적힌이름, 적힌이름.replace(/\s*[(（][^)）]*[)）]\s*$/, '').trim()]) {
      if (!cand) continue
      if (!이름이있나(띈것, 붙인것, normBook(cand))) continue
      if (!best || cand.replace(/\s+/g, '').length > best.replace(/\s+/g, '').length) best = cand
    }
  }
  return best
}

export function isTextbookLinked(row: { title?: string | null; kind?: string | null }, books?: string[] | null): boolean {
  const t = `${row.title ?? ''} ${row.kind ?? ''}`
  // ★ 「교과서」도 쌍둥이다 (원장님 2026-11-02 「시중교재나 교과서가 붙어있으면」).
  if (/교재|교과서/.test(t)) return true
  if (/\bP\.?\s*\d+\s*[~\-]/i.test(t)) return true
  // ★ 교재 **이름**이 적혀 있어도 쌍둥이다. 목록을 안 넘겨 주면 이 줄은 돌지 않는다 —
  //   부르는 쪽에서 `textbook_catalog` 를 읽어 넘겨야 한다.
  return matchTextbook(t, books) != null
}

/** 학습지관리에 넣을 때의 갈래. main(레벨학습지) · similar(오답유사) · twin(쌍둥이) */
/**
 * 오답 학습지인가 — 「오답유사」·「오답문제」·「오답 모음」 다 같다.
 * 원장님 2026-11-02 「오답유사 또는 오답문제는 오답학습지거든」.
 * ★ 예전에는 「오답유사」가 붙어 있을 때만 걸렸다. 선생님마다 쓰는 말이 달라서
 *   「오답문제」로 적은 것은 레벨학습지로 들어갔다.
 */
export function isWrongNote(row: { title?: string | null; kind?: string | null }): boolean {
  return /오답/.test(`${row.title ?? ''} ${row.kind ?? ''}`)
}

export function worksheetTypeOf(row: { title?: string | null; kind?: string | null }, books?: string[] | null): 'main' | 'similar' | 'twin' {
  // ★ 오답이 교재보다 먼저다 — 「쎈 오답문제」는 오답 학습지다
  //   (원장님 2026-10-31 「오답인데도 레벨이 있어도 오답이 이겨」).
  if (isWrongNote(row)) return 'similar'
  if (isTextbookLinked(row, books)) return 'twin'
  return 'main'
}

/**
 * 이너프원으로 만든 것인가.
 *
 * ★ 이너프원은 **학습지가 아니라 내신대비교재**다 (원장님 2026-10-29
 *   「이너프원은 학습지가 아니라 내신대비교재로 들어간거라… 학습지에는 기록되지 않게」).
 *   중2·중3 학습지 중에 이너프원으로 만든 것이 섞여 있는데, 그대로 넣으면 학습지관리에
 *   **있지도 않은 레벨학습지**가 쌓이고 레벨 현황판이 틀어진다.
 *
 * 그래서 읽기는 하되 **넣지 않는다.** 조용히 버리지 않고 「제외」로 화면에 보여 준다 —
 * 빠진 것인지 일부러 뺀 것인지 사람이 알아야 한다.
 * 새 제목 규칙에서는 머리표를 「[이너프원]」으로 적는다.
 */
export function isEnoughOne(row: { title?: string | null; kind?: string | null; level?: number | null }, books?: string[] | null): boolean {
  const t = `${row.title ?? ''} ${row.kind ?? ''}`
  if (/이너프\s*원|이너프\s*1|enough\s*one/i.test(t)) return true
  // ★ 이름을 안 붙이고 「3회차」처럼만 적힌 것도 이너프원이다 —
  //   원장님 2026-11-02 「학습지 이름에 레벨이 없고 00회차 이렇게 쓰여 잇는건
  //   이너프원이야 안넣어도됨」. **레벨이 없는 것**이 열쇠다. 레벨학습지는 레벨이 있다.
  //   ★ 다른 칸으로 갈 줄은 가로채지 않는다 — 오답(레벨을 물려받는다) · 데일리테스트
  //     (학습일지로 간다) · 코어테스트(평가관리로 간다)는 레벨이 없어도 이너프원이 아니다.
  //     이 판정이 화면에서 **맨 먼저** 돌기 때문에, 여기서 걸리면 그 줄은 통째로 사라진다.
  if (row.level == null && /\d+\s*회차/.test(t)
    && !isWrongNote(row) && !isDailyTest(row) && !coreTestRound(row) && !isDiagnostic(row)
    && !isTextbookLinked(row, books)) return true
  return false
}

/**
 * 코어테스트인가. 맞으면 **몇 회차**인지 돌려준다.
 *
 * ★ TOMA 수학경시대회가 스터디체크의 **코어테스트 본고사**다
 *   (원장님 2026-10-29 「TOMA는 코어테스트 평가로 들어가야돼」).
 *   확인도 했다 — 같은 날 같은 점수가 코어테스트 본고사로 **이미 손으로 들어가 있었다.**
 *
 * 코어테스트는 학습지도 학습일지도 아니고 **평가관리**로 간다
 *   (exams 표, exam_type = '코어테스트'). 회차 이름은 화면이 쓰는 그대로 —
 *   「예비 1회」·「예비 2회」·「본고사」.
 *
 * 새 제목 규칙으로는 「[코어테스트] 예비 1회 …」처럼 머리표와 회차를 같이 적는다.
 * 회차가 안 적혀 있으면 본고사로 본다 (TOMA 가 본고사라서).
 */
export function coreTestRound(row: { title?: string | null; kind?: string | null }): string | null {
  const t = `${row.title ?? ''} ${row.kind ?? ''}`
  // ★ TOMA·코어테스트를 **먼저** 본다. 매쓰홀릭은 TOMA 건에도 종류를 「월간평가」로
  //   붙여 준다 — 월간평가를 먼저 보면 TOMA 본고사가 「월간평가」로 밀린다(검사가 잡았다).
  if (!/TOMA|코어\s*테스트/i.test(t)) {
    // 월간평가도 코어테스트로 올린다 (원장님 2026-11-02 「월간평가는 코어테스트로
    // 올리면됨」). 회차 이름은 「월간평가」 그대로 — 예비·본고사와 섞이지 않게.
    if (/월간\s*평가|월간\s*테스트/.test(t)) return '월간평가'
    return null
  }
  if (/예비\s*2/.test(t)) return '예비 2회'
  if (/예비\s*1/.test(t)) return '예비 1회'
  return '본고사'
}

/**
 * **진단평가**인가 — 맞으면 학습지가 아니라 **평가관리의 진단평가**로 간다.
 *
 * 원장님 2026-11-06 「주간평가는 평가로 들어가야해. 진단평가에 넣으면 됨.
 * 제목에 맞춰 단원에 맞게 넣어주고」.
 *
 * ★ **레벨이 적혀 있으면 평가가 아니라 레벨학습지다.** 같은 「주간평가」라는 말이
 *   두 군데서 쓰이기 때문이다 —
 *     · 진단평가 메뉴: 「11월 주간평가(1) - 기본도형[1단계]」 (레벨 없음, 단계로 적는다)
 *     · 학습지 메뉴:  「[주간평가] 중1-2 1. 기본도형 ~ 3. 입체도형_Lv3.5」 (레벨 있음)
 *   레벨로 가르지 않으면 뒤쪽 학습지가 통째로 평가관리로 새어 나간다
 *   (2026-11-06 실측: 같은 날 앞 8건·뒤 5건이 섞여 있었다).
 *   원장님 규칙 「학습지 제목에 레벨이 쓰여있으면 무조건 레벨학습지」와도 같은 방향이다.
 *
 * ★ **「단원평가」는 여기 넣지 않는다.** 스터디체크에서 단원평가는 **초등 학교시험**이고
 *   (평가관리 학교시험 탭 · 단원평가 현황판) 선생님이 학교 점수를 손으로 적는 칸이다.
 *   그런데 매쓰홀릭 초등 레벨학습지 제목에 「4학년 2학기 4단원 단원평가 Lv3」처럼
 *   그 말이 흔히 들어 있다. 여기로 보내면 **학교 점수 칸에 학원 학습지 점수가 쌓인다.**
 *   원장님께 2026-11-06 에 그대로 알려 드리고 레벨학습지로 두기로 했다.
 *
 * ★ `coreTestRound` 를 **먼저** 본다 — 월간평가는 코어테스트로 간다(2026-11-02).
 *
 * ★ **「주말복습 TEST」는 레벨이 적혀 있어도 평가다** (원장님 2026-11-07 「주말복습 테스트는
 *   평가관리.진단평가로 가야해. 주중에 했던 범위를 테스트 하는 거거든」).
 *   위 레벨 규칙의 **유일한 예외**다 — 매쓰홀릭에서 레벨별로 나가기 때문에 제목에 (lv2.5)가
 *   붙어 오지만, 성격은 학습지가 아니라 그 주에 한 범위를 보는 시험이다.
 *   「TEST·테스트·시험·평가」가 같이 적힌 것만 본다 — 「주말복습 학습지」는 학습지 그대로 둔다.
 *   그리고 **제목만** 본다(종류 칸은 안 본다) — 매쓰홀릭은 「주말과제」까지 종류를 「주말복습」으로
 *   바꿔 주기 때문에, 종류를 보면 과제가 시험으로 밀린다.
 */
export function isDiagnostic(row: { title?: string | null; kind?: string | null; level?: number | null }): boolean {
  if (coreTestRound(row)) return false
  if (WEEKEND_REVIEW.test(String(row.title ?? ''))) return true
  const t = `${row.title ?? ''} ${row.kind ?? ''}`
  if (!/진단\s*평가|주간\s*평가|주말\s*평가/.test(t)) return false
  return row.level == null
}

/** 진단평가 제목에서 떼어낸 것 — 평가관리의 `unit_name` 과 `level` 칸에 그대로 들어간다. */
export interface DiagnosticParts {
  /** '기본도형' · '도형의 닮음' — 못 찾으면 null (제목은 memo 에 그대로 남긴다) */
  unitName: string | null
  /** 「[2단계]」의 2. 없으면 제목의 레벨 표기, 그것도 없으면 null */
  level: number | null
}

/**
 * 「11월 주간평가(1) - 기본도형[1단계]」 → 단원 '기본도형' · 단계 1.
 *
 * 평가관리의 진단평가는 선생님들이 `unit_name` 에 단원 이름만 적고 `level` 에 단계를 적는다
 * (실측 2026-11-06: 「1. 기본도형~2. 작도와 합동」 level 2 꼴). 제목을 통째로 넣으면
 * 「11월 주간평가(1)」이 단원 이름이 되고, 평가관리에서 같은 단원끼리 모이지 않는다.
 *
 * 덜어내는 것: 「[…]」 머리표·「11월」·「첫째주」·「주간평가(1)」·레벨 표기.
 * 남은 것이 단원이다. 아무것도 안 남으면 null — **지어내지 않는다.**
 */
export function parseDiagnosticTitle(title: string): DiagnosticParts {
  let t = String(title ?? '').trim()
  const 단계 = /\[\s*([0-9]+(?:\.[0-9]+)?)\s*단계\s*\]/.exec(t)
  const level = 단계 ? Number(단계[1]) : levelOf(LEVEL.exec(t))
  // ★ 주말복습 테스트는 **단원이 제목에 없다** — 주중에 한 범위를 보는 시험이라
  //   제목에는 학년·반(A·B·S)·날짜(1107)·레벨만 적힌다. 그것들을 단원 이름으로 넣으면
  //   평가관리에서 한 줄씩 따로 흩어진다. 그래서 「주말복습」 하나로 모은다.
  //   원래 제목은 화면이 memo 에 그대로 남긴다 (원장님 2026-11-07).
  if (WEEKEND_REVIEW.test(t)) return { unitName: '주말복습', level }
  t = t
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[0-9]+\s*월/g, ' ')
    .replace(/(첫|둘|두|셋|세|넷|네|다섯)\s*째\s*주/g, ' ')
    .replace(/(진단|주간|주말)\s*평가\s*(\([0-9]+\))?/g, ' ')
    .replace(LEVEL, ' ')
    .replace(/[-–~·,\s]+$/g, '')
    .replace(/^[-–~·,\s]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return { unitName: t || null, level }
}

/** 제목에서 떼어낸 것들. 학습지를 새로 만들 때 이 값들이 그대로 칸에 들어간다. */
export interface TitleParts {
  /** '초6' · '중1' · '고1' — students.grade 와 같은 꼴 */
  gradeLevel: string | null
  /** 초등만 학기를 쓴다 (중·고는 과정 이름 자체가 한 학기라 비운다) */
  semester: number | null
  /** '1단원' · 'Ⅱ 문자와 식' */
  unit: string | null
  /** '분수의 나눗셈' — 단원 뒤에 이름이 더 있으면 그것 */
  unitName: string | null
  /** 3.5 */
  level: number | null
  /** '-2차' 의 2 (재도전 몇 번째인가) */
  round: number | null
}

/**
 * 「[학습지] 초6-2 1단원 분수의 나눗셈_Lv5」 같은 제목을 칸별로 떼어낸다.
 *
 * ★ **학습지는 레벨학습지다** (원장님 2026-10-29 「레벨별 학습지가 중요하거든… 거기에는
 *   반드시 레벨이 제목에 있어야 하고 단원별 레벨별로 점수 기록해야 하는 거 알지?」).
 *   단원과 레벨이 칸에 제대로 들어가야 **레벨 현황판**과 **초등 70점 규칙**이 돈다.
 *   제목을 통째로 unit_name 에 넣으면 그 두 가지가 조용히 멈춘다 — 에러는 안 난다.
 *
 * 떼는 규칙 (순서대로 덜어낸다)
 *   ① 「초6-2」·「중1-1」·「고1」  → 학년과 학기
 *   ② 「_Lv3.5」                → 레벨
 *   ③ 「-2차」                  → 재도전 차수
 *   ④ 남은 것이 단원. 첫 토막이 「1단원」 꼴이면 거기서 한 번 더 가른다
 *      ('1단원 분수의 나눗셈' → unit '1단원' / unitName '분수의 나눗셈')
 */
export function parseWorksheetTitle(title: string): TitleParts {
  let t = String(title ?? '').trim()

  const g = /(초|중|고)\s*([1-6])(?:\s*-\s*([12]))?/.exec(t)
  const gradeLevel = g ? `${g[1]}${g[2]}` : null
  // 학기는 초등만 쓴다 — 중·고는 student_worksheets.semester 를 비워 두는 것이 기존 방식이다.
  const semester = g && g[3] && g[1] === '초' ? Number(g[3]) : null
  if (g) t = (t.slice(0, g.index) + ' ' + t.slice(g.index + g[0].length)).trim()

  const lv = LEVEL.exec(t)
  const level = levelOf(lv)
  if (lv) t = (t.slice(0, lv.index) + ' ' + t.slice(lv.index + lv[0].length)).trim()

  const rd = /[-_\s]\s*([0-9]+)\s*차/.exec(t)
  const round = rd ? Number(rd[1]) : null
  if (rd) t = (t.slice(0, rd.index) + ' ' + t.slice(rd.index + rd[0].length)).trim()

  t = t.replace(/^[\s_\-·]+|[\s_\-·]+$/g, '').replace(/\s+/g, ' ')
  let unit: string | null = t || null
  let unitName: string | null = t || null
  const head = /^(\d+\s*단원)\s+(.+)$/.exec(t)
  if (head) { unit = head[1].replace(/\s+/g, ''); unitName = head[2] }
  return { gradeLevel, semester, unit, unitName, level, round }
}

/**
 * 레벨이 **반드시 있어야 하는** 종류인가.
 * 학습지와 오답유사는 레벨학습지라 레벨 없이 넣으면 레벨 현황판이 틀어진다.
 * 주말복습·단원평가 같은 것은 레벨이 있으면 쓰고 없어도 괜찮다.
 */
export function needsLevel(row: { title?: string | null; kind?: string | null }, books?: string[] | null): boolean {
  const t = `${row.title ?? ''} ${row.kind ?? ''}`
  if (/주말복습|단원평가|진단평가|월간평가|주간평가/.test(t)) return false
  // ★ 교재연계(= 쌍둥이 학습지)는 레벨 개념이 없다 — 교재와 쪽 범위로 낸다.
  //   여기를 안 빼 두면 교재 과제가 통째로 「레벨이 없어요」로 막힌다 (2026-10-29 예행에서 걸렸다).
  if (isTextbookLinked(row, books)) return false
  // ★ 오답 학습지도 레벨을 **적어 오지 않는다** — 직전 레벨학습지의 레벨을 물려받기
  //   때문이다 (원장님 2026-11-02 「이전 레벨 학습지의 레벨과 동일하게 해줘」).
  //   여기를 안 빼 두면 오답 줄이 통째로 「레벨이 없어요」로 막힌다.
  if (isWrongNote(row)) return false
  return /학습지|오답유사/.test(t)
}

/**
 * 그 학생의 **직전 레벨학습지 레벨.** 오답 학습지가 물려받을 값이다.
 * 그 날짜까지 받은 레벨학습지(main) 중 가장 나중 것을 본다 — 오답은 그 뒤에 나오므로
 * 날짜를 안 자르면 나중에 올라간 레벨을 거꾸로 물려받는다.
 */
export function prevLevelOf(list: WsCandidate[], onDate: string): number | null {
  const got = list.filter((w) => w.worksheet_type === 'main' && w.current_level != null
    && String(w.assigned_at ?? '').slice(0, 10) <= onDate)
  if (!got.length) return null
  got.sort((a, b) => String(a.assigned_at ?? '').localeCompare(String(b.assigned_at ?? '')))
  return got[got.length - 1].current_level
}

/**
 * 레벨 칸에 넣을 값. **비워 둘 수 없다.**
 *
 * ★ `student_worksheets.current_level` 은 NOT NULL 이다 (DB 기본값 2.5).
 *   레벨이 없어도 들어가게 막이를 푸는 것만으로는 모자라다 — 그대로 비워 보내면
 *   DB 가 거절하고 그 줄은 통째로 안 들어간다 (2026-11-02 에 19건이 이렇게 실패했다.
 *   「null value in column "current_level" … violates not-null constraint」).
 *
 * 못 찾으면 **Lv1** 로 넣는다. 교재연계 출제 화면이 쌍둥이 학습지를 만들 때 쓰는 값과
 * 같게 맞춘 것이다(`app/teacher/assignments/page.tsx`). 화면에는 「레벨이 없어 Lv1 로
 * 넣습니다」라고 **적어 보여 준다** — 조용히 1을 넣으면 레벨 현황판이 틀어져도 모른다.
 */
export const DEFAULT_LEVEL = 1
export function levelForInsert(level: number | null | undefined): number {
  return level == null || Number.isNaN(Number(level)) ? DEFAULT_LEVEL : Number(level)
}

/**
 * 오답 학습지의 제목과 레벨.
 *   · 제목에는 **「오답학습지」**가 들어가야 한다 (원장님 2026-11-02 「기존 규칙대로
 *     제목에 오답학습지라고 넣어주고」). 이미 들어 있으면 그대로 둔다.
 *   · 레벨은 **그 학생의 직전 레벨학습지와 같게** 한다. 오답은 그 레벨에서 틀린 것을
 *     다시 푸는 것이라 레벨이 따로 있을 수 없다. 직전 레벨학습지가 없으면 적힌 대로 둔다.
 */
export function wrongNoteFix(
  unitName: string, level: number | null, prevMainLevel: number | null,
): { unitName: string; level: number | null } {
  const t = String(unitName ?? '').trim()
  const named = /오답\s*학습지/.test(t) ? t : (t ? `오답학습지 ${t}` : '오답학습지')
  return { unitName: named.replace(/\s+/g, ' ').trim(), level: prevMainLevel ?? level }
}

export interface SessionLite { id: string; student_id: string; session_date: string; daily_test_score: number | null }

/** 집에서 푼 것을 수업에 붙일 때, 이만큼 넘게 떨어져 있으면 **붙이지 않는다.** */
export const DAILY_MAX_GAP_DAYS = 14

/**
 * 데일리테스트 점수를 **어느 수업 기록에 적을지** 고른다.
 *
 * 규칙 (원장님 2026-10-29)
 *   「학습지 점수가 기록되는 날짜는 학원에 와서 채점을 받은 날이야. 그래서 당연히 수업날로
 *    기록되면 됨. 아, 다만 학생에게 과제로 아예 답안 입력해서 점수가 나오게 하는 경우도
 *    있거든. 그럴때 그 뒤(앞이 아니라) 가장 가까운 수업에 붙여줘. 수업이 없을때는 당연히
 *    작성되면 안 되는거고.」
 *
 *   ① 그날 수업이 있으면 **그 수업**에 적는다 (거의 다 이 경우다 — 와서 채점받는다)
 *   ② 없으면 **그 뒤** 가장 가까운 수업. 집에서 풀고 다음 수업에 가져오는 경우다
 *   ③ **앞은 보지 않는다.** 아직 풀지도 않은 날에 점수가 생기면 안 된다
 *   ④ 그 뒤로도 수업이 없거나 너무 멀면 **적지 않는다**
 */
export function pickSessionForDaily(
  date: string, sessions: SessionLite[], maxGapDays = DAILY_MAX_GAP_DAYS,
): { session: SessionLite; gapDays: number } | null {
  const same = sessions.find((c) => c.session_date === date)
  if (same) return { session: same, gapDays: 0 }
  let best: SessionLite | null = null
  for (const c of sessions) {
    if (c.session_date <= date) continue            // 앞은 보지 않는다
    if (!best || c.session_date < best.session_date) best = c
  }
  if (!best) return null
  const gap = Math.round((Date.parse(best.session_date) - Date.parse(date)) / 86400_000)
  return gap <= maxGapDays ? { session: best, gapDays: gap } : null
}

// ────────────────────────────────────────────────────────────────────────────
// 제목에 적힌 단원 이름을 **개념 사전에 대고 찾기**
// ────────────────────────────────────────────────────────────────────────────

export interface ConceptRow {
  grade: string | null
  semester: number | null
  chapter: string | null
  sub_chapter: string | null
  concept_name: string | null
}

/** 어느 층에서 찾았나. 소개념이 가장 좁고 대단원이 가장 넓다. */
export type UnitLevel = '소개념' | '중단원' | '대단원'

export interface ResolvedUnit {
  chapter: string | null
  subChapter: string | null
  conceptName: string | null
  level: UnitLevel
  /** 얼마나 확실한가 — 2 글자 그대로 같으면 10, 한쪽이 다른 쪽을 품으면 6, 겹치는 만큼이면 그 아래 */
  score: number
}

/**
 * 비교하려고 글자를 고른다. 번호·로마숫자·띄어쓰기·기호를 떼어
 * 「Ⅱ 문자와 식」·「2. 문자와 식」·「문자와식」이 **같은 말**이 되게 한다.
 */
function normUnit(s: string): string {
  return String(s ?? '')
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, ' ')
    .replace(/\d+\s*[.)\-]/g, ' ')
    .replace(/단원|파트|part/gi, ' ')
    .replace(/[^가-힣a-zA-Z0-9]/g, '')
}

/** 두 글자씩 끊어 겹치는 비율 — 「일차방정식」과 「일차방정식의 활용」처럼 반만 같은 것을 가린다. */
function overlap(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0
  const grams = (x: string) => new Set(Array.from({ length: x.length - 1 }, (_, i) => x.slice(i, i + 2)))
  const A = grams(a), B = grams(b)
  let hit = 0
  for (const g of A) if (B.has(g)) hit++
  return hit / Math.min(A.size, B.size)
}

function compare(want: string, got: string | null | undefined): number {
  const g = normUnit(got ?? '')
  if (!want || !g) return 0
  if (want === g) return 10
  if (want.length >= 3 && g.length >= 3 && (want.includes(g) || g.includes(want))) return 6
  const r = overlap(want, g)
  return r >= 0.6 ? 2 + r * 2 : 0
}

/**
 * 제목에 적힌 단원 이름을 **개념 사전(concepts)** 에 대고 찾는다.
 *
 * 왜 (원장님 2026-10-29)
 *   「단원이름을 스터디체크 그대로 어떻게 쓰냐. 소개념일수도 있고 소단원일수도 있고
 *    중단원일수도 있는데 여튼 그 제목을 쓰면 너가 알아서 매칭해서 붙여줘야지」
 *
 *   맞는 말이다. 선생님께 스터디체크의 글자를 그대로 옮겨 적으라고 하는 것은
 *   **기계가 할 일을 사람에게 떠넘기는 것**이다. 개념 사전이 대단원·중단원·소개념
 *   세 층으로 다 들어 있으니, 어느 층의 이름을 쓰시든 여기서 찾아 올린다.
 *
 *   「원의 방정식」(소개념) 이라고 쓰시면 → 대단원 「Ⅱ 도형의 방정식」까지 같이 알아낸다.
 *   「도형의 방정식」(대단원) 이라고 쓰시면 → 그 대단원으로 바로 잡힌다.
 *
 * ★ 못 찾으면 **null** 이다. 억지로 비슷한 것을 집지 않는다 —
 *   엉뚱한 단원에 점수가 들어가면 레벨 현황판이 조용히 틀어진다.
 */
/**
 * 과정 칸(「중등 1-1 (2022 개정)」)에서 **진짜 학년**을 읽는다.
 *
 * ★ 학생의 학년을 쓰면 안 된다. 선행하는 학생이 많다 — 초6 학생이 중1-1 학습지를 푼다.
 *   그 학생의 학년(초6)으로 개념 사전을 뒤지면 중1 단원을 영영 못 찾는다
 *   (2026-10-29 예행에서 「2. 문자와 식」이 통째로 「못 찾음」으로 나왔다).
 * ★ 고등은 과정 이름이 과목명(공통수학2 …)이라 학년이 안 적혀 있다. 그때는 null 을
 *   돌려주고 부르는 쪽이 학생 학년으로 메운다 — 고등은 선행이 학년을 넘지 않는다.
 */
export function gradeFromCourse(course?: string | null): { grade: string; semester: number | null } | null {
  const m = /(초등|중등|고등|초|중|고)\s*([1-6])(?:\s*-\s*([12]))?/.exec(String(course ?? ''))
  if (!m) return null
  const head = m[1][0]
  return { grade: `${head}${m[2]}`, semester: head === '초' && m[3] ? Number(m[3]) : null }
}

export function resolveUnit(text: string, grade: string | null, concepts: ConceptRow[]): ResolvedUnit | null {
  const want = normUnit(text)
  if (want.length < 2) return null
  const pool = grade ? concepts.filter((c) => c.grade === grade) : concepts
  const rows = pool.length ? pool : concepts

  let best: ResolvedUnit | null = null
  const take = (c: ConceptRow, level: UnitLevel, score: number) => {
    if (score <= 0) return
    // 같은 점수면 **좁은 층**을 고른다 — 소개념으로 적으셨으면 그 뜻이다.
    const rank = (l: UnitLevel) => (l === '소개념' ? 3 : l === '중단원' ? 2 : 1)
    if (best && (best.score > score || (best.score === score && rank(best.level) >= rank(level)))) return
    best = { chapter: c.chapter, subChapter: c.sub_chapter, conceptName: c.concept_name, level, score }
  }
  for (const c of rows) {
    take(c, '소개념', compare(want, c.concept_name))
    take(c, '중단원', compare(want, c.sub_chapter))
    take(c, '대단원', compare(want, c.chapter))
  }
  return best
}

// ────────────────────────────────────────────────────────────────────────────
// 학생 찾기
// ────────────────────────────────────────────────────────────────────────────

export interface StudentLite { id: string; name: string; grade: string | null; teacher_name: string | null }

/**
 * 매쓰홀릭 이름 → 스터디체크 학생.
 *
 * ★ **동명이인은 자동으로 정하지 않는다.** 재원·휴원 중에 같은 이름이 세 쌍 있다
 *   (학년이 다르다). 엉뚱한 학생에게 점수가 들어가면
 *   그 학생의 성적표와 학부모 브리핑까지 틀어진다 — 그러고도 아무 에러가 안 난다.
 *
 * ★ 매쓰홀릭은 같은 이름을 「정우찬2」처럼 **꼬리 숫자**로 가른다. 그 숫자가 스터디체크의
 *   누구인지는 매쓰홀릭만 아는 것이므로, 꼬리가 붙어 있으면 **후보를 전부 돌려주고
 *   사람이 고르게 한다.** 숫자만 떼고 아무나 집으면 반반 확률로 틀린다.
 */
/**
 * 매쓰홀릭 이름 → **담당 강사** 규칙.
 *
 * 왜 이런 표가 필요한가
 *   같은 이름이 둘일 때 매쓰홀릭은 꼬리를 붙여 가른다 — 「…2」·「…h」. 그런데
 *   **그 꼬리가 누구를 가리키는지는 매쓰홀릭만 안다.** 스터디체크에는 둘 다 꼬리 없이
 *   들어 있어서, 꼬리만 떼면 반반 확률로 틀린다. 꼬리가 없는 쪽이 누구인지도 마찬가지다.
 *
 * ★ **표는 코드에 두지 않는다.** 학생 실명이 저장소에 들어가면 안 되고(커밋이 막힌다),
 *   원장님이 직접 고치실 수 있어야 한다. `app_settings` 의 `matholic_name_rules` 에
 *   `{ "이름2": "강사이름" }` 꼴로 넣고 화면이 읽어 온다.
 * ★ 규칙대로 골라도 **화면에는 「규칙으로 골랐어요」라고 적고 바꿀 수 있게 둔다.**
 *   규칙이 바뀌었는데 설정이 안 바뀐 경우가 있을 수 있어서다.
 * ★ 규칙에 없는 이름은 **사람이 고른다.** 모르면 묻는 쪽이 맞다.
 */
export type NameRules = Record<string, string>

export function findStudents(name: string, all: StudentLite[]): StudentLite[] {
  const raw = String(name ?? '').trim()
  if (!raw) return []
  const exact = all.filter((s) => s.name === raw)
  // 꼬리를 뗀 이름으로도 찾는다. 숫자뿐 아니라 영문 꼬리(「…h」)도 쓰인다.
  const bare = raw.replace(/[0-9A-Za-z]+$/, '').trim()
  const loose = bare && bare !== raw ? all.filter((s) => s.name === bare) : []
  // ★ 그래도 못 찾으면 **이름의 일부**로 찾는다 (원장님 2026-11-02 「스터디체크에는
  //   스미스마이클로 등록은 되어 있는데 매쓰홀릭에는 마이클로 등록해놨거든」).
  //   성을 빼고 부르는 외국 이름, 스터디체크에만 꼬리가 붙은 이름(「…j」)이 여기 걸린다.
  //
  //   ★ **앞의 둘이 아무도 못 찾았을 때만** 본다 — 평범한 세 글자 이름의 동작은 그대로다.
  //   ★ 여럿 걸리면 고르지 않는다. 「서연」처럼 짧은 이름은 여러 명에 들어가므로 후보를
  //     전부 돌려주고 **사람이 고른다**(화면이 그렇게 돼 있다).
  //   ★ 두 글자보다 짧으면 보지 않는다 — 한 글자는 아무 이름에나 들어간다.
  const part: StudentLite[] = []
  if (!exact.length && !loose.length) {
    const k = (bare || raw).replace(/\s+/g, '')
    if (k.length >= 2) {
      for (const st of all) {
        const n = String(st.name ?? '').replace(/\s+/g, '')
        if (!n) continue
        const 길이맞나 = Math.min(n.length, k.length) >= 2
        if (길이맞나 && (n === k || n.includes(k) || k.includes(n))) part.push(st)
      }
    }
  }

  // 이름이 똑같이 적힌 학생이 있어도, 꼬리를 뗀 이름의 학생이 따로 더 있으면 **둘 다** 후보다.
  // (스터디체크에 꼬리 붙은 이름이 **따로 저장돼 있는** 학생들이 있다 — 어느 쪽인지 사람이 봐야 한다.)
  const seen = new Set<string>()
  return [...exact, ...loose, ...part].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
}

/**
 * 매쓰홀릭 이름과 스터디체크 이름이 **다른가.** 다르면 화면에 그대로 적어 보여 준다 —
 * 조용히 바꿔 치면 엉뚱한 학생에게 점수가 들어가도 아무도 모른다.
 */
export function nameDiffers(matholicName: string, student: StudentLite | null | undefined): boolean {
  if (!student) return false
  return String(matholicName ?? '').trim().replace(/\s+/g, '') !== String(student.name ?? '').trim().replace(/\s+/g, '')
}

/**
 * 후보가 여럿일 때 **원장님 규칙으로** 한 명을 고른다. 규칙에 없으면 아무도 안 고른다.
 * 고른 뒤에도 화면에서 바꿀 수 있어야 한다 — 규칙은 거들 뿐 사람을 대신하지 않는다.
 */
export function pickByRule(name: string, candidates: StudentLite[], rules: NameRules): StudentLite | null {
  const teacher = (rules ?? {})[String(name ?? '').trim()]
  if (!teacher) return null
  const hit = candidates.filter((s) => splitTeacherNames(s.teacher_name).includes(teacher))
  return hit.length === 1 ? hit[0] : null
}

/** 「조윤희, 이규숙」·「조윤희 이규숙」 → ['조윤희','이규숙'] (lib/teachers.ts 와 같은 규칙) */
function splitTeacherNames(t?: string | null): string[] {
  return String(t ?? '').split(/[,，、·/\s]+/).map((x) => x.trim()).filter(Boolean)
}

// ────────────────────────────────────────────────────────────────────────────
// 어느 학습지에 붙일지 고르기 (이미 스터디체크에 배정이 있는 경우에만)
// ────────────────────────────────────────────────────────────────────────────

export interface WsCandidate {
  id: string
  student_id: string
  grade_level: string | null
  unit: string | null
  unit_name: string | null
  current_level: number | null
  worksheet_type: string | null
  status: string | null
  score: number | null
  assigned_at: string | null
  submitted_at: string | null
}

export interface Scored {
  ws: WsCandidate
  points: number
  why: string[]
  /**
   * 제목과 단원 이름이 **실제로 겹쳤나.**
   *
   * ★ 이게 없으면 레벨만 같은 엉뚱한 학습지에 점수가 들어간다. 2026-10-29 시험 삼아
   *   돌려 보니 어느 고1 학생의 「Daily Test (lv2.5)」가 전혀 다른 단원의 Lv2.5 학습지에 붙었다 —
   *   레벨 4점 + 점수 비어 있음 2점 = 6점으로 「확실함」 문턱을 넘었기 때문이다.
   *   단원이 안 겹치면 아무리 점수가 높아도 **확실하다고 하지 않는다.**
   */
  unitHit: boolean
}

/** 「분수의 나눗셈」처럼 뜻이 있는 토막만 남긴다. 숫자·괄호·레벨 표시는 뺀다. */
function titleWords(title: string): string[] {
  return title
    .replace(/\[[^\]]*\]/g, ' ')          // [s코어반] 같은 머리표
    .replace(LEVEL, ' ')
    .replace(/[0-9]+(?:학년|학기|단원|차)/g, ' ')
    .replace(/[^가-힣a-zA-Z]+/g, ' ')
    .split(/\s+/).filter((w) => w.length >= 2)
}

/**
 * 한 건을 그 학생의 학습지들과 견준다. **날짜로는 맞추지 않는다** —
 * 매쓰홀릭 날짜와 스터디체크 배정일은 며칠씩 어긋나기 때문이다(08/28 제출 → 08/31 기록).
 * 맞추는 열쇠는 **단원 이름과 레벨**이다.
 *
 * 돌려주는 것은 점수 높은 순 목록이다. **고르는 것은 사람이다** — 1등과 2등이 비슷하면
 * 화면이 물어본다. 아무것도 안 나오면 새로 만든다(주한 선생님 고1처럼 스터디체크에
 * 배정이 아예 없는 반이 있다).
 */
export function rankWorksheets(row: MatholicRow, list: WsCandidate[], unit?: ResolvedUnit | null, books?: string[] | null): Scored[] {
  const words = titleWords(row.title)
  const out: Scored[] = []
  for (const ws of list) {
    // ★★ **이미 점수가 적힌 지난 학습지는 후보가 아니다.** 점수를 채우는 자리가 아니라
    //    **덮어쓰는** 자리이기 때문이다. 2026-11-07 에 실제로 걸렸다 —
    //    「공통수학2 유리함수2 복습 (lv2.5) 40점」이 9일 전 **다 푼(passed) 합성함수 복습
    //     76점**에 붙을 뻔했다. 레벨이 같고 「복습」이라는 낱말이 겹치고 날짜가 가까워
    //    점수가 높게 나왔다. 넣었으면 76점이 40점으로 **사라진다.**
    //    같은 날짜에 적힌 것은 그대로 둔다 — 그날 채점을 고쳐 다시 올리는 경우다.
    if (ws.score != null && (ws.submitted_at ?? '').slice(0, 10) !== row.date) continue

    const why: string[] = []
    let points = 0

    if (row.level != null && ws.current_level != null) {
      if (Number(ws.current_level) === row.level) { points += 4; why.push(`Lv${row.level} 같음`) }
      else points -= 2
    }
    const hay = `${ws.unit ?? ''} ${ws.unit_name ?? ''}`
    const hit = words.filter((w) => hay.includes(w))
    if (hit.length) { points += Math.min(hit.length, 3) * 2; why.push(`단원 ${hit.slice(0, 3).join('·')}`) }

    // ★ 개념 사전에서 찾아낸 단원이 있으면 그걸로 한 번 더 본다. 선생님이 소개념 이름을
    //   쓰셔도(「원과 직선의 위치 관계」) 그 대단원의 학습지에 붙게 하려는 것이다.
    let unitHitByDict = false
    if (unit) {
      const n = (x?: string | null) => normUnit(x ?? '')
      const 같나 = (a?: string | null, b?: string | null) => {
        const x = n(a), y = n(b)
        return !!x && !!y && (x === y || (x.length >= 3 && y.length >= 3 && (x.includes(y) || y.includes(x))))
      }
      if (같나(ws.unit_name, unit.subChapter) || 같나(ws.unit_name, unit.conceptName)) {
        points += 5; unitHitByDict = true; why.push(`중단원 ${unit.subChapter ?? ''}`.trim())
      } else if (같나(ws.unit, unit.chapter) || 같나(ws.unit_name, unit.chapter)) {
        points += 3; unitHitByDict = true; why.push(`대단원 ${unit.chapter ?? ''}`.trim())
      }
    }

    // 갈래가 같으면 올리고, 다르면 내린다 (오답유사·쌍둥이·레벨학습지).
    const want = worksheetTypeOf(row, books)
    if (ws.worksheet_type === want) {
      if (want !== 'main') { points += 3; why.push(want === 'similar' ? '오답유사' : '쌍둥이') }
    } else if (want !== 'main' || ws.worksheet_type !== 'main') {
      points -= 2
    }

    // 아직 점수가 안 적힌 것이 먼저다 — 보통 그것을 채우러 온 것이다.
    if (ws.score == null) { points += 2; why.push('점수 비어 있음') }
    else if (ws.score === row.score) { points += 1; why.push('이미 같은 점수') }

    // 날짜는 **가산점일 뿐** 조건이 아니다. 두 주 안이면 조금 올려 준다.
    const base = ws.submitted_at ?? ws.assigned_at
    if (base) {
      const gap = Math.abs(Date.parse(base.slice(0, 10)) - Date.parse(row.date)) / 86400_000
      if (gap <= 14) { points += 1; why.push(`${Math.round(gap)}일 차이`) }
    }
    if (points > 0) out.push({ ws, points, why, unitHit: hit.length > 0 || unitHitByDict })
  }
  return out.sort((a, b) => b.points - a.points)
}

/**
 * 1등이 2등보다 뚜렷이 나은가. 비슷하면 사람이 골라야 한다.
 *
 * ★ **단원이 안 겹치면 아무리 점수가 높아도 「확실함」이 아니다.** 레벨은 거들 뿐이다 —
 *   Lv2.5 는 학원 안에 수십 건이 있다. 확실하지 않으면 붙이지 말고 새로 만든다.
 *   엉뚱한 학습지에 점수가 들어가면 그 학생 성적표와 학부모 브리핑까지 틀어지는데,
 *   그러고도 아무 에러가 안 난다.
 */
export function isClearWinner(ranked: Scored[]): boolean {
  if (ranked.length === 0) return false
  if (!ranked[0].unitHit) return false
  if (ranked.length === 1) return ranked[0].points >= 6
  return ranked[0].points >= 6 && ranked[0].points - ranked[1].points >= 3
}

/**
 * 이미 넣은 건인가. **같은 걸 또 붙여넣어도 안전해야 한다** —
 * 선생님이 지난주 것까지 통째로 복사해 오는 일이 반드시 생긴다.
 */
export function alreadyIn(row: MatholicRow, ws: WsCandidate): boolean {
  return ws.score === row.score && (ws.submitted_at ?? '').slice(0, 10) === row.date
}
