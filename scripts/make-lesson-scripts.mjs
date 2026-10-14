/**
 * 강의영상 **대본**을 과정 하나치씩 뽑는다.
 *
 *   node scripts/make-lesson-scripts.mjs 공통수학1 1
 *
 * 재료 — 대표개념(concepts) + 그 단원의 대표유형(standard_types) + 대표문제가 있는지(problems)
 * 결과 — docs/대본/<과정>/<번호>_<개념이름>.md   선생님이 읽고 고치시는 글
 *        docs/대본/<과정>/_대본.json              렌더링에 쓰는 기계용
 *
 * 파일럿(곱셈공식의 변형)과 같은 짜임으로 쓴다 —
 *   제목 → 왜 필요한가 → 공식·개념 2~4토막 → 정리
 * 각 토막에 「슬라이드에 적을 것」과 「수지쌤이 말할 것」을 나눠 적는다. 그래야 그대로 영상이 된다.
 */
import fs from 'node:fs'
import path from 'node:path'
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const ai = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const MODELS = ['claude-sonnet-5-5', 'claude-sonnet-4-5']

async function all(table, sel, tweak = (q) => q) {
  const out = []
  for (let at = 0; ; at += 1000) {
    const { data, error } = await tweak(db.from(table).select(sel).range(at, at + 999))
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

const concepts = await all('concepts', 'id, chapter, sub_chapter, concept_name, concept_order',
  (q) => q.eq('grade', grade).eq('semester', semester).order('concept_order'))
const types = await all('standard_types', 'code, chapter_title, sub_chapter_title, type_title',
  (q) => q.eq('grade', grade).eq('semester', semester).order('chapter_no').order('sub_chapter_no').order('type_no'))
const reps = await all('problems', 'type_code, book, local_no',
  (q) => q.eq('grade', grade).eq('semester', semester).eq('is_important', true))

const repBy = new Map()
for (const r of reps) repBy.set(r.type_code, [...(repBy.get(r.type_code) ?? []), r])

if (!concepts.length) { console.log(`${grade} ${semester}학기 — 대표개념이 없어요.`); process.exit(0) }

const RULES = `너는 중·고등 수학 학원의 선생님이다. **강의영상 대본**을 쓴다.

누가 보나 — 그 과정을 처음 배우거나 복습하는 학생. 혼자 보는 영상이다.

짜임 (이대로 쓴다)
  1. 제목 슬라이드 — 무엇을 배우는지
  2. 왜 필요한가 — 이 개념이 어디에 쓰이는지. 시험에서 어떻게 묻는지
  3. 내용 2~4토막 — 공식·성질·풀이 흐름. **한 토막에 하나씩만**
  4. 정리 — 외울 것 한 줄, 흔한 실수 한 줄

각 토막은 두 가지를 나눠 적는다
  · board : 슬라이드에 **적을** 것. 짧게. 수식은 $...$ 안에 LaTeX 로.
  · say   : 수지쌤이 **말할** 것. 수식을 소리 내어 읽듯이 풀어서
            (예: $x^2+y^2$ → "엑스 제곱 더하기 와이 제곱").

지킬 것
1. **없는 것을 지어내지 마라.** 받은 개념 이름과 유형 이름 안에서 쓴다.
2. 한 편이 **2~4분**이다. say 를 다 합쳐 450~900자.
3. 말투는 **존댓말**. 과장된 칭찬이나 인사말을 길게 붙이지 마라.
4. 공식은 외우라고만 하지 말고 **왜 그런지 한 줄**을 붙인다.
5. 학생이 자주 틀리는 곳을 정리에 꼭 넣는다.

출력은 JSON 하나만. 설명이나 코드블록 없이.
{"title":"<제목>","slides":[{"head":"<슬라이드 제목>","board":"<적을 것>","say":"<말할 것>"}]}`

const outDir = path.join('docs', '대본', grade)
fs.mkdirSync(outDir, { recursive: true })

async function write(c) {
  // 이 개념이 속한 중단원의 유형들을 재료로 준다
  const near = types.filter((t) => String(t.sub_chapter_title ?? '').replace(/\s/g, '')
    === String(c.sub_chapter ?? '').replace(/\s/g, ''))
  const payload = {
    과정: grade, 대단원: c.chapter, 중단원: c.sub_chapter,
    대표개념: `${c.concept_order}. ${c.concept_name}`,
    같은_중단원_대표유형: (near.length ? near : types).slice(0, 14).map((t) => ({
      코드: t.code, 이름: t.type_title, 대표문제: (repBy.get(t.code) ?? []).map((r) => `${r.book} ${r.local_no}`).join(' / ') || null,
    })),
  }
  let lastErr = null
  for (const model of MODELS) {
    try {
      const msg = await ai.messages.create({
        model, max_tokens: 6000,
        messages: [{ role: 'user', content: `${RULES}\n\n${JSON.stringify(payload, null, 1)}` }],
      })
      const said = msg.content.find((x) => x.type === 'text')
      if (!said?.text) { lastErr = new Error('글 블록 없음'); continue }
      const m = said.text.match(/\{[\s\S]*\}/)
      return JSON.parse(m?.[0] ?? said.text)
    } catch (e) { lastErr = e }
  }
  throw lastErr
}

const CHUNK = 5          // 한 번에 다섯 편씩. 더 올리면 한도에 걸린다.
const done = []
for (let at = 0; at < concepts.length; at += CHUNK) {
  const part = concepts.slice(at, at + CHUNK)
  const got = await Promise.all(part.map(async (c) => {
    try { return { c, s: await write(c) } }
    catch (e) { return { c, err: e?.message ?? '알 수 없는 오류' } }
  }))
  for (const g of got) {
    const n = String(g.c.concept_order).padStart(2, '0')
    if (g.err) { console.log(`  ✗ ${n} ${g.c.concept_name} — ${g.err}`); continue }
    const say = g.s.slides.map((x) => x.say ?? '').join(' ')
    const md = [
      `# ${g.c.concept_order}. ${g.c.concept_name}`, '',
      `${grade} · ${g.c.chapter} · ${g.c.sub_chapter}`,
      `제목: ${g.s.title}`,
      `슬라이드 ${g.s.slides.length}장 · 말 ${[...say].length}자 (대략 ${Math.round([...say].length / 5.5)}초)`, '',
      '---', '',
      ...g.s.slides.flatMap((x, i) => [
        `## ${i + 1}. ${x.head}`, '',
        '**슬라이드에 적을 것**', '', x.board ?? '', '',
        '**수지쌤이 말할 것**', '', x.say ?? '', '',
      ]),
    ].join('\n')
    fs.writeFileSync(path.join(outDir, `${n}_${g.c.concept_name.replace(/[\\/:*?"<>|]/g, '')}.md`), md, 'utf8')
    done.push({ id: g.c.id, order: g.c.concept_order, name: g.c.concept_name,
      chapter: g.c.chapter, subChapter: g.c.sub_chapter, ...g.s })
    console.log(`  ✓ ${n} ${g.c.concept_name} — 슬라이드 ${g.s.slides.length}장 · ${[...say].length}자`)
  }
}

fs.writeFileSync(path.join(outDir, '_대본.json'), JSON.stringify(done, null, 1), 'utf8')
console.log(`\n${grade} — 대본 ${done.length}/${concepts.length}편 → ${outDir}`)
