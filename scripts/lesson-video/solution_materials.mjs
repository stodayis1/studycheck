/**
 * 풀이 영상(필수예제) 대본 재료 — 문제은행의 필수예제 그림을 받아 와 목록과 함께 둔다
 *
 *   node scripts/lesson-video/solution_materials.mjs --grade 공통수학1 --mat "<영상 폴더>/_재료" --out "<영상 폴더>/_재료/풀이"
 *
 * · problems(개념+유형 개념편, step 필수예제)의 문제 그림 → <local_no>.png, 교재 풀이 그림 → <local_no>_a.png (problem-images 버킷)
 * · _목록.json: local_no, type_code, page_no, book_no(교재 예제 번호), concept_no, sol_no(개념 안 순번), title, chapter, sub_chapter, file
 *   개념·예제 번호는 개념 재료(<mat>/NN.json 의 examples)를 쪽 순서로 맞춰 정한다 — 필수예제 수와 개념 재료의 예제 수가 같아야 한다
 * · 공통수학2 의 _재료/풀이 와 같은 꼴 (docs/대본/공통수학2/풀이/_대본쓰기_지침.md)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const grade = opt('--grade', '공통수학1'), mat = opt('--mat'), out = opt('--out')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
fs.mkdirSync(out, { recursive: true })

const { data: probs, error } = await db.from('problems')
  .select('local_no, type_code, page_no, image_path, answer_image_path, sub_chapter_no, sub_chapter_title')
  .eq('grade', grade).eq('step', '필수예제').like('book', '%개념%유형%').order('local_no')
if (error) throw error

// 개념 재료의 예제를 개념 순서대로 펼친다 (소단원마다 local_no 순서와 같다)
const concepts = fs.readdirSync(mat).filter((f) => /^\d\d\.json$/.test(f)).sort().map((f) => JSON.parse(fs.readFileSync(path.join(mat, f), 'utf8')))
const seq = {}, slots = []
for (const c of concepts) {
  c.examples.forEach((e, i) => {
    seq[c.sub_no] = (seq[c.sub_no] || 0) + 1
    slots.push({ local_no: `${String(c.sub_no).padStart(2, '0')}${String(seq[c.sub_no]).padStart(2, '0')}`, concept: c, ex: e, sol_no: i + 1 })
  })
}
if (slots.length !== probs.length) throw new Error(`예제 수가 다름: 개념 재료 ${slots.length} · 문제은행 ${probs.length}`)
const byLocal = Object.fromEntries(probs.map((p) => [p.local_no, p]))

const list = []
for (const s of slots) {
  const p = byLocal[s.local_no]; if (!p) throw new Error('문제은행에 없음 ' + s.local_no)
  const c = s.concept
  const title = s.ex.title.replace(/－/g, '-').replace(/\s+/g, ' ').trim()
  const safe = title.replace(/[\\/:*?"<>|]/g, '')
  const file = `${String(c.no).padStart(2, '0')}_풀이${String(s.sol_no).padStart(2, '0')}_${c.chapter}_${c.sub_chapter}_${safe}_개념+유형 p${String(p.page_no).padStart(2, '0')}`
  list.push({ local_no: s.local_no, type_code: p.type_code, page_no: p.page_no, image_path: p.image_path, answer_image_path: p.answer_image_path,
    concept_no: c.no, sol_no: s.sol_no, book_no: s.ex.no, title, chapter: c.chapter, sub_chapter: c.sub_chapter, file })
  for (const [src, dst] of [[p.image_path, `${s.local_no}.png`], [p.answer_image_path, `${s.local_no}_a.png`]]) {
    const to = path.join(out, dst)
    if (!src || fs.existsSync(to)) continue
    const { data, error: e } = await db.storage.from('problem-images').download(src)
    if (e) { console.log('! 못 받음', src, e.message); continue }
    fs.writeFileSync(to, Buffer.from(await data.arrayBuffer()))
  }
}
fs.writeFileSync(path.join(out, '_목록.json'), JSON.stringify(list, null, 1))
console.log(`${list.length}문제 → ${out}`)
