/**
 * 지금 학부모 브리핑이 **어느 판으로 나가는지**만 알려준다.
 *
 * 왜 필요한가 (원장님 2026-10-19)
 *   「학습일지를 입력하면서 옆에 학습브리핑에 어떻게 나갈지 띄워주면 어때?」
 *   미리보기를 선생님 화면에서 그려 주려면 lib/briefing.ts 를 브라우저에서 돌리면 된다
 *   (순수 함수다). 그런데 **어느 판을 쓰는지**는 Vercel 환경변수에 있어 브라우저가 모른다.
 *   그 값만 돌려준다. 템플릿 코드 자체는 **주지 않는다** — 알 필요가 없다.
 *
 * 값이 틀리면 미리보기가 실제와 다른 판으로 그려진다. 그래서 발송 코드
 * (app/api/kakao-briefing/route.ts)와 **같은 환경변수를 같은 방식으로** 본다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { denyIfNotStaff } from '@/lib/apiAuth'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const deny = await denyIfNotStaff(req)
  if (deny) return deny

  const v2 = !!process.env.ALIGO_BRIEFING_TPL_CODE_V2
  const v3 = !!process.env.ALIGO_BRIEFING_TPL_CODE_V3
  return NextResponse.json({
    useV2: v2,
    useV3: v3,
    // 「알림장 없는 판」은 **지금 쓰는 판에 맞는 코드가 있을 때만** 쓴다 — 발송 코드와 같은 규칙.
    noNoteTemplate: v2
      ? !!process.env.ALIGO_BRIEFING_TPL_CODE_V2_NONOTE
      : !!process.env.ALIGO_BRIEFING_TPL_CODE_NONOTE,
    noNoteTemplateV3: !!process.env.ALIGO_BRIEFING_TPL_CODE_V3_NONOTE,
  })
}
