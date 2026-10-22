// <폴더>/fixed/<id>.png 들을 <폴더>/<meta>.json 의 image_path 자리에 다시 올린다.
//   node scripts/twins/upload_fixed.mjs <폴더> [meta.json 경로]
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
const work = process.argv[2]
const metaPath = process.argv[3] ?? path.join(work, 'meta.json')
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'))
const byId = new Map(meta.map(r => [String(r.id), r]))
const dir = path.join(work, 'fixed')
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'))
let ok = 0, fail = 0
for (const f of files) {
  const r = byId.get(f.replace('.png', ''))
  if (!r?.image_path) { fail++; console.error('✗ 짝 없음', f); continue }
  const { error } = await db.storage.from('problem-images')
    .upload(r.image_path, fs.readFileSync(path.join(dir, f)), { contentType: 'image/png', upsert: true })
  if (error) { fail++; console.error('✗', r.image_path, error.message) } else ok++
}
console.log(`올림 ${ok} · 실패 ${fail}`)
