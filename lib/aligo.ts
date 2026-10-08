// 알리고(Aligo) 알림톡 — https://smartsms.aligo.in/alimapi.html
//
// 솔라피와 다른 점 (여기서 사고가 난다)
//   1) ★ **변수 치환을 알리고가 해 주지 않는다.** 완성된 본문(message_1)을 그대로 보낸다.
//      대신 그 본문이 **승인된 템플릿 서식과 글자 단위로 일치**해야 한다. 안 맞으면 전송되지 않는다.
//      → 그래서 lib/briefing.ts 의 BRIEFING_TEMPLATE 하나가 "등록할 원문"이자 "보낼 본문의 틀"이다.
//   2) ★ **실패해도 HTTP 200 을 준다.** 응답 본문의 code 로만 성패를 안다(알림톡은 0 이 성공).
//      res.ok 만 보고 성공으로 치면 한 건도 안 갔는데 "발송 완료"가 찍힌다.
//   3) 버튼 링크는 보낼 때 **진짜 주소**를 넣는다(토큰 변수 치환이 없다).
//   4) testMode=Y 로 **요금 없이** 전 과정을 돌려볼 수 있다. 솔라피엔 없던 것.
//   5) 응답이 잔여 포인트(current)와 건당 단가(unit)를 준다 — 포인트 부족을 미리 알 수 있다.
//
// 한 번에 수신자 500명까지 넣을 수 있지만, 우리는 **한 사람씩** 보낸다.
// 묶어 보내면 응답이 scnt/fcnt(성공·실패 개수)만 줘서 **누가 실패했는지 알 수 없고**,
// 발송 기록(briefing_sends)을 학생별로 정확히 남길 수 없다. 하루 60건쯤이라 속도는 문제가 안 된다.

// ★ 알리고는 **등록된 고정 IP 에서만** API 를 받는다(고객센터 확인 2026-10-08).
//   Vercel 서버리스는 나가는 IP 가 매번 바뀌어 등록할 수가 없다.
//   그런데 **Supabase 는 고정이다** — 재어 보니 16.184.57.154 로 늘 같았다.
//   그래서 알리고로 나가는 마지막 한 번만 DB 의 aligo_call 함수를 거친다.
//   (본문 만들기·링크 찍기·기록은 그대로 Vercel 에서 한다)
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const SEND_PATH = '/akv10/alimtalk/send/'

export interface AligoButton {
  name: string
  linkType: 'WL' | 'AL' | 'DS' | 'BK' | 'MD' | 'AC'
  linkTypeName?: string
  linkMo?: string
  linkPc?: string
}

export interface AligoConfig {
  apiKey: string
  userId: string
  senderKey: string
  senderPhone: string
  tplCode: string
  testMode: boolean
  /** 알림톡이 안 닿는 번호에 문자로 대신 보낼지. 문자는 훨씬 비싸서 기본은 끔. */
  failover: boolean
}

export class AligoError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message)
    this.name = 'AligoError'
  }
}

/** 환경변수에서 설정을 읽는다. 빠진 것이 있으면 무엇이 빠졌는지 말해 준다. */
export function aligoConfig(): AligoConfig {
  const need = {
    apiKey: process.env.ALIGO_API_KEY,
    userId: process.env.ALIGO_USER_ID,
    senderKey: process.env.ALIGO_SENDER_KEY,
    senderPhone: process.env.ALIGO_SENDER_PHONE,
    tplCode: process.env.ALIGO_BRIEFING_TPL_CODE,
  }
  const missing = Object.entries(need).filter(([, v]) => !v).map(([k]) => k)
  if (missing.length) {
    const names: Record<string, string> = {
      apiKey: 'ALIGO_API_KEY', userId: 'ALIGO_USER_ID', senderKey: 'ALIGO_SENDER_KEY',
      senderPhone: 'ALIGO_SENDER_PHONE', tplCode: 'ALIGO_BRIEFING_TPL_CODE',
    }
    throw new AligoError(`알리고 설정값이 Vercel 에 없어요: ${missing.map((m) => names[m]).join(', ')}`)
  }
  return {
    apiKey: need.apiKey!, userId: need.userId!, senderKey: need.senderKey!,
    senderPhone: need.senderPhone!, tplCode: need.tplCode!,
    // ★ 기본이 테스트 모드다. 환경변수를 일부러 N 으로 두기 전까지는 요금도 안 나가고
    //   학부모에게도 안 간다. "설정을 안 했는데 실수로 185명에게 나갔다" 를 막는다.
    testMode: (process.env.ALIGO_TEST_MODE ?? 'Y').toUpperCase() !== 'N',
    failover: (process.env.ALIGO_FAILOVER ?? 'N').toUpperCase() === 'Y',
  }
}

const digits = (s: string) => String(s ?? '').replace(/[^0-9]/g, '')

export interface AligoSendResult {
  mid?: number
  /** 남은 포인트 */
  point?: number
  /** 건당 단가 */
  unit?: number
  testMode: boolean
}

/**
 * 알리고에 요청을 보낸다 — **Supabase(고정 IP)를 거쳐서.**
 *
 * Vercel 에서 직접 부르면 「인증되지 않는 서버 IP」 로 거부당한다.
 * DB 의 aligo_call 은 service_role 만 부를 수 있고, 보낼 수 있는 주소도
 * kakaoapi.aligo.in 으로 못박혀 있다(docs/sql/알리고_고정IP_중계.sql).
 */
export async function aligoPost(path: string, form: string): Promise<any> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new AligoError('서버 설정이 올바르지 않아요(Supabase 키 없음).')
  const db: SupabaseClient = createClient(url, key, { auth: { persistSession: false } })

  const { data, error } = await db.rpc('aligo_call', { p_path: path, p_form: form })
  if (error) throw new AligoError(`알리고 중계에 실패했어요: ${error.message}`)
  const res = data as { status: number; body: string | null; error?: string }
  if (res?.error) throw new AligoError(`알리고에 연결하지 못했어요: ${res.error}`)
  try {
    return JSON.parse(res.body ?? '')
  } catch {
    throw new AligoError(`알리고 응답을 읽지 못했어요 (HTTP ${res?.status}): ${String(res?.body).slice(0, 200)}`)
  }
}

/**
 * 알림톡 한 건을 보낸다. 실패하면 던진다(호출하는 쪽이 학생별로 기록할 수 있게).
 *
 * @param message 승인된 템플릿 서식과 **일치해야 하는** 완성된 본문
 */
export async function sendAlimtalk(cfg: AligoConfig, msg: {
  to: string
  name?: string | null
  subject: string
  message: string
  buttons?: AligoButton[]
  /** 알림톡이 안 닿을 때 문자로 보낼 내용. cfg.failover 가 켜져 있을 때만 쓰인다. */
  failoverMessage?: string
}): Promise<AligoSendResult> {
  const to = digits(msg.to)
  if (to.length < 10) throw new AligoError(`받는 번호가 이상해요: ${msg.to}`)

  const form = new URLSearchParams({
    apikey: cfg.apiKey,
    userid: cfg.userId,
    senderkey: cfg.senderKey,
    tpl_code: cfg.tplCode,
    sender: digits(cfg.senderPhone),
    receiver_1: to,
    subject_1: msg.subject.slice(0, 50),
    message_1: msg.message,
    testMode: cfg.testMode ? 'Y' : 'N',
  })
  if (msg.name) form.set('recvname_1', msg.name)
  if (msg.buttons?.length) {
    form.set('button_1', JSON.stringify({
      button: msg.buttons.map((b) => ({
        name: b.name,
        linkType: b.linkType,
        linkTypeName: b.linkTypeName ?? (b.linkType === 'WL' ? '웹링크' : undefined),
        linkMo: b.linkMo,
        linkPc: b.linkPc,
      })),
    }))
  }
  if (cfg.failover && msg.failoverMessage) {
    form.set('failover', 'Y')
    form.set('fsubject_1', msg.subject.slice(0, 40))
    form.set('fmessage_1', msg.failoverMessage)
  }

  const json = await aligoPost(SEND_PATH, form.toString())

  // ★ 여기가 핵심 — 알리고는 실패해도 HTTP 200 이다. code 로만 성패를 안다.
  if (Number(json.code) !== 0) {
    const msg = String(json.message ?? '')
    // ★ 알리고는 **등록된 IP 에서만** API 를 받는다(2026-10-08 확인).
    //   Vercel 서버리스는 나가는 IP 가 매번 바뀌어서 등록이 불가능하다.
    //   이 오류가 뜨면 코드 문제가 아니므로, 무엇을 해야 하는지 바로 알려 준다.
    if (/IP/.test(msg)) {
      throw new AligoError(
        '알리고가 이 서버의 IP 를 막았습니다. 발송은 Supabase(고정 IP)를 거쳐 나가는데, '
        + 'Supabase 가 인프라를 옮기면 그 IP 가 바뀔 수 있습니다. '
        + '아래 SQL 로 지금 IP 를 확인해 알리고 「발송 서버 IP」 에 등록해 주세요 — '
        + "select (extensions.http_get('https://api.ipify.org')).content "
        + `(알리고 원문: ${msg})`,
        Number(json.code))
    }
    throw new AligoError(msg || `알리고 오류 (code ${json.code})`, Number(json.code))
  }

  return {
    mid: json.info?.mid,
    point: json.info?.current != null ? Number(json.info.current) : undefined,
    unit: json.info?.unit != null ? Number(json.info.unit) : undefined,
    testMode: cfg.testMode,
  }
}
