/**
 * 월말 보고서 **학년별 일괄 생성·카톡 발송**이 안전하게 도는지 시험한다. (원장님 2026-11-05)
 *
 * 왜 필요한가
 *   「한명한명 링크를 만들어서 일일이 보낼수가 없거든? 학년별로 일괄 월말보고서 생성하여
 *    카톡으로 전송하는 기능까지」
 *
 *   ★ 여기서 틀리면 **학부모님께 잘못 나간다.** 되돌릴 수 없는 일이다 —
 *     ① 같은 달에 두 번 감 (보낸 기록을 안 남기거나 안 보고 보냄)
 *     ② 퇴원·연습용 학생의 학부모께 감
 *     ③ 템플릿이 안 맞아 **에러도 없이** 한 건도 안 감
 *     ④ 한 명 실패했는데 거기서 멈춰 나머지가 안 감
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/monthly-send-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/monthlyReportTemplate.ts')
const { buildMonthlyMessage, MONTHLY_TEMPLATE, MONTHLY_BUTTON_NAME, MONTHLY_BODY_LIMIT } =
  await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

const 리포트 = (over: any = {}) => ({
  student: { name: '홍길동', grade: '중3', school: '가상중', teacher: '스미스마이클' },
  period: { year: 2026, month: 11, label: '2026년 11월', dateLabel: '' },
  lessons: { total: 12, onTime: 11, late: 1, absent: 0, rate: 92 },
  homework: { achievement: 88, score: 84 },
  unitLevels: [{ course: '', unit: '1', name: '이차함수', level: 4, gained: 1 }],
  comment: '한 달 잘했습니다.', ...over,
})

T('본문이 **승인 원문 그대로**의 틀이다 (변수만 채운다)', () => {
  const m = buildMonthlyMessage(리포트(), 'https://x/y')
  const 틀 = MONTHLY_TEMPLATE.replace(/#\{[^}]+\}/g, '')
  // 변수 자리를 뺀 골격이 본문에 그대로 남아 있어야 한다
  return 틀.split('\n').filter((l: string) => l.trim()).every((l: string) => m.body.includes(l.trim()))
    && !m.body.includes('#{')
})

T('출석·오른 단원·한마디가 채워진다', () => {
  const m = buildMonthlyMessage(리포트(), 'https://x/y')
  return m.body.includes('12회 중 12회 (지각 1)')
    && m.body.includes('이차함수 (4레벨)')
    && m.body.includes('한 달 잘했습니다.')
})

T('한 줄 평이 없으면 무난한 문장으로 채운다 (빈칸이 나가면 안 된다)', () => {
  const m = buildMonthlyMessage(리포트({ comment: null }), 'https://x/y')
  return m.body.includes('11월 한 달 기록을 정리했습니다') && !m.body.includes('#{')
})

T('본문이 1,000자를 넘으면 넘었다고 알려 준다', () => {
  const m = buildMonthlyMessage(리포트({ comment: '가'.repeat(2000) }), 'https://x/y')
  return m.bodyLen <= MONTHLY_BODY_LIMIT && !m.overLimit     // 칸마다 잘라서 한도 안에 들어온다
})

// ── 발송 길 ────────────────────────────────────────────────────────────
const api = () => src('app/api/monthly-report/route.ts')

// ★ 알리고는 템플릿이 안 맞으면 **에러도 없이** 안 보낸다. 보내기 전에 먼저 확인해야 한다.
T('템플릿이 승인 전이면 **한 건도** 안 보낸다', () => {
  const s = api()
  return /if \(send\) \{[\s\S]{0,900}?resolveMonthlyTemplate\(\)/.test(s)
    && /if \(!tpl\.code\) \{[\s\S]{0,200}?status: 400/.test(s)
})

// ★ 기록을 못 남기면 다음 번에 같은 분께 또 간다.
T('보낸 기록 칸이 없으면 아예 안 보낸다', () => {
  const s = api()
  return s.includes("select('kakao_sent_at')") && /칸없음[\s\S]{0,400}?status: 400/.test(s)
    && fs.existsSync(path.resolve('docs/sql/월간보고서_발송기록.sql'))
    && fs.existsSync(path.resolve('docs/sql/월간보고서_발송기록_되돌리기.sql'))
})

T('이번 달에 이미 보낸 학생은 건너뛴다', () => {
  const s = api()
  return s.includes('const 이미보냄 = new Set<string>()')
    && /if \(send && !resend\)/.test(s)
    && s.includes("이번 달에 이미 보냈어요.")
})

// ★ 퇴원·연습용 학생의 학부모께 가면 안 된다.
T('퇴원·연습용·번호 없는 학생은 안 보낸다', () => {
  const s = api()
  return s.includes('연습용 학생이라 안 보냈어요')
    && s.includes('퇴원 학생이라 안 보냈어요')
    && s.includes('보호자 번호가 없어요')
})

// ★ 한 명 막혔다고 거기서 멈추면 나머지가 안 간다.
T('한 명이 실패해도 나머지는 계속 간다', () => {
  const s = api()
  const 보내는곳 = /try \{\s*const r = await sendAlimtalk[\s\S]*?catch \(e: any\) \{[\s\S]*?\n    \}/.exec(s)?.[0] ?? ''
  return 보내는곳.includes('catch') && 보내는곳.includes('out.push')
    && !/throw/.test(보내는곳)
})

T('보낸 뒤 그 줄에 보낸 때를 적는다', () => {
  const s = api()
  return /update\(\{ kakao_sent_at: new Date\(\)\.toISOString\(\)/.test(s)
    && s.includes(".eq('token', token)")
})

// ★ 버튼 이름이 한 글자만 달라도 안 나간다 — 등록된 것을 그대로 쓴다.
T('버튼 이름은 알리고에 등록된 것을 그대로 쓴다', () => {
  const s = api()
  return s.includes('name: tpl!.buttonName')
    && src('lib/monthlyReportTemplate.ts').includes('picked?.buttons?.[0]?.name')
})

T('월간 리포트는 **브리핑과 다른 템플릿 코드**로 보낸다', () => {
  const s = src('lib/aligo.ts')
  return s.includes('tplCode?: string') && s.includes('tpl_code: tplCode || cfg.tplCode')
    && api().includes('tpl!.code!')
})

// ── 화면 ───────────────────────────────────────────────────────────────
T('보고서 화면에 학년별 일괄 보내기가 있다 (원장님만)', () => {
  const s = src('app/teacher/reports/page.tsx')
  return s.includes('학년별로 한 번에 만들고 보내기')
    && s.includes('{isAdmin() && (')
    && s.includes('sendMonthlyBulk')
    && s.includes('학부모님께 카톡으로 보냅니다')      // 누르기 전에 한 번 묻는다
})

T('결과를 보냄·건너뜀·실패로 나눠 보여 준다', () => {
  const s = src('app/teacher/reports/page.tsx')
  return s.includes('const 보냄 = bResult.filter((x) => x.sent)')
    && s.includes('const 건너뜀 = bResult.filter((x) => x.skipped)')
    && s.includes('const 실패 = bResult.filter((x) => x.error)')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
