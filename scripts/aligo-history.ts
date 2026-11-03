/**
 * 알리고에 **실제 전송 결과**를 물어본다 (읽기만 한다).
 *
 * 왜 필요한가 (원장님 2026-11-03 「10월20일 이후에 나간 모든 카톡이 현재 발송실패야」)
 *   우리 기록(briefing_sends.status='sent')은 **알리고가 접수했다**는 뜻일 뿐이다.
 *   카카오가 그 뒤에 거절하면 우리 쪽에는 아무 표시도 안 남는다. 그래서 실패 여부와
 *   그 사유는 **알리고에 물어봐야만** 알 수 있다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/aligo-history.ts            (최근 500건)
 *   node --import ./scripts/ts-resolve.mjs scripts/aligo-history.ts 2026-10-20 2026-11-03
 *
 * ★ 열쇠(API 키)는 화면에 찍지 않는다. 요청은 Supabase 의 aligo_call 을 거쳐 나간다
 *   (알리고가 고정 IP 에서만 받기 때문 — lib/aligo.ts 참고).
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
if (!URL || !KEY || !API || !UID) { console.error('✗ .env.local 에 Supabase · 알리고 키가 필요합니다.'); process.exit(1) }
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const [from, to] = [process.argv[2], process.argv[3]]
const ymd = (s?: string) => (s ? s.replace(/-/g, '') : '')

async function call(path: string, params: Record<string, string>) {
  const form = new URLSearchParams({ apikey: API!, userid: UID!, ...params }).toString()
  const { data, error } = await db.rpc('aligo_call', { p_path: path, p_form: form })
  if (error) throw new Error(`중계 실패: ${error.message}`)
  const res = data as { status: number; body: string | null; error?: string }
  if (res?.error) throw new Error(`연결 실패: ${res.error}`)
  try { return JSON.parse(res.body ?? '') } catch { throw new Error(`응답을 읽지 못함 (HTTP ${res?.status}): ${String(res?.body).slice(0, 300)}`) }
}

const 결과: any = await call('/akv10/history/list/', {
  page: '1', limit: '500', ...(from ? { startdate: ymd(from) } : {}), ...(to ? { enddate: ymd(to) } : {}),
})

if (결과?.code !== 0) {
  console.log('알리고 응답:', JSON.stringify(결과).slice(0, 600))
  process.exit(1)
}

const list: any[] = 결과.list ?? []
console.log(`알리고 전송내역 ${list.length}건` + (from ? ` (${from} ~ ${to ?? '오늘'})` : ' (최근)'))

/** 같은 뜻끼리 묶어 센다 — 사유 글자가 조금씩 다르다 */
const 묶음 = new Map<string, { 건수: number; 처음: string; 마지막: string; 보기: string }>()
for (const r of list) {
  const 키 = `${r.status ?? '?'} · ${r.reason ?? r.msg ?? '(사유 없음)'}`
  const g = 묶음.get(키) ?? { 건수: 0, 처음: r.reg_date ?? '', 마지막: r.reg_date ?? '', 보기: r.tpl_code ?? '' }
  g.건수++
  if ((r.reg_date ?? '') < g.처음) g.처음 = r.reg_date
  if ((r.reg_date ?? '') > g.마지막) g.마지막 = r.reg_date
  묶음.set(키, g)
}
for (const [키, g] of [...묶음.entries()].sort((a, b) => b[1].건수 - a[1].건수)) {
  console.log(`  ${String(g.건수).padStart(4)}건  ${키}`)
  console.log(`        ${g.처음} ~ ${g.마지막}${g.보기 ? ` · 템플릿 ${g.보기}` : ''}`)
}

// 실패한 것 몇 개는 그대로 보여 준다 — 묶음만 보면 어느 학생인지 모른다.
const 실패 = list.filter((r) => String(r.status ?? '').includes('실패') || String(r.reason ?? '').trim())
if (실패.length) {
  console.log(`\n실패한 건 보기 (${Math.min(5, 실패.length)}건):`)
  for (const r of 실패.slice(0, 5)) {
    console.log(`  ${r.reg_date} · ${String(r.phone ?? '').replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')} · ${r.status} · ${r.reason ?? ''} · 템플릿 ${r.tpl_code ?? ''}`)
  }
}
