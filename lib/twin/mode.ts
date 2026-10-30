// 저장소 모드 선택 (GPT-EXEC-002 §196 · GPT-EXEC-005 D-060)
//
// 두 가지를 한다.
//
//  1) fixture 가 실서비스에서 조용히 쓰이는 일을 막는다.
//     production 에서 값이 없거나 `fixture` 면 **fail closed** — 예외를 던지고 멈춘다.
//     RPC 나 환경설정이 잘못돼도 fixture 로 자동 fallback 하지 않는다.
//     조용히 넘어가면 원장님이 예시 데이터를 진짜로 알고 승인하게 된다.
//
//  2) 관리자 경로와 서버 경로를 **서로 다른 타입**으로 돌려준다 (D-060).
//     관리자 저장소에는 생성·검증 메서드가 없고, 서버 저장소에는 승인·게시 메서드가 없다.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  FixtureAdminRepository, FixtureServerRepository,
  SupabaseAdminRepository, SupabaseServerRepository,
  type AdminTwinRepository, type ServerTwinRepository,
} from './repository'
import { fixturePairs } from './fixtures'

export type RepositoryMode = 'fixture' | 'supabase'

export class TwinModeError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'TwinModeError'
  }
}

export function isProduction(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.VERCEL_ENV ?? env.NODE_ENV) === 'production'
}

/**
 * 어떤 저장소를 쓸지 정한다. production 에서 fixture 로 새는 경로가 없다.
 *
 * @throws TwinModeError production 에서 모드가 없거나 fixture 일 때
 */
export function resolveMode(env: NodeJS.ProcessEnv = process.env): RepositoryMode {
  const raw = (env.TWIN_REPOSITORY_MODE ?? '').trim().toLowerCase()
  const prod = isProduction(env)

  if (raw !== 'fixture' && raw !== 'supabase' && raw !== '') {
    throw new TwinModeError('invalid_mode',
      `TWIN_REPOSITORY_MODE 값이 올바르지 않습니다: ${raw}`)
  }

  if (prod) {
    if (raw === '') {
      throw new TwinModeError('mode_required_in_production',
        'production 에서는 TWIN_REPOSITORY_MODE=supabase 를 반드시 지정해야 합니다.')
    }
    if (raw === 'fixture') {
      throw new TwinModeError('fixture_forbidden_in_production',
        'production 에서 fixture 저장소를 쓸 수 없습니다. 예시 데이터가 실제 검수에 섞이면 안 됩니다.')
    }
    return 'supabase'
  }

  return raw === 'supabase' ? 'supabase' : 'fixture'
}

/**
 * 관리자 동작용 저장소.
 *
 * supabase 모드에서는 **요청 JWT 가 담긴 클라이언트**로 만든다.
 * service-role 키를 쓰지 않는다. 반환 타입에 생성·검증 메서드가 없으므로
 * 이 저장소로는 `server_*` RPC 를 부를 수 없다.
 */
export function createAdminRepository(
  accessToken: string,
  env: NodeJS.ProcessEnv = process.env,
): { repo: AdminTwinRepository; mode: RepositoryMode } {
  const mode = resolveMode(env)

  if (mode === 'fixture') {
    return { repo: new FixtureAdminRepository(structuredClone(fixturePairs)), mode }
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new TwinModeError('supabase_env_missing', 'Supabase 설정이 없습니다.')
  if (!accessToken) throw new TwinModeError('access_token_required', '로그인 토큰이 필요합니다.')

  const userClient: SupabaseClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })

  return { repo: new SupabaseAdminRepository(userClient), mode }
}

/**
 * 생성 파이프라인용 저장소. **서버 내부 동작에만** 쓴다.
 * service-role 클라이언트를 쓰는 유일한 경로이고,
 * 반환 타입에 승인·게시 메서드가 없으므로 관리자 RPC 를 부를 수 없다.
 */
export function createServerRepository(
  env: NodeJS.ProcessEnv = process.env,
): { repo: ServerTwinRepository; mode: RepositoryMode } {
  const mode = resolveMode(env)
  if (mode === 'fixture') {
    return { repo: new FixtureServerRepository(), mode }
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new TwinModeError('supabase_env_missing', 'Supabase 서버 설정이 없습니다.')

  const service = createClient(url, key, { auth: { persistSession: false } })
  return { repo: new SupabaseServerRepository(service), mode }
}
