/**
 * **오늘 결석** 알림이 맞게 뜨는지 시험한다.
 *
 * 왜 필요한가 (원장님 2026-11-04)
 *   「결석인 친구들은 아무리 미리 이야기해놔도 당일 되면 까먹기 마련… 그래야 이중으로
 *   또 연락이 안가지」. 틀리면 **학부모께 두 번 연락이 간다**(또는 결석을 모르고 지나간다).
 *   에러는 안 난다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/absences-today-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/opsAbsences.ts')
const { isPreTold, absenceLine, FROM_STUDYCHECK } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

// ★ 스터디체크가 되쏘아 만든 결석은 **이미 아는 것**이라 띄우지 않는다.
//   안 거르면 선생님이 일지에 결석을 찍을 때마다 다음 날 그대로 또 뜬다.
T('우리가 적은 결석은 띄우지 않는다', () =>
  isPreTold('스터디체크 학습일지 결석 체크') === false
  && isPreTold('학교 시험기간 결석 (보강 안 함)') === false
  && FROM_STUDYCHECK.length === 2)

T('미리 들은 결석은 띄운다', () =>
  isPreTold('여행') && isPreTold('개인사정') && isPreTold('가족여행') && isPreTold(null) && isPreTold(''))

T('한 줄 글에 이름·학년·사유가 들어간다', () =>
  absenceLine('홍길동', '초5', { reason: '여행' }) === '홍길동(초5) 학생 결석 — 여행'
  && absenceLine('홍길동', '중1', { reason: '개인사정' }) === '홍길동(중1) 학생 결석 — 개인사정')

T('사유가 없어도 말이 된다', () =>
  absenceLine('홍길동', null, { reason: null }) === '홍길동 학생 결석')

// ★ 여행·개인사정도 **다 보강하신다** — 「보강 안 함」을 적으면 틀린 것을 알려 주게 된다.
//   OPS 의 makeup_required 가 여행을 「보강 안 함」으로 들고 있는 줄이 있다.
T('보강 여부는 적지 않는다', () => {
  const 카드 = fs.readFileSync(path.resolve('components/teacher/TodayAbsences.tsx'), 'utf8')
  const lib = fs.readFileSync(path.resolve('lib/opsAbsences.ts'), 'utf8')
  return !카드.includes('보강 안 함') && !카드.includes('보강 대상')
    && !lib.includes("'보강 대상'")
})

// ── 서버에서 거르는 것들 ───────────────────────────────────────────────────
T('보이는 범위를 새로 만들지 않는다 (다른 화면과 같은 규칙)', () => {
  const src = fs.readFileSync(path.resolve('app/api/absences-today/route.ts'), 'utf8')
  return src.includes('staffCanSeeStudent(who, s)') && src.includes('staffOrDeny(req)')
    // 담당을 여기서 직접 견주면 안 된다
    && !/teacher_name\s*===/.test(src)
})

T('퇴원생·연습용 학생은 뺀다', () => {
  const src = fs.readFileSync(path.resolve('app/api/absences-today/route.ts'), 'utf8')
  return /!s\.is_active \|\| s\.is_test/.test(src)
})

T('OPS 를 못 읽어도 대시보드가 멈추지 않는다', () => {
  const lib = fs.readFileSync(path.resolve('lib/opsAbsences.ts'), 'utf8')
  const api = fs.readFileSync(path.resolve('app/api/absences-today/route.ts'), 'utf8')
  // 라이브러리는 빈 목록, API 는 items: [] 로 돌려준다
  return /catch \{\s*return \[\]/.test(lib) && /items: \[\], error/.test(api)
})

T('대시보드가 이 카드를 실제로 띄운다', () => {
  const src = fs.readFileSync(path.resolve('app/teacher/dashboard/page.tsx'), 'utf8')
  return src.includes('<TodayAbsences />')
})

T('결석이 없는 날은 아무것도 안 띄운다', () => {
  const src = fs.readFileSync(path.resolve('components/teacher/TodayAbsences.tsx'), 'utf8')
  return /!items\.length\) return null/.test(src)
})

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
