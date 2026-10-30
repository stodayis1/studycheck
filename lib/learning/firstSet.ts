/**
 * 첫 학습 세트의 **고정 영상 후보** — GPT_VIDEO_MAP_044_RESULT §4
 *
 * 왜 고정 id 로 바꾸는가 — **내가 만든 버그를 고치는 것이다**
 *   `READONLY_LEARNING_CONTENT_043.sql` 과 아래 `supabaseContent.loadVideos()` 는
 *   두 유형의 결과를 **합쳐** `order_label` 로 정렬한 뒤 `LIMIT 3` 을 걸었다.
 *   그래서 `02…` 로 시작하는 `공수1-01-02` 영상이 앞을 다 차지하고
 *   `03…` 인 `공수1-01-07` 후보가 **밀려났다.**
 *
 *   나는 그 결과를 보고 「01-07 영상이 없다 / 태그가 안 달렸다」고 보고했다. **틀렸다.**
 *   01-07 에는 영상이 **4편** 달려 있었다 (개념 1 · 증명 1 · 대표예제 2).
 *   원인은 자료가 아니라 **전역 상한을 건 조회 방식**이었다. (044 §2·§3)
 *
 *   그래서 이제 정렬·상한으로 고르지 않고 **유형별 대표를 고정 id 로** 집는다.
 *   전체 상한 3편은 그대로 지킨다.
 *
 * 이 목록이 뜻하지 **않는** 것 (044 §4 가 못 박은 것)
 *   「연결 검토 우선순위」일 뿐 **운영 공개·노출 안전 승인 목록이 아니다.**
 *   제목·장면 이름만으로 내용 적합성을 통과시키지 않는다.
 */

/** 그렇다 / 아니다 / **모름**. 모름을 `false` 와 섞지 않는다 (044 §6-3) */
export type ReviewState = 'yes' | 'no' | 'unknown'

export type FirstSetVideo = {
  /** 044 §4 가 준 우선순위 */
  priority: 1 | 2 | 3
  /** 이 영상이 대표하는 유형. **유형별 최소 한 편**을 보장하려고 둔다 */
  targetTypeCode: string
  videoId: string
  title: string
  /** `lesson_videos.kind` 그대로 */
  kind: '개념' | '증명' | '대표예제'
  orderLabel: string
  durationSeconds: number
  /**
   * 다섯 가지를 **각각** 적는다. 하나로 합치지 않는다 (044 §6-3).
   *
   *   assetExists       `youtube_id` 에 식별값이 있는가 — 목록조회로 **알고 있다**
   *   playbackVerified  실제로 재생되는가 — **확인 못 했다**
   *   studentAccess     학생이 과제로 열 수 있는가 — **확인 못 했다**
   *   exposureReviewed  이 원문에 보여도 답이 드러나지 않는가 — **검수 기록 없음**
   *   confirmItemsReady 확인 행동으로 낼 검수된 항목이 있는가 — **없다**
   */
  status: {
    assetExists: ReviewState
    playbackVerified: ReviewState
    studentAccess: ReviewState
    exposureReviewed: ReviewState
    confirmItemsReady: ReviewState
  }
  /** 장면 **이름만**. 시작·끝 초는 044 결과에 없다 — 임의로 만들지 않는다 (044 §4) */
  sceneLabels: string[]
  note?: string
}

/** 전체 상한. 044 §4 가 유지하라고 한 값 */
export const MAX_FIRST_SET_VIDEOS = 3

/** 아직 모르는 네 칸. `assetExists` 만 후보별로 다르다 */
const UNKNOWN_REVIEW = {
  playbackVerified: 'unknown',
  studentAccess: 'unknown',
  exposureReviewed: 'unknown',
  confirmItemsReady: 'no',
} as const

export const FIRST_SET_VIDEOS: readonly FirstSetVideo[] = [
  {
    priority: 1,
    targetTypeCode: '공수1-01-02',
    videoId: '350b973a-46f6-4dee-981e-0143f8312423',
    title: '필수예제 02 다항식의 전개식에서 계수 구하기',
    kind: '대표예제',
    orderLabel: '02-풀이01',
    durationSeconds: 86.296,
    status: { assetExists: 'yes', ...UNKNOWN_REVIEW },
    sceneLabels: ['필수예제 02번!', '다 전개하지 마!', '필요한 짝만 곱하기',
                  '네제곱은 어떤 짝?', '부호까지 같이 곱하기'],
    note: '필요한 짝·항을 고르는 도움. **원문 동일성과 답 노출**을 구분해 검수해야 한다 (044 §4)',
  },
  {
    priority: 2,
    targetTypeCode: '공수1-01-07',
    videoId: '8e59d4bc-1e4f-4e65-b056-40c948da4fd8',
    title: '곱셈 공식의 변형',
    kind: '개념',
    orderLabel: '03',
    durationSeconds: 175.867,
    status: { assetExists: 'yes', ...UNKNOWN_REVIEW },
    sceneLabels: ['오늘 배울 개념', '개념 ① 곱셈 공식의 변형', '개념 ① 변형 ⑷ ⑸ · 참고',
                  '개념 Plus ⑷ 유도 과정', '개념 Check', '개념 Check 정답', '이어서 풀 필수예제'],
    note: '순번6 「개념 Check 정답」 장면이 있다 — 이 영상 안의 확인 문제를 본 뒤 같은 문제를 맞힌 것을 '
        + '**독립 확인 성공으로 보지 않는다** (044 §4). 다만 그 장면이 지금 원문의 답이라는 뜻은 '
        + '아니므로 영상 전체를 일괄 금지하지도 않는다. 먼저 볼 장면은 순번2·순번3 이다.',
  },
  {
    priority: 3,
    targetTypeCode: '공수1-01-07',
    videoId: '58671e09-3268-45b1-895a-34f3fca3eaaa',
    title: '곱셈 공식의 변형 (4) 유도',
    kind: '증명',
    orderLabel: '03-증명1',
    durationSeconds: 137.425,
    status: { assetExists: 'yes', ...UNKNOWN_REVIEW },
    sceneLabels: ['변형 (4)를 직접 만들자!', '왜 2배를 할까?', '2배 하고 1/2 곱하기',
                  '제곱을 하나씩 나눠 주자', '완전제곱식으로 묶기', '부호만 바꾸면?',
                  '2배 → 나눠 쓰기 → 묶기'],
    note: '이유·유도 도움 후보. 해당 원문의 요구와 **영상 전체 전달 노출 검수**가 필요하다',
  },
]

/**
 * 3번 자리를 **대체**할 수 있는 후보. 네 번째로 **더하는 것이 아니다** (044 §4).
 * 지금 원문에 더 맞는 접근을 설명하는 경우에만 바꾼다.
 */
export const SLOT3_REPLACEMENT: FirstSetVideo = {
  priority: 3,
  targetTypeCode: '공수1-01-07',
  videoId: 'e5b46da8-624e-47f0-9e9d-3cf8297a3cc1',
  title: '필수예제 07 곱셈 공식의 변형-문자가 3개인 경우 ⑵',
  kind: '대표예제',
  orderLabel: '03-풀이03',
  durationSeconds: 105.039,
  status: { assetExists: 'yes', ...UNKNOWN_REVIEW },
  sceneLabels: ['필수예제 07번!', '차를 세 개 만들기', '차의 제곱으로 바꾸기', '값 넣어서 계산',
                '합에서 하나 빼기', '일차식 세 개의 곱', 'abc 부호 조심'],
  note: '3번 자리 **대체** 후보다. 기본 3편에 네 번째로 붙이지 않는다',
}

/**
 * 지금은 쓰지 않는 후보. **지우거나 다른 것으로 자동 대체하지 않는다.**
 *
 * `youtube_id` 가 비어 있다는 것은 **그 열에 식별값이 없다**는 뜻이지,
 * 제작 파일이 없다는 뜻이 아니다 (044 §2). 제작을 다시 요구하지 않고,
 * 내용을 확인하지 않은 채 필수예제07 로 **무조건 대체하지도 않는다** —
 * 같은 유형이라도 세부 풀이 전략이 다를 수 있다 (044 §2).
 */
export const HELD_PENDING_SOURCE: FirstSetVideo = {
  priority: 3,
  targetTypeCode: '공수1-01-07',
  videoId: '2d8deba8-b3e9-4e05-95de-860511be4225',
  title: '필수예제 06 곱셈 공식의 변형-문자가 3개인 경우 ⑴',
  kind: '대표예제',
  orderLabel: '03-풀이02',
  durationSeconds: 90.829,
  status: { assetExists: 'no', ...UNKNOWN_REVIEW },
  sceneLabels: ['필수예제 06번!', '먼저 혼자 풀어 봐', '제곱의 합 공식', '3abc 공식!',
                '6을 그대로 넣기', '세 값만 알면 끝'],
  note: '`youtube_id` 열에 식별값이 없다. **제작 파일이 없다는 뜻이 아니다.** 상태로만 남긴다',
}

/** 고정 후보의 id 순서 — 조회에서 이 순서를 그대로 지킨다 */
export const FIRST_SET_VIDEO_IDS: readonly string[] =
  FIRST_SET_VIDEOS.map((v) => v.videoId)

/** 조회한 `lesson_videos` 행에서 **고르는 데 쓰는 칸만** */
export type VideoRowLike = { id: string; order_label?: string | null }

/**
 * 첫 세트 영상 **고르기** — 조회와 떼어 둔 순수 함수.
 *
 * 왜 떼어 두나 — 운영 DB 에 붙지 않고도 **이 규칙을 시험할 수 있어야** 한다.
 * 044 §3 이 지적한 「합쳐 정렬 뒤 앞 3편」 방식과 **달라야** 하고, 그 차이를
 * 시험이 재서 보여야 한다.
 *
 * 규칙
 *   · 고정 목록의 **우선순위 순서**로 돈다. 조회 결과의 순서를 믿지 않는다
 *   · 조회되지 않은 후보 자리는 **다른 영상으로 메우지 않는다** — `missing` 에 남긴다
 *   · 전체 상한 3편을 지킨다
 *   · 목록에 없는 행은 **버린다** (상한을 몰래 넓히지 않는다)
 */
export function selectFirstSetVideos<T extends VideoRowLike>(
  rows: readonly T[],
  want: readonly FirstSetVideo[] = FIRST_SET_VIDEOS,
): { picked: Array<{ want: FirstSetVideo; row: T }>; missing: FirstSetVideo[] } {
  const byId = new Map<string, T>()
  for (const r of rows) byId.set(String(r.id), r)

  const picked: Array<{ want: FirstSetVideo; row: T }> = []
  const missing: FirstSetVideo[] = []
  for (const w of [...want].sort((a, b) => a.priority - b.priority)) {
    if (picked.length >= MAX_FIRST_SET_VIDEOS) break
    const row = byId.get(w.videoId)
    if (row === undefined) { missing.push(w); continue }
    picked.push({ want: w, row })
  }
  return { picked, missing }
}

/** 유형별로 **최소 한 편**씩 들어 있는가. 전역 상한이 냈던 구멍을 막는 검사 */
export function coversEveryType(types: readonly string[]): boolean {
  return types.every((t) => FIRST_SET_VIDEOS.some((v) => v.targetTypeCode === t))
}

/** 어느 한 칸이라도 아직 모르면 학생에게 내보낼 수 없다 */
export function readyForStudents(v: FirstSetVideo): boolean {
  const s = v.status
  return s.assetExists === 'yes'
    && s.playbackVerified === 'yes'
    && s.studentAccess === 'yes'
    && s.exposureReviewed === 'yes'
    && s.confirmItemsReady === 'yes'
}

/** 아직 모르거나 아닌 칸의 이름. 보고서에 「무엇이 안 끝났나」로 적는다 */
export function pendingChecks(v: FirstSetVideo): string[] {
  const label: Record<keyof FirstSetVideo['status'], string> = {
    assetExists: '자료 존재',
    playbackVerified: '재생 성공',
    studentAccess: '과제 접근',
    exposureReviewed: '노출 검수',
    confirmItemsReady: '확인문제 적합성',
  }
  const out: string[] = []
  for (const k of Object.keys(label) as Array<keyof FirstSetVideo['status']>) {
    if (v.status[k] !== 'yes') out.push(label[k])
  }
  return out
}
