// 문항의 문제 그림과 정답 그림을 나란히 받는다.  node scripts/twins/pair.mjs <폴더> 1,2,3
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
const { data } = await db.from('problems')
  .select('id, grade, semester, local_no, step, answer_kind, answer_text, image_path, answer_image_path')
  .in('id', ids)
fs.mkdirSync(out, { recursive: true })
fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(data, null, 1))
const paths = data.flatMap(r => [r.image_path, r.answer_image_path]).filter(Boolean)
const { data: urls } = await db.storage.from('problem-images').createSignedUrls(paths, 3600)
const by = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
for (const r of data) {
  for (const [kind, p] of [['q', r.image_path], ['a', r.answer_image_path]]) {
    const u = p && by.get(p)
    if (!u) continue
    const res = await fetch(u)
    if (res.ok) fs.writeFileSync(path.join(out, `${r.id}_${kind}.png`), Buffer.from(await res.arrayBuffer()))
  }
}
console.log(`${data.length}문항 → ${out}`)
