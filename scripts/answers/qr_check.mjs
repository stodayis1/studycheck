// 정답을 글자로 바꾼 뒤 **QR 채점이 실제로 되는지** 끝까지 확인한다.
//   node --import ./scripts/ts-resolve.mjs scripts/answers/qr_check.mjs <교재> <과정> [문항수]
//
// 임시 시험지를 하나 만들어 **진짜 route.ts 의 GET() 을 불러** 돌려 보고, 확인이 끝나면 지운다.
// (베껴 쓴 사본을 돌리면 배포되는 코드가 바뀌어도 이 검사는 계속 통과한다)
//
// 보는 것
//   · 객관식 → answerChoices 가 ①~⑤ 로 풀려 나오는가 (숫자 '3' 으로 들어 있으면 빈 배열이 된다)
//   · 숫자   → answerText 가 그대로 내려오는가
//   · 그림   → 정답 그림 임시주소가 만들어지는가
//   · 맞게 쓴 답은 정답, 한 칸 다른 답은 오답으로 갈리는가 (화면의 judge 와 같은 규칙)
import fs from 'fs'
import { createClient } from '@supabase/supabase-js'
for (const f of ['.env.local','.env']) { if(!fs.existsSync(f))continue;
  for (const line of fs.readFileSync(f,'utf8').split('\n')) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^["']|["']$/g,''); } }
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})

const BOOK=process.argv[2]||'쎈', GRADE=process.argv[3]||'공통수학2', EACH=Number(process.argv[4]||6)

// app/grade/[code]/page.tsx 의 judge 와 같은 규칙 (화면 쪽은 리액트라 그대로 못 불러온다)
const norm=(s)=>s.replace(/[\s,]/g,'').trim()
function judge(p, mine){
  if (p.answerKind==='choice') { const a=[...mine].sort().join(','); return a!=='' && a===[...p.answerChoices].sort().join(',') }
  if (p.answerKind==='number') { const a=norm(mine); return a!=='' && a===norm(p.answerText??'') }
  return null
}

const pick=async (kind, hasText)=>{
  let q=db.from('problems').select('id,local_no,answer_kind,answer_text')
    .eq('book',BOOK).eq('grade',GRADE).eq('answer_kind',kind).order('id').limit(EACH)
  q = hasText ? q.not('answer_text','is',null) : q.is('answer_text',null).not('answer_image_path','is',null)
  const {data,error}=await q
  if(error) throw new Error(error.message)
  return data
}
const sample=[...await pick('choice',true), ...await pick('number',true), ...await pick('image',false)]
if (sample.length < 3) { console.error('표본을 못 모았다'); process.exit(1) }

const code='ZZ'+Math.random().toString(36).slice(2,6).toUpperCase()
const {data:sheet,error:e1}=await db.from('exam_sheets')
  .insert({code, title:`[검사용] ${BOOK} ${GRADE}`, grade:GRADE, note:'qr_check 가 만든 임시 시험지'})
  .select('id').single()
if(e1){ console.error(e1.message); process.exit(1) }
const {error:e2}=await db.from('exam_sheet_problems')
  .insert(sample.map((p,i)=>({sheet_id:sheet.id, no:i+1, problem_id:p.id})))
if(e2){ console.error(e2.message); process.exit(1) }

let bad=[]
try {
  const { GET } = await import('../../app/api/grade/[code]/route.ts')   // ★ 진짜 그 파일
  const res = await GET(new Request(`http://x/api/grade/${code}`), { params: Promise.resolve({ code }) })
  const body = await res.json()
  if (res.status !== 200) throw new Error(body.error ?? res.status)

  console.log(`${BOOK} ${GRADE} — 임시 시험지 ${code} · ${body.problems.length}문항`)
  for (const p of body.problems) {
    const src = sample.find(s=>s.id===p.problemId)
    const line = `  ${p.localNo} [${p.answerKind}]`
    if (p.answerKind==='choice') {
      const want = Array.from(src.answer_text).filter(c=>'①②③④⑤'.includes(c)).map(c=>String('①②③④⑤'.indexOf(c)+1))
      const ok = p.answerChoices.join(',')===want.join(',') && want.length>0
      const yes = judge(p, want), no = judge(p, [String((Number(want[0])%5)+1)])
      if(!ok || yes!==true || no!==false) bad.push(`${p.localNo} 객관식 (내려온값 ${JSON.stringify(p.answerChoices)})`)
      console.log(`${line} ${src.answer_text} → ${JSON.stringify(p.answerChoices)} · 맞게쓰면 ${yes} · 다르게쓰면 ${no}`)
    } else if (p.answerKind==='number') {
      const yes = judge(p, src.answer_text), no = judge(p, src.answer_text+'9')
      if(p.answerText!==src.answer_text || yes!==true || no!==false) bad.push(`${p.localNo} 숫자 (내려온값 ${p.answerText})`)
      console.log(`${line} ${p.answerText} · 맞게쓰면 ${yes} · 다르게쓰면 ${no}`)
    } else {
      if(!p.answerImage) bad.push(`${p.localNo} 정답 그림 주소가 비었다`)
      console.log(`${line} 정답그림 ${p.answerImage?'있음':'없음'} (학생이 보고 스스로 채점)`)
    }
  }
} finally {
  await db.from('exam_sheet_problems').delete().eq('sheet_id', sheet.id)
  await db.from('exam_sheets').delete().eq('id', sheet.id)
  console.log(`  임시 시험지 ${code} 지움`)
}

if (bad.length) { console.error('\n! 어긋난 문항\n  ' + bad.join('\n  ')); process.exitCode=1 }
else console.log('\n모두 통과 — QR 채점이 글자 정답으로 자동 채점된다')
