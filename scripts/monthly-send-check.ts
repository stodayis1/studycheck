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
const { commentPrompt, hasSomethingToSummarize, toneProblems, BAD_TONE,
        dataPrompt, promptFor, recordLines, hasRecordsWorthWriting, tidyUnit, commentSourceOf } =
  await import(pathToFileURL(path.resolve('lib/monthlyComment.ts')).href)

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
  return api.includes('promptFor(재료 as any)')
    && api.includes('commentSourceOf(data, months)')
    && api.includes('const autoComment = b?.autoComment !== false')
    && api.includes('model: AI_TEXT_MODEL, thinking: NO_THINKING')
})

// ★ 미리보기와 발송이 **같은 함수**로 채워야 「미리보기엔 없었는데 나간 건 있었다」가 안 된다.
T('미리보기도 발송과 같은 함수로 채운다', () => {
  const api = src('app/api/monthly-report/route.ts')
  return (api.match(/await fillComment\(data, months\)/g) ?? []).length === 2   // GET · POST 둘 다
    && api.includes("q.get('autoComment') !== '0'")
})

// ★ 글상자를 고쳤는데 아래 보고서가 안 바뀌면 「반영이 안 된다」로 보인다
//   (원장님 2026-11-05 「AI생성은 되는데 이게 보고서에는 왜 반영이 안되는거지?」).
T('글상자를 고치면 미리보기에 바로 보인다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  return ui.includes("d={{ ...mNew, comment: (mComment ?? '').trim() || mNew.comment }}")
    && !ui.includes('한 줄 평 반영하기')          // 따로 눌러야 하던 단추는 없앴다
})

T('서버가 요약해 준 글이 글상자에도 올라온다 (고쳐 쓰시게)', () => {
  const ui = src('app/teacher/reports/page.tsx')
  return ui.includes("if (!talk && !mComment && (j.data?.comment ?? '').trim()) setMComment(j.data.comment)")
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
  const 블록 = /async function fillComment\([\s\S]*?\n\}/.exec(api)?.[0] ?? ''
  return 블록.includes('try {') && 블록.includes('catch')
    && !블록.includes('return NextResponse') && !블록.includes('throw')
    && 블록.includes('if (!고른것) return')   // 알림장도 기록도 없으면 안 부른다
})

// ★ 미리보기와 발송이 **같은 글**로 물어야 어긋나지 않는다.
T('미리보기와 발송이 같은 요약 글을 쓴다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  const api = src('app/api/monthly-report/route.ts')
  return ui.includes('commentPrompt({') && api.includes('promptFor(재료 as any)')
    && ui.includes('autoComment: bAutoComment')
})

T('요약 글이 날짜 나열이 아니라 **흐름**으로 묶으라고 한다', () => {
  const 글 = commentPrompt({
    studentName: '홍길동', studentGrade: '중1', months: 2,
    notices: [{ date: '2026-09-02', content: '일차방정식 계산을 어려워했습니다.' },
              { date: '2026-10-21', content: '활용 단원에서 풀이 방향을 못 잡았습니다.' }],
    numbers: { sessions: 24, hwRate: 88 },
  })
  return 글.includes('선생님 알림장 2건:')
    && 글.includes('날짜를 하나하나 나열하지 말고')
    && 글.includes('두 달')
    && 글.includes('이모지\u00b7마크다운')
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
    && 글.includes('선생님이 ')                                   // 누가 쓴 글인지 못박는다
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

// ── 말투 (원장님 2026-11-06) ────────────────────────────────────────────
// ★ 「선생님께서 격려해주셨다」 — 선생님을 **남처럼** 쓴 글이 실제로 나갔다.
//   선생님 코멘트는 **선생님이 쓰신 글을 줄이는 것**이다. 제3자 관찰문이 되면 안 된다.
T('선생님을 남처럼 쓴 글을 잡아낸다', () => {
  const 걸린다 = [
    '민수가 수학을 잘할 수 있는 학생이어서 선생님께서 격려해 주셨습니다.',
    '선생님의 지도로 계산 실수가 줄었습니다.',
    '앞으로도 더 성장할 수 있도록 지도하겠습니다.',
    '가정에서도 응원해 주시면 큰 힘이 될 것입니다.',
    '성실한 태도가 관찰되었습니다.',
  ]
  return 걸린다.every((t) => toneProblems(t).length > 0)
})

T('멀쩡한 요약은 걸지 않는다 (괜한 다시 부르기 방지)', () => {
  const 좋은글 = '9월에는 일차방정식 계산에서 실수가 잦았습니다. 10월에 들어서는 '
    + '풀이 과정을 또박또박 적기 시작해 같은 실수가 줄었습니다. '
    + '지금은 활용 문제에서 식을 세우는 연습을 하고 있습니다.'
  return toneProblems(좋은글).length === 0 && BAD_TONE.length >= 8
})

T('지시문이 3인칭과 상투 마무리를 못박아 막는다', () => {
  const 글 = commentPrompt({
    studentName: '홍길동', months: 1,
    notices: [{ date: '2026-10-05', content: '풀이 과정을 또박또박 적었습니다.' }],
  })
  return 글.includes('선생님께서 격려해 주셨다')          // 쓰면 안 되는 예를 보여 준다
    && 글.includes('3인칭 표현은 쓰지 않습니다')
    && 글.includes('지도하겠습니다')
    && 글.includes('없는 말을 보태지 마세요')
})

T('다시 시킬 때 무엇이 걸렸는지 짚어 준다', () => {
  const lib = src('lib/monthlyComment.ts')
  return lib.includes('방금 쓴 글에 이런 문제가 있었습니다')
    && lib.includes('선생님이 쓰신 글을 줄이는 것이지')          // 알림장으로 쓴 글
    && lib.includes('기록에 있는 숫자만 쓰는 글입니다')          // 학습 기록으로 쓴 글
})

T('말투가 걸리면 서버가 한 번 더 시킨다', () => {
  for (const f of ['app/api/monthly-report/route.ts', 'app/api/monthly-report/comments/route.ts']) {
    const s = src(f)
    const ok = s.includes('toneProblems')
      && s.includes('retryHint(문제, 고른것.source)')   // 무엇으로 쓴 글이냐에 따라 다르게 짚는다
      && s.includes('toneProblems(다시).length < 문제.length')   // 나아질 때만 갈아끼운다
    if (!ok) return false
  }
  return true
})

// ── 한 화면에서 다 같이 (원장님 2026-11-06) ─────────────────────────────
// 「한명한명 모두 AI생성해야 볼수 있는건가? … 한 화면에서 요약정리하게 보여주면
//   해당학생의 월간보고서에 한꺼번에 씌워서 일괄발송되게」
T('한꺼번에 만들어 보는 길이 있다 (원장님만, 보내지는 않는다)', () => {
  const s = src('app/api/monthly-report/comments/route.ts')
  return s.includes("denyIfNotStaff(req, { adminOnly: true })")
    && !s.includes('sendAlimtalk') && !s.includes('report_links')   // 링크도 카톡도 없다
    && s.includes('promptFor(재료 as any)')                          // 쓸 거리가 없으면 안 부른다
})

T('한 명 실패해도 나머지 한 줄 평은 계속 만든다', () => {
  const s = src('app/api/monthly-report/comments/route.ts')
  return s.includes('for (const id of ids)')
    && s.includes('} catch (e: any) {')
    && s.includes("out.push({ studentId: id, name: '?', error:")
})

T('화면이 만들기와 보내기를 두 단추로 나눈다', () => {
  const s = src('app/teacher/reports/page.tsx')
  return s.includes('makeBulkDrafts')
    && s.includes('한꺼번에 만들어 보기')
    && s.includes('명에게 만들고 보내기')
    && s.includes('만들기만 하고 보내지는 않아요')      // 누르기 전에 분명히 알린다
})

T('화면에서 고친 한 줄 평이 그대로 발송에 실린다', () => {
  const s = src('app/teacher/reports/page.tsx')
  return s.includes('comment: Object.fromEntries((bDrafts ?? [])')
    && s.includes("filter((d: any) => (d?.comment ?? '').trim())")   // 비운 칸은 서버가 채운다
    && s.includes('[d.studentId, d.comment]')
})

T('학년을 바꾸면 만들어 둔 한 줄 평을 버린다', () => {
  const s = src('app/teacher/reports/page.tsx')
  // 엉뚱한 학생 글이 남아 있으면 **다른 학부모께 그 글이 간다.**
  return s.includes('onClick={() => { setBDrafts(null); setBGrades(')
})

T('발송 API 가 학생별 한 줄 평을 받아 쓰고, 받은 것은 AI 로 덮지 않는다', () => {
  const s = src('app/api/monthly-report/route.ts')
  return s.includes('const c = (b?.comment ?? {})[id]')
    && s.includes('data.comment = String(c)')
    && s.includes("if ((data?.comment ?? '').trim()) return")      // 이미 있으면 AI 를 안 부른다
})

// ── 알림장이 없을 때 **학습 기록으로** 쓴다 (원장님 2026-11-06) ─────────
// 「한줄평이 생성이 안되는 경우는 선생님이 알림장을 안쓴거잖아. 너가 학습데이터…를 보고
//   정리해주면 어떨까. 빈곳이 있는 상태로 보내는건 좀 아닌듯」
const 기록 = {
  sessions: 23, rate: 96, absent: 1, hwRate: 99, hwScore: 81,
  worksheets: { total: 6, passed: 6 },
  levelUps: [{ unit: '1. 삼각형의 성질~2. 사각형의 성질', from: 0, to: 3.5 },
             { unit: '1. 삼각형의 성질(이등변삼각형)', from: 0, to: 3 },
             { unit: '오답학습지 오답+유사 과제', from: 0, to: 4 }],
  core: { count: 6, avg: 77, best: 85, first: 76, last: 85 },
  books: [{ name: '유형서 쎈B', pct: 75 }], booksDone: ['개념리피트', '쎈B', '개념리피트'],
}

T('알림장이 있으면 알림장으로, 없으면 학습 기록으로 쓴다', () => {
  const 있음 = promptFor({ studentName: 'ㄱ', months: 1,
    notices: [{ date: '2026-10-05', content: '풀이 과정을 또박또박 적었습니다.' }], records: 기록 })
  const 없음 = promptFor({ studentName: 'ㄱ', months: 1, notices: [], records: 기록 })
  return 있음?.source === 'notes' && 없음?.source === 'data'
    && 있음!.prompt !== 없음!.prompt
})

// ★ 둘 다 없는데 억지로 쓰면 **없는 말을 지어낸다.** 그때는 비워 둔다.
T('알림장도 기록도 없으면 비워 둔다 (지어내지 않는다)', () => {
  const 빈것 = promptFor({ studentName: 'ㄱ', months: 1, notices: [], records: { sessions: 0 } })
  const 출석만 = promptFor({ studentName: 'ㄱ', months: 1, notices: [], records: { sessions: 17, rate: 100 } })
  return 빈것 === null && 출석만 === null
    && hasRecordsWorthWriting({ sessions: 0, hwRate: 90 }) === false
})

T('모르는 값을 0 으로 내보내지 않는다', () => {
  const 줄 = recordLines({ sessions: 10, rate: 100, hwRate: null, hwScore: null,
    core: { count: 0 }, books: [{ name: '쎈', pct: null }] })
  return 줄.some((t: string) => t.includes('수업 10회'))
    && !줄.some((t: string) => t.includes('과제'))          // 모르면 아예 안 쓴다
    && !줄.some((t: string) => t.includes('코어테스트'))
    && 줄.some((t: string) => t.includes('진도 집계 전'))   // 0% 가 아니다
})

T('단원 이름을 읽을 수 있게 다듬는다', () =>
  tidyUnit('1. 소인수 분해(소수와 합성수~최소공배수의 활용)') === '소인수 분해'
  && tidyUnit('1. 삼각형의 성질~2. 사각형의 성질') === '삼각형의 성질~사각형의 성질'
  && tidyUnit('2. 정비례와 반비례 + 1. 좌표와 그래프') === '정비례와 반비례, 좌표와 그래프')

T('같은 단원이 여러 줄로 쌓이지 않는다', () => {
  const 레벨줄 = recordLines(기록).filter((t: string) => t.includes('레벨'))
  return 레벨줄.length === 1                                   // 삼각형 두 줄이 한 줄로
    && 레벨줄[0].includes('레벨 3.5 도달')                      // 더 높은 쪽
    && !recordLines(기록).some((t: string) => t.includes('오답학습지'))  // 재도전은 단원이 아니다
})

T('끝낸 교재를 두 번 적지 않는다', () => {
  const t = recordLines(기록).find((x: string) => x.startsWith('끝낸 교재')) ?? ''
  return t.includes('개념리피트') && t.split('개념리피트').length === 2
})

T('기록으로 쓰는 글은 선생님을 주인공으로 쓰지 말라고 한다', () => {
  const 글 = dataPrompt({ studentName: 'ㄱ', studentGrade: '중2', months: 2, notices: [], records: 기록 })
  return 글.includes('선생님이 쓴 글이 아니라')
    && 글.includes('선생님을 주인공으로 쓰지 마세요')
    && 글.includes('기록에 있는 사실만')
    && 글.includes('지도하겠습니다')                 // 쓰지 말라고 못박는다
    && 글.includes('~로 보입니다')                   // 짐작도 금지
    && 글.includes('코어테스트(올해 누적)')           // 기록이 실제로 들어간다
})

T('리포트 자료에서 재료를 뽑는 곳이 한 곳이다', () => {
  const 재료 = commentSourceOf({
    student: { name: 'ㄱ', grade: '중2' }, lessons: { total: 23, onTime: 21, late: 1, absent: 1, rate: 96 },
    homework: { achievement: 99, score: 81 }, notices: [],
    unitLevels: [{ name: '1. 삼각형의 성질', level: 3, before: 0 }, { name: '2. 원', level: 2, before: 2 }],
    worksheetSummary: { total: 6, passed: 6 }, coreSummary: { count: 6, avg: 77 },
    books: [{ type: '유형서', name: '쎈B', pct: 75 }], booksDone: [{ name: '개념리피트' }],
  }, 2)
  return 재료.records.levelUps.length === 1                    // 안 오른 단원은 안 넣는다
    && 재료.records.books[0].name === '유형서 쎈B'
    && 재료.records.booksDone[0] === '개념리피트'
    && promptFor(재료)?.source === 'data'
})

// ★ 발송·미리보기·일괄 세 곳이 같은 함수를 쓰고, **무엇으로 쓴 글인지** 남겨야 한다.
T('세 곳이 같은 함수로 고르고, 무엇으로 썼는지 남긴다', () => {
  const a = src('app/api/monthly-report/route.ts')
  const b = src('app/api/monthly-report/comments/route.ts')
  return a.includes('commentSourceOf(data, months)') && a.includes('promptFor(')
    && a.includes("data.commentFrom = 고른것.source")
    && b.includes('commentSourceOf(data, months)') && b.includes('promptFor(')
    && b.includes('source: 고른것.source')
})

T('화면에서 고친 글도 무엇으로 쓴 것인지 함께 간다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  const api = src('app/api/monthly-report/route.ts')
  return ui.includes('commentFrom: Object.fromEntries(')
    && api.includes("const from = (b?.commentFrom ?? {})[id]")
    && api.includes("if (from === 'data' || from === 'notes') data.commentFrom = from")
})

// ★ 선생님이 쓴 글이 아닌데 「수업 태도」로 보이면 안 된다 (원장님이 고른 쪽).
T('기록으로 쓴 글은 리포트 칸 이름이 다르다', () => {
  const c = src('components/report/MonthlyReport.tsx')
  return c.includes("const 기록으로 = (d as any)?.commentFrom === 'data'")
    && c.includes("{기록으로 ? '이번 달 학습 요약' : '수업 태도'}")
})

T('일괄 화면이 기록으로 쓴 학생을 표시해 준다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  return ui.includes('학습 기록으로 씀') && ui.includes("d.source === 'data'")
})

// ── 보낼 사람 고르기 (원장님 2026-11-06) ───────────────────────────────
// 「각 사람 이름 앞에 보낼 사람 체크, 또는 체크풀기 하게 해줘라. … 보내필요 없는 학생도
//   같이 떠버리는데 그 학생은 나갈 필요가 없잖아」
// ★ 여기서 틀리면 **안 보내려던 학부모께 나간다.** 되돌릴 수 없다.
T('학생마다 체크칸이 있고 전체 체크·해제도 된다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  return ui.includes("<input type=\"checkbox\" checked={d.send !== false}")
    && ui.includes('체크바꾸기(i, e.target.checked)')
    && ui.includes('전체 체크') && ui.includes('전체 해제')
    && ui.includes('보낼 사람 {bPicked.length}/{bDrafts.length}명')
})

T('체크를 푼 학생은 **아예 안 넘어간다** (링크도 안 만든다)', () => {
  const ui = src('app/teacher/reports/page.tsx')
  // 발송(sendMonthlyBulk)만 본다 — 초안 만들기는 고른 학년 전부가 맞다
  const 발송 = /async function sendMonthlyBulk[\s\S]*?\n  \}/.exec(ui)?.[0] ?? ''
  return 발송.includes('studentIds: bPicked.map((s) => s.id)')
    && !발송.includes('studentIds: bTargets.map((s) => s.id)')
    && ui.includes("d?.studentId === s.id && d?.send !== false")
})

T('체크를 푼 학생의 글도 안 넘어간다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  const 글 = (ui.match(/comment(From)?: Object\.fromEntries[\s\S]{0,200}/g) ?? [])
  return 글.length === 2 && 글.every((t: string) => t.includes("d?.send !== false"))
})

T('묻는 창과 단추가 고른 수를 말한다', () => {
  const ui = src('app/teacher/reports/page.tsx')
  return ui.includes('`${bPicked.length}명의 ${기간말()} 리포트를 만들어')
    && ui.includes('`② ${bPicked.length}명에게 만들고 보내기`')
    && ui.includes('체크를 푸신 ${체크푼사람}명은 보내지 않습니다')
    && ui.includes('disabled={!bPicked.length || bBusy}')
})

// ★ 초안을 안 펼쳤으면 예전처럼 고른 학년 전부 — 체크 기능이 길을 막으면 안 된다
T('초안을 안 펼쳤으면 고른 학년 전부 간다', () => {
  // 줄바꿈이 CRLF 라 여러 줄을 한 글자씩 맞추지 않는다 (2026-11-06 에 그래서 헛걸렸다)
  const ui = src('app/teacher/reports/page.tsx').replace(/\r/g, '')
  return /const bPicked = bDrafts\s*\n\s*\? bTargets\.filter[\s\S]{0,160}\n\s*: bTargets/.test(ui)
})

T('화면에 마크다운 별표를 글자로 흘리지 않는다', () =>
  !src('app/api/monthly-report/comments/route.ts').includes("'알림장이 없어 **학습 기록**"))

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
