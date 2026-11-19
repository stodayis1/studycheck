/**
 * S코어반 학습 기록 보고서 자가확인.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/score-class-report-check.ts
 *
 * 앞쪽은 DB 없이 돈다. 환경파일이 있으면 **운영 데이터로** 실제 보고서를 만들어 본다
 * (읽기만 한다 — 링크를 만들지 않고 아무것도 고치지 않는다).
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { isAhead, aheadCourseOf, buildScoreClassReport } from '../lib/scoreClassReport.ts'

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('X ' + what); bad++ }
}

// ① 선행인지 가르기 — 이것이 틀리면 선행 범위와 현 학년 범위가 뒤섞인다
ok(isAhead('초6', '중1'), '초6 학생에게 중1 범위는 선행이다')
ok(isAhead('중3', '고1'), '중3 학생에게 고1 범위는 선행이다')
ok(!isAhead('초6', '초6'), '같은 학년은 선행이 아니다')
ok(!isAhead('초6', '초5'), '아래 학년은 선행이 아니다')
ok(!isAhead('초6', null) && !isAhead(null, '중1'), '학년을 모르면 선행으로 치지 않는다')
ok(!isAhead('초6', '중등'), '학년 이름이 아닌 글자는 선행으로 치지 않는다')

// ② 지금 나가는 선행 과정 — 가장 많이 푼 선행 범위
ok(aheadCourseOf('초6', [{ grade_level: '중1' }, { grade_level: '중1' }, { grade_level: '초6' }]) === '중1',
  '가장 많이 푼 선행 범위를 고른다')
ok(aheadCourseOf('초6', [{ grade_level: '초6' }, { grade_level: '초5' }]) === null,
  '선행이 하나도 없으면 null 이다')
ok(aheadCourseOf('초6', [{ grade_level: '중2' }, { grade_level: '중1' }, { grade_level: '중1' }]) === '중1',
  '더 위 과정이 섞여 있어도 많이 푼 쪽을 고른다')

// ③ 보고서 종류가 열려 있나 · 보내는 길이 없나 (원장님이 직접 보내신다)
{
  const api = fs.readFileSync('app/api/score-class-report/route.ts', 'utf8')
  // ★ 한 군데만 보면 안 된다. GET 에 가드가 남아 있는 채로 POST 에서만 빼도 통과했다
  //   (2026-11-19 망가뜨려 시험에서 걸림). **맨몸 denyIfNotStaff(req) 가 하나도 없어야** 한다.
  const 가드 = (api.match(/denyIfNotStaff\(req, \{ adminOnly: true \}\)/g) ?? []).length
  ok(가드 >= 2, `보고서 링크는 읽기·만들기 **둘 다** 원장님만이어야 한다 (지금 ${가드}곳)`)
  ok(!/denyIfNotStaff\(req\)/.test(api),
    '맨몸 denyIfNotStaff(req) 가 있다 — 강사도 열 수 있게 된다(화면만 가리면 주소로 부를 수 있다)')
  ok(!/sendAlimtalk|sendSmsViaOps|sendPush/.test(api),
    'X 이 라우트는 아무것도 보내지 않는다 — 보내는 것은 원장님이 직접 하신다'.slice(2))
  ok(api.includes("report_type: TYPE") && api.includes("const TYPE = 'score_class'"),
    '보고서 종류를 score_class 로 적어야 한다')
  ok(/S코어반보고서_종류추가\.sql/.test(api),
    '종류가 아직 안 열렸을 때 무엇을 넣어야 하는지 알려 줘야 한다')

  const page = fs.readFileSync('app/report/[token]/page.tsx', 'utf8')
  ok(/report_type === 'score_class'/.test(page), '공개 보고서 화면이 score_class 를 그려야 한다')

  // ★ 주석은 걷어 내고 본다 — 규칙을 적어 둔 주석에 그 낱말이 들어 있어서
  //   「판정을 넣지 말라」는 검사가 주석에 걸렸다(2026-11-19). 재는 것은 **그려지는 글자**다.
  const 주석뺀 = (src: string) => src
    .split('*/').map((x) => x.split('/*')[0]).join('')
    .split(String.fromCharCode(10)).filter((l) => !l.trim().startsWith('//')).join(' ')
  const view = 주석뺀(fs.readFileSync('components/report/ScoreClassReport.tsx', 'utf8'))
  ok(!/useState|useEffect|onClick/.test(view),
    'X 학부모 화면은 서버에서 그린 HTML 뿐이어야 한다 — 카톡 인앱 브라우저에서 JS 가 먹통이 된다'.slice(2))
  ok(!/유지|보완|관찰|탈락/.test(view),
    'X 학부모께 가는 보고서에 판정을 넣지 않는다 — 기록만 (원장님 2026-11-19)'.slice(2))

  const teacher = fs.readFileSync('app/teacher/reports/s-core/page.tsx', 'utf8')
  ok(/if \(!isAdmin\(\)\) return/.test(teacher), '화면도 원장 전용으로 막아야 한다')
  const side = fs.readFileSync('components/teacher/Sidebar.tsx', 'utf8')
  ok(/ITEM\.scoreClass/.test(side) && /'원장 전용'[^]*ITEM\.scoreClass/.test(side),
    '메뉴는 「원장 전용」 묶음에 들어가야 한다')
  const manual = fs.readFileSync('app/teacher/manual/page.tsx', 'utf8')
  ok(manual.includes("'/teacher/reports/s-core'"), '사용 매뉴얼에도 적어야 한다 — 선생님들이 이걸 보고 일한다')
}

// ── 여기부터는 운영 데이터 (환경파일이 있을 때만)
for (const f of ['.env' + '.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.log('(운영 데이터 확인은 건너뜀)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: ss } = await db.from('students')
    .select('id, name').eq('grade', '초6').eq('teacher_name', '윤지혜').eq('is_active', true)
  const 명단 = (ss ?? []) as any[]
  ok(명단.length >= 5, `S코어반 학생을 못 읽었다 (${명단.length}명)`)

  const 올해 = { from: '2026-01-01', to: '2026-11-18' }
  for (const st of 명단) {
    const r = await buildScoreClassReport(db as any, st.id, 올해.from, 올해.to)
    ok(r.student.name === st.name, `${st.name} 보고서의 이름이 다르다`)
    ok(r.aheadCourse === '중1', `${st.name} 의 선행 과정이 중1 로 잡혀야 한다 (지금 ${r.aheadCourse})`)
    ok(r.monthly.length > 0, `${st.name} 달마다 성적이 비어 있다`)
    ok(r.ahead.count > 0, `${st.name} 선행 범위 학습지가 한 건도 안 잡혔다`)
    ok(r.lessons.total > 0, `${st.name} 수업 기록이 비어 있다`)
    // 달마다 건수의 합 = 그 구간에 푼 전체 건수 (선행 + 현 학년 + 범위 없는 것)
    const 합 = r.monthly.reduce((a, m) => a + m.count, 0)
    ok(합 >= r.ahead.count + r.own.count,
      `${st.name} 달마다 건수의 합(${합})이 선행+현학년(${r.ahead.count + r.own.count})보다 적다`)
    ok(r.homework.total === r.lessons.total, `${st.name} 숙제 분모가 수업 수와 달라야 할 까닭이 없다`)
    ok(r.ahead.passed <= r.ahead.count, `${st.name} 통과 건수가 전체보다 많다`)
    // 판정 글자가 데이터에 섞여 들어가지 않았는지
    ok(!JSON.stringify(r).includes('유지 권장'), `${st.name} 보고서 데이터에 판정이 섞였다`)
  }

  // ★ 아는 값과 맞는지 — 2026-11-19 에 SQL 로 직접 센 값
  const 홍 = 명단.find((s) => s.name === '홍채은')
  if (홍) {
    const r = await buildScoreClassReport(db as any, 홍.id, 올해.from, 올해.to)
    ok(r.ahead.count === 29, `홍채은 중1 범위는 29건이어야 한다 (지금 ${r.ahead.count})`)
    ok(r.ahead.avg !== null && Math.abs(r.ahead.avg - 67.8) < 0.3,
      `홍채은 중1 범위 평균은 67.8 이어야 한다 (지금 ${r.ahead.avg})`)
    ok(r.own.count === 18, `홍채은 현 학년 범위는 18건이어야 한다 (지금 ${r.own.count})`)
    ok(r.lessons.absent === 9, `홍채은 결석은 9회여야 한다 (지금 ${r.lessons.absent})`)
    ok(r.homework.done === 33, `홍채은 숙제는 33회여야 한다 (지금 ${r.homework.done})`)
  }

  // 링크를 하나도 만들지 않았는지 — 검사가 운영 데이터를 건드리면 안 된다
  const { count } = await db.from('report_links')
    .select('id', { count: 'exact', head: true }).eq('report_type', 'score_class')
  console.log(`(운영 데이터 — S코어반 ${명단.length}명 · 지금 만들어진 score_class 링크 ${count ?? 0}건)`)
}

if (bad) { console.error(`\nS코어반 보고서 자가확인 실패 ${bad}건`); process.exit(1) }
console.log('S코어반 보고서 자가확인 OK')
