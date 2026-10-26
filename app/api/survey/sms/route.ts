/**
 * 설문 링크를 문자로 보낸다 — 원장 전용.
 *
 * 원장님 2026-10-24 「문자로 보낼건데 … 만들어줘」
 *   「참석자는 외부 학부모님도 있거든. 총 17명 정도야」
 *   「아니 그냥 나갈 번호를 내가 누르면 안돼? 재원생 전체한테 보내는게 아니라니까」
 *
 * ★ 그래서 **고른 사람에게만** 보낸다. 학년·학교급으로 한꺼번에 보내지 않는다 —
 *   설명회에 오신 분은 재원생 전체가 아니다.
 *     · studentIds : 화면에서 체크한 학생들의 보호자
 *     · extraPhones: 재원생이 아닌 분(설명회에 오신 외부 학부모님) 번호를 그대로
 * ★ 한 번 나가면 **못 되돌린다.** 기본은 미리보기(dryRun)이고, send: true 를 일부러 줘야 나간다.
 * ★ 번호는 숫자만 남겨 중복을 뺀다 — 형제자매가 같은 번호를 쓴다. 한 집에 한 통.
 * ★ 문자는 수학OPS 를 거친다(lib/opsSms.ts). OPS 가 테스트 모드면 실제로는 안 나가고,
 *   그 사실을 응답에 그대로 적어 준다 — 「보냈다」고 오해하면 안 된다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { sendSmsViaOps } from '@/lib/opsSms'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
}

const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const pretty = (d: string) =>
  d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
    : d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d
// ★ 받는 분 목록은 **원장님 화면에만** 뜬다. 가운데를 가려 두면 잘못 적은 번호를
//   못 찾는다 (원장님 2026-10-24 「잘못 쓴 번호가 있는데 수정하려면?」). 그대로 보여 준다.

export async function POST(req: NextRequest) {
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny

  const b = await req.json().catch((): any => null)
  if (!b) return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })

  const text = String(b.text ?? '').trim()
  if (!text) return NextResponse.json({ error: '보낼 글을 적어 주세요.' }, { status: 400 })
  if (text.length > 900) return NextResponse.json({ error: '글이 너무 길어요 (900자 넘음).' }, { status: 400 })

  const ids: string[] = Array.isArray(b.studentIds) ? b.studentIds.map(String).slice(0, 500) : []

  type Who = { phone: string; label: string }
  const list: Who[] = []

  // ① 고른 학생의 보호자
  if (ids.length) {
    const { data, error } = await db().from('students')
      .select('id, name, grade, parent_phone').in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const s of data ?? []) {
      const d = digits((s as any).parent_phone)
      if (d.length < 10) continue
      list.push({ phone: d, label: `${(s as any).name}(${(s as any).grade})` })
    }
  }

  // ② 직접 적은 번호 — 설명회에 오신 외부 학부모님
  const extraRaw: string[] = Array.isArray(b.extraPhones) ? b.extraPhones
    : String(b.extraPhones ?? '').split(/[\s,;]+/)
  for (const x of extraRaw) {
    const d = digits(x)
    if (d.length >= 10) list.push({ phone: d, label: '외부' })
  }

  // ③ 번호로 묶는다 — 형제자매가 같은 번호를 쓴다. 한 집에 한 통.
  const byPhone = new Map<string, string[]>()
  for (const w of list) {
    if (!byPhone.has(w.phone)) byPhone.set(w.phone, [])
    const names = byPhone.get(w.phone)!
    if (!names.includes(w.label)) names.push(w.label)
  }
  const targets = [...byPhone.entries()].map(([phone, names]) => ({ phone, names }))

  const summary = {
    총번호: targets.length,
    학생수: list.filter((w) => w.label !== '외부').length,
    외부: list.filter((w) => w.label === '외부').length,
    한번호에여럿: targets.filter((t) => t.names.length > 1).length,
    // 보내기 전에 **전부** 보여 준다 — 고른 것이 맞는지 눈으로 확인하시라고.
    받는분: targets.map((t) => `${pretty(t.phone)} — ${t.names.join(', ')}`),
  }

  if (b.send !== true) return NextResponse.json({ dryRun: true, ...summary })
  if (!targets.length) return NextResponse.json({ error: '보낼 번호가 없어요.' }, { status: 400 })

  let sent = 0
  let opsDryRun = false
  const failed: { phone: string; error: string }[] = []
  for (const t of targets) {
    const r = await sendSmsViaOps({ to: t.phone, text, refType: 'survey_link' })
    if (r.ok) { sent++; opsDryRun = opsDryRun || !!r.dryRun }
    else failed.push({ phone: pretty(t.phone), error: r.error ?? '알 수 없는 까닭' })
  }
  return NextResponse.json({
    ...summary,
    보냄: sent,
    실패: failed.length ? failed : undefined,
    테스트모드: opsDryRun || undefined,
    보낸사람: who.name,
  })
}
