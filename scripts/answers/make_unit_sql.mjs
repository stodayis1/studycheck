// 글자 정답이 **이미 들어 있는데** 단위가 붙어 자기채점으로 남아 있던 문항을
// 「숫자 + 단위」로 갈라 자동 채점이 되게 하는 SQL 을 만든다.
//   node scripts/answers/make_unit_sql.mjs <나갈폴더>
//
// 왜 그림을 안 읽어도 되나 — 이 문항들은 answer_kind='image' 인데 answer_text 가 차 있다.
// 학생 화면은 그림 대신 그 글자를 보여 주고 O/X 를 누르게 했다. 글자가 이미 있으니
// 「46°」 를 숫자 46 과 단위 ° 로 가르기만 하면 된다. 새로 읽을 것이 없다.
//
// 단위가 붙은 답을 answer_text 에 통째로 넣으면 안 된다 —
// 채점은 글자 그대로 비교해서 학생이 「46」 이라고 쓰면 틀리게 된다. 그래서 칸을 나눈다.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const OUT=process.argv[2]
fs.mkdirSync(OUT,{recursive:true})

// 쓸 수 있는 단위만 적어 둔다 — 「2가지」·「3개의 근」처럼 단위가 아닌 꼬리를 거르려고.
const UNITS=['cm²','cm2','m²','km²','cm³','cm3','mL','cm','mm','km','kg','m','g','L',
             '개','원','명','쪽','권','자루','초','분','시간','일','°','도','%','％']
const NUM=/^(-?\d+(?:\.\d+)?)\s*(.*)$/

const rows=[]
for(let from=0;;from+=1000){        // ★ order 없이 range 로 넘기면 행을 놓친다
  const {data,error}=await db.from('problems')
    .select('id,book,grade,local_no,answer_text')
    .eq('answer_kind','image').not('answer_text','is',null)
    .order('id').range(from,from+999)
  if(error){console.error(error.message);process.exit(1)}
  if(!data||!data.length)break; rows.push(...data); if(data.length<1000)break
}

const withUnit=[], plain=[], skipped=[]
for(const r of rows){
  const m=NUM.exec((r.answer_text||'').trim())
  if(!m){ skipped.push(r); continue }
  const [,num,tail]=m
  if(!tail) plain.push({...r, num})
  else if(UNITS.includes(tail)) withUnit.push({...r, num, unit:tail})
  else skipped.push(r)
}
console.log(`글자 정답이 있는 자기채점 문항 ${rows.length}`)
console.log(`  숫자+단위 ${withUnit.length} · 순수한 숫자 ${plain.length} · 그대로 둘 것 ${skipped.length}`)
const byUnit={}
for(const r of withUnit) byUnit[r.unit]=(byUnit[r.unit]||0)+1
console.log('  단위:', Object.entries(byUnit).sort((a,b)=>b[1]-a[1]).map(([u,n])=>`${u} ${n}`).join(' · '))

const q=s=>String(s).replace(/'/g,"''")
if(withUnit.length||plain.length){
  let body = "update problems p set answer_kind = 'number', answer_text = v.txt, answer_unit = v.unit\nfrom (values\n"
  body += [...withUnit.map(r=>`  ('${r.id}'::bigint, '${q(r.num)}', '${q(r.unit)}')`),
           ...plain.map(r=>`  ('${r.id}'::bigint, '${q(r.num)}', null)`)].join(',\n')
  body += '\n) as v(id, txt, unit)\nwhere p.id = v.id;\n'
  fs.writeFileSync(path.join(OUT,'단위정답_넣기.sql'),
    `-- 글자 정답은 있는데 단위가 붙어 자기채점으로 남아 있던 ${withUnit.length+plain.length}문항을 자동 채점으로\n`+
    `-- 「46°」 → 숫자 46 · 단위 °. 학생은 숫자만 치고, 채점은 숫자만 비교한다.\n`+
    `-- 단위를 answer_text 에 통째로 두면 「46」 이라고 쓴 학생이 틀리게 채점된다.\n`+body, 'utf8')

  let rb = "update problems p set answer_kind = 'image', answer_text = v.txt, answer_unit = null\nfrom (values\n"
  rb += [...withUnit, ...plain].map(r=>`  ('${r.id}'::bigint, '${q(r.answer_text)}')`).join(',\n')
  rb += '\n) as v(id, txt)\nwhere p.id = v.id;\n'
  fs.writeFileSync(path.join(OUT,'단위정답_되돌리기.sql'),
    `-- 위 넣기의 되돌리기 (${withUnit.length+plain.length}문항) — 원래 글자를 그대로 되돌려 놓는다\n`+rb, 'utf8')
}
fs.writeFileSync(path.join(OUT,'_그대로둔것.json'),
  JSON.stringify(skipped.map(r=>({no:r.local_no, book:r.book, grade:r.grade, txt:r.answer_text})), null, 1), 'utf8')
console.log(`→ ${OUT}`)
