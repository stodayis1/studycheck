// 한 유형(또는 유형+레벨)의 문항 그림을 내려받아 폴더에 모은다.
//   node scripts/twins/fetch.mjs 공수2-01-01 <나갈폴더> [--level 3]
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const code = process.argv[2]
const out = process.argv[3]
const li = process.argv.indexOf('--level')
const level = li > 0 ? Number(process.argv[li + 1]) : null

let q = db.from('problems')
  .select('id, book, grade, local_no, step, difficulty, level, answer_kind, answer_text, image_path, twin_id')
  .eq('type_code', code)
if (level !== null) q = q.eq('level', level)
const { data, error } = await q.order('book').order('local_no')
if (error) { console.error(error.message); process.exit(1) }

fs.mkdirSync(out, { recursive: true })
const paths = data.map(r => r.image_path).filter(Boolean)
const signed = new Map()
for (let i = 0; i < paths.length; i += 100) {
  const { data: u } = await db.storage.from('problem-images').createSignedUrls(paths.slice(i, i + 100), 3600)
  for (const x of u ?? []) if (x.signedUrl && !x.error) signed.set(x.path, x.signedUrl)
}
let got = 0
for (const r of data) {
  const u = signed.get(r.image_path)
  if (!u) continue
  const res = await fetch(u)
  if (!res.ok) continue
  fs.writeFileSync(path.join(out, `${r.id}.png`), Buffer.from(await res.arrayBuffer()))
  got++
}
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(data, null, 1))
console.log(`${code}${level !== null ? ' 레벨' + level : ''} — 문항 ${data.length}개 · 그림 ${got}장 → ${out}`)
