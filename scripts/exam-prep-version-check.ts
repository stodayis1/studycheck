/**
 * 시험대비 교재 — **학생마다 정해진 버전**이 맞게 골라지는지 시험한다.
 *
 * 왜 필요한가 (원장님 2026-11-04)
 *   「시험교재 배정할때 해당학생에게 해당 목차가 배정될수 있도록」.
 *   버전을 잘못 고르면 **그 학생이 다른 난이도 교재로 시험 공부를 한다.** 에러는 안 난다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-prep-version-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/examPrepVersion.ts')
const { versionFor, versionCount, CURRENT_TERM, VERSION_KEY } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

// 실명은 쓰지 않는다 — 꼴만 같은 가짜 이름으로 시험한다.
const 설정 = {
  '2026-2-기말': { '홍길동': '2-2기말 상', '홍길동2': '2-2기말 중', '성이름': '2-2기말 하' },
  '2026-2-중간': { '홍길동': '상' },
}

T('적힌 학생은 그 버전을 쓴다', () =>
  versionFor(설정, '홍길동') === '2-2기말 상' && versionFor(설정, '성이름') === '2-2기말 하')

// ★ 같은 이름이 둘이면 꼬리로 갈린다 — 꼬리를 떼면 **다른 학생의 교재**가 나간다.
T('꼬리 붙은 이름은 따로 본다 (홍길동 ≠ 홍길동2)', () =>
  versionFor(설정, '홍길동2') === '2-2기말 중' && versionFor(설정, '홍길동') !== versionFor(설정, '홍길동2'))

// ★ 안 적힌 학생에게 **아무 버전이나 고르면 안 된다.** 선생님이 직접 고르게 둔다.
T('안 적힌 학생은 아무것도 안 고른다', () =>
  versionFor(설정, '없는학생') === null && versionFor(null, '홍길동') === null
  && versionFor({}, '홍길동') === null)

T('지난 시험 것을 쓰지 않는다', () =>
  versionFor(설정, '홍길동') === '2-2기말 상'          // 지금 시험 것
  && versionFor(설정, '홍길동', '2026-2-중간') === '상')  // 일부러 달라고 해야 지난 것

T('몇 명 적혀 있는지 센다', () =>
  versionCount(설정) === 3 && versionCount(null) === 0)

T('지금 쓰는 시험이 설정의 열쇠와 같다', () => CURRENT_TERM === '2026-2-기말' && VERSION_KEY === 'exam_prep_version')

// ★ 화면이 이 판단을 **실제로** 쓰는지 — 함수만 만들고 안 부르면 아무 일도 안 일어난다.
T('시험대비 화면이 학생을 고를 때 그 버전을 골라 둔다', () => {
  const src = fs.readFileSync(path.resolve('app/teacher/exam-prep/page.tsx'), 'utf8')
  return /setSelLevel\(versionFor\(versionMap, s\.name\) \?\? ''\)/.test(src)
    && src.includes('VERSION_KEY')
    // 적힌 버전을 화면에도 적어 준다
    && src.includes('버전이에요')
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
