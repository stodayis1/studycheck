// 사람이 읽어 적은 값(「<번호> <값>」 한 줄씩)을 DB 의 글자 정답과 맞대 본다.
//   node scripts/answers/compare_read.mjs <교재>/<과정>/<학기> <판독.txt>
//
// 왜 있나 — 「문제 ↔ 정답 그림」 짝은 맞는데 **그림을 글자로 옮기는 과정**이 깨진 교재가 있다.
// 개념+유형 유형편 공수1 이 그랬다(2026-11-04): 숫자 정답(10·18)을 객관식(①·②)으로 적어 놨다.
// pair_audit 는 8개만 보지만 이것은 **한 권 전체**를 맞댄다.
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const [spec, readP] = process.argv.slice(2)
const [book, grade, sem] = spec.split('/')

const read=new Map()
for (const line of fs.readFileSync(readP,'utf8').split('\n')) {
  const m=line.match(/^(\S+)\s+(.*?)\s*$/); if(!m) continue
  read.set(m[1], m[2])
}
const all=[]
for(let from=0;;from+=1000){        // ★ order 없이 range 로 넘기면 행을 놓친다
  const {data,error}=await db.from('problems')
    .select('id,local_no,answer_kind,answer_text,answer_unit')
    .eq('book',book).eq('grade',grade).eq('semester',Number(sem))
    .order('local_no').range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; all.push(...data); if(data.length<1000)break
}
const norm=s=>(s||'').replace(/\s+/g,'').replace(/[−–—]/g,'-')
let same=0; const diff=[], noText=[], missing=[]
for(const r of all){
  const mine=read.get(r.local_no)
  if(mine===undefined){ missing.push(r.local_no); continue }
  if(r.answer_text==null){ noText.push([r.local_no, mine]); continue }
  const dbv=norm(r.answer_text + (r.answer_unit||''))
  if(norm(mine)===dbv) same++
  else diff.push([r.local_no, r.answer_text+(r.answer_unit?' '+r.answer_unit:''), mine, r.answer_kind, r.id])
}
const hasText=all.filter(r=>r.answer_text!=null).length
console.log(`${spec} — 문항 ${all.length} · DB 글자 정답 ${hasText}`)
if(missing.length) console.log(`판독에 없는 번호 ${missing.length}개: ${missing.slice(0,10).join(' ')}`)
console.log(`같다 ${same} · **다르다 ${diff.length}** · DB 에 글자 정답이 없는 것 ${noText.length}`)
if(diff.length){
  console.log('\n번호     DB         내가읽은것      (종류)')
  for(const d of diff) console.log(String(d[0]).padEnd(8), String(d[1]).padEnd(10), String(d[2]).padEnd(15), d[3])
}
fs.writeFileSync(readP.replace(/\.txt$/,'_차이.json'), JSON.stringify({diff,noText},null,1))
// DB 현황을 통째로 남긴다 — make_sql_from_read.py 가 이것과 판독.txt 로 SQL 을 짠다
fs.writeFileSync(readP.replace(/\.txt$/,'_db.json'), JSON.stringify(
  Object.fromEntries(all.map(r=>[r.local_no,{id:r.id,kind:r.answer_kind,text:r.answer_text,unit:r.answer_unit}])),null,1))
