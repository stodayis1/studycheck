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
import { denyIfNotStaff } from '@/lib/apiAuth'
import {
  EXAM_TYPES, FILE_KINDS, MATCH_LEVELS, Q_TYPES,
  bankAnswer, checkFileName, examPrefix, handsolveLabel, hitSummary, normNo, sortOrderOf, sourceKey,
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

// 요청 보낸 직원의 이름·역할 (denyIfNotStaff 를 통과한 뒤에만 부른다)
async function whoAmI(supabase: any, req: Request): Promise<{ name: string; role: string }> {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '').trim()
  const { data } = await supabase.auth.getUser(token)
  const { data: u } = await supabase.from('users').select('name, role').eq('id', data?.user?.id).single()
  return { name: u?.name ?? '', role: u?.role ?? '' }
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
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
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

    const id = q.get('id')
    if (!id) return bad('무엇을 볼지 알 수 없습니다.')
    const me = await whoAmI(supabase, req)
    const { data: paper } = await supabase.from('exam_papers').select('*').eq('id', id).maybeSingle()
    if (!paper) return bad('시험지를 찾을 수 없습니다.', 404)

    const [{ data: files }, { data: questions }, { data: matches }, { data: enough }] = await Promise.all([
      supabase.from('exam_paper_files').select('*').eq('paper_id', id).order('created_at'),
      supabase.from('exam_questions').select('*').eq('paper_id', id).order('sort_order').order('question_no'),
      supabase.from('exam_enough_matches').select('*').eq('paper_id', id).order('created_at'),
      // 이너프원 진도표 — 이 학교·학년 교재의 단원 이름을 고르기 쉽게
      supabase.from('inner_enough').select('level, unit_no, unit_name, sub_unit_name, created_at')
        .eq('school_name', paper.school_name).eq('grade', String(paper.grade).replace('중', '')).limit(1000),
    ])

    // 이너프원은 시험 때마다 새로 올린다. 이 시험에 쓴 것만 보이게 —
    // 시험 종료일 이전에 올린 것 중 「가장 최근에 올린 날」 묶음만 남긴다 (지난 학기 교재가 섞이지 않게)
    const kstDay = (ts: string) => new Date(new Date(ts).getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
    const inTime = (enough ?? []).filter((e: any) => !paper.exam_end_date || kstDay(e.created_at) <= paper.exam_end_date)
    const lastDay = inTime.map((e: any) => kstDay(e.created_at)).sort().pop()
    const enoughNow = inTime.filter((e: any) => kstDay(e.created_at) === lastDay)

    // 파일·문항 그림을 볼 임시 주소 (2시간)
    const paths = [
      ...(files ?? []).filter((f: any) => f.kind !== '원본' || me.role === 'admin').map((f: any) => f.storage_path),
      ...(questions ?? []).map((x: any) => x.figure_path),
    ].filter(Boolean) as string[]
    const signed: Record<string, string> = {}
    if (paths.length) {
      const { data: urls } = await supabase.storage.from(FILE_BUCKET).createSignedUrls(paths, 7200)
      ;(urls ?? []).forEach((u: any) => { if (u.signedUrl && !u.error) signed[u.path] = u.signedUrl })
    }

    // PDF 에서 잘라 넣은 문항은 그림이 문제은행 보관함에 있다 → 그 그림을 미리보기로 쓴다
    const bankIds = (questions ?? []).filter((x: any) => x.problem_id && !x.figure_path).map((x: any) => x.problem_id)
    const bankImg: Record<number, string> = {}
    if (bankIds.length) {
      const { data: ps } = await supabase.from('problems').select('id, image_path').in('id', bankIds)
      const pths = (ps ?? []).map((p: any) => p.image_path).filter(Boolean)
      const { data: urls } = pths.length ? await supabase.storage.from(PROBLEM_BUCKET).createSignedUrls(pths, 7200) : { data: [] as any[] }
      const byPath = new Map<string, string>((urls ?? []).filter((u: any) => u.signedUrl && !u.error).map((u: any) => [u.path, u.signedUrl]))
      ;(ps ?? []).forEach((p: any) => { if (byPath.has(p.image_path)) bankImg[p.id] = byPath.get(p.image_path)! })
    }
    const { data: sheet } = await supabase.from('exam_sheets').select('code').eq('note', sheetNote(id)).maybeSingle()

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
      matches: matches ?? [],
      enough: enoughNow,
      me: { name: me.name, isAdmin: me.role === 'admin' },
    })
  } catch (e: any) {
    return bad(e?.message ?? '불러오지 못했습니다.', 500)
  }
}

// ───────────────────────── POST ─────────────────────────
export async function POST(req: Request) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny
  const supabase = db()
  const b = await req.json().catch(() => null)
  if (!b?.action) return bad('잘못된 요청입니다.')
  const me = await whoAmI(supabase, req)
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
          school_name: String(p.school_name ?? '').trim(), grade: p.grade,
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
        const fileName = String(b.fileName ?? '').normalize('NFC')
        const { error } = await supabase.from('exam_paper_files').insert({
          paper_id: paper.id, kind: b.kind, file_name: fileName, storage_path: b.path,
          mime_type: b.mimeType ?? null, file_size: b.fileSize ?? null,
          question_label: b.kind === '손풀이' ? (b.questionLabel || handsolveLabel(fileName)) : null,
          name_ok: !checkFileName(paper, b.kind, fileName),
          uploaded_by: me.name,
        })
        if (error?.message?.includes('kind_check'))
          return bad('원본 보관 준비(docs/sql/시험지분석_2_원본보관.sql)가 아직 실행되지 않았습니다. 원장님께 알려 주세요.', 500)
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
