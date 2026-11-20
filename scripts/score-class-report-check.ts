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
import {
  isAhead, aheadCourseOf, isCoreKind, 평가모으기, buildScoreClassReport,
  과정이름, 과정번호, 진도모으기, 반과정고르기, 진도뒤인가, 반진도말, 같은날같은값, 보완점뽑기, 문턱,
  type ScoreClassReport, type 진도자리,
} from '../lib/scoreClassReport.ts'

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

// ②-2 같은 시험이 두 줄로 찍히지 않나 — 코어테스트가 core_tests 와 exams 양쪽에 들어 있다
{
  ok(isCoreKind('코어테스트') && isCoreKind('CORE테스트') && !isCoreKind('학교시험'),
    '코어테스트를 적는 말이 표마다 달라도 같은 것으로 봐야 한다')

  // 2026-11-19 운영 데이터 그대로 — 안준혁 05-11 은 네 줄이었다
  const 한줄 = 평가모으기(
    [{ test_date: '2026-05-11', test_round: '예비1', score: 75, total_score: 100 }],
    [
      { exam_date: '2026-05-11', exam_type: '코어테스트', title: '', score: 78, total_score: 100 },
      { exam_date: '2026-05-11', exam_type: '코어테스트', title: '예비 1회', score: 80, total_score: 100 },
      { exam_date: '2026-05-11', exam_type: '코어테스트', title: '예비 1회', score: 79, total_score: 100 },
    ])
  ok(한줄.length === 1, `같은 날 코어테스트는 한 줄이어야 한다 (지금 ${한줄.length}줄)`)
  ok(한줄[0]?.score === 75, '코어테스트는 core_tests 쪽 점수를 쓴다')

  // 학교시험은 건드리지 않는다 — 같은 날 코어테스트가 있어도 남아야 한다
  const 섞임 = 평가모으기(
    [{ test_date: '2026-09-21', test_round: '본고사', score: 88, total_score: 100 }],
    [{ exam_date: '2026-09-21', exam_type: '학교시험', title: '단원평가', score: 90, total_score: 100 }])
  ok(섞임.length === 2, `같은 날 학교시험은 따로 남아야 한다 (지금 ${섞임.length}줄)`)

  // core_tests 가 없는 날의 코어테스트는 exams 쪽이 그대로 남는다
  const 혼자 = 평가모으기([], [{ exam_date: '2026-07-21', exam_type: '코어테스트', title: '예비 1회', score: 56, total_score: 100 }])
  ok(혼자.length === 1 && 혼자[0].score === 56, 'core_tests 에 없는 날은 exams 쪽이 남아야 한다')

  // 같은 표 안에서 두 번 적힌 날 — 회차를 적은 줄을 쓴다 (안준혁 05-27)
  const 회차없는쪽 = 평가모으기([], [
    { exam_date: '2026-05-27', exam_type: '코어테스트', title: '', score: 92, total_score: 100 },
    { exam_date: '2026-05-27', exam_type: '코어테스트', title: '본고사', score: 88, total_score: 100 },
  ])
  ok(회차없는쪽.length === 1 && 회차없는쪽[0].score === 88,
    `회차를 적은 줄을 써야 한다 (지금 ${회차없는쪽.length}줄 · ${회차없는쪽[0]?.score}점)`)

  // 둘 다 회차가 적혀 있으면 앞 회차 (임지원 05-11 예비1·예비2 둘 다 77)
  const 두회차 = 평가모으기([
    { test_date: '2026-05-11', test_round: '예비2', score: 77, total_score: 100 },
    { test_date: '2026-05-11', test_round: '예비1', score: 77, total_score: 100 },
  ], [])
  ok(두회차.length === 1 && 두회차[0].title === '예비1',
    `둘 다 회차가 있으면 앞 회차 (지금 ${두회차.length}줄 · ${두회차[0]?.title})`)

  // 같은 표 안에서 글자까지 똑같이 두 번 들어간 것도 한 줄
  const 똑같이 = 평가모으기([], [
    { exam_date: '2026-11-16', exam_type: '학교시험', title: '단원평가', score: 95, total_score: 100 },
    { exam_date: '2026-11-16', exam_type: '학교시험', title: '단원평가', score: 95, total_score: 100 },
  ])
  ok(똑같이.length === 1, `똑같은 줄이 두 번 들어가면 한 줄로 (지금 ${똑같이.length}줄)`)
}

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
  // 2026-11-20 — 「보완해야 할 점」은 들어가게 됐다(원장님 지시). 넣지 않는 것은
  // **반을 정하는 말**이다. 그건 원장님이 따로 전하신다.
  ok(!/일반반|탈락|유지 권장|반 이동|보완 4주|관찰 대상|순위|반 평균/.test(view),
    'X 학부모께 가는 보고서에 반을 정하는 말을 넣지 않는다 (원장님 2026-11-19 「기록만 넣고」)'.slice(2))
  ok(/보완해야 할 점/.test(view), '보완해야 할 점이 보고서에 있어야 한다 (원장님 2026-11-20)')
  ok(/teacherNote/.test(view), '원장님이 적어 넣으신 한 줄을 실어야 한다')
  // 2026-11-20 — 원장님 「진도도 보고서에 나오게 해줘」
  ok(/진도/.test(view) && /회독/.test(view), '진도(회독)가 보고서에 나와야 한다 (원장님 2026-11-20)')
  ok(/d\.progress \?\?/.test(view),
    'X 옛 링크 스냅샷에는 progress 칸이 없다 — 없는 줄 모르고 읽으면 학부모 화면이 하얗게 뜬다'.slice(2))
  ok(/'#3b82f6'/.test(view) && /'#22c55e'/.test(view) && /'#ef4444'/.test(view),
    'X 회독 색은 진도표 화면과 같아야 한다 (1회독 파랑 · 2회독 초록 · 3회독 빨강)'.slice(2))

  // ★ 2026-11-20 부터 따로 있던 메뉴가 아니라 **보고서 화면의 탭**이다 (원장님 지시).
  //   탭이 화면에서 **원장님께만** 보여야 하고, 옛 주소가 남아 있으면 안 된다.
  const reports = fs.readFileSync('app/teacher/reports/page.tsx', 'utf8')
  ok(/\['score','S코어반 기록'\]/.test(reports), '보고서 화면에 「S코어반 기록」 탭이 있어야 한다')
  ok((reports.match(/currentUser\?\.role === 'admin'/g) ?? []).length >= 2,
    'X 탭 단추와 탭 내용 **둘 다** 원장님만이어야 한다 — 한쪽만 막으면 다른 쪽이 열린다'.slice(2))
  ok(!/isAdmin\(\)[^\n]*\['score'/.test(reports),
    'X 탭을 isAdmin() 으로 가리면 원장님이 강사모드로 보실 때 원장님께도 사라진다(c24f180)'.slice(2))
  ok(!fs.existsSync('app/teacher/reports/s-core'), '따로 있던 화면은 지워져야 한다 — 두 자리에 같은 것이 있으면 안 된다')

  const side = fs.readFileSync('components/teacher/Sidebar.tsx', 'utf8')
  ok(!/s-core|scoreClass/.test(side), '사이드바에 옛 메뉴가 남아 있으면 안 된다')
  const manual = fs.readFileSync('app/teacher/manual/page.tsx', 'utf8')
  ok(!manual.includes('/teacher/reports/s-core'), '매뉴얼에 옛 주소가 남아 있으면 안 된다')
  ok(/S코어반 기록/.test(manual), '사용 매뉴얼에 적어야 한다 — 선생님들이 이걸 보고 일한다')

  // 반 진도는 **원장님이 적으신다** — 수업 진도는 진도표보다 앞서 있을 수 있고 기계는 모른다
  //   (2026-11-20 학습지로 추정했다가 「1. 기본도형」으로 틀렸다)
  const api2 = 주석뺀(fs.readFileSync('app/api/score-class-report/route.ts', 'utf8'))
  ok(/classProgress/.test(api2), '반 진도를 원장님이 적어 넣을 수 있어야 한다')
  ok(/progress_checks/.test(api2) && /concepts/.test(api2),
    'X 진도는 **진도표**에서 읽어야 한다 — 학습지 단원 이름으로 추정하면 틀린다'.slice(2))
  ok(!/student_worksheets[^\n]*unit_name[^\n]*in\('student_id'/.test(api2),
    'X 반 진도를 학습지에서 뽑던 길이 남아 있으면 안 된다'.slice(2))

  const links = 주석뺀(fs.readFileSync('components/teacher/ScoreClassLinks.tsx', 'utf8'))
  ok(/useState/.test(links) && /classProgress/.test(links), '링크 만드는 화면에 반 진도 칸이 있어야 한다')
  ok(/JSON\.stringify\(\{[^}]*classProgress/.test(links),
    'X 반 진도가 **실제로 보내져야** 한다 — 칸만 있고 안 보내면 원장님이 적으신 글이 조용히 버려진다'.slice(2))
  ok(!/sendAlimtalk|sendSmsViaOps|sendPush/.test(links),
    'X 이 화면은 아무것도 보내지 않는다 — 보내는 것은 원장님이 직접 하신다'.slice(2))

  // ── 만든 링크 지우기 (원장님 2026-11-20 「지울거 선택해서 삭제할수 있도록 삭제버튼 만들어줘」)
  //    지우면 그 주소는 그 자리에서 죽는다. 막이가 하나라도 빠지면 엉뚱한 링크가 날아간다.
  // ★ 괄호까지 본다 — 「DELETE」만 찾으면 `DELETE_OFF` 로 이름만 바꿔 꺼 놓아도 통과한다
  //   (2026-11-20 망가뜨려 시험에서 실제로 통과했다).
  ok(/export async function DELETE\(/.test(api2), '만든 링크를 지우는 길이 있어야 한다')
  const del = api2.slice(api2.indexOf('export async function DELETE('))
  ok(/denyIfNotStaff\(req, \{ adminOnly: true \}\)/.test(del),
    'X 지우기는 **원장 전용**이어야 한다 — 화면만 가리면 주소로 부를 수 있다'.slice(2))
  ok(/\.eq\('report_type', TYPE\)/.test(del),
    'X **이 보고서 종류만** 지워야 한다 — 종류를 안 걸면 월간 리포트 링크까지 지워진다'.slice(2))
  ok(/\.in\('token'/.test(del),
    'X 토큰으로만 지워야 한다 — 학생 id 로 지우면 그 학생 것이 통째로 날아간다'.slice(2))
  ok(!/\.eq\('student_id'/.test(del), 'X 지우기에서 학생 id 를 가늠쇠로 쓰면 안 된다'.slice(2))
  ok(/deleted/.test(del),
    'X **지운 줄 수**를 돌려줘야 한다 — 「성공」은 성공이 아니다(2026-11-14)'.slice(2))

  ok(/method: 'DELETE'/.test(links), '화면이 지우기를 실제로 불러야 한다 — 단추만 있으면 안 된다')
  ok(/JSON\.stringify\(\{ tokens/.test(links),
    'X 고른 토큰이 **실제로 보내져야** 한다'.slice(2))
  ok(/confirm\(/.test(links.slice(links.indexOf('async function 지우기'))),
    'X 지우기 전에 한 번 더 여쭈어야 한다 — 되돌릴 수 없다'.slice(2))
  ok(/지울것/.test(links) && !/picked\.includes\(p\.token\)/.test(links),
    'X 지울 것 고르기는 **학생 고르기와 따로**여야 한다 — 섞으면 만들려다 지운다'.slice(2))
  ok(/toLocaleTimeString/.test(links),
    'X 만든 **시각**을 적어야 한다 — 같은 날 여러 번 만들면 날짜만으로는 못 가린다'.slice(2))
  ok(/만든 링크를 지울 수 있어요/.test(manual),
    'X 사용 매뉴얼에 적어야 한다 — 단추를 더하면 매뉴얼도 같이 고친다'.slice(2))
}

// ④ 보완해야 할 점 (원장님 2026-11-20 「각 학생들거 보고서 나갈때 보완해야 할점 이런거 써주면 좋을듯」)
{
  // ④-1 진도는 **진도표**에서 읽는다 (원장님 2026-11-20 「너 진도표는 안보니」).
  //      학습지 단원 이름으로 추정했다가 반 진도를 「1. 기본도형」으로 잡았는데,
  //      실제 반 진도는 **중1-2 개념서 1회를 끝내고 유형서 2회독 중**이었다.
  ok(과정이름('중1', 2) === '중1-2', '과정 이름은 「학년-학기」다')
  ok(과정이름('중1', null) === '중1', '학기를 모르면 학년만 적는다')
  ok(과정번호('중1', 2) > 과정번호('중1', 1), '같은 학년에서는 2학기가 뒤다')
  ok(과정번호('중1', 1) > 과정번호('초6', 2), '중1-1 은 초6-2 보다 뒤다')
  ok(과정번호('공통수학1', 1) > 과정번호('중3', 2), '고등 과목은 중3 보다 뒤다 (고등은 과목명으로 적힌다)')
  ok(과정번호('중등', 1) === -1,
    'X 학년 이름이 아닌 글자는 -1 이다 — 0 으로 두면 「초1보다 뒤」가 되어 전부 「진도가 뒤」로 찍힌다'.slice(2))

  // ④-1-2 진도 모으기 — 2026-11-20 운영 데이터 모양 (중1-2 48개 중 11개가 2회독)
  {
    const concepts = [
      ...Array.from({ length: 48 }, (_, i) => ({ id: 'b' + i, grade: '중1', semester: 2 })),
      ...Array.from({ length: 60 }, (_, i) => ({ id: 'a' + i, grade: '중1', semester: 1 })),
    ]
    const books = [
      { id: 'T1', textbook_name: '개념+유형라이트', textbook_type: '개념서' },
      { id: 'T2', textbook_name: '쎈', textbook_type: '유형서' },
    ]
    const checks = [
      // 개념서로 48개 1회독
      ...Array.from({ length: 48 }, (_, i) => ({ concept_id: 'b' + i, check_count: 1, student_textbook_id: 'T1' })),
      // 유형서로 앞 11개를 2회독
      ...Array.from({ length: 11 }, (_, i) => ({ concept_id: 'b' + i, check_count: 2, student_textbook_id: 'T2' })),
    ]
    const got = 진도모으기(checks, concepts, books)
    ok(got.length === 1 && got[0].course === '중1-2', `진도표에서 과정을 읽는다 (지금 ${got.map((g) => g.course).join(',')})`)
    const r1 = got[0].rounds.find((r) => r.round === 1)
    const r2 = got[0].rounds.find((r) => r.round === 2)
    ok(r1?.done === 48,
      `X 「1회독」은 **1회독 이상** 끝낸 개념 수다 — 회독별로 따로 세면 2회독 한 개념이 1회독에서 빠진다 (지금 ${r1?.done})`.slice(2))
    ok(r2?.done === 11, `2회독 이상 끝낸 개념은 11개다 (지금 ${r2?.done})`)
    ok(got[0].total === 48,
      `X 분모는 **과정표**에서 센다 — 기록 수로 세면 덜 푼 학생이 100% 로 보인다 (지금 ${got[0].total})`.slice(2))
    ok(got[0].books.join(' · ') === '개념+유형라이트 · 쎈', '그 과정에서 본 교재 이름을 모은다')

    // 같은 개념이 교재별로 여러 줄에 적힌다 — **가장 높은 회독만** 남겨야 한다
    const 두줄 = 진도모으기([
      { concept_id: 'b0', check_count: 1, student_textbook_id: 'T1' },
      { concept_id: 'b0', check_count: 3, student_textbook_id: 'T2' },
    ], concepts, books)
    ok(두줄[0].rounds.find((r) => r.round === 1)?.done === 1,
      'X 같은 개념이 교재별로 두 줄이어도 개념 하나로 센다'.slice(2))
    ok(두줄[0].rounds.find((r) => r.round === 3)?.done === 1, '개념마다 가장 높은 회독을 남긴다')
    const 거꾸로 = 진도모으기([
      { concept_id: 'b0', check_count: 3, student_textbook_id: 'T2' },
      { concept_id: 'b0', check_count: 1, student_textbook_id: 'T1' },
    ], concepts, books)
    ok(거꾸로[0].rounds.find((r) => r.round === 3)?.done === 1,
      'X 줄 순서가 거꾸로여도 가장 높은 회독을 남긴다 — 마지막 줄을 쓰면 회독이 깎인다'.slice(2))

    // 앞선 과정이 먼저 나와야 한다 — 학부모 화면이 「중1-2 → 중1-1」 차례로 읽힌다
    const 섞인 = 진도모으기([
      { concept_id: 'a0', check_count: 2, student_textbook_id: null },
      { concept_id: 'b0', check_count: 1, student_textbook_id: null },
    ], concepts)
    ok(섞인[0].course === '중1-2', `앞선 과정이 먼저다 (지금 ${섞인.map((g) => g.course).join(',')})`)
  }

  // ④-2 반이 하는 과정 — 2026-11-20 운영 데이터 모양 (여섯 명 중 **다섯 명**이 중1-2, 한 명은 중1-1)
  const 자리 = (course: string, order: number): 진도자리 =>
    ({ course, order, rounds: [{ round: 1, done: 1 }], total: 48, books: [] })
  const 중1_1 = 과정번호('중1', 1)
  const 중1_2 = 과정번호('중1', 2)
  {
    const 반 = [
      [자리('중1-2', 중1_2), 자리('중1-1', 중1_1)],
      [자리('중1-2', 중1_2), 자리('중1-1', 중1_1)],
      [자리('중1-2', 중1_2), 자리('중1-1', 중1_1)],
      [자리('중1-2', 중1_2), 자리('중1-1', 중1_1)],
      [자리('중1-2', 중1_2), 자리('중1-1', 중1_1)],
      [자리('중1-1', 중1_1)],
    ]
    ok(반과정고르기(반)?.course === '중1-2',
      `과반이 닿은 **가장 앞선** 과정을 반 진도로 본다 (지금 ${반과정고르기(반)?.course})`)
  }

  // 한두 명이 먼저 나간 과정은 반 진도가 아니다 — 그러면 나머지 모두가 「뒤」로 찍힌다
  ok(반과정고르기([
    [자리('중2-1', 과정번호('중2', 1)), 자리('중1-2', 중1_2)],
    [자리('중1-2', 중1_2)],
    [자리('중1-2', 중1_2)],
    [자리('중1-1', 중1_1)],
  ])?.course === '중1-2', '한 명만 닿은 중2-1 은 반 진도가 아니다')
  ok(반과정고르기([
    [자리('중1-2', 중1_2)],
    [자리('중1-1', 중1_1)],
  ]) === null, '과반이 안 되면 반 진도를 정하지 않는다 (2명이 서로 다른 과정)')
  ok(반과정고르기([[], [], []]) === null, '진도표가 비어 있으면 반 진도를 정하지 않는다')
  ok(반과정고르기([
    [자리('중등', -1)], [자리('중등', -1)], [자리('중등', -1)],
  ]) === null, '학년 이름이 아닌 과정은 반 진도로 삼지 않는다')

  // ④-2-2 뒤에 있다고 말할 수 있는 때 — **진도표가 비어 있으면 말하지 않는다**
  ok(진도뒤인가({ order: 중1_2 }, [자리('중1-1', 중1_1)]), '반 과정보다 앞 과정에 있으면 뒤에 있는 것이다')
  ok(!진도뒤인가({ order: 중1_2 }, [자리('중1-2', 중1_2), 자리('중1-1', 중1_1)]),
    '반 과정에 닿아 있으면 뒤에 있는 것이 아니다')
  ok(!진도뒤인가({ order: 중1_2 }, [자리('중2-1', 과정번호('중2', 1))]), '반보다 앞서 있으면 뒤가 아니다')
  ok(!진도뒤인가({ order: 중1_2 }, []),
    'X 진도표에 기록이 없으면 뒤에 있다고 하지 않는다 — 안 적힌 것과 못 따라가는 것은 다르다'.slice(2))
  ok(!진도뒤인가(null, [자리('중1-1', 중1_1)]), '반 진도를 모르면 뒤에 있다고 하지 않는다')
  ok(!진도뒤인가({ order: 중1_2 }, [자리('중등', -1)]),
    'X 학년을 못 읽은 과정만 있으면 뒤에 있다고 하지 않는다'.slice(2))

  // ④-2-3 반 진도 글 — **원장님이 적으신 글이 먼저다**
  ok(반진도말('중1-2 개념서 1회 끝, 유형서 2회독 중', '중1-2') === '중1-2 개념서 1회 끝, 유형서 2회독 중',
    'X 원장님이 적으신 반 진도 글이 **그대로** 나가야 한다 — 수업 진도는 진도표보다 앞설 수 있다'.slice(2))
  ok(반진도말('', '중1-2') === '중1-2', '안 적으시면 진도표에서 구한 과정 이름을 쓴다')
  ok(반진도말('   ', '중1-2') === '중1-2', '빈칸만 적으신 것은 안 적으신 것으로 본다')
  ok(반진도말(null, null) === null, '둘 다 없으면 null — 그러면 진도 줄이 아예 안 나온다')

  // ④-2-3 한꺼번에 적힌 날 — 2026-11-02 에 여섯 명 **전원**의 성취도가 0% 였다.
  //        사람이 한 명씩 보고 적은 값이 전원 똑같을 수는 없다. 그대로 두면 학부모 네 분이 본다.
  {
    const 반 = [
      [{ date: '2026-11-02', pct: 0 }, { date: '2026-11-09', pct: 50 }],
      [{ date: '2026-11-02', pct: 0 }, { date: '2026-11-09', pct: 100 }],
      [{ date: '2026-11-02', pct: 0 }, { date: '2026-11-09', pct: 100 }],
      [{ date: '2026-11-02', pct: 0 }, { date: '2026-11-09', pct: 100 }],
    ]
    const 뺄날 = 같은날같은값(반)
    ok(뺄날.includes('2026-11-02'), '전원이 같은 값으로 적힌 날은 빼야 한다')
    ok(!뺄날.includes('2026-11-09'), '값이 갈리는 날은 그 학생의 기록이므로 남겨야 한다')
    ok(같은날같은값([[{ date: '2026-11-02', pct: 0 }], [{ date: '2026-11-02', pct: 0 }]]).length === 0,
      '두 명이 우연히 같은 것은 흔하다 — 세 명 이상일 때만 뺀다')
    // ★ 반 전체가 100% 인 날은 흔하다 — 이걸 안 좁히면 뺄 날이 스물두 날로 불어난다
    ok(같은날같은값([
      [{ date: '2026-10-14', pct: 100 }], [{ date: '2026-10-14', pct: 100 }],
      [{ date: '2026-10-14', pct: 100 }], [{ date: '2026-10-14', pct: 100 }],
    ]).length === 0, '반 전체가 100% 인 날은 빼는 날이 아니다')
  }

  // ④-3 보완점 뽑기
  const 빈보고서: ScoreClassReport = {
    student: { name: '시험', grade: '초6', school: null, teacher: null },
    period: { from: '2026-01-01', to: '2026-11-18', label: '2026.01 ~ 2026.11' },
    aheadCourse: '중1',
    monthly: [],
    ahead: { count: 20, avg: 85, passed: 18, recent8w: { count: 6, avg: 85 } },
    own: { count: 20, avg: 90 },
    retry: { count: 20, avg: 85 },
    weak: [],
    lessons: { total: 50, onTime: 48, late: 2, absent: 0 },
    homework: { done: 50, total: 50, pct: 100 },
    books: { done: [], current: null },
    exams: [],
    achievement: { low: [], recent: 100, before: 100 },
    pace: { classUnit: null, course: null, mine: null, behind: false },
    progress: { classLabel: null, courses: [] },
    improve: { items: [], thin: [] },
    teacherNote: null,
    madeAt: '2026-11-20',
  }
  const 키들 = (r: ScoreClassReport) => 보완점뽑기(r).items.map((x) => x.key)

  ok(키들(빈보고서).length === 0, `기준을 다 넘으면 보완점이 없어야 한다 (지금 ${키들(빈보고서).join(',')})`)

  // 진도 — 반 과정에 아직 못 닿은 학생 (2026-11-20 에 여섯 명 중 한 명이 이 모양이었다)
  const 뒤 = { ...빈보고서, pace: {
    classUnit: '중1-2 개념서 1회 끝, 중1-2 유형서 2회독 중', course: '중1-2', mine: '중1-1 2회독', behind: true } }
  ok(키들(뒤).includes('pace'), '반 과정에 못 닿았으면 진도 줄이 나와야 한다')
  const 진도줄 = 보완점뽑기(뒤).items.find((x) => x.key === 'pace')!
  ok(진도줄.fact.includes('중1-2 유형서 2회독 중'),
    'X 원장님이 적어 넣으신 반 진도 글이 **그대로** 보고서에 나가야 한다'.slice(2))
  ok(진도줄.fact.includes('중1-1 2회독'), '진도 줄에 그 학생이 가 있는 자리가 적혀야 한다')
  ok(진도줄.todo.includes('중1-2'), '메워야 할 과정이 적혀야 한다')
  ok(!/느리|뒤처|다른 학생|친구들|평균보다/.test(진도줄.fact + 진도줄.todo),
    'X 진도 줄에 다른 학생과 견주는 말을 쓰지 않는다 (원장님 2026-11-20 「좀 돌려서 써줘」)'.slice(2))

  // ★ 진도표가 비어 있으면 뒤에 있다고 하지 않는다 — 안 적힌 것과 못 따라가는 것은 다르다
  ok(!키들({ ...빈보고서, pace: { classUnit: '중1-2', course: '중1-2', mine: null, behind: false } }).includes('pace'),
    '진도표에 기록이 없으면 진도 줄을 넣지 않는다')

  // 성취도 — 반 전체가 같은 날 0% 로 적힌 일이 있었다. **한 번뿐이면 넣지 않는다**
  ok(!키들({ ...빈보고서, achievement: { low: [{ date: '2026-11-02', pct: 0 }], recent: 96, before: 100 } })
    .includes('achievement'), '성취도가 한 번 낮게 적힌 것으로는 보완점을 만들지 않는다 (입력 사고)')
  const 성취 = { ...빈보고서, achievement: {
    low: [{ date: '2026-10-19', pct: 50 }, { date: '2026-10-31', pct: 50 }, { date: '2026-11-02', pct: 0 }],
    recent: 94.7, before: 99.3 } }
  ok(키들(성취).includes('achievement'), '성취도가 두 번 이상 낮게 적히면 보완점이 된다')
  ok(보완점뽑기(성취).items.find((x) => x.key === 'achievement')!.fact.includes('10/19'),
    'X 성취도 줄에는 **그 날짜**가 적혀야 한다 — 평균(94.7)으로는 아무 말도 할 수 없다'.slice(2))

  // 문턱 넷
  ok(키들({ ...빈보고서, lessons: { total: 51, onTime: 40, late: 2, absent: 9 } }).includes('attend'),
    '출석률이 기준 아래면 보완점이 된다')
  ok(키들({ ...빈보고서, homework: { done: 30, total: 48, pct: 62.5 } }).includes('homework'),
    '숙제 비율이 기준 아래면 보완점이 된다')
  ok(키들({ ...빈보고서, ahead: { count: 29, avg: 67.8, passed: 15, recent8w: { count: 18, avg: 70 } } }).includes('ahead'),
    '선행 범위 평균이 기준 아래면 보완점이 된다')
  ok(키들({ ...빈보고서, own: { count: 18, avg: 79.9 } }).includes('own'),
    '현 학년 범위 평균이 기준 아래면 보완점이 된다')

  // ★ 자료가 적으면 판정하지 않는다 (docs/S코어반_유지기준.md 1번)
  const 적음 = { ...빈보고서, ahead: { count: 5, avg: 40, passed: 1, recent8w: { count: 3, avg: 40 } } }
  ok(!키들(적음).includes('ahead'), '선행 자료가 8건 미만이면 평균으로 보지 않는다')
  ok(보완점뽑기(적음).thin.some((t) => t.includes('5건')), '대신 「자료가 적다」로 적어 둬야 한다')

  // 반을 정하는 말이 보완점에 섞이지 않는지
  const 다섞임 = {
    ...빈보고서,
    pace: { classUnit: '중1-2 유형서 2회독 중', course: '중1-2', mine: '중1-1 2회독', behind: true },
    lessons: { total: 51, onTime: 40, late: 2, absent: 9 },
    homework: { done: 30, total: 48, pct: 62.5 },
    ahead: { count: 29, avg: 67.8, passed: 15, recent8w: { count: 18, avg: 70 } },
    weak: [{ date: '2026-11-11', unit: '1. 문자의 사용과 식의 계산', score: 68 }],
  }
  const 글자 = JSON.stringify(보완점뽑기(다섞임))
  ok(!/일반반|탈락|유지 권장|반 이동|순위|반 평균/.test(글자), '보완점에 반을 정하는 말이 섞이면 안 된다')
  ok(!/느리|뒤처|다른 학생|친구들/.test(글자), '보완점에 다른 학생과 견주는 말이 섞이면 안 된다')

  // ④-3-2 옛 링크(스냅샷)에는 achievement·pace·improve 가 없다.
  //        없는 줄 모르고 읽으면 **학부모 화면이 하얗게 뜬다.** 보내 드린 링크는 살아 있어야 한다.
  {
    const 옛링크: any = { ...빈보고서 }
    delete 옛링크.achievement
    delete 옛링크.pace
    delete 옛링크.progress
    delete 옛링크.improve
    delete 옛링크.teacherNote
    let 터짐: string | null = null
    try { 보완점뽑기(옛링크) } catch (e: any) { 터짐 = e?.message ?? '알 수 없는 오류' }
    ok(터짐 === null, `X 옛 링크에서 보완점을 뽑다가 터진다 (${터짐}) — 보내 드린 링크가 하얗게 뜬다`.slice(2))

    // 2026-11-19 에 실제로 만든 스냅샷 모양 — 칸이 모자라도 뽑히는 것은 뽑혀야 한다
    const 옛것: any = { ...옛링크, homework: { done: 30, total: 48, pct: 62.5 } }
    ok(보완점뽑기(옛것).items.some((x) => x.key === 'homework'),
      '옛 링크에서도 있는 칸으로는 보완점을 뽑아야 한다')
  }

  // ④-4 문턱이 문서와 같은 값인가 — 두 곳이 갈리면 보고서가 문서와 다른 말을 한다
  const 문서 = fs.readFileSync('docs/S코어반_유지기준.md', 'utf8').split('\n')
  const 줄찾기 = (키: string) => 문서.find((l) => l.startsWith('|') && l.includes(키)) ?? ''
  ok(줄찾기('현 학년').includes(`${문턱.own}점 이상`), `문서의 현 학년 문턱이 ${문턱.own}점이어야 한다`)
  ok(줄찾기('선행(').includes(`${문턱.ahead}점 이상`), `문서의 선행 문턱이 ${문턱.ahead}점이어야 한다`)
  ok(줄찾기('숙제를 해 온').includes(`${문턱.homework}% 이상`), `문서의 숙제 문턱이 ${문턱.homework}%여야 한다`)
  ok(줄찾기('출석률').includes(`${문턱.attend}% 이상`), `문서의 출석 문턱이 ${문턱.attend}%여야 한다`)
}

// ── 여기부터는 운영 데이터 (환경파일이 있을 때만)
for (const f of ['.env' + '.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
/** 1000행 벽을 넘겨 전부 읽는다 (route.ts 와 같은 규칙) */
async function 전부(make: () => any): Promise<any[]> {
  const out: any[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await make().range(i, i + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return out
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
    // 보완점이 들어 있고, 반을 정하는 말이 안 섞였는지
    ok(Array.isArray(r.improve?.items), `${st.name} 보완점이 안 들어 있다`)
    ok(!/일반반|탈락|유지 권장|느리|다른 학생/.test(JSON.stringify(r.improve)),
      `${st.name} 보완점에 쓰면 안 되는 말이 섞였다`)
    // 같은 날 코어테스트가 두 줄로 찍히지 않는지 — 두 표에 같은 시험이 들어 있다
    const 코어날 = r.exams.filter((e) => isCoreKind(e.kind)).map((e) => e.date)
    ok(new Set(코어날).size === 코어날.length,
      `${st.name} 같은 날 코어테스트가 ${코어날.length - new Set(코어날).size}줄 더 찍힌다`)
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

  // ★ 진도 — **진도표**에서 읽는지 (원장님 2026-11-20 「너 진도표는 안보니」).
  //   학습지 단원으로 추정했을 때는 반 진도가 「1. 기본도형」으로 나왔다. 실제 반 진도는
  //   **중1-2 개념서 1회를 끝내고 유형서 2회독 중**이다. 이름은 적지 않는다 — 명수로만 센다.
  {
    const ids = 명단.map((s) => s.id)
    const concepts = await 전부(() => db.from('concepts').select('id, grade, semester').order('id'))
    const checks = await 전부(() => db.from('progress_checks')
      .select('student_id, concept_id, check_count, student_textbook_id').in('student_id', ids).order('id'))
    ok(checks.length > 1000,
      `X 진도표가 1000행에서 잘렸다 — 쪽을 넘겨 읽어야 한다 (지금 ${checks.length}행)`.slice(2))

    const 사람별 = ids.map((id) =>
      진도모으기(checks.filter((c: any) => String(c.student_id) === String(id)) as any, concepts as any))
    const 반 = 반과정고르기(사람별)
    ok(반?.course === '중1-2', `반 진도는 진도표에서 중1-2 로 나와야 한다 (지금 ${반?.course})`)

    const 뒤인사람 = 사람별.filter((내) => 진도뒤인가(반, 내)).length
    ok(뒤인사람 === 1, `진도가 반보다 뒤인 학생은 1명이어야 한다 (지금 ${뒤인사람}명)`)

    // 중1-2 에 닿은 학생은 1회독을 48개까지 센다 (분모는 과정표에서 — 48개)
    const 중1_2들 = 사람별.map((내) => 내.find((c) => c.course === '중1-2')).filter(Boolean) as any[]
    ok(중1_2들.length === 명단.length - 1, `중1-2 에 닿은 학생은 ${명단.length - 1}명이어야 한다 (지금 ${중1_2들.length}명)`)
    ok(중1_2들.every((c) => c.total === 48), `중1-2 과정 개념은 48개다 (지금 ${[...new Set(중1_2들.map((c) => c.total))].join(',')})`)
    ok(중1_2들.some((c) => c.rounds.some((r: any) => r.round >= 2)),
      '중1-2 를 2회독 중인 학생이 있어야 한다 (반 진도가 유형서 2회독이다)')
    const 한바퀴 = 중1_2들.filter((c) => (c.rounds.find((r: any) => r.round === 1)?.done ?? 0) === 48).length
    ok(한바퀴 >= 4, `중1-2 를 1회독 끝낸 학생이 과반이어야 한다 (지금 ${한바퀴}명)`)
  }

  // 보고서에 진도 칸이 실제로 들어가는지
  for (const st of 명단) {
    const r = await buildScoreClassReport(db as any, st.id, 올해.from, 올해.to)
    ok(r.progress.courses.length > 0, `${st.name} 보고서에 진도가 비어 있다`)
    ok(r.progress.courses.length <= 3, `${st.name} 진도는 앞선 세 과정까지만 싣는다 (지금 ${r.progress.courses.length}개)`)
    ok(r.progress.courses.every((c) => c.rounds.every((x) => x.done <= c.total)),
      `${st.name} 끝낸 개념 수가 과정 전체보다 많다`)
    // 회독은 높은 쪽이 적거나 같아야 한다 — 「2회독 이상」은 「1회독 이상」의 부분집합이다
    ok(r.progress.courses.every((c) => c.rounds.every((x, i) => i === 0 || x.done >= c.rounds[i - 1].done)),
      `${st.name} 회독이 올라갈수록 끝낸 개념이 늘어난다 — 「N회독 이상」으로 안 세고 있다`)
  }

  // ★ 진도는 **구간(from~to)으로 자르지 않는다.** 진도는 「올해 몇 건 풀었나」가 아니라
  //   **지금 어디까지 왔나**다. 작년에 끝낸 과정도 지금 자리를 말해 준다.
  {
    const st = 명단[0]
    const 넓게 = await buildScoreClassReport(db as any, st.id, 올해.from, 올해.to)
    const 하루 = await buildScoreClassReport(db as any, st.id, 올해.to, 올해.to)
    ok(하루.progress.courses.length === 넓게.progress.courses.length && 하루.progress.courses.length > 0,
      `X 구간을 하루로 좁혀도 진도는 그대로여야 한다 (넓게 ${넓게.progress.courses.length}개 · 하루 ${하루.progress.courses.length}개)`.slice(2))
  }

  // 링크를 하나도 만들지 않았는지 — 검사가 운영 데이터를 건드리면 안 된다
  const { count } = await db.from('report_links')
    .select('id', { count: 'exact', head: true }).eq('report_type', 'score_class')
  console.log(`(운영 데이터 — S코어반 ${명단.length}명 · 지금 만들어진 score_class 링크 ${count ?? 0}건)`)
}

if (bad) { console.error(`\nS코어반 보고서 자가확인 실패 ${bad}건`); process.exit(1) }
console.log('S코어반 보고서 자가확인 OK')
