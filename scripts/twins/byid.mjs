// id 목록으로 문항 그림을 내려받는다.  node scripts/twins/byid.mjs <폴더> 1,2,3
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
const ids = process.argv[3].split(',').map(Number)
const { data, error } = await db.from('problems')
  .select('id, book, grade, semester, local_no, step, type_code, image_path, answer_image_path')
  .in('id', ids)
if (error) { console.error(error.message); process.exit(1) }
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(data, null, 1))
const { data: urls } = await db.storage.from('problem-images')
  .createSignedUrls(data.map(r => r.image_path), 3600)
const by = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
let n = 0
for (const r of data) {
  const u = by.get(r.image_path)
  if (!u) continue
  const res = await fetch(u)
  if (res.ok) { fs.writeFileSync(path.join(out, `${r.id}.png`), Buffer.from(await res.arrayBuffer())); n++ }
}
console.log(`${n}장 → ${out}`)
