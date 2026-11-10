/**
 * 시험지 **한 문항만** 다시 반영한다 — 새 PDF 에서 그 번호를 잘라, 이미 들어가 있는 그림을
 * 같은 자리에 바꿔 넣는다. 번호·정답·배점·유형은 그대로 두고 **그림만** 바뀐다.
 *
 * 언제 쓰나
 *   올리신 PDF 에 그림이 빠진 채로 들어간 문항을 고칠 때. 2026-11-10 고양중 중1 2번이
 *   그랬다 — 올라간 PDF 에 선분 그림이 아예 없었고(자르기가 아니라 원본이 그랬다),
 *   원장님이 고친 PDF 를 주셨다. 문항을 통째로 다시 넣으면 손으로 붙여 둔 단원·유형이
 *   날아갈 수 있어 **그림만** 바꾼다.
 *
 * 쓰는 법 — 환경 파일이 있는 폴더에서
 *   node --import ./scripts/exam-crop-env.mjs scripts/exam-reimport-one.mjs \
 *        "<새.pdf>" lib/examPdfCrop.ts <시험지 id> <문항번호> [--save]
 *
 *   기본은 **미리보기**다. --save 를 붙여야 바꾼다.
 *   바꾸기 전 그림은 미리 내려받아 두면 되돌릴 수 있다(같은 자리에 다시 올리면 된다).
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) { console.error('✗ 환경 파일에 주소와 service_role 열쇠가 필요합니다.'); process.exit(1) }
const sb = createClient(URL_, KEY, { auth: { persistSession: false } })

const [pdfPath, libPath, paperId, noArg] = process.argv.slice(2)
const SAVE = process.argv.includes('--save')
if (!pdfPath || !libPath || !paperId || !noArg) {
  console.error('✗ 쓰는 법: node --import ./scripts/exam-crop-env.mjs scripts/exam-reimport-one.mjs "<새.pdf>" lib/examPdfCrop.ts <시험지 id> <문항번호> [--save]')
  process.exit(1)
}
if (!globalThis.document) {
  console.error('✗ 밑자리를 안 깔았습니다 — 앞에 `--import ./scripts/exam-crop-env.mjs` 를 붙여 주세요.')
  process.exit(1)
}
const no = String(noArg)

const { cropExamPdf } = await import(pathToFileURL(path.resolve(libPath)).href)
const buf = fs.readFileSync(pdfPath)
const r = await cropExamPdf(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
const p = r.problems.find((x) => String(x.no) === no)
if (!p) {
  console.error(`✗ 새 PDF 에서 ${no}번을 못 찾았습니다 (찾은 번호: ${r.problems.map((x) => x.no).join(', ')})`)
  process.exit(1)
}
console.log(`새 PDF 의 ${no}번 — ${p.w}x${p.h} · 배점 ${p.points ?? '-'} · 보기 ${p.choices} · 정답 ${p.answer ?? '(그림)'}`)

const { data: q } = await sb.from('exam_questions')
  .select('id, question_no, problem_id').eq('paper_id', paperId).eq('question_no', no).maybeSingle()
if (!q?.problem_id) { console.error('✗ 그 문항이 아직 문제은행에 안 들어가 있습니다.'); process.exit(1) }
const { data: prob } = await sb.from('problems').select('id, image_path').eq('id', q.problem_id).single()
console.log(`지금 자리 — 문항 ${q.id} · 문제은행 ${prob.id} · ${prob.image_path}`)

const { data: old } = await sb.storage.from('problem-images').download(prob.image_path)
const png = p.image.toBuffer('image/png')
console.log(`지금 그림 ${old ? (await old.arrayBuffer()).byteLength : 0} 바이트 → 새 그림 ${png.length} 바이트`)

if (!SAVE) { console.log('\n미리보기만 했습니다. --save 를 붙이면 바꿉니다.'); process.exit(0) }

const { error } = await sb.storage.from('problem-images').upload(prob.image_path, png, { contentType: 'image/png', upsert: true })
if (error) { console.error('✗ 저장 실패:', error.message); process.exit(1) }

// 정말 바뀌었는지 되읽어 확인한다 (올렸다는 말만 믿지 않는다)
const { data: now } = await sb.storage.from('problem-images').download(prob.image_path)
const nowLen = now ? (await now.arrayBuffer()).byteLength : 0
console.log(nowLen === png.length ? `✓ 바꿨습니다 — 되읽은 그림 ${nowLen} 바이트로 같습니다.` : `✗ 되읽은 그림이 다릅니다 (${nowLen})`)
process.exitCode = nowLen === png.length ? 0 : 1
