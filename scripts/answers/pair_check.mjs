// 문제 그림과 정답 그림을 **나란히** 받아 둔다 — 정답이 그 문제의 답이 맞는지 눈으로 보려고.
//   node scripts/answers/pair_check.mjs <교재>/<과정>[/<학기>] <나갈폴더> <번호> [<번호> …]
// ★ 교재 번호(local_no)는 **학기마다 1번부터 다시 시작한다** — 중등은 학기를 꼭 적을 것.
// 정답 그림만 보고는 「값이 맞다」까지만 알 수 있고 「짝이 맞다」는 알 수 없다.
// 자르기가 통째로 밀렸는지는 **문제와 답을 맞대야** 드러난다.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const [spec, OUT, ...nos] = process.argv.slice(2)
const [book, grade, sem] = spec.split('/')
fs.mkdirSync(OUT,{recursive:true})

let q=db.from('problems').select('id,local_no,semester,image_path,answer_image_path')
  .eq('book',book).eq('grade',grade).in('local_no', nos)
if (sem) q=q.eq('semester', Number(sem))
const {data:rows,error}=await q.order('local_no')
if(error){console.error(error.message);process.exit(1)}
if (!sem && new Set(rows.map(r=>r.semester)).size>1) {
  console.error('학기가 섞였다 — <교재>/<과정>/<학기> 로 다시 부를 것'); process.exit(1)
}

const paths=rows.flatMap(r=>[r.image_path, r.answer_image_path].filter(Boolean))
const {data:urls}=await db.storage.from('problem-images').createSignedUrls(paths,3600)
const byPath=new Map((urls||[]).map(u=>[u.path,u.signedUrl]))
await Promise.all(rows.flatMap(r=>[['q',r.image_path],['a',r.answer_image_path]].map(async ([tag,p])=>{
  const u=p && byPath.get(p); if(!u) return
  const res=await fetch(u); if(!res.ok) return
  fs.writeFileSync(path.join(OUT, `${r.local_no}_${tag}.png`), Buffer.from(await res.arrayBuffer()))
})))
console.log(`${rows.length}문항 · 그림 ${fs.readdirSync(OUT).length}장 → ${OUT}`)
console.log(rows.map(r=>r.local_no).join(' '))
