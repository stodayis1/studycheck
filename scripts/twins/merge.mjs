// findings/*.json 의 모든 쌍둥이 묶음을 **이어 붙여** 다시 넣는다.
//
// 왜 있나: apply.mjs 는 파일 하나를 넣을 때마다 그 묶음의 가장 작은 id 를 묶음번호로 쓴다.
// 그래서 뒤 파일에서 앞 파일의 문항을 다시 언급하면 그 문항만 새 번호로 옮겨 가고
// **원래 짝이 혼자 남는다**(2026-10-24 공통수학2에서 694문항이 이렇게 떨어져 나갔다).
// 겹치는 묶음은 같은 문제를 가리키는 것이므로 하나로 이어야 한다.
import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const dir = 'scripts/twins/findings'
const only = process.argv.find(a=>a.startsWith('--like='))?.slice(7)
const files = fs.readdirSync(dir).filter(f=>f.endsWith('.json') && !f.startsWith('_') && (!only || f.includes(only)))

const parent = new Map()
const find = x => { while (parent.get(x)!==x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) } return x }
const join = (a,b) => { a=find(a); b=find(b); if(a!==b) parent.set(a<b?b:a, a<b?a:b) }
let groups = 0
for (const f of files) {
  const d = JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))
  for (const k of Object.keys(d)) {
    if (k.startsWith('_')) continue
    for (const g of (d[k]['쌍둥이'] ?? [])) {
      groups++
      for (const id of g) if(!parent.has(id)) parent.set(id,id)
      for (let i=1;i<g.length;i++) join(g[0], g[i])
    }
  }
}
const comp = new Map()   // 묶음번호 → id들
for (const id of parent.keys()) { const r = find(id); if(!comp.has(r)) comp.set(r,[]); comp.get(r).push(id) }
const real = [...comp.entries()].filter(([,v])=>v.length>=2)
console.log(`파일 ${files.length}개 · 적어 둔 묶음 ${groups}개 → 이어 붙이니 ${real.length}개 (문항 ${real.reduce((s,[,v])=>s+v.length,0)})`)
if (process.argv.includes('--dry')) process.exit(0)

// 묶음번호별로 한 번에 — 끊어서 보낸다 (주소가 길면 말없이 일부만 들어간다)
let done = 0
for (const [gid, ids] of real) {
  for (let i=0;i<ids.length;i+=100) {
    const { error } = await db.from('problems').update({ twin_group: gid }).in('id', ids.slice(i,i+100))
    if (error) { console.error(gid, error.message); process.exit(1) }
  }
  done++
  if (done % 200 === 0) console.log(`  ${done}/${real.length}`)
}
console.log('넣었습니다.')
