// lib/ 안의 파일들은 서로를 확장자 없이 부른다(`./polishGuard`). Next 는 그걸 알아서
// 찾아 주지만 node 로 직접 돌릴 때는 못 찾는다. 못 찾은 상대경로에만 `.ts` 를 붙여 본다.
// ★ lib 코드는 손대지 않는다 — 배포되는 코드를 스크립트 편의 때문에 바꾸면 안 된다.
// app/api/**/route.ts 를 그대로 불러 보려면 두 가지가 더 필요하다 —
// `@/lib/...` 별칭(tsconfig paths)과, 확장자 없는 `next/server`.
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const ROOT = pathToFileURL(path.resolve('.') + path.sep).href

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    const rest = specifier.slice(2)
    for (const cand of [rest, rest + '.ts', rest + '.tsx', rest + '/index.ts']) {
      try { return await next(ROOT + cand, context) } catch {}
    }
  }
  try {
    return await next(specifier, context)
  } catch (err) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      return next(specifier + '.ts', context)
    }
    if (/^next\/[a-z]+$/.test(specifier)) {
      return next(specifier + '.js', context)
    }
    throw err
  }
}
