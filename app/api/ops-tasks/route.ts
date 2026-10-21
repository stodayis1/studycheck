/**
 * 내 업무메모·전달사항을 **수학OPS 에서 읽어 온다.**
 *
 * 왜 필요한가
 *   업무지시와 전달사항은 OPS 에 쌓이는데, 선생님들은 하루 대부분을 스터디체크에서 보낸다.
 *   OPS 강사 화면 구석의 작은 표시로는 못 보고 지나간다(원장님 2026-10-21).
 *   그래서 스터디체크 대시보드에서도 같은 내용을 보여 준다.
 *
 * 두 DB 는 분리돼 있다. OPS 서비스롤로 **읽기만** 한다(쓰기는 OPS 에서).
 * 사람을 잇는 열쇠는 **이름**이다 — 같은 이름이 둘이면 누구 것인지 알 수 없으니 그냥 비워 보낸다.
 * 남의 업무가 보이는 것보다 안 보이는 쪽이 낫다.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { staffOrDeny } from '@/lib/apiAuth'

export const runtime = 'nodejs'

function opsClient() {
  const url = process.env.OPS_SUPABASE_URL
  const key = process.env.OPS_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function GET(req: Request) {
  const who = await staffOrDeny(req)
  if (who.deny) return who.deny

  const ops = opsClient()
  // OPS 를 못 읽어도 대시보드는 그대로 떠야 한다 — 빈 결과로 조용히 넘어간다.
  if (!ops || !who.name) return NextResponse.json({ ok: true, instructions: [], notes: [] })

  const { data: profiles } = await ops
    .from('profiles').select('id, name, active').eq('name', who.name).eq('active', true)
  if (!profiles || profiles.length !== 1) {
    return NextResponse.json({ ok: true, instructions: [], notes: [], reason: '이름이 맞는 OPS 계정이 하나가 아니에요' })
  }
  const opsId = profiles[0].id

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [{ data: instructions }, { data: notes }] = await Promise.all([
    ops.from('work_instructions')
      .select('id, title, category, content, due_date, status, created_at')
      .eq('assigned_to', opsId).in('status', ['assigned', 'in_progress'])
      .order('due_date', { nullsFirst: false }),
    ops.from('staff_notes')
      .select('id, content, note_date')
      .eq('assigned_to', opsId).is('done_at', null).lte('note_date', today)
      .order('note_date'),
  ])

  // 체크리스트 진행 상황 — 「3/12」처럼 보여 주려고 센다
  const ids = (instructions ?? []).map((i: any) => i.id)
  let doneBy: Record<string, { done: number; total: number; items: { title: string; completed: boolean }[] }> = {}
  if (ids.length) {
    const { data: items } = await ops
      .from('instruction_checklist_items')
      .select('instruction_id, title, completed, sort_order')
      .in('instruction_id', ids).order('sort_order')
    for (const it of items ?? []) {
      const k = (it as any).instruction_id
      doneBy[k] = doneBy[k] ?? { done: 0, total: 0, items: [] }
      doneBy[k].total++
      if ((it as any).completed) doneBy[k].done++
      // 적어 둔 **순서 그대로** 보낸다 — 날짜순으로 할 일을 적어두기 때문에 순서가 곧 안내다
      doneBy[k].items.push({ title: (it as any).title, completed: (it as any).completed })
    }
  }

  return NextResponse.json({
    ok: true,
    instructions: (instructions ?? []).map((i: any) => ({ ...i, checklist: doneBy[i.id] ?? { done: 0, total: 0, items: [] } })),
    notes: notes ?? [],
  })
}
