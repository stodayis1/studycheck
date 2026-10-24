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
// 원장님 2026-10-24: 「오글거려, 난 T야」 — 칭찬·감탄(멋있다, 정말 잘했어) 빼고 할 일만 담백하게
export const NAME_TONE_TEXT: Record<NameTone, string> = { call: '○,', soft: '○~' }
export const SOL_LINES = {
  start:  { tone: 'soft', lines: ['오늘 문제 바로 들어갈게.', '연습장이랑 연필 꺼내 두고 시작하자.', '이 문제, 조건부터 같이 보자.', '시작할게. 문제 먼저 읽어 봐.'] },
  try:    { tone: 'call', lines: ['영상 멈춰 둘게. 먼저 풀어 봐.', '풀이 보기 전에 네가 먼저 풀어 봐.', '여기서 한번 풀어 보고 다시 틀어.', '답 낸 다음에 이어서 보자.'] },
  back:   { tone: 'call', lines: ['다 풀었으면 풀이랑 맞춰 보자.', '네 풀이랑 한 줄씩 비교해 봐.', '막힌 곳이 어딘지 확인하면서 봐.'] },
  answer: { tone: 'soft', lines: ['답 맞았어? 틀렸으면 어느 줄에서 달라졌는지 봐.', '네 답이랑 같은지 확인해 봐.', '틀렸으면 풀이 한 번 더 보고 다시 풀어.', '답 확인하고 다음으로 가자.'] },
  away:   { tone: 'call', lines: ['화면 다시 보자. 이어서 할게.', '돌아왔으면 이어서 보자.', '어디까지 봤는지 확인하고 이어서 가자.'] },
  idle:   { tone: 'soft', lines: ['멈춘 지 좀 됐어. 이어서 볼까?', '아직 남았어. 마저 보자.', '다시 시작하려면 재생 눌러.'] },
  end:    { tone: 'soft', lines: ['오늘 문제는 여기까지.', '끝. 유제도 풀어 봐.', '이 유형은 끝. 다음 문제에서 보자.', '여기까지. 틀렸으면 다시 풀어 봐.'] },
  // 객관식(원장님 2026-10-24): 고른 답이 맞았는지 풀이가 끝난 뒤 알려 준다. 엉뚱한 보기를 고르면 fun
  // 말투는 담백하게 — 감정 섞인 칭찬·감탄 빼고 사실만 (원장님: 「오글거려, 난 T야」)
  right:  { tone: 'soft', lines: ['맞았어. 계산 깔끔했어.', '정답. 그대로 가면 돼.', '맞았네. 이 유형은 이제 됐다.'] },
  wrong:  { tone: 'soft', lines: ['틀렸어. 풀이랑 어디서 달라졌는지 찾아봐.', '답이 달라. 계산 한 줄씩 다시 맞춰 보자.', '틀렸어. 어느 단계에서 갈렸는지 체크해 봐.'] },
  fun:    { tone: 'soft', lines: ['그건 보기에 몰래 넣은 거야. 진짜 답 골라.', '그건 수학 답이 아니지. 다시 골라 봐.', '오케이, 그건 패스. 진짜 답은?', '장난은 여기까지. 진짜 답 골라 보자.', '그건 아니고. 다시 골라 볼까?', '그건 정답 후보가 아니야. 다시.'] },
} as const satisfies Record<string, { tone: NameTone; lines: readonly string[] }>
export type SolCallKey = keyof typeof SOL_LINES

// ── 개념·증명 영상도 이름 따로 + 문장 따로 (원장님 2026-10-24: 「매번 같은 패턴이면 애들이 지루해한다」) ──────
// 문장은 그때그때 고르고, 「어느 장면에서 부를지」도 강의마다 다르게 고른다(planLectureCalls).
// 저장 위치: name-calls/v2/line/lec_<key>/<n>.mp3 — name_calls_v2.mjs 가 이 표도 읽는다.
export const LEC_LINES = {
  start:  { tone: 'soft', lines: ['오늘 개념 시작할게.', '바로 들어갈게. 연습장 꺼내 둬.', '오늘 배울 거 먼저 보고 가자.', '교재 펴고 시작하자.', '시작할게. 오늘 개념은 이거야.', '자, 오늘 개념 들어간다.'] },
  focus:  { tone: 'call', lines: ['여기 중요해.', '이 부분 시험에 자주 나와.', '여기서부터 핵심이야.', '이건 꼭 기억해 둬.', '지금부터 나오는 거 놓치지 마.'] },
  mid:    { tone: 'soft', lines: ['여기까지 이해됐어?', '여기까지 괜찮아? 헷갈리면 한 번 더 보자.', '지금까지 내용 정리됐어?', '여기까지 따라왔어?'] },
  plus:   { tone: 'call', lines: ['여기는 한 단계 더 나간 내용이야.', '여기는 조금 어려워. 천천히 보자.', '이거 알면 문제가 쉬워져.'] },
  cheer:  { tone: 'soft', lines: ['절반 왔어. 이어서 가자.', '반 정도 했어. 남은 것도 보자.', '여기까지 왔으면 거의 다 했어.', '계속 가 보자.'] },
  check:  { tone: 'call', lines: ['영상 멈춰 둘게. 먼저 풀어 봐.', '이제 직접 풀어 봐. 다 풀면 다시 틀어.', '답 보기 전에 먼저 풀어 봐.', '연필 들고 풀어 보자.'] },
  answer: { tone: 'soft', lines: ['답 맞았어? 틀린 건 다시 풀어 봐.', '네 답이랑 같은지 확인해 봐.', '틀렸으면 어디서 달라졌는지 찾아봐.', '답 맞춰 보고 넘어가자.'] },
  proof:  { tone: 'soft', lines: ['노트 펴고 같이 써 보자.', '오늘은 직접 증명해 볼 거야. 노트 꺼내.', '한 줄씩 따라 써 보자.'] },
  away:   { tone: 'call', lines: ['화면 다시 보자. 이어서 할게.', '돌아왔으면 이어서 보자.', '어디까지 봤는지 확인하고 이어서 가자.'] },
  idle:   { tone: 'soft', lines: ['멈춘 지 좀 됐어. 이어서 볼까?', '아직 남았어. 마저 보자.', '다시 시작하려면 재생 눌러.'] },
  end:    { tone: 'soft', lines: ['오늘 개념은 여기까지.', '끝. 유형편에서 문제 풀어 봐.', '오늘 배운 거 유형편으로 확인해.', '여기까지. 다음 강의에서 보자.', '끝. 헷갈린 곳은 다시 보고 가.'] },
} as const satisfies Record<string, { tone: NameTone; lines: readonly string[] }>
export type LecCallKey = keyof typeof LEC_LINES

type Scene = { start: number; end: number; kind?: string }
/** 이 강의에서 어느 장면 앞에서 무슨 말로 부를지 — 강의(id)마다 다르게, 같은 강의는 늘 같게.
 *  늘 하는 것: 시작·끝(·개념 Check 앞 「풀어 봐」, 예제 앞 「맞았어?」). 나머지(focus·mid·plus·cheer)는 강의마다 2~3개만 골라 자리도 섞는다. */
export function planLectureCalls(seed: string, scenes: Scene[]): { key: LecCallKey; scene: number }[] {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296 }
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)]
  const idx = (k: string) => scenes.map((s, i) => (s.kind === k ? i : -1)).filter((i) => i > 0)
  const concept = idx('개념'), plus = idx('plus'), check = idx('check'), ex = idx('examples')
  const fixed: { key: LecCallKey; scene: number }[] = []
  if (check.length) fixed.push({ key: 'check', scene: check[0] })
  if (check.length && ex.length) fixed.push({ key: 'answer', scene: ex[0] })
  const used = new Set([0, ...fixed.map((x) => x.scene)])   // 0 = 시작 인사 — 바로 다음 장면(첫 개념)에서 또 부르지 않는다
  const before = check[0] ?? ex[0] ?? scenes.length
  const middle = scenes.map((_, i) => i).filter((i) => i > 1 && i < before)   // 첫 개념 다음부터 Check 전까지
  const all: { key: LecCallKey; at: number[] }[] = [
    { key: 'focus', at: concept },
    { key: 'mid', at: middle },
    { key: 'plus', at: plus },
    { key: 'cheer', at: middle },
  ]
  const options = all.filter((o) => o.at.length)
  for (let i = options.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [options[i], options[j]] = [options[j], options[i]] }
  const want = 2 + (rnd() < 0.5 ? 1 : 0)
  const extra: { key: LecCallKey; scene: number }[] = []
  for (const o of options) {
    if (extra.length >= want) break
    const free = o.at.filter((i) => !used.has(i) && !used.has(i - 1) && !used.has(i + 1))   // 연달아 부르지 않는다
    if (!free.length) continue
    const s = pick(free); used.add(s); extra.push({ key: o.key, scene: s })
  }
  return [...fixed, ...extra].sort((a, b) => a.scene - b.scene)
}

const base2 = () =>`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/name-calls/${NAME_CALL_V2}`
export const nameToneUrl = (studentId: string, tone: NameTone) => `${base2()}/name/${studentId}/${tone}.mp3`
export const solLineUrl = (key: SolCallKey, n: number) => `${base2()}/line/${key}/${n}.mp3`
export const solCallText = (key: SolCallKey, n: number, fullName: string) =>
  `${vocative(callName(fullName))}, ${SOL_LINES[key].lines[n]}`
export const lecLineUrl = (key: LecCallKey, n: number) => `${base2()}/line/lec_${key}/${n}.mp3`
export const lecCallText = (key: LecCallKey, n: number, fullName: string) =>
  `${vocative(callName(fullName))}, ${LEC_LINES[key].lines[n]}`

// ── 이름을 부르면 학생이 버튼으로 대답한다 (원장님 2026-10-21) ─────────────────────
// 누를 때까지 영상은 멈춰 있다. 대답은 video_watch_logs.call_responses 에 쌓인다 (응답 시간·무응답·스스로 맞혔는지).
// 키: 개념·증명 영상은 NameCallKey 그대로, 풀이 영상은 'sol:' + SolCallKey. 여기 없는 키(sol:back)는 대답 없이 지나간다.
export const CALL_REPLIES: Record<string, string[]> = {
  start: ['네! 준비됐어요'], important: ['네, 볼게요'], check: ['다 풀었어요'], answer: ['맞았어요', '틀렸어요'],
  proof: ['네, 펼쳤어요'], away: ['집중할게요!'], idle: ['집중할게요!'], end: ['감사합니다!'],
  'sol:start': ['네! 준비됐어요'], 'sol:try': ['다 풀었어요'], 'sol:answer': ['맞았어요', '틀렸어요'],
  'sol:away': ['집중할게요!'], 'sol:idle': ['집중할게요!'], 'sol:end': ['감사합니다!'],
  'sol:wrong': ['한 번 더 볼래요', '알겠어요'],   // 객관식 틀렸을 때 — 「한 번 더」면 풀이 처음부터
  // 개념·증명(2026-10-24~). cheer 는 대답 없이 지나간다. mid 의 「한 번 더 볼래요」는 앞 장면을 다시 튼다
  'lec:start': ['네! 준비됐어요'], 'lec:focus': ['네, 볼게요'], 'lec:mid': ['이해했어요', '한 번 더 볼래요'],
  'lec:plus': ['네, 볼게요'], 'lec:check': ['다 풀었어요'], 'lec:answer': ['맞았어요', '틀렸어요'],
  'lec:proof': ['네, 펼쳤어요'], 'lec:away': ['집중할게요!'], 'lec:idle': ['집중할게요!'], 'lec:end': ['감사합니다!'],
}
export type CallResponse = { key: string; at: number; answer: string | null; ms?: number; noanswer?: boolean; ts: string; correct?: boolean }

// ── 풀이 영상 객관식 (원장님 2026-10-24) ─────────────────────────────────────────────
// 「먼저 풀어 봐」에서 절반쯤은 「다 풀었어요」 대신 보기를 고르게 한다. 보기는 lesson_videos.quiz(정답 + 오답 3개).
// 객관식이 뜬 문제 중 3분의 1쯤은 엉뚱한 보기 하나를 섞는다(재미). 고르면 웃고 진짜 답을 다시 고르게 한다.
export type LessonQuiz = { answer: string; wrong: string[] }
export const QUIZ_RATE = 0.5, FUN_RATE = 0.35
// 엉뚱한 보기 (원장님 2026-10-24: 「수지원장님 짱, ○○ 짱, 사다리, 무지개」는 예시 — 더 다양하게). ○ = 학생 이름
const FUN_CHOICES = [
  // 이름·학원
  '수지원장님 짱', '○ 짱', '○ 천재', '○ 최고', '수학의지혜 최고', '수지쌤 안경', '수지쌤 사랑해요', '원장님 간식 사 주세요',
  // 수학 말장난
  '사다리', '무지개', '루트 떡볶이', '파이 한 조각', '무한대 곱하기 2', '삼각김밥', '원두커피', '직선으로 집에 가기',
  '내 간식의 집합', '0점 말고 100점', '공식 외우는 꿈',
  // 생활 개그
  '고양이', '치킨', '아이스크림', '오늘 저녁 메뉴', '숙제 면제권', '쉬는 시간 10분', '주말', '방학', '노래방',
  '유튜브 5분만', '잠 10분 더', '내일의 나에게 맡김', '정답은 마음속에', '연필 굴리기', '눈 감고 찍기',
  '엄마한테 물어볼게요', '이 문제 너무 쉬워요', '선생님이 알려 주세요', '모르겠다 그냥 찍자',
]
export type QuizChoice = { text: string; fun?: boolean; right?: boolean }
export function buildQuiz(q: LessonQuiz, fullName: string, rnd = Math.random): QuizChoice[] {
  const xs: QuizChoice[] = [{ text: q.answer, right: true }, ...q.wrong.slice(0, 3).map((t) => ({ text: t }))]
  // 엉뚱한 보기: 가끔 하나, 더 가끔 둘 (같은 것은 안 겹치게)
  const nFun = rnd() < FUN_RATE ? (rnd() < 0.3 ? 2 : 1) : 0
  const pool = [...FUN_CHOICES]
  for (let k = 0; k < nFun; k++) {
    const t = pool.splice(Math.floor(rnd() * pool.length), 1)[0]
    xs.push({ text: t.replace('○', callName(fullName) || '나'), fun: true })
  }
  for (let i = xs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [xs[i], xs[j]] = [xs[j], xs[i]] }
  return xs
}
export const CIRCLED = ['①', '②', '③', '④', '⑤', '⑥']

/** 선생님 화면 요약: 대답 몇 번 중 몇 번, 평균 응답 초, 무응답, 스스로 맞힘 */
export function summarizeResponses(rs: CallResponse[] | null | undefined) {
  const list = rs ?? []
  const answered = list.filter((r) => r.answer)
  const asked = new Set(list.map((r) => r.key + '@' + r.at)).size
  const ms = answered.map((r) => r.ms ?? 0).filter((x) => x > 0)
  const graded = answered.filter((r) => r.key.endsWith('answer') || r.key === 'sol:quiz')   // quiz = 객관식(앱이 채점)
  return {
    asked, answered: answered.length, noanswer: list.filter((r) => r.noanswer).length,
    avgSec: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length / 100) / 10 : null,
    selfRight: graded.filter((r) => r.answer === '맞았어요' || r.correct === true).length, selfGraded: graded.length,
  }
}
