/**
 * 오토스텝(진도 체크 → 유형편 숙제 자동 제안·알림)을 **누구에게 켜 두는지** 한 곳에 모은다.
 *
 * 왜 한 파일인가
 *   파일럿 학생 목록이 `app/teacher/curriculum/page.tsx`(교재 배정)와
 *   `app/teacher/learning-notes/page.tsx`(진도 체크 → 알림 생성) 두 곳에 똑같이 적혀 있었고
 *   「두 파일 다 맞춰줘야 함」이라는 주석으로 버티고 있었다. 한쪽만 고치면 교재 배정 화면엔
 *   스텝 고르기가 뜨는데 학습일지에선 알림이 안 생긴다 — **에러도 안 난다.**
 *
 * 원장님 2026-11-16 「개념유형 중1-2 교재 쓰는 학생들에게는 모두 적용해줘」
 *   → 학생을 한 명씩 늘리던 파일럿 명단과 **별개로**, 교재·학년·학기 단위로 전원에게 여는 길을 만들었다.
 */

/**
 * 파일럿 — 학생 한 명씩 늘려 가며 검증하던 길. 이 명단에 든 학생은 교재·학기를 가리지 않고
 * (매핑이 있는 범위에서) 오토스텝이 돈다. 아래 OPEN 목록이 늘면 자연히 쓸 일이 줄어든다.
 */
export const AUTOSTEP_PILOT_STUDENT_IDS = new Set([
  '3e50baff-4003-49be-b915-98e297bda726', // 윤수지(중2)
  '4fec8d11-ccb5-4300-9e2e-7ca5dedc0ff7', // 유정환(초6, 개념유형 선행)
  '07a66269-59ee-4675-96f9-fc79c8f2dfbc', // 안준혁(초6)
  'fe87f1a6-9142-4e64-8cfa-2a9273e516cc', // 오현승(초6)
  '06b4178f-0f71-48e6-bbfe-07f911acdf72', // 임지원(초6)
])

export function isAutostepPilot(studentId: string | null | undefined) {
  return !!studentId && AUTOSTEP_PILOT_STUDENT_IDS.has(studentId)
}

/**
 * 쪽수 매핑(`autostep_concept_page_map`)을 실제로 만들어 둔 개념서 이름.
 * 개념리피트처럼 같은 개념을 다루지만 매핑이 없는 개념서에는 제안이 뜨면 안 된다.
 * (`개념유형 라이트`는 지금 쓰지 않는 옛 이름 — 그때 배정된 기록이 남아 있어 같이 본다)
 */
export const AUTOSTEP_TEXTBOOK_NAMES = ['개념유형 라이트', '개념+유형라이트']
export const SSENB_TEXTBOOK_NAME = '쎈B'

/**
 * **전원에게 열어 둔** 교재·학년·학기. 파일럿 명단과 상관없이 그 교재를 쓰는 학생 모두에게 돈다.
 *
 * ★ 늘릴 때 먼저 확인할 것 — 그 학기 개념이 `autostep_concept_page_map` 에 **전부** 들어가 있어야 한다.
 *   매핑이 없으면 알림이 조용히 안 생긴다(에러가 안 난다). 2026-11-16 기준:
 *   중1-1(60/60) · 중1-2(48/48) · 중2-1(58/58) · 중2-2(52/52) · 중3-1(58/58) 은 전수 매핑,
 *   중3-2(0/32) · 초등 전 학년 · 고등은 0건.
 *   확인 쿼리:
 *     select c.grade, c.semester, count(*) 개념, count(m.concept_id) 매핑
 *       from concepts c left join autostep_concept_page_map m on m.concept_id = c.id
 *      group by 1,2 order by 1,2;
 */
export const AUTOSTEP_OPEN_SEMESTERS: { grade: string; semester: number }[] = [
  { grade: '중1', semester: 2 }, // 원장님 2026-11-16
]

/** 이 교재(이름·학년·학기)가 전원에게 열어 둔 것인가 */
export function isAutostepOpen(
  textbookName: string | null | undefined,
  grade: string | null | undefined,
  semester: number | null | undefined,
) {
  if (!textbookName || !grade || semester == null) return false
  if (!AUTOSTEP_TEXTBOOK_NAMES.includes(textbookName)) return false
  return AUTOSTEP_OPEN_SEMESTERS.some((x) => x.grade === grade && x.semester === semester)
}

/** 이 학생 + 이 교재에 오토스텝을 쓸 수 있나 (전원 공개 교재이거나, 파일럿 학생이거나) */
export function autostepAllowed(
  studentId: string | null | undefined,
  textbookName: string | null | undefined,
  grade: string | null | undefined,
  semester: number | null | undefined,
) {
  return isAutostepOpen(textbookName, grade, semester) || isAutostepPilot(studentId)
}
