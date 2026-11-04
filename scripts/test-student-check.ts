/**
 * **연습용(가짜) 학생**이 실제 발송에 섞이지 않는지, 그리고 담당 없이도 보이는지 본다.
 *
 * 왜 필요한가 (원장님 2026-11-04)
 *   「연습용 학생때문에 브리핑·문자 나가면 안돼지」 — 학부모 번호 칸에는 **그때그때
 *   연습하시는 강사 번호**가 적힌다. 거르는 곳을 한 군데라도 빠뜨리면 선생님 휴대폰으로
 *   학부모 브리핑이 간다. 에러는 안 난다.
 *   「담당은 없어야지 누구나 볼수 있어야 하니까」 — 담당이 비어 있으므로, 거꾸로
 *   **아무에게도 안 보이는** 일이 생기기 쉽다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/test-student-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const 읽기 = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

// ── 나가면 안 되는 곳 ───────────────────────────────────────────────────────
T('카톡 브리핑이 연습용 학생을 건너뛴다 (세어서 보여 준다)', () => {
  const src = 읽기('app/api/kakao-briefing/route.ts')
  return /if \(student\.is_test\)/.test(src) && src.includes('skippedTest')
    // 읽어 오는 칸에 is_test 가 없으면 **늘 undefined** 라 못 거른다
    && /select\('id, name, grade, parent_phone[^']*is_test'\)/.test(src)
})

T('학부모 전체 문자가 연습용 학생을 뺀다', () => {
  const src = 읽기('app/api/notice-sms/route.ts')
  return /s\.on_leave \|\| s\.is_test/.test(src) && /select\([^)]*is_test[^)]*\)/.test(src)
})

T('「일지 안 썼어요」 알림에서도 뺀다', () => {
  const src = 읽기('lib/expectedToday.ts')
  return /skip_lesson_note \|\| s\.is_test/.test(src) && /select\([^)]*is_test[^)]*\)/.test(src)
})

// ── 보여야 하는 곳 ─────────────────────────────────────────────────────────
T('담당이 없어도 모든 선생님에게 보인다', () => {
  const src = 읽기('hooks/useAuth.ts')
  // 주임모드·담당 판단보다 **먼저** 통과해야 한다 — 뒤에 두면 주임모드에서 가려진다
  const i = src.indexOf('function canViewStudent')
  const 몸통 = src.slice(i, i + 700)
  return /if \(student\.is_test\) return true/.test(몸통)
    && 몸통.indexOf('is_test') < 몸통.indexOf('isSupervisorModeActive')
})

T('학습일지를 **쓸 수도** 있어야 한다 (보기만 되면 연습이 안 된다)', () => {
  const src = 읽기('app/teacher/learning-notes/page.tsx')
  return /is_test\) return true/.test(src)
})

// ★ 칸을 똑 떼어 읽는 화면에 is_test 가 빠지면, 담당이 없어 **아무에게도 안 보인다.**
T('학생을 칸으로 읽는 화면들이 is_test 를 같이 읽는다', () => {
  const 화면 = [
    'app/teacher/assignments/matholic/page.tsx',
    'app/teacher/assignments/videos/page.tsx',
    'app/teacher/class-map/page.tsx',
    'app/teacher/consultations/page.tsx',
  ]
  return 화면.every((f) => {
    const src = 읽기(f)
    const m = src.match(/from\('students'\)\s*\n?\s*\.select\('([^']*)'\)/)
    return !!m && m[1].includes('is_test')
  })
})

T('실제 학생과 헷갈리지 않게 「연습용」이라고 적어 준다', () =>
  읽기('app/teacher/students/page.tsx').includes('연습용'))

console.log(`\n통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
