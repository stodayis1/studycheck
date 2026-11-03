/**
 * 서버측 **검수·배정 자료** — GPT-EXEC-041 §3
 *
 * 왜 서버에 두는가
 *   열람 가능 여부(`reachableByStudent`)와 답 노출 판단(`exposureReview`)을
 *   **client 가 보낸 참/거짓으로 정하지 않는다** (040 리뷰 §3 R040-C).
 *   여기 적힌 것만 학생에게 나간다.
 *
 * 무엇이 실제이고 무엇이 시연인가 — **섞지 않는다**
 *   - 유형 코드·유형 이름·단원: `PILOT_TYPES_014.json` 의 **실제 로컬 자료** (`local_real`)
 *   - 문제 지문·정답·영상·개념카드·확인 항목: 이번 시범용 **시연** (`demo`)
 *     운영 문항(`problems`)과 운영 영상(`lesson_videos`)은 운영 DB 에 있고
 *     이번 작업은 운영 DB 를 읽지 않는다 (EXEC-041 §5).
 *
 * 공수1 자료 공백 (EXEC-041 §3 이 요구한 표시)
 *   저장소 안에 있는 공통수학1 자료는 유형 10개의 **코드·이름·원문 개수**뿐이다.
 *   문항 본문·강의영상 파일·쌍둥이는 로컬에 없다. 그래서 그 자리를 시연으로 메운다.
 */
import type { Provenance } from './contract'
import type { ApprovedRelation, ExposureReview } from '@/lib/twin/learningPreview'
import { segmentKeyOf } from '@/lib/twin/learningPreview'

export const CATALOG_NOTE =
  '유형 코드·이름은 저장소의 PILOT_TYPES_014.json(실제 로컬 자료). ' +
  '문제 지문·정답·영상·확인 항목은 이번 시범용 시연 자료이며 운영 문항·운영 영상이 아닙니다.'

/** `PILOT_TYPES_014.json` 에서 그대로 옮긴 값 */
export const PILOT_TYPES = [
  { typeCode: '공수1-01-02', grade: '공통수학1', chapter: '다항식',
    title: '다항식 전개식에서 계수 구하기', usableSourceCount: 36, provenance: 'local_real' as Provenance },
  { typeCode: '공수1-01-07', grade: '공통수학1', chapter: '다항식',
    title: '곱셈 공식의 변형: a²+b²+c², a³+b³+c³', usableSourceCount: 41, provenance: 'local_real' as Provenance },
] as const

export type CatalogProblem = {
  problemId: string
  typeCode: string
  taskGoal: 'solve' | 'prove' | 'explain'
  /** 학생에게 보이는 지문 */
  stem: string
  /** 객관식 보기. 서술이면 null */
  choices: string[] | null
  /** 서버에만 있다. API 응답에 넣지 않는다 */
  answer: string
  provenance: Provenance
  // ── 운영 조회에서 오는 칸 (043 §3-A). 시연 자료에는 없다 ──
  /** `problems.answer_kind` — 자동 채점 가능 여부를 가른다 */
  answerKind?: 'choice' | 'number' | 'image'
  isEssay?: boolean
  /** `problems.image_path` — 본문 그림. 서버가 허용 경로로만 꺼낸다 */
  imagePath?: string | null
  answerImagePath?: string | null
  localNo?: string | null
  book?: string | null
}

/**
 * 학생에게 내보낼 때 쓰는 모양 — **허용한 칸만 적는다** (045 §3 · R045-04 §7.1)
 *
 * 전에는 `Omit<CatalogProblem, 'answer'>` + spread 로 **정답만 빼고 나머지를 다 보냈다.**
 * 그래서 운영 조회가 들고 온 `answerImagePath`(해설 그림 경로)가 학생 payload 에
 * 그대로 남았다. GPT 탐침 P03 이 `private/answers/synthetic.png` 로 잡았다.
 *
 * 「빼는 목록」은 칸이 하나 늘 때마다 새는 쪽으로 틀린다. 그래서 **더하는 목록**으로 뒤집었다.
 * 새 칸은 여기 적지 않으면 학생에게 **나가지 않는다.**
 */
export type ProblemForStudent = {
  problemId: string
  typeCode: string
  taskGoal: CatalogProblem['taskGoal']
  stem: string
  choices: string[] | null
  provenance: Provenance
  answerKind?: CatalogProblem['answerKind']
  isEssay?: boolean
  localNo?: string | null
  book?: string | null
}

/**
 * 학생에게 보내도 되는 칸 이름. 시험이 이 목록을 직접 읽는다.
 *
 * **저장소 경로는 하나도 없다.** 원문 그림조차 경로로 보내지 않는다 —
 * 서버가 서명한 임시 주소(`imageUrl`)를 따로 붙인다 (045 §3,
 * `app/api/grade/[code]` 가 `problem-images` 버킷에 쓰는 방식 그대로).
 */
export const STUDENT_PROBLEM_FIELDS = [
  'problemId', 'typeCode', 'taskGoal', 'stem', 'choices', 'provenance',
  'answerKind', 'isEssay', 'localNo', 'book',
] as const

/** 학생에게 **절대 나가지 않는** 칸. 시험이 이것도 직접 읽는다 */
export const SERVER_ONLY_PROBLEM_FIELDS = ['answer', 'answerImagePath', 'imagePath'] as const

export function forStudent(p: CatalogProblem): ProblemForStudent {
  // 하나하나 적는다. spread 를 쓰지 않는다 — 쓰면 새 칸이 조용히 따라 나간다
  const out: ProblemForStudent = {
    problemId: p.problemId,
    typeCode: p.typeCode,
    taskGoal: p.taskGoal,
    stem: p.stem,
    choices: p.choices,
    provenance: p.provenance,
  }
  if (p.answerKind !== undefined) out.answerKind = p.answerKind
  if (p.isEssay !== undefined) out.isEssay = p.isEssay
  if (p.localNo !== undefined) out.localNo = p.localNo
  if (p.book !== undefined) out.book = p.book
  return out
}

export const PROBLEMS: CatalogProblem[] = [
  {
    problemId: 'demo-p-0102-1',
    typeCode: '공수1-01-02',
    taskGoal: 'solve',
    stem: '[시연] $(x+2)(x^{2}-3x+4)$ 의 전개식에서 $x^{2}$ 의 계수를 구하시오.',
    choices: ['$-5$', '$-1$', '$1$', '$2$', '$5$'],
    answer: '$-1$',
    provenance: 'demo',
  },
  {
    problemId: 'demo-p-0107-1',
    typeCode: '공수1-01-07',
    taskGoal: 'solve',
    stem: '[시연] $a+b+c=6$, $ab+bc+ca=11$ 일 때 $a^{2}+b^{2}+c^{2}$ 의 값을 구하시오.',
    choices: ['$11$', '$14$', '$17$', '$25$', '$36$'],
    answer: '$14$',
    provenance: 'demo',
  },
  {
    // 승인된 도움이 **하나도 없는** 원문. 대체 경로 표시를 보이려고 둔다 (R040-D)
    problemId: 'demo-p-0102-2',
    typeCode: '공수1-01-02',
    taskGoal: 'solve',
    stem: '[시연] $(2x-1)(x^{2}+ax+3)$ 의 전개식에서 $x^{2}$ 의 계수가 $5$ 일 때 $a$ 의 값을 구하시오.',
    choices: ['$1$', '$2$', '$3$', '$4$', '$5$'],
    answer: '$3$',
    provenance: 'demo',
  },
  {
    problemId: 'demo-p-0107-2',
    typeCode: '공수1-01-07',
    taskGoal: 'prove',
    stem: '[시연] 모든 실수 $a$, $b$, $c$ 에 대하여\n'
        + '$(a+b+c)^{2} = a^{2}+b^{2}+c^{2}+2(ab+bc+ca)$\n'
        + '임을 증명하시오.',
    choices: null,
    answer: '(a+b+c)(a+b+c) 를 분배법칙으로 전개하면 제곱항 3개와 교차항이 각각 2개씩 나온다',
    provenance: 'demo',
  },
]

export function problemById(id: string): CatalogProblem | null {
  return PROBLEMS.find((p) => p.problemId === id) ?? null
}

/** 시연 영상 파일 — `public/learning-demo/` 에 ffmpeg 로 만들어 둔다 */
export type CatalogAsset = {
  assetId: string
  assetVersion: number
  kind: 'video' | 'card' | 'problem'
  videoKind: 'concept' | 'worked_example' | 'proof' | null
  title: string
  /** 영상이면 파일 경로 */
  src: string | null
  /** 카드·문항이면 본문 */
  body: string | null
  durationSeconds: number | null
  /** `lesson_videos.scenes` — 구간의 단일 출처 (043 §3-A) */
  scenes?: Array<{ start: number; end: number; label?: string; kind?: string }>
  /** `lesson_videos.type_codes` — 영상↔유형 연결의 단일 출처 */
  typeCodes?: string[]
  /**
   * 파일을 **통째로 내려줘도** 안전하다고 검수된 원문 id 들 (042 §3-C).
   *
   * 화면이 구간만 보여 주는 것은 보장이 아니다 — 주소를 알면 전부 볼 수 있다.
   * 그래서 여기 적힌 원문에서만 영상으로 쓴다. 영상이 아니면 빈 배열로 둔다.
   */
  wholeFileSafeFor: string[]
  provenance: Provenance
}

export const ASSETS: CatalogAsset[] = [
  { assetId: 'demo-v-concept-0102', assetVersion: 1, kind: 'video', videoKind: 'concept',
    title: '[시연] 전개식에서 특정 항의 계수만 뽑는 방법',
    src: '/learning-demo/concept-0102.mp4', body: null, durationSeconds: 180,
    // 개념 설명이라 통째로 봐도 이 원문의 답이 나오지 않는다 (검수)
    wholeFileSafeFor: ['demo-p-0102-1', 'demo-p-0102-2'], provenance: 'demo' },
  { assetId: 'demo-v-worked-0102', assetVersion: 1, kind: 'video', videoKind: 'worked_example',
    title: '[시연] 대표문제 풀이 — 바로 이 문항의 전체 풀이',
    src: '/learning-demo/worked-0102.mp4', body: null, durationSeconds: 120,
    wholeFileSafeFor: [], provenance: 'demo' },
  // 원장님 방침(2026-10-27): **대표예제 풀이영상이 1순위.**
  // 운영에서는 개념서(개념+유형)의 「필수예제 02 풀이」가 이것에 해당하고,
  // 학생이 푸는 문항은 **쎈의 다른 문제**다 — 자기 풀이가 아니라 **유형의 접근법**이다
  { assetId: 'demo-v-worked-type-0102', assetVersion: 1, kind: 'video', videoKind: 'worked_example',
    title: '[시연] 대표예제 풀이 — 이 유형은 이렇게 접근한다 (다른 문항)',
    src: '/learning-demo/worked-type-0102.mp4', body: null, durationSeconds: 100,
    // 같은 유형의 **다른 문항** 풀이라 전체를 봐도 이 원문의 답이 나오지 않는다 (검수)
    wholeFileSafeFor: ['demo-p-0102-1', 'demo-p-0102-2'], provenance: 'demo' },
  { assetId: 'demo-v-unassigned-0102', assetVersion: 1, kind: 'video', videoKind: 'concept',
    title: '[시연] 아직 과제로 배정되지 않은 영상',
    src: '/learning-demo/unassigned-0102.mp4', body: null, durationSeconds: 90,
    wholeFileSafeFor: ['demo-p-0102-1', 'demo-p-0102-2'], provenance: 'demo' },
  { assetId: 'demo-c-card-0102', assetVersion: 1, kind: 'card', videoKind: null,
    title: '[시연] 개념카드 — 계수만 모으는 두 줄 정리',
    src: null,
    body: '곱을 전부 전개하지 않는다. $x^{2}$ 이 나오는 짝만 고른다.\n'
        + '$(x+2)(x^{2}-3x+4)$ 에서 $x^{2}$ 이 되는 짝은 $x\\cdot(-3x)$ 와 $2\\cdot x^{2}$ 둘뿐이다.\n'
        + '계수끼리만 더한다: $(1)(-3)+(2)(1)$.',
    durationSeconds: null, wholeFileSafeFor: [], provenance: 'demo' },
  { assetId: 'demo-v-proof-0107', assetVersion: 1, kind: 'video', videoKind: 'proof',
    title: '[시연] 증명영상 — $(a+b+c)^{2}$ 의 전개',
    src: '/learning-demo/proof-0107.mp4', body: null, durationSeconds: 150,
    // 증명 전체가 들어 있다. **어느 원문에서도 통째로 내보내지 않는다** (검수)
    wholeFileSafeFor: [], provenance: 'demo' },
  { assetId: 'demo-v-concept-0107', assetVersion: 1, kind: 'video', videoKind: 'concept',
    title: '[시연] 곱셈 공식의 변형을 쓰는 자리 고르기',
    src: '/learning-demo/concept-0107.mp4', body: null, durationSeconds: 180,
    wholeFileSafeFor: ['demo-p-0107-1'], provenance: 'demo' },
  { assetId: 'demo-pr-0102-twin', assetVersion: 1, kind: 'problem', videoKind: null,
    title: '[시연] 검수된 같은 개념의 다른 문항',
    src: null, body: '$(x-1)(x^{2}+5x-2)$ 의 전개식에서 $x^{2}$ 의 계수', durationSeconds: null,
    wholeFileSafeFor: [], provenance: 'demo' },
  // 증명 원문용 **카드** — 증명영상을 통째로 못 내보내므로 여기로 간다 (042 §3-C)
  { assetId: 'demo-c-card-0107p', assetVersion: 1, kind: 'card', videoKind: null,
    title: '[시연] 개념카드 — 곱을 전개할 때 교차항이 두 번 나오는 까닭',
    src: null,
    body: '$(a+b+c)(a+b+c)$ 를 분배법칙으로 풀면 각 항이 서로 한 번씩 곱해진다.\n'
        + '$a$ 와 $b$ 가 만나는 경우는 **앞의 $a$ × 뒤의 $b$** 와 **앞의 $b$ × 뒤의 $a$** 둘이다.\n'
        + '그래서 교차항마다 2배가 붙는다. (완성된 증명은 여기 적지 않는다)',
    durationSeconds: null, wholeFileSafeFor: [], provenance: 'demo' },
]

export function assetById(id: string): CatalogAsset | null {
  return ASSETS.find((a) => a.assetId === id) ?? null
}

// ════════════════════════════════════════════════════════════════════
// 승인된 관계 — **이 자산을 이 원문에 써도 되는가**
// ════════════════════════════════════════════════════════════════════

type RelationSeed = {
  relationId: string
  problemId: string
  assetId: string
  relationKind: ApprovedRelation['relationKind']
  supportedAxes: ApprovedRelation['supportedAxes']
  segment?: ApprovedRelation['segment']
  assetReviewed: boolean
  relationReviewed: boolean
  /** 교사가 과제로 배정했는가 — 이것이 열람 가능 여부다 */
  assignedToStudent: boolean
  exposureVerdict: ExposureReview['verdict']
  /** 검수 범위를 일부러 어긋나게 둔 경우 (구간을 뒤에 붙였다 등) */
  exposureScopeSegmentKey?: string
  confirmItems: ApprovedRelation['confirmItems']
}

const RELATION_SEEDS: RelationSeed[] = [
  // ── 공수1-01-02 (계수 구하기, solve) ──────────────────────────────
  {
    relationId: 'rel-0102-concept',
    problemId: 'demo-p-0102-1',
    assetId: 'demo-v-concept-0102',
    relationKind: 'concept_explanation',
    supportedAxes: ['recall', 'formulate', 'condition'],
    segment: { startSeconds: 20, endSeconds: 75, sceneNo: 2 },
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0102-concept-1',
        prompt: '[시연] $(x+3)(x^{2}+x-5)$ 에서 $x^{2}$ 이 되는 짝은 모두 몇 쌍입니까?',
        choices: ['1쌍', '2쌍', '3쌍', '4쌍'], origin: 'demo' },
      { itemRef: 'ci-0102-concept-2',
        prompt: '[시연] 계수를 구할 때 전개를 끝까지 해야 합니까?',
        choices: ['해야 한다', '해당 항이 나오는 짝만 보면 된다'], origin: 'demo' },
    ],
  },
  {
    // **대표예제 풀이 — 1순위** (원장님 방침 2026-10-27).
    // 「이 유형은 이렇게 접근한다」를 보여 주고 자기 문제는 스스로 풀게 한다.
    // 같은 유형의 **다른 문항** 풀이라 이 원문의 답은 드러나지 않는다
    relationId: 'rel-0102-worked-type',
    problemId: 'demo-p-0102-1',
    assetId: 'demo-v-worked-type-0102',
    relationKind: 'type_demonstration',
    supportedAxes: ['goal', 'condition', 'formulate', 'recall'],
    segment: { startSeconds: 10, endSeconds: 70, sceneNo: 1 },
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0102-worked-type-1',
        prompt: '[시연] 조건이 바뀐 $(2x+1)(x^{2}-4x+3)$ 에서, 먼저 무엇을 찾습니까?',
        choices: ['전부 전개한다', '$x^{2}$ 이 되는 짝만 찾는다', '$x$ 에 수를 넣어 본다'],
        origin: 'demo' },
    ],
  },
  {
    // 이 원문의 전체 풀이 — 검수에서 **답이 드러난다**고 판단
    relationId: 'rel-0102-worked',
    problemId: 'demo-p-0102-1',
    assetId: 'demo-v-worked-0102',
    relationKind: 'type_demonstration',
    supportedAxes: ['goal', 'condition', 'formulate'],
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'reveals',
    confirmItems: [
      { itemRef: 'ci-0102-worked-1', prompt: '[시연] 쓰이지 않습니다', choices: null, origin: 'demo' },
    ],
  },
  {
    // **배정되지 않은** 영상 — 서버에서 막힌다
    relationId: 'rel-0102-unassigned',
    problemId: 'demo-p-0102-1',
    assetId: 'demo-v-unassigned-0102',
    relationKind: 'concept_explanation',
    supportedAxes: ['recall'],
    assetReviewed: true, relationReviewed: true, assignedToStudent: false,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0102-un-1', prompt: '[시연] 쓰이지 않습니다', choices: null, origin: 'demo' },
    ],
  },
  {
    relationId: 'rel-0102-card',
    problemId: 'demo-p-0102-1',
    assetId: 'demo-c-card-0102',
    relationKind: 'concept_card',
    supportedAxes: ['represent', 'compute', 'recall'],
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0102-card-1',
        prompt: '[시연] $(x-1)(x^{2}+5x-2)$ 에서 $x^{2}$ 의 계수는?',
        choices: ['$-5$', '$1$', '$4$', '$5$'], origin: 'demo' },
    ],
  },
  {
    relationId: 'rel-0102-twin',
    problemId: 'demo-p-0102-1',
    assetId: 'demo-pr-0102-twin',
    relationKind: 'reviewed_problem',
    supportedAxes: ['compute', 'formulate'],
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0102-twin-1',
        prompt: '[시연] $(x-1)(x^{2}+5x-2)$ 의 $x^{2}$ 계수를 적으세요',
        choices: null, origin: 'demo' },
    ],
  },

  {
    // 이 원문에 붙은 도움은 **배정되지 않은 것 하나뿐**이다 → 쓸 수 있는 도움 0개
    relationId: 'rel-0102b-unassigned',
    problemId: 'demo-p-0102-2',
    assetId: 'demo-v-unassigned-0102',
    relationKind: 'concept_explanation',
    supportedAxes: ['recall', 'formulate', 'condition', 'goal', 'represent', 'compute'],
    assetReviewed: true, relationReviewed: true, assignedToStudent: false,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0102b-un-1', prompt: '[시연] 쓰이지 않습니다', choices: null, origin: 'demo' },
    ],
  },

  // ── 공수1-01-07 (곱셈 공식 변형, solve) ───────────────────────────
  {
    relationId: 'rel-0107-concept',
    problemId: 'demo-p-0107-1',
    assetId: 'demo-v-concept-0107',
    relationKind: 'concept_explanation',
    supportedAxes: ['recall', 'formulate'],
    segment: { startSeconds: 95, endSeconds: 160, sceneNo: 3 },
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0107-concept-1',
        prompt: '[시연] $a^{2}+b^{2}+c^{2}$ 를 구하려면 $(a+b+c)^{2}$ 에서 무엇을 빼야 합니까?',
        choices: ['$ab+bc+ca$', '$2(ab+bc+ca)$', '$abc$', '$3abc$'], origin: 'demo' },
    ],
  },
  {
    // 구간을 **뒤에 붙였고** 검수는 통째(full)에 대한 것 — 범위가 어긋나 보류된다
    relationId: 'rel-0107-proof-smuggled',
    problemId: 'demo-p-0107-1',
    assetId: 'demo-v-proof-0107',
    relationKind: 'theorem_proof',
    supportedAxes: ['recall'],
    segment: { startSeconds: 15, endSeconds: 60 },
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    exposureScopeSegmentKey: 'full',
    confirmItems: [
      { itemRef: 'ci-0107-proof-1', prompt: '[시연] 쓰이지 않습니다', choices: null, origin: 'demo' },
    ],
  },

  // ── 공수1-01-07 증명 원문 (prove) ─────────────────────────────────
  {
    // 증명 원문에 증명영상이지만 검수에서 safe 로 승인됐다.
    // 「증명이면 전부 금지」·「구간만 있으면 안전」 어느 쪽도 쓰지 않는다 (R040-C)
    relationId: 'rel-0107p-card',
    problemId: 'demo-p-0107-2',
    assetId: 'demo-c-card-0107p',
    relationKind: 'concept_card',
    supportedAxes: ['recall', 'represent'],
    // 카드에는 구간이 없다. 검수 범위도 `full` 로 잡힌다
    assetReviewed: true, relationReviewed: true, assignedToStudent: true,
    exposureVerdict: 'safe',
    confirmItems: [
      { itemRef: 'ci-0107p-1',
        prompt: '[시연] 전개에서 $ab$ 항이 2개 나오는 근거는 무엇입니까?',
        choices: ['교환법칙으로 $ab$ 와 $ba$ 가 각각 나오기 때문', '제곱이라서', '항이 3개라서'],
        origin: 'demo' },
    ],
  },
]

/**
 * 한 원문에 대해 **서버가 승인한 관계들**을 만든다.
 *
 * `exposureReview.scope` 를 여기서 원문·목적·자산 판·구간으로 묶는다.
 * 그래서 구간을 바꾸거나 자산 판이 올라가면 검수가 **자동으로 무효**가 된다.
 */
export function relationsFor(problemId: string): ApprovedRelation[] {
  const p = problemById(problemId)
  if (p === null) return []
  const out: ApprovedRelation[] = []
  for (const s of RELATION_SEEDS) {
    if (s.problemId !== problemId) continue
    const asset = assetById(s.assetId)
    if (asset === null) continue
    out.push({
      relationId: s.relationId,
      relationKind: s.relationKind,
      videoKind: asset.videoKind,
      typeCode: p.typeCode,
      supportedAxes: s.supportedAxes,
      relationReviewed: s.relationReviewed,
      assetReviewed: s.assetReviewed,
      assetVersion: asset.assetVersion,
      reachableByStudent: s.assignedToStudent,
      // 042 §3-C — 파일을 통째로 내려주므로 전체가 안전한 원문에서만 영상을 쓴다
      wholeDeliverySafe: asset.kind === 'video' ? asset.wholeFileSafeFor.includes(problemId) : null,
      segment: s.segment,
      confirmItems: s.confirmItems,
      contentRef: { kind: asset.kind, id: asset.assetId, version: asset.assetVersion },
      exposureReview: {
        verdict: s.exposureVerdict,
        scope: {
          problemRefId: problemId,
          taskGoal: p.taskGoal,
          assetVersion: asset.assetVersion,
          segmentKey: s.exposureScopeSegmentKey ?? segmentKeyOf(s.segment),
        },
        reviewedBy: 'demo-reviewer(시연)',
        reviewedAt: '2026-10-24T00:00:00Z',
      },
    })
  }
  return out
}

/** 확인 항목의 **정답은 서버만** 안다. 응답에 넣지 않는다 */
const CONFIRM_ANSWERS: Record<string, string> = {
  'ci-0102-concept-1': '2쌍',
  'ci-0102-concept-2': '해당 항이 나오는 짝만 보면 된다',
  'ci-0102-card-1': '$4$',
  'ci-0102-twin-1': '4',
  'ci-0107-concept-1': '$2(ab+bc+ca)$',
  'ci-0107p-1': '교환법칙으로 $ab$ 와 $ba$ 가 각각 나오기 때문',
  'ci-0102-worked-type-1': '$x^{2}$ 이 되는 짝만 찾는다',
}

/**
 * 확인 항목을 채점한다. 기준이 없으면 **null** 을 돌려준다 —
 * 모르는 것을 맞았다/틀렸다로 바꾸지 않는다.
 */
export function gradeConfirmItem(itemRef: string, answer: string): 'correct' | 'wrong' | null {
  const expect = CONFIRM_ANSWERS[itemRef]
  if (expect === undefined) return null
  return norm(answer) === norm(expect) ? 'correct' : 'wrong'
}

/** 원문 채점 — 같은 이유로 기준이 없으면 null */
export function gradeProblem(problemId: string, answer: string): 'correct' | 'wrong' | null {
  const p = problemById(problemId)
  if (p === null) return null
  if (p.taskGoal === 'prove') return null     // 서술 증명은 자동 채점하지 않는다
  return norm(answer) === norm(p.answer) ? 'correct' : 'wrong'
}

/** 공백과 음수 기호 표기만 맞춘다. 그 이상 추측하지 않는다 */
function norm(s: string): string {
  return s
    .replace(/\\cdot/g, '')       // LaTeX 곱셈점
    .replace(/[${}^]/g, '')       // 수식 구분자·중괄호·위첨자 표시
    .replace(/\s+/g, '')
    .replace(/[−–—]/g, '-')
}
