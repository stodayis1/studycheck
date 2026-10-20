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

// ── 풀이 영상(대표예제)용: 이름 따로 + 문장 따로 (원장님 2026-10-20) ─────────────────────
// 학생마다 이름만 세 가지 말투로 만들고(name-calls/v2/name/<id>/<tone>.mp3), 문장은 모두가 같이 쓴다
// (name-calls/v2/line/<key>/<n>.mp3). 그때그때 문장을 골라 「이름 → 0.12초 → 문장」으로 이어 튼다.
// 문장은 scripts/lesson-video/name_calls_v2.mjs 가 이 표를 읽어 만든다 — 문장을 바꾸면 NAME_CALL_V2 를 올린다.
export const NAME_CALL_V2 = 'v2'
export type NameTone = 'call' | 'soft'
// 원장님 2026-10-20: 「좀 더 부드럽게」 — 세게 부르는 말투는 빼고, 문장도 권하는 말로
export const NAME_TONE_TEXT: Record<NameTone, string> = { call: '○,', soft: '○~' }
export const SOL_LINES = {
  start:  { tone: 'soft', lines: ['오늘 문제도 같이 천천히 풀어 보자.', '연습장이랑 연필 준비됐지?', '이 문제 금방 끝나, 같이 보자.', '오늘도 차근차근 같이 해 보자.'] },
  try:    { tone: 'call', lines: ['영상 잠깐 멈춰 둘게. 먼저 혼자 한번 풀어 볼까?', '바로 보지 말고 네가 먼저 한번 풀어 봐.', '연필 들고 먼저 풀어 보자. 기다릴게.', '천천히 고민해 보고 다 되면 다시 틀어 줘.'] },
  back:   { tone: 'call', lines: ['다 풀었어? 이제 같이 맞춰 보자.', '어디까지 풀었는지 같이 확인해 보자.', '막혔던 곳 있으면 잘 봐 둬.'] },
  answer: { tone: 'soft', lines: ['답 맞았어? 틀렸으면 어디서 틀렸는지 한번 봐 줘.', '맞았으면 정말 잘했어.', '틀렸어도 괜찮아. 풀이 한 번 더 보면 돼.', '네 답이랑 똑같이 나왔어?'] },
  away:   { tone: 'call', lines: ['어디 갔었어? 다시 화면 봐 줄래?', '다시 돌아왔지? 이어서 같이 보자.', '조금만 더 집중해 보자.'] },
  idle:   { tone: 'soft', lines: ['혹시 졸려? 조금만 더 힘내 보자.', '멈춰 뒀네. 다시 이어서 볼까?', '아직 조금 남았어. 마저 보자.'] },
  end:    { tone: 'soft', lines: ['오늘도 정말 수고했어.', '잘했어. 유제도 꼭 풀어 봐.', '끝까지 봤구나, 멋있다.', '오늘도 잘했어. 다음 문제에서 보자.'] },
} as const satisfies Record<string, { tone: NameTone; lines: readonly string[] }>
export type SolCallKey = keyof typeof SOL_LINES

const base2 = () => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/name-calls/${NAME_CALL_V2}`
export const nameToneUrl = (studentId: string, tone: NameTone) => `${base2()}/name/${studentId}/${tone}.mp3`
export const solLineUrl = (key: SolCallKey, n: number) => `${base2()}/line/${key}/${n}.mp3`
export const solCallText = (key: SolCallKey, n: number, fullName: string) =>
  `${vocative(callName(fullName))}, ${SOL_LINES[key].lines[n]}`
