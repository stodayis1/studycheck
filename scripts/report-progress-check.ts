/**
 * 월간보고서 「진도」 칸 — 교재 진도율이 맞게 나오는지 시험한다. (원장님 2026-11-05)
 *
 * 왜 필요한가
 *   「현재 진행하고 있는 교재의 진도율과 지금까지 완료한 교재정도만 01번 진도칸에」
 *
 *   ★ 진도율은 **틀려도 에러가 안 난다.** 학부모님은 그 숫자를 그대로 믿으신다 —
 *     ① 선생님 화면은 75% 인데 집에 간 보고서는 60% (셈법이 갈림)
 *     ② 아직 안 적은 교재가 **0%** 로 나감 (「하나도 안 했다」는 말이 된다)
 *     ③ 교재 구분이 없던 예전 체크를 안 세서 오래된 학생이 통째로 0%
 *     ④ 개념을 1000행에 잘려 읽어 분모가 줄어듦
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/report-progress-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/bookProgress.ts')
const { bookRate, bookStyle, bookOrder } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

const C = (id: string, grade = '초6', semester: number | null = 2) => ({ id, grade, semester })
const 개념들 = [C('c1'), C('c2'), C('c3'), C('c4'), C('c5')]          // 초6-2 다섯 개
const 남의것 = [C('x1', '초6', 1), C('x2', '중1', 2)]
const 책 = (over: any = {}) => ({
  id: 'tb1', textbook_name: '개념+유형라이트', textbook_type: '개념서',
  grade: '초6', semester: 2, status: 'assigned', progress_percent: null, ...over,
})
const 체크 = (concept_id: string, student_textbook_id: string | null = 'tb1', check_count = 1) =>
  ({ concept_id, student_textbook_id, check_count })

T('연산서는 선생님이 적어 둔 달성률을 쓴다', () => {
  const r = bookRate(책({ textbook_type: '연산서', progress_percent: 75 }), 개념들, [])
  return r.pct === 75 && r.by === '달성률' && r.total === null
})

// ★ 안 적힌 것을 0% 로 내보내면 「하나도 안 했다」는 말이 된다 (실측: 진행 중 연산서 99권 중 13권이 비어 있다)
T('연산서 달성률이 비어 있으면 0%가 아니라 「모름」', () =>
  bookRate(책({ textbook_type: '연산서', progress_percent: null }), 개념들, []).pct === null)

T('0%는 0%로 센다 (비어 있는 것과 다르다)', () =>
  bookRate(책({ textbook_type: '연산서', progress_percent: 0 }), 개념들, []).pct === 0)

T('달성률이 100을 넘거나 음수면 0~100으로 맞춘다', () =>
  bookRate(책({ textbook_type: '연산서', progress_percent: 120 }), 개념들, []).pct === 100
  && bookRate(책({ textbook_type: '연산서', progress_percent: -5 }), 개념들, []).pct === 0)

T('그 밖의 교재는 개념 몇 개 중 몇 개로 센다', () => {
  const r = bookRate(책(), 개념들, [체크('c1'), 체크('c2'), 체크('c3')])
  return r.pct === 60 && r.done === 3 && r.total === 5 && r.by === '개념'
})

// ★ 교재 구분이 없던 **예전 체크**도 개념서에는 센다 — 안 세면 오래된 학생이 통째로 0% 가 된다.
T('교재 구분이 없던 예전 체크도 개념서에는 센다', () =>
  bookRate(책(), 개념들, [체크('c1', null), 체크('c2', null)]).done === 2)

T('예전 체크를 유형서에는 안 센다 (개념서 것이다)', () =>
  bookRate(책({ textbook_type: '유형서' }), 개념들, [체크('c1', null)]).done === 0)

T('다른 교재에서 한 체크는 안 센다', () =>
  bookRate(책(), 개념들, [체크('c1', 'tb2')]).done === 0)

T('체크를 안 한 줄(check_count 0)은 안 센다', () =>
  bookRate(책(), 개념들, [체크('c1', 'tb1', 0)]).done === 0)

T('같은 개념이 두 줄 있어도 하나로 센다', () =>
  bookRate(책(), 개념들, [체크('c1'), 체크('c1', null)]).done === 1)

T('다른 학년·학기 개념은 분모에 안 넣는다', () => {
  const r = bookRate(책(), [...개념들, ...남의것], [체크('c1')])
  return r.total === 5 && r.pct === 20
})

T('학기가 안 적힌 교재는 그 학년 전부로 센다', () => {
  const r = bookRate(책({ semester: null }), [...개념들, C('c6', '초6', 1)], [])
  return r.total === 6
})

// ★ 그 학년 개념이 아직 안 들어온 교재가 있다(실측 7권). 0% 로 내보내면 안 된다.
T('개념이 아직 없는 교재는 0%가 아니라 「모름」', () =>
  bookRate(책({ grade: '고1' }), 개념들, []).pct === null
  && bookRate(책({ grade: null }), 개념들, []).pct === null)

// ★ 마지막 개념까지 일일이 체크하지 않고 「교재 완료」를 누르는 일이 많다.
T('끝낸 교재는 100%', () => {
  const r = bookRate(책({ status: 'completed' }), 개념들, [체크('c1')])
  return r.pct === 100 && r.done === 5 && r.total === 5
})

T('끝낸 교재는 개념이 없어도 100%', () =>
  bookRate(책({ status: 'completed', grade: '고1' }), 개념들, []).pct === 100)

T('종류마다 색과 짧은 이름이 있다 (선생님 보고서와 같은 색)', () =>
  bookStyle('연산서').short === '연산' && bookStyle('연산서').color === '#7c3aed'
  && bookStyle('개념서').color === '#EF9F27' && bookStyle('유형서').color === '#639922'
  && bookStyle('심화서').color === '#dc2626'
  && bookStyle('듣보서').short === '개념'          // 모르는 종류도 터지지 않는다
  && bookOrder('개념서') < bookOrder('연산서'))

// ── 자료 쪽 ─────────────────────────────────────────────────────────────
T('보고서가 끝낸 교재까지 읽고, 멈춘 교재는 뺀다', () => {
  const s = src('lib/monthlyReport.ts')
  return /\.in\('status', \['assigned', 'completed'\]\)/.test(s)
    && s.includes("books: 진행중") && s.includes('booksDone: 끝낸것')
})

// ★ 개념 926행(2026-11-05) — 전체를 읽으면 곧 1000행에 잘려 **분모가 줄어든다.**
T('개념은 그 학생 교재의 학년 것만 읽는다', () => {
  const s = src('lib/monthlyReport.ts')
  return /from\('concepts'\)\.select\('id, grade, semester'\)\.in\('grade', 학년들\)/.test(s)
})

// ★ 한 학생 개념 체크가 최대 887줄이다(실측). 한 번에 읽으면 곧 잘린다.
T('개념 체크는 끝까지 읽는다 (fetchAllRows · order)', () => {
  const s = src('lib/monthlyReport.ts')
  return /fetchAllRows\(\(\) => db\.from\('progress_checks'\)[\s\S]{0,200}?\.order\('id'\)\)/.test(s)
})

// ── 화면 쪽 ─────────────────────────────────────────────────────────────
T('보고서 화면이 막대를 그린다 (교재 이름만 늘어놓지 않는다)', () => {
  const s = src('components/report/MonthlyReport.tsx')
  return s.includes('function BookBar') && s.includes('className="bkbar"')
    && s.includes('books.map') && s.includes('지금까지 끝낸 교재')
})

T('진도율을 모르거나 0%면 막대를 안 그린다 (0% 막대는 거짓말이다)', () => {
  const s = src('components/report/MonthlyReport.tsx')
  return /const 모름 = typeof b\?\.pct !== 'number'/.test(s)
    && /\{!모름 && pct > 0 && <i style=/.test(s)
    && s.includes('아직 진도율이 적히지 않았어요')
})

// ★ 이미 보내 드린 리포트는 그때 모양 그대로 저장돼 있다(report_links.data).
T('옛 리포트 스냅샷은 예전 모양으로 그린다', () => {
  const s = src('components/report/MonthlyReport.tsx')
  return /const books: any\[\] \| null = Array\.isArray\(\(d as any\)\.books\) \? \(d as any\)\.books : null/.test(s)
    && s.includes('{books ? (')
    && s.includes("((d as any).progress ?? []).length > 0")   // 옛 스냅샷의 진도 글
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
