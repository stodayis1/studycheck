// 강사 자료 학습지 — 선생님이 가진 PDF 한 개를 문항별 그림으로 잘라 문제은행에 넣고,
// 수학의지혜 양식으로 바로 인쇄하고, 학생에게 배정하는 길에서 쓰는 **규칙만** 모아 둔다.
//
// 원장님 2026-11-17 「고등강사가 가지고 있는 pdf파일을 스터디체크 문제은행에 업로드하면
//   바로 수학의지혜 양식으로 출력할 수 있도록」
//   「제목을 공통수학-단원명-난이도 상중하로 적게해서 어느 학생에게 배정했는지를 기록하게.
//    그래서 그 학생의 학습지 기록에 남길수 있도록」
//
// ★ 학교 기출 시험지는 이 길이 아니다 (원장님 2026-11-17 「기출은 기출모음에 넣기로 했잖아」).
//   기출은 「기출 모음」 현황판의 「기출 파일 올리기」(기출모음)로 간다 — 적중률 · 블로그 ·
//   연도별 찾기가 거기 달려 있다. 여기는 **학교 시험이 아닌** 자료만:
//   모의고사 · 오답 모음 · 이전 학원에서 만든 자료.
//
// 왜 「기출 모음」에 안 붙였나 — 그 길은 학교·연도·학기·중간/기말이 있는 **학교 시험지** 전용이고
// (exam_papers 한 줄이 먼저 있어야 한다), 위 자료들은 그 네 칸을 채울 수가 없다.
//
// 화면은 app/teacher/pdf-worksheets, 서버는 app/api/pdf-worksheets.
// 그림 자르기는 「기출 모음」과 **같은 코드**(lib/examPdfCrop.ts)를 쓴다 — 규칙을 두 벌 두지 않는다.
//
// 검사: node --import ./scripts/ts-resolve.mjs scripts/pdf-worksheet-check.ts

/** 문제은행에서 이 자료들을 묶는 교재 이름. 학교기출(`학교기출`)과 가른다. */
export const TUTOR_BOOK = '강사자료'
/** problems.step — 자동 출제 화면에서 눈으로 가릴 수 있게 */
export const TUTOR_STEP = '강사자료'
/** exam_sheets.note 머리말. 목록을 이것으로 찾는다 (`exam_paper:` 와 같은 꼴) */
export const TUTOR_NOTE = 'tutor'

/**
 * 과정 — problems.grade 에 **그대로** 들어간다. lib/curriculumProgress.ts 의 GRADE_ORDER 와 글자가 같아야
 * 과정관리·학습지 출제 화면에서 같은 과정으로 읽힌다 (「미적분Ⅰ」 이 아니라 「미적분1」 이다).
 */
export const TUTOR_COURSES = ['공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하'] as const
export type TutorCourse = (typeof TUTOR_COURSES)[number]

/**
 * 인쇄 머리의 큰 글씨 칸에 넣을 학년.
 *
 * 수학의지혜 시험지 양식의 그 칸은 「3학년」처럼 **짧은 글자** 자리다(25pt). 「공통수학2」를 그대로
 * 넣으면 44mm 를 먹어 머리 띠가 밀린다 — 그래서 과정을 학년으로 바꿔 넣고, 과정·단원·난이도는
 * 맨 윗줄 제목에 적는다.
 */
export function tutorGradeLabel(course: string): string {
  return course === '공통수학1' || course === '공통수학2' ? '고1' : '고2'
}

/** 난이도 — 원장님이 정하신 세 가지. problems.difficulty 에 들어간다 (level 은 넣지 않는다, 아래 참고) */
export const TUTOR_LEVELS = ['상', '중', '하'] as const
export type TutorLevel = (typeof TUTOR_LEVELS)[number]

/**
 * 학습지 종류 — 원장님 2026-11-17 「학습지 종류도 쓰게 해줘. 가령 내가 지금 교과서 파일을 올릴거거든.
 * 뭐 아니면 단계별 학습지라던가」.
 *
 * ★ **고르는 목록이 아니라 적는 칸이다.** 범주를 지어내지 않는다(원장님 2026-10-31
 *   「규칙을 너무 많이 만들면 되려 헷갈려. 현재 쓰고 있는 규칙에서 우리가 범주를 만들어가는게 맞아」).
 *   아래는 **자주 쓰실 말을 한 번에 넣는 단추**일 뿐, 다른 말을 적어도 된다.
 *   비워 두면 제목에서 그 칸이 빠진다 — 막지 않는다.
 */
export const TUTOR_KINDS = ['교과서', '단계별 학습지', '교재', '모의고사', '오답'] as const

export type TutorKey = { course: string; unit: string; level: string; kind?: string }

/**
 * 「공통수학2-집합과 명제-교과서-중」 — 원장님이 적으라고 하신 제목 꼴.
 * 학습지 제목과 **학생 화면**에 그대로 보인다. 종류를 비우면 「공통수학2-집합과 명제-중」.
 *
 * ★ 난이도는 **언제나 맨 뒤**다. 종류가 있든 없든 되읽을 수 있어야 하기 때문이다(parseTutorTitle).
 */
export function tutorTitle(k: TutorKey): string {
  return [k.course, k.unit, k.kind, k.level].map((s) => String(s ?? '').trim()).filter(Boolean).join('-')
}

/**
 * 제목을 세 칸(또는 네 칸)으로 되읽는다. 서버와 인쇄 화면이 쓴다.
 *
 * ★ `split('-')` 한 자리를 번호로 집지 않는다 — 종류가 생기기 전에 만든 학습지는 세 칸이다.
 *   **과정은 밖에서 받고(exam_sheets.grade), 난이도는 맨 뒤에서, 나머지를 가운데로** 읽는다.
 *   그래야 칸이 셋이든 넷이든 같은 답이 나온다.
 */
export function parseTutorTitle(title: string, course?: string): Required<TutorKey> {
  const parts = String(title ?? '').split('-').map((s) => s.trim()).filter(Boolean)
  const level = parts.length > 1 && (TUTOR_LEVELS as readonly string[]).includes(parts[parts.length - 1])
    ? parts.pop()! : ''
  const head = String(course ?? '').trim() || parts.shift() || ''
  if (course && parts[0] === course) parts.shift()       // 과정이 제목에도 있으면 한 번만 센다
  // 가운데가 둘이면 「단원명 - 종류」, 하나면 단원명뿐이다
  const kind = parts.length > 1 ? parts.pop()! : ''
  return { course: head, unit: parts.join('-'), kind, level }
}

/**
 * 제목 칸을 검사한다. 통과하면 null, 아니면 사람 말로 된 사유.
 * 서버와 화면이 **같은 함수**를 쓴다 — 화면만 막으면 주소로 직접 부르는 길이 열린다.
 */
export function tutorKeyError(k: Partial<TutorKey>): string | null {
  const course = String(k.course ?? '').trim()
  const unit = String(k.unit ?? '').trim()
  const kind = String(k.kind ?? '').trim()
  const level = String(k.level ?? '').trim()
  if (!(TUTOR_COURSES as readonly string[]).includes(course)) return '과정을 골라 주세요.'
  if (!unit) return '단원명을 적어 주세요.'
  if (unit.length > 40) return '단원명이 너무 깁니다 (40자까지).'
  // 제목을 줄표로 갈라 읽으므로 단원명·종류에 줄표가 들어가면 칸이 어긋난다
  if (/[-]/.test(unit)) return '단원명에는 줄표(-)를 쓸 수 없습니다. 「집합과 명제」처럼 적어 주세요.'
  if (kind.length > 20) return '학습지 종류가 너무 깁니다 (20자까지).'
  if (/[-]/.test(kind)) return '학습지 종류에는 줄표(-)를 쓸 수 없습니다.'
  // 종류를 난이도와 같은 글자로 적으면 되읽을 때 칸이 엇갈린다
  if ((TUTOR_LEVELS as readonly string[]).includes(kind)) return '학습지 종류를 「상·중·하」로 적을 수는 없습니다.'
  if (!(TUTOR_LEVELS as readonly string[]).includes(level)) return '난이도를 상 · 중 · 하 가운데 골라 주세요.'
  return null
}

/**
 * problems.source_key — 같은 학습지의 같은 번호를 또 보내면 **새로 넣지 않고 그 줄을 고친다.**
 * (problems.source_key 에 unique 색인이 있다. 문항 id 가 그대로라 이미 만든 학습지가 깨지지 않는다)
 */
export const tutorSourceKey = (sheetId: string, no: number) => `tutor:${sheetId}:${no}`
/** problem-images 보관함 안의 자리 */
export const tutorImagePath = (sheetId: string, no: number) => `tutor/${sheetId}/${no}.png`
export const tutorAnswerImagePath = (sheetId: string, no: number) => `tutor/${sheetId}/${no}_a.png`

/**
 * 넣기 전에 사람에게 보여 줄 점검 결과.
 *   · 막는 것(errors) — 이대로는 넣을 수 없다
 *   · 알리는 것(warns) — 넣어도 되지만 눈으로 봐 달라는 것
 *
 * 「문항 수 · 번호 연속 · 배점 합」을 사람이 확인하게 하라는 지시(2026-11-17)를 여기 한 곳에 둔다.
 * 배점은 **강사 자료에는 없는 것이 보통**이므로 적혀 있을 때만 합을 본다 (학교 기출과 다르다).
 */
export type TutorRow = { no: number; points?: number | null; w?: number; h?: number }
export function tutorCheck(rows: TutorRow[]): { errors: string[]; warns: string[]; points: number; priced: number } {
  const errors: string[] = []
  const warns: string[] = []
  if (!rows.length) {
    errors.push('문항이 하나도 없습니다.')
    return { errors, warns, points: 0, priced: 0 }
  }
  const nos = rows.map((r) => r.no)
  if (new Set(nos).size !== nos.length) errors.push('문항 번호가 겹칩니다: ' + nos.join(', '))
  else if (nos.some((n, i) => n !== i + 1)) warns.push(`문항 번호가 1부터 이어지지 않습니다: ${nos.join(', ')}`)
  const empty = rows.filter((r) => !(r.w! > 0) || !(r.h! > 0)).map((r) => r.no)
  if (empty.length) errors.push(`그림이 비어 있는 문항: ${empty.join(', ')}번`)
  const priced = rows.filter((r) => Number(r.points) > 0)
  const points = priced.reduce((a, r) => a + Number(r.points), 0)
  // 배점을 적은 문항이 **일부뿐**이면 합이 뜻을 잃는다 — 그때만 알린다
  if (priced.length && priced.length < rows.length)
    warns.push(`배점을 적은 문항이 ${priced.length} / ${rows.length} 개뿐입니다 (합 ${points}점).`)
  return { errors, warns, points, priced: priced.length }
}

/**
 * problems 한 줄.
 *
 * ★ `type_code` 와 `level` 은 **넣지 않는다.** 학교기출과 같은 방침이다(docs/시험지분석.md) —
 *   유형을 붙이면 그때부터 **자동 출제에 섞여** 다른 학생 학습지에 나온다. 강사가 올린 자료는
 *   유형·학원 공통 레벨(1~6)이 정해지지 않은 것이므로 섞이면 안 된다.
 *   원장님이 「상/중/하」로 적으신 난이도는 `difficulty` 에 글자로 둔다.
 */
export function tutorProblemRow(args: {
  sheetId: string
  key: TutorKey
  no: number
  essay: boolean
  answerKind: string
  answerText: string | null
  points: number | null
  hasAnswerImage: boolean
  pdfName: string | null
  byName: string | null
}) {
  const { sheetId, key, no } = args
  return {
    book: TUTOR_BOOK,
    grade: key.course,
    // 고등 과정은 학기로 갈리지 않는다. 쎈 공통수학1 을 넣을 때 1 로 두었으므로 같게 맞춘다
    semester: 1,
    sub_chapter_no: 0,
    sub_chapter_title: key.unit,
    local_no: `${key.unit}-${key.level}-${no}`,
    step: TUTOR_STEP,
    difficulty: key.level,
    type_code: null as string | null,
    level: null as number | null,
    is_essay: args.essay,
    answer_kind: args.answerKind,
    answer_text: args.answerText,
    image_path: tutorImagePath(sheetId, no),
    ...(args.hasAnswerImage ? { answer_image_path: tutorAnswerImagePath(sheetId, no) } : {}),
    source_key: tutorSourceKey(sheetId, no),
    source_meta: {
      source_type: 'tutor',
      source_course: key.course,
      source_unit: key.unit,
      source_level: key.level,
      source_kind: String(key.kind ?? '').trim() || null,     // 교과서 · 단계별 학습지 … (원장님 2026-11-17)
      source_problem_no: no,
      source_key: tutorSourceKey(sheetId, no),
      sheet_id: sheetId,
      points: args.points,
      from_pdf: args.pdfName,
      uploaded_by: args.byName,
    },
  }
}
