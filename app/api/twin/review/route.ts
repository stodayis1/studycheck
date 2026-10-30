// 쌍둥이 후보 검수 API (GPT-EXEC-001 REV.2 작업 F · GPT-EXEC-002 §4)
//
// **원장 전용.** 두 겹으로 막는다 (D-046).
//   1) API: denyIfNotStaff(req, { adminOnly: true })
//   2) DB : RPC 본문의 public.is_admin()
//
// 관리자 동작에는 **요청 JWT가 담긴 클라이언트**를 쓴다. service-role 을 쓰지 않는다 (§190).
// service-role 로 부르면 auth.uid() 가 null 이라 RPC 가 forbidden 을 낸다 — 우회 경로가 없다.
//
// 저장소는 `createAdminRepository` 가 고른다. production 에서 fixture 면 fail closed 다 (§196).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { REJECT_REASONS, TwinRepositoryError, type RejectReason } from '@/lib/twin/repository'
import { createAdminRepository, TwinModeError } from '@/lib/twin/mode'
import { ReviewRequestZ, describeIssues } from '@/lib/twin/reviewApi'

const BUCKET = 'problem-images'

function bearer(req: Request): string {
  return (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
}

/** 오류를 안정적인 코드로 바꾼다. 정답·풀이·내부 SQL을 응답에 넣지 않는다 (§91·§193). */
function fail(e: unknown) {
  if (e instanceof TwinModeError) {
    // 설정 문제는 500이다. fixture 로 조용히 넘어가지 않는다
    return NextResponse.json({ error: '서버 설정이 올바르지 않아요.', code: e.code }, { status: 500 })
  }
  if (e instanceof TwinRepositoryError) {
    // bad_response·service_client_required·알 수 없는 DB 오류는 내부 오류로 처리한다 (§170).
    // 내부 SQL·정답·풀이를 응답에 담지 않는다.
    const status = e.code === 'forbidden' ? 403
      : e.code === 'not_found' ? 404
      : e.code === 'invalid_state' || e.code === 'student_publish_approval_required' ? 409
      : e.code === 'rpc_failed' || e.code === 'bad_response'
        || e.code === 'service_client_required' || e.code === 'not_supported' ? 500
      : 400
    return NextResponse.json({ error: message(e.code), code: e.code }, { status })
  }
  return NextResponse.json({ error: '처리하지 못했어요.', code: 'unknown' }, { status: 500 })
}

function message(code: string): string {
  switch (code) {
    case 'forbidden':                     return '권한이 없습니다.'
    case 'not_found':                     return '해당 항목을 찾을 수 없어요.'
    case 'invalid_state':                 return '지금 상태에서는 할 수 없는 동작이에요.'
    case 'unknown_edit_key':              return '허용되지 않은 항목을 수정하려고 했어요.'
    case 'reason_required':               return '거부 사유를 골라주세요.'
    case 'empty_problem_text':            return '문제 본문이 비어 있어요.'
    case 'empty_answer':                  return '정답이 비어 있어요.'
    case 'empty_type_code':               return '유형이 비어 있어 승인할 수 없어요.'
    case 'invalid_answer_kind':           return '정답 종류가 올바르지 않아요.'
    case 'invalid_json_type':             return '목록 형식이 올바르지 않아요.'
    case 'invalid_request':               return '요청 내용이 올바르지 않아요.'
    case 'student_publish_approval_required':        return '학생 게시 안전검수를 먼저 마쳐야 게시할 수 있어요.'
    case 'unknown_validation_key':        return '허용되지 않은 검증 항목이에요.'
    case 'validation_invariant_violation': return '검증 상태가 서로 맞지 않아요.'
    default:                              return '처리하지 못했어요.'
  }
}

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  try {
    const { repo, mode } = createAdminRepository(bearer(req))
    const pairs = await repo.listPendingReview(50)

    // 원문 이미지는 비공개 버킷이라 서버에서 signed URL 을 만든다 (기존 패턴).
    // 이건 읽기 전용이라 service-role 을 써도 권한 우회가 아니다.
    const paths = pairs.map(p => p.source.image_path).filter((p): p is string => !!p)
    const signed = new Map<string, string>()
    if (paths.length > 0) {
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY
      if (url && key) {
        const db = createClient(url, key, { auth: { persistSession: false } })
        const { data } = await db.storage.from(BUCKET).createSignedUrls(paths, 7200)
        for (const u of data ?? []) {
          if (u.signedUrl && !u.error) signed.set(u.path, u.signedUrl)
        }
      }
    }

    return NextResponse.json({
      pairs: pairs.map(p => ({
        ...p,
        source: {
          ...p.source,
          image_url: p.source.image_path ? signed.get(p.source.image_path) ?? null : null,
        },
      })),
      rejectReasons: REJECT_REASONS,
      // 화면의 "연습용 예시 데이터" 배너는 이 값이 fixture 일 때만 뜬다
      dataSource: mode,
    })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  const raw: unknown = await req.json().catch((): null => null)
  if (!raw) return NextResponse.json({ error: '요청을 읽을 수 없어요.' }, { status: 400 })

  // §316: 동작별 모양을 먼저 검사한다.
  // 배열 자리에 문자열이 오거나 허용되지 않은 편집 키가 섞이면 여기서 막힌다.
  // 조용히 캐스팅하지 않는다. 최종 권위는 여전히 DB CHECK 와 RPC 다.
  const parsed = ReviewRequestZ.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: '요청 내용이 올바르지 않아요.', code: 'invalid_request', detail: describeIssues(parsed.error) },
      { status: 400 },
    )
  }
  const body = parsed.data

  try {
    const { repo } = createAdminRepository(bearer(req))

    switch (body.action) {
      case 'approve': {
        const practiceId = await repo.approve(body.candidateId, body.edits ?? {})
        return NextResponse.json({ ok: true, practiceProblemId: practiceId })
      }
      case 'reject': {
        // 거부 사유는 반드시 받는다. 프롬프트 개선의 입력이 된다
        if (!REJECT_REASONS.includes(body.reason as RejectReason))
          return bad('거부 사유를 골라주세요.')
        await repo.reject(body.candidateId, body.reason as RejectReason)
        return NextResponse.json({ ok: true })
      }
      case 'publish':
      case 'unpublish': {
        await repo.setPublication(body.practiceProblemId, body.action === 'publish')
        return NextResponse.json({ ok: true })
      }
      case 'approve_student_publish':
      case 'revoke_student_publish': {
        // D-048: 켤 수도 끌 수도 있다. 최초 승인 이력은 DB가 보존한다
        await repo.setStudentPublishApproval(
          body.practiceProblemId, body.action === 'approve_student_publish')
        return NextResponse.json({ ok: true })
      }
    }
  } catch (e) {
    return fail(e)
  }
}

function bad(msg: string) {
  return NextResponse.json({ error: msg }, { status: 400 })
}
