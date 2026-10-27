// 다시 자른 정답 그림을 problems.answer_image_path 자리에 덮어 올린다(옛 그림은 backup_light_answers_20261027 에).
// 사용: (studycheck 폴더에서) node <이 파일> <scratchpad>
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(path.resolve('package.json'))
const { createClient } = require('@supabase/supabase-js')
for (const line of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
}
const L = process.argv[2]
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const SRC = {
  light12: ['recut12/out'], light21: ['recut21/b1', 'recut21/b2', 'recut21/b3', 'recut21/b4'],
  light22: ['recut22/out'], light32: ['recut32'],
}
const report = []
for (const [book, dirs] of Object.entries(SRC)) {
  const rows = JSON.parse(fs.readFileSync(path.join(L, book, 'problems.json'), 'utf8'))
  const pathOf = Object.fromEntries(rows.map((r) => [r.local_no, r.answer_image_path]))
  let ok = 0
  for (const d of dirs) {
    for (const f of fs.readdirSync(path.join(L, d)).filter((x) => /^\d{4}\.png$/.test(x))) {
      const n = f.slice(0, 4), dest = pathOf[n]
      if (!dest) throw new Error(`${book} ${n}: 경로 없음`)
      const buf = fs.readFileSync(path.join(L, d, f))
      const { error } = await db.storage.from('problem-images').upload(dest, buf, { contentType: 'image/png', upsert: true })
      if (error) throw new Error(`${book} ${n}: ${error.message}`)
      // 올라갔는지 되받아 바이트로 확인
      const { data, error: e2 } = await db.storage.from('problem-images').download(dest)
      if (e2) throw new Error(`${book} ${n} 되받기: ${e2.message}`)
      const back = Buffer.from(await data.arrayBuffer())
      if (!back.equals(buf)) throw new Error(`${book} ${n}: 올린 것과 되받은 것이 다름`)
      ok++
    }
  }
  report.push(`${book} ${ok}`)
}
console.log('올림(되받아 같음 확인):', report.join(' · '))
