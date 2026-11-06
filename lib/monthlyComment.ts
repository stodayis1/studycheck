// 월간 리포트 **한 줄 평** — 선생님 알림장을 요약해 만든다.
//
// 원장님 2026-10-24 「한달동안 써준 알림장 내용을 너가 요약정리해서」
// 원장님 2026-11-05 「2개월치면 선생님이 쓴 코멘트 내용을 요약정리해서 보내줘야 하거든」
//             그리고 「왜 수업태도는 모두다 나열되어 있는거지?」
//
// ★ 알림장을 **그대로 늘어놓지 않는다.** 두 달치면 열 건이 넘고, 학부모님은 그 벽을 안 읽으신다.
//   한 줄 평이 없으면 **요약해서 채운다** — 2026-11-05 에 모델을 Haiku 5.5 로 바꿔
//   건당 0.2원이라, 전교생을 한 번에 돌려도 20원이다(그 전에는 10원씩이라 망설였다).
// ★ 미리보기 화면과 실제 발송이 **이 함수 하나**를 같이 쓴다. 따로 두면 어긋난다.

export interface CommentSource {
  studentName: string
  studentGrade?: string | null
  months: 1 | 2
  /** 그 기간 알림장 — 날짜와 글 */
  notices: { date?: string | null; content?: string | null }[]
  /** 곁들일 숫자 (없으면 안 쓴다) */
  numbers?: {
    sessions?: number | null
    onTime?: number | null
    late?: number | null
    absent?: number | null
    hwRate?: number | null
    hwScore?: number | null
  }
  /** 알림장이 없을 때 **이것으로 쓴다** (원장님 2026-11-06) */
  records?: Records
}

/**
 * 알림장이 없을 때 쓸 **학습 기록**. (원장님 2026-11-06
 *   「한줄평이 생성이 안되는 경우는 선생님이 알림장을 안쓴거잖아. 너가 학습데이터(평가,
 *    학습지 레벨및 점수, 코어테스트, 출석률, 과제성취도 등)을 보고 정리해주면 어떨까
 *    빈곳이 있는 상태로 보내는건 좀 아닌듯」)
 *
 * ★ 모르는 값은 **넣지 않는다**(null). 0 으로 넣으면 「0점」이라고 나간다.
 */
export interface Records {
  sessions?: number | null
  onTime?: number | null
  late?: number | null
  absent?: number | null
  rate?: number | null
  hwRate?: number | null
  hwScore?: number | null
  /** 데일리테스트 점수 */
  daily?: { date?: string | null; score?: number | null }[]
  /** 이번 기간에 **오른** 단원 레벨 */
  levelUps?: { unit: string; from: number; to: number }[]
  worksheets?: { total?: number | null; passed?: number | null }
  /** 오답·쌍둥이 재도전 */
  retries?: { total?: number | null; passed?: number | null }
  videos?: { total?: number | null; completed?: number | null; avgPct?: number | null }
  /** 증명 제출 건수 (고등) */
  proofs?: number | null
  /** 그 해 코어테스트 */
  core?: { count?: number | null; avg?: number | null; best?: number | null; first?: number | null; last?: number | null }
  /** 지금 푸는 교재와 진도율 */
  books?: { name: string; pct?: number | null }[]
  booksDone?: string[]
}

const 있나 = (v: any) => v !== null && v !== undefined

/**
 * 단원 이름을 **읽을 수 있게** 다듬는다. (2026-11-06 실측)
 *   「1. 소인수 분해(소수와 합성수~최소공배수의 활용)」 → 「소인수 분해」
 *   「1. 삼각형의 성질 + 2. 사각형의 성질 + 1. 도형의 닮음」 → 「삼각형의 성질, 사각형의 성질, 도형의 닮음」
 * ★ 날것으로 주면 학부모께 가는 글에 「1. 」이며 괄호 설명이 그대로 섞인다.
 */
export function tidyUnit(name: string): string {
  // ★ 괄호를 **먼저** 떼낸다. 괄호 안에 ~ 가 들어 있어서(「소수와 합성수~최소공배수의 활용」)
  //   나중에 떼면 범위 쪼개기와 엉킨다 (2026-11-06 에 실제로 엉켰다).
  const 번호떼기 = (t: string) => t.replace(/^\s*\d+\s*[.)]\s*/, '').trim()
  return String(name ?? '').replace(/\([^)]*\)/g, ' ')
    .split('+')
    // 「1. 삼각형의 성질~2. 사각형의 성질」처럼 **범위**로 적힌 것도 번호를 뗀다
    .map((part) => part.split('~').map(번호떼기).filter(Boolean).join('~'))
    .filter(Boolean)
    .join(', ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 단원이 아닌 것(오답·유사 학습지 제목)은 레벨 줄에서 뺀다 — 재도전은 따로 센다. */
const 단원아님 = (name: string) => /오답|유사|쌍둥이|과제/.test(String(name ?? ''))

/** 기록을 **사실 줄**로 바꾼다. 여기 없는 말은 프롬프트에도 안 들어간다. */
export function recordLines(r?: Records | null): string[] {
  if (!r) return []
  const L: string[] = []
  if (있나(r.sessions) && Number(r.sessions) > 0) {
    const 조각 = [`수업 ${r.sessions}회`]
    if (있나(r.rate)) 조각.push(`출석률 ${r.rate}%`)
    if (r.late) 조각.push(`지각 ${r.late}회`)
    if (r.absent) 조각.push(`결석 ${r.absent}회`)
    L.push(`출석 — ${조각.join(' · ')}`)
  }
  if (있나(r.hwRate) || 있나(r.hwScore)) {
    const 조각 = []
    if (있나(r.hwRate)) 조각.push(`달성률 ${r.hwRate}%`)
    if (있나(r.hwScore)) 조각.push(`정확도 ${r.hwScore}%`)
    L.push(`과제 — ${조각.join(' · ')}`)
  }
  const d = (r.daily ?? []).filter((x) => 있나(x?.score))
  if (d.length) {
    const 점수 = d.map((x) => Number(x.score))
    L.push(`데일리테스트 ${d.length}회 — 평균 ${Math.round(점수.reduce((a, b) => a + b, 0) / 점수.length)}점`
      + ` (처음 ${점수[0]}점 → 마지막 ${점수[점수.length - 1]}점)`)
  }
  if (r.worksheets?.total) {
    L.push(`학습지 ${r.worksheets.total}장 중 ${r.worksheets.passed ?? 0}장 통과`)
  }
  // ★ 레벨 줄 — 이름을 다듬고, **같은 단원은 한 줄로 묶고**(가장 높은 레벨), 넷까지.
  //   학습지가 단원을 겹쳐 받으면 「삼각형의 성질~사각형의 성질」, 「삼각형의 성질」이 따로 와서
  //   같은 말이 세 줄씩 쌓인다 (2026-11-06 실측).
  //   before 가 0 이면 「0 → 3」이 아니라 **「레벨 3 도달」**이다(이번에 처음 통과한 것).
  const 묶음 = new Map<string, { name: string; from: number; to: number }>()
  for (const u of (r.levelUps ?? [])) {
    const 이름 = tidyUnit(u.unit)
    if (!이름 || 단원아님(u.unit)) continue
    const 열쇠 = 이름.split(/[,~]/)[0].trim()
    const 전 = 묶음.get(열쇠)
    if (!전 || Number(u.to) > 전.to) 묶음.set(열쇠, { name: 이름, from: Number(u.from), to: Number(u.to) })
  }
  for (const u of [...묶음.values()].slice(0, 4)) {
    L.push(u.from > 0 ? `${u.name} — 레벨 ${u.from} → ${u.to} (올랐습니다)` : `${u.name} — 레벨 ${u.to} 도달`)
  }
  if (r.retries?.total) {
    L.push(`틀린 문제 재도전 ${r.retries.total}장 중 ${r.retries.passed ?? 0}장 통과`)
  }
  if (r.core?.count) {
    const 조각 = [`${r.core.count}회`]
    if (있나(r.core.avg)) 조각.push(`평균 ${r.core.avg}점`)
    if (있나(r.core.best)) 조각.push(`최고 ${r.core.best}점`)
    if (있나(r.core.first) && 있나(r.core.last)) 조각.push(`처음 ${r.core.first}점 → 마지막 ${r.core.last}점`)
    L.push(`코어테스트(올해 누적) — ${조각.join(' · ')}`)
  }
  for (const b of (r.books ?? []).slice(0, 4)) {
    L.push(`교재 「${b.name}」 ${있나(b.pct) ? `진도 ${b.pct}%` : '진도 집계 전'}`)
  }
  const 끝낸것 = [...new Set((r.booksDone ?? []).map((b) => String(b ?? '').trim()).filter(Boolean))]
  if (끝낸것.length) L.push(`끝낸 교재 — ${끝낸것.slice(0, 4).join(', ')}`)
  if (r.videos?.total) {
    L.push(`강의 영상 ${r.videos.total}편 중 ${r.videos.completed ?? 0}편 완주`
      + (있나(r.videos.avgPct) ? ` (평균 시청률 ${r.videos.avgPct}%)` : ''))
  }
  if (r.proofs) L.push(`증명 제출 ${r.proofs}건`)
  return L
}

/**
 * 기록으로 쓸 거리가 **있나.** 수업을 한 번도 안 했으면 쓸 말이 없다 —
 * 그때는 억지로 쓰지 않고 비워 둔다(지어내는 것보다 낫다).
 */
export function hasRecordsWorthWriting(r?: Records | null): boolean {
  if (!r) return false
  if (!(Number(r.sessions ?? 0) > 0)) return false
  return recordLines(r).length >= 2      // 출석 한 줄만으로는 총평이 안 된다
}

/**
 * **학습 기록으로** 쓰는 한 줄 평. (원장님 2026-11-06)
 *
 * ★ 이건 선생님이 쓴 글이 아니다. 그러니 **선생님을 주인공으로 쓰면 안 된다** —
 *   「선생님이 짚어 주셨습니다」는 알림장에만 있을 수 있는 말이다.
 * ★ 숫자에 없는 것(아이의 마음·태도·즐거움)은 **지어내지 않는다.**
 */
export function dataPrompt(s: CommentSource): string {
  const 기간 = s.months === 2 ? '두 달' : '한 달'
  const 줄 = recordLines(s.records)
  return [
    `아래는 수학 학원 학생의 ${기간} 학습 기록입니다. 선생님이 쓴 글이 아니라 **앱에 쌓인 숫자**입니다.`,
    `이 기록을 학부모님께 보내는 ${기간} 총평으로 정리해 주세요. 3~4문장.`,
    ``,
    `지킬 것`,
    `1. **기록에 있는 사실만** 씁니다. 숫자에 없는 것(아이의 마음·태도·즐거움·집중력)은 쓰지 않습니다.`,
    `2. 선생님을 주인공으로 쓰지 마세요 — 「선생님이 짚어 주셨습니다」 같은 말은 이 기록에 없습니다.`,
    `3. 숫자를 **전부 나열하지 말고** 눈에 띄는 두세 가지로 묶어 주세요. 오른 것, 잘 된 것, 지금 하고 있는 것.`,
    `4. 다짐·당부로 끝내지 마세요. 「지도하겠습니다」, 「가정에서도 ~주시면」은 쓰지 않습니다.`,
    `   짐작하는 말(「~로 보입니다」, 「~인 듯합니다」)도 쓰지 말고 기록된 사실로 적습니다.`,
    `5. 이모지·마크다운·「사료됩니다」 같은 보고서 말투는 쓰지 않습니다. 담백한 평서문으로.`,
    ``,
    `학습 기록 ${줄.length}줄:`,
    ...줄.map((t) => `- ${t}`),
    ``,
    `학생: ${s.studentName}${s.studentGrade ? `(${s.studentGrade})` : ''}`,
  ].join('\n')
}

/**
 * 무엇으로 쓸지 고른다 — **알림장이 먼저**, 없으면 학습 기록, 둘 다 없으면 비워 둔다.
 * ★ 미리보기·발송·일괄 세 곳이 이 함수 하나를 쓴다. 따로 고르면 어긋난다.
 */
export function promptFor(s: CommentSource): { prompt: string; source: 'notes' | 'data' } | null {
  if (hasSomethingToSummarize(s)) return { prompt: commentPrompt(s), source: 'notes' }
  if (hasRecordsWorthWriting(s.records)) return { prompt: dataPrompt(s), source: 'data' }
  return null
}

/** 말투가 걸렸을 때 덧붙여 다시 시킬 말 — 무엇으로 쓴 글이냐에 따라 다르다. */
export const retryHint = (문제: string[], source: 'notes' | 'data') =>
  `\n\n방금 쓴 글에 이런 문제가 있었습니다: ${문제.join(', ')}. 그 표현을 빼고 다시 써 주세요.`
  + (source === 'notes'
    ? ` 선생님이 쓰신 글을 줄이는 것이지 새로 평가하는 글이 아닙니다.`
    : ` 기록에 있는 숫자만 쓰는 글입니다. 선생님을 주인공으로 쓰지 마세요.`)

/**
 * 쓰면 안 되는 말투 — 기계로 걸러 낸다. (원장님 2026-11-06)
 *
 *   「민수가 수학을 잘할수 있는 학생이어서 선생님께서 격려해주셨다」가 나왔다.
 *   이건 **제3자가 관찰해 정리한 글**이다. 선생님 코멘트는 **선생님이 직접 쓰신 글**을
 *   흐름에 따라 줄이는 것뿐이다 — 선생님을 남처럼 쓰면 안 된다.
 *
 * ★ 상투적인 마무리(「~하도록 지도하겠습니다」)도 안 쓴다. 알림장에 그런 말이 있으면
 *   그때만 사실대로 적는다 — 없는 다짐을 지어내지 않는다.
 */
export const BAD_TONE: { re: RegExp; why: string }[] = [
  { re: /선생님(께서|이|은|도)\s*[^.\n]{0,40}?(주셨|하셨|해\s*주|해주)/, why: '선생님을 남처럼 썼어요(3인칭)' },
  { re: /선생님의\s*(지도|격려|노력|관심)/, why: '선생님을 남처럼 썼어요(3인칭)' },
  { re: /(지도|응원|격려|노력|최선)[^.\n]{0,10}(하겠습니다|하겠어요|할 것입니다)/, why: '상투적인 마무리예요' },
  { re: /(성장할 수 있도록|함께 하겠습니다|함께하겠습니다|최선을 다하겠습니다)/, why: '상투적인 마무리예요' },
  { re: /(사료됩니다|보여집니다|관찰되었습니다|관찰됩니다|판단됩니다)/, why: '보고서 말투예요' },
  // 2026-11-06 실측 — 옛 지시로 「가정에서도 응원해 주시면 큰 힘이 될 것입니다」가 나왔다
  { re: /가정에서(도)?[^.]{0,24}(주시면|주세요|부탁)/, why: '학부모께 당부하는 상투구예요' },
  { re: /큰 힘이 (될|됩니다|되겠습니다)/, why: '학부모께 당부하는 상투구예요' },
  { re: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, why: '이모지는 안 써요' },
  { re: /(\*\*|##|^- )/m, why: '마크다운은 안 써요' },
]

/** 걸리는 말투를 찾아낸다. 비어 있으면 괜찮은 글이다. */
export function toneProblems(text: string): string[] {
  const t = String(text ?? '')
  return [...new Set(BAD_TONE.filter((b) => b.re.test(t)).map((b) => b.why))]
}

/** 한 줄 평을 만들어 달라고 할 때 쓰는 글. */
export function commentPrompt(s: CommentSource): string {
  const 기간 = s.months === 2 ? '두 달' : '한 달'
  const 알림장 = (s.notices ?? [])
    .map((n) => `(${String(n?.date ?? '').slice(5)}) ${String(n?.content ?? '').trim()}`)
    .filter((t) => t.length > 8)

  const n = s.numbers ?? {}
  const 숫자 = [
    n.sessions != null ? `수업 ${n.sessions}회` : '',
    n.onTime != null ? `정시 ${n.onTime}회` : '',
    n.late ? `지각 ${n.late}회` : '',
    n.absent ? `결석 ${n.absent}회` : '',
    n.hwRate != null ? `과제달성률 ${n.hwRate}%` : '',
    n.hwScore != null ? `과제성취도 ${n.hwScore}%` : '',
  ].filter(Boolean).join(', ')

  // ★ 「요약해 주세요」만 시키면 **제3자가 관찰해 정리한 글**이 나온다
  //   (2026-11-06 「선생님께서 격려해주셨다」). 그래서 **누가 쓴 글인지**를 먼저 못박는다.
  return [
    `아래는 수학 학원 담당 선생님이 ${기간} 동안 직접 쓰신 알림장입니다.`,
    `이 글을 학부모님께 보내는 ${기간} 총평으로 **줄여 주세요**. 3~5문장.`,
    ``,
    `지킬 것`,
    `1. **선생님이 쓰신 글을 줄이는 것**입니다. 새로 관찰해 평가하는 글이 아닙니다.`,
    `   선생님을 남처럼 쓰지 마세요 — 「선생님께서 격려해 주셨다」, 「선생님의 지도로」 같은`,
    `   3인칭 표현은 쓰지 않습니다. 선생님이 쓰신 말투와 시점을 그대로 둡니다.`,
    `2. 날짜를 하나하나 나열하지 말고 **흐름**으로 묶어 주세요 —`,
    `   무엇을 어려워했고, 무엇이 나아졌고, 지금 무엇을 하고 있는지.`,
    `3. 알림장에 **없는 말을 보태지 마세요.** 다짐·계획도 알림장에 있을 때만 그대로 씁니다.`,
    `   「앞으로 ~하도록 지도하겠습니다」 같은 마무리는 **굳이 넣지 않습니다.**`,
    `4. 선생님이 애쓰신 대목(따로 설명했다, 한 번 더 짚었다 등)이 알림장에 있으면 사실 그대로 적습니다.`,
    `5. 이모지·마크다운·「사료됩니다」 같은 보고서 말투는 쓰지 않습니다. 담백한 평서문으로.`,
    ``,
    알림장.length
      ? `선생님 알림장 ${알림장.length}건:\n${알림장.join('\n')}`
      : `알림장이 없습니다. 아래 숫자만 가지고 담백하게 두세 문장으로 써 주세요.`,
    ``,
    `학생: ${s.studentName}${s.studentGrade ? `(${s.studentGrade})` : ''}`,
    숫자 ? `참고 숫자(필요할 때만, 억지로 넣지 마세요) — ${숫자}` : '',
  ].filter((x) => x !== undefined).join('\n')
}

/** 요약할 거리가 있나 — 알림장이 한 건도 없으면 부르지 않는다(돈만 든다). */
export const hasSomethingToSummarize = (s: CommentSource) =>
  (s?.notices ?? []).some((n) => String(n?.content ?? '').trim().length > 8)

/**
 * 리포트 자료에서 **AI 에게 줄 재료**를 만든다. 알림장이 먼저, 없으면 학습 기록.
 * ★ 미리보기·발송·일괄 세 곳이 이 함수 하나를 쓴다 (따로 만들면 글이 달라진다).
 */
export function commentSourceOf(data: any, months: 1 | 2) {
  const L = data?.lessons ?? {}, H = data?.homework ?? {}, C = data?.coreSummary ?? {}
  return {
    studentName: data?.student?.name, studentGrade: data?.student?.grade,
    months, notices: data?.notices ?? [],
    numbers: {
      sessions: L.total, onTime: L.onTime, late: L.late, absent: L.absent,
      hwRate: H.achievement, hwScore: H.score,
    },
    // ★ 알림장이 없을 때 이걸로 쓴다 (원장님 2026-11-06)
    records: {
      sessions: L.total, onTime: L.onTime, late: L.late, absent: L.absent, rate: L.rate,
      hwRate: H.achievement, hwScore: H.score,
      daily: Array.isArray(data?.daily) ? data.daily : [],
      levelUps: (Array.isArray(data?.unitLevels) ? data.unitLevels : [])
        .filter((u: any) => Number(u?.level ?? 0) > Number(u?.before ?? 0))
        .map((u: any) => ({ unit: String(u.name ?? u.unit ?? ''), from: Number(u.before ?? 0), to: Number(u.level ?? 0) })),
      worksheets: data?.worksheetSummary ?? null,
      retries: data?.retrySummary ?? null,
      videos: data?.videos ?? null,
      proofs: data?.proofs ?? null,
      core: { count: C.count ?? null, avg: C.avg ?? null, best: C.best ?? null, first: C.first ?? null, last: C.last ?? null },
      books: (Array.isArray(data?.books) ? data.books : [])
        .map((b: any) => ({ name: [b?.type, b?.name].filter(Boolean).join(' ') || String(b?.name ?? ''), pct: b?.pct ?? null })),
      booksDone: Array.isArray(data?.booksDone) ? data.booksDone.map((b: any) => String(b?.name ?? b)) : [],
    },
  }
}
