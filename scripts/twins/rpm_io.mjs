// RPM 중등 문항 그림 내려받기 / 고친 것 다시 올리기
//   node scripts/twins/rpm_io.mjs fetch  <작업폴더>
//   node scripts/twins/rpm_io.mjs upload <작업폴더>
// 원본은 <작업폴더>/orig 에 그대로 남는다 (되돌리기용).
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
const mode = process.argv[2]
const work = process.argv[3]

async function allRows() {
  const out = []
  for (let off = 0; ; off += 1000) {
    const { data, error } = await db.from('problems')
      .select('id, grade, semester, local_no, image_path')
      .eq('book', 'RPM').in('grade', ['중1', '중2', '중3'])
      .order('id').range(off, off + 999)
    if (error) throw new Error(error.message)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out.filter(r => r.image_path)
}

if (mode === 'fetch') {
  const rows = await allRows()
  const dir = path.join(work, 'orig')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(work, 'meta.json'), JSON.stringify(rows))
  console.log(`문항 ${rows.length}개 — 내려받는 중`)
  let got = 0, skip = 0
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100)
    const todo = batch.filter(r => !fs.existsSync(path.join(dir, `${r.id}.png`)))
    skip += batch.length - todo.length
    if (todo.length) {
      const { data: urls } = await db.storage.from(BUCKET).createSignedUrls(todo.map(r => r.image_path), 7200)
      const by = new Map((urls ?? []).map(u => [u.path, u.signedUrl]))
      await Promise.all(todo.map(async r => {
        const u = by.get(r.image_path)
        if (!u) return
        const res = await fetch(u)
        if (res.ok) { fs.writeFileSync(path.join(dir, `${r.id}.png`), Buffer.from(await res.arrayBuffer())); got++ }
      }))
    }
    process.stdout.write(`\r  ${Math.min(i + 100, rows.length)}/${rows.length} (받음 ${got} · 있음 ${skip})`)
  }
  console.log('\n끝')
} else if (mode === 'upload') {
  const rows = JSON.parse(fs.readFileSync(path.join(work, 'meta.json'), 'utf8'))
  const byId = new Map(rows.map(r => [String(r.id), r]))
  const dir = path.join(work, 'fixed')
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'))
  console.log(`고친 그림 ${files.length}장 — 올리는 중`)
  let ok = 0, fail = 0
  for (let i = 0; i < files.length; i += 20) {
    await Promise.all(files.slice(i, i + 20).map(async f => {
      const r = byId.get(f.replace('.png', ''))
      if (!r) { fail++; return }
      const { error } = await db.storage.from(BUCKET)
        .upload(r.image_path, fs.readFileSync(path.join(dir, f)),
                { contentType: 'image/png', upsert: true })
      if (error) { fail++; console.error('\n✗', r.image_path, error.message) } else ok++
    }))
    process.stdout.write(`\r  ${Math.min(i + 20, files.length)}/${files.length} (올림 ${ok} · 실패 ${fail})`)
  }
  console.log('\n끝')
} else {
  console.error('fetch 또는 upload')
  process.exit(1)
}
