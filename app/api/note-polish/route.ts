// 그날 수업일지의 오타를 잡고 문장을 다듬는다 — 고치지는 않고 「이렇게 바꿀까요」를 내놓는다.
//
// 자동 발송(밤 8시·다음 날 오전 11시)은 같은 함수를 쓰되, 기계 검사(lib/polishGuard)를
// 통과한 것만 반영한다. 이 화면에서는 원장님이 **직접 보시고** 고르므로 통과 못 한 것도
// 고를 수 있다 — 사람이 보면 판단할 수 있기 때문이다.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { collectPolishTargets, proposePolish, applyPolish } from '@/lib/notePolish'

function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}
function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } })
}

export async function POST(req: NextRequest) {
  // 선생님 글을 바꾸는 일이다. 원장님만.
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  try {
    const body = (await req.json().catch(() => ({}))) as {
      date?: string
      apply?: { id: string; kind: 'progress' | 'notice'; after: string }[]
    }
    const date = body.date ?? kstToday()
    const sc = db()

    if (body.apply?.length) {
      const done = await applyPolish(sc, body.apply)
      return NextResponse.json({ applied: done.filter((d) => d.ok).length, done })
    }

    const targets = await collectPolishTargets(sc, date)
    if (!targets.length) return NextResponse.json({ date, items: [], note: '점검할 글이 없어요.' })

    const { items, failed, checked, truncated } = await proposePolish(targets)
    if (!items.length && failed.length) {
      return NextResponse.json({ error: `AI 점검에 실패했어요: ${failed[0]}` }, { status: 500 })
    }
    return NextResponse.json({
      date, checked, items, truncated,
      partialError: failed.length ? `${failed.length}묶음은 못 봤어요 — ${failed[0]}` : undefined,
      note: items.length === 0 ? `${checked}건을 봤는데 고칠 것이 없어요.` : undefined,
    })
  } catch (e: any) {
    console.error('수업일지 점검 오류:', e)
    return NextResponse.json({ error: e?.message ?? '점검하지 못했어요.' }, { status: 500 })
  }
}
