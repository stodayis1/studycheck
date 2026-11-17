/**
 * 기출 시험지 PDF 여러 개를 **시험지 분석**(exam_papers + exam_paper_files + 보관함)에 올린다.
 *
 *   node scripts/exam-paper/upload-papers.mjs <폴더> --year 2025 --term 2 --type 기말고사 --grade 고1 \
 *        [--kind 문제] [--scope "공통수학2 · 명제 ~ 무리함수"] [--note "..."] [--go]
 *
 * 폴더 안의 `2025_2학기기말_가좌고_고1_문제.pdf` 꼴 파일 이름에서 **학교**를 읽는다
 * (`_목록.json` 이 있으면 학교·범위를 거기서 읽는다 — 자른 스크립트가 남긴 것).
 *
 * ★ --go 없이 돌리면 **무엇을 할지 보여 주기만** 한다. 두 번 돌려도 같은 시험지를 또 만들지 않는다
 *   (연도·학기·구분·학교·학년이 같으면 그 시험지에 파일만 보탠다. 같은 이름의 파일이 이미
 *   붙어 있으면 건너뛴다).
 *
 * 규칙은 화면·API 와 **같은 함수**를 쓴다 — lib/school.ts 의 normalizeSchool,
 * lib/examAnalysis.ts 의 standardFileName·defaultExamName. 베껴 쓰지 않는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { normalizeSchool } from '../../lib/school.ts'
import { standardFileName, defaultExamName, EXAM_TYPES, FILE_KINDS } from '../../lib/examAnalysis.ts'

const BUCKET = 'exam-analysis'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const argv = process.argv.slice(2)
const dir = argv[0]
const opt = (k, d = '') => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d }
const GO = argv.includes('--go')
const year = Number(opt('year'))
const term = Number(opt('term'))
const type = opt('type')
const grade = opt('grade')
const kind = opt('kind', '문제')
const scopePrefix = opt('scope')
const note = opt('note')
const by = opt('by', 'Claude')

if (!dir || !fs.existsSync(dir)) { console.error('폴더를 찾을 수 없어요:', dir); process.exit(1) }
if (!year || ![1, 2].includes(term) || !EXAM_TYPES.includes(type) || !grade) {
  console.error('--year 2025 --term 2 --type 기말고사 --grade 고1 이 모두 있어야 해요'); process.exit(1)
}
if (!FILE_KINDS.includes(kind)) { console.error('파일 구분이 이상해요:', kind); process.exit(1) }

/** 자른 스크립트가 남긴 목록(학교·범위) */
const listPath = path.join(dir, '_목록.json')
const meta = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : []
const metaBy = new Map(meta.map((m) => [m.file, m]))

const files = fs.readdirSync(dir).filter((f) => /\.pdf$/i.test(f)).sort()
if (!files.length) { console.error('PDF 가 없어요'); process.exit(1) }

console.log(`${files.length}개 파일 · ${year}년 ${term}학기 ${type} · ${grade} · 구분 ${kind}`)
console.log(GO ? '→ 실제로 올립니다\n' : '→ 보여 주기만 합니다 (실제로 올리려면 --go)\n')

let made = 0, added = 0, skipped = 0
for (const f of files) {
  const m = metaBy.get(f)
  // 파일 이름 꼴: 2025_2학기기말_가좌고_고1_문제.pdf
  const fromName = f.replace(/\.pdf$/i, '').split('_')
  const schoolRaw = m?.school ?? fromName[2]
  const school = normalizeSchool(schoolRaw)
  if (!school) { console.log(`  ? ${f} — 학교를 못 읽었어요. 건너뜁니다`); skipped++; continue }

  const key = { exam_year: year, term, exam_type: type, school_name: school, grade }
  const { data: found } = await db.from('exam_papers').select('id').match(key).maybeSingle()
  let paperId = found?.id
  const scope = [scopePrefix, m?.scope].filter(Boolean).join(' · ')
  const label = `${school} ${grade}`

  if (!paperId) {
    if (GO) {
      const { data, error } = await db.from('exam_papers').insert({
        ...key, exam_name: defaultExamName(key), exam_scope: scope || null,
        note: note || null, created_by: by,
      }).select('id').single()
      if (error) { console.log(`  ✗ ${label} — 시험지를 만들지 못했어요: ${error.message}`); skipped++; continue }
      paperId = data.id
    }
    made++
    console.log(`  + ${label} — 시험지 새로 만듦${scope ? ` (${scope})` : ''}`)
  } else {
    console.log(`  · ${label} — 이미 있는 시험지에 붙입니다`)
  }

  const fileName = standardFileName({ ...key }, kind, f)
  if (paperId) {
    const { data: dup } = await db.from('exam_paper_files').select('id')
      .eq('paper_id', paperId).eq('file_name', fileName).maybeSingle()
    if (dup) { console.log(`    = ${fileName} — 이미 붙어 있어요. 건너뜁니다`); skipped++; continue }
  }

  const bytes = fs.readFileSync(path.join(dir, f))
  console.log(`    ${fileName} (${(bytes.length / 1024 / 1024).toFixed(2)}MB)`)
  if (!GO) { added++; continue }

  const storagePath = `${paperId}/${crypto.randomUUID()}.pdf`
  const up = await db.storage.from(BUCKET).upload(storagePath, bytes, { contentType: 'application/pdf' })
  if (up.error) { console.log(`    ✗ 보관함에 올리지 못했어요: ${up.error.message}`); skipped++; continue }
  const { error } = await db.from('exam_paper_files').insert({
    paper_id: paperId, kind, file_name: fileName, storage_path: storagePath,
    mime_type: 'application/pdf', file_size: bytes.length, name_ok: true, uploaded_by: by,
  })
  if (error) { console.log(`    ✗ 목록에 적지 못했어요: ${error.message}`); skipped++; continue }
  added++
}

console.log(`\n시험지 새로 ${made}개 · 파일 ${added}개 · 건너뜀 ${skipped}개`)
if (!GO) console.log('실제로 올리려면 --go 를 붙여 다시 돌리세요.')
