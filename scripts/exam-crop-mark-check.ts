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
const { markLimit, answerBelow } = (await import(pathToFileURL(libPath).href)) as {
  markLimit: (s: number[]) => number
  answerBelow: (base: number, size: number, bases: number[], y1: number) => boolean
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
}

console.log(`\n통과 ${pass} / 전체 ${all}`)
process.exitCode = pass === all ? 0 : 1
