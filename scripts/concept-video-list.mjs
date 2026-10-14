/**
 * 강의영상 만들 대표개념 목록을 뽑는다.
 *
 *   node scripts/concept-video-list.mjs
 *
 * 과정 → 대단원 → 중단원 순으로 묶어 docs/강의영상_대표개념목록.md 로 쓴다.
 * 대표개념연결 화면(app/teacher/type-concepts)이 보는 concepts 표를 그대로 읽으므로,
 * 개념을 더 넣거나 고치면 다시 돌리기만 하면 된다.
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

// 표는 한 번에 1000행만 준다.
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

// 이미 영상이 붙은 개념은 빼고 셀 수 있게 따로 읽는다.
const assets = await all('type_learning_assets', 'concept_id, video_url', (q) => q.eq('asset_type', 'concept'))
const hasVideo = new Set(assets.filter((a) => a.concept_id && a.video_url).map((a) => a.concept_id))

// 초 → 중 → 고 순서. 고등은 학교에서 배우는 차례대로.
const ORDER = [
  '초1', '초2', '초3', '초4', '초5', '초6',
  '중1', '중2', '중3', '중2모의고사',
  '공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하',
]
const rank = (g) => { const i = ORDER.indexOf(g); return i < 0 ? 999 : i }

const terms = new Map()
for (const c of concepts) {
  const key = `${c.grade}|${c.semester}`
  if (!terms.has(key)) terms.set(key, [])
  terms.get(key).push(c)
}
const sorted = [...terms].sort((a, b) => {
  const [ga, sa] = a[0].split('|')
  const [gb, sb] = b[0].split('|')
  return rank(ga) - rank(gb) || String(ga).localeCompare(gb, 'ko') || String(sa).localeCompare(sb)
})

// 고등 과목은 「1학기」가 의미가 없다 — 학기를 안 쓴다.
const 고등 = (g) => rank(g) >= ORDER.indexOf('공통수학1')
const termTitle = (g, s) => (고등(g) ? g : `${g} ${s}학기`)

const out = []
out.push('# 강의영상 만들 목록 — 대표개념')
out.push('')
out.push(`대표개념 **${concepts.length}개** · 과정 **${sorted.length}개**` +
  (hasVideo.size ? ` · 영상 있는 것 ${hasVideo.size}개` : ' · 아직 영상이 붙은 개념은 없습니다'))
out.push('')
out.push('스터디체크 **대표개념연결** 화면이 보는 것과 같은 목록입니다.')
out.push('개념을 더 넣거나 고치신 뒤 `node scripts/concept-video-list.mjs` 를 다시 돌리면 이 문서가 새로 써집니다.')
out.push('')

// 한눈에 보는 개수표
out.push('## 과정별 개수')
out.push('')
out.push('| 과정 | 대표개념 | 단원 |')
out.push('|---|---:|---:|')
for (const [key, rows] of sorted) {
  const [g, s] = key.split('|')
  const chapters = new Set(rows.map((r) => r.chapter ?? '-')).size
  out.push(`| ${termTitle(g, s)} | ${rows.length}개 | ${chapters}개 |`)
}
out.push('')
out.push('---')
out.push('')

for (const [key, rows] of sorted) {
  const [g, s] = key.split('|')
  out.push(`## ${termTitle(g, s)}  (${rows.length}개)`)
  out.push('')
  let chapter = null
  let sub = null
  for (const c of rows) {
    const ch = c.chapter ?? '(단원 없음)'
    if (ch !== chapter) { chapter = ch; sub = null; out.push(`### ${ch}`); out.push('') }
    const sc = c.sub_chapter && c.sub_chapter !== '-' ? c.sub_chapter : null
    if (sc && sc !== sub) { sub = sc; out.push(`**${sc}**`); out.push('') }
    const mark = hasVideo.has(c.id) ? 'x' : ' '
    out.push(`- [${mark}] ${c.concept_order}. ${c.concept_name}`)
  }
  out.push('')
}

fs.writeFileSync('docs/강의영상_대표개념목록.md', out.join('\n'), 'utf8')
console.log(`대표개념 ${concepts.length}개 · 과정 ${sorted.length}개 → docs/강의영상_대표개념목록.md`)
