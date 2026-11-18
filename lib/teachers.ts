// 「담당 강사」 칸을 사람 이름들로 나누는 **한 가지** 규칙.
//
// 왜 한 곳에 두나 (2026-10-14)
//   students.teacher_name 은 자유 입력이라 「조윤희, 이규숙」처럼 쉼표로 적히기도 하고
//   「조윤희 이규숙」처럼 띄어쓰기로 적히기도 한다. 그런데 코드 11곳이 전부 쉼표류만
//   기준으로 나누고 있었다. 그래서 이도윤 학생(「조윤희 이규숙」)은 이름 전체가 한 사람으로
//   읽혀 **조윤희·이규숙 두 분 모두에게 안 보였다.**
//
//   보이지 않으니 이규숙 선생님이 같은 학생을 하나 더 만드셨고, 그게 중복 계정 사고가 됐다.
//   화면에서 안 보이는 것은 조용한 고장이라 아무도 눈치채지 못한다.
//
// ★ 선생님 이름에는 띄어쓰기가 없다(윤지혜·조윤희·주한·이규숙 …). 그래서 공백으로
//   나눠도 안전하다. 가운뎃점과 빗금도 사람이 흔히 쓰는 구분자라 같이 받는다.

const SPLIT = /[,，、·/\s]+/

/** 「조윤희, 이규숙」·「조윤희 이규숙」 → ['조윤희', '이규숙'] */
export function splitTeachers(teacherName?: string | null): string[] {
  return String(teacherName ?? '').split(SPLIT).map((t) => t.trim()).filter(Boolean)
}

/** 첫 번째(주 담당) 선생님. 색·묶음처럼 **한 사람**이 필요한 자리에 쓴다. */
export function mainTeacherOf(teacherName?: string | null): string {
  return splitTeachers(teacherName)[0] ?? ''
}

/** 이 학생이 그 선생님 담당인가. 공동 담당이면 **두 분 다** 참이다. */
export function isTeacherOf(teacherName: string | null | undefined, who?: string | null): boolean {
  if (!who) return false
  return splitTeachers(teacherName).includes(who)
}

/**
 * 한 학생을 맡은 선생님 — **키움쌤과 채움쌤 둘 다** (원장님 2026-11-05).
 *
 *   키움쌤(메인 담임, students.teacher_name)          — 실력을 키운다. 진도와 전체 방향
 *   채움쌤(클리닉 담임, students.clinic_teacher_name) — 빈 곳을 채운다. 구멍 메우고 다지기
 *
 * ★ 「채움쌤도 학생 학습일지 같이 쓰고 볼수 있어야 해」(원장님 2026-11-05).
 *   그래서 **보이는 범위·고치는 범위 판단은 전부 이 함수 하나**를 쓴다.
 *   화면마다 `splitTeachers(s.teacher_name).includes(내이름)` 을 따로 쓰면, 한 곳만
 *   빠뜨려도 채움쌤에게 그 화면만 조용히 비어 보인다(2026-10-14에 같은 일이 있었다).
 * ★ 같은 분이 키움쌤이자 채움쌤일 수 있다 — 겹치면 한 번만 센다.
 */
export type StudentTeachers = { teacher_name?: string | null; clinic_teacher_name?: string | null }

export function teachersOf(student: StudentTeachers | null | undefined): string[] {
  return [...new Set([
    ...splitTeachers(student?.teacher_name),
    ...splitTeachers(student?.clinic_teacher_name),
  ])]
}

/**
 * 화면에 적을 **담임 칸 이름** — 「키움쌤·채움쌤」 호칭은 **고등에서만** 쓴다
 * (원장님 2026-11-05 「키움쌤, 채움쌤은 고등에 한정」).
 *
 * 중등·초등은 지금까지 쓰던 말 그대로다. 칸(teacher_name · clinic_teacher_name)과
 * 보이는 범위는 학년과 상관없이 **똑같다** — 부르는 말만 다르다.
 */
export function teacherLabels(grade?: string | null) {
  const 고등 = String(grade ?? '').trim().startsWith('고')
  return 고등
    ? { main: '키움쌤 (메인 담임)', clinic: '채움쌤 (클리닉 담임)', mainChip: '키움', clinicChip: '채움' }
    : { main: '담임강사',          clinic: '클리닉 담임',        mainChip: '담임', clinicChip: '클리닉' }
}

/** 이 학생을 내가 맡았나 — 키움쌤이든 채움쌤이든 */
export function isMine(student: StudentTeachers | null | undefined, who?: string | null): boolean {
  if (!who) return false
  return teachersOf(student).includes(who)
}

/**
 * 서버에서 「이 직원이 이 학생을 봐도 되나」.
 *
 * students 조회 정책(docs/sql/학생조회_강사담당만_2026-10-29.sql)과 **같은 규칙**이다.
 * API 는 service_role 로 돌아 RLS 를 비껴가므로, 정책만 조여도 API 로는 전체가 그대로
 * 내려간다 — 그래서 학생 명단을 내려주는 API 는 여기서 한 번 더 걸러야 한다.
 *
 * 화면의 useAuth.canViewStudent 는 주임모드 토글까지 보지만, 서버는 **그 계정이 볼 수
 * 있는 가장 넓은 범위**로 판단한다. 모드는 보기 편의일 뿐이라 서버가 알 필요가 없다.
 */
export function staffCanSeeStudent(
  who: { role?: string | null; name?: string | null; supervisorGrades?: string[] | null },
  student: { grade?: string | null; teacher_name?: string | null; clinic_teacher_name?: string | null },
): boolean {
  if (who.role === 'admin' || who.role === 'staff') return true
  if (isMine(student, who.name)) return true          // 키움쌤·채움쌤 둘 다
  const g = String(student.grade ?? '').trim()
  return !!g && (who.supervisorGrades ?? []).includes(g)
}

/* ───────────────────── 주임모드에서 누가 보이나 (순수 규칙) ─────────────────────
 * 화면(hooks/useAuth.ts)과 수업일지가 **같은 함수**를 쓴다. 각자 베껴 쓰면 한쪽만
 * 고쳐져 「이 화면에서만 안 보인다」가 된다 — 2026-10-14 에 한 번 그랬다.
 */

/** 「중1」→「중」, 「초6」→「초」, 「고2」→「고」 — 학교급 */
export function gradeLevelOf(grade?: string | null): string {
  return String(grade ?? '').trim().charAt(0)
}

/**
 * 주임모드에서 이 학년을 화면에 올려도 되나.
 *   'scope'      = 담당 학년 → **누구 학생이든** 보인다 (주임의 본래 목적)
 *   'same-level' = 담당 학년은 아니지만 같은 학교급
 *   null         = 담당 학년도 아니고 학교급도 다르다
 */
export function supervisorScopeOf(
  supervisorGrades: string[] | null | undefined, grade?: string | null,
): 'scope' | 'same-level' | null {
  const g = String(grade ?? '').trim()
  const grades = supervisorGrades ?? []
  if (!g) return null
  if (grades.includes(g)) return 'scope'
  const levels = new Set(grades.map(gradeLevelOf))
  return levels.has(gradeLevelOf(g)) ? 'same-level' : null
}

/**
 * 주임모드에서 이 학생이 보이나.
 *
 * ★ **내 담당 학생은 학년과 상관없이 늘 보인다** (원장님 2026-11-18 「1번으로 고쳐줘」).
 *   전에는 학년을 먼저 보고 **담당인지 묻지도 않고** 숨겼다. 그래서 중등주임인
 *   신애진 선생님이 손예원(초6) 학생의 담당으로 적혔는데도 수업일지에 안 떴다 —
 *   초6 이 「중1·중2·중3」도 아니고 같은 학교급도 아니라서다. 에러도 안 나고 조용히 빈다.
 *   12월 진급으로 **초6 을 중등 선생님께 옮기는 동안 계속 걸릴 자리**라 순서를 뒤집었다.
 *
 * 담당이 아닌 학생은 전과 같다 — **담당 학년만** 보인다(같은 학교급이라고 남의 학생까지
 * 보이지는 않는다. 2026-10-09 원장님 지적으로 생긴 기준).
 */
export function visibleInSupervisorMode(
  supervisorGrades: string[] | null | undefined, grade: string | null | undefined, mine: boolean,
): boolean {
  if (mine) return true
  return supervisorScopeOf(supervisorGrades, grade) === 'scope'
}

