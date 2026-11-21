/**
 * 부스터 특강 선착순 신청 — **실제 모듈을 그대로 불러** 검사한다.
 *
 *   node --experimental-strip-types scripts/check-booster.mjs
 *
 * 왜 검사가 필요한가 — 원장님 2026-11-19:
 *   「여러 학부모가 같은 순간에 신청하더라도 7명 이상 확정되는 일이 없어야 합니다.
 *    화면에서 인원수를 확인하는 방식만 사용하지 말고 … 서버에서 정원을 보장해 주세요.」
 *
 * 이 검사는 **코드가 그 약속을 지키는 모양인지**를 본다. 진짜 동시 접수는
 * scripts/booster-race-test.mjs 가 실제 DB 에 10명을 한꺼번에 밀어 넣어 확인한다.
 *
 * ★ 맨 아래에서 **일부러 망가뜨린 사본**(흔한 잘못)도 돌린다. 그게 통과하면 검사가 아니다.
 */
import { readFileSync } from 'node:fs'
import {
  BOOSTER, 동의항목, 학년보기, 신청서검사, 접수상태보기, 남은자리, 남은시간,
  숫자만, 번호꼴, 쓸만한번호인가, 완료문구, 마감문구,
} from '../lib/booster.ts'

const 틀린것 = []

/* ── 1. 특강 사실이 원장님이 주신 것과 같은가 ──────────────────────────── */
{
  if (BOOSTER.정원 !== 6) 틀린것.push(`정원이 ${BOOSTER.정원} (6 이어야 함)`)
  if (BOOSTER.총회차 !== 6) 틀린것.push(`총 회차가 ${BOOSTER.총회차} (6 이어야 함)`)
  if (BOOSTER.수업일.length !== 6) 틀린것.push(`수업일이 ${BOOSTER.수업일.length}개 (6개여야 함)`)
  // ★ 무료다 — 이게 선착순인 까닭이다 (원장님 2026-11-19)
  if (BOOSTER.수강료 !== '무료') 틀린것.push(`수강료가 「${BOOSTER.수강료}」 (무료여야 함)`)
  if (동의항목.length !== 3) 틀린것.push(`동의 항목이 ${동의항목.length}개 (3개여야 함)`)

  // 접수 시작 — 한국시간 2026-11-25(수) 22:00
  const 시작 = new Date(BOOSTER.접수시작ISO)
  const 한국 = 시작.toLocaleString('en-GB', { timeZone: 'Asia/Seoul', hour12: false })
  if (!한국.startsWith('25/11/2026, 22:00')) {
    틀린것.push(`접수 시작이 한국시간 ${한국} (2026-11-25 22:00 이어야 함)`)
  }
}

/* ── 2. 접수 상태 — 이 세 가지를 틀리면 안 된다 ────────────────────────── */
const 시작 = new Date(BOOSTER.접수시작ISO)
const 전 = new Date(시작.getTime() - 1000)        // 1초 전
const 정각 = new Date(시작.getTime())
const 후 = new Date(시작.getTime() + 60_000)

// [지금, 나간자리, 기대, 설명]
const 상태규칙 = [
  [전,   0, '접수전', '★ 1초 전에는 못 넣는다'],
  [전,   6, '접수전', '1초 전이면 자리가 차 있어도 「접수전」'],
  [정각, 0, '접수중', '★ 정각부터 열린다'],
  [후,   0, '접수중', '열린 뒤 빈자리가 있으면 받는다'],
  [후,   5, '접수중', '한 자리 남아도 받는다'],
  [후,   6, '마감',   '★ 정원이 차면 마감'],
  [후,   7, '마감',   '어쩌다 넘어도 마감으로 본다'],
]
function 상태검사(fn) {
  const 걸림 = []
  for (const [now, 나간자리, 기대, 설명] of 상태규칙) {
    let 답
    try { 답 = fn({ now, 나간자리, 정원: 6, 접수시작: 시작 }) } catch { 걸림.push(`터졌다 — ${설명}`); continue }
    if (답 !== 기대) 걸림.push(`${설명}: ${답} (${기대} 여야 함)`)
  }
  return 걸림
}
틀린것.push(...상태검사(접수상태보기))

/* ── 3. 남은 자리 ──────────────────────────────────────────────────────── */
for (const [나간, 기대] of [[0, 6], [1, 5], [6, 0], [7, 0], [-1, 6]]) {
  if (남은자리(나간, 6) !== 기대) 틀린것.push(`남은자리(${나간}) = ${남은자리(나간, 6)} (${기대} 여야 함)`)
}
if (남은시간(후, 시작) !== null) 틀린것.push('접수가 시작됐는데 카운트다운이 계속 돈다')
{
  const c = 남은시간(new Date(시작.getTime() - 3661_000), 시작)
  if (!c || c.시 !== 1 || c.분 !== 1 || c.초 !== 1) 틀린것.push('카운트다운 계산이 틀렸다')
}

/* ── 4. 신청서 — 하나라도 빠지면 못 넣는다 ─────────────────────────────── */
const 바른신청 = {
  student_name: '홍길동', grade: '초6', parent_name: '홍부모',
  parent_phone: '010-1234-5678', is_enrolled: false,
  agreements: [true, true, true],
}
const 신청규칙 = [
  [바른신청, true, '다 적으면 통과'],
  [{ ...바른신청, student_name: '' }, false, '학생 이름이 없다'],
  [{ ...바른신청, grade: '' }, false, '학년을 안 골랐다'],
  [{ ...바른신청, grade: '대학생' }, false, '없는 학년'],
  [{ ...바른신청, parent_name: '' }, false, '학부모 이름이 없다'],
  [{ ...바른신청, parent_phone: '' }, false, '연락처가 없다'],
  [{ ...바른신청, parent_phone: '010-123' }, false, '번호가 짧다'],
  // ★ 재원 여부는 화면에서 묻지 않는다 — DB 함수가 students 에서 본다 (원장님 2026-11-21)
  [{ ...바른신청, is_enrolled: undefined }, true, '재원 여부를 안 보내도 된다 (DB 가 확인)'],
  // ★ 동의는 **전부** 받아야 한다 — 무료라 노쇼가 진짜 손해다
  [{ ...바른신청, agreements: [true, true, false] }, false, '★ 동의 하나가 빠졌다'],
  [{ ...바른신청, agreements: [true, false, false] }, false, '동의 둘이 빠졌다'],
  [{ ...바른신청, agreements: [] }, false, '동의를 아예 안 보냈다'],
  [{ ...바른신청, agreements: [true, true] }, false, '동의 개수가 모자란다'],
  [{ ...바른신청, agreements: true }, false, '동의가 배열이 아니다'],
  [{ ...바른신청, parent_phone: '01012345678' }, true, '하이픈 없이 적어도 된다'],
]
function 신청검사(fn) {
  const 걸림 = []
  for (const [입력, 통과해야, 설명] of 신청규칙) {
    let 답
    try { 답 = fn(입력) } catch { 걸림.push(`터졌다 — ${설명}`); continue }
    const 통과 = Array.isArray(답) && 답.length === 0
    if (통과 !== 통과해야) 걸림.push(`${설명}: ${통과 ? '통과' : '막힘'} (${통과해야 ? '통과' : '막힘'} 여야 함)`)
  }
  return 걸림
}
틀린것.push(...신청검사(신청서검사))

/* ── 5. 번호 ───────────────────────────────────────────────────────────── */
if (숫자만('010-1234-5678') !== '01012345678') 틀린것.push('숫자만() 이 하이픈을 안 뗀다')
if (숫자만('010-1234-5678') !== 숫자만('01012345678')) 틀린것.push('같은 번호를 다르게 본다 — 중복이 안 걸린다')
if (번호꼴('01012345678') !== '010-1234-5678') 틀린것.push('번호꼴() 이 틀렸다')
for (const [v, 기대] of [['01012345678', true], ['0212345678', true], ['0101234', false], ['', false]]) {
  if (쓸만한번호인가(v) !== 기대) 틀린것.push(`쓸만한번호인가(${v}) 가 틀렸다`)
}

/* ── 6. 문구 — 원장님이 주신 말 그대로인가 ─────────────────────────────── */
for (const 말 of ['신청이 완료되었습니다', '선착순 접수가 정상적으로 확정', '빠짐없이 참석', '수학의지혜 수학학원']) {
  if (!완료문구.includes(말)) 틀린것.push(`완료 문구에 「${말}」이 없다`)
}
for (const 말 of ['신청이 마감되었습니다', '선착순 6명 모집이 완료', '관심 가져주셔서 감사합니다']) {
  if (!마감문구.includes(말)) 틀린것.push(`마감 문구에 「${말}」이 없다`)
}

/* ── 7. 서버가 정원을 지키는 모양인가 (코드를 읽어서 본다) ───────────────── */
const 주석빼기 = s => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

const SQL = readFileSync('docs/sql/부스터특강_선착순신청.sql', 'utf8')
const SQL재원 = readFileSync('docs/sql/부스터특강_재원생만.sql', 'utf8')
const API = 주석빼기(readFileSync('app/api/booster/route.ts', 'utf8'))
const ADMIN_API = 주석빼기(readFileSync('app/api/booster/admin/route.ts', 'utf8'))
const PAGE = 주석빼기(readFileSync('app/booster/page.tsx', 'utf8'))

function SQL검사(원본) {
  const 걸림 = []
  // ★ -- 주석을 먼저 뗀다. 안 떼면 이 파일 아래 설명 문장이 스스로 걸린다.
  const sql = 원본.replace(/^\s*--.*$/gm, '')
  // ★ 문장(;) 단위로 본다. 파일 전체에 걸쳐 느슨하게 찾으면 **다른 문장의 조각**이
  //   짝을 맞춰 줘서, 정작 그 줄을 지워도 검사가 통과한다 (2026-11-19 실제로 그랬다).
  const 문장들 = sql.split(';')
  const 어느문장엔가 = re => 문장들.some(f => re.test(f))

  // 1겹 — 행을 잠근다
  if (!/for\s+update/i.test(sql)) 걸림.push('★ DB 함수가 특강 행을 for update 로 잠그지 않는다 — 동시에 누르면 뚫린다')

  // 2겹 — 자리번호 유일 index (같은 칸의 **보통** index 와 헷갈리면 안 된다)
  if (!어느문장엔가(/create\s+unique\s+index[\s\S]*booster_applications\s*\(\s*session_id\s*,\s*seat_no\s*\)/i)) {
    걸림.push('★ 자리번호(session_id, seat_no) 유일 index 가 없다')
  }

  // 3겹 — 숫자가 정원을 못 넘는다
  if (!/check\s*\(\s*seats_taken\s*<=\s*capacity\s*\)/i.test(sql)) {
    걸림.push('★ seats_taken <= capacity 제약이 없다')
  }

  // 시각은 DB 시계로
  if (!/now\(\)\s*<\s*s\.opens_at/i.test(sql)) 걸림.push('★ 접수 시작을 DB 시계(now())로 안 본다')

  // 중복
  if (!/duplicate/i.test(sql)) 걸림.push('중복 신청을 막지 않는다')

  // 명단은 **원장만** — 같은 문장 안에서 is_admin 이어야 한다
  const 명단읽기 = 문장들.find(f => /create policy[\s\S]*booster_apps_admin_read/i.test(f))
  if (!명단읽기) 걸림.push('★ 명단 읽기 정책이 없다')
  else if (!/is_admin\s*\(\s*\)/i.test(명단읽기)) {
    걸림.push('★ 명단 읽기가 원장 전용(is_admin)이 아니다 — 연락처가 드러난다')
  }

  // 맨몸 is_staff()/is_admin() 금지 (행마다 호출돼 앱 전체가 느려진다)
  // ★ (select public.is_admin()) 꼴만 괜찮다. public.is_admin() 만 적으면 맨몸이다.
  for (const f of 문장들) {
    if (!/create policy/i.test(f)) continue
    const 깐것 = f.replace(/\(\s*select\s+public\.is_(staff|admin)\s*\(\s*\)\s*\)/gi, 'OK')
    if (/is_(staff|admin)\s*\(\s*\)/i.test(깐것)) {
      걸림.push('정책에 맨몸 is_staff()/is_admin() 이 있다 — (select …) 로 감쌀 것')
      break
    }
  }

  // 학부모가 직접 넣지 못한다 (insert 정책이 없어야 한다)
  if (어느문장엔가(/create policy[\s\S]*booster_applications[\s\S]*for\s+insert/i)) {
    걸림.push('★ booster_applications 에 insert 정책이 있다 — 브라우저에서 직접 넣을 수 있다')
  }

  // 자동 재오픈 금지 — 원장님이 손으로 부르는 함수가 있어야 한다
  if (!/booster_reopen_seat/i.test(sql)) 걸림.push('자리 다시 열기 함수가 없다')

  return 걸림
}
틀린것.push(...SQL검사(SQL))

/* ── 7-2. 재원생만 (원장님 2026-11-21) — DB 함수가 students 로 확인하는가 ─── */
function 재원SQL검사(원본) {
  const 걸림 = []
  const sql = 원본.replace(/^\s*--.*$/gm, '')
  // 다시 쓴 함수도 정원 잠금을 그대로 가져야 한다
  if (!/for\s+update/i.test(sql)) 걸림.push('★ 다시 쓴 booster_apply() 가 행을 안 잠근다')
  if (!/now\(\)\s*<\s*s\.opens_at/i.test(sql)) 걸림.push('★ 다시 쓴 booster_apply() 가 접수 시각을 안 본다')
  if (!/duplicate/i.test(sql)) 걸림.push('다시 쓴 booster_apply() 가 중복을 안 막는다')
  // 재원생 확인은 학부모 답(p_is_enrolled)이 아니라 students 에서
  if (!/from\s+public\.students[\s\S]{0,80}where\s+st\.is_active/i.test(sql)) {
    걸림.push('★ 재원생을 students(is_active) 에서 찾지 않는다')
  }
  if (!/parent_phone/i.test(sql)) 걸림.push('★ 등록된 보호자 번호와 맞춰 보지 않는다')
  if (!/if\s+s\.enrolled_only\s+and\s+not\s+v_enrolled\s+then\s+return[^;]*not_enrolled/i.test(sql)) {
    걸림.push('★ 재원생이 아니면 막는 줄(not_enrolled)이 없다')
  }
  if (/v_enrolled\s*:=\s*p_is_enrolled/i.test(sql) || /coalesce\(\s*p_is_enrolled/i.test(sql)) {
    걸림.push('★ 학부모가 누른 「네」를 재원 확인으로 쓴다 — 누구나 통과한다')
  }
  if (!/p_phone_digits,\s*v_enrolled,\s*p_agreed_count/i.test(sql)) {
    걸림.push('명단의 재원 표시를 DB 확인값이 아니라 신청서 답으로 적는다')
  }
  if (!/set\s+enrolled_only\s*=\s*true[\s\S]*yebi-jung1-booster-2026-12'/i.test(sql)) {
    걸림.push('★ 실제 중1-1 특강에 재원생만(enrolled_only)을 안 켰다')
  }
  if (!/grant execute on function public\.booster_apply[^;]*to service_role/i.test(sql)) {
    걸림.push('booster_apply 권한을 service_role 로 두지 않았다')
  }
  return 걸림
}
틀린것.push(...재원SQL검사(SQL재원))

function API검사([api, page, adminApi]) {
  const 걸림 = []
  // ★ 서버가 스스로 세지 않는다 — DB 함수에 맡긴다
  if (!/rpc\(\s*'booster_apply'/.test(api)) 걸림.push('★ 신청 API 가 booster_apply() 를 안 쓴다')
  if (/seats_taken\s*[<>=]/.test(api) || /seatsLeft\s*[<>]/.test(api)) {
    걸림.push('★ 신청 API 가 스스로 자리 수를 센다 — 세는 순간과 넣는 순간 사이에 남이 들어간다')
  }
  if (/from\(\s*'booster_applications'\s*\)[\s\S]{0,200}\.insert/.test(api)) {
    걸림.push('★ 신청 API 가 표에 직접 insert 한다 — 정원을 안 거친다')
  }
  // ★ 재원 여부를 학부모 답으로 넘기지 않는다 (DB 가 students 에서 확인)
  if (/p_is_enrolled:\s*b\./.test(api)) 걸림.push('★ 신청 API 가 학부모가 누른 재원 답을 DB 로 넘긴다')
  if (!/not_enrolled/.test(api)) 걸림.push('신청 API 가 재원생 아님(not_enrolled)을 안내하지 않는다')
  // 화면과 같은 검사를 서버도 한다
  if (!/신청서검사/.test(api)) 걸림.push('신청 API 가 신청서검사() 를 안 쓴다 — 화면만 고쳐 빠져나갈 수 있다')
  // GET 은 숫자만
  if (/parent_phone|student_name/.test(api.split('export async function POST')[0])) {
    걸림.push('★ 현황 API(GET)가 이름·연락처를 내보낸다')
  }
  // 관리자 API 는 원장만
  if (!/staffOrDeny\([\s\S]{0,60}adminOnly:\s*true/.test(adminApi)) {
    걸림.push('★ 관리자 API 가 원장 전용(adminOnly)이 아니다')
  }
  // 취소가 자리를 자동으로 돌려주면 안 된다
  const 취소부분 = adminApi.split("action === 'cancel'")[1]?.split("action === 'reopen'")[0] ?? ''
  if (/seats_taken/.test(취소부분)) {
    걸림.push('★ 취소가 seats_taken 을 건드린다 — 자동 재오픈은 하지 않기로 했다')
  }
  // 화면은 서버 시각을 쓴다
  if (!/serverNow/.test(page)) 걸림.push('화면이 서버 시각을 안 쓴다 — 폰 시계가 틀리면 어긋난다')
  if (!/useSearchParams/.test(page) === false) {
    걸림.push('화면이 useSearchParams 를 쓴다 — 카카오톡 인앱에서 말썽이다')
  }
  return 걸림
}
틀린것.push(...API검사([API, PAGE, ADMIN_API]))

for (const e of 틀린것) console.error('✗ ' + e)

/* ── 8. 일부러 망가뜨린 사본 — 반드시 걸려야 한다 ───────────────────────── */
/** 1분 일찍 연다 (「거의 다 됐으니까」) — 21:59 에 들어간다 */
const 일찍염 = (i) => {
  if (i.now.getTime() + 60_000 < i.접수시작.getTime()) return '접수전'
  return i.나간자리 >= i.정원 ? '마감' : '접수중'
}
/** 정원을 「넘었을 때만」 막는다 — 7명째가 들어간다 */
const 하나더 = (i) => {
  if (i.now < i.접수시작) return '접수전'
  return i.나간자리 > i.정원 ? '마감' : '접수중'
}
/** 접수 시작을 아예 안 본다 */
const 시각무시 = (i) => (i.나간자리 >= i.정원 ? '마감' : '접수중')
/** 동의를 하나만 받아도 통과 */
const 동의느슨 = (f) => 신청서검사({ ...f, agreements: [true, true, true] })

const 망가진것 = [
  ['접수 시작을 1분 일찍 연다 (21:59 에 들어간다)',   () => 상태검사(일찍염)],
  ['정원을 넘었을 때만 막는다 (7명째가 들어간다)',    () => 상태검사(하나더)],
  ['접수 시작을 아예 안 본다',                        () => 상태검사(시각무시)],
  ['동의를 안 해도 통과시킨다',                        () => 신청검사(동의느슨)],
  ['재원생이 아니어도 막지 않는다',
    () => 재원SQL검사(SQL재원.replace(/if\s+s\.enrolled_only\s+and\s+not\s+v_enrolled\s+then[\s\S]*?end if;/i, ''))],
  ['재원 확인을 학부모가 누른 「네」로 한다',
    () => 재원SQL검사(SQL재원.replace(/v_enrolled\s*:=\s*exists\s*\([\s\S]*?\);/i, 'v_enrolled := coalesce(p_is_enrolled, false);'))],
  ['다시 쓴 함수가 행 잠금을 잃었다',
    () => 재원SQL검사(SQL재원.replace(/for\s+update/gi, ''))],
  ['실제 특강에 재원생만을 안 켰다',
    () => 재원SQL검사(SQL재원.replace(/'yebi-jung1-booster-2026-12',\s*/, ''))],
  ['신청 API 가 학부모 답을 그대로 넘긴다',
    () => API검사([API.replace('p_is_enrolled: false', 'p_is_enrolled: b.is_enrolled === true'), PAGE, ADMIN_API])],
  ['DB 함수가 행을 안 잠근다',
    () => SQL검사(SQL.replace(/for\s+update/gi, ''))],
  ['자리번호 유일 index 가 없다',
    () => SQL검사(SQL.replace(/create unique index if not exists booster_app_seat_uniq[\s\S]*?seat_no\);/i, ''))],
  ['seats_taken <= capacity 제약이 없다',
    () => SQL검사(SQL.replace(/constraint booster_seats_within_capacity[^,\n]*/i, ''))],
  ['접수 시각을 DB 시계로 안 본다',
    () => SQL검사(SQL.replace(/now\(\)\s*<\s*s\.opens_at/i, 'false'))],
  ['명단을 직원 모두가 읽는다',
    () => SQL검사(SQL.replace(/booster_apps_admin_read on public\.booster_applications\s*for select to authenticated using \(\(select public\.is_admin\(\)\)\)/i,
      'booster_apps_admin_read on public.booster_applications\n  for select to authenticated using ((select public.is_staff()))'))],
  ['정책에 맨몸 is_admin() 을 쓴다',
    () => SQL검사(SQL.replace(/\(select public\.is_admin\(\)\)/g, 'public.is_admin()'))],
  ['신청 API 가 표에 직접 insert 한다',
    () => API검사([`const x = await db().from('booster_applications').insert({ seat_no: 1 })`, PAGE, ADMIN_API])],
  ['신청 API 가 스스로 자리 수를 센다',
    () => API검사([`if (seats_taken >= cap) return bad()\nrpc('booster_apply')\n신청서검사(b)`, PAGE, ADMIN_API])],
  ['관리자 API 가 강사에게도 열려 있다',
    () => API검사([API, PAGE, ADMIN_API.replace(/adminOnly:\s*true/g, '')])],
  ['취소가 자리를 저절로 돌려준다',
    () => API검사([API, PAGE,
      ADMIN_API.replace("if (b.action === 'cancel') {", "if (b.action === 'cancel') {\n  await supabase.rpc('dec', { seats_taken: 1 })")])],
  ['화면이 서버 시각을 안 쓴다',
    () => API검사([API, PAGE.replace(/serverNow/g, 'clientNow'), ADMIN_API])],
]

let 잡힌수 = 0
let 샌것 = 0
for (const [이름, 돌리기] of 망가진것) {
  let 걸림 = []
  try { 걸림 = 돌리기() } catch { 걸림 = ['터졌다'] }
  if (걸림.length) 잡힌수 += 걸림.length
  else { 샌것++; console.error(`✗ 망가뜨린 사본이 통과했다 — 「${이름}」`) }
}

if (샌것 === 0) {
  console.log(`✓ 접수 상태 ${상태규칙.length}가지 · 신청서 ${신청규칙.length}가지 · SQL·API 짜임새`)
  console.log(`✓ 망가뜨린 사본 ${망가진것.length}개가 ${잡힌수}가지에서 걸린다`)
}

const 실패 = 틀린것.length + 샌것
console.log(실패 ? `\n틀린 것 ${실패}개` : '\n통과')
process.exit(실패 ? 1 : 0)
