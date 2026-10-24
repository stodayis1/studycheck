import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const rows=[]
for(let from=0;;from+=1000){
  const {data,error}=await db.from('problems').select('id,book,grade,local_no,twin_group,solution_image_path').order('id').range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}
console.log('전체', rows.length)
const tw=rows.filter(r=>r.twin_group)
const g={}; tw.forEach(r=>{ (g[r.twin_group]=g[r.twin_group]||[]).push(r) })
console.log('묶음 붙은 문항', tw.length, '· 묶음', Object.keys(g).length, '· 혼자', Object.values(g).filter(v=>v.length<2).length)
const byg={}
for(const r of tw){ byg[r.grade]=byg[r.grade]||{n:0}; byg[r.grade].n++ }
console.log(byg)
// 쎈B 중 풀이 없는 문항이 묶음으로 풀이를 빌릴 수 있는지
const ssenb = rows.filter(r=>r.book==='쎈B')
const noSol = ssenb.filter(r=>!r.solution_image_path)
const canBorrow = noSol.filter(r=>r.twin_group && (g[r.twin_group]||[]).some(x=>x.solution_image_path))
console.log('쎈B', ssenb.length, '· 풀이 없음', noSol.length, '· 묶음에서 빌릴 수 있음', canBorrow.length)
