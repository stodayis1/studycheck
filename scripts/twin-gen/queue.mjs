/**
 * 스터디체크 「쌍둥이 만들기 요청」 ↔ Claude 사이의 줄 (표: twin_requests).
 * 순서 전체는 scripts/twin-gen/README.md.
 *
 *   node scripts/twin-gen/queue.mjs list                 기다리는 요청 (대기 · 확인대기)
 *   node scripts/twin-gen/queue.mjs pull [--limit 20]    대기 요청의 문제·정답·해설 그림을 work/<문항id>/ 로 받는다
 *   node scripts/twin-gen/queue.mjs put [id,id…]         원장님 확인 뒤: out/twins.json + out/bake/ 를 문제은행에 넣는다
 *   node scripts/twin-gen/queue.mjs fail <문항id> <이유>  못 만든다고 표시 (화면·목록에 이유가 보인다)
 *
 * 넣는 값: book='쌍둥이', 학년·단원·유형·레벨·난이도는 원래 문항 그대로, twin_group 은 원래 문항의 묶음.
 * → 재출제(쌍둥이 문제) · 교재연계 · 답지가 화면을 고치지 않고 바로 집어 간다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const HERE = path.dirname(fileURLToPath(import.meta.url))
const WORK = path.join(HERE, 'work')
const OUT = path.join(HERE, 'out')
const BUCKET = 'problem-images'
const TWIN_BOOK = '쌍둥이'          // lib/twinRequests.ts 와 같아야 한다
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const [cmd, ...rest] = process.argv.slice(2)
const die = (msg) => { console.error(msg); process.exit(1) }
const now = () => new Date().toISOString()
const label = (p) => `${p.book} ${p.grade}-${p.semester} ${p.sub_chapter_title} ${p.local_no}번`

async function download(from, to) {
  const { data, error } = await supabase.storage.from(BUCKET).download(from)
  if (error || !data) return false
  fs.writeFileSync(to, Buffer.from(await data.arrayBuffer()))
  return true
}

async function requests(statuses, limit = 1000) {
  const { data, error } = await supabase.from('twin_requests')
    .select('id, problem_id, status, reason, source, requested_by_name, requested_at, problems(id, book, grade, semester, sub_chapter_title, local_no, type_code, answer_kind, answer_text, image_path, answer_image_path, solution_image_path)')
    .in('status', statuses).order('requested_at').limit(limit)
  if (error) die(error.message)
  return data ?? []
}

if (cmd === 'list') {
  const rows = await requests(['대기', '확인대기'])
  const tpl = new Set(fs.existsSync(path.join(HERE, 'templates')) ? fs.readdirSync(path.join(HERE, 'templates')) : [])
  console.log(JSON.stringify(rows.map((r) => ({
    problem_id: r.problem_id, status: r.status, source: r.source, by: r.requested_by_name,
    what: r.problems ? label(r.problems) : '(문항 없음)', type: r.problems?.type_code,
    template: tpl.has(`t${r.problem_id}.py`),
  })), null, 1))
  console.log(`\n  대기 ${rows.filter((r) => r.status === '대기').length} · 확인대기 ${rows.filter((r) => r.status === '확인대기').length}`)
} else if (cmd === 'pull') {
  const i = rest.indexOf('--limit')
  const limit = i >= 0 ? Number(rest[i + 1]) : 20
  const rows = await requests(['대기'], limit)
  fs.mkdirSync(WORK, { recursive: true })
  for (const r of rows) {
    const p = r.problems
    if (!p) continue
    const dir = path.join(WORK, String(p.id))
    fs.mkdirSync(dir, { recursive: true })
    const ext = (s) => path.extname(s || '') || '.png'
    const got = {
      q: p.image_path && await download(p.image_path, path.join(dir, `q${ext(p.image_path)}`)) ? `q${ext(p.image_path)}` : null,
      a: p.answer_image_path && await download(p.answer_image_path, path.join(dir, `a${ext(p.answer_image_path)}`)) ? `a${ext(p.answer_image_path)}` : null,
      s: p.solution_image_path && await download(p.solution_image_path, path.join(dir, `s${ext(p.solution_image_path)}`)) ? `s${ext(p.solution_image_path)}` : null,
    }
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ ...p, label: label(p), files: got }, null, 1))
    console.log(`  ${p.id}  ${label(p)}  ${p.type_code}  정답 ${p.answer_text ?? '(그림)'}  → ${path.relative(process.cwd(), dir)}  ${got.q ? '' : '⚠ 문제 그림 없음'}`)
  }
  console.log(`\n  ${rows.length}문항 받음. 그림을 읽고 templates/t<문항id>.py 를 쓴 뒤 run.py → bake.mjs`)
} else if (cmd === 'fail') {
  const [pid, ...why] = rest
  if (!pid || !why.length) die('쓰는 법: queue.mjs fail <문항id> <이유>')
  const { error } = await supabase.from('twin_requests').update({ status: '실패', reason: why.join(' '), done_at: now() }).eq('problem_id', pid)
  if (error) die(error.message)
  console.log(`  ${pid} 실패로 표시: ${why.join(' ')}`)
} else if (cmd === 'put') {
  // 원장님이 미리보기(out/preview.html)를 보고 「넣어」라고 한 뒤에만 부른다
  const file = path.join(OUT, 'twins.json')
  if (!fs.existsSync(file)) die('out/twins.json 이 없습니다. run.py → bake.mjs 부터.')
  const only = rest[0] ? new Set(rest[0].split(',').map(Number)) : null
  const reports = JSON.parse(fs.readFileSync(file, 'utf8')).filter((r) => !r.error && r.twins.length && (!only || only.has(r.origin)))
  let total = 0
  for (const r of reports) {
    const { data: o, error: oe } = await supabase.from('problems').select('*').eq('id', r.origin).maybeSingle()
    if (oe || !o) { console.error(`  ${r.origin} 원래 문항을 못 찾음 — 건너뜀`); continue }
    // 묶음 번호가 없는 문항이면 자기 id 로 묶음을 연다 (쌍둥이를 찾는 열쇠)
    let group = o.twin_group
    if (!group) {
      group = o.id
      const { error } = await supabase.from('problems').update({ twin_group: group }).eq('id', o.id)
      if (error) die(error.message)
    }
    let made = 0
    for (const [i, t] of r.twins.entries()) {
      const n = i + 1
      const q = path.join(OUT, 'bake', `${r.origin}_${n}.png`)
      const s = path.join(OUT, 'bake', `${r.origin}_${n}_s.png`)
      if (!fs.existsSync(q)) { console.error(`  ${r.origin}-${n} 구운 그림 없음 — bake.mjs 를 먼저`); continue }
      const base = `twin/${r.origin}/${n}`
      const up = async (p, f) => (await supabase.storage.from(BUCKET).upload(p, fs.readFileSync(f), { contentType: 'image/png', upsert: true })).error
      let e = await up(`${base}.png`, q)
      if (e) die(`그림 저장 실패: ${e.message}`)
      const hasSol = fs.existsSync(s)
      if (hasSol && (e = await up(`${base}_s.png`, s))) die(`풀이 그림 저장 실패: ${e.message}`)
      const key = `twin:${r.origin}:${n}`
      const row = {
        book: TWIN_BOOK,
        grade: o.grade, semester: o.semester, sub_chapter_no: o.sub_chapter_no, sub_chapter_title: o.sub_chapter_title,
        local_no: `${o.book}${o.local_no}-${n}`,                  // 쎈861-1
        type_code: o.type_code, level: o.level, difficulty: o.difficulty, step: o.step,
        is_essay: o.is_essay, is_important: o.is_important,
        answer_kind: t.bank.kind, answer_text: t.bank.text,
        image_path: `${base}.png`,
        solution_image_path: hasSol ? `${base}_s.png` : null,
        twin_group: group,
        source_key: key,
        source_meta: { source_type: 'twin_gen', origin_id: o.id, origin_label: label(o), template: `t${r.origin}.py`, params: t.params, made_at: now() },
      }
      const { data: ex } = await supabase.from('problems').select('id').eq('source_key', key).maybeSingle()
      const res = ex
        ? await supabase.from('problems').update(row).eq('id', ex.id)
        : await supabase.from('problems').insert(row)
      if (res.error) die(`${key} 넣기 실패: ${res.error.message}`)
      made++
    }
    await supabase.from('twin_requests').upsert(
      { problem_id: r.origin, status: '반영완료', reason: null, done_at: now(), made_count: made },
      { onConflict: 'problem_id' },
    )
    total += made
    console.log(`  ${r.origin}  ${label(o)}  쌍둥이 ${made}개 넣음 (묶음 ${group})`)
  }
  console.log(`\n  ${reports.length}문항 · 쌍둥이 ${total}개 반영`)
} else {
  die('쓰는 법: queue.mjs list | pull [--limit N] | put [id,…] | fail <문항id> <이유>')
}
