import { NextRequest, NextResponse } from 'next/server'
import { sendPush, type PushTarget, type PushPayload } from '@/lib/sendPush'

export async function POST(req: NextRequest) {
  try {
    const { target, payload } = (await req.json()) as { target?: PushTarget; payload?: PushPayload }
    if (!payload?.title || !payload?.body) {
      return NextResponse.json({ error: 'title/body가 필요해요.' }, { status: 400 })
    }
    const result = await sendPush(target ?? { broadcast: true }, payload)
    return NextResponse.json(result)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? '푸시 발송에 실패했어요.' }, { status: 500 })
  }
}
