/**
 * S코어반 학습 기록 보고서 — **기록만** 담는다 (원장님 2026-11-19).
 *
 * 「기존에 있는거 말고 ... S코어반은 별도로 새로 만들어줘」
 *
 * 월간 보고서(lib/monthlyReport.ts)는 전교생에게 같은 꼴로 나간다. 이쪽은 **선행 과정을
 * 따라가고 있는지**를 보여 주는 것이 목적이라 보는 것이 다르다 —
 * 달마다의 학습지 성적, **선행 범위와 현 학년 범위를 갈라서**, 다시 푼 학습지, 숙제·출결, 교재.
 *
 * ★ **판정(유지/보완)은 담지 않는다.** 학부모께 가는 링크다. 기록만 보여 드리고
 *   판단은 원장님이 따로 전하신다 (원장님 2026-11-19 「기록만 넣고」).
 * ★ 링크를 찍을 때 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
 *   나중에 학습지가 지워져도 보내 드린 보고서는 그대로여야 한다.
 */

/** 학년 차례 — 선행인지 아닌지를 가른다 */
const GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중3', '고1', '고2', '고3']

/** 그 학습지 범위가 학생 학년보다 **위**인가 (= 선행) */
export function isAhead(studentGrade: string | null | undefined, level: string | null | undefined): boolean {
  const a = GRADE_ORDER.indexOf(String(studentGrade ?? '').trim())
  const b = GRADE_ORDER.indexOf(String(level ?? '').trim())
  if (a < 0 || b < 0) return false
  return b > a
}

/** 그 학생이 지금 나가는 선행 과정 이름 — 가장 많이 푼 선행 범위 (예: '중1') */
export function aheadCourseOf(grade: string | null | undefined, rows: { grade_level?: string | null }[]): string | null {
  const n = new Map<string, number>()
  for (const r of rows) {
    const g = String(r?.grade_level ?? '').trim()
    if (!isAhead(grade, g)) continue
    n.set(g, (n.get(g) ?? 0) + 1)
  }
  let best: string | null = null
  for (const [g, c] of n) if (!best || c > (n.get(best) ?? 0)) best = g
  return best
}

function avg(xs: number[]): number | null {
  const v = xs.filter((x) => typeof x === 'number' && !Number.isNaN(x))
  if (!v.length) return null
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10
}
function pct(a: number, b: number): number | null {
  if (!b) return null
  return Math.round((a / b) * 1000) / 10
}

export interface ScoreClassReport {
  student: { name: string; grade: string | null; school: string | null; teacher: string | null }
  period: { from: string; to: string; label: string }
  /** 지금 나가는 선행 과정 ('중1'). 없으면 null */
  aheadCourse: string | null
  /** 달마다 — 몇 건 풀고 평균 몇 점, 70점 미만 몇 건, 선행 범위 평균 */
  monthly: { month: string; count: number; avg: number | null; under70: number; aheadAvg: number | null; aheadCount: number }[]
  /** 선행 범위 학습지 */
  ahead: { count: number; avg: number | null; passed: number; recent8w: { count: number; avg: number | null } }
  /** 현 학년 범위 학습지 */
  own: { count: number; avg: number | null }
  /** 다시 푼 학습지 (오답·유사·쌍둥이) */
  retry: { count: number; avg: number | null }
  /** 70점을 못 넘은 단원 — 무엇을 더 봐야 하는지 */
  weak: { date: string; unit: string; score: number }[]
  lessons: { total: number; onTime: number; late: number; absent: number }
  homework: { done: number; total: number; pct: number | null }
  books: { done: { course: string; name: string }[]; current: string | null }
  /** 평가 기록 — 코어테스트·단원평가 */
  exams: { date: string; kind: string; title: string; score: number; total: number }[]
  /** 수업 중 성취도 — **선생님이 적는 기록**이다. 측정값이 아니다 */
  achievement: { low: { date: string; pct: number }[]; recent: number | null; before: number | null }
  /**
   * 진도 — **진도표**에서 읽는다 (원장님 2026-11-20 「너 진도표는 안보니」).
   * `classUnit` 은 원장님이 적어 넣으신 반 진도 글 또는 과정 이름, `course` 는 과정 이름,
   * `mine` 은 이 학생이 가 있는 자리.
   */
  pace: { classUnit: string | null; course: string | null; mine: string | null; behind: boolean }
  /** 진도표 — 과정별 회독. 보고서에 표로 보여 드린다 */
  progress: { classLabel: string | null; courses: 진도자리[] }
  /** 보완해야 할 점 — 기록에서 문턱을 못 넘은 것만 (원장님 2026-11-20) */
  improve: Improve
  /** 원장님이 직접 적어 넣는 한 줄. 안 적으면 null */
  teacherNote: string | null
  madeAt: string
}

/**
 * 문턱 — `docs/S코어반_유지기준.md` 1번과 **같은 값**이어야 한다.
 * 두 곳이 갈리면 보고서가 문서와 다른 말을 한다. 자가확인이 문서 글자와 대조한다.
 */
export const 문턱 = {
  /** 현 학년 범위 학습지 평균 */
  own: 80,
  /** 선행 범위 학습지 평균 */
  ahead: 70,
  /** 숙제를 해 온 수업 비율 */
  homework: 80,
  /** 출석률 */
  attend: 90,
  /** 학습지 한 장을 통과한 점수 — 이 아래는 다시 푼다 */
  sheet: 70,
  /** 이만큼 안 모이면 평균으로 보지 않는다 */
  minCount: 8,
  /** 수업 중 성취도를 「낮게 적혔다」고 보는 선. 문턱이 아니다 — 보고서에 날짜와 함께만 적는다 */
  achLow: 90,
  /** 성취도가 몇 번 낮게 적혀야 보완점으로 적나 (한 번은 입력 사고일 수 있다) */
  achMin: 2,
}

/**
 * **반 전체가 같은 날 같은 값으로 적힌 날**을 골라낸다.
 *
 * 2026-11-02 에 여섯 명 **전원**의 성취도가 0% 로 적혀 있었다. 사람이 한 명 한 명 보고 적은
 * 값이 전원 똑같을 수는 없다 — 한꺼번에 들어간 값이다. 그대로 두면 학부모 네 분이
 * 「11/02 0%」를 보신다. 그 날은 **그 학생의 기록이 아니므로** 보고서에서 뺀다.
 *
 * 세 명 이상이 적혀 있고 그 값이 **전부 같고**, 그 값이 **낮은 값일 때만** 뺀다.
 * - 두 명이 우연히 같은 것은 흔하다.
 * - 반 전체가 100% 인 날은 흔하다(실제로 스무 날이 넘었다). 그 날은 뺄 것도 없으므로
 *   낮은 값일 때로 좁힌다 — 안 좁히면 「한꺼번에 적힌 날」이 스물두 날로 불어나
 *   규칙이 무엇을 거르는지 알 수 없게 된다.
 */
export function 같은날같은값(perStudent: { date: string; pct: number }[][]): string[] {
  const 날별 = new Map<string, number[]>()
  for (const rows of perStudent) {
    for (const r of rows) {
      if (!r.date) continue
      날별.set(r.date, [...(날별.get(r.date) ?? []), Number(r.pct)])
    }
  }
  const out: string[] = []
  for (const [날, 값들] of 날별) {
    if (값들.length < 3) continue
    if (값들[0] >= 문턱.achLow) continue
    if (값들.every((v) => v === 값들[0])) out.push(날)
  }
  return out.sort()
}

/**
 * 진도표의 과정 차례.
 *
 * ★ `concepts.grade` 에 **실제로 쓰이는 값**이어야 한다 — 고등은 「고1」이 아니라 과목명으로 적힌다.
 *   app/teacher/curriculum/page.tsx 의 GRADE_ORDER 와 같은 줄이다.
 */
const COURSE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중2모의고사', '중3', '중3모의고사', '공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하']

/** '중1' + 2 → '중1-2' */
export function 과정이름(grade: string | null | undefined, semester: number | null | undefined): string {
  const g = String(grade ?? '').trim()
  const s = Number(semester)
  return Number.isFinite(s) && s > 0 ? `${g}-${s}` : g
}

/**
 * 과정을 줄 세우는 번호. **모르는 학년은 -1** 을 돌려준다 —
 * 모르는 것을 0 으로 두면 「초1보다 뒤」가 되어 그 학생이 전부 「진도가 뒤」로 찍힌다.
 */
export function 과정번호(grade: string | null | undefined, semester: number | null | undefined): number {
  const i = COURSE_ORDER.indexOf(String(grade ?? '').trim())
  if (i < 0) return -1
  const s = Number(semester)
  return i * 10 + (Number.isFinite(s) && s > 0 ? Math.min(s, 9) : 0)
}

/**
 * 보고서에 적을 반 진도 글.
 *
 * ★ 원장님이 적어 넣으신 글이 **먼저**다. 수업에서 지금 나가는 곳은 진도표보다 앞서 있을 수 있고,
 *   그건 기계가 알 수 없다 (2026-11-20 학습지로 추정했다가 「1. 기본도형」으로 틀렸다 —
 *   실제 반 진도는 중1-2 개념서 1회를 끝내고 유형서 2회독 중이었다).
 */
export function 반진도말(classLabel: string | null | undefined, course: string | null | undefined): string | null {
  return String(classLabel ?? '').trim() || String(course ?? '').trim() || null
}

/** 진도표에서 읽은 한 과정의 자리 */
export interface 진도자리 {
  /** '중1-2' */
  course: string
  order: number
  /** 「N회독 이상 끝낸 개념 수」. 회독이 높은 것부터 */
  rounds: { round: number; done: number }[]
  /** 그 과정의 전체 개념 수 */
  total: number
  /** 그 과정에서 본 교재 이름 */
  books: string[]
}

/**
 * 한 학생의 **진도표**를 과정별로 모은다. (원장님 2026-11-20
 * 「지금 반진도는 중1-2 개념서 1회 끝내고 1-2 유형서로 2회독 중이야. 너 진도표는 안보니」)
 *
 * ★ **학습지가 아니라 진도표가 진도다.** 학습지 단원 이름으로 진도를 추정하면
 *   틀린다 — 오답·전범위 학습지가 섞이고, 수업에서 나간 것이 학습지로 안 나올 수도 있다.
 * ★ 같은 개념이 교재별로 여러 줄에 적히므로 **개념마다 가장 높은 회독만** 남긴다
 *   (lib/curriculumProgress.ts 와 같은 규칙 — 두 곳이 갈리면 진도표 화면과 보고서가 다른 말을 한다).
 * ★ 「N회독」은 **N회독 이상** 끝낸 개념 수다. 회독별로 따로 세면 3회독 한 개념이
 *   1회독 칸에서 빠져 「1회독을 아직 안 끝냈다」가 된다.
 */
export function 진도모으기(
  checks: { concept_id: string; check_count: number; student_textbook_id?: string | null }[],
  concepts: { id: string; grade: string | null; semester: number | null }[],
  books?: { id: string; textbook_name?: string | null; textbook_type?: string | null }[],
): 진도자리[] {
  const C = new Map(concepts.map((c) => [String(c.id), c]))
  const B = new Map((books ?? []).map((b) => [String(b.id), b]))

  // 그 과정의 전체 개념 수 (분모) — 기록이 아니라 **과정표**에서 센다
  const 분모 = new Map<string, number>()
  for (const c of concepts) {
    const k = 과정이름(c.grade, c.semester)
    분모.set(k, (분모.get(k) ?? 0) + 1)
  }

  const 개념최고 = new Map<string, number>()
  const 과정교재 = new Map<string, Set<string>>()
  for (const p of checks) {
    const c = C.get(String(p.concept_id))
    if (!c) continue
    const n = Number(p.check_count)
    if (!Number.isFinite(n) || n < 1) continue
    const cur = 개념최고.get(String(p.concept_id)) ?? 0
    if (n > cur) 개념최고.set(String(p.concept_id), n)
    const k = 과정이름(c.grade, c.semester)
    const b = p.student_textbook_id ? B.get(String(p.student_textbook_id)) : null
    const 이름 = String(b?.textbook_name ?? '').trim()
    if (이름) {
      if (!과정교재.has(k)) 과정교재.set(k, new Set())
      과정교재.get(k)!.add(이름)
    }
  }

  const 과정별 = new Map<string, number[]>()
  const 과정번호표 = new Map<string, number>()
  for (const [conceptId, n] of 개념최고) {
    const c = C.get(conceptId)!
    const k = 과정이름(c.grade, c.semester)
    if (!과정별.has(k)) 과정별.set(k, [])
    과정별.get(k)!.push(n)
    과정번호표.set(k, 과정번호(c.grade, c.semester))
  }

  const out: 진도자리[] = []
  for (const [course, ns] of 과정별) {
    const 최고 = Math.max(...ns)
    const rounds: { round: number; done: number }[] = []
    for (let n = 최고; n >= 1; n--) rounds.push({ round: n, done: ns.filter((v) => v >= n).length })
    out.push({
      course,
      order: 과정번호표.get(course) ?? -1,
      rounds,
      total: 분모.get(course) ?? ns.length,
      books: [...(과정교재.get(course) ?? [])],
    })
  }
  return out.sort((a, b) => b.order - a.order)
}

/**
 * 반이 지금 하고 있는 과정 — 고른 학생들 중 **과반**이 진도표에 기록을 가진 **가장 앞선** 과정.
 *
 * 반을 가르는 칸이 DB 에 없다. 그래서 **원장님이 그 번에 고른 학생들**을 한 반으로 본다
 * (보고서 링크를 만들 때 고르는 그 명단 — components/teacher/ScoreClassLinks.tsx).
 *
 * ★ **과반**이 닿은 과정만 「반이 하는 곳」으로 인정한다. 한 명이 먼저 나간 과정을 반 진도로
 *   치면 나머지 모두가 「뒤」로 찍힌다.
 * ★ 돌려주는 것은 **과정 이름 하나**다. 누가 몇 명인지는 돌려주지 않는다 —
 *   보고서에 순위·반 평균은 넣지 않는다 (docs/S코어반_유지기준.md 7번).
 */
export function 반과정고르기(perStudent: 진도자리[][]): { course: string; order: number } | null {
  const 누구 = new Map<string, Set<number>>()
  const 번호 = new Map<string, number>()
  perStudent.forEach((rows, i) => {
    for (const r of rows) {
      if (r.order < 0) continue
      if (!누구.has(r.course)) 누구.set(r.course, new Set())
      누구.get(r.course)!.add(i)
      번호.set(r.course, r.order)
    }
  })
  const 과반 = Math.floor(perStudent.length / 2) + 1
  let best: { course: string; order: number } | null = null
  for (const [c, who] of 누구) {
    if (who.size < 과반) continue
    const o = 번호.get(c)!
    if (!best || o > best.order) best = { course: c, order: o }
  }
  return best
}

/**
 * 반 과정보다 **앞 과정**에 있나 (= 진도가 뒤).
 *
 * ★ **진도표에 기록이 없으면 「뒤에 있다」고 하지 않는다.** 아직 안 적힌 것과 못 따라가는 것은 다르다.
 *   이 한 줄을 빼면 진도표가 비어 있는 학생이 전부 「진도가 뒤」로 찍힌다.
 *   (그래서 build 안에 두지 않고 꺼냈다 — 안에 있으면 망가뜨려도 검사가 통과했다. 2026-11-20)
 * ★ 같은 과정 안에서 회독이 덜 돌았다고 「뒤」라고 하지 않는다 — 한 과정은 몇 달에 걸쳐 돌고,
 *   회독은 교재 배정 시점에 따라 들쭉날쭉하다. **과정이 갈릴 때만** 말한다.
 */
export function 진도뒤인가(반: { order: number } | null | undefined, 내: 진도자리[]): boolean {
  if (!반) return false
  // 빈 진도표는 **-1** 이다. 0 으로 두면 「초1보다 뒤」가 되어 그 학생이 「진도가 뒤」로 찍힌다.
  // (`Math.max()` 는 빈 배열에 -Infinity 를 준다 — 그래서 빗장 하나로 두 경우를 다 막는다)
  const 내최고 = 내.length ? Math.max(...내.map((r) => r.order)) : -1
  if (내최고 < 0) return false
  return 내최고 < 반.order
}

export interface ImproveItem {
  key: string
  /** 무엇을 */
  title: string
  /** 기록에서 나온 숫자 — 이 한 줄이 근거다 */
  fact: string
  /** 그래서 무엇을 하나 */
  todo: string
}

export interface Improve {
  items: ImproveItem[]
  /** 자료가 적어 평균으로 보지 않은 것 — 「중1 범위 5건」 */
  thin: string[]
}

/**
 * 보완해야 할 점 뽑기 — 원장님 2026-11-20
 * 「각 학생들거 보고서 나갈때 보완해야 할점 이런거 써주면 좋을듯」
 *
 * ★ **지어내지 않는다.** 기록에서 문턱을 못 넘은 것만 줄로 만들고, 줄마다 **그 숫자를 함께** 적는다.
 *   학부모가 「왜 이게 보완점인가」를 그 줄에서 바로 확인할 수 있어야 한다.
 * ★ **판정은 여기서 나오지 않는다.** 유지·일반반 같은 말은 원장님이 따로 전하신다
 *   (원장님 2026-11-19 「기록만 넣고」. 보완점은 기록이고, 반을 정하는 것은 판정이다).
 * ★ 자료가 적으면(8건 미만) 평균으로 보지 않고 `thin` 에만 적는다
 *   (`docs/S코어반_유지기준.md` 1번 「자료가 모자랄 때는 판정하지 않는다」).
 *   적은 자료로 「부족합니다」라고 적으면 근거를 댈 수 없다.
 * ★ **보고서 값만** 받는다 — DB 를 보지 않으므로 옛 링크(스냅샷)에도 그대로 돈다.
 */
export function 보완점뽑기(d: ScoreClassReport): Improve {
  const items: ImproveItem[] = []
  const thin: string[] = []
  const 선행 = d.aheadCourse ?? '선행'
  // ★ **옛 링크에는 이 칸들이 없다.** 2026-11-20 전에 만든 스냅샷에는 achievement·pace 가
  //   아예 안 들어 있어서, 없는 줄 모르고 읽으면 **학부모 화면이 하얗게 뜬다.**
  //   보내 드린 링크는 그대로 살아 있어야 한다.
  const 성취 = d.achievement ?? { low: [], recent: null, before: null }
  const 진도 = d.pace ?? { classUnit: null, course: null, mine: null, behind: false }
  const 약한단원 = d.weak ?? []
  const 목록있음 = 약한단원.length > 0

  // ① 출석 — 숫자보다 먼저 본다. 수업을 못 들으면 평균이 떨어지는 것은 당연하다.
  const 수업 = d.lessons ?? { total: 0, onTime: 0, late: 0, absent: 0 }
  const 출석 = pct(수업.total - 수업.absent, 수업.total)
  if (출석 != null && 출석 < 문턱.attend) items.push({
    key: 'attend',
    title: '빠진 수업 메우기',
    fact: `수업 ${수업.total}회 중 결석 ${수업.absent}회 (출석률 ${출석}% · 기준 ${문턱.attend}%)`,
    todo: '결석한 차시는 진도가 비어 있습니다. 어떤 사정이었는지 먼저 여쭙고, 비어 있는 단원을 어떻게 메울지 함께 정하겠습니다.',
  })

  // ② 숙제
  if (d.homework.total > 0 && d.homework.pct != null && d.homework.pct < 문턱.homework) items.push({
    key: 'homework',
    title: '숙제를 끝내 오는 것',
    fact: `수업 ${d.homework.total}회 중 숙제를 해 온 수업 ${d.homework.done}회 (${d.homework.pct}% · 기준 ${문턱.homework}%)`,
    todo: '다음 수업까지 숙제를 끝내 오는 것으로 채워집니다.',
  })

  // ③ 진도 — 반이 나간 단원을 아직 안 푼 경우
  //    원장님 2026-11-20 「다른 학생에 비해 중1과정이 느리다는 걸 좀 돌려서 써줘」.
  //    ★ 돌려서 쓰는 길은 **반이 나가는 자리를 말하는 것**이다. 다른 학생과 견주지 않고,
  //      순위도 반 평균도 쓰지 않는다 — 수업 계획표에 적힌 자리를 그대로 알려 드리는 꼴이다.
  if (진도.behind && 진도.classUnit) items.push({
    key: 'pace',
    title: '반 진도 따라가기',
    fact: `반 진도는 「${진도.classUnit}」입니다.`
      + (진도.mine ? ` 진도표에 적힌 지금 자리는 「${진도.mine}」입니다.` : ''),
    todo: '앞 과정을 한 번 더 다지는 중입니다. 전 범위 평가는 반이 함께 보므로, '
      + (진도.course ? `${진도.course} 과정을 메우는 것이 먼저입니다. ` : '남은 과정을 메우는 것이 먼저입니다. ')
      + '못 넘은 단원은 재학습 과제로 따로 드립니다.',
  })

  // ④ 선행 범위 평균
  if (d.ahead.count >= 문턱.minCount) {
    if (d.ahead.avg != null && d.ahead.avg < 문턱.ahead) items.push({
      key: 'ahead',
      title: `${선행} 범위 점수 올리기`,
      fact: `${선행} 범위 ${d.ahead.count}건 평균 ${d.ahead.avg}점 (기준 ${문턱.ahead}점)`,
      todo: `${문턱.sheet}점을 넘지 못한 학습지는 다시 풉니다.`
        + (목록있음 ? ' 아래 「더 봐야 할 단원」이 그 목록입니다.' : ''),
    })
  } else if (d.ahead.count > 0) thin.push(`${선행} 범위 ${d.ahead.count}건`)

  // ⑤ 현 학년 범위 평균
  if (d.own.count >= 문턱.minCount) {
    if (d.own.avg != null && d.own.avg < 문턱.own) items.push({
      key: 'own',
      title: '현 학년 범위 다지기',
      fact: `현 학년 범위 ${d.own.count}건 평균 ${d.own.avg}점 (기준 ${문턱.own}점)`,
      todo: '같은 단원 학습지를 한 번 더 풀어 확인합니다.',
    })
  } else if (d.own.count > 0) thin.push(`현 학년 범위 ${d.own.count}건`)

  // ⑥ 수업 중 성취도 — **평균으로 쓰지 않는다.**
  //    거의 모든 수업이 100 으로 적혀 있어서 평균을 내면 94.7 같은 값이 되고, 그 숫자로는
  //    학부모께 아무 말도 할 수 없다. 낮게 적힌 **그 날짜**가 선생님이 남긴 기록이다
  //    (2026-11-20 확인: 한 학생은 10/19 50% · 10/31 50% · 11/02 0%).
  //    ★ 반 전체가 같은 날 같은 값으로 적힌 날은 애초에 빠져 있다(같은날같은값 — 11/02 0% 사고).
  //      그래도 한 번뿐이면 넣지 않는다 — 두 번 이상이어야 그 학생의 기록이다.
  //    ★ 문턱으로는 쓰지 않는다 (docs/S코어반_유지기준.md 1번). 그래서 **날짜와 함께** 적고,
  //      선생님이 적는 기록임을 화면에서 밝힌다.
  if (성취.low.length >= 문턱.achMin) items.push({
    key: 'achievement',
    title: '수업 중 성취도가 낮았던 날',
    fact: `최근 8주에 ${성취.low.length}회 낮게 적혔습니다 — `
      + 성취.low.map((x) => `${x.date.slice(5).replace('-', '/')} ${x.pct}%`).join(' · '),
    todo: '그날 다룬 단원을 수업에서 한 번 더 짚습니다.',
  })

  // ⑦ 다시 풀고도 못 넘은 것 — 문턱 넷에는 없지만 보완점으로는 가장 또렷하다
  if (d.retry.count >= 문턱.minCount && d.retry.avg != null && d.retry.avg < 문턱.sheet) items.push({
    key: 'retry',
    title: '다시 푼 학습지 점수',
    fact: `다시 푼 학습지 ${d.retry.count}건 평균 ${d.retry.avg}점 (기준 ${문턱.sheet}점)`,
    todo: `다시 풀어서도 ${문턱.sheet}점을 넘지 못한 단원은 수업에서 다시 설명합니다.`,
  })

  // ⑧ 더 봐야 할 것 — 아래 표에 날짜·점수가 있으니 여기서는 세어만 준다.
  //   ★ 「단원」이라고 쓰지 않는다 — 이 목록에는 오답학습지도 들어온다(2026-11-20 화면에서 확인).
  if (목록있음) items.push({
    key: 'weak',
    title: `다시 풀어야 할 학습지 ${약한단원.length}장`,
    fact: `최근 8주에 ${문턱.sheet}점을 넘지 못한 학습지입니다 — 아래 「더 봐야 할 단원」에 날짜와 점수가 있습니다.`,
    todo: `그 학습지를 다시 풀어 ${문턱.sheet}점을 넘기는 것까지가 한 단원입니다.`,
  })

  return { items, thin }
}

/** 코어테스트인가 — 표마다 적는 말이 다르다 ('코어테스트' · 'CORE테스트' · 'core') */
export function isCoreKind(kind: string | null | undefined): boolean {
  return /코어|core/i.test(String(kind ?? ''))
}

/**
 * 평가 기록 모으기 — **같은 시험이 두 표에 들어 있다.**
 *
 * 코어테스트를 `core_tests` 에도 적고 `exams` 에도 적어 둔 날이 있다. 그대로 두면
 * 한 번 친 시험이 보고서에 두 줄, 많게는 **네 줄**로 찍힌다
 * (2026-11-19 확인: 안준혁 05-11 에 75 · 78 · 80 · 79 네 값).
 * 학부모께 가는 화면이라 **한 시험은 한 줄**이어야 한다.
 *
 * 규칙은 **하나다 — 같은 날 코어테스트는 한 줄.** 두 표를 날짜로 맞추는 규칙을 따로 두었다가
 * 지웠다(2026-11-20): 지워도 이 한 줄 규칙이 같은 값을 내서 **망가뜨려도 검사가 통과했다.**
 * 못 재는 규칙은 두지 않는다.
 *
 * 남길 줄을 고르는 차례 ① `core_tests` 쪽 ② 회차를 적어 둔 줄 ③ 앞 회차.
 * (2026-11-19 확인: 임지원 05-11 예비1·예비2 둘 다 77, 26분 차이로 입력 /
 *  안준혁 05-27 회차 없이 92 적고 3분 뒤 「본고사」 88 로 다시 적음).
 * 코어테스트가 아닌 평가(학교시험·단원평가)는 건드리지 않는다 — 같은 날 여러 번 볼 수 있다.
 *
 * ★ 어느 표의 점수가 맞는지는 기계가 못 정한다. 값이 갈리는 날은 원장님께 알린다.
 */
export function 평가모으기(cores: any[], exams: any[]): ScoreClassReport['exams'] {
  type 줄 = ScoreClassReport['exams'][0] & { _코어표: boolean }
  const 모두: 줄[] = [
    ...(cores ?? []).map((c: any) => ({
      date: 날(c.test_date), kind: '코어테스트', title: String(c.test_round ?? ''),
      score: Number(c.score), total: Number(c.total_score ?? 100), _코어표: true,
    })),
    ...(exams ?? []).map((e: any) => ({
      date: 날(e.exam_date), kind: String(e.exam_type ?? '평가'),
      title: String(e.title || e.unit_name || ''),
      score: Number(e.score), total: Number(e.total_score ?? 100), _코어표: false,
    })),
  ].filter((e) => !Number.isNaN(e.score))

  const 회차 = (t: string) => {
    const m = String(t).match(/\d+/)
    return m ? Number(m[0]) : 99
  }
  /** a 가 b 보다 남길 만하면 음수 */
  const 좋은쪽 = (a: 줄, b: 줄) => {
    if (a._코어표 !== b._코어표) return a._코어표 ? -1 : 1
    const 제목 = (x: 줄) => (String(x.title).trim() ? 0 : 1)
    if (제목(a) !== 제목(b)) return 제목(a) - 제목(b)
    return 회차(a.title) - 회차(b.title)
  }

  const 코어한줄 = new Map<string, 줄>()
  const 나머지: 줄[] = []
  const 본것 = new Set<string>()
  for (const e of 모두) {
    if (isCoreKind(e.kind)) {
      const 앞 = 코어한줄.get(e.date)
      if (!앞 || 좋은쪽(e, 앞) < 0) 코어한줄.set(e.date, e)
      continue
    }
    // 코어테스트가 아닌 평가는 글자까지 똑같은 줄만 한 줄로 (같은 표에 두 번 적힌 것)
    const k = [e.date, e.kind, e.title, e.score].join('|')
    if (본것.has(k)) continue
    본것.add(k)
    나머지.push(e)
  }
  return [...나머지, ...코어한줄.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(({ _코어표, ...e }) => e)
}

type DB = { from: (t: string) => any }

/** 수파베이스는 한 번에 1000행만 준다 — 다 읽을 때는 돌려 가며 읽는다. */
async function all(make: () => any): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make().range(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
  }
}

const 날 = (v: any) => String(v ?? '').slice(0, 10)

export async function buildScoreClassReport(
  db: DB, studentId: string, from: string, to: string,
  opts?: {
    /** 원장님이 적어 넣으신 반 진도 글. 안 적으시면 과정 이름을 쓴다 */
    classLabel?: string | null
    /** 반이 하는 과정 — 고른 학생 전체를 보고 **한 번만** 구해서 넘긴다 */
    classCourse?: { course: string; order: number } | null
    /** 과정표 — 학생마다 926행을 다시 읽지 않게 넘겨 받는다 */
    concepts?: { id: string; grade: string | null; semester: number | null }[]
    skipDates?: string[]
  },
): Promise<ScoreClassReport> {
  const { data: st } = await db.from('students')
    .select('id, name, grade, school, teacher_name').eq('id', studentId).maybeSingle()
  if (!st) throw new Error('학생을 찾을 수 없어요.')

  const ws = await all(() => db.from('student_worksheets')
    .select('grade_level, unit_name, unit, current_level, score, worksheet_type, submitted_at')
    .eq('student_id', studentId).not('score', 'is', null)
    .gte('submitted_at', from).lte('submitted_at', to + 'T23:59:59').order('id'))

  const notes = await all(() => db.from('learning_notes')
    .select('attendance, workbook_done, achievement_pct, created_at')
    .eq('student_id', studentId).gte('created_at', from).lte('created_at', to + 'T23:59:59').order('id'))

  const books = await all(() => db.from('student_textbooks')
    .select('id, textbook_name, textbook_type, grade, semester, status, assigned_at')
    .eq('student_id', studentId).order('assigned_at'))

  // ── 진도표 (원장님 2026-11-20 「너 진도표는 안보니」)
  //    ★ 구간(from~to)으로 자르지 않는다. 진도는 「올해 몇 건 풀었나」가 아니라
  //      **지금 어디까지 왔나**다. 작년에 끝낸 과정도 지금 자리를 말해 준다.
  const checks = await all(() => db.from('progress_checks')
    .select('concept_id, check_count, student_textbook_id')
    .eq('student_id', studentId).order('id'))
  const concepts = opts?.concepts ?? await all(() => db.from('concepts')
    .select('id, grade, semester').order('id'))
  const 내진도 = 진도모으기(checks as any, concepts as any, books as any)

  const exams = await all(() => db.from('exams')
    .select('exam_date, exam_type, title, unit_name, score, total_score')
    .eq('student_id', studentId).gte('exam_date', from).lte('exam_date', to).order('exam_date'))
  const cores = await all(() => db.from('core_tests')
    .select('test_date, test_round, score, total_score')
    .eq('student_id', studentId).gte('test_date', from).lte('test_date', to).order('test_date'))

  const grade = (st as any).grade as string | null
  const aheadCourse = aheadCourseOf(grade, ws)
  const 선행 = (r: any) => isAhead(grade, r.grade_level)
  const 다시푼 = (r: any) => (r.worksheet_type ?? 'main') !== 'main'

  // ── 달마다
  const byMonth = new Map<string, any[]>()
  for (const r of ws) {
    const m = 날(r.submitted_at).slice(0, 7)
    if (!m) continue
    byMonth.set(m, [...(byMonth.get(m) ?? []), r])
  }
  const monthly = [...byMonth.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([month, rows]) => ({
    month,
    count: rows.length,
    avg: avg(rows.map((r) => Number(r.score))),
    under70: rows.filter((r) => Number(r.score) < 70).length,
    aheadAvg: avg(rows.filter(선행).map((r) => Number(r.score))),
    aheadCount: rows.filter(선행).length,
  }))

  // ── 최근 8주
  const 여드레주전 = new Date(new Date(to + 'T00:00:00Z').getTime() - 56 * 86400_000).toISOString().slice(0, 10)
  const 최근 = ws.filter((r) => 날(r.submitted_at) >= 여드레주전)

  const 선행전부 = ws.filter(선행)
  const 내학년 = ws.filter((r) => !선행(r) && String(r.grade_level ?? '').trim())
  const 재도전 = ws.filter(다시푼)

  const 이름 = (r: any) => {
    const u = String(r.unit_name ?? r.unit ?? '').trim()
    if (!u) return '단원 미기재'
    // 매쓰홀릭에서 긁어 온 줄은 단원이 길게 이어 붙어 있다 — 앞부분만 보인다
    return u.length > 40 ? u.slice(0, 40) + '…' : u
  }

  const att = (v: string) => notes.filter((n) => n.attendance === v).length
  const 숙제함 = notes.filter((n) => ['true', '완료', 'O'].includes(String(n.workbook_done))).length

  const r: ScoreClassReport = {
    student: {
      name: (st as any).name, grade, school: (st as any).school ?? null,
      teacher: (st as any).teacher_name ?? null,
    },
    period: { from, to, label: `${from.slice(0, 7).replace('-', '.')} ~ ${to.slice(0, 7).replace('-', '.')}` },
    aheadCourse,
    monthly,
    ahead: {
      count: 선행전부.length,
      avg: avg(선행전부.map((r) => Number(r.score))),
      passed: 선행전부.filter((r) => Number(r.score) >= 70).length,
      recent8w: {
        count: 최근.filter(선행).length,
        avg: avg(최근.filter(선행).map((r) => Number(r.score))),
      },
    },
    own: { count: 내학년.length, avg: avg(내학년.map((r) => Number(r.score))) },
    retry: { count: 재도전.length, avg: avg(재도전.map((r) => Number(r.score))) },
    weak: 최근.filter((r) => Number(r.score) < 70)
      .sort((a, b) => 날(b.submitted_at).localeCompare(날(a.submitted_at)))
      .slice(0, 8)
      .map((r) => ({ date: 날(r.submitted_at), unit: 이름(r), score: Number(r.score) })),
    lessons: { total: notes.length, onTime: att('정시'), late: att('지각'), absent: att('결석') },
    homework: { done: 숙제함, total: notes.length, pct: pct(숙제함, notes.length) },
    books: {
      done: books.filter((b) => b.status === 'completed')
        .map((b) => ({ course: `${b.grade ?? ''}-${b.semester ?? ''}`, name: String(b.textbook_name ?? '') })),
      current: (() => {
        const 지금 = [...books].reverse().find((b) => b.status !== 'completed')
        return 지금 ? `${지금.grade ?? ''}-${지금.semester ?? ''} ${지금.textbook_name ?? ''}` : null
      })(),
    },
    exams: 평가모으기(cores, exams),
    achievement: (() => {
      const 성취 = (n: any) => (n.achievement_pct == null ? null : Number(n.achievement_pct))
      const 최근노트 = notes.filter((n) => 날(n.created_at) >= 여드레주전)
      const m = (xs: any[]) => avg(xs.map(성취).filter((v) => v != null) as number[])
      const 뺄날 = new Set(opts?.skipDates ?? [])
      return {
        low: 최근노트.filter((n) => 성취(n) != null && (성취(n) as number) < 문턱.achLow)
          .filter((n) => !뺄날.has(날(n.created_at)))
          .map((n) => ({ date: 날(n.created_at), pct: 성취(n) as number }))
          .sort((a, b) => a.date.localeCompare(b.date)),
        recent: m(최근노트),
        before: m(notes.filter((n) => 날(n.created_at) < 여드레주전)),
      }
    })(),
    pace: (() => {
      const 반 = opts?.classCourse ?? null
      const 앞자리 = 내진도[0] ?? null
      const 내자리말 = 앞자리
        ? `${앞자리.course} ${앞자리.rounds[0]?.round ?? 1}회독`
        : null
      return {
        classUnit: 반진도말(opts?.classLabel, 반?.course),
        course: 반?.course ?? null,
        mine: 내자리말,
        behind: 진도뒤인가(반, 내진도),
      }
    })(),
    progress: {
      classLabel: 반진도말(opts?.classLabel, opts?.classCourse?.course),
      // 오래된 과정까지 다 실으면 학부모께 읽을 것이 너무 많아진다 — **앞선 세 과정**만
      courses: 내진도.slice(0, 3),
    },
    improve: { items: [], thin: [] },
    teacherNote: null,
    madeAt: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
  }
  // 보완점은 **위에서 센 값만** 보고 뽑는다 — DB 를 한 번 더 읽지 않는다
  return { ...r, improve: 보완점뽑기(r) }
}
