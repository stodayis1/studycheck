// 만들어 둔 정답 SQL 파일을 **그 파일 그대로** 읽어 적용한다.
//   node scripts/answers/run_sql.mjs <파일.sql> [--dry]
// Supabase 는 서비스키로 임의 SQL 을 못 돌린다. 그래서 이 파일이 SQL 문장을 읽어
// 같은 뜻의 update 로 옮긴다 — **목록을 따로 베껴 쓰지 않는다**(베끼면 둘이 어긋난다).
//
// 다루는 꼴 세 가지(make_sql.py 가 내는 전부)
//   update problems p set answer_text = v.txt from (values ('12'::bigint,'③'),…)
//   update problems p set answer_kind='number', answer_text = v.txt from (values …)
//   update problems set answer_kind='image', answer_text = null where id in ('12'::bigint,…)
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const file=process.argv[2]
const DRY=process.argv.includes('--dry')
const sql=fs.readFileSync(file,'utf8')
const kind = /answer_kind\s*=\s*'number'/.test(sql) ? 'number'
           : /answer_kind\s*=\s*'image'/.test(sql) ? 'image' : null
const nulling = /answer_text\s*=\s*null/.test(sql)

const pairs=[...sql.matchAll(/\(\s*'(\d+)'::bigint\s*,\s*'([^']*)'\s*\)/g)].map(m=>[Number(m[1]), m[2]])
const onlyIds=[...sql.matchAll(/^\s*'(\d+)'::bigint/gm)].map(m=>Number(m[1]))

// 값끼리 묶어 한 번에 고친다(id 는 100개씩 — 더 넣으면 in() 이 조용히 잘린다)
const groups=new Map()
if (nulling) groups.set(null, onlyIds)
else for (const [id,txt] of pairs) { if(!groups.has(txt)) groups.set(txt,[]); groups.get(txt).push(id) }

const total=[...groups.values()].reduce((a,b)=>a+b.length,0)
console.log(`${file}\n  값 ${groups.size}가지 · 문항 ${total}개` + (kind?` · answer_kind='${kind}'`:''))
if (DRY) { for (const [t,ids] of groups) console.log(`  ${t===null?'(비움)':t} ${ids.length}개`); process.exit(0) }

// 멈출 때 process.exit 를 쓰면 열린 연결 때문에 윈도우에서 엉뚱한 종료코드가 나온다
// → exitCode 만 적고 빠져나온다.
let done=0, bad=null
outer:
for (const [txt, ids] of groups) {
  const patch = kind ? {answer_kind:kind, answer_text:txt} : {answer_text:txt}
  for (let i=0;i<ids.length;i+=100) {
    const part=ids.slice(i,i+100)
    const {data,error}=await db.from('problems').update(patch).in('id',part).select('id')
    if (error) { bad=error.message; break outer }
    if (data.length!==part.length) { bad=`${txt}: ${part.length}개 중 ${data.length}개만 바뀜`; break outer }
    done+=data.length
  }
}
if (!bad && done!==total) bad='센 값과 다르다'
console.log(`  바꾼 문항 ${done}`)
if (bad) { console.error(`  ! ${bad}`); process.exitCode=1 }
