/**
 * 새 판(V2) 템플릿이 **보낼 수 있는 모양인지** 제 쪽에서 미리 검사한다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/check-v2-template.mjs 2026-10-16
 *
 * 보는 것
 *   · 원문에 쓰인 변수와 코드가 채우는 변수가 같은가 (하나라도 어긋나면 발송이 조용히 실패)
 *   · 실제 학생들로 만들어 보면 몇 자나 되는가 (알림톡 1,000자 한도)
 *   · 예전 판과 무엇이 달라지는가
 *
 * 알리고에 **등록된** 템플릿과 대조하는 것은 화면의 「템플릿 맞는지 확인」이 한다.
 * 그건 알리고 키가 있어야 해서 여기서는 못 한다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  BRIEFING_TEMPLATE, BRIEFING_TEMPLATE_NONOTE,
  BRIEFING_TEMPLATE_V2, BRIEFING_TEMPLATE_V2_NONOTE, buildBriefing,
} from '../lib/briefing.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const vars = (t) => [...new Set([...t.matchAll(/#\{([^}]+)\}/g)].map((m) => m[1]))]

console.log('\n═══ 새 판 템플릿 검사 ═══\n')
for (const [name, tpl] of [['알림장 있는 판', BRIEFING_TEMPLATE_V2], ['알림장 없는 판', BRIEFING_TEMPLATE_V2_NONOTE]]) {
  console.log(`── ${name} ──`)
  console.log(`   골격 ${[...tpl].length}자 · 변수 ${vars(tpl).length}개`)
  console.log(`   ${vars(tpl).join(' · ')}`)
}

// 예전 판과 무엇이 다른가
const diff = (a, b) => {
  const A = a.split('\n'), B = b.split('\n')
  const out = []
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] !== B[i]) out.push(`   ${i + 1}줄  전: ${A[i] ?? '(없음)'}\n        후: ${B[i] ?? '(없음)'}`)
  }
  return out
}
console.log('\n── 예전 판과 다른 곳 ──')
for (const l of diff(BRIEFING_TEMPLATE, BRIEFING_TEMPLATE_V2)) console.log(l)
console.log('   (알림장 없는 판도 같은 한 줄)')
console.log('   달라진 줄 수:', diff(BRIEFING_TEMPLATE_NONOTE, BRIEFING_TEMPLATE_V2_NONOTE).length)

// 실제 학생들로 만들어 보기
const { data: sessions } = await db.from('class_sessions').select('*').eq('session_date', date)
if (!sessions?.length) { console.log(`\n${date} 수업 기록이 없어 길이 검사는 건너뜁니다.\n`); process.exit(0) }
const ids = [...new Set(sessions.map((s) => s.student_id))]
const [{ data: students }, { data: notes }, { data: fbs }] = await Promise.all([
  db.from('students').select('id, name, parent_phone').in('id', ids),
  db.from('learning_notes').select('*').in('session_id', sessions.map((s) => s.id)),
  db.from('feedbacks').select('*').in('student_id', ids)
    .gte('created_at', `${date}T00:00:00+09:00`).lt('created_at', `${date}T24:00:00+09:00`),
])
const stu = new Map((students ?? []).map((s) => [s.id, s]))
const noteBy = new Map((notes ?? []).map((n) => [n.session_id, n]))

let max = { len: 0, name: '' }, n = 0, missing = 0
for (const ses of sessions) {
  const st = stu.get(ses.student_id); const note = noteBy.get(ses.id)
  if (!st || !note?.attendance) continue
  const b = buildBriefing({
    studentName: st.name, session: ses, note,
    feedbacks: (fbs ?? []).filter((f) => f.student_id === st.id),
    makeup: null, noNoteTemplate: false, useV2: true,
  })
  n++
  if (/#\{/.test(b.body)) missing++
  if (b.bodyLen > max.len) max = { len: b.bodyLen, name: st.name }
}
console.log(`\n── ${date} 학생 ${n}명으로 만들어 본 결과 ──`)
console.log(`   가장 긴 글 ${max.len}자 (${max.name}) · 한도 1,000자`)
console.log(`   변수가 안 채워진 글 ${missing}건 ${missing ? '← 확인 필요' : '(없음)'}`)
console.log('')
