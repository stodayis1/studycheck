/**
 * 신입생 상담 알림이 **맞는 날, 한 번만** 가는지 시험한다. (원장님 2026-11-06)
 *
 *   첫 수업 +7일  → 신입 상담   ·   첫 수업 +30일 → 적응 상담
 *
 * ★ 여기서 틀리면 **에러 없이 어긋난다** —
 *   ① 매일 도는 크론이라 기록을 안 남기면 **같은 알림이 날마다** 쌓인다
 *   ② 상담을 적었는데도 계속 뜨면 선생님이 알림을 무시하게 된다
 *   ③ 처음 켜는 날 옛날 것이 왕창 쏟아진다
 *   ④ 첫 수업일을 등록일로 잡으면 날짜가 며칠씩 어긋난다
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/new-consult-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/newStudentConsult.ts')
const { dueStagesFor, noteText, STAGES, CATCHUP_DAYS, 날수 } = await import(pathToFileURL(target).href)

let pass = 0, total = 0
function T(name: string, fn: () => boolean) {
  total++
  let ok = false, err = ''
  try { ok = fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')
const 단계 = (keys: any[]) => keys.map((s: any) => s.key).join()
const 없음 = new Set<string>()

T('첫 수업 일주일 뒤에 신입 상담이 뜬다', () =>
  단계(dueStagesFor('2026-10-26', [], 없음, '2026-11-02')) === 'intro')

T('아직 일주일이 안 됐으면 안 뜬다', () =>
  dueStagesFor('2026-11-03', [], 없음, '2026-11-06').length === 0)

T('한 달 뒤에 적응 상담이 뜬다', () =>
  단계(dueStagesFor('2026-10-07', [], 없음, '2026-11-06')) === 'settle')

// ★ 상담을 적으면 더 안 뜬다.
T('기준일 뒤에 상담했으면 안 뜬다', () =>
  dueStagesFor('2026-10-26', ['2026-11-02'], 없음, '2026-11-02').length === 0)

// ★ 기준일 **전**에 한 상담은 그 단계를 끝낸 것이 아니다(첫 수업 직후 인사 통화 같은 것).
T('기준일 전에 한 상담은 안 친다', () =>
  단계(dueStagesFor('2026-10-26', ['2026-10-27'], 없음, '2026-11-02')) === 'intro')

// ★ 매일 도는 크론이라 기록이 없으면 날마다 쌓인다.
T('한 번 알린 단계는 다시 안 뜬다', () =>
  dueStagesFor('2026-10-26', [], new Set(['intro']), '2026-11-02').length === 0)

T('신입 상담을 알렸어도 한 달 뒤 적응 상담은 뜬다', () =>
  단계(dueStagesFor('2026-10-07', [], new Set(['intro']), '2026-11-06')) === 'settle')

// ★ 처음 켜는 날 옛날 것이 왕창 쏟아지면 안 된다.
T(`기준일이 ${CATCHUP_DAYS}일보다 묵었으면 안 뜬다`, () =>
  dueStagesFor('2026-10-13', [], 없음, '2026-11-06').length === 0        // 기준일 10/20, 17일 지남
  && 단계(dueStagesFor('2026-10-26', [], 없음, '2026-11-05')) === 'intro') // 기준일 11/2, 3일 지남

T('크론이 하루 걸러도 놓치지 않는다', () =>
  단계(dueStagesFor('2026-10-26', [], 없음, '2026-11-03')) === 'intro')

T('수업을 한 적이 없으면 아무것도 안 뜬다', () =>
  dueStagesFor(null, [], 없음, '2026-11-06').length === 0
  && dueStagesFor('', [], 없음, '2026-11-06').length === 0)

T('두 단계는 7일·30일이다', () =>
  STAGES.map((s: any) => `${s.key}:${s.days}`).join() === 'intro:7,settle:30')

T('전달사항 글이 OPS 글투다 (머리표·첫 수업일·무엇을 하는지)', () => {
  const t = noteText({ name: '권서하', grade: '중2', school: '신원중', stage: STAGES[0], firstLesson: '2026-10-26', today: '2026-11-06' })
  return t.startsWith('[신입 상담] 권서하 (중2·신원중)')
    && t.includes('첫 수업 10/26 · 오늘로 11일째')
    && t.includes('수업 방향 설정, 현재 진도 상황 공유')
    && t.includes('상담내역')
})

T('날짜 셈이 맞다 (월을 넘어가도)', () =>
  날수('2026-10-26', '2026-11-06') === 11 && 날수('2026-10-07', '2026-11-06') === 30)

// ── 크론 쪽 ─────────────────────────────────────────────────────────────
const cron = () => src('app/api/cron/new-student-consult/route.ts')

T('아무나 못 부른다 (CRON_SECRET)', () =>
  cron().includes('process.env.CRON_SECRET') && cron().includes('status: 401'))

// ★ 전달사항에 넣어야 OPS 첫 화면과 스터디체크에 **둘 다** 뜬다.
T('수학OPS 전달사항(staff_notes)에 넣는다', () =>
  cron().includes("ops.from('staff_notes')") && cron().includes('assigned_to: to'))

T('키움쌤·채움쌤 **모두**에게 간다', () =>
  cron().includes('teachersOf(s)'))

// ★ 안 적으면 내일 또 간다.
T('보낸 뒤 기록을 남긴다', () =>
  cron().includes("db.from('new_student_consult_notices').insert(")
  && fs.existsSync(path.resolve('docs/sql/신입상담_알림기록.sql'))
  && fs.existsSync(path.resolve('docs/sql/신입상담_알림기록_되돌리기.sql')))

T('한 학생·한 단계는 한 줄만 (표에서 막는다)', () =>
  src('docs/sql/신입상담_알림기록.sql').includes('unique (student_id, stage)'))

T('휴원·퇴원·연습용 학생은 뺀다', () => {
  const s = cron()
  return s.includes("eq('is_active', true)") && s.includes('!s.on_leave') && s.includes('!s.skip_lesson_note')
})

T('날마다 아침에 돈다 (vercel.json)', () => {
  const v = JSON.parse(src('vercel.json'))
  return (v.crons ?? []).some((c: any) => c.path === '/api/cron/new-student-consult' && c.schedule === '0 1 * * *')
})

T('보내기 전에 눈으로 볼 수 있다 (dry)', () => cron().includes("get('dry') === '1'"))

console.log(`\n대상: ${path.relative(process.cwd(), target)}`)
console.log(`통과 ${pass} / 전체 ${total}`)
process.exit(pass === total ? 0 : 1)
