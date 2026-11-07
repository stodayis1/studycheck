// 테스트 학생 — 새 기능을 직접 해 보는 학생 (원장님 2026-11-07)
//
//   「앞으로 모든 새로운 메뉴는 … 테스트 학생에게 테스트할 수 있는 메뉴도 추가해놔.
//    내 테스트 학생은 윤수지 학생이야. 강사들의 테스트 학생은 「테스트」 학생이고」
//
// ★ 새 기능은 이 두 학생에게 **학년·대상 조건과 상관없이** 열어 준다.
// ★ 윤수지는 is_test 가 false 다(원장님 학생 목록에 그대로 있는 학생). 표시를 바꾸지 말고 id 로 가른다.
//   「테스트」는 is_test=true — 담당이 없어도 모든 강사에게 보인다(useAuth canViewStudent).

export const OWNER_TEST_STUDENT_ID = '3e50baff-4003-49be-b915-98e297bda726'   // 윤수지 (원장님)
export const TEACHER_TEST_STUDENT_ID = '69420802-41c0-4046-af9c-52a5e0acdb8c' // 테스트 (강사들)

export const TEST_STUDENTS = [
  { id: OWNER_TEST_STUDENT_ID, name: '윤수지', who: '원장님' },
  { id: TEACHER_TEST_STUDENT_ID, name: '테스트', who: '강사' },
]

export function isTestStudentId(id: string | null | undefined) {
  return id === OWNER_TEST_STUDENT_ID || id === TEACHER_TEST_STUDENT_ID
}

/** 지금 로그인한 직원의 테스트 학생 — 원장(role admin)은 윤수지, 나머지는 테스트 */
export function myTestStudentId(role: string | null | undefined) {
  return role === 'admin' ? OWNER_TEST_STUDENT_ID : TEACHER_TEST_STUDENT_ID
}
