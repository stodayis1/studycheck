/**
 * 월간보고서의 **학원 코어테스트 누적 막대그래프**가 맞게 나오는지 시험한다.
 *
 * 왜 필요한가 (원장님 2026-11-04)
 *   「코어테스트 이전 기록도 다 나와야지 누적으로. 해당년도는 누적으로 막대그래프로 보여줘.
 *   예비랑, 본고사 구별해서. 누적이 될수록 막대그래프 두께는 얇아지겠지만 그래도
 *   변화추이를 볼수 있어야돼」
 *
 *   막대 하나를 빠뜨리거나 두 번 세우면 **학부모님이 다른 추이를 보신다.** 에러는 안 난다.
 *   실제 자료의 함정 세 가지를 그대로 시험한다 —
 *     ① 제목 띄어쓰기가 들쭉날쭉하다 (「예비 1회」/「예비1회」)
 *     ② 제목이 빈 줄이 25건 있다 (버리면 추이에 구멍이 난다)
 *     ③ 같은 날 같은 회차가 두 번 적힌 것이 17묶음 있다 (막대가 둘이 되면 안 된다)
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/monthly-core-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/monthlyReport.ts')
const { coreYearRows, coreSummaryOf, coreRoundOf, yearStart } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
/** 한 줄 — (제목, 본 날, 점수, 만점, 적은 때) */
const R = (title: any, date: string, score: number | null, totalScore: number | null = 100, at = '') =>
  ({ title, exam_date: date, score, total_score: totalScore, created_at: at })

const 한바퀴 = [
  R('예비 1회', '2026-05-11', 70), R('예비 2회', '2026-05-18', 80), R('본고사', '2026-05-28', 90),
]

T('그 해 본 것이 하나도 안 빠지고 날짜 순으로 나온다', () => {
  const got = coreYearRows(한바퀴)
  return got.length === 3 && got.map((c: any) => c.date).join() === '2026-05-11,2026-05-18,2026-05-28'
    && got.map((c: any) => c.pct).join() === '70,80,90'
})

T('날짜가 뒤섞여 들어와도 날짜 순으로 세운다', () => {
  const got = coreYearRows([...한바퀴].reverse())
  return got.map((c: any) => c.date).join() === '2026-05-11,2026-05-18,2026-05-28'
})

// ★ 한 해에 한 바퀴가 두 번 이상 돈다 — 회차 이름만 보면 서로 덮어쓴다.
T('같은 회차를 다음 바퀴에 또 봐도 막대가 둘이다', () => {
  const got = coreYearRows([...한바퀴, R('본고사', '2026-10-30', 95)])
  const 본고사 = got.filter((c: any) => c.kind === '본고사')
  return got.length === 4 && 본고사.length === 2
    && 본고사[0].pct === 90 && 본고사[1].pct === 95
})

// ★ 실제 자료에 「예비 1회」와 「예비1회」가 둘 다 있다. 띄어쓰기는 어디에 들어가도 안 갈려야 한다.
T('제목 띄어쓰기가 달라도 같은 회차로 읽는다', () =>
  ['예비1회', '예비 1회', ' 예비 1 회 ', '예 비 1회'].every((t) => {
    const g = coreRoundOf(t)
    return g.round === '예비 1회' && g.short === '예비1' && g.kind === '예비'
  }))

T('예비와 본고사를 갈래로 가른다 (색이 갈리는 근거)', () => {
  const got = coreYearRows(한바퀴)
  return got.map((c: any) => c.kind).join() === '예비,예비,본고사'
    && coreRoundOf('본고사').short === '본고사'
})

// ★ 제목이 빈 줄 25건 중 22건은 그날 그 학생의 **유일한** 기록이다 —
//   버리면 변화추이에 구멍이 난다. 다만 어느 회차인지는 지어내지 않는다.
T('제목이 없는 줄도 막대로 세운다 (회차는 지어내지 않는다)', () => {
  const got = coreYearRows([R(null, '2026-05-28', 63), R('', '2026-08-07', 80)])
  return got.length === 2 && got.every((c: any) => c.kind === '기타' && c.round === '회차 미기재')
    && got[0].pct === 63
})

// ★ 같은 날 같은 회차가 두 번 적힌 것이 17묶음 있다(그중 6묶음은 점수도 다르다).
//   막대를 둘로 세우면 두 번 본 것으로 읽힌다.
T('같은 날 같은 회차가 두 번 적혀 있으면 하나만 세운다', () => {
  const got = coreYearRows([R('본고사', '2026-10-29', 76, 100, '2026-10-29T10:00:00Z'),
                            R('본고사', '2026-10-29', 80, 100, '2026-10-29T18:00:00Z')])
  return got.length === 1 && got[0].pct === 80   // 나중에 적은 것(재채점)
})

T('나중에 적은 것이 먼저 들어와도 나중 것을 쓴다', () => {
  const got = coreYearRows([R('본고사', '2026-10-29', 80, 100, '2026-10-29T18:00:00Z'),
                            R('본고사', '2026-10-29', 76, 100, '2026-10-29T10:00:00Z')])
  return got.length === 1 && got[0].pct === 80
})

// ★ 같은 날 예비 1회·2회를 몰아 보는 일이 있다(실측 9/16). 이건 둘 다 남아야 한다.
T('같은 날 회차가 다르면 둘 다 세운다', () => {
  const got = coreYearRows([R('예비 1회', '2026-09-16', 57), R('예비 2회', '2026-09-16', 87)])
  return got.length === 2 && got.map((c: any) => c.pct).join() === '57,87'
})

T('점수가 없는 줄은 막대로 세우지 않는다', () =>
  coreYearRows([R('본고사', '2026-05-28', null), R('예비 1회', '', 70)]).length === 0)

T('0점도 점수로 센다 (빈 것과 다르다)', () => {
  const got = coreYearRows([R('본고사', '2026-05-28', 0)])
  return got.length === 1 && got[0].pct === 0
})

T('만점이 100이 아니면 100점으로 환산해 막대 높이를 잡는다', () => {
  const got = coreYearRows([R('본고사', '2026-05-28', 18, 20)])
  return got[0].pct === 90 && got[0].score === 18 && got[0].total === 20
})

T('막대 밑에 적을 날짜를 「5/11」 꼴로 만든다', () =>
  coreYearRows([R('본고사', '2026-05-11', 90)])[0].dateLabel === '5/11')

T('그 해 1월 1일부터 모은다', () =>
  yearStart('2026-11-04') === '2026-01-01' && yearStart('2027-01-31') === '2027-01-01')

T('한 줄 요약 — 몇 회·평균·최고·처음→마지막', () => {
  const s = coreSummaryOf(coreYearRows([...한바퀴, R('본고사', '2026-10-30', 95)]))
  return s.count === 4 && s.avg === 84 && s.best === 95 && s.first === 70 && s.last === 95
})

T('예비와 본고사 평균을 따로 낸다', () => {
  const s = coreSummaryOf(coreYearRows([...한바퀴, R('본고사', '2026-10-30', 100)]))
  return s.preAvg === 75 && s.mainAvg === 95
})

T('기록이 없으면 요약이 빈 값이다 (0점과 다르다)', () => {
  const s = coreSummaryOf([])
  return s.count === 0 && s.avg === null && s.best === null && s.preAvg === null
})

// ── 화면이 실제로 그렇게 그리는지 ─────────────────────────────────────────
T('보고서 화면이 막대그래프를 그린다 (상자 셋이 아니다)', () => {
  const src = fs.readFileSync(path.resolve('components/report/MonthlyReport.tsx'), 'utf8')
  // ★ 「영역별 성취도」라는 글자는 주석(원장님 말씀 인용)에도 있다 — **칸 제목**으로
  //   남아 있는지를 본다. 글자만 세면 주석 때문에 엉뚱하게 실패한다.
  return !src.includes('title="영역별 성취도"') && !src.includes('d.areas')
    && src.includes('title="학원 코어테스트"')
    && src.includes('core.map')                 // 회차 셋이 아니라 목록을 돈다
    && src.includes('className="cgplot"')       // 막대가 서는 자리
    && src.includes('cmain')                    // 본고사 색
    && src.includes('cpre')                     // 예비 색
    && src.includes('d.coreSummary')            // 요약 한 줄
})

// ★ 이미 보내 드린 리포트는 그때 모양 그대로 저장돼 있다(report_links.data).
//   옛 스냅샷에는 coreTests 가 없거나 옛 모양이라, 거르지 않으면 **그 링크가 깨진다.**
T('옛 리포트 스냅샷을 만나도 깨지지 않게 걸러 둔다', () => {
  const src = fs.readFileSync(path.resolve('components/report/MonthlyReport.tsx'), 'utf8')
  return /const core = \(d\.coreTests \?\? \[\]\)\.filter\(\(c: any\) => typeof c\?\.pct === 'number'\)/.test(src)
    && src.includes('{core.length > 0 && CS && (')
})

// ★ 폰(375px)에서 16회가 되면 칸이 17px 이 되어 날짜·점수가 잘렸다(실측 2026-11-04).
T('칸이 26px 보다 좁아지지 않게 바닥을 둔다 (좁으면 옆으로 민다)', () => {
  const src = fs.readFileSync(path.resolve('components/report/MonthlyReport.tsx'), 'utf8')
  return /const CGMIN = core\.length \* 26 \+ Math\.max\(0, core\.length - 1\) \* 4/.test(src)
    && (src.match(/style=\{\{ minWidth: CGMIN \}\}/g) ?? []).length === 2   // 그래프와 날짜 줄이 같이 밀려야 한다
    && /\.mr \.cgscroll\{overflow-x:auto/.test(src)
})

T('막대 굵기를 고정하지 않는다 (회가 쌓이면 저절로 얇아져야 한다)', () => {
  const src = fs.readFileSync(path.resolve('components/report/MonthlyReport.tsx'), 'utf8')
  const cgcol = /\.mr \.cgcol\{([^}]*)\}/.exec(src)?.[1] ?? ''
  return /flex:\s*1 1 0/.test(cgcol) && !/(^|;)\s*width:/.test(cgcol)
})

T('자료 쪽에 옛 모양이 남아 있지 않다', () => {
  const src = fs.readFileSync(path.resolve('lib/monthlyReport.ts'), 'utf8')
  return !/\bareas\b/.test(src) && !/pickCoreTests|CORE_ROUNDS|CORE_WINDOW_DAYS/.test(src)
    && src.includes('coreYearRows') && src.includes('coreSummary')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
