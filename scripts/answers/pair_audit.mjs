// 교재 하나를 **앞·중간·뒤에서 골고루** 뽑아 문제·정답을 나란히 받아 온다.
//   node scripts/answers/pair_audit.mjs <교재>/<과정>/<학기> <나갈폴더> [개수]
//
// 왜 있나 — 정답을 「값을 바르게 읽었는가」로만 검사하면 **그 그림이 그 문제의 답인지**는 안 본다.
// 라이트쎈 중2-1 은 그렇게 통과했는데 실제로는 10문항이 10개 다 어긋나 있었다(2026-11-03).
// 글자 정답이 이미 들어 있는 교재는 **전부 이 검사를 한 번씩** 거쳐야 한다.
//
// 글자 정답이 있는 문항 중에서 고른다 — 그것이 지금 자동 채점에 쓰이는 값이기 때문이다.
// `--글자없어도` 를 주면 글자 정답이 없는 문항도 고른다. 다시 자른 정답 그림이
// 제 문항에 붙었는지 볼 때 쓴다(라이트쎈 중2-1, 2026-11-04).
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const [spec, OUT] = process.argv.slice(2)
const N = Number(process.argv[4] || 6)
const ANY = process.argv.includes('--글자없어도')
const [book, grade, sem] = spec.split('/')
fs.mkdirSync(OUT,{recursive:true})

const all=[]
for(let from=0;;from+=1000){        // ★ order 없이 range 로 넘기면 행을 놓친다
  const {data,error}=await db.from('problems')
    .select('id,local_no,answer_kind,answer_text,answer_unit,image_path,answer_image_path')
    .eq('book',book).eq('grade',grade).eq('semester',Number(sem))
    .not('image_path','is',null)
    .order('local_no').range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; all.push(...data); if(data.length<1000)break
}
// ★ ANY 면 picked 와 all 이 **같은 배열**이다 — all 을 비우면 picked 도 빈다. 사본을 뜬다.
const picked = ANY ? all.slice() : all.filter(r=>r.answer_text!=null)
if(!picked.length){ console.error(`${spec} — 고를 문항이 없다`); process.exit(1) }
all.length=0; all.push(...picked)
const step=Math.max(1, Math.floor(all.length/N))
const pick=[]
for(let i=0;i<N && i*step<all.length;i++) pick.push(all[i*step])

const paths=pick.flatMap(r=>[r.image_path, r.answer_image_path].filter(Boolean))
const {data:urls}=await db.storage.from('problem-images').createSignedUrls(paths,3600)
const byPath=new Map((urls||[]).map(u=>[u.path,u.signedUrl]))
await Promise.all(pick.flatMap(r=>[['q',r.image_path],['a',r.answer_image_path]].map(async ([tag,p])=>{
  const u=p && byPath.get(p); if(!u) return
  const res=await fetch(u); if(!res.ok) return
  fs.writeFileSync(path.join(OUT, `${r.local_no}_${tag}.png`), Buffer.from(await res.arrayBuffer()))
})))
fs.writeFileSync(path.join(OUT,'list.json'), JSON.stringify(pick.map(r=>({
  no:r.local_no, kind:r.answer_kind,
  txt: r.answer_text + (r.answer_unit ? ' ' + r.answer_unit : '')
})), null, 1))
console.log(`${spec} — 글자 정답 ${all.length} 중 ${pick.length}개를 골고루 뽑았다 → ${OUT}`)
