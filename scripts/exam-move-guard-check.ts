/**
 * 「시험 정보 바로잡기」(movePaper)를 **아무나 못 부르는지** 실제 라우트로 확인한다.
 *
 * 왜 필요한가
 *   app/api/* 는 service_role 키로 RLS 를 통째로 우회한다. 가드를 빼먹으면 그 순간 인터넷 전체에
 *   열린다(docs/보안.md). movePaper 는 학교·학년을 바꾸고 파일 이름·출처 열쇠까지 따라 고치므로
 *   남이 부를 수 있으면 기록이 조용히 어긋난다. 그래서 **베껴 쓴 사본이 아니라 route.ts 를 그대로**
 *   불러서 토큰 없이·엉터리 토큰으로 눌러 보고, DB 가 그대로인지 센다.
 *   (막히는 길만 눌러 보므로 운영 자료는 바뀌지 않는다. 읽기만 한다.)
 *
 * 쓰는 법 — .env.local 이 있는 곳에서
 *   node --import ./scripts/ts-resolve.mjs scripts/exam-move-guard-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

for (const line of fs.readFileSync(path.resolve('.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

const routePath = path.resolve(process.argv[2] ?? 'app/api/exam-analysis/route.ts')
const mod: any = await import(pathToFileURL(routePath).href)
const { createClient } = await import('@supabase/supabase-js')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })

const KEYS = 'id, school_name, grade, exam_year, term, exam_type'
const { data: paper } = await sb.from('exam_papers').select(KEYS).order('created_at', { ascending: false }).limit(1).maybeSingle()
if (!paper) { console.log('시험지가 하나도 없어 확인할 수 없습니다.'); process.exit(0) }
const 처음 = JSON.stringify(paper)

const 부르기 = (body: any, token?: string) => mod.POST(new Request('http://localhost/api/exam-analysis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body),
}))

// 일부러 **아주 다른 값**으로 눌러 본다. 하나라도 통과하면 바로 눈에 띈다
const 바꿔보기 = {
  action: 'movePaper', id: paper.id,
  key: { school_name: '신원중', grade: '중3', exam_year: 2019, term: 1, exam_type: '중간고사' },
}

let ok = true
for (const [말, token] of [['토큰 없이', undefined], ['엉터리 토큰으로', 'not-a-real-token']] as const) {
  const r = await 부르기(바꿔보기, token)
  const j = await r.json().catch(() => ({}))
  const 막힘 = r.status === 401 || r.status === 403
  console.log(`${막힘 ? '✓' : '✗'} ${말} movePaper → ${r.status} ${JSON.stringify(j).slice(0, 60)}`)
  if (!막힘) ok = false
}

// 강사(직원이지만 원장이 아닌 사람)로는 눌러 볼 계정이 없다 → **글자로** 확인한다.
//   원장 전용 action 은 첫 줄이 `if (!isAdmin) return adminOnly()` 여야 한다.
//   (강사 토큰을 만들 수 있게 되면 실제로 눌러 보는 것으로 바꾼다.)
const src = fs.readFileSync(routePath, 'utf8')
for (const action of ['movePaper', 'deletePaper', 'setFileKind']) {
  const i = src.indexOf(`case '${action}': {`)
  const 몸통 = i < 0 ? '' : src.slice(i, i + 400).split('\n').slice(1).map((l) => l.trim()).filter((l) => l && !l.startsWith('//'))[0]
  const 있다 = 몸통 === 'if (!isAdmin) return adminOnly()'
  console.log(`${있다 ? '✓' : '✗'} ${action} 첫 줄에 원장 전용 가드 — ${몸통 || '(못 찾음)'}`)
  if (!있다) ok = false
}

const { data: after } = await sb.from('exam_papers').select(KEYS).eq('id', paper.id).single()
const 그대로 = JSON.stringify(after) === 처음
console.log(`${그대로 ? '✓' : '✗'} DB 그대로 — ${JSON.stringify(after)}`)
if (!그대로) ok = false

console.log(ok ? '\n막혔다.' : '\n**막히지 않았다 — 고쳐야 한다.**')
process.exit(ok ? 0 : 1)
