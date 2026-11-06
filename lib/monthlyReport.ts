// 월간 학습 리포트 — 한 학생의 한 달을 모아 **한 덩어리**로 만든다.
//
// 원장님 2026-10-20
//   리딩온어학원 리포트 양식을 보시고 「이런식으로 나도 학생들 한달에 한번 리포트를 만들건데」
//   「초등은 레벨학습지, 각 단원별 평가 기록 / 중등은 시험대비, 영상시청률, 오답 재도전 기록 /
//     고등도 시험대비, 영상시청 및 증명, 오답 재도전기록」
//
// ★ 만든 값을 report_links.data 에 **그대로 박아 둔다**(스냅샷).
//   나중에 교재가 바뀌거나 학습지가 지워져도, 그때 보내 드린 리포트는 그대로 남아야 한다.
//   매일 브리핑의 버튼 뒤 화면도 같은 방식이다.
import { textbookLabel, fetchAllRows } from './utils'
import { safeRows } from './safeRows'
import { bookRate, bookStyle, bookOrder } from './bookProgress'

export type Tier = '초등' | '중등' | '고등'

export interface MonthlyReport {
  student: { name: string; grade: string; school: string | null; teacher: string | null }
  tier: Tier
  /**
   * 덮는 기간. year·month 는 **끝 달**이고 months 가 1이면 한 달, 2면 두 달이다
   * (원장님 2026-11-05 「2개월치를 설정할수 있어야 하지않아?」).
   * ★ 옛 스냅샷에는 months·from·to 가 없다 — 읽는 쪽은 없으면 한 달로 본다.
   */
  period: { year: number; month: number; months?: 1 | 2; label: string; dateLabel: string
            from?: string; to?: string }
  /** 수업·출결 */
  lessons: { total: number; onTime: number; late: number; absent: number; rate: number }
  /** 과제 */
  homework: { achievement: number | null; score: number | null }
  /**
   * 진도 — **지금 푸는 교재의 진도율**과 **끝낸 교재**만 (원장님 2026-11-05
   * 「진도를 저렇게 제목으로 나열해도 학부모님들은 모르시거든. 현재 진행하고 있는
   *  교재의 진도율과 지금까지 완료한 교재정도만 01번 진도칸에 넣어주는게 더 좋을거 같아」).
   *
   * ★ 예전에는 교재 이름 칩과 「[개념서] 6 원기둥~구」 같은 진도 글을 늘어놓았다.
   *   학부모님은 그 글이 무슨 뜻인지 모르신다. textbooks 는 **옛 보고서 호환**과
   *   맨 아래 「다음 달 계획」에 쓰려고 남겨 둔다.
   */
  textbooks: string[]
  /** 지금 푸는 교재 — 종류·이름·학년/학기·진도율. pct 가 null 이면 **아직 모른다**(0% 아님) */
  books: {
    name: string
    type: string
    /** 「개념」「유형」「심화」「연산」 */
    short: string
    color: string
    /** 「초6-2」 — 고등은 「고1」 (학기는 초·중등만 붙인다) */
    course: string
    pct: number | null
    done: number | null
    total: number | null
    /** 진도율을 어떻게 냈나 — 연산서는 선생님이 적은 달성률, 그 밖은 개념 체크 */
    by: '달성률' | '개념'
  }[]
  /** 지금까지 끝낸 교재 — 최근에 시작한 것부터 */
  booksDone: { name: string; type: string; short: string; color: string; course: string }[]
  /** 데일리테스트 */
  daily: { date: string; score: number }[]
  /**
   * ★ 단원별로 **몇 레벨까지 올라갔는지** — 초·중·고 모두 (원장님 2026-10-20
   *   「중요한건 그거 같아. 각 단원별 몇레벨까지 올라갔는지 보여주는거」).
   *   이번 달만이 아니라 **지금까지 쌓인 도달점**이다. 한 달 안에 오른 폭은 gained 로 따로.
   */
  unitLevels: { course: string; unit: string; name: string; level: number; gained: number }[]
  /** 이번 달에 푼 학습지 (점수) */
  worksheets: { unit: string; level: string; score: number | null; passed: boolean }[]
  worksheetSummary: { total: number; passed: number }
  /** 중·고 — 시험대비(이너프원) */
  examPrep: { unit: string; done: number; total: number; pct: number }[]
  /** 영상 */
  videos: { total: number; completed: number; avgPct: number | null }
  /** 고등 — 증명 제출 */
  proofs: number
  /** 오답 재도전 */
  retries: { kind: string; unit: string; score: number | null; passed: boolean }[]
  retrySummary: { total: number; passed: number }
  /**
   * 학원 코어테스트 — **그 해에 본 것 전부**, 본 날짜 순 (원장님 2026-11-04
   * 「코어테스트 이전 기록도 다 나와야지 누적으로. 해당년도는 누적으로 막대그래프로
   *  보여줘. 예비랑, 본고사 구별해서. 누적이 될수록 막대그래프 두께는 얇아지겠지만
   *  그래도 변화추이를 볼수 있어야돼」).
   *
   * ★ 회차 셋만 보여 주던 것을 그만두고 **1월 1일부터 그 달까지** 쌓는다.
   *   예비 1회·2회·본고사 한 바퀴를 한 해에 두 번 이상 돌기 때문에(실측: 본고사가 일곱 달에
   *   걸쳐 있고, 한 학생이 많으면 열다섯 번) 회차 이름만으로는 어느 바퀴 것인지 가릴 수 없다.
   *   그래서 **날짜가 열쇠**다. 막대마다 날짜를 적는다.
   * ★ 예비와 본고사는 **색으로** 가른다 — 막대가 얇아져도 이것만은 보여야 한다.
   */
  coreTests: {
    /** 본 날 (YYYY-MM-DD) */
    date: string
    /** 막대 밑에 적는 날짜 — 「5/11」 */
    dateLabel: string
    /** 회차 — 예비 1회 / 예비 2회 / 본고사 / 회차 미기재 */
    round: string
    /** 좁은 자리에 적는 짧은 이름 — 예비1 / 예비2 / 본고사 / 미기재 */
    short: string
    /** 색을 가르는 갈래 */
    kind: '예비' | '본고사' | '기타'
    score: number
    total: number | null
    /** 막대 높이 — 100점 환산 */
    pct: number
  }[]
  /**
   * 그래프에 뜬 **달의 코어테스트 범위** (원장님 2026-11-05
   * 「6월 범위, 8월범위, 10월범위 이렇게 작성해줘 코어테스트 박스안에서」).
   *
   * ★ 범위는 학생 것이 아니라 **학원 공통**이다 — core_test_ranges 에서 그 학년 것을 읽는다.
   *   시행일은 매달 20일이지만 실제로 본 날은 달마다 흩어져 있어(6/26 · 8/7 · 8/14 …)
   *   **달**로 맞춘다. 한 달에 예비1·예비2·본고사를 보더라도 범위는 그 달 하나다.
   * ★ 표가 아직 없거나 그 학년 줄이 없으면 **빈 목록**이다 — 없는 것을 지어내지 않는다.
   */
  coreRanges: { month: number; scope: string }[]
  /** 그 해 코어테스트 한 줄 요약 — 몇 회·평균·최고·처음→마지막 */
  coreSummary: {
    count: number
    avg: number | null
    best: number | null
    first: number | null
    last: number | null
    preAvg: number | null
    mainAvg: number | null
  }
  /** 선생님이 남긴 말 — 그 달 **마지막** 알림장. 한 달 총평이 아니다. */
  teacherNote: string | null
  /**
   * 그 달에 쓴 알림장 전부 (날짜 순). 한 달 총평을 쓰는 **재료**다.
   * ★ 리포트 화면에는 이걸 그대로 싣지 않는다 — 요약한 comment 를 싣는다
   *   (원장님 2026-10-24 「한달동안 써준 알림장 내용을 너가 요약정리해서」).
   */
  notices: { date: string; teacher: string | null; content: string }[]
  /**
   * 선생님이 직접 쓰는 한 줄 평. 비어 있으면 화면이 알림장을 쓰고, 그것도 없으면 기본 문장.
   * ★ 예전엔 「원장 Talk」였는데 원장님이 빼자고 하셨다 (2026-10-20
   *   「마지막에 원장TALK는 없어도 될듯. 담당 선생님 코멘트 정도만 있으면 될듯해」).
   */
  comment: string | null
  /**
   * 그 한 줄 평이 **무엇으로 쓴 글인지** (원장님 2026-11-06).
   *   'notes' = 선생님 알림장을 요약 · 'data' = 알림장이 없어 학습 기록으로 정리
   * ★ 'data' 면 리포트 칸 이름이 「수업 태도」가 아니라 「이번 달 학습 요약」이 된다 —
   *   선생님이 쓰신 글이 아닌데 그렇게 보이면 안 된다.
   * ★ 옛 스냅샷에는 이 값이 없다. 없으면 'notes' 로 본다(칸 이름 그대로).
   */
  commentFrom?: 'notes' | 'data' | null
}

const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)

/** 그 해 1월 1일 — 코어테스트는 **해마다** 다시 쌓는다. */
export const yearStart = (date: string) => `${String(date).slice(0, 4)}-01-01`

/**
 * 제목에서 회차를 읽는다.
 *
 * ★ 제목의 띄어쓰기가 들쭉날쭉하다 — 「예비 1회」와 「예비1회」가 둘 다 들어 있다(실측).
 *   띄어쓰기를 지우고 본다.
 * ★ 제목이 빈 줄이 25건 있다(실측). 그건 **버리지 않고** 「회차 미기재」로 둔다 —
 *   25건 중 22건은 그날 그 학생의 유일한 기록이어서, 버리면 변화추이에 구멍이 난다.
 *   다만 어느 회차인지는 **지어내지 않는다**(색도 예비·본고사와 다르게 둔다).
 */
export function coreRoundOf(title: any): Pick<MonthlyReport['coreTests'][number], 'round' | 'short' | 'kind'> {
  const t = String(title ?? '').replace(/\s+/g, '')
  if (/본고사/.test(t)) return { round: '본고사', short: '본고사', kind: '본고사' }
  if (/예비/.test(t)) {
    const n = t.match(/[12]/)?.[0]
    return n
      ? { round: `예비 ${n}회`, short: `예비${n}`, kind: '예비' }
      : { round: '예비', short: '예비', kind: '예비' }
  }
  const 적힌것 = String(title ?? '').trim()
  return 적힌것
    ? { round: 적힌것, short: 적힌것.slice(0, 4), kind: '기타' }
    : { round: '회차 미기재', short: '미기재', kind: '기타' }
}

/**
 * 그 해에 본 코어테스트 전부 — 본 날짜 순.
 *
 * ★ 같은 날 같은 회차가 두 번 적힌 것이 있다(실측 17묶음, 그중 6묶음은 점수까지 다르다 —
 *   재채점으로 보인다). 막대를 둘로 세우면 학부모님이 두 번 본 것으로 읽으시므로
 *   **나중에 적은 것 하나만** 남긴다. 지우는 것이 아니라 보여 줄 때만 하나로 본다.
 */
export function coreYearRows(rows: any[]): MonthlyReport['coreTests'] {
  const 쓸것 = (rows ?? []).filter((r) => r?.exam_date && r?.score != null)
  const 날짜순 = [...쓸것].sort((a, b) =>
    String(a.exam_date).localeCompare(String(b.exam_date))
    || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  // Map 은 같은 열쇠에 다시 넣어도 **자리는 그대로**이고 값만 나중 것으로 바뀐다.
  const 하나씩 = new Map<string, any>()
  for (const r of 날짜순) 하나씩.set(`${r.exam_date}|${coreRoundOf(r.title).round}`, r)
  return [...하나씩.values()].map((r) => {
    const score = Number(r.score)
    const total = r.total_score != null ? Number(r.total_score) : null
    return {
      ...coreRoundOf(r.title),
      date: String(r.exam_date),
      dateLabel: `${Number(String(r.exam_date).slice(5, 7))}/${Number(String(r.exam_date).slice(8, 10))}`,
      score,
      total,
      pct: total && total > 0 ? Math.round((score / total) * 100) : Math.round(score),
    }
  })
}

/** 그 해 한 줄 요약 — 몇 회·평균·최고·처음→마지막, 그리고 예비·본고사 따로 평균 */
export function coreSummaryOf(list: MonthlyReport['coreTests']): MonthlyReport['coreSummary'] {
  const p = (list ?? []).map((c) => c.pct)
  const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null)
  return {
    count: p.length,
    avg: mean(p),
    best: p.length ? Math.max(...p) : null,
    first: p.length ? p[0] : null,
    last: p.length ? p[p.length - 1] : null,
    preAvg: mean((list ?? []).filter((c) => c.kind === '예비').map((c) => c.pct)),
    mainAvg: mean((list ?? []).filter((c) => c.kind === '본고사').map((c) => c.pct)),
  }
}

/** 학년 글자로 초·중·고를 가린다. 보여 줄 칸이 달라진다. */
export function tierOf(grade: string): Tier {
  if ((grade ?? '').startsWith('초')) return '초등'
  if ((grade ?? '').startsWith('중')) return '중등'
  return '고등'
}

const pad = (n: number) => String(n).padStart(2, '0')

/**
 * 리포트가 덮는 기간 — **한 달 또는 두 달** (원장님 2026-11-05
 * 「이 월간보고서를 2달에 한번 보낼거거든. 10월만 설정하게 되면 말이 안되지 않나?」).
 *
 *   span(2026, 10, 1) → 2026-10-01 ~ 2026-10-31 · 「2026년 10월」
 *   span(2026, 10, 2) → 2026-09-01 ~ 2026-10-31 · 「2026년 9~10월」
 *   span(2027,  1, 2) → 2026-12-01 ~ 2027-01-31 · 「2026년 12월~2027년 1월」
 *
 * ★ **끝 달**이 기준이다(year·month 는 마지막 달). 두 달이면 그 앞 달부터 센다.
 *   해를 넘어가도 맞아야 한다 — 1월 두 달치는 **작년 12월**부터다.
 */
export function span(year: number, month: number, months: 1 | 2 = 1) {
  const 시작 = new Date(year, month - 1 - (months - 1), 1)
  const sy = 시작.getFullYear(), sm = 시작.getMonth() + 1
  const lastDay = new Date(year, month, 0).getDate()
  return {
    from: `${sy}-${pad(sm)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
    label: months === 1 ? `${year}년 ${month}월`
      : sy === year ? `${year}년 ${sm}~${month}월`
      : `${sy}년 ${sm}월~${year}년 ${month}월`,
    dateLabel: `${sy}. ${sm}. 1. – ${year}. ${month}. ${lastDay}.`,
  }
}

export async function buildMonthlyReport(
  db: { from: (t: string) => any },
  studentId: string,
  year: number,
  month: number,
  /** 몇 달치인지 — 두 달에 한 번 보내면 2 (원장님 2026-11-05) */
  months: 1 | 2 = 1,
): Promise<MonthlyReport | null> {
  const 기간 = span(year, month, months)
  const from = 기간.from
  const to = 기간.to
  const lastDay = new Date(year, month, 0).getDate()

  const { data: st } = await db.from('students')
    .select('id, name, grade, school, teacher_name').eq('id', studentId).maybeSingle()
  if (!st) return null

  const { data: ses } = await db.from('class_sessions').select('*')
    .eq('student_id', studentId).gte('session_date', from).lte('session_date', to).order('session_date')
  const ids = (ses ?? []).map((x: any) => x.id)
  const noKey = '00000000-0000-0000-0000-000000000000'
  const [{ data: notes }, { data: ws }, { data: tb }, pcAll, { data: ep }, { data: core }, { data: vw }, { data: pf }, { data: fb },
         { data: allFb }, { data: mrc }] =
    await Promise.all([
      db.from('learning_notes').select('*').in('session_id', ids.length ? ids : [noKey]),
      // ★ 단원별 도달 레벨은 **누적**이라 그 학생 것을 다 읽어야 한다(한 명이면 양이 적다).
      db.from('student_worksheets').select('*').eq('student_id', studentId).order('assigned_at', { ascending: false }).limit(1000),
      // ★ 끝낸 교재도 같이 읽는다 — 보고서에 「지금까지 끝낸 교재」를 적는다.
      //   paused(잠시 멈춤)는 뺀다. 진행 중도 끝낸 것도 아니어서 학부모님께 설명이 안 된다.
      db.from('student_textbooks').select('*').eq('student_id', studentId)
        .in('status', ['assigned', 'completed']).order('assigned_at', { ascending: false }),
      // 개념 체크 — 한 학생 것이 많으면 900줄에 가깝다(실측 최대 887). 끝까지 읽는다.
      fetchAllRows(() => db.from('progress_checks')
        .select('concept_id, student_textbook_id, check_count').eq('student_id', studentId).order('id')),
      db.from('student_exam_prep').select('*, inner_enough(*)').eq('student_id', studentId).gte('exam_date', from),
      // 코어테스트 — **그 해 1월 1일부터 그 달까지** 전부(누적). 한 학생 한 해라 많아야 스무 줄.
      // created_at 도 읽는다 — 같은 날 같은 회차가 두 번 적힌 것을 나중 것으로 가리는 데 쓴다.
      db.from('exams').select('exam_date, title, score, total_score, created_at')
        .eq('student_id', studentId).eq('exam_type', '코어테스트')
        .gte('exam_date', yearStart(to)).lte('exam_date', to)
        .order('exam_date').order('created_at'),
      db.from('video_watch_logs').select('*').eq('student_id', studentId).in('session_id', ids.length ? ids : [noKey]),
      db.from('proof_submissions').select('id').eq('student_id', studentId).in('session_id', ids.length ? ids : [noKey]),
      db.from('feedbacks').select('content, created_at').eq('student_id', studentId)
        .gte('created_at', from).lte('created_at', `${to}T23:59:59+09:00`)
        .order('created_at', { ascending: false }).limit(1),
      // 그 달 알림장 전부 — 요약의 재료. 한 학생 한 달치라 많아야 열 건 안팎이다.
      db.from('feedbacks').select('content, teacher_name, created_at').eq('student_id', studentId)
        .gte('created_at', from).lte('created_at', `${to}T23:59:59+09:00`)
        .order('created_at', { ascending: true }).limit(60),
      // 한 달 총평 — 알림장을 요약해 적어 둔 글 (monthly_report_comments)
      db.from('monthly_report_comments').select('comment')
        .eq('student_id', studentId).eq('year', year).eq('month', month).maybeSingle(),
    ])

  // ── 교재 진도율 ──────────────────────────────────────────────────────
  // ★ 개념은 **그 학생 교재의 학년 것만** 읽는다. 전체(926행, 2026-11-05)를 읽으면
  //   곧 1000행에 잘려 진도율이 조용히 틀어진다.
  const 교재들 = ((tb ?? []) as any[]).filter((t) => (t?.textbook_name ?? '').trim())
  const 학년들 = [...new Set(교재들.map((t: any) => String(t?.grade ?? '').trim()).filter(Boolean))]
  const { data: con } = 학년들.length
    ? await db.from('concepts').select('id, grade, semester').in('grade', 학년들)
    : { data: [] as any[] }
  const 체크 = (pcAll ?? []) as any[]
  const 교재칸 = (t: any) => {
    const st = bookStyle(t?.textbook_type)
    const 전체이름 = textbookLabel(t)                       // 「개념+유형라이트 초6-2」
    const name = String(t?.textbook_name ?? '').trim()
    return {
      name,
      type: String(t?.textbook_type ?? '').trim(),
      short: st.short,
      color: st.color,
      // 「초6-2」만 떼어 낸다 — 붙이는 규칙(고등은 학기를 안 붙인다)은 textbookLabel 한 곳에 있다.
      course: 전체이름.startsWith(name) ? 전체이름.slice(name.length).trim() : '',
    }
  }
  const 진행중 = 교재들.filter((t: any) => String(t?.status ?? '') === 'assigned')
    .sort((a: any, b: any) => bookOrder(a?.textbook_type) - bookOrder(b?.textbook_type))
    .map((t: any) => ({ ...교재칸(t), ...bookRate(t, (con ?? []) as any[], 체크) }))
  const 끝낸것 = 교재들.filter((t: any) => String(t?.status ?? '') === 'completed').map(교재칸)

  // ── 코어테스트 범위 ─────────────────────────────────────────────────
  // 그래프에 뜬 달만 읽는다. 시행일은 매달 20일이다.
  const coreList0 = coreYearRows(core ?? [])
  const 본달들 = [...new Set(coreList0.map((c) => String(c.date).slice(0, 7)))]   // 'YYYY-MM'
  const 학년 = String(st.grade ?? '').trim()
  // ★ 표가 아직 없어도(SQL 실행 전) 보고서가 멈추면 안 된다 — 못 읽으면 빈 목록으로 지나간다.
  const 범위줄 = 학년 && 본달들.length
    ? await safeRows(db.from('core_test_ranges').select('test_date, scope')
        .eq('grade', 학년).in('test_date', 본달들.map((m) => `${m}-20`)))
    : []
  const coreRanges = 본달들
    .map((m) => {
      const row = 범위줄.find((r: any) => String(r?.test_date ?? '').slice(0, 7) === m)
      return row ? { month: Number(m.slice(5, 7)), scope: String(row.scope ?? '').trim() } : null
    })
    .filter((x): x is { month: number; scope: string } => !!x && !!x.scope)

  const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
  let onTime = 0, late = 0, absent = 0
  const ach: number[] = [], sco: number[] = [], daily: MonthlyReport['daily'] = []
  for (const x of (ses ?? []) as any[]) {
    const n: any = noteBy.get(x.id)
    if (n) {
      if (n.attendance === '정시') onTime++
      else if (n.attendance === '지각') late++
      else if (String(n.attendance ?? '').includes('결석')) absent++
      if (n.achievement_pct != null) ach.push(n.achievement_pct)
      if (n.worksheet_score != null) sco.push(n.worksheet_score)
    }
    if (x.daily_test_score != null) daily.push({ date: String(x.session_date).slice(5), score: x.daily_test_score })
  }
  const total = (ses ?? []).length
  const rate = total ? Math.round(((onTime + late) / total) * 100) : 0

  // 이번 달에 손댄 학습지만 센다 (낸 날 기준, 없으면 받은 날)
  const 이번달ws = (ws ?? []).filter((w: any) => String(w.submitted_at ?? w.assigned_at ?? '') >= from)
  const main = 이번달ws.filter((w: any) => (w.worksheet_type ?? 'main') === 'main')
  const retriesRaw = 이번달ws.filter((w: any) => (w.worksheet_type ?? 'main') !== 'main')

  // ── 단원별 도달 레벨 ────────────────────────────────────────────────
  // 통과(passed)한 것 중 가장 높은 레벨이 그 단원의 도달점이다.
  // 이번 달 안에서 오른 폭도 같이 낸다 — 「이번 달에 한 칸 올랐습니다」가 할 말이다.
  const lv = new Map<string, { course: string; unit: string; name: string; level: number; before: number }>()
  for (const w of (ws ?? []) as any[]) {
    if (w.status !== 'passed') continue
    const level = Number(w.current_level ?? 0)
    if (!level) continue
    const key = `${w.grade_level ?? ''}|${w.unit ?? ''}`
    const cur = lv.get(key) ?? { course: w.grade_level ?? '', unit: w.unit ?? '', name: '', level: 0, before: 0 }
    // 단원 이름은 비어 있는 줄이 많다 — 채워진 것을 쓴다.
    if (!cur.name && (w.unit_name ?? '').trim()) cur.name = String(w.unit_name).trim()
    cur.level = Math.max(cur.level, level)
    const 낸날 = String(w.submitted_at ?? w.assigned_at ?? '')
    if (낸날 && 낸날 < from) cur.before = Math.max(cur.before, level)
    lv.set(key, cur)
  }
  const unitLevels = [...lv.values()]
    .sort((a, b) => (a.course === b.course ? a.unit.localeCompare(b.unit, 'ko', { numeric: true }) : a.course.localeCompare(b.course, 'ko', { numeric: true })))
    .map((x) => ({ course: x.course, unit: x.unit, name: x.name, level: x.level, gained: Math.max(0, Math.round((x.level - x.before) * 10) / 10) }))

  // 시험대비 — 단원별로 「끝낸 회차 / 배부된 회차」
  const byUnit = new Map<string, any[]>()
  for (const r of (ep ?? []) as any[]) {
    const u = r.inner_enough?.unit_name ?? '-'
    if (!byUnit.has(u)) byUnit.set(u, [])
    byUnit.get(u)!.push(r)
  }
  const examPrep = [...byUnit.entries()].map(([unit, rows]) => {
    const done = rows.filter((r) => (r.progress_step ?? 0) >= (r.total_steps ?? 1)).length
    return { unit, done, total: rows.length, pct: Math.round((done / rows.length) * 100) }
  })

  const watched = (vw ?? []).filter((v: any) => Number(v.coverage_pct ?? 0) > 0)
  const avgPct = avg(watched.map((v: any) => Math.round(Number(v.coverage_pct))))

  // 코어테스트 — 그 해에 본 것 전부(누적). 요약도 이 목록에서 뽑는다.
  const coreList = coreList0


  return {
    student: { name: st.name, grade: st.grade, school: st.school ?? null, teacher: (st.teacher_name ?? '').split(/[,/\s]+/)[0] || null },
    tier: tierOf(st.grade),
    period: { year, month, months, label: 기간.label, dateLabel: 기간.dateLabel, from, to },
    lessons: { total, onTime, late, absent, rate },
    homework: { achievement: avg(ach), score: avg(sco) },
    textbooks: 진행중.map((b) => [b.type, b.name, b.course].filter(Boolean).join(' ')),
    books: 진행중,
    booksDone: 끝낸것,
    daily,
    unitLevels,
    worksheets: main.slice(0, 8).map((w: any) => ({
      unit: w.unit ?? '', level: String(w.current_level ?? ''), score: w.score ?? null, passed: w.status === 'passed',
    })),
    worksheetSummary: { total: main.length, passed: main.filter((w: any) => w.status === 'passed').length },
    examPrep: examPrep.slice(0, 6),
    videos: { total: (vw ?? []).length, completed: (vw ?? []).filter((v: any) => v.completed_at).length, avgPct },
    proofs: (pf ?? []).length,
    retries: retriesRaw.slice(0, 8).map((w: any) => ({
      kind: w.worksheet_type === 'twin' ? '쌍둥이' : '유사', unit: w.unit ?? '',
      score: w.score ?? null, passed: w.status === 'passed',
    })),
    retrySummary: { total: retriesRaw.length, passed: retriesRaw.filter((w: any) => w.status === 'passed').length },
    coreTests: coreList,
    coreRanges,
    coreSummary: coreSummaryOf(coreList),
    teacherNote: (fb ?? [])[0]?.content ?? null,
    notices: (allFb ?? [])
      .filter((f: any) => String(f.content ?? '').trim())
      .map((f: any) => ({
        date: String(f.created_at).slice(0, 10),
        teacher: f.teacher_name ?? null,
        content: String(f.content).trim(),
      })),
    // 적어 둔 한 달 총평이 있으면 그것을 쓴다. 없으면 null — 화면이 알림장으로 떨어진다.
    comment: (mrc as any)?.comment ?? null,
  }
}
