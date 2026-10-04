// 아직 시험 삼아 돌리는 기능을 **누구에게 보일지** 한 군데서 정한다.
//
// 지금은 학습지(문제은행 출제·교재 쪽 출제)와 자체 QR 채점이 여기에 걸려 있다.
//   · 선생님 쪽 : 원장만 (화면마다 isAdmin 검사 + 사이드바 '원장 전용' 묶음)
//   · 학생·학부모 : 아래 목록에 있는 학생만
//
// 목록은 DB 의 app_settings.worksheet_pilot_students 에 학생 id 배열로 들어 있다.
// 코드를 고치지 않고 늘릴 수 있게 DB 에 뒀다. 전체에 열 때는 그 줄을 지우면 된다
// (목록 자체가 없으면 '아무도 못 본다'가 아니라 '막지 않는다'로 본다 — 아래 설명 참고).

const KEY = 'worksheet_pilot_students'
const TTL = 60 * 1000
let cache: { at: number; ids: string[] | null } | null = null

/**
 * 시험 대상 학생 id 목록.
 *   []   → 설정은 있는데 비었다 = 아무에게도 안 보인다
 *   null → 설정 줄이 아예 없다  = 막지 않는다 (전체 공개로 되돌릴 때)
 */
export async function pilotStudentIds(supabase: any): Promise<string[] | null> {
  if (cache && Date.now() - cache.at < TTL) return cache.ids
  const { data, error } = await supabase
    .from('app_settings').select('value').eq('key', KEY).maybeSingle()
  // 읽기에 실패하면 **막는 쪽**으로 둔다. 조용히 전체에 열리면 안 된다
  if (error) return []
  const v = data?.value
  const ids = Array.isArray(v) ? (v as string[]).filter((x) => typeof x === 'string') : null
  cache = { at: Date.now(), ids }
  return ids
}

/** 이 학생에게 보여도 되나 */
export async function isPilotStudent(supabase: any, studentId: string | null | undefined) {
  if (!studentId) return false
  const ids = await pilotStudentIds(supabase)
  return ids === null ? true : ids.includes(studentId)
}
