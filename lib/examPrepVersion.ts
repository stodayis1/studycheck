// 시험대비 교재(이너프원) — **학생마다 어느 버전**인지.
//
// 왜 (원장님 2026-11-04)
//   「중2 이너프원 목차거든. 시험교재 배정할때 해당학생에게 해당 목차가 배정될수 있도록」
//
//   목차는 학교뿐 아니라 **버전(상·중·하)** 으로도 갈린다. 같은 신원중 안에서도 상·중·하가
//   있고, 누가 어느 버전인지는 원장님이 목차 파일에 「적용대상」으로 적어 주신다.
//   그걸 적어 두지 않으면 선생님이 배정할 때마다 그 파일을 찾아봐야 한다.
//
// ★ 칸을 새로 만들지 않고 app_settings 에 둔다 — 시험마다 바뀌는 값이라 표로 둘 것이 아니다.
//
//   app_settings.key = 'exam_prep_version'
//   value = { "2026-2-기말": { "학생이름": "2-2기말 중", … } }
//
// ★ 이름으로 적는다. 같은 이름이 둘이면 매쓰홀릭처럼 꼬리가 붙어 있다(「박시연2」).
//   그 꼬리까지 그대로 적어야 갈린다.

export const VERSION_KEY = 'exam_prep_version'

/** 지금 쓰는 시험 — 목차를 새로 넣을 때 여기와 설정의 열쇠를 같이 바꾼다. */
export const CURRENT_TERM = '2026-2-기말'

/**
 * 그 학생이 쓸 버전(= inner_enough.level). 안 적혀 있으면 null —
 * 그때는 선생님이 예전처럼 직접 고른다. **멋대로 고르지 않는다.**
 */
export function versionFor(value: any, studentName: string, term = CURRENT_TERM): string | null {
  const map = (value ?? {})[term]
  if (!map || typeof map !== 'object') return null
  const v = map[String(studentName ?? '').trim()]
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** 그 시험에 적힌 학생이 몇 명인가 — 화면에 「37명 적혀 있어요」로 보여 준다 */
export function versionCount(value: any, term = CURRENT_TERM): number {
  const map = (value ?? {})[term]
  return map && typeof map === 'object' ? Object.keys(map).length : 0
}
