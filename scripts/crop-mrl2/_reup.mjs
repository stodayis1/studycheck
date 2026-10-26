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
const mode = process.argv[2]
const list = JSON.parse(fs.readFileSync(path.join(HERE,'_fixlist.json'),'utf8'))
const nos = list.map(n=>String(n).padStart(4,'0'))
const {data:rows, error} = await db.from('problems').select('id,local_no,image_path')
  .eq('book','유형만렙').eq('grade','공통수학2').in('local_no', nos)
if(error){console.error(error.message);process.exit(1)}
console.log(`대상 ${rows.length}문항 (적어 둔 것 ${nos.length})`)
if (mode==='backup'){
  fs.mkdirSync(path.join(HERE,'orig'),{recursive:true})
  const {data:urls}=await db.storage.from('problem-images').createSignedUrls(rows.map(r=>r.image_path),3600)
  let n=0
  for(let i=0;i<rows.length;i++){
    const u=urls?.[i]; if(!u?.signedUrl){console.log('주소 못 만듦', rows[i].local_no); continue}
    const res=await fetch(u.signedUrl); if(!res.ok){console.log('못 받음', rows[i].local_no); continue}
    fs.writeFileSync(path.join(HERE,'orig',rows[i].local_no+'.png'), Buffer.from(await res.arrayBuffer())); n++
  }
  console.log('내려받아 둔 원본', n, '→', path.join(HERE,'orig'))
} else if (mode==='upload'){
  let n=0, miss=[]
  for(const r of rows){
    const f=path.join(HERE,'fix',r.local_no+'.png')
    if(!fs.existsSync(f)){miss.push(r.local_no);continue}
    const {error:e}=await db.storage.from('problem-images')
      .upload(r.image_path, fs.readFileSync(f), {contentType:'image/png', upsert:true})
    if(e){console.error(r.local_no, e.message); continue}
    n++
  }
  console.log('덮어쓴 그림', n, miss.length?('빠진 것 '+miss.join(',')):'')
} else console.log('backup 또는 upload')
