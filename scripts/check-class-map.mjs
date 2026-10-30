/**
 * 반배정 시간표를 **글자로 찍어 본다** — 화면에 나올 모양 그대로.
 * 원장님 엑셀과 눈으로 견주려고 만들었다.
 *
 *   node --import ./scripts/ts-resolve.mjs scripts/check-class-map.mjs 박경미
 *   node --import ./scripts/ts-resolve.mjs scripts/check-class-map.mjs --중등부
 *   node --import ./scripts/ts-resolve.mjs scripts/check-class-map.mjs --break   ← 망가뜨려 본다
 *
 * ★ 화면이 실제로 쓰는 그 파일(lib/classMap.ts)을 불러 쓴다.
 * ★ 같이 검사하는 것 — 칸에 넣은 뒤에도
 *     ① 한 칸 안에서 수업이 겹치지 않는다
 *     ② 칸 수 = 그 요일에 가장 많이 겹친 사람 수 (쓸데없이 넓어지지 않는다)
 *     ③ 넣기 전후 수업 수가 같다 (조용히 빠진 학생이 없다)
 *   --break 를 주면 일부러 칸을 하나로 몰아 ①②가 실제로 걸리는지 본다.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { packLanes, toHours, divisionOf } from '../lib/classMap.ts'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const args = process.argv.slice(2)
const BREAK = args.includes('--break')
const wantTeacher = args.find((a) => !a.startsWith('--'))
const wantDiv = args.find((a) => a.startsWith('--') && a !== '--break')?.slice(2)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
async function all(table, cols, build) {
  let out = []
  let from = 0
  for (;;) {
    let qy = db.from(table).select(cols)
    if (build) qy = build(qy)
    const { data, error } = await qy.order('id').range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    out = out.concat(data)
    if (data.length < 1000) break
    from += 1000
  }
  return out
}

const students = await all('students', 'id, name, grade, teacher_name, on_leave', (q) => q.eq('is_active', true))
const schedules = await all('schedules', 'id, student_id, day_of_week, start_time, periods', (q) => q.eq('is_active', true))
const byId = new Map(students.map((s) => [s.id, s]))

const DAYS = ['월', '화', '수', '목', '금', '토', '일']
const main = (t) => String(t ?? '').split(/[,，、·/\s]+/).filter(Boolean)[0] ?? '담당 없음'
const fmt = (t) => `${Math.floor(t)}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`

const slots = []
for (const sc of schedules) {
  const st = byId.get(sc.student_id)
  if (!st) continue
  const start = toHours(sc.start_time)
  slots.push({ st, teacher: main(st.teacher_name), day: sc.day_of_week, start, end: start + (Number(sc.periods) || 1) })
}

const pick = slots.filter((s) =>
  (!wantTeacher || s.teacher === wantTeacher) && (!wantDiv || divisionOf(s.st.grade) === wantDiv))
if (!pick.length) { console.log('맞는 시간표가 없어요.'); process.exit(0) }

let bad = 0
for (const teacher of [...new Set(pick.map((s) => s.teacher))].sort((a, b) => a.localeCompare(b, 'ko'))) {
  console.log(`\n═══ ${teacher} 선생님 ${wantDiv ? `· ${wantDiv}` : ''} ═══`)
  for (const day of DAYS) {
    const arr = pick.filter((s) => s.teacher === teacher && s.day === day)
    if (!arr.length) continue
    let { slots: laid, lanes } = packLanes(arr, (s) => s.st.name)
    if (BREAK) { laid = laid.map((s) => ({ ...s, lane: 0 })); lanes = 1 }

    // ① 한 칸 안에서 겹치지 않는가
    for (let L = 0; L < lanes; L++) {
      const inLane = laid.filter((s) => s.lane === L).sort((a, b) => a.start - b.start)
      for (let i = 1; i < inLane.length; i++) {
        if (inLane[i].start < inLane[i - 1].end) {
          console.log(`  ✗ ${day} ${L + 1}번 칸이 겹칩니다: ${inLane[i - 1].st.name}(~${fmt(inLane[i - 1].end)}) / ${inLane[i].st.name}(${fmt(inLane[i].start)}~)`)
          bad++
        }
      }
    }
    // ② 칸 수 = 가장 많이 겹친 사람 수
    const edges = [...new Set(arr.flatMap((s) => [s.start, s.end]))].sort((a, b) => a - b)
    const peak = Math.max(...edges.map((t) => arr.filter((s) => s.start <= t && t < s.end).length))
    if (lanes !== peak) { console.log(`  ✗ ${day} 칸 수 ${lanes} ≠ 가장 많이 겹친 사람 ${peak}`); bad++ }
    // ③ 넣기 전후 수업 수가 같은가
    if (laid.length !== arr.length) { console.log(`  ✗ ${day} 수업이 ${arr.length}→${laid.length} 로 바뀜`); bad++ }

    console.log(`  ── ${day} (${new Set(arr.map((s) => s.st.id)).size}명 · 칸 ${lanes}개) ──`)
    for (let L = 0; L < lanes; L++) {
      const inLane = laid.filter((s) => s.lane === L).sort((a, b) => a.start - b.start)
      console.log(`   ${String(L + 1).padStart(2)}| ` + inLane
        .map((s) => `${s.st.name}(${s.st.grade}) ${fmt(s.start)}~${fmt(s.end)}${s.st.on_leave ? ' 휴' : ''}`)
        .join('  →  '))
    }
  }
}

console.log(bad === 0 ? '\n✓ 칸 나누기 이상 없음' : `\n✗ 어긋남 ${bad}건`)
process.exit(bad === 0 ? 0 : 1)
