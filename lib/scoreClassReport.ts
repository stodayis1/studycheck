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
  madeAt: string
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
): Promise<ScoreClassReport> {
  const { data: st } = await db.from('students')
    .select('id, name, grade, school, teacher_name').eq('id', studentId).maybeSingle()
  if (!st) throw new Error('학생을 찾을 수 없어요.')

  const ws = await all(() => db.from('student_worksheets')
    .select('grade_level, unit_name, unit, current_level, score, worksheet_type, submitted_at')
    .eq('student_id', studentId).not('score', 'is', null)
    .gte('submitted_at', from).lte('submitted_at', to + 'T23:59:59').order('id'))

  const notes = await all(() => db.from('learning_notes')
    .select('attendance, workbook_done, created_at')
    .eq('student_id', studentId).gte('created_at', from).lte('created_at', to + 'T23:59:59').order('id'))

  const books = await all(() => db.from('student_textbooks')
    .select('textbook_name, grade, semester, status, assigned_at')
    .eq('student_id', studentId).order('assigned_at'))

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

  return {
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
    madeAt: new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10),
  }
}
