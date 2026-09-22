import { NextRequest, NextResponse } from 'next/server'
import { sendPush, type PushTarget, type PushPayload } from '@/lib/sendPush'
import { denyIfNotStaff } from '@/lib/apiAuth'

export async function POST(req: NextRequest) {
  // 푸시는 학부모·학생 단말로 바로 나간다. 인증이 없으면 누구나 전체 알림을 뿌릴 수 있다.
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  try {
    const { target, payload } = (await req.json()) as { target?: PushTarget; payload?: PushPayload }
    if (!payload?.title || !payload?.body) {
      return NextResponse.json({ error: 'title/body가 필요해요.' }, { status: 400 })
    }
    // 예전에는 target이 없으면 전체 발송이었다. 실수·악용으로 전체에 나가는 걸 막기 위해 이제는 명시해야 한다.
    if (!target || (!target.broadcast && !target.studentIds?.length)) {
      return NextResponse.json(
        { error: 'target이 필요해요. 전체 발송은 { broadcast: true }를 명시해주세요.' },
        { status: 400 }
      )
    }
    const result = await sendPush(target, payload)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '푸시 발송에 실패했어요.' }, { status: 500 })
  }
}
