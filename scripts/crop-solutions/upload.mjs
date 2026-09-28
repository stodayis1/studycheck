// 잘라 낸 「풀이」 그림을 버킷에 올리고 problems.solution_image_path 에 적는다.
//
//   node scripts/crop-solutions/upload.mjs <자른폴더> <책> <학년> <학기> [--write]
//   예) node scripts/crop-solutions/upload.mjs .../t32 쎈 중3 2 --write
//
// 올라가는 자리: <문제 그림과 같은 폴더>/<번호>_s.png  (예: m3-2/ssen/01/0106_s.png)
// --write 없이 돌리면 몇 개가 이어지는지만 알려 준다.

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const [dir, book, grade, sem] = process.argv.slice(2)
const WRITE = process.argv.includes('--write')
const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))

// 대상 문항 (한 번에 1000행만 오므로 나눠 읽는다)
let rows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from('problems')
    .select('id, local_no, image_path, solution_image_path')
    .eq('book', book).eq('grade', grade).eq('semester', sem)
    .order('id').range(from, from + 999)
  if (error) throw error
  if (!data.length) break
  rows.push(...data)
  if (data.length < 1000) break
}

const plan = []
for (const r of rows) {
  const hit = index[String(Number(r.local_no))]
  if (!hit) continue
  const file = path.join(dir, hit.file)
  if (!fs.existsSync(file)) continue
  // 문제 그림과 같은 폴더에 <번호>_s.png 로 둔다
  const dest = r.image_path.replace(/\/[^/]+$/, '/') + String(Number(r.local_no)).padStart(4, '0') + '_s.png'
  plan.push({ id: r.id, no: Number(r.local_no), file, dest, had: !!r.solution_image_path })
}
console.log(`${book} ${grade}-${sem}: 문항 ${rows.length} · 풀이 그림 ${Object.keys(index).length} → 이어진 것 ${plan.length}`)
console.log(`  이미 올라간 것 ${plan.filter(p => p.had).length}`)
if (!WRITE) {
  console.log('  예:', plan.slice(0, 3).map(p => `${p.no}→${p.dest}`).join(' | '))
  console.log('  (--write 를 붙여야 실제로 올립니다)')
  process.exit(0)
}

let n = 0, fail = 0
for (const p of plan) {
  const body = fs.readFileSync(p.file)
  const up = await db.storage.from('problem-images').upload(p.dest, body, {
    contentType: 'image/png', upsert: true,
  })
  if (up.error) { console.log('✗ 올리기', p.no, up.error.message); fail++; continue }
  const { error } = await db.from('problems').update({ solution_image_path: p.dest }).eq('id', p.id)
  if (error) { console.log('✗ 적기', p.no, error.message); fail++; continue }
  n++
  if (n % 50 === 0) console.log('  ', n, '/', plan.length)
}
console.log(`올림 ${n}개` + (fail ? ` · 실패 ${fail}개` : ''))
