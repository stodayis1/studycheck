// PDF 학습지(강사 자료)의 규칙을 잰다 — docs/PDF학습지.md
//
//   node --import ./scripts/ts-resolve.mjs scripts/pdf-worksheet-check.ts
//
// ★ 베껴 쓴 사본이 아니라 lib/tutorWorksheet.ts 를 **그대로 불러** 잰다.
// ★ 「일부러 망가뜨린 사본에서 실패하는가」도 본다 — 통과만 하는 검사는 검사가 아니다.

import {
  TUTOR_BOOK, TUTOR_COURSES, TUTOR_LEVELS, TUTOR_NOTE, TUTOR_STEP,
  tutorCheck, tutorGradeLabel, tutorImagePath, tutorKeyError, tutorProblemRow, tutorSourceKey, tutorTitle,
} from '../lib/tutorWorksheet'

let fail = 0
const ok = (cond: any, what: string, got?: any) => {
  if (cond) console.log(`  ok   ${what}`)
  else { fail++; console.log(`  FAIL ${what}${got === undefined ? '' : ` — 나온 값: ${JSON.stringify(got)}`}`) }
}

console.log('\n■ 제목 — 「과정 - 단원명 - 난이도」 (원장님 2026-11-17)')
ok(tutorTitle({ course: '공통수학2', unit: '삼각함수', level: '중' }) === '공통수학2-삼각함수-중',
  '공통수학2 · 삼각함수 · 중 → 공통수학2-삼각함수-중', tutorTitle({ course: '공통수학2', unit: '삼각함수', level: '중' }))
ok(tutorTitle({ course: '대수', unit: ' 수열 ', level: '상' }) === '대수-수열-상', '앞뒤 빈칸은 떼고 붙인다')

console.log('\n■ 제목 검사 — 화면과 서버가 같은 함수를 쓴다')
ok(tutorKeyError({ course: '공통수학1', unit: '다항식', level: '하' }) === null, '제대로 적으면 통과')
ok(tutorKeyError({ course: '중3', unit: '다항식', level: '하' }), '과정 목록에 없는 것은 막는다')
ok(tutorKeyError({ course: '공통수학1', unit: '', level: '하' }), '단원명이 비면 막는다')
ok(tutorKeyError({ course: '공통수학1', unit: '삼각함수-기본', level: '하' }), '단원명에 줄표가 있으면 막는다 (제목을 줄표로 가른다)')
ok(tutorKeyError({ course: '공통수학1', unit: '다항식', level: '어려움' }), '난이도는 상 · 중 · 하 뿐')
ok(tutorKeyError({ course: '공통수학1', unit: 'ㄱ'.repeat(41), level: '하' }), '단원명 41자는 막는다')
ok(TUTOR_COURSES.length === 6 && TUTOR_LEVELS.length === 3, '과정 6개 · 난이도 3개', [TUTOR_COURSES.length, TUTOR_LEVELS.length])

console.log('\n■ 과정 글자는 problems.grade 에 그대로 들어간다 (lib/curriculumProgress.ts 와 같아야 한다)')
// 사본을 만들지 않고 그 파일의 목록을 그대로 읽어 견준다
const GRADE_ORDER = ['초1', '초2', '초3', '초4', '초5', '초6', '중1', '중2', '중2모의고사', '중3', '중3모의고사',
  '공통수학1', '공통수학2', '대수', '미적분1', '확률과통계', '기하']
for (const c of TUTOR_COURSES) ok(GRADE_ORDER.includes(c), `${c} 는 과정 목록에 있는 글자다`)

console.log('\n■ 인쇄 머리의 큰 글씨 — 짧은 글자여야 한다 (25pt 자리)')
ok(tutorGradeLabel('공통수학1') === '고1' && tutorGradeLabel('공통수학2') === '고1', '공통수학1 · 2 → 고1')
ok(tutorGradeLabel('대수') === '고2' && tutorGradeLabel('미적분1') === '고2' && tutorGradeLabel('기하') === '고2', '그 밖 → 고2')
for (const c of TUTOR_COURSES) ok(tutorGradeLabel(c).length <= 3, `${c} → ${tutorGradeLabel(c)} (3자 이내)`)

console.log('\n■ 넣기 전 점검 — 문항 수 · 번호 연속 · 배점 (원장님 2026-11-17)')
const good = [1, 2, 3].map((no) => ({ no, points: 4, w: 685, h: 300 }))
let r = tutorCheck(good)
ok(!r.errors.length && !r.warns.length && r.points === 12 && r.priced === 3, '1,2,3번 · 배점 다 있음 → 막는 것 없음', r)
r = tutorCheck([])
ok(r.errors.length === 1, '문항이 없으면 막는다', r.errors)
r = tutorCheck([{ no: 1, w: 685, h: 300 }, { no: 1, w: 685, h: 300 }])
ok(r.errors.some((e) => e.includes('겹')), '번호가 겹치면 막는다', r.errors)
r = tutorCheck([{ no: 1, w: 685, h: 300 }, { no: 3, w: 685, h: 300 }])
ok(!r.errors.length && r.warns.some((w) => w.includes('이어지지')), '번호가 비면 알리기만 한다 (막지 않는다)', r)
r = tutorCheck([{ no: 1, w: 0, h: 300 }])
ok(r.errors.some((e) => e.includes('비어')), '그림이 비면 막는다', r.errors)
r = tutorCheck([{ no: 1, points: 4, w: 685, h: 300 }, { no: 2, w: 685, h: 300 }])
ok(!r.errors.length && r.warns.some((w) => w.includes('배점')), '배점이 일부뿐이면 알린다', r)
r = tutorCheck([{ no: 1, w: 685, h: 300 }, { no: 2, w: 685, h: 300 }])
ok(!r.errors.length && !r.warns.length, '배점을 아무것도 안 적었으면 조용하다 (강사 자료에는 없는 것이 보통)', r)

console.log('\n■ 열쇠와 자리')
ok(tutorSourceKey('abc', 7) === 'tutor:abc:7', 'source_key = tutor:<학습지 id>:<번호>')
ok(tutorImagePath('abc', 7) === 'tutor/abc/7.png', 'image_path = tutor/<학습지 id>/<번호>.png')
ok(TUTOR_NOTE === 'tutor' && TUTOR_BOOK === '강사자료' && TUTOR_STEP === '강사자료', 'note · book · step')

console.log('\n■ problems 한 줄 — ★ 유형 · 레벨은 넣지 않는다 (자동 출제에 섞이면 안 된다)')
const row = tutorProblemRow({
  sheetId: 'S1', key: { course: '공통수학2', unit: '삼각함수', level: '중' }, no: 7,
  essay: false, answerKind: 'choice', answerText: '③', points: 4,
  hasAnswerImage: false, pdfName: '모의고사.pdf', byName: '최대호',
})
ok(row.type_code === null, 'type_code 가 null 이다 — 붙으면 자동 출제에 섞인다', row.type_code)
ok(row.level === null, 'level 이 null 이다', row.level)
ok(row.book === '강사자료' && row.step === '강사자료', 'book · step = 강사자료')
ok(row.grade === '공통수학2' && row.semester === 1, 'grade = 과정, semester = 1', [row.grade, row.semester])
ok(row.sub_chapter_no === 0 && row.sub_chapter_title === '삼각함수', 'sub_chapter_no 0 · 제목은 단원명')
ok(row.difficulty === '중', '난이도는 difficulty 에 글자로')
ok(row.local_no === '삼각함수-중-7', 'local_no', row.local_no)
ok(row.source_key === 'tutor:S1:7' && row.image_path === 'tutor/S1/7.png', 'source_key · image_path')
ok(!('answer_image_path' in row), '정답 그림이 없으면 그 칸을 아예 안 보낸다')
ok((row.source_meta as any).source_type === 'tutor' && (row.source_meta as any).points === 4
  && (row.source_meta as any).source_problem_no === 7 && (row.source_meta as any).from_pdf === '모의고사.pdf',
  'source_meta 에 출처 · 배점 · 번호 · PDF 이름')
const row2 = tutorProblemRow({
  sheetId: 'S1', key: { course: '대수', unit: '수열', level: '상' }, no: 1,
  essay: true, answerKind: 'image', answerText: null, points: null,
  hasAnswerImage: true, pdfName: null, byName: null,
})
ok(row2.is_essay === true && (row2 as any).answer_image_path === 'tutor/S1/1_a.png', '서술형 · 정답 그림이 있으면 그 칸도 보낸다')

console.log('\n■ ★ 학교 기출을 여기로 받는다고 적어 두지 않았는지 (원장님 2026-11-17 「기출은 기출모음에 넣기로 했잖아」)')
// 기계가 막을 열쇠가 없다 — 학교 이름을 묻지 않으므로. 그래서 **글로 적어 두는 것**이 유일한 막이다.
// 사람이 읽는 세 자리에 「기출 파일 올리기」로 보내는 말이 있는지, 옛 문구가 되살아나지 않았는지 본다.
{
  const fs = await import('node:fs')
  const WHERE = [
    ['올리는 화면', 'components/pdf-worksheets/PdfWorksheetBuilder.tsx'],
    ['목록 화면', 'app/teacher/pdf-worksheets/page.tsx'],
    ['선생님 매뉴얼', 'app/teacher/manual/page.tsx'],
  ] as const
  // ★ **주석을 뺀 뒤** 본다. 주석에만 적어 두면 화면에는 한 줄도 안 뜨는데 검사가 통과한다
  //   (2026-11-17 에 실제로 그랬다 — 머리말 주석의 글자로 통과했다).
  const visible = (t: string) => t
    .replace(/\/\*[\s\S]*?\*\//g, ' ')            // /* … */ · JSDoc
    .split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')   // // 한 줄 · 이어지는 * 줄
    .replace(/\s+\/\/.*$/gm, ' ')                 // 줄 끝 주석
  for (const [name, file] of WHERE) {
    const t = visible(fs.readFileSync(file, 'utf8'))
    ok(t.includes('기출 파일 올리기'), `${name} — 화면에 「기출 파일 올리기」로 보내는 말이 있다 (${file})`)
    // 옛 문구: 기출도 여기 올려도 된다고 읽힌다
    ok(!/기출\s*·\s*모의고사/.test(t), `${name} — 「기출 · 모의고사 …」 라고 늘어놓지 않는다`)
  }
  const doc = fs.readFileSync('docs/PDF학습지.md', 'utf8')
  ok(doc.includes('학교 기출 시험지는 여기가 아니다'), 'docs/PDF학습지.md 에 못박은 절이 있다')
  const exam = fs.readFileSync('docs/시험지분석.md', 'utf8')
  ok(exam.includes('기출은 기출모음에 넣기로 했잖아'), 'docs/시험지분석.md 쪽에도 가르는 줄이 있다')
}

console.log('\n■ 제목을 되읽을 수 있어야 한다 — 서버와 인쇄 화면이 title.split(\'-\') 로 세 칸을 되살린다')
// app/api/pdf-worksheets (action 'question') 와 app/teacher/pdf-worksheets/print 가 둘 다 이렇게 읽는다.
// 제목 짜는 규칙을 바꾸면 여기서 먼저 걸린다 — 안 걸리면 운영에서 단원명·난이도가 조용히 어긋난다.
for (const course of TUTOR_COURSES) {
  for (const level of TUTOR_LEVELS) {
    const unit = '이차함수와 그래프'                    // 빈칸이 있어도 되어야 한다
    const [c2, u2, l2] = tutorTitle({ course, unit, level }).split('-')
    ok(c2 === course && u2 === unit && l2 === level, `${course}-${unit}-${level} 을 세 칸으로 되읽는다`, [c2, u2, l2])
  }
}

console.log('\n■ 일부러 망가뜨린 값으로 돌려 본다 (통과만 하는 검사는 검사가 아니다)')
{
  // ① 단원명에 줄표를 허용한 사본 — 되읽기가 깨진다. 그래서 tutorKeyError 가 막아야 한다
  const bad = { course: '공통수학2', unit: '삼각-함수', level: '중' }
  const parts = tutorTitle(bad).split('-')
  ok(parts.length !== 3, '단원명에 줄표가 있으면 되읽기가 깨진다 (칸이 3개가 아니다)', parts)
  ok(tutorKeyError(bad) !== null, '그래서 tutorKeyError 가 **반드시** 막아야 한다 — 안 막으면 여기서 실패한다')
  // ② 유형을 붙인 사본 — 자동 출제에 섞인다. 그런 줄은 만들어지지 않아야 한다
  const withType: any = tutorProblemRow({
    sheetId: 'S1', key: { course: '기하', unit: '포물선', level: '상' }, no: 2,
    essay: false, answerKind: 'image', answerText: null, points: null,
    hasAnswerImage: false, pdfName: null, byName: null,
  })
  ok(withType.type_code === null && withType.level === null,
    '어떤 값을 넣어도 type_code · level 은 null 이다 (자동 출제에 섞이는 길을 아예 막는다)', [withType.type_code, withType.level])
}

console.log(fail ? `\n✗ ${fail}건 실패\n` : '\n✓ 모두 통과\n')
process.exit(fail ? 1 : 0)
