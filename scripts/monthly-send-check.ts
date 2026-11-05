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
const { buildTeacherSms, PER_SMS } = await import(pathToFileURL(path.resolve('lib/monthlyTeacherSms.ts')).href)
const { span, buildMonthlyReport } = await import(pathToFileURL(path.resolve('lib/monthlyReport.ts')).href)
const { commentPrompt, hasSomethingToSummarize } = await import(pathToFileURL(path.resolve('lib/monthlyComment.ts')).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
async function TA(name: string, fn: () => Promise<boolean>) {
  total++
  let ok = false, err = ''
  try { ok = await fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

/**
 * 가짜 DB — 아무것도 안 들어 있는 상태로 buildMonthlyReport 를 **실제로 돌려** 본다.
 * ★ 기간(period)을 눈으로 확인하려는 것이다. 문자열만 봐서는
 *   「span 은 맞는데 buildMonthlyReport 가 그걸 안 쓰는」 경우를 못 잡는다(실제로 겪었다).
 */
function 가짜DB(학생: any) {
  const Q = (rows: any[], one: any = undefined): any => {
    const q: any = {}
    for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'not', 'range']) q[m] = () => q
    q.maybeSingle = () => ({ then: (r: any) => r({ data: one ?? rows[0] ?? null, error: null }) })
    q.single = q.maybeSingle
    q.then = (r: any) => r({ data: rows, error: null })
    return q
  }
  return { from: (t: string) => (t === 'students' ? Q([], 학생) : Q([])) }
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

// ── 몇 달치인가 ────────────────────────────────────────────────────────
// ★ 두 달에 한 번 보내시는데 한 달만 잡으면 **한 달이 통째로 빠진다**
//   (원장님 2026-11-05 「10월만 설정하게 되면 말이 안되지 않나?」).
T('한 달치는 그 달 1일~말일', () => {
  const r = span(2026, 10, 1)
  return r.from === '2026-10-01' && r.to === '2026-10-31' && r.label === '2026년 10월'
})

T('두 달치는 **앞 달 1일**부터 그 달 말일까지', () => {
  const r = span(2026, 10, 2)
  return r.from === '2026-09-01' && r.to === '2026-10-31' && r.label === '2026년 9~10월'
})

// ★ 1월 두 달치는 **작년 12월**부터다. 여기서 틀리면 12월이 영영 안 나간다.
T('해를 넘어가도 맞다 (1월 두 달치 = 작년 12월부터)', () => {
  const r = span(2027, 1, 2)
  return r.from === '2026-12-01' && r.to === '2027-01-31'
    && r.label === '2026년 12월~2027년 1월'
})

T('2월 말일(28·29일)도 맞게 잡는다', () =>
  span(2026, 2, 1).to === '2026-02-28' && span(2028, 2, 1).to === '2028-02-29')

T('3월 두 달치는 2월부터 (말일이 앞 달 기준으로 새면 안 된다)', () => {
  const r = span(2026, 3, 2)
  return r.from === '2026-02-01' && r.to === '2026-03-31'
})

// ★ 기간 이름이 알림톡 변수 칸(#{기간})에 안 잘려야 한다.
T('가장 긴 기간 이름도 알림톡 칸에 들어간다', () => {
  const 긴것 = span(2027, 1, 2).label           // 「2026년 12월~2027년 1월」
  const m = buildMonthlyMessage({ ...리포트(), period: { ...리포트().period, ...span(2027, 1, 2), months: 2 } } as any, 'https://x/y')
  return m.body.includes(긴것) && !m.body.includes('…')
})

T('API 와 화면이 months 를 같이 넘긴다', () => {
  const api = src('app/api/monthly-report/route.ts')
  const ui = src('app/teacher/reports/page.tsx')
  return api.includes('buildMonthlyReport(supabase, id, year, month, months)')
    && api.includes('span(year, month, months).from')
    && api.includes('span(year, month, months).to')
    && ui.includes('months: mMonths')
    && ui.includes('&months=${mMonths}')
    && ui.includes('<option value={2}>2개월치</option>')
})

// ★ 두 달치인데 「이번 달」이라고 적히면 말이 안 된다.
T('두 달치면 화면 글도 「두 달」로 바뀐다', () => {
  const v = src('components/report/MonthlyReport.tsx')
  return v.includes("const 두달 = (d.period as any)?.months === 2")
    && v.includes('{기간말} 수업 태도') && v.includes("두달 ? '두 달간' : '이번 달'")
})

// ★ span 이 맞아도 buildMonthlyReport 가 그걸 안 쓰면 소용이 없다 — **돌려서** 본다.
await TA('리포트를 실제로 만들어 보면 기간이 두 달이다', async () => {
  const db = 가짜DB({ id: 's1', name: '홍길동', grade: '중3', school: '가상중', teacher_name: '스미스마이클' })
  const r: any = await buildMonthlyReport(db, 's1', 2026, 10, 2)
  return !!r && r.period.months === 2 && r.period.label === '2026년 9~10월'
    && r.period.from === '2026-09-01' && r.period.to === '2026-10-31'
})

await TA('한 달치로 만들면 한 달이다', async () => {
  const db = 가짜DB({ id: 's1', name: '홍길동', grade: '중3', school: '가상중', teacher_name: '스미스마이클' })
  const r: any = await buildMonthlyReport(db, 's1', 2026, 10, 1)
  return !!r && r.period.months === 1 && r.period.label === '2026년 10월'
    && r.period.from === '2026-10-01' && r.period.to === '2026-10-31'
})

await TA('안 주면 지금까지대로 한 달이다 (옛 호출)', async () => {
  const db = 가짜DB({ id: 's1', name: '홍길동', grade: '중3', school: '가상중', teacher_name: '스미스마이클' })
  const r: any = await buildMonthlyReport(db, 's1', 2027, 1)
  return !!r && r.period.label === '2027년 1월' && r.period.from === '2027-01-01'
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

// ── 담당 선생님께 문자 ──────────────────────────────────────────────────
// ★ 알림톡이 아니라 **문자**다 — 선생님께 가는 글은 그때그때 학생 이름·수가 달라
//   승인 템플릿으로 만들 수 없다(lib/opsSms.ts 에 같은 설명).
const 보낸것 = (n: number, t: string[]) => ({ studentId: `s${n}`, name: `학생${n}`, url: `https://x/${n}`, teachers: t })

T('키움쌤·채움쌤 **둘 다** 받는다', () => {
  const ms = buildTeacherSms('2026년 11월', [보낸것(1, ['신애진', '강루비'])])
  return ms.length === 2 && ms.map((m: any) => m.teacher).sort().join() === '강루비,신애진'
    && ms.every((m: any) => m.text.includes('학생1') && m.text.includes('https://x/1'))
})

T('선생님별로 자기 학생만 묶인다', () => {
  const ms = buildTeacherSms('2026년 11월', [보낸것(1, ['신애진']), 보낸것(2, ['주한']), 보낸것(3, ['신애진'])])
  const 신 = ms.find((m: any) => m.teacher === '신애진')
  return ms.length === 2 && 신.count === 2
    && 신.text.includes('학생1') && 신.text.includes('학생3') && !신.text.includes('학생2')
})

// ★ 문자는 길면 끊긴다. 여덟 명이 넘으면 나눠 보낸다.
T('여덟 명이 넘으면 나눠 보낸다', () => {
  const ms = buildTeacherSms('2026년 11월', Array.from({ length: 9 }, (_, i) => 보낸것(i + 1, ['신애진'])))
  return ms.length === 2 && ms[0].count === PER_SMS && ms[1].count === 1
    && ms[0].text.includes('(1/2)') && ms[1].text.includes('(2/2)')
    && ms.every((m: any) => m.text.length < 1000)
})

T('담당이 없는 학생은 아무에게도 안 간다 (빈 문자 금지)', () =>
  buildTeacherSms('2026년 11월', [보낸것(1, []), 보낸것(2, ['  '])]).length === 0
  && buildTeacherSms('2026년 11월', []).length === 0)

// ★ 학부모님께 **실제로 나간 것만** 알려야 한다 — 건너뛰거나 실패한 학생이 섞이면
//   선생님이 「나갔구나」로 읽는다.
T('실제로 나간 학생만 선생님께 알린다', () => {
  const s = api()
  return /보낸것\.push\(\{ studentId: id, name: data\.student\.name, url, teachers: teachersOf/.test(s)
    && /out\.push\(\{ studentId: id, name: data\.student\.name, url, sent: true \}\)\s*\n\s*보낸것\.push/.test(s)
})

T('선생님 문자가 실패해도 학부모 발송은 막지 않는다', () => {
  const s = api()
  const 블록 = /if \(send && tellTeachers && 보낸것\.length\) \{[\s\S]*?\n  \}/.exec(s)?.[0] ?? ''
  return 블록.includes('try {') && 블록.includes('catch') && !/return NextResponse/.test(블록)
    && s.includes("refType: 'monthly_report_teacher'")
})

T('번호가 없는 선생님은 까닭을 돌려준다', () => {
  const s = api()
  return s.includes('연락처가 없어요 (수학OPS 직원 정보)')
})

// ── 담당 선생님 코멘트 ─────────────────────────────────────────────────
// ★ 예전에는 알림장을 **220자에서 잘라** 문장 한가운데가 끊겼다
//   (원장님 2026-11-05 「지금 이미지에서와 같이 잘리면 안돼」).
// ★ 두 달치면 알림장이 한 건일 수가 없다 — 날짜와 함께 **전부** 싣는다
//   (원장님 「분명히 1건은 아닐거란 말이지」).
T('코멘트를 자르지 않는다 (220자 자르기가 사라졌다)', () => {
  const v = src('components/report/MonthlyReport.tsx')
  return !/teacherNote\?\.slice\(0, ?220\)/.test(v)
    && !/comment[\s\S]{0,40}\.slice\(0, ?\d+\)/.test(v)
})

// ★ 반대쪽으로 지나치면 안 된다 — 자르지 않는다고 **다 늘어놓으면** 글의 벽이 된다
//   (원장님 2026-11-05 「왜 수업태도는 모두다 나열되어 있는거지?」). 요약만 싣는다.
T('알림장을 화면에 늘어놓지 않는다', () => {
  const v = src('components/report/MonthlyReport.tsx')
  return !v.includes('알림장.map(')
    && !v.includes('className="nt"')
    && v.includes('선생님이 남긴 한 줄 평이 없습니다')
})

T('한 줄 평이 없으면 **요약해서** 채운다', () => {
  const api = src('app/api/monthly-report/route.ts')
  return api.includes('commentPrompt(재료)')
    && api.includes('hasSomethingToSummarize(재료)')
    && api.includes('const autoComment = b?.autoComment !== false')
    && api.includes('model: AI_TEXT_MODEL, thinking: NO_THINKING')
})

// ★ 알림장이 한 건도 없으면 부르지 않는다 — 돈만 든다.
T('요약할 거리가 없으면 AI 를 안 부른다', () => {
  const 빈것 = { studentName: '홍길동', months: 1 as const, notices: [] as any[] }
  const 있는것 = { studentName: '홍길동', months: 1 as const, notices: [{ date: '2026-10-05', content: '오늘 잘했습니다.' }] }
  return hasSomethingToSummarize(빈것) === false && hasSomethingToSummarize(있는것) === true
})

// ★ 요약에 실패했다고 리포트를 안 보내면 더 나쁘다.
T('요약이 실패해도 리포트는 그대로 만든다', () => {
  const api = src('app/api/monthly-report/route.ts')
  const 블록 = /if \(hasSomethingToSummarize\(재료\)\) \{[\s\S]*?\n      \}/.exec(api)?.[0] ?? ''
  return 블록.includes('catch') && !블록.includes('return NextResponse')
})

// ★ 미리보기와 발송이 **같은 글**로 물어야 어긋나지 않는다.
T('미리보기와 발송이 같은 요약 글을 쓴다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  const api = src('app/api/monthly-report/route.ts')
  return ui.includes('commentPrompt({') && api.includes('commentPrompt(재료)')
    && ui.includes('autoComment: bAutoComment')
})

T('요약 글이 날짜 나열이 아니라 **흐름**으로 묶으라고 한다', () => {
  const 글 = commentPrompt({
    studentName: '홍길동', studentGrade: '중1', months: 2,
    notices: [{ date: '2026-09-02', content: '일차방정식 계산을 어려워했습니다.' },
              { date: '2026-10-21', content: '활용 단원에서 풀이 방향을 못 잡았습니다.' }],
    numbers: { sessions: 24, hwRate: 88 },
  })
  return 글.includes('알림장 2건을 먼저 읽고')
    && 글.includes('날짜를 하나하나 나열하지 말고')
    && 글.includes('두 달')
    && 글.includes('이모지와 마크다운은 쓰지')
})

T('글이 길면 두 칸으로 쪼개지 않고 한 칸을 넓게 쓴다', () => {
  const v = src('components/report/MonthlyReport.tsx')
  return v.includes('const 긴코멘트 =') && v.includes("`cols${긴코멘트 ? ' wide' : ''}`")
    && v.includes('.mr .cols.wide{grid-template-columns:1fr}')
})

// ★ AI 한 줄 평이 숫자만 보고 쓰면 정작 **선생님 말씀이 한 줄도 안 들어간다.**
T('AI 한 줄 평이 알림장을 읽고 요약한다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  const 글 = commentPrompt({
    studentName: '홍길동', months: 1,
    notices: [{ date: '2026-10-05', content: '오늘은 풀이 과정을 또박또박 적었습니다.' }],
  })
  return ui.includes('notices: ((mNew as any)?.notices ?? [])')   // 화면이 알림장을 넘긴다
    && 글.includes('먼저 읽고')
    && 글.includes('숫자보다 선생님 말씀이 중심입니다')
    && 글.includes('오늘은 풀이 과정을 또박또박 적었습니다.')      // 알림장이 실제로 들어간다
})

// ── 화면 ───────────────────────────────────────────────────────────────
T('보고서 화면에 학년별 일괄 보내기가 있다 (원장님만)', () => {
  const s = src('app/teacher/reports/page.tsx')
  return s.includes('학년별로 한 번에 만들고 보내기')
    && s.includes('{isAdmin() && (')
    && s.includes('sendMonthlyBulk')
    && s.includes('학부모님께 카톡으로 보냅니다')      // 누르기 전에 한 번 묻는다
})

T('선생님께 알릴지 고를 수 있고 결과도 보여 준다', () => {
  const s = src('app/teacher/reports/page.tsx')
  return s.includes('담당 선생님께 문자로 알리기')
    && s.includes('tellTeachers: bTellTeachers')
    && s.includes('담당 선생님께 문자 ')
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
