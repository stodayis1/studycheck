// DB 가 가리키는 그림이 **창고에 실제로 있는지** 센다.
//   node scripts/answers/missing_images.mjs [<나갈.json>]
//
// problems.image_path · answer_image_path 는 그냥 글자다. 올리다 빠져도 DB 에는 경로가 남는다.
// 그러면 학생 화면에서 문제 그림이 안 뜨거나(시험지가 빈칸), 정답이 「정답 없음」으로 나온다.
// 에러도 안 나고 아무도 모른다 — 2026-10-27 에 RPM 중1-1 정답 그림 105장이 그랬다.
//
// 한 장씩 물어보면 수만 번이라 **폴더째 목록을 받아** 맞댄다.
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const OUT=process.argv[2]

const rows=[]
for(let from=0;;from+=1000){        // ★ order 없이 range 로 넘기면 행을 놓친다
  const {data,error}=await db.from('problems')
    .select('id,book,grade,semester,local_no,answer_text,image_path,answer_image_path')
    .order('id').range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}
console.log(`문항 ${rows.length}`)

const folders=new Map()             // 폴더 → 그 안의 파일 이름 Set
const need=new Set()
for(const r of rows) for(const p of [r.image_path, r.answer_image_path]) {
  if(!p) continue
  need.add(p.slice(0, p.lastIndexOf('/')))
}
console.log(`폴더 ${need.size} 개를 훑는다…`)
let k=0
for(const dir of need){
  const names=new Set()
  for(let off=0;;off+=1000){        // 창고 목록도 한 번에 1000개까지만 준다
    const {data,error}=await db.storage.from('problem-images').list(dir,{limit:1000,offset:off})
    if(error){ console.error(`  ${dir}: ${error.message}`); break }
    for(const o of data) names.add(o.name)
    if(data.length<1000) break
  }
  folders.set(dir, names)
  if(++k%50===0) console.log(`  ${k}/${need.size}`)
}

const miss=[]
for(const r of rows) for(const [tag,p] of [['문제',r.image_path],['정답',r.answer_image_path]]) {
  if(!p) continue
  const dir=p.slice(0,p.lastIndexOf('/')), name=p.slice(p.lastIndexOf('/')+1)
  if(!folders.get(dir)?.has(name))
    miss.push({tag, book:r.book, grade:r.grade, semester:r.semester, no:r.local_no, id:r.id, path:p,
               글자정답:tag==='정답' ? !!r.answer_text : null})
}

const by={}
for(const m of miss){ const k=`${m.book} ${m.grade}-${m.semester} ${m.tag}`; by[k]=(by[k]||0)+1 }
console.log(`\n창고에 없는 그림 ${miss.length}장`)
for(const [k,n] of Object.entries(by).sort((a,b)=>b[1]-a[1])) console.log(`  ${k} : ${n}`)
const hurt=miss.filter(m=>m.tag==='문제' || !m.글자정답)
console.log(`\n지금 학생 화면이 비는 것 ${hurt.length}장 (문제 그림이 없거나, 정답이 그림뿐인데 그 그림이 없다)`)
if(OUT){ fs.writeFileSync(OUT, JSON.stringify(miss,null,1),'utf8'); console.log(`→ ${OUT}`) }
if(miss.length) process.exitCode=1
