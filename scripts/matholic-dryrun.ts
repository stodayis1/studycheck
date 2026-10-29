/**
 * 매쓰홀릭 붙여넣기를 **운영 DB 에 대고 읽기만** 해서, 넣으면 어떻게 되는지 미리 본다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/matholic-dryrun.ts <붙여넣은글자.txt>
 *
 * ★ 한 줄도 쓰지 않는다. select 만 한다. 화면(app/teacher/assignments/matholic)과
 *   **같은 함수**(lib/matholic.ts)를 쓴다 — 베껴 쓴 사본으로 확인하면 화면과 달라진다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { parseMatholic, findStudents, rankWorksheets, isClearWinner, alreadyIn, isDailyTest } from '../lib/matholic'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } })

const file = process.argv[2]
if (!file) { console.error('붙여넣은 글자를 담은 파일 경로를 주세요.'); process.exit(1) }
const text = fs.readFileSync(path.resolve(file), 'utf8')

const res = parseMatholic(text)
console.log(`읽은 건수 ${res.rows.length} · 이력 없는 학생 ${res.empty.length}명(${res.empty.join(', ')}) · 못 읽은 줄 ${res.skipped.length}`)
res.skipped.forEach((s) => console.log(`  ✗ ${s.line}번째 줄: ${s.text} (${s.why})`))

const { data: students } = await db.from('students')
  .select('id, name, grade, teacher_name').or('is_active.eq.true,on_leave.eq.true')
const all = students ?? []

const found = res.rows.map((r) => findStudents(r.student, all as any))
const ids = [...new Set(found.flat().map((s: any) => s.id))]
const { data: ws } = await db.from('student_worksheets')
  .select('id, student_id, grade_level, unit, unit_name, current_level, worksheet_type, status, score, assigned_at, submitted_at')
  .in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
const byStudent = new Map<string, any[]>()
for (const w of ws ?? []) {
  const arr = byStudent.get(w.student_id) ?? []; arr.push(w); byStudent.set(w.student_id, arr)
}

const dates = [...new Set(res.rows.filter(isDailyTest).map((r) => r.date))]
const { data: ses } = await db.from('class_sessions')
  .select('id, student_id, session_date, daily_test_score')
  .in('student_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000'])
  .in('session_date', dates.length ? dates : ['1900-01-01'])
const bySession = new Map((ses ?? []).map((c: any) => [`${c.student_id}|${c.session_date}`, c]))

let daily = 0, fill = 0, neo = 0, ask = 0, none = 0, dup = 0
console.log('')
res.rows.forEach((row, i) => {
  const cand = found[i]
  const head = `${row.student.padEnd(6)} ${row.date} ${String(row.score).padStart(3)}점  ${row.title.slice(0, 38).padEnd(38)}`
  if (cand.length === 0) { none++; console.log(`${head} → ✗ 그 이름의 학생이 없어요`); return }
  if (cand.length > 1) {
    ask++
    console.log(`${head} → ❓ 같은 이름 ${cand.length}명 (${cand.map((s: any) => `${s.grade}/${s.teacher_name}`).join(', ')}) — 사람이 골라야`)
    return
  }
  const sid = (cand[0] as any).id
  if (isDailyTest(row)) {
    const c = bySession.get(`${sid}|${row.date}`)
    if (!c) { none++; console.log(`${head} → ✗ 학습일지(수업기록)가 없어요 — 데일리테스트를 적을 데가 없음`); return }
    if (c.daily_test_score === row.score) { dup++; console.log(`${head} → ◦ 학습일지에 이미 ${c.daily_test_score}점`); return }
    daily++
    console.log(`${head} → ◆ 학습일지 데일리테스트${c.daily_test_score == null ? ' (비어 있음)' : ` (지금 ${c.daily_test_score}점 → 바꿈)`}`)
    return
  }
  const list = byStudent.get(sid) ?? []
  if (list.find((w) => alreadyIn(row, w as any))) { dup++; console.log(`${head} → ◦ 이미 들어가 있어요`); return }
  const ranked = rankWorksheets(row, list as any)
  if (isClearWinner(ranked)) {
    fill++
    console.log(`${head} → ✎ 점수 채우기: ${ranked[0].ws.unit_name} (${ranked[0].why.join(' · ')})`)
  } else {
    neo++
    console.log(`${head} → ＋ 새로 만들기 (붙일 학습지 ${list.length}건 중 맞는 것 없음)`)
  }
})

console.log(`\n학습일지 데일리테스트 ${daily} · 학습지 점수 채우기 ${fill} · 학습지 새로 만들기 ${neo} · 사람이 골라야 ${ask} · 못 넣음 ${none} · 이미 들어감 ${dup}`)
console.log('※ 이 스크립트는 한 줄도 쓰지 않았습니다.')
