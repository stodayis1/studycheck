/**
 * 알리고에 **실제 전송 결과**를 물어본다 (읽기만 한다).
 *
 * 왜 필요한가 (원장님 2026-11-03 「10월20일 이후에 나간 모든 카톡이 현재 발송실패야」)
 *   우리 기록(briefing_sends.status='sent')은 **알리고가 접수했다**는 뜻일 뿐이다.
 *   카카오가 그 뒤에 거절하면 우리 쪽에는 아무 표시도 안 남는다. 실패 여부와 사유는
 *   알리고에 물어봐야만 알 수 있다.
 *
 * 어디를 보나
 *   /akv10/history/list/   — 보낸 묶음 목록 (mid)
 *   /akv10/history/detail/ — 그 묶음의 **수신자별 결과** (rslt · rslt_message · tpl_code)
 *   우리는 한 사람씩 보내므로 묶음 하나가 곧 한 통이다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/aligo-history.ts 2026-10-20 2026-11-03
 *   node --import ./scripts/ts-resolve.mjs scripts/aligo-history.ts 2026-11-03 2026-11-03 --실패만
 *
 * ★ 열쇠는 화면에 찍지 않는다. 번호는 가운데를 가린다.
 *   요청은 Supabase 의 aligo_call 을 거쳐 나간다(알리고가 고정 IP 에서만 받는다).
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
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const API = process.env.ALIGO_API_KEY
const UID = process.env.ALIGO_USER_ID
if (!URL || !KEY || !API || !UID) { console.error('✗ Supabase · 알리고 설정값이 필요합니다.'); process.exit(1) }
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const from = process.argv[2]
const to = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : from
const 실패만 = process.argv.includes('--실패만')
if (!from) { console.error('✗ 날짜를 주세요. 보기: 2026-10-20 2026-11-03'); process.exit(1) }
const ymd = (s: string) => s.replace(/-/g, '')
const 가림 = (p: string) => String(p ?? '').replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')

async function call(path: string, params: Record<string, string>): Promise<any> {
  const form = new URLSearchParams({ apikey: API!, userid: UID!, ...params }).toString()
  const { data, error } = await db.rpc('aligo_call', { p_path: path, p_form: form })
  if (error) throw new Error(`중계 실패: ${error.message}`)
  const res = data as { status: number; body: string | null; error?: string }
  if (res?.error) throw new Error(`연결 실패: ${res.error}`)
  try { return JSON.parse(res.body ?? '') } catch { throw new Error(`응답을 읽지 못함 (HTTP ${res?.status})`) }
}

// ① 보낸 묶음 목록 — 500건씩 넘긴다
const mids: { mid: string; regdate: string }[] = []
for (let page = 1; page <= 10; page++) {
  const r = await call('/akv10/history/list/', {
    page: String(page), limit: '500', startdate: ymd(from), enddate: ymd(to),
  })
  if (Number(r?.code) !== 0) { console.error('알리고:', r?.message ?? JSON.stringify(r).slice(0, 200)); break }
  const list: any[] = r.list ?? []
  for (const x of list) mids.push({ mid: String(x.mid), regdate: String(x.regdate ?? '') })
  if (list.length < 500) break
}
console.log(`${from} ~ ${to} · 보낸 묶음 ${mids.length}건 — 수신자별 결과를 받아옵니다…`)

// ② 묶음마다 수신자별 결과 (여덟 개씩 나눠 부른다)
interface 줄 { phone: string; rslt: string; msg: string; tpl: string; when: string; body: string }
const 줄들: 줄[] = []
for (let i = 0; i < mids.length; i += 8) {
  const part = await Promise.all(mids.slice(i, i + 8).map(async (m) => {
    try {
      const d = await call('/akv10/history/detail/', { mid: m.mid })
      return (d.list ?? []).map((r: any): 줄 => ({
        phone: String(r.phone ?? ''), rslt: String(r.rslt ?? ''), msg: String(r.rslt_message ?? ''),
        tpl: String(r.tpl_code ?? ''), when: String(r.sentdate ?? r.reqdate ?? m.regdate),
        body: String(r.message ?? ''),
      }))
    } catch { return [] as 줄[] }
  }))
  줄들.push(...part.flat())
  if ((i / 8) % 10 === 0) process.stdout.write('.')
}
console.log(`\n수신자별 결과 ${줄들.length}건`)

/** 성공·실패를 사유별로 센다 */
const 묶음 = new Map<string, { 건수: number; 처음: string; 마지막: string; 판: Set<string> }>()
for (const r of 줄들) {
  const 키 = `${r.rslt === '0' ? '성공' : `실패(${r.rslt})`} · ${r.msg || '(사유 없음)'}`
  const g = 묶음.get(키) ?? { 건수: 0, 처음: r.when, 마지막: r.when, 판: new Set<string>() }
  g.건수++
  if (r.when && r.when < g.처음) g.처음 = r.when
  if (r.when && r.when > g.마지막) g.마지막 = r.when
  if (r.tpl) g.판.add(r.tpl)
  묶음.set(키, g)
}
console.log('')
for (const [키, g] of [...묶음.entries()].sort((a, b) => b[1].건수 - a[1].건수)) {
  console.log(`  ${String(g.건수).padStart(4)}건  ${키}`)
  console.log(`        ${g.처음} ~ ${g.마지막} · 템플릿 ${[...g.판].join(', ')}`)
}

// ③ 실패한 건은 날짜·번호·템플릿을 그대로 — 누구 것인지 알아야 다시 보낼 수 있다
const 실패 = 줄들.filter((r) => r.rslt !== '0')
if (실패.length) {
  console.log(`\n실패한 건 (${실패.length}건)`)
  const 날짜별 = new Map<string, number>()
  for (const r of 실패) {
    const d = r.when.slice(0, 10)
    날짜별.set(d, (날짜별.get(d) ?? 0) + 1)
  }
  for (const [d, n] of [...날짜별.entries()].sort()) console.log(`  ${d} — ${n}건`)
  console.log('  보기:')
  for (const r of 실패.slice(0, 10)) console.log(`    ${r.when} · ${가림(r.phone)} · ${r.msg} · 템플릿 ${r.tpl}`)
}
if (실패만 && 실패.length) {
  console.log('\n실패한 본문 한 건:')
  console.log(실패[0].body)
}
