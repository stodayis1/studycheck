// 교재 자체 유형 이름표와 앱 유형 코드가 어긋난 묶음 찾기
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const {data:T}=await db.from('standard_types').select('code,type_title').like('code','공수2-%')
const title=new Map(T.map(r=>[r.code,r.type_title]))
// 유형만렙
const plan=JSON.parse(fs.readFileSync('scripts/crop-mrl2/plan.json','utf8'))
const types=JSON.parse(fs.readFileSync('scripts/crop-mrl2/types.json','utf8'))
const tt=new Map(types.map(r=>[`${r.ch}-${r.no}`, r.title]))
const g={}
for (const r of plan) {
  if (r.tno==null) continue
  const k=`${r.ch}-${r.tno}`
  g[k] = g[k] || {code:r.code, n:0, first:r.n, last:r.n}
  g[k].n++; g[k].last=r.n
}
for (const k of Object.keys(g).sort((a,b)=>{const[p,q]=a.split('-').map(Number),[s,t]=b.split('-').map(Number);return p-s||q-t})) {
  const v=g[k]
  console.log(`${k.padEnd(6)} ${v.code||'-'} ${String(title.get(v.code)||'').slice(0,22).padEnd(24)} | ${tt.get(k)||''}  (${v.n}문항 ${v.first}~${v.last})`)
}
