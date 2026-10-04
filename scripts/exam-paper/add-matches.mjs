/**
 * 적중 대조 결과(기출 문항 ↔ 이너프원 문항)를 시험지 분석의 「이너프원 매칭」에 넣는다.
 *
 *   node scripts/exam-paper/add-matches.mjs <matches.json> [--go]
 *
 * matches.json
 *   { "paper": { "exam_year": 2026, "term": 2, "exam_type": "중간고사", "school_name": "도래울중", "grade": "중3" },
 *     "matches": [ { "no": "3", "book": "이너프원 타학교 중3 2권", "unit": "대푯값과 산포도 3회차", "pno": "27",
 *                    "level": "쌍둥이", "memo": "…" }, … ] }
 *
 * 같은 (기출 번호 · 교재 · 단원 · 문항번호)가 이미 있으면 건너뛴다 → 여러 번 돌려도 겹치지 않는다.
 * 「블로그 사용」은 건드리지 않는다 (원장님이 정한다).
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const file = process.argv[2]
const GO = process.argv.includes('--go')
if (!file) { console.error('쓰는 법: node scripts/exam-paper/add-matches.mjs <matches.json> [--go]'); process.exit(1) }
const { paper: key, matches } = JSON.parse(fs.readFileSync(file, 'utf8'))
const LEVELS = ['쌍둥이', '매우 유사', '유형 유사', '참고']
for (const m of matches) if (!LEVELS.includes(m.level)) { console.error('매칭 정도가 잘못됐습니다:', m); process.exit(1) }

const best = {}
for (const m of matches) if (!(m.no in best) || LEVELS.indexOf(m.level) < LEVELS.indexOf(best[m.no])) best[m.no] = m.level
const hit = Object.values(best).filter((l) => l !== '참고').length
console.log(`${key.school_name} ${key.grade}: 매칭 ${matches.length}건 · 기출 ${Object.keys(best).length}문항 · 적중(유형 유사 이상) ${hit}문항`)
if (!GO) { console.log('(--go 를 붙이지 않아 아무것도 바꾸지 않았습니다)'); process.exit(0) }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: paper } = await supabase.from('exam_papers').select('id').match(key).maybeSingle()
if (!paper) { console.error('시험지를 찾을 수 없습니다.'); process.exit(1) }
const { data: qs } = await supabase.from('exam_questions').select('id, question_no').eq('paper_id', paper.id)
const qid = new Map((qs ?? []).map((q) => [String(q.question_no), q.id]))
const { data: had } = await supabase.from('exam_enough_matches').select('question_no, enough_book, enough_unit, enough_problem_no').eq('paper_id', paper.id)
const seen = new Set((had ?? []).map((h) => [h.question_no, h.enough_book, h.enough_unit, h.enough_problem_no].join('|')))

let added = 0
for (const m of matches) {
  const k = [m.no, m.book, m.unit, m.pno].join('|')
  if (seen.has(k)) continue
  const { error } = await supabase.from('exam_enough_matches').insert({
    paper_id: paper.id, question_id: qid.get(String(m.no)) ?? null, question_no: String(m.no),
    enough_book: m.book, enough_unit: m.unit, enough_problem_no: String(m.pno),
    match_level: m.level, memo: m.memo ?? null, created_by: 'Claude(적중 대조)',
  })
  if (error) { console.error('넣기 실패', m, error.message); process.exit(1) }
  added++
}
console.log(`${added}건 넣음 (이미 있던 ${matches.length - added}건은 건너뜀)`)
