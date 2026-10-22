// 조건에 맞는 문항 그림을 몇 장 내려받는다 (점검용).
//   node scripts/twins/sample.mjs <나갈폴더> "book=RPM" [개수]
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
const out = process.argv[2]
const where = process.argv[3] ?? ''
const n = Number(process.argv[4] ?? 12)
let q = db.from('problems').select('id, book, grade, semester, local_no, step, image_path')
for (const kv of where.split(';').filter(Boolean)) {
  const [k, v] = kv.split('=')
  q = q.eq(k.trim(), isNaN(Number(v)) ? v.trim() : Number(v))
}
const { data, error } = await q.limit(4000)
if (error) { console.error(error.message); process.exit(1) }
const pick = []
const stride = Math.max(1, Math.floor(data.length / n))
for (let i = 0; i < data.length && pick.length < n; i += stride) pick.push(data[i])
fs.mkdirSync(out, { recursive: true })
const { data: urls } = await db.storage.from('problem-images')
  .createSignedUrls(pick.map(r => r.image_path), 3600)
const by = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
for (const r of pick) {
  const u = by.get(r.image_path)
  if (!u) continue
  const res = await fetch(u)
  if (res.ok) fs.writeFileSync(path.join(out, `${r.id}.png`), Buffer.from(await res.arrayBuffer()))
}
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(pick, null, 1))
console.log(`표본 ${pick.length}장 (전체 ${data.length}) → ${out}`)
