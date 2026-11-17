// 학교 기출 PDF(한글에서 변환한 것)를 브라우저에서 문항별 그림으로 자른다 (200dpi).
// scripts/exam-paper/crop.py 를 그대로 옮긴 것 — 규칙을 바꾸면 두 곳을 같이 고칠 것.
//
// 한글 작업 파일은 2단 편집이고, 문항마다 맨 앞 줄에 작은 미주 번호 「3)」가 따로 찍혀 있다. 그 번호가 문항의 시작.
// 한 문항이 다음 단·다음 쪽으로 넘어가면 조각을 이어 붙인다.
// 마지막 쪽의 「1) ③ … 21) 논술1. …」 목록은 정답표 — 문항이 아니라 정답으로 읽는다.
// ①~⑤ 가 아닌 정답(논술형·수식)은 글자로 옮기면 수식이 빠지므로 그 칸을 그림으로도 잘라 둔다.

const DPI = 200
const Z = DPI / 72
const INK = 200                       // 이보다 어두우면 글자·그림
const MARK = /^(\d+)\)$/
// 한글 작업본은 두 꼴이 있다.
//   ① 미주 꼴 「1)」 — 번호가 작은 글씨로 따로 찍힌다 (MARK)
//   ② 「1.」 꼴 — 수학의지혜 시험지 양식으로 짠 작업본. **번호가 수식 글꼴**이라 PDF 에서
//      글자로 아예 안 읽힌다(사용자 영역 글자로 나온다). 그래서 번호는 나온 **차례대로** 매긴다.
//      2026-11-10 신원중 중1 2025 2학기 기말이 이 꼴이었다(미주 0개 → 통째로 막혔다).
const PUA = /^[\uE000-\uF8FF]+$/          // 수식 글꼴 글자 (글자로 옮길 수 없다)
// 「1.」 꼴 중에서도 번호가 **그냥 글자로** 찍힌 작업본이 있다 — 번호와 점이 한 덩어리다.
//   2026-11-14 지축중 중1 2025 2학기 기말이 이 꼴이었다. 수식 글꼴만 보던 탓에 13쪽 전부
//   「문항 번호를 찾지 못했습니다」로 막혔다(실측: 1~23번이 8.6pt 로 멀정히 읽히고 있었다).
const DOT_NUM = /^(\d{1,3})\.$/
/**
 * 「12.」 처럼 **번호와 점이 한 덩이로 그냥 글자인** 문항 번호인가. 맞으면 그 숫자.
 *
 * 가르는 것은 **크기**다 — 문항 번호는 본문보다 작다(미주와 같은 85% 규칙, `markLimit`).
 * 실측 2026-11-14 지축중 중1 2025 2학기 기말: 본문 11.04pt · 번호 8.6pt · 한계 9.38pt.
 * 마지막 정답표 쪽의 「22.」·「23.」 은 본문 크기(11.5pt)라 여기서 걸러진다.
 *
 * 시험: scripts/exam-crop-mark-check.ts
 */
export function dotNumberOf(str: string, size: number, limit: number, big = Infinity): number | null {
  const m = DOT_NUM.exec(str.trim())
  if (!m) return null
  // 번호는 본문보다 **작거나**(미주·지축중 꼴) **크다**(고양시 고1 꼴). 본문과 같은 크기면
  // 문항 번호가 아니라 글 속의 「12.」 다 — 그건 걸리면 안 된다.
  if (!(size < limit || size > big)) return null
  return Number(m[1])
}
// 한글 수식 글꼴의 **숫자**는 사용자 영역 글자로 찍힌다 — 실측(2026-11-10 신원중)으로는
//   E034~E03C = 1~9, E03D = 0 이다. 글꼴마다 다를 수 있으므로 **그 파일에서 맞는지 확인한 뒤에만** 쓴다:
//   「1.」 꼴 문항 번호를 이 표로 읽어 1, 2, 3 … 으로 이어지면 맞는 표다(dotOk). 맞을 때만
//   배점 「[3점]」 과 숫자 정답을 되살려 읽는다. 안 맞으면 전처럼 그냥 버린다.
const EQ_FROM = 0xe034
const EQ_DIGITS = '1234567890'
// 숫자뿐 아니라 **구두점**도 사용자 영역 글자로 찍힌다 — 실측 2026-11-17 (정발고 · 풍동고 · 저동고 · 서정고):
//   E052 = ',' · E053 = '.'
// 배점 「[4.4점]」 을 「4 ⟪E053⟫ 4 점]」 로 찍는 작업본이 있다. 마침표를 안 되살리면 숫자가 이어지지 않아
// **그 파일 배점을 하나도 못 읽는다**(네 학교가 합계 0점이었다). 맞는지는 **배점 합이 100점인가**로 가린다.
const EQ_PUNCT: Record<string, string> = { '': ',', '': '.' }
export function eqText(s: string): string {
  return s.replace(/[-]/g,
    (c) => EQ_PUNCT[c] ?? EQ_DIGITS[c.codePointAt(0)! - EQ_FROM] ?? '')
}

/**
 * 「[4점]」 · 「(4점)」 · 「[4.6점]」 에서 배점을 읽는다. 없으면 null.
 *
 * ★ 숫자 사이에 **빈칸이 들어와도** 읽는다. 한글에서 배점을 수식으로 넣으면 PDF 에
 *   「[」 「4」 「.」 「6」 「점]」 **다섯 조각**으로 쪼개져 찍히고, 한 줄로 이어 붙일 때
 *   조각 사이에 빈칸이 하나씩 들어가 「[ 4 . 6 점]」 이 된다. 빈칸을 안 봐주면
 *   `\d+(?:\.\d+)?` 가 「4」 까지만 먹고 「점」 앞에서 어긋나 **하나도 못 읽는다.**
 *   2026-11-17 백양고 2025 2학기 기말이 그랬다 — 21문항 배점 합계가 0점으로 나왔다
 *   (수식 글꼴 숫자 자체는 eqText 로 이미 제대로 되살아나고 있었다).
 *
 * ★ **닫는 괄호는 너그럽게 본다.** 한글 작업본에 「[5.0점[」 처럼 닫는 쪽을 잘못 친 것이 있다
 *   (2026-11-17 백양고 12번). 한 글자 오타로 그 문항 배점이 통째로 빠지고, 합계가 95점으로
 *   나와도 **어느 문항인지 알 수 없다.** 여는 괄호는 그대로 보고 닫는 쪽만 괄호 아무거나 받는다.
 *   배점은 0 < n ≤ 100 인 것만 — 엉뚱한 숫자가 걸리는 것을 막는다.
 *
 * 시험: scripts/exam-crop-mark-check.ts   (scripts/exam-paper/crop.py 에도 같은 규칙이 있다)
 */
export function pointsOf(text: string): number | null {
  const m = /[\[(]\s*(\d+(?:\s*\.\s*\d+)?)\s*점\s*[\])\[(]/.exec(text)
  if (!m) return null
  const n = Number(m[1].replace(/\s+/g, ''))
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : null
}

// 「[논술형 1-1]」 · 「[서술형 2]」 · 「[단답형1]」 · 「[서답형 3]」
// ★ 「단답형·서답형」을 안 보면 그 문항이 통째로 빠진다 — 2026-11-17 일산동고는 서답형 3문항의
//   머리가 「[단답형1]」 이고 번호(19·20·21)는 **들여 써서** 단 맨 왼쪽에 없다. 그 바람에
//   18번 그림이 4,359px 로 늘어나 서답형 셋을 삼켰다(문항 18 · 정답 21).
const ESSAY_HEAD = /^\[\s*(논술|서술|단답|서답)형/
// 머리의 **큰 번호** — 「[논술형 1-1]」 은 1, 「[단답형2]」 는 2.
// 큰 번호가 **같으면** 한 문항에 딸린 물음(1-1 · 1-2 · 1-3)이고, **다르면** 다른 문항이다.
// 전에는 「머리가 두 번 나오면 무조건 앞 문항에 붙인다」였다 — 그래서 일산동고의
// 「[단답형1]」·「[단답형2]」·「[단답형3]」 세 문항이 **하나로 뭉쳤다**(19문항, 머리말은 21).
const ESSAY_NO = /^\[\s*(?:논술|서술|단답|서답)형\s*(\d+)/

/** 그 조각이 논술·서술·단답·서답형 머리인가 (「[단답형1]」·「[논술형 1-1]」). 시험: scripts/exam-crop-mark-check.ts */
export function isEssayHead(str: string): boolean { return ESSAY_HEAD.test(str.trim()) }
/** 그 머리의 **큰 번호** (「[논술형 1-1]」 → 1). 번호가 없으면 null. */
export function essayMainOf(str: string): number | null {
  const m = ESSAY_NO.exec(str.trim())
  return m ? Number(m[1]) : null
}

// 미주 번호는 **본문보다 작다**. 전에는 「8.5pt 보다 작으면」으로 봤는데, 한글에서 본문을 크게
// (11.5pt) 잡아 만든 파일은 미주가 8.63pt 로 찍혀 **한 끗 차이로 안 걸렸다** — 2026-11-09
// 고양중 중1 2025 2학기 기말이 11쪽 내내 0개였다(「문항 번호를 찾지 못했습니다」).
// 두 파일을 재 보니 미주÷본문 비는 6.72/9.0 = 0.747, 8.63/11.5 = 0.750 으로 같다.
// 절대 크기가 아니라 **비**가 규칙이다 → 그 쪽 본문 글자 크기(가운데값)의 85% 보다 작은 것만 미주로 본다.
// 시험: scripts/exam-crop-mark-check.ts   (scripts/exam-paper/crop.py 에도 같은 규칙이 있다)
export function markLimit(sizes: number[]): number {
  const s = sizes.filter((v) => v > 0).sort((a, b) => a - b)
  if (!s.length) return 8.5                      // 글자가 없으면 옛 기준
  return s[Math.floor(s.length / 2)] * 0.85
}

/**
 * 번호가 본문보다 **큰** 꼴도 있다 — 2026-11-17 고양시 고1 공통수학2 25개교가 그랬다.
 * 번호 14.99pt · 본문 11.03pt (1.36배)라 「작은 것만 번호」 규칙에 하나도 안 걸려
 * 25개 파일이 모두 「문항 번호를 찾지 못했습니다」였다.
 * 본문 가운데값의 1.15배보다 큰 것만 번호로 본다 — 머리말(「2025년」·「1학년」)은 `숫자.` 꼴이
 * 아니라 안 걸리고, 해설 쪽의 작은 번호는 정답표로 따로 걸러진다(inAnswers).
 * 시험: scripts/exam-crop-mark-check.ts
 */
export function bigLimit(sizes: number[]): number {
  const s = sizes.filter((v) => v > 0).sort((a, b) => a - b)
  if (!s.length) return Infinity
  return s[Math.floor(s.length / 2)] * 1.15
}

/** 첫 훑기에서 모은 「단 맨 왼쪽의 `N.`·`N)` 조각」 하나 */
export type NumCand = { page: number; col: number; base: number; no: number; size: number; fn: string }

/**
 * 문항 번호의 **크기·글꼴을 문서 한 번으로** 정한다. 못 정하면 null.
 *
 * 왜 쪽마다가 아니라 문서 한 번인가 (2026-11-17 능곡고)
 *   능곡고는 번호가 1~23번 **모두 11.03pt · 같은 글꼴**로 일정한데, 쪽마다 본문 크기가
 *   11.03 → 9.95 → 8.99 로 달라진다. 그래서 「본문보다 작거나 크다」는 **쪽마다 뒤집혀**
 *   4쪽에서만 걸렸다(문항 23개 중 4개). 번호 쪽은 가만히 있는데 자가 흔들린 것이다.
 *
 * 고르는 법 — (크기, 글꼴) 묶음 가운데 번호가 **1부터 빠짐없이 이어지는** 것. 다섯 개 넘어야 한다.
 * 같은 길이면 **먼저 나온 것**(= 앞쪽 쪽)을 쓴다. 해설 쪽 번호가 끼어들지 않게, 부르는 쪽에서
 * 「정답 및 해설」 머리 **앞쪽 후보만** 넘긴다.
 *
 * 시험: scripts/exam-crop-mark-check.ts
 */
export function numberStyleOf(cands: NumCand[]): { size: number; fn: string } | null {
  const byKey = new Map<string, NumCand[]>()
  for (const c of cands) {
    const key = `${c.size.toFixed(1)}|${c.fn}`
    const list = byKey.get(key)
    if (list) list.push(c)
    else byKey.set(key, [c])
  }
  let best: { size: number; fn: string; n: number } | null = null
  for (const list of byKey.values()) {
    const nos = list.slice()
      .sort((a, b) => a.page - b.page || a.col - b.col || a.base - b.base)
      .map((c) => c.no)
    if (nos.length < 5 || nos[0] !== 1) continue
    if (!nos.every((n, i) => i === 0 || n === nos[i - 1] + 1)) continue
    if (!best || nos.length > best.n) best = { size: list[0].size, fn: list[0].fn, n: nos.length }
  }
  return best ? { size: best.size, fn: best.fn } : null
}

/**
 * 그 조각이 **문서에서 정한 번호 꼴**인가. 맞으면 그 숫자.
 * 크기·글꼴이 둘 다 같아야 한다 — 크기만 보면 본문 속 「12.」 가 걸린다.
 */
export function styleNumberOf(str: string, size: number, fn: string,
  style: { size: number; fn: string } | null): number | null {
  if (!style) return null
  const m = DOT_NUM.exec(str.trim())
  if (!m) return null
  if (Math.abs(size - style.size) > 0.15 || fn !== style.fn) return null
  return Number(m[1])
}

/**
 * 「정답 및 해설」 머리가 몇 쪽에 있나 (0부터). 없으면 null.
 *
 * 이 머리가 있으면 **그 쪽부터가 정답·해설**이고, 어림짐작(「번호 줄이 5개 넘으면 정답표」)은
 * 쓰지 않는다. 어림짐작은 문항 번호가 **본문보다 작은** 파일에서 문제 쪽을 정답표로 오판한다 —
 * 2026-11-17 고양시 고1 25개교 중 능곡고·백마고가 **1쪽부터** 정답으로 읽혀 문항이 0이었다.
 * (머리말은 25개교 전부에 있었고, 그중 23개교는 어림짐작과 같은 쪽을 가리켰다.)
 *
 * 「정답과 해설」·「정답해설」·띄어쓰기가 다른 꼴도 받는다. 문제 쪽에 「정답을 쓰시오」 처럼
 * 「정답」만 있는 것은 걸리지 않는다 — 「해설」이 같이 있어야 한다.
 *
 * 시험: scripts/exam-crop-mark-check.ts
 */
export function answerHeadPageOf(pageTexts: string[]): number | null {
  const HEAD = /정\s*답\s*(및|과)?\s*해\s*설/
  for (let i = 0; i < pageTexts.length; i++) if (HEAD.test(pageTexts[i] ?? '')) return i
  return null
}

// 정답표에서 정답이 번호 **아랫줄**부터 적혀 있는가. 같은 줄에 적힌 정답(「18) 가 × 나」)의
// 위·아래 첨자는 밑줄이 몇 pt 어긋날 뿐이므로, **한 줄 높이(글자 크기의 1.3배)** 를 넘어야 아랫줄로 본다.
// 2026-11-09 고양중 중1 — 18)은 같은 줄(어긋남 6.4pt < 11.7), 19)·20)은 아랫줄(14.7pt).
// 시험: scripts/exam-crop-mark-check.ts
export function answerBelow(markBase: number, markSize: number, bases: number[], y1: number): boolean {
  return bases.some((b) => b > markBase + markSize * 1.3 && b <= y1)
}

export type CroppedProblem = {
  no: number
  page: number
  w: number
  h: number
  parts: number
  points: number | null               // [3점] — 수식으로 찍혀 안 읽히면 null (화면에서 적는다)
  essay: boolean
  choices: number
  answer: string | null
  image: HTMLCanvasElement
  answerImage: HTMLCanvasElement | null
}
export type CropResult = { pages: number; problems: CroppedProblem[]; answersFound: number; warnings: string[] }

type Item = { str: string; x: number; x1: number; base: number; top: number; bottom: number; size: number; fn: string }

function inkRows(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number] | null {
  if (w < 1 || h < 1) return null
  const d = ctx.getImageData(0, 0, w, h).data
  let first = -1, last = -1
  for (let y = 0; y < h; y++) {
    let ink = false
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < INK) { ink = true; break }
    }
    if (ink) { if (first < 0) first = y; last = y }
  }
  return first < 0 ? null : [first, last]
}

// 글자가 있는 **첫 세로줄·마지막 세로줄** (없으면 null). inkRows 의 가로 판.
// 정답 그림은 단 폭을 통째로 잘라 오므로 오른쪽이 거의 비어 있다 — 그대로 두면 화면·인쇄에서
// 그 빈자리까지 폭을 차지해 글씨가 작게 보인다 (원장님 2026-11-09 「18~20번은 너무 작게 보이는데」).
function inkCols(ctx: CanvasRenderingContext2D, w: number, h: number): [number, number] | null {
  if (w < 1 || h < 1) return null
  const d = ctx.getImageData(0, 0, w, h).data
  let first = -1, last = -1
  for (let x = 0; x < w; x++) {
    let ink = false
    for (let y = 0; y < h; y += 2) {
      const i = (y * w + x) * 4
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 < INK) { ink = true; break }
    }
    if (ink) { if (first < 0) first = x; last = x }
  }
  return first < 0 ? null : [first, last]
}

function sub(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h))
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height)
  g.drawImage(src, Math.round(x), Math.round(y), c.width, c.height, 0, 0, c.width, c.height)
  return c
}

// pt 단위 사각형을 쪽 그림에서 잘라, 글자가 있는 줄만 남긴다 (위 6px · 아래 8px 여유)
function clip(pageCanvas: HTMLCanvasElement, x0: number, y0: number, x1: number, y1: number): HTMLCanvasElement | null {
  const c = sub(pageCanvas, x0 * Z, y0 * Z, (x1 - x0) * Z, (y1 - y0) * Z)
  const rows = inkRows(c.getContext('2d', { willReadFrequently: true })!, c.width, c.height)
  if (!rows) return null
  const top = Math.max(0, rows[0] - 6), bot = Math.min(c.height, rows[1] + 8)
  return sub(c, 0, top, c.width, bot - top)
}

function textIn(items: Item[], x0: number, y0: number, x1: number, y1: number): string {
  return items
    .filter((t) => (t.x + t.x1) / 2 >= x0 && (t.x + t.x1) / 2 <= x1 && t.base >= y0 && t.base <= y1 + 2)
    .sort((a, b) => (Math.abs(a.base - b.base) < 3 ? a.x - b.x : a.base - b.base))
    .map((t) => t.str).join(' ')
}

export async function cropExamPdf(data: ArrayBuffer, onProgress?: (page: number, pages: number) => void): Promise<CropResult> {
  const pdfjs: any = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const doc = await pdfjs.getDocument({ data }).promise
  const warnings: string[] = []
  const problems: { no: number; page: number; parts: HTMLCanvasElement[]; text: string }[] = []
  let cur: (typeof problems)[number] | null = null
  const answers: Record<number, string> = {}
  const answerImages: Record<number, HTMLCanvasElement> = {}
  let inAnswers = false, lastAnswerNo = 0
  let dotNo = 0                         // 「1.」 꼴에서 매긴 마지막 번호 (쪽을 넘어서도 이어진다)
  let essayRun = false                  // 논술형 묶음 안인가 (딸린 물음은 같은 문항으로 붙인다)
  let essayMain = NaN                   // 그 묶음의 큰 번호 (「[논술형 1-1]」 → 1). 바뀌면 다른 문항이다
  let essayTop: number | null = null    // 바로 위에 있던 논술형 이름표의 윗선 (뒤따르는 번호 그림을 여기서부터 자른다)
  let dotUsed = false                   // 「1.」 꼴로 읽었나
  let dotOk = true                      // 수식 글꼴 숫자표가 이 파일에 맞나 (번호가 1,2,3… 으로 읽히나)
  let essayQ = 0                        // 논술형 묶음에 매긴 문항 번호 (정답 그림을 여기에 붙인다)
  const dec = (t: string) => (dotUsed && dotOk ? eqText(t) : t)   // 표가 맞을 때만 숫자를 되살린다
  let markShaped = 0                    // 「N)」 꼴이 있기는 했나 — 안 걸렸을 때 뭐라고 알릴지 가른다

  // ── 머리말·쪽 번호 가려내기 ────────────────────────────────────────────────
  // 「수학의 지혜 · 1학년 · 수학 · 신원중 · 3/12」 처럼 **쪽마다 같은 자리에 되풀이되는** 글자는
  // 문항이 아니다. 안 가리면 다음 단 맨 위의 머리말이 앞 문항 그림에 딸려 들어간다
  // (2026-11-10 신원중 — 문항마다 머리말 띠가 붙어 그림이 쪽 높이만큼 길어졌다).
  const sigOf = (x: number, base: number, str: string) => `${Math.round(x)}|${Math.round(base)}|${str}`
  const numSig = (x: number, base: number) => `${Math.round(x / 5) * 5}|${Math.round(base)}`
  // 「3」 · 「3/12」 · 「-3-」 — 쪽마다 글자가 달라진다. 「-3-」 꼴을 안 보면 바닥 띠를 못 찾아
  //   문항 그림이 **쪽 맨 아래 줄까지** 늘어난다 (2026-11-17 고양시 파일 — 22번이 2382px 였다)
  const PAGE_NO = /^\d{1,3}$|^\d{1,3}\s*\/\s*\d{1,3}$|^[-‐‑‒–—－]\s*\d{1,3}\s*[-‐‑‒–—－]$/
  const seen = new Map<string, number>()
  const seenNum = new Map<string, number>()
  // ── 정답·해설이 몇 쪽부터인가 ──────────────────────────────────────────────
  // 「정답 및 해설」 머리가 있으면 **그 쪽부터가 정답**이다. 어림짐작(아래 lineStarts)보다 이것이 먼저다 —
  //   2026-11-17 고양시 고1 25개교 중 **능곡고·백마고는 1쪽이 정답표로 오판**돼 그때부터 전부
  //   정답으로 읽혔다(문항 0 · 정답 21~23). 두 파일은 문항 번호가 작아서(8.27pt) 번호가
  //   lineStarts 로 세어진 탓이다. 머리말은 25개교 **전부**에 있었고 23개교에서 어림짐작과 같았다.
  // 머리가 없는 파일(신원중 꼴)은 전처럼 어림짐작으로 간다.
  const pageTexts: string[] = []
  const numCands: NumCand[] = []
  for (let pi = 0; pi < doc.numPages; pi++) {
    const pg = await doc.getPage(pi + 1)
    const vp = pg.getViewport({ scale: 1 })
    const strs: string[] = []
    const pageItems: { str: string; x: number; x1: number; base: number; size: number; fn: string }[] = []
    for (const it of (await pg.getTextContent()).items as any[]) {
      const str = String(it.str ?? '').trim()
      if (!str) continue
      strs.push(str)
      const t = pdfjs.Util.transform(vp.transform, it.transform)
      seen.set(sigOf(t[4], t[5], str), (seen.get(sigOf(t[4], t[5], str)) ?? 0) + 1)
      if (PAGE_NO.test(str)) seenNum.set(numSig(t[4], t[5]), (seenNum.get(numSig(t[4], t[5])) ?? 0) + 1)
      pageItems.push({ str, x: t[4], x1: t[4] + it.width, base: t[5], size: Math.hypot(t[2], t[3]), fn: String(it.fontName ?? '') })
    }
    pageTexts.push(strs.join(' '))
    // 단 맨 왼쪽의 「N.」 조각을 모아 둔다 — 번호 꼴을 **문서 한 번**으로 정하려고 (numberStyleOf).
    // 단 자리는 아래 본 돌기와 같은 셈으로 잡는다 (머리말을 아직 못 가려 조금 넓게 나올 수 있다).
    if (pageItems.length) {
      const mid = vp.width / 2
      const ls = pageItems.filter((t) => t.x < mid).map((t) => t.x)
      const rs = pageItems.filter((t) => t.x > mid).map((t) => t.x1)
      const l = (ls.length ? Math.min(...ls) : 40) - 3
      const r = (rs.length ? Math.max(...rs) : vp.width - 40) + 3
      const cc: [number, number][] = [[l, mid - 4], [mid + 5, Math.max(r, mid + 5)]]
      for (const t of pageItems) {
        const col = t.x < cc[1][0] - 5 ? 0 : 1
        if (Math.abs(t.x - cc[col][0]) >= 12) continue
        const m = DOT_NUM.exec(t.str)
        if (!m) continue
        numCands.push({ page: pi, col, base: t.base, no: Number(m[1]), size: t.size, fn: t.fn })
      }
    }
  }
  const answerHeadPage = answerHeadPageOf(pageTexts)
  // 해설 쪽 번호가 끼어들지 않게 **정답 머리 앞쪽** 후보만 본다
  const numStyle = numberStyleOf(numCands.filter((c) => answerHeadPage === null || c.page < answerHeadPage))
  // 쪽이 셋 이상일 때만 본다 (두 쪽짜리에서 우연히 같은 자리에 같은 글자가 올 수 있다)
  const REPEAT = doc.numPages >= 3 ? Math.max(3, Math.ceil(doc.numPages * 0.6)) : doc.numPages + 1
  const isRunning = (t: Item) =>
    (seen.get(sigOf(t.x, t.base, t.str)) ?? 0) >= REPEAT ||
    (PAGE_NO.test(t.str) && (seenNum.get(numSig(t.x, t.base)) ?? 0) >= REPEAT)

  for (let pi = 0; pi < doc.numPages; pi++) {
    onProgress?.(pi + 1, doc.numPages)
    const page = await doc.getPage(pi + 1)
    const vp1 = page.getViewport({ scale: 1 })
    const vp = page.getViewport({ scale: Z })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    // intent 'print': 화면용은 requestAnimationFrame 으로 나눠 그려서, 다른 탭을 보고 있으면 멈춘다
    await page.render({ canvasContext: ctx, viewport: vp, canvas, intent: 'print' } as any).promise

    const tc = await page.getTextContent()
    const raw: Item[] = []
    for (const it of tc.items as any[]) {
      if (!it.str || !it.str.trim()) continue
      const t = pdfjs.Util.transform(vp1.transform, it.transform)
      const size = Math.hypot(t[2], t[3])
      // ★ **안 보이는 글자**는 아예 빼 둔다. 한글에서 변환한 파일에 0.72pt 짜리 「19.」 가
      //   박혀 있는 것이 있다 — 2026-11-17 향동고. 사람 눈에는 없는데 번호로 읽혀서
      //   17px 짜리 빈 문항이 셋 생기고 번호가 20, 19, 22, 21, 24, 23 으로 엉켰다.
      //   본문이 9pt 대인 파일에서 2pt 아래는 글자가 아니다(가운데값을 끌어내려 한계도 흐트린다).
      if (size < 2) continue
      raw.push({ str: it.str.trim(), x: t[4], x1: t[4] + it.width, base: t[5], top: t[5] - size * 0.8, bottom: t[5] + size * 0.2, size, fn: String(it.fontName ?? '') })
    }
    // 되풀이되는 글자가 있는 **띠 전체**를 뺀다 — 쪽 번호처럼 쪽마다 글자가 달라지는 것도
    // 같은 띠 안에 있으면 머리말이다 (안 빼면 그 글자 때문에 본문 위끝이 머리말까지 올라간다)
    const head = raw.filter(isRunning)
    const topBand = Math.max(0, ...head.filter((t) => t.base < vp1.height * 0.25).map((t) => t.bottom))
    const botBand = Math.min(vp1.height, ...head.filter((t) => t.base > vp1.height * 0.75).map((t) => t.top))
    const items = raw.filter((t) => !isRunning(t) && t.base > topBand && t.base < botBand)
    // 본문이 들어 있는 세로 범위 — 이 밖(머리말 띠·쪽 번호·테두리 줄)은 문항 그림에 넣지 않는다
    const bodyTop = items.length ? Math.min(...items.map((t) => t.top)) - 2 : topBand + 2
    // 맨 아래 「※ 확인사항 …」 안내는 문항이 아니다 (마지막 문항 그림에 딸려 들어간다)
    const noteTop = Math.min(...items.filter((t) => /^※/.test(t.str)).map((t) => t.top), Infinity)
    const bodyBottom = Math.min(botBand - 2, noteTop - 4,
      items.length ? Math.max(...items.map((t) => t.bottom)) + 6 : vp1.height)

    // 두 단의 가로 범위 — 가운데 세로선이 있으면 그 자리, 없으면 쪽 한가운데
    let mid = vp1.width / 2
    {
      const x0 = Math.round((mid - 40) * Z), x1 = Math.round((mid + 40) * Z)
      const img = ctx.getImageData(x0, 0, x1 - x0, canvas.height).data
      const w = x1 - x0
      let best = 0, bestX = -1
      for (let x = 0; x < w; x++) {
        let n = 0
        for (let y = 0; y < canvas.height; y += 4) if (img[(y * w + x) * 4] < INK) n++
        if (n > best) { best = n; bestX = x }
      }
      if (best > (canvas.height / 4) * 0.25) mid = (x0 + bestX) / Z
    }
    const lefts = items.filter((t) => t.x < mid).map((t) => t.x)
    const rights = items.filter((t) => t.x > mid).map((t) => t.x1)
    const left = (lefts.length ? Math.min(...lefts) : 40) - 3
    const right = (rights.length ? Math.max(...rights) : vp1.width - 40) + 3
    const cols: [number, number][] = [[left, mid - 4], [mid + 5, Math.max(right, mid + 5 + (mid - 4 - left))]]
    const colOf = (x: number) => (x < cols[1][0] - 5 ? 0 : 1)
    // ★ 단의 **왼쪽 끝은 그 단 글자에서 잰다.** 오른단은 「쪽 가운데 + 5」 로 어림잡고 있었는데,
    //   쪽마다 15pt 까지 어긋난다 — 2026-11-17 백석고는 정답 쪽 오른단이 x=383 이고 어림값은 369 라
    //   14pt 막이를 아슬하게 넘겨 **오른단을 통째로 못 읽었다**(문항 24개에 정답 9개).
    //   왼단은 전부터 글자에서 재고 있었다(left) — 오른단만 어림이었다.
    const colX: [number, number] = [0, 1].map((c) => {
      const xs = items.filter((t) => colOf(t.x) === c).map((t) => t.x)
      return xs.length ? Math.min(...xs) : cols[c][0]
    }) as [number, number]

    // 작은 미주 번호 = 문항 시작
    // 번호가 문제 첫 줄과 같은 줄에 찍힌 파일도 있다 (「10) 다음 중 옳지 않은 것은?」).
    // 그때는 번호 줄 아래부터 자르면 첫 줄이 날아간다 → 그 줄 위에서부터 자르고 번호 글자만 지운다 (top · box)
    const limit = markLimit(items.map((t) => t.size))
    const big = bigLimit(items.map((t) => t.size))
    markShaped += items.filter((t) => MARK.test(t.str)).length
    type Mark = { no: number; col: number; y0: number; y1: number; top: number | null; box?: [number, number, number, number] }
    const ms: Mark[] = items
      .filter((t) => MARK.test(t.str) && t.size < limit && Math.abs(t.x - colX[colOf(t.x)]) < 12)
      .map((t): Mark => {
        const col = colOf(t.x)
        const same = items.filter((o) => o !== t && Math.abs(o.base - t.base) < 4 && o.x >= t.x1 - 1 && o.x < cols[col][1])
        return {
          no: Number(t.str.match(MARK)![1]), col, y0: t.top, y1: t.bottom,
          top: same.length ? Math.min(t.top, ...same.map((o) => o.top)) - 2 : null,
          box: [t.x, t.top, t.x1, t.bottom] as [number, number, number, number],
        }
      })

    // 정답표 쪽: 번호만 줄줄이 있거나, 작은 미주 번호 없이 「1) ③」 줄이 5개 넘게 있는 쪽
    // 정답표는 「1) ③」 과 「1. ④」 두 꼴이 다 있다
    // ★ 본문보다 **큰** 번호는 문항 번호다 — 정답표 줄로 세면 안 된다.
    //   2026-11-17 고양시 고1 25개교: 문제 1쪽의 「1.」「2.」「3.」(15.0pt)이 여섯 개 걸려
    //   그 쪽이 통째로 「정답표」로 판정됐고, inAnswers 가 거기서 켜져 **그 뒤 쪽이 모두 정답**이 됐다
    //   (문항 0 · 정답 21). 정답표의 번호는 본문보다 작다(해설 쪽 8.75pt).
    const lineStarts = items.filter((t) => /^\d+[).]/.test(t.str) && Math.abs(t.x - colX[colOf(t.x)]) < 14 && !(t.size > big))
    const nMark = items.filter((t) => MARK.test(t.str)).length
    // 정답표가 시작되면 그 뒤 쪽은 전부 정답 · 해설이다 (뒤에 해설이 이어져도 문항으로 자르지 않는다)
    // ★ 「정답 및 해설」 머리가 있는 파일은 **그 머리가 정한다** — 어림짐작은 쓰지 않는다.
    //   어림짐작은 그 머리가 없는 파일(신원중 꼴)에만 쓴다. 섞어 쓰면 머리보다 앞쪽에서
    //   잘못 켜질 수 있다(능곡고·백마고가 1쪽에서 켜졌다).
    const 머리로정답 = answerHeadPage !== null && pi >= answerHeadPage
    const 어림짐작정답 = answerHeadPage === null
      && ((nMark >= 5 && nMark >= 0.4 * items.length) || (!ms.length && lineStarts.length >= 5))
    if (inAnswers || 머리로정답 || 어림짐작정답) {
      inAnswers = true
      const marks: { no: number; c: number; y0: number; yb: number; base: number; h: number; xr: number }[] = []
      let want = lastAnswerNo + 1
      for (const c of [0, 1]) {
        const ws = lineStarts.filter((t) => colOf(t.x) === c).sort((a, b) => a.base - b.base)
        for (const t of ws) {
          const head = [`${want})`, `${want}.`].find((h) => t.str.startsWith(h))
          if (head) {
            marks.push({ no: want, c, y0: t.top, yb: t.bottom, base: t.base, h: t.size, xr: t.str === head ? t.x1 : Math.min(t.x1, t.x + t.size * 0.56 * head.length) })
            want++
          }
        }
      }
      lastAnswerNo = want - 1
      const rows = inkRows(ctx, canvas.width, canvas.height)
      const bottom = Math.min(vp1.height, (rows ? rows[1] / Z : vp1.height) + 6, bodyBottom)
      marks.forEach((m, i) => {
        const nxt = marks[i + 1] && marks[i + 1].c === m.c ? marks[i + 1] : null
        const y1 = nxt ? nxt.y0 - 1 : bottom
        const x1 = cols[m.c][1]
        // 번호 글자와 정답이 한 덩어리(「10) ⑤」)로 올 수 있어 단 왼쪽부터 읽고 번호를 떼어 낸다.
        // 수식 글꼴의 사용자 영역 글자(분수선 등)는 글자로 옮길 수 없어 버린다
        let text = dec(textIn(items, cols[m.c][0] - 1, m.y0 - 1, x1, y1)).replace(/[-]/g, '').replace(/\s+/g, ' ').trim()
        text = text.replace(new RegExp(`(^|\\s)${m.no}[).]\\s*`), ' ').trim().replace(/^(논술|서술)형?\s*\d+\s*[.)]\s*/, '')
        if (/^[①②③④⑤,\s]+$/.test(text.replace(/[^\p{L}\p{N}①②③④⑤,]/gu, '') || ' ')) text = text.replace(/[^①②③④⑤,]/g, '')   // 빈 수식 틀 같은 찌꺼기는 버린다
        // 「1. 정답 ④ 의 값을 …」 처럼 **「정답」이라고 적고** 해설이 이어지는 꼴 (2026-11-17 백양고).
        // 이 말을 떼야 아래 `lead` 가 동그라미만 남긴다 — 안 떼면 해설이 통째로 정답으로 들어가
        // QR 자동 채점이 안 된다.
        // 「[정답] ④ …」(풍동고) · 「정답 ④ …」(백양고) · 「정답: ④」 — 괄호·쉼표를 가리지 않는다
        text = text.replace(/^[[【〔<(]?\s*(정답|답)\s*[\]】〕>)]?\s*[:：)]?\s*/, '')
        const lead = text.match(/^[①②③④⑤](\s*,\s*[①②③④⑤])*/)
        if (lead && text.length > lead[0].length) text = lead[0]          // 「② 원의 중심을 …」 = 정답 뒤에 해설이 붙은 것 → 정답만
        if (text) answers[m.no] = text
        if (text && /^([①②③④⑤,\s]+|-?\d+(\.\d+)?)$/.test(text)) return   // 글자로 다 옮긴 정답은 그림이 필요 없다
        // ★ 글자가 하나도 안 남아도 **여기서 멈추지 않는다.** 서술형 정답이 수식 글꼴로만 적힌 쪽이 있다 —
        //   2026-11-09 고양중 중1 19)·20) 의 「△ABD ≡ △ACE」 가 통째로 수식이라 글자가 다 날아갔고,
        //   전에는 그 번호를 통째로 건너뛰어 화면에 **아무것도** 안 올라왔다(18)은 「가·나」가 한글이라 올라왔다).
        // 그런 정답은 번호 **아랫줄**부터 적힌다. 번호 오른쪽부터 자르면 아랫줄 왼쪽이 잘려 나가므로
        //   단 왼쪽부터 자르고 번호 글자만 하얗게 지운다 (같은 줄에 적힌 정답은 전과 같이 번호 오른쪽부터).
        const below = answerBelow(m.base, m.h, items.filter((t) => colOf(t.x) === m.c && t.x < x1).map((t) => t.base), y1)
        const xa = below ? cols[m.c][0] - 1 : m.xr + 1
        // 분수는 번호 줄보다 위로 올라온다 → 위로 9pt 더. 대신 윗 정답의 꼬리가 딸려 오면 지운다
        const c = sub(canvas, xa * Z, (m.y0 - 9) * Z, (x1 - xa) * Z, (y1 - 2 - (m.y0 - 9)) * Z)
        const g = c.getContext('2d', { willReadFrequently: true })!
        if (below) { g.fillStyle = '#fff'; g.fillRect(0, 8 * Z, (m.xr - xa + 1) * Z, (m.yb - m.y0 + 3) * Z) }
        const im = g.getImageData(0, 0, c.width, c.height)
        const gray = (x: number, y: number) => { const i = (y * c.width + x) * 4; return im.data[i] * 0.299 + im.data[i + 1] * 0.587 + im.data[i + 2] * 0.114 }
        const todo: [number, number][] = []
        const seen = new Uint8Array(c.width * Math.min(c.height, 30))
        for (let x = 0; x < c.width; x++) if (gray(x, 0) < INK) { todo.push([x, 0]); seen[x] = 1 }
        while (todo.length) {
          const [x, y] = todo.pop()!
          const i = (y * c.width + x) * 4
          im.data[i] = im.data[i + 1] = im.data[i + 2] = 255
          for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x + 1, y + 1], [x - 1, y + 1]]) {
            if (nx < 0 || nx >= c.width || ny >= Math.min(c.height, 30) || seen[ny * c.width + nx] || gray(nx, ny) >= 235) continue
            seen[ny * c.width + nx] = 1; todo.push([nx, ny])
          }
        }
        g.putImageData(im, 0, 0)
        // 위아래뿐 아니라 **좌우로도** 바짝 잘라 둔다 — 빈자리를 안고 있으면 어디에 놓아도 글씨가 작아진다
        const r2 = inkRows(g, c.width, c.height)
        const c2 = inkCols(g, c.width, c.height)
        if (r2 && c2) {
          const x0 = Math.max(0, c2[0] - 6), y0 = Math.max(0, r2[0] - 6)
          answerImages[m.no] = sub(c, x0, y0, Math.min(c.width, c2[1] + 8) - x0, Math.min(c.height, r2[1] + 8) - y0)
        }
      })
      // 「[논술형 1-1] …」 처럼 번호가 안 붙은 정답은 **그림 한 장**으로 모아 그 문항에 붙인다
      // (원장님 2026-11-10 「논술형은 21번 한 문항으로 통째」)
      if (essayQ && !answerImages[essayQ]) {
        const es = items.filter((t) => ESSAY_HEAD.test(t.str) && Math.abs(t.x - colX[colOf(t.x)]) < 14)
        if (es.length) {
          const c0 = colOf(es[0].x)
          const ey = Math.min(...es.map((t) => t.top)) - 2
          const cv = sub(canvas, (cols[c0][0] - 1) * Z, ey * Z, (cols[c0][1] - cols[c0][0] + 1) * Z, (bottom - ey) * Z)
          const gg = cv.getContext('2d', { willReadFrequently: true })!
          const rr = inkRows(gg, cv.width, cv.height)
          const cc = inkCols(gg, cv.width, cv.height)
          if (rr && cc) {
            const ax = Math.max(0, cc[0] - 6), ay = Math.max(0, rr[0] - 6)
            answerImages[essayQ] = sub(cv, ax, ay, Math.min(cv.width, cc[1] + 8) - ax, Math.min(cv.height, rr[1] + 8) - ay)
          }
        }
      }
      continue
    }

    // ── 미주 번호가 하나도 없으면 「1.」 꼴 작업본으로 다시 본다 ──────────────
    // 번호가 수식 글꼴이라 글자로 안 읽히므로 **나온 차례대로** 매긴다. 번호 글자와 그 뒤의
    // 「. 」 까지만 하얗게 지우고 첫 줄부터 자른다 (번호 줄 아래부터 자르면 첫 줄이 날아간다).
    if (!ms.length) {
      for (const c of [0, 1]) {
        const cands = items
          .filter((t) => colOf(t.x) === c && Math.abs(t.x - colX[c]) < 12 && t.base > 100)
          .sort((a, b) => a.base - b.base)
        for (const t of cands) {
          const same = items.filter((o) => o !== t && Math.abs(o.base - t.base) < 3)
          const next = same.filter((o) => o.x >= t.x1 - 1).sort((a, b) => a.x - b.x)[0]
          // ★ 문항 번호는 **그 줄의 맨 앞**에 있다. 왼쪽에 무언가 있으면 번호가 아니다 —
          //   2026-11-17 백양고: 배점 「[4.9점]」이 줄바꿈으로 「[」 만 앞줄에 남고 수식 글꼴 숫자가
          //   단 맨 왼쪽으로 내려와 **9번 문항 번호로 읽혔다.** 그 바람에 8번이 한 줄(39px)로 잘리고,
          //   번호가 차례와 안 맞아(4 ≠ 9) dotOk 가 꺼져 **배점을 하나도 못 읽었다.**
          if (same.some((o) => o.x < t.x - 1 && o.x1 > cols[c][0] - 2)) continue
          // ① 수식 글꼴 번호 + 따로 찍힌 「.」 (신원중 꼴)
          const 번호수식 = PUA.test(t.str) && !!next && next.x < t.x1 + 8 && next.str.startsWith('.')
          // ② 번호와 점이 **한 덩어리**로 그냥 글자인 꼴 (지축중 꼴). 본문 안에도 「12.」 같은
          //    조각이 있을 수 있으니 **미주와 같은 85% 규칙**(limit)으로 가른다 —
          //    이 파일의 번호는 8.6pt, 본문은 11.0pt 라 깨끗이 갈린다. 마지막 정답표 쪽의
          //    「22.」·「23.」 은 본문 크기(11.5pt)여서 여기 안 걸린다.
          // ③ 번호가 본문보다 **큰** 꼴도 있다 (고양시 고1 — 번호 15.0pt · 본문 11.0pt).
          //    작은 쪽만 보면 하나도 안 걸린다. 같은 크기만 아니면 되므로 limit · big 양쪽으로 가른다.
          //    ④ 쪽마다 본문 크기가 달라져 ②·③ 이 뒤집히는 파일이 있다 (능곡고 — 번호는
          //       1~23번 모두 11.03pt 로 일정한데 본문이 11.03 → 9.95 → 8.99 로 바뀐다).
          //       그래서 **문서 한 번으로 정한 번호 꼴**(numStyle)도 같이 본다.
          //    ⑤ 숫자와 점이 **따로** 찍힌 꼴도 있다 — 2026-11-17 덕이고 3번은 「3」(14.03pt) +
          //       「.」(12.95pt) 두 조각이라 「N.」 꼴에 안 걸려 **그 문항이 통째로 빠졌다**
          //       (문항 20 · 정답 21 · 번호가 1, 2, 4, 5 … 로 매겨졌다). 수식 글꼴 꼴(번호수식)과
          //       같은 모양인데 숫자가 그냥 글자인 것이다. 점을 붙여 같은 크기 규칙으로 다시 본다.
          const 쪼갠점 = !!next && next.x < t.x1 + 8 && next.str.startsWith('.') && /^[0-9]{1,3}$/.test(t.str)
          const 글자번호 = dotNumberOf(t.str, t.size, limit, big) ?? styleNumberOf(t.str, t.size, t.fn, numStyle)
            ?? (쪼갠점 ? (dotNumberOf(t.str + '.', t.size, limit, big) ?? styleNumberOf(t.str + '.', t.size, t.fn, numStyle)) : null)
          const 번호글자 = 글자번호 !== null
          const 번호 = 번호수식 || 번호글자
          const 논술 = ESSAY_HEAD.test(t.str)
          if (!번호 && !논술) continue
          // 머리가 「[논술형」 + 「2]」 **두 조각으로 쪼개져** 오는 파일이 있다 (2026-11-17 향동고).
          //   한 조각만 보면 번호가 없는 것으로 읽혀 앞 문항에 붙고, 그 문항이 통째로 사라진다.
          const 머리글 = 논술 ? t.str + ' ' + (next?.str ?? '') : ''
          const 머리번호 = 논술
            ? Number(ESSAY_NO.exec(t.str)?.[1] ?? ESSAY_NO.exec(머리글)?.[1] ?? NaN)
            : NaN
          // 묶음에 딸린 물음(큰 번호가 같거나 번호가 없는 머리) → 앞 문항에 이어 붙인다
          if (논술 && essayRun && (Number.isNaN(머리번호) || 머리번호 === essayMain)) continue
          if (논술) essayMain = 머리번호
          // ★ 「[논술형 1]」 **바로 아래에 번호가 또 있는** 파일이 있다
          //   (2026-11-17 도래울고 · 백신고 · 세원고 · 향동고 — 「[논술형 1]」 다음 줄에 「19.」).
          //   그때 논술형 머리는 **이름표**이고 문항 시작은 번호다. 둘 다 세면 한 문항이 둘이 되어
          //   **번호가 두 칸씩 뛰고**(…18, 20, 22) 앞의 것은 「내용이 없습니다」로 버려진다.
          //   그래서 머리는 세지 않고, 뒤따르는 번호의 그림을 **머리 위부터** 자른다
          //   (이름표가 문제의 일부라서 그림에 들어가야 한다).
          if (논술) {
            const 뒤에번호 = cands.some((o) => o.base > t.base && o.base < t.base + t.size * 5
              && (dotNumberOf(o.str, o.size, limit, big) !== null || styleNumberOf(o.str, o.size, o.fn, numStyle) !== null))
            if (뒤에번호) { essayTop = t.top - 2; continue }
          }
          essayRun = 논술
          dotUsed = true
          // 번호 글자를 숫자표로 읽어 본다 — 차례와 다르면 그 표는 이 파일에 안 맞는 것이다
          if (번호수식) { const read = eqText(t.str); if (read && read !== String(dotNo + 1)) dotOk = false }
          // 글자로 읽힌 번호는 **그 자리에서** 차례와 맞는지 본다 — 어긋나면 단을 잘못 읽은 것이다
          if (번호글자 && 글자번호 !== dotNo + 1) dotOk = false
          // ★ 문항 첫 줄에 **키 큰 수식**(분수·중괄호 묶음)이 오면 그 수식은 번호보다 위로 올라간다.
          //   같은 밑줄(same)만 보면 그 윗부분이 **앞 문항 그림 끝에 붙고 이 문항에서는 잘린다**
          //   (2026-11-17 백양고 9↔10번 — 10번의 「{ √kx … 」 첫 줄이 9번 끝에 붙어 있었다).
          //   그래서 번호 오른쪽에서 **번호 줄에 걸쳐 있는 글자**도 같이 보고 가장 위를 잡는다.
          //   올라가는 높이는 번호 글자의 2.5배까지만 — 앞 문항 끝줄을 삼키지 않게 한다.
          const ceiling = t.top - t.size * 2.5
          //   ★ 번호 **오른쪽**만 본다(o.x >= t.x1). 번호와 같은 자리에서 시작하는 윗줄은
          //     그 문항의 것이 아니다 — 2026-11-17 능곡고·무원고는 1번 번호 15pt 위에
          //     「범위 : 명제 - 무리함수」 안내 줄이 있어서 **1번 그림에 딸려 들어갔다.**
          const tall = items.filter((o) => o !== t && colOf(o.x) === c && o.x >= t.x1 - 1
            && o.top < t.bottom && o.bottom > ceiling && o.base <= t.base + t.size * 0.6)
          let top = Math.max(ceiling, Math.min(t.top, ...same.map((o) => o.top), ...tall.map((o) => o.top))) - 2
          // 바로 위에 논술형 이름표가 있었으면 거기서부터 자른다 (ceiling 막이를 넘어서라도)
          const 쌓인논술 = essayTop !== null && 번호
          if (essayTop !== null && 번호) { top = Math.min(top, essayTop); essayTop = null }
          ms.push({
            no: ++dotNo, col: c, y0: t.top, y1: t.bottom, top,
            // 논술형 줄은 지우지 않는다 (「[논술형 1-1]」 이 문제의 일부다)
            // 번호 글자만 하얀게 지운다. 수식 꼴은 「번호 + 따로 있는 점」, 글자 꼴은 한 덩어리다.
            box: (번호수식 || (번호글자 && 쪼갠점)) ? [t.x, t.top, next!.x + next!.size * 0.45, t.bottom]
              : 번호글자 ? [t.x, t.top, t.x1, t.bottom]
                : undefined,
          })
          if (논술 || 쌓인논술) essayQ = dotNo
        }
      }
      ms.sort((a, b) => a.col - b.col || a.y0 - b.y0)
    }

    // 쪽·단 순서대로 「번호 자리」와 「단 끝」을 한 줄로 늘어놓는다
    const pageRows = inkRows(ctx, canvas.width, canvas.height)
    const bottom = Math.min(vp1.height, (pageRows ? pageRows[1] / Z : vp1.height) + 4, bodyBottom)
    const stream: { c: number; y0: number; y1: number | null; no: number | null; erase?: [number, number, number, number] }[] = []
    for (const c of [0, 1]) {
      const cm = ms.filter((m) => m.col === c).sort((a, b) => a.y0 - b.y0)
      let y = 0
      const startLen = stream.length
      for (const m of cm) {
        const start = m.top ?? m.y1 + 1
        const cut = (m.top ?? m.y0) - 1
        if (cut > y + 1) stream.push({ c, y0: y, y1: cut, no: null })          // 앞 문항의 이어지는 부분
        stream.push({ c, y0: start, y1: null, no: m.no, erase: m.top !== null ? m.box : undefined })   // box 가 없으면 안 지운다
        y = start
      }
      if (stream.length > startLen && stream[stream.length - 1].y1 === null) stream[stream.length - 1].y1 = bottom
      else if (!cm.length) stream.push({ c, y0: 0, y1: bottom, no: null })
    }
    stream.forEach((s, i) => { if (s.y1 === null) { const n = stream[i + 1]; s.y1 = n.no === null ? n.y0 : n.y0 - 8 } })

    for (const s of stream) {
      if (s.no !== null) { cur = { no: s.no, page: pi + 1, parts: [], text: '' }; problems.push(cur) }
      // ★ 번호 글자 지우기는 **높이 막이보다 먼저** 해야 한다.
      //   번호가 붙은 줄(s.no !== null)은 바로 뒤에 오는 「이어지는 부분」과 y 가 같아 높이가 0 이고,
      //   아래 `continue` 에 걸려 **한 번도 지워지지 않았다** — 잘린 그림마다 「1.」 「2.」 가 남았다
      //   (2026-11-17 신원고). 그림은 다음 줄에서 떠 가므로 칠하는 것이 먼저다.
      if (s.erase) {           // 같은 줄에 찍힌 번호 글자를 지운다
        ctx.fillStyle = '#fff'
        ctx.fillRect(Math.floor(s.erase[0] * Z) - 1, Math.floor(s.erase[1] * Z) - 1, Math.ceil((s.erase[2] - s.erase[0]) * Z) + 4, Math.ceil((s.erase[3] - s.erase[1]) * Z) + 3)
      }
      if (!cur || s.y1! - s.y0 < 3) continue
      const [x0, x1] = cols[s.c]
      const y0 = Math.max(s.y0, bodyTop)
      cur.text += ' ' + textIn(items, x0, y0, x1, s.y1!)
      const part = clip(canvas, x0, y0, x1, s.y1!)
      if (part) cur.parts.push(part)
    }
    canvas.width = canvas.height = 0          // 쪽 그림은 바로 버린다 (13쪽이면 200MB 가 넘는다)
  }

  const out: CroppedProblem[] = []
  const essayRanges: [number, number][] = []          // 「[논술형17~20]」 로 알린 서술형 번호 범위
  for (const p of problems) {
    if (!p.parts.length) { warnings.push(`${p.no}번: 내용이 없습니다`); continue }
    const w = Math.max(...p.parts.map((c) => c.width))
    const h = p.parts.reduce((a, c) => a + c.height, 0) + 10 * (p.parts.length - 1)
    const sheet = document.createElement('canvas')
    sheet.width = w; sheet.height = h
    const g = sheet.getContext('2d')!
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h)
    let y = 0
    for (const c of p.parts) { g.drawImage(c, 0, y); y += c.height + 10 }
    const text = dec(p.text).replace(/\s+/g, ' ').trim()
    const pts = pointsOf(text)                                              // [4점] · (4점) · [ 4 . 6 점]
    // 「[논술형17~20]」 같은 묶음 표시는 그 문항이 아니라 뒤 문항들의 것이다 → 떼고 본다
    const own = text.replace(/\[\s*(논술|서술)형\s*\d+\s*[~∼-]\s*\d+\s*\]/g, '')
    for (const r of text.matchAll(/(논술|서술)형\s*(\d+)\s*[~∼-]\s*(\d+)/g)) essayRanges.push([Number(r[2]), Number(r[3])])
    out.push({
      no: p.no, page: p.page, w, h, parts: p.parts.length,
      points: pts,
      essay: /서술|논술|풀이 과정|물음에 답하시오|\[\s*총/.test(own),
      choices: Array.from('①②③④⑤').filter((c) => text.includes(c)).length,
      answer: answers[p.no] ?? null,
      image: sheet,
      answerImage: answerImages[p.no] ?? null,
    })
  }
  for (const p of out) if (essayRanges.some(([a, b]) => a <= p.no && p.no <= b)) p.essay = true
  const nos = out.map((p) => p.no)
  if (!out.length) warnings.push(markShaped
    ? `문항 번호 「1)」 꼴을 ${markShaped}개 찾았지만 문항 시작으로 보지 않았습니다 — 미주 번호가 본문보다 작은지(본문의 85% 미만), 단 맨 왼쪽에 찍혔는지 확인해 주세요.`
    : '문항 번호를 찾지 못했습니다 — 미주 꼴 「1)」 도, 「1.」 꼴도 없습니다. 한글에서 변환한 PDF 인지, 번호가 단 맨 왼쪽에 있는지 확인해 주세요.')
  else if (nos.some((n, i) => n !== i + 1)) warnings.push(`문항 번호가 1부터 이어지지 않습니다: ${nos.join(', ')}`)
  return { pages: doc.numPages, problems: out, answersFound: Object.keys(answers).length, warnings }
}

// 인쇄 1쪽에 들어가는 문항 그림의 최대 세로(175mm). 넘으면 줄여서 올린다 — 인쇄 화면은 「px ÷ 200dpi」 크기 그대로 찍는다
const MAX_PX = Math.floor((175 / 25.4) * DPI)
export function toPngBase64(c: HTMLCanvasElement, fit = false): string {
  let src = c
  if (fit && c.height > MAX_PX) {
    src = document.createElement('canvas')
    src.height = MAX_PX; src.width = Math.round((c.width * MAX_PX) / c.height)
    const g = src.getContext('2d')!
    g.imageSmoothingQuality = 'high'
    g.drawImage(c, 0, 0, src.width, src.height)
  }
  return src.toDataURL('image/png').split(',')[1]
}
