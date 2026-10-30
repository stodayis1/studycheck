// Storage 표본 1건 실행 진입점 — **초안. 운영 실행 미승인** (GPT-EXEC-029 §102 · 030 보완)
//
// 실행 방법은 `STORAGE_SAMPLE_RUNBOOK_030.md` 에 있다. 이 파일만 보고 돌리지 않는다.
// 직접 부르지 않고 **`scripts/run-storage-sample.cjs`** 로 띄운다 — npx 를 거치지 않기 위해서다.
//
// ── 030 에서 보완한 것 ─────────────────────────────────────────────
//   R029-01  `npx tsx` 는 로컬에 tsx 가 없으면 **스크립트가 시작되기 전에** 패키지를
//            조회한다. 그 바깥은 이 파일로 막을 수 없어서 얇은 실행기를 따로 두었다.
//   R029-02  (a) 독립 프로세스의 `process.env` 에 `.env.local` 이 자동으로 들어오지 않는다.
//                승인된 실행 모드에서만 **정해진 한 경로**의 환경파일을 읽는다.
//            (b) 안내 폴더와 실제 코드 위치가 달랐다. 이제 코드가 있는 그 폴더를 적는다.
//            (c) URL **형식** 검사를 「승인된 프로젝트 확인」이라 쓸 수 없다.
//                저장소에 이미 적혀 있는 **비밀 아닌** 프로젝트 ref 와 맞춰 본다.
//
// ════════════════════════════════════════════════════════════════════
// 실행 잠금 (§108)
// ════════════════════════════════════════════════════════════════════
//   import · 인자 없는 실행 · `--help` · `--plan`
//     → **네트워크 0건.** 운영 키·환경파일을 읽지 않는다. SDK 도 불러오지 않는다.
//        (SDK 와 선정 함수는 실행 모드에서 `await import` 로만 가져온다)
//   `--execute-approved-sample`
//     → 그때만 로컬 서버 설정을 읽고 클라이언트를 만든다.
//        **플래그가 GPT 의 운영 승인을 대신하지 않는다.**
//
// 키를 다루는 방식 (§113)
//   키는 **환경변수에서만** 읽는다. 명령행 인자·코드·출력물·로그 어디에도 쓰지 않는다.
//   설정이 없거나 대상 프로젝트가 불분명하면 **접속 전에 중단**한다.
//   다른 프로젝트로 fallback 하거나 환경을 뒤져 키를 모으지 않는다.
//   브라우저·학생 앱에 service-role 키를 넣지 않는다. 서버용 **비영속 세션**으로 제한하고
//   자동 토큰 갱신을 끈다.
//
// 읽는 범위 (§119) — 이보다 더 읽지 않는다
//   1) `public.problems` : 기존 `pickSourceProblems(db, '공수1-01-07', 1)` **1회 · 최대 1행**
//      그 함수의 SELECT 는 12개 열을 가져온다 —
//      id · book · grade · semester · type_code · step · difficulty · answer_kind ·
//      **answer_text** · image_path · is_essay · twin_id
//      `answer_text` 가 메모리에 올라온다. 조건 확인에만 쓰고 **출력하지 않는다.**
//      「Storage 만 접근」이나 「id·image_path 두 필드만 읽음」이라고 쓰지 않는다.
//   2) `problem-images` 목록 : 선정된 경로의 디렉터리 + search 한정 **list 1회** (limit 100)
//   3) `problem-images` 객체 : 그 `image_path` 에 대해서만 **download 1회**
//
//   후보 생성·저장·학생 공개·모델 호출·파이프라인·업무용 RPC·배포 — **0회.**
//   실패하면 즉시 멈춘다. 재시도·다른 경로 탐색·업로드·수정으로 보정하지 않는다.
//   권한·RLS·버킷 공개 설정을 바꾸지 않는다.
//
// 키 권한과 코드 범위를 구분한다 (§133)
//   이 코드가 읽기만 한다는 것과 **service-role 키 자체가 읽기 전용이라는 것은 다르다.**
//   service key 는 Storage 의 RLS 를 우회하는 강한 권한이다. 그래서 실행을 플래그로
//   잠그고, 읽는 호출을 위 세 개로 제한했다.

import {
  formatSampleReport,
  type SampleCheckReport,
} from '../lib/twin/storageSample'

/** 파일럿 첫 유형. 원장님이 유형을 고르거나 UUID 를 찾지 않도록 고정한다 (§116) */
export const PILOT_TYPE_CODE = '공수1-01-07'
export const PILOT_GRADE = '공통수학1'

export const EXECUTE_FLAG = '--execute-approved-sample'
export const HELP_FLAGS = ['--help', '-h', '--plan'] as const

/**
 * 승인된 대상 프로젝트의 **비밀 아닌** 식별자.
 *
 * `AGENTS.md` 에 적혀 있는 StudyCheck 의 Supabase 프로젝트 ref 다. 새로 만든 값이 아니라
 * 이미 검수된 공개 식별자를 재사용한다 (§66). URL **형식**만 보는 것을 「대상 확인」이라고
 * 쓰지 않기 위해, 접속할 origin 의 호스트가 이 ref 와 맞는지 본다.
 *
 * 이 상수가 `AGENTS.md` 와 어긋나지 않는지 시험이 확인한다.
 */
export const EXPECTED_PROJECT_REF = 'cggskjxsyrvuhsldgkoj'

/** 기대하는 origin. 이것과 다르면 **접속 전에** 멈춘다 */
export const EXPECTED_ORIGIN = `https://${EXPECTED_PROJECT_REF}.supabase.co`

/**
 * 설정 원천은 **한 곳**이다 — 저장소 **메인 루트**의 `.env.local` (§64).
 *
 * 왜 메인 루트인가: 코드는 Claude 작업트리에 있고 설정파일은 메인 루트에 있다.
 * 디렉터리를 뒤지지 않고, git 메타데이터로 메인 루트를 **한 번에** 정한다.
 *   `<cwd>/.git` 이 디렉터리면  → 거기가 메인 루트
 *   `<cwd>/.git` 이 파일이면    → `gitdir:` 가 가리키는 `.git` 의 부모가 메인 루트
 *                                 (작업트리의 gitdir 은 `<메인>/.git/worktrees/<이름>` 이다)
 *
 * 다른 디렉터리 탐색·자동 키 수집·다른 프로젝트 fallback 을 하지 않는다.
 */
export function resolveEnvFilePath(
  cwd: string,
  fs: { isDir: (p: string) => boolean; isFile: (p: string) => boolean; read: (p: string) => string },
): string | null {
  const sep = '/'
  // Windows 경로를 `/` 로 모으고 끝의 구분자를 떼어낸다
  const norm = (p: string) => p.split('\\').join(sep).replace(/\/+$/, '')
  const dot = norm(cwd) + sep + '.git'
  if (fs.isDir(dot)) return norm(cwd) + sep + '.env.local'
  if (!fs.isFile(dot)) return null
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(fs.read(dot))
  if (m === null) return null
  const gitdir = norm(m[1])
  // `<메인>/.git/worktrees/<이름>` → `<메인>`
  const at = gitdir.lastIndexOf(sep + '.git' + sep)
  if (at >= 0) return gitdir.slice(0, at) + sep + '.env.local'
  if (gitdir.endsWith(sep + '.git')) return gitdir.slice(0, -5) + sep + '.env.local'
  return null
}

/** 종료코드. 성공은 0 하나뿐이다 (§139) */
export const EXIT = {
  ok: 0,
  /** 계획·도움말 모드. 0 이지만 **표본 성공이 아니다** */
  planned: 0,
  configMissing: 2,
  noSource: 3,
  sampleFailed: 4,
  unexpected: 5,
  /** 인자를 알아볼 수 없다. 실행으로 넘어가지 않는다 (§49) */
  badArgs: 6,
} as const

/** 최소한의 원문 모양. 선정 함수가 돌려주는 것 중 여기서 보는 것만 */
export type PickedSource = {
  id: number
  type_code: string | null
  grade: string | null
  image_path: string | null
}

export type Deps = {
  /** 서버용 비영속 클라이언트를 만든다 */
  makeClient: (url: string, key: string) => unknown
  /** 기존 `pickSourceProblems` */
  pickSources: (db: unknown, typeCode: string, limit: number) => Promise<PickedSource[]>
  /** 기존 `checkStorageSample` */
  checkSample: (db: unknown, imagePath: string) => Promise<SampleCheckReport>
  log: (line: string) => void

  // ── 030: 승인된 실행 모드에서만 쓰는 설정 로더 ────────────────────
  /** 현재 작업 폴더. 환경파일 경로를 정하는 데만 쓴다 */
  cwd: () => string
  /** 경로 판별·읽기. `.git` 포인터만 읽고 환경파일 **내용은 읽지 않는다** */
  pathInfo: { isDir: (p: string) => boolean; isFile: (p: string) => boolean; read: (p: string) => string }
  /**
   * 정해진 경로의 환경파일을 `process.env` 로 올린다.
   *
   * Node 내장 `process.loadEnvFile` 을 쓴다 — 새 패키지도, 수제 `.env` 파서도 만들지
   * 않는다 (§63). **이미 있는 셸 값을 덮어쓰지 않는다**(Node 동작. 로컬에서 확인했다).
   */
  loadEnvFile: (path: string) => void
}

/**
 * 실행 모드에서만 쓰는 기본 의존성.
 *
 * `await import` 라서 **이 모듈을 import 하는 것만으로는 SDK 가 불려오지 않는다.**
 * 설치되지 않은 패키지를 자동으로 내려받지 않는다 — 없으면 중단하고 보고한다 (§117).
 */
async function defaultDeps(log: (l: string) => void): Promise<Deps> {
  const [{ createClient }, targets, sample, fs] = await Promise.all([
    import('@supabase/supabase-js'),
    import('../lib/twin/targets'),
    import('../lib/twin/storageSample'),
    import('node:fs'),
  ])
  const statKind = (p: string, want: 'dir' | 'file') => {
    try {
      const st = fs.statSync(p)
      return want === 'dir' ? st.isDirectory() : st.isFile()
    } catch { return false }
  }
  return {
    makeClient: (url, key) => createClient(url, key, {
      // 서버용. 세션을 남기지 않고 자동 갱신도 끈다 (§115)
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    pickSources: (db, typeCode, limit) =>
      targets.pickSourceProblems(db as never, typeCode, limit) as unknown as Promise<PickedSource[]>,
    checkSample: (db, imagePath) => sample.checkStorageSample(db as never, imagePath),
    log,
    cwd: () => process.cwd(),
    pathInfo: {
      isDir: p => statKind(p, 'dir'),
      isFile: p => statKind(p, 'file'),
      // `.git` 포인터만 읽는다. 환경파일 내용은 여기서 읽지 않는다
      read: p => fs.readFileSync(p, 'utf8'),
    },
    // 수제 파서를 만들지 않는다. Node 내장 로더를 쓴다
    loadEnvFile: p => process.loadEnvFile(p),
  }
}

const HELP = [
  '',
  'Storage 표본 1건 점검 — 초안 (GPT-EXEC-029 · 030 보완)',
  '',
  '  ** 지금은 운영 실행 미승인입니다. GPT 검수 뒤 별도 승인을 받고 실행하십니다. **',
  '',
  '무엇을 하나',
  `  ${PILOT_GRADE} 파일럿 첫 유형 ${PILOT_TYPE_CODE} 에서 대상 조건을 만족하는 원문 1건을 고르고,`,
  '  그 문제 이미지 한 장을 실제 SDK 로 읽어 다음을 확인합니다.',
  '    · 이름 정확일치 객체 1개',
  '    · updated_at 이 있고 날짜로 해석되는가',
  '    · ETag 가 eTag / etag 중 어느 키로 오는가 (값은 출력하지 않습니다)',
  '    · 이미지가 읽히고 0바이트가 아닌가',
  '',
  '읽는 범위 — 이보다 더 읽지 않습니다',
  '    · public.problems     선정 함수 1회 · 최대 1행 (answer_text 포함 12개 열이 메모리에 올라옵니다)',
  '    · problem-images 목록  list 1회 (디렉터리 + search 한정, limit 100)',
  '    · problem-images 객체  download 1회',
  '  후보 생성·저장·학생 공개·모델 호출·파이프라인·배포 — 0회입니다.',
  '',
  '실행 — 반드시 로컬 실행기로 띄웁니다 (npx 를 쓰지 않습니다)',
  '  계획만:       node scripts/run-storage-sample.cjs --plan',
  `  승인 뒤에만:  node scripts/run-storage-sample.cjs ${EXECUTE_FLAG}`,
  '',
  '설정 — 키를 명령행·채팅에 적지 마십시오',
  '    NEXT_PUBLIC_SUPABASE_URL       대상 프로젝트 URL',
  '    SUPABASE_SERVICE_ROLE_KEY      서버용 키 (Storage 읽기 권한)',
  '  셸에 이미 있으면 그 값을 씁니다. 없으면 **저장소 메인 루트의 .env.local** 한 곳만 읽습니다.',
  '  (셸 값이 우선입니다. 파일은 비어 있는 자리만 채웁니다.)',
  `  접속할 주소가 ${EXPECTED_ORIGIN} 이 아니면 접속 전에 멈춥니다.`,
  '',
  '  --plan   읽을 범위만 출력하고 끝냅니다 (네트워크·설정파일 0건)',
  '  --help   이 안내',
  '',
].join('\n')

/** 환경변수. `process.env` 도 합성 객체도 받을 수 있게 열어 둔다 */
export type EnvLike = Record<string, string | undefined>

/**
 * 서버 전용 키의 **형식과 용도**를 본다. 값·해독 내용을 어디에도 출력하지 않는다.
 *
 * ── 왜 있나 (032, 원장님 지시) ────────────────────────────────────
 * supabase-js 는 키를 로컬에서 검증하지 않는다. 앞선 라운드에서 가짜 키
 * `syn_fake_key_not_real` 과 **승인된 실제 origin** 이 한 설정에 같이 들어가
 * 운영 주소로 REST 읽기 4회가 나갔다(전부 "Invalid API key" 거절, 0행·0쓰기).
 * origin 검사만으로는 가짜 키 + 진짜 주소 조합을 막지 못한다.
 *
 * ── 033 §101~103 으로 강화한 것 ───────────────────────────────────
 * 032 판은 너무 느슨했다. GPT 가 원본 `readConfig` 에 합성 값을 넣어 확인한 결과
 * 아래가 **전부 수락**됐다:
 *   `sb_publishable_…` (서버용이 아니다) · 임의 40자 · 접미사 없는 `sb_secret_` · `a.b.c`
 * 그래서:
 *   - `sb_publishable_` 와 legacy `anon` 은 **이 서버 경로에서 거부**한다.
 *   - `sb_secret_` 는 접미사 길이·문자종류를 보고 빈/잘린 것을 거부한다.
 *   - **임의 40자 우회를 없앴다.** 알려진 두 형식만 통과한다.
 *   - legacy JWT 는 Base64URL·JSON 구조를 실제로 해독해 `role` 을 확인하고,
 *     프로젝트 식별 claim 이 있으면 기대 프로젝트와 맞는지 본다.
 *     점 세 조각이라는 이유만으로 JWT 로 인정하지 않는다.
 *
 * ── 이 검사가 **아닌** 것 (§103) ──────────────────────────────────
 * 서명 검증이 아니고, 서버에서의 유효성·실제 권한 확인이 아니다.
 * 형식이 맞는 가짜 키는 얼마든지 만들 수 있다. 그래서 합성 시험의 **외부 요청 차단은
 * 따로 둔다.** 이 가드로 "운영 접속 0건"을 보장했다고 말하지 않는다 (§104).
 */
/**
 * 판정 결과.
 *
 * **판별 유니온(`{ok:true}|{ok:false}`)으로 두지 않는다.** 이 저장소는
 * `strictNullChecks` 가 꺼져 있어 그런 유니온이 좁혀지지 않는다 (AGENTS.md 함정 3).
 * 실제로 처음에 유니온으로 썼다가 `shape.code` 에서 TS2339 가 났다.
 * 그래서 **한 가지 모양**으로 두고 `code`/`kind` 를 nullable 로 둔다.
 */
export type KeyShapeVerdict = {
  ok: boolean
  /** 거부 사유 코드. 통과하면 null */
  code: string | null
  /** 통과한 형식. 거부면 null */
  kind: 'sb_secret' | 'legacy_service_role_jwt' | null
}

const keyOk = (kind: KeyShapeVerdict['kind']): KeyShapeVerdict => ({ ok: true, code: null, kind })
const keyBad = (code: string): KeyShapeVerdict => ({ ok: false, code, kind: null })

/** Base64URL 한 조각을 해독해 JSON 으로 읽는다. **내용을 반환·출력하지 않는다** */
function decodeJwtSegment(seg: string): Record<string, unknown> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(seg)) return null
  let text: string
  try {
    text = Buffer.from(seg, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (text === '') return null
  try {
    const v: unknown = JSON.parse(text)
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
    return v as Record<string, unknown>
  } catch {
    return null
  }
}

export function inspectServiceKeyShape(key: string, expectedProjectRef: string): KeyShapeVerdict {
  if (key === '') return keyBad('empty')

  // 서버용이 아닌 키를 먼저 끊는다. 이쪽이 들어오면 RLS 를 우회하지 못해
  // "권한 없음"으로 조용히 0행이 되고, 그것을 데이터가 없다고 오해하게 된다
  if (key.startsWith('sb_publishable_')) return keyBad('publishable_not_server')

  if (key.startsWith('sb_secret_')) {
    const suffix = key.slice('sb_secret_'.length)
    if (suffix === '') return keyBad('sb_secret_truncated')
    if (suffix.length < 20) return keyBad('sb_secret_truncated')
    if (!/^[A-Za-z0-9_-]+$/.test(suffix)) return keyBad('sb_secret_bad_charset')
    return keyOk('sb_secret')
  }

  // legacy JWT (`eyJ...`). 구조를 실제로 해독한다
  const parts = key.split('.')
  if (parts.length === 3) {
    const header = decodeJwtSegment(parts[0])
    const payload = decodeJwtSegment(parts[1])
    if (header === null || payload === null) return keyBad('jwt_not_decodable')
    if (!/^[A-Za-z0-9_-]+$/.test(parts[2]) || parts[2] === '') {
      return keyBad('jwt_bad_signature_segment')
    }
    const role = payload.role
    if (typeof role !== 'string' || role === '') return keyBad('jwt_role_missing')
    if (role === 'anon') return keyBad('anon_not_server')
    if (role !== 'service_role') return keyBad('jwt_role_not_service_role')
    // 프로젝트 식별 claim 이 **있을 때만** 본다. 없으면 없다고 보고하지 않고 넘어간다
    const ref = payload.ref
    if (typeof ref === 'string' && ref !== '' && ref !== expectedProjectRef) {
      return keyBad('jwt_project_mismatch')
    }
    return keyOk('legacy_service_role_jwt')
  }

  // 알려진 형식이 아니다. **길이만 길다고 통과시키지 않는다**
  return keyBad('unknown_format')
}

/**
 * 설정을 읽는다. **값을 돌려주지 않고** 쓸 수 있는지만 판단한다.
 *
 * 030: 형식만 보지 않고 **승인된 프로젝트인지**까지 본다 (§66 · R029-02c).
 * 029 는 `https://<아무것>.supabase.co` 면 통과시켰고, 그래서 서로 다른 두 가짜 프로젝트가
 * 모두 클라이언트 생성까지 도달했다. 이제 origin 이 `EXPECTED_ORIGIN` 과 같아야 한다.
 */
export function readConfig(env: EnvLike): { url: string; key: string } | string {
  const url = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim().replace(/\/+$/, '')
  const key = (env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim()
  if (url === '') return 'NEXT_PUBLIC_SUPABASE_URL 이 없습니다'
  if (key === '') return 'SUPABASE_SERVICE_ROLE_KEY 가 없습니다'
  const shape = inspectServiceKeyShape(key, EXPECTED_PROJECT_REF)
  if (!shape.ok) {
    // 값·해독 내용을 출력하지 않는다. **분류 코드와 길이만** 적는다 (§103)
    return `SUPABASE_SERVICE_ROLE_KEY 가 서버 키 형식이 아닙니다 ` +
      `(사유=${shape.code}, ${key.length}자, 값은 출력하지 않습니다)`
  }
  if (url.toLowerCase() !== EXPECTED_ORIGIN.toLowerCase()) {
    // 어느 주소였는지 출력하지 않는다. 기대값만 적는다
    return `접속할 주소가 승인된 대상(${EXPECTED_ORIGIN})이 아닙니다 (실제 값은 출력하지 않습니다)`
  }
  return { url, key }
}

/**
 * 진입점. 의존성을 주입받으므로 합성 대역으로 시험할 수 있다.
 *
 * 원문 `Error`·stack 을 콘솔로 던지지 않는다 — 키나 경로가 거기서 샌다 (§144).
 */
export async function run(
  argv: string[],
  env: EnvLike,
  deps?: Deps,
): Promise<number> {
  const log = deps?.log ?? ((l: string) => console.log(l))
  const wantsHelp = argv.some(a => (HELP_FLAGS as readonly string[]).includes(a))
  const wantsExecute = argv.includes(EXECUTE_FLAG)
  const known = [EXECUTE_FLAG, ...HELP_FLAGS] as readonly string[]
  const unknown = argv.filter(a => !known.includes(a))

  // 알아볼 수 없는 인자가 있으면 **실행으로 넘어가지 않는다** (§49)
  if (unknown.length > 0) {
    log('[030] 중단: 알아볼 수 없는 인자가 있습니다. 실행하지 않습니다.')
    log('[030] 쓸 수 있는 것: --plan · --help · ' + EXECUTE_FLAG)
    return EXIT.badArgs
  }
  // 도움말·계획과 실행 플래그가 섞였으면 **도움말로 처리한다** (§49)
  if (wantsHelp || !wantsExecute) {
    log(HELP)
    if (wantsHelp && wantsExecute) {
      log('[030] --plan/--help 와 실행 플래그가 함께 왔습니다. **실행하지 않고** 안내만 했습니다.')
    }
    log('[030] 미실행 (계획·도움말 모드). 설정파일·키·네트워크를 건드리지 않았습니다.')
    log('[030] 종료코드 0 은 **표본 성공이 아닙니다.**')
    return EXIT.planned
  }

  // ══════════════════════════════════════════════════════════════════
  // 여기서부터만 설정을 읽는다. 위 분기는 전부 무접속·무설정이다
  // ══════════════════════════════════════════════════════════════════
  let d: Deps
  try {
    d = deps ?? await defaultDeps(log)
  } catch {
    // 패키지를 자동으로 내려받지 않는다. 없으면 멈추고 보고한다 (§48)
    log('[030] 중단: 필요한 패키지를 불러오지 못했습니다 (이 저장소의 의존성 설치 상태를 확인하십니다).')
    return EXIT.configMissing
  }

  // ── 설정 공급: 셸이 우선, 없으면 정해진 한 경로의 환경파일 ───────
  const effective: EnvLike = { ...env }
  const needsFile = (effective.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() === ''
    || (effective.SUPABASE_SERVICE_ROLE_KEY ?? '').trim() === ''
  if (needsFile) {
    let envPath: string | null = null
    try {
      envPath = resolveEnvFilePath(d.cwd(), d.pathInfo)
    } catch {
      envPath = null
    }
    if (envPath === null) {
      log('[030] 중단: 설정파일 위치를 정하지 못했습니다 (저장소 메인 루트를 찾지 못했습니다).')
      log('[030] 다른 폴더를 뒤지지 않습니다. 접속하지 않았습니다.')
      return EXIT.configMissing
    }
    if (!d.pathInfo.isFile(envPath)) {
      log('[030] 중단: 정해진 설정파일이 없습니다 (메인 루트의 .env.local).')
      log('[030] 다른 위치로 넓히지 않습니다. 접속하지 않았습니다.')
      return EXIT.configMissing
    }
    try {
      // Node 내장 로더. 이미 있는 셸 값은 덮어쓰지 않는다
      d.loadEnvFile(envPath)
    } catch {
      log('[030] 중단: 설정파일을 읽지 못했습니다 (원문 오류는 출력하지 않습니다).')
      return EXIT.configMissing
    }
    for (const k of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
      if ((effective[k] ?? '').trim() === '') effective[k] = process.env[k]
    }
    log('[030] 설정: 셸에 없어 메인 루트의 .env.local 에서 채웠습니다 (값은 출력하지 않습니다).')
  } else {
    log('[030] 설정: 셸 환경변수를 씁니다 (값은 출력하지 않습니다).')
  }

  const cfg = readConfig(effective)
  if (typeof cfg === 'string') {
    log(`[030] 중단: ${cfg}`)
    log('[030] 접속하지 않았습니다.')
    return EXIT.configMissing
  }
  log(`[030] 대상 확인: ${EXPECTED_ORIGIN} (저장소에 적힌 프로젝트 ref 와 일치)`)

  let db: unknown
  try {
    db = d.makeClient(cfg.url, cfg.key)
  } catch {
    log('[029] 중단: 클라이언트를 만들지 못했습니다.')
    return EXIT.configMissing
  }

  // ── 1) 원문 1건 선정 — 1회 · 최대 1행 ───────────────────────────
  let picked: PickedSource[]
  try {
    picked = await d.pickSources(db, PILOT_TYPE_CODE, 1)
  } catch {
    log('[029] 중단: 원문 선정 조회가 실패했습니다. 다른 유형으로 넓히지 않습니다.')
    return EXIT.noSource
  }
  if (!Array.isArray(picked) || picked.length === 0) {
    log(`[029] 중단: ${PILOT_TYPE_CODE} 에서 대상 조건을 만족하는 원문이 0건입니다.`)
    log('[029] 표본을 만들지 않고 끝냅니다. 다른 유형으로 자동 확대하지 않습니다.')
    return EXIT.noSource
  }
  if (picked.length > 1) {
    log(`[029] 중단: 1행만 기대했는데 ${picked.length}행이 왔습니다.`)
    return EXIT.noSource
  }

  const src = picked[0]
  // 파일럿 범위와 맞는지 진입점에서 확인한다. 새 필터 정책을 만들지 않는다 (§130)
  if (src.type_code !== PILOT_TYPE_CODE || src.grade !== PILOT_GRADE) {
    log('[029] 중단: 고른 원문의 유형·과정이 파일럿과 다릅니다.')
    log(`[029] 기대 ${PILOT_GRADE} / ${PILOT_TYPE_CODE}`)
    return EXIT.noSource
  }
  const imagePath = (src.image_path ?? '').trim()
  if (imagePath === '') {
    log('[029] 중단: 고른 원문에 image_path 가 없습니다.')
    return EXIT.noSource
  }
  // 정답·전체 경로를 출력하지 않는다. id 는 표본을 다시 가리키는 데 필요한 최소 정보다
  log(`[029] 표본 선정: problems.id=${src.id} · 유형 ${src.type_code} · 과정 ${src.grade}`)

  // ── 2·3) 목록 1회 + 다운로드 1회 ────────────────────────────────
  let report: SampleCheckReport
  try {
    report = await d.checkSample(db, imagePath)
  } catch {
    log('[029] 중단: 표본 점검에서 예상 밖 오류가 났습니다 (원문 오류는 출력하지 않습니다).')
    return EXIT.unexpected
  }

  log(`[029] ${formatSampleReport(report)}`)
  if (!report.ok) {
    log('[029] 표본 점검 실패. D-091 에 따라 모델 스모크와 대량 생성은 계속 금지입니다.')
    return EXIT.sampleFailed
  }

  log('[029] 표본 점검 통과. **이것이 유료 스모크 승인은 아닙니다** — 결과를 GPT 검수에 올립니다.')
  return EXIT.ok
}

// 직접 실행했을 때만 돈다. import 로는 아무것도 하지 않는다
if (require.main === module) {
  run(process.argv.slice(2), process.env)
    .then(code => { process.exitCode = code })
    .catch(() => {
      // 원문 오류·stack 을 밖으로 내보내지 않는다
      console.log('[029] 중단: 예상 밖 오류가 났습니다.')
      process.exitCode = EXIT.unexpected
    })
}
