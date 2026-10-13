/**
 * 오타 점검이 **정말 도는지** 날것으로 본다. AI 가 뭐라고 답하는지 그대로 찍는다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/polish-raw.ts 2026-10-13 8
 *
 * 아무것도 저장하지 않는다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { collectPolishTargets } from '../lib/notePolish.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const n = Number(process.argv[3] ?? 8)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const targets = (await collectPolishTargets(db, date)).slice(0, n)
console.log(`\n── 선생님들이 쓴 글 ${targets.length}건 (${date}) ──\n`)
for (const t of targets) console.log(`[${t.kind === 'progress' ? '진도' : '알림장'}] ${t.student}: ${t.before.replace(/\n/g, ' / ')}\n`)

const RULES = `너는 수학학원 선생님이 쓴 글을 다듬는 교정자다. 학부모에게 그대로 나가는 글이다.

반드시 지킬 것
1. **없는 사실을 지어내지 마라.** 적힌 내용만 다듬는다. 새 정보를 보태면 안 된다.
2. **교재명·단원명·사람 이름·숫자는 절대 바꾸지 마라.**
3. 고칠 것은 **맞춤법·띄어쓰기·오타**, 그리고 **끊기거나 어색한 문장**이다.
4. 길이를 크게 늘리지 마라. 원문의 1.3배를 넘기지 않는다.
5. 말투는 선생님이 쓴 그대로 유지한다.
6. 고칠 것이 없으면 after 를 null 로 둔다.

출력은 JSON 하나만.
{"items":[{"id":"<받은 id 그대로>","after":"<고친 글 또는 null>","why":"<한 줄>"}]}`

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const payload = targets.map((i) => ({ id: `${i.kind}:${i.id}`, 종류: i.kind === 'progress' ? '진도' : '알림장', 글: i.before }))

for (const model of ['claude-sonnet-5-5', 'claude-sonnet-4-5']) {
  try {
    const msg = await client.messages.create({
      model, max_tokens: 8000,
      messages: [{ role: 'user', content: `${RULES}\n\n다듬을 글 ${targets.length}건:\n${JSON.stringify(payload, null, 1)}` }],
    })
    console.log(`\n── ${model} 이 답한 것 ──`)
    console.log('멈춘 이유:', msg.stop_reason, '· 블록 종류:', msg.content.map((c: any) => c.type).join(','))
    console.log('쓴 토큰:', msg.usage.input_tokens, '→', msg.usage.output_tokens)
    console.log((msg.content[0] as any).text ?? '(글이 아님)')
    break
  } catch (e: any) {
    console.log(`${model} 실패: ${e?.message}`)
  }
}
