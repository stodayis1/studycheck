// 선생님용 답지·해설지 API
//   GET /api/answer-key?code=XXXXXX
//
// 답지 = 번호별 정답 한 줄.  해설지 = 해설집에서 잘라 둔 풀이 그림.
// 쎈B 문항은 해설집이 없어서, 쌍둥이(숫자만 다른 같은 문제)인 쎈 문항의 풀이를 대신 보여 준다.
// 문제은행은 RLS로 잠겨 있어 여기(서버)에서 service_role 키로 읽는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { sourceLabel } from '@/lib/problemSource'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BUCKET = 'problem-images'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const CIRCLE = '①②③④⑤'

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const code = new URL(req.url).searchParams.get('code')
  if (!code) return NextResponse.json({ error: '시험지 코드가 없습니다.' }, { status: 400 })

  const s = db()
  const { data: sheet } = await s
    .from('exam_sheets')
    .select('id, code, title, grade, semester, created_at')
    .eq('code', code)
    .maybeSingle()
  if (!sheet) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 })

  const { data: rows } = await s
    .from('exam_sheet_problems')
    .select(
      'no, problem_id, problems(id, book, grade, semester, sub_chapter_title, page_no, local_no, type_code, difficulty, answer_text, answer_image_path, solution_image_path, is_essay, twin_id)'
    )
    .eq('sheet_id', sheet.id)
    .order('no')
  const list = (rows ?? []) as any[]

  // 풀이가 없는 문항은 쌍둥이의 풀이를 빌린다
  const twinIds = list
    .filter((r) => r.problems && !r.problems.solution_image_path && r.problems.twin_id)
    .map((r) => r.problems.twin_id)
  const twins: Record<number, any> = {}
  if (twinIds.length) {
    const { data: tw } = await s
      .from('problems')
      .select('id, book, grade, semester, page_no, local_no, solution_image_path, answer_text')
      .in('id', Array.from(new Set(twinIds)))
    ;(tw ?? []).forEach((t: any) => (twins[t.id] = t))
  }

  const codes = Array.from(new Set(list.map((r) => r.problems?.type_code).filter(Boolean)))
  const typeTitle = new Map<string, string>()
  if (codes.length) {
    const { data: types } = await s.from('standard_types').select('code, type_title').in('code', codes)
    ;(types ?? []).forEach((t: any) => typeTitle.set(t.code, t.type_title))
  }

  // 임시 주소를 만들 그림 모으기
  const paths: string[] = []
  for (const r of list) {
    const p = r.problems
    if (!p) continue
    const own = p.solution_image_path
    const borrowed = !own && p.twin_id ? twins[p.twin_id]?.solution_image_path : null
    if (own || borrowed) paths.push(own || borrowed)
    if (!p.answer_text && p.answer_image_path) paths.push(p.answer_image_path)
  }
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await s.storage.from(BUCKET).createSignedUrls(paths, 7200)
    ;(urls ?? []).forEach((u: any) => {
      if (u.signedUrl && !u.error) signed.set(u.path, u.signedUrl)
    })
  }

  const problems = list.map((r) => {
    const p = r.problems
    const twin = p?.twin_id ? twins[p.twin_id] : null
    const own = p?.solution_image_path
    const borrowed = !own && twin?.solution_image_path ? twin.solution_image_path : null
    return {
      no: r.no,
      source: sourceLabel(p),
      difficulty: p?.difficulty ?? null,
      typeTitle: p?.type_code ? typeTitle.get(p.type_code) ?? null : null,
      isEssay: !!p?.is_essay,
      answerText: p?.answer_text ?? null,
      // 동그라미 숫자만 있는 답은 답지에서 크게 보여 준다
      choices: String(p?.answer_text ?? '').split('').filter((c) => CIRCLE.includes(c)),
      answerImage: !p?.answer_text && p?.answer_image_path ? signed.get(p.answer_image_path) ?? null : null,
      solution: own ? signed.get(own) ?? null : borrowed ? signed.get(borrowed) ?? null : null,
      // 쌍둥이 풀이를 빌려 왔으면 어디 것인지 밝힌다 (숫자가 달라 답은 다르다)
      solutionFrom: own ? null : borrowed ? sourceLabel(twin) : null,
      // 쌍둥이 풀이는 **답이 다르다**(숫자만 바꾼 문제라서). 그 답도 같이 줘서
      // 선생님이 "답이랑 해설이 안 맞네" 하고 헷갈리지 않게 한다.
      solutionFromAnswer: own ? null : borrowed ? twin?.answer_text ?? null : null,
    }
  })

  return NextResponse.json({ sheet, problems })
}
