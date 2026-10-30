/**
 * 운영 모드가 쓰는 것 — GPT-EXEC-045 §3
 *
 * ⚠️ **운영 DB 에 아직 붙은 적이 없다.** 여기까지 확인한 것은 합성 SDK 로
 *   실제 route·실제 어댑터를 끝에서 끝까지 돌린 것뿐이다 (045 §6-1).
 *   「설정만 넣으면 된다」고 적지 않는다.
 *
 * 이 파일이 잇는 것 (045 §3 의 순서 그대로)
 *   route → 기존 학생 인증 → **기존 배정** → 첫 세트 허용 문항 → 서버 채점
 *   → RPC → 재조회 → 강사 요약
 *
 * 「기존 배정」을 무엇으로 보는가 — **보고해야 할 어긋남**
 *   045 §3: 「기존 배정된 과제에서 첫 세트 허용 문항만 사용한다.」
 *   그런데 저장소에는 **문제은행 문항을 학생에게 배정하는 표가 없다.**
 *   `student_worksheets` 는 초등 단원 학습지(단원·학기·레벨)이고 문항 id 가 없다.
 *   문제은행 쪽에서 학생과 문항을 잇는 **실제** 연결은 이것뿐이다.
 *
 *     exam_sheets ──< exam_sheet_problems (sheet_id, no, problem_id)
 *     gradings (student_id, sheet_id)        ← 그 학생이 **실제로 제출한** 시험지
 *
 *   그래서 여기서는 「배정」을 **그 학생이 제출한 시험지의 문항**으로 읽는다.
 *   범위로는 가장 좁고 안전하다 — 학생은 자기가 받은 시험지의 문항만 열 수 있다.
 *   다만 「아직 풀지 않은 과제」는 잡히지 않는다. 표를 새로 만들지 않고 보고한다
 *   (CLAUDE_RESULT_045 §3). GPT 가 다른 연결을 쓰라고 하면 그때 바꾼다.
 *
 * 콘텐츠 승인
 *   관계는 `approval.ts` 의 명세에서만 나온다. 지금 명세가 **비어 있어서**
 *   운영 관계는 **0개**다 → 영상이 학생에게 나가지 않는다. 그것이 지금의 사실이다.
 */
import type { ApprovedRelation, ConfirmActionItem } from '@/lib/twin/learningPreview'

import { loadApprovalSpec, toApprovedRelation, type ApprovalSpec } from './approval'
import type { CatalogAsset, CatalogProblem } from './catalog'
import type { StudentRow, TaskRow } from './contract'
import {
  confirmItemFromProblem, confirmItemRefOf, gradableOf, problemIdOfConfirmItemRef,
  type CommitOutcome, type CommitRequest, type ContentSnapshot,
  type LearningActionStore, type LearningDeps, type TypeLabel,
} from './deps'
import { gradeAnswerDetailed, type GradeOutcome } from './grading'
import { FIRST_SET, type TypeInfo, type VideoReadiness } from './providers'
import { supabaseStudentAuth } from './supabaseAuth'
import { learningClient } from './supabaseClient'
import { supabaseContentProvider } from './supabaseContent'
import {
  SupabaseLearningStore, learningRunId, sourceOfTaskId, taskIdOfSource,
} from './supabaseStore'

/** 이 시범의 생성 트랙. client 가 보낸 문자열을 쓰지 않는다 */
export const OPERATIONAL_PRODUCER = 'studycheck-learning-045-pilot'

/** `in()` 은 100개씩 끊는다 (메모리 규칙: 페이지 넘기기엔 order, in() 은 100개씩) */
function chunks<T>(xs: readonly T[], n = 100): T[][] {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

// ════════════════════════════════════════════════════════════════════
// 콘텐츠 한 장면 — 한 요청이 쓸 것을 **먼저 다 읽는다**
// ════════════════════════════════════════════════════════════════════

export async function operationalContentSnapshot(): Promise<ContentSnapshot> {
  const provider = supabaseContentProvider()
  const spec: ApprovalSpec = loadApprovalSpec()

  const [types, problems, assets] = await Promise.all([
    provider.listTypes(),
    provider.listProblems(),
    provider.listAssets(),
  ])

  // 원문 그림의 **서명된 임시 주소**를 한 번에 받아 둔다.
  // 기존 `app/api/grade/[code]` 와 같은 버킷·같은 방식(2시간)이다.
  // **해설 그림(`answerImagePath`)은 서명하지 않는다** — 서명할 길을 만들지 않는다
  const imageUrls = await signProblemImages(problems)
  const readiness: VideoReadiness[] = provider.videoReadiness === undefined
    ? [] : await provider.videoReadiness()

  const problemMap = new Map<string, CatalogProblem>()
  for (const p of problems) problemMap.set(p.problemId, p)
  const assetMap = new Map<string, CatalogAsset>()
  for (const a of assets) assetMap.set(a.assetId, a)
  const typeMap = new Map<string, TypeInfo>()
  for (const t of types) typeMap.set(t.typeCode, t)

  /** 승인 명세의 확인 문항 → 실제 항목. **조회된 문항만** */
  function confirmItemsOf(ids: readonly string[]): ConfirmActionItem[] {
    const out: ConfirmActionItem[] = []
    for (const id of ids) {
      const p = problemMap.get(id)
      // 첫 세트 밖의 문항은 쓰지 않는다 — 없는 것을 만들지 않는다
      if (p === undefined) continue
      // 확인 문항도 본문이 **그림**이다. 서명된 주소를 같이 넘긴다 (045 이어서)
      out.push(confirmItemFromProblem(p, imageUrls.get(id) ?? null))
    }
    return out
  }

  const note = `운영 조회 (문항 ${problems.length}개 · 영상 ${assets.length}편 · `
    + `유형 ${types.length}개). 승인 명세 ${spec.specVersion} 의 관계 ${spec.relations.length}건. `
    + '정답·해설은 서버 채점에만 쓰고 학생 payload 에 넣지 않습니다.'

  return {
    source: 'supabase',
    note,
    problems,
    assets,

    typeLabel(code: string): TypeLabel {
      const t = typeMap.get(code)
      return {
        title: t === undefined ? '(유형 이름 없음)' : t.title,
        chapter: t === undefined ? '(단원 없음)' : t.chapter,
        provenance: 'operational',
      }
    },

    problemById(id: string): CatalogProblem | null { return problemMap.get(id) ?? null },
    problemImageUrl(id: string): string | null { return imageUrls.get(id) ?? null },
    assetById(id: string): CatalogAsset | null { return assetMap.get(id) ?? null },

    /**
     * 승인 명세에 적힌 것만. **없으면 빈 배열이다.**
     * 명세 밖의 영상을 유형이 겹친다는 이유로 끼워 넣지 않는다.
     */
    relationsFor(problemId: string): ApprovedRelation[] {
      const p = problemMap.get(problemId)
      if (p === undefined) return []
      const out: ApprovedRelation[] = []
      for (const s of spec.relations) {
        if (s.problemId !== problemId) continue
        const asset = assetMap.get(s.assetId)
        out.push(toApprovedRelation(s, {
          typeCode: p.typeCode,
          taskGoal: p.taskGoal,
          // 자산이 조회되지 않았으면 판을 **모른다** → 승인이 무효가 된다
          assetVersionNow: asset === undefined ? null : asset.assetVersion,
          assetKind: asset === undefined ? null : asset.kind,
          // 학생이 열 수 있는지는 **요청마다** 서버가 범위로 정한다 (045 §4 마지막 줄).
          // 여기서는 과제 범위 확인을 이미 통과한 원문이므로 true 다
          reachableByStudent: true,
          confirmItems: confirmItemsOf(s.confirmProblemIds),
        }))
      }
      return out
    },

    gradeProblem(problemId: string, answer: string): GradeOutcome {
      const p = problemMap.get(problemId)
      if (p === undefined) {
        return { result: null, why: '문항을 찾을 수 없어 채점하지 않았습니다', unsupportedInput: false }
      }
      return gradeAnswerDetailed(gradableOf(p), answer)
    },

    /** 확인 항목은 **문제은행 다른 문항**이다. 그 문항의 정답으로 채점한다 (045 §4) */
    gradeConfirmItem(itemRef: string, answer: string): GradeOutcome {
      const id = problemIdOfConfirmItemRef(itemRef)
      if (id === null) {
        return { result: null, why: '확인 항목 식별자를 읽을 수 없습니다', unsupportedInput: false }
      }
      const p = problemMap.get(id)
      if (p === undefined) {
        return { result: null, why: '확인 문항이 첫 세트에 없어 채점하지 않았습니다', unsupportedInput: false }
      }
      return gradeAnswerDetailed(gradableOf(p), answer)
    },

    videoReadiness: readiness,
  }
}

/** 원문 그림을 넣어 둔 버킷. `app/api/grade/[code]` 와 같은 곳이다 */
const PROBLEM_IMAGE_BUCKET = 'problem-images'
/** 서명 유효기간(초). 기존 채점 경로와 같은 2시간 */
const SIGN_SECONDS = 7200

/**
 * 원문 그림을 서명한다. **원문(`image_path`)만.**
 *
 * 서명이 실패한 그림은 **빈 주소로 채우지 않는다** — 그 문항은 그림이 없는 것으로
 * 두고, 화면이 「그림을 불러오지 못했습니다」로 적는다. 0 으로 채우지 않는 것과 같은 규칙이다.
 */
export async function signProblemImages(problems: readonly CatalogProblem[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const paths: string[] = []
  const owner = new Map<string, string>()
  for (const p of problems) {
    const path = p.imagePath
    if (path === null || path === undefined || path.trim() === '') continue
    paths.push(path)
    owner.set(path, p.problemId)
  }
  if (paths.length === 0) return out
  const db = learningClient('원문 그림 주소')
  for (const part of chunks(paths)) {
    const { data, error } = await db.storage.from(PROBLEM_IMAGE_BUCKET)
      .createSignedUrls(part, SIGN_SECONDS)
    // 서명 실패를 **던지지 않는다** — 그림 없이도 지문·보기는 보여야 한다.
    // 다만 가짜 주소를 만들지도 않는다
    if (error) continue
    for (const u of data ?? []) {
      const path = String((u as { path?: unknown }).path ?? '')
      const url = (u as { signedUrl?: unknown }).signedUrl
      const err = (u as { error?: unknown }).error
      if (err || typeof url !== 'string' || url === '') continue
      const pid = owner.get(path)
      if (pid !== undefined) out.set(pid, url)
    }
  }
  return out
}

// ════════════════════════════════════════════════════════════════════
// 저장소
// ════════════════════════════════════════════════════════════════════

/**
 * 이 학생이 **실제로 받은** 시험지의 첫 세트 문항.
 *
 * 남의 시험지·배정 안 된 시험지·첫 세트 밖 문항은 **콘텐츠를 읽기 전에** 걸러진다
 * (045 §3). 학생이 보낸 과제 id 로 범위를 넓히지 않는다.
 */
export async function operationalAssignedTasks(
  studentId: string, allowedProblemIds: ReadonlySet<string>,
  typeOf: (problemId: string) => string,
): Promise<TaskRow[]> {
  if (allowedProblemIds.size === 0) return []
  const db = learningClient('배정 조회')

  const { data: gr, error: e1 } = await db
    .from('gradings')
    .select('sheet_id')
    .eq('student_id', studentId)
    .order('sheet_id', { ascending: true })
  if (e1) throw new Error(`배정 조회 실패: ${e1.message}`)
  const sheetIds = [...new Set((gr ?? [])
    .map((g) => (g.sheet_id === null || g.sheet_id === undefined ? '' : String(g.sheet_id)))
    .filter((s) => s !== ''))]
  if (sheetIds.length === 0) return []

  const items: Array<{ sheetId: string; no: number; problemId: string }> = []
  for (const part of chunks(sheetIds)) {
    const { data, error } = await db
      .from('exam_sheet_problems')
      .select('sheet_id, no, problem_id')
      .in('sheet_id', part)
      .order('sheet_id', { ascending: true })
      .order('no', { ascending: true })
    if (error) throw new Error(`시험지 문항 조회 실패: ${error.message}`)
    for (const r of data ?? []) {
      const pid = String(r.problem_id)
      // **첫 세트 허용 문항만.** 범위 밖은 여기서 끊는다
      if (!allowedProblemIds.has(pid)) continue
      items.push({ sheetId: String(r.sheet_id), no: Number(r.no), problemId: pid })
    }
  }
  if (items.length === 0) return []

  const usedSheets = [...new Set(items.map((i) => i.sheetId))]
  const titles = new Map<string, string>()
  for (const part of chunks(usedSheets)) {
    const { data, error } = await db
      .from('exam_sheets')
      .select('id, code, title')
      .in('id', part)
    if (error) throw new Error(`시험지 조회 실패: ${error.message}`)
    for (const s of data ?? []) {
      titles.set(String(s.id), String(s.title ?? s.code ?? s.id))
    }
  }

  const out: TaskRow[] = []
  for (const sheetId of usedSheets) {
    const problemIds = items.filter((i) => i.sheetId === sheetId)
      .sort((a, b) => a.no - b.no)
      .map((i) => i.problemId)
    out.push({
      taskId: taskIdOfSource('exam_sheet', sheetId),
      studentId,
      label: titles.get(sheetId) ?? `시험지 ${sheetId}`,
      // 한 시험지에 여러 유형이 섞일 수 있다. 첫 문항의 유형을 적는다
      typeCode: typeOf(problemIds[0]),
      problemIds,
      assigned: true,
      provenance: 'operational',
    })
  }
  return out
}

export function operationalActionStore(
  content: ContentSnapshot, producer: string,
): LearningActionStore {
  const runId = learningRunId()
  const inner = new SupabaseLearningStore({ runId, producer })

  // 첫 세트 허용 문항 — **콘텐츠 장면이 읽어 온 것뿐**이다. 넓힐 길이 없다
  const allowed = new Set<string>(content.problems.map((p) => p.problemId))
  const typeOf = (problemId: string): string => {
    const p = content.problemById(problemId)
    return p === null ? '' : p.typeCode
  }

  return {
    backend: inner.backend,
    location: inner.location,
    // 운영에는 계획 초안 표가 **없다.** 숨기지 않는다
    planDraftPersisted: false,

    getStudent: (id) => inner.getStudent(id),

    listAssignedTasks: (studentId: string) =>
      operationalAssignedTasks(studentId, allowed, typeOf),

    findAttempt: (id, taskId, problemId) => inner.loadAttempt(id, taskId, problemId),
    listAttempts: (id) => inner.listAttempts(id),
    listEvents: (id) => inner.listEvents(id),
    listStudentsWithWork: () => inner.listStudentsWithWork(),

    /** 운영에는 계획 초안 표가 없다 — **없다고 돌려준다.** 빈 초안을 만들지 않는다 */
    async getPlanDraft(): Promise<null> { return null },

    async commit(req: CommitRequest): Promise<CommitOutcome> {
      const src = sourceOfTaskId(req.taskId)
      const r = await inner.applyAction({
        student: req.student,
        problemId: req.problemId,
        sourceKind: src.sourceKind,
        sourceRef: src.sourceRef,
        actionId: req.actionId,
        occurredAt: req.occurredAt,
        kind: req.kind,
        payload: req.payload,
        graded: req.graded,
        // 영상 관측은 기존 표(`video_watch_logs`)를 가리킨다. 아직 쓰지 않는다 —
        // 「재사용이 끝났다」고 적지 않기 위해 `null` 로 둔다 (§7.2 마지막 줄)
        watchLogId: null,
      })
      if (r.verdict === 'rejected') {
        throw new Error(`저장을 거부했습니다: ${r.reason ?? '사유 없음'}`)
      }
      // 되읽어 상태를 세운다 — 상태 칸을 믿지 않는다
      const attempt = await inner.loadAttempt(req.student.studentId, req.taskId, req.problemId)
      return {
        verdict: r.verdict,
        changedFields: r.changedFields,
        attempt,
        graded: r.graded,
        // 운영에는 저장할 표가 없다. `makePlanDraft` 를 부르지 않는다
        planDraft: null,
      }
    },
  }
}

export async function operationalDeps(): Promise<LearningDeps> {
  const content = await operationalContentSnapshot()
  return {
    mode: 'operational',
    content,
    store: operationalActionStore(content, OPERATIONAL_PRODUCER),
    auth: supabaseStudentAuth(),
    producer: OPERATIONAL_PRODUCER,
  }
}

export { confirmItemRefOf }
