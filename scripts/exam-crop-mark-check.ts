/**
 * 시험지 PDF 에서 **미주 번호를 문항 시작으로 볼 것인가**(`markLimit`) 검사.
 *
 * 왜 필요한가
 *   2026-11-09 에 고양중 중1 2025 2학기 기말 PDF 가 11쪽 내내 「문항 번호를 찾지 못했습니다」로
 *   막혔다. 글자층도 있었고 「1)」 도 제 자리에 있었는데, 본문을 크게(11.5pt) 잡아 만든 파일이라
 *   미주가 8.63pt 로 찍혀 **옛 기준(8.5pt 미만)에 한 끗 차이로** 안 걸린 것이다.
 *   실제로 재 보면 미주÷본문 비는 두 파일 모두 0.75 다 — 절대 크기가 아니라 **비**가 규칙이다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-crop-mark-check.ts [다른lib경로]
 *   (일부러 망가뜨린 사본을 경로로 넘기면 **실패해야** 검사다)
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const libPath = path.resolve(process.argv[2] ?? 'lib/examPdfCrop.ts')
const { markLimit, bigLimit, answerBelow, eqText, dotNumberOf, pointsOf, answerHeadPageOf, numberStyleOf, styleNumberOf } = (await import(pathToFileURL(libPath).href)) as {
  markLimit: (s: number[]) => number
  bigLimit: (s: number[]) => number
  answerBelow: (base: number, size: number, bases: number[], y1: number) => boolean
  eqText: (s: string) => string
  dotNumberOf: (str: string, size: number, limit: number, big?: number) => number | null
  pointsOf: (text: string) => number | null
  answerHeadPageOf: (pageTexts: string[]) => number | null
  numberStyleOf: (c: { page: number; col: number; base: number; no: number; size: number; fn: string }[]) => { size: number; fn: string } | null
  styleNumberOf: (str: string, size: number, fn: string, style: { size: number; fn: string } | null) => number | null
}

let pass = 0, all = 0
function ok(말: string, 참: boolean, 덧: string = '') {
  all++; if (참) pass++
  console.log(`${참 ? '✓' : '✗'} ${말}${덧 ? ' — ' + 덧 : ''}`)
}

/** 한 쪽의 글자 크기들을 흉내 낸다 (미주 2개 + 본문 n개) */
const page = (본문: number, 미주: number, n = 40) => [미주, 미주, ...Array(n).fill(본문)]

// ── 실제로 잰 두 파일 ────────────────────────────────────────────────────────
{
  // 고양중 중1 2025 2학기 기말 — 본문 11.5 / 미주 8.63 (2026-11-09 측정). 이게 막혔던 파일이다
  const lim = markLimit(page(11.5, 8.63))
  ok('고양중 중1(본문 11.5) 미주 8.63 이 걸린다', 8.63 < lim, `한계 ${lim.toFixed(2)}`)
  ok('고양중 중1 본문 11.5 는 안 걸린다', !(11.5 < lim), `한계 ${lim.toFixed(2)}`)
}
{
  // 고양중 중3 2026 2학기 중간 — 본문 9.0 / 미주 6.72 (전에 잘 되던 파일). 그대로 돼야 한다
  const lim = markLimit(page(9.0, 6.72))
  ok('고양중 중3(본문 9.0) 미주 6.72 가 걸린다', 6.72 < lim, `한계 ${lim.toFixed(2)}`)
  ok('고양중 중3 본문 9.0 은 안 걸린다', !(9.0 < lim), `한계 ${lim.toFixed(2)}`)
}

// ── 비가 같으면 본문이 커지든 작아지든 같게 돈다 ────────────────────────────
{
  const 모두걸림 = [8, 9, 10, 11.5, 13, 16].every((본문) => {
    const 미주 = 본문 * 0.75
    return 미주 < markLimit(page(본문, 미주))
  })
  ok('본문 8~16pt 어디서나 「본문의 75% 미주」는 걸린다', 모두걸림)
}

// ── 본문과 비슷한 크기의 「10)」 은 문항 시작이 아니다 ──────────────────────
{
  const lim = markLimit(page(11.5, 8.63))
  ok('본문 속 「10)」(11.0pt) 은 안 걸린다', !(11.0 < lim), `한계 ${lim.toFixed(2)}`)
  ok('본문보다 살짝 작은 것(10.5pt)도 안 걸린다', !(10.5 < lim), `한계 ${lim.toFixed(2)}`)
}

// ── 글자층이 없는 쪽 ─────────────────────────────────────────────────────────
ok('글자가 하나도 없으면 옛 기준 8.5 로 돌아간다', markLimit([]) === 8.5)
// 크기가 0 으로 들어오는 조각(안 보이는 글자)이 섞여도 본문 크기를 그대로 읽어야 한다 —
// 안 거르면 가운데값이 0 이 되어 그 쪽 미주가 통째로 사라진다
ok('크기 0 인 조각이 섞여도 본문 크기로 본다', markLimit([0, 0, 0, 0, 9, 9, 9]) === markLimit([9, 9, 9]))

// ── 정답표 쪽(작은 번호만 가득)은 미주로 보지 않는다 ────────────────────────
{
  const 정답표 = Array(30).fill(6.72)          // 번호만 줄줄이
  ok('번호만 가득한 쪽은 미주로 안 본다(정답표 가지로 간다)', !(6.72 < markLimit(정답표)))
}

// ── 정답이 번호 아랫줄에 적힌 서술형 ────────────────────────────────────────
// 2026-11-09 고양중 중1 11쪽에서 실제로 잰 자리 (밑줄 y · 글자 9pt)
{
  const y1 = 700
  ok('18) 「가 × 나」 — 같은 줄로 본다 (첨자가 6.4pt 어긋나 있어도)',
    answerBelow(509.4, 9, [512.2, 515.8, 509.4], y1) === false)
  ok('19) 「△ABD ≡ △ACE」 — 아랫줄로 본다',
    answerBelow(539.0, 9, [553.7, 568.9, 584.0], y1) === true)
  ok('20) — 아랫줄로 본다', answerBelow(607.9, 9, [622.6, 637.7, 652.9], y1) === true)
  // 한 줄짜리 정답도 바로 아랫줄에 적힌다 — 기준을 넓게 잡으면 이것이 「같은 줄」로 밀려 왼쪽이 잘린다
  ok('아랫줄이 한 줄뿐인 정답도 아랫줄로 본다', answerBelow(539.0, 9, [553.7], y1) === true)
  ok('다음 번호 자리(y1) 아래 글자는 내 정답이 아니다', answerBelow(607.9, 9, [700.5, 720.0], 700) === false)
  ok('번호만 있고 아무것도 없으면 아랫줄이 아니다', answerBelow(539.0, 9, [], y1) === false)
}

// ── 글자가 안 남는 정답도 그림으로는 남겨야 한다 (흐름은 글자로 확인한다) ──
{
  const src = fs.readFileSync(libPath, 'utf8')
  ok('글자가 비었다고 그 번호를 통째로 건너뛰지 않는다', !/\n\s*if \(!text\) return\b/.test(src))
  ok('글자가 있을 때만 정답 글자로 적는다', src.includes('if (text) answers[m.no] = text'))
  ok('아랫줄이면 번호를 하얗게 지운다', /if \(below\) \{ g\.fillStyle = '#fff'/.test(src))
  // 정답 그림을 **좌우로도** 바짝 자르는가 — 빈자리를 안고 있으면 어디에 놓아도 글씨가 작아진다
  ok('정답 그림을 위아래·좌우 둘 다 바짝 자른다',
    src.includes('const c2 = inkCols(g, c.width, c.height)') && /if \(r2 && c2\) \{/.test(src))
  ok('세로줄 판(inkCols)이 있다', /function inkCols\(/.test(src))
}

// ── 「1.」 꼴 작업본 (번호·배점이 수식 글꼴이라 글자로 안 읽히는 것) ────────
// 2026-11-10 신원중 중1 2025 2학기 기말이 이 꼴이었다. 숫자표(E034~E03D)가 맞는지는
// **그 파일의 문항 번호가 1,2,3… 으로 읽히는가**로 가린다 — 배점 합이 100점으로 맞았다.
{
  const D = (n: number) => String.fromCharCode(0xe034 + n)      // 0→'1' … 8→'9', 9→'0'
  ok('E034~E03C 가 1~9', eqText(D(0) + D(1) + D(2) + D(8)) === '1239')
  ok('E03D 가 0', eqText(D(9)) === '0')
  ok('두 자리 번호도 읽는다', eqText(D(0) + D(9)) === '10')
  ok('배점 「[3점]」 을 읽는다', eqText('[' + D(2) + '점]') === '[3점]')
  ok('한글·보기 글자는 그대로 둔다', eqText('① 가나 ≡ △') === '① 가나 ≡ △')
  ok('표에 없는 수식 글자는 손대지 않는다', eqText('') === '')
  // ★ 구두점도 수식 글꼴로 찍힌다 — 2026-11-17 정발고 · 풍동고 · 저동고가 「4 ⟪E053⟫ 4 점]」 꼴이었다.
  //   마침표를 안 되살리면 숫자가 이어지지 않아 **그 파일 배점을 하나도 못 읽는다**(세 곳 다 합계 0점이었다).
  //   표가 맞는지는 **배점 합이 100점인가**로 가렸다 — 세 곳 모두 정확히 100점이 됐다.
  ok('E053 이 마침표', eqText(String.fromCharCode(0xe053)) === '.')
  ok('E052 가 쉼표', eqText(String.fromCharCode(0xe052)) === ',')
  ok('정발고 꼴 배점 「4.4점」', eqText('[' + D(3) + String.fromCharCode(0xe053) + D(3) + '점]') === '[4.4점]')
}

// ── 배점 읽기 (pointsOf) ───────────────────────────────────────────────────
// 2026-11-17 백양고: 배점이 조각 다섯 개(「[」「4」「.」「6」「점]」)로 쪼개져 들어와 한 줄로 이어 붙일 때
// 「[ 4 . 6 점]」 처럼 **점 둘레에 빈칸**이 생겼다. 빈칸을 안 봐주면 21문항 배점 합계가 0점이 된다.
// 닫는 괄호를 잘못 친 작업본(「[5.0점[」 — 백양고 12번)도 있어서 닫는 쪽은 너그럽게 본다.
{
  ok('「[3점]」', pointsOf('앞 [3점] 뒤') === 3)
  ok('「(4점)」', pointsOf('앞 (4점) 뒤') === 4)
  ok('「[4.6점]」', pointsOf('앞 [4.6점] 뒤') === 4.6)
  ok('★ 「[ 4 . 6 점]」 — 조각으로 쪼개져 빈칸이 낀 것', pointsOf('의 값은? [ 4 . 6 점]') === 4.6)
  ok('★ 「[ 5 . 0 점[」 — 닫는 괄호를 잘못 친 것', pointsOf('의 값은? [ 5 . 0 점[') === 5)
  ok('배점이 없으면 null', pointsOf('① 3 ② 4 ③ 5') === null)
  ok('「점근선」 처럼 괄호 밖의 「점」 은 안 읽는다', pointsOf('의 그래프의 점근선이다.') === null)
  ok('100점이 넘는 숫자는 배점이 아니다', pointsOf('[120점]') === null)
  ok('0점은 배점이 아니다', pointsOf('[0점]') === null)
}
{
  const src = fs.readFileSync(libPath, 'utf8')
  // 사이 길이를 넉넉히 둔다 — 그 가지 안의 주석이 길어졌다고 검사가 깨지면 안 된다(2026-11-17)
  ok('미주 번호가 하나도 없을 때만 「1.」 꼴로 본다', /if \(!ms\.length\) \{[\s\S]{0,1400}PUA\.test/.test(src))
  ok('번호가 차례와 다르면 숫자표를 안 쓴다', src.includes('if (read && read !== String(dotNo + 1)) dotOk = false'))
  // 배점 「[4.9점]」이 줄바꿈으로 단 맨 왼쪽에 내려오면 번호로 읽혔다 (2026-11-17 백양고)
  ok('줄 맨 앞이 아닌 숫자는 문항 번호가 아니다', src.includes('if (same.some((o) => o.x < t.x - 1 && o.x1 > cols[c][0] - 2)) continue'))
  // 「1. 정답 ④ 해설…」 에서 정답만 남긴다 (백양고). 안 떼면 해설이 통째로 정답이 된다
  // 「정답 ④ …」(백양고) · 「[정답] ④ …」(풍동고) 둘 다 떼야 동그라미만 남는다
  ok('「정답」이라고 적힌 말을 떼고 동그라미만 남긴다', src.includes('(정답|답)') && src.includes('〔<(]?'))
  // 첫 줄에 키 큰 수식(분수·중괄호)이 오면 번호보다 위로 올라간다 — 그 윗부분이 앞 문항에 붙으면 안 된다
  ok('문항 첫 줄의 키 큰 수식까지 이 문항으로 본다', src.includes('const ceiling = t.top - t.size * 2.5') && src.includes('...tall.map((o) => o.top)'))
  ok('올라가는 높이를 번호 글자의 2.5배로 막는다', src.includes('Math.max(ceiling, Math.min(t.top'))
  ok('숫자표는 맞을 때만 쓴다', src.includes('dotUsed && dotOk ? eqText(t) : t'))
  // 배점 규칙은 **한 함수**로 둔다 — 자르는 자리에 정규식을 또 적으면 crop.py 와 어긋난다
  ok('배점은 pointsOf 한 곳에서 읽는다', src.includes('const pts = pointsOf(text)'))
  ok('논술형 묶음은 한 문항으로 붙인다', src.includes('if (논술 && essayRun) continue'))
  ok('되풀이되는 머리말·쪽 번호를 뺀다', src.includes('!isRunning(t) && t.base > topBand && t.base < botBand'))
  ok('맨 아래 「※ 확인사항」 은 문항에 안 넣는다', src.includes('/^※/.test(t.str)'))
  ok('정답표는 「1)」 과 「1.」 두 꼴을 다 읽는다', src.includes('[`${want})`, `${want}.`]'))
}

// ★ 「12.」 꼴 — 번호와 점이 한 덩어리로 그냥 글자인 작업본 (2026-11-14 지축중 중1 2025 2학기 기말).
//   그 파일을 재 값을 그대로 쓴다 — 본문 11.04pt · 문항 번호 8.6pt · 정답표 쪽 「22.」 11.5pt.
{
  const B = 11.04, N = 8.6, A = 11.5
  const lim = markLimit([B, B, B, N, B, B, B])
  ok('지축중 꼴 「1.」 을 문항 번호로 읽는다', dotNumberOf('1.', N, lim) === 1, `한계 ${lim.toFixed(2)}pt`)
  ok('두 자리 번호도 읽는다', dotNumberOf('23.', N, lim) === 23)
  ok('본문 크기의 「22.」 는 문항 번호가 아니다(정답표 쪽)', dotNumberOf('22.', A, lim) === null)
  ok('「1. ⑤」 처럼 뒷말이 붙으면 아니다', dotNumberOf('1. ⑤', N, lim) === null)
  ok('미주 꼴 「1)」 은 여기서 안 읽는다', dotNumberOf('1)', N, lim) === null)
  ok('네 자리 숫자는 문항 번호로 안 본다', dotNumberOf('2025.', N, lim) === null)
}

// ★ 번호가 본문보다 **큰** 작업본 (2026-11-17 고양시 고1 공통수학2 25개교).
//   그 파일을 재 값 그대로 — 본문 11.03pt · 문항 번호 14.99pt · 해설 쪽 번호 8.75pt.
{
  const B = 11.03, N = 14.99, H = 8.75
  const sizes = [B, B, B, B, N, H, B, B]
  const lim = markLimit(sizes), big = bigLimit(sizes)
  ok('고양시 꼴 — 본문보다 큰 「1.」 을 문항 번호로 읽는다', dotNumberOf('1.', N, lim, big) === 1, `작은한계 ${lim.toFixed(2)} · 큰한계 ${big.toFixed(2)}pt`)
  ok('해설 쪽의 작은 「1.」 도 (작은 쪽 규칙으로) 읽힌다', dotNumberOf('1.', H, lim, big) === 1)
  ok('본문과 같은 크기의 「12.」 는 문항 번호가 아니다', dotNumberOf('12.', B, lim, big) === null)
  ok('큰한계를 안 주면 큰 번호는 안 읽힌다(옛 규칙 그대로)', dotNumberOf('1.', N, lim) === null)
  ok('지축중 꼴(작은 번호)은 큰한계가 있어도 그대로 읽힌다', dotNumberOf('1.', 8.6, markLimit([11.04, 11.04, 8.6, 11.04]), bigLimit([11.04, 11.04, 8.6, 11.04])) === 1)
}

{
  const src2 = fs.readFileSync(libPath, 'utf8')
  ok('「1.」 꼴 가지가 수식 글꼴도 그냥 글자도 받는다', src2.includes('const 번호 = 번호수식 || 번호글자'))
  ok('글자 번호는 크기로 가른다(작은 쪽·큰 쪽 둘 다)', src2.includes('dotNumberOf(t.str, t.size, limit, big)'))
  // 문제 쪽이 「정답표 쪽」으로 걸리면 그 뒤가 통째로 정답이 된다 — 큰 번호는 정답표 줄로 세지 않는다
  ok('큰 번호는 정답표 줄로 세지 않는다', src2.includes('const lineStarts = items.filter') && src2.includes('&& !(t.size > big))'))
  ok('글자 번호는 번호 덩어리만 지운다', src2.includes('번호글자 ? [t.x, t.top, t.x1, t.bottom]'))
}

// 「정답 및 해설」 머리가 정답 시작을 정한다 (2026-11-17 능곡고 · 백마고).
//   두 파일은 문항 번호가 본문보다 작아(8.27pt) 문제 1쪽이 「정답표」로 오판됐고,
//   거기서 inAnswers 가 켜져 **문항이 0** 이었다. 머리말은 25개교 전부에 있었다.
{
  const 문제쪽 = '능곡고등학교 2025년 1학년 2학기 기말고사 1. 다음 명제의 역이 참일 때'
  const 해설쪽 = '능곡고등학교 1학년 정답 및 해설 1. 정답 ④ 는 항등함수이므로'
  ok('「정답 및 해설」 머리가 있는 쪽을 찾는다', answerHeadPageOf([문제쪽, 문제쪽, 해설쪽, 해설쪽]) === 2)
  ok('머리가 없으면 null (신원중 꼴은 전처럼 어림짐작)', answerHeadPageOf([문제쪽, 문제쪽]) === null)
  ok('「정답과 해설」 도 받는다', answerHeadPageOf([문제쪽, '정답과 해설']) === 1)
  ok('「정답해설」 처럼 붙여 쓴 것도 받는다', answerHeadPageOf(['정답해설']) === 0)
  ok('띄어 쓴 「정 답  및  해 설」 도 받는다', answerHeadPageOf(['정 답  및  해 설']) === 0)
  ok('문제 쪽의 「정답을 쓰시오」 는 안 걸린다', answerHeadPageOf(['다음 물음에 답하고 정답을 쓰시오']) === null)
  ok('「해설」만 있는 쪽도 안 걸린다', answerHeadPageOf(['해설 강의 안내']) === null)
  ok('첫 쪽에 머리가 있으면 0 (0 과 null 을 섞지 않는다)', answerHeadPageOf(['정답 및 해설', '뒷쪽']) === 0)
}

{
  const src3 = fs.readFileSync(libPath, 'utf8')
  ok('머리가 있으면 그 쪽부터 정답으로 본다', src3.includes('const 머리로정답 = answerHeadPage !== null && pi >= answerHeadPage'))
  // 머리와 어림짐작을 **섞어** 쓰면 머리보다 앞쪽에서 잘못 켜진다 — 머리가 없을 때만 어림짐작이다
  ok('어림짐작은 머리가 없을 때만 쓴다', src3.includes('const 어림짐작정답 = answerHeadPage === null'))
  ok('정답 시작 판정에 둘 다 들어간다', src3.includes('if (inAnswers || 머리로정답 || 어림짐작정답) {'))
}

// 번호 꼴은 **문서 한 번**으로 정한다 (2026-11-17 능곡고 · 무원고).
//   능곡고는 번호가 1~23번 모두 11.03pt 로 일정한데 본문이 쪽마다 11.03 → 9.95 → 8.99 로
//   바뀌어, 「본문보다 작거나 크다」 규칙이 쪽마다 뒤집혔다 (23개 중 4개만 걸렸다).
{
  const 번호 = (page: number, col: number, base: number, no: number, size: number, fn: string) =>
    ({ page, col, base, no, size, fn })
  // 능곡고 꼴 — 1쪽 왼단 1,2,3 · 오른단 4,5,6 · 2쪽 왼단 7,8,9 …
  const 능곡: any[] = []
  let n = 0
  for (let p = 0; p < 4; p++) for (const c of [0, 1]) for (let k = 0; k < 3; k++) 능곡.push(번호(p, c, 100 + k * 50, ++n, 11.03, 'g_d0_f3'))
  const st = numberStyleOf(능곡)
  ok('이어지는 묶음을 번호 꼴로 고른다', !!st && Math.abs(st.size - 11.03) < 0.01 && st.fn === 'g_d0_f3', String(st && st.size))
  ok('그 꼴이면 본문과 같은 크기여도 번호로 읽는다', styleNumberOf('7.', 11.03, 'g_d0_f3', st) === 7)
  ok('글꼴이 다르면 번호가 아니다 (본문 속 「12.」)', styleNumberOf('12.', 11.03, 'g_d0_f2', st) === null)
  ok('크기가 다르면 번호가 아니다', styleNumberOf('7.', 9.95, 'g_d0_f3', st) === null)
  ok('꼴을 못 정했으면(null) 아무것도 읽지 않는다', styleNumberOf('7.', 11.03, 'g_d0_f3', null) === null)
  ok('「7)」 꼴은 이 가지로 안 읽는다', styleNumberOf('7)', 11.03, 'g_d0_f3', st) === null)

  // 1 부터 시작하지 않으면 번호 꼴이 아니다 (해설 쪽의 중간 번호 묶음)
  ok('1 부터가 아니면 안 고른다', numberStyleOf(능곡.slice(3)) === null)
  // 끊기면 안 고른다
  const 끊김 = 능곡.filter((c) => c.no !== 5)
  ok('번호가 끊기면 안 고른다', numberStyleOf(끊김) === null)
  // 다섯 개 아래면 안 고른다 (우연히 이어진 「1. 2. 3.」 목록)
  ok('넷뿐이면 안 고른다', numberStyleOf(능곡.slice(0, 4)) === null)
  // 두 묶음이 다 이어지면 **긴 쪽**을 쓴다
  const 짧은묶음 = Array.from({ length: 6 }, (_, i) => 번호(9, 0, 100 + i * 20, i + 1, 8.75, 'g_d0_f9'))
  const 고름 = numberStyleOf([...짧은묶음, ...능곡])
  ok('두 묶음이 다 이어지면 긴 쪽을 쓴다', !!고름 && 고름.fn === 'g_d0_f3')
  ok('빈 목록이면 null', numberStyleOf([]) === null)
}

{
  const src4 = fs.readFileSync(libPath, 'utf8')
  ok('번호 꼴을 정답 머리 앞쪽 후보로만 정한다', src4.includes('numCands.filter((c) => answerHeadPage === null || c.page < answerHeadPage)'))
  ok('크기 규칙으로 못 읽은 번호를 문서 꼴로 다시 읽는다', src4.includes('?? styleNumberOf(t.str, t.size, t.fn, numStyle)'))
  ok('글자 조각이 글꼴 이름을 들고 다닌다', src4.includes('fn: String(it.fontName'))
}

// 「[논술형 1]」 바로 아래에 번호가 또 있으면 **한 문항**이다
//   (2026-11-17 도래울고 · 백신고 · 세원고 — 번호가 …18, 20, 22 로 두 칸씩 뛰고
//    사이 번호는 「내용이 없습니다」로 버려졌다. 서술형 문항이 통째로 사라진 것이다.)
{
  const src5 = fs.readFileSync(libPath, 'utf8')
  ok('논술형 머리 뒤에 번호가 있으면 머리를 세지 않는다', src5.includes('if (뒤에번호) { essayTop = t.top - 2; continue }'))
  ok('뒤를 다섯 줄 높이까지만 본다', src5.includes('o.base < t.base + t.size * 5'))
  ok('그 번호 그림은 이름표 위부터 자른다', src5.includes('top = Math.min(top, essayTop); essayTop = null'))
  ok('이름표가 붙은 문항도 서술형으로 센다', src5.includes('if (논술 || 쌓인논술) essayQ = dotNo'))
  // 머리가 혼자 있는 파일(번호 없는 묶음)은 전처럼 머리가 문항 시작이다
  ok('번호 없는 논술형 묶음은 전처럼 머리가 문항 시작', src5.includes('if (논술 && essayRun) continue'))
}

console.log(`\n통과 ${pass} / 전체 ${all}`)
process.exitCode = pass === all ? 0 : 1
