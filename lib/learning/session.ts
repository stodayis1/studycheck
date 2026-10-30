/**
 * 시험 계정 세션 — GPT-EXEC-041
 *
 * 왜 따로 있는가
 *   `learningPreview.previewNextAction` 과 `compareEvents` 는 **순수 함수**다.
 *   "학생 범위를 서버가 확정했다" 는 **여기서** 일어난다. 순수 함수가 문자열을
 *   받는다는 사실은 인가 증거가 아니다 (040 리뷰 §3 R040-B).
 *
 * 무엇이 운영과 다른가
 *   운영 학생 로그인은 익명 Supabase Auth + `student_login` RPC 다
 *   (AGENTS.md 「로그인·권한 구조」). 이 시범은 운영 DB 를 쓰지 않으므로
 *   **시험 저장소의 입장 코드**로만 들어간다. 운영 계정이 아니다.
 *
 * 격리
 *   학생 식별은 **쿠키의 서명된 값**에서만 온다. 요청 본문의 `studentId` 는
 *   무엇이 와도 쓰지 않는다. 그래서 A 의 세션으로 B 의 자료를 달라고 해도
 *   서버는 A 범위로만 조회한다.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

import { testStore } from './store'
import { demoEnabled } from './mode'
import type { StudentRow } from './contract'

export const COOKIE_NAME = 'sc_learning_test'

/**
 * 시험 세션 서명 열쇠.
 *
 * 운영 비밀이 아니다 — 이 시범 저장소는 운영 자료를 담지 않는다. 그래도
 * 쿠키를 손으로 고쳐 남의 범위로 넘어가는 것은 막아야 하므로 서명한다.
 * 환경변수로 덮을 수 있고, 없으면 **이 시범 전용 고정값**을 쓴다.
 */
function secret(): string {
  return process.env.LEARNING_TEST_SESSION_SECRET || 'studycheck-041-test-store-only'
}

function sign(studentId: string): string {
  return createHmac('sha256', secret()).update(studentId).digest('base64url')
}

export function makeCookieValue(studentId: string): string {
  return `${encodeURIComponent(studentId)}.${sign(studentId)}`
}

/** 쿠키에서 학생 식별을 꺼낸다. 서명이 맞지 않으면 null */
export function studentIdFromCookieValue(value: string | null): string | null {
  if (!value) return null
  const dot = value.lastIndexOf('.')
  if (dot <= 0) return null
  const id = decodeURIComponent(value.slice(0, dot))
  const got = value.slice(dot + 1)
  const want = sign(id)
  if (got.length !== want.length) return null
  if (!timingSafeEqual(Buffer.from(got), Buffer.from(want))) return null
  return id
}

/** `Cookie` 머리글에서 우리 쿠키만 꺼낸다 */
export function readCookie(req: Request, name = COOKIE_NAME): string | null {
  const raw = req.headers.get('cookie')
  if (!raw) return null
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() !== name) continue
    return part.slice(i + 1).trim()
  }
  return null
}

/**
 * 지금 요청의 학생.
 *
 * `strictNullChecks` 가 꺼져 있어 판별 유니온이 좁혀지지 않으므로
 * **한 가지 모양**으로 돌려준다 (AGENTS.md 함정 3, `lib/apiAuth.ts` 와 같은 방식).
 */
export type Resolved = {
  student: StudentRow | null
  /** 막아야 하면 사유 코드. 통과면 null */
  deny: 'no_session' | 'unknown_student' | 'demo_disabled' | null
}

export async function resolveStudent(req: Request): Promise<Resolved> {
  // 042 §3-D — 시험 세션은 **명시적 로컬 demo 모드에서만** 통한다.
  // 운영에서는 조용히 되돌아가지 않고 막는다
  if (!demoEnabled()) return { student: null, deny: 'demo_disabled' }
  const id = studentIdFromCookieValue(readCookie(req))
  if (id === null) return { student: null, deny: 'no_session' }
  const student = await testStore().getStudent(id)
  if (student === null) return { student: null, deny: 'unknown_student' }
  return { student, deny: null }
}

/** 이 시범의 생성 트랙. client 가 보낸 문자열을 쓰지 않는다 */
export const VALIDATED_PRODUCER = 'studycheck-learning-041-test'

// ── 시험 강사 세션 ──────────────────────────────────────────────────
// 운영 직원 인증은 Supabase Auth + `public.users.role` 이다 (AGENTS.md).
// 이 시범은 Supabase 를 쓰지 않으므로 별도 입장 코드로만 가른다.
// 핵심은 **학생 쿠키로는 강사 화면이 열리지 않는다**는 것이다.
export const STAFF_COOKIE = 'sc_learning_test_staff'
export const STAFF_CODE = 'T-2026'

export function isStaffRequest(req: Request): boolean {
  // 042 §3-D — 운영 빌드에서 시험 강사 쿠키가 통하면 뒷문이 된다 (R041-04).
  // 직원 인가는 운영에서 `denyIfNotStaff` 가 맡는다
  if (!demoEnabled()) return false
  return readCookie(req, STAFF_COOKIE) === STAFF_CODE
}
