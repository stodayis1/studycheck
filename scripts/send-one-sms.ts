/**
 * 학부모 **한 분**에게 문자 한 통 — 알림톡이 막힌 학생에게 손으로 보낼 때 쓴다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/send-one-sms.ts <글파일> <학생이름> [--send]
 *
 * ★ 기본은 **예행**이다. `--send` 를 붙여야 실제로 나간다.
 * ★ 보내는 길은 `lib/opsSms.ts` 의 `sendSmsViaOps` **그대로** 쓴다 — 베껴 쓰면
 *   발신번호·기록(OPS sms_logs)이 갈라진다.
 * ★ 번호는 **학생 이름으로 DB 에서 찾는다.** 손으로 적어 넣다가 한 자리 틀리면
 *   남의 집에 그 집 아이 성적이 간다.
 * ★ 비밀키는 `.env.local` 에서 읽어 `process.env` 에만 넣는다 — 화면에 찍지 않는다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { sendSmsViaOps } from '../lib/opsSms.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const [글파일, 학생이름] = process.argv.slice(2)
const SEND = process.argv.includes('--send')
if (!글파일 || !학생이름) {
  console.error('쓰는 법: send-one-sms.ts <글파일> <학생이름> [--send]')
  process.exit(1)
}

const text = fs.readFileSync(글파일, 'utf8').replace(/\r\n/g, '\n').trim()
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

const { data: found, error } = await db.from('students')
  .select('id, name, grade, parent_phone, is_active, is_test')
  .eq('name', 학생이름).eq('is_active', true)
if (error) { console.error('학생을 찾지 못했어요: ' + error.message); process.exit(1) }
const 학생 = (found ?? []).filter((s: any) => !s.is_test)
if (학생.length !== 1) {
  console.error(`「${학생이름}」으로 찾은 재원생이 ${학생.length}명이라 보내지 않습니다.`)
  process.exit(1)
}
const to = String(학생[0].parent_phone ?? '').replace(/\D/g, '')
const mask = to.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')
const bytes = Buffer.byteLength(text, 'utf8')

console.log(`받는 사람 : ${학생[0].name}(${학생[0].grade}) 학부모님 ${mask}`)
console.log(`글자      : ${text.length}자 · ${bytes}바이트 (${bytes > 2000 ? '★ 2000바이트 넘음 — 잘릴 수 있어요' : 'LMS 한 통'})`)
console.log('─'.repeat(52))
console.log(text)
console.log('─'.repeat(52))

if (!SEND) { console.log('\n예행만 했습니다. 보내려면 --send 를 붙이세요.'); process.exit(0) }

const r = await sendSmsViaOps({ to, text, refType: 'briefing-sms', refId: 학생[0].id })
console.log(r.ok ? (r.dryRun ? '\n✓ OPS 가 받았습니다 (테스트 모드라 실제로는 안 나갔어요)' : '\n✓ 보냈습니다')
  : `\n✗ 못 보냈습니다 — ${r.error}`)
process.exitCode = r.ok ? 0 : 1
