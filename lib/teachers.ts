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
