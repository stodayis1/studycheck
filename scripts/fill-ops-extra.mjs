/**
 * 본수업에 이어서 한 추가수업을, 스터디체크 학습일지로 OPS 에 채운다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/fill-ops-extra.mjs 2026-10-16        # 보기만
 *   node --import ./scripts/ts-resolve.mjs scripts/fill-ops-extra.mjs 2026-10-16 적용   # 실제로 채움
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { fillOpsExtraFromNotes } from '../lib/opsExtraFill.ts'

function env(file) {
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return out
}
const A = env('.env.local'), B = env('C:/Users/USER/sumath-admin/.env.local')
// lib 은 OPS_* 이름으로 찾는다 — 로컬에서는 OPS 저장소의 .env.local 에서 가져다 채워 준다.
process.env.OPS_SUPABASE_URL = B.NEXT_PUBLIC_SUPABASE_URL
process.env.OPS_SUPABASE_SERVICE_ROLE_KEY = B.SUPABASE_SERVICE_ROLE_KEY

const sc = createClient(A.NEXT_PUBLIC_SUPABASE_URL, A.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const apply = process.argv[3] === '적용'

const r = await fillOpsExtraFromNotes(sc, date, { dryRun: !apply })
console.log(`\n═══ ${date} — OPS 추가수업 채우기 ${apply ? '(적용)' : '(보기만)'} ═══\n`)
if (r.note) console.log('  ', r.note)
for (const x of r.rows) {
  const kind = x.classType === 'substitute' ? '대체' : '추가'
  if (x.skip) { console.log(`  – ${x.name} [${kind}] 건너뜀 — ${x.skip}`); continue }
  console.log(`  ${x.ok ? '✓' : '✗'} ${x.name} [${kind}]`)
  console.log(`      교재   ${x.textbook ?? '-'}`)
}
console.log(`\n${apply ? '채움' : '채울 것'} ${r.filled}건\n`)
