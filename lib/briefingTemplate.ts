// 「어느 템플릿으로 보낼지」를 **알리고에 물어서** 정한다.
//
// 왜 이게 필요한가 (원장님 2026-10-19)
//   「과제달성률 밑에 "지난 학습지"가 과제 성취도로 바꾸기로 했는데 안바꼈네?」
//   「지난 학습지가 나가면 안돼. 그래서 우리 템플릿을 바꾸기로 하지 않았었나?」
//
//   바꿔 놓긴 했다. 새 판(「▶ 과제 성취도」)을 알리고에 등록해 **승인까지 받았다.**
//   그런데 그 판으로 보내려면 **템플릿 코드를 Vercel 환경변수에 손으로 넣어야** 했다.
//   그 한 걸음이 빠져서, 승인된 새 판을 두고도 **예전 판 그대로** 나가고 있었다.
//   아무 에러도 안 난다 — 그냥 조용히 옛 글이 나간다.
//   사람이 기억해야 하는 단계는 언젠가 빠진다. 그래서 그 단계를 없앤다.
//
// 어떻게 — 알리고에 등록된 템플릿 목록을 받아, 우리 원문과 **글자 단위로 같고 승인된** 것을
//   찾는다. 그게 곧 「이 본문으로 보내면 통과하는 템플릿」이다. 우리가 쓰는 판정과 알리고가
//   쓰는 판정이 같아지므로, 코드를 손으로 적어 넣을 때보다 **오히려 더 안전하다.**
//
// ★ 버튼은 **보기만 하고 막지는 않는다.**
//   알리고 목록 API 가 버튼을 안 돌려줄 수도 있는데, 그걸 모르고 「버튼이 다르다」고 막으면
//   승인된 판을 두고도 **영영 예전 판으로** 나간다. 예전 환경변수 방식은 버튼을 아예 안 봤으니
//   지금도 그때보다는 엄격하다. 달라 보이면 why 에 적어 원장님 화면에 알려 준다.
//
// 못 찾으면 null 을 돌려주고, 부르는 쪽이 예전처럼 환경변수로 떨어진다.
import {
  BRIEFING_TEMPLATE, BRIEFING_TEMPLATE_NONOTE,
  BRIEFING_TEMPLATE_V2, BRIEFING_TEMPLATE_V2_NONOTE,
  BRIEFING_TEMPLATE_V3, BRIEFING_TEMPLATE_V3_NONOTE,
} from './briefing'
import { aligoPost } from './aligo'

const LIST_PATH = '/akv10/template/list/'
const APP_URL = 'https://studycheck-five.vercel.app'

/** 알림장 있는 판의 버튼 3개 — 템플릿에 등록된 그대로. */
const BTN3: [string, string][] = [
  ['레벨학습지 점수 현황', `${APP_URL}/report/#{점수토큰}`],
  ['출결·과제달성률 현황', `${APP_URL}/report/#{출결토큰}`],
  ['알림장·사진 보기', `${APP_URL}/report/#{알림장토큰}`],
]
/** 알림장 없는 판은 「알림장·사진 보기」가 없다. */
const BTN2: [string, string][] = BTN3.slice(0, 2)

export interface BriefingTemplateCodes {
  v1: string | null; v1NoNote: string | null
  v2: string | null; v2NoNote: string | null
  v3: string | null; v3NoNote: string | null
  /** 못 물어봤으면 그 까닭 (목록을 못 받았을 때). 그때는 전부 null 이다. */
  note?: string
  /** 판마다 **왜 못 골랐는지** — 「안 바뀌네?」를 화면에서 바로 알 수 있게. */
  why?: Record<string, string>
}

const EMPTY: BriefingTemplateCodes = {
  v1: null, v1NoNote: null, v2: null, v2NoNote: null, v3: null, v3NoNote: null,
}

/** 띄어쓰기·줄바꿈 차이만 빼고 같은가 — 「거의 같은데 왜 안 잡히지」를 짚어 주려고 쓴다. */
const loose = (x: string) => x.replace(/\s+/g, ' ').trim()

/**
 * 한 번 물어본 답을 **잠깐 들고 있는다.** 발송 한 번에 학생마다 묻지 않으려는 것이다.
 * 승인 상태가 하루에 몇 번씩 바뀌지도 않으니 5분이면 넉넉하다.
 */
let cache: { at: number; codes: BriefingTemplateCodes } | null = null
const CACHE_MS = 5 * 60 * 1000

export async function resolveBriefingTemplateCodes(): Promise<BriefingTemplateCodes> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.codes

  const apikey = process.env.ALIGO_API_KEY
  const userid = process.env.ALIGO_USER_ID
  const senderkey = process.env.ALIGO_SENDER_KEY
  if (!apikey || !userid || !senderkey) {
    return { ...EMPTY, note: '알리고 설정값이 아직 없어요.' }
  }

  try {
    const form = new URLSearchParams({ apikey, userid, senderkey })
    const json: any = await aligoPost(LIST_PATH, form.toString())
    // ★ 알리고는 실패해도 HTTP 200 이다. code 로만 성패를 안다.
    if (!json || Number(json.code) !== 0) {
      return { ...EMPTY, note: json?.message ?? '알리고 응답을 읽지 못했어요.' }
    }
    const list: any[] = json.list ?? []
    const why: Record<string, string> = {}
    // 알리고는 줄바꿈을 \r\n 으로 돌려준다. 우리 상수는 \n 이라 맞춰 놓고 본다.
    const body = (t: any) => String(t.templtContent ?? '').replace(/\r\n/g, '\n')

    /** 이 본문으로 **보내면 통과하는** 템플릿 코드. 없으면 null 이고 까닭을 why 에 남긴다. */
    const find = (key: string, ours: string, wantBtn: [string, string][]) => {
      const same = list.filter((t) => body(t) === ours)
      const apr = same.find((t) => t.inspStatus === 'APR')
      if (apr) {
        const got = (apr.buttons ?? []).map((b: any) => [b.name, b.linkMo] as [string, string])
        if (got.length && (got.length !== wantBtn.length
            || !wantBtn.every(([n, l], i) => got[i]?.[0] === n && got[i]?.[1] === l))) {
          why[key] = `쓰고는 있지만 버튼이 등록된 것과 달라 보여요 (등록 ${got.length}개 / 우리 ${wantBtn.length}개)`
        }
        return String(apr.templtCode)
      }
      if (same.length) {
        why[key] = `본문은 같은데 아직 승인 전이에요 (${same[0].inspStatus})`
        return null
      }
      const near = list.find((t) => loose(body(t)) === loose(ours))
      if (near) {
        why[key] = near.inspStatus === 'APR'
          ? '승인된 판이 있는데 띄어쓰기·줄바꿈이 우리 원문과 달라요 — 「템플릿 대조」로 어디가 다른지 보세요'
          : `띄어쓰기만 다른 판이 있는데 아직 승인 전이에요 (${near.inspStatus})`
        return null
      }
      why[key] = '알리고에 이 원문으로 등록된 템플릿이 없어요'
      return null
    }

    const codes: BriefingTemplateCodes = {
      v1: find('v1', BRIEFING_TEMPLATE, BTN3),
      v1NoNote: find('v1NoNote', BRIEFING_TEMPLATE_NONOTE, BTN2),
      v2: find('v2', BRIEFING_TEMPLATE_V2, BTN3),
      v2NoNote: find('v2NoNote', BRIEFING_TEMPLATE_V2_NONOTE, BTN2),
      v3: find('v3', BRIEFING_TEMPLATE_V3, BTN3),
      v3NoNote: find('v3NoNote', BRIEFING_TEMPLATE_V3_NONOTE, BTN2),
      why,
    }
    cache = { at: Date.now(), codes }
    return codes
  } catch (e: any) {
    return { ...EMPTY, note: e?.message ?? '알리고에 연결하지 못했어요.' }
  }
}

/**
 * 실제로 쓸 코드 — **알리고에서 찾은 것이 먼저**, 없으면 환경변수.
 *
 * 왜 찾은 것이 먼저인가 — 환경변수는 사람이 적어 넣은 글자라 틀릴 수 있고, 틀리면
 * 에러도 없이 그냥 안 나간다. 찾은 것은 「승인 + 본문 일치」를 통과한 것이다.
 */
export function pickCodes(auto: BriefingTemplateCodes) {
  const env = (k: string) => process.env[k] || null
  return {
    v1: auto.v1 ?? env('ALIGO_BRIEFING_TPL_CODE'),
    v1NoNote: auto.v1NoNote ?? env('ALIGO_BRIEFING_TPL_CODE_NONOTE'),
    v2: auto.v2 ?? env('ALIGO_BRIEFING_TPL_CODE_V2'),
    v2NoNote: auto.v2NoNote ?? env('ALIGO_BRIEFING_TPL_CODE_V2_NONOTE'),
    v3: auto.v3 ?? env('ALIGO_BRIEFING_TPL_CODE_V3'),
    v3NoNote: auto.v3NoNote ?? env('ALIGO_BRIEFING_TPL_CODE_V3_NONOTE'),
  }
}
