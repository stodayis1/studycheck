/**
 * **아직 학부모님께 안 닿은 브리핑**을 가려낸다 (읽기만 한다).
 *
 * 왜 필요한가 (2026-11-03)
 *   2026-10-20 ~ 10-31 오전까지 알림톡 1,074건이 「메시지가 템플릿과 일치하지않음」으로
 *   거절됐다. 우리 기록에는 전부 「나감」으로 남아 있다. 그 뒤 일부는 다시 보내 성공했다.
 *   그래서 **「한 번이라도 성공한 적이 있나」** 를 수업 날짜·학생별로 따져야 한다.
 *
 * 어떻게 짝을 맞추나
 *   알리고가 돌려준 본문 첫 줄에 「○○○(학년) 학생 · 10월 29일」이 있다.
 *   거기서 **학생 이름과 수업 날짜**를 꺼내 성공·실패를 같은 열쇠로 묶는다.
 *   (우리 발송 기록과 달리 이건 **실제 결과**다.)
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/aligo-undelivered.ts 2026-10-20 2026-11-03
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
const [URL, KEY, API, UID] = [process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  process.env.ALIGO_API_KEY, process.env.ALIGO_USER_ID]
if (!URL || !KEY || !API || !UID) { console.error('✗ Supabase · 알리고 설정값이 필요합니다.'); process.exit(1) }
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const from = process.argv[2]
const to = process.argv[3] ?? from
if (!from) { console.error('✗ 날짜를 주세요. 보기: 2026-10-20 2026-11-03'); process.exit(1) }
const ymd = (s: string) => s.replace(/-/g, '')

async function call(path: string, params: Record<string, string>): Promise<any> {
  const form = new URLSearchParams({ apikey: API!, userid: UID!, ...params }).toString()
  const { data, error } = await db.rpc('aligo_call', { p_path: path, p_form: form })
  if (error) throw new Error(error.message)
  const res = data as { body: string | null }
  return JSON.parse(res.body ?? '{}')
}

const mids: string[] = []
for (let page = 1; page <= 10; page++) {
  const r = await call('/akv10/history/list/', { page: String(page), limit: '500', startdate: ymd(from), enddate: ymd(to) })
  const list: any[] = r.list ?? []
  for (const x of list) mids.push(String(x.mid))
  if (list.length < 500) break
}

/** 본문 둘째 줄 「○○○(초4) 학생 · 10월 29일」 에서 이름과 수업 날짜를 꺼낸다 */
function 열쇠(body: string): string | null {
  const m = String(body).match(/^\s*\[[^\]]*\]\s*\n\s*(.+?)\s*학생\s*·\s*(\d{1,2})월\s*(\d{1,2})일/m)
  if (!m) return null
  const 이름 = m[1].replace(/\([^)]*\)\s*$/, '').trim()
  return `${이름}|${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
}

const 성공 = new Set<string>()
const 실패 = new Map<string, { when: string; tpl: string }>()
for (let i = 0; i < mids.length; i += 8) {
  const part = await Promise.all(mids.slice(i, i + 8).map(async (mid) => {
    try { return (await call('/akv10/history/detail/', { mid })).list ?? [] } catch { return [] }
  }))
  for (const r of part.flat() as any[]) {
    const k = 열쇠(String(r.message ?? ''))
    if (!k) continue
    if (String(r.rslt) === '0') 성공.add(k)
    else 실패.set(k, { when: String(r.sentdate ?? r.reqdate ?? ''), tpl: String(r.tpl_code ?? '') })
  }
  if ((i / 8) % 10 === 0) process.stdout.write('.')
}
console.log('')

const 못받음 = [...실패.keys()].filter((k) => !성공.has(k))
console.log(`보낸 묶음 ${mids.length}건 · 성공한 짝 ${성공.size} · 실패한 짝 ${실패.size}`)
console.log(`→ **한 번도 안 닿은 브리핑 ${못받음.length}건**\n`)

const 날짜별 = new Map<string, string[]>()
for (const k of 못받음) {
  const [이름, 날짜] = k.split('|')
  날짜별.set(날짜, [...(날짜별.get(날짜) ?? []), 이름])
}
for (const [날짜, 이름들] of [...날짜별.entries()].sort()) {
  console.log(`  ${날짜} — ${이름들.length}명`)
}
console.log('\n※ 이름은 알리고 본문에서 읽은 것이다. 같은 이름이 둘이면 한 줄로 묶인다.')
