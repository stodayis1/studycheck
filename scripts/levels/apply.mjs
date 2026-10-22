// 문제은행 전체의 레벨(1~6)을 다시 매긴다.
//
//   node scripts/levels/apply.mjs            ← 무엇이 바뀌는지만 보여 준다
//   node scripts/levels/apply.mjs --write    ← 실제로 고친다
//
// 규칙은 scripts/levels/rules.json 에 있다.
// 고치기 전 상태는 scripts/levels/되돌리기.sql 에 남는다 — 그대로 실행하면 원래대로 돌아간다.

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
const R = JSON.parse(fs.readFileSync(path.join(HERE, 'rules.json'), 'utf8'))

// 규칙은 [교재, 구간, 난이도, 레벨] 줄의 목록. 위에서부터 먼저 걸리는 줄을 쓴다.
// 구간이나 난이도가 null 이면 「아무거나」라는 뜻이다.
function levelOf(p) {
  for (const [book, step, diff, lv] of R['규칙']) {
    if (book !== p.book) continue
    if (step !== null && step !== p.step) continue
    if (diff !== null && diff !== p.difficulty) continue
    // 일품의 「교과서 속 창의유형」만 최심화로 올린다
    if (R['창의유형은6'] && p.is_creative && lv >= 5) return 6
    return lv
  }
  return null
}

let rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('problems')
    .select('id, book, difficulty, step, level, is_creative').order('id').range(from, from + 999)
  if (error) throw error
  rows.push(...data)
  if (data.length < 1000) break
}

const plan = [], undo = [], move = new Map(), byBook = new Map(), none = []
for (const r of rows) {
  const want = levelOf(r)
  if (want === null) { none.push(r.book); continue }
  if (r.level === want) continue
  plan.push({ id: r.id, level: want })
  undo.push(`update problems set level=${r.level === null ? 'null' : r.level} where id=${r.id};`)
  const k = `${r.level ?? '없음'} → ${want}`
  move.set(k, (move.get(k) ?? 0) + 1)
  byBook.set(r.book, (byBook.get(r.book) ?? 0) + 1)
}

fs.writeFileSync(path.join(HERE, '되돌리기.sql'),
  `-- 문제은행 레벨을 ${new Date().toISOString().slice(0, 10)} 이전 상태로 되돌린다\nbegin;\n`
  + undo.join('\n') + '\ncommit;\n', 'utf8')

// 바뀐 뒤 레벨 분포 미리보기
const after = new Map()
for (const r of rows) {
  const want = levelOf(r) ?? r.level
  after.set(want ?? '없음', (after.get(want ?? '없음') ?? 0) + 1)
}
console.log(`문항 ${rows.length}개 중 레벨이 바뀌는 것 ${plan.length}개`)
console.log('  옮겨가는 모양:', Object.fromEntries([...move].sort()))
console.log('  교재별:', Object.fromEntries([...byBook].sort((a, b) => b[1] - a[1])))
console.log('  바뀐 뒤 레벨 분포:', Object.fromEntries([...after].sort()))
const noneCnt = none.reduce((m, b) => (m[b] = (m[b] ?? 0) + 1, m), {})
if (none.length) console.log('  ★규칙에 안 걸린 문항:', noneCnt)
if (!WRITE) { console.log('  (--write 를 붙여야 실제로 고칩니다. 되돌리기.sql 은 이미 만들어 뒀습니다)'); process.exit(0) }

let n = 0, i = 0, fail = 0
async function worker() {
  while (i < plan.length) {
    const { id, level } = plan[i++]
    const { error } = await db.from('problems').update({ level }).eq('id', id)
    if (error) { if (fail++ < 5) console.error('X', id, error.message); continue }
    if (++n % 500 === 0) process.stdout.write(`\r  고치는 중 ${n}/${plan.length}`)
  }
}
await Promise.all(Array.from({ length: 8 }, worker))
console.log(`\n고침 ${n}개` + (fail ? ` · 실패 ${fail}개` : '') + ' — 되돌리려면 scripts/levels/되돌리기.sql')
