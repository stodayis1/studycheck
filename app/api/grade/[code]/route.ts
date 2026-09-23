// 시험지 QR 채점 화면이 쓰는 서버 API.
// 문제은행 테이블(problems, standard_types, exam_sheets...)은 RLS로 잠가 두었기 때문에
// 여기(서버)에서만 service_role 키로 읽는다. 브라우저로는 정답이 새어 나가지 않는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sourceLabel } from '@/lib/problemSource'
import { denyIfNotStaff } from '@/lib/apiAuth'

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

// '③, ⑤' -> ['3','5']
const CIRCLE = '①②③④⑤'
function choiceDigits(text: string | null): string[] {
  if (!text) return []
  return Array.from(text)
    .filter((c) => CIRCLE.includes(c))
    .map((c) => String(CIRCLE.indexOf(c) + 1))
}

// ───────────────────── 시험지 불러오기 ─────────────────────
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = db()

  const { data: sheet, error: e1 } = await supabase
    .from('exam_sheets')
    .select('id, code, title, grade, semester, note')
    .eq('code', code)
    .maybeSingle()

  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 })
  if (!sheet) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 })

  // ?full=1  선생님 채점 화면 전용 (학생 화면에는 안 준다)
  // ?images=1 문제 그림까지 — 「상세」를 펼칠 때만 부른다.
  //           격자에는 정답만 있으면 되는데 문제 그림 24장을 미리 받느라 느렸다.
  const sp = new URL(_req.url).searchParams
  const full = sp.get('full') === '1'
  const wantImages = full && sp.get('images') === '1'
  if (full) {
    const deny = await denyIfNotStaff(_req)
    if (deny) return deny
  }

  // 문항과 학생 목록은 서로 상관이 없으니 같이 부른다 (순서대로 부르면 그만큼 느려진다)
  const [{ data: rows, error: e2 }, { data: students }] = await Promise.all([
    supabase
      .from('exam_sheet_problems')
      .select(
        'no, problem_id, problems(id, book, grade, semester, sub_chapter_title, page_no, local_no, type_code, difficulty, answer_kind, answer_text, answer_image_path, image_path, is_essay)'
      )
      .eq('sheet_id', sheet.id)
      .order('no'),
    supabase
      .from('students')
      .select('id, name, grade, class_time, teacher_name')
      .eq('is_active', true)
      .order('name')
      .limit(2000),
  ])

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  const codes = Array.from(
    new Set((rows ?? []).map((r: any) => r.problems?.type_code).filter(Boolean))
  )
  // 임시 주소를 만들 그림만 고른다.
  //  · 정답 그림: 글자 정답이 없는 문항만 (대부분은 글자라 만들 게 거의 없다)
  //  · 문제 그림: 「상세」를 펼칠 때만
  const paths = (rows ?? [])
    .flatMap((r: any) => [
      r.problems?.answer_text ? null : r.problems?.answer_image_path,
      wantImages ? r.problems?.image_path : null,
    ])
    .filter(Boolean) as string[]

  const [typesRes, urlsRes] = await Promise.all([
    codes.length
      ? supabase.from('standard_types').select('code, type_title').in('code', codes)
      : Promise.resolve({ data: [] as any[] }),
    paths.length
      ? supabase.storage.from(BUCKET).createSignedUrls(paths, 7200)
      : Promise.resolve({ data: [] as any[] }),
  ])

  const typeTitle = new Map<string, string>()
  ;(typesRes.data ?? []).forEach((t: any) => typeTitle.set(t.code, t.type_title))
  const signed = new Map<string, string>()
  ;(urlsRes.data ?? []).forEach((u: any) => {
    if (u.signedUrl && !u.error) signed.set(u.path, u.signedUrl)
  })

  const problems = (rows ?? []).map((r: any) => {
    const p = r.problems
    return {
      no: r.no,
      problemId: p?.id ?? r.problem_id,
      source: sourceLabel(p),
      difficulty: p?.difficulty ?? null,
      typeCode: p?.type_code ?? null,
      typeTitle: p?.type_code ? typeTitle.get(p.type_code) ?? null : null,
      answerKind: p?.answer_kind ?? 'image',
      isEssay: !!p?.is_essay,
      answerText: p?.answer_text ?? null,
      answerChoices: choiceDigits(p?.answer_text ?? null),
      answerImage: p?.answer_image_path ? signed.get(p.answer_image_path) ?? null : null,
      image: wantImages && p?.image_path ? signed.get(p.image_path) ?? null : null,
    }
  })

  return NextResponse.json({
    sheet,
    problems,
    students: (students ?? []).filter((s: any) => !!s.name),
  })
}

// ───────────────────── 채점 결과 저장 ─────────────────────
export async function POST(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const supabase = db()
  const body = await req.json()

  const { data: sheet } = await supabase
    .from('exam_sheets')
    .select('id')
    .eq('code', code)
    .maybeSingle()

  if (!sheet) return NextResponse.json({ error: '시험지를 찾을 수 없습니다.' }, { status: 404 })

  const answers: {
    no: number
    problemId: number | null
    typeCode: string | null
    studentAnswer: string
    isCorrect: boolean
    kind?: 'choice' | 'number' | 'image' | 'essay'
    photoPath?: string | null
    gradedBy?: string
  }[] = body.answers ?? []

  // 서술형은 학생이 올린 풀이 사진을 선생님이 채점한다 → 채점 대기(is_correct = null)로 저장
  answers.forEach((a) => {
    if (a.kind === 'essay') {
      a.photoPath = a.photoPath && a.photoPath.startsWith(`${code}/`) ? a.photoPath : null
      a.isCorrect = null as any
      a.gradedBy = 'teacher_pending'
    } else {
      a.photoPath = null
      a.gradedBy = a.kind === 'image' ? 'self' : 'auto'
    }
  })

  const score = answers.filter((a) => a.isCorrect).length

  const { data: grading, error: e1 } = await supabase
    .from('gradings')
    .insert({
      sheet_id: sheet.id,
      student_id: body.studentId ?? null,
      student_name: body.studentName ?? null,
      score,
      total: answers.length,
      submitted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (e1 || !grading) {
    return NextResponse.json({ error: e1?.message ?? '저장 실패' }, { status: 500 })
  }

  const { error: e2 } = await supabase.from('grading_answers').insert(
    answers.map((a) => ({
      grading_id: grading.id,
      no: a.no,
      problem_id: a.problemId,
      type_code: a.typeCode,
      student_answer: a.studentAnswer,
      is_correct: a.isCorrect,
      graded_by: a.gradedBy ?? null,
      photo_path: a.photoPath ?? null,
    }))
  )

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({ ok: true, gradingId: grading.id, score, total: answers.length })
}
