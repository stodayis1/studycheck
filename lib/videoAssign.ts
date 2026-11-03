// 영상 과제를 **여러 학생에게 한꺼번에** 붙일 때 쓰는 규칙들.
//
// 왜 (원장님 2026-11-03)
//   「영상과제를 하나하나 일일이 과제 배부하려면 너무 일이 많은데 일괄적으로 배부할수
//   있도록 메뉴만들자」. 지금은 학습일지를 학생마다 열어 링크를 넣어야 한다.
//
// ★ 넣는 자리는 **지금과 똑같다** — `class_sessions.video_url` 에 줄바꿈으로 이어 붙인다.
//   그래야 학생·학부모 화면, 브리핑의 「다음 시간까지 과제」, 시청 기록이 **그대로** 돈다.
//   화면을 하나 더 만드는 것이지 새 길을 내는 것이 아니다.

import { youtubeId } from './lessonVideos'

/**
 * 영상 과제를 쓸 수 있는 사람 — **선생님이면 모두.**
 *
 * ★ 2026-11-03 부터 전원에게 열렸다 (원장님 「강사들은 안보인다는데? 영상과제 메뉴가
 *   안보이면 안돼지. 보게 해달라니까?」).
 *   그 전에는 시험 중이라 원장님과 주한 선생님께만 보였다(2026-10-20 ~ 11-03).
 *
 * ★ `isAdmin()` 이 아니라 **역할**로 본다. isAdmin() 은 「관리자모드」 토글까지 보기 때문에,
 *   원장님이 강사모드로 보시는 동안 원장님께도 메뉴가 사라진다
 *   (학습일지에서 2026-10-21 에 똑같이 당했다).
 *
 * ★ **누가 쓰느냐**와 **누가 보이느냐**는 다른 일이다. 이걸 열어도 배부 화면에 뜨는
 *   학생은 `canViewStudent` 가 정한다 — 강사는 본인 담당만, 중등주임은 중등 전체.
 */
const STAFF_ROLES = ['admin', 'teacher', 'staff']

export function canAssignVideos(user?: { role?: string | null; name?: string | null } | null): boolean {
  return !!user && STAFF_ROLES.includes(String(user.role ?? ''))
}

/**
 * 이미 들어 있는 영상에 새 영상을 **이어 붙인다.**
 *
 * ★ 덮어쓰지 않는다 — 선생님이 넣어 둔 영상이 날아가면 안 된다.
 * ★ 같은 영상은 두 번 넣지 않는다. 글자 그대로 견주면 안 된다 — 같은 영상이라도
 *   뒤에 `?si=…` 가 붙어 들어온 것이 있어서 **유튜브 id 로** 견준다(학습일지와 같은 규칙).
 */
export function mergeVideoUrls(existing: string | null | undefined, add: string[]): {
  urls: string[]; added: string[]; skipped: string[]
} {
  const 있던것 = String(existing ?? '').split(/\r?\n/).map((u) => u.trim()).filter(Boolean)
  const 열쇠 = (u: string) => youtubeId(u) || u.trim()
  const 가진것 = new Set(있던것.map(열쇠))
  const added: string[] = []
  const skipped: string[] = []
  for (const raw of add) {
    const u = String(raw ?? '').trim()
    if (!u) continue
    const k = 열쇠(u)
    if (가진것.has(k)) { skipped.push(u); continue }
    가진것.add(k)
    added.push(u)
  }
  return { urls: [...있던것, ...added], added, skipped }
}

export interface SessionLite { id: string; session_date: string }

/**
 * 과제를 붙일 수업 — **그 날짜까지의 가장 최근 수업.**
 *
 * 학습일지의 과제는 「그 수업에서 내준, 다음 시간까지 할 것」이다. 학생 화면도
 * 「가장 최근 수업」의 과제를 보여 준다(app/student/assignments). 그래서 같은 규칙으로 고른다.
 * ★ 앞으로의 수업에는 붙이지 않는다 — 아직 하지 않은 수업에 과제가 달리면 학생 화면에
 *   미래 날짜가 뜬다(2026-11-02 에 그걸로 한 번 고쳤다).
 */
export function pickSessionFor(date: string, sessions: SessionLite[]): SessionLite | null {
  const 쓸것 = sessions.filter((s) => s.session_date <= date)
  if (!쓸것.length) return null
  return [...쓸것].sort((a, b) => a.session_date.localeCompare(b.session_date))[쓸것.length - 1]
}
