/**
 * 이미 저장된 수업일지의 「학습지 과제」 글을 줄인 규칙으로 **다시 쓴다**.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-scope-apply.ts          (보기만)
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-scope-apply.ts --적용    (고친다)
 *
 * 왜 — 규칙을 고쳐도 **이미 적힌 글**은 그대로다. 오늘 수업일지의 브리핑은 내일 11시에
 * 나가므로, 아직 안 나간 것만 다시 쓰면 긴 글이 학부모님께 가지 않는다.
 *
 * ★ 이미 **발송된 날**은 손대지 않는다 — 나간 글과 기록이 달라지면 나중에 확인할 수가 없다.
 * ★ 고치기 전 값을 docs/sql/학습지범위_줄이기_되돌리기.sql 로 남긴다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'fs'
import { formatWorksheetScope } from '../lib/utils'
import { fetchAll } from '../lib/fetchAll'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
const 적용 = process.argv.includes('--적용')

const concepts = await fetchAll((f, t) => db.from('concepts')
  .select('chapter, sub_chapter, concept_name, concept_order').order('id').range(f, t))
const wsAll = await fetchAll((f, t) => db.from('student_worksheets')
  .select('id, grade_level, unit, unit_name, current_level').order('id').range(f, t))
const wsBy = new Map((wsAll as any[]).map((w) => [w.id, w]))

// 아직 브리핑이 안 나간 수업만 (최근 7일)
const from = new Date(Date.now() + 9 * 3600_000 - 7 * 86400_000).toISOString().slice(0, 10)
const { data: ses } = await db.from('class_sessions')
  .select('id, student_id, session_date, hw_worksheet_ids, hw_worksheet_range')
  .gte('session_date', from).not('hw_worksheet_ids', 'is', null)
const { data: sent } = await db.from('briefing_sends').select('student_id, session_date').gte('session_date', from)
const sentKey = new Set((sent ?? []).map((r: any) => `${r.student_id}|${r.session_date}`))
const { data: stus } = await db.from('students').select('id, name')
const nameOf = new Map((stus ?? []).map((s: any) => [s.id, s.name]))

const 고칠것: { id: string; who: string; date: string; before: string; after: string }[] = []
for (const x of (ses ?? []) as any[]) {
  if (sentKey.has(`${x.student_id}|${x.session_date}`)) continue
  const labels = (x.hw_worksheet_ids as string[])
    .map((id) => wsBy.get(id)).filter(Boolean)
    .map((w: any) => {
      const scope = formatWorksheetScope(concepts as any, w.unit, w.unit_name)
      return `${w.grade_level} · ${w.unit}${scope ? ` (${scope})` : ''} · ${w.current_level}레벨`
    })
  if (!labels.length) continue
  const after = labels.join(' / ')
  if (after === x.hw_worksheet_range) continue
  고칠것.push({ id: x.id, who: nameOf.get(x.student_id) ?? '?', date: x.session_date, before: x.hw_worksheet_range ?? '', after })
}

console.log(`아직 안 나간 수업일지 중 고칠 것: ${고칠것.length}건`)
for (const r of 고칠것) console.log(`  ${r.date} ${r.who}  ${r.before.length}자 → ${r.after.length}자\n    ${r.after}`)

if (!적용) { console.log('\n(보기만 했습니다. 고치려면 --적용)'); process.exit(0) }

writeFileSync('docs/sql/학습지범위_줄이기_되돌리기.sql',
  '-- 「학습지 과제 범위 줄이기」 되돌리기 — 고치기 전 글로 되돌린다\n' +
  '-- scripts/worksheet-scope-apply.ts --적용 이 만들어 둔 파일이다.\n' +
  `-- 만든 때: ${new Date().toISOString()}\nbegin;\n` +
  고칠것.map((r) => `update public.class_sessions set hw_worksheet_range = ${lit(r.before)} where id = '${r.id}';`).join('\n') +
  '\ncommit;\n', 'utf8')

let 됨 = 0
for (const r of 고칠것) {
  const { error } = await db.from('class_sessions').update({ hw_worksheet_range: r.after }).eq('id', r.id)
  if (error) console.error('  실패', r.who, error.message); else 됨++
}
console.log(`\n고쳤습니다: ${됨}건 (되돌리기: docs/sql/학습지범위_줄이기_되돌리기.sql)`)

function lit(s: string) { return s === '' ? "''" : `'${s.replace(/'/g, "''")}'` }
