// 강사 자료 학습지 — 선생님이 가진 PDF 한 개를 문항별 그림으로 잘라 문제은행에 넣고,
// 수학의지혜 양식으로 인쇄하고, 학생에게 배정한다.  화면은 app/teacher/pdf-worksheets.
//
// 원장님 2026-11-17 「고등강사가 가지고 있는 pdf파일을 문제은행에 업로드하면 바로 수학의지혜 양식으로 출력」
//                  「제목을 공통수학-단원명-난이도로 적게해서 어느 학생에게 배정했는지를 기록하게」
//
//   GET  ?list=1                → 내가 올린 자료 목록 (원장은 전부)
//   GET  ?print=<code>          → 인쇄 화면이 쓸 문항 그림 (번호 순서)
//   GET  ?assign=<code>         → 그 학습지를 받은 학생 · 푼 사람
//   POST { action: 'start'    } → 학습지 한 벌을 연다 (제목 세 칸) → { sheetId, code }
//   POST { action: 'question' } → 문항 하나 (그림 base64) → problems · 보관함
//   POST { action: 'finish'   } → 번호 순서로 학습지 문항 목록을 짠다
//   POST { action: 'assign'   } → 학생에게 배정 (exam_sheet_targets)
//
// ★ 누가 쓰나 — 원장님과 **고등 담당 선생님** (원장님 2026-11-17 「고등 강사까지 열기」).
//   판단은 DB 함수 can_see_high_curriculum() 한 곳에만 있고 lib/apiAuth.ts 의 highOrDeny 가 그대로 따른다.
//   (같은 가드를 app/api/move-assign 도 쓴다)
//
// ★ 그림은 문항마다 한 번씩 보낸다. 23문항을 한 요청에 담으면 본문이 몇 MB가 되어 막힌다
//   (「기출 모음」의 importPdfQuestion 과 같은 방식).
//
// ★ 강사는 **본인 담당 학생만** 배정할 수 있다 (원장님 2026-10-29). 규칙을 베껴 쓰지 않고
//   **그 사람의 토큰으로** students 를 읽어 본다 — RLS(students.staff_or_own)가 정답이다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'crypto'
import { highOrDeny } from '@/lib/apiAuth'
import { bankAnswer } from '@/lib/examAnalysis'
import {
  TUTOR_NOTE, tutorCheck, tutorImagePath, tutorAnswerImagePath,
  tutorKeyError, tutorProblemRow, tutorSourceKey, tutorTitle, type TutorKey,
} from '@/lib/tutorWorksheet'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const PROBLEM_BUCKET = 'problem-images'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

/** 그 사람 자신으로 본 수파베이스 — RLS 가 그대로 걸린다 (배정할 학생을 가릴 때 쓴다) */
function asUser(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

/** in() 은 한 번에 100개까지만 안전하다 — 100개씩 끊어 돌린다 */
const chunk = <T,>(xs: T[], n = 100): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n))
  return out
}

const noteOf = (pdfName: string | null) => `${TUTOR_NOTE}:${String(pdfName ?? '').slice(0, 120)}`
const isTutorSheet = (note: string | null) => String(note ?? '').startsWith(`${TUTOR_NOTE}:`)

/** 학습지 코드 — QR 채점·배정이 쓰는 6자리. 헷갈리는 글자(I·O·0·1)는 빼 둔다 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
async function newCode(supabase: any): Promise<string> {
  const make = () => Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  let code = make()
  for (let i = 0; i < 6; i++) {
    const { data } = await supabase.from('exam_sheets').select('id').eq('code', code).maybeSingle()
    if (!data) return code
    code = make()
  }
  return code
}

/** 이 길로 만든 학습지인지 + 내가 만진 것인지. 원장은 전부, 강사는 본인이 올린 것만. */
async function myTutorSheet(supabase: any, code: string, me: { id: string; role: string }) {
  const { data } = await supabase.from('exam_sheets')
    .select('id, code, title, grade, semester, note, created_by, created_by_name, created_at')
    .eq('code', String(code ?? '').trim().toUpperCase()).maybeSingle()
  if (!data || !isTutorSheet(data.note)) return null
  if (me.role !== 'admin' && data.created_by && data.created_by !== me.id) return null
  return data
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const who = await highOrDeny(req)
  if (who.deny) return who.deny
  const supabase = db()
  const q = new URL(req.url).searchParams

  try {
    // ── 목록 — 내가 올린 자료 (원장은 전부)
    if (q.get('list')) {
      let sel = supabase.from('exam_sheets')
        .select('id, code, title, grade, semester, note, created_by, created_by_name, created_at')
        .like('note', `${TUTOR_NOTE}:%`).order('created_at', { ascending: false }).limit(300)
      if (who.role !== 'admin') sel = sel.eq('created_by', who.id)
      const { data: sheets, error } = await sel
      if (error) return bad(error.message, 500)
      const ids = (sheets ?? []).map((s: any) => s.id)
      // 문항 수 · 받은 학생 · 푼 사람 — 서로 상관없으니 한꺼번에 묻는다
      // in() 은 100개씩 끊는다 (목록은 300벌까지 내려온다). 세 표는 서로 상관없으니 한꺼번에 묻는다
      const countOf = async (table: string) => {
        const m = new Map<string, number>()
        for (const part of chunk(ids)) {
          const { data } = await supabase.from(table).select('sheet_id').in('sheet_id', part)
          for (const r of data ?? []) m.set(String(r.sheet_id), (m.get(String(r.sheet_id)) ?? 0) + 1)
        }
        return m
      }
      const [nP, nT, nG] = ids.length
        ? await Promise.all([countOf('exam_sheet_problems'), countOf('exam_sheet_targets'), countOf('gradings')])
        : [new Map<string, number>(), new Map<string, number>(), new Map<string, number>()]
      return NextResponse.json({
        me: { name: who.name, isAdmin: who.role === 'admin' },
        sheets: (sheets ?? []).map((s: any) => ({
          code: s.code, title: s.title, course: s.grade, createdAt: s.created_at,
          by: s.created_by_name ?? null, mine: !s.created_by || s.created_by === who.id,
          pdfName: String(s.note ?? '').slice(TUTOR_NOTE.length + 1) || null,
          problems: nP.get(s.id) ?? 0, targets: nT.get(s.id) ?? 0, solved: nG.get(s.id) ?? 0,
        })),
      })
    }

    // ── 인쇄 — 수학의지혜 양식 화면이 쓴다 (components/exam-analysis/ExamPaperPrint)
    const printCode = q.get('print')
    if (printCode) {
      const sheet = await myTutorSheet(supabase, printCode, who)
      if (!sheet) return bad('그런 자료가 없습니다.', 404)
      const { data: rows } = await supabase.from('exam_sheet_problems')
        .select('no, problem_id').eq('sheet_id', sheet.id).order('no')
      const ids = (rows ?? []).map((r: any) => r.problem_id)
      if (!ids.length) return bad('아직 문항이 들어가지 않은 자료입니다.', 404)
      const ps: any[] = []
      for (const part of chunk(ids)) {
        const { data } = await supabase.from('problems')
          .select('id, image_path, answer_image_path, answer_text, answer_kind, is_essay, source_meta').in('id', part)
        ps.push(...(data ?? []))
      }
      const byId = new Map<number, any>(ps.map((p: any) => [p.id, p]))
      const paths = ps.flatMap((p: any) => [p.image_path, p.answer_image_path]).filter(Boolean)
      const { data: urls } = paths.length
        ? await supabase.storage.from(PROBLEM_BUCKET).createSignedUrls(paths, 7200)
        : { data: [] as any[] }
      const signed = new Map<string, string>((urls ?? []).filter((u: any) => u.signedUrl && !u.error).map((u: any) => [u.path, u.signedUrl]))
      return NextResponse.json({
        sheet: { code: sheet.code, title: sheet.title, course: sheet.grade, by: sheet.created_by_name ?? null },
        problems: (rows ?? []).map((r: any) => {
          const p = byId.get(r.problem_id)
          return {
            no: String(r.no),
            url: signed.get(p?.image_path ?? '') ?? '',
            // 빠른 정답 — 그림 정답이 있으면 **그림이 먼저**다 (수식이 섞인 정답은 글자로 옮기면 깨진다)
            answer: p?.answer_text ?? null,
            answerUrl: signed.get(p?.answer_image_path ?? '') ?? null,
            qType: p?.is_essay ? '서술형' : null,
            points: Number(p?.source_meta?.points) || null,
          }
        }),
      })
    }

    // ── 배정 현황 — 받은 학생 · 푼 사람
    const assignCode = q.get('assign')
    if (assignCode) {
      const sheet = await myTutorSheet(supabase, assignCode, who)
      if (!sheet) return bad('그런 자료가 없습니다.', 404)
      const [{ data: tgts }, { data: grs }] = await Promise.all([
        supabase.from('exam_sheet_targets')
          .select('student_id, assigned_at, due_date, students(id, name, grade, teacher_name)')
          .eq('sheet_id', sheet.id).order('assigned_at'),
        supabase.from('gradings').select('student_id, score, total, submitted_at').eq('sheet_id', sheet.id),
      ])
      const done = new Map<string, any>((grs ?? []).map((g: any) => [g.student_id, g]))
      return NextResponse.json({
        sheet: { code: sheet.code, title: sheet.title },
        targets: (tgts ?? []).map((t: any) => ({
          studentId: t.student_id, name: t.students?.name ?? null, grade: t.students?.grade ?? null,
          teacher: t.students?.teacher_name ?? null, assignedAt: t.assigned_at, dueDate: t.due_date,
          score: done.get(t.student_id)?.score ?? null, total: done.get(t.student_id)?.total ?? null,
          submittedAt: done.get(t.student_id)?.submitted_at ?? null,
        })),
      })
    }

    return bad('무엇을 볼지 알 수 없습니다.')
  } catch (e: any) {
    return bad(e?.message ?? '읽지 못했어요.', 500)
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const who = await highOrDeny(req)
  if (who.deny) return who.deny
  const supabase = db()
  const b = await req.json().catch((): any => null)
  if (!b?.action) return bad('무엇을 할지 알 수 없습니다.')
  const now = new Date().toISOString()

  try {
    switch (String(b.action)) {
      // ── 학습지 한 벌을 연다. 제목 세 칸은 화면과 **같은 함수**로 검사한다
      case 'start': {
        const key: TutorKey = { course: String(b.course ?? ''), unit: String(b.unit ?? '').trim(), level: String(b.level ?? '') }
        const err = tutorKeyError(key)
        if (err) return bad(err)
        const title = tutorTitle(key)
        const code = await newCode(supabase)
        const { data, error } = await supabase.from('exam_sheets').insert({
          code, title, grade: key.course, semester: 1, kind: 'main',
          note: noteOf(b.pdfName ?? null), show_source: false, show_difficulty: false,
          created_by: who.id || null, created_by_name: who.name || null,
        }).select('id, code').single()
        if (error || !data) return bad(error?.message ?? '학습지를 만들지 못했습니다.', 500)
        return NextResponse.json({ ok: true, sheetId: data.id, code: data.code, title })
      }

      // ── 문항 하나. 같은 번호를 또 보내면 **새로 넣지 않고 그 줄을 고친다** (source_key 가 unique)
      case 'question': {
        const sheet = await myTutorSheet(supabase, String(b.code ?? ''), who)
        if (!sheet) return bad('그런 자료가 없습니다.', 404)
        const no = Math.trunc(Number(b.no))
        if (!(no > 0)) return bad('문항 번호가 올바르지 않습니다.')
        if (!b.image) return bad(`${no}번 그림이 없습니다.`)
        // 제목 세 칸은 학습지에 이미 박혀 있다 — 제목에서 되읽어 쓴다 (화면이 다른 값을 보내도 안 따른다)
        const [course, unit, level] = String(sheet.title).split('-')
        const key: TutorKey = { course: sheet.grade ?? course, unit: unit ?? '', level: level ?? '' }

        const answer = String(b.answer ?? '').trim() || null
        const essay = !!b.essay
        const picks = Array.from(answer ?? '').filter((c) => '①②③④⑤'.includes(c))
        const qType = essay ? '서술형'
          : !answer || picks.length ? '객관식'
          : /^-?\d+(\.\d+)?$/.test(answer.replace(/\s/g, '')) ? '단답형' : '서술형'
        const ans = bankAnswer(qType, answer)
        const points = Number(b.points) > 0 ? Number(b.points) : null

        const up = async (path: string, b64: string) =>
          (await supabase.storage.from(PROBLEM_BUCKET)
            .upload(path, Buffer.from(b64, 'base64'), { contentType: 'image/png', upsert: true })).error
        const e1 = await up(tutorImagePath(sheet.id, no), String(b.image))
        if (e1) return bad(`${no}번 그림 저장 실패: ${e1.message}`, 500)
        if (b.answerImage) {
          const e2 = await up(tutorAnswerImagePath(sheet.id, no), String(b.answerImage))
          if (e2) return bad(`${no}번 정답 그림 저장 실패: ${e2.message}`, 500)
        }

        const row = tutorProblemRow({
          sheetId: sheet.id, key, no, essay,
          answerKind: ans.kind, answerText: ans.text, points,
          hasAnswerImage: !!b.answerImage,
          pdfName: String(sheet.note ?? '').slice(TUTOR_NOTE.length + 1) || null,
          byName: sheet.created_by_name ?? null,
        })
        const { data: exist } = await supabase.from('problems').select('id')
          .eq('source_key', tutorSourceKey(sheet.id, no)).maybeSingle()
        if (exist) {
          const { error } = await supabase.from('problems').update(row).eq('id', exist.id)
          if (error) return bad(`${no}번 문제은행 고치기 실패: ${error.message}`, 500)
          return NextResponse.json({ ok: true, problemId: exist.id, updated: true })
        }
        const ins = await supabase.from('problems').insert(row).select('id').single()
        if (ins.error) return bad(`${no}번 문제은행 넣기 실패: ${ins.error.message}`, 500)
        return NextResponse.json({ ok: true, problemId: ins.data.id, updated: false })
      }

      // ── 마무리 — 학습지의 문항 목록을 번호 순서로 다시 짠다 (채점 기록은 건드리지 않는다)
      case 'finish': {
        const sheet = await myTutorSheet(supabase, String(b.code ?? ''), who)
        if (!sheet) return bad('그런 자료가 없습니다.', 404)
        const { data: ps } = await supabase.from('problems')
          .select('id, source_key, source_meta').like('source_key', `tutor:${sheet.id}:%`)
        const rows = (ps ?? [])
          .map((p: any) => ({ id: p.id, no: Number(p.source_meta?.source_problem_no) || 0 }))
          .filter((r: any) => r.no > 0)
          .sort((a: any, b2: any) => a.no - b2.no)
        if (!rows.length) return bad('문제은행에 들어간 문항이 없습니다.')
        const del = await supabase.from('exam_sheet_problems').delete().eq('sheet_id', sheet.id)
        if (del.error) return bad(`문항 정리 실패: ${del.error.message}`, 500)
        const ins = await supabase.from('exam_sheet_problems')
          .insert(rows.map((r: any, i: number) => ({ sheet_id: sheet.id, no: i + 1, problem_id: r.id })))
        if (ins.error) return bad(`문항 넣기 실패: ${ins.error.message}`, 500)
        const chk = tutorCheck(rows.map((r: any) => ({ no: r.no, w: 1, h: 1 })))
        return NextResponse.json({ ok: true, code: sheet.code, count: rows.length, warns: chk.warns })
      }

      // ── 학생에게 배정. ★ 강사는 본인 담당 학생만 — 규칙을 베껴 쓰지 않고 그 사람 토큰으로 읽어 본다
      case 'assign': {
        const sheet = await myTutorSheet(supabase, String(b.code ?? ''), who)
        if (!sheet) return bad('그런 자료가 없습니다.', 404)
        const want: string[] = Array.isArray(b.studentIds) ? b.studentIds.filter(Boolean).map(String) : []
        const dueDate: string | null = b.dueDate || null

        const { data: cur, error: e0 } = await supabase.from('exam_sheet_targets').select('student_id').eq('sheet_id', sheet.id)
        if (e0) return bad(e0.message, 500)
        const have = new Set<string>((cur ?? []).map((t: any) => String(t.student_id)))

        // ★ 내가 **실제로 읽을 수 있는 학생**만 손댄다 (students 정책: 담당 학생 + 주임 학년 + 테스트 학생).
        //   보내려는 사람과 **이미 받은 사람**을 함께 물어본다 — 둘 다 봐야
        //   「내가 못 보는 학생(다른 선생님이 배정한 사람)의 배정을 조용히 지우는」 일을 막을 수 있다.
        const seeable = new Set<string>()
        for (const part of chunk([...new Set([...want, ...have])])) {
          const { data, error } = await asUser(req).from('students').select('id').in('id', part)
          if (error) return bad('학생을 확인하지 못했어요.', 500)
          for (const s of data ?? []) seeable.add(String(s.id))
        }
        const allowed = new Set(want.filter((id) => seeable.has(id)))
        const refused = want.filter((id) => !seeable.has(id))

        const add = [...allowed].filter((id) => !have.has(id))
        // 못 보는 학생은 뺄 수도 없다 — 건드리지 않는다
        const remove = [...have].filter((id) => seeable.has(id) && !allowed.has(id))

        if (add.length) {
          const { error } = await supabase.from('exam_sheet_targets')
            .insert(add.map((student_id) => ({ sheet_id: sheet.id, student_id, due_date: dueDate })))
          if (error) return bad(error.message, 500)
        }
        let kept = 0
        if (remove.length) {
          // 이미 푼 학생은 빼지 않는다 — 기록이 사라진 것처럼 보이면 안 된다
          const keep = new Set<string>()
          for (const part of chunk(remove)) {
            const { data } = await supabase.from('gradings').select('student_id').eq('sheet_id', sheet.id).in('student_id', part)
            for (const g of data ?? []) keep.add(String(g.student_id))
          }
          kept = keep.size
          const drop = remove.filter((id) => !keep.has(id))
          for (const part of chunk(drop)) {
            const { error } = await supabase.from('exam_sheet_targets').delete().eq('sheet_id', sheet.id).in('student_id', part)
            if (error) return bad(error.message, 500)
          }
        }
        if (dueDate && allowed.size) {
          for (const part of chunk([...allowed])) {
            const { error } = await supabase.from('exam_sheet_targets')
              .update({ due_date: dueDate }).eq('sheet_id', sheet.id).in('student_id', part)
            if (error) return bad(error.message, 500)
          }
        }
        return NextResponse.json({ ok: true, added: add.length, removed: remove.length - kept, kept, refused: refused.length, at: now })
      }
    }
    return bad('알 수 없는 요청입니다.')
  } catch (e: any) {
    return bad(e?.message ?? '처리하지 못했습니다.', 500)
  }
}
