// 이미 올라가 있는 RPM 중1-1 문항의 **정보만** 고친다 (그림은 그대로 둔다).
//
//   node scripts/crop-rpm/apply.mjs            ← 무엇이 바뀌는지만 보여 준다
//   node scripts/crop-rpm/apply.mjs --write    ← 실제로 고친다
//
// 고치기 전 상태를 scripts/crop-rpm/되돌리기.sql 과 백업.json 에 남긴다.
// 되돌리려면 되돌리기.sql 을 그대로 실행하면 된다.
//
// 왜 지우고 다시 안 올리나: 2026-10-02 에 올라간 그림이 RPM 원본 교재 판이라
// 한글 재편집본보다 깔끔하다. 번호(0001~1123)가 서로 같아서 정보만 갈아끼우면 된다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })
const WRITE = process.argv.includes('--write')

const want = new Map()
for (const r of JSON.parse(fs.readFileSync(path.join(HERE, '..', 'problems_rpm_m1_1.json'), 'utf8'))) {
  want.set(Number(r.l), r)
}

let rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('problems')
    .select('id, local_no, sub_chapter_no, sub_chapter_title, type_code, difficulty, is_essay, is_important')
    .eq('book', 'RPM').eq('grade', '중1').eq('semester', 1).order('id').range(from, from + 999)
  if (error) throw error
  rows.push(...data)
  if (data.length < 1000) break
}

const q = (v) => (v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`)
const plan = [], undo = [], diff = { 소단원: 0, 유형: 0, 난이도: 0, 서술형: 0, 대표문제: 0 }
const 없음 = []
for (const r of rows) {
  // 560 번의 둘째 칸인 561 번은 560 과 같은 문제다 → 같은 정보를 쓴다
  const w = want.get(Number(r.local_no)) ?? want.get(Number(r.local_no) - 1)
  if (!w) { 없음.push(r.local_no); continue }
  const next = { sub_chapter_no: w.n, sub_chapter_title: w.t, type_code: w.c,
                 difficulty: w.d ?? null, is_essay: !!w.e, is_important: !!w.i }
  if (r.sub_chapter_no !== next.sub_chapter_no) diff.소단원++
  if (r.type_code !== next.type_code) diff.유형++
  if ((r.difficulty ?? null) !== next.difficulty) diff.난이도++
  if (r.is_essay !== next.is_essay) diff.서술형++
  if (r.is_important !== next.is_important) diff.대표문제++
  plan.push({ id: r.id, ...next })
  undo.push(`update problems set sub_chapter_no=${r.sub_chapter_no}, sub_chapter_title=${q(r.sub_chapter_title)}, `
    + `type_code=${q(r.type_code)}, difficulty=${q(r.difficulty)}, is_essay=${r.is_essay}, `
    + `is_important=${r.is_important} where id=${r.id};`)
}

fs.writeFileSync(path.join(HERE, '백업.json'), JSON.stringify(rows), 'utf8')
fs.writeFileSync(path.join(HERE, '되돌리기.sql'),
  `-- RPM 중1-1 문항 정보를 ${new Date().toISOString().slice(0, 10)} 이전 상태로 되돌린다\nbegin;\n`
  + undo.join('\n') + '\ncommit;\n', 'utf8')

console.log(`RPM 중1-1 문항 ${rows.length}개 중 고칠 것 ${plan.length}개` + (없음.length ? ` · 짝 못 찾음 ${없음.length}개 ${없음.slice(0, 5)}` : ''))
console.log('  바뀌는 수:', diff)
if (!WRITE) { console.log('  (--write 를 붙여야 실제로 고칩니다. 되돌리기.sql 은 이미 만들어 뒀습니다)'); process.exit(0) }

// upsert 는 book 같은 필수 칸까지 달라고 해서 못 쓴다 — 한 줄씩 고친다
let n = 0, i = 0, fail = 0
async function worker() {
  while (i < plan.length) {
    const { id, ...set } = plan[i++]
    const { error } = await db.from('problems').update(set).eq('id', id)
    if (error) { if (fail++ < 5) console.error('X', id, error.message); continue }
    if (++n % 100 === 0) process.stdout.write(`\r  고치는 중 ${n}/${plan.length}`)
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
console.log(`\n고침 ${n}개` + (fail ? ` · 실패 ${fail}개` : '') + ' — 되돌리려면 scripts/crop-rpm/되돌리기.sql')