/**
 * 자동 발송이 끝난 뒤 **무슨 일이 있었는지** 한 번에 본다.
 *
 *   node scripts/briefing-result.ts 2026-10-13
 *
 * 보여 주는 것
 *   · 그날 수업과 기록 상태
 *   · 학부모 발송 결과(성공·실패·시각)
 *   · 자동 교정이 무엇을 고쳤고 무엇을 건너뛰었나
 *   · 아직 못 나간 학생과 그 이유
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const date = process.argv[2] ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

const kst = (t: string) => new Date(t).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false })

const [{ data: sessions }, { data: sends }, { data: polish }] = await Promise.all([
  db.from('class_sessions').select('id, student_id, session_type').eq('session_date', date),
  db.from('briefing_sends').select('student_id, status, error, body_len, sent_at').eq('session_date', date),
  db.from('note_polish_log').select('*').eq('session_date', date),
])

const sessionIds = (sessions ?? []).map((s: any) => s.id)
const [{ data: notes }, { data: students }] = await Promise.all([
  sessionIds.length ? db.from('learning_notes').select('session_id, attendance').in('session_id', sessionIds) : { data: [] as any[] },
  sessionIds.length ? db.from('students').select('id, name, grade, teacher_name, parent_phone')
    .in('id', [...new Set((sessions ?? []).map((s: any) => s.student_id))]) : { data: [] as any[] },
])
const noteBy = new Map((notes ?? []).map((n: any) => [n.session_id, n]))
const stuBy = new Map((students ?? []).map((s: any) => [s.id, s]))
const sentIds = new Set((sends ?? []).map((s: any) => s.student_id))

console.log(`\n═══ ${date} 자동 발송 결과 ═══\n`)

const ok = (sends ?? []).filter((s: any) => s.status === 'sent')
const fail = (sends ?? []).filter((s: any) => s.status !== 'sent')
console.log(`학부모 발송  성공 ${ok.length}건 · 실패 ${fail.length}건`)
if (ok.length) {
  const times = ok.map((s: any) => s.sent_at).filter(Boolean).sort()
  console.log(`             ${kst(times[0])} ~ ${kst(times[times.length - 1])}`)
  const lens = ok.map((s: any) => s.body_len ?? 0)
  console.log(`             평균 ${Math.round(lens.reduce((a, b) => a + b, 0) / lens.length)}자 · 최대 ${Math.max(...lens)}자`)
}
for (const f of fail) console.log(`   ✗ ${stuBy.get(f.student_id)?.name ?? f.student_id} — ${f.error ?? '사유 없음'}`)

// ── 아직 못 나간 학생 ───────────────────────────────────────────────────
const pending: string[] = []
for (const ses of (sessions ?? []) as any[]) {
  if (ses.session_type && ses.session_type !== '정규') continue
  const st = stuBy.get(ses.student_id)
  if (!st || sentIds.has(st.id)) continue
  const n: any = noteBy.get(ses.id)
  const why = !n ? '수업일지 없음'
    : !n.attendance ? '출결 미입력'
      : n.attendance === '시험기간 결석' ? '시험기간 결석(안 보냄)'
        : !st.parent_phone ? '보호자 번호 없음' : '그 밖'
  pending.push(`${st.name} ${st.grade} (${String(st.teacher_name ?? '').split(',')[0].trim()}) — ${why}`)
}
console.log(`\n아직 못 나간 학생  ${pending.length}명`)
for (const p of pending) console.log(`   · ${p}`)

// ── 자동 교정 ───────────────────────────────────────────────────────────
const applied = (polish ?? []).filter((p: any) => p.applied)
const skipped = (polish ?? []).filter((p: any) => !p.applied)
console.log(`\n자동 교정  고침 ${applied.length}건 · 건너뜀 ${skipped.length}건`)
for (const p of applied as any[]) {
  console.log(`   ✎ ${p.student_name} [${p.kind === 'notice' ? '알림장' : '진도'}] ${p.why ?? ''}`)
  console.log(`      전: ${String(p.before_text).replace(/\n/g, ' / ')}`)
  console.log(`      후: ${String(p.after_text).replace(/\n/g, ' / ')}`)
}
for (const p of skipped as any[]) {
  console.log(`   – ${p.student_name} [${p.kind === 'notice' ? '알림장' : '진도'}] 건너뜀 — ${p.skip_reason ?? ''}`)
}
console.log('')
