// 잘못 잘린 문제 그림 찾기 — 가장자리에 글자가 닿아 있으면 잘린 것이다.
//   node scripts/twins/edge_scan.mjs <과정> <나갈폴더> [--limit N] [--book 쎈]
// 그림을 받아 가장자리 띠의 잉크를 세고 scan.json 에 적는다. 그림은 지운다(용량).
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const GRADE=process.argv[2]||'공통수학2'
const OUT=process.argv[3]||'scan'
const li=process.argv.indexOf('--limit'); const LIMIT=li>0?Number(process.argv[li+1]):0
const bi=process.argv.indexOf('--book');  const BOOK=bi>0?process.argv[bi+1]:null
fs.mkdirSync(OUT,{recursive:true})
const ANS = process.argv.includes('--answers')   // 정답 그림을 받는다
const COL = ANS ? 'answer_image_path' : 'image_path'
let q=db.from('problems').select(`id,book,local_no,type_code,answer_kind,answer_text,${COL}`).eq('grade',GRADE).not(COL,'is',null)
if (ANS && !process.argv.includes('--all')) q = q.is('answer_text', null)
if(BOOK) q=q.eq('book',BOOK)
const rows=[]
for(let from=0;;from+=1000){
  const {data,error}=await q.order('id').range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}
const list = LIMIT ? rows.filter((_,i)=>i%Math.ceil(rows.length/LIMIT)===0) : rows
console.log(`${GRADE} ${rows.length}문항 중 ${list.length}개를 본다`)
fs.writeFileSync(path.join(OUT,'list.json'), JSON.stringify(list))
// 서명 주소를 100개씩 만들어 그림을 받아 둔다
let n=0
for(let i=0;i<list.length;i+=100){
  const part=list.slice(i,i+100)
  const {data:urls}=await db.storage.from('problem-images').createSignedUrls(part.map(r=>r[COL]),3600)
  for(let j=0;j<part.length;j++){
    const u=urls?.[j]; if(!u?.signedUrl) continue
    const res=await fetch(u.signedUrl); if(!res.ok) continue
    fs.writeFileSync(path.join(OUT, part[j].id+'.png'), Buffer.from(await res.arrayBuffer()))
    n++
  }
  if(i%500===0) console.log(`  ${i}/${list.length}`)
}
console.log('받은 그림', n)
