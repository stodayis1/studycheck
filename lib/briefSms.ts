/**
 * 학부모 브리핑을 **알림톡 대신 문자로** 보내는 길.
 *
 * 왜 (원장님 2026-11-19)
 *   최온유(초3) 학부모님 번호를 카카오가 **스팸으로 막아** 알림톡이 계속 거절된다
 *   (11/17 브리핑 1건 + 11/18 재발송 2건 모두 「스팸」). 몇 번을 다시 보내도 같다.
 *   그래서 그 학생만 **문자로** 보낸다 — 원장님 「오늘 수업부터 문자로 발송하면 됨」.
 *
 * ★ 글은 알림톡과 **똑같이** 만든다(`lib/briefing.ts` 의 buildBriefing). 다른 점은 하나,
 *   문자에는 **버튼이 없어서** 링크를 글 끝에 적는다는 것이다.
 * ★ 문자는 2000바이트가 한 통이다. 넘으면 뒤가 잘리거나 두 통으로 쪼개져 요금이 는다.
 *   그래서 **넘으면 링크를 뒤에서부터 뺀다** — 본문이 먼저다. 잘라 내지는 않는다.
 */

/** 한 통에 들어가는 바이트 (LMS). */
export const SMS_MAX_BYTES = 2000

export interface BriefLink { name: string; url: string }

export interface BriefSmsResult {
  text: string
  bytes: number
  /** 자리가 모자라 뺀 링크 수 */
  dropped: number
  /** 본문만으로도 한 통을 넘는다 — 두 통으로 나가거나 잘릴 수 있다 */
  tooLong: boolean
}

const bytes = (s: string) => Buffer.byteLength(s, 'utf8')

/**
 * 보낼 글을 만든다. 본문 + 「자세히 보기」 링크들.
 *
 * ★ 링크를 **뒤에서부터** 뺀다. 앞에 오는 점수 링크가 학부모님이 제일 많이 누르는 것이다.
 */
export function briefSmsText(a: { body: string; links?: BriefLink[] }): BriefSmsResult {
  const body = String(a.body ?? '').trim()
  const links = (a.links ?? []).filter((l) => l?.name && l?.url)
  let dropped = 0
  for (let n = links.length; ; n--) {
    const 쓸링크 = links.slice(0, n)
    const 꼬리 = 쓸링크.length
      ? '\n\n▶ 자세히 보기\n' + 쓸링크.map((l) => `· ${l.name}\n  ${l.url}`).join('\n')
      : ''
    const text = body + 꼬리
    const b = bytes(text)
    if (b <= SMS_MAX_BYTES || n === 0) {
      return { text, bytes: b, dropped, tooLong: b > SMS_MAX_BYTES }
    }
    dropped++
  }
}

/**
 * 이 학생은 어느 길로 보내나.
 *
 * `students.brief_by_sms` 가 켜져 있으면 문자다. 칸이 없거나(SQL 전) 비어 있으면
 * 지금까지처럼 알림톡이다 — **모르면 바꾸지 않는** 쪽으로 기운다.
 */
export function briefChannelOf(s: { brief_by_sms?: boolean | null } | null | undefined): 'sms' | 'alimtalk' {
  return s?.brief_by_sms === true ? 'sms' : 'alimtalk'
}
