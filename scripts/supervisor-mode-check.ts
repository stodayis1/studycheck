/**
 * 주임모드에서 **누가 보이나** 자가확인 (lib/teachers.ts).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/supervisor-mode-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/supervisor-mode-check.ts <고친 teachers.ts 경로>
 *
 * 왜 검사가 필요한가 (2026-11-18)
 *   중등주임 신애진 선생님이 손예원(초6) 학생의 담당으로 적혔는데 수업일지에 **안 떴다.**
 *   주임모드가 학년을 먼저 보고 **담당인지 묻지도 않고** 숨겼기 때문이다.
 *   에러도 안 나고 조용히 빈다 — 사람 눈으로는 「담당을 잘못 적었나」로만 보인다.
 *   12월 진급으로 초6 을 중등 선생님께 옮기는 동안 계속 걸릴 자리라 못박아 둔다.
 *
 * `.env.local` 이 있으면 **운영 명단으로도** 재 본다(읽기만 한다).
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/teachers.ts')
const { gradeLevelOf, supervisorScopeOf, visibleInSupervisorMode, isMine, splitTeachers } =
  await import(pathToFileURL(target).href)

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
  else console.log('✓ ' + what)
}

const 중등주임 = ['중1', '중2', '중3']

// ── 학교급
ok(gradeLevelOf('중1') === '중' && gradeLevelOf('초6') === '초' && gradeLevelOf('고2') === '고',
  '학년에서 학교급을 떼어 낸다')
ok(gradeLevelOf(null) === '' && gradeLevelOf(' ') === '', '빈 학년은 빈 학교급')

// ── 범위
ok(supervisorScopeOf(중등주임, '중2') === 'scope', '담당 학년은 scope')
ok(supervisorScopeOf(중등주임, '중3') === 'scope', '담당 학년이 여럿이어도 scope')
ok(supervisorScopeOf(중등주임, '초6') === null, '초6 은 중등주임의 범위도 학교급도 아니다')
ok(supervisorScopeOf(['중2'], '중3') === 'same-level', '같은 학교급이면 same-level')
ok(supervisorScopeOf(null, '중2') === null && supervisorScopeOf([], '중2') === null,
  '주임 학년이 없으면 아무것도 범위가 아니다')

// ── ★ 여기가 2026-11-18 에 고친 곳 ─────────────────────────────────────────
//   「내 담당이면 학년과 상관없이 보인다」. 전에는 학년을 먼저 보고 숨겼다.
ok(visibleInSupervisorMode(중등주임, '초6', true),
  '★ 중등주임이라도 **내 담당인 초6** 은 보인다 (손예원 학생이 안 뜨던 것)')
ok(visibleInSupervisorMode(중등주임, '고1', true), '★ 내 담당이면 고1 도 보인다')
ok(visibleInSupervisorMode(null, '초6', true), '★ 주임 학년이 없어도 내 담당은 보인다')

// 담당이 아닌 학생은 **전과 같다** — 담당 학년만 보인다
ok(visibleInSupervisorMode(중등주임, '중2', false), '담당 학년 학생은 남의 학생이어도 보인다')
ok(!visibleInSupervisorMode(중등주임, '초6', false), '남의 초6 은 여전히 안 보인다')
ok(!visibleInSupervisorMode(['중2'], '중3', false),
  '같은 학교급이라고 남의 중3 까지 보이지는 않는다 (원장님 2026-10-09 기준)')

// ── 담당 가르기 (여기가 틀리면 위가 다 소용없다)
ok(isMine({ teacher_name: '이규숙, 신애진' }, '신애진'), '쉼표로 적힌 공동 담당')
ok(isMine({ teacher_name: '이규숙 신애진' }, '신애진'), '띄어쓰기로 적힌 공동 담당')
ok(isMine({ clinic_teacher_name: '신애진' }, '신애진'), '채움쌤(클리닉 담임)도 담당이다')
ok(!isMine({ teacher_name: '이규숙' }, '신애진'), '남의 학생은 아니다')
ok(splitTeachers('이규숙, 신애진').join() === '이규숙,신애진', '이름을 둘로 나눈다')

// ── 화면 두 곳이 **같은 함수**를 쓰나 — 베껴 쓰면 한쪽만 고쳐진다
for (const f of ['hooks/useAuth.ts', 'app/teacher/learning-notes/page.tsx']) {
  const src = fs.readFileSync(path.resolve(f), 'utf8')
  ok(src.includes('visibleInSupervisorMode'), `${f} 가 lib 의 규칙을 그대로 써야 한다`)
  ok(!/const scope = supervisorScope\(/.test(src), `${f} 에 옛 사본(학년부터 보는 길)이 남아 있다`)
}

// ── 운영 명단으로 (.env.local 이 있을 때만 · 읽기만 한다)
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
  console.log('(운영 명단 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  // ★ **주임모드를 켤 수 있는 계정만** 센다 — 주임 학년이 비어 있으면(김은수·박경미)
  //   isSupervisorAccount() 가 거짓이라 토글 자체가 없다. 그분들까지 세면 「숨던 학생
  //   63명」처럼 **실제보다 크게** 나온다(2026-11-18 에 하마터면 그렇게 보고할 뻔했다).
  //   원장(admin)도 켤 수 있지만 주임 학년이 없어 **전부** 숨는다 — 이미 아는 함정이라 뺀다.
  const { data: users } = await db.from('users').select('name, role, supervisor_grades')
    .eq('role', 'teacher').not('supervisor_grades', 'is', null)
  const { data: studs } = await db.from('students')
    .select('name, grade, teacher_name, clinic_teacher_name')
    .eq('is_active', true).eq('is_test', false).limit(1000)

  let 가려졌을뻔 = 0
  const 보기: string[] = []
  for (const u of (users ?? []) as any[]) {
    if (!(Array.isArray(u.supervisor_grades) && u.supervisor_grades.length > 0)) continue
    for (const s of (studs ?? []) as any[]) {
      if (!isMine(s, u.name)) continue
      // 내 담당인데 주임 범위 밖 → 고치기 전에는 숨었던 학생
      if (supervisorScopeOf(u.supervisor_grades, s.grade) !== 'scope') {
        가려졌을뻔++
        if (보기.length < 6) 보기.push(`${s.name}(${s.grade}) → ${u.name}`)
        ok(visibleInSupervisorMode(u.supervisor_grades, s.grade, true),
          `주임모드에서 ${u.name} 선생님 담당 ${s.name}(${s.grade}) 이 보여야 한다`)
      }
    }
  }
  const 켤수있는분 = (users ?? []).filter((u: any) => Array.isArray(u.supervisor_grades) && u.supervisor_grades.length > 0)
  console.log(`(운영 — 주임모드를 켤 수 있는 선생님 ${켤수있는분.length}명. 고치기 전이면 그분들 화면에서 숨었을 담당 학생 ${가려졌을뻔}명${보기.length ? ' — ' + 보기.join(' · ') : ''})`)
}

console.log(bad ? `\n주임모드 자가확인 실패 ${bad}건` : '\n주임모드 자가확인 ✓')
process.exitCode = bad ? 1 : 0
