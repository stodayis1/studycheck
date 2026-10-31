/**
 * 카톡 브리핑 본문이 **실데이터 전량**에서 알림톡 1,000자 한도를 넘지 않는지 확인한다.
 *
 * 왜 필요한가
 *   평소 본문은 250자쯤이라 눈으로 보면 늘 멀쩡하다. 그런데 긴 알림장을 쓴 날
 *   그 학생 한 명만 조용히 발송 실패한다 — 그걸 알아차릴 방법이 없다.
 *   그래서 사람 눈이 아니라 숫자로 확인한다.
 *
 * 쓰는 법
 *   node scripts/briefing-check.ts
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { buildBriefing, worksheetTail, BODY_LIMIT, BODY_BUDGET, BRIEFING_TEMPLATE, BRIEFING_TEMPLATE_NONOTE,
  BRIEFING_TEMPLATE_V2, BRIEFING_TEMPLATE_V2_NONOTE } from '../lib/briefing.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })

/** Supabase 는 한 번에 1000행만 준다. ★ order 없이 페이지를 돌리면 행이 겹치거나 사라진다. */
async function all(table: string, cols: string) {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(cols).order('id').range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

const [students, sessions, notes, feedbacks, worksheets] = await Promise.all([
  all('students', 'id, name'),
  all('class_sessions', 'id, student_id, session_date, progress_content, today_textbook_name, today_chapter, daily_test_unit, daily_test_score, hw_textbook_name, hw_textbook_page, hw_worksheet_range'),
  all('learning_notes', 'id, session_id, attendance, worksheet_submitted, worksheet_score, worksheet_unit, worksheet_level, textbook_submitted, workbook_done, achievement_pct, memo, makeup_note'),
  all('feedbacks', 'id, student_id, content, ai_message, teacher_name, created_at'),
  // ★ 학습지 점수가 점수 칸 뒤에 붙는다 (원장님 2026-10-30). 단원 이름이 긴 학생이 있어서
  //   **실데이터 전량**으로 한도를 다시 재야 한다 — 그게 이 검사의 할 일이다.
  all('student_worksheets', 'id, student_id, unit, unit_name, current_level, score, submitted_at'),
])

const nameOf = new Map(students.map((s: any) => [s.id, s.name]))
const noteOf = new Map(notes.map((n: any) => [n.session_id, n]))
const fbKey = (studentId: string, date: string) => `${studentId}|${date}`
const fbOf = new Map<string, any[]>()
for (const f of feedbacks) {
  // 기기(한국) 시각 기준 날짜로 묶는다 — 발송 서버도 같은 기준을 쓴다.
  const kst = new Date(new Date(f.created_at).getTime() + 9 * 3600_000)
  const d = kst.toISOString().slice(0, 10)
  const k = fbKey(f.student_id, d)
  if (!fbOf.has(k)) fbOf.set(k, [])
  fbOf.get(k)!.push(f)
}

// 학습지도 알림장과 같이 **한국시간 날짜**로 묶는다 — 발송 쪽도 +09:00 범위로 거른다.
const wsOf = new Map<string, any[]>()
for (const w of worksheets) {
  if (w.score == null || !w.submitted_at) continue
  const kst = new Date(new Date(w.submitted_at).getTime() + 9 * 3600_000)
  const k = fbKey(w.student_id, kst.toISOString().slice(0, 10))
  if (!wsOf.has(k)) wsOf.set(k, [])
  wsOf.get(k)!.push(w)
}
for (const list of wsOf.values()) list.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)))

// ★ 알리고는 변수를 채워 주지 않는다 — 우리가 만든 본문을 그대로 보내고,
//   그 본문이 **승인된 템플릿 서식과 일치해야** 전송된다. 안 맞으면 조용히 안 간다.
//   그래서 "골격의 고정된 줄이 순서대로 다 들어 있는가" 를 매 건 확인한다.
//   (템플릿을 고치면서 BRIEFING_TEMPLATE 과 어긋나면 여기서 바로 걸린다)
const fixedOf = (tpl: string) => tpl.split('\n')
  .map((line) => line.replace(/#\{[^}]+\}/g, '\u0000'))   // 변수 자리는 구멍으로
  .flatMap((line) => line.split('\u0000'))
  .map((part) => part.trim())
  .filter((part) => part.length > 0)

// 「과제 성취도」 판(V2)으로 검사할지. 지금 실제로 나가는 판이다 — 둘 다 돌려 봐야 한다.
const V2 = process.argv.includes('--v2')
const TPL = V2 ? BRIEFING_TEMPLATE_V2 : BRIEFING_TEMPLATE
const TPL_NONOTE = V2 ? BRIEFING_TEMPLATE_V2_NONOTE : BRIEFING_TEMPLATE_NONOTE
const FIXED = fixedOf(TPL)
const FIXED_NONOTE = fixedOf(TPL_NONOTE)

/** 그 본문이 **쓰기로 한 판**과 맞는지 본다. 안 맞으면 알리고가 조용히 안 보낸다. */
function matchesTemplate(body: string, which: 'full' | 'nonote' = 'full') {
  let at = 0
  for (const part of which === 'nonote' ? FIXED_NONOTE : FIXED) {
    const i = body.indexOf(part, at)
    if (i < 0) return part            // 어느 조각이 빠졌는지 돌려준다
    at = i + part.length
  }
  return null
}

// ★ 이 검사가 **정말로 걸러내는지** 먼저 확인한다. 안 걸리는 검사는 없는 것과 같다.
{
  const sample = TPL.replace(/#\{[^}]+\}/g, '값')
  if (matchesTemplate(sample) !== null) {
    console.error('✗ 검사 자체가 고장났습니다 — 멀쩡한 본문을 어긋났다고 합니다.')
    process.exit(1)
  }
  const s2 = TPL_NONOTE.replace(/#\{[^}]+\}/g, '값')
  if (matchesTemplate(s2, 'nonote') !== null) {
    console.error('✗ 알림장 없는 판 검사가 고장났습니다.')
    process.exit(1)
  }
  const broken = sample.replace('▶ 출결', '▶ 출석')      // 한 글자만 바꿔 본다
  if (matchesTemplate(broken) === null) {
    console.error('✗ 검사 자체가 고장났습니다 — 어긋난 본문을 통과시킵니다.')
    process.exit(1)
  }
  console.log('템플릿 서식 검사 자가확인 ✓ (멀쩡한 건 통과, 한 글자 틀린 건 걸림)')
}

// ★ 학습지 꼬리 자가확인 — 규칙이 망가지면 여기서 걸린다.
{
  const T = (name: string, got: string, want: string) => {
    if (got !== want) {
      console.error(`✗ 학습지 꼬리 — ${name}\n   나온 것: 「${got}」\n   나와야: 「${want}」`)
      process.exit(1)
    }
  }
  T('한 장 · 레벨의 .0 은 떼고',
    worksheetTail([{ unit: '전범위', unit_name: '전범위', current_level: '4.0', score: 90 }]),
    '학습지 전범위 Lv4 90점')
  T('두 장은 가운뎃점으로',
    worksheetTail([
      { unit_name: '전범위', current_level: '4.0', score: 90 },
      { unit_name: '4단원', current_level: '2.5', score: 80 }]),
    '학습지 전범위 Lv4 90점 · 4단원 Lv2.5 80점')
  T('세 장부터는 외 N장',
    worksheetTail([
      { unit_name: '가', current_level: '1.0', score: 90 },
      { unit_name: '나', current_level: '2.0', score: 80 },
      { unit_name: '다', current_level: '3.0', score: 70 },
      { unit_name: '라', current_level: '4.0', score: 60 }]),
    '학습지 가 Lv1 90점 · 나 Lv2 80점 외 2장')
  T('레벨 없는 것(교재연계)은 레벨 없이',
    worksheetTail([{ unit_name: '쎈 P.18~P.80', current_level: null, score: 58 }]),
    '학습지 쎈 P.18~P.80 58점')
  T('괄호 안 설명과 별표·레벨학습지 군더더기는 뗀다',
    worksheetTail([{ unit_name: '* 레벨학습지 (5-2) 3단원 *', current_level: '3.5', score: 92 }]),
    '학습지 3단원 Lv3.5 92점')
  T('단원이 길면 줄여서라도 넣는다 — 말줄임표로 끊긴 글을 내보내지 않는다',
    worksheetTail([{ unit_name: '2. 식의 계산(단항식의곱셈과나눗셈~다항식과단항식의혼합계산의도형에의활용)', current_level: '2.0', score: 40 }]),
    '학습지 2. 식의 계산 Lv2 40점')
  T('괄호를 떼도 낱말이 안 붙게 — 「이차함수 의 그래프」가 되면 안 된다',
    worksheetTail([{ unit_name: '2. 이차함수(일반형)의 그래프~이차함수y=ax²+bx+c의 식구하기', current_level: '2.5', score: 65 }]),
    '학습지 2. 이차함수의 그래프… Lv2.5 65점')
  T('긴 이름은 낱말 한가운데가 아니라 마디에서 끊는다',
    worksheetTail([{ unit_name: '소수와 합성수, 거듭제곱, 소인수분해, 공약수와 최대공약수', current_level: '1.0', score: 58 }]),
    '학습지 소수와 합성수, 거듭제곱, 소인수분해… Lv1 58점')
  T('점수 없는 줄은 빼고', worksheetTail([{ unit_name: '아직', score: null }]), '')
  T('아무것도 없으면 빈 글자', worksheetTail([]), '')

  // 결석한 날은 붙지 않아야 한다 — 그날은 학습지를 볼 수 없다.
  const 결석본문 = buildBriefing({
    studentName: '시험', session: { session_date: '2026-10-30' },
    note: { attendance: '결석', worksheet_score: 70 },
    worksheets: [{ unit_name: '전범위', current_level: '4.0', score: 90 }],
  }).body
  if (결석본문.includes('학습지 전범위')) {
    console.error('✗ 결석한 날인데 학습지 점수가 붙었습니다.')
    process.exit(1)
  }
  // 온 날은 붙어야 한다 (안 붙으면 이 검사가 아무것도 안 지키는 것이다).
  const 출석본문 = buildBriefing({
    studentName: '시험', session: { session_date: '2026-10-30' },
    note: { attendance: '출석', worksheet_score: 70 }, useV2: true,
    worksheets: [{ unit_name: '전범위', current_level: '4.0', score: 90 }],
  }).body
  if (!출석본문.includes('70% · 학습지 전범위 Lv4 90점')) {
    console.error('✗ 출석한 날인데 학습지 점수가 안 붙었습니다.\n' + 출석본문)
    process.exit(1)
  }
  console.log('학습지 꼬리 자가확인 ✓ (결석엔 안 붙고, 출석엔 붙고, 레벨 .0 은 떼고)')
}

// 「알림장 없는 판」을 쓸 수 있다고 보고 검사할지(--nonote). 심사 통과 뒤 모습을 미리 본다.
const NONOTE = process.argv.includes('--nonote')
let over = 0
let offTemplate = 0
let noNoteCount = 0
let firstOff: { who: string; date: string; missing: string } | null = null
let overBudget = 0
let cutTail = 0
let firstCut: { who: string; date: string; line: string } | null = null
let tailShown = 0
let tailDropped = 0
let firstDropped: { who: string; date: string } | null = null
let worst = { len: 0, body: '', who: '', date: '' }
const lens: number[] = []

for (const ses of sessions) {
  const r = buildBriefing({
    studentName: nameOf.get(ses.student_id) ?? '학생',
    session: ses,
    note: noteOf.get(ses.id) ?? null,
    feedbacks: fbOf.get(fbKey(ses.student_id, ses.session_date)) ?? [],
    worksheets: wsOf.get(fbKey(ses.student_id, ses.session_date)) ?? [],
    noNoteTemplate: NONOTE,
    useV2: V2,
  })
  lens.push(r.bodyLen)
  if (r.overLimit) over++
  if (r.template === 'nonote') noNoteCount++
  const missing = matchesTemplate(r.body, r.template)
  if (missing) {
    offTemplate++
    if (!firstOff) firstOff = { who: nameOf.get(ses.student_id) ?? '?', date: ses.session_date, missing }
  }
  // ★ 학습지 꼬리가 말줄임표로 끊기면 학부모 문자에 낱말이 반 토막 난다. 한 건도 없어야 한다.
  // ★ 「 · 학습지 」가 있는 줄만 본다. 데일리테스트 단원이 길어 끊기는 것은 예전부터 있던 일이고
  //   그건 이 검사가 볼 것이 아니다 (CAP.데일리테스트 34자).
  const 성취도줄 = r.body.split('\n').find((l) => /성취도|지난 학습지/.test(l))
  // 학습지 점수가 있는데 칸이 모자라 **아예 못 붙은** 건도 센다 — 조용히 사라지면 안 된다.
  const 학습지있던날 = (wsOf.get(fbKey(ses.student_id, ses.session_date)) ?? []).length > 0
    && (noteOf.get(ses.id)?.attendance ?? '') !== '결석'
  if (학습지있던날) {
    if (성취도줄?.includes(' · 학습지 ') || 성취도줄?.includes('  학습지 ')) tailShown++
    else {
      tailDropped++
      if (!firstDropped) firstDropped = { who: nameOf.get(ses.student_id) ?? '?', date: ses.session_date }
    }
  }
  if (성취도줄 && 성취도줄.includes(' · 학습지 ') && 성취도줄.trimEnd().endsWith('…')) {
    cutTail++
    if (!firstCut) { firstCut = { who: nameOf.get(ses.student_id) ?? '?', date: ses.session_date, line: 성취도줄.trim() }
      console.log('DBG', JSON.stringify(r.vars['#{과제성취도}'] ?? r.vars['#{학습지결과}']), (r.vars['#{과제성취도}'] ?? r.vars['#{학습지결과}']).length, JSON.stringify(wsOf.get(fbKey(ses.student_id, ses.session_date)))) }
  }
  if (r.bodyLen > BODY_BUDGET) overBudget++
  if (r.bodyLen > worst.len) {
    worst = { len: r.bodyLen, body: r.body, who: nameOf.get(ses.student_id) ?? '?', date: ses.session_date }
  }
}

lens.sort((a, b) => a - b)
const at = (p: number) => lens[Math.min(lens.length - 1, Math.floor(lens.length * p))]
console.log(`골격만: ${TPL.length}자 (변수 자리 포함)`)
console.log(`수업 ${sessions.length.toLocaleString()}건 검사 — ${V2 ? '과제 성취도 판(V2)' : '예전 판'}`)
console.log(`  본문 길이  중간값 ${at(0.5)}자 · 90% ${at(0.9)}자 · 99% ${at(0.99)}자 · 최대 ${worst.len}자`)
console.log(`  ${BODY_BUDGET}자(안전선) 초과 : ${overBudget}건`)
console.log(`  ${BODY_LIMIT}자(카카오 한도) 초과 : ${over}건  ${over === 0 ? '✓' : '✗ 이 건들은 발송이 거부됩니다'}`)
console.log(`  알림장 없는 판으로 나갈 건 : ${noNoteCount}건${NONOTE ? '' : ' (지금은 원래 판 + 빈 한 줄)'}`)
console.log(`  템플릿 서식과 어긋남 : ${offTemplate}건  ${offTemplate === 0 ? '✓' : '✗ 알리고가 이 건들을 보내지 않습니다'}`)
if (firstOff) console.log(`    예) ${firstOff.who} ${firstOff.date} — 「${firstOff.missing}」 조각이 본문에 없음`)
console.log(`\n가장 긴 본문 — ${worst.who} ${worst.date} (${worst.len}자)`)
console.log('─'.repeat(50))
console.log(worst.body)
console.log('─'.repeat(50))

console.log(`  학습지 점수가 붙어 나간 건 : ${tailShown}건 · 칸이 모자라 못 붙은 건 : ${tailDropped}건`)
if (firstDropped) console.log(`    예) ${firstDropped.who} ${firstDropped.date}`)
console.log(`  학습지 꼬리가 말줄임표로 끊긴 건 : ${cutTail}건  ${cutTail === 0 ? '✓' : '✗ 낱말이 반 토막 나서 나갑니다'}`)
if (firstCut) console.log(`    예) ${firstCut.who} ${firstCut.date} — 「${firstCut.line}」`)

if (over > 0 || offTemplate > 0 || cutTail > 0) process.exitCode = 1
