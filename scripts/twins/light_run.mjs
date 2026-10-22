// 라이트쎈 — 지시문이 빠진 문항을 찾아 이웃 정보와 함께 내려받는다 / 고친 것을 올린다
//   node scripts/twins/light_run.mjs fetch  <작업폴더>
//   node scripts/twins/light_run.mjs upload <작업폴더>
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
const BUCKET = 'problem-images'
const mode = process.argv[2], work = process.argv[3]

if (mode === 'fetch') {
  // 라이트쎈 전체 + 저장소 크기
  const rows = []
  for (let off = 0; ; off += 1000) {
    const { data } = await db.from('problems')
      .select('id, grade, semester, local_no, step, type_code, image_path')
      .eq('book', '라이트쎈').order('id').range(off, off + 999)
    rows.push(...data)
    if (data.length < 1000) break
  }
  // 크기는 SQL 로 못 받으니 서명 주소로 받아 보고 바이트로 가른다 → 대신 목록을 그대로 쓰고
  // 작은 것(지시문 빠진 것)은 파이썬에서 높이로 가린다.
  fs.mkdirSync(path.join(work, 'img'), { recursive: true })
  fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(rows))
  console.log(`라이트쎈 ${rows.length}문항 — 내려받는 중`)
  let got = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100).filter(r => r.image_path &&
      !fs.existsSync(path.join(work, 'img', `${r.id}.png`)))
    if (batch.length) {
      const { data: urls } = await db.storage.from(BUCKET).createSignedUrls(batch.map(r => r.image_path), 7200)
      const by = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
      await Promise.all(batch.map(async r => {
        const u = by.get(r.image_path)
        if (!u) return
        const res = await fetch(u)
        if (res.ok) { fs.writeFileSync(path.join(work, 'img', `${r.id}.png`), Buffer.from(await res.arrayBuffer())); got++ }
      }))
    }
    process.stdout.write(`\r  ${Math.min(i + 100, rows.length)}/${rows.length} (받음 ${got})`)
  }
  console.log('\n끝')
} else if (mode === 'upload') {
  const rows = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'))
  const byId = new Map(rows.map(r => [String(r.id), r]))
  const dir = path.join(work, 'fixed')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.png')) : []
  console.log(`고친 그림 ${files.length}장 — 올리는 중`)
  let ok = 0, fail = 0
  for (const f of files) {
    const r = byId.get(f.replace('.png', ''))
    if (!r) { fail++; continue }
    const { error } = await db.storage.from(BUCKET)
      .upload(r.image_path, fs.readFileSync(path.join(dir, f)), { contentType: 'image/png', upsert: true })
    if (error) { fail++; console.error('✗', r.image_path, error.message) } else ok++
  }
  console.log(`올림 ${ok} · 실패 ${fail}`)
} else { console.error('fetch 또는 upload'); process.exit(1) }
