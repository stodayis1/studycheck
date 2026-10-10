/**
 * 스터디체크 「블로그 글 작성 요청」 버튼 ↔ Claude 사이의 줄 세우기.
 *
 *   node scripts/exam-blog/queue.mjs list                  기다리는 요청 목록 (kind: match 적중 대조 · cards 카드뉴스 · blog 블로그 글)
 *   node scripts/exam-blog/queue.mjs put-analysis <id> <analysis.json>   카드뉴스 글을 스터디체크에 올린다
 *   (done · fail 에 --kind match|cards|blog 를 붙인다. 없으면 blog)
 *   node scripts/exam-blog/queue.mjs pull <시험지 id>      글 쓸 재료를 <시험 폴더>/blog/ 에 모은다 (source.json + 문제·손풀이 그림)
 *   node scripts/exam-blog/queue.mjs done <시험지 id> [메모]   임시저장까지 끝났다고 표시
 *   node scripts/exam-blog/queue.mjs fail <시험지 id> <이유>   못 썼다고 표시 (화면에 이유가 보인다. 버튼을 다시 누르면 다시 시도)
 *
 * 버튼은 exam_papers.blog_status='작성중', tasks.blog_requested_at=<시각> 을 남긴다.
 * 여기서는 tasks 의 blog_drafted_at / blog_failed_at / blog_auto_note 만 고친다 — 다른 칸은 건드리지 않는다.
 * 순서 전체는 scripts/exam-blog/README.md.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const [cmd, id, ...rest] = process.argv.slice(2)
const BANK = process.env.EXAM_BANK_DIR || 'C:/Users/USER/문제은행/기출'
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const LEVELS = ['쌍둥이', '매우 유사', '유형 유사', '참고']
const normNo = (s) => String(s ?? '').trim().replace(/^객관식\s*/, '').replace(/[.)번\s]+$/g, '')
const folderOf = (p) => path.join(BANK, `${p.exam_year}_${p.term}학기${p.exam_type === '기말고사' ? '기말' : '중간'}_${p.school_name}_${p.grade}`)
const die = (msg) => { console.error(msg); process.exit(1) }

async function getPaper() {
  if (!id) die('시험지 id 를 적어 주세요.')
  const { data, error } = await supabase.from('exam_papers').select('*').eq('id', id).maybeSingle()
  if (error || !data) die('시험지를 찾을 수 없습니다: ' + (error?.message ?? id))
  return data
}
async function setTasks(paper, patch) {
  const { error } = await supabase.from('exam_papers').update({ tasks: { ...(paper.tasks ?? {}), ...patch }, updated_at: new Date().toISOString() }).eq('id', paper.id)
  if (error) die('표시 실패: ' + error.message)
}
async function download(bucket, from, to) {
  const { data, error } = await supabase.storage.from(bucket).download(from)
  if (error || !data) return false
  fs.writeFileSync(to, Buffer.from(await data.arrayBuffer()))
  return true
}

// 요청 세 가지: 버튼이 남기는 칸과 Claude 가 끝내고 남기는 칸
const KINDS = {
  match: { label: '적중 대조', req: 'match_requested_at', ok: 'match_done_at', ng: 'match_failed_at', note: 'match_note', done: '적중 대조를 넣었습니다.' },
  cards: { label: '카드뉴스', req: 'cards_requested_at', ok: 'cards_done_at', ng: 'cards_failed_at', note: 'cards_note', done: '카드뉴스를 만들었습니다. 글은 「글 고치기」로 고칠 수 있습니다.' },
  blog: { label: '블로그 글', req: 'blog_requested_at', ok: 'blog_drafted_at', ng: 'blog_failed_at', note: 'blog_auto_note', done: '네이버 블로그에 임시저장했습니다. 확인하고 발행해 주세요.' },
}
// --kind match|cards|blog (없으면 blog — 예전 쓰는 법 그대로)
const kindArg = (() => { const i = rest.indexOf('--kind'); if (i < 0) return 'blog'; const k = rest[i + 1]; rest.splice(i, 2); return k })()
if (!KINDS[kindArg]) die('--kind 는 match · cards · blog 중 하나입니다.')

if (cmd === 'list') {
  const { data, error } = await supabase.from('exam_papers').select('id, exam_year, term, exam_type, school_name, grade, tasks, blog_status')
  if (error) die(error.message)
  const waiting = []
  for (const p of data ?? []) {
    const t = p.tasks ?? {}
    for (const [kind, K] of Object.entries(KINDS)) {
      if (!t[K.req]) continue
      if (kind === 'blog' && p.blog_status !== '작성중') continue
      const handled = [t[K.ok], t[K.ng]].filter(Boolean).sort().pop()
      if (handled && handled >= t[K.req]) continue
      waiting.push({ kind, what: K.label, id: p.id, name: `${p.school_name} ${p.grade} ${p.exam_year} ${p.term}학기 ${p.exam_type}`, requested_at: t[K.req], folder: folderOf(p) })
    }
  }
  // 같은 시험이면 적중 대조 → 카드뉴스 → 블로그 순서로 (앞의 것이 뒤의 재료다)
  const order = ['match', 'cards', 'blog']
  waiting.sort((x, y) => x.id === y.id ? order.indexOf(x.kind) - order.indexOf(y.kind) : x.requested_at.localeCompare(y.requested_at))
  console.log(JSON.stringify(waiting, null, 1))
} else if (cmd === 'pull') {
  const paper = await getPaper()
  const dir = path.join(folderOf(paper), 'blog')
  fs.mkdirSync(dir, { recursive: true })
  const [{ data: qs }, { data: files }, { data: matches }] = await Promise.all([
    supabase.from('exam_questions').select('id, question_no, sort_order, q_type, answer, unit_name, sub_unit_name, type_code, level, difficulty, is_discriminating, problem_id, source_memo').eq('paper_id', paper.id).order('sort_order'),
    supabase.from('exam_paper_files').select('kind, file_name, storage_path, question_label').eq('paper_id', paper.id),
    supabase.from('exam_enough_matches').select('question_no, enough_book, enough_unit, enough_problem_no, match_level, memo').eq('paper_id', paper.id),
  ])
  const questions = qs ?? []
  // 변별문항: 선생님이 「정답·변별·손풀이」에 적은 번호가 기준. 비어 있을 때만 문항에 표시된 것을 쓴다
  const picked = (paper.discriminating_nos ?? []).length ? paper.discriminating_nos : questions.filter((q) => q.is_discriminating).map((q) => q.question_no)
  // 선생님마다 적는 법이 다르다 (「20/22」 「객관식6」) → 쪼개서 번호만 남긴다 (lib/examAnalysis.ts discNos 와 같은 규칙)
  const killers = Array.from(new Set(picked.flatMap((x) => String(x).split(/[\/,·\s]+/)).map(normNo).filter((n) => questions.some((q) => normNo(q.question_no) === n))))

  // 적중: 문항마다 가장 높은 매칭 하나만. 「참고」는 적중이 아니다 (lib/examAnalysis.ts hitSummary 와 같은 규칙)
  const nos = questions.map((q) => normNo(q.question_no))
  const best = {}
  for (const m of matches ?? []) {
    const no = normNo(m.question_no)
    if (!no || !nos.includes(no)) continue
    if (!(no in best) || LEVELS.indexOf(m.match_level) < LEVELS.indexOf(best[no])) best[no] = m.match_level
  }
  const hitNos = Object.keys(best).filter((no) => best[no] !== '참고')
  const cnt = (l) => Object.values(best).filter((v) => v === l).length
  const hit = { total: nos.length, hit: hitNos.length, rate: nos.length ? Math.round((hitNos.length / nos.length) * 100) : null, twin: cnt('쌍둥이'), very: cnt('매우 유사'), type: cnt('유형 유사'), missNos: nos.filter((n) => !hitNos.includes(n)) }

  // 변별문항 그림 (문제) — 시험 폴더에 잘라 둔 것이 있으면 그걸, 없으면 문제은행 보관함에서
  const images = {}
  for (const no of killers) {
    const q = questions.find((x) => normNo(x.question_no) === no)
    const local = path.join(folderOf(paper), `${String(no).padStart(2, '0')}.png`)
    if (fs.existsSync(local)) images[no] = `../${path.basename(local)}`
    else if (q && await download('problem-images', `exam/${paper.id}/${q.id}.png`, path.join(dir, `question_${no}.png`))) images[no] = `question_${no}.png`
  }
  // 손풀이 그림
  const solutions = {}
  for (const f of (files ?? []).filter((x) => x.kind === '손풀이')) {
    const no = normNo(f.question_label || (f.file_name.match(/(\d+)\s*번/) ?? [])[1])
    if (!no) continue
    const name = `solution_${String(no).padStart(2, '0')}${path.extname(f.file_name).toLowerCase() || '.png'}`
    if (await download('exam-analysis', f.storage_path, path.join(dir, name))) solutions[no] = name
  }

  const missing = []
  if (!questions.length) missing.push('문항이 아직 문제은행에 들어가지 않았습니다 (한글→PDF 를 잘라 넣는 작업이 먼저)')
  if (!killers.length) missing.push('변별문항이 선정되지 않았습니다')
  for (const no of killers) {
    if (!images[no]) missing.push(`${no}번 문제 그림이 없습니다`)
    if (!solutions[no]) missing.push(`${no}번 손풀이가 없습니다`)
  }
  if (!paper.review_difficulty) missing.push('총평: 전체 난이도가 비어 있습니다')
  if (!paper.review_next_points) missing.push('총평: 다음 시험 대비 포인트가 비어 있습니다')
  if (!(paper.review_units || paper.review_hard_types || paper.review_blog_summary)) missing.push('총평 내용이 비어 있습니다')
  if (!(matches ?? []).length) missing.push('이너프원 적중 대조가 아직 없습니다')

  const source = {
    paper: {
      id: paper.id, school: paper.school_name, grade: paper.grade, year: paper.exam_year, term: paper.term, exam_type: paper.exam_type,
      scope: paper.exam_scope, teacher: paper.assignee, answers_text: paper.answers_text,
      review: { difficulty: paper.review_difficulty, units: paper.review_units, hard_types: paper.review_hard_types, mistakes: paper.review_mistakes, next_points: paper.review_next_points, blog_summary: paper.review_blog_summary },
      blog_note: paper.blog_note, requested_at: paper.tasks?.blog_requested_at,
    },
    killers, images, solutions, hit,
    matches: (matches ?? []).filter((m) => m.match_level !== '참고'),
    questions: questions.map((q) => ({ no: q.question_no, type: q.q_type, unit: q.unit_name, sub_unit: q.sub_unit_name, level: q.level, difficulty: q.difficulty, answer: q.answer })),
    missing,
  }
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify(source, null, 1))
  // 스터디체크 화면(「블로그」 탭 → 카드뉴스 만들기)에서 이미 만든 글이 있으면 그걸 쓴다 — 원장님이 고친 글이다
  const madeInApp = await download('exam-analysis', `blog/${paper.id}/analysis.json`, path.join(dir, 'analysis.app.json'))
  console.log(JSON.stringify({ dir, questions: questions.length, killers, images, solutions, hit, missing, analysisFromApp: madeInApp ? 'analysis.app.json' : null }, null, 1))
} else if (cmd === 'put-analysis') {
  // 카드뉴스 글(analysis)을 스터디체크에 올린다 → 「블로그」 탭의 카드뉴스 칸이 이 글로 카드를 그린다
  const paper = await getPaper()
  const file = rest[0]
  if (!file || !fs.existsSync(file)) die('쓰는 법: queue.mjs put-analysis <시험지 id> <analysis.json>')
  const A = JSON.parse(fs.readFileSync(file, 'utf8'))
  for (const k of A.killers ?? []) {
    if (!/^q:/.test(k.image ?? '')) die(`${k.no}번: image 는 "q:${k.no}" 모양이어야 합니다 (화면이 그림을 찾는 열쇠)`)
    if (k.solution && !/^s:/.test(k.solution)) die(`${k.no}번: solution 은 "s:${k.no}" 모양이어야 합니다`)
    if ((k.steps ?? []).length !== 4) die(`${k.no}번: steps 는 4개여야 합니다 (카드 칸이 4개다)`)
  }
  const up = await supabase.storage.from('exam-analysis').upload(`blog/${paper.id}/analysis.json`, Buffer.from(JSON.stringify(A)), { contentType: 'application/octet-stream', upsert: true })
  if (up.error) die('올리기 실패: ' + up.error.message)
  console.log(`${paper.school_name} ${paper.grade}: 카드뉴스 글을 올렸습니다 (변별문항 ${(A.killers ?? []).map((k) => k.no).join(', ')}번)`)
} else if (cmd === 'done' || cmd === 'fail') {
  const paper = await getPaper()
  const K = KINDS[kindArg]
  const note = rest.join(' ').trim()
  if (cmd === 'fail' && !note) die('이유를 적어 주세요.')
  const now = new Date().toISOString()
  await setTasks(paper, cmd === 'done' ? { [K.ok]: now, [K.ng]: null, [K.note]: note || K.done } : { [K.ng]: now, [K.note]: note })
  console.log(`${paper.school_name} ${paper.grade} · ${K.label}: ${cmd === 'done' ? '끝남' : '실패'} 표시함`)
} else {
  die('쓰는 법: node scripts/exam-blog/queue.mjs list | pull <id> | put-analysis <id> <analysis.json> | done <id> [--kind match|cards|blog] [메모] | fail <id> [--kind …] <이유>')
}
