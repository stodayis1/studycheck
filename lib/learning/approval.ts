/**
 * 첫 시범 세트의 **서버 전용 승인 명세** — GPT-EXEC-045 §4 「검수 입력」 · GPT_REVIEW_043_044 §8-5
 *
 * 왜 파일인가
 *   045 §4: 「서버 전용의 버전 있는 소수 승인 명세로 첫 세트를 연결해도 된다.
 *   새 테이블/전용 검수 시스템 완성이 선행조건이 아니다.」
 *   그래서 새 표를 만들지 않고 `approvals/first-set.approval.json` 한 개로 시작한다.
 *   운영 승인이 쌓이면 그때 표로 옮긴다 — 지금 표를 만들면 빈 표만 늘어난다.
 *
 * 무엇이 **학생에게 나가는 조건**인가
 *   이 파일에 그 (원문 × 자산 × 자산판 × 구간) 조합이 적혀 있고,
 *   `exposure.verdict === 'safe'` 이고, 구간이 없으면 `wholeFileSafe === true` 일 때.
 *   **셋 중 하나라도 아니면 나가지 않는다.**
 *
 * 지금 상태 — `relations` 가 **빈 배열**이다
 *   노출 검수 기준(045 §4)은 글로 왔지만 **세 후보에 대한 실제 판정은 아직 없다.**
 *   그래서 비어 있다. 비어 있는 것을 「검수 중」이나 「통과」로 적지 않는다.
 *   영상이 학생 화면에 붙는 것은 이 파일에 줄이 생기는 순간이고, 그 줄은 사람이 적는다.
 *
 * 왜 느슨하게 읽지 않고 **던지는가**
 *   모양이 틀린 줄을 조용히 버리면 「승인이 없다」와 「승인을 못 읽었다」가 같아 보인다.
 *   그 둘이 같아 보이면 안 된다. 그래서 틀린 줄은 **큰 소리로 멈춘다.**
 *
 * 정답
 *   이 파일에 정답을 적지 않는다. 확인 문항은 **문제은행 문항 id** 로만 가리키고,
 *   채점은 서버가 그 문항의 `answer_text` 로 한다 (045 §3).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import type {
  ApprovedRelation, Axis, RelationKind, VideoKind,
} from '@/lib/twin/learningPreview'
import { segmentKeyOf } from '@/lib/twin/learningPreview'

/** 영상 구간. **실제로 검수한 초**다 — 순번·길이에서 만들지 않는다 (044 §4) */
export type ApprovedSegment = { startSeconds: number; endSeconds: number; sceneNo?: number }

export type ApprovedRelationSpec = {
  relationId: string
  problemId: string
  assetId: string
  assetVersion: number
  relationKind: RelationKind
  videoKind: VideoKind | null
  supportedAxes: Axis[]
  /** 없으면 구간 지정이 아니다 — 그때는 `wholeFileSafe` 가 true 여야 쓰인다 */
  segment?: ApprovedSegment
  /** **파일을 통째로 내려줘도** 이 원문에 안전한가 (042 §3-C) */
  wholeFileSafe: boolean
  /** 확인 행동으로 낼 **문제은행 다른 문항** 의 id. 정답은 여기 적지 않는다 */
  confirmProblemIds: string[]
  exposure: {
    verdict: 'safe' | 'reveals' | 'unknown'
    reviewedBy: string
    reviewedAt: string
  }
  /** 무엇을 보고 통과시켰는지. 사람이 읽는 한 줄 */
  evidence: string
}

export type ProblemRole = {
  problemId: string
  /** 원문으로 쓰는가, 확인 문항으로 쓰는가 (045 §4 — 최대 10개 안에서 역할을 나눈다) */
  role: 'source' | 'confirm'
}

export type ApprovalSpec = {
  specVersion: string
  specNote: string
  problemRoles: ProblemRole[]
  relations: ApprovedRelationSpec[]
}

export class ApprovalSpecError extends Error {
  constructor(where: string, why: string) {
    super(`승인 명세가 올바르지 않습니다 (${where}): ${why}`)
    this.name = 'ApprovalSpecError'
  }
}

const RELATION_KINDS = ['concept_explanation', 'type_demonstration', 'theorem_proof',
  'twin_problem', 'similar_problem', 'prerequisite_check'] as const
const VIDEO_KINDS = ['concept', 'worked_example', 'proof'] as const
const AXIS_CODES = ['goal', 'condition', 'represent', 'recall', 'formulate',
  'execute', 'verify'] as const

function str(o: Record<string, unknown>, k: string, where: string): string {
  const v = o[k]
  if (typeof v !== 'string' || v.trim() === '') throw new ApprovalSpecError(where, `${k} 가 글자가 아닙니다`)
  return v
}

/** 초는 **숫자여야** 한다. `null` · `''` · `true` 를 `Number()` 로 바꾸지 않는다 (R045-04 §7.4) */
function seconds(v: unknown, where: string, k: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new ApprovalSpecError(where, `${k} 가 숫자가 아닙니다 (${JSON.stringify(v)})`)
  }
  if (v < 0) throw new ApprovalSpecError(where, `${k} 가 음수입니다`)
  return v
}

export function parseApprovalSpec(raw: unknown): ApprovalSpec {
  if (raw === null || typeof raw !== 'object') throw new ApprovalSpecError('파일', '객체가 아닙니다')
  const o = raw as Record<string, unknown>
  const specVersion = str(o, 'specVersion', '파일')
  const specNote = str(o, 'specNote', '파일')

  if (!Array.isArray(o.problemRoles)) throw new ApprovalSpecError('파일', 'problemRoles 가 배열이 아닙니다')
  if (!Array.isArray(o.relations)) throw new ApprovalSpecError('파일', 'relations 가 배열이 아닙니다')

  const problemRoles: ProblemRole[] = o.problemRoles.map((r, i) => {
    const where = `problemRoles[${i}]`
    if (r === null || typeof r !== 'object') throw new ApprovalSpecError(where, '객체가 아닙니다')
    const e = r as Record<string, unknown>
    const role = str(e, 'role', where)
    if (role !== 'source' && role !== 'confirm') {
      throw new ApprovalSpecError(where, `role 이 source·confirm 이 아닙니다 (${role})`)
    }
    return { problemId: str(e, 'problemId', where), role }
  })

  const seen = new Set<string>()
  const relations: ApprovedRelationSpec[] = o.relations.map((r, i) => {
    const where = `relations[${i}]`
    if (r === null || typeof r !== 'object') throw new ApprovalSpecError(where, '객체가 아닙니다')
    const e = r as Record<string, unknown>
    const relationId = str(e, 'relationId', where)
    if (seen.has(relationId)) throw new ApprovalSpecError(where, `relationId 가 겹칩니다 (${relationId})`)
    seen.add(relationId)

    const relationKind = str(e, 'relationKind', where) as RelationKind
    if (!RELATION_KINDS.includes(relationKind as (typeof RELATION_KINDS)[number])) {
      throw new ApprovalSpecError(where, `relationKind 를 모릅니다 (${relationKind})`)
    }
    const vk = e.videoKind
    if (vk !== null && (typeof vk !== 'string' || !VIDEO_KINDS.includes(vk as (typeof VIDEO_KINDS)[number]))) {
      throw new ApprovalSpecError(where, `videoKind 를 모릅니다 (${String(vk)})`)
    }
    if (!Array.isArray(e.supportedAxes) || e.supportedAxes.length === 0) {
      throw new ApprovalSpecError(where, 'supportedAxes 가 비었습니다')
    }
    for (const a of e.supportedAxes) {
      if (typeof a !== 'string' || !AXIS_CODES.includes(a as (typeof AXIS_CODES)[number])) {
        throw new ApprovalSpecError(where, `축 이름을 모릅니다 (${String(a)})`)
      }
    }
    if (typeof e.assetVersion !== 'number' || !Number.isInteger(e.assetVersion) || e.assetVersion < 1) {
      throw new ApprovalSpecError(where, 'assetVersion 이 1 이상의 정수가 아닙니다')
    }
    if (typeof e.wholeFileSafe !== 'boolean') {
      throw new ApprovalSpecError(where, 'wholeFileSafe 가 참·거짓이 아닙니다')
    }

    let segment: ApprovedSegment | undefined
    if (e.segment !== undefined && e.segment !== null) {
      if (typeof e.segment !== 'object') throw new ApprovalSpecError(where, 'segment 가 객체가 아닙니다')
      const s = e.segment as Record<string, unknown>
      const startSeconds = seconds(s.startSeconds, where, 'segment.startSeconds')
      const endSeconds = seconds(s.endSeconds, where, 'segment.endSeconds')
      if (!(startSeconds < endSeconds)) throw new ApprovalSpecError(where, 'segment 의 끝이 시작보다 뒤가 아닙니다')
      segment = { startSeconds, endSeconds }
      if (s.sceneNo !== undefined && s.sceneNo !== null) {
        const n = seconds(s.sceneNo, where, 'segment.sceneNo')
        if (!Number.isInteger(n)) throw new ApprovalSpecError(where, 'segment.sceneNo 가 정수가 아닙니다')
        segment.sceneNo = n
      }
    }
    // 구간도 없고 전체도 안전하지 않다면 **쓸 수 없는 승인**이다. 조용히 두지 않는다
    if (segment === undefined && e.wholeFileSafe !== true) {
      throw new ApprovalSpecError(where, '구간이 없는데 wholeFileSafe 가 false 입니다 — 쓸 수 없는 승인입니다')
    }

    if (!Array.isArray(e.confirmProblemIds)) {
      throw new ApprovalSpecError(where, 'confirmProblemIds 가 배열이 아닙니다')
    }
    const confirmProblemIds = e.confirmProblemIds.map((x, j) => {
      if (typeof x !== 'string' || x.trim() === '') {
        throw new ApprovalSpecError(`${where}.confirmProblemIds[${j}]`, '글자가 아닙니다')
      }
      return x
    })
    const problemId = str(e, 'problemId', where)
    // 045 §4 — 영상에서 답을 본 **그 문항**을 확인 문항으로 다시 쓰지 않는다
    if (confirmProblemIds.includes(problemId)) {
      throw new ApprovalSpecError(where, '확인 문항에 원문 자신이 들어 있습니다 (독립 확인이 아닙니다)')
    }

    if (e.exposure === null || typeof e.exposure !== 'object') {
      throw new ApprovalSpecError(where, 'exposure 가 없습니다')
    }
    const ex = e.exposure as Record<string, unknown>
    const verdict = str(ex, 'verdict', `${where}.exposure`)
    if (verdict !== 'safe' && verdict !== 'reveals' && verdict !== 'unknown') {
      throw new ApprovalSpecError(where, `exposure.verdict 를 모릅니다 (${verdict})`)
    }

    return {
      relationId,
      problemId,
      assetId: str(e, 'assetId', where),
      assetVersion: e.assetVersion,
      relationKind,
      videoKind: (vk as VideoKind | null),
      supportedAxes: e.supportedAxes as Axis[],
      segment,
      wholeFileSafe: e.wholeFileSafe,
      confirmProblemIds,
      exposure: {
        verdict,
        reviewedBy: str(ex, 'reviewedBy', `${where}.exposure`),
        reviewedAt: str(ex, 'reviewedAt', `${where}.exposure`),
      },
      evidence: str(e, 'evidence', where),
    }
  })

  return { specVersion, specNote, problemRoles, relations }
}

export function approvalSpecPath(): string {
  return process.env.LEARNING_APPROVAL_SPEC
    || join(process.cwd(), 'lib', 'learning', 'approvals', 'first-set.approval.json')
}

let cached: { path: string; spec: ApprovalSpec } | null = null

/** 명세를 읽는다. 읽기·모양 오류는 **던진다** — 「승인 없음」으로 바꾸지 않는다 */
export function loadApprovalSpec(): ApprovalSpec {
  const path = approvalSpecPath()
  if (cached !== null && cached.path === path) return cached.spec
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    throw new ApprovalSpecError(path, `읽을 수 없습니다: ${(e as Error).message}`)
  }
  const spec = parseApprovalSpec(raw)
  cached = { path, spec }
  return spec
}

/** 시험에서 캐시를 비운다 */
export function __clearApprovalSpecCache(): void { cached = null }

/**
 * 승인 명세 한 줄을 `ApprovedRelation` 으로 옮긴다.
 *
 * **검수 칸을 여기서 만들지 않는다.** `relationReviewed` · `assetReviewed` 는
 * 명세에 그 줄이 있고 자산 판이 맞다는 사실이고, `exposureReview` 는 명세에 적힌
 * 판정 그대로다. 「통과」를 코드가 붙이는 경로가 없다.
 */
export function toApprovedRelation(
  spec: ApprovedRelationSpec,
  ctx: {
    typeCode: string
    taskGoal: 'solve' | 'prove' | 'explain'
    /** 자산이 실제로 조회됐고 판이 명세와 **같은가** */
    assetVersionNow: number | null
    /** 조회된 자산의 종류. 조회되지 않았으면 `null` */
    assetKind: ApprovedRelation['contentRef']['kind'] | null
    reachableByStudent: boolean
    confirmItems: ApprovedRelation['confirmItems']
  },
): ApprovedRelation {
  // 자산 판이 명세와 다르면 **승인이 무효**다. 검수를 자동으로 옮기지 않는다
  const versionMatches = ctx.assetVersionNow !== null && ctx.assetVersionNow === spec.assetVersion
  return {
    relationId: spec.relationId,
    relationKind: spec.relationKind,
    videoKind: spec.videoKind,
    typeCode: ctx.typeCode,
    supportedAxes: spec.supportedAxes,
    relationReviewed: versionMatches,
    assetReviewed: versionMatches,
    assetVersion: spec.assetVersion,
    reachableByStudent: ctx.reachableByStudent,
    wholeDeliverySafe: spec.wholeFileSafe,
    segment: spec.segment,
    confirmItems: ctx.confirmItems,
    // 자산이 조회되지 않았으면 종류를 **모른다.** 영상이라고 가정하지 않는다 —
    // `problem` 으로 두면 `wholeDeliverySafe` 검사를 건너뛰지 않는다
    contentRef: {
      kind: ctx.assetKind ?? 'problem',
      id: spec.assetId,
      version: spec.assetVersion,
    },
    exposureReview: !versionMatches ? undefined : {
      verdict: spec.exposure.verdict,
      scope: {
        problemRefId: spec.problemId,
        taskGoal: ctx.taskGoal,
        assetVersion: spec.assetVersion,
        segmentKey: segmentKeyOf(spec.segment),
      },
      reviewedBy: spec.exposure.reviewedBy,
      reviewedAt: spec.exposure.reviewedAt,
    },
  }
}
