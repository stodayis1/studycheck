/**
 * 오타·문장 자동 교정을 **고치지 않고** 돌려 본다.
 *
 *   node scripts/polish-dry.ts 2026-10-13
 *
 * 자동 발송(밤 8시·다음 날 오전 11시)이 쓰는 함수 그대로다(lib/notePolish.ts).
 * 그래서 여기 「고침」으로 뜨는 것이 그때 실제로 반영될 것이고,
 * 「건너뜀」으로 뜨는 것은 기계 검사(lib/polishGuard.ts)에 걸려 손대지 않을 것이다.
 *
 * 아무것도 저장하지 않는다 — 읽기만 한다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { collectPolishTargets, proposePolish } from '../lib/notePolish.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

console.log(`\n═══ ${date} 오타·문장 점검 (고치지 않음) ═══\n`)
console.log('ANTHROPIC_API_KEY 있음:', Boolean(process.env.ANTHROPIC_API_KEY))

const targets = await collectPolishTargets(db, date)
console.log('검사 대상 글:', targets.length, '건\n')
if (!targets.length) process.exit(0)

const { items, failed, checked } = await proposePolish(targets)
console.log(`읽은 글 ${checked}건 · 고칠 곳 ${items.length}건 · 실패 ${failed.length}건\n`)

for (const i of items) {
  console.log(`${i.safe ? '✎ 고침' : '– 건너뜀'}  ${i.student} [${i.kind === 'notice' ? '알림장' : '진도'}]${i.safe ? '' : ` — ${i.unsafeReason}`}`)
  console.log('   전:', String(i.before).replace(/\n/g, ' / '))
  console.log('   후:', String(i.after).replace(/\n/g, ' / '))
  console.log('')
}
for (const f of failed) console.log('   ✗ 읽지 못함:', f)
