/**
 * 시험 학생 인증 provider — 지금 화면이 쓰는 것 (043 §3-B)
 *
 * `session.ts` 의 `resolveStudent` 를 `StudentAuthProvider` 모양으로 감싼 것뿐이다.
 * 동작을 바꾸지 않았다. **운영 모드에서는 이 파일이 쓰이지 않는다** — `mode.ts` 가 막는다.
 */
import { resolveStudent } from './session'
import type { ResolvedStudent, StudentAuthProvider } from './providers'

export const demoStudentAuth: StudentAuthProvider = {
  source: 'demo',
  async resolve(req: Request): Promise<ResolvedStudent> {
    const r = await resolveStudent(req)
    return { student: r.student, deny: r.deny, source: 'demo' }
  },
}
