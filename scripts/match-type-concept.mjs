/**
 * 대표유형 → 대표개념 매칭 **제안**을 만든다. 반영하지 않는다.
 *
 *   node scripts/match-type-concept.mjs 공통수학1 1
 *
 * 왜 이렇게 하나
 *   대표개념연결(type_learning_assets)이 아직 비어 있어서, 유형 1,247개가 어느 개념에
 *   속하는지 아무 데도 적혀 있지 않다. 손으로 다 잇는 건 무리라 1차 제안을 만든다.
 *
 * 기준
 *   유형·개념·대표문제가 **같은 중단원** 안에 들어 있다. 그래서 중단원 하나씩 묶어
 *   「이 중단원의 개념 N개 중 이 유형은 어디냐」만 묻는다. 범위가 좁아 틀릴 여지가 적다.
 *   대표문제(is_important)가 있는 유형은 표에 같이 적어, 원장님이 그 문제를 펴 보고
 *   확인하실 수 있게 한다.
 *
 * 결과
 *   docs/유형개념매칭_<과정>.csv   — 확인하실 표 (고칠 칸 포함)
 *   docs/유형개념매칭_<과정>.md    — 눈으로 읽는 용
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const grade = process.argv[2] ?? '공통수학1'
const semester = process.argv[3] ?? '1'
// ★ 파일 이름에 학기를 넣는다. 안 넣었더니 중1 1학기 결과를 2학기가 덮어썼다(2026-10-14).
const 고등과정 = ['공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하'].includes(grade)
const slug = 고등과정 ? grade : `${grade}_${semester}학기`

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELS = ['claude-sonnet-5-5', 'claude-sonnet-4-5']

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

const concepts = await all('concepts', 'id, chapter, sub_chapter, concept_name, concept_order',
  (q) => q.eq('grade', grade).eq('semester', semester).order('concept_order'))
const types = await all('standard_types',
  'code, chapter_no, chapter_title, sub_chapter_no, sub_chapter_title, type_no, type_title',
  (q) => q.eq('grade', grade).eq('semester', semester).order('chapter_no').order('sub_chapter_no').order('type_no'))
const reps = await all('problems', 'type_code, book, local_no, page_no',
  (q) => q.eq('grade', grade).eq('semester', semester).eq('is_important', true))

if (!concepts.length || !types.length) {
  console.log(`${grade} ${semester}학기 — 개념 ${concepts.length}개 · 유형 ${types.length}개. 매칭할 게 없어요.`)
  process.exit(0)
}

const repBy = new Map()
for (const r of reps) {
  if (!repBy.has(r.type_code)) repBy.set(r.type_code, [])
  repBy.get(r.type_code).push(r)
}

// ★ 중단원 이름으로 묶지 않는다. 두 표의 중단원 이름이 서로 다르다 —
//   개념은 「항등식과 나머지정리 / 인수분해」로 나뉘어 있는데 유형은 「나머지 정리와 인수분해」
//   하나다. 이름을 맞추려 들면 짝이 안 맞는 쪽이 통째로 떨어진다.
//   그래서 **개념 전체를 보기로 주고** 유형만 나눠서 묻는다. 과정 하나의 개념이 많아야
//   60개라 한 번에 보여 줘도 된다.
const CHUNK = 25
const parts = []
for (let at = 0; at < types.length; at += CHUNK) parts.push(types.slice(at, at + CHUNK))

const RULES = `너는 수학 교재의 **대표유형을 대표개념에 나눠 붙이는** 일을 한다.

받는 것
  · 그 과정의 **대표개념** 전체 목록 (번호 · 대단원 · 중단원 · 이름)
  · 붙여야 할 **대표유형** 목록 (코드 · 대단원 · 중단원 · 이름)

할 일
  유형 하나하나를 **개념 한 개**에 붙인다. 그 유형의 문제를 풀려면 어느 개념을 알아야 하는가로 판단한다.

지킬 것
1. 받은 개념 번호 중에서만 고른다. 새 개념을 만들지 마라.
2. 개념 하나에 유형이 여러 개 붙는 것은 정상이다. 억지로 고루 나누지 마라.
3. **두 표의 단원 이름이 서로 다를 수 있다.** 이름이 안 맞는다고 포기하지 말고 내용으로 판단해라.
   예: 유형 쪽 「나머지 정리와 인수분해」는 개념 쪽에서 「항등식과 나머지정리」와 「인수분해」로
   나뉘어 있을 수 있다.
4. 어느 개념에도 안 맞으면 conceptOrder 를 null 로 두고 why 에 이유를 적는다.
5. 확신이 서지 않으면 sure 를 false 로 둔다. **틀린 것을 맞다고 하지 마라** — 사람이 확인할 때
   애매한 것만 보면 되도록 솔직하게 표시하는 것이 훨씬 쓸모 있다.
6. why 는 한 줄. 왜 그 개념인지만.

출력은 JSON 하나만. 설명이나 코드블록 없이.
{"items":[{"code":"<유형코드 그대로>","conceptOrder":<개념 번호 또는 null>,"sure":true|false,"why":"<한 줄>"}]}`

const 개념목록 = concepts.map((c) => ({
  번호: c.concept_order, 대단원: c.chapter, 중단원: c.sub_chapter, 이름: c.concept_name,
}))

async function ask(part) {
  const payload = {
    대표개념: 개념목록,
    대표유형: part.map((t) => ({
      코드: t.code, 대단원: t.chapter_title, 중단원: t.sub_chapter_title, 이름: t.type_title,
    })),
  }
  let lastErr = null
  for (const model of MODELS) {
    try {
      const msg = await ai.messages.create({
        model, max_tokens: 8000,
        messages: [{ role: 'user', content: `${RULES}

${JSON.stringify(payload, null, 1)}` }],
      })
      // 첫 블록이 thinking 일 수 있다 — 글 블록을 찾아서 쓴다.
      const said = msg.content.find((c) => c.type === 'text')
      if (!said?.text) { lastErr = new Error(`글 블록 없음 (${msg.content.map((c) => c.type).join(',')})`); continue }
      const m = said.text.match(/\{[\s\S]*\}/)
      return JSON.parse(m?.[0] ?? said.text)
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

const conceptByOrder = new Map(concepts.map((c) => [c.concept_order, c]))
const results = []

console.log(`${grade} ${semester}학기 — 개념 ${concepts.length}개 · 유형 ${types.length}개 · ${parts.length}묶음`)

const answers = await Promise.all(parts.map(async (part) => {
  try { return { part, items: (await ask(part)).items ?? [] } }
  catch (e) { return { part, items: [], note: `물어보기 실패: ${e?.message}` } }
}))

for (const { part, items, note } of answers) {
  const by = new Map(items.map((i) => [String(i.code), i]))
  for (const t of part) {
    const a = by.get(t.code)
    const c = a?.conceptOrder != null ? conceptByOrder.get(a.conceptOrder) : null
    results.push({
      code: t.code,
      chapter: t.chapter_title,
      sub: t.sub_chapter_title,
      typeTitle: t.type_title,
      conceptOrder: c?.concept_order ?? '',
      conceptName: c?.concept_name ?? '',
      conceptId: c?.id ?? '',
      sure: a ? (a.sure ? '확실' : '애매') : '못 정함',
      why: note ?? a?.why ?? '',
      rep: (repBy.get(t.code) ?? []).map((r) => `${r.book} ${r.local_no ?? ''}`.trim()).join(' / '),
    })
  }
}
results.sort((a, b) => a.code.localeCompare(b.code))

const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const head = ['유형코드', '대단원', '중단원', '유형 이름', '개념번호', '대표개념', '확신', '근거', '대표문제', '고칠 개념번호']
const rows = [head, ...results.map((r) => [r.code, r.chapter, r.sub, r.typeTitle, r.conceptOrder, r.conceptName, r.sure, r.why, r.rep, ''])]
fs.writeFileSync(`docs/유형개념매칭_${slug}.csv`, '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n'), 'utf8')

const md = [`# ${grade} ${semester}학기 — 대표유형 → 대표개념 매칭 제안`, '']
md.push(`유형 ${results.length}개 · 개념 ${concepts.length}개`)
md.push(`확실 ${results.filter((r) => r.sure === '확실').length} · 애매 ${results.filter((r) => r.sure === '애매').length} · 못 정함 ${results.filter((r) => r.sure === '못 정함').length}`)
md.push('', '**애매**로 표시된 것만 보시면 됩니다. 고치실 것은 CSV 의 「고칠 개념번호」 칸에 적어 주세요.', '')
let sub = null
for (const r of results) {
  if (r.sub !== sub) { sub = r.sub; md.push('', `### ${r.chapter} · ${r.sub}`, '') }
  const mark = r.sure === '확실' ? ' ' : r.sure === '애매' ? '?' : '!'
  md.push(`- [${mark}] \`${r.code}\` ${r.typeTitle}`)
  md.push(`      → **${r.conceptOrder}. ${r.conceptName || '(못 정함)'}** — ${r.why}${r.rep ? `  〔${r.rep}〕` : ''}`)
}
fs.writeFileSync(`docs/유형개념매칭_${slug}.md`, md.join('\n'), 'utf8')

console.log(`\n확실 ${results.filter((r) => r.sure === '확실').length} · 애매 ${results.filter((r) => r.sure === '애매').length} · 못 정함 ${results.filter((r) => r.sure === '못 정함').length}`)
console.log(`→ docs/유형개념매칭_${slug}.csv · .md`)
