/**
 * 학교 자료집 한 학교 넣기 (수학의지혜)
 *
 * 하는 일
 *   data/school-profiles/<학교>.json 을 읽어 school_profiles 표에 넣는다(있으면 덮어쓴다).
 *
 * 쓰는 법 (PowerShell)
 *   node scripts\upload-school-profile.mjs data\school-profiles\고양일고.json
 *   node scripts\upload-school-profile.mjs           ← 폴더 전체
 *
 * 필요한 것 — .env.local 의 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * ★ 학교명은 반드시 줄임말이어야 한다(「고양일고」, 「고양일고등학교」가 아니라).
 *   students.school · exam_schedule.school_name 과 같은 키여야 서로 걸린다.
 *   길게 적혀 있으면 넣지 않고 멈춘다 — 조용히 어긋나면 아무도 못 찾는다.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const ROOT = process.cwd()
const env = Object.fromEntries(
  fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split(/\r?\n/)
    .filter(l => l.includes('=') && !l.trimStart().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const DIR = path.join(ROOT, 'data', 'school-profiles')
const args = process.argv.slice(2)
const files = args.length
  ? args.map(a => path.resolve(ROOT, a))
  : fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => path.join(DIR, f))

let ok = 0, fail = 0
for (const file of files) {
  const p = JSON.parse(fs.readFileSync(file, 'utf8'))
  const name = String(p.school_name ?? '')

  if (/학교$/.test(name)) {
    console.error(`✗ ${path.basename(file)}: 학교명이 「${name}」입니다. 줄임말(예: 고양일고)로 적어주세요.`)
    fail++; continue
  }
  if (!name || !p.school_level || !p.source_year) {
    console.error(`✗ ${path.basename(file)}: 학교명·학교급·공시연도가 있어야 합니다.`)
    fail++; continue
  }

  const { error } = await db.from('school_profiles').upsert({
    school_name: name,
    school_level: p.school_level,
    official_name: p.official_name ?? null,
    source_year: p.source_year,
    region: p.region ?? null,
    office: p.office ?? null,
    foundation: p.foundation ?? null,
    school_type: p.school_type ?? null,
    coed: p.coed ?? null,
    stats: p.stats ?? {},
    math_curriculum: p.math_curriculum ?? [],
    exam_calendar: p.exam_calendar ?? {},
    highlights: p.highlights ?? [],
    notes: p.notes ?? null,
    sources: p.sources ?? [],
    updated_at: new Date().toISOString(),
  }, { onConflict: 'school_name' })

  if (error) { console.error(`✗ ${name}: ${error.message}`); fail++ }
  else { console.log(`✓ ${name}`); ok++ }
}

// 넣은 뒤 실제로 몇 줄인지 세어 본다 — 조용히 안 들어가는 일을 막는다.
const { count } = await db.from('school_profiles').select('*', { count: 'exact', head: true })
console.log(`\n넣음 ${ok}건 · 실패 ${fail}건 · 표에 모두 ${count}개 학교`)
process.exit(fail ? 1 : 0)
