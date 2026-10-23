// 공통수학2 유형별 현황 — 쌍둥이 대조 순서를 정하려고 본다.
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const rows=[]
for (let from=0;;from+=1000){
  const { data, error } = await db.from('problems')
    .select('id,book,type_code,level,step,twin_group').eq('grade','공통수학2').range(from, from+999)
  if (error) { console.error(error); break }
  if (!data || !data.length) break
  rows.push(...data)
  if (data.length<1000) break
}
const by={}
for(const r of rows){
  const k=r.type_code||'(없음)'
  by[k]=by[k]||{n:0,books:new Set(),tw:0,lv:{}}
  by[k].n++; by[k].books.add(r.book); if(r.twin_group) by[k].tw++
  by[k].lv[r.level]=(by[k].lv[r.level]||0)+1
}
const list=Object.entries(by).map(([k,v])=>({code:k,n:v.n,b:v.books.size,tw:v.tw,lv:v.lv}))
list.sort((a,b)=> b.b-a.b || b.n-a.n)
console.log('공통수학2 문항', rows.length, '· 유형', list.length, '· 이미 쌍둥이 붙은 문항', rows.filter(r=>r.twin_group).length)
console.log('교재 수별 유형 분포:', JSON.stringify(list.reduce((a,x)=>{a[x.b]=(a[x.b]||0)+1;return a},{})))
console.log('\n문항 많은 유형 30개 (교재 수 | 문항 | 쌍둥이 붙은 것)')
for(const x of list.slice(0,30)) console.log(`  ${x.code}  교재${x.b}  ${String(x.n).padStart(4)}문항  쌍둥이${x.tw}`)
fs.writeFileSync('scripts/twins/survey.json', JSON.stringify(list,null,0))
