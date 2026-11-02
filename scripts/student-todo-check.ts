/**
 * 학생 화면(할일목록)에 **과제가 실제로 뜨는지** 실데이터 전량으로 센다.
 *
 * 왜 필요한가 (원장님 2026-10-31 「학생용으로 로그인하면 과제가 안떠」)
 *   화면은 「오늘 수업」이 있을 때만 과제를 보여 주고 있었다. 그런데 과제는
 *   「**다음 시간까지**」 하는 것이라 **수업이 없는 날**에 해야 한다. 토요일에는
 *   수업이 있는 학생이 0명이어서 전원 빈 화면이었다 — 에러도 안 난다.
 *
 *   눈으로는 「내 계정엔 오늘 수업이 있어서」 잘 보인다. 그래서 **날짜를 바꿔 가며
 *   전원을 세야** 걸린다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/student-todo-check.ts
 *   node --import ./scripts/ts-resolve.mjs scripts/student-todo-check.ts 2026-10-31
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
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } })

async function all(table: string, cols: string, tune?: (q: any) => any) {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).order('id').range(from, from + 999)
    if (tune) q = tune(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

const DAYS = process.argv[2] ? [process.argv[2]] : (() => {
  // 최근 7일을 다 돌려 본다 — 요일마다 수업 있는 사람이 다르다.
  const base = Date.now() + 9 * 3600_000
  return [...Array(7)].map((_, i) => new Date(base - i * 86400_000).toISOString().slice(0, 10)).reverse()
})()

const [students, sessions, notes, worksheets, textbooks] = await Promise.all([
  all('students', 'id, name, is_active, on_leave', (q: any) => q.eq('is_active', true)),
  all('class_sessions', 'id, student_id, session_date, hw_textbook_name'),
  all('learning_notes', 'id, session_id, textbook_achievement, workbook_done'),
  all('student_worksheets', 'id, student_id, status, assigned_at'),
  all('student_textbooks', 'id, student_id, textbook_type'),
])

const live = students.filter((s: any) => !s.on_leave)
const sesOf = new Map<string, any[]>()
for (const c of sessions) {
  const list = sesOf.get(c.student_id) ?? []; list.push(c); sesOf.set(c.student_id, list)
}
for (const list of sesOf.values()) list.sort((a, b) => a.session_date.localeCompare(b.session_date))
const noteOf = new Map(notes.map((n: any) => [n.session_id, n]))
const wsOf = new Map<string, any[]>()
for (const w of worksheets) {
  const list = wsOf.get(w.student_id) ?? []; list.push(w); wsOf.set(w.student_id, list)
}
const hasWorkbook = new Set(textbooks.filter((t: any) => t.textbook_type === '연산서').map((t: any) => t.student_id))

/** 화면이 보여 줄 「할 일」이 있나. mode=old 는 고치기 전(오늘 수업만), new 는 고친 뒤. */
function todo(sid: string, day: string, mode: 'old' | 'new') {
  const mine = sesOf.get(sid) ?? []
  const ses = mode === 'old'
    ? mine.find((s) => s.session_date === day) ?? null
    : [...mine].reverse().find((s) => s.session_date <= day) ?? null
  const note: any = ses ? noteOf.get(ses.id) ?? null : null
  const ach = note?.textbook_achievement ?? (note?.workbook_done ? 100 : null)
  const ws = (wsOf.get(sid) ?? []).filter((w) => mode === 'old'
    ? String(w.assigned_at ?? '').startsWith(day) && w.status === 'assigned'
    : w.status === 'assigned' && String(w.assigned_at ?? '').slice(0, 10) <= day)
  const 교재 = !!(ses?.hw_textbook_name && (ach === null || ach < 100))
  const 연산 = hasWorkbook.has(sid) && !!ses && !note?.workbook_done
  return ws.length > 0 || 교재 || 연산
}

// ── 미래 수업 — 학생·학부모 화면에 뜨면 안 된다 ────────────────────────────
//    여행 같은 결석을 미리 등록하면 **그 날짜에도 수업 줄이 생긴다**(OPS 결석 연동).
//    거르지 않으면 학생 화면 날짜 띠에 11/25 같은 **미래 날짜가 맨 앞에** 뜨고
//    그게 기본으로 골라진다 (원장님 2026-11-02 「오늘인데 날짜가 왜 저렇게 떠있는거지?」).
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
const future = sessions.filter((c: any) => c.session_date > today)
const futureWho = [...new Set(future.map((c: any) => c.student_id))]
console.log(`\n앞으로 잡혀 있는 수업 줄: ${future.length}건 · 학생 ${futureWho.length}명`
  + (future.length ? ` (${[...new Set(future.map((c: any) => c.session_date))].sort().join(', ')})` : ''))

// ★ 거르는 일은 화면 코드가 한다. 그 줄이 사라지면 조용히 되살아나므로 글자로 지킨다.
const guards: [string, string][] = [
  ['app/student/dashboard/page.tsx', "lte('session_date', todayStr)"],
  ['app/student/assignments/page.tsx', 's.session_date <= todayStr'],
]
let guardFail = 0
for (const [f, needle] of guards) {
  const ok = fs.readFileSync(f, 'utf8').includes(needle)
  console.log(`  ${ok ? '✓' : '✗'} ${f} 가 미래 수업을 거른다`)
  if (!ok) guardFail++
}

console.log(`\n재원생 ${live.length}명 — 날마다 「할 일」이 뜨는 학생 수\n`)
console.log('  날짜          고치기 전   고친 뒤')
let badDays = 0
for (const day of DAYS) {
  const before = live.filter((s: any) => todo(s.id, day, 'old')).length
  const after = live.filter((s: any) => todo(s.id, day, 'new')).length
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(day + 'T00:00:00Z').getUTCDay()]
  if (before === 0) badDays++
  console.log(`  ${day}(${dow})   ${String(before).padStart(5)}명   ${String(after).padStart(5)}명${before === 0 ? '   ← 전원 빈 화면이었다' : ''}`)
}

// ★ 한 명도 못 보는 날이 있으면 **고장**이다. 과제는 수업 없는 날에 하는 것이다.
const 전원빈날 = DAYS.filter((d) => live.filter((s: any) => todo(s.id, d, 'new')).length === 0)
console.log(`\n고친 뒤에도 전원이 빈 화면인 날: ${전원빈날.length}일${전원빈날.length ? ` (${전원빈날.join(', ')})` : '  ✓'}`)
if (badDays) console.log(`고치기 전에 전원이 빈 화면이던 날: ${badDays}일`)
process.exitCode = (전원빈날.length || guardFail) ? 1 : 0
