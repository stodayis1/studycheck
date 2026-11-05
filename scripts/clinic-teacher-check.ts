/**
 * 채움쌤(클리닉 담임)이 **자기 학생을 보고 학습일지를 쓸 수 있는지** 시험한다. (원장님 2026-11-05)
 *
 * 왜 필요한가
 *   「채움쌤도 학생 학습일지 같이 쓰고 볼수 있어야해」
 *
 *   ★ 여기서 틀리면 **에러가 안 나고 화면만 조용히 빈다.** 2026-10-14 에 똑같은 일이 있었다 —
 *     담당 칸을 나누는 규칙이 11곳에 흩어져 있어서 한 학생이 두 선생님 모두에게 안 보였고,
 *     안 보이니 같은 학생을 하나 더 만들어 중복 계정 사고가 됐다.
 *   ★ 그래서 판단은 lib/teachers.ts 한 곳(teachersOf·isMine)에서만 한다.
 *     화면마다 `splitTeachers(s.teacher_name).includes(내이름)` 을 또 쓰면 그 화면만 빈다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/clinic-teacher-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/teachers.ts')
const { teachersOf, isMine, staffCanSeeStudent, splitTeachers, teacherLabels } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')
const 학생 = (t: any, c: any = null, grade = '중2') => ({ teacher_name: t, clinic_teacher_name: c, grade })

T('키움쌤·채움쌤을 둘 다 모은다', () =>
  teachersOf(학생('김은수', '박경미')).join() === '김은수,박경미')

T('채움쌤이 비어 있어도 터지지 않는다', () =>
  teachersOf(학생('김은수')).join() === '김은수'
  && teachersOf(학생(null, null)).length === 0
  && teachersOf(null).length === 0)

// ★ 담당 칸은 자유 입력이라 「조윤희, 이규숙」·「조윤희 이규숙」 둘 다 들어온다(2026-10-14).
T('두 칸 모두 쉼표·띄어쓰기로 나눈다', () =>
  teachersOf(학생('조윤희 이규숙', '주한, 신애진')).join() === '조윤희,이규숙,주한,신애진')

T('같은 분이 키움쌤이자 채움쌤이면 한 번만 센다', () =>
  teachersOf(학생('김은수', '김은수')).join() === '김은수')

T('채움쌤도 **내 학생**이다', () =>
  isMine(학생('김은수', '박경미'), '박경미') === true
  && isMine(학생('김은수', '박경미'), '김은수') === true)

T('남의 학생은 아니다', () =>
  isMine(학생('김은수', '박경미'), '주한') === false
  && isMine(학생('김은수', '박경미'), null) === false
  && isMine(학생('김은수', '박경미'), '') === false)

// ★ 이름이 겹쳐 보이는 것(「김은」이 「김은수」에 들어 있다)으로 걸리면 안 된다.
T('이름이 들어 있다고 걸리지 않는다 (조각 맞추기 금지)', () =>
  isMine(학생('김은수'), '김은') === false)

T('서버 판단(staffCanSeeStudent)도 채움쌤을 본다', () =>
  staffCanSeeStudent({ role: 'teacher', name: '박경미' }, 학생('김은수', '박경미')) === true
  && staffCanSeeStudent({ role: 'teacher', name: '주한' }, 학생('김은수', '박경미')) === false
  && staffCanSeeStudent({ role: 'admin', name: '윤지혜' }, 학생('김은수')) === true)

T('주임은 학년으로 보던 것이 그대로다', () =>
  staffCanSeeStudent({ role: 'teacher', name: '주한', supervisorGrades: ['중2'] }, 학생('김은수', '박경미')) === true)

// ── 화면·서버가 실제로 두 칸을 보는지 ───────────────────────────────────
// ★ 한 곳만 빠뜨려도 **그 화면만** 조용히 빈다. 그래서 한 곳씩 짚어 본다.
const 판단하는곳: [string, RegExp][] = [
  ['hooks/useAuth.ts', /function isMyStudent[\s\S]{0,260}?isMine\(student, currentUser\.name\)/],
  ['app/teacher/students/page.tsx', /function isEditable[\s\S]{0,260}?isMine\(s, currentUser\?\.name\)/],
  ['app/teacher/learning-notes/page.tsx', /const teachers = teachersOf\(s\)/],
  ['app/teacher/reports/page.tsx', /isMine\(s, currentUser\?\.name\)/],
]
for (const [file, re] of 판단하는곳) {
  T(`${file} 이 두 칸을 같이 본다`, () => re.test(src(file)))
}

// ★ 서버에서 거르는 두 화면 — ilike 한 칸만 보면 채움쌤 학생이 **통째로** 안 보인다.
for (const file of ['app/teacher/bulk-progress/page.tsx', 'app/teacher/import-records/page.tsx']) {
  T(`${file} 이 두 칸을 or 로 거른다`, () => {
    const s = src(file)
    return s.includes('clinic_teacher_name.ilike.') && s.includes('teacher_name.ilike.')
      && s.includes("select('id, name") && s.includes('clinic_teacher_name')
  })
}

// ★ 「내 담당인가」를 또 손으로 짠 곳이 남아 있으면 그 화면만 키움쌤만 보게 된다.
T('담당 판단을 손으로 짠 곳이 더 남아 있지 않다', () => {
  const 남은곳: string[] = []
  for (const f of ['hooks/useAuth.ts', 'app/teacher/students/page.tsx',
                   'app/teacher/learning-notes/page.tsx', 'app/teacher/reports/page.tsx']) {
    const s = src(f)
    if (/splitTeachers\((?:s|student)\.teacher_name\)\s*\.includes\(/.test(s)) 남은곳.push(f)
    if (/splitTeachers\((?:s|student)\.teacher_name\)\s*\n?\s*return ts\.includes\(/.test(s)) 남은곳.push(f)
  }
  if (남은곳.length) console.log('   ↳ 남은 곳:', 남은곳.join(', '))
  return 남은곳.length === 0
})

// ★ 「키움쌤·채움쌤」 호칭은 **고등에서만** 쓴다 (원장님 2026-11-05 「키움쌤, 채움쌤은 고등에 한정」).
//   칸과 보이는 범위는 학년과 상관없이 같다 — 부르는 말만 다르다.
T('호칭은 고등에서만 키움·채움이다', () =>
  teacherLabels('고1').main.startsWith('키움쌤') && teacherLabels('고1').clinic.startsWith('채움쌤')
  && teacherLabels('고3').clinicChip === '채움'
  && teacherLabels('중2').main === '담임강사' && teacherLabels('중2').clinic === '클리닉 담임'
  && teacherLabels('초5').clinicChip === '클리닉'
  && teacherLabels(null).main === '담임강사')

T('호칭이 달라도 **보이는 범위는 같다**', () =>
  isMine({ teacher_name: '김은수', clinic_teacher_name: '강루비', grade: '중2' }, '강루비') === true
  && isMine({ teacher_name: '김은수', clinic_teacher_name: '강루비', grade: '고1' }, '강루비') === true)

// ── 저장·입력 ──────────────────────────────────────────────────────────
T('학생 등록·수정·엑셀 세 곳에서 채움쌤을 받는다', () => {
  const s = src('app/teacher/students/page.tsx')
  return (s.match(/clinic_teacher_name/g) ?? []).length >= 8
    && s.includes("row['채움쌤']")                       // 엑셀
    && (s.match(/teacherLabels\((?:edit|new)Student\.grade\)\.clinic/g) ?? []).length === 2   // 등록·수정 칸
})

// ★ 사무실에서 쓰던 엑셀의 「담임강사」 열이 그대로 읽혀야 한다 — 안 그러면 업로드가 통째로 빈다.
T('엑셀의 「담임강사」 열은 그대로 읽는다', () =>
  src('app/teacher/students/page.tsx').includes("row['담임강사'] ?? row['키움쌤']"))

// ★ 한 명씩 열어 고치면 중등만 101명이다 — 한꺼번에 넣는 자리가 있어야 한다
//   (원장님 2026-11-05 「한꺼번에 지정하는것 만들어줘」).
T('클리닉 담임을 한꺼번에 넣는 자리가 있다', () => {
  const s = src('app/teacher/students/page.tsx')
  return s.includes('클리닉 담임 한꺼번에')
    && s.includes('const bulkTargets = students.filter')
    && s.includes('applyBulkClinic')
    && s.includes('if (!confirm(말.replace')          // 바꾸기 전에 한 번 묻는다
})

// ★ 학년 조건으로 통째로 update 하면 화면에 안 보이던 학생까지 바뀐다. **고른 id 로만** 바꾼다.
T('한꺼번에 넣기가 고른 학생 id 로만 바꾼다', () => {
  const s = src('app/teacher/students/page.tsx')
  const 블록 = /async function applyBulkClinic\(\)[\s\S]*?\n  \}/.exec(s)?.[0] ?? ''
  return 블록.includes(".in('id', 묶음)")
    && 블록.includes('bulkTargets.map')
    && !블록.includes(".eq('grade'")
})

// ★ 퇴원·휴원·연습용 학생까지 바뀌면 안 된다.
T('한꺼번에 넣기가 재원 학생만 고른다', () => {
  const s = src('app/teacher/students/page.tsx')
  const 블록 = /const bulkTargets = students\.filter\([\s\S]*?teachersOf\(s\)\.includes\(bulkMain\)\)\)/.exec(s)?.[0] ?? ''
  return 블록.includes('s.is_active') && 블록.includes('!s.on_leave') && 블록.includes('is_test')
})

// ── SQL ────────────────────────────────────────────────────────────────
T('SQL 이 칸과 **정책 두 개**를 같이 넓힌다', () => {
  const s = src('docs/sql/채움쌤_칸추가와_정책확대.sql')
  const 정책 = (s.match(/clinic_teacher_name, ''\)/g) ?? []).length
  return s.includes('add column if not exists clinic_teacher_name text')
    && 정책 === 2                                       // 조회·수정 둘 다
    && /create policy staff_or_own[\s\S]*?for select/.test(s)
    && /create policy staff_update[\s\S]*?for update/.test(s)
    && !/to\s+authenticated/.test(s)
    && fs.existsSync(path.resolve('docs/sql/채움쌤_칸추가와_정책확대_되돌리기.sql'))
})

// ★ 되돌리기가 칸을 지우면 선생님들이 적어 둔 채움쌤이 **전부 사라진다.**
T('되돌리기가 칸을 지우지 않는다', () => {
  const s = src('docs/sql/채움쌤_칸추가와_정책확대_되돌리기.sql')
  return !/^\s*alter table public\.students drop column/m.test(s)
    && s.includes('-- alter table public.students drop column if exists clinic_teacher_name;')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
