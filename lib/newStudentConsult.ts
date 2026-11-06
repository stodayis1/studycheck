// 신입생 상담 알림 — **첫 수업 일주일 뒤**와 **한 달 뒤** (원장님 2026-11-06).
//
//   「앞으로 신입생 첫 수업 일주일 후 신입상담(수업 방향 설정 및 현재 진도상황 공유 상담),
//    신입생 한달 수업 후 적응 상황 상담 알림 뜨게 해줘(자동으로)」
//
// ★ **첫 수업일**이 기준이다. 등록일이 아니다 — 수학OPS 에 먼저 등록하고 앱에 나중에 넣는 일이
//   있어서 등록일은 실제와 어긋난다. 첫 수업은 class_sessions 의 가장 이른 날이다.
// ★ 알림은 **수학OPS 의 전달사항(staff_notes)** 으로 간다. 그러면 OPS 첫 화면의 「오늘 할 일」과
//   스터디체크 대시보드에 **둘 다** 뜬다(스터디체크는 /api/ops-tasks 로 그걸 읽어 온다).
//   「확인」은 OPS 에서만 누른다 — 기록이 한 곳에만 남아야 한다.
// ★ 상담을 적으면 더 안 뜬다. 기준일 **이후**의 상담 기록이 있으면 끝난 것으로 본다.

export interface Stage {
  key: 'intro' | 'settle'
  days: number
  title: string
  what: string
}

export const STAGES: Stage[] = [
  { key: 'intro',  days: 7,  title: '신입 상담', what: '수업 방향 설정, 현재 진도 상황 공유' },
  { key: 'settle', days: 30, title: '적응 상담', what: '한 달 수업 뒤 적응 상황' },
]

/**
 * 묵은 건까지 한꺼번에 쏟아지지 않게 — 기준일이 **며칠 전까지**인 것만 알린다.
 * ★ 크론이 하루 걸러도 놓치지 않을 만큼만 둔다. 넓히면 처음 켜는 날 옛날 것이 왕창 뜬다
 *   (2026-11-06 기준으로 허주원·김주아처럼 이미 지난 학생이 있었다 — 그건 원장님이 명단을
 *    보고 따로 판단하셨다).
 */
export const CATCHUP_DAYS = 3

const 날짜더하기 = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  d.setDate(d.getDate() + days)
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10)
}

export const 날수 = (from: string, to: string) =>
  Math.round((new Date(`${to}T00:00:00+09:00`).getTime() - new Date(`${from}T00:00:00+09:00`).getTime()) / 86400_000)

export interface Candidate {
  studentId: string
  stage: Stage
  /** 알려야 하는 날 (첫 수업 + days) */
  dueOn: string
  firstLesson: string
}

/**
 * 오늘 알려야 할 것 — 학생 한 명에 대해.
 *
 * @param firstLesson 첫 수업일 (없으면 아무것도 아니다 — 수업을 한 적이 없다)
 * @param consultedAt 그 학생의 상담 날짜들
 * @param already 이미 알린 단계 (한 번 알린 것은 다시 안 알린다)
 */
export function dueStagesFor(
  firstLesson: string | null | undefined,
  consultedAt: string[],
  already: Set<string>,
  today: string,
): Stage[] {
  const first = String(firstLesson ?? '').slice(0, 10)
  if (!first) return []
  return STAGES.filter((st) => {
    if (already.has(st.key)) return false
    const due = 날짜더하기(first, st.days)
    const 지난날 = 날수(due, today)
    // 아직 안 됐거나, 너무 묵었으면 안 알린다
    if (지난날 < 0 || 지난날 > CATCHUP_DAYS) return false
    // 기준일 **이후**에 상담한 기록이 있으면 끝난 것
    return !consultedAt.some((c) => String(c ?? '').slice(0, 10) >= due)
  })
}

/** 전달사항에 적을 글. OPS 전달사항 글투(「[머리표] …」)에 맞춘다. */
export function noteText(a: {
  name: string; grade?: string | null; school?: string | null
  stage: Stage; firstLesson: string; today: string
}): string {
  const 누구 = [a.grade, a.school].filter(Boolean).join('·')
  const 며칠 = 날수(a.firstLesson, a.today)
  const [, m, d] = a.firstLesson.split('-')
  return [
    `[${a.stage.title}] ${a.name}${누구 ? ` (${누구})` : ''}`,
    `첫 수업 ${Number(m)}/${Number(d)} · 오늘로 ${며칠}일째입니다. ${a.stage.title}을 부탁드립니다.`,
    `— ${a.stage.what}`,
    `상담 후 스터디체크 「상담내역」에 적어 주시면 됩니다.`,
    // ★ 원장님 2026-11-06 「확인하시면 전달사항 클릭하면 사라진다는 내용도 써줘.
    //   그래야 확인했는지 안했는지 알고, 그게 사라져야 다음 전달사항이랑 안섞이지」
    `※ 이 전달사항을 눌러 「확인」하시면 사라집니다. 확인하신 건지 알 수 있고, 다음 전달사항과 섞이지 않아요.`,
  ].join('\n')
}
