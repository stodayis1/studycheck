// 공통수학2 쌍둥이 진행 상황
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const rows=[]
for(let from=0;;from+=1000){
  const {data}=await db.from('problems').select('id,book,type_code,twin_group').eq('grade','공통수학2').order('id').range(from,from+999)
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}
const tw=rows.filter(r=>r.twin_group)
const g={}; for(const r of tw){ (g[r.twin_group]=g[r.twin_group]||new Set()).add(r.book) }
const sizes={}; for(const r of tw){ sizes[r.twin_group]=(sizes[r.twin_group]||0)+1 }
const multi=Object.values(g).filter(s=>s.size>=3).length
console.log(`공통수학2 ${rows.length}문항 · 쌍둥이 붙은 문항 ${tw.length} · 묶음 ${Object.keys(g).length}개 · 3개 교재 이상 걸친 묶음 ${multi}`)
const done=new Set(tw.map(r=>r.type_code))
console.log('손댄 유형', [...done].sort().join(' '))
