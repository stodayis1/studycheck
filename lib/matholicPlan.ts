/**
 * 매쓰홀릭 한 줄을 **어디에 넣을지 정하는 곳** — 화면과 스크립트가 같이 쓴다.
 *
 * 원장님 2026-11-07 「붙여넣기 하는 그 과정자체도 불필요하지 않겠니? 그냥 너가 화면 보고
 * 스터디체크에 반영해 주면 되잖아」.
 *
 * ★ 왜 화면에서 빼 왔나
 *   이 판단이 `app/teacher/assignments/matholic/page.tsx` 안에만 있으면, 사람이 붙여넣지 않는
 *   길(자동으로 긁어 넣기)을 만들 때 **같은 판단을 한 벌 더 쓰게 된다.** 두 벌이 되면
 *   규칙을 한쪽만 고치고 조용히 어긋난다 — matholic-import 스킬이 줄곧 경고하는 그 실수다.
 *   그래서 **판단은 여기 하나**, 읽어 오기와 저장은 부르는 쪽이 한다.
 *
 * ★ 이 함수는 DB를 보지 않는다. 필요한 것은 모두 `PlanContext` 로 받는다 —
 *   그래야 검사에서 가짜 자료로 그대로 돌려 볼 수 있다.
 */
import {
  findStudents, pickByRule, nameDiffers, isEnoughOne, coreTestRound, isDiagnostic, parseDiagnosticTitle,
  isDailyTest, pickSessionForDaily, parseWorksheetTitle, gradeFromCourse, resolveUnit, isWrongNote,
  prevLevelOf, alreadyIn, needsLevel, rankWorksheets, isClearWinner, matchTextbook, isTextbookLinked,
  DEFAULT_LEVEL,
  type MatholicRow, type NameRules, type SessionLite, type ConceptRow, type ResolvedUnit,
  type StudentLite, type WsCandidate, type DiagnosticParts,
} from './matholic'

/**
 * 한 줄을 어떻게 처리할지. 사람이 바꿀 수 있다.
 *   daily — 학습일지의 데일리테스트 칸에 적는다 (학습지가 아니다)
 *   core  — 평가관리의 코어테스트로 적는다 (TOMA 수학경시대회가 여기다)
 *   exam  — 평가관리의 **진단평가**로 적는다 (주간·주말평가 2026-11-06, 주말복습 TEST 2026-11-07)
 *   excluded — 일부러 안 넣는다 (이너프원 = 내신대비교재). 빠진 것과 구분해서 보여 준다
 *   fill  — 이미 있는 학습지의 점수 칸을 채운다
 *   new   — 학습지를 새로 만들어 넣는다
 */
export type Mode = 'daily' | 'core' | 'exam' | 'fill' | 'new' | 'skip' | 'excluded' | 'done'

export interface MatholicPlan {
  row: MatholicRow
  /** 후보 학생들. 둘 이상이면 사람이 골라야 한다 */
  students: StudentLite[]
  studentId: string | null
  /** 그 학생의 학습지 중 붙일 만한 것들 (점수 높은 순) */
  candidates: WsCandidate[]
  wsId: string | null
  /** 데일리테스트일 때 적을 수업 기록 (class_sessions.id) */
  sessionId: string | null
  /** 코어테스트일 때 회차 이름 (예비 1회 · 예비 2회 · 본고사) */
  coreRound: string | null
  /**
   * 진단평가일 때 제목에서 떼어낸 단원과 단계 (원장님 2026-11-06 「제목에 맞춰 단원에
   * 맞게 넣어주고」). 평가관리의 `unit_name` · `level` 칸에 그대로 들어간다.
   */
  exam?: DiagnosticParts | null
  /** 개념 사전에서 찾아낸 단원. 못 찾았으면 null 이고, 그때는 제목 글자를 그대로 쓴다 */
  unit: ResolvedUnit | null
  /**
   * 그 학생의 직전 레벨학습지 레벨. **오답 학습지일 때만** 쓴다 —
   * 오답은 자기 레벨이 없고 틀린 그 레벨을 다시 푸는 것이라 레벨을 물려받는다
   * (원장님 2026-11-02 「이전 레벨 학습지의 레벨과 동일하게 해줘」).
   */
  prevLevel?: number | null
  mode: Mode
  /** 왜 이렇게 골랐는지 — 화면에 그대로 보여 준다 */
  why: string
}

/** 판단에 필요한 것들. 부르는 쪽이 DB에서 읽어 넣는다. */
export interface PlanContext {
  /** 내가 볼 수 있는 학생만 (화면은 canViewStudent 로 거른 것을 넣는다) */
  mine: StudentLite[]
  /** 동명이인 규칙 — app_settings.matholic_name_rules */
  rules: NameRules
  /** 교재 이름 목록 — textbook_catalog */
  books: string[]
  /** 개념 사전 */
  concepts: ConceptRow[]
  /** 학생별 학습지 후보 */
  wsByStudent: Map<string, WsCandidate[]>
  /** 학생별 수업 기록 (데일리테스트를 붙일 자리) */
  sessionsOf: Map<string, SessionLite[]>
  /** 이미 들어간 코어테스트 — `학생id|날짜|회차` → 점수 */
  coreByKey: Map<string, number | null>
  /** 이미 들어간 진단평가 — `학생id|날짜|단원` → 점수 */
  examByKey: Map<string, number | null>
}

/** 한 줄을 보고 어디에 넣을지 정한다. DB는 보지 않는다. */
export function planRow(row: MatholicRow, ctx: PlanContext): MatholicPlan {
  const students = findStudents(row.student, ctx.mine)

  if (isEnoughOne(row, ctx.books)) {
    return { row, students: [], studentId: null, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null,
      mode: 'excluded', why: '이너프원은 내신대비교재라 학습지로 안 넣어요' }
  }
  if (students.length === 0) {
    return { row, students, studentId: null, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null, mode: 'skip',
      why: '스터디체크에 그 이름의 학생이 없어요 (또는 제 담당이 아니에요)' }
  }
  // 같은 이름이 여럿이면 설정에 적힌 규칙으로 한 명을 고른다.
  // 규칙에 없으면 아무도 안 고르고 사람에게 묻는다 — 반반 확률로 찍지 않는다.
  const picked = students.length === 1 ? students[0] : pickByRule(row.student, students, ctx.rules)
  if (!picked) {
    return { row, students, studentId: null, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null, mode: 'skip',
      why: `같은 이름이 ${students.length}명이에요 — 누구인지 골라 주세요` }
  }
  const byRule = students.length > 1
  const sid = picked.id

  // ★ 데일리테스트는 학습지로 넣지 않는다 (원장님 2026-10-29 「학습일지에 따로 있잖아」).
  //    학습지로도 넣으면 같은 점수가 두 군데 생겨 성취도·브리핑이 이중으로 센다.
  // ★ 매쓰홀릭 이름과 스터디체크 이름이 다르면(「마이클」 → 「스미스마이클」) 그 말을
  //   **반드시** 적는다. 조용히 바꿔 치면 엉뚱한 학생에게 들어가도 아무도 모른다.
  const 이름말 = nameDiffers(row.student, picked)
    ? `이름이 달라요 — 매쓰홀릭 「${row.student}」 → 스터디체크 「${picked.name}」 · `
    : ''
  const tag = (why: string) => 이름말 + (byRule ? `${picked.grade} ${picked.teacher_name}T — 규칙으로 골랐어요 · ${why}` : why)

  // ★ 코어테스트(TOMA 수학경시대회 포함)는 학습지가 아니라 **평가관리**로 간다
  //    (원장님 2026-10-29 「TOMA는 코어테스트 평가로 들어가야돼」).
  const round = coreTestRound(row)
  if (round) {
    const already = ctx.coreByKey.get(`${sid}|${row.date}|${round}`)
    if (already != null) {
      return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, coreRound: round, unit: null,
        mode: 'done', why: tag(`평가관리에 코어테스트 ${round} ${already}점이 이미 있어요`) }
    }
    return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, coreRound: round, unit: null,
      mode: 'core', why: tag(`평가관리 · 코어테스트 ${round} 로 넣습니다`) }
  }

  // ★ 주간·주말평가와 주말복습 TEST 는 학습지가 아니라 **평가관리의 진단평가**로 간다
  //   (원장님 2026-11-06 「주간평가는 평가로 들어가야해」 · 2026-11-07 「주말복습 테스트는
  //    평가관리.진단평가로 가야해」). 코어테스트(월간평가)를 먼저 본 뒤라야 새지 않는다.
  if (isDiagnostic(row)) {
    const d = parseDiagnosticTitle(row.title)
    const already = ctx.examByKey.get(`${sid}|${row.date}|${d.unitName ?? ''}`)
    if (already != null) {
      return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null, exam: d,
        mode: 'done', why: tag(`평가관리에 진단평가 ${already}점이 이미 있어요`) }
    }
    const 단원말 = d.unitName ? `단원 「${d.unitName}」` : '단원을 못 읽었어요 — 제목은 메모에 남깁니다'
    return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null, exam: d,
      mode: 'exam', why: tag(`평가관리 · 진단평가로 넣습니다 (${단원말}${d.level != null ? ` · ${d.level}단계` : ''})`) }
  }

  if (isDailyTest(row)) {
    // 그날 수업이 있으면 그 수업에. 없으면 **그 뒤** 가장 가까운 수업에
    // (집에서 풀고 다음 수업에 가져오는 경우). 앞은 보지 않는다.
    const hit = pickSessionForDaily(row.date, ctx.sessionsOf.get(sid) ?? [])
    if (!hit) {
      return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null, mode: 'skip',
        why: tag(`${row.date} 뒤로 수업이 없어요 — 적을 데가 없어 넘어갑니다`) }
    }
    const { session: ses, gapDays } = hit
    const 어디 = gapDays === 0 ? '' : ` (${ses.session_date} 수업에 붙입니다 · ${gapDays}일 뒤)`
    if (ses.daily_test_score === row.score) {
      return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: ses.id, coreRound: null, unit: null, mode: 'done',
        why: tag(`학습일지에 이미 같은 점수가 있어요${어디}`) }
    }
    return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: ses.id, coreRound: null, unit: null, mode: 'daily',
      why: tag((ses.daily_test_score == null ? '학습일지 데일리테스트 칸에 적습니다'
        : `학습일지에 ${ses.daily_test_score}점이 적혀 있어요 — ${row.score}점으로 바꿉니다`) + 어디) }
  }

  // 제목에 적힌 단원 이름을 개념 사전에 대고 찾는다. 못 찾으면 null 이고,
  // 그때는 예전처럼 글자만 보고 견준다.
  const parts = parseWorksheetTitle(row.title)
  // 학년은 ① 제목 ② 과정 칸 ③ 학생 순서로 본다. 선행하는 학생은 학생 학년과 과정이 다르다.
  const course = gradeFromCourse(row.course)
  const unit = resolveUnit(parts.unit ?? row.title,
    parts.gradeLevel ?? course?.grade ?? picked.grade ?? null, ctx.concepts)

  const list = ctx.wsByStudent.get(sid) ?? []
  // ★ 오답 학습지는 레벨을 물려받는다 — 그 날짜까지의 마지막 레벨학습지를 찾아 둔다.
  const prevLevel = isWrongNote(row) ? prevLevelOf(list, row.date) : null
  // 이미 넣은 것인가 — 같은 점수·같은 날짜면 다시 넣지 않는다
  const dup = list.find((w) => alreadyIn(row, w))
  if (dup) return { row, students, studentId: sid, candidates: [dup], wsId: dup.id, sessionId: null, coreRound: null, unit, prevLevel, mode: 'done', why: tag('이미 들어가 있어요') }

  // ★ 학습지는 **레벨학습지**다 (원장님 2026-10-29 「반드시 레벨이 제목에 있어야」).
  //    레벨 없이 들어가면 레벨 현황판과 초등 70점 규칙이 조용히 멈춘다.
  //    ★ 이 확인은 **이미 들어갔는지 본 뒤**에 한다 — 예전에 넣어 둔 것까지
  //      「레벨이 없어요」로 막으면 멀쩡한 기록이 빨갛게 뜬다(2026-10-29 예행에서 걸렸다).
  if (needsLevel(row, ctx.books) && row.level == null) {
    return { row, students, studentId: sid, candidates: [], wsId: null, sessionId: null, coreRound: null, unit: null,
      mode: 'skip', why: tag('레벨이 없어요 — 매쓰홀릭 제목 끝에 _Lv3.5 처럼 붙여 주세요') }
  }

  const ranked = rankWorksheets(row, list, unit, ctx.books)
  if (isClearWinner(ranked)) {
    return { row, students, studentId: sid, candidates: ranked.map((r) => r.ws), wsId: ranked[0].ws.id,
      sessionId: null, coreRound: null, unit, prevLevel, mode: 'fill', why: tag(ranked[0].why.join(' · ')) }
  }
  // 교재 이름으로 걸린 것은 **어느 교재인지** 적어 준다 — 레벨이 없어도 들어가므로
  // 「왜 레벨 없이 들어갔지」를 사람이 바로 알 수 있어야 한다.
  const 교재 = isWrongNote(row) ? null : matchTextbook(`${row.title ?? ''} ${row.kind ?? ''}`, ctx.books)
  // ★ 교재 **목록에 없는** 것도 까닭을 적는다 — 「비상교과서」처럼 출판사가 붙은
  //   교과서는 목록(textbook_catalog)에 없어서 교재 이름으로는 안 걸리고
  //   「교과서」라는 글자로 걸린다. 그때 화면이 아무 말도 안 하면 **안 걸린 줄 안다**
  //   (원장님 2026-11-02 「교과서가 들어갔는데도 쌍둥이로 안걸리는것도 문제야」).
  const 교재말 = 교재 ? ` · 「${교재}」 교재라 쌍둥이 학습지로 넣습니다`
    : (!isWrongNote(row) && isTextbookLinked(row, ctx.books) ? ' · 교재·교과서라 쌍둥이 학습지로 넣습니다' : '')
  // ★ 레벨 칸은 비울 수 없다(NOT NULL). 못 찾아 Lv1 로 넣는 줄은 **그렇게 적는다.**
  const 쓸레벨 = isWrongNote(row) ? (prevLevel ?? row.level) : row.level
  const 레벨말 = 쓸레벨 == null ? ` · 레벨이 없어 Lv${DEFAULT_LEVEL} 로 넣습니다` : ''
  // 오답은 제목에 「오답학습지」가 들어가고 레벨을 물려받는다 — 화면에 그대로 적어 보여 준다.
  const 오답말 = isWrongNote(row)
    ? ` · 오답학습지로 넣습니다 (레벨 ${prevLevel ?? row.level ?? '없음'}${prevLevel != null ? ' 물려받음' : ''})`
    : ''
  return { row, students, studentId: sid, candidates: ranked.map((r) => r.ws), wsId: null, sessionId: null,
    coreRound: null, unit, prevLevel, mode: 'new', why: tag((ranked.length ? '비슷한 것이 여럿이라 새로 만듭니다 (바꿀 수 있어요)' : '붙일 학습지가 없어 새로 만듭니다') + 교재말 + 오답말 + 레벨말) }
}
