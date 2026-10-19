/**
 * 학습지 과제 범위 줄이기(formatWorksheetScope)가 **실데이터에서** 어떻게 줄어드는지 본다.
 *   node --import ./scripts/ts-resolve.mjs scripts/worksheet-scope-check.ts
 * 읽기만 한다.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { formatWorksheetScope } from '../lib/utils'
import { fetchAll } from '../lib/fetchAll'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2].trim()
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const concepts = await fetchAll((f, t) => db.from('concepts')
  .select('chapter, sub_chapter, concept_name, concept_order').order('id').range(f, t))
const ws = await fetchAll((f, t) => db.from('student_worksheets')
  .select('id, grade_level, unit, unit_name, current_level, status').order('id').range(f, t))

const label = (w: any, scope: string) =>
  `${w.grade_level} · ${w.unit}${scope ? ` (${scope})` : ''} · ${w.current_level}레벨`

let 줄어듦 = 0, 그대로 = 0, 총줄임 = 0
const 보기: string[] = []
for (const w of ws as any[]) {
  const before = label(w, (w.unit_name ?? '').trim())
  const after = label(w, formatWorksheetScope(concepts as any, w.unit, w.unit_name))
  if (before === after) { 그대로++; continue }
  줄어듦++; 총줄임 += before.length - after.length
  if (보기.length < 8 && before.length > 60) 보기.push(`  전: ${before.length}자  ${before.slice(0, 110)}${before.length > 110 ? '…' : ''}\n  후: ${after.length}자  ${after}\n`)
}
console.log(`학습지 ${ws.length}장 — 줄어든 것 ${줄어듦}장 / 그대로 ${그대로}장`)
console.log(`줄어든 글자 합계 ${총줄임}자 (평균 ${줄어듦 ? Math.round(총줄임 / 줄어듦) : 0}자)\n`)
console.log(보기.join('\n'))
