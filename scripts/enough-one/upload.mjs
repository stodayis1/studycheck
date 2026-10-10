/**
 * 이너프원 문항 그림을 앱에 올린다 (적중 대조에서 기출과 나란히 보기 위함).
 *
 *   node scripts/enough-one/upload.mjs images        ← 그림 5,115장을 보관함(exam-analysis)에 올린다
 *   node scripts/enough-one/upload.mjs rows          ← enough_problems 표에 문항 줄을 넣는다
 *   node scripts/enough-one/upload.mjs link          ← 이미 적어 둔 매칭 기록에 문항을 이어 준다
 *
 * 순서: images 는 언제든 된다. rows · link 는 docs/sql/시험지분석_3_이너프원문항.sql 을 실행한 뒤에.
 * 전부 여러 번 돌려도 된다 (이미 있는 것은 건너뛴다).
 * 자른 그림과 manifest.json 은 scripts/enough-one/crop.py 가 만든 것을 쓴다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const ROOT = 'C:\\Users\\USER\\문제은행\\이너프원\\2026-2학기\\crops'
const EDITION = '2026-2학기'
const BUCKET = 'exam-analysis'
// 자른 폴더 이름 → [보관함 폴더(영문), 화면에 보일 교재명]
const BOOKS = {
  '중2 상': ['m2-sang', '이너프원 중2 상'],
  '중2 중': ['m2-jung', '이너프원 중2 중'],
  '중2 하': ['m2-ha', '이너프원 중2 하'],
  '신원중3 1권 A': ['sw3-1a', '이너프원 신원중3 1권 (중)'],
  '신원중3 1권 B': ['sw3-1b', '이너프원 신원중3 1권 (상)'],
  '신원중3 2권 A': ['sw3-2a', '이너프원 신원중3 2권 (중)'],
  '신원중3 2권 B': ['sw3-2b', '이너프원 신원중3 2권 (상)'],
  '타학교중3 1권': ['etc3-1', '이너프원 타학교 중3 1권'],
  '타학교중3 2권': ['etc3-2', '이너프원 타학교 중3 2권'],
  // 고1 — 교과서 출판사 평가문제 (신원고 = 미래엔, 동산고 = 천재(전). scripts/enough-one/crop_eval.py)
  '고1 공수2 S반': ['h1-s', '이너프원 고1 공수2 S반'],            // 고양일고 (그림 PDF — scripts/enough-one/index_hs.py)
  '고1 미래엔 평가': ['h1-mirae', '교과서 평가문제 미래엔 공통수학2'],
  '고1 천재전 평가': ['h1-chunjae', '교과서 평가문제 천재(전) 공통수학2'],
  // 고1 — 교과서 본문 문제 (자기 학교 교과서만 푼다: 신원고 = 미래엔, 동산고 = 천재(전))
  '고1 미래엔 교과서': ['h1-mirae-tb', '교과서 문제 미래엔 공통수학2'],
  '고1 천재전 교과서': ['h1-chunjae-tb', '교과서 문제 천재(전) 공통수학2'],
}
const unitOf = (title) => String(title ?? '').replace(/\s*-\s*(\d회차)/, ' $1').replace(/\s+/g, ' ').trim()
const pathOf = (x) => `enough-one/2026-2/${BOOKS[x.book][0]}/${String(x.set).padStart(2, '0')}_${String(x.no).padStart(2, '0')}.png`

const mode = process.argv[2]
// manifest.json (중등 9권) + manifest_<책>.json (나중에 더한 책). 이 파일의 BOOKS 에 적힌 책만 올린다
const manifest = [
  ...JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')),
  ...fs.readdirSync(ROOT).filter((f) => /^manifest_.+\.json$/.test(f)).flatMap((f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'))),
].filter((x) => BOOKS[x.book])
  .filter((x, i, all) => all.findIndex((y) => y.book === x.book && y.set === x.set && y.no === x.no) === i)      // 두 파일에 같이 든 책(중2 하)은 한 번만
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

if (mode === 'images') {
  let up = 0, skip = 0, fail = 0
  const queue = [...manifest]
  async function worker() {
    for (;;) {
      const x = queue.shift()
      if (!x) return
      const r = await supabase.storage.from(BUCKET).upload(pathOf(x), fs.readFileSync(path.join(ROOT, x.file)), { contentType: 'image/png', upsert: false })
      if (!r.error) up++
      else if (/exists|Duplicate/i.test(r.error.message)) skip++
      else { fail++; console.error('\n✗', x.file, r.error.message) }
      if ((up + skip + fail) % 100 === 0) process.stdout.write(`\r  ${up + skip + fail}/${manifest.length} (올림 ${up} · 이미 있음 ${skip} · 실패 ${fail})`)
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker))
  console.log(`\n그림: 올림 ${up} · 이미 있음 ${skip} · 실패 ${fail} / 전체 ${manifest.length}`)
  process.exit(fail ? 1 : 0)
}

if (mode === 'rows') {
  const rows = manifest.map((x) => ({
    edition: EDITION, book: BOOKS[x.book][1], set_no: x.set, unit: unitOf(x.set_title), problem_no: x.no,
    page_no: x.page, image_path: pathOf(x),
    twin_of: x.src ? `${x.src[0]} 중등 ${x.src[1]} P.${x.src[2]} ${x.src[3]}번` : null,
  }))
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('enough_problems').upsert(rows.slice(i, i + 500), { onConflict: 'edition,book,set_no,problem_no' })
    if (error) { console.error('✗ 넣기 실패:', error.message); process.exit(1) }
    process.stdout.write(`\r  ${Math.min(i + 500, rows.length)}/${rows.length}`)
  }
  const { count } = await supabase.from('enough_problems').select('*', { count: 'exact', head: true }).eq('edition', EDITION)
  console.log(`\n문항 줄: ${count} / ${rows.length}`)
  process.exit(0)
}

if (mode === 'link') {
  const { data: ms, error } = await supabase.from('exam_enough_matches')
    .select('id, enough_book, enough_unit, enough_problem_no').is('enough_problem_id', null).limit(5000)
  if (error) { console.error('✗', error.message); process.exit(1) }
  let linked = 0
  const miss = []
  for (const m of ms ?? []) {
    const { data: p } = await supabase.from('enough_problems').select('id')
      .eq('edition', EDITION).eq('book', m.enough_book).eq('unit', unitOf(m.enough_unit)).eq('problem_no', Number(m.enough_problem_no)).maybeSingle()
    if (!p) { miss.push(`${m.enough_book} / ${m.enough_unit} / ${m.enough_problem_no}`); continue }
    await supabase.from('exam_enough_matches').update({ enough_problem_id: p.id }).eq('id', m.id)
    linked++
  }
  console.log(`매칭 기록 ${ms?.length ?? 0}건 중 ${linked}건에 문항을 이었습니다.` + (miss.length ? `\n못 찾은 것 ${miss.length}건:\n  ` + miss.join('\n  ') : ''))
  process.exit(0)
}

// 묶음 그림(10문항씩 한 장, 칸마다 빨간 [S01-31] 표시): 화면의 「AI 적중 대조」가 이걸 보고 비슷한 문항을 찾는다.
// 보관함 enough-one/2026-2/sheets/<교재>/<NNN>.png — NNN 번째 장에는 그 교재의 (NNN-1)×10+1 ~ NNN×10 번째 문항이 있다.
if (mode === 'sheets') {
  const SHEETS = path.join(ROOT, '..', 'sheets')
  const jobs = []
  for (const [folder, [code]] of Object.entries(BOOKS)) {
    const dir = path.join(SHEETS, folder)
    if (!fs.existsSync(dir)) { console.error('묶음 그림 폴더가 없습니다:', dir); continue }
    for (const f of fs.readdirSync(dir).filter((x) => /^\d{3}\.png$/.test(x))) jobs.push([path.join(dir, f), `enough-one/2026-2/sheets/${code}/${f}`])
  }
  let up = 0, skip = 0, fail = 0
  async function worker() {
    for (;;) {
      const j = jobs.shift()
      if (!j) return
      const r = await supabase.storage.from(BUCKET).upload(j[1], fs.readFileSync(j[0]), { contentType: 'image/png', upsert: false })
      if (!r.error) up++
      else if (/exists|Duplicate/i.test(r.error.message)) skip++
      else { fail++; console.error('\n✗', j[1], r.error.message) }
    }
  }
  const total = jobs.length
  await Promise.all(Array.from({ length: 6 }, worker))
  console.log(`묶음 그림: 올림 ${up} · 이미 있음 ${skip} · 실패 ${fail} / 전체 ${total}`)
  process.exit(fail ? 1 : 0)
}

console.error('쓰는 법: node scripts/enough-one/upload.mjs images | rows | link | sheets')
process.exit(1)
