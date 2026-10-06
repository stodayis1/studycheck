// 시험지 분석 서버 API. 직원(원장·선생님·직원)만 쓴다.
//
//  GET  ?list=1                       → 학교별 시험지 목록 + 진행 상황
//  GET  ?id=<paperId>                 → 시험지 1건 (파일·문항·이너프원 매칭 포함)
//  GET  ?types=1&grade=중3            → 그 학년의 문제은행 유형표 (문항에 유형 붙일 때)
//  POST { action, ... }               → 저장·업로드·반영 (아래 switch 참고)
//
// exam_* 표와 exam-analysis 보관함은 RLS 정책이 없어 브라우저에서 직접 못 읽는다.
// 전부 여기(서버)에서 service_role 키로 읽고 쓴다. 학생·학부모는 첫 줄 denyIfNotStaff 에서 걸러진다.
// 「문제은행 반영」과 「블로그」 결정은 원장만 할 수 있다.

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { staffOrDeny } from '@/lib/apiAuth'
import {
  EXAM_TYPES, FILE_KINDS, MATCH_LEVELS, Q_TYPES,
  bankAnswer, checkFileName, examPrefix, handsolveLabel, hitSummary, normNo, sortOrderOf, sourceKey, standardFileName,
} from '@/lib/examAnalysis'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const FILE_BUCKET = 'exam-analysis'
const PROBLEM_BUCKET = 'problem-images'
const BANK_BOOK = '학교기출'

function db() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

// 기출 PDF 를 문항별로 잘라 넣으면 그 시험 전체를 담은 학습지(exam_sheets)를 하나 만들어 둔다.
// 그 학습지의 note 가 이 표시다 → 인쇄 화면(/teacher/gradings/print)에서 학원 시험지 양식으로 통째 인쇄된다.
const sheetNote = (paperId: string) => `exam_paper:${paperId}`

// 정답표(한 줄에 「번호 정답」)를 문항과 문제은행에 맞춰 넣는다. 정답을 나중에 넣어도 QR 채점이 되게.
async function syncAnswers(supabase: any, paperId: string, answersText: string | null) {
  const map = new Map<string, string>()
  for (const line of String(answersText ?? '').split(/\r?\n/)) {
    const m = line.trim().match(/^(\S+)\s+(.+)$/)
    if (m) map.set(normNo(m[1]), m[2].trim())
  }
  if (!map.size) return 0
  const { data: qs } = await supabase.from('exam_questions').select('id, question_no, q_type, problem_id').eq('paper_id', paperId)
  let n = 0
  for (const x of qs ?? []) {
    const a = map.get(normNo(x.question_no))
    if (a == null) continue
    // 동그라미 숫자면 객관식, 숫자 하나면 단답형으로 본다 (서술형으로 적어 둔 문항은 그대로)
    const qType = /[①②③④⑤]/.test(a) ? '객관식' : x.q_type === '서술형' ? '서술형' : '단답형'
    await supabase.from('exam_questions').update({ answer: a, q_type: qType }).eq('id', x.id)
    if (x.problem_id) {
      const ans = bankAnswer(qType, a)
      await supabase.from('problems').update({ answer_kind: ans.kind, answer_text: ans.text }).eq('id', x.problem_id)
    }
    n++
  }
  return n
}

// 이너프원 문항(enough_problems) 찾기 — 선생님이 적은 교재 · 단원 · 문항번호로.
// 단원은 「대푯값과 산포도 - 3회차」처럼 줄표가 있든 없든 같은 것으로 본다.
// (표가 아직 없으면 — docs/sql/시험지분석_3 실행 전 — 조용히 null)
const unitKey = (s: any) => String(s ?? '').replace(/\s*-\s*(\d회차)/, ' $1').replace(/\s+/g, ' ').trim()
async function findEnoughProblem(supabase: any, book: any, unit: any, no: any): Promise<string | null> {
  const n = Number(String(no ?? '').replace(/[^0-9]/g, ''))
  if (!book || !unit || !n) return null
  const { data, error } = await supabase.from('enough_problems').select('id')
    .eq('book', String(book).trim()).eq('unit', unitKey(unit)).eq('problem_no', n)
    .order('created_at', { ascending: false }).limit(1)
  return error ? null : data?.[0]?.id ?? null
}

async function all<T = any>(make: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await make(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function pick(src: any, keys: string[]) {
  const out: Record<string, any> = {}
  for (const k of keys) if (src && k in src) out[k] = src[k] === '' ? null : src[k]
  return out
}

// 선생님이 고칠 수 있는 칸 / 원장만 고칠 수 있는 칸
const PAPER_FIELDS = [
  'exam_name', 'exam_scope', 'exam_end_date', 'work_due_date', 'priority', 'assignee', 'note',
  'answers_text', 'discriminating_nos', 'tasks', 'match_status',
  'review_difficulty', 'review_units', 'review_hard_types', 'review_mistakes',
  'review_next_points', 'review_blog_summary',
]
const PAPER_ADMIN_FIELDS = ['blog_from_date', 'blog_status', 'blog_url', 'blog_uploaded_on', 'blog_note']
const QUESTION_FIELDS = [
  'q_type', 'body', 'choices', 'answer', 'solution', 'unit_name', 'sub_unit_name', 'type_code',
  'level', 'difficulty', 'is_discriminating', 'source_memo', 'is_public', 'figure_path', 'figure_is_whole',
]

// ───────────────────────── GET ─────────────────────────
export async function GET(req: Request) {
  // 직원만 (denyIfNotStaff 와 같은 검사). 신원은 여기서 한 번만 확인해 아래에서 그대로 쓴다
  const me = await staffOrDeny(req)
  if (me.deny) return me.deny
  const supabase = db()
  const q = new URL(req.url).searchParams

  try {
    // 유형표 — 시험 범위가 앞 학기에 걸칠 수 있어 그 학년의 두 학기를 다 준다
    if (q.get('types')) {
      const grade = q.get('grade')
      if (!grade) return bad('학년이 없습니다.')
      const types = await all((f, t) =>
        supabase.from('standard_types')
          .select('code, semester, chapter_no, chapter_title, sub_chapter_no, sub_chapter_title, type_no, type_title')
          .eq('grade', grade).order('semester').order('sub_chapter_no').order('type_no').range(f, t)
      )
      return NextResponse.json({ types })
    }

    if (q.get('list')) {
      const { data: papers, error } = await supabase
        .from('exam_papers').select('*')
        .order('exam_year', { ascending: false }).order('term', { ascending: false })
        .order('exam_end_date', { ascending: true, nullsFirst: false }).order('school_name').order('grade')
      if (error) return bad(error.message, 500)
      const [files, questions, matches] = await Promise.all([
        all((f, t) => supabase.from('exam_paper_files').select('paper_id, kind').range(f, t)),
        all((f, t) => supabase.from('exam_questions').select('paper_id, bank_status, question_no').range(f, t)),
        all((f, t) => supabase.from('exam_enough_matches').select('paper_id, question_no, match_level').range(f, t)),
      ])
      const stat: Record<string, any> = {}
      const of = (id: string) => (stat[id] ??= { files: 0, handsolve: 0, questions: 0, reflected: 0, matches: 0 })
      for (const f of files) {
        const s = of(f.paper_id)
        if (f.kind === '손풀이') s.handsolve++
        else if (f.kind === '원본') s.originals = (s.originals ?? 0) + 1     // 개수만 — 파일은 원장만 연다
        else s.files++
        if (f.kind === '문제' || f.kind === '문제정답해설') s.printable = true
      }
      for (const x of questions) {
        of(x.paper_id).questions++
        if (x.bank_status === '반영완료') of(x.paper_id).reflected++
      }
      for (const m of matches) of(m.paper_id).matches++
      const { data: sheets } = await supabase.from('exam_sheets').select('code, note').like('note', 'exam_paper:%')
      for (const sh of sheets ?? []) {
        const s = stat[String(sh.note).slice('exam_paper:'.length)]
        if (s) { s.printable = true; s.sheetCode = sh.code }
      }
      // 적중률 (이너프원에 유형 유사 이상이 있는 문항 ÷ 전체 문항)
      return NextResponse.json({
        isAdmin: me.role === 'admin',
        papers: (papers ?? []).map((p: any) => {
          const h = hitSummary(
            p.answers_text,
            questions.filter((x) => x.paper_id === p.id).map((x) => x.question_no),
            matches.filter((m) => m.paper_id === p.id)
          )
          return { ...p, stat: { ...of(p.id), hit: h.hit, total: h.total, hitRate: h.rate } }
        }),
      })
    }

    // ?todo=1 → 대시보드 알림용. 중등 선생님(과 원장)에게 「이번 시험 기출분석에서 남은 일」을 준다
    if (q.get('todo')) {
      const u = { name: me.name, role: me.role, supervisor_grades: me.supervisorGrades }
      // 중등 선생님 = 중등 학년 주임이거나, 맡은 재원생 중에 중학생이 있는 선생님
      let middle = u?.role === 'admin' || (u?.supervisor_grades ?? []).some((g: string) => String(g).startsWith('중'))
      if (!middle && u?.name) {
        const { data: st } = await supabase.from('students').select('id')
          .eq('is_active', true).like('grade', '중%').ilike('teacher_name', `%${u.name}%`).limit(1)
        middle = !!st?.length
      }
      if (!middle) return NextResponse.json({ show: false, papers: [] })

      const { data: all0 } = await supabase.from('exam_papers').select('*')
        .order('exam_year', { ascending: false }).order('term', { ascending: false }).order('created_at', { ascending: false })
      // 가장 최근 시험(연도 · 학기 · 구분) 한 묶음만, 아직 「완료」가 아닌 것
      const first = (all0 ?? [])[0]
      const cur = (all0 ?? []).filter((p: any) => first && p.exam_year === first.exam_year && p.term === first.term && p.exam_type === first.exam_type && !p.tasks?.done)
      if (!cur.length) return NextResponse.json({ show: true, papers: [] })
      const ids = cur.map((p: any) => p.id)
      const [{ data: fs }, { data: qs }] = await Promise.all([
        supabase.from('exam_paper_files').select('paper_id, kind').in('paper_id', ids),
        supabase.from('exam_questions').select('paper_id, problem_id').in('paper_id', ids).not('problem_id', 'is', null),
      ])
      const papers = cur.map((p: any) => ({
        id: p.id, school_name: p.school_name, grade: p.grade, assignee: p.assignee,
        uploaded: (qs ?? []).some((x: any) => x.paper_id === p.id) || (fs ?? []).some((f: any) => f.paper_id === p.id && (f.kind === '문제' || f.kind === '문제정답해설')),
        answers: !!String(p.answers_text ?? '').trim(),
        disc: (p.discriminating_nos ?? []).length,
        handsolve: (fs ?? []).filter((f: any) => f.paper_id === p.id && f.kind === '손풀이').length,
        review: !!(p.review_difficulty && String(p.review_units ?? p.review_hard_types ?? '').trim()),
        next: !!String(p.review_next_points ?? '').trim(),
      })).sort((a: any, b: any) => Number(b.uploaded) - Number(a.uploaded) || a.school_name.localeCompare(b.school_name))
      const due = cur.map((p: any) => p.work_due_date).filter(Boolean).sort()[0] ?? null
      return NextResponse.json({ show: true, due, papers })
    }

    // ?print=<paperId> → 수학의지혜 시험지 양식 인쇄 화면이 쓸 문항 그림 (번호 순서)
    const printId = q.get('print')
    if (printId) {
      const { data: paper } = await supabase.from('exam_papers')
        .select('id, exam_year, term, exam_type, school_name, grade, exam_name').eq('id', printId).maybeSingle()
      if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)
      const { data: qs } = await supabase.from('exam_questions')
        .select('question_no, sort_order, problem_id').eq('paper_id', printId).not('problem_id', 'is', null)
        .order('sort_order').order('question_no')
      const ids = (qs ?? []).map((x: any) => x.problem_id)
      if (!ids.length) return bad('아직 문항별로 잘라 넣지 않은 시험지입니다.', 404)
      const { data: ps } = await supabase.from('problems').select('id, image_path').in('id', ids)
      const pathOf = new Map<number, string>((ps ?? []).map((p: any) => [p.id, p.image_path]))
      const { data: urls } = await supabase.storage.from(PROBLEM_BUCKET)
        .createSignedUrls((ps ?? []).map((p: any) => p.image_path).filter(Boolean), 7200)
      const signedOf = new Map<string, string>((urls ?? []).filter((u: any) => u.signedUrl && !u.error).map((u: any) => [u.path, u.signedUrl]))
      return NextResponse.json({
        paper,
        problems: (qs ?? []).map((x: any) => ({ no: x.question_no, url: signedOf.get(pathOf.get(x.problem_id) ?? '') ?? '' })),
      })
    }

    const id = q.get('id')
    if (!id) return bad('무엇을 볼지 알 수 없습니다.')
    // 서로 상관없는 조회는 한꺼번에 보낸다 (차례로 보내면 그만큼 느려진다)
    const [{ data: paper }, { data: files }, { data: questions }, { data: matches }, { data: sheet }] = await Promise.all([
      supabase.from('exam_papers').select('*').eq('id', id).maybeSingle(),
      supabase.from('exam_paper_files').select('*').eq('paper_id', id).order('created_at'),
      supabase.from('exam_questions').select('*').eq('paper_id', id).order('sort_order').order('question_no'),
      supabase.from('exam_enough_matches').select('*').eq('paper_id', id).order('created_at'),
      supabase.from('exam_sheets').select('code').eq('note', sheetNote(id)).maybeSingle(),
    ])
    if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)

    // 둘째 묶음도 한꺼번에: 이너프원 단원 목록 · 파일 임시 주소 · 문제은행 그림 · 이너프원 문항 그림
    const paths = [
      ...(files ?? []).filter((f: any) => f.kind !== '원본' || me.role === 'admin').map((f: any) => f.storage_path),
      ...(questions ?? []).map((x: any) => x.figure_path),
    ].filter(Boolean) as string[]
    const bankIds = (questions ?? []).filter((x: any) => x.problem_id && !x.figure_path).map((x: any) => x.problem_id)
    const enoughIds = Array.from(new Set((matches ?? []).map((m: any) => m.enough_problem_id).filter(Boolean)))
    const signedMap = async (bucket: string, pths: string[]) => {
      const { data: urls } = pths.length ? await supabase.storage.from(bucket).createSignedUrls(pths, 7200) : { data: [] as any[] }
      return new Map<string, string>((urls ?? []).filter((u: any) => u.signedUrl && !u.error).map((u: any) => [u.path, u.signedUrl]))
    }
    const signed: Record<string, string> = {}
    const bankImg: Record<number, string> = {}
    const enoughImg: Record<string, { url: string | null; twin: string | null; page: number | null }> = {}
    const [{ data: enough }] = await Promise.all([
      // 이너프원 진도표 — 이 학교·학년 교재의 단원 이름을 고르기 쉽게
      supabase.from('inner_enough').select('level, unit_no, unit_name, sub_unit_name, created_at')
        .eq('school_name', paper.school_name).eq('grade', String(paper.grade).replace('중', '')).limit(1000),
      // 파일·문항 그림을 볼 임시 주소 (2시간)
      signedMap(FILE_BUCKET, paths).then((m) => m.forEach((v, k) => { signed[k] = v })),
      // PDF 에서 잘라 넣은 문항은 그림이 문제은행 보관함에 있다 → 그 그림을 미리보기로 쓴다
      (async () => {
        if (!bankIds.length) return
        const { data: ps } = await supabase.from('problems').select('id, image_path').in('id', bankIds)
        const byPath = await signedMap(PROBLEM_BUCKET, (ps ?? []).map((p: any) => p.image_path).filter(Boolean))
        ;(ps ?? []).forEach((p: any) => { if (byPath.has(p.image_path)) bankImg[p.id] = byPath.get(p.image_path)! })
      })(),
      // 매칭된 이너프원 문항의 그림 (기출과 나란히 보여 준다)
      (async () => {
        if (!enoughIds.length) return
        const { data: eps } = await supabase.from('enough_problems').select('id, image_path, twin_of, page_no').in('id', enoughIds)
        const byPath = await signedMap(FILE_BUCKET, (eps ?? []).map((e: any) => e.image_path))
        ;(eps ?? []).forEach((e: any) => { enoughImg[e.id] = { url: byPath.get(e.image_path) ?? null, twin: e.twin_of, page: e.page_no } })
      })(),
    ])

    // 이너프원은 시험 때마다 새로 올린다. 이 시험에 쓴 것만 보이게 —
    // 시험 종료일 이전에 올린 것 중 「가장 최근에 올린 날」 묶음만 남긴다 (지난 학기 교재가 섞이지 않게)
    const kstDay = (ts: string) => new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const inTime = (enough ?? []).filter((e: any) => !paper.exam_end_date || kstDay(e.created_at) <= paper.exam_end_date)
    const lastDay = inTime.map((e: any) => kstDay(e.created_at)).sort().pop()
    const enoughNow = inTime.filter((e: any) => kstDay(e.created_at) === lastDay)

    return NextResponse.json({
      paper,
      sheetCode: sheet?.code ?? null,
      // 원본은 원장에게만 내준다. 선생님에게는 「몇 개 올라와 있다」만 알려 준다
      files: (files ?? [])
        .filter((f: any) => f.kind !== '원본' || me.role === 'admin')
        .map((f: any) => ({ ...f, url: signed[f.storage_path] ?? null })),
      originalCount: (files ?? []).filter((f: any) => f.kind === '원본').length,
      questions: (questions ?? []).map((x: any) => ({
        ...x,
        figure_url: x.figure_path ? signed[x.figure_path] ?? null : bankImg[x.problem_id] ?? null,
        from_pdf: !x.figure_path && !!bankImg[x.problem_id],      // PDF 에서 잘라 넣은 문항
      })),
      matches: (matches ?? []).map((m: any) => ({
        ...m,
        enough_url: enoughImg[m.enough_problem_id]?.url ?? null,
        enough_twin: enoughImg[m.enough_problem_id]?.twin ?? null,
        enough_page: enoughImg[m.enough_problem_id]?.page ?? null,
      })),
      enough: enoughNow,
      me: { name: me.name, isAdmin: me.role === 'admin' },
    })
  } catch (e: any) {
    return bad(e?.message ?? '불러오지 못했습니다.', 500)
  }
}

// ───────────────────────── POST ─────────────────────────
export async function POST(req: Request) {
  // 직원만 (denyIfNotStaff 와 같은 검사)
  const me = await staffOrDeny(req)
  if (me.deny) return me.deny
  const supabase = db()
  const b = await req.json().catch(() => null)
  if (!b?.action) return bad('잘못된 요청입니다.')
  const isAdmin = me.role === 'admin'
  const adminOnly = () => bad('원장님만 할 수 있습니다.', 403)
  const now = new Date().toISOString()

  const getPaper = async (id: string) =>
    (await supabase.from('exam_papers').select('*').eq('id', id).maybeSingle()).data

  try {
    switch (b.action) {
      // ── 시험지 새로 만들기
      case 'createPaper': {
        const p = b.paper ?? {}
        const row = {
          exam_year: Number(p.exam_year), term: Number(p.term), exam_type: p.exam_type,
          school_name: String(p.school_name ?? '').trim().replace(/\s+/g, '').replace(/중학교$/, '중').replace(/고등학교$/, '고'), grade: p.grade,
        }
        if (!row.exam_year || ![1, 2].includes(row.term) || !EXAM_TYPES.includes(row.exam_type) || !row.school_name || !row.grade)
          return bad('연도·학기·시험구분·학교·학년을 모두 골라 주세요.')
        const { data: dup } = await supabase.from('exam_papers').select('id').match(row).maybeSingle()
        if (dup) return NextResponse.json({ error: '이미 있는 시험지입니다.', id: dup.id }, { status: 409 })
        const { data, error } = await supabase.from('exam_papers').insert({
          ...row,
          exam_name: p.exam_name || `${row.exam_year} ${row.term}학기 ${row.exam_type}`,
          ...pick(p, ['exam_scope', 'exam_end_date', 'work_due_date', 'blog_from_date', 'priority', 'assignee', 'note']),
          created_by: me.name,
        }).select('id').single()
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true, id: data.id })
      }

      // ── 시험지 정보·정답표·총평·체크리스트·블로그 상태 저장
      case 'savePaper': {
        const patch = pick(b.patch, PAPER_FIELDS)
        const adminPatch = pick(b.patch, PAPER_ADMIN_FIELDS)
        if (Object.keys(adminPatch).length && !isAdmin) return adminOnly()
        const { error } = await supabase.from('exam_papers')
          .update({ ...patch, ...adminPatch, updated_at: now }).eq('id', b.id)
        if (error) return bad(error.message, 500)
        const synced = 'answers_text' in patch ? await syncAnswers(supabase, b.id, patch.answers_text) : 0
        return NextResponse.json({ ok: true, answersSynced: synced })
      }

      // ── 파일 올릴 임시 주소 받기 (브라우저가 이 주소로 직접 올린다 — PDF 가 커서 서버를 거치지 않는다)
      case 'uploadUrl': {
        const paper = await getPaper(b.paperId)
        if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)
        // 원본만 한글(HWP) 파일도 받는다
        const allow = b.kind === '원본' ? /\.(pdf|png|jpe?g|hwp|hwpx)$/ : /\.(pdf|png|jpe?g)$/
        const ext = String(b.fileName ?? '').toLowerCase().match(allow)?.[1]
        if (!ext) return bad(b.kind === '원본' ? 'PDF · 한글(HWP) · PNG · JPG 파일만 올릴 수 있어요.' : 'PDF · PNG · JPG 파일만 올릴 수 있어요.')
        // 보관함 경로는 영문·숫자만 된다. 한글 파일명은 표(file_name)에 따로 적는다
        const path = `${paper.id}/${randomUUID()}.${ext === 'jpeg' ? 'jpg' : ext}`
        const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUploadUrl(path)
        if (error || !data) return bad(error?.message ?? '올릴 주소를 만들지 못했습니다.', 500)
        return NextResponse.json({ path, token: data.token })
      }

      // ── 시험지를 통째로 인쇄할 주소 (작업한 「문제」 PDF. 없으면 「문제정답해설」)
      case 'printUrl': {
        if (!b.raw) {
          const { data: sh } = await supabase.from('exam_sheets').select('code').eq('note', sheetNote(b.paperId)).maybeSingle()
          if (sh?.code) return NextResponse.json({ sheetCode: sh.code })
        }
        const { data: fs } = await supabase.from('exam_paper_files').select('kind, storage_path, file_name, created_at')
          .eq('paper_id', b.paperId).in('kind', ['문제', '문제정답해설']).order('created_at', { ascending: false })
        const f = (fs ?? []).find((x: any) => x.kind === '문제') ?? (fs ?? [])[0]
        if (!f) return bad('아직 올린 문제 PDF가 없습니다.', 404)
        const { data, error } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(f.storage_path, 3600)
        if (error || !data) return bad(error?.message ?? '주소를 만들지 못했습니다.', 500)
        return NextResponse.json({ url: data.signedUrl, fileName: f.file_name, kind: f.kind })
      }

      // ── 올린 파일을 목록에 적기
      case 'addFile': {
        const paper = await getPaper(b.paperId)
        if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)
        if (!FILE_KINDS.includes(b.kind)) return bad('파일 구분을 골라 주세요.')
        if (!String(b.path ?? '').startsWith(`${paper.id}/`)) return bad('잘못된 파일 경로입니다.')
        let fileName = String(b.fileName ?? '').normalize('NFC')
        // 작업한 시험지(문제 · 정답 · 해설)는 원장만 올린다. 선생님 · 직원이 올린 시험지는 학교에서 받은 원본이므로
        // 「원본」으로 보관한다 (원본이 「문제」로 들어가면 인쇄 버튼이 스캔본을 열고, 선생님 모두에게 보인다)
        if (!isAdmin && ['문제', '정답', '해설', '문제정답해설'].includes(b.kind)) b.kind = '원본'
        // 올리는 사람이 파일명을 맞출 필요가 없게, 규칙대로 된 이름을 서버가 붙인다
        if (b.autoName && b.kind !== '손풀이' && b.kind !== '기타') {
          const { count } = await supabase.from('exam_paper_files').select('id', { count: 'exact', head: true })
            .eq('paper_id', paper.id).eq('kind', b.kind)
          fileName = standardFileName(paper, b.kind, fileName, (count ?? 0) + 1)
        }
        const { error } = await supabase.from('exam_paper_files').insert({
          paper_id: paper.id, kind: b.kind, file_name: fileName, storage_path: b.path,
          mime_type: b.mimeType ?? null, file_size: b.fileSize ?? null,
          question_label: b.kind === '손풀이' ? (b.questionLabel || handsolveLabel(fileName)) : null,
          name_ok: !!b.autoName || !checkFileName(paper, b.kind, fileName),
          uploaded_by: me.name,
        })
        if (error?.message?.includes('kind_check'))
          return bad('원본 보관 준비(docs/sql/시험지분석_2_원본보관.sql)가 아직 실행되지 않았습니다. 원장님께 알려 주세요.', 500)
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }

      // ── 원본 파일 내려받을 주소 (원장만). 현황판에서 바로 받을 때 쓴다
      case 'originalUrls': {
        if (!isAdmin) return adminOnly()
        const { data: fs } = await supabase.from('exam_paper_files').select('file_name, storage_path')
          .eq('paper_id', b.paperId).eq('kind', '원본').order('created_at')
        const out: { url: string; fileName: string }[] = []
        for (const f of fs ?? []) {
          const { data } = await supabase.storage.from(FILE_BUCKET).createSignedUrl(f.storage_path, 600, { download: f.file_name })
          if (data?.signedUrl) out.push({ url: data.signedUrl, fileName: f.file_name })
        }
        if (!out.length) return bad('보관된 원본이 없습니다.', 404)
        return NextResponse.json({ files: out })
      }

      // ── 빈 시험 줄 지우기 (원장만). 파일 · 문항 · 매칭이 하나도 없을 때만 된다 — 잘못 만든 줄 정리용
      case 'deletePaper': {
        if (!isAdmin) return adminOnly()
        const [f, q2, m, sh] = await Promise.all([
          supabase.from('exam_paper_files').select('id', { count: 'exact', head: true }).eq('paper_id', b.id),
          supabase.from('exam_questions').select('id', { count: 'exact', head: true }).eq('paper_id', b.id),
          supabase.from('exam_enough_matches').select('id', { count: 'exact', head: true }).eq('paper_id', b.id),
          supabase.from('exam_sheets').select('id', { count: 'exact', head: true }).eq('note', sheetNote(b.id)),
        ])
        if ((f.count ?? 0) + (q2.count ?? 0) + (m.count ?? 0) + (sh.count ?? 0) > 0)
          return bad('파일이나 문항이 남아 있는 시험은 지울 수 없어요. 먼저 파일을 지워 주세요.')
        const { error } = await supabase.from('exam_papers').delete().eq('id', b.id)
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }

      // ── 파일 종류 바꾸기 (원장만). 잘못 분류된 파일을 옮긴다 — 예: 스캔 원본이 「문제」로 들어간 것
      case 'setFileKind': {
        if (!isAdmin) return adminOnly()
        if (!['문제', '정답', '해설', '문제정답해설', '원본'].includes(b.kind)) return bad('바꿀 종류를 골라 주세요.')
        const { data: f } = await supabase.from('exam_paper_files').select('*').eq('id', b.id).maybeSingle()
        if (!f) return bad('파일을 찾을 수 없습니다.', 404)
        if (f.kind === '손풀이') return bad('손풀이는 종류를 바꿀 수 없어요.')
        if (f.kind === b.kind) return NextResponse.json({ ok: true })
        if (b.kind !== '원본' && !/\.pdf$/i.test(f.file_name)) return bad('PDF가 아닌 파일은 원본으로만 둘 수 있어요.')
        const paper = await getPaper(f.paper_id)
        const { count } = await supabase.from('exam_paper_files').select('id', { count: 'exact', head: true })
          .eq('paper_id', f.paper_id).eq('kind', b.kind)
        const { error } = await supabase.from('exam_paper_files')
          .update({ kind: b.kind, file_name: standardFileName(paper, b.kind, f.file_name, (count ?? 0) + 1), name_ok: true }).eq('id', f.id)
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }

      // ── 파일 지우기 (올린 본인 또는 원장)
      case 'deleteFile': {
        const { data: f } = await supabase.from('exam_paper_files').select('*').eq('id', b.id).maybeSingle()
        if (!f) return bad('파일을 찾을 수 없습니다.', 404)
        if (f.kind === '원본' && !isAdmin) return bad('원본은 원장님만 지울 수 있어요.', 403)
        if (!isAdmin && f.uploaded_by !== me.name) return bad('올린 선생님이나 원장님만 지울 수 있어요.', 403)
        await supabase.storage.from(FILE_BUCKET).remove([f.storage_path])
        const { error } = await supabase.from('exam_paper_files').delete().eq('id', f.id)
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }

      // ── 기출문항 저장 (하나 또는 여러 개). 같은 출처 열쇠가 이미 있으면 알려 주고, overwrite 면 고쳐 쓴다
      case 'saveQuestions': {
        const paper = await getPaper(b.paperId)
        if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)
        const items: any[] = Array.isArray(b.questions) ? b.questions : []
        if (!items.length) return bad('저장할 문항이 없습니다.')
        for (const it of items) {
          it.question_no = normNo(it.question_no)
          if (!it.question_no) return bad('문항번호가 비어 있는 문항이 있어요.')
          if (it.q_type && !Q_TYPES.includes(it.q_type)) return bad(`문항 ${it.question_no}: 문항유형을 골라 주세요.`)
        }
        const keys = items.map((it) => sourceKey(paper, it.question_no))
        const { data: exist } = await supabase.from('exam_questions').select('id, source_key, question_no').in('source_key', keys)
        const byKey = new Map<string, any>((exist ?? []).map((e: any) => [e.source_key, e]))
        // 새로 넣으려는데(또는 번호를 바꿨는데) 그 자리에 이미 다른 문항이 있는 경우
        const dups = items.filter((it, i) => byKey.has(keys[i]) && byKey.get(keys[i]).id !== it.id)
        if (dups.length && !b.overwrite)
          return NextResponse.json({
            error: `이미 입력된 문항이 있어요: ${dups.map((d) => d.question_no).join(', ')}번`,
            duplicates: dups.map((d) => d.question_no),
          }, { status: 409 })

        const ids: string[] = []
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          const row = {
            ...pick(it, QUESTION_FIELDS),
            question_no: it.question_no, sort_order: sortOrderOf(it.question_no),
            source_key: keys[i], updated_at: now,
          }
          const targetId = byKey.get(keys[i])?.id ?? it.id
          const { data: saved, error } = targetId
            ? await supabase.from('exam_questions').update(row).eq('id', targetId).eq('paper_id', paper.id).select('id').maybeSingle()
            : await supabase.from('exam_questions').insert({ ...row, paper_id: paper.id, created_by: me.name }).select('id').single()
          if (error) return bad(`문항 ${it.question_no}: ${error.message}`, 500)
          ids.push(saved?.id ?? targetId)
          // 문항을 타이핑하기 전에 번호만으로 적어 둔 이너프원 매칭이 있으면 이 문항에 이어 준다
          await supabase.from('exam_enough_matches').update({ question_id: saved?.id ?? targetId })
            .eq('paper_id', paper.id).eq('question_no', it.question_no).is('question_id', null)
        }
        return NextResponse.json({ ok: true, count: items.length, ids })
      }

      // ── 문항 지우기 (문제은행에 반영된 것은 못 지운다 — 이미 학습지에 쓰였을 수 있다)
      case 'deleteQuestion': {
        const { data: x } = await supabase.from('exam_questions').select('id, bank_status, created_by').eq('id', b.id).maybeSingle()
        if (!x) return bad('문항을 찾을 수 없습니다.', 404)
        if (x.bank_status === '반영완료') return bad('문제은행에 반영된 문항은 지울 수 없어요.')
        if (!isAdmin && x.created_by !== me.name) return bad('입력한 선생님이나 원장님만 지울 수 있어요.', 403)
        const { error } = await supabase.from('exam_questions').delete().eq('id', x.id)
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }

      // ── 선생님: 「반영해 주세요」 표시
      case 'requestReflect': {
        const { error } = await supabase.from('exam_questions')
          .update({ bank_status: b.on === false ? '미반영' : '반영요청', updated_at: now })
          .eq('id', b.id).neq('bank_status', '반영완료')
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }

      // ── 원장: 문제은행(problems)에 반영. 화면이 구워 보낸 그림을 problem-images 에 올리고 1행을 넣는다.
      //    같은 source_key 가 이미 있으면 새로 넣지 않고 그 행을 고친다 (문항 id 가 유지되어 예전 학습지가 안 깨진다)
      case 'reflect': {
        if (!isAdmin) return adminOnly()
        const { data: x } = await supabase.from('exam_questions').select('*').eq('id', b.id).maybeSingle()
        if (!x) return bad('문항을 찾을 수 없습니다.', 404)
        const paper = await getPaper(x.paper_id)
        if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)
        if (!x.type_code) return bad('유형을 먼저 골라 주세요. (유형이 있어야 학습지 출제에 뽑혀요)')
        if (!x.level) return bad('레벨(1~6)을 먼저 골라 주세요.')
        const { data: type } = await supabase.from('standard_types')
          .select('code, grade, semester, sub_chapter_no, sub_chapter_title').eq('code', x.type_code).maybeSingle()
        if (!type) return bad('유형표에 없는 유형입니다.')

        const png = (s: any) => {
          const m = String(s ?? '').match(/^data:image\/png;base64,(.+)$/)
          return m ? Buffer.from(m[1], 'base64') : null
        }
        const image = png(b.image)
        if (!image) return bad('문제 그림을 만들지 못했습니다. 미리보기가 보이는지 확인해 주세요.')
        if (image.length > 5 * 1024 * 1024) return bad('문제 그림이 너무 큽니다 (5MB 초과).')
        const solution = png(b.solutionImage)

        const base = `exam/${paper.id}/${x.id}`
        const up = async (path: string, buf: Buffer) =>
          (await supabase.storage.from(PROBLEM_BUCKET).upload(path, buf, { contentType: 'image/png', upsert: true })).error
        const e1 = await up(`${base}.png`, image)
        if (e1) return bad(`그림 저장 실패: ${e1.message}`, 500)
        if (solution) {
          const e2 = await up(`${base}_s.png`, solution)
          if (e2) return bad(`해설 그림 저장 실패: ${e2.message}`, 500)
        }

        const ans = bankAnswer(x.q_type, x.answer)
        const short = `${paper.school_name}${String(paper.exam_year).slice(2)}-${paper.term}${paper.exam_type.slice(0, 2)}-${x.question_no}`
        const row = {
          book: BANK_BOOK,
          grade: type.grade, semester: type.semester,
          sub_chapter_no: type.sub_chapter_no, sub_chapter_title: type.sub_chapter_title,
          local_no: short,                                   // 도래울중26-2중간-18
          type_code: x.type_code, level: x.level, difficulty: x.difficulty ?? null,
          step: '기출', is_essay: x.q_type === '서술형', is_important: !!x.is_discriminating,
          answer_kind: ans.kind, answer_text: ans.text,
          image_path: `${base}.png`,
          solution_image_path: solution ? `${base}_s.png` : null,
          source_key: x.source_key,
          source_meta: {
            source_type: 'exam',
            source_year: paper.exam_year,
            source_term: `${paper.term}학기`,
            source_exam_type: paper.exam_type,
            source_school_name: paper.school_name,
            source_grade: paper.grade,
            source_problem_no: x.question_no,
            source_key: x.source_key,
            exam_question_id: x.id,
            exam_prefix: examPrefix(paper),
          },
        }

        const { data: exist } = await supabase.from('problems').select('id').eq('source_key', x.source_key).maybeSingle()
        // 번호를 고친 뒤 다시 반영해도 같은 행을 고치도록, 전에 반영한 행을 먼저 본다
        let problemId: number | null = x.problem_id ?? exist?.id ?? null
        if (problemId) {
          const { error } = await supabase.from('problems').update(row).eq('id', problemId)
          if (error) return bad(error.message, 500)
        } else {
          const { data, error } = await supabase.from('problems').insert(row).select('id').single()
          if (error) return bad(error.message, 500)
          problemId = data.id
        }
        await supabase.from('exam_questions').update({
          bank_status: '반영완료', problem_id: problemId, reflected_at: now, reflected_by: me.name, updated_at: now,
        }).eq('id', x.id)
        return NextResponse.json({ ok: true, problemId, updated: !!exist })
      }

      // ── 이너프원 매칭 저장 / 지우기
      case 'saveMatch': {
        const m = b.match ?? {}
        if (m.match_level && !MATCH_LEVELS.includes(m.match_level)) return bad('매칭 정도를 골라 주세요.')
        if ('use_in_blog' in m && !isAdmin) {
          // 선생님은 블로그 사용 여부를 못 바꾼다 — 기존 값을 그대로 둔다
          delete m.use_in_blog
        }
        const row = pick(m, ['question_id', 'question_no', 'enough_book', 'enough_unit', 'enough_problem_no', 'match_level', 'memo', 'use_in_blog'])
        // 적은 교재·단원·번호에 해당하는 이너프원 문항이 있으면 이어 준다 → 그림이 나란히 보인다
        if (row.enough_book && row.enough_unit && row.enough_problem_no) {
          const epId = await findEnoughProblem(supabase, row.enough_book, row.enough_unit, row.enough_problem_no)
          if (epId) row.enough_problem_id = epId
        }
        const { error } = m.id
          ? await supabase.from('exam_enough_matches').update(row).eq('id', m.id)
          : await supabase.from('exam_enough_matches').insert({ ...row, paper_id: b.paperId, created_by: me.name })
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }
      case 'deleteMatch': {
        const { data: m } = await supabase.from('exam_enough_matches').select('id, created_by').eq('id', b.id).maybeSingle()
        if (!m) return bad('기록을 찾을 수 없습니다.', 404)
        if (!isAdmin && m.created_by !== me.name) return bad('입력한 선생님이나 원장님만 지울 수 있어요.', 403)
        const { error } = await supabase.from('exam_enough_matches').delete().eq('id', m.id)
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true })
      }
    }
    return bad('알 수 없는 요청입니다.')
  } catch (e: any) {
    return bad(e?.message ?? '처리하지 못했습니다.', 500)
  }
}
