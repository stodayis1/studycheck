// 리눅스에서만 터지는 **대소문자 어긋난 import** 를 찾는다
//
// 왜 필요한가
//   Windows 는 파일 이름의 대소문자를 가리지 않는다. 그래서 `@/lib/Foo` 라고 써도
//   실제 파일이 `lib/foo.ts` 면 **로컬에서는 멀쩡히 돈다.** Vercel 은 리눅스라
//   거기서 처음 터진다 — 「내 컴퓨터에선 됐는데」의 전형적인 자리다.
//
// 쓰는 법
//   node scripts/check-import-case.cjs            (추적 중인 ts/tsx 전부)
//   node scripts/check-import-case.cjs <커밋>     (그 커밋이 건드린 파일만)
//
// 종료코드: 0 깨끗함 · 1 문제 있음

/* eslint-disable @typescript-eslint/no-require-imports -- node 가 바로 돌리는 파일이라 CommonJS */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execSync } = require('node:child_process')

const ref = process.argv[2] ?? null
const list = ref === null
  ? execSync('git ls-files "*.ts" "*.tsx"', { encoding: 'utf8' })
  : execSync(`git show --name-only --format= ${ref}`, { encoding: 'utf8' })

const files = list.split('\n').map((s) => s.trim())
  .filter((f) => /\.(ts|tsx)$/.test(f) && fs.existsSync(f))

/** 디스크에 **그 대소문자 그대로** 있는가 */
function existsExact(p) {
  const dir = path.dirname(p)
  const name = path.basename(p)
  if (!fs.existsSync(dir)) return false
  try {
    return fs.readdirSync(dir).includes(name)
  } catch {
    return false
  }
}

let checked = 0
const bad = []

for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const here = path.dirname(f)
  // `from '…'` 과 `import('…')` 둘 다 본다
  const specs = [
    ...src.matchAll(/from\s+['"]([^'"]+)['"]/g),
    ...src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1])

  for (const spec of specs) {
    let base
    if (spec.startsWith('.')) base = path.join(here, spec)
    else if (spec.startsWith('@/')) base = spec.slice(2)
    else continue              // node_modules 는 대소문자 문제가 아니다
    checked += 1

    const cands = [`${base}.ts`, `${base}.tsx`, `${base}.json`,
      path.join(base, 'index.ts'), path.join(base, 'index.tsx'), base]
    const found = cands.find((c) => fs.existsSync(c))
    if (found === undefined) { bad.push(`${f} → ${spec}  (대상이 없다)`); continue }
    if (!existsExact(found)) bad.push(`${f} → ${spec}  (대소문자가 다르다: 실제는 ${found})`)
  }
}

for (const b of bad) process.stdout.write(`  ${b}\n`)
process.stdout.write(`import ${checked}개 검사 · 문제 ${bad.length}건\n`)
process.exitCode = bad.length === 0 ? 0 : 1
