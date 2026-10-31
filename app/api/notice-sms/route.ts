// 재원생 학부모 **전체에게 한 통** — 문자(OPS 솔라피 경유).
//
// 왜 알림톡이 아니라 문자인가 (원장님 2026-10-31)
//   알림톡은 **승인된 템플릿과 글자 단위로 같아야** 나간다. 공지문은 그때그때 글이 다르니
//   템플릿을 만들 수 없다(심사도 4~5일). 그대로 보내면 카카오가 「메시지가 템플릿과
//   일치하지않음」으로 거절하고, 우리 기록에는 「접수됨」으로 남아 **아무도 모른다** —
//   2026-10-30 브리핑이 그렇게 조용히 안 나갔다. 그래서 공지는 문자로 보낸다.
//
// ★ 한 번 나가면 **못 되돌린다.** 그래서 세 겹으로 막아 둔다.
//   ① 기본은 예행(dryRun) — 몇 명에게 갈지와 글만 돌려준다
//   ② testOnly — 원장님 번호로 **한 통만**. 글자가 안 깨졌는지 눈으로 보신 뒤에
//   ③ 진짜 보낼 때는 **받는 사람 수를 적어 넣어야** 한다(confirmCount). 명단이 바뀌면 막힌다
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'
import { sendSmsViaOps } from '@/lib/opsSms'
import { fetchOpsTeacherPhones } from '@/lib/opsTeachers'

export const maxDuration = 300

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

/** 받는 사람 — 재원생 학부모. 퇴원생(is_active=false)·휴원생(on_leave)은 뺀다. */
async function recipients() {
  const db = admin()
  const { data, error } = await db.from('students')
    .select('name, grade, parent_phone, is_active, on_leave')
    .eq('is_active', true)
  if (error) throw new Error(`명단을 읽지 못했어요: ${error.message}`)
  const by = new Map<string, { phone: string; names: string[] }>()
  for (const s of (data ?? []) as any[]) {
    if (s.on_leave) continue
    const phone = String(s.parent_phone ?? '').replace(/\D/g, '')
    if (!/^01[016-9]\d{7,8}$/.test(phone)) continue
    const hit = by.get(phone) ?? { phone, names: [] }
    hit.names.push(`${s.name}(${s.grade})`)
    by.set(phone, hit)
  }
  return [...by.values()]
}

const mask = (p: string) => p.replace(/^(\d{3})\d+(\d{4})$/, '$1****$2')

export async function POST(req: Request) {
  // 실제 요금이 나가고 학부모에게 바로 도착한다. 원장님만.
  const who = await staffOrDeny(req, { adminOnly: true })
  if (who.deny) return who.deny

  try {
    const body = (await req.json().catch(() => ({}))) as
      { text?: string; dryRun?: boolean; testOnly?: boolean; confirmCount?: number }
    const text = String(body.text ?? '').trim()
    if (!text) return NextResponse.json({ error: '보낼 글이 비어 있어요.' }, { status: 400 })
    if (text.length > 1000) return NextResponse.json({ error: `글이 너무 길어요 (${text.length}자 · 1,000자까지).` }, { status: 400 })

    const list = await recipients()
    const out: any = {
      보낼사람: list.length,
      글자수: text.length,
      종류: text.length > 90 ? 'LMS(장문)' : 'SMS(단문)',
      보기: list.slice(0, 5).map((r) => `${mask(r.phone)} · ${r.names.join(', ')}`),
      text,
    }

    // ② 원장님 번호로 한 통만
    if (body.testOnly) {
      const phones = await fetchOpsTeacherPhones()
      const mine = phones.get(who.name)
      if (!mine) return NextResponse.json({ ...out, error: `수학OPS 직원 정보에 ${who.name} 님 번호가 없어요.` }, { status: 400 })
      const r = await sendSmsViaOps({ to: mine, text, refType: 'notice_test' })
      return NextResponse.json({ ...out, 시험발송: r.ok ? `${mask(mine)} 로 한 통 보냈어요` : `실패 — ${r.error}` })
    }

    // ① 예행이 기본
    if (body.dryRun !== false) return NextResponse.json({ ...out, 예행: true })

    // ③ 받는 사람 수가 맞아야 나간다
    if (body.confirmCount !== list.length) {
      return NextResponse.json({
        ...out,
        error: `보내려면 받는 사람 수를 그대로 적어 주세요 (지금 ${list.length}명). 명단이 바뀌면 막습니다.`,
      }, { status: 400 })
    }

    let sent = 0
    const failed: string[] = []
    for (const r of list) {
      const res = await sendSmsViaOps({ to: r.phone, text, refType: 'notice' })
      if (res.ok) sent++
      else failed.push(`${mask(r.phone)} — ${res.error ?? '실패'}`)
    }
    return NextResponse.json({ ...out, 보냄: sent, 실패: failed.length, 실패목록: failed.slice(0, 20), by: who.name })
  } catch (e: any) {
    console.error('전체 공지 문자 오류:', e)
    return NextResponse.json({ error: e?.message ?? '보내지 못했어요.' }, { status: 500 })
  }
}
