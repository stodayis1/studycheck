// 교재·번호로 유형을 고친다 (소단원도 함께 맞춘다).
//   node scripts/twins/retype_local.mjs <교재> <공통수학2> <{"0015":"공수2-01-04", ...}.json>
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const [book, grade, file] = process.argv.slice(2)
const map = JSON.parse(fs.readFileSync(file,'utf8'))
const codes=[...new Set(Object.values(map))]
const { data: st } = await db.from('standard_types').select('code,sub_chapter_no,sub_chapter_title').in('code',codes)
const sub=new Map((st??[]).map(t=>[t.code,t]))
let n=0
for (const [local, to] of Object.entries(map)) {
  const t=sub.get(to); if(!t){console.error('없는 유형',to);process.exit(1)}
  const { error, count } = await db.from('problems')
    .update({ type_code: to, sub_chapter_no: t.sub_chapter_no, sub_chapter_title: t.sub_chapter_title }, { count:'exact' })
    .eq('book',book).eq('grade',grade).eq('local_no',local)
  if (error) { console.error('✗',local,error.message); process.exit(1) }
  n += count ?? 0
}
console.log(`유형 고친 문항 ${n}개`)
