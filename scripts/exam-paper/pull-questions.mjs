/**
 * 적중 대조 준비: 시험지의 문항 그림을 시험 폴더로 받고(NN.png), 한눈에 볼 묶음 그림(_sheets/sNN.png, 8문항씩)을 만든다.
 *
 *   node scripts/exam-paper/pull-questions.mjs <시험지 id> "<시험 폴더>"
 *
 * 읽기만 한다. 범위 · 문항 수 · 정답을 같이 찍어 준다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}
const [id, dir] = process.argv.slice(2)
if (!id || !dir) { console.error('쓰는 법: node scripts/exam-paper/pull-questions.mjs <시험지 id> "<시험 폴더>"'); process.exit(1) }
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
fs.mkdirSync(dir, { recursive: true })
const { data: p } = await s.from('exam_papers').select('school_name, grade, exam_scope, discriminating_nos').eq('id', id).single()
const { data: qs } = await s.from('exam_questions').select('id, question_no, q_type, answer, source_memo').eq('paper_id', id).order('sort_order')
const { count } = await s.from('exam_enough_matches').select('id', { count: 'exact', head: true }).eq('paper_id', id)
let n = 0
for (const q of qs ?? []) {
  const { data, error } = await s.storage.from('problem-images').download(`exam/${id}/${q.id}.png`)
  if (error) { console.log('그림 없음:', q.question_no); continue }
  fs.writeFileSync(path.join(dir, `${String(q.question_no).padStart(2, '0')}.png`), Buffer.from(await data.arrayBuffer())); n++
}
console.log(`${p.school_name} ${p.grade} · 범위 ${p.exam_scope ?? '(비어 있음)'} · 변별 ${JSON.stringify(p.discriminating_nos)} · 기존 매칭 ${count}건`)
console.log(`${qs.length}문항 · 그림 ${n}장 | ` + qs.map((q) => `${q.question_no}:${q.q_type[0]}:${String(q.answer ?? '-').slice(0, 6)}`).join(' '))
execFileSync('python', ['-X', 'utf8', '-c', `
import glob, os, sys
from PIL import Image, ImageDraw
D = sys.argv[1]
fs = sorted(glob.glob(os.path.join(D, '[0-9][0-9].png'))); os.makedirs(os.path.join(D, '_sheets'), exist_ok=True)
for g in range(0, len(fs), 8):
    ims = [(os.path.basename(f)[:2], Image.open(f).convert('RGB')) for f in fs[g:g + 8]]
    W = 480; ims = [(k, i.resize((W, int(i.height * W / i.width)))) for k, i in ims]
    rows = [r for r in (ims[:4], ims[4:]) if r]; H = sum(max(i.height for _, i in r) + 30 for r in rows)
    s = Image.new('RGB', (W * 4 + 30, H), 'white'); d = ImageDraw.Draw(s); y = 0
    for r in rows:
        for ci, (k, i) in enumerate(r):
            d.text((ci * (W + 10) + 4, y + 4), '[' + k + ']', fill=(220, 0, 0)); s.paste(i, (ci * (W + 10), y + 24))
        y += max(i.height for _, i in r) + 30
    s.save(os.path.join(D, '_sheets', 's%02d.png' % (g // 8 + 1))); print('묶음', g // 8 + 1, s.size)
`, dir], { stdio: 'inherit' })
