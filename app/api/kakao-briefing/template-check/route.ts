/**
 * 알리고에 **실제로 승인된 템플릿**을 가져와 우리 코드의 본문과 글자 단위로 대조한다.
 *
 * 왜 필요한가
 *   알리고는 변수를 채워 주지 않는다. 우리가 만든 본문을 그대로 보내고, 그 본문이
 *   승인된 템플릿과 **일치해야** 전송된다. 안 맞으면 에러도 없이 그냥 안 간다.
 *   심사 과정에서 카카오가 문구를 고치게 하는 일이 흔한데, 그걸 모르고 발송을 걸면
 *   185명이 통째로 실패한다. 보내기 전에 여기서 확인한다.
 *
 * 키는 Vercel 환경변수에만 있고 이 라우트는 원장님만 부를 수 있다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { denyIfNotStaff } from '@/lib/apiAuth'
import {
  BRIEFING_TEMPLATE, BRIEFING_TEMPLATE_NONOTE,
  BRIEFING_TEMPLATE_V2, BRIEFING_TEMPLATE_V2_NONOTE,
  BRIEFING_TEMPLATE_V3, BRIEFING_TEMPLATE_V3_NONOTE,
} from '@/lib/briefing'
import { aligoPost } from '@/lib/aligo'
import { resolveBriefingTemplateCodes, pickCodes } from '@/lib/briefingTemplate'

export const runtime = 'nodejs'

const LIST_PATH = '/akv10/template/list/'
const APP_URL = 'https://studycheck-five.vercel.app'

/** 눈에 안 보이는 차이(줄바꿈·공백)를 드러내 보여 준다. */
function visible(s: string) {
  return s.replace(/\r/g, '␍').replace(/\n/g, '⏎\n').replace(/ +$/gm, (m) => '·'.repeat(m.length))
}

/** 두 글에서 처음으로 달라지는 자리를 찾는다. */
function firstDiff(a: string, b: string) {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? -1 : n
}

export async function GET(req: NextRequest) {
  const deny = await denyIfNotStaff(req, { adminOnly: true })
  if (deny) return deny

  const apikey = process.env.ALIGO_API_KEY
  const userid = process.env.ALIGO_USER_ID
  const senderkey = process.env.ALIGO_SENDER_KEY
  const tplCode = process.env.ALIGO_BRIEFING_TPL_CODE
  const missing = Object.entries({ ALIGO_API_KEY: apikey, ALIGO_USER_ID: userid, ALIGO_SENDER_KEY: senderkey, ALIGO_BRIEFING_TPL_CODE: tplCode })
    .filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) {
    return NextResponse.json({ ok: false, error: `Vercel 환경변수가 아직 없어요: ${missing.join(', ')}` })
  }

  try {
    // ★ Vercel 에서 알리고를 직접 부르면 IP 로 막힌다. Supabase(고정 IP)를 거친다.
    const form = new URLSearchParams({ apikey: apikey!, userid: userid!, senderkey: senderkey! })
    const json: any = await aligoPost(LIST_PATH, form.toString())
    // 알리고는 실패해도 HTTP 200 이다. code 로만 성패를 안다.
    if (!json || Number(json.code) !== 0) {
      return NextResponse.json({ ok: false, error: json?.message ?? '알리고 응답을 읽지 못했어요' })
    }

    const list: any[] = json.list ?? []
    // 실제로 보낼 때와 **같은 방법**으로 코드를 고른다 — 그래야 검사한 것이 보낼 것과 같다.
    const auto = await resolveBriefingTemplateCodes()
    const used = pickCodes(auto)

    /** 한 판을 보고, 등록된 본문·버튼이 코드와 같은지 알려 준다. */
    const inspect = (code: string | undefined, ours: string, wantBtn: [string, string][]) => {
      if (!code) return { 등록여부: '아직 Vercel 에 코드가 없습니다' }
      const t = list.find((x) => x.templtCode === code)
      if (!t) return { 등록여부: `알리고에서 ${code} 를 못 찾았습니다` }
      const registered = String(t.templtContent ?? '').replace(/\r\n/g, '\n')
      const same = registered === ours
      const at = same ? -1 : firstDiff(ours, registered)
      const got = (t.buttons ?? []).map((b: any) => [b.name, b.linkMo] as [string, string])
      const btnOk = got.length === wantBtn.length
        && wantBtn.every(([n, l], i) => got[i]?.[0] === n && got[i]?.[1] === l)
      return {
        이름: t.templtName, 코드: code,
        승인상태: t.inspStatus === 'APR' ? 'APR (승인됨)' : `${t.inspStatus} (아직 승인 전)`,
        본문일치: same,
        버튼일치: btnOk,
        버튼: { 등록됨: got, 기대: wantBtn },
        보내도되나: t.inspStatus === 'APR' && same && btnOk,
        ...(same ? {} : {
          처음_다른_자리: at,
          우리쪽: visible(ours.slice(Math.max(0, at - 20), at + 20)),
          알리고쪽: visible(registered.slice(Math.max(0, at - 20), at + 20)),
          길이: { 우리: ours.length, 알리고: registered.length },
        }),
      }
    }

    const BTN3: [string, string][] = [
      ['레벨학습지 점수 현황', `${APP_URL}/report/#{점수토큰}`],
      ['출결·과제달성률 현황', `${APP_URL}/report/#{출결토큰}`],
      ['알림장·사진 보기', `${APP_URL}/report/#{알림장토큰}`],
    ]
    const BTN2: [string, string][] = BTN3.slice(0, 2)

    const tpl = list.find((t) => t.templtCode === tplCode)
    if (!tpl) {
      return NextResponse.json({
        ok: false,
        error: `템플릿 코드 ${tplCode} 를 알리고에서 못 찾았어요.`,
        codesFound: list.map((t) => ({ code: t.templtCode, name: t.templtName, 승인: t.inspStatus })),
      })
    }

    // 알리고는 줄바꿈을 \r\n 으로 돌려준다. 우리 상수는 \n 이라 맞춰 놓고 비교한다.
    const registered = String(tpl.templtContent ?? '').replace(/\r\n/g, '\n')
    const ours = BRIEFING_TEMPLATE
    const same = registered === ours
    const at = same ? -1 : firstDiff(ours, registered)

    const wantButtons = [
      { name: '레벨학습지 점수 현황', link: `${APP_URL}/report/#{점수토큰}` },
      { name: '출결·과제달성률 현황', link: `${APP_URL}/report/#{출결토큰}` },
      { name: '알림장·사진 보기', link: `${APP_URL}/report/#{알림장토큰}` },
    ]
    const gotButtons = (tpl.buttons ?? []).map((b: any) => ({ name: b.name, link: b.linkMo }))

    return NextResponse.json({
      ok: true,
      승인상태: tpl.inspStatus,              // APR 이어야 보낼 수 있다
      사용상태: tpl.status,
      템플릿이름: tpl.templtName,
      본문일치: same,
      ...(same ? {} : {
        처음_다른_자리: at,
        우리_본문: visible(ours),
        등록된_본문: visible(registered),
        우리쪽_그자리: visible(ours.slice(Math.max(0, at - 20), at + 20)),
        알리고쪽_그자리: visible(registered.slice(Math.max(0, at - 20), at + 20)),
        길이: { 우리: ours.length, 알리고: registered.length },
      }),
      버튼: { 등록됨: gotButtons, 코드가_기대하는것: wantButtons },
      // 두 판을 나란히 — 알림장 있는 날 / 없는 날
      // ★ **실제로 보낼 때 쓰는 코드**를 본다. 환경변수만 보면 사각지대가 생긴다 —
      //   2026-10-31 에 ② 판이 「아직 Vercel 에 코드가 없습니다」로 떴는데, 정작 발송은
      //   알리고 목록에서 **자동으로 찾은** 코드로 나가고 있었다. 그 코드는 검사된 적이 없다.
      판: {
        '① 예전 판 · 알림장 있는 날': inspect(used.v1 ?? tplCode, BRIEFING_TEMPLATE, BTN3),
        '① 예전 판 · 알림장 없는 날': inspect(used.v1NoNote ?? undefined, BRIEFING_TEMPLATE_NONOTE, BTN2),
        '② 과제 성취도 판 · 알림장 있는 날': inspect(used.v2 ?? undefined, BRIEFING_TEMPLATE_V2, BTN3),
        '② 과제 성취도 판 · 알림장 없는 날': inspect(used.v2NoNote ?? undefined, BRIEFING_TEMPLATE_V2_NONOTE, BTN2),
        '③ 데일리테스트 판 · 알림장 있는 날': inspect(used.v3 ?? undefined, BRIEFING_TEMPLATE_V3, BTN3),
        '③ 데일리테스트 판 · 알림장 없는 날': inspect(used.v3NoNote ?? undefined, BRIEFING_TEMPLATE_V3_NONOTE, BTN2),
      },
      // 어디서 온 코드인지 — 「자동으로 찾음」인지 「Vercel 환경변수」인지
      코드출처: Object.fromEntries((['v1', 'v1NoNote', 'v2', 'v2NoNote', 'v3', 'v3NoNote'] as const)
        .map((k) => [k, used[k] ? (auto[k] ? `${used[k]} (알리고에서 자동으로 찾음)` : `${used[k]} (Vercel 환경변수)`) : '없음'])),
      못찾은까닭: auto.why ?? null,
      // 본문에 쓰인 변수 이름이 우리와 같은지(치환이 안 되면 #{...} 가 그대로 나간다)
      변수: {
        등록된_본문의_변수: [...new Set(registered.match(/#\{[^}]+\}/g) ?? [])],
        우리_본문의_변수: [...new Set(ours.match(/#\{[^}]+\}/g) ?? [])],
      },
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? '알리고에 연결하지 못했어요.' })
  }
}
