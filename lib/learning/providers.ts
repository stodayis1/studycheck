/**
 * 콘텐츠·인증을 **어디서 가져오는가** — GPT-EXEC-043 §3-A · §3-B
 *
 * 왜 층을 두나
 *   지금까지 `catalog.ts` 의 **상수**가 곧 콘텐츠였다. 운영 자료를 붙이려면
 *   조회로 바뀌어야 하는데, 화면·엔진이 그걸 몰라야 한다.
 *
 * 지키는 선 (043 §3-A·§3-B)
 *   · **운영 모드에서 시연 카탈로그로 자동 fallback 하지 않는다.**
 *     설정이 없으면 조용히 되돌아가지 않고 **연결 오류**를 낸다.
 *   · 정답·해설은 **서버 채점에만.** provider 가 학생용 모양으로 내보낼 때 뺀다.
 *   · 승인된 두 유형 / 최대 10문항 / 최대 3영상만 쓴다.
 *   · 영상 0편이면 **없다고 표시**하고 검수된 카드·문항으로 간다.
 *     미검수 카드를 임의로 만들지 않는다.
 *   · 영상↔유형 연결의 **단일 출처는 `lesson_videos`** 다. 새 표에 다시 적지 않는다.
 *
 * 지금 상태
 *   `demo` provider 는 돈다. `supabase` provider 는 **작성했고 실행하지 않았다** —
 *   운영 조회 승인(043 §4 A-실제앱)이 아직 없다.
 */
import type { ApprovedRelation } from '@/lib/twin/learningPreview'

import { learningMode } from './mode'
import type { CatalogAsset, CatalogProblem } from './catalog'
import type { StudentRow } from './contract'

// ════════════════════════════════════════════════════════════════════
// 콘텐츠
// ════════════════════════════════════════════════════════════════════

/** 첫 세트의 범위. 043 §4 가 승인한 그대로다 — 넓히려면 다시 승인받는다 */
export const FIRST_SET = {
  typeCodes: ['공수1-01-02', '공수1-01-07'] as const,
  maxProblems: 10,
  maxProblemsPerType: 5,
  maxVideos: 3,
} as const

export type ContentSource = 'demo' | 'supabase'

export type TypeInfo = {
  typeCode: string
  grade: string
  chapter: string
  title: string
  source: ContentSource
}

/**
 * 첫 세트 영상 한 편의 **검수 상태** — 044 §6-3
 *
 * 다섯 칸을 **각각** 적는다. 하나로 합치거나 모르는 칸을 `true` 로 채우지 않는다.
 * `'unknown'` 은 **아직 확인 못 했다**는 뜻이고 `'no'` 와 다르다 — 보고에서도 가른다.
 */
export type VideoReadiness = {
  videoId: string
  title: string
  /** 이 영상이 대표하는 유형. 전역 상한이 유형을 밀어내지 않았는지 보는 칸 */
  targetTypeCode: string
  priority: number
  /** 고정 id 로 조회했을 때 **행이 나왔는가**. 없으면 아래 `assetExists` 는 모름이다 */
  fetched: boolean
  /** `youtube_id` 에 식별값이 있는가. **재생 성공의 증거가 아니다** (044 §2) */
  assetExists: 'yes' | 'no' | 'unknown'
  /** 실제로 재생되는가 */
  playbackVerified: 'yes' | 'no' | 'unknown'
  /** 학생이 과제로 열 수 있는가 */
  studentAccess: 'yes' | 'no' | 'unknown'
  /** 이 원문에 보여도 답이 드러나지 않는가 */
  exposureReviewed: 'yes' | 'no' | 'unknown'
  /** 확인 행동으로 낼 **검수된** 항목이 있는가 */
  confirmItemsReady: 'yes' | 'no' | 'unknown'
  /** 고정 목록에 적어 둔 `assetExists` 와 지금 읽은 값이 **다른가** */
  assetExistsDisagrees: boolean
}

export interface ContentProvider {
  readonly source: ContentSource
  /** 첫 세트의 유형 (최대 2개) */
  listTypes(): Promise<TypeInfo[]>
  /** 첫 세트의 문항 (최대 10개). **정답을 포함한 서버용 모양** */
  listProblems(): Promise<CatalogProblem[]>
  /** 첫 세트의 자산 (영상 최대 3편 + 검수된 카드·문항) */
  listAssets(): Promise<CatalogAsset[]>
  /** 한 원문에 승인된 관계들 */
  relationsFor(problemId: string): Promise<ApprovedRelation[]>
  /**
   * 영상이 **0편**인가. 0편이면 화면에 그대로 적고 카드로 간다.
   * 「없음」을 「아직 못 읽음」과 섞지 않는다.
   */
  videoCount(): Promise<number>
  /**
   * 첫 세트 영상의 검수 상태 (044 §6-3).
   *
   * **시연 provider 에는 없다.** 시연 자료의 검수 상태를 꾸며 내지 않기 위해
   * 선택으로 둔다 — 없으면 보고에 「운영 provider 가 아니라 해당 없음」으로 적는다.
   */
  videoReadiness?(): Promise<VideoReadiness[]>
}

// ════════════════════════════════════════════════════════════════════
// 인증
// ════════════════════════════════════════════════════════════════════

export type AuthSource = 'demo' | 'supabase'

/**
 * 막아야 하는 사유.
 *
 * 045 §3 (R045-04 §7.3) 로 두 가지가 늘었다 — **못 읽은 것과 없는 것을 가른다.**
 *   `lookup_failed`    조회가 **실패**했다. 「학생 없음」이 아니다
 *   `inactive_student` 학생 행은 있지만 **활성이 아니다** (퇴원 등)
 */
export type StudentDenyReason =
  | 'no_session' | 'unknown_student' | 'demo_disabled' | 'not_configured'
  | 'lookup_failed' | 'inactive_student'

export type ResolvedStudent = {
  student: StudentRow | null
  /** 막아야 하면 사유. 통과면 null */
  deny: StudentDenyReason | null
  /** 어디서 확인했는지 — 보고에 그대로 적는다 */
  source: AuthSource
  /** 운영에서 **어느 칸으로** 찾았는가. 셋을 섞지 않았음을 보이려고 남긴다 */
  matchedBy?: 'session_uid' | 'user_id'
}

export interface StudentAuthProvider {
  readonly source: AuthSource
  /**
   * 요청에서 **학생을 확정**한다.
   *
   * client 가 보낸 학생 id 를 쓰지 않는다. `session_uid` · `user_id` · `student_id` 를
   * 섞지 않는다 — 운영에서는 익명 auth uid(`session_uid`)로 `students` 를 찾는다.
   */
  resolve(req: Request): Promise<ResolvedStudent>
}

// ════════════════════════════════════════════════════════════════════
// 고르기 — **자동 fallback 없음**
// ════════════════════════════════════════════════════════════════════

/**
 * 지금 모드에 맞는 콘텐츠 출처.
 *
 * 운영인데 설정이 없으면 **던진다.** 시연 자료로 조용히 넘어가지 않는다.
 */
export async function contentProvider(): Promise<ContentProvider> {
  if (learningMode() === 'local_demo') {
    const { demoContentProvider } = await import('./demoContent')
    return demoContentProvider
  }
  const { supabaseContentProvider } = await import('./supabaseContent')
  return supabaseContentProvider()
}

export async function studentAuthProvider(): Promise<StudentAuthProvider> {
  if (learningMode() === 'local_demo') {
    const { demoStudentAuth } = await import('./demoAuth')
    return demoStudentAuth
  }
  const { supabaseStudentAuth } = await import('./supabaseAuth')
  return supabaseStudentAuth()
}

/** 운영 설정이 없을 때 쓰는 오류. 시연으로 넘어가지 않는다는 것을 글로 남긴다 */
export class NotConfiguredError extends Error {
  readonly notConfigured = true
  constructor(what: string) {
    super(`${what} 운영 설정이 없습니다. 시험 자료로 대신하지 않습니다 (EXEC-043 §3-A).`)
    this.name = 'NotConfiguredError'
  }
}
