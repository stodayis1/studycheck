/**
 * 운영 콘텐츠 조회 어댑터 — GPT-EXEC-043 §3-A · GPT_VIDEO_MAP_044_RESULT §6-2
 *
 * ⚠️ **작성만 했고 실행하지 않았다.**
 *   운영 조회 승인(043 §4 「A-실제 앱의 운영 접근」)이 아직 없다.
 *   이 파일은 아직 **한 번도 운영 DB 에 붙은 적이 없다.** 타입검사와
 *   합성 대역 시험만 거쳤다. 「연결됐다」고 보고하지 않는다.
 *
 * 범위 — `OPS_REQUEST` 와 **같게** 좁힌다
 *   · 유형 2개 고정 (`FIRST_SET.typeCodes`)
 *   · 문항: 유형별 비서술형 + 원문 이미지 + 정답 있는 것, id 오름차순 5개씩, 총 10개
 *   · 영상: **고정 id 3편** (`firstSet.ts`). 정렬+전역 상한으로 고르지 **않는다**
 *   · **학생·학부모 자료를 읽지 않는다**
 *
 * 영상 고르는 방식이 바뀐 이유 (044 §3)
 *   전에는 두 유형을 **합쳐** `order_label` 로 정렬한 뒤 `LIMIT 3` 이었다.
 *   그러면 `02…` 영상이 앞을 다 차지해 `공수1-01-07` 후보가 **밀려난다.**
 *   유형별 대표를 한 편도 보장하지 못하는 구조였다. 지금은 고정 id 로 집는다.
 *
 * 정답
 *   `answer_text` 는 **서버 채점에만** 쓴다. `forStudent()` 가 학생 payload 에서 빼고,
 *   로그·검수 묶음에 넣지 않는다 (043 §3-A).
 *
 * 영상↔유형 연결
 *   **단일 출처는 `lesson_videos.type_codes`** 다. 새 표에 다시 적지 않는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

import type { ApprovedRelation } from '@/lib/twin/learningPreview'

import type { CatalogAsset, CatalogProblem } from './catalog'
import {
  FIRST_SET_VIDEO_IDS, selectFirstSetVideos,
  type FirstSetVideo, type ReviewState,
} from './firstSet'
import { autoGradable } from './grading'
import {
  FIRST_SET,
  type ContentProvider, type TypeInfo, type VideoReadiness,
} from './providers'
import { learningClient } from './supabaseClient'

/**
 * 영상 한 장면. `lesson_videos.scenes` 의 모양.
 *
 * 값이 **무엇이든 올 수 있다**는 전제로 읽는다 — `null` · `''` · `true` 가 들어 있을 수 있다.
 * 그래서 `unknown` 으로 받아 아래 `sceneSeconds()` 가 검사한다 (R045-04 §7.4).
 */
type RawScene = { start?: unknown; end?: unknown; label?: unknown; kind?: unknown }

/**
 * 장면의 시작·끝 초. **숫자가 아니면 `null`** 이다.
 *
 * 전에는 `Number.isFinite(Number(scene.start))` 로 봤다. 그러면 `null` 과 `''` 가
 * **0 으로 바뀌어** 통과하고, GPT 탐침 P07 에서 `start:null, end:null` 이
 * `0–0` 구간으로 만들어졌다. `true` 도 1 이 된다.
 *
 * 지금은 ① 자료형이 `number` 인가 ② 유한한가 ③ `0 <= start < end` 인가
 * ④ (영상 길이를 알면) `end <= duration` 인가 를 **각각** 본다.
 * 하나라도 아니면 구간을 **만들지 않는다** — 0 으로 채우지 않는다.
 */
export function sceneSeconds(
  scene: RawScene | undefined, durationSeconds: number | null,
): { startSeconds: number; endSeconds: number } | null {
  if (scene === undefined || scene === null) return null
  const { start, end } = scene
  if (typeof start !== 'number' || typeof end !== 'number') return null
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  if (start < 0) return null
  if (!(start < end)) return null
  if (durationSeconds !== null && Number.isFinite(durationSeconds) && end > durationSeconds) return null
  return { startSeconds: start, endSeconds: end }
}

function client(): SupabaseClient {
  // 설정이 없으면 **시연으로 넘어가지 않고** 멈춘다 (`learningClient` 가 던진다)
  return learningClient('콘텐츠 조회')
}

const TYPES = [...FIRST_SET.typeCodes]

export function supabaseContentProvider(): ContentProvider {
  // 한 요청 안에서 여러 번 부르므로 한 번 읽은 것은 들고 있는다
  let problemsCache: CatalogProblem[] | null = null
  let assetsCache: CatalogAsset[] | null = null
  let readinessCache: VideoReadiness[] | null = null

  async function loadProblems(): Promise<CatalogProblem[]> {
    if (problemsCache !== null) return problemsCache
    const db = client()
    const out: CatalogProblem[] = []
    // 유형별로 따로 읽어 **유형당 상한**을 지킨다
    for (const code of TYPES) {
      const { data, error } = await db
        .from('problems')
        .select('id, type_code, grade, book, local_no, page_no, difficulty, is_essay, answer_kind, answer_text, image_path, answer_image_path')
        .eq('type_code', code)
        .eq('is_essay', false)
        .not('image_path', 'is', null)
        .not('answer_text', 'is', null)
        .order('id', { ascending: true })
        .limit(FIRST_SET.maxProblemsPerType)
      if (error) throw new Error(`문항 조회 실패 (${code}): ${error.message}`)
      for (const r of data ?? []) {
        const kind = (r.answer_kind === 'choice' || r.answer_kind === 'number') ? r.answer_kind : 'image'
        const p: CatalogProblem = {
          problemId: String(r.id),
          typeCode: String(r.type_code),
          // 첫 자동판은 서술형을 넣지 않는다 (043 §3-A)
          taskGoal: 'solve',
          stem: '',                       // 본문은 그림이다. 아래 imagePath 로 그린다
          choices: null,
          answer: String(r.answer_text ?? ''),
          provenance: 'operational',
          answerKind: kind,
          isEssay: Boolean(r.is_essay),
          imagePath: r.image_path === null ? null : String(r.image_path),
          answerImagePath: r.answer_image_path === null ? null : String(r.answer_image_path),
          localNo: r.local_no === null ? null : String(r.local_no),
          book: r.book === null ? null : String(r.book),
        }
        // 자동 채점이 안 되는 것은 첫 세트에 넣지 않는다
        if (!autoGradable({ answerKind: kind, answerText: p.answer, isEssay: p.isEssay })) continue
        out.push(p)
      }
    }
    problemsCache = out.slice(0, FIRST_SET.maxProblems)
    return problemsCache
  }

  /**
   * 첫 세트 영상 — **고정 id 로만** 읽는다 (044 §6-2).
   *
   * 여기서 정렬·상한으로 고르지 않는다. 그 방식이 유형 하나를 통째로
   * 밀어냈기 때문이다 (044 §3). 우선순위는 `FIRST_SET_VIDEOS` 가 정하고
   * 전체 상한 3편은 그대로 지킨다.
   *
   * 후보가 하나라도 조회되지 않으면 **다른 영상으로 메우지 않는다.**
   * 그 자리는 비워 두고 `videoReadiness()` 가 「조회 안 됨」으로 적는다.
   */
  async function loadVideos(): Promise<CatalogAsset[]> {
    if (assetsCache !== null) return assetsCache
    const db = client()
    const { data, error } = await db
      .from('lesson_videos')
      .select('id, grade, kind, order_label, title, chapter, sub_chapter, book, youtube_id, duration_seconds, scenes, type_codes, is_active')
      .in('id', [...FIRST_SET_VIDEO_IDS])
      .eq('is_active', true)
    if (error) throw new Error(`영상 조회 실패: ${error.message}`)

    // 고르는 규칙은 `firstSet.selectFirstSetVideos` 하나뿐이다 — 여기서 또 정렬하지 않는다
    const rows: Array<Record<string, unknown> & { id: string }> = (data ?? [])
      .map((r) => ({ ...(r as Record<string, unknown>), id: String(r.id) }))
    const { picked, missing } = selectFirstSetVideos(rows)

    const assets: CatalogAsset[] = []
    const readiness: VideoReadiness[] = []

    // 조회되지 않은 자리는 **메우지 않는다.** 그대로 「조회 안 됨」으로 남긴다
    for (const want of missing) readiness.push(readinessOf(want, null))

    for (const { want, row } of picked) {
      const youtubeId = row.youtube_id === null || row.youtube_id === undefined
        ? '' : String(row.youtube_id).trim()
      assets.push({
        assetId: String(row.id),
        assetVersion: 1,
        kind: 'video',
        videoKind: row.kind === '증명' ? 'proof' : (row.kind === '대표예제' ? 'worked_example' : 'concept'),
        title: String(row.title ?? ''),
        // 유튜브 id 는 **화면에서 필요할 때만** 쓴다. 조회 결과를 밖으로 내보내지 않는다
        src: youtubeId === '' ? null : `https://www.youtube.com/embed/${youtubeId}`,
        body: null,
        durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
          ? null : Number(row.duration_seconds),
        // 043 §3-C — 파일 전체 전달 안전 여부는 **검수 기록**이 정한다.
        // 아직 그 기록이 없으므로 **빈 배열**이다 → 영상은 구간이 있어도 쓰이지 않는다
        wholeFileSafeFor: [],
        provenance: 'operational',
        scenes: Array.isArray(row.scenes) ? (row.scenes as CatalogAsset['scenes']) : [],
        // 개념03·증명03 은 `type_codes` 에 같은 유형이 **두 번** 들어 있다.
        // 세는 자리에서만 중복을 지운다 — 운영 데이터를 고치지 않는다 (044 §5)
        typeCodes: Array.isArray(row.type_codes)
          ? [...new Set((row.type_codes as string[]).map(String))] : [],
      })
      readiness.push(readinessOf(want, youtubeId === '' ? 'no' : 'yes'))
    }

    assetsCache = assets
    readinessCache = readiness
    return assetsCache
  }

  return {
    source: 'supabase',

    async listTypes(): Promise<TypeInfo[]> {
      const db = client()
      const { data, error } = await db
        .from('standard_types')
        .select('code, grade, chapter_title, sub_chapter_title, type_title, sort_order')
        .in('code', TYPES)
        .order('sort_order', { ascending: true })
        .limit(TYPES.length)
      if (error) throw new Error(`유형 조회 실패: ${error.message}`)
      return (data ?? []).map((t) => ({
        typeCode: String(t.code),
        grade: String(t.grade ?? ''),
        chapter: String(t.chapter_title ?? ''),
        title: String(t.type_title ?? ''),
        source: 'supabase' as const,
      }))
    },

    listProblems: loadProblems,
    listAssets: loadVideos,

    async videoCount(): Promise<number> {
      const videos = await loadVideos()
      return videos.length
    },

    /**
     * 다섯 칸을 **각각 실제 상태로** 돌려준다 (044 §6-3).
     * 모르는 검수를 `true` 로 채우지 않는다.
     */
    async videoReadiness(): Promise<VideoReadiness[]> {
      if (readinessCache === null) await loadVideos()
      return readinessCache ?? []
    },

    /**
     * 승인된 관계 — **여기서 만들지 않는다.** 항상 빈 배열이다.
     *
     * 043·044 에서는 「영상의 `type_codes` 에 이 원문의 유형이 있으면 관계를 만들고
     * 검수 칸을 false 로 둔다」였다. 그러면 **승인되지 않은 관계가 목록에 생긴다** —
     * 지금은 `disqualify` 가 전부 막아 주지만, 막아 주는 것에 기대는 모양이다.
     *
     * 045 §4 는 승인 입력을 **서버 전용 버전 있는 명세**로 정했다. 그래서 관계의
     * 단일 출처는 `approval.ts` 다 (`operationalDeps.operationalContentSnapshot`).
     * 유형이 겹친다는 사실만으로는 관계가 **생기지 않는다.**
     *
     * 이 provider 는 조회만 한다 — 문항 · 영상 · 유형. 승인은 읽지 않는다.
     */
    async relationsFor(): Promise<ApprovedRelation[]> {
      return []
    },
  }
}

/**
 * 한 후보의 다섯 칸을 **실제 상태**로 적는다.
 *
 * `assetExistsNow` 는 조회한 행의 `youtube_id` 에서 온다 — 고정 목록에 적힌
 * 값보다 **지금 읽은 값이 우선**이다. 조회 자체를 못 했으면 `unknown` 이다.
 * 나머지 네 칸은 운영에 검수 기록이 없으므로 아직 모른다. 채우지 않는다.
 */
function readinessOf(want: FirstSetVideo, assetExistsNow: ReviewState | null): VideoReadiness {
  return {
    videoId: want.videoId,
    title: want.title,
    targetTypeCode: want.targetTypeCode,
    priority: want.priority,
    fetched: assetExistsNow !== null,
    assetExists: assetExistsNow ?? 'unknown',
    // 아래 네 칸은 **검수 기록이 생길 때만** 바뀐다
    playbackVerified: want.status.playbackVerified,
    studentAccess: want.status.studentAccess,
    exposureReviewed: want.status.exposureReviewed,
    confirmItemsReady: want.status.confirmItemsReady,
    // 고정 목록이 적어 둔 값과 **지금 읽은 값이 다르면** 그 사실을 남긴다
    assetExistsDisagrees: assetExistsNow !== null && assetExistsNow !== want.status.assetExists,
  }
}
