/**
 * 기출유사 결과 읽는 규칙(lib/pastExamSimilar.ts)이 **제대로 읽는지** 가짜 글자로 시험한다.
 *
 * 왜 필요한가
 *   한 줄에 여러 사람이 오고 줄 끝 숫자가 그 줄 사람들 전부에게 걸린다. 한 명을 빠뜨려도
 *   **에러가 안 난다** — 그 학생만 조용히 기록이 없고, 아무도 모른다. 그래서 값을 하나하나
 *   대조한다. 학생 실명은 쓰지 않는다(가상 이름).
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/past-exam-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/past-exam-check.ts <다른 pastExamSimilar.ts 경로>
 *     ↑ 일부러 틀리게 고친 사본을 넣으면 **실패해야** 한다.
 */
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/pastExamSimilar.ts')
const { parsePastExamSimilar, examRowFor, memoLineFor } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) }
  else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

// ── 2026-10-24 에 실제로 받은 글의 **생김새 그대로**, 이름만 가상 ────────────────
//    줄 끝 공백(3틀림 줄)·빈 줄·머리줄 꼴을 그대로 둔다. 거기서 실제로 걸렸다.
const REAL = `[2024 백마중학교 기출유사 총 24문항]

가나다 -0
라마바 사아자 차카타 파하가 거너더 러머버 서어저 처커터 퍼허거 -1
나다라 -2
마바사 아자차 카타파 하가나 -3
다라마 바사아 -5`

const r = parsePastExamSimilar(REAL)

T('머리줄에서 제목과 문항 수를 가른다 (학교는 「백마중」으로 줄인다)', () =>
  r.blocks.length === 1 && r.blocks[0].title === '2024 백마중 기출유사' && r.blocks[0].total === 24)

T('17명을 전부 읽는다 (한 줄에 여럿이 와도)', () => r.blocks[0].rows.length === 17)

T('줄 끝 숫자가 그 줄 사람들 **전부**에게 걸린다', () => {
  const by = (n: string) => r.blocks[0].rows.find((x: any) => x.name === n)?.wrong
  return by('가나다') === 0 && by('라마바') === 1 && by('파하가') === 1
    && by('나다라') === 2 && by('하가나') === 3 && by('바사아') === 5
})

T('줄 끝 공백이 있어도 읽는다 (3틀림 줄이 그랬다)', () =>
  r.blocks[0].rows.filter((x: any) => x.wrong === 3).length === 4)

T('못 읽은 줄이 하나도 없다', () => r.skipped.length === 0)

T('틀린 개수를 맞은 개수로 바꿔 넣는다 (화면이 맞은/총으로 퍼센트를 낸다)', () => {
  const b = r.blocks[0]
  const e0 = examRowFor(b, b.rows.find((x: any) => x.name === '가나다'))
  const e5 = examRowFor(b, b.rows.find((x: any) => x.name === '바사아'))
  return e0.score === 24 && e0.total_score === 24
    && e5.score === 19 && e5.total_score === 24
    && e0.exam_type === '진단평가' && e0.title === '2024 백마중 기출유사'
})

T('메모 한 줄은 틀린 개수로 적는다', () => {
  const b = r.blocks[0]
  return memoLineFor(b, b.rows.find((x: any) => x.name === '마바사'))
    === '2024 백마중 기출유사 24문항 중 3개 틀렸습니다.'
})

// ── 여러 학교를 이어 붙여도 갈라 읽는다 ───────────────────────────────────────
T('학교가 둘이면 둘로 가른다', () => {
  const two = parsePastExamSimilar(
    '[2024 가람중학교 기출유사 총 20문항]\n가나 -1\n\n[2023 나래고등학교 기출유사 총 30문항]\n다라 -4')
  return two.blocks.length === 2
    && two.blocks[0].title === '2024 가람중 기출유사' && two.blocks[0].total === 20
    && two.blocks[1].title === '2023 나래고 기출유사' && two.blocks[1].total === 30
    && two.blocks[1].rows[0].wrong === 4
})

// ── 틀린 글은 **조용히 버리지 않는다** ────────────────────────────────────────
T('문항 수가 없는 머리줄은 이유를 적어 남긴다', () => {
  const x = parsePastExamSimilar('[2024 가람중 기출유사]\n가나 -1')
  return x.blocks.length === 0 && x.skipped.length === 2
    && x.skipped[0].why.includes('총 몇 문항')
})

T('머리줄 없이 사람만 있으면 남긴다', () => {
  const x = parsePastExamSimilar('가나 -1')
  return x.blocks.length === 0 && x.skipped.length === 1 && x.skipped[0].why.includes('머리줄')
})

T('줄 끝에 「-개수」가 없으면 남긴다', () => {
  const x = parsePastExamSimilar('[2024 가람중 기출유사 총 20문항]\n가나 나다\n라마 -2')
  return x.blocks[0].rows.length === 1
    && x.skipped.length === 1 && x.skipped[0].why.includes('-틀린개수')
})

T('틀린 개수가 총 문항보다 많으면 넣지 않고 남긴다', () => {
  const x = parsePastExamSimilar('[2024 가람중 기출유사 총 20문항]\n가나 -21')
  return x.blocks.length === 0 && x.skipped.some((s: any) => s.why.includes('많아요'))
})

T('사람이 없는 머리줄은 들고 다니지 않는다 (붙여넣다 끊긴 것)', () => {
  const x = parsePastExamSimilar('[2024 가람중 기출유사 총 20문항]')
  return x.blocks.length === 0 && x.skipped.some((s: any) => s.why.includes('적힌 사람이 없어요'))
})

T('동명이인 꼬리가 붙은 이름을 그대로 들고 간다', () => {
  const x = parsePastExamSimilar('[2024 가람중 기출유사 총 20문항]\n가나다j 가나다2 -1')
  return x.blocks[0].rows.map((p: any) => p.name).join(',') === '가나다j,가나다2'
})

T('0개 틀림도 기록한다 (빼먹으면 만점이 사라진다)', () => {
  const x = parsePastExamSimilar('[2024 가람중 기출유사 총 20문항]\n가나 -0')
  return x.blocks[0].rows[0].wrong === 0 && examRowFor(x.blocks[0], x.blocks[0].rows[0]).score === 20
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
