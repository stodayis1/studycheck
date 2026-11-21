/**
 * 부스터 특강 — **진짜 동시 접수 시험.** 실제 DB 에 여러 명을 한꺼번에 밀어 넣는다.
 *
 *   node scripts/booster-race-test.mjs
 *
 * 원장님 2026-11-19:
 *   「여러 학부모가 같은 순간에 신청하더라도 7명 이상 확정되는 일이 없어야 합니다.」
 *
 * scripts/check-booster.mjs 는 **코드 모양**을 본다. 이 스크립트는 **진짜로 되는지**를 본다.
 * 둘 다 있어야 한다 — 모양이 맞아도 DB 가 안 잠기면 뚫린다.
 *
 * ★★ **연습용 특강에서만 돈다.** 실제 특강 slug 로는 돌지 않게 맨 위에서 막는다.
 *    실수로 원장님 명단을 지우면 되돌릴 수 없다.
 * ★ 끝나면 넣은 연습 신청을 다 지우고 자리수를 0 으로 되돌린다.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

/* ── .env.local 읽기 (키를 화면에 찍지 않는다) ──────────────────────────── */
function env() {
  const out = {}
  for (const p of ['.env.local', '../../../.env.local']) {
    try {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/)
        if (m) out[m[1]] = m[2].trim()
      }
      if (out.SUPABASE_SERVICE_ROLE_KEY) return out
    } catch { /* 다음 자리 */ }
  }
  return out
}
const E = env()
if (!E.NEXT_PUBLIC_SUPABASE_URL || !E.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('✗ .env.local 에서 Supabase 키를 못 찾았습니다.')
  process.exit(1)
}

const TEST_SLUG = 'yebi-jung1-booster-2026-12-test'
const REAL_SLUG = 'yebi-jung1-booster-2026-12'

// ★★ 빗장 — 연습용이 아니면 아무것도 안 한다
const SLUG = process.argv[2] || TEST_SLUG
if (SLUG !== TEST_SLUG) {
  console.error(`✗ 이 시험은 연습용(${TEST_SLUG})에서만 돕니다.`)
  console.error(`  실제 특강(${REAL_SLUG}) 명단은 건드리지 않습니다.`)
  process.exit(1)
}

const db = createClient(E.NEXT_PUBLIC_SUPABASE_URL, E.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const 틀린것 = []
const 확인 = (맞나, 말) => { if (맞나) console.log('  ✓ ' + 말); else { console.error('  ✗ ' + 말); 틀린것.push(말) } }

/**
 * 연습 특강을 처음 상태로 — 신청 다 지우고, 자리수 0, 지금 열려 있게.
 * ★ 재원생만(enrolled_only)은 **끈다.** 1~7번 시험은 가짜 이름 20명이 필요하다.
 *   9번에서 켜고 시험한 뒤, 끝날 때 반드시 다시 켠다 (원장님 연습 화면은 실제와 같아야 한다).
 */
async function 되돌리기(opensAt = '2026-01-01T00:00:00Z', 재원생만 = false) {
  const { data: s } = await db.from('booster_sessions').select('id').eq('slug', TEST_SLUG).single()
  if (!s) { console.error('✗ 연습용 특강 줄이 없습니다. SQL 을 먼저 적용해 주세요.'); process.exit(1) }
  await db.from('booster_applications').delete().eq('session_id', s.id)
  await db.from('booster_sessions').update({ seats_taken: 0, is_open: true, opens_at: opensAt, enrolled_only: 재원생만 }).eq('id', s.id)
  return s.id
}

const 신청 = (이름, 번호, 동의 = 3) => db.rpc('booster_apply', {
  p_slug: TEST_SLUG,
  p_student_name: 이름,
  p_grade: '초6',
  p_parent_name: 이름 + '부모',
  p_parent_phone: 번호,
  p_phone_digits: 번호.replace(/\D/g, ''),
  p_is_enrolled: false,
  p_agreed_count: 동의,
})

async function main() {
  const 정원 = 6
  console.log(`\n부스터 특강 동시 접수 시험 — 연습용(${TEST_SLUG})\n`)

  /* ── 1. 20명이 같은 순간에 누른다 ─────────────────────────────────── */
  console.log('1) 20명이 같은 순간에 신청')
  await 되돌리기()
  const 인원 = 20
  const 결과 = await Promise.all(
    Array.from({ length: 인원 }, (_, i) =>
      신청(`동시${String(i + 1).padStart(2, '0')}`, `0100000${String(1000 + i)}`)
        .then(r => r.data).catch(() => ({ ok: false, reason: 'error' }))),
  )
  const 성공 = 결과.filter(r => r?.ok)
  const 자리들 = 성공.map(r => r.seat_no).sort((a, b) => a - b)

  확인(성공.length === 정원, `${인원}명이 한꺼번에 눌렀는데 ${성공.length}명 확정 (${정원}명이어야 함)`)
  확인(JSON.stringify(자리들) === JSON.stringify([1, 2, 3, 4, 5, 6]),
    `자리번호가 1~6 하나씩: [${자리들.join(', ')}]`)
  확인(결과.filter(r => r?.reason === 'full' || r?.reason === 'race').length === 인원 - 정원,
    `나머지 ${인원 - 정원}명은 「마감」으로 돌아왔다`)

  // DB 를 다시 읽어 확인 — 함수가 돌려준 말이 아니라 **실제로 저장된 것**을 본다
  const { data: sess } = await db.from('booster_sessions')
    .select('id, seats_taken, capacity').eq('slug', TEST_SLUG).single()
  const { count: 확정수 } = await db.from('booster_applications')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sess.id).eq('status', 'confirmed')

  확인(sess.seats_taken === 정원, `DB 의 나간 자리 = ${sess.seats_taken} (${정원}이어야 함)`)
  확인(확정수 === 정원, `DB 에 실제로 저장된 신청 = ${확정수}건 (${정원}건이어야 함)`)

  /* ── 2. 마감 뒤에는 더 안 들어간다 ───────────────────────────────── */
  console.log('\n2) 마감 뒤 추가 신청')
  const 추가 = (await 신청('늦은사람', '01099998888')).data
  확인(추가?.ok === false && (추가.reason === 'full' ||추가.reason === 'race'),
    `마감 뒤 신청이 막힌다 (돌아온 까닭: ${추가?.reason})`)

  /* ── 3. 같은 학생 중복 ────────────────────────────────────────────── */
  console.log('\n3) 같은 학생이 두 번 누른다')
  await 되돌리기()
  const 첫번 = (await 신청('중복이', '010-1111-2222')).data
  const 두번 = (await 신청('중복이', '01011112222')).data   // 하이픈만 다르게
  확인(첫번?.ok === true, '처음 것은 들어간다')
  확인(두번?.ok === false && 두번.reason === 'duplicate',
    `하이픈만 다른 같은 번호도 중복으로 막힌다 (${두번?.reason})`)

  // 형제자매 — 같은 번호, 다른 이름은 들어가야 한다
  const 동생 = (await 신청('중복이동생', '010-1111-2222')).data
  확인(동생?.ok === true, '같은 번호라도 다른 학생이면 들어간다 (형제자매)')

  /* ── 4. 동시에 중복 ──────────────────────────────────────────────── */
  console.log('\n4) 같은 학생이 같은 순간에 다섯 번 누른다 (두 번 눌림)')
  await 되돌리기()
  const 다섯 = await Promise.all(
    Array.from({ length: 5 }, () => 신청('연타', '010-3333-4444').then(r => r.data).catch(() => null)))
  확인(다섯.filter(r => r?.ok).length === 1,
    `다섯 번 눌렀는데 ${다섯.filter(r => r?.ok).length}건만 들어갔다 (1건이어야 함)`)

  /* ── 5. 접수 시작 전에는 못 넣는다 ───────────────────────────────── */
  console.log('\n5) 접수 시작 전')
  await 되돌리기(new Date(Date.now() + 60 * 60 * 1000).toISOString())   // 한 시간 뒤에 열림
  const 이른 = (await 신청('일찍온사람', '01055556666')).data
  확인(이른?.ok === false && 이른.reason === 'not_yet',
    `시작 전에는 막힌다 (돌아온 까닭: ${이른?.reason})`)

  // ★ 열리는 순간을 **앞뒤로** 재 본다.
  //   여유를 1~2초로 두면 DB 왕복이 그보다 오래 걸려 시험이 제멋대로 떨어진다
  //   (2026-11-19 실제로 그랬다). 그래서 **먼저 준비를 다 끝내고**, 남은 시간을 재서
  //   「열리기 전 한 번 · 열린 뒤 한 번」을 돌린다.
  const 여유ms = 8000
  await 되돌리기(new Date(Date.now() + 여유ms).toISOString())
  const { data: ss } = await db.from('booster_sessions')
    .select('opens_at').eq('slug', TEST_SLUG).single()
  const 열리는때 = new Date(ss.opens_at).getTime()

  const 전 = (await 신청('열리기전', '01055557777')).data
  const 전남음 = 열리는때 - Date.now()
  확인(전?.ok === false && 전.reason === 'not_yet',
    `열리기 ${(전남음 / 1000).toFixed(1)}초 전에는 막힌다 (${전?.reason})`)

  await new Promise(r => setTimeout(r, Math.max(0, 열리는때 - Date.now()) + 300))
  const 후 = (await 신청('열린뒤', '01055559999')).data
  확인(후?.ok === true, `열린 뒤에는 바로 들어간다 (자리 ${후?.seat_no}번)`)

  /* ── 6. 동의를 안 하면 못 넣는다 ─────────────────────────────────── */
  console.log('\n6) 동의 없이 밀어 넣기 (앱을 거치지 않고 DB 함수를 직접 부름)')
  await 되돌리기()
  const 무동의 = (await 신청('동의안함', '01077778888', 2)).data
  확인(무동의?.ok === false && 무동의.reason === 'need_agreement',
    `동의 2개로는 못 넣는다 (${무동의?.reason})`)

  /* ── 7. 창구를 닫으면 못 넣는다 ──────────────────────────────────── */
  console.log('\n7) 원장님이 창구를 닫은 뒤')
  const sid = await 되돌리기()
  await db.from('booster_sessions').update({ is_open: false }).eq('id', sid)
  const 닫힘 = (await 신청('닫힌뒤', '01066667777')).data
  확인(닫힘?.ok === false && 닫힘.reason === 'closed', `창구가 닫히면 막힌다 (${닫힘?.reason})`)

  /* ── 9. 재원생만 (원장님 2026-11-21) ─────────────────────────────── */
  console.log('\n9) 재원생만 받는다 — 학생 이름 + 학원에 등록된 번호')
  await 되돌리기(undefined, true)
  const 외부 = (await 신청('재원아닌학생', '01012340000')).data
  확인(외부?.ok === false && 외부.reason === 'not_enrolled',
    `학원에 없는 학생은 막힌다 (${외부?.reason})`)

  // 시험용 학생(students.is_test) 한 명으로 「들어가는 길」을 본다. 이름·번호는 화면에 찍지 않는다.
  const { data: 시험학생 } = await db.from('students')
    .select('name, parent_phone').eq('is_test', true).eq('is_active', true).not('parent_phone', 'is', null).limit(1).maybeSingle()
  if (!시험학생) {
    확인(false, '시험용 학생(is_test)이 없어 재원생 통과를 못 봤다')
  } else {
    const 번호 = 시험학생.parent_phone
    const 틀린번호 = (await 신청(시험학생.name, '01000000000')).data
    확인(틀린번호?.ok === false && 틀린번호.reason === 'not_enrolled',
      `이름은 맞아도 번호가 등록된 것과 다르면 막힌다 (${틀린번호?.reason})`)
    const 띄어씀 = 시험학생.name.length > 1 ? 시험학생.name[0] + ' ' + 시험학생.name.slice(1) : 시험학생.name
    const 재원 = (await 신청(띄어씀, 번호)).data
    확인(재원?.ok === true, `재원생은 들어간다 — 이름을 띄어 써도, 번호에 하이픈이 있어도 (자리 ${재원?.seat_no}번)`)
    if (재원?.ok) {
      const { data: 줄 } = await db.from('booster_applications').select('is_enrolled').eq('id', 재원.id).single()
      확인(줄?.is_enrolled === true, '명단의 재원 표시는 DB 가 확인한 값(true)으로 적힌다')
    }
  }

  // 끄면 다시 누구나 (다음 특강이 외부생도 받을 때를 위해)
  await 되돌리기(undefined, false)
  const 꺼짐 = (await 신청('재원아닌학생', '01012340000')).data
  확인(꺼짐?.ok === true, '재원생만을 끈 특강은 외부 학생도 받는다')

  /* ── 8. 치우기 ───────────────────────────────────────────────────── */
  await 되돌리기(undefined, true)   // ★ 연습 화면도 실제처럼 재원생만으로 돌려 둔다
  const { count: 남은것 } = await db.from('booster_applications')
    .select('id', { count: 'exact', head: true }).eq('session_id', sid)
  확인(남은것 === 0, '연습 신청을 다 치웠다')

  // ★ 실제 특강은 한 글자도 안 건드렸는지 확인
  const { data: real } = await db.from('booster_sessions')
    .select('seats_taken').eq('slug', REAL_SLUG).maybeSingle()
  const { count: real건수 } = await db.from('booster_applications')
    .select('id, booster_sessions!inner(slug)', { count: 'exact', head: true })
    .eq('booster_sessions.slug', REAL_SLUG)
  console.log(`\n실제 특강은 그대로입니다 — 나간 자리 ${real?.seats_taken ?? '?'} · 신청 ${real건수 ?? 0}건`)

  console.log(틀린것.length ? `\n✗ 틀린 것 ${틀린것.length}개` : '\n✓ 모두 통과 — 동시에 눌러도 6명을 넘지 않습니다')
  process.exit(틀린것.length ? 1 : 0)
}

main().catch(e => { console.error('✗ 터졌습니다:', e.message); process.exit(1) })
