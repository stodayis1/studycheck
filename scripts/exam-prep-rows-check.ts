/**
 * 시험대비 배정을 **1000행에서 잘리지 않게** 읽는지 소스로 검사한다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-prep-rows-check.ts
 *
 * 왜 검사가 필요한가 — 잘리면 **화면이 조용히 비어 보인다.**
 *   2026-11-11 중1·중2 2학기 기말을 배정해 student_exam_prep 이 2,332행이 되자,
 *   시험대비 화면이 시험일 오름차순으로 1000행만 받아 지난 10월 중간고사가 칸을 다 먹었다.
 *   결과: **12월 시험을 보는 중1·중2가 통째로 안 보였다.** 에러도 안 났다.
 *   원장님 「시험배정에 안뜨는데? 그렇다고 학습일지 상에서도 시험교재 안뜨는데」
 *
 * 규칙 — 학생 한 명으로 거르지 않고 student_exam_prep 을 읽는 곳은 fetchAllRows 를 지나야 한다.
 *   한 명짜리 조회(.eq('student_id', …))는 1000행을 넘을 수 없으니 그대로 둔다.
 *
 * 일부러 망가뜨린 사본에서는 **반드시 실패해야 한다**.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const 볼곳 = ['app', 'lib', 'components']
const 틀린것: string[] = []

function 파일들(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) 파일들(p, out)
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** 한 소스에서 student_exam_prep 을 읽는 토막을 뽑아, 잘릴 수 있는 것만 돌려준다 */
export function 잘릴수있는읽기(소스: string): string[] {
  const 나쁜것: string[] = []
  // from('student_exam_prep') 부터 그 문장이 끝날 만한 자리까지 — 넉넉히 400자
  const 꼴 = /from\('student_exam_prep'\)([\s\S]{0,400})/g
  for (const m of 소스.matchAll(꼴)) {
    const 뒤 = m[1]
    if (!/\.select\(/.test(뒤.slice(0, 60))) continue          // insert·update·delete 는 상관없다
    if (/\.eq\('student_id'/.test(뒤)) continue                 // 학생 한 명 — 1000행을 넘을 수 없다
    // 앞쪽 120자 안에 fetchAllRows( 가 있어야 한다
    const 앞 = 소스.slice(Math.max(0, m.index! - 120), m.index!)
    if (!/fetchAllRows\(\s*\(\s*\)\s*=>\s*[\s\S]{0,80}$/.test(앞)) {
      나쁜것.push(뒤.slice(0, 60).replace(/\s+/g, ' ').trim())
    }
  }
  return 나쁜것
}

const 소스들 = new Map<string, string>()
for (const dir of 볼곳) for (const f of 파일들(dir)) {
  const s = readFileSync(f, 'utf8')
  if (s.includes("from('student_exam_prep')")) 소스들.set(f, s)
}

if (소스들.size === 0) 틀린것.push('student_exam_prep 을 읽는 곳을 하나도 못 찾았다 — 검사가 검사가 아니다')

let 본것 = 0
for (const [f, s] of 소스들) {
  본것++
  for (const 말 of 잘릴수있는읽기(s)) 틀린것.push(`${f} — 1000행에서 잘릴 수 있다: …${말}`)
}

// ── 망가뜨린 사본은 반드시 걸려야 한다 ────────────────────────────────────
const 기준 = readFileSync('app/teacher/exam-prep/page.tsx', 'utf8')
const 망가진것: [string, () => string[]][] = [
  ['fetchAllRows 를 벗겨 그냥 읽는다',
    () => 잘릴수있는읽기(기준.replace(
      /fetchAllRows\(\(\) => supabase\.from\('student_exam_prep'\)/,
      "supabase.from('student_exam_prep')"))],
  ['학생 한 명 조회인 척 주석만 달아 둔다',
    () => 잘릴수있는읽기(기준.replace(
      /fetchAllRows\(\(\) => supabase\.from\('student_exam_prep'\)/,
      "// eq('student_id')\n      supabase.from('student_exam_prep')"))],
]

let 샌것 = 0, 잡힌수 = 0
for (const [이름, 돌리기] of 망가진것) {
  let 걸림: string[] = []
  try { 걸림 = 돌리기() } catch { 걸림 = ['터졌다'] }
  if (걸림.length) 잡힌수 += 걸림.length
  else { 샌것++; console.error(`✗ 망가뜨린 사본이 통과했다 — 「${이름}」`) }
}
if (샌것 === 0) console.log(`✓ 망가뜨린 사본 ${망가진것.length}개가 ${잡힌수}가지에서 걸린다`)

for (const 말 of 틀린것) console.error(`✗ ${말}`)
const 실패 = 틀린것.length + 샌것
console.log(실패 ? `\n틀린 것 ${실패}개` : `\n통과 — student_exam_prep 을 읽는 파일 ${본것}개`)
process.exitCode = 실패 ? 1 : 0
