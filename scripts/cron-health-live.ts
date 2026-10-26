/**
 * 운영 DB 의 cron_runs 를 **읽기만** 해서 지금 자동 발송 점검 결과를 보여 준다.
 * (대시보드 띠·감시 문자와 같은 lib/cronHealth 를 쓴다. 아무것도 쓰거나 보내지 않는다.)
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/cron-health-live.ts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { checkCronRuns, loadRecentCronRuns } from '../lib/cronHealth.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, '')
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

const rows = await loadRecentCronRuns(db)
console.log(`읽은 기록 ${rows.length}줄: ${rows.map((r) => `${r.run_date} ${r.phase}`).join(' · ')}`)
const problems = checkCronRuns(rows, Date.now())
if (!problems.length) console.log('문제 없음')
for (const p of problems) console.log(`✗ ${p.label} · ${p.kind} · ${p.detail}`)
