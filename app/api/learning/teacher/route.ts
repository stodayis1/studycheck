/**
 * 강사 요약 — GPT-EXEC-041 · **045 §3 으로 운영 경로 연결**
 *
 * 학생 쿠키로는 **열리지 않는다.**
 *   운영: 기존 직원 인가 `denyIfNotStaff`(`lib/apiAuth.ts`) — 시험 강사 쿠키는 통하지 않는다
 *   로컬: 시험 강사 입장 코드
 *
 * 045 에서 달라진 것
 *   042~044 는 직원 인가를 통과해도 **501 「미연결」** 로 끝났다. 그래서 운영에서
 *   강사 요약이 한 번도 나오지 않았다. 이제 인가를 통과하면 **운영 의존성으로 요약을 만든다.**
 *   조용히 시험 저장소를 보여 주지 않는다 — 어느 저장소·어느 콘텐츠였는지 응답에 적는다.
 *
 * 계획은 **draft** 로만 돌려준다. 승인·적용은 이 경로에서 하지 않는다.
 * 운영에는 계획 초안 표가 **없다** — `planDraftPersisted: false` 로 드러낸다.
 */
import { NextResponse } from 'next/server'

import { teacherRows } from '@/lib/learning/engine'
import { NotConfiguredError, resolveLearningDeps } from '@/lib/learning/deps'
import { ensureDemoSeeded } from '@/lib/learning/demoDeps'
import { isStaffRequest } from '@/lib/learning/session'
import { learningMode } from '@/lib/learning/mode'
import { denyIfNotStaff } from '@/lib/apiAuth'

export async function GET(req: Request) {
  // ── 인가를 **먼저**. 콘텐츠·기록을 읽기 전에 (045 §3) ──────────────
  if (learningMode() === 'operational') {
    const deny = await denyIfNotStaff(req)
    if (deny) return deny
  } else {
    if (!isStaffRequest(req)) {
      return NextResponse.json(
        { ok: false, error: '강사 세션이 아닙니다 (학생 세션으로는 열리지 않습니다)' },
        { status: 403 },
      )
    }
    await ensureDemoSeeded()
  }

  try {
    const deps = await resolveLearningDeps()
    const rows = await teacherRows(deps)
    return NextResponse.json({
      ok: true,
      mode: deps.mode,
      contentSource: deps.content.source,
      storage: { backend: deps.store.backend, location: deps.store.location },
      approvalState: 'draft',
      planDraftPersisted: deps.store.planDraftPersisted,
      note: '계획은 draft 이며 승인 전에는 학생에게 적용되지 않습니다. 자동 과제 배정을 하지 않습니다.'
        + (deps.store.planDraftPersisted ? '' : ' 운영에는 계획 초안 표가 없어 저장하지 않습니다.'),
      contentNote: deps.content.note,
      // 첫 세트 영상의 검수 상태 — 다섯 칸을 각각 (044 §6-3). 시연에는 없다
      videoReadiness: deps.content.videoReadiness,
      rows,
    })
  } catch (e) {
    if (e instanceof NotConfiguredError || (e as { notConfigured?: boolean })?.notConfigured) {
      return NextResponse.json({
        ok: false,
        mode: 'operational',
        error: '운영 학습 설정이 없습니다',
        why: '시험 자료로 대신하지 않습니다 (EXEC-043 §3-A).',
      }, { status: 503 })
    }
    return NextResponse.json({
      ok: false,
      error: '강사 요약을 만들지 못했습니다',
    }, { status: 500 })
  }
}
