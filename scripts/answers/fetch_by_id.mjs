// 문항의 **정답 그림만** 받아 온다.
//   node scripts/answers/fetch_by_id.mjs <목록.json> <나갈폴더>
//   node scripts/answers/fetch_by_id.mjs 쎈/공통수학1 <나갈폴더> [--all]
//   node scripts/answers/fetch_by_id.mjs RPM/중1/2 <나갈폴더> [--all]      ← 중등은 학기까지
// ★ 교재 번호(local_no)는 **학기마다 1번부터 다시 시작한다**. 학기를 안 적으면 섞인다 —
//   받은 그림을 번호로 묶는 뒤 단계(sheet_read·make_sql)가 조용히 엉킨다.
// 목록.json 은 [{"id":..}, ...] 꼴이면 된다(_검산목록.json·_넣을목록.json 그대로 쓴다).
// 교재/과정으로 부르면 **글자 정답이 아직 없는 문항**만 받는다(--all 이면 전부).
// 그림은 한 번에 받는다 — 줄 세워 받으면 1,000장에 몇십 분이 걸린다.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const [listP, OUT] = process.argv.slice(2)
fs.mkdirSync(OUT,{recursive:true})
const COLS='id,book,grade,semester,local_no,answer_kind,answer_text,answer_unit,answer_image_path'

const rows=[]
if (listP.includes('/') && !fs.existsSync(listP)) {      // 교재/과정[/학기] 로 부른 것
  const [book, grade, sem]=listP.split('/')
  for(let from=0;;from+=1000){                            // ★ order 없이 range 로 넘기면 행을 놓친다
    let q=db.from('problems').select(COLS).eq('book',book).eq('grade',grade)
      .not('answer_image_path','is',null)
    if(sem) q=q.eq('semester', Number(sem))
    if(!process.argv.includes('--all')) q=q.is('answer_text',null)
    const {data,error}=await q.order('id').range(from,from+999)
    if(error){console.error(error.message);process.exit(1)}
    if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
  }
  const sems=new Set(rows.map(r=>r.semester))
  if (sems.size>1) { console.error(`학기가 ${sems.size}개 섞였다 — <교재>/<과정>/<학기> 로 나눠 부를 것`); process.exit(1) }
} else {
  const ids=[...new Set(JSON.parse(fs.readFileSync(listP,'utf8')).map(r=>Number(r.id)))]
  for(let i=0;i<ids.length;i+=100){         // in() 은 한 번에 100개씩 (더 넣으면 조용히 잘린다)
    const {data,error}=await db.from('problems').select(COLS).in('id', ids.slice(i,i+100)).order('id')
    if(error){console.error(error.message);process.exit(1)}
    rows.push(...(data||[]))
  }
}
fs.writeFileSync(path.join(OUT,'list.json'), JSON.stringify(rows))

let n=0
const failed=[]                               // ★ 조용히 빠지면 뒤 단계가 그만큼 비는 줄 모른다
for(let i=0;i<rows.length;i+=100){
  const part=rows.slice(i,i+100).filter(r=>r.answer_image_path)
  const {data:urls}=await db.storage.from('problem-images').createSignedUrls(part.map(r=>r.answer_image_path),3600)
  await Promise.all(part.map(async (r,j)=>{   // 한 번에 받는다 — 줄 세워 받으면 몇십 분 걸린다
    const u=urls?.[j]
    if(!u?.signedUrl){ failed.push({no:r.local_no, id:r.id, path:r.answer_image_path, why:u?.error ?? '주소를 못 만듦'}); return }
    const res=await fetch(u.signedUrl)
    if(!res.ok){ failed.push({no:r.local_no, id:r.id, path:r.answer_image_path, why:`받기 실패 ${res.status}`}); return }
    fs.writeFileSync(path.join(OUT, r.id+'.png'), Buffer.from(await res.arrayBuffer())); n++
  }))
}
console.log(`찾은 문항 ${rows.length} · 받은 그림 ${n} → ${OUT}`)
if (failed.length) {
  fs.writeFileSync(path.join(OUT,'_못받은것.json'), JSON.stringify(failed,null,1), 'utf8')
  console.error(`  ! 못 받은 그림 ${failed.length}장 — _못받은것.json`)
  for (const f of failed.slice(0,5)) console.error(`    ${f.no} ${f.path} : ${f.why}`)
  process.exitCode=1
}
