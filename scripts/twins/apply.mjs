// 대조해서 찾은 쌍둥이 묶음을 DB에 넣는다.
//   node scripts/twins/apply.mjs scripts/twins/findings/중1.json [--dry]
//
// 파일 꼴
//   { "중1-01-01": { "쌍둥이": [[12345, 23456, 34567], [111, 222]],
//                    "유형고침": { "44444": "중1-01-03" } } }
//   묶음 번호는 그 묶음에서 가장 작은 id 를 쓴다 (01_적용.sql 의 규칙과 같다).
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

const file = process.argv[2]
const dry = process.argv.includes('--dry')
const data = JSON.parse(fs.readFileSync(file, 'utf8'))

const groups = []
const retype = []
for (const [code, v] of Object.entries(data)) {
  if (code.startsWith('_')) continue
  for (const g of v['쌍둥이'] ?? []) {
    if (g.length < 2) { console.warn(`  ! ${code}: 묶음에 하나뿐 — 건너뜀`, g); continue }
    groups.push({ code, ids: g, gid: Math.min(...g) })
  }
  for (const [id, to] of Object.entries(v['유형고침'] ?? {})) retype.push({ id: Number(id), to })
}
const ids = groups.flatMap(g => g.ids)
if (new Set(ids).size !== ids.length) {
  const seen = new Set(), dup = new Set()
  for (const i of ids) (seen.has(i) ? dup : seen).add(i)
  console.error('✗ 한 문항이 두 묶음에 들어 있습니다:', [...dup]); process.exit(1)
}

// 그 문항들이 정말 그 유형인지 확인한다 (잘못 적은 id 를 거르려고)
const { data: rows, error } = await db.from('problems').select('id, type_code, book, local_no').in('id', ids)
if (error) { console.error(error.message); process.exit(1) }
const byId = new Map(rows.map(r => [r.id, r]))
let bad = 0
for (const g of groups) for (const i of g.ids) {
  const r = byId.get(i)
  if (!r) { console.error(`✗ ${g.code}: id ${i} 가 없습니다`); bad++ }
  else if (r.type_code !== g.code) console.warn(`  ! ${g.code}: id ${i} 는 ${r.type_code} (${r.book} ${r.local_no})`)
}
if (bad) process.exit(1)

console.log(`묶음 ${groups.length}개 · 문항 ${ids.length}개 · 유형고침 ${retype.length}개${dry ? ' (dry)' : ''}`)
if (dry) {
  for (const g of groups) console.log('  ', g.code, g.ids.map(i => `${byId.get(i).book} ${byId.get(i).local_no}`).join(' = '))
  process.exit(0)
}
for (const g of groups) {
  const { error: e } = await db.from('problems').update({ twin_group: g.gid }).in('id', g.ids)
  if (e) { console.error('✗', g.code, e.message); process.exit(1) }
}
// 유형을 고치면 **소단원도 따라가야** 한다 — 안 그러면 문제은행 화면에서 엉뚱한 소단원에 남는다
if (retype.length) {
  const codes = [...new Set(retype.map(r => r.to))]
  const { data: st } = await db.from('standard_types')
    .select('code, sub_chapter_no, sub_chapter_title').in('code', codes)
  const sub = new Map((st ?? []).map(t => [t.code, t]))
  for (const r of retype) {
    const t = sub.get(r.to)
    if (!t) { console.error('✗ 없는 유형 코드', r.to); process.exit(1) }
    const { error: e } = await db.from('problems').update({
      type_code: r.to, sub_chapter_no: t.sub_chapter_no, sub_chapter_title: t.sub_chapter_title
    }).eq('id', r.id)
    if (e) { console.error('✗ 유형고침', r.id, e.message); process.exit(1) }
  }
}
console.log('넣었습니다.')
