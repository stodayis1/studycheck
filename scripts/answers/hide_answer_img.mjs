// 한 교재의 **정답 그림을 학생에게 안 보이게** 한다 (주소만 비운다).
//   node scripts/answers/hide_answer_img.mjs <교재>/<과정>/<학기> <되돌리기.sql>   ← 숨긴다
//   node scripts/answers/hide_answer_img.mjs --되살리기 <되돌리기.json>            ← 되살린다
//
// 왜 있나 — 정답 그림이 **틀린 판**에서 나왔을 때 쓴다. 틀린 답을 보여 주는 것보다
// 「정답 없음」이 낫다. 라이트쎈 중2-1 이 그랬다(2018년 판 정답 · 22개정 교재, 2026-11-04).
//
// **창고(Storage) 파일은 건드리지 않는다.** problems.answer_image_path 만 비운다.
// 맞는 판을 구하면 주소를 되돌리거나 새 그림을 같은 자리에 올리면 된다.
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const BACK = process.argv.includes('--되살리기')

if (BACK) {
  const list = JSON.parse(fs.readFileSync(process.argv[3],'utf8'))
  let done=0, bad=null
  for (const r of list) {
    const {data,error}=await db.from('problems').update({answer_image_path:r.path})
      .eq('id',r.id).select('id,answer_image_path')
    if(error){ bad=error.message; break }
    if(!data.length || data[0].answer_image_path!==r.path){ bad=`${r.id} 안 돌아왔다`; break }
    done++
  }
  console.log(`되살린 문항 ${done} / ${list.length}`)
  if(bad){ console.error('  ! '+bad); process.exitCode=1 }
} else {
  const [spec, OUT] = process.argv.slice(2)
  const [book, grade, sem] = spec.split('/')
  const all=[]
  for(let from=0;;from+=1000){        // ★ order 없이 range 로 넘기면 행을 놓친다
    const {data,error}=await db.from('problems').select('id,local_no,answer_image_path')
      .eq('book',book).eq('grade',grade).eq('semester',Number(sem))
      .not('answer_image_path','is',null).order('local_no').range(from,from+999)
    if(error){console.error(error.message);process.exit(1)}
    if(!data||!data.length)break; all.push(...data); if(data.length<1000)break
  }
  if(!all.length){ console.error(`${spec} — 정답 그림 주소가 있는 문항이 없다`); process.exit(1) }
  console.log(`${spec} — 정답 그림 주소가 있는 문항 ${all.length}개`)

  // 되돌릴 값을 **먼저** 남긴다
  const back = all.map(r=>({id:r.id, no:r.local_no, path:r.answer_image_path}))
  fs.writeFileSync(OUT.replace(/\.sql$/,'.json'), JSON.stringify(back,null,1))
  const q = s => "'" + String(s).replace(/'/g,"''") + "'"
  fs.writeFileSync(OUT,
    `-- ${spec} — 비운 정답 그림 주소 ${all.length}개를 되돌린다\n` +
    `-- (창고 파일은 그대로 있다. 주소만 비웠다.)\n` +
    'update problems p set answer_image_path = v.path\nfrom (values\n' +
    back.map(r=>`  (${r.id}::bigint, ${q(r.path)}::text)`).join(',\n') +
    '\n) as v(id, path)\nwhere p.id = v.id;\n')
  console.log(`  되돌리기 → ${OUT} · ${OUT.replace(/\.sql$/,'.json')}`)

  let done=0, bad=null
  for(let i=0;i<all.length;i+=100){
    const part=all.slice(i,i+100).map(r=>r.id)
    const {data,error}=await db.from('problems').update({answer_image_path:null})
      .in('id',part).select('id,answer_image_path')
    if(error){ bad=error.message; break }
    if(data.length!==part.length){ bad=`${part.length}개 중 ${data.length}개만 바뀜`; break }
    const off=data.find(r=>r.answer_image_path!==null)
    if(off){ bad=`${off.id} 가 안 비워졌다`; break }
    done+=data.length
  }
  console.log(`  비운 문항 ${done}`)
  if(bad){ console.error('  ! '+bad); process.exitCode=1 }
}
