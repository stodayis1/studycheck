// 혼자 남은 쌍둥이 묶음을 비운다 (유형을 고치며 문항이 빠져나간 자리).
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const rows=[]
for(let from=0;;from+=1000){
  const {data}=await db.from('problems').select('id,book,local_no,twin_group').not('twin_group','is',null).range(from,from+999)
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}
const g={}; for(const r of rows) (g[r.twin_group]=g[r.twin_group]||[]).push(r)
const lone=Object.entries(g).filter(([,v])=>v.length<2)
console.log('혼자 남은 묶음', lone.length, lone.map(([k,v])=>`${v[0].book} ${v[0].local_no}`).join(', '))
if (lone.length && !process.argv.includes('--dry')) {
  const ids=lone.flatMap(([,v])=>v.map(r=>r.id))
  const { error } = await db.from('problems').update({ twin_group: null }).in('id', ids)
  if (error) { console.error(error.message); process.exit(1) }
  console.log('비웠습니다.')
}
