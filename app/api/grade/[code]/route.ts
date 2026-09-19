// 시험지 QR 채점 화면이 쓰는 서버 API.
// 문제은행 테이블(problems, standard_types, exam_sheets...)은 RLS로 잠가 두었기 때문에
// 여기(서버)에서만 service_role 키로 읽는다. 브라우저로는 정답이 새어 나가지 않는다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { aiGrade } from '@/lib/aiGrade'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const maxDuration = 120 // AI 채점(여러 문항 동시)에 시간이 걸린다

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

  const { data: rows, error: e2 } = await supabase
    .from('exam_sheet_problems')
    .select(
      'no, problem_id, problems(id, book, grade, semester, sub_chapter_title, local_no, type_code, difficulty, answer_kind, answer_text, answer_image_path)'
    )
    .eq('sheet_id', sheet.id)
    .order('no')

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  // 유형 이름 붙이기
  const codes = Array.from(
    new Set((rows ?? []).map((r: any) => r.problems?.type_code).filter(Boolean))
  )
  const typeTitle = new Map<string, string>()
  if (codes.length) {
    const { data: types } = await supabase
      .from('standard_types')
      .select('code, type_title')
      .in('code', codes)
    ;(types ?? []).forEach((t: any) => typeTitle.set(t.code, t.type_title))
  }

  // 정답 이미지 임시 주소 (2시간)
  const paths = (rows ?? [])
    .map((r: any) => r.problems?.answer_image_path)
    .filter(Boolean) as string[]
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: urls } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 7200)
    ;(urls ?? []).forEach((u: any) => {
      if (u.signedUrl && !u.error) signed.set(u.path, u.signedUrl)
    })
  }

  const problems = (rows ?? []).map((r: any) => {
    const p = r.problems
    return {
      no: r.no,
      problemId: p?.id ?? r.problem_id,
      source: p?.book
        ? `${p.book} ${p.grade}-${p.semester} ${p.sub_chapter_title} ${p.local_no}번`
        : null,
      difficulty: p?.difficulty ?? null,
      typeCode: p?.type_code ?? null,
      typeTitle: p?.type_code ? typeTitle.get(p.type_code) ?? null : null,
      answerKind: p?.answer_kind ?? 'image',
      answerText: p?.answer_text ?? null,
      answerChoices: choiceDigits(p?.answer_text ?? null),
      answerImage: p?.answer_image_path ? signed.get(p.answer_image_path) ?? null : null,
    }
  })

  const { data: students } = await supabase
    .from('students')
    .select('id, name, grade, class_time, teacher_name')
    .eq('is_active', true)
    .order('name')
    .limit(2000)

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
    kind?: 'choice' | 'number' | 'image'
    latex?: string | null
    photoPath?: string | null
    gradedBy?: string
    aiReason?: string | null
  }[] = body.answers ?? []

  // ── 식·서술형 답(image 종류)은 AI가 채점한다 ──
  const aiTargets = answers.filter((a) => a.kind === 'image' && a.problemId)
  if (aiTargets.length) {
    const { data: probs } = await supabase
      .from('problems')
      .select('id, answer_text, answer_image_path')
      .in('id', aiTargets.map((a) => a.problemId!))
    const byId = new Map((probs ?? []).map((p: any) => [p.id, p]))

    await Promise.all(
      aiTargets.map(async (a) => {
        // 사진 경로는 이 시험지 폴더 안의 것만 인정
        const photoPath = a.photoPath && a.photoPath.startsWith(`${code}/`) ? a.photoPath : null
        a.photoPath = photoPath
        const latex = (a.latex ?? '').trim()
        if (!latex && !photoPath) {
          a.isCorrect = false
          a.gradedBy = 'ai'
          a.aiReason = '답을 입력하지 않았습니다.'
          return
        }
        const p: any = byId.get(a.problemId!)
        const answerImageUrl = p?.answer_image_path
          ? (await supabase.storage.from(BUCKET).createSignedUrl(p.answer_image_path, 600)).data?.signedUrl ?? null
          : null
        const studentPhotoUrl = photoPath
          ? (await supabase.storage.from('grading-photos').createSignedUrl(photoPath, 600)).data?.signedUrl ?? null
          : null
        const r = await aiGrade({
          answerImageUrl,
          answerText: p?.answer_text ?? null,
          studentLatex: latex || null,
          studentPhotoUrl,
        })
        a.isCorrect = r.correct
        a.gradedBy = r.ok ? 'ai' : 'ai_error'
        a.aiReason = r.reason
      })
    )
  }
  answers.forEach((a) => {
    if (!a.gradedBy) a.gradedBy = 'auto'
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
      ai_reason: a.aiReason ?? null,
      photo_path: a.photoPath ?? null,
    }))
  )

  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    gradingId: grading.id,
    score,
    total: answers.length,
    results: answers.map((a) => ({ no: a.no, isCorrect: a.isCorrect, gradedBy: a.gradedBy, aiReason: a.aiReason ?? null })),
  })
}
