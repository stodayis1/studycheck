/**
 * 「한 줄 평 한꺼번에 만들기」 API 가 **인터넷에 열려 있지 않은지** 그 파일을 그대로 불러 확인한다.
 *
 * 왜 필요한가
 *   app/api/* 는 service_role 키로 RLS 를 **우회한다.** 인증 검사를 빼먹으면
 *   코드 한 줄 없이 전교생 이름·알림장이 밖으로 나간다.
 *   이 검사는 글자 대조가 아니라 **진짜 POST() 를 돌려** 401 이 오는지 본다.
 *
 * 쓰는 법
 *   node --import ./scripts/ts-resolve.mjs scripts/bulk-comment-auth-check.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

// .env.local 을 읽어 둔다 (없으면 그냥 넘어간다 — 인증은 토큰이 없어서 어차피 막힌다)
const envFile = path.resolve('.env.local')
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const target = process.argv[2] ?? 'app/api/monthly-report/comments/route.ts'
const { POST } = await import(pathToFileURL(path.resolve(target)).href)

let pass = 0, total = 0
async function T(name: string, fn: () => Promise<boolean>) {
  total++
  let ok = false, err = ''
  try { ok = await fn() } catch (e: any) { err = e?.message ?? String(e) }
  if (ok) { pass++; console.log(`✓ ${name}`) } else console.log(`✗ ${name}${err ? ` — ${err}` : ''}`)
}

const 부르기 = (headers: Record<string, string>, body: any) =>
  POST(new Request('http://localhost/api/monthly-report/comments', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }) as any)

await T('토큰이 없으면 막는다 (401/403)', async () => {
  const r = await 부르기({}, { studentIds: ['x'], year: 2026, month: 10 })
  return r.status === 401 || r.status === 403
})

await T('엉터리 토큰도 막는다', async () => {
  const r = await 부르기({ authorization: 'Bearer not-a-real-token' },
    { studentIds: ['x'], year: 2026, month: 10 })
  return r.status === 401 || r.status === 403
})

await T('막힌 응답에 학생 자료가 한 줄도 없다', async () => {
  const r = await 부르기({}, { studentIds: ['x'], year: 2026, month: 10 })
  const t = await r.text()
  return !t.includes('comment') && !t.includes('notices') && t.length < 300
})

console.log(`\n대상: ${target}`)
console.log(`통과 ${pass} / 전체 ${total}`)
// ★ process.exit() 를 쓰면 윈도우에서 libuv 가 종료 중에 뻗어 exit 코드가 127 로 뒤집힌다.
//   (2026-11-06 실측) 그러면 「망가뜨렸는데 통과」를 알아볼 수 없다. exitCode 만 적어 둔다.
process.exitCode = pass === total ? 0 : 1
