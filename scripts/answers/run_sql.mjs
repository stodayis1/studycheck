// 만들어 둔 정답 SQL 파일을 **그 파일 그대로** 읽어 적용한다.
//   node scripts/answers/run_sql.mjs <파일.sql> [--dry]
// Supabase 는 서비스키로 임의 SQL 을 못 돌린다. 그래서 이 파일이 SQL 문장을 읽어
// 같은 뜻의 update 로 옮긴다 — **목록을 따로 베껴 쓰지 않는다**(베끼면 둘이 어긋난다).
//
// 다루는 꼴
//   update problems p set answer_text = v.txt from (values ('12'::bigint,'③'),…)
//   update problems p set answer_kind='number', answer_text = v.txt from (values …)
//   update problems p set …, answer_unit = v.unit from (values ('12'::bigint,'46','°'),…)  ← 단위
//   update problems set answer_kind='image', answer_text = null where id in ('12'::bigint,…)
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const file=process.argv[2]
const DRY=process.argv.includes('--dry')
const sql=fs.readFileSync(file,'utf8')
// ★ 종류를 하나씩 적어 두고 찾으면 새 종류(choice)를 적는 날 **조용히 빠진다** —
//   2026-10-27 에 그렇게 0383 이 answer_kind='image' 인 채 글자 정답만 들어갔다
//   (문항 수는 맞아서 검사도 통과했다). 그래서 적힌 값을 그대로 읽는다.
const km = sql.match(/answer_kind\s*=\s*'([a-z]+)'/)
const kind = km ? km[1] : null
const nulling = /answer_text\s*=\s*null/.test(sql)

// 단위 칸은 두 가지로 적힌다 — 줄마다 주거나(v.unit), 전부 비우거나(= null)
const unitCol  = /answer_unit\s*=\s*v\.unit/.test(sql)
const unitNull = /answer_unit\s*=\s*null/.test(sql)

const trip =[...sql.matchAll(/\(\s*'(\d+)'::bigint\s*,\s*'([^']*)'\s*,\s*(?:'([^']*)'|null)\s*\)/g)]
             .map(m=>[Number(m[1]), m[2], m[3] ?? null])
const pairs=[...sql.matchAll(/\(\s*'(\d+)'::bigint\s*,\s*'([^']*)'\s*\)/g)].map(m=>[Number(m[1]), m[2], null])
const rows = unitCol ? trip : pairs
const onlyIds=[...sql.matchAll(/^\s*'(\d+)'::bigint/gm)].map(m=>Number(m[1]))

// 값끼리 묶어 한 번에 고친다(id 는 100개씩 — 더 넣으면 in() 이 조용히 잘린다)
const SEP='\u0000'
const groups=new Map()                      // '값SEP단위' → id 목록
if (nulling) groups.set(SEP, onlyIds)
else for (const [id,txt,unit] of rows) {
  const k = txt + SEP + (unit ?? '')
  if(!groups.has(k)) groups.set(k,[])
  groups.get(k).push(id)
}
const partsOf = k => { const i=k.indexOf(SEP); return [k.slice(0,i), k.slice(i+1) || null] }

const total=[...groups.values()].reduce((a,b)=>a+b.length,0)
console.log(`${file}\n  값 ${groups.size}가지 · 문항 ${total}개` + (kind?` · answer_kind='${kind}'`:'')
            + (unitCol?' · 단위 있음':'') + (unitNull?' · 단위 비움':''))
if (DRY) {
  for (const [k,ids] of groups) { const [t,u]=partsOf(k); console.log(`  ${nulling?'(비움)':t}${u?' '+u:''} ${ids.length}개`) }
  process.exit(0)
}

// 멈출 때 process.exit 를 쓰면 열린 연결 때문에 윈도우에서 엉뚱한 종료코드가 나온다
// → exitCode 만 적고 빠져나온다.
let done=0, bad=null
outer:
for (const [key, ids] of groups) {
  const [t,u]=partsOf(key)
  const txt = nulling ? null : t
  const patch = {answer_text:txt}
  if (kind) patch.answer_kind = kind
  if (unitCol) patch.answer_unit = u
  else if (unitNull) patch.answer_unit = null
  for (let i=0;i<ids.length;i+=100) {
    const part=ids.slice(i,i+100)
    // 바꾼 뒤 값을 **되읽어** 확인한다 — 수만 세면 종류·단위가 안 바뀐 것을 놓친다
    const {data,error}=await db.from('problems').update(patch).in('id',part).select('id,answer_kind,answer_text,answer_unit')
    if (error) { bad=error.message; break outer }
    if (data.length!==part.length) { bad=`${txt}: ${part.length}개 중 ${data.length}개만 바뀜`; break outer }
    const off=data.find(r=>r.answer_text!==txt
      || (kind && r.answer_kind!==kind)
      || ((unitCol||unitNull) && (r.answer_unit ?? null)!==(patch.answer_unit ?? null)))
    if (off) { bad=`${off.id}: 넣으려던 ${kind??'(그대로)'}/${txt}${u?'/'+u:''} · 들어간 ${off.answer_kind}/${off.answer_text}${off.answer_unit?'/'+off.answer_unit:''}`; break outer }
    done+=data.length
  }
}
if (!bad && done!==total) bad='센 값과 다르다'
console.log(`  바꾼 문항 ${done}`)
if (bad) { console.error(`  ! ${bad}`); process.exitCode=1 }
