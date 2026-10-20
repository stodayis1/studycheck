// 학생 이름 부르기 — 원장님 목소리로 미리 만든 짧은 말(scripts/lesson-video/name_calls.mjs)
// Storage: name-calls/v1/<student_id>/<key>.mp3 (공개 버킷, 문장 글자만 ElevenLabs 로 보냄 — 원장님 허락 2026-10-20)

export const NAME_CALL_VERSION = 'v1'

// 문장은 name_calls.mjs 의 LINES 와 같아야 한다 (말풍선에 같은 글자를 띄운다)
export const NAME_CALL_LINES = {
  start: '○, 오늘도 같이 해 보자!',
  important: '○, 여기 중요해. 잘 봐.',
  check: '○, 영상 멈추고 연습장에 풀어 봐.',
  answer: '○, 다 맞혔어? 틀린 건 꼭 다시 풀어.',
  proof: '○, 노트 펴고 같이 써야지.',
  away: '○, 어디 갔어? 다시 화면 봐.',
  idle: '○, 졸지 말고~',
  end: '○, 오늘도 수고했어!',
} as const
export type NameCallKey = keyof typeof NAME_CALL_LINES

const OVERRIDE: Record<string, string> = { '호킨슨제레미': '제레미', '호킨슨루시리': '루시리' }
const DOUBLE_SURNAME = ['남궁', '제갈', '선우', '황보', '독고', '사공', '서문']

/** 부를 이름: 성을 뺀다(세 글자 → 뒤 두 글자). 두 글자는 그대로, 숫자·영문은 뗀다 */
export function callName(full: string): string {
  const raw = (full || '').replace(/[^가-힣]/g, '')
  if (OVERRIDE[raw]) return OVERRIDE[raw]
  if (raw.length <= 2) return raw
  if (raw.length >= 4 && DOUBLE_SURNAME.includes(raw.slice(0, 2))) return raw.slice(2)
  return raw.slice(1)
}

/** 받침 있으면 「아」, 없으면 「야」 */
export function vocative(name: string): string {
  const c = name.charCodeAt(name.length - 1) - 0xac00
  return name + (c >= 0 && c < 11172 && c % 28 !== 0 ? '아' : '야')
}

export const nameCallText = (key: NameCallKey, fullName: string) => NAME_CALL_LINES[key].replace('○', vocative(callName(fullName)))

export const nameCallUrl = (studentId: string, key: NameCallKey) =>
  `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/name-calls/${NAME_CALL_VERSION}/${studentId}/${key}.mp3`
