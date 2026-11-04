/**
 * 월간보고서의 **학원 코어테스트** 칸이 맞게 나오는지 시험한다.
 *
 * 왜 필요한가 (원장님 2026-11-04)
 *   「월간보고서에는 학원 코어테스트 예비1회, 예비2회, 본고사 이거 추가하자.
 *   영역별 성취도는 굳이 필요없으니 그자리에 대체할께」
 *
 *   회차를 잘못 짝지으면 **학부모님이 다른 회차 점수를 보신다.** 에러는 안 난다.
 *   실제 자료에 제목 띄어쓰기가 들쭉날쭉하고(「예비 1회」/「예비1회」), 제목이 빈 줄도 있다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/monthly-core-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/monthlyReport.ts')
const { pickCoreTests, backDays, CORE_ROUNDS, CORE_WINDOW_DAYS } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const R = (title: any, date: string, score: number | null, totalScore: number | null = 100) =>
  ({ title, exam_date: date, score, total_score: totalScore })

T('세 회차를 늘 같은 순서로 보여 준다', () => {
  const got = pickCoreTests([])
  return got.length === 3 && got[0].round === '예비 1회' && got[1].round === '예비 2회'
    && got[2].round === '본고사' && got.every((c: any) => c.score === null)
    && CORE_ROUNDS.length === 3
})

T('회차마다 점수와 본 날짜를 가져온다', () => {
  const got = pickCoreTests([R('예비 1회', '2026-10-22', 88), R('본고사', '2026-11-03', 92)])
  return got[0].score === 88 && got[0].date === '2026-10-22'
    && got[1].score === null && got[2].score === 92 && got[2].date === '2026-11-03'
})

// ★ 실제 자료에 「예비 1회」와 「예비1회」가 둘 다 있다 — 띄어쓰기로 갈리면 안 된다.
T('제목 띄어쓰기가 달라도 같은 회차로 본다', () => {
  const got = pickCoreTests([R('예비1회', '2026-10-16', 75), R('예비 2회', '2026-10-27', 80)])
  return got[0].score === 75 && got[1].score === 80
})

// ★ 같은 회차를 두 번 봤으면 **나중 것**이다. 옛 점수를 보여 주면 안 된다.
T('같은 회차가 여럿이면 가장 나중에 본 것', () => {
  const got = pickCoreTests([R('본고사', '2026-08-01', 60), R('본고사', '2026-11-03', 95)])
  return got[2].score === 95 && got[2].date === '2026-11-03'
})

T('날짜 순서가 뒤섞여 들어와도 맞게 고른다', () => {
  const got = pickCoreTests([R('본고사', '2026-11-03', 95), R('본고사', '2026-08-01', 60)])
  return got[2].score === 95
})

// ★ 제목이 빈 줄이 25건 있다(실측). 어느 회차인지 알 수 없으므로 **버린다** —
//   아무 회차에나 끼워 넣으면 틀린 점수를 학부모님이 보신다.
T('제목이 없는 줄은 어느 회차에도 넣지 않는다', () =>
  pickCoreTests([R(null, '2026-11-03', 99), R('', '2026-11-02', 50)]).every((c: any) => c.score === null))

T('0점도 점수로 센다 (빈 것과 다르다)', () =>
  pickCoreTests([R('본고사', '2026-11-03', 0)])[2].score === 0)

T('만점이 100이 아니면 그 값도 들고 온다', () => {
  const got = pickCoreTests([R('본고사', '2026-11-03', 18, 20)])
  return got[2].score === 18 && got[2].total === 20
})

T('며칠 전 날짜를 밀리지 않게 센다', () =>
  backDays('2026-11-04', 120) === '2026-07-07' && CORE_WINDOW_DAYS === 120)

// ── 화면이 실제로 바뀌었는지 ───────────────────────────────────────────────
T('보고서 화면에서 영역별 성취도가 빠지고 코어테스트가 들어갔다', () => {
  const src = fs.readFileSync(path.resolve('components/report/MonthlyReport.tsx'), 'utf8')
  // ★ 「영역별 성취도」라는 글자는 주석(원장님 말씀 인용)에도 있다 — **칸 제목**으로
  //   남아 있는지를 본다. 글자만 세면 주석 때문에 엉뚱하게 실패한다.
  return !src.includes('title="영역별 성취도"') && !src.includes('d.areas')
    && src.includes('title="학원 코어테스트"') && src.includes('d.coreTests')
})

T('자료 쪽에도 areas 가 남아 있지 않다', () => {
  const src = fs.readFileSync(path.resolve('lib/monthlyReport.ts'), 'utf8')
  return !/\bareas\b/.test(src) && src.includes('coreTests')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
