// docs/sql/쎈풀이영상_<grade>.sql 과 같은 행을 supabase-js 로 넣는다 (있는 (grade, order_label) 은 건너뜀)
// cwd = 저장소. node apply_sol.mjs <풀이영상 폴더> <grade>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(path.join(process.cwd(), 'package.json'))
const { createClient } = require('@supabase/supabase-js')
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const [dir, grade] = process.argv.slice(2)
const ids = JSON.parse(fs.readFileSync(path.join(dir, '_유튜브_주소.json'), 'utf8'))
const rows = []
for (const f of fs.readdirSync(dir).filter(f => /^\d\d_풀이\d\d_.*\.구간\.json$/.test(f)).sort()) {
  const G = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const [, cn, sn] = f.match(/^(\d\d)_풀이(\d\d)_/)
  const ol = `${cn}-풀이${sn}`
  if (!ids[ol]) throw new Error('youtube 없음 ' + ol)
  rows.push({
    grade, kind: '대표예제', concept_no: G.concept_no ?? null, order_label: ol, title: `${G.label} ${G.title}`,
    chapter: G.chapter, sub_chapter: G.sub_chapter, book: '쎈 ' + grade, book_pages: G.book_page ? [G.book_page] : null,
    youtube_id: ids[ol], duration_seconds: G.duration,
    scenes: G.steps.map(s => ({ start: s.start, end: s.end, label: s.bubble, kind: '풀이' })),
    type_codes: G.type_code ? [G.type_code] : [], is_active: true,
  })
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { error } = await db.from('lesson_videos').upsert(rows, { onConflict: 'grade,order_label', ignoreDuplicates: true })
if (error) { console.error('오류', error.message); process.exit(1) }
console.log('넣음 시도', rows.length)
