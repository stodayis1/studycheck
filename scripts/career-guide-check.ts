/**
 * 학생부 로드맵 — 권장 이수과목 찾기 · 기재 규칙 · 정기 소식 심기 검사.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/career-guide-check.ts
 *
 * 망가뜨려 시험: 일부러 틀린 사본을 만들어 같은 명령에 경로로 넘기면 **실패해야** 검사다.
 *   node --import ./scripts/ts-resolve.mjs scripts/career-guide-check.ts <틀린 lib/subjectGuide.ts>
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/subjectGuide.ts')
const { findGuides, inField, majorKey, FIELD_WORDS } = await import(pathToFileURL(target).href)
const { forbiddenWarnings, letterCount, RECORD_RULES, LETTER_LIMITS } = await import('../lib/careerRecordRules.ts')
const { SUBJECT_GUIDE_2028 } = await import('../lib/data/subjectGuide2028.ts')
const { ROADMAP_CALENDAR } = await import('../lib/data/roadmapCalendar.ts')
const { buildSeed } = await import('../lib/roadmapSeed.ts')

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) }
  else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

// ── 자료 ──────────────────────────────────────────────────────────
T('권장과목 자료가 통째로 들어 있다 (1,300줄 넘음 · 칸 8개)', () =>
  SUBJECT_GUIDE_2028.length > 1300 && SUBJECT_GUIDE_2028.every((r: string[]) => r.length === 8))

T('권장과목 자료에 서울대 기하·미적분Ⅱ 권장이 들어 있다', () => {
  const snu = SUBJECT_GUIDE_2028.filter((r: string[]) => r[2] === '서울대')
  return snu.length > 20 && snu.some((r: string[]) => (r[5] + r[6]).includes('기하') && (r[5] + r[6]).includes('미적분Ⅱ'))
})

T('로드맵 소식 자료는 중3·고1·고2 뿐이고 12달이 다 있다', () => {
  const grades = new Set(ROADMAP_CALENDAR.map((r: any) => r.grade))
  const months = new Set(ROADMAP_CALENDAR.map((r: any) => r.month))
  return grades.size === 3 && ['중3', '고1', '고2'].every((g) => grades.has(g)) && months.size === 12
})

// ── 권장과목 찾기 ─────────────────────────────────────────────────
T('계열로 찾는다 — 공학을 고르면 공대 모집단위가 나온다', () => {
  const r = findGuides({ fields: ['공학'], limit: 20 })
  return r.total > 50 && r.rows.every((x: any) => /공학|공과|기계|전자|전기|건축|토목|화공|재료|산업|항공|조선|에너지|로봇|반도체|자동차|섬유|원자력|나노|신소재|우주|건설/.test(x.group + x.major))
})

T('학과 이름이 계열보다 먼저다', () => {
  const r = findGuides({ fields: ['인문'], major: '컴퓨터공학과', limit: 10 })
  return r.why.includes('컴퓨터공학과') && r.rows.some((x: any) => (x.group + x.major).includes('컴퓨터'))
})

T('검색어가 있으면 그것만 본다', () => {
  const r = findGuides({ fields: ['공학'], major: '컴퓨터공학과', q: '서울대', limit: 500 })
  return r.rows.length > 0 && r.rows.every((x: any) => x.univ.includes('서울대'))
})

T('「아직 모름」만 고른 학생은 아무것도 안 나온다 (지어내지 않는다)', () =>
  findGuides({ fields: ['아직 모름'] }).total === 0)

T('수학 과목 셈 — 공학 계열이면 미적분Ⅱ·기하가 센 곳이 여럿', () => {
  const r = findGuides({ fields: ['공학'], limit: 300 })
  const by = new Map(r.math.map((m: any) => [m.name, m.count]))
  return (by.get('미적분Ⅱ') ?? 0) > 10 && (by.get('기하') ?? 0) > 5 && r.math.every((m: any) => m.count > 0)
})

T('계열 가름 — 생명과학과는 생명·농림·환경이고, 의예과는 의약·보건이다', () => {
  const 생명 = { region: '', area: '', univ: '', group: '자연과학', major: '생명과학과', core: '', more: '', note: '' }
  const 의예 = { region: '', area: '', univ: '', group: '의과대학', major: '의예과', core: '', more: '', note: '' }
  return inField(생명, '생명·농림·환경') && inField(의예, '의약·보건') && !inField(의예, '예술·체육')
})

T('학과 이름 꼬리를 떼고 견준다 (컴퓨터공학과 ↔ 컴퓨터공학)', () =>
  majorKey('컴퓨터공학과') === '컴퓨터공학' && majorKey('경영학부') === '경영학' && majorKey('의예과') === '의예')

T('계열 열한 개 중 「아직 모름」 빼고 모두 낱말이 있다', () => {
  const fields = Object.keys(FIELD_WORDS)
  return fields.length === 10 && fields.every((f) => FIELD_WORDS[f].length >= 2)
})

// ── 기재 규칙 ─────────────────────────────────────────────────────
T('학생부에 못 들어갈 말을 알려 준다', () => {
  const w1 = forbiddenWarnings('교내 수학경시대회 금상')
  const w2 = forbiddenWarnings('3월 학력평가 1등급')
  const w3 = forbiddenWarnings('○○학원에서 지도한 탐구')
  return w1.length > 0 && w2.length > 0 && w3.length > 0
})

T('멀쩡한 글에는 경고가 없다', () =>
  forbiddenWarnings('이차함수의 최댓값을 실생활 문제로 탐구하고 발표함', '').length === 0)

T('글자 수는 한글 3Byte 로 센다', () => {
  const c = letterCount('가나다abc')
  return c.letters === 6 && c.bytes === 12
})

T('세특 글자수 한도는 500자, 행동특성은 300자', () =>
  LETTER_LIMITS['세특'] === 500 && LETTER_LIMITS['행동특성'] === 300 && RECORD_RULES.length >= 5)

// ── 정기 소식 심기 ────────────────────────────────────────────────
T('그 달 줄만 만들고, 달의 1일~말일로 잡는다', () => {
  const rows = buildSeed(ROADMAP_CALENDAR, 2026, 12)
  return rows.length > 3
    && rows.every((r: any) => r.starts_on === '2026-12-01' && r.ends_on === '2026-12-31')
    && rows.every((r: any) => r.title.startsWith('12월 '))
})

T('2월은 말일이 28일이다 (달마다 다르다)', () =>
  buildSeed(ROADMAP_CALENDAR, 2027, 2).every((r: any) => r.ends_on === '2027-02-28'))

T('줄마다 주소가 달라야 한다 (career_events 는 url+날짜가 열쇠)', () => {
  const rows = buildSeed(ROADMAP_CALENDAR, 2026, 12)
  return new Set(rows.map((r: any) => r.url)).size === rows.length
})

T('올리는 것은 「검토대기」 · 계열은 공통 · 학년은 한 개', () =>
  buildSeed(ROADMAP_CALENDAR, 2026, 12).every((r: any) =>
    r.status === '검토대기' && r.fields.length === 1 && r.fields[0] === '공통'
    && r.grades.length === 1 && ['중3', '고1', '고2'].includes(r.grades[0])
    && r.found_by.startsWith('claude')))

T('12월에는 학생부 마무리 소식이 들어 있다', () =>
  buildSeed(ROADMAP_CALENDAR, 2026, 12).some((r: any) => r.title.includes('학생부') || r.title.includes('학교생활기록부')))

// ── 화면·API 가 그것을 쓰는가 ─────────────────────────────────────
T('API 가 첫 줄에서 직원인지 본다', () => {
  const src = fs.readFileSync(path.resolve('app/api/career/subjects/route.ts'), 'utf8')
  return /const deny = await denyIfNotStaff\(req\)\s*\n\s*if \(deny\) return deny/.test(src)
    && src.includes('findGuides(')
})

T('학생별 기록 화면이 권장과목 카드와 기재 규칙을 쓴다', () => {
  const src = fs.readFileSync(path.resolve('components/career/teacher/RecordsTab.tsx'), 'utf8')
  return src.includes('<SubjectGuideCard fields={selFields} major={selMajor} />')
    && src.includes('RECORD_RULES.map')
    && src.includes('forbiddenWarnings(f.title, f.detail)')
    && src.includes('warns.map')
})

T('권장과목 자료를 브라우저로 통째로 내려보내지 않는다', () => {
  // lib/data/subjectGuide2028.ts 는 서버에서만 쓴다 — 화면 파일이 바로 불러오면 번들이 커진다
  const files = ['components/career/teacher/SubjectGuideCard.tsx', 'components/career/teacher/RecordsTab.tsx']
  return files.every((f) => !fs.readFileSync(path.resolve(f), 'utf8').includes('data/subjectGuide2028'))
})

// ── 진짜 route.ts 를 그대로 돌려 본다 (베껴 쓴 사본 말고) ──────────────────
// 토큰 없이 부르면 막혀야 한다. 서버 API 는 service_role 로 돌아서, 가드가 빠지면
// 그 길이 인터넷 전체에 열린다.
let apiStatus = 0
try {
  // 가짜 주소·열쇠를 넣어 둔다 — 토큰이 없으면 **밖으로 나가기 전에** 401 로 막혀야 맞다
  //   (비어 있으면 「서버 설정」 500 이 나서 가드를 지났는지 알 수 없다)
  process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost:54321'
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'check-only'
  const mod: any = await import('../app/api/career/subjects/route.ts')
  const res = await mod.GET(new Request('http://localhost/api/career/subjects?fields=%EA%B3%B5%ED%95%99'))
  apiStatus = res.status
} catch (e: any) {
  apiStatus = -1
  console.log('  (route.ts 를 못 불렀습니다: ' + (e?.message ?? e) + ')')
}
T('토큰 없이 부르면 막힌다 — route.ts 를 그대로 돌려 확인', () => apiStatus === 401 || apiStatus === 403)

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exitCode = pass === total ? 0 : 1
