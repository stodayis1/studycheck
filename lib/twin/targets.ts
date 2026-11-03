// 쌍둥이 생성 대상 문항 선정 (GPT-EXEC-001 작업 D-1)
//
// 대상 조건 (D-025 · D-032)
//   twin_id is null            아직 쌍둥이가 없다
//   answer_text is not null    정답 텍스트가 있어야 서버 판정·누출 검사·비교가 가능하다
//   answer_kind in (number, choice)   파일럿 범위
//   is_essay = false           서술형은 채점 기준이 사람 판단이다 (null 도 제외 — D-082)
//   image_path 있음            **모델이 원문을 볼 유일한 통로다** (D-088)
//
// `answer_text` 가 없는 문항을 막는 **첫 번째 지점**이다.
// (두 번째는 질문 시작 API, 세 번째는 학생 화면 버튼 — D-025)

import { z } from 'zod'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type SourceProblem = {
  id: number                  // bigint. uuid 아니다
  book: string | null
  grade: string | null
  semester: number | null
  type_code: string | null
  step: string | null
  difficulty: string | null
  answer_kind: 'number' | 'choice'
  answer_text: string
  image_path: string | null

  // D-077: 파이프라인이 **실제 값**을 다시 보려면 여기에 실려 있어야 한다.
  // 예전에는 pipeline 이 twin_id=null·is_essay=false 를 상수로 넣어 검사해서,
  // 사실상 아무것도 검사하지 않았다.
  twin_id: number | null
  is_essay: boolean
}

export type TypeCandidate = {
  type_code: string
  grade: string | null
  chapter_title: string | null
  type_title: string | null
  eligible: number            // 조건을 만족하는 원문 수
  number_count: number
  choice_count: number
}

/**
 * `server_list_eligible_twin_types` 응답 계약 (§243).
 *
 * `.strict()` 라 RPC 가 필드를 더 주면 **거기서 멈춘다.** 조용히 무시하지 않는다 —
 * 계약이 바뀐 것을 모른 채 파일럿 유형을 고르면 안 된다.
 */
const TypeCandidateZ = z.object({
  type_code: z.string(),
  grade: z.string().nullable(),
  chapter_title: z.string().nullable(),
  type_title: z.string().nullable(),
  eligible: z.number().int().nonnegative(),
  number_count: z.number().int().nonnegative(),
  choice_count: z.number().int().nonnegative(),
}).strict()

const EligibleTypesEnvelopeZ = z.object({
  items: z.array(TypeCandidateZ),
}).strict()

export function serverClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase 서버 설정이 없습니다.')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** 한 유형에서 생성 대상 원문을 고른다. 부족하면 있는 만큼만 준다. */
export async function pickSourceProblems(
  db: SupabaseClient,
  typeCode: string,
  limit: number,
): Promise<SourceProblem[]> {
  const { data, error } = await db
    .from('problems')
    .select('id, book, grade, semester, type_code, step, difficulty, answer_kind, answer_text, image_path, is_essay, twin_id')
    .eq('type_code', typeCode)
    .is('twin_id', null)
    .not('answer_text', 'is', null)
    .in('answer_kind', ['number', 'choice'])
    .eq('is_essay', false)
    // D-088: 이미지가 없으면 모델이 원문을 볼 방법이 없다 (problem_ocr 은 아직 늘 null).
    .not('image_path', 'is', null)
    // D-095: **알려진 빈 문자열을 limit 보다 먼저 제외한다.**
    //   null 만 걸러 두면, 빈 문자열 행이 id 순서상 앞에 있을 때 그 행들이 limit 을 채워
    //   유효한 원문을 밀어낸다. 그러면 유형 RPC 는 "생성 가능 5개 이상" 이라고 세었는데
    //   실제 원문 선택은 중간에 실패한다.
    //   공백만 있는 값은 PostgREST 로 거르기 어려우므로 isEligible()·toSourceProblem() 이
    //   계속 fail closed 로 막는다 — 조용히 정상값으로 고치지 않는다.
    .neq('answer_text', '')
    .neq('image_path', '')
    .order('id')
    .limit(limit)

  if (error) throw new Error(`대상 문항 조회 실패: ${error.message}`)
  return (data ?? []).map(toSourceProblem)
}

/**
 * 안전장치 — 조회 결과가 조건을 정말 만족하는지 한 번 더 본다.
 *
 * 쿼리 조건이 바뀌거나 누가 필터를 빠뜨려도 여기서 걸린다.
 * `answer_text` 없는 문항이 생성 대상에 섞이는 것이 D-025 위반이라 이중으로 막는다.
 */
export function isEligible(p: {
  twin_id?: number | null
  answer_text?: string | null
  answer_kind?: string | null
  is_essay?: boolean | null
  image_path?: string | null
}): boolean {
  if (p.twin_id != null) return false
  if (p.answer_text == null || p.answer_text.trim() === '') return false
  if (p.answer_kind !== 'number' && p.answer_kind !== 'choice') return false
  // D-082: **명시적 false 만** 대상이다. null 은 "서술형이 아님"이 아니라 **미확인**이다.
  // 예전에는 `is_essay === true` 만 걸러서, 미확인 문항이 일반문항으로 통과했다.
  if (p.is_essay !== false) return false
  // D-088: 지금 모델 입력은 이미지 하나뿐이다 (`buildGenerationInput` 의 problem_ocr 은 늘 null).
  // 이미지가 없으면 모델은 **원문 문제를 전혀 보지 못한 채** 쌍둥이를 만든다.
  if (p.image_path == null || p.image_path.trim() === '') return false
  return true
}

/**
 * 조용한 보정을 하지 않는다. 타입이 이상하면 그 조회를 실패시킨다 (§112).
 *
 * D-082: **null 도 실패다.** 예전에는 null 을 false 로 바꿨는데, 그러면
 * "서술형인지 아직 모르는" 문항이 일반문항으로 생성 대상에 들어간다.
 */
function strictBool(v: unknown, field: string, id: unknown): boolean {
  if (v === true || v === false) return v
  throw new Error(
    `대상 문항 조회 실패: ${field} 가 true/false 가 아닙니다 (id=${id}, 값 종류=${v === null ? 'null' : typeof v})`,
  )
}

function strictNullableNumber(v: unknown, field: string, id: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v)
  throw new Error(`대상 문항 조회 실패: ${field} 가 숫자가 아닙니다 (id=${id}, 값 종류=${typeof v})`)
}

export function toSourceProblem(row: Record<string, unknown>): SourceProblem {
  if (!isEligible(row)) {
    // 어떤 조건에서 걸렸는지 보이게 쓴다. is_essay 가 빠져 있어 D-082 위반을 진단하기 어려웠다.
    // 정답 **값**은 넣지 않는다 (있음/null 만).
    throw new Error(
      `대상 문항 조회 실패: 대상 조건을 만족하지 않는 문항이 선정됐습니다 (id=${row.id}). ` +
      `answer_kind=${row.answer_kind} answer_text=${row.answer_text == null ? 'null' : '있음'} ` +
      `twin_id=${row.twin_id} is_essay=${row.is_essay === null ? 'null' : row.is_essay} ` +
      `image_path=${row.image_path == null || String(row.image_path).trim() === '' ? '없음' : '있음'}`,
    )
  }
  return {
    id: Number(row.id),
    book: (row.book as string) ?? null,
    grade: (row.grade as string) ?? null,
    semester: row.semester == null ? null : Number(row.semester),
    type_code: (row.type_code as string) ?? null,
    step: (row.step as string) ?? null,
    difficulty: (row.difficulty as string) ?? null,
    answer_kind: row.answer_kind as 'number' | 'choice',
    answer_text: row.answer_text as string,
    image_path: (row.image_path as string) ?? null,
    twin_id: strictNullableNumber(row.twin_id, 'twin_id', row.id),
    is_essay: strictBool(row.is_essay, 'is_essay', row.id),
  }
}

/**
 * 쌍둥이가 전혀 없는 유형 중 생성 대상이 될 수 있는 것을 센다.
 *
 * 유형 하나라도 쌍둥이를 가지고 있으면 제외한다 — D-018·D-026이
 * 유형 단위로 동작하므로 유형에 대표 예제가 하나 있으면 충분하다.
 */
export async function listEligibleTypes(
  db: SupabaseClient,
  opts: { minEligible?: number; grade?: string } = {},
): Promise<TypeCandidate[]> {
  const minEligible = opts.minEligible ?? 5
  // 설치 SQL 의 service_role 전용 RPC 를 부른다 (GPT-EXEC-006 §274).
  // 이전 판은 존재하지 않는 `twin_eligible_types` 를 불러 런타임 오류로 끝났다.
  const { data, error } = await db.rpc('server_list_eligible_twin_types', {
    p_min_eligible: minEligible,
    p_grade: opts.grade ?? null,
  })
  if (error) throw new Error(`유형 집계 실패: ${error.message}`)

  // RPC 는 jsonb { items: [...] } 를 준다. 모양이 다르면 빈 목록으로 넘기지 않는다 —
  // 조용히 0건이 되면 "대상 유형이 없다"는 잘못된 결론이 난다.
  // §243: 타입 단언으로 통과시키지 않는다. 계약이 깨지면 조용히 이상한 목록이 나온다
  const parsed = EligibleTypesEnvelopeZ.safeParse(data)
  if (!parsed.success) {
    throw new Error(
      '유형 집계 응답 모양이 올바르지 않습니다: ' +
      parsed.error.issues.slice(0, 3).map(i => `${i.path.join('.')}: ${i.message}`).join(' / '),
    )
  }
  // strictNullChecks 가 꺼져 있어 Zod 의 nullable 추론이 그대로 맞지 않는다 (AGENTS.md 함정 3).
  // 필드를 명시적으로 옮긴다 — 계약 밖 필드가 딸려 오지 않는 효과도 있다.
  return parsed.data.items.map((t): TypeCandidate => ({
    type_code: t.type_code,
    grade: t.grade ?? null,
    chapter_title: t.chapter_title ?? null,
    type_title: t.type_title ?? null,
    eligible: t.eligible,
    number_count: t.number_count,
    choice_count: t.choice_count,
  }))
}
