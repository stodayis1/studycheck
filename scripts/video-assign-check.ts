/**
 * 영상 과제 **일괄 배부**의 규칙을 시험한다.
 *
 * 왜 필요한가
 *   한 번에 수십 명의 수업 기록을 고치는 화면이다. 규칙이 틀리면 **선생님이 넣어 둔 영상이
 *   날아가거나**, 같은 영상이 두 번 들어가거나, 아직 하지 않은 수업에 과제가 달린다.
 *   에러는 안 난다 — 그래서 값을 하나하나 대조한다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/video-assign-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/video-assign-check.ts <다른 videoAssign.ts>
 *     ↑ 일부러 틀리게 고친 사본을 넣으면 **실패해야** 한다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/videoAssign.ts')
const { canAssignVideos, mergeVideoUrls, pickSessionFor } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

const A = 'https://youtu.be/aaaaaaaaaaa'
const B = 'https://youtu.be/bbbbbbbbbbb'
const A_꼬리 = 'https://youtu.be/aaaaaaaaaaa?si=xyz123'

// ── 누가 쓸 수 있나 ─────────────────────────────────────────────────────────
// ★ 2026-11-03 부터 **선생님이면 모두** 쓸 수 있다 (원장님 「보게 해달라니까?」).
//   그 전에는 원장님과 주한 선생님만이었다.
T('원장님은 모드와 상관없이 쓸 수 있다', () =>
  canAssignVideos({ role: 'admin', name: '아무개' }) === true)

T('강사·직원 누구나 쓸 수 있다 (메뉴가 보여야 한다)', () =>
  canAssignVideos({ role: 'teacher', name: '홍길동' }) === true
  && canAssignVideos({ role: 'teacher', name: null }) === true
  && canAssignVideos({ role: 'staff', name: '아무개' }) === true)

T('로그인 안 했거나 역할이 없으면 못 쓴다', () =>
  canAssignVideos(null) === false && canAssignVideos({}) === false
  && canAssignVideos({ role: 'student' }) === false)

// ── 이어 붙이기 ─────────────────────────────────────────────────────────────
// ★ 선생님이 넣어 둔 영상이 날아가면 안 된다.
T('이미 있던 영상은 그대로 두고 뒤에 붙인다', () => {
  const r = mergeVideoUrls(A, [B])
  return r.urls.length === 2 && r.urls[0] === A && r.urls[1] === B && r.added.length === 1
})

T('빈 칸에 넣으면 그것만 들어간다', () => {
  const r = mergeVideoUrls(null, [A, B])
  return r.urls.length === 2 && r.skipped.length === 0
})

// ★ 같은 영상이라도 뒤에 ?si=… 가 붙어 들어온 것이 있다 — 글자가 아니라 유튜브 id 로 견준다.
T('같은 영상은 두 번 안 넣는다 (꼬리가 달라도)', () => {
  const r = mergeVideoUrls(A, [A_꼬리, B])
  return r.urls.length === 2 && r.added.length === 1 && r.skipped.length === 1
})

T('한 번에 같은 영상을 두 개 골라도 한 번만 들어간다', () => {
  const r = mergeVideoUrls(null, [A, A_꼬리])
  return r.urls.length === 1 && r.skipped.length === 1
})

T('빈 줄·공백은 버린다', () => {
  const r = mergeVideoUrls(`${A}\n\n  \n`, ['  ', B])
  return r.urls.length === 2 && r.urls[0] === A && r.urls[1] === B
})

// ── 어느 수업에 붙나 ────────────────────────────────────────────────────────
const 수업 = [
  { id: 's1', session_date: '2026-10-27' },
  { id: 's2', session_date: '2026-10-29' },
  { id: 's3', session_date: '2026-11-05' },   // 앞으로의 수업
]
T('그 날짜까지의 **가장 최근** 수업에 붙인다', () =>
  pickSessionFor('2026-11-03', 수업)?.id === 's2')

// ★ 아직 하지 않은 수업에 붙이면 학생 화면에 미래 날짜가 뜬다 (2026-11-02 에 고쳤던 것).
T('앞으로의 수업에는 안 붙인다', () =>
  pickSessionFor('2026-10-28', 수업)?.id === 's1'
  && pickSessionFor('2026-11-03', 수업)?.session_date === '2026-10-29')

T('그 날짜 전에 수업이 없으면 아무 데도 안 붙인다', () =>
  pickSessionFor('2026-10-01', 수업) === null && pickSessionFor('2026-11-03', []) === null)

T('수업이 날짜순으로 안 들어와도 맞게 고른다', () =>
  pickSessionFor('2026-11-03', [...수업].reverse())?.id === 's2')

// ── 화면이 그 규칙을 **실제로 쓰는지** ──────────────────────────────────────
//   함수만 만들고 화면이 안 부르면 아무 일도 안 일어난다(2026-11-02 에 당했다).
T('배부 화면이 이 규칙들을 실제로 쓴다', () => {
  const p = path.resolve('app/teacher/assignments/videos/page.tsx')
  if (!fs.existsSync(p)) return false
  const src = fs.readFileSync(p, 'utf8')
  return src.includes('mergeVideoUrls(') && src.includes('pickSessionFor(') && src.includes('canAssignVideos(')
    && src.includes('class_sessions')
})

// ★ 강사는 본인 담당만, 중등주임은 중등 전체 — 그 판단은 canViewStudent 한 곳에만 있다.
//   여기서 따로 만들면 두 곳이 어긋난다. 그리고 **모드를 바꾸면 다시 읽어야** 한다.
T('배부 화면도 보이는 학생 범위를 그대로 따른다', () => {
  const src = fs.readFileSync(path.resolve('app/teacher/assignments/videos/page.tsx'), 'utf8')
  const 다시읽나 = /\}, \[쓸수있나, adminMode, supervisorMode\]\)/.test(src)
  return src.includes('canViewStudent(') && 다시읽나
    // 범위를 여기서 새로 만들지 않는다 — teacher_name 을 직접 견주면 안 된다
    && !/teacher_name\s*===/.test(src)
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
