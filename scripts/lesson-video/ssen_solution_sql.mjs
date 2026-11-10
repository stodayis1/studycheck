// 쎈 B 대표유형 풀이영상 → lesson_videos 적용·되돌리기 SQL
// node mk_sol_sql.mjs <풀이영상 폴더> <grade> <out.sql>
import fs from 'node:fs'
import path from 'node:path'
const [dir, grade, out] = process.argv.slice(2)
const ids = JSON.parse(fs.readFileSync(path.join(dir, '_유튜브_주소.json'), 'utf8'))
const q = s => s == null ? 'null' : `'${String(s).replace(/'/g, "''")}'`
const rows = []
const miss = []
for (const f of fs.readdirSync(dir).filter(f => /^\d\d_풀이\d\d_.*\.구간\.json$/.test(f)).sort()) {
  const G = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))
  const [, cn, sn] = f.match(/^(\d\d)_풀이(\d\d)_/)
  const ol = `${cn}-풀이${sn}`
  const yt = ids[ol]
  if (!yt) miss.push(ol)
  const scenes = G.steps.map(s => ({ start: s.start, end: s.end, label: s.bubble, kind: '풀이' }))
  rows.push(`(${q(grade)}, '대표예제', ${G.concept_no ?? 'null'}, ${q(ol)}, ${q(`${G.label} ${G.title}`)}, ${q(G.chapter)}, ${q(G.sub_chapter)}, ${q('쎈 ' + grade)}, ${G.book_page ? `array[${G.book_page}]` : 'null'}, ${q(yt)}, ${G.duration}, ${q(JSON.stringify(scenes))}::jsonb, ${G.type_code ? `array[${q(G.type_code)}]` : 'array[]::text[]'}, true)`)
}
const head = `-- 쎈 B단계 대표유형 풀이영상 ${grade} ${rows.length}편 → lesson_videos (kind 대표예제, order_label 「NN-풀이MM」)
-- 되돌리기: 같은 이름_되돌리기.sql
begin;
insert into lesson_videos (grade, kind, concept_no, order_label, title, chapter, sub_chapter, book, book_pages, youtube_id, duration_seconds, scenes, type_codes, is_active)
values
`
fs.writeFileSync(out, head + rows.join(',\n') + `\non conflict (grade, order_label) do nothing;\ncommit;\n`)
fs.writeFileSync(out.replace(/\.sql$/, '_되돌리기.sql'), `-- ${path.basename(out)} 되돌리기\nbegin;\ndelete from lesson_videos where grade = ${q(grade)} and kind = '대표예제' and order_label ~ '^\\d\\d-풀이\\d\\d$';\ncommit;\n`)
console.log('rows', rows.length, 'youtube 없음', miss.length, miss.join(','))
