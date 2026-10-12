/**
 * 적중 대조 결과를 「이너프원 매칭」에 넣는다 — 교재 · 세트 번호 · 문항 번호로 바로 잇는 판.
 * (add-matches.mjs 는 단원 이름으로 잇는데, 단원 이름이 빈 세트가 한 교재에 둘 있으면 못 잇는다)
 *
 *   node scripts/exam-paper/add-matches-by-set.mjs <시험지 id> <matches.json …> [--go]
 *
 * matches.json: { "matches": [ { "no": "3", "book": "중2 하", "set": 1, "pno": 31, "level": "매우 유사", "memo": "…" } ] }
 *   book = 자른 폴더 이름 (중2 상 / 중2 중 / 중2 하 / 신원중3 1권 A …). 여러 파일을 한꺼번에 줄 수 있다.
 * 같은 (기출 번호 · 이너프원 문항)이 이미 있으면 건너뛴다. 「블로그 사용」은 건드리지 않는다.
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
const args = process.argv.slice(2).filter((a) => a !== '--go')
const GO = process.argv.includes('--go')
const [paperId, ...files] = args
if (!paperId || !files.length) { console.error('쓰는 법: node scripts/exam-paper/add-matches-by-set.mjs <시험지 id> <matches.json …> [--go]'); process.exit(1) }
const BOOK = {
  '중2 상': '이너프원 중2 상', '중2 중': '이너프원 중2 중', '중2 하': '이너프원 중2 하',
  '신원중3 1권 A': '이너프원 신원중3 1권 (중)', '신원중3 1권 B': '이너프원 신원중3 1권 (상)',
  '신원중3 2권 A': '이너프원 신원중3 2권 (중)', '신원중3 2권 B': '이너프원 신원중3 2권 (상)',
  '타학교중3 1권': '이너프원 타학교 중3 1권', '타학교중3 2권': '이너프원 타학교 중3 2권',
  '고1 공수2 S반': '이너프원 고1 공수2 S반', '고1 미래엔 평가': '교과서 평가문제 미래엔 공통수학2', '고1 천재전 평가': '교과서 평가문제 천재(전) 공통수학2',
  '고1 미래엔 교과서': '교과서 문제 미래엔 공통수학2', '고1 천재전 교과서': '교과서 문제 천재(전) 공통수학2',
}
const LEVELS = ['쌍둥이', '매우 유사', '유형 유사', '참고']
// 번호는 「09」처럼 적혀 와도 「9」로 맞춘다
const matches = files.flatMap((f) => JSON.parse(fs.readFileSync(f, 'utf8')).matches).map((m) => ({ ...m, no: /^\d+$/.test(String(m.no)) ? String(Number(m.no)) : String(m.no) }))
for (const m of matches) if (!LEVELS.includes(m.level) || !BOOK[m.book]) { console.error('잘못된 줄:', m); process.exit(1) }

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const { data: paper } = await supabase.from('exam_papers').select('id, school_name, grade').eq('id', paperId).maybeSingle()
if (!paper) { console.error('시험지를 찾을 수 없습니다.'); process.exit(1) }
const { data: qs } = await supabase.from('exam_questions').select('id, question_no').eq('paper_id', paperId)
const qid = new Map((qs ?? []).map((q) => [String(q.question_no), q.id]))
const { data: had } = await supabase.from('exam_enough_matches').select('question_no, enough_problem_id').eq('paper_id', paperId)
const seen = new Set((had ?? []).map((h) => `${h.question_no}|${h.enough_problem_id}`))

const rows = []
for (const m of matches) {
  const { data: p } = await supabase.from('enough_problems').select('id, unit')
    .eq('edition', '2026-2학기').eq('book', BOOK[m.book]).eq('set_no', Number(m.set)).eq('problem_no', Number(m.pno)).maybeSingle()
  if (!p) { console.error(`이너프원 문항을 찾지 못했습니다: ${m.book} 세트 ${m.set} · ${m.pno}번`); process.exit(1) }
  if (!qid.has(String(m.no))) { console.error(`기출 ${m.no}번 문항이 없습니다.`); process.exit(1) }
  rows.push({ paper_id: paperId, question_id: qid.get(String(m.no)), question_no: String(m.no), enough_book: BOOK[m.book],
    enough_unit: p.unit || `세트 ${m.set}`, enough_problem_no: String(m.pno), enough_problem_id: p.id,
    match_level: m.level, memo: m.memo ?? null, created_by: 'Claude(적중 대조)' })
}
const best = {}
for (const r of rows) if (!(r.question_no in best) || LEVELS.indexOf(r.match_level) < LEVELS.indexOf(best[r.question_no])) best[r.question_no] = r.match_level
const total = (qs ?? []).length
const hit = Object.values(best).filter((l) => l !== '참고').length
const cnt = (l) => Object.values(best).filter((v) => v === l).length
console.log(`${paper.school_name} ${paper.grade}: 매칭 ${rows.length}건 · 적중 ${hit}/${total}문항 (${Math.round((hit / total) * 100)}%) — 쌍둥이 ${cnt('쌍둥이')} · 매우 유사 ${cnt('매우 유사')} · 유형 유사 ${cnt('유형 유사')}`)
console.log('적중 아님:', (qs ?? []).map((q) => String(q.question_no)).filter((n) => !best[n] || best[n] === '참고').sort((a, b) => a - b).join(', ') || '없음')
if (!GO) { console.log('(--go 를 붙이지 않아 아무것도 바꾸지 않았습니다)'); process.exit(0) }
let added = 0
for (const r of rows) {
  if (seen.has(`${r.question_no}|${r.enough_problem_id}`)) continue
  const { error } = await supabase.from('exam_enough_matches').insert(r)
  if (error) { console.error('넣기 실패', r, error.message); process.exit(1) }
  added++
}
console.log(`${added}건 넣음 (이미 있던 ${rows.length - added}건은 건너뜀)`)
