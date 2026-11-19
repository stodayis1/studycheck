/**
 * 「안 닫힌 학습지 쓸어 담기」를 **손으로 한 번** 돌린다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-sweep-run.ts            (예행)
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-sweep-run.ts --save     (진짜)
 *
 * 평소에는 브리핑 예약(저녁 9시·오전 11시)이 알아서 돈다. 이 스크립트는
 * **배포가 늦어 예약이 옛 코드로 돈 날**처럼 먼저 돌려야 할 때만 쓴다(2026-11-19).
 *
 * ★ 판단·실행은 `lib/worksheetSweep.ts` 의 `runWorksheetSweep` **그대로** 쓴다 —
 *   베껴 쓰면 예약이 하는 일과 손으로 하는 일이 갈라진다.
 * ★ 바꾸기 **전에** 닫을 줄을 파일로 남긴다. 되돌려야 할 때 그 목록이 유일한 끈이다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { runWorksheetSweep, planSweep, briefKey } from '../lib/worksheetSweep.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const SAVE = process.argv.includes('--save')
const 적을곳 = process.argv.find((a) => a.startsWith('--out='))?.slice(6)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)

// ① 바꾸기 전 모습 — 되돌릴 때 쓸 목록
const { data: open } = await db.from('student_worksheets')
  .select('id, student_id, score, status, submitted_at').not('score', 'is', null)
  .neq('status', 'passed').order('id').limit(1000)
const rows = (open ?? []) as any[]
const dates = [...new Set(rows.map((r) => String(r.submitted_at ?? '').slice(0, 10)).filter(Boolean))]
const briefed = new Set<string>()
for (let i = 0; i < dates.length; i += 100) {
  const { data } = await db.from('briefing_sends')
    .select('student_id, session_date, status').in('session_date', dates.slice(i, i + 100))
  for (const b of (data ?? []) as any[]) {
    if (b?.status === 'sent') briefed.add(briefKey(b.student_id, String(b.session_date).slice(0, 10)))
  }
}
const plan = planSweep(rows, { briefed, today })
const 되돌리기 = rows.filter((r) => plan.ids.includes(r.id)).map((r) => ({ id: r.id, status: r.status }))

console.log(`열린 줄 ${rows.length}건 · 닫을 것 ${plan.ids.length}건 (브리핑 나감 ${plan.briefed} · 오래됨 ${plan.old}) · 둘 것 ${plan.kept}건`)
if (적을곳) {
  fs.writeFileSync(path.resolve(적을곳), JSON.stringify(되돌리기, null, 1), 'utf8')
  console.log(`되돌릴 목록을 적어 두었습니다: ${path.resolve(적을곳)}`)
}
if (!SAVE) { console.log('\n예행만 했습니다. 닫으려면 --save 를 붙이세요.'); process.exitCode = 0 }
else {
  const r = await runWorksheetSweep(db, today)
  console.log(`\n닫음 ${r.닫음}건 (브리핑 나감 ${r.브리핑나감} · 오래됨 ${r.오래됨}) · 그대로 둠 ${r.남음}건`)
  if (r.실패?.length) { console.log('실패: ' + r.실패.join(' / ')); process.exitCode = 1 }
  const { count } = await db.from('student_worksheets')
    .select('id', { count: 'exact', head: true }).not('score', 'is', null).neq('status', 'passed')
  console.log(`남은 「점수 있는데 안 닫힌 것」: ${count}건`)
}
