/**
 * 진급 배정판(lib/moveAssign.ts) 자가확인.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/move-assign-check.ts
 *
 * 앞쪽은 DB 없이 돈다. `.env.local` 이 있으면 **운영 데이터로도** 재 본다
 * (읽기만 한다 — 아무것도 고치지 않는다).
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  WD, WE, DAYS_WD, DAYS_WE, ROWS_WD, ROWS_WE, ROWS_MID,
  EXTRA, HIGH_TEACHERS, HIGH_PICKS, MID_PICKS, DRAFT_HIGH, DRAFT_MID, NO_SHOW,
  keyOf, isAt, worksOn, weekendPickable, weekendOwner, oddSaturday, clashesWithOff, toMin,
} from '../lib/moveAssign.ts'

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
}

// ① 타임표가 성립하나
const ALL_DAYS = [...DAYS_WD, ...DAYS_WE] as string[]
for (const [key, g] of [...Object.entries(WD), ...Object.entries(WE)]) {
  ok(!!g.label && !!g.det, `${key} 에 이름·설명이 있어야 한다`)
  ok(g.pieces.length > 0, `${key} 에 조각이 있어야 한다`)
  for (const [who, day, a, b] of g.pieces) {
    ok(!!who, `${key} 조각에 담당이 있어야 한다`)
    ok(ALL_DAYS.includes(day), `${key} 조각의 요일(${day})이 이상하다`)
    ok(a < b, `${key} 조각의 시각이 거꾸로다`)
  }
}
ok(Object.keys(WD).filter((k) => WD[k].t === '최대호').length === 6, '최대호 선생님 평일 타임은 6개(월·금 3 · 수 3)')
ok(WD['at3'].locked === '최다윤 · 하지원 · 이지훈 자리', '월·금 7~10 은 이미 찬 자리로 표시한다')
ok(WD['jb0'].solo === true, '혼자 쓰는 자리는 solo 로 둬서 고르는 목록에서 뺀다')

// ② 토·일 고르기 규칙
ok(weekendPickable('sat-c1', '최대호'), '최대호 반 학생은 토 클리닉 1타임을 고를 수 있다')
ok(!weekendPickable('sat-c1', '주한'), '주한 반 학생에게 최대호 선생님 토요일이 떠선 안 된다')
ok(weekendPickable('j-sat2', '최대호') && weekendPickable('j-sat2', '주한'), '주한 선생님 토 클리닉은 양쪽 다 고를 수 있다')
ok(!weekendPickable('j-w1', '주한'), '주말 수업만 다니는 자리(solo)는 고르는 목록에 없다')
ok(weekendOwner('j-sat2') === '주한', '주한 토 클리닉은 주한 선생님 시간표에 그린다')
ok(weekendOwner('sat-r1') === '최대호', '토 정규는 최대호 선생님 시간표에 그린다')

// ③ 칸에 누가 있나 (수업과 클리닉이 갈려야 한다)
ok(isAt('최대호', '월', '16:00', 30, 'at1'), '월·금 4~7 타임의 16시는 최대호 수업')
ok(isAt('최대호', '금', '17:30', 30, 'at1'), '같은 타임이 금요일에도 있다')
ok(!isAt('최대호', '수', '16:00', 30, 'at1'), '월·금 타임은 수요일에 없다')
ok(isAt('이규숙', '월', '18:00', 30, 'at1'), '18시는 채움쌤 클리닉')
ok(!isAt('최대호', '월', '18:00', 30, 'at1'), '그 시각에 키움쌤은 없다')
ok(isAt('주한', '화', '17:30', 30, 'ja'), '화·목 5:30 타임은 주한 수업')
ok(isAt('최대호', '토', '10:00', 60, 'bt1', 'sat-r1'), '토 정규는 10시부터')
ok(!isAt('최대호', '토', '14:00', 60, 'bt1', 'sat-r1'), '1타임은 14시에 끝나 있다')
ok(worksOn('이규숙', '월') && !worksOn('이규숙', '토'), '채움쌤은 평일 클리닉만')
ok(worksOn('주한', '일'), '주한 선생님은 일요일 수업이 있다')

// ④ 살펴볼 줄
ok(oddSaturday('최대호', 'bt1', 'sat-c1') === '수 반인데 토 정규를 안 옴', '수 반 + 클리닉만 → 살펴볼 줄')
ok(oddSaturday('최대호', 'at2', 'sat-r2') === '월·금 반인데 토 정규까지 옴', '월·금 반 + 토 정규 → 살펴볼 줄')
ok(oddSaturday('최대호', 'bt1', 'sat-r1') === null, '수 반 + 토 정규는 기본이다')
ok(oddSaturday('최대호', 'at1', 'sat-c2') === null, '월·금 반 + 클리닉만도 기본이다')
ok(oddSaturday('주한', 'jb', 'j-sat2') === null, '주한 선생님 반은 이 규칙을 보지 않는다')
ok(oddSaturday('최대호', 'bt1', '') === null, '아직 안 고른 줄은 흠이 아니다')

// ⑤ 못 오시는 요일
ok(clashesWithOff('신애진', ['월', '목']).join() === '목', '신애진 선생님 목요일은 걸려야 한다')
ok(clashesWithOff('신애진', ['월', '수', '금']).length === 0, '목요일이 없으면 안 걸린다')
ok(clashesWithOff('박경미', ['목']).length === 0, '다른 선생님은 목요일도 괜찮다')
ok(Object.keys(NO_SHOW).length > 0, '못 오시는 요일 표가 비어 있다')

// ⑥ 첫 제안이 성립하나
const m3Keys = Object.keys(DRAFT_HIGH).filter((k) => k.endsWith('|중3'))
ok(m3Keys.length === 38, `고등 판 초안의 중3 은 38명이어야 한다 (지금 ${m3Keys.length})`)
ok(Object.keys(DRAFT_HIGH).length === 55, `고등 판 초안은 중3 38 + 지금 고등부 17 = 55줄 (지금 ${Object.keys(DRAFT_HIGH).length})`)
for (const [k, [t, wd, we]] of Object.entries(DRAFT_HIGH)) {
  ok(HIGH_PICKS.includes(t) || t === '', `${k} 의 선생님(${t})이 고를 수 없는 이름이다`)
  ok(wd === '' || !!WD[wd], `${k} 의 평일 타임(${wd})이 없는 타임이다`)
  ok(we === '' || !!WE[we], `${k} 의 토·일 타임(${we})이 없는 타임이다`)
  if (t === '김은수') ok(wd === '' && we === '', `${k} 는 중등에 남으므로 고등 타임이 없어야 한다`)
  if (t && t !== '김은수' && wd) ok(WD[wd].t === t, `${k} 의 평일 타임이 다른 선생님 것이다`)
  if (t && t !== '김은수' && we) ok(weekendPickable(we, t) || WE[we].solo, `${k} 의 토·일 타임을 그 선생님 반이 고를 수 없다`)
}
ok(Object.keys(DRAFT_MID).length === 27, `중등 판 초안은 27명 (지금 ${Object.keys(DRAFT_MID).length})`)
for (const [k, t] of Object.entries(DRAFT_MID)) {
  ok(MID_PICKS.includes(t), `${k} 의 선생님(${t})이 고를 수 없는 이름이다`)
  ok(k.endsWith('|초6'), `${k} 는 초6 이어야 한다`)
}
ok(keyOf(' 홍채은 ', '초6') === '홍채은|초6', '이름·학년 열쇠는 앞뒤 공백을 떼고 만든다')

// ⑥-2 따로 부르는 추가 클리닉 (원장님 2026-11-17 — 채움쌤 근무가 9시까지)
ok(Object.keys(EXTRA).length >= 1, '추가 클리닉 자리가 있어야 한다')
for (const [k, g] of Object.entries(EXTRA)) {
  ok(g.pieces.every(([who]) => who === '이규숙'), `${k} 는 채움쌤(이규숙) 자리여야 한다`)
  ok(g.pieces.every(([, , a, b]) => a === toMin('20:00') && b === toMin('21:00')), `${k} 는 20:00~21:00 이어야 한다`)
  ok(g.pieces.every(([, d]) => ['월', '수', '금'].includes(d)), `${k} 는 월·수·금 안에 있어야 한다`)
  ok(!WD[k] && !WE[k], `${k} 가 평일·주말 열쇠와 겹친다`)
}
ok(isAt('이규숙', '월', '20:00', 30, '', '', 'c-mwf'), '추가 클리닉을 고르면 월요일 8시 칸에 선다')
ok(isAt('이규숙', '수', '20:30', 30, '', '', 'c-mwf'), '8시 반 칸도 같은 타임이다')
ok(!isAt('이규숙', '화', '20:00', 30, '', '', 'c-mwf'), '화요일에는 없다')
ok(!isAt('이규숙', '월', '21:00', 30, '', '', 'c-mwf'), '9시에는 끝나 있다')
ok(!isAt('이규숙', '수', '20:00', 30, '', '', 'c-mf'), '월·금만 고른 학생은 수요일에 없다')
ok(isAt('이규숙', '수', '20:00', 30, '', '', 'c-w'), '수만 고른 학생은 수요일에 있다')
// 반(평일 타임)과 **같이** 설 수 있어야 한다 — 추가로 부르는 자리이기 때문
ok(isAt('이규숙', '월', '18:00', 30, 'at1', '', 'c-mwf') && isAt('이규숙', '월', '20:00', 30, 'at1', '', 'c-mwf'),
  '반 클리닉과 추가 클리닉이 같이 선다')
ok(ROWS_WD.includes('20:00') && ROWS_WD.includes('20:30'), '평일 격자에 8시·8시 반 칸이 있다')

// ⑦ 격자
ok(ROWS_WD[0] === '16:00' && ROWS_WD[ROWS_WD.length - 1] === '21:30', '고등 평일 격자는 16:00~21:30')
ok(ROWS_WE[0] === '09:00', '토·일 격자는 9시부터')
ok(ROWS_MID[0] === '15:00', '중등 격자는 3시부터')
ok(ROWS_WD.every((r, i) => i === 0 || toMin(r) - toMin(ROWS_WD[i - 1]) === 30), '평일 격자는 30분 간격')
ok(HIGH_TEACHERS.map((x) => x.name).join() === '최대호,주한,이규숙', '시간표를 그리는 차례')

// ── 여기부터는 운영 데이터 (.env.local 이 있을 때만)
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.log('(운영 데이터 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  const all = async (make: () => any) => {
    const out: any[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await make().range(from, from + 999)
      if (error) throw new Error(error.message)
      out.push(...(data ?? []))
      if ((data ?? []).length < 1000) return out
    }
  }
  const students = await all(() => db.from('students')
    .select('id, name, grade, teacher_name, is_test')
    .or('is_active.eq.true,on_leave.eq.true')
    .in('grade', ['초6', '중1', '중2', '중3', '고1', '고2']).order('id'))
  const real = students.filter((s) => !s.is_test)
  const byKey = new Map<string, any[]>()
  for (const s of real) {
    const k = keyOf(s.name, s.grade)
    byKey.set(k, [...(byKey.get(k) ?? []), s])
  }

  const 중3 = real.filter((s) => s.grade === '중3')
  const 초6 = real.filter((s) => s.grade === '초6')
  ok(중3.length === m3Keys.length, `운영 중3 ${중3.length}명과 초안 ${m3Keys.length}줄이 같아야 한다`)
  ok(초6.length === 27, `운영 초6 ${초6.length}명과 초안 27줄이 같아야 한다`)
  for (const s of 중3) ok(!!DRAFT_HIGH[keyOf(s.name, s.grade)], `중3 ${s.name} 의 초안이 없다`)
  for (const s of 초6) ok(!!DRAFT_MID[keyOf(s.name, s.grade)], `초6 ${s.name} 의 초안이 없다`)
  // ★ 동명이인은 자동으로 정하지 않는다 — 이름+학년이 둘 이상이면 초안을 붙이면 안 된다
  for (const k of [...Object.keys(DRAFT_HIGH), ...Object.keys(DRAFT_MID)]) {
    const hit = byKey.get(k) ?? []
    ok(hit.length <= 1, `초안 ${k} 에 학생이 ${hit.length}명 걸린다 — 이름만으로 붙이면 안 된다`)
  }

  // 신애진 선생님 목요일 — 초안이 목요일 수업 있는 학생을 보내지 않았나
  const ids = 초6.map((s) => s.id)
  const sc: any[] = []
  for (let i = 0; i < ids.length; i += 100) {
    sc.push(...await all(() => db.from('schedules').select('student_id, day_of_week')
      .in('student_id', ids.slice(i, i + 100)).order('id')))
  }
  const daysOf = new Map<string, string[]>()
  for (const r of sc) daysOf.set(r.student_id, [...(daysOf.get(r.student_id) ?? []), r.day_of_week])
  for (const s of 초6) {
    const t = DRAFT_MID[keyOf(s.name, s.grade)]
    const bad2 = clashesWithOff(t, daysOf.get(s.id) ?? [])
    ok(bad2.length === 0, `초6 ${s.name} → ${t} 선생님: 못 오시는 ${bad2.join('·')}요일에 수업이 있다`)
  }

  // ⑧ 서버 API 가 토큰 없이 열려 있지 않나 — **route.ts 를 그대로 불러** 돌린다
  //    (베껴 쓴 사본으로 재면 진짜 가드를 재는 것이 아니다)
  const route: any = await import('../app/api/move-assign/route.ts')
  for (const [name, call] of [
    ['GET', () => route.GET(new Request('http://localhost/api/move-assign'))],
    ['POST', () => route.POST(new Request('http://localhost/api/move-assign',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }))],
  ] as [string, () => Promise<Response>][]) {
    const res = await call()
    ok(res.status === 401, `토큰 없는 ${name} 은 401 이어야 한다 (지금 ${res.status})`)
  }
  // 엉뚱한 토큰도 막혀야 한다
  const res3 = await route.GET(new Request('http://localhost/api/move-assign',
    { headers: { Authorization: 'Bearer not-a-real-token' } }))
  ok(res3.status === 401, `가짜 토큰은 401 이어야 한다 (지금 ${res3.status})`)

  // ⑨ 권한 확인이 코드에 **남아 있나**. 토큰을 만들어 볼 수 없으니 글자로 재지만,
  //    지우면 걸리게 해 둔다 — 지우면 직원 누구에게나 초6·고등부 명단이 열린다.
  const src = fs.readFileSync('app/api/move-assign/route.ts', 'utf8')
  ok(/rpc\(\s*'can_see_move_assign'\s*\)/.test(src), '서버 API 가 can_see_move_assign 을 묻지 않는다')
  ok(/rpc\(\s*'can_see_high_curriculum'\s*\)/.test(src), '서버 API 가 can_see_high_curriculum(전체 권한)을 묻지 않는다')
  ok(/status:\s*403/.test(src), '권한 없는 사람을 403 으로 막는 줄이 없다')
  for (const h of ['GET', 'POST']) {
    const at = src.indexOf(`export async function ${h}(req: Request) {`)
    const head = at < 0 ? '' : src.slice(at, at + 220)
    ok(head.includes('await allow(req)') && head.includes('if (deny) return deny'),
      `${h} 핸들러 첫 줄에서 권한을 확인해야 한다`)
  }
  // 「초6 → 중등」만 보는 사람에게 고등부를 내려 주면 안 된다
  ok(src.includes("const GRADES = full ? GRADES_ALL : GRADES_MID"),
    '전체 권한이 아닌 사람에게 고등부 학년을 빼고 내려 줘야 한다')
  ok(!/GRADES_MID\s*=\s*\[[^\]]*고/.test(src), '중등만 보는 목록에 고등 학년이 들어 있다')
  ok(src.includes("if (!full) rows = rows.filter((r: any) => r.track === '중등')"),
    '전체 권한이 아닌 사람에게 고등 판 줄을 빼야 한다')
  ok(/track === '고등' && !full/.test(src), '전체 권한이 아닌 사람이 고등 판을 고치는 것을 막아야 한다')

  // 화면·메뉴도 같은 함수를 봐야 한다 (한쪽만 열리면 메뉴는 보이는데 화면이 빈다)
  const pageSrc = fs.readFileSync('app/teacher/move-assign/page.tsx', 'utf8')
  ok(/rpc\('can_see_move_assign'\)/.test(pageSrc), '화면이 can_see_move_assign 으로 막아야 한다')
  ok(/rpc\('can_see_high_curriculum'\)/.test(pageSrc), '화면이 전체 권한도 물어 탭을 가려야 한다')
  const sideSrc = fs.readFileSync('components/teacher/Sidebar.tsx', 'utf8')
  ok(/rpc\('can_see_move_assign'\)/.test(sideSrc), '사이드바 메뉴가 can_see_move_assign 으로 떠야 한다')

  // 표가 살아 있나 (읽기만)
  const { error } = await db.from('class_move_assign').select('student_id').limit(1)
  ok(!error, '표 class_move_assign 을 읽지 못했다 — docs/sql/진급배정판.sql 을 적용했나')

  // ⑩ 권한 함수가 DB 에 살아 있나 — 화면·API 가 이 이름을 부르는데 함수가 없으면
  //    rpc 가 조용히 false 를 주고 **아무도 못 들어온다.**
  //    (정책이 이 함수를 보는지는 docs/sql/진급배정판_권한분리.sql 끝의 확인 쿼리로 센다 —
  //     pg_policies 는 PostgREST 로 읽히지 않는다)
  for (const fn of ['can_see_move_assign', 'can_see_high_curriculum']) {
    const { error: fnErr } = await db.rpc(fn as any)
    ok(!fnErr, `DB 함수 ${fn}() 를 부르지 못했다 — docs/sql/진급배정판_권한분리.sql 을 적용했나`)
  }
  console.log(`(운영 데이터 — 중3 ${중3.length}명 · 초6 ${초6.length}명 · 중1·중2 ${real.filter((s) => s.grade === '중1' || s.grade === '중2').length}명)`)
}

if (bad) { console.error(`\n진급 배정판 자가확인 실패 ${bad}건`); process.exit(1) }
console.log('진급 배정판 자가확인 ✓')
