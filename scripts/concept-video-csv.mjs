/**
 * 같은 목록을 **표**로 뽑는다 — 촬영 진행을 적어 가며 쓰시라고.
 *
 *   node scripts/concept-video-xlsx.mjs
 *
 * docs/강의영상_대표개념목록.csv 로 쓴다(엑셀에서 바로 열린다).
 * 한글이 깨지지 않게 BOM 을 붙인다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function all(table, sel, tweak = (q) => q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tweak(db.from(table).select(sel).range(from, from + 999))
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

const concepts = await all(
  'concepts',
  'id, grade, semester, chapter, sub_chapter, concept_name, concept_order',
  (q) => q.order('grade').order('semester').order('chapter').order('concept_order'),
)
const assets = await all('type_learning_assets', 'concept_id, video_url', (q) => q.eq('asset_type', 'concept'))
const videoBy = new Map(assets.filter((a) => a.concept_id && a.video_url).map((a) => [a.concept_id, a.video_url]))

const ORDER = [
  '초1', '초2', '초3', '초4', '초5', '초6',
  '중1', '중2', '중3', '중2모의고사',
  '공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하',
]
const rank = (g) => { const i = ORDER.indexOf(g); return i < 0 ? 999 : i }
const 고등 = (g) => rank(g) >= ORDER.indexOf('공통수학1')

concepts.sort((a, b) =>
  rank(a.grade) - rank(b.grade) ||
  String(a.grade).localeCompare(b.grade, 'ko') ||
  String(a.semester).localeCompare(String(b.semester)) ||
  String(a.chapter ?? '').localeCompare(String(b.chapter ?? ''), 'ko') ||
  (a.concept_order ?? 0) - (b.concept_order ?? 0))

const q = (v) => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const rows = [['과정', '학기', '대단원', '중단원', '번호', '대표개념', '촬영', '영상링크', '메모']]
for (const c of concepts) {
  rows.push([
    c.grade,
    고등(c.grade) ? '' : `${c.semester}학기`,
    c.chapter ?? '',
    c.sub_chapter && c.sub_chapter !== '-' ? c.sub_chapter : '',
    c.concept_order ?? '',
    c.concept_name ?? '',
    videoBy.has(c.id) ? '완료' : '',
    videoBy.get(c.id) ?? '',
    '',
  ])
}

fs.writeFileSync('docs/강의영상_대표개념목록.csv',
  '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'utf8')
console.log(`${concepts.length}줄 → docs/강의영상_대표개념목록.csv`)
