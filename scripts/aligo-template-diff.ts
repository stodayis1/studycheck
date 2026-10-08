/**
 * 알리고에 **승인된 템플릿**과 우리 코드의 본문이 같은지 글자 단위로 대조한다.
 *
 * 알리고는 변수를 채워 주지 않는다. 우리가 만든 본문이 승인된 템플릿과 같아야 전송되고,
 * 안 맞으면 **에러도 없이 그냥 안 간다.** 템플릿을 고칠 때마다 이걸 돌릴 것.
 *
 *   node scripts/aligo-template-diff.ts
 *
 * ★ 알리고는 등록된 고정 IP 에서만 받는다. Vercel 은 IP 가 바뀌어 안 되고,
 *   Supabase 는 고정이라(16.184.57.154) DB 의 aligo_call 함수를 거쳐 부른다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { BRIEFING_TEMPLATE } from '../lib/briefing.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const need = ['ALIGO_API_KEY', 'ALIGO_USER_ID', 'ALIGO_SENDER_KEY', 'ALIGO_BRIEFING_TPL_CODE']
const miss = need.filter((k) => !process.env[k])
if (miss.length) {
  console.error('✗ 환경변수가 없습니다: ' + miss.join(', '))
  console.error('  .env.local 에 넣고 다시 돌리세요(값은 Vercel 과 같게).')
  process.exit(1)
}

const form = new URLSearchParams({
  apikey: process.env.ALIGO_API_KEY!,
  userid: process.env.ALIGO_USER_ID!,
  senderkey: process.env.ALIGO_SENDER_KEY!,
}).toString()

const { data, error } = await db.rpc('aligo_call', { p_path: '/akv10/template/list/', p_form: form })
if (error) { console.error('✗ DB 중계 호출 실패:', error.message); process.exit(1) }
if ((data as any).error) { console.error('✗ 알리고 연결 실패:', (data as any).error); process.exit(1) }

const body = JSON.parse((data as any).body)
if (Number(body.code) !== 0) { console.error(`✗ 알리고 오류 (${body.code}) ${body.message}`); process.exit(1) }

const tpl = (body.list ?? []).find((t: any) => t.templtCode === process.env.ALIGO_BRIEFING_TPL_CODE)
if (!tpl) {
  console.error(`✗ 템플릿 ${process.env.ALIGO_BRIEFING_TPL_CODE} 를 못 찾았습니다.`)
  console.error('  등록된 것:', (body.list ?? []).map((t: any) => `${t.templtCode}(${t.templtName})`).join(', '))
  process.exit(1)
}

// 알리고는 줄바꿈을 \r\n 으로 돌려준다. 우리 상수는 \n 이라 맞춰 놓고 비교한다.
const registered: string = String(tpl.templtContent ?? '').replace(/\r\n/g, '\n')
const ours = BRIEFING_TEMPLATE

console.log(`템플릿  ${tpl.templtCode} · ${tpl.templtName}`)
console.log(`승인상태 ${tpl.inspStatus}${tpl.inspStatus === 'APR' ? ' (승인됨)' : ' ← APR 이어야 보낼 수 있습니다'}`)
console.log(`본문길이 우리 ${ours.length}자 / 알리고 ${registered.length}자`)

if (registered === ours) {
  console.log('\n✓ 본문이 글자 단위로 똑같습니다.')
} else {
  let at = 0
  while (at < ours.length && at < registered.length && ours[at] === registered[at]) at++
  const show = (s: string) => JSON.stringify(s.slice(Math.max(0, at - 25), at + 25))
  console.log(`\n✗ ${at}번째 글자부터 다릅니다.`)
  console.log(`  우리   : ${show(ours)}`)
  console.log(`  알리고 : ${show(registered)}`)
  process.exitCode = 1
}

const want = [
  ['레벨학습지 점수 현황', 'https://studycheck-five.vercel.app/report/#{점수토큰}'],
  ['출결·과제달성률 현황', 'https://studycheck-five.vercel.app/report/#{출결토큰}'],
  ['알림장·사진 보기', 'https://studycheck-five.vercel.app/report/#{알림장토큰}'],
]
const got = (tpl.buttons ?? []).map((b: any) => [b.name, b.linkMo])
console.log('\n버튼')
let btnOk = got.length === want.length
want.forEach(([n, l], i) => {
  const ok = got[i]?.[0] === n && got[i]?.[1] === l
  btnOk &&= ok
  console.log(`  ${ok ? '✓' : '✗'} ${i + 1}. ${got[i]?.[0] ?? '(없음)'} → ${got[i]?.[1] ?? '(없음)'}`)
  if (!ok) console.log(`      기대: ${n} → ${l}`)
})
if (!btnOk) process.exitCode = 1

console.log(`\n${process.exitCode ? '✗ 이대로 보내면 알리고가 거부합니다.' : '✓ 보내도 됩니다.'}`)
