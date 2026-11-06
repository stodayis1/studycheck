/**
 * 쎈 B단계 대표유형 풀이 영상 재료 — 문제은행의 대표문제(빨간 상자) 그림과 정답을 받아 목록과 함께 둔다 (원장님 2026-11-06)
 *
 *   node scripts/lesson-video/ssen_materials.mjs --grade 중1 --semester 2 --out "<과정 영상 폴더>/_재료/풀이"   (render_all --solutions --video <과정 영상 폴더> → <과정 영상 폴더>/풀이영상)
 *
 * · problems(book 쎈, step B, difficulty 대표)의 문제 그림 → <local_no>.png, 정답 그림 → <local_no>_a.png (problem-images 버킷)
 *   쎈 해설집은 스캔본이라 풀이 그림이 없다 → 대본은 문제를 직접 풀고 정답(answer)과 맞춘다
 * · _목록.json: 필수예제 풀이(solution_materials.mjs)와 같은 꼴이라 render_all --solutions 가 그대로 읽는다
 *   concept_no = 소단원 번호, sol_no = 유형 번호 → 파일 「NN_풀이MM_…」, book_no = 쎈 문항 번호
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const l of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d }
const grade = opt('--grade'), semester = +opt('--semester'), out = opt('--out')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
fs.mkdirSync(out, { recursive: true })

const { data: probs, error } = await db.from('problems')
  .select('local_no, type_code, page_no, image_path, answer_image_path, answer_text, sub_chapter_no, sub_chapter_title')
  .eq('book', '쎈').eq('step', 'B').eq('difficulty', '대표').eq('grade', grade).eq('semester', semester)
if (error) throw error
const { data: types, error: e2 } = await db.from('standard_types')
  .select('code, type_no, type_title, chapter_title, sub_chapter_title').in('code', probs.map((p) => p.type_code))
if (e2) throw e2
const T = Object.fromEntries(types.map((t) => [t.code, t]))
probs.sort((a, b) => +a.local_no - +b.local_no)

// 파일 이름에 못 쓰는 글자·얇은 빈칸은 바꾼다
const clean = (s) => String(s ?? '').replace(/[   ]/g, ' ').replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim()
const list = []
for (const p of probs) {
  const t = T[p.type_code]
  if (!t) throw new Error(`유형 없음: ${p.local_no} ${p.type_code}`)
  const no = String(p.local_no).padStart(4, '0')
  for (const [src, dst] of [[p.image_path, `${no}.png`], [p.answer_image_path, `${no}_a.png`]]) {
    if (!src || fs.existsSync(path.join(out, dst))) continue
    const { data, error } = await db.storage.from('problem-images').download(src)
    if (error) throw new Error(`${src}: ${error.message}`)
    fs.writeFileSync(path.join(out, dst), Buffer.from(await data.arrayBuffer()))
  }
  const cn = p.sub_chapter_no, tn = t.type_no
  list.push({
    local_no: no, type_code: p.type_code, page_no: p.page_no, book_no: +p.local_no, concept_no: cn, sol_no: tn,
    title: clean(t.type_title), chapter: clean(t.chapter_title), sub_chapter: clean(t.sub_chapter_title), answer: p.answer_text,
    file: `${String(cn).padStart(2, '0')}_풀이${String(tn).padStart(2, '0')}_${clean(t.sub_chapter_title)}_유형${String(tn).padStart(2, '0')} ${clean(t.type_title)}_쎈 ${p.local_no}번 p${p.page_no}`,
  })
}
// 같은 (소단원, 유형) 이 둘이면 파일이 겹친다 — 대표문제는 유형마다 하나여야 한다
const dup = list.filter((x, i) => list.findIndex((y) => y.concept_no === x.concept_no && y.sol_no === x.sol_no) !== i)
if (dup.length) throw new Error('유형 번호가 겹침: ' + dup.map((d) => d.local_no).join(','))
fs.writeFileSync(path.join(out, '_목록.json'), JSON.stringify(list, null, 1))
console.log(`${grade}-${semester} 대표문제 ${list.length}개 → ${out}`)
