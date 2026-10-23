// 앱 유형표를 파일로 내려받는다.  node scripts/twins/dump_types.mjs 공수2 <나갈파일>
import fs from 'fs'
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
const pre = process.argv[2], out = process.argv[3]
const { data, error } = await db.from('standard_types')
  .select('code, sub_chapter_no, sub_chapter_title, type_no, type_title')
  .like('code', `${pre}-%`).order('sub_chapter_no').order('type_no')
if (error) { console.error(error.message); process.exit(1) }
fs.writeFileSync(out, JSON.stringify(data, null, 1))
console.log(`${pre} 유형 ${data.length}개 → ${out}`)
