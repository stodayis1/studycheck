// 쌍둥이 묶음 표본 보기 — 교재를 많이 걸친 것부터
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const rows=[]
for(let from=0;;from+=1000){
  const {data}=await db.from('problems').select('id,book,local_no,type_code,twin_group').eq('grade','공통수학2').not('twin_group','is',null).range(from,from+999)
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}
const g={}
for(const r of rows) (g[r.twin_group]=g[r.twin_group]||[]).push(r)
const list=Object.entries(g).map(([k,v])=>({k,v,b:new Set(v.map(x=>x.book)).size}))
list.sort((a,b)=>b.b-a.b||b.v.length-a.v.length)
for(const x of list.slice(0,6)) console.log(`[${x.v[0].type_code}] 교재${x.b} · ${x.v.map(r=>`${r.book} ${r.local_no}`).join(' = ')}`)
console.log(`\n묶음 ${list.length} · 문항 ${rows.length} · 교재수 분포`, JSON.stringify(list.reduce((a,x)=>{a[x.b]=(a[x.b]||0)+1;return a},{})))
