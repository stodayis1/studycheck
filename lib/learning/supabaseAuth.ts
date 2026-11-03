/**
 * 운영 학생 인증 provider — GPT-EXEC-043 §3-B · **045 §3 으로 고침**
 *
 * ⚠️ **운영에서 돌려 본 적이 없다.** 성공 경로는 합성 대역으로만 확인했다.
 *   「연결됐다」고 보고하지 않는다.
 *
 * 기존 경로를 재사용한다 (새로 만들지 않는다)
 *   학생은 **익명 Supabase Auth** 로 로그인한 뒤 `student_login` RPC 가
 *   `students.session_uid` 에 그 익명 uid 를 적어 둔다 (AGENTS.md 「로그인·권한 구조」,
 *   `app/auth/login/page.tsx`). 그래서 서버가 할 일은
 *   **Bearer 토큰 → auth uid → `students.session_uid` 로 학생 찾기** 다.
 *
 * 섞지 않는 것 (043 §3-B 가 못 박은 것)
 *   · `session_uid`  : 익명 auth 의 uid. **지금 이 브라우저**를 가리킨다
 *   · `user_id`      : 학생 계정이 있을 때의 auth 사용자
 *   · `students.id`  : 학생 행의 기본키. 우리 기록이 가리키는 것은 **이것**이다
 *   셋을 바꿔 쓰면 남의 기록에 쓰게 된다. 아래에서 세 이름을 분리해 다룬다.
 *
 * 045 에서 고친 것 (GPT_REVIEW_043_044 §7.3)
 *   ① **조회 오류를 「학생 없음」으로 취급하지 않는다.** 전에는 `session_uid` 조회의
 *      `error` 를 보지 않고 `user_id` 로 넘어갔다. 합성 오류 뒤 fallback 행을 주면
 *      그대로 통과했다. 이제 오류는 `lookup_failed` 로 **올린다** — 못 읽은 것과
 *      없는 것은 다른 말이다.
 *   ② **활성 학생만.** `is_active = true` 를 건다. 저장소의 다른 화면이 전부 쓰는
 *      기존 규칙 그대로다 (`eq('is_active', true)`).
 *   ③ `user_id` fallback 은 **익명 세션으로 찾지 못했고 조회가 성공했을 때만** 쓴다.
 *      어느 쪽으로 찾았는지 `matchedBy` 로 남긴다.
 *
 * client 가 보낸 학생 id 는 **쓰지 않는다.** 토큰에서 나온 uid 만 믿는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { StudentRow } from './contract'
import { NotConfiguredError, type ResolvedStudent, type StudentAuthProvider } from './providers'
import { learningClient } from './supabaseClient'

function bearer(req: Request): string {
  return (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
}

const COLUMNS = 'id, name, session_uid, user_id, is_active'

type StudentLookupRow = {
  id: unknown
  name?: unknown
  session_uid?: unknown
  user_id?: unknown
  is_active?: unknown
}

export function supabaseStudentAuth(): StudentAuthProvider {
  return {
    source: 'supabase',

    async resolve(req: Request): Promise<ResolvedStudent> {
      const token = bearer(req)
      if (token === '') return { student: null, deny: 'no_session', source: 'supabase' }

      let db: SupabaseClient
      try {
        db = learningClient('학생 인증')
      } catch (e) {
        // 설정이 없으면 **시험 세션으로 넘어가지 않는다**
        if (e instanceof NotConfiguredError) {
          return { student: null, deny: 'not_configured', source: 'supabase' }
        }
        throw e
      }

      // ① 토큰 → auth 사용자. 여기서 나온 uid 만 믿는다
      const { data: authResult, error } = await db.auth.getUser(token)
      const authUid = authResult?.user?.id
      if (error || !authUid) return { student: null, deny: 'no_session', source: 'supabase' }

      // ② auth uid → 학생 행.
      //    익명 로그인은 `session_uid`, 계정이 있으면 `user_id` 에 붙는다.
      //    **둘을 한 쿼리로 섞지 않고** 순서대로 본다.
      const bySession = await db
        .from('students')
        .select(COLUMNS)
        .eq('session_uid', authUid)
        .eq('is_active', true)
        .maybeSingle()
      // **오류를 「없음」으로 바꾸지 않는다** (§7.3)
      if (bySession.error) return { student: null, deny: 'lookup_failed', source: 'supabase' }

      let row = (bySession.data ?? null) as StudentLookupRow | null
      let matchedBy: 'session_uid' | 'user_id' = 'session_uid'

      if (row === null) {
        const byUser = await db
          .from('students')
          .select(COLUMNS)
          .eq('user_id', authUid)
          .eq('is_active', true)
          .maybeSingle()
        if (byUser.error) return { student: null, deny: 'lookup_failed', source: 'supabase' }
        row = (byUser.data ?? null) as StudentLookupRow | null
        matchedBy = 'user_id'
      }
      if (row === null) return { student: null, deny: 'unknown_student', source: 'supabase' }

      // 조회에 `is_active` 를 걸었지만 **돌아온 값으로 한 번 더 확인한다** —
      // 대역·뷰가 걸러 주지 않는 경우에도 퇴원 학생이 통과하지 않게
      if (row.is_active === false) {
        return { student: null, deny: 'inactive_student', source: 'supabase' }
      }

      // ③ 우리 기록이 가리키는 것은 **`students.id`** 다 (auth uid 가 아니다)
      const student: StudentRow = {
        studentId: String(row.id),
        loginCode: '',                    // 운영에는 입장 코드가 없다
        displayName: String(row.name ?? ''),
        provenance: 'operational',
      }
      return { student, deny: null, source: 'supabase', matchedBy }
    },
  }
}
