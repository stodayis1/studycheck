// 알리고에 **실제 전송 결과**를 물어본다 — 원장님이 아무 때나 누를 수 있게 (2026-11-17).
//
// 왜 필요한가 (원장님 2026-11-17 「알리고에 전송 실패건은 안보이는데? 누구지?」)
//   밤 점검이 거절을 잡아 이름까지 문자로 알려 주고 대시보드 띠에도 띄운다.
//   그런데 그건 **점검이 돈 뒤**의 일이다 — 궁금한 그때는 알 수 없고, 그날 점검이 돌기 전이나
//   점검 뒤에 나간 발송은 다음 점검까지 기다려야 한다. 2026-11-17 밤에 실제로 그랬다
//   (21:30 점검이 「1건 — 스팸」을 잡았지만 그 기록에는 이름이 없었다 — 이름을 붙이는 고침이
//    그 뒤에 배포됐기 때문이다. 그래서 원장님이 누구인지 아실 길이 없었다).
//
//   알리고 화면에서도 눈에 잘 안 띈다. **접수는 성공**이고 카카오가 그 뒤에 거절한 것이라서다.
//
// 무엇을 하나
//   그 기간에 실제로 나간 건의 성공·실패를 묶음 상세까지 받아, 거절된 건을 **한 줄씩**
//   「누구 · 사유 · 시각」으로 돌려준다. 이름은 `phoneNames`(lib/cronBriefing.ts)로 붙인다 —
//   점검 문자와 **같은 함수**다. 두 곳이 다른 이름을 말하면 안 된다.
//
// ★ 읽기만 한다. 아무것도 보내지 않고 아무것도 고치지 않는다.
// ★ 원장 전용. 학부모 이름·번호가 나가는 길이므로 강사에게도 열지 않는다.
// ★ 번호는 **가린 채로** 내보낸다(`maskPhone`). 뒤 4자리는 남긴다 — 원장님이 알아보셔야 한다.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { denyIfNotStaff } from '@/lib/apiAuth'
import { aligoPost } from '@/lib/aligo'
import { fetchAligoRows, summarize, maskPhone, phoneKey } from '@/lib/aligoResults'
import { phoneNames } from '@/lib/cronBriefing'

/** 한국 기준 날짜 (today+n) */
const kstDate = (n = 0) =>
  new Date(Date.now() + 9 * 3600_000 + n * 86400_000).toISOString().slice(0, 10)

/** 알리고 부르개. 열쇠는 환경변수에서만 읽고 어디에도 찍지 않는다. */
async function aligoCall(path: string, params: Record<string, string>) {
  const apikey = process.env.ALIGO_API_KEY
  const userid = process.env.ALIGO_USER_ID
  if (!apikey || !userid) throw new Error('알리고 설정값이 Vercel 에 없어요 (ALIGO_API_KEY · ALIGO_USER_ID)')
  return aligoPost(path, new URLSearchParams({ apikey, userid, ...params }).toString())
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: Request) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  const q = new URL(req.url).searchParams
  const to = YMD.test(q.get('to') ?? '') ? q.get('to')! : kstDate(0)
  const from = YMD.test(q.get('from') ?? '') ? q.get('from')! : kstDate(-1)
  if (from > to) return NextResponse.json({ error: '시작일이 끝일보다 늦어요.' }, { status: 400 })
  // ★ 기간을 막는다. 넓게 물으면 묶음이 수천 개가 되고 함수가 60초를 넘겨 **통째로** 실패한다.
  const 일수 = Math.round((Date.parse(to) - Date.parse(from)) / 86400_000) + 1
  if (일수 > 7) return NextResponse.json({ error: '한 번에 7일까지만 볼 수 있어요.' }, { status: 400 })

  try {
    const 줄들 = await fetchAligoRows(aligoCall, from, to)
    const 결과 = summarize(줄들)

    // 이름은 거절이 있을 때만 찾는다 — 성공만 있으면 학생 표를 읽지도 않는다.
    const 거절줄 = 줄들.filter((r) => r.rslt !== '0')
    const 이름표 = 거절줄.length
      ? await phoneNames(createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } }))
        .catch(() => new Map<string, string>())
      : new Map<string, string>()

    return NextResponse.json({
      기간: `${from} ~ ${to}`,
      본것: 결과.전체, 성공: 결과.성공, 실패: 결과.실패, 사유: 결과.사유별,
      거절: 거절줄
        .sort((a, b) => String(a.when).localeCompare(String(b.when)))
        .map((r) => ({
          누구: 이름표.get(phoneKey(r.phone)) ?? '',
          번호: maskPhone(r.phone), 사유: r.msg || '(사유 없음)', 시각: r.when, 판: r.tpl,
        })),
      // 400묶음에서 끊었다면 알려 준다 — 「0건」 과 「거기까지만 봤다」 를 섞으면 안 된다.
      끊겼을수있음: 결과.전체 >= 400 || undefined,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? '알리고에 물어보지 못했어요.' }, { status: 502 })
  }
}
