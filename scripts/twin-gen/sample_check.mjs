// 쌍둥이를 **몇 %나 만들 수 있나**를 재려고 문제 그림을 무작위로 뽑아 온다.
//   node scripts/twin-gen/sample_check.mjs <나갈폴더> [개수] [--book 쎈] [--grade 중1]
//
// 유형 이름만 보고 짐작하면 틀린다(「각의 크기」인데 그림이 없기도 하고, 「계산」인데 표가 있기도 하다).
// 그림을 직접 보고 세어야 한다. 뽑은 표본은 list.json 에 유형 이름과 함께 적어 둔다.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const OUT=process.argv[2]
const N=Number(process.argv[3]||36)
const bi=process.argv.indexOf('--book'),  BOOK = bi>0?process.argv[bi+1]:null
const gi=process.argv.indexOf('--grade'), GRADE= gi>0?process.argv[gi+1]:null
fs.mkdirSync(OUT,{recursive:true})

// 전체에서 고르게 뽑으려고 id 범위를 N 칸으로 나눠 칸마다 하나씩 집는다(무작위 치우침 방지)
let q=db.from('problems').select('id').not('image_path','is',null).order('id')
if(BOOK) q=q.eq('book',BOOK); if(GRADE) q=q.eq('grade',GRADE)
const ids=[]
for(let from=0;;from+=1000){
  const {data,error}=await q.range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; ids.push(...data.map(r=>r.id)); if(data.length<1000)break
}
const step=Math.floor(ids.length/N)||1
const pick=[]
for(let i=0;i<N && i*step<ids.length;i++) pick.push(ids[i*step+Math.floor(Math.random()*Math.min(step,ids.length-i*step))])

const rows=[]
for(let i=0;i<pick.length;i+=100){
  const {data}=await db.from('problems')
    .select('id,book,grade,semester,local_no,type_code,image_path,standard_types(type_title)')
    .in('id',pick.slice(i,i+100)).order('id')
  rows.push(...(data||[]))
}
const {data:urls}=await db.storage.from('problem-images').createSignedUrls(rows.map(r=>r.image_path),3600)
let n=0
await Promise.all(rows.map(async (r,j)=>{
  const u=urls?.[j]; if(!u?.signedUrl) return
  const res=await fetch(u.signedUrl); if(!res.ok) return
  fs.writeFileSync(path.join(OUT, r.id+'.png'), Buffer.from(await res.arrayBuffer())); n++
}))
fs.writeFileSync(path.join(OUT,'list.json'), JSON.stringify(rows.map(r=>({
  id:r.id, book:r.book, grade:r.grade, semester:r.semester, no:r.local_no,
  type: Array.isArray(r.standard_types)? r.standard_types[0]?.type_title : r.standard_types?.type_title
})), null, 1))
console.log(`전체 ${ids.length} 중 ${rows.length}개를 고르게 뽑아 ${n}장 받았다 → ${OUT}`)
