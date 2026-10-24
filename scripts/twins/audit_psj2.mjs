import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const {data:T}=await db.from('standard_types').select('code,type_title').like('code','공수2-%')
const title=new Map(T.map(r=>[r.code,r.type_title]))
const tm=JSON.parse(fs.readFileSync('scripts/crop-psj2/typemap.json','utf8'))
const lowOnly = process.argv[2]==='low'
for (const r of tm) {
  if (lowOnly && r.score>=0.6) continue
  console.log(`${String(r.ch)+'-'+String(r.no)}`.padEnd(7)+` ${r.code} ${String(title.get(r.code)||'').slice(0,20).padEnd(22)} | ${r.title}  (s=${r.score})`)
}
