/**
 * 새로 온 학생 **단계 안내**가 맞게 나오는지 시험한다.
 *
 * 왜 필요한가 (원장님 2026-11-04)
 *   「교재 배정을 어디에서 하고 학습일지 쓰는 순서는 어떻게 되는지 직관적으로」.
 *   순서가 틀리거나 「지금 할 차례」가 엉뚱한 데 붙으면, 새로 오신 선생님이 그대로 따라
 *   하다가 일을 거꾸로 하게 된다. 에러는 안 난다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/new-student-steps-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/new-student-steps-check.ts <다른 newStudentSteps.ts>
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/newStudentSteps.ts')
const { buildSteps, allDone, stepLabel } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

const 없음 = { schedules: 0, textbooks: 0, notes: 0, worksheets: 0, briefings: 0 }
const 시간표만 = { ...없음, schedules: 1 }

T('순서는 시간표 → 교재 → 학습일지 → 학습지 → 브리핑', () => {
  const t = buildSteps(없음).map((s: any) => s.title)
  return t[0].includes('시간표') && t[1].includes('교재') && t[2].includes('학습일지')
    && t[3].includes('학습지') && t[4].includes('브리핑')
})

// ★ 교재가 학습일지보다 **먼저**다 — 교재가 있어야 진도 칸에서 고를 수 있다.
T('교재가 학습일지보다 앞이다', () => {
  const t = buildSteps(없음)
  return t.find((s: any) => s.title.includes('교재')).no < t.find((s: any) => s.title.includes('첫 학습일지')).no
})

T('시간표만 들어왔으면 「지금 할 차례」는 교재 배정', () => {
  const t = buildSteps(시간표만)
  const 차례 = t.find((s: any) => s.next)
  return 차례?.title.includes('교재') && t[0].done === true
})

T('「지금 할 차례」는 **하나뿐**이다', () =>
  buildSteps(시간표만).filter((s: any) => s.next).length === 1
  && buildSteps(없음).filter((s: any) => s.next).length === 1)

T('앞 단계가 비어 있으면 거기가 차례다 (건너뛰지 않는다)', () => {
  // 교재는 없는데 일지를 먼저 쓴 경우 — 그래도 교재가 차례다
  const t = buildSteps({ ...없음, schedules: 1, notes: 3 })
  return t.find((s: any) => s.next)?.title.includes('교재')
})

T('다 했으면 차례가 없고 끝난 것으로 본다', () => {
  const t = buildSteps({ schedules: 1, textbooks: 2, notes: 5, worksheets: 3, briefings: 4 })
  return allDone(t) && t.filter((s: any) => s.next).length === 0 && stepLabel(t) === '5/5'
})

T('어디서 하는지 **바로가기**가 붙어 있다 (교재·학습일지·학습지)', () => {
  const t = buildSteps(없음)
  const 교재 = t.find((s: any) => s.title.includes('교재'))
  const 일지 = t.find((s: any) => s.title.includes('첫 학습일지'))
  const 학습지 = t.find((s: any) => s.title.includes('학습지 배정'))
  return 교재.href === '/teacher/assignments' && 일지.href === '/teacher/learning-notes'
    && 학습지.href === '/teacher/assignments'
    // 시간표와 브리핑은 선생님이 하는 일이 아니라 링크가 없다
    && t[0].href === null && t[4].href === null
})

T('그 화면들이 **정말 있다**', () => {
  for (const f of ['app/teacher/assignments/page.tsx', 'app/teacher/learning-notes/page.tsx']) {
    if (!fs.existsSync(path.resolve(f))) return false
  }
  return true
})

T('대시보드가 이 안내를 실제로 띄운다', () => {
  const src = fs.readFileSync(path.resolve('app/teacher/dashboard/page.tsx'), 'utf8')
  return src.includes('<NewStudentSteps') && src.includes('fetchNewStudents()')
    && /first_class_date/.test(src)
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
