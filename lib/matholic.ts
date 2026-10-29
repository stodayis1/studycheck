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
const LEVEL = /(?:^|[^A-Za-z])Lv\.?\s*([0-9]+(?:\.[0-9]+)?)/i
const KINDS = ['학습지', '진단평가', '월간평가', '주간평가', '단원평가', '오답유사', '데일리', '주말복습']
/**
 * 제목 맨 앞 대괄호 머리표 — 「[데일리] 고1 공통수학2 원의 방정식_Lv2.5」.
 *
 * ★ 2026-10-29 부터 선생님들과 **제목 규칙을 통일**하기로 했다(원장님 「스터디체크에 맞춰서
 *   학습지 제목 규칙을 통일하자」). 머리표가 있으면 어디로 갈지 **짐작할 필요가 없다** —
 *   데일리는 학습일지, 나머지는 학습지. 옛 제목도 그대로 읽히게 둔다(한꺼번에 안 바뀐다).
 */
const TITLE_KIND = /^\[\s*([^\]]{1,12}?)\s*\]\s*/
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
    if (th && KINDS.some((k) => th[1].includes(k))) {
      kind = KINDS.find((k) => th[1].includes(k)) ?? kind
      title = title.slice(th[0].length).trim()
    }
    const lv = LEVEL.exec(title)

    rows.push({
      line: cell.line, student, date, kind, course, title,
      level: lv ? Number(lv[1]) : null,
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
  // 이름이 똑같이 적힌 학생이 있어도, 꼬리를 뗀 이름의 학생이 따로 더 있으면 **둘 다** 후보다.
  // (스터디체크에 꼬리 붙은 이름이 **따로 저장돼 있는** 학생들이 있다 — 어느 쪽인지 사람이 봐야 한다.)
  const seen = new Set<string>()
  return [...exact, ...loose].filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
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
export function rankWorksheets(row: MatholicRow, list: WsCandidate[]): Scored[] {
  const words = titleWords(row.title)
  const out: Scored[] = []
  for (const ws of list) {
    const why: string[] = []
    let points = 0

    if (row.level != null && ws.current_level != null) {
      if (Number(ws.current_level) === row.level) { points += 4; why.push(`Lv${row.level} 같음`) }
      else points -= 2
    }
    const hay = `${ws.unit ?? ''} ${ws.unit_name ?? ''}`
    const hit = words.filter((w) => hay.includes(w))
    if (hit.length) { points += Math.min(hit.length, 3) * 2; why.push(`단원 ${hit.slice(0, 3).join('·')}`) }

    const wantsSimilar = /오답유사/.test(row.title) || row.kind === '오답유사'
    if (wantsSimilar && ws.worksheet_type === 'similar') { points += 3; why.push('오답유사') }
    if (wantsSimilar && ws.worksheet_type === 'main') points -= 2

    // 아직 점수가 안 적힌 것이 먼저다 — 보통 그것을 채우러 온 것이다.
    if (ws.score == null) { points += 2; why.push('점수 비어 있음') }
    else if (ws.score === row.score) { points += 1; why.push('이미 같은 점수') }

    // 날짜는 **가산점일 뿐** 조건이 아니다. 두 주 안이면 조금 올려 준다.
    const base = ws.submitted_at ?? ws.assigned_at
    if (base) {
      const gap = Math.abs(Date.parse(base.slice(0, 10)) - Date.parse(row.date)) / 86400_000
      if (gap <= 14) { points += 1; why.push(`${Math.round(gap)}일 차이`) }
    }
    if (points > 0) out.push({ ws, points, why, unitHit: hit.length > 0 })
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
