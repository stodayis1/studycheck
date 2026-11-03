/**
 * 첫 세트 **검수용 읽기** — 원장 전용 (045 이어서)
 *
 * 무엇을 돌려주나
 *   정해진 범위 그대로다 — 유형 2개 · 문항 최대 10개 · 영상 최대 3편.
 *   원문·영상·확인 문제 후보를 **한 화면에서 같이 보도록** 묶어 준다.
 *   그리고 지금 승인 명세(`approvals/first-set.approval.json`)의 상태를 함께 준다.
 *
 * ⚠️ 인가 — AGENTS.md 「서버 API 규칙」 · safe-change 점검표 §4
 *   이 경로는 `SUPABASE_SERVICE_ROLE_KEY` 로 RLS 를 우회한다. 그래서 **첫 줄에서** 막는다.
 *   화면이 원장 전용이므로 **API 도 `adminOnly: true`** 다 — 강사가 주소로 직접 불러도 막힌다.
 *   로컬 체험판에는 Supabase 세션이 없으므로 `app/api/learning/teacher` 와 **같은 방식**으로
 *   시험 강사 쿠키를 받는다. 그 쿠키는 운영에서 통하지 않는다 (`mode.ts`).
 *
 * ⚠️ 정답
 *   `POST` 가 아니라 `GET` 으로 **원장님에게만** 보낸다. 노출 검수는 「이 영상이 이 원문의
 *   답을 드러내는가」를 판단하는 일이라, 판단하는 사람은 그 답을 봐야 한다.
 *   **학생 경로(`/api/learning/act`·`session`)에는 정답이 가지 않는다** — 그 쪽은
 *   `forStudent()` 허용 목록을 지난다. 두 경로를 섞지 않는다.
 *
 * `POST` 는 **승인 명세 글자를 만들어 준다.** 원장님이 JSON 을 손으로 쓰지 않는다.
 *   로컬에서는 파일에 쓰고, 운영(읽기 전용 파일시스템)에서는 글자를 돌려준다 —
 *   어느 쪽이었는지 응답에 적는다. **조용히 실패하지 않는다.**
 */
import { writeFileSync } from 'node:fs'

import { NextResponse } from 'next/server'

import { denyIfNotStaff } from '@/lib/apiAuth'
import {
  approvalSpecPath, loadApprovalSpec, parseApprovalSpec, __clearApprovalSpecCache,
  type ApprovalSpec,
} from '@/lib/learning/approval'
import { ASSETS, PROBLEMS, PILOT_TYPES, relationsFor as demoRelationsFor } from '@/lib/learning/catalog'
import { learningMode } from '@/lib/learning/mode'
import { signProblemImages } from '@/lib/learning/operationalDeps'
import { FIRST_SET, NotConfiguredError, type VideoReadiness } from '@/lib/learning/providers'
import { isStaffRequest } from '@/lib/learning/session'
import { supabaseContentProvider } from '@/lib/learning/supabaseContent'
import { sceneSeconds } from '@/lib/learning/supabaseContent'

/** 모드에 맞는 인가. 운영은 기존 직원 인가(원장 전용), 로컬은 시험 강사 쿠키 */
async function denyUnlessAdmin(req: Request): Promise<NextResponse | null> {
  if (learningMode() === 'operational') return denyIfNotStaff(req, { adminOnly: true })
  if (!isStaffRequest(req)) {
    return NextResponse.json(
      { ok: false, error: '강사 세션이 아닙니다 (학생 세션으로는 열리지 않습니다)' },
      { status: 403 },
    )
  }
  return null
}

type ProblemForReview = {
  problemId: string
  typeCode: string
  localNo: string | null
  book: string | null
  /** 지문 글자. 운영 문항은 비어 있다 (본문이 그림이다) */
  stem: string
  choices: string[] | null
  answerKind: string
  /** **원장님만** 본다. 노출 검수의 판단 근거다 */
  answer: string
  /** 원문 그림의 서명된 임시 주소 */
  imageUrl: string | null
  /** 해설 그림이 **있는지만** 알려 준다. 주소는 서명하지 않는다 */
  hasAnswerImage: boolean
  autoGradable: boolean
}

type VideoForReview = {
  assetId: string
  title: string
  videoKind: string | null
  durationSeconds: number | null
  youtubeId: string | null
  typeCodes: string[]
  /** `lesson_videos.scenes` 를 **읽은 그대로**. 초가 숫자가 아닌 장면도 그대로 보인다 */
  scenes: Array<{
    sceneNo: number
    label: string | null
    rawStart: unknown
    rawEnd: unknown
    /** 초가 **쓸 수 있는 값인가.** 아니면 null — 0 으로 채우지 않는다 */
    usable: { startSeconds: number; endSeconds: number } | null
  }>
  readiness: VideoReadiness | null
}

export async function GET(req: Request) {
  const deny = await denyUnlessAdmin(req)
  if (deny) return deny

  try {
    const spec: ApprovalSpec = loadApprovalSpec()
    const mode = learningMode()

    if (mode === 'local_demo') {
      // 로컬 체험판 — **시연 자료**로 화면 모양을 본다. 운영 자료가 아니라고 적는다
      const problems: ProblemForReview[] = PROBLEMS.map((p) => ({
        problemId: p.problemId,
        typeCode: p.typeCode,
        localNo: p.localNo ?? null,
        book: p.book ?? null,
        stem: p.stem,
        choices: p.choices,
        answerKind: p.answerKind ?? (p.choices === null ? 'number' : 'choice'),
        answer: p.answer,
        imageUrl: null as string | null,
        hasAnswerImage: false,
        autoGradable: p.taskGoal !== 'prove',
      }))
      const videos: VideoForReview[] = ASSETS.filter((a) => a.kind === 'video').map((a) => ({
        assetId: a.assetId,
        title: a.title,
        videoKind: a.videoKind,
        durationSeconds: a.durationSeconds,
        youtubeId: null as string | null,
        typeCodes: a.typeCodes ?? [],
        scenes: (a.scenes ?? []).map((sc, i) => ({
          sceneNo: i + 1,
          label: sc.label ?? null,
          rawStart: sc.start,
          rawEnd: sc.end,
          usable: sceneSeconds(sc, a.durationSeconds),
        })),
        readiness: null as VideoReadiness | null,
      }))
      return NextResponse.json({
        ok: true,
        mode,
        contentSource: 'demo',
        note: '로컬 체험판의 **시연 자료**입니다. 운영 문항·운영 영상이 아닙니다. '
          + '화면 모양을 보기 위한 것이며, 이 화면에서 승인해도 운영에 쓰이지 않습니다.',
        scope: FIRST_SET,
        types: PILOT_TYPES.map((t) => ({ typeCode: t.typeCode, title: t.title, chapter: t.chapter })),
        problems,
        videos,
        spec,
        specPath: approvalSpecPath(),
        // 시연에서는 이미 승인된 관계가 카탈로그에 있다 — 그대로 보여 준다
        demoRelations: PROBLEMS.flatMap((p) => demoRelationsFor(p.problemId).map((r) => ({
          relationId: r.relationId, problemId: p.problemId, assetId: r.contentRef.id,
          exposure: r.exposureReview?.verdict ?? null,
          confirmItems: (r.confirmItems ?? []).length,
        }))),
      })
    }

    // ── 운영 ──────────────────────────────────────────────────────
    const provider = supabaseContentProvider()
    const [types, rawProblems, rawVideos] = await Promise.all([
      provider.listTypes(), provider.listProblems(), provider.listAssets(),
    ])
    const readiness = provider.videoReadiness === undefined ? [] : await provider.videoReadiness()
    const images = await signProblemImages(rawProblems)

    const problems: ProblemForReview[] = rawProblems.map((p) => ({
      problemId: p.problemId,
      typeCode: p.typeCode,
      localNo: p.localNo ?? null,
      book: p.book ?? null,
      stem: p.stem,
      choices: p.choices,
      answerKind: p.answerKind ?? 'image',
      answer: p.answer,
      imageUrl: images.get(p.problemId) ?? null,
      // 해설 그림은 **있는지만**. 주소를 만들지 않는다
      hasAnswerImage: p.answerImagePath !== null && p.answerImagePath !== undefined
        && String(p.answerImagePath).trim() !== '',
      autoGradable: true,   // listProblems 가 자동 채점 가능한 것만 넣는다
    }))

    const byId = new Map(readiness.map((r) => [r.videoId, r]))
    const videos: VideoForReview[] = rawVideos.map((a) => ({
      assetId: a.assetId,
      title: a.title,
      videoKind: a.videoKind,
      durationSeconds: a.durationSeconds,
      youtubeId: a.src === null ? null : (a.src.match(/\/embed\/([\w-]{11})/) ?? [])[1] ?? null,
      typeCodes: a.typeCodes ?? [],
      scenes: (a.scenes ?? []).map((sc, i) => ({
        sceneNo: i + 1,
        label: sc.label ?? null,
        // **읽은 그대로** 보여 준다 — null·빈 글자도 숨기지 않는다
        rawStart: sc.start,
        rawEnd: sc.end,
        usable: sceneSeconds(sc, a.durationSeconds),
      })),
      readiness: byId.get(a.assetId) ?? null,
    }))

    return NextResponse.json({
      ok: true,
      mode,
      contentSource: 'supabase',
      note: `운영 조회입니다. 문항 ${problems.length}개 · 영상 ${videos.length}편 · `
        + `유형 ${types.length}개. 정답은 **노출 검수 판단용**이며 학생 경로로는 가지 않습니다.`,
      scope: FIRST_SET,
      types,
      problems,
      videos,
      spec,
      specPath: approvalSpecPath(),
      demoRelations: [],
    })
  } catch (e) {
    if (e instanceof NotConfiguredError || (e as { notConfigured?: boolean })?.notConfigured) {
      return NextResponse.json({
        ok: false, mode: 'operational',
        error: '운영 학습 설정이 없습니다',
        why: '시험 자료로 대신하지 않습니다 (EXEC-043 §3-A).',
      }, { status: 503 })
    }
    return NextResponse.json({
      ok: false,
      error: '첫 세트를 읽지 못했습니다',
      why: (e as Error).message,
    }, { status: 500 })
  }
}

/**
 * 승인 명세를 **만들어 준다.** 원장님이 JSON 을 손으로 쓰지 않는다.
 *
 * 받는 것은 화면에서 누른 결정뿐이다. 모양 검사는 `parseApprovalSpec` 이 한다 —
 * 틀린 줄은 **던지고**, 무엇이 틀렸는지 그대로 알린다.
 */
export async function POST(req: Request) {
  const deny = await denyUnlessAdmin(req)
  if (deny) return deny

  const raw: unknown = await req.json().catch((): unknown => undefined)
  if (raw === null || typeof raw !== 'object') {
    return NextResponse.json({ ok: false, error: '본문을 읽을 수 없습니다' }, { status: 400 })
  }
  const body = raw as Record<string, unknown>

  // 모양을 **여기서** 검사한다. 통과하지 못하면 파일에 쓰지 않는다
  let spec: ApprovalSpec
  try {
    spec = parseApprovalSpec(body.spec)
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: '승인 명세 모양이 올바르지 않습니다',
      why: (e as Error).message,
    }, { status: 400 })
  }

  const text = `${JSON.stringify({
    specVersion: spec.specVersion,
    specNote: spec.specNote,
    whoApproves: '윤T 또는 윤T가 지정한 검수자. 이 글자는 검수 화면이 만든 것이다.',
    problemRoles: spec.problemRoles,
    relations: spec.relations,
  }, null, 2)}\n`

  const path = approvalSpecPath()
  // 운영(Vercel)은 파일시스템이 읽기 전용이다. 쓰지 못하면 **글자를 돌려준다** —
  // 조용히 성공으로 넘기지 않는다
  let written = false
  let writeError: string | null = null
  try {
    writeFileSync(path, text, 'utf8')
    written = true
    __clearApprovalSpecCache()
  } catch (e) {
    writeError = (e as Error).message
  }

  return NextResponse.json({
    ok: true,
    written,
    path: written ? path : null,
    writeError,
    relations: spec.relations.length,
    text,
    note: written
      ? '승인 명세 파일에 **썼습니다.** 화면을 새로고침하면 반영됩니다.'
      : '이 환경은 파일시스템이 읽기 전용입니다. 아래 글자를 내려받아 저장소의 '
        + 'lib/learning/approvals/first-set.approval.json 에 넣어야 반영됩니다.',
  })
}
