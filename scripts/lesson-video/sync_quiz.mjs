/**
 * 풀이 대본의 객관식 보기(quiz)를 lesson_videos.quiz 에 넣는다 (원장님 2026-10-24)
 *
 *   node scripts/lesson-video/sync_quiz.mjs [--grade 공통수학2] [--dry]
 *
 * · 대본: docs/대본/<grade>/풀이/*.json 의 "quiz": {"answer", "wrong": [3개]} (없거나 null 이면 비운다 → 「다 풀었어요」)
 * · 짝 찾기: lesson_videos(kind 대표예제)의 title = 「<label> <title>」 (sync_lesson_videos.mjs 가 그렇게 넣는다)
 * · quiz 칸만 바꾼다. 영상·장면·유형 코드는 건드리지 않는다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const args = process.argv.slice(2)
const grade = args.includes('--grade') ? args[args.indexOf('--grade') + 1] : '공통수학2'
const dry = args.includes('--dry')
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const dir = path.join('docs/대본', grade, '풀이')
const { data: rows, error } = await db.from('lesson_videos').select('id, title, quiz').eq('grade', grade).eq('kind', '대표예제')
if (error) throw error
const byTitle = new Map(rows.map((r) => [r.title, r]))

let set = 0, cleared = 0, same = 0
const miss = []
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort()) {
  const S = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const row = byTitle.get(`${S.label} ${S.title}`)
  if (!row) { miss.push(f); continue }
  const q = S.quiz && S.quiz.answer && S.quiz.wrong?.length >= 3 ? { answer: S.quiz.answer, wrong: S.quiz.wrong.slice(0, 3) } : null
  if (JSON.stringify(q) === JSON.stringify(row.quiz ?? null)) { same++; continue }
  if (!dry) {
    const { error: e } = await db.from('lesson_videos').update({ quiz: q }).eq('id', row.id)
    if (e) throw e
  }
  q ? set++ : cleared++
}
console.log(`${dry ? '(dry) ' : ''}보기 넣음 ${set} · 비움 ${cleared} · 그대로 ${same}`)
if (miss.length) console.log('짝 못 찾음:', miss.join(', '))
