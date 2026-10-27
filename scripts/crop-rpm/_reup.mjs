// 다시 자른 그림만 덮어쓰기. 먼저 지금 것을 orig/ 로 내려받아 되돌릴 수 있게 한다.
//   node _reup.mjs backup   /  node _reup.mjs upload
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1'), '..', '..')
for (const f of ['.env.local','.env']) { const p=path.join(ROOT,f); if(!fs.existsSync(p))continue;
  for (const line of fs.readFileSync(p,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1')
const mode = process.argv[2]           // check | upload
const dir  = process.argv[3]           // <id>.png 들이 든 폴더
const files = fs.readdirSync(dir).filter(f=>/^\d+\.png$/.test(f))
const ids = files.map(f=>Number(f.slice(0,-4)))
const rows=[]
for (let i=0;i<ids.length;i+=200){
  const {data,error}=await db.from('problems').select('id,book,grade,semester,local_no,image_path').in('id', ids.slice(i,i+200))
  if(error){console.error(error.message);process.exit(1)}
  rows.push(...(data??[]))
}
console.log(`올릴 그림 ${files.length}장 · 찾은 문항 ${rows.length}`)
if (mode==='check'){
  const by={}
  for(const r of rows){ const k=`${r.grade}-${r.semester} ${r.book}`; by[k]=(by[k]||0)+1 }
  for(const k of Object.keys(by).sort()) console.log(' ', k, by[k])
} else if (mode==='upload'){
  let n=0, bad=[]
  for(const r of rows){
    const f=path.join(dir, r.id+'.png')
    if(!fs.existsSync(f)){ bad.push(r.id); continue }
    const {error:e}=await db.storage.from('problem-images')
      .upload(r.image_path, fs.readFileSync(f), {contentType:'image/png', upsert:true})
    if(e){ console.error(r.local_no, e.message); bad.push(r.id); continue }
    n++
    if(n%100===0) console.log('  ', n, '/', rows.length)
  }
  console.log('덮어쓴 그림', n, bad.length?('실패 '+bad.length):'')
} else console.log('check 또는 upload 뒤에 폴더를 적으세요')
