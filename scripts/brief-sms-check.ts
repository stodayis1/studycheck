/**
 * 「이 학생은 알림톡 대신 문자로」 자가확인 (원장님 2026-11-19).
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/brief-sms-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/brief-sms-check.ts <고친 briefSms.ts 경로>
 *
 * 왜 검사가 필요한가
 *   최온유(초3) 학부모님 번호를 카카오가 스팸으로 막아 알림톡이 계속 거절된다
 *   (11/17 브리핑 1건 + 11/18 재발송 2건, 전부 「스팸」). 그 집만 문자로 보낸다.
 *
 *   ★ **잘못 켜지면 전교생 브리핑이 문자로 나간다** — 요금이 알림톡의 여러 배다.
 *     그래서 「켠 학생만」이 제일 중요한 검사다.
 *   ★ 거꾸로 **안 켜지면** 그 집은 브리핑을 영영 못 받는다(알림톡이 조용히 거절된다).
 *
 * 일부러 망가뜨린 사본에서 **반드시 실패해야** 검사다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const target = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('lib/briefSms.ts')
const { briefChannelOf, briefSmsText, SMS_MAX_BYTES } = await import(pathToFileURL(target).href)

let bad = 0
function ok(cond: boolean, what: string) {
  if (!cond) { console.error('✗ ' + what); bad++ }
  else console.log('✓ ' + what)
}
const src = (p: string) => fs.readFileSync(path.resolve(p), 'utf8')

// ── 누가 문자로 가나 ────────────────────────────────────────────────────────
ok(briefChannelOf?.({ brief_by_sms: true }) === 'sms', '★ 켜 둔 학생은 문자로')
ok(briefChannelOf?.({ brief_by_sms: false }) === 'alimtalk', '★★ 안 켠 학생은 알림톡 (여기가 틀리면 전교생이 문자로 나간다)')
ok(briefChannelOf?.({}) === 'alimtalk', '★★ 칸이 없으면(SQL 전) 알림톡 — 모르면 바꾸지 않는다')
ok(briefChannelOf?.(null) === 'alimtalk' && briefChannelOf?.(undefined) === 'alimtalk', '학생이 없으면 알림톡')
ok(briefChannelOf?.({ brief_by_sms: 1 as any }) === 'alimtalk', '★ true 가 아닌 값은 안 켠 것으로 본다')

// ── 보낼 글 ─────────────────────────────────────────────────────────────────
const 링크 = [
  { name: '학습지·테스트 점수', url: 'https://studycheck-five.vercel.app/report/' + 'a'.repeat(32) },
  { name: '출결·과제달성률 현황', url: 'https://studycheck-five.vercel.app/report/' + 'b'.repeat(32) },
  { name: '알림장·사진 보기', url: 'https://studycheck-five.vercel.app/report/' + 'c'.repeat(32) },
]
{
  const r = briefSmsText?.({ body: '온유 학생 수업 안내입니다.', links: 링크 })
  ok(r.text.startsWith('온유 학생 수업 안내입니다.'), '★ 본문이 먼저다 (알림톡과 같은 글)')
  ok(r.text.includes('▶ 자세히 보기'), '링크 머리말을 붙인다')
  ok(링크.every((l) => r.text.includes(l.url)), '★ 버튼이 없으니 링크를 글로 적는다')
  ok(r.dropped === 0 && r.tooLong === false, '짧은 글은 그대로 나간다')
}
{
  // 링크 없이도 돌아야 한다 — 알림장 없는 판은 버튼이 둘뿐이다
  const r = briefSmsText?.({ body: '본문만' })
  ok(r.text === '본문만' && !r.text.includes('자세히 보기'), '링크가 없으면 꼬리를 안 붙인다')
}
{
  // ★ 한 통(2000바이트)을 넘으면 **링크를 뒤에서부터** 뺀다 — 본문은 안 자른다.
  //   ★ 링크 **하나만 들어가는** 크기로 맞춰야 「앞을 남기나 뒤를 남기나」가 갈린다.
  //     처음엔 셋 다 빠지는 크기로 시험해서, 뒤에서부터 빼는 사본이 그냥 통과했다.
  const 긴링크 = [0, 1, 2].map((i) => ({ name: `링크${i}`, url: 'https://x/' + String.fromCharCode(97 + i).repeat(880) }))
  const 긴본문 = '가'.repeat(66)    // 198바이트 — 링크 하나(약 900바이트)만 들어간다
  const r = briefSmsText?.({ body: 긴본문, links: 긴링크 })
  ok(r.text.startsWith(긴본문), '★★ 본문은 절대 안 자른다')
  ok(r.dropped === 2, '자리가 모자라면 링크를 뺀다 (셋 중 둘)')
  ok(r.bytes <= SMS_MAX_BYTES, `한 통(${SMS_MAX_BYTES}바이트) 안에 들어간다`)
  ok(r.text.includes(긴링크[0].url) && !r.text.includes(긴링크[1].url) && !r.text.includes(긴링크[2].url),
    '★ 뒤에서부터 뺀다 — 앞의 점수 링크를 남긴다 (학부모님이 제일 많이 누르는 것)')
}
{
  // 본문만으로 넘치면 — 자르지 않고 **넘쳤다고 알린다**
  const r = briefSmsText?.({ body: '가'.repeat(800), links: 링크 })
  ok(r.tooLong === true && r.text.length >= 800, '★ 본문만으로 넘치면 알리되 자르지는 않는다')
}

// ── 발송 라우트가 **실제로 갈라지나** ───────────────────────────────────────
const route = src('app/api/kakao-briefing/route.ts')
ok(/const 문자로 = briefChannelOf\(student\) === 'sms'/.test(route), '★ 라우트가 lib 의 판정을 쓴다')
ok(/if \(문자로\) \{[\s\S]{0,400}sendSmsViaOps\(/.test(route), '★ 문자인 학생은 sendSmsViaOps 로 보낸다')
ok(/\} else \{[\s\S]{0,200}sendAlimtalk\(/.test(route), '★ 나머지는 그대로 알림톡으로 보낸다')
ok(/brief_by_sms/.test(route) && /select\('id, name, grade, parent_phone[^']*brief_by_sms/.test(route),
  '★★ 학생을 읽을 때 brief_by_sms 칸을 **같이 읽는다** — 안 읽으면 늘 알림톡이고 에러도 안 난다')
ok(/channel: 문자로 \? 'sms' : 'alimtalk'/.test(route),
  '★ 발송 기록에 어느 길로 갔는지 남긴다 (알림톡 점검에 안 잡히는 건을 가리려면 필요하다)')
ok(route.indexOf('const 문자로') < route.indexOf('sms: 문자로'),
  '미리보기에도 「문자로」를 적어 준다 (판정이 미리보기보다 앞에 있다)')
ok(/테스트발송/.test(route),
  '★ 테스트로 보낸 건은 기록하지 않는다 — 기록하면 그 학생 진짜 발송이 영영 막힌다')

// ── 화면 ────────────────────────────────────────────────────────────────────
const stu = src('app/teacher/students/page.tsx')
ok(/brief_by_sms: !!editStudent\.brief_by_sms/.test(stu), '★ 학생관리에서 저장된다 (화면만 만들고 저장을 빠뜨리지 않았다)')
ok(/isAdmin\(\) && \([\s\S]{0,600}brief_by_sms/.test(stu), '★ 원장님만 켜고 끌 수 있다')
ok(/p\.sms &&/.test(src('app/teacher/learning-notes/page.tsx')), '미리보기 줄에 「문자로」가 보인다')

// ── SQL 짝 ──────────────────────────────────────────────────────────────────
ok(fs.existsSync('docs/sql/브리핑_문자로보내기.sql') && fs.existsSync('docs/sql/브리핑_문자로보내기_되돌리기.sql'),
  'SQL 과 되돌리기가 짝으로 있다')
ok(/default false/.test(src('docs/sql/브리핑_문자로보내기.sql')),
  '★ 기본값이 false — SQL 만 돌려서는 아무 학생도 안 바뀐다')

// ── 운영 (.env.local 이 있을 때만 · 읽기만 한다) ────────────────────────────
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
  console.log('(운영 확인은 건너뜀 — .env.local 이 없다)')
} else {
  const db = createClient(url, key, { auth: { persistSession: false } })
  const { data, error } = await db.from('students').select('name, grade, brief_by_sms')
    .eq('brief_by_sms', true).eq('is_active', true)
  if (error) {
    console.log('(운영에 brief_by_sms 칸이 아직 없다 — docs/sql/브리핑_문자로보내기.sql 을 돌려야 한다.'
      + ' 칸이 없는 동안은 전부 알림톡으로 나가므로 고장은 아니다)')
  } else {
    const 켠사람 = (data ?? []) as any[]
    ok(켠사람.length <= 5,
      `★ 문자로 보내는 학생이 ${켠사람.length}명 — 많으면 요금이 는다 (${켠사람.map((s) => `${s.name}(${s.grade})`).join(', ') || '없음'})`)
  }
}

console.log(bad ? `\n브리핑 문자 자가확인 실패 ${bad}건` : '\n브리핑 문자 자가확인 ✓')
process.exitCode = bad ? 1 : 0
