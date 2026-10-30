/**
 * 학습 세션 — 입장 / 퇴장 / 현재 상태 · **045 §3 으로 운영 경로 연결**
 *
 * ⚠️ 모드에 따라 **다른 길**이다. 섞지 않는다
 *   로컬(`local_demo`) : 시험 입장 코드 → 서명 쿠키 → 파일 저장소
 *   운영(`operational`) : 기존 학생 인증(익명 Auth + `student_login` 으로 적힌
 *                        `students.session_uid`) → Bearer 토큰 → 운영 조회
 *
 * `POST` 의 입장 코드는 **로컬에서만** 받는다. 운영에서는 이 경로로 로그인하지 않는다 —
 * 학생은 기존 `app/auth/login` 으로 들어오고 그 토큰을 들고 온다.
 *
 *
 * ⚠️ 이 경로에 **직원 인가가 없는 이유** (safe-change 점검표 §4)
 *   ※ 가드 훑기는 파일에서 그 함수 **이름**을 찾는다. 그래서 이 주석에는
 *     그 이름을 적지 않는다 — 적으면 훑기가 이 파일을 더 이상 집어내지 못한다.
 *   학생·학부모가 부르는 API 라서 직원 인가를 쓸 수 없다. 대신 그 항목이 요구하는 대로
 *   **토큰으로 본인을 확인하고, 본문의 학생 id 를 믿지 않는다** —
 *   `resolveLearningAuth()` → 운영 학생 인증이 Bearer 토큰의 auth uid 로
 *   `students.session_uid` 를 찾아 학생을 확정한다 (`app/api/push/subscribe` 와 같은 방식).
 *   본문에 학생 id 를 넣어 보내도 **쓰지 않는다.**
 *   학부모 세션(`parent_session_uid`)으로는 열리지 않는다 — 학습 행동의 주체는 학생이다.
 *   가드 없는 라우트를 훑을 때 이 두 경로가 나오면 **의도된 것**이다.
 *
 * `GET` 은 두 모드 다 답한다. 어느 모드·어느 저장소·어느 콘텐츠였는지 **응답에 적는다** —
 * 조용히 시험 자료를 보여 주지 않기 위해서다 (042 §2).
 */
import { NextResponse } from 'next/server'

import { buildState } from '@/lib/learning/engine'
import {
  NotConfiguredError, resolveLearningAuth, resolveLearningDeps,
} from '@/lib/learning/deps'
import { ensureDemoSeeded, SEED_LOGIN_CODES } from '@/lib/learning/demoDeps'
import { testStore } from '@/lib/learning/store'
import {
  COOKIE_NAME, STAFF_CODE, STAFF_COOKIE, isStaffRequest, makeCookieValue,
} from '@/lib/learning/session'
import { demoEnabled, learningMode, DEMO_OFF_NOTICE } from '@/lib/learning/mode'

export async function GET(req: Request) {
  const mode = learningMode()
  if (mode === 'local_demo') await ensureDemoSeeded()

  // 학생을 먼저 확정한다 — **콘텐츠를 읽기 전에** (045 §3)
  const auth = await resolveLearningAuth()
  const r = await auth.resolve(req)
  if (r.deny !== null || r.student === null) {
    return NextResponse.json({
      signedIn: false,
      mode,
      deny: r.deny,
      authSource: r.source,
      // 입장 코드는 **로컬에서만** 알려준다. 운영에서는 기존 로그인으로 간다
      loginCodes: mode === 'local_demo' ? SEED_LOGIN_CODES : [],
      howToSignIn: mode === 'local_demo'
        ? '시험 입장 코드를 넣으세요'
        : '학생은 기존 로그인(/auth/login)으로 들어온 뒤 그 토큰을 보냅니다',
      storage: mode === 'local_demo'
        ? { backend: testStore().backend, location: testStore().location }
        : undefined,
    }, { status: 200 })
  }

  try {
    const deps = await resolveLearningDeps()
    const state = await buildState(r.student, deps)
    return NextResponse.json({
      signedIn: true,
      staff: isStaffRequest(req),
      authSource: r.source,
      matchedBy: r.matchedBy,
      ...state,
    })
  } catch (e) {
    if (e instanceof NotConfiguredError || (e as { notConfigured?: boolean })?.notConfigured) {
      return NextResponse.json({
        signedIn: false,
        mode: 'operational',
        error: '운영 학습 설정이 없습니다',
        why: '시험 자료로 대신하지 않습니다 (EXEC-043 §3-A).',
      }, { status: 503 })
    }
    throw e
  }
}

export async function POST(req: Request) {
  // 042 §3-D — 시험 입장 코드·시험 강사 쿠키는 **로컬 demo 모드에서만** 받는다.
  // 운영 빌드에서는 환경변수를 어떻게 넣어도 켜지지 않는다 (`mode.ts`)
  if (!demoEnabled()) {
    return NextResponse.json({
      ok: false,
      ...DEMO_OFF_NOTICE,
      howToSignIn: '학생은 기존 로그인(/auth/login)으로 들어온 뒤 그 토큰을 보냅니다',
    }, { status: 403 })
  }
  await ensureDemoSeeded()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const action = String(body.action ?? '')

  if (action === 'logout') {
    const res = NextResponse.json({ ok: true })
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 })
    res.cookies.set(STAFF_COOKIE, '', { path: '/', maxAge: 0 })
    return res
  }

  if (action === 'staff_login') {
    if (String(body.code ?? '') !== STAFF_CODE) {
      return NextResponse.json({ ok: false, error: '강사 입장 코드가 맞지 않습니다' }, { status: 401 })
    }
    const res = NextResponse.json({ ok: true, staff: true })
    res.cookies.set(STAFF_COOKIE, STAFF_CODE, { path: '/', httpOnly: true, sameSite: 'lax' })
    return res
  }

  // 기본: 학생 입장
  const code = String(body.code ?? '').trim()
  const student = await testStore().findStudentByLoginCode(code)
  if (student === null) {
    return NextResponse.json({ ok: false, error: '입장 코드를 찾을 수 없습니다' }, { status: 401 })
  }
  const res = NextResponse.json({
    ok: true,
    student: { studentId: student.studentId, displayName: student.displayName },
  })
  // httpOnly — 화면 스크립트가 세션 값을 읽지 못한다
  res.cookies.set(COOKIE_NAME, makeCookieValue(student.studentId), {
    path: '/', httpOnly: true, sameSite: 'lax',
  })
  return res
}
