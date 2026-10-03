/**
 * 학교 기출을 문제은행에 넣고 「학원 시험지 양식으로 통째 인쇄」할 학습지를 만든다.
 *
 *   node scripts/exam-paper/upload.mjs <자른 폴더> --year 2026 --term 2 --type 중간고사 --school 도래울중 --grade 중3
 *        [--pdf <작업한 PDF>] [--original <한글 원본>]      ← 같이 주면 시험지 분석 화면의 파일 목록에도 올린다
 *        [--go]                                              ← 없으면 무엇을 할지만 보여 준다 (아무것도 안 바꾼다)
 *
 * <자른 폴더> = scripts/exam-paper/crop.py 가 만든 폴더 (01.png … + manifest.json)
 *
 * 하는 일 (여러 번 실행해도 같은 결과 — 같은 문항은 새로 넣지 않고 고친다)
 *   1) 문항 그림을 problem-images 보관함의 exam/<시험지 id>/<문항 id>.png 로 올린다
 *   2) exam_questions 에 문항을 만들고 (번호 · 배점 · 정답), problems 에 「학교기출」 문항으로 넣는다
 *      출처 열쇠(source_key) = 2026_2학기중간_도래울중_중3_18번
 *      유형(type_code)은 아직 없다 → 자동 출제에는 안 뽑힌다. 유형·레벨은 나중에 붙인다.
 *   3) 그 시험 전체를 번호 순서로 담은 학습지(exam_sheets)를 만든다. 제목 「26년 도래울중 2학기 중간고사」.
 *      note = exam_paper:<시험지 id> → 시험지 분석 화면의 인쇄 버튼이 이 학습지로 간다.
 *   4) --pdf / --original 을 주면 exam-analysis 보관함에 올리고 파일 목록에 적는다 (원본은 원장만 열람)
 *
 * 한 쪽보다 긴 문항은 인쇄 화면에서 잘리므로, 세로가 MAX_MM 을 넘으면 그림을 줄여서 올린다
 * (인쇄 화면은 「px ÷ 200dpi」 크기 그대로 찍는다).
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const args = process.argv.slice(2)
const dir = args[0]
const opt = (k, d = null) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d }
const GO = args.includes('--go')
const key = {
  exam_year: Number(opt('year')), term: Number(opt('term')), exam_type: opt('type'),
  school_name: opt('school'), grade: opt('grade'),
}
if (!dir || !key.exam_year || !key.term || !key.exam_type || !key.school_name || !key.grade) {
  console.error('쓰는 법: node scripts/exam-paper/upload.mjs <자른 폴더> --year 2026 --term 2 --type 중간고사 --school 도래울중 --grade 중3 [--pdf …] [--original …] [--go]')
  process.exit(1)
}

const DPI = 200
const MAX_MM = 175                                  // 인쇄 1쪽에 들어가는 문항 그림의 최대 세로
const MAX_PX = Math.floor((MAX_MM / 25.4) * DPI)
const prefix = `${key.exam_year}_${key.term}학기${key.exam_type === '기말고사' ? '기말' : '중간'}`
const sourceKey = (no) => `${prefix}_${key.school_name}_${key.grade}_${no}번`
const title = `${String(key.exam_year).slice(2)}년 ${key.school_name} ${key.term}학기 ${key.exam_type}`
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')
const CIRCLES = '①②③④⑤'

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
const problems = manifest.problems

// 너무 긴 그림은 줄인 사본을 만든다 (원래 자른 그림은 그대로 둔다)
function fitted(p) {
  if (p.h <= MAX_PX) return { file: path.join(dir, p.file), scaled: false }
  const out = path.join(dir, `_fit_${p.file}`)
  const w = Math.round((p.w * MAX_PX) / p.h)
  execFileSync('python', ['-c',
    `from PIL import Image; import sys; i=Image.open(sys.argv[1]); i.resize((int(sys.argv[3]), int(sys.argv[4])), Image.LANCZOS).save(sys.argv[2])`,
    path.join(dir, p.file), out, String(w), String(MAX_PX)])
  return { file: out, scaled: true }
}

function bankAnswer(a) {
  const s = String(a ?? '').trim()
  if (!s) return { q_type: null, kind: 'image', text: null }
  const picks = Array.from(s).filter((c) => CIRCLES.includes(c))
  if (picks.length) return { q_type: '객관식', kind: 'choice', text: Array.from(new Set(picks)).sort().join(', ') }
  if (/^-?\d+(\.\d+)?$/.test(s.replace(/\s/g, ''))) return { q_type: '단답형', kind: 'number', text: s.replace(/\s/g, '') }
  return { q_type: '서술형', kind: 'image', text: s }
}

console.log(`시험: ${title}  (${prefix}_${key.school_name}_${key.grade})`)
console.log(`문항: ${problems.length}개 (${problems[0].no}~${problems[problems.length - 1].no}번)`)
const tall = problems.filter((p) => p.h > MAX_PX)
if (tall.length) console.log(`한 쪽보다 길어 줄여서 올리는 문항: ${tall.map((p) => `${p.no}번(${Math.round(p.h / DPI * 25.4)}mm→${MAX_MM}mm)`).join(', ')}`)
console.log(`정답이 들어 있는 문항: ${problems.filter((p) => p.answer).length}개`)
if (!GO) { console.log('\n(--go 를 붙이지 않아 아무것도 바꾸지 않았습니다)'); process.exit(0) }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const die = (msg, e) => { console.error('✗', msg, e?.message ?? ''); process.exit(1) }

// 시험지 (없으면 만든다)
let { data: paper } = await supabase.from('exam_papers').select('*').match(key).maybeSingle()
if (!paper) {
  const r = await supabase.from('exam_papers').insert({ ...key, exam_name: `${key.exam_year} ${key.term}학기 ${key.exam_type}`, created_by: 'Claude(기출 넣기)' }).select('*').single()
  if (r.error) die('시험지 만들기 실패', r.error)
  paper = r.data
}
console.log('시험지 id', paper.id)

const ids = []
for (const p of problems) {
  const no = String(p.no)
  const sk = sourceKey(no)
  const ans = bankAnswer(p.answer)
  const isEssay = !!p.essay
  const qType = isEssay ? '서술형' : ans.q_type ?? '객관식'

  // 문항 (exam_questions)
  let { data: q } = await supabase.from('exam_questions').select('id, problem_id').eq('source_key', sk).maybeSingle()
  const qRow = { paper_id: paper.id, question_no: no, sort_order: p.no, q_type: qType, figure_is_whole: true, source_key: sk,
                 ...(p.answer ? { answer: p.answer } : {}), source_memo: p.points ? `배점 ${p.points}점` : null, updated_at: new Date().toISOString() }
  if (q) {
    const r = await supabase.from('exam_questions').update(qRow).eq('id', q.id)
    if (r.error) die(`${no}번 문항 고치기 실패`, r.error)
  } else {
    const r = await supabase.from('exam_questions').insert({ ...qRow, created_by: 'Claude(기출 넣기)' }).select('id, problem_id').single()
    if (r.error) die(`${no}번 문항 만들기 실패`, r.error)
    q = r.data
  }

  // 그림
  const img = fitted(p)
  const imagePath = `exam/${paper.id}/${q.id}.png`
  const up = await supabase.storage.from('problem-images').upload(imagePath, fs.readFileSync(img.file), { contentType: 'image/png', upsert: true })
  if (up.error) die(`${no}번 그림 올리기 실패`, up.error)

  // 문제은행 (problems)
  const row = {
    book: '학교기출', grade: key.grade, semester: key.term,
    sub_chapter_no: 0, sub_chapter_title: `${key.school_name} ${String(key.exam_year).slice(2)}-${key.term} ${key.exam_type.slice(0, 2)}`,
    local_no: `${key.school_name}${String(key.exam_year).slice(2)}-${key.term}${key.exam_type.slice(0, 2)}-${no}`,
    step: '기출', is_essay: qType === '서술형', answer_kind: ans.kind, answer_text: ans.text,
    image_path: imagePath, source_key: sk,
    source_meta: {
      source_type: 'exam', source_year: key.exam_year, source_term: `${key.term}학기`, source_exam_type: key.exam_type,
      source_school_name: key.school_name, source_grade: key.grade, source_problem_no: no, source_key: sk,
      exam_question_id: q.id, points: p.points ?? null, from_pdf: manifest.pdf,
    },
  }
  let { data: exist } = await supabase.from('problems').select('id, type_code, level').eq('source_key', sk).maybeSingle()
  let pid = exist?.id ?? q.problem_id
  if (pid) {
    const r = await supabase.from('problems').update(row).eq('id', pid)      // 유형·레벨은 건드리지 않는다
    if (r.error) die(`${no}번 문제은행 고치기 실패`, r.error)
  } else {
    const r = await supabase.from('problems').insert(row).select('id').single()
    if (r.error) die(`${no}번 문제은행 넣기 실패`, r.error)
    pid = r.data.id
  }
  await supabase.from('exam_questions').update({ problem_id: pid, bank_status: '반영완료', reflected_at: new Date().toISOString(), reflected_by: 'Claude(기출 넣기)' }).eq('id', q.id)
  ids.push(pid)
  process.stdout.write(`\r  ${no}번 완료 (문제은행 #${pid})${img.scaled ? ' · 줄여서 올림' : ''}        `)
}
console.log()

// 통째 인쇄용 학습지
const note = `exam_paper:${paper.id}`
let { data: sheet } = await supabase.from('exam_sheets').select('id, code').eq('note', note).maybeSingle()
if (!sheet) {
  let code = newCode()
  for (let i = 0; i < 5; i++) {
    const { data: dup } = await supabase.from('exam_sheets').select('id').eq('code', code).maybeSingle()
    if (!dup) break
    code = newCode()
  }
  const r = await supabase.from('exam_sheets').insert({ code, title, grade: key.grade, semester: key.term, note, show_source: false, show_difficulty: false }).select('id, code').single()
  if (r.error) die('학습지 만들기 실패', r.error)
  sheet = r.data
} else {
  await supabase.from('exam_sheets').update({ title }).eq('id', sheet.id)
  const del = await supabase.from('exam_sheet_problems').delete().eq('sheet_id', sheet.id)     // 문항 목록만 다시 짠다 (채점 기록은 그대로)
  if (del.error) die('학습지 문항 정리 실패', del.error)
}
const ins = await supabase.from('exam_sheet_problems').insert(ids.map((pid, i) => ({ sheet_id: sheet.id, no: i + 1, problem_id: pid })))
if (ins.error) die('학습지 문항 넣기 실패', ins.error)
console.log(`학습지 「${title}」 코드 ${sheet.code} · ${ids.length}문항`)

// 파일 목록에 올리기
async function addFile(local, kind, ext) {
  if (!local) return
  const fileName = `${prefix}_${key.school_name}_${key.grade}_${kind}.${ext}`
  const { data: had } = await supabase.from('exam_paper_files').select('id').eq('paper_id', paper.id).eq('file_name', fileName).maybeSingle()
  if (had) { console.log(`파일 「${fileName}」 은 이미 있어 건너뜀`); return }
  const storagePath = `${paper.id}/${crypto.randomUUID()}.${ext}`
  const buf = fs.readFileSync(local)
  const up = await supabase.storage.from('exam-analysis').upload(storagePath, buf, { contentType: ext === 'pdf' ? 'application/pdf' : 'application/octet-stream' })
  if (up.error) die(`${kind} 파일 올리기 실패`, up.error)
  const r = await supabase.from('exam_paper_files').insert({ paper_id: paper.id, kind, file_name: fileName, storage_path: storagePath,
    mime_type: ext === 'pdf' ? 'application/pdf' : 'application/octet-stream', file_size: buf.length, uploaded_by: 'Claude(기출 넣기)' })
  if (r.error) die(`${kind} 파일 적기 실패`, r.error)
  console.log(`파일 「${fileName}」 올림 (${kind})`)
}
await addFile(opt('pdf'), '문제', 'pdf')
const orig = opt('original')
await addFile(orig, '원본', orig ? path.extname(orig).slice(1).toLowerCase() : '')

console.log(`\n끝. 인쇄: /teacher/gradings/print?code=${sheet.code}`)
