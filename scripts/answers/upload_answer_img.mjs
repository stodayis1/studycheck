// 떠 둔 정답 그림을 DB 가 가리키는 **그 경로에** 올린다 (창고에 없던 그림 채우기).
//   node scripts/answers/upload_answer_img.mjs <교재>/<과정>/<학기> <그림폴더> [--빼기 0860,0865]
// 그림 파일 이름은 교재 번호다 (0860.png).
//
// 창고에 이미 그 파일이 있으면 **건너뛴다** — 멀쩡한 그림을 덮어쓰지 않으려고.
// `--덮어쓰기` 를 주면 있는 것도 바꾼다. **다시 자른 그림을 올릴 때만** 쓴다
// (라이트쎈 중2-1, 2026-11-04). 옛 그림은 돌아오지 않으니 **먼저 받아 두고** 쓸 것 —
//   node scripts/answers/fetch_by_id.mjs "<교재>/<과정>/<학기>" <백업폴더> --all
// 올린 뒤 다시 받아 **바이트 수를 맞대** 확인한다.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const [spec, DIR] = process.argv.slice(2)
const [book, grade, sem] = spec.split('/')
const xi = process.argv.indexOf('--빼기')
const SKIP = new Set(xi>0 ? process.argv[xi+1].split(',') : [])
const OVER = process.argv.includes('--덮어쓰기')

const nos = fs.readdirSync(DIR).filter(f=>/^\d{4}\.png$/.test(f)).map(f=>f.slice(0,4)).filter(n=>!SKIP.has(n))
const rows=[]
for(let i=0;i<nos.length;i+=100){
  const {data,error}=await db.from('problems').select('id,local_no,answer_image_path')
    .eq('book',book).eq('grade',grade).eq('semester',Number(sem))
    .in('local_no', nos.slice(i,i+100)).order('local_no')
  if(error){console.error(error.message);process.exit(1)}
  rows.push(...(data||[]))
}
console.log(`${spec} — 올릴 그림 ${nos.length} · DB 에서 찾은 문항 ${rows.length}` + (SKIP.size?` (뺀 것 ${[...SKIP].join(',')})`:''))

let up=0, skip=0, bad=[]
for(const r of rows){
  if(!r.answer_image_path){ bad.push(`${r.local_no} 경로가 비어 있다`); continue }
  const file=path.join(DIR, `${r.local_no}.png`)
  const buf=fs.readFileSync(file)
  // 이미 있으면 덮어쓰지 않는다
  if(!OVER){
    const {data:sign}=await db.storage.from('problem-images').createSignedUrl(r.answer_image_path, 60)
    if(sign?.signedUrl){ skip++; continue }
  }
  const {error}=await db.storage.from('problem-images')
    .upload(r.answer_image_path, buf, {contentType:'image/png', upsert:OVER})
  if(error){ bad.push(`${r.local_no} ${error.message}`); continue }
  // 되받아 바이트 수 확인
  const {data:s2}=await db.storage.from('problem-images').createSignedUrl(r.answer_image_path, 60)
  const res=s2?.signedUrl ? await fetch(s2.signedUrl) : null
  const got=res?.ok ? (await res.arrayBuffer()).byteLength : -1
  if(got!==buf.length){ bad.push(`${r.local_no} 되받은 크기 ${got} ≠ ${buf.length}`); continue }
  up++
}
console.log(`  올림 ${up} · 이미 있어 건너뜀 ${skip} · 실패 ${bad.length}`)
for(const b of bad.slice(0,10)) console.error('    ! '+b)
if(bad.length) process.exitCode=1
