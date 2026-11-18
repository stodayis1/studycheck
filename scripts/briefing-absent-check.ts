/**
 * 「결석한 날은 학부모 브리핑을 안 보낸다」 자가확인 (원장님 2026-11-18).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-absent-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/briefing-absent-check.ts <고친 briefingBlock.ts 경로>
 *
 * 왜 검사가 필요한가
 *   11/18 까지는 결석에도 브리핑이 나갔다(그날 12건). 원장님 「결석인 친구는 아예
 *   내보내지말자 / 너무 돈아깝다」로 막았다. 이 규칙이 조용히 풀리면 **매일 요금이 샌다**.
 *   거꾸로 과하게 막히면 **정시 학생 브리핑이 안 나간다** — 둘 다 에러가 안 난다.
 *
 *   그리고 막는 자리가 까다롭다. 미리보기(dryRun)에서까지 빼 버리면
 *   ① 담당강사 샘플이 「그날 담당 학생이 모두 결석이라 보낼 글이 없어요」를 못 알리고
 *   ② 화면이 「결석이라 일부러 제외 N명」을 못 적어서, 선생님·원장님이 **왜 빠졌는지**
 *   알 수 없게 된다. 그래서 「실제 발송에서만 뺀다」가 규칙이다.
 *
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다. 아래 「망가뜨려 시험」을 함께 돌린다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/briefingBlock.ts')
const { briefingBlockFor, blocksPreviewToo } = await import(pathToFileURL(target).href)

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
  else console.log('✓ ' + what)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

// ── 사유 판정 ────────────────────────────────────────────────────────────────
ok(briefingBlockFor?.('결석') === 'absent', '★ 결석은 막는다 (원장님 2026-11-18)')
ok(briefingBlockFor?.(' 결석 ') === 'absent', '앞뒤 공백이 붙어 와도 결석이다')
ok(briefingBlockFor?.('시험기간 결석') === 'exam', '시험기간 결석은 전부터 막혀 있다')
ok(briefingBlockFor?.('시험기간') === 'exam', '옛 이름(시험기간)도 막는다 — 스냅샷에 얼어 있는 글자')
ok(briefingBlockFor?.(null) === 'noRecord' && briefingBlockFor?.('') === 'noRecord',
  '출결이 안 적혀 있으면 「기록 없음」이다')
ok(briefingBlockFor?.(undefined) === 'noRecord', '일지가 아예 없는 경우도 「기록 없음」')

// ★ 막지 **말아야** 하는 것 — 여기가 틀리면 학부모가 브리핑을 못 받는다
ok(briefingBlockFor?.('정시') === null, '★ 정시는 보낸다')
ok(briefingBlockFor?.('지각') === null, '★ 지각은 보낸다 (수업에 온 날이다)')
ok(briefingBlockFor?.('조퇴') === null, '★ 조퇴도 보낸다 — 「결석」이라는 글자가 아니다')

// ── 미리보기에서는 남겨야 한다 ───────────────────────────────────────────────
ok(blocksPreviewToo?.('absent') === false,
  '★ 결석은 **미리보기에는 남긴다** (담당강사 샘플의 「모두 결석」 안내와 화면 사유가 거기서 나온다)')
ok(blocksPreviewToo?.('exam') === true && blocksPreviewToo?.('noRecord') === true,
  '시험기간 결석·기록 없음은 미리보기에서도 빠진다 (전과 같다)')
ok(blocksPreviewToo?.(null) === false, '막힘이 없으면 미리보기도 안 막는다')

// ── 발송 라우트가 이 규칙을 **그대로** 쓰나 (베껴 쓰면 한쪽만 고쳐진다) ──────
const route = src('app/api/kakao-briefing/route.ts')
ok(route.includes('briefingBlockFor'), '발송 라우트가 lib 의 판정을 쓴다')
ok(route.includes('blocksPreviewToo'), '발송 라우트가 「미리보기에도 막나」를 lib 에 묻는다')
ok(/skippedAbsent/.test(route), '빠진 사람을 skippedAbsent 로 **세어 보여 준다** (조용히 빼지 않는다)')
ok(!/note\.attendance === '결석'/.test(route),
  '라우트에 결석 판정 사본이 남아 있지 않다 (규칙은 lib 한 곳)')
ok(/absent: 결석제외/.test(route), '미리보기 줄에 absent 표시를 붙인다 — 화면이 사유를 적을 수 있게')

// ── 화면이 사유를 적어 주나 ──────────────────────────────────────────────────
const page = src('app/teacher/learning-notes/page.tsx')
ok(/skippedAbsent/.test(page), '미리보기 화면이 「결석이라 일부러 제외 N명」을 적는다')
ok(/p\.absent/.test(page), '학생 줄에 「결석 · 안 나감」을 보여 준다')
ok(/disabled=\{briefBusy \|\| !!p\.absent\}/.test(page),
  '결석 학생은 「이 학생만 보내기」가 눌리지 않는다 (눌러도 안 나가는 단추는 두지 않는다)')

// ── 일지·결석률은 **안 건드렸나** (발송만 막는 변경이다) ─────────────────────
ok(!/attendance.*결석/.test(src('lib/expectedToday.ts')),
  '「그날 일지를 써야 하는 학생」은 결석을 빼지 않는다 — 결석도 일지를 써야 한다')
ok(/결석/.test(src('lib/briefing.ts')),
  '결석 브리핑 본문 만드는 길은 그대로 둔다 (되돌릴 때 필요하다)')

// ── 운영 기록으로 (.env.local 이 있을 때만 · 읽기만 한다) ────────────────────
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
  console.log('(운영 기록 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  // 이 변경이 배포된 **뒤** 날짜부터, 결석 학생에게 나간 브리핑이 있으면 규칙이 새는 것이다.
  const 기준일 = '2026-11-19'
  const { data: rows } = await db.from('learning_notes')
    .select('session_id, attendance, class_sessions!inner(session_date, student_id)')
    .eq('attendance', '결석')
    .gte('class_sessions.session_date', 기준일)
    .limit(500)
  const ids = (rows ?? []).map((r: any) => r.session_id).filter(Boolean)
  if (!ids.length) {
    console.log(`(${기준일} 이후 결석 일지가 아직 없다 — 운영 확인은 다음에)`)
  } else {
    // in() 은 100개씩 끊어 묻는다 (긴 목록은 조용히 잘린다)
    let 나간것 = 0
    for (let i = 0; i < ids.length; i += 100) {
      const { data: sent } = await db.from('briefing_sends')
        .select('id, session_id').in('session_id', ids.slice(i, i + 100))
      나간것 += (sent ?? []).length
    }
    ok(나간것 === 0,
      `★ ${기준일} 이후 결석 일지 ${ids.length}건 중 학부모께 나간 브리핑이 ${나간것}건이다 (0 이어야 한다)`)
  }
  // 거꾸로 — 정시가 통째로 안 나가고 있지 않은지 (과하게 막혔을 때)
  const 어제 = new Date(Date.now() + 9 * 3600_000 - 86400_000).toISOString().slice(0, 10)
  const { data: 어제정시 } = await db.from('learning_notes')
    .select('session_id, class_sessions!inner(session_date)')
    .eq('attendance', '정시').eq('class_sessions.session_date', 어제).limit(500)
  const 정시ids = (어제정시 ?? []).map((r: any) => r.session_id)
  if (정시ids.length >= 5) {
    let 정시나감 = 0
    for (let i = 0; i < 정시ids.length; i += 100) {
      const { data: sent } = await db.from('briefing_sends')
        .select('id').in('session_id', 정시ids.slice(i, i + 100))
      정시나감 += (sent ?? []).length
    }
    ok(정시나감 > 0,
      `★ ${어제} 정시 ${정시ids.length}건 중 ${정시나감}건이 나갔다 (0 이면 과하게 막힌 것이다)`)
  } else {
    console.log(`(${어제} 정시 일지가 ${정시ids.length}건뿐 — 과하게 막혔나 확인은 건너뜀)`)
  }
}

console.log(bad ? `\n결석 발송 자가확인 실패 ${bad}건` : '\n결석 발송 자가확인 ✓')
process.exitCode = bad ? 1 : 0
